'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('scrollable artist and movement lists restore checks and save independent selections',async()=>{
 class Element{
  constructor(){this.value='';this.children=[];this.dataset={};this.classList={toggle(){},remove(){}};this.elements=[];this.elements.namedItem=()=>null;}
  append(...items){this.children.push(...items)}replaceChildren(...items){this.children=items}add(item){this.children.push(item)}
  querySelectorAll(){return this.children.map(label=>label.children[0]).filter(input=>input.checked)}
 }
 const ids=['notice','status','settings','albums','artist-picklist','movement-picklist','homekit-selection','picklist-status'];const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
 const options=[{id:'monet',name:'Monet, Claude',kind:'artist'},{id:'kroyer',name:'Krøyer, Peder',kind:'artist'},{id:'impressionists',name:'Impressionists',kind:'movement'}];
 let settings={album:'Art',selectedArtistIds:['monet'],selectedMovementIds:['impressionists']};let saved;
 const data=()=>({settings,albums:['Art'],rootAlbums:['Art','Pictures'],folderOptions:[{id:'Art',name:'Art'},{id:'Pictures',name:'Pictures'},{id:'Pictures/Japan',name:'Pictures > Japan'},{id:'Pictures/Japan/Tokyo',name:'Pictures > Japan > Tokyo'}],collectionOptions:options});
 const context={document:{body:{dataset:{page:'slideshow'}},getElementById:id=>elements[id],querySelectorAll:()=>[],createElement:()=>new Element()},Option:class{constructor(text,value){this.text=text;this.value=value}},setInterval(){},fetch:async(route,input)=>{
  if(input?.body){saved=JSON.parse(input.body);settings={...settings,...saved};}
  return {ok:true,json:async()=>route==='/api/status'?{phase:'idle'}:data()};
 }};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8'),context);await new Promise(r=>setImmediate(r));
 assert.deepEqual(elements.albums.children[1].children.map(o=>o.text),['Art','Pictures','\u00a0\u00a0↳ Japan','\u00a0\u00a0\u00a0\u00a0↳ Tokyo']);assert.deepEqual(elements.albums.children.slice(1).map(g=>g.label),['Folders','Art Movements']);
 const artist=elements['artist-picklist'],movement=elements['movement-picklist'];assert.equal(artist.children.length,2,elements.notice.textContent);assert.equal(movement.children.length,1);
 assert.deepEqual(artist.querySelectorAll().map(i=>i.value),['monet']);assert.deepEqual(movement.querySelectorAll().map(i=>i.value),['impressionists']);
 artist.children[0].children[0].checked=true;artist.children[1].children[0].checked=false;movement.children[0].children[0].checked=false;
 await elements['homekit-selection'].onsubmit({preventDefault(){}});assert.deepEqual(saved,{selectedArtistIds:['kroyer'],selectedMovementIds:[]});assert.match(elements['picklist-status'].textContent,/saved/);
 const css=fs.readFileSync(path.join(__dirname,'../web/style.css'),'utf8');assert.match(css,/\.picklist\{[^}]*max-height:320px;overflow-y:auto/);
});
