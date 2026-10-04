'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {configPath,readJSON,writeJSON,portalInfo}=require('../../common/config');
const allowed={receiverName:'string',fps:[15,60],systemVolumeLimitPercent:[1,100],manageSystemVolume:'boolean',manageDisplayPower:'boolean'};
function validate(input,current){const output={...current};if(!input||Array.isArray(input)||typeof input!=='object')throw Error('Expected settings object');for(const[k,v]of Object.entries(input)){const rule=allowed[k];if(!rule)throw Error('Unknown setting');if(Array.isArray(rule)){if(!Number.isInteger(v)||v<rule[0]||v>rule[1])throw Error('Number outside allowed range')}else if(typeof v!==rule||(rule==='string'&&(!v.trim()||v.length>80||/[\r\n\0]/.test(v))))throw Error('Invalid setting');output[k]=v}return output}
function start(file){let config=readJSON(file),child=null,stopping=false,queue=Promise.resolve(),retry;
 const status=()=>readJSON(config.externalStatusFile,{state:'STARTING'});
 function launch(){child=spawn(process.execPath,[path.join(__dirname,'receiver_daemon.js'),file],{stdio:'inherit'});child.on('error',e=>console.error(e));child.once('exit',()=>{child=null;if(!stopping)retry=setTimeout(launch,2000)})}
 async function stopChild(){stopping=true;clearTimeout(retry);if(!child)return;const proc=child;await new Promise(resolve=>{const timer=setTimeout(()=>{proc.kill('SIGKILL')},8000);proc.once('exit',()=>{clearTimeout(timer);resolve()});proc.kill('SIGTERM')})}
 const server=http.createServer(async(req,res)=>{
  const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
  try{const route=new URL(req.url,'http://localhost').pathname;
   if(route==='/api/portal'&&req.method==='GET')return json(200,portalInfo(path.dirname(file)));
   if(route==='/api/status'&&req.method==='GET')return json(200,{ok:true,...status()});
   if(route==='/api/airplay/config'){
    if(req.method==='POST'){
     if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return json(403,{error:'Origin denied'});
     if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return json(415,{error:'Use application/json'});
     let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>16384)throw Error('Request too large')}
     const input=JSON.parse(text);const job=queue.then(async()=>{if(['STREAMING','PIN'].includes(status().state))throw Error('Stop AirPlay before applying settings');const next=validate(input,config);await stopChild();try{writeJSON(file,next);config=next}finally{stopping=false;launch()}});queue=job.catch(()=>{});await job;
    }else if(req.method!=='GET')return json(405,{error:'Method not allowed'});
    return json(200,Object.fromEntries(Object.keys(allowed).map(k=>[k,config[k]])));
   }
   if(req.method!=='GET')return json(405,{error:'Method not allowed'});
   const asset={'/':'airplay.html','/app.js':'app.js','/style.css':'style.css'}[route];if(!asset)return json(404,{error:'Not found'});
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type',asset.endsWith('.html')?'text/html':asset.endsWith('.js')?'text/javascript':'text/css');res.end(fs.readFileSync(path.join(__dirname,'web',asset)));
  }catch(e){json(400,{error:e.message})}
 });server.requestTimeout=15000;server.headersTimeout=10000;
 server.on('error',async e=>{console.error(e);await stopChild();process.exit(1)});
 server.listen(config.web.port,config.web.host,launch);
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{server.close();await stopChild();process.exit(0)});
}
if(require.main===module)start(path.resolve(process.argv[2]||configPath('airplay')));
module.exports={validate};
