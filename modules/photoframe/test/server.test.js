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
