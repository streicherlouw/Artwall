'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
const {createServer}=require('../modules/portal/server');
const {validate}=require('../modules/airplay/server');
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const close=server=>new Promise(resolve=>server.close(resolve));
test('portal lists installed modules only and responds to registry changes without restarting',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'artwall-portal-'));const file=path.join(root,'portal.json');
 fs.writeFileSync(file,JSON.stringify({registry:'registry.json'}));const server=createServer(file);await listen(server);const url=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.deepEqual(await(await fetch(url+'/api/modules')).json(),[]);
  fs.writeFileSync(path.join(root,'registry.json'),JSON.stringify({modules:{portal:{port:80},splitflap:{name:'SplitFlap',port:8766}}}));
  assert.deepEqual((await(await fetch(url+'/api/modules')).json()).map(x=>x.id),['splitflap']);
  fs.writeFileSync(path.join(root,'registry.json'),JSON.stringify({modules:{}}));
  assert.deepEqual(await(await fetch(url+'/api/modules')).json(),[]);
  assert.equal((await fetch(url+'/api/modules',{method:'POST'})).status,405);
  assert.equal((await fetch(url+'/unknown')).status,404);
 }finally{await close(server);fs.rmSync(root,{recursive:true,force:true})}
});
test('CLI dispatches local commands through the public HTTP interface',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'artwall-cli-'));const received=[];
 const server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;received.push({url:req.url,body:JSON.parse(body||'{}')});res.setHeader('Content-Type','application/json');res.end('{"ok":true}')});await listen(server);
 for(const id of ['photoframe','splitflap'])fs.writeFileSync(path.join(root,id+'.json'),JSON.stringify({port:server.address().port,web:{port:server.address().port}}));
 const command=args=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.resolve(__dirname,'../bin/artwall'),...args],{env:{...process.env,ARTWALL_CONFIG_DIR:root}});let err='';child.stderr.on('data',d=>err+=d);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(err)))});
 try{
  await command(['photoframe','start']);await command(['photoframe','next']);await command(['splitflap','show','HELLO','WORLD','--sound']);await command(['splitflap','stop']);
  assert.deepEqual(received,[{url:'/api/slideshow/command',body:{action:'start'}},{url:'/api/slideshow/command',body:{action:'next'}},{url:'/api/message',body:{text:'HELLO WORLD',sound:true}},{url:'/api/end',body:{}}]);
 }finally{await close(server);fs.rmSync(root,{recursive:true,force:true})}
});
test('AirPlay settings permit safe receiver options and reject executable or invalid inputs',()=>{
 assert.equal(validate({receiverName:'Living room',fps:30},{uxplayPath:'/usr/local/bin/uxplay'}).uxplayPath,'/usr/local/bin/uxplay');
 for(const input of [{uxplayPath:'/tmp/other'},{fps:100},{receiverName:'\n'},{manageDisplayPower:'yes'},null])assert.throws(()=>validate(input,{}));
});
