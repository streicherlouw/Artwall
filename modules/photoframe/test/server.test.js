const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createPortal}=require('../server'),{validateSettings}=require('../settings');
test('validates slideshow settings and rejects unknown or unsafe values',()=>{
 const c={intervalMs:5000,fadeMs:850};assert.throws(()=>validateSettings({fadeMs:5000},c,[]));assert.throws(()=>validateSettings({contentRoot:'/etc'},c,[]));assert.throws(()=>validateSettings({album:'unknown'},c,[]));assert.equal(validateSettings({showMap:false},c,[]).showMap,false);
});
test('portal serves player, persists settings, dispatches commands and blocks cross-origin writes',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'artwall-test-'));let starts=0;
 const config={host:'127.0.0.1',port:0,contentRoot:'content',intervalMs:5000,fadeMs:850,mapSize:11,showMap:true,shuffle:false,album:'all',wakeDisplay:true,services:[]};
 fs.mkdirSync(path.join(root,'content'));fs.writeFileSync(path.join(root,'config.json'),JSON.stringify(config));fs.writeFileSync(path.join(root,'content/playlist.json'),JSON.stringify([{src:'/media/test.png',name:'Sample',album:'Holiday',map:null}]));fs.writeFileSync(path.join(root,'content/test.png'),'test');
 const display={status:()=>({phase:'idle'}),enqueue:fn=>fn(),start:()=>starts++,stop:()=>{},owner:()=>null};
 const{server}=createPortal(path.join(root,'config.json'),{display});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const post=(route,body,headers={})=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 try{
  assert.equal((await fetch(base+'/')).status,200);
  assert.equal((await post('/api/slideshow/config',{intervalMs:7000,showMap:false})).status,200);
  const html=await(await fetch(base+'/player?display=1')).text();assert.match(html,/navigate\(1\),7000/);assert.match(html,/card.hidden=!map\|\|true/);assert.match(html,/remote.js/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'config.json'))).intervalMs,7000);
  assert.equal((await post('/api/slideshow/command',{action:'start'})).status,200);assert.equal(starts,1);
  await post('/api/slideshow/command',{action:'next'});const commands=await(await fetch(base+'/api/slideshow/commands?after=0')).json();assert.equal(commands.commands[0].action,'next');
  assert.equal((await post('/api/slideshow/config',{album:'all'},{Origin:'https://example.com'})).status,403);
  assert.equal((await post('/api/slideshow/command',{action:'shell'})).status,400);
  assert.notEqual((await fetch(base+'/media/..%2Fconfig.json')).status,200);
  assert.equal((await fetch(base+'/media/test.png')).status,200);
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true})}
});
test('album switches serialize selection, ignore stale off commands, and respect AirPlay rejection',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'artwall-albums-'));const file=path.join(root,'config.json');fs.mkdirSync(path.join(root,'content'));fs.writeFileSync(file,JSON.stringify({port:0,contentRoot:'content',intervalMs:5000,fadeMs:1700,album:'all'}));fs.writeFileSync(path.join(root,'content/playlist.json'),JSON.stringify(['Japan','Vietnam'].map(album=>({album,src:'/media/'+album+'.png',name:album}))));fs.writeFileSync(path.join(root,'content/albums.json'),JSON.stringify(['Japan','Vietnam','Empty']));let phase='idle',blocked=false,tail=Promise.resolve();
 const display={status:()=>({phase}),enqueue:fn=>{const job=tail.then(fn);tail=job.catch(()=>{});return job},start:async()=>{if(blocked)throw Error('AirPlay owns the display');phase='active'},stop:async()=>{phase='idle'}};
 const {server}=createPortal(file,{display});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const set=(album,on)=>fetch(base+'/api/slideshow/album',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({album,on})});
 try{await set('Japan',true);await set('Vietnam',true);const stale=await(await set('Japan',false)).json();assert.equal(stale.phase,'active');assert.equal(stale.settings.album,'Vietnam');
 assert.equal((await set('Empty',true)).status,400);blocked=true;assert.equal((await set('Japan',true)).status,400);assert.equal(JSON.parse(fs.readFileSync(file)).album,'Vietnam');
 await set('Vietnam',false);assert.equal(phase,'idle');
 }finally{await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true})}
});
test('HomeKit rebuild is explicit, refreshes albums, and reports scan failures',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'artwall-rebuild-'));const file=path.join(root,'config.json');fs.mkdirSync(path.join(root,'content'));fs.writeFileSync(file,JSON.stringify({port:0,contentRoot:'content',intervalMs:5000,fadeMs:1700,album:'all'}));let scans=0,fail=false;
 const indexer={rebuild:async()=>{scans++;if(fail)throw Error('scan failed');fs.writeFileSync(path.join(root,'content/albums.json'),JSON.stringify(['Holiday Japan']));return {albums:1}}};
 const display={status:()=>({phase:'idle'}),enqueue:fn=>fn()};const {server}=createPortal(file,{display,indexer});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const rebuild=(headers={})=>fetch(base+'/api/homekit/rebuild',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:'{}'});
 try{await fetch(base+'/api/status');assert.equal(scans,0);assert.equal((await rebuild({Origin:'https://example.com'})).status,403);assert.equal(scans,0);const result=await(await rebuild()).json();assert.equal(result.ok,true);assert.deepEqual(result.albums,['Holiday Japan']);assert.equal(scans,1);fail=true;assert.equal((await rebuild()).status,400);assert.deepEqual((await(await fetch(base+'/api/status')).json()).albums,['Holiday Japan']);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true})}
});
test('virtual collections select images across artists while Art retains all images',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'artwall-collections-'));const file=path.join(root,'config.json');fs.mkdirSync(path.join(root,'content'));fs.writeFileSync(file,JSON.stringify({contentRoot:'content',album:'all',intervalMs:5000,fadeMs:850}));const id='collection:Art:impressionists';
 fs.writeFileSync(path.join(root,'content/playlist.json'),JSON.stringify([{album:'Art',src:'/media/monet.jpg',collections:[id]},{album:'Art',src:'/media/kroyer.jpg',collections:[id]},{album:'Art',src:'/media/other.jpg'}]));fs.writeFileSync(path.join(root,'content/collections.json'),JSON.stringify([{id,name:'Impressionists'}]));
 const display={phase:'idle',status(){return {phase:this.phase}},enqueue:async fn=>fn(),start:async()=>{display.phase='active'},stop:async()=>{display.phase='idle'}};const {server,libraryChanged}=createPortal(file,{display});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{const result=await fetch(base+'/api/slideshow/album',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({album:id,on:true})});assert.equal(result.status,200);let player=await(await fetch(base+'/player')).text();assert.ok(player.includes('/media/monet.jpg'));assert.ok(player.includes('/media/kroyer.jpg'));assert.ok(!player.includes('/media/other.jpg'));fs.writeFileSync(path.join(root,'content/collections.json'),'[]');const playlist=JSON.parse(fs.readFileSync(path.join(root,'content/playlist.json')));fs.writeFileSync(path.join(root,'content/playlist.json'),JSON.stringify(playlist.map(({collections,...slide})=>slide)));await libraryChanged();const status=await(await fetch(base+'/api/status')).json();assert.equal(status.phase,'idle');assert.equal(status.settings.album,'all');await fetch(base+'/api/slideshow/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({album:'Art'})});player=await(await fetch(base+'/player')).text();assert.ok(player.includes('/media/other.jpg'))}finally{await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true})}
});
test('prominence cutoff filters switches inclusively, persists, and stops a hidden selection',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'artwall-prominence-')),file=path.join(root,'config.json');fs.mkdirSync(path.join(root,'content'));fs.writeFileSync(file,JSON.stringify({contentRoot:'content',album:'all',intervalMs:5000,fadeMs:850}));const high='collection:Art:artist:monet',low='collection:Art:artist:kroyer',boundary='collection:Art:impressionists';
 fs.writeFileSync(path.join(root,'content/playlist.json'),JSON.stringify([{album:'Art',src:'/media/monet.jpg',collections:[high,boundary]},{album:'Art',src:'/media/kroyer.jpg',collections:[low,boundary]}]));fs.writeFileSync(path.join(root,'content/collections.json'),JSON.stringify([{id:high,name:'Monet',kind:'artist',prominence:.98},{id:low,name:'Krøyer',kind:'artist',prominence:.7},{id:boundary,name:'Impressionists',kind:'movement',prominence:.8}]));
 const display={phase:'idle',status(){return {phase:this.phase}},enqueue:async fn=>fn(),start:async()=>{display.phase='active'},stop:async()=>{display.phase='idle'}};
 const {server}=createPortal(file,{display});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(route,body)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  let status=await(await fetch(base+'/api/status')).json();assert.deepEqual(status.albums,['Art',high,boundary]);assert.equal(status.settings.prominenceCutoff,.8);assert.equal(status.collectionSummary.artists,1);assert.equal(status.collectionSummary.movements,1);
  assert.equal((await post('/api/slideshow/album',{album:low,on:true})).status,400);
  assert.equal((await post('/api/slideshow/config',{prominenceCutoff:.7})).status,200);assert.equal(JSON.parse(fs.readFileSync(file)).prominenceCutoff,.7);
  await post('/api/slideshow/album',{album:low,on:true});assert.equal(display.phase,'active');await post('/api/slideshow/config',{prominenceCutoff:.9});status=await(await fetch(base+'/api/status')).json();assert.equal(status.phase,'idle');assert.equal(status.settings.album,'all');assert.deepEqual(status.albums,['Art',high]);
  let html=await(await fetch(base+'/player')).text();assert.ok(html.includes('/media/kroyer.jpg'));assert.ok(html.includes('/media/monet.jpg'));
  for(const invalid of [-.1,1.1,'0.8',true])assert.equal((await post('/api/slideshow/config',{prominenceCutoff:invalid})).status,400);
  await post('/api/slideshow/config',{prominenceCutoff:0});status=await(await fetch(base+'/api/status')).json();assert.equal(status.albums.length,4);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true})}
});
