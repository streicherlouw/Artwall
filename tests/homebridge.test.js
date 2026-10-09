'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {PhotoFramePlatform}=require('../modules/photoframe/homebridge');
function fixture(){
 class Service {constructor(){this.characteristic={onGet:fn=>{this.get=fn;return this.characteristic},onSet:fn=>{this.set=fn;return this.characteristic}}}setCharacteristic(){return this}getCharacteristic(){return this.characteristic}updateCharacteristic(k,v){this.value=v;return this}}
 class Accessory {constructor(name,id){this.displayName=name;this.UUID=id;this.context={};this.services=new Map([['info',new Service()]])}getService(k){return this.services.get(k)}addService(k){const s=new Service();this.services.set(k,s);return s}}
 const added=[],removed=[];const api={on(){},hap:{Service:{AccessoryInformation:'info',Switch:'switch'},Characteristic:{On:'on',Name:'name'},uuid:{generate:s=>s},HapStatusError:Error,HAPStatus:{SERVICE_COMMUNICATION_FAILURE:-1}},platformAccessory:Accessory,registerPlatformAccessories:(p,n,a)=>added.push(...a),unregisterPlatformAccessories:(p,n,a)=>removed.push(...a)};
 const platform=new PhotoFramePlatform({info(){},warn(){}},{},api);return{platform,added,removed};
}
test('Homebridge dynamically adds and removes album switches without duplicates',async()=>{
 const {platform:p,added,removed}=fixture();let state={phase:'idle',settings:{album:'all'},albums:['Japan','Vietnam','Prom']};p.request=async()=>state;
 await p.refresh();assert.equal(added.length,3);await p.refresh();assert.equal(added.length,3);
 state.albums.push('Fourth');await p.refresh();assert.equal(added.length,4);assert.equal(added[3].context.album,'Fourth');
 state.albums=state.albums.filter(a=>a!=='Fourth');await p.refresh();assert.equal(removed.length,1);assert.equal(p.accessories.size,3);
 p.request=async()=>{throw Error('offline')};await assert.rejects(p.refresh());assert.equal(p.accessories.size,3);
});
test('HomeKit switch setters call the album API and update all album states',async()=>{
 const {platform:p,added}=fixture();let state={phase:'idle',settings:{album:'all'},albums:['Japan','Vietnam']};const calls=[];
 p.request=async(route,body)=>{if(body){calls.push(body);if(body.on)state={...state,phase:'active',settings:{album:body.album}};else if(state.settings.album===body.album)state={...state,phase:'idle'}}return state};
 await p.refresh();const japan=added[0].getService('switch'),vietnam=added[1].getService('switch');
 await japan.set(true);assert.equal(japan.value,true);assert.equal(vietnam.value,false);
 await vietnam.set(true);assert.equal(japan.value,false);assert.equal(vietnam.value,true);
 await japan.set(false);assert.equal(vietnam.value,true);await vietnam.set(false);assert.equal(vietnam.value,false);
 assert.deepEqual(calls[0],{album:'Japan',on:true});
});
test('collection labels can change without replacing accessories or selection IDs',async()=>{
 const {platform:p,added,removed}=fixture();const id='collection:Art:monet';let state={phase:'active',settings:{album:id},albums:['Art',id],collections:[{id,name:'Monet'}]};const calls=[];
 p.request=async(route,body)=>{if(body)calls.push(body);return state};await p.refresh();const a=added[1];assert.equal(a.displayName,'Monet');assert.equal(a.getService('switch').value,true);
 state.collections[0].name='Claude Monet';await p.refresh();assert.equal(a.displayName,'Claude Monet');assert.equal(added.length,2);assert.equal(removed.length,0);await a.getService('switch').set(true);assert.deepEqual(calls,[{album:id,on:true}]);
});
test('reads immediately return cached state even when the command queue is blocked',async()=>{
 const {platform:p,added}=fixture();p.request=async()=>({phase:'active',settings:{album:'Japan'},albums:['Japan','Vietnam']});await p.refresh();
 let release;p.enqueue(()=>new Promise(resolve=>{release=resolve}));await Promise.resolve();
 p.request=()=>{throw Error('Reads must not issue HTTP requests')};
 for(let i=0;i<40;i++){assert.equal(added[0].getService('switch').get(),true);assert.equal(added[1].getService('switch').get(),false)}
 release();await p.tail;
});
test('reads promptly reject unknown, stale and failed state and recover after an update',async()=>{
 const {platform:p,added}=fixture();assert.throws(()=>p.read('Japan'));
 const state={phase:'active',settings:{album:'Japan'},albums:['Japan']};p.request=async()=>state;await p.refresh();const s=added[0].getService('switch');
 p.statusAt=Date.now()-60000;assert.throws(()=>s.get());p.update(state);assert.equal(s.get(),true);
 p.failed=true;assert.throws(()=>s.get());p.update({...state,phase:'idle'});assert.equal(s.get(),false);
});
