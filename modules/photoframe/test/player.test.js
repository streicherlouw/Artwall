// Playback state tests with a minimal DOM and clock. These do not replace a
// real-browser visual check; they verify ordering, timing and async races.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const template=fs.readFileSync(require('node:path').join(__dirname,'../web/player.html'),'utf8');
const script=template.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
function element(){
 const classes=new Set(),children=new Map();
 return {textContent:'',style:{},hidden:false,attributes:{},offsetWidth:100,
  classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
  setAttribute(k,v){this.attributes[k]=v},querySelector(k){if(!children.has(k))children.set(k,element());return children.get(k)}};
}
function player({missing=[],deferred=[]}={}){
 const slides=Array.from({length:3},(_,i)=>({src:`${i}.png`,name:`Slide ${i+1}`,location:i===2?null:{latitude:35,longitude:139},map:i===2?null:{country:i===0?'Japan':'Vietnam',path:'M10,10L20,10L20,20Z',pinX:20,pinY:20,nearby:false}}));
 const elements=new Map(),layers=[element(),element()],events={},timers=new Map(),pending=new Map();let nextID=1;
 const document={title:'Player',hidden:false,body:element(),documentElement:element(),querySelectorAll:()=>layers,
  getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id)},addEventListener(k,f){events[k]=f}};
 document.getElementById('slides').textContent=JSON.stringify(slides);
 class Image {set src(src){this._src=src;const finish=()=>queueMicrotask(()=>missing.includes(src)?this.onerror():this.onload());if(deferred.includes(src))pending.set(src,finish);else finish()}get src(){return this._src}decode(){return Promise.resolve()}}
 const context=vm.createContext({document,Image,URLSearchParams,location:{hash:''},history:{replaceState(){}},setTimeout:(f,ms)=>{const id=nextID++;timers.set(id,{f,ms});return id},clearTimeout:id=>timers.delete(id),console});
 vm.runInContext(script,context);
 const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
 const tick=async ms=>{const jobs=[...timers.entries()].filter(([,v])=>v.ms===ms);for(const[id,job]of jobs){timers.delete(id);job.f()}await flush()};
 const key=async(key,code=key)=>{events.keydown({key,code,preventDefault(){}});await flush()};
 return {document,layers,elements,pending,flush,tick,key,read:expr=>vm.runInContext(expr,context),events,timers};
}
test('five-second advance, arrows wrap, space pauses and maps follow slides',async()=>{
 const p=player();await p.flush();assert.equal(p.read('current'),0);assert.equal(p.elements.get('count').textContent,'1 / 3');
 assert.equal(p.layers[0].querySelector('.country').textContent,'Japan');
 await p.tick(5000);assert.equal(p.read('current'),1);
 await p.key('ArrowRight');assert.equal(p.read('current'),2);assert.equal(p.layers[p.read('active')].querySelector('.location').hidden,true);
 await p.key('ArrowRight');assert.equal(p.read('current'),0);
 await p.key('ArrowLeft');assert.equal(p.read('current'),2);
 await p.key(' ','Space');await p.tick(5000);assert.equal(p.read('current'),2);
 await p.key('ArrowLeft');assert.equal(p.read('current'),1);assert.equal(p.read('paused'),true);
 await p.key(' ','Space');await p.tick(5000);assert.equal(p.read('current'),2);
 p.document.hidden=true;p.events.visibilitychange();await p.tick(5000);assert.equal(p.read('current'),2);
});
test('late image decoding cannot override newer navigation',async()=>{
 const p=player({deferred:['1.png']});await p.flush();
 await p.key('ArrowRight');assert.equal(p.read('current'),0);
 await p.key('ArrowRight');assert.equal(p.read('current'),2);
 p.pending.get('1.png')();await p.flush();assert.equal(p.read('current'),2);
});
test('missing images are skipped and all-missing inputs terminate clearly',async()=>{
 const p=player({missing:['0.png']});await p.flush();assert.equal(p.read('current'),1);
 const q=player({missing:['0.png','1.png','2.png']});await q.flush();await q.flush();
 assert.match(q.elements.get('message').textContent,/No images could be loaded/);
 assert.equal(q.read('current'),-1);
});
test('remote status waits for a decoded slide before publishing a frame',async()=>{
 const posted=[];let nextPoll;
 const context=vm.createContext({window:{portalSequence:0,portalRevision:1},current:-1,slides:[{name:'Ready'}],paused:false,console,location:{reload(){}},fetch:async(url,options)=>{if(url==='/api/slideshow/frame')posted.push(JSON.parse(options.body));return{ok:true,json:async()=>({revision:1,commands:[]})}},setTimeout:fn=>nextPoll=fn});
 vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../web/remote.js'),'utf8'),context);
 for(let i=0;i<10;i++)await Promise.resolve();assert.equal(posted.length,0);
 context.current=0;await nextPoll();assert.equal(posted[0].index,1);assert.equal(posted[0].name,'Ready');
});
