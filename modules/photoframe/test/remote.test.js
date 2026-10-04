const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('announcement pause restores both playing and previously paused slideshows',async()=>{
 for(const initiallyPaused of [false,true]){
  let suspended=true,next;const c={window:{portalSequence:0,portalRevision:1},paused:initiallyPaused,current:-1,console,setTimeout:fn=>{next=fn},fetch:async()=>({ok:true,json:async()=>({revision:1,suspended,commands:[]})}),togglePause(){c.paused=!c.paused}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/remote.js'),'utf8'),c);
  await new Promise(r=>setImmediate(r));assert.equal(c.paused,true);
  suspended=false;await next();assert.equal(c.paused,initiallyPaused);
 }
});
