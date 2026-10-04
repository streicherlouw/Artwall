'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {configPath,readJSON,writeJSON}=require('../../common/config');
function createServer(file){const config=readJSON(file);return http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
 const route=new URL(req.url,'http://localhost').pathname;
 if(route==='/api/display/config'){
  res.setHeader('Content-Type','application/json');const target=path.join(path.dirname(file),'display.json');
  try{const settings=readJSON(target,{idleTimeoutSeconds:60,output:'HDMI-A-1'});
   if(req.method==='POST'){
    if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){res.writeHead(403);return res.end(JSON.stringify({error:'Origin denied'}))}
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw Error('Use application/json');
    let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)throw Error('Request too large')}
    const input=JSON.parse(body);if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(k=>k!=='idleTimeoutSeconds'))throw Error('Invalid settings');
    const seconds=input.idleTimeoutSeconds;if(!Number.isInteger(seconds)||seconds<0||seconds>3600||(seconds>0&&seconds<10))throw Error('Use 10–3600 seconds, or 0 to disable');
    settings.idleTimeoutSeconds=seconds;writeJSON(target,settings);
   }else if(req.method!=='GET'){res.writeHead(405);return res.end('{}')}
   return res.end(JSON.stringify({idleTimeoutSeconds:settings.idleTimeoutSeconds}));
  }catch(e){res.writeHead(400);return res.end(JSON.stringify({error:e.message}))}
 }
 if(req.method!=='GET'){res.writeHead(405);return res.end()}
 if(route==='/api/status'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,module:'portal'}))}
 if(route==='/api/modules'){
  const registry=readJSON(path.resolve(path.dirname(file),config.registry),{modules:{}});
  const list=Object.entries(registry.modules).filter(([id])=>id!=='portal').map(([id,m])=>({id,name:m.name,description:m.description,port:m.port,path:'/'}));
  res.setHeader('Content-Type','application/json');return res.end(JSON.stringify([...list,...(config.externalServices||[])]));
 }
 const asset={'/':'index.html','/style.css':'style.css','/app.js':'app.js'}[route];if(!asset){res.writeHead(404);return res.end('Not found')}
 res.setHeader('Content-Type',asset.endsWith('.html')?'text/html':asset.endsWith('.js')?'text/javascript':'text/css');res.end(fs.readFileSync(path.join(__dirname,'web',asset)));
})}
if(require.main===module){const file=path.resolve(process.argv[2]||configPath('portal')),config=readJSON(file);createServer(file).listen(config.port,config.host,()=>console.log('Artwall portal ready'))}
module.exports={createServer};
