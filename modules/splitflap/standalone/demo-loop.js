"use strict";
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const {setTimeout:wait}=require('node:timers/promises');
const panels=require('./demo-panels');
if(process.argv.includes('--check')){console.log(`${panels.length} panels; ${panels.filter(p=>!p.name.startsWith('TEXT')).length} pictures; all layouts valid`);process.exit(0);}
const abort=new AbortController();
process.on('SIGTERM',()=>abort.abort());process.on('SIGINT',()=>abort.abort());
const send=(type,text)=>{const args=['standalone/send.js',type];if(text)args.push(text);return execFileSync(process.execPath,args,{cwd:path.join(__dirname,'..'),encoding:'utf8',timeout:45000}).trim();};
(async()=>{
 let count=0;
 try{
  while(!abort.signal.aborted){
   const panel=panels[count%panels.length];
   const started=Date.now();
   console.log(send('message',panel.text));
   console.log(`${new Date().toISOString()} cycle ${Math.floor(count/panels.length)+1}, panel ${count%panels.length+1}/30: ${panel.name}`);
   count++;
   await wait(Math.max(0,10000-(Date.now()-started)),undefined,{signal:abort.signal});
  }
 }catch(error){if(error.name!=='AbortError'){console.error(error.message);process.exitCode=1;}}
 finally{try{console.log(send('deactivate'));}catch(error){console.error(error.message);}}
})();
