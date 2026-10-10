'use strict';
const PLUGIN='homebridge-artwall-photoframe',PLATFORM='ArtwallPhotoFrame';
function artistButtonNames(collections){
 const groups=new Map(),names=new Map();
 for(const c of collections.filter(c=>c.kind==='artist')){
  const full=c.name.replace(/\s*\([^)]*\)/gu,'').trim();
  const surname=(full.includes(',')?full.split(',')[0]:full.split(/\s+/u).slice(-1)[0]).trim()||c.name;
  const key=surname.normalize('NFKC').toLocaleLowerCase('en');
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push({id:c.id,surname});
 }
 for(const group of groups.values()){
  group.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  group.forEach((c,i)=>names.set(c.id,group.length>1?`${group[0].surname} ${i+1}`:c.surname));
 }
 return names;
}
class PhotoFramePlatform {
 constructor(log,config,api){this.log=log;this.config=config;this.api=api;this.base=(config.baseUrl||'http://127.0.0.1:8767').replace(/\/$/,'');this.accessories=new Map();this.tail=Promise.resolve();this.stopped=false;this.status=null;this.statusAt=0;
  api.on('didFinishLaunching',()=>{this.poll()});api.on('shutdown',()=>{this.stopped=true;clearTimeout(this.timer)});
 }
 configureAccessory(accessory){this.accessories.set(accessory.UUID,accessory);this.bind(accessory)}
 enqueue(job){const next=this.tail.then(job);this.tail=next.catch(()=>{});return next}
 async request(route,body){const r=await fetch(this.base+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(body?30000:4000)});const s=await r.json();if(!r.ok||s.ok===false)throw Error(s.error||`PhotoFrame HTTP ${r.status}`);return s}
 read(album){const maxAge=Math.max(15000,(Math.max(2,Number(this.config.pollInterval)||5)*2+4)*1000);if(!this.status||this.failed||Date.now()-this.statusAt>maxAge)throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);return this.on(this.status,album)}
 on(status,album){return status.phase==='active'&&status.settings.album===album}
 bind(a){const {Service:S,Characteristic:C}=this.api.hap;const album=a.context.album;const name=a.context.name||album;
  a.getService(S.AccessoryInformation).setCharacteristic(C.Manufacturer,'Artwall').setCharacteristic(C.Model,'PhotoFrame Album').setCharacteristic(C.SerialNumber,a.UUID);
  const service=a.getService(S.Switch)||a.addService(S.Switch,name);service.setCharacteristic(C.Name,name);if(C.ConfiguredName)service.setCharacteristic(C.ConfiguredName,name);
  service.getCharacteristic(C.On).onGet(()=>this.read(album)).onSet(value=>this.enqueue(async()=>{try{const s=await this.request('/api/slideshow/album',{album,on:!!value});this.update(s)}catch(e){this.log.warn(`Cannot switch ${album}: ${e.message}`);throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE)}}));
 }
 update(status){this.status=status;this.statusAt=Date.now();this.failed=false;for(const a of this.accessories.values())a.getService(this.api.hap.Service.Switch).updateCharacteristic(this.api.hap.Characteristic.On,this.on(status,a.context.album))}
 async refresh(){const s=await this.request('/api/status');if(!Array.isArray(s.albums))throw Error('PhotoFrame did not return albums');const found=new Set(),artistNames=artistButtonNames(s.collections||[]);
  for(const album of s.albums){const name=artistNames.get(album)||(s.collections||[]).find(c=>c.id===album)?.name||album;const uuid=this.api.hap.uuid.generate(`${PLUGIN}:${this.base}:${album}`);found.add(uuid);if(this.accessories.has(uuid)){const a=this.accessories.get(uuid);a.context.name=name;a.displayName=name;a.getService(this.api.hap.Service.Switch).setCharacteristic(this.api.hap.Characteristic.Name,name);if(this.api.hap.Characteristic.ConfiguredName)a.getService(this.api.hap.Service.Switch).setCharacteristic(this.api.hap.Characteristic.ConfiguredName,name);this.api.updatePlatformAccessories?.([a]);continue;}
   const a=new this.api.platformAccessory(name,uuid);a.context.album=album;a.context.name=name;this.bind(a);this.accessories.set(uuid,a);this.api.registerPlatformAccessories(PLUGIN,PLATFORM,[a]);this.log.info('Added album switch:',album);
  }
  for(const [uuid,a]of this.accessories){if(!found.has(uuid)){this.api.unregisterPlatformAccessories(PLUGIN,PLATFORM,[a]);this.accessories.delete(uuid);this.log.info('Removed album switch:',a.context.album)}}this.update(s);
 }
 async poll(){try{await this.enqueue(()=>this.refresh());this.failed=false}catch(e){if(!this.failed)this.log.warn(`PhotoFrame unavailable; retrying: ${e.message}`);this.failed=true;for(const a of this.accessories.values())a.getService(this.api.hap.Service.Switch).updateCharacteristic(this.api.hap.Characteristic.On,new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE))}finally{if(!this.stopped)this.timer=setTimeout(()=>this.poll(),Math.max(2,Number(this.config.pollInterval)||5)*1000)}}
}
module.exports=api=>api.registerPlatform(PLUGIN,PLATFORM,PhotoFramePlatform);
module.exports.PhotoFramePlatform=PhotoFramePlatform;
