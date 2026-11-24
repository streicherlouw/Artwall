'use strict';
// Words match exactly after case/Unicode normalization; compound identifiers
// such as blue_sky also contribute their individual words.
const words=text=>text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
function searchTerms(input){
 if(typeof input!=='string'||input.length>500)throw Error('Provide search words (up to 500 characters)');
 const terms=[...new Set(words(input))];
 if(!terms.length||terms.length>30)throw Error('Enter between 1 and 30 identifier words');
 return terms;
}
const fold=text=>text.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
function matchingSlides(slides,album,terms,mode='identifiers'){
 return slides.filter(slide=>{
  if(slide.album!==album)return false;
  if(mode==='artist-folders'){
   // Search directory names beneath the root album, never image filenames.
   const folders=String(slide.src||'').split('/').slice(3,-1).map(part=>{try{return decodeURIComponent(part)}catch{return part}});
   return folders.some(folder=>terms.every(term=>fold(folder).includes(fold(term))));
  }
  const identifiers=new Set((Array.isArray(slide.identifiers)?slide.identifiers:[]).filter(i=>typeof i==='string').flatMap(words));
  return terms.every(term=>identifiers.has(term));
 });
}
module.exports={searchTerms,matchingSlides};
