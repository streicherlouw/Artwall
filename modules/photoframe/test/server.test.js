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
  assert.equal((await post('/api/slideshow/config',{intervalMs:7000,showMap:false,useFolderTiming:false})).status,200);
  const html=await(await fetch(base+'/player?display=1')).text();assert.match(html,/"intervalSeconds":7/);assert.match(html,/"useFolderTiming":false/);assert.match(html,/timing\(current\).intervalSeconds\*1000/);assert.match(html,/card.hidden=!map\|\|true/);assert.match(html,/remote.js/);
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
test('manual artist and movement picks control switches independently of prominence and preserve playback',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'artwall-picks-')),file=path.join(root,'config.json');fs.mkdirSync(path.join(root,'content'));fs.writeFileSync(file,JSON.stringify({contentRoot:'content',album:'all',intervalMs:5000,fadeMs:850}));const high='collection:Art:artist:monet',low='collection:Art:artist:kroyer',movement='collection:Art:impressionists';
 fs.writeFileSync(path.join(root,'content/playlist.json'),JSON.stringify([{album:'Art',src:'/media/monet.jpg',collections:[high,movement]},{album:'Art',src:'/media/kroyer.jpg',collections:[low,movement]}]));fs.writeFileSync(path.join(root,'content/collections.json'),JSON.stringify([{id:high,name:'Monet',kind:'artist',prominence:.98},{id:low,name:'Krøyer',kind:'artist',prominence:.1},{id:movement,name:'Impressionists',kind:'movement',prominence:.01}]));
 const display={phase:'idle',status(){return {phase:this.phase}},enqueue:async fn=>fn(),start:async()=>{display.phase='active'},stop:async()=>{display.phase='idle'}};
 const {server}=createPortal(file,{display});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const post=(route,body)=>fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  let status=await(await fetch(url+'/api/status')).json();assert.deepEqual(status.albums,['Art']);assert.equal(status.collectionOptions.length,3);
  assert.equal((await post('/api/slideshow/config',{selectedArtistIds:[low],selectedMovementIds:[movement]})).status,200);
  status=await(await fetch(url+'/api/status')).json();assert.deepEqual(status.albums,['Art',low,movement]);assert.equal(status.collectionSummary.artists,1);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)).selectedArtistIds,[low]);
  await post('/api/slideshow/album',{album:low,on:true});assert.equal(display.phase,'active');
  await post('/api/slideshow/config',{selectedArtistIds:[],selectedMovementIds:[]});status=await(await fetch(url+'/api/status')).json();assert.deepEqual(status.albums,['Art']);assert.equal(status.phase,'active');assert.equal(status.settings.album,low);
  for(const value of [['unknown'],[low,low],[movement],null,'monet',[42]])assert.equal((await post('/api/slideshow/config',{selectedArtistIds:value})).status,400);
  assert.equal((await post('/api/slideshow/config',{selectedMovementIds:[high]})).status,400);
  const config=await(await fetch(url+'/api/slideshow/config')).json();assert.equal(config.collectionOptions.length,3);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true})}
});
test('identifier collections preview, play transiently, reject blocked/empty requests and clear safely',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'artwall-search-')),file=path.join(root,'config.json'),content=path.join(root,'content');fs.mkdirSync(content);
 const config={contentRoot:'content',album:'Holiday Japan',intervalMs:5000,fadeMs:850,shuffle:false};fs.writeFileSync(file,JSON.stringify(config));
 const slides=[{album:'Art',name:'Collage 12',src:'/media/both.png',identifiers:['horse','child']},{album:'Art',name:'Horse only',src:'/media/horse.png',identifiers:['horse']},{album:'Holiday Japan',name:'Japan',src:'/media/japan.png',identifiers:['horse','child']}];fs.writeFileSync(path.join(content,'playlist.json'),JSON.stringify(slides));let blocked=false;
 const display={phase:'idle',status(){return {phase:this.phase}},enqueue:async fn=>fn(),start:async()=>{if(blocked)throw Error('AirPlay owns the display');display.phase='active'},stop:async()=>{display.phase='idle'}};
 const {server,libraryChanged}=createPortal(file,{display});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(route,body,headers={})=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 const search=(action,terms='horse child',album='Art')=>post('/api/slideshow/search',{action,terms,album});
 const status=async()=>(await fetch(base+'/api/status')).json();const original=fs.readFileSync(file,'utf8');
 try{
  const settings=await(await fetch(base+'/api/slideshow/config')).json();assert.deepEqual(settings.rootAlbums,['Art','Holiday Japan']);
  assert.equal((await(await search('preview','HORSE, child')).json()).count,1);assert.equal(display.phase,'idle');assert.equal((await status()).searchCollection,null);
  assert.equal((await search('play')).status,200);let state=await status();assert.equal(state.searchCollection.count,1);assert.equal(state.settings.album,'search:temporary');assert.ok(!state.albums.includes('search:temporary'));assert.equal(fs.readFileSync(file,'utf8'),original);
  let html=await(await fetch(base+'/player?display=1')).text();assert.ok(html.includes('/media/both.png'));assert.ok(!html.includes('/media/horse.png'));assert.ok(!html.includes('/media/japan.png'));assert.ok(html.includes('search:temporary'));
  const commands=await(await fetch(base+'/api/slideshow/commands')).json();assert.equal(commands.album,'search:temporary');
  await post('/api/slideshow/album',{album:'Holiday Japan',on:false});assert.equal(display.phase,'active');
  assert.equal((await search('play','missing')).status,400);assert.equal((await status()).searchCollection.count,1);
  blocked=true;assert.equal((await search('play','horse')).status,400);assert.deepEqual((await status()).searchCollection.terms,['horse','child']);blocked=false;
  assert.equal((await search('preview','horse','all')).status,400);assert.equal((await search('preview','')).status,400);assert.equal((await post('/api/slideshow/search',{action:'play',album:'Art',terms:'horse'},{Origin:'https://example.com'})).status,403);
  await search('clear');assert.equal((await status()).searchCollection,null);html=await(await fetch(base+'/player')).text();assert.ok(html.includes('/media/japan.png'));assert.ok(!html.includes('/media/both.png'));assert.equal(fs.readFileSync(file,'utf8'),original);
  await search('play');await post('/api/slideshow/album',{album:'Art',on:true});assert.equal((await status()).searchCollection,null);assert.equal((await status()).settings.album,'Art');
  await search('play');await post('/api/slideshow/config',{intervalMs:6000});assert.ok((await status()).searchCollection);await post('/api/slideshow/config',{album:'Art'});assert.equal((await status()).searchCollection,null);
  await search('play');fs.writeFileSync(path.join(content,'playlist.json'),JSON.stringify(slides.filter(s=>s.album!=='Art')));await libraryChanged();assert.equal((await status()).searchCollection,null);assert.equal(display.phase,'idle');
 }finally{await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true})}
});

