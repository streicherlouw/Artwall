'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createPortal}=require('../server');
test('all root albums expose nested folders and select only their descendants',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'artwall-folders-')),file=path.join(root,'config.json');
 fs.writeFileSync(file,JSON.stringify({contentRoot:'.',album:'all',intervalMs:5000,fadeMs:850}));
 const paths=['Future/Future dreams/one.jpg','Future/Retro Tech/two.jpg','Future/Retro Tech/Deep/three.jpg','Future/Retro Technology/four.jpg','Pictures/Holiday Japan/five.jpg'];
 fs.writeFileSync(path.join(root,'playlist.json'),JSON.stringify(paths.map(p=>({album:p.split('/')[0],src:'/media/'+encodeURI(p)}))));
 const display={status:()=>({phase:'idle'}),enqueue:fn=>fn(),stop:async()=>{}};
 const {server}=createPortal(file,{display});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const status=await(await fetch(base+'/api/status')).json();
  for(const f of ['Future/Future dreams','Future/Retro Tech','Future/Retro Tech/Deep','Pictures/Holiday Japan'])assert.ok(status.folderOptions.some(o=>o.id===f));
  assert.deepEqual(status.albums,['Future','Pictures']);
  const response=await fetch(base+'/api/slideshow/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({album:'Future/Retro Tech'})});assert.equal(response.status,200);
  const html=await(await fetch(base+'/player')).text();assert.ok(html.includes('two.jpg'));assert.ok(html.includes('three.jpg'));assert.ok(!html.includes('one.jpg'));assert.ok(!html.includes('four.jpg'));assert.ok(!html.includes('five.jpg'));
 }finally{await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true})}
});
