const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../modules/photoframe/homebridge/homebridge-ui/public/index.html'),'utf8');
test('plugin settings render registered albums safely and preserve rows when refresh fails',async()=>{
 const elements={};const make=()=>({children:[],textContent:'',hidden:false,disabled:false,appendChild(child){this.children.push(child)},replaceChildren(){this.children=[]},addEventListener(name,callback){this[name]=callback}});
 for(const id of ['refresh-albums','album-status','album-rows','album-table'])elements[id]=make();
 let fail=false,form=false;const context={document:{getElementById:id=>elements[id],createElement:make},homebridge:{getCachedAccessories:async()=>{if(fail)throw Error('offline');return [{context:{album:'Vietnam'},displayName:'Vietnam switch'},{context:{album:'<Japan>'},displayName:'Japan switch'},{context:{}}]},showSchemaForm(){form=true},fixScrollHeight(){}}};
 vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(form,true);assert.equal(elements['album-rows'].children.length,2);assert.equal(elements['album-rows'].children[0].children[0].textContent,'<Japan>');assert.match(elements['album-status'].textContent,/2 album switches/);
 fail=true;await elements['refresh-albums'].click();assert.equal(elements['album-rows'].children.length,2);assert.match(elements['album-status'].textContent,/offline/);assert.equal(elements['refresh-albums'].disabled,false);
 context.homebridge.getCachedAccessories=async()=>[];await elements['refresh-albums'].click();assert.equal(elements['album-table'].hidden,true);assert.match(elements['album-status'].textContent,/No album switches/);
});
