'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {configPath,readJSON}=require('../../common/config');
function createServer(file){const config=readJSON(file);return http.createServer((req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
 const route=new URL(req.url,'http://localhost').pathname;
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
