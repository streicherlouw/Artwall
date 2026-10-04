'use strict';
fetch('/api/modules').then(r=>r.json()).then(modules=>{
 for(const m of modules){const a=document.createElement('a');a.className='card';const url=new URL(m.path||'/',location.origin);url.port=m.port;a.href=url;const h=document.createElement('h2');h.textContent=m.name;const p=document.createElement('p');p.textContent=m.description;const span=document.createElement('span');span.textContent='Open controls →';a.append(h,p,span);document.getElementById('services').append(a)}
 if(modules.some(m=>['photoframe','splitflap','airplay'].includes(m.id)))document.getElementById('display-settings').hidden=false;
 document.getElementById('notice').textContent=modules.length?'':'No display modules installed yet. Run the installer with the modules you want.';
}).catch(()=>document.getElementById('notice').textContent='Unable to read the installed module list.');

fetch('/api/display/config').then(r=>r.json()).then(c=>{document.getElementById('idle-seconds').value=c.idleTimeoutSeconds}).catch(()=>{});
document.getElementById('idle-form').onsubmit=async event=>{event.preventDefault();const notice=document.getElementById('idle-notice');try{const response=await fetch('/api/display/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idleTimeoutSeconds:Number(document.getElementById('idle-seconds').value)})});const data=await response.json();if(!response.ok)throw Error(data.error);notice.textContent='Timeout saved.'}catch(e){notice.textContent=e.message}};
