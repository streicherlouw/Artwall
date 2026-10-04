"use strict";
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const {pages}=require('../lib/board');
const config=require('./config.json');
const columns=config.columns, rows=config.rows;
const blank=()=>Array.from({length:rows},()=>Array(columns).fill(' '));
const encode=grid=>grid.map(row=>row.join('')).join('\n');
function scene(name,paint){
 const grid=blank();
 const point=(x,y,color)=>{if(x>=0&&x<columns&&y>=0&&y<rows)grid[y][x]=color;};
 // Compose against a 27×10 canvas, scaling coordinates on other grids.
 const pixel=(x,y,c)=>point(Math.round(x*(columns-1)/26),Math.round(y*(rows-1)/9),c);
 const span=(y,a,b,c)=>{for(let x=a;x<=b;x++)pixel(x,y,c);};
 paint(pixel,span);return {name,text:encode(grid)};
}
const scenes=[
 scene('SUNSET OVER WATER',(p,s)=>{
  s(1,11,15,'🟨');s(2,9,17,'🟨');s(3,8,18,'🟧');s(4,9,17,'🟧');s(5,11,15,'🟥');
  s(6,1,25,'🟦');s(7,3,8,'🟦');s(7,11,15,'🟧');s(7,18,23,'🟦');
  s(8,1,6,'🟦');s(8,12,14,'🟨');s(8,20,25,'🟦');
  s(9,5,10,'🟦');s(9,16,21,'🟦');
 }),
 scene('SAILBOAT',(p,s)=>{
  for(let y=0;y<=6;y++)p(13,y,'⬜');
  for(let y=1;y<=5;y++){s(y,13-y,12,'⬜');s(y,14,14+Math.floor(y/2),'🟨');}
  s(6,7,20,'🟥');s(7,9,18,'🟧');
  s(8,1,7,'🟦');s(8,10,16,'🟦');s(8,19,25,'🟦');
  s(9,4,10,'🟦');s(9,16,22,'🟦');
 }),
 scene('MOUNTAINS',(p,s)=>{
  s(0,20,22,'🟨');s(1,19,23,'🟨');s(2,20,22,'🟨');
  for(let y=1;y<=7;y++){s(y,9-(y-1),9+(y-1),y<3?'⬜':'🟪');}
  for(let y=3;y<=7;y++){s(y,18-(y-3),18+(y-3),y<5?'⬜':'🟦');}
  s(8,1,25,'🟩');s(9,3,23,'🟩');
 })
];
// Original text, with no third-party attribution requirements.
const sayings=[
 'LEAVE A LITTLE ROOM\nFOR WONDER.',
 'SMALL STEPS STILL\nCROSS GREAT DISTANCES.',
 'LET THE QUIET MOMENTS\nHAVE THEIR COLOUR.'
];
function quote(text,index){
 const grid=blank();const accents=['🟧','🟦','🟪'];const c=accents[index];
 const inner=pages(text,columns-4,rows-4)[0];
 inner.forEach((char,i)=>{grid[2+Math.floor(i/(columns-4))][2+i%(columns-4)]=char;});
 for(const y of [1,rows-2])for(const x of [1,2,3,columns-4,columns-3,columns-2])grid[y][x]=c;
 grid[0][Math.floor(columns/2)]='🟨';grid[rows-1][Math.floor(columns/2)]='🟨';
 return {name:'TEXT '+(index+1),text:encode(grid)};
}
const sequence=scenes.flatMap((picture,i)=>[picture,quote(sayings[i],i)]);
for(const panel of sequence){
 const laidOut=pages(panel.text,columns,rows);
 if(laidOut.length!==1||laidOut[0].join('')!==panel.text.replace(/\n/g,''))throw new Error('Panel layout mismatch: '+panel.name);
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const send=(type,text)=>{const args=['standalone/send.js',type];if(text)args.push(text);console.log(execFileSync(process.execPath,args,{cwd:path.join(__dirname,'..'),encoding:'utf8',timeout:45000}).trim());};
if(process.argv.includes('--check')){console.log('Six panels verified for '+columns+'×'+rows);}
else (async()=>{let began;try{
 for(let i=0;i<sequence.length;i++){
  if(i)await sleep(Math.max(0,began+i*10000-Date.now()));
  send('message',sequence[i].text);if(!i)began=Date.now();
  console.log(new Date().toISOString()+' '+(i+1)+'/6 '+sequence[i].name);
 }
 await sleep(Math.max(0,began+60000-Date.now()));
}finally{send('deactivate');console.log('Scene and text test complete; display released.');}})().catch(error=>{console.error(error.message);process.exitCode=1;});
