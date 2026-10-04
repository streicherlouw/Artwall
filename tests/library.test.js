const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LibraryWatcher}=require('../modules/photoframe/library');
test('live folder monitor detects added folders, changed images and removals but ignores its index files',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'artwall-library-'));const media=path.join(root,'photos');fs.mkdirSync(media);const config=path.join(root,'config.json');fs.writeFileSync(config,JSON.stringify({contentRoot:media}));let scans=0,changes=0;
 const watcher=new LibraryWatcher(config,{scan:async()=>scans++,onChange:async()=>changes++,log:{info(){},error(){}}});
 try{await watcher.check(true);await watcher.check();assert.equal(scans,1);fs.mkdirSync(path.join(media,'Fourth'));await watcher.check();assert.equal(changes,1);
 fs.writeFileSync(path.join(media,'Fourth','one.jpg'),'new image');await watcher.check();assert.equal(changes,2);
 fs.writeFileSync(path.join(media,'playlist.json'),'[]');await watcher.check();assert.equal(changes,2);
 fs.rmSync(path.join(media,'Fourth'),{recursive:true});await watcher.check();assert.equal(changes,3);
 }finally{watcher.close();fs.rmSync(root,{recursive:true,force:true})}
});
