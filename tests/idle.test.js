const {test}=require('node:test'),assert=require('node:assert/strict');
const {IdleMonitor}=require('../common/display-idle');
test('blank screen turns off after 60 seconds, once per idle period',async()=>{
 let time=0,busy=false,off=0;const m=new IdleMonitor({now:()=>time,readActivity:async()=>busy,powerOff:async()=>off++});
 await m.tick();time=59999;await m.tick();assert.equal(off,0);time=60000;await m.tick();assert.equal(off,1);time=90000;await m.tick();assert.equal(off,1);
 busy=true;await m.tick();busy=false;await m.tick();time=149999;await m.tick();assert.equal(off,1);time=150000;await m.tick();assert.equal(off,2);
});
test('active or paused display sessions prevent timeout; failures reset idle time',async()=>{
 let time=0,busy=true,off=0;const m=new IdleMonitor({now:()=>time,readActivity:async()=>busy,powerOff:async()=>off++});
 await m.tick();time=120000;await m.tick();assert.equal(off,0);busy=false;await m.tick();time+=59000;await m.tick();assert.equal(off,0);
 m.readActivity=async()=>{throw Error('Unavailable')};time+=1000;await m.tick();assert.equal(off,0);assert.equal(m.idleSince,null);
});
test('a last-moment activation prevents power-off',async()=>{
 let time=0,calls=0,off=0;const m=new IdleMonitor({now:()=>time,readActivity:async()=>++calls===3,powerOff:async()=>off++});await m.tick();time=60000;await m.tick();assert.equal(off,0);
});
