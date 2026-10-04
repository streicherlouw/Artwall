'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const execute=promisify(execFile);
function fingerprint(root){const rows=[];function visit(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(e.name.startsWith('.')||e.isSymbolicLink())continue;const file=path.join(dir,e.name);if(e.isDirectory()){rows.push(['d',path.relative(root,file)]);visit(file)}else if(dir!==root&&/\.(png|jpe?g|webp)$/i.test(e.name)&&!e.name.includes('.preview.')&&!e.name.startsWith('contact-')){const s=fs.statSync(file);rows.push([path.relative(root,file),s.size,s.mtimeMs])}}}visit(root);return JSON.stringify(rows)}
class LibraryWatcher {
 constructor(configFile,{onChange=async()=>{},log=console,interval=5000,scan}={}){this.file=configFile;this.root=path.resolve(path.dirname(configFile),JSON.parse(fs.readFileSync(configFile)).contentRoot);this.onChange=onChange;this.log=log;this.interval=interval;this.scan=scan||(()=>execute('/usr/bin/python3',[path.join(__dirname,'scan.py'),'--config',this.file],{timeout:300000}));this.closed=false;this.running=false}
 async check(initial=false){if(this.running)return;this.running=true;try{fs.mkdirSync(this.root,{recursive:true});const next=fingerprint(this.root);if(initial||next!==this.previous){await this.scan();this.previous=next;if(!initial)await this.onChange();this.log.info('PhotoFrame album folders indexed')}}finally{this.running=false}}
 async start(){await this.check(true);this.schedule()}
 schedule(){if(!this.closed)this.timer=setTimeout(async()=>{try{await this.check()}catch(e){this.log.error('PhotoFrame folder scan:',e.message)}finally{this.schedule()}},this.interval)}
 close(){this.closed=true;clearTimeout(this.timer)}
}
module.exports={LibraryWatcher,fingerprint};
