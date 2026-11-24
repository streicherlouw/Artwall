'use strict';
const page=document.body.dataset.page,notice=document.getElementById('notice');
async function api(route,body){const r=await fetch(route,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data}
function tell(message,error=false){notice.textContent=message;notice.classList.toggle('error',error)}
function fill(form,data){for(const[k,v]of Object.entries(data)){const field=form.elements.namedItem(k);if(!field)continue;if(field.type==='checkbox')field.checked=v;else field.value=['intervalMs','fadeMs'].includes(k)?v/1000:v}}
async function refresh(){try{const s=await api('/api/status');const text=s.otherOwner?`${s.otherOwner} is using the screen`:`Slideshow ${s.phase}${s.lastFrame&&s.phase==='active'?' · '+s.lastFrame.name+(s.lastFrame.paused?' · paused':''):''}`;document.getElementById('status').textContent=text+(s.searchCollection?` · ${s.searchCollection.album}: ${s.searchCollection.terms.join(' + ')} (${s.searchCollection.count} collages)`: '');const active=document.getElementById('search-active');if(active)active.textContent=s.searchCollection?`Temporary collection selected: ${s.searchCollection.album} · ${s.searchCollection.terms.join(' + ')} · ${s.searchCollection.count} collages`:'No temporary collection selected.'}catch(e){tell(e.message,true)}}
function fillAlbums(data){fillPicklists(data);const base=document.getElementById('search-album');if(base){const previous=base.value;base.replaceChildren();for(const album of data.rootAlbums||[])base.add(new Option(album,album));if((data.rootAlbums||[]).includes(previous))base.value=previous}const summary=data.collectionSummary,counts=document.getElementById('collection-counts');if(counts&&summary)counts.textContent=`${summary.artists} artist switches and ${summary.movements} movement switches visible (${summary.visible} of ${summary.total} collections). Root albums are always included.`;const select=document.getElementById('albums');select.replaceChildren(new Option('All collages','all'));
 const groups=[['Folders',data.folderOptions||(data.rootAlbums||[]).map(id=>({id,name:id}))],['Art Movements',(data.collectionOptions||data.collections||[]).filter(c=>c.kind==='movement')]];
 const selected=data.settings?.album;const legacy=(data.collectionOptions||data.collections||[]).find(c=>c.id===selected);if(legacy&&!groups.some(([,items])=>items.some(item=>item.id===selected)))select.append(new Option(`Current collection: ${legacy.name}`,selected));
 for(const [label,items] of groups){const group=document.createElement('optgroup');group.label=label;for(const item of [...items].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}))){const parts=item.id.split('/');const text=label==='Folders'&&parts.length>1?'\u00a0\u00a0'.repeat(parts.length-1)+'↳ '+parts.at(-1):item.name;group.append(new Option(text,item.id))};select.append(group)}const showPath=()=>{const hint=document.getElementById('album-path');if(hint)hint.textContent=(data.folderOptions||[]).find(f=>f.id===select.value)?.name||''};select.onchange=showPath;select.value=data.settings?.album||'all';showPath()}

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
 try{const result=await api('/api/homekit/rebuild',{});const select=document.getElementById('albums'),selected=select.value;fillAlbums(result);select.value=[...select.options].some(o=>o.value===selected)?selected:'all';status.textContent=`Rebuilt ${result.albums.length} album${result.albums.length===1?'':'s'}. Homebridge will update the switches shortly.`;const empty=result.collections?.filter(c=>c.imageCount===0)||[];if(empty.length)status.textContent+=` Empty collections: ${empty.map(c=>c.name).join(', ')}.`;await refresh()}
 catch(e){status.textContent='Rebuild failed: '+e.message}
 finally{rebuild.disabled=false}
};


const searchForm=document.getElementById('content-search');
if(searchForm){
 const result=document.getElementById('search-result'),sample=document.getElementById('search-sample');
 const buttons=['search-preview','search-play','search-clear'].map(id=>document.getElementById(id));
 async function runSearch(action){
  if(action!=='clear'&&!searchForm.reportValidity())return;
  for(const button of buttons)button.disabled=true;
  result.classList.remove('error');result.textContent=action==='preview'?'Finding matching collages…':action==='play'?'Starting temporary collection…':'Clearing temporary collection…';sample.replaceChildren();
  try{
   const data=await api('/api/slideshow/search',{action,album:document.getElementById('search-album').value,terms:document.getElementById('search-terms').value,mode:document.getElementById('search-mode')?.value||'identifiers'});
   const found=data.result||data;
   if(action==='clear')result.textContent='Temporary collection cleared. The saved album selection is restored.';
   else{result.textContent=`${found.count} collage${found.count===1?'':'s'} match all words in ${found.album}: ${found.terms.join(' + ')}.${action==='play'?' Playing on the Pi.':''}`;for(const name of found.sample){const item=document.createElement('li');item.textContent=name;sample.append(item)}}
   await refresh();
  }catch(error){result.textContent=error.message;result.classList.add('error')}
  finally{for(const button of buttons)button.disabled=false}
 }
 searchForm.onsubmit=event=>{event.preventDefault();runSearch('preview')};
 document.getElementById('search-play').onclick=()=>runSearch('play');
 document.getElementById('search-clear').onclick=()=>runSearch('clear');
}

function fillPicklists(data){
 if(!data.collectionOptions||!data.settings)return;
 for(const [kind,key,target] of [['artist','selectedArtistIds','artist-picklist'],['movement','selectedMovementIds','movement-picklist']]){
  const list=document.getElementById(target);if(!list)continue;list.replaceChildren();
  const selected=new Set(data.settings[key]||[]);
  const options=data.collectionOptions.filter(c=>c.kind===kind).sort((a,b)=>a.name.localeCompare(b.name));
  for(const c of options){const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');input.type='checkbox';input.value=c.id;input.checked=selected.has(c.id);input.dataset.kind=kind;text.textContent=c.name;label.append(input,text);list.append(label)}
  if(!options.length)list.textContent='No '+kind+' collections found. Rebuild the library after adding metadata.';
 }
}
const selectionForm=document.getElementById('homekit-selection');
if(selectionForm)selectionForm.onsubmit=async event=>{
 event.preventDefault();const status=document.getElementById('picklist-status');const body={};
 for(const [id,key]of [['artist-picklist','selectedArtistIds'],['movement-picklist','selectedMovementIds']])body[key]=[...document.getElementById(id).querySelectorAll('input:checked')].map(input=>input.value);
 try{const data=await api('/api/slideshow/config',body);fillAlbums(data);status.textContent='HomeKit button choices saved. Homebridge will update shortly.'}catch(e){status.textContent=e.message}
};
