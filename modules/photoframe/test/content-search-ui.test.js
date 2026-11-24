'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('admin search chooses only root folders, previews results, plays and clears the collection',async()=>{
 class Element{
  constructor(){this.value='';this.children=[];this.disabled=false;this.textContent='';this.classList={remove(){},add(){},toggle(){}};this.elements={namedItem:()=>null};this.reportValidity=()=>true}
  replaceChildren(...children){this.children=children;this.value=children[0]?.value||''}
  add(option){this.children.push(option);if(this.children.length===1)this.value=option.value}
  append(child){this.children.push(child)}
 }
 const ids=['notice','status','settings','albums','collection-counts','content-search','search-album','search-terms','search-preview','search-play','search-clear','search-result','search-sample','search-active'],elements=Object.fromEntries(ids.map(id=>[id,new Element()]));let active=null,fail=false;const calls=[];
 const data={settings:{album:'all'},albums:['Art','Holiday Japan','collection:Art:monet'],rootAlbums:['Art','Holiday Japan'],collections:[{id:'collection:Art:monet',name:'Monet',kind:'artist'}]};
 const context={document:{body:{dataset:{page:'slideshow'}},getElementById:id=>elements[id],querySelectorAll:()=>[],createElement:()=>new Element()},Option:class{constructor(text,value){this.text=text;this.value=value}},setInterval(){},fetch:async(route,options)=>{
  if(route==='/api/slideshow/config')return{ok:true,json:async()=>data};
  if(route==='/api/status')return{ok:true,json:async()=>({phase:active?'active':'idle',searchCollection:active})};
  const body=JSON.parse(options.body);calls.push(body);
  if(fail)return{ok:false,json:async()=>({error:'AirPlay owns the display'})};
  if(body.action==='clear'){active=null;return{ok:true,json:async()=>({ok:true})}}
  const result={album:body.album,terms:['horse','child'],count:1,sample:['Collage 12']};
  if(body.action==='play')active={...result};
  return{ok:true,json:async()=>body.action==='play'?{result}:result};
 }};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8'),context);await new Promise(r=>setImmediate(r));
 assert.deepEqual(elements['search-album'].children.map(o=>o.value),['Art','Holiday Japan']);assert.deepEqual(elements.albums.children.slice(1).map(g=>g.label),['Folders','Art Movements']);
 elements['search-terms'].value='horse child';elements['content-search'].onsubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));assert.match(elements['search-result'].textContent,/1 collage match/);assert.equal(elements['search-sample'].children[0].textContent,'Collage 12');assert.equal(active,null);
 await elements['search-play'].onclick();assert.equal(active.album,'Art');assert.match(elements['search-active'].textContent,/horse \+ child/);assert.equal(elements['search-play'].disabled,false);
 fail=true;await elements['search-play'].onclick();assert.equal(elements['search-result'].textContent,'AirPlay owns the display');assert.ok(active);fail=false;
 await elements['search-clear'].onclick();assert.equal(active,null);assert.match(elements['search-active'].textContent,/No temporary collection/);assert.equal(calls[0].terms,'horse child');
});
