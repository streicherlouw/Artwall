'use strict';
const fs=require('node:fs'),path=require('node:path');
const {spawn,execFile}=require('node:child_process'),{promisify}=require('node:util');
const exec=promisify(execFile);
const {configPath,readJSON}=require('../../common/config');
class Display {
 constructor(config){this.config=config;this.child=null;this.phase='idle';this.error=null;this.tail=Promise.resolve();this.restoreOff=false;this.runtime=config.runtimeDirectory;this.stateFile=path.join(this.runtime,'artwall-photoframe-state.json');this.poll=setInterval(()=>this.enqueue(()=>this.checkOwner()).catch(e=>this.error=e.message),500);}
 read(file){try{return JSON.parse(fs.readFileSync(path.join(this.runtime,file),'utf8'))}catch(e){if(e.code==='ENOENT')return {};throw e}}
 owner(){const a=this.read('airplay-receiver-status.json');if(['STREAMING','PIN','STARTING'].includes(a.state))return 'AirPlay';const s=this.read('splitflap-state.json');if(s.phase&&s.phase!=='idle')return 'SplitFlap';return null}
 enqueue(fn){const result=this.tail.then(fn);this.tail=result.catch(()=>{});return result}
 save(){fs.writeFileSync(this.stateFile,JSON.stringify({phase:this.phase,restoreOff:this.restoreOff,updatedAt:new Date().toISOString()}),{mode:0o600})}
 async power(on){await exec('/usr/bin/wlr-randr',['--output',this.config.displayOutput,on?'--on':'--off',...(on?['--preferred']:[])],{timeout:6000})}
 async recover(){try{const old=JSON.parse(fs.readFileSync(this.stateFile));this.restoreOff=!!old.restoreOff}catch(e){if(e.code!=='ENOENT')throw e}await this.checkOwner()}
 status(){return {phase:this.phase,error:this.error,otherOwner:this.owner(),restoreDisplayOff:this.restoreOff}}
 async stopSplitFlap(){
  const config=readJSON(configPath('splitflap'));
  const headers={'Content-Type':'application/json'};
  if(config.web.authRequired){const token=process.env[config.web.tokenEnv||'SPLITFLAP_WEB_TOKEN'];if(!token)throw Error('SplitFlap requires its access token before PhotoFrame can replace it');headers.Authorization=`Bearer ${token}`}
  const response=await fetch(`http://127.0.0.1:${config.web.port}/api/end`,{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(30000)});
  const result=await response.json();if(!response.ok||result.ok===false||result.state!=='idle')throw Error(result.error||'SplitFlap did not release the display');
 }
 async claimDisplay(){
  const owner=this.owner();
  if(owner==='AirPlay')throw Error('AirPlay owns the display');
  if(owner==='SplitFlap')await this.stopSplitFlap();
  const remaining=this.owner();if(remaining)throw Error(`${remaining} owns the display`);
 }
 async start(){
  await this.claimDisplay();if(this.child){this.phase='active';this.save();return this.status()}
  this.error=null;this.phase='starting';this.save();
  try{
   if(this.config.wakeDisplay){const {stdout}=await exec('/usr/bin/wlr-randr',[],{timeout:6000});const block=stdout.split(/\n(?=\S)/).find(s=>s.startsWith(this.config.displayOutput+' '));if(!block)throw Error('Configured display output was not found');this.restoreOff=/Enabled:\s*no/.test(block);this.save();if(this.restoreOff)await this.power(true)}
   if(this.owner())throw Error(`${this.owner()} took the display`);
   const port=this.config.port;const url=`http://127.0.0.1:${port}/player?display=1`;
   const child=spawn(this.config.chromiumPath||'/usr/bin/chromium',['--kiosk','--no-first-run','--noerrdialogs','--disable-session-crashed-bubble','--ozone-platform=wayland',`--user-data-dir=${path.join(this.runtime,'collage-chromium')}`,url],{env:{...process.env,XCURSOR_THEME:'Adwaita',XCURSOR_SIZE:'24'},stdio:['ignore','ignore','pipe'],detached:true});
   this.child=child;child.stderr.on('data',chunk=>console.log('[Chromium]',chunk.toString().slice(0,500)));
   await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});
   child.once('exit',()=>{if(this.child===child){this.child=null;this.enqueue(()=>this.stop()).catch(e=>this.error=e.message)}});
   this.phase='active';this.save();return this.status();
  }catch(e){this.error=e.message;await this.stop();throw e}
 }
 async stop(){
  this.phase='stopping';this.save();const child=this.child;this.child=null;
  if(child&&child.exitCode===null){try{process.kill(-child.pid,'SIGTERM')}catch(e){if(e.code!=='ESRCH')throw e}await new Promise(resolve=>{const t=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL')}catch{}resolve()},3000);child.once('exit',()=>{clearTimeout(t);resolve()})})}
  this.phase='idle';await this.checkOwner();this.save();return this.status();
 }
 async checkOwner(){const owner=this.owner();if(owner&&this.child){if(owner==='SplitFlap'&&this.read('splitflap-state.json').temporary===true){if(this.phase!=='suspended'){this.phase='suspended';this.save()}return}await this.stop();return}if(!owner&&this.child&&this.phase==='suspended'){this.phase='active';this.save()}if(!owner&&!this.child&&this.restoreOff){await this.power(false);this.restoreOff=false;this.save()}}
 async close(){clearInterval(this.poll);await this.enqueue(()=>this.stop())}
}
module.exports={Display};
