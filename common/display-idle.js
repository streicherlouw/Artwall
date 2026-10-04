'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const {readJSON,configRoot}=require('./config');
const execute=promisify(execFile);
class IdleMonitor {
 constructor({readActivity,powerOff,now=()=>performance.now(),timeoutMs=60000}){Object.assign(this,{readActivity,powerOff,now,timeoutMs});this.idleSince=null;this.poweredOff=false;this.error=null}
 async tick(){
  try{
   // Unknown/unreachable modules count as busy: never interrupt possible playback.
   if(await this.readActivity()){this.idleSince=null;this.poweredOff=false;return}
   if(this.idleSince===null)this.idleSince=this.now();
   if(this.timeoutMs<=0||this.poweredOff||this.now()-this.idleSince<this.timeoutMs)return;
   // Recheck immediately before switching power to narrow activation races.
   if(await this.readActivity()){this.idleSince=null;return}
   await this.powerOff();this.poweredOff=true;this.error=null;
  }catch(e){this.idleSince=null;this.error=e.message}
 }
}
async function readActivity(root){
 const registry=readJSON(path.join(root,'registry.json'),{modules:{}});
 const entries=Object.entries(registry.modules).filter(([id])=>id!=='portal');
 const activity=await Promise.all(entries.map(async([id,m])=>{
  try{const response=await fetch(`http://127.0.0.1:${m.port}/api/status`,{signal:AbortSignal.timeout(1500)});if(!response.ok)return true;const s=await response.json();
   if(id==='photoframe')return s.phase!=='idle';
   if(id==='splitflap')return s.state!=='idle';
   if(id==='airplay')return s.state!=='READY';
   return true;
  }catch{return true}
 }));return activity.some(Boolean);
}
async function run(){
 const root=configRoot(),file=path.join(root,'display.json'),runtime=process.env.XDG_RUNTIME_DIR||`/run/user/${process.getuid()}`;
 const monitor=new IdleMonitor({readActivity:()=>readActivity(root),powerOff:async()=>{
  const c=readJSON(file,{output:'HDMI-A-1'});await execute('/usr/bin/wlr-randr',['--output',c.output,'--off'],{timeout:6000});console.log('Blank screen timeout: monitor off');
 }});
 async function tick(){const c=readJSON(file,{idleTimeoutSeconds:60});monitor.timeoutMs=c.idleTimeoutSeconds*1000;await monitor.tick();
  const status={idleSeconds:monitor.idleSince===null?0:Math.floor((monitor.now()-monitor.idleSince)/1000),poweredOff:monitor.poweredOff,error:monitor.error};
  const dest=path.join(runtime,'artwall-display-idle.json');fs.writeFileSync(dest+'.tmp',JSON.stringify(status));fs.renameSync(dest+'.tmp',dest);setTimeout(tick,1000);
 }await tick();
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1});
module.exports={IdleMonitor,readActivity};
