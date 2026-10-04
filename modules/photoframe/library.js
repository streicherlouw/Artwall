'use strict';
const path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const execute=promisify(execFile);
class LibraryIndexer {
 constructor(configFile,{onChange=async()=>{},scan}={}){this.onChange=onChange;this.scan=scan||(()=>execute('/usr/bin/python3',[path.join(__dirname,'scan.py'),'--config',configFile],{timeout:300000}));this.pending=null}
 rebuild(notify=true){
  if(this.pending)return this.pending;
  this.pending=(async()=>{const result=await this.scan();if(notify)await this.onChange();return result.stdout?JSON.parse(result.stdout):result})().finally(()=>{this.pending=null});
  return this.pending;
 }
}
module.exports={LibraryIndexer};
