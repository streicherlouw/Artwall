'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {validateSettings,publicSettings,writeJSON}=require('./settings');
const {Display}=require('./display');
const {LibraryIndexer}=require('./library');
const {searchTerms,matchingSlides}=require('./content-search');
const {pictureFolderOrder}=require('./picture-folder-order');
function createPortal(configFile,{display:injected,indexer:injectedIndexer}={}){
 let config=JSON.parse(fs.readFileSync(configFile)),revision=Date.now(),sequence=0,commands=[],lastFrame=null,searchCollection=null;
 const root=path.resolve(path.dirname(configFile),config.contentRoot),web=path.join(__dirname,'web');
 const display=injected||new Display(config);
 const indexer=injectedIndexer||new LibraryIndexer(configFile,{onChange:libraryChanged});
 const jsonCache=new Map();
 const jsonFile=file=>{const s=fs.statSync(file),key=`${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`,cached=jsonCache.get(file);if(cached?.key===key)return cached.value;const value=JSON.parse(fs.readFileSync(file,'utf8'));jsonCache.set(file,{key,value});return value};
 const library=()=>{const file=path.join(root,'playlist.json');return fs.existsSync(file)?jsonFile(file):[]};
 const allCollections=()=>{const file=path.join(root,'collections.json');return fs.existsSync(file)?jsonFile(file):[]};
 const collections=()=>allCollections().filter(c=>(c.kind==='artist'?(config.selectedArtistIds||[]):c.kind==='movement'?(config.selectedMovementIds||[]):[]).includes(c.id));
 const folderOptions=()=>{
  const folders=new Set(albums());
  for(const slide of library()){
   const parts=decodeURIComponent((slide.src||'').replace(/^\/media\//,'')).split('/');
   if(parts[0]!==slide.album)continue;
   for(let i=2;i<parts.length;i++)folders.add(parts.slice(0,i).join('/'));
  }
  return [...folders].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'})).map(id=>({id,name:id.split('/').join(' > ')}));
 };
 const playbackChoices=()=>[...folderOptions().map(f=>f.id),...allCollections().map(c=>c.id)];
 const contains=(slide,album)=>slide.album===album||(slide.collections||[]).includes(album)||(album.startsWith(slide.album+'/')&&decodeURIComponent((slide.src||'').replace(/^\/media\//,'')).startsWith(album+'/'));
 const choices=()=>[...albums(),...collections().map(c=>c.id)];
 const albums=()=>[...new Set([...(fs.existsSync(path.join(root,'albums.json'))?jsonFile(path.join(root,'albums.json')):[]),...library().map(s=>s.album)])];
 const activeAlbum=()=>searchCollection?'search:temporary':config.album;
 let selectionCache;
 const selectedSlides=()=>{const slides=library(),key=JSON.stringify(searchCollection||{album:config.album});if(selectionCache?.slides===slides&&selectionCache.key===key)return selectionCache.result;const result=searchCollection?matchingSlides(slides,searchCollection.album,searchCollection.terms,searchCollection.mode):slides.filter(s=>config.album==='all'||contains(s,config.album));selectionCache={slides,key,result};return result};
 const searchStatus=()=>searchCollection?{...searchCollection,count:selectedSlides().length}:null;
 const collectionSummary=()=>{const total=allCollections(),visible=collections();return {total:total.length,visible:visible.length,artists:visible.filter(c=>c.kind==='artist').length,movements:visible.filter(c=>c.kind==='movement').length}};
 const status=()=>({ok:true,...display.status(),settings:{...publicSettings(config),album:activeAlbum()},searchCollection:searchStatus(),revision,sequence,lastFrame,albums:choices(),collections:collections(),collectionSummary:collectionSummary(),rootAlbums:albums(),collectionOptions:allCollections(),folderOptions:folderOptions()});
 const record=(action,value)=>{commands.push({sequence:++sequence,action,value});commands=commands.slice(-200)};
 const server=http.createServer(async(req,res)=>{
  const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(data))};
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'");
  try{
   const url=new URL(req.url,'http://localhost'),route=url.pathname;
   if(!['GET','HEAD','POST'].includes(req.method))return json(405,{error:'Method not allowed'});
   if(req.method==='POST'){
    if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return json(403,{error:'Origin denied'});
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return json(415,{error:'Use application/json'});
   }
   const body=async()=>{let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>16384)throw Error('Request too large');chunks.push(chunk)}const value=JSON.parse(Buffer.concat(chunks).toString()||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Expected object');return value};
   if(route==='/api/homekit/rebuild'&&req.method==='POST'){await body();const scan=await indexer.rebuild();return json(200,{ok:true,scan,settings:publicSettings(config),albums:choices(),collections:collections(),collectionSummary:collectionSummary(),rootAlbums:albums(),collectionOptions:allCollections(),folderOptions:folderOptions()})}
   if(route==='/api/status')return json(200,status());
   if(route==='/api/portal')return json(200,{port:jsonFile(configFile).portalPort??null});
   if(route==='/api/slideshow/config'){
    if(req.method==='POST'){const input=await body();await display.enqueue(async()=>{const next=validateSettings(input,config,playbackChoices(),allCollections());const visible=playbackChoices();if(next.album!=='all'&&!visible.includes(next.album)){if(!searchCollection||Object.hasOwn(input,'album'))await display.stop();next.album='all';lastFrame=null}writeJSON(configFile,next);config=next;display.config=config;if(Object.hasOwn(input,'album')){searchCollection=null;lastFrame=null}revision++;});}
    return json(200,{settings:publicSettings(config),albums:choices(),collections:collections(),collectionSummary:collectionSummary(),rootAlbums:albums(),collectionOptions:allCollections(),folderOptions:folderOptions()});
   }
   if(route==='/api/slideshow/search'&&req.method==='POST'){
    const b=await body();
    if(b.action==='clear'){await display.enqueue(async()=>{searchCollection=null;lastFrame=null;revision++;if(!selectedSlides().length)await display.stop()});return json(200,status())}
    if(!['preview','play'].includes(b.action)||typeof b.album!=='string'||!albums().includes(b.album))throw Error('Provide a root album and action preview or play');
    const mode=b.mode||'identifiers';if(!['identifiers','artist-folders'].includes(mode))throw Error('Unknown search mode');
    const terms=searchTerms(b.terms),summary=()=>{const slides=matchingSlides(library(),b.album,terms,mode);return {ok:true,album:b.album,terms,mode,count:slides.length,sample:slides.slice(0,10).map(s=>s.name)}};
    if(b.action==='preview')return json(200,summary());
    await display.enqueue(async()=>{if(!summary().count)throw Error('No collages match all search words in this folder');const previous=searchCollection;searchCollection={album:b.album,terms,mode};try{await display.start()}catch(error){searchCollection=previous;throw error}lastFrame=null;revision++});
    return json(200,{...status(),result:summary()});
   }
   if(route==='/api/slideshow/album'&&req.method==='POST'){
    const b=await body();if(typeof b.album!=='string'||!playbackChoices().includes(b.album)||typeof b.on!=='boolean')throw Error('Provide a known album and boolean on');
    await display.enqueue(async()=>{
     if(!b.on){if(!searchCollection&&config.album===b.album)await display.stop({powerOff:true});return}
     if(!library().some(s=>contains(s,b.album)))throw Error('This album contains no supported images');
     const next=validateSettings({album:b.album},config,playbackChoices(),allCollections());
     await display.start();
     writeJSON(configFile,next);const changed=!!searchCollection||config.album!==next.album;config=next;display.config=config;searchCollection=null;
     if(changed){lastFrame=null;revision++}else record('resume');
    });return json(200,status());
   }
   if(route==='/api/slideshow/commands')return json(200,{revision,sequence,suspended:display.phase==='suspended',album:activeAlbum(),commands:commands.filter(c=>c.sequence>Number(url.searchParams.get('after')||0))});
   if(route==='/api/slideshow/frame'&&req.method==='POST'){const b=await body();lastFrame={index:b.index,name:String(b.name||'').slice(0,200),paused:!!b.paused,updatedAt:new Date().toISOString()};return json(200,{ok:true})}
   if(route==='/api/slideshow/command'&&req.method==='POST'){
    const b=await body();if(!['start','stop','next','previous','pause','resume'].includes(b.action))throw Error('Unknown command');
    if(b.action==='start'){if(!selectedSlides().length)throw Error('No images in the selected collection. Rebuild the library or choose another album.');lastFrame=null;await display.enqueue(()=>display.start())}
    else if(b.action==='stop')await display.enqueue(()=>display.stop());else record(b.action);
    return json(200,status());
   }
   if(route==='/player'){
    let slides=selectedSlides();
    if(!searchCollection&&config.album.toLowerCase()==='pictures'){slides=pictureFolderOrder(slides)}
    else if(!searchCollection&&config.album.toLowerCase().startsWith('pictures/')){slides=[...slides].sort((a,b)=>decodeURIComponent(a.src).localeCompare(decodeURIComponent(b.src),undefined,{numeric:true,sensitivity:'base'}))}
    else if(config.shuffle){slides=[...slides];for(let i=slides.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[slides[i],slides[j]]=[slides[j],slides[i]]}}
    let html=fs.readFileSync(path.join(web,'player.html'),'utf8').replaceAll('__TITLE__','Art Wall collages').replace('__SLIDES__',JSON.stringify(slides).replaceAll('<','\\u003c'));
    html=html.replace('__PLAYER_TIMING__',JSON.stringify({intervalSeconds:config.intervalMs/1000,crossfadeSeconds:config.fadeMs/1000,useFolderTiming:config.useFolderTiming??true})).replace('card.hidden=!map;',`card.hidden=!map||${!config.showMap};`).replace('width:clamp(120px,11vw,290px)',`width:${config.mapSize}vw`);
    if(url.searchParams.get('display')==='1')html=html.replace('</body>',`<script>window.portalRevision=${revision};window.portalSequence=${sequence};window.portalAlbum=${JSON.stringify(activeAlbum()).replaceAll('<','\\u003c')};</script><script src="/remote.js"></script></body>`);
    res.writeHead(200,{'Content-Type':'text/html'});return res.end(html);
   }
   if(route.startsWith('/media/')){
    const relative=decodeURIComponent(route.slice(7));const file=fs.realpathSync(path.join(root,relative));const realRoot=fs.realpathSync(root);
    if(!file.startsWith(realRoot+path.sep)||!['.png','.jpg','.jpeg','.webp'].includes(path.extname(file).toLowerCase()))return json(403,{error:'Invalid image path'});
    const stat=fs.statSync(file);res.writeHead(200,{'Content-Type':{'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[path.extname(file).toLowerCase()],'Content-Length':stat.size,'Cache-Control':'public, max-age=3600'});
    const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());return stream.pipe(res);
   }
   const assets={'/':'slideshow.html','/slideshow':'slideshow.html','/style.css':'style.css','/app.js':'app.js','/remote.js':'remote.js'};
   if(assets[route]){const ext=path.extname(assets[route]);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[ext]});return res.end(fs.readFileSync(path.join(web,assets[route])))}
   return json(404,{error:'Not found'});
  }catch(e){if(!res.headersSent)json(e.code==='ENOENT'?404:400,{ok:false,error:e.message});else res.destroy()}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 async function libraryChanged(){
  await display.enqueue(async()=>{
   if(searchCollection&&(!albums().includes(searchCollection.album)||!selectedSlides().length)){await display.stop();searchCollection=null;lastFrame=null}
   if(!searchCollection&&(!library().length||(config.album!=='all'&&(!playbackChoices().includes(config.album)||!library().some(s=>contains(s,config.album)))))){await display.stop();config={...config,album:'all'};writeJSON(configFile,config);display.config=config}
   revision++;
  });
 }
 return {server,display,config,libraryChanged,indexer};
}
if(require.main===module){
 const configFile=path.resolve(process.argv[2]||path.join(__dirname,'config.json'));const portal=createPortal(configFile);
 portal.indexer.rebuild(false).then(()=>portal.display.recover()).then(()=>portal.server.listen(portal.config.port,portal.config.host,()=>console.log(`PhotoFrame listening on ${portal.config.port}`))).catch(e=>{console.error(e);process.exit(1)});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{portal.server.close();await portal.display.close();process.exit(0)});
}
module.exports={createPortal};
