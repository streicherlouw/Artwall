'use strict';
const PLUGIN='homebridge-artwall-photoframe',PLATFORM='ArtwallPhotoFrame';
class PhotoFramePlatform {
 constructor(log,config,api){this.log=log;this.config=config;this.api=api;this.base=(config.baseUrl||'http://127.0.0.1:8767').replace(/\/$/,'');this.accessories=new Map();this.tail=Promise.resolve();this.stopped=false;
  api.on('didFinishLaunching',()=>{this.poll()});api.on('shutdown',()=>{this.stopped=true;clearTimeout(this.timer)});
 }
 configureAccessory(accessory){this.accessories.set(accessory.UUID,accessory);this.bind(accessory)}
 enqueue(job){const next=this.tail.then(job);this.tail=next.catch(()=>{});return next}
 async request(route,body){const r=await fetch(this.base+route,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(body?30000:4000)});const s=await r.json();if(!r.ok||s.ok===false)throw Error(s.error||`PhotoFrame HTTP ${r.status}`);return s}
 on(status,album){return status.phase==='active'&&status.settings.album===album}
 bind(a){const {Service:S,Characteristic:C}=this.api.hap;const album=a.context.album;
  a.getService(S.AccessoryInformation).setCharacteristic(C.Manufacturer,'Artwall').setCharacteristic(C.Model,'PhotoFrame Album').setCharacteristic(C.SerialNumber,a.UUID);
  const service=a.getService(S.Switch)||a.addService(S.Switch,album);service.setCharacteristic(C.Name,album);
  service.getCharacteristic(C.On).onGet(()=>this.enqueue(async()=>{const s=await this.request('/api/status');this.update(s);return this.on(s,album)})).onSet(value=>this.enqueue(async()=>{try{const s=await this.request('/api/slideshow/album',{album,on:!!value});this.update(s)}catch(e){this.log.warn(`Cannot switch ${album}: ${e.message}`);throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE)}}));
 }
 update(status){for(const a of this.accessories.values())a.getService(this.api.hap.Service.Switch).updateCharacteristic(this.api.hap.Characteristic.On,this.on(status,a.context.album))}
 async refresh(){const s=await this.request('/api/status');if(!Array.isArray(s.albums))throw Error('PhotoFrame did not return albums');const found=new Set();
  for(const album of s.albums){const uuid=this.api.hap.uuid.generate(`${PLUGIN}:${this.base}:${album}`);found.add(uuid);if(this.accessories.has(uuid))continue;
   const a=new this.api.platformAccessory(album,uuid);a.context.album=album;this.bind(a);this.accessories.set(uuid,a);this.api.registerPlatformAccessories(PLUGIN,PLATFORM,[a]);this.log.info('Added album switch:',album);
  }
  for(const [uuid,a]of this.accessories){if(!found.has(uuid)){this.api.unregisterPlatformAccessories(PLUGIN,PLATFORM,[a]);this.accessories.delete(uuid);this.log.info('Removed album switch:',a.context.album)}}this.update(s);
 }
 async poll(){try{await this.enqueue(()=>this.refresh());this.failed=false}catch(e){if(!this.failed)this.log.warn(`PhotoFrame unavailable; retrying: ${e.message}`);this.failed=true;for(const a of this.accessories.values())a.getService(this.api.hap.Service.Switch).updateCharacteristic(this.api.hap.Characteristic.On,new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE))}finally{if(!this.stopped)this.timer=setTimeout(()=>this.poll(),Math.max(2,Number(this.config.pollInterval)||5)*1000)}}
}
module.exports=api=>api.registerPlatform(PLUGIN,PLATFORM,PhotoFramePlatform);
module.exports.PhotoFramePlatform=PhotoFramePlatform;
