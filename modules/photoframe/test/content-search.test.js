'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {searchTerms,matchingSlides}=require('../content-search');
test('identifier searches require every exact word and stay within the root album',()=>{
 const slides=[{album:'Art',name:'both',identifiers:['horse','child']},{album:'Art',name:'one',identifiers:['horse']},{album:'Art',name:'substring',identifiers:['seahorse','children']},{album:'Holiday Japan',name:'wrong album',identifiers:['horse','child']},{album:'Art',name:'missing'}];
 assert.deepEqual(searchTerms(' HORSE, child horse '),['horse','child']);assert.deepEqual(matchingSlides(slides,'Art',searchTerms('horse child')).map(s=>s.name),['both']);
 assert.deepEqual(matchingSlides([{album:'Art',identifiers:['blue_sky','CAFÉ']}],'Art',searchTerms('blue sky café')).length,1);
 for(const invalid of ['',', !',null,['horse'],'x'.repeat(501),Array.from({length:31},(_,i)=>'term'+i).join(' ')])assert.throws(()=>searchTerms(invalid));
});
test('artist folder searches match partial names and accents, excluding filenames and other albums',()=>{
 const slides=[{album:'Art',name:'one',src:'/media/Art/C%C3%A9zanne%2C%20Paul%20(1839-1906)/collage.jpg'},{album:'Art',name:'filename only',src:'/media/Art/Monet/Cezanne.jpg'},{album:'Holiday',src:'/media/Holiday/Cezanne/a.jpg'},{album:'Art',src:'/media/Art/Paul/Cezanne/a.jpg'}];
 assert.deepEqual(matchingSlides(slides,'Art',searchTerms('CEZAN paul'),'artist-folders').map(s=>s.name),['one']);
 assert.equal(matchingSlides(slides,'Art',searchTerms('mon'),'artist-folders').length,1);
 assert.equal(matchingSlides(slides,'Art',searchTerms('cezanne')).length,0);
});
