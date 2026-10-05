'use strict';
const page=document.body.dataset.page,notice=document.getElementById('notice');
async function api(route,body){const r=await fetch(route,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data}
function tell(message,error=false){notice.textContent=message;notice.classList.toggle('error',error)}
function fill(form,data){for(const[k,v]of Object.entries(data)){const field=form.elements.namedItem(k);if(!field)continue;if(field.type==='checkbox')field.checked=v;else field.value=['intervalMs','fadeMs'].includes(k)?v/1000:v}}
async function refresh(){try{const s=await api('/api/status');const text=s.otherOwner?`${s.otherOwner} is using the screen`:`Slideshow ${s.phase}${s.lastFrame&&s.phase==='active'?' · '+s.lastFrame.name+(s.lastFrame.paused?' · paused':''):''}`;document.getElementById('status').textContent=text}catch(e){tell(e.message,true)}}
function fillAlbums(data){const summary=data.collectionSummary,counts=document.getElementById('collection-counts');if(counts&&summary)counts.textContent=`${summary.artists} artist switches and ${summary.movements} movement switches visible (${summary.visible} of ${summary.total} collections). Root albums are always included.`;const select=document.getElementById('albums');select.replaceChildren(new Option('All collages','all'));for(const album of data.albums)select.add(new Option(data.collections?.find(c=>c.id===album)?.name||album,album))}
async function setup(){
 const back=document.getElementById('portal-link');if(back){const portal=await api('/api/portal');back.hidden=portal.port==null;if(portal.port!=null){const u=new URL(location.origin);u.port=portal.port;back.href=u.href}}
 if(page==='portal'){
  for(const service of await api('/api/services')){const link=document.createElement('a');link.className='card';const url=new URL(service.path,location.origin);if(service.port)url.port=service.port;link.href=url.href;const heading=document.createElement('h2');heading.textContent=service.name;const description=document.createElement('p');description.textContent=service.description;const action=document.createElement('span');action.textContent='Open configuration →';link.append(heading,description,action);document.getElementById('services').append(link)}
 }else{
  const form=document.getElementById('settings'),route=page==='airplay'?'/api/airplay/config':'/api/slideshow/config';const data=await api(route);
  if(page==='slideshow')fillAlbums(data)
  fill(form,data.settings||data);
  form.onsubmit=async event=>{event.preventDefault();const body={};for(const field of form.elements){if(!field.name)continue;body[field.name]=field.type==='checkbox'?field.checked:field.type==='number'?Number(field.value):field.value;if(['intervalMs','fadeMs'].includes(field.name))body[field.name]*=1000}try{const saved=await api(route,body);if(page==='slideshow'){fillAlbums(saved);fill(form,saved.settings)}tell('Settings saved.')}catch(e){tell(e.message,true)}};
  document.querySelectorAll('[data-command]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await api('/api/slideshow/command',{action:button.dataset.command});tell('Command applied.');await refresh()}catch(e){tell(e.message,true)}finally{button.disabled=false}});
 }
 if(page!=='airplay'){await refresh();setInterval(refresh,3000)}
}
setup().catch(e=>tell(e.message,true));

const rebuild=document.getElementById('rebuild-homekit');
if(rebuild)rebuild.onclick=async()=>{
 const status=document.getElementById('rebuild-status');rebuild.disabled=true;status.textContent='Scanning album folders…';
 try{const result=await api('/api/homekit/rebuild',{});const select=document.getElementById('albums'),selected=select.value;fillAlbums(result);select.value=result.albums.includes(selected)?selected:'all';status.textContent=`Rebuilt ${result.albums.length} album${result.albums.length===1?'':'s'}. Homebridge will update the switches shortly.`;const empty=result.collections?.filter(c=>c.imageCount===0)||[];if(empty.length)status.textContent+=` Empty collections: ${empty.map(c=>c.name).join(', ')}.`;await refresh()}
 catch(e){status.textContent='Rebuild failed: '+e.message}
 finally{rebuild.disabled=false}
};
