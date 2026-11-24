 'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {pictureFolderOrder}=require('../picture-folder-order');
test('folder shuffle changes group order only and retains every image once',()=>{
 const slides=['Japan/10.jpg','Vietnam/2.jpg','Australia/1.jpg','Japan/2.jpg','Vietnam/1.jpg'].map(p=>({src:'/media/Pictures/'+p}));
 const first=pictureFolderOrder(slides,()=>0),second=pictureFolderOrder(slides,()=>.999);
 assert.notDeepEqual(first,second);assert.equal(new Set(first.map(s=>s.src)).size,5);
 assert.deepEqual(first.map(s=>s.src),['/media/Pictures/Vietnam/1.jpg','/media/Pictures/Vietnam/2.jpg','/media/Pictures/Australia/1.jpg','/media/Pictures/Japan/2.jpg','/media/Pictures/Japan/10.jpg']);
 assert.deepEqual(pictureFolderOrder([]),[]);assert.deepEqual(slides.map(s=>s.src),['/media/Pictures/Japan/10.jpg','/media/Pictures/Vietnam/2.jpg','/media/Pictures/Australia/1.jpg','/media/Pictures/Japan/2.jpg','/media/Pictures/Vietnam/1.jpg']);
});
