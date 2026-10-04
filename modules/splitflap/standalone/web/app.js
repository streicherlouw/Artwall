"use strict";
const $ = id => document.getElementById(id);
const message = $('message');
let config, designs=[], page=0, selected=null, anchor=null;
const D=SplitFlapDesigner;
const paletteNames=['White','Red','Orange','Yellow','Green','Blue','Purple'];
Object.keys(D.colors).forEach((value,i)=>{
  const button=document.createElement('button');button.type='button';button.textContent=value;
  button.dataset.square=value;button.setAttribute('aria-label',paletteNames[i]);$('palette').append(button);
});
function command(){
  const value={type:'message',text:message.value};
  if($('sound').checked)value.sound=true;
  if($('beautify').checked)value.beautify=true;
  if($('timed').checked)value.powerOffAfterMs=Number($('seconds').value)*1000;
  return value;
}
function updateCommand(){
  $('curl').value=D.curl(location.origin,command(),config?.authRequired);
}
function range(){
  return [Math.min(anchor??selected,selected),Math.max(anchor??selected,selected)];
}
function highlight(){
  const [start,end]=range();
  for(const [i,tile] of Array.from($('board').children).entries()){
    tile.classList.toggle('selected',selected!==null&&i>=start&&i<=end);
    tile.classList.toggle('cursor',selected===i);
  }
}
function render(){
  $('board').replaceChildren();
  designs[page].forEach((value,index)=>{
    const tile=document.createElement('button');tile.type='button';
    tile.setAttribute('aria-label',`Row ${Math.floor(index/config.columns)+1}, column ${index%config.columns+1}: ${value===' '?'blank':value}`);
    if(D.colors[value]){
      const swatch=document.createElement('span');swatch.className='swatch';swatch.style.setProperty('--color',D.colors[value]);tile.append(swatch);
    }else tile.textContent=value;
    tile.addEventListener('focus',()=>{selected=index;highlight();});
    tile.addEventListener('mousedown',event=>{
      if(event.button!==0)return;
      event.preventDefault();
      if(!event.shiftKey||selected===null)anchor=index;
      else anchor??=selected;
      selected=index;tile.focus();highlight();
    });
    tile.addEventListener('mouseenter',event=>{
      if(event.buttons===1&&anchor!==null){selected=index;tile.focus();highlight();}
    });
    tile.addEventListener('copy',event=>{
      event.preventDefault();const [start,end]=range();
      event.clipboardData.setData('text/plain',D.selectionText(designs[page],config.columns,start,end));
    });
    tile.addEventListener('cut',event=>{
      event.preventDefault();const [start,end]=range();
      event.clipboardData.setData('text/plain',D.selectionText(designs[page],config.columns,start,end));
      designs[page].fill(' ',start,end+1);selected=start;anchor=null;commitDesign();
    });
    tile.addEventListener('paste',event=>{
      const text=event.clipboardData?.getData('text/plain');
      if(!text)return;
      event.preventDefault();
      const [start,end]=range();
      const cells=designs[page].slice();
      if(start!==end)cells.fill(' ',start,end+1);
      const edit=D.pasteText(cells,config.columns,start,SplitFlap.normalize(text));
      anchor=null;
      designs[page]=edit.cells;selected=edit.cursor;
      if(commitDesign())$('result').textContent=edit.clipped?'Pasted to the end of this page. Remaining text did not fit.':'Text pasted.';
    });
    tile.addEventListener('keydown',event=>{
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='a'){
        event.preventDefault();anchor=0;selected=designs[page].length-1;render();$('board').children[selected].focus();return;
      }
      const moves={ArrowLeft:-1,ArrowRight:1,ArrowUp:-config.columns,ArrowDown:config.columns};
      if(event.key in moves){event.preventDefault();if(event.shiftKey)anchor??=index;else anchor=null;selected=Math.max(0,Math.min(config.columns*config.rows-1,index+moves[event.key]));render();$('board').children[selected].focus();}
      else if(event.key==='Enter'){
        event.preventDefault();
        const [start,end]=range(), source=designs.map(cells=>cells.slice());
        if(start!==end)source[page].fill(' ',start,end+1);
        const edit=D.splitLine(source,config.columns,page,start);
        if(D.serialize(edit.pages,config.columns).length>4000){
          $('result').textContent='Cannot insert a line: the design would exceed 4,000 characters.';return;
        }
        designs=edit.pages;page=edit.page;selected=edit.cursor;anchor=null;commitDesign();
      }
      else if(event.key===' '||event.key==='Delete'||event.key==='Backspace'){
        event.preventDefault();
        const [start,end]=range();
        if(start!==end){
          designs[page].fill(' ',start,end+1);selected=start;anchor=null;
          if(event.key===' ')paint(' ',true);else commitDesign();
          return;
        }
        anchor=null;
        const edit=D.editRow(designs[page],config.columns,index,event.key);
        designs[page]=edit.cells;selected=edit.cursor;commitDesign();
      }
      else if(!event.metaKey&&!event.ctrlKey&&!event.altKey&&Array.from(event.key).length===1){
        event.preventDefault();paint(Array.from(SplitFlap.normalize(event.key))[0]||' ',true);
      }
    });
    $('board').append(tile);
  });
  highlight();
  $('page-number').textContent=`Page ${page+1} of ${designs.length}`;
  $('previous').disabled=page===0;$('next').disabled=page===designs.length-1;
}
function paint(value,advance=false){
  const [start,end]=range();
  if(start!==end)designs[page].fill(' ',start,end+1);
  selected=start;anchor=null;
  designs[page][selected]=value;
  if(advance)selected=Math.min(config.columns*config.rows-1,selected+1);
  commitDesign();
}
function commitDesign(){
  const text=D.serialize(designs,config.columns);
  if(text.length>4000){$('result').textContent='This design exceeds the 4,000-character limit. Shorten the message before editing tiles.';designs=SplitFlap.pages(message.value,config.columns,config.rows,config.align);return;}
  message.value=text;
  $('beautify').checked=false;
  render();updateCommand();$('count').textContent=`${message.value.length} / 4000`;
  $('board').children[selected].focus();
  return true;
}
function count(){
  $('count').textContent=`${message.value.length} / 4000`;
  if(config){designs=$('beautify').checked?SplitFlap.beautify(message.value,config.columns,config.rows):SplitFlap.pages(message.value,config.columns,config.rows,config.align);page=Math.min(page,designs.length-1);render();}
  updateCommand();
}
$('sound').addEventListener('change',updateCommand);
$('beautify').addEventListener('change',()=>{selected=null;anchor=null;count();});
message.addEventListener('input',()=>{selected=null;anchor=null;count();});
message.addEventListener('focus',()=>{selected=null;anchor=null;if(config)render();});
$('palette').addEventListener('click',event=>{
  const square=event.target.dataset.square;if(!square)return;
  if(selected!==null){paint(square,true);return;}
  if(message.value.length+square.length>4000)return;
  message.setRangeText(square,message.selectionStart,message.selectionEnd,'end');message.focus();count();
});
$('previous').addEventListener('click',()=>{page--;selected=null;anchor=null;render();});
$('next').addEventListener('click',()=>{page++;selected=null;anchor=null;render();});
$('timed').addEventListener('change',()=>{$('seconds').disabled=!$('timed').checked;updateCommand();});
$('seconds').addEventListener('input',updateCommand);
function copyCommandFallback(){
  const field=$('curl');field.focus();field.select();field.setSelectionRange(0,field.value.length);
  try{
    if(document.execCommand('copy')){$('copy-result').textContent='Command copied.';return;}
  }catch{}
  $('copy-result').textContent='Your browser blocked copying. The command is selected — press Command+C (or Ctrl+C).';
}
$('copy').addEventListener('click',()=>{
  // HTTP on the Pi does not expose the secure Clipboard API. Keep the
  // synchronous fallback inside the click gesture for browser permission.
  if(!navigator.clipboard?.writeText){copyCommandFallback();return;}
  navigator.clipboard.writeText($('curl').value).then(()=>{
    $('copy-result').textContent='Command copied.';
  }).catch(copyCommandFallback);
});
async function request(command) {
  const response = await fetch(command ? '/api/message' : '/api/status', {
    method: command ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${$('key').value}` },
    ...(command ? { body: JSON.stringify(command) } : {})
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || 'Could not reach the display');
  $('state').textContent = result.state;
  return result;
}
async function send(command) {
  $('send').disabled = $('end').disabled = $('power-off').disabled = true;
  $('result').textContent = 'Sending… the screen may need a few seconds to wake and finish flipping.';
  try {
    const result = await request(command);
    $('result').textContent = result.screenOff ? 'Screen switched off.' : result.state === 'idle' ? 'Display ended.' : result.powerOffAt ? `Message displayed. Screen will turn off at ${new Date(result.powerOffAt).toLocaleTimeString()}.` : 'Message displayed. The screen will stay on until you end the display.';
  } catch (error) { $('result').textContent = error.message; }
  finally { $('send').disabled = $('end').disabled = $('power-off').disabled = false; }
}
$('message-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!message.value.trim()) { message.focus(); return; }
  void send(command());
});
$('power-off').addEventListener('click', () => void send({ type: 'power-off' }));
$('end').addEventListener('click', () => void send({ type: 'deactivate' }));
$('key').addEventListener('change', () => { void request().catch(error => { $('state').textContent = error.message; }); });
void fetch('/api/config').then(response => response.json()).then(settings => {
  config=settings;
  $('dimensions').textContent=`${config.columns} × ${config.rows} tiles · 16:9 display`;
  $('board').style.setProperty('--columns',config.columns);
  $('board').style.setProperty('--rows',config.rows);
  const tileWidth=(100-(config.columns+1)*.27)/config.columns;
  const tileHeight=(56.25-(config.rows+1)*.27)/config.rows;
  const glyph=Math.min(tileWidth*1.15,tileHeight*.69);
  $('board').style.setProperty('--glyph',glyph+'cqw');
  $('board').style.setProperty('--cap',(glyph*.73)+'cqw');
  count();$('send').disabled=false;
  $('authentication').hidden = !config.authRequired;
  return request();
}).catch(error => { $('state').textContent = error.message; });

// Resolve the optional portal on this host, including custom portal ports.
fetch('/api/portal',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Portal unavailable');return r.json()}).then(portal=>{const back=document.getElementById('portal-link');if(portal.port==null)return;const url=new URL('/',location.origin);url.port=portal.port;back.href=url.href;back.hidden=false}).catch(()=>{});
