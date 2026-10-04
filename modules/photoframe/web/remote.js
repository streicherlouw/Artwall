'use strict';
let after=window.portalSequence;
async function poll(){
 try{
  const r=await fetch(`/api/slideshow/commands?after=${after}`,{cache:'no-store'});if(!r.ok)throw Error('Control unavailable');const data=await r.json();
  if(data.revision!==window.portalRevision){location.reload();return}
  for(const command of data.commands){after=command.sequence;if(command.action==='next')navigate(1);if(command.action==='previous')navigate(-1);if(command.action==='pause'&&!paused)togglePause();if(command.action==='resume'&&paused)togglePause()}
  if(current>=0)await fetch('/api/slideshow/frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index:current+1,name:slides[current]?.name,paused})});
 }catch(error){console.warn(error.message)}finally{setTimeout(poll,700)}
}
poll();
