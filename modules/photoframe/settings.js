'use strict';
const fs=require('node:fs');
const editable={intervalMs:[1000,300000],fadeMs:[0,5000],mapSize:[5,25]};
function validateSettings(input,current,albums){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Expected a settings object');
 const result={...current};
 for(const [key,value]of Object.entries(input)){
  if(editable[key]){const[min,max]=editable[key];if(!Number.isFinite(value)||value<min||value>max)throw Error(`${key} must be ${min}–${max}`)}
  else if(['showMap','shuffle','wakeDisplay'].includes(key)){if(typeof value!=='boolean')throw Error(`${key} must be true or false`)}
  else if(key==='album'){if(typeof value!=='string'||!['all',...albums].includes(value))throw Error('Unknown album')}
  else throw Error(`Unknown setting: ${key}`);
  result[key]=value;
 }
 if(result.fadeMs>=result.intervalMs)throw Error('Fade must be shorter than the slide interval');
 return result;
}
function publicSettings(config){return Object.fromEntries(['intervalMs','fadeMs','showMap','mapSize','shuffle','album','wakeDisplay'].map(k=>[k,config[k]]))}
function writeJSON(file,value){const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(temp,file)}
module.exports={validateSettings,publicSettings,writeJSON};
