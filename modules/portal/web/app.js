'use strict';
fetch('/api/modules').then(r=>r.json()).then(modules=>{
 for(const m of modules){const a=document.createElement('a');a.className='card';const url=new URL(m.path||'/',location.origin);url.port=m.port;a.href=url;const h=document.createElement('h2');h.textContent=m.name;const p=document.createElement('p');p.textContent=m.description;const span=document.createElement('span');span.textContent='Open controls →';a.append(h,p,span);document.getElementById('services').append(a)}
 document.getElementById('notice').textContent=modules.length?'':'No display modules installed yet. Run the installer with the modules you want.';
}).catch(()=>document.getElementById('notice').textContent='Unable to read the installed module list.');
