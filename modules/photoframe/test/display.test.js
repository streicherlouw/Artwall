const {test}=require('node:test'),assert=require('node:assert/strict');
const {Display}=require('../display');
function sample(){const d=Object.create(Display.prototype);d.config={};d.phase='idle';d.child=null;d.restoreOff=false;d.save=()=>{};d.read=()=>({});return d}
test('AirPlay has priority and cannot be stopped by slideshow activation',async()=>{
 const d=sample();d.read=file=>file.includes('airplay')?{state:'STREAMING'}:{phase:'active'};
 assert.equal(d.owner(),'AirPlay');await assert.rejects(d.start(),/AirPlay owns/);
 let stopped=false;d.stopSplitFlap=async()=>{stopped=true};await assert.rejects(d.claimDisplay(),/AirPlay owns/);assert.equal(stopped,false);
});
test('display power restoration waits until the other service releases the screen',async()=>{
 const d=sample();let owner='AirPlay',off=0;d.owner=()=>owner;d.restoreOff=true;d.power=async on=>{assert.equal(on,false);off++};
 await d.checkOwner();assert.equal(off,0);assert.equal(d.restoreOff,true);
 owner=null;await d.checkOwner();assert.equal(off,1);assert.equal(d.restoreOff,false);
});
test('another display service preempts the slideshow',async()=>{
 const d=sample();d.owner=()=>'SplitFlap';d.child={};let stopped=0;d.stop=async()=>{stopped++;d.child=null};await d.checkOwner();assert.equal(stopped,1);
});

test('PhotoFrame stops SplitFlap before taking the display',async()=>{
 const d=sample();let owner='SplitFlap',stopped=0;d.owner=()=>owner;d.stopSplitFlap=async()=>{stopped++;owner=null};await d.claimDisplay();assert.equal(stopped,1);
});
test('AirPlay taking over during the handoff still prevents PhotoFrame activation',async()=>{
 const d=sample();let owner='SplitFlap';d.owner=()=>owner;d.stopSplitFlap=async()=>{owner='AirPlay'};await assert.rejects(d.claimDisplay(),/AirPlay owns/);
});
test('a failed SplitFlap stop does not allow PhotoFrame to take the screen',async()=>{
 const d=sample();d.owner=()=>'SplitFlap';d.stopSplitFlap=async()=>{throw Error('Stop failed')};await assert.rejects(d.claimDisplay(),/Stop failed/);
});
