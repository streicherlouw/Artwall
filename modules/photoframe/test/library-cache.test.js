'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createPortal}=require('../server');
test('status reuses parsed library and search results but observes replaced library files',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'artwall-cache-')),file=path.join(root,'config.json'),playlist=path.join(root,'playlist.json');
 fs.writeFileSync(file,JSON.stringify({contentRoot:'.',album:'all'}));
 fs.writeFileSync(playlist,JSON.stringify([{album:'Art',name:'Horse',identifiers:['horse']}]));
 const display={status:()=>({phase:'active'}),enqueue:fn=>fn(),start:async()=>{}};
 const {server}=createPortal(file,{display});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const read=fs.readFileSync;let reads=0;fs.readFileSync=function(p,...args){if(p===playlist)reads++;return read.call(this,p,...args)};
 try{
  const play=await fetch(base+'/api/slideshow/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'play',album:'Art',terms:'Horse'})});assert.equal(play.status,200);
  for(let i=0;i<5;i++){const s=await(await fetch(base+'/api/status')).json();assert.equal(s.searchCollection.count,1)}
  assert.equal(reads,1);
  fs.writeFileSync(playlist+'.new',JSON.stringify([{album:'Art',name:'Horse',identifiers:['horse']},{album:'Art',name:'Another horse',identifiers:['horse']}]));fs.renameSync(playlist+'.new',playlist);
  const s=await(await fetch(base+'/api/status')).json();assert.equal(s.searchCollection.count,2);assert.equal(reads,2);
 }finally{fs.readFileSync=read;await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true})}
});
