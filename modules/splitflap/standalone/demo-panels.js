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
 const grid=blank();const accents=['🟧','🟦','🟪'];const c=accents[index%accents.length];
 const inner=pages(text,columns-4,rows-4)[0];
 inner.forEach((char,i)=>{grid[2+Math.floor(i/(columns-4))][2+i%(columns-4)]=char;});
 for(const y of [1,rows-2])for(const x of [1,2,3,columns-4,columns-3,columns-2])grid[y][x]=c;
 grid[0][Math.floor(columns/2)]='🟨';grid[rows-1][Math.floor(columns/2)]='🟨';
 return {name:'TEXT '+(index+1),text:encode(grid)};
}

const extras = [
 scene('CRAB',(p,s)=>{
  s(1,1,3,'🟥');s(1,23,25,'🟥');s(2,2,4,'🟥');s(2,22,24,'🟥');
  s(3,4,7,'🟥');s(3,19,22,'🟥');p(10,2,'⬜');p(16,2,'⬜');
  s(4,7,19,'🟥');s(5,6,20,'🟧');s(6,7,19,'🟥');
  for(const x of [4,7,19,22]){p(x,6,'🟥');p(x-1,7,'🟥');p(x+1,8,'🟥');}
 }),
 scene('WHALE',(p,s)=>{
  p(10,0,'⬜');p(14,0,'⬜');p(11,1,'🟦');p(13,1,'🟦');p(12,2,'🟦');
  s(3,6,16,'🟦');s(4,4,18,'🟦');s(5,3,20,'🟦');p(6,4,'⬜');
  s(6,4,19,'🟦');s(7,6,17,'⬜');s(4,22,24,'🟦');s(3,21,22,'🟦');s(3,24,25,'🟦');s(5,20,23,'🟦');
  s(9,1,7,'🟦');s(9,11,16,'🟦');s(9,20,25,'🟦');
 }),
 scene('TRAIN',(p,s)=>{
  s(1,19,21,'⬜');s(2,17,19,'⬜');p(18,3,'🟥');
  s(4,2,8,'🟦');s(4,11,15,'🟥');s(5,2,8,'🟦');s(5,11,21,'🟥');
  for(const x of [3,5,7,12,14])p(x,4,'⬜');
  s(6,2,22,'🟧');for(const x of [3,7,12,18,21])p(x,7,'⬜');
  s(8,0,26,'🟪');
 }),
 scene('BUTTERFLY',(p,s)=>{
  p(11,0,'🟨');p(15,0,'🟨');p(12,1,'🟨');p(14,1,'🟨');
  s(1,3,6,'🟪');s(1,20,23,'🟪');s(2,2,9,'🟪');s(2,17,24,'🟪');
  s(3,3,11,'🟪');s(3,15,23,'🟪');s(3,5,7,'🟧');s(3,19,21,'🟧');
  s(4,5,12,'🟪');s(4,14,21,'🟪');
  s(5,6,11,'🟦');s(5,15,20,'🟦');s(6,5,10,'🟦');s(6,16,21,'🟦');
  s(7,6,9,'🟦');s(7,17,20,'🟦');for(let y=2;y<=7;y++)p(13,y,'🟨');
 })
];
const pictures = [...scenes,...require('./landscape-art').map(a=>({name:a.name,text:a.text})),...extras];
const texts = [
 'LEAVE A LITTLE ROOM\nFOR WONDER.', 'LET A SMALL JOY\nCHANGE THE DAY.',
 'SMALL STEPS STILL\nCROSS GREAT DISTANCES.', 'TAKE THE SCENIC ROUTE\nTHROUGH TODAY.',
 'LET QUIET MOMENTS\nHAVE THEIR COLOUR.', 'MAKE SPACE FOR\nA FRESH PERSPECTIVE.',
 'A LITTLE KINDNESS\nTRAVELS A LONG WAY.', 'NOTICE SOMETHING\nBEAUTIFUL TODAY.',
 'FOLLOW YOUR CURIOSITY\nSOMEWHERE NEW.', 'LET YOUR NEXT STEP\nBE A GENTLE ONE.',
 'EVERY DAY HAS ROOM\nFOR A NEW BEGINNING.', 'PAUSE LONG ENOUGH\nTO SEE THE SKY.',
 'BUILD SOMETHING SMALL.\nMAKE IT YOUR OWN.', 'BRING A LITTLE COLOUR\nTO AN ORDINARY MOMENT.',
 'GOOD THINGS CAN GROW\nAT A QUIET PACE.', 'KEEP A CORNER OF TODAY\nFOR PLAY.',
 'LET THE LIGHT IN.\nLET THE HURRY GO.', 'TURN A SPARE MOMENT\nINTO A GOOD MEMORY.',
 'LOOK CLOSELY.\nTHERE IS MORE TO SEE.', 'END THE DAY WITH ROOM\nFOR TOMORROW.'
];
const panels=pictures.flatMap((picture,i)=>[picture,quote(texts[i*2],i*2),quote(texts[i*2+1],i*2+1)]);
for(const panel of panels){
 const laidOut=pages(panel.text,columns,rows);
 if(laidOut.length!==1||laidOut[0].join('')!==panel.text.replace(/\n/g,''))throw new Error('Layout mismatch: '+panel.name);
}
module.exports=panels;
