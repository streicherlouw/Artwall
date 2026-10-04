const {test}=require('node:test'),assert=require('node:assert/strict');
const {Display}=require('../display');
function sample(){const d=Object.create(Display.prototype);d.config={};d.phase='idle';d.child=null;d.restoreOff=false;d.save=()=>{};d.read=()=>({});return d}
test('AirPlay has priority; SplitFlap also prevents slideshow activation',async()=>{
 const d=sample();d.read=file=>file.includes('airplay')?{state:'STREAMING'}:{phase:'active'};
 assert.equal(d.owner(),'AirPlay');await assert.rejects(d.start(),/AirPlay owns/);
 d.read=file=>file.includes('airplay')?{state:'READY'}:{phase:'active'};assert.equal(d.owner(),'SplitFlap');await assert.rejects(d.start(),/SplitFlap owns/);
});
test('display power restoration waits until the other service releases the screen',async()=>{
 const d=sample();let owner='AirPlay',off=0;d.owner=()=>owner;d.restoreOff=true;d.power=async on=>{assert.equal(on,false);off++};
 await d.checkOwner();assert.equal(off,0);assert.equal(d.restoreOff,true);
 owner=null;await d.checkOwner();assert.equal(off,1);assert.equal(d.restoreOff,false);
});
test('another display service preempts the slideshow',async()=>{
 const d=sample();d.owner=()=>'SplitFlap';d.child={};let stopped=0;d.stop=async()=>{stopped++;d.child=null};await d.checkOwner();assert.equal(stopped,1);
});
