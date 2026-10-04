'use strict';
let after=window.portalSequence;
let interruptionPaused=null;
async function poll(){
 try{
  const r=await fetch(`/api/slideshow/commands?after=${after}`,{cache:'no-store'});if(!r.ok)throw Error('Control unavailable');const data=await r.json();
  if(data.revision!==window.portalRevision){if(data.album!==undefined&&data.album!==window.portalAlbum)location.replace(location.pathname+location.search);else location.reload();return}
  if(data.suspended&&interruptionPaused===null)interruptionPaused=paused;
  if(!data.suspended&&interruptionPaused!==null){if(paused!==interruptionPaused)togglePause();interruptionPaused=null}
  for(const command of data.commands){after=command.sequence;if(interruptionPaused!==null){if(command.action==='pause')interruptionPaused=true;if(command.action==='resume')interruptionPaused=false;}if(command.action==='next')navigate(1);if(command.action==='previous')navigate(-1);if(command.action==='pause'&&!paused)togglePause();if(command.action==='resume'&&paused)togglePause()}
  if(data.suspended&&!paused)togglePause();
  if(current>=0)await fetch('/api/slideshow/frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index:current+1,name:slides[current]?.name,paused})});
 }catch(error){console.warn(error.message)}finally{setTimeout(poll,700)}
}
poll();
