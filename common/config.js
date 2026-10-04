'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
function configRoot(){return process.env.ARTWALL_CONFIG_DIR||path.join(os.homedir(),'.config/artwall')}
function configPath(module){return path.join(configRoot(),module+'.json')}
function readJSON(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch(e){if(e.code==='ENOENT'&&fallback!==undefined)return fallback;throw e}}
function writeJSON(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(temp,file)}
function portalInfo(root=configRoot()){const registry=readJSON(path.join(root,'registry.json'),{modules:{}});return {port:registry.modules?.portal?.port??null}}
module.exports={configRoot,configPath,readJSON,writeJSON,portalInfo};
