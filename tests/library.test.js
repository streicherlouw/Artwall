const {test}=require('node:test'),assert=require('node:assert/strict');
const {LibraryIndexer}=require('../modules/photoframe/library');
test('indexing runs only when requested and overlapping rebuilds share one scan',async()=>{
 let scans=0,changes=0,finish;const indexer=new LibraryIndexer('unused',{scan:()=>{scans++;return new Promise(r=>finish=r)},onChange:async()=>changes++});
 assert.equal(scans,0);const first=indexer.rebuild();const second=indexer.rebuild();assert.equal(first,second);assert.equal(scans,1);finish({stdout:'{"albums":4,"images":10}'});assert.deepEqual(await first,{albums:4,images:10});assert.equal(changes,1);
 const startup=indexer.rebuild(false);finish({});await startup;assert.equal(scans,2);assert.equal(changes,1);
});
test('a failed rebuild can be retried and does not notify successful indexing',async()=>{
 let changes=0;const indexer=new LibraryIndexer('unused',{scan:async()=>{throw Error('Scan failed')},onChange:async()=>changes++});await assert.rejects(indexer.rebuild(),/Scan failed/);assert.equal(changes,0);indexer.scan=async()=>({});await indexer.rebuild();assert.equal(changes,1);
});