test('Pictures playback keeps each child contiguous and in natural order despite shuffle enabled',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'artwall-pictures-')),file=path.join(root,'config.json');fs.mkdirSync(path.join(root,'content'));
 fs.writeFileSync(file,JSON.stringify({contentRoot:'content',album:'Pictures',shuffle:true,intervalMs:5000,fadeMs:850}));
 const paths=['Pictures/Holiday Japan/image10.jpg','Pictures/Holiday Vietnam/image2.jpg','Pictures/Holiday Japan/image2.jpg','Pictures/Holiday Vietnam/image1.jpg'];
 fs.writeFileSync(path.join(root,'content/playlist.json'),JSON.stringify(paths.map(p=>({album:'Pictures',src:'/media/'+encodeURI(p)}))));
 const display={status:()=>({phase:'idle'}),enqueue:async f=>f()};const {server}=createPortal(file,{display});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const html=await(await fetch('http://127.0.0.1:'+server.address().port+'/player')).text();const slides=JSON.parse(html.match(/<script id="slides" type="application\/json">(.*?)<\/script>/s)[1]);const names=slides.map(s=>decodeURI(s.src));
 assert.ok(names[0].includes('Japan')===names[1].includes('Japan'));assert.ok(names[2].includes('Japan')===names[3].includes('Japan'));assert.ok(names.findIndex(s=>s.endsWith('Japan/image2.jpg'))<names.findIndex(s=>s.endsWith('Japan/image10.jpg')));assert.ok(names.findIndex(s=>s.endsWith('Vietnam/image1.jpg'))<names.findIndex(s=>s.endsWith('Vietnam/image2.jpg')));

 const base='http://127.0.0.1:'+server.address().port;
 const status=await(await fetch(base+'/api/status')).json();
 assert.deepEqual(status.folderOptions.map(f=>f.name),['Pictures','Pictures > Holiday Japan','Pictures > Holiday Vietnam']);
 assert.deepEqual(status.albums,['Pictures']); // Subfolders are playback choices, not extra HomeKit buttons.
 const saved=await fetch(base+'/api/slideshow/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({album:'Pictures/Holiday Japan'})});assert.equal(saved.status,200);
 const child=await(await fetch(base+'/player')).text();const subset=JSON.parse(child.match(/<script id="slides" type="application\/json">(.*?)<\/script>/s)[1]);
 assert.deepEqual(subset.map(s=>decodeURI(s.src)),['/media/Pictures/Holiday Japan/image2.jpg','/media/Pictures/Holiday Japan/image10.jpg']);
 assert.equal((await fetch(base+'/api/slideshow/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({album:'Pictures/Unknown'})})).status,400);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true})}
});
