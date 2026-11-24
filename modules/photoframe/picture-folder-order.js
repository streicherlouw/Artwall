 'use strict';
// Shuffle immediate child folders only. Keep every folder's images in their
// indexed natural filename order, including any deeper descendants.
function pictureFolderOrder(slides,random=Math.random){
 const groups=new Map();
 for(const slide of slides){
  const parts=decodeURIComponent(slide.src.replace(/^\/media\//,'')).split('/');
  const key=parts.length>2?parts[1]:'';
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(slide);
 }
 const keys=[...groups.keys()];
 for(let i=keys.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[keys[i],keys[j]]=[keys[j],keys[i]]}
 const compare=new Intl.Collator('en',{numeric:true,sensitivity:'base'}).compare;
 return keys.flatMap(key=>groups.get(key).slice().sort((a,b)=>compare(decodeURIComponent(a.src),decodeURIComponent(b.src))));
}
module.exports={pictureFolderOrder};
