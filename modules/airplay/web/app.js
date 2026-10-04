'use strict';
const page=document.body.dataset.page,notice=document.getElementById('notice');
async function api(route,body){const r=await fetch(route,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data}
function tell(message,error=false){notice.textContent=message;notice.classList.toggle('error',error)}
function fill(form,data){for(const[k,v]of Object.entries(data)){const field=form.elements.namedItem(k);if(!field)continue;if(field.type==='checkbox')field.checked=v;else field.value=['intervalMs','fadeMs'].includes(k)?v/1000:v}}
async function refresh(){try{const s=await api('/api/status');const text=s.otherOwner?`${s.otherOwner} is using the screen`:`Slideshow ${s.phase}${s.lastFrame&&s.phase==='active'?' · '+s.lastFrame.name+(s.lastFrame.paused?' · paused':''):''}`;document.getElementById('status').textContent=text}catch(e){tell(e.message,true)}}
async function setup(){
 if(page==='portal'){
  for(const service of await api('/api/services')){const link=document.createElement('a');link.className='card';const url=new URL(service.path,location.origin);if(service.port)url.port=service.port;link.href=url.href;const heading=document.createElement('h2');heading.textContent=service.name;const description=document.createElement('p');description.textContent=service.description;const action=document.createElement('span');action.textContent='Open configuration →';link.append(heading,description,action);document.getElementById('services').append(link)}
 }else{
  const form=document.getElementById('settings'),route=page==='airplay'?'/api/airplay/config':'/api/slideshow/config';const data=await api(route);
  if(page==='slideshow')for(const album of data.albums){const option=document.createElement('option');option.value=album;option.textContent=album;document.getElementById('albums').append(option)}
  fill(form,data.settings||data);
  form.onsubmit=async event=>{event.preventDefault();const body={};for(const field of form.elements){if(!field.name)continue;body[field.name]=field.type==='checkbox'?field.checked:field.type==='number'?Number(field.value):field.value;if(['intervalMs','fadeMs'].includes(field.name))body[field.name]*=1000}try{await api(route,body);tell('Settings saved.')}catch(e){tell(e.message,true)}};
  document.querySelectorAll('[data-command]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await api('/api/slideshow/command',{action:button.dataset.command});tell('Command applied.');await refresh()}catch(e){tell(e.message,true)}finally{button.disabled=false}});
 }
 if(page!=='airplay'){await refresh();setInterval(refresh,3000)}
}
setup().catch(e=>tell(e.message,true));

// Resolve the optional portal on this host, including custom portal ports.
fetch('/api/portal',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Portal unavailable');return r.json()}).then(portal=>{const back=document.getElementById('portal-link');if(portal.port==null)return;const url=new URL('/',location.origin);url.port=portal.port;back.href=url.href;back.hidden=false}).catch(()=>{});
