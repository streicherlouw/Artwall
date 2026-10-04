"use strict";
const test=require('node:test');const assert=require('node:assert/strict');const {once}=require('node:events');
const {DisplayPower,enabledState}=require('../standalone/display-power');
const {createWebServer}=require('../standalone/web-server');
test('power parser isolates the configured output and rejects missing state',()=>{
 const text='DP-1 "Other"\n  Enabled: yes\nHDMI-A-1 "Screen"\n  Enabled: no\n';
 assert.equal(enabledState(text,'HDMI-A-1'),false);assert.equal(enabledState(text,'DP-1'),true);
 assert.throws(()=>enabledState(text,'HDMI-A-2'));assert.throws(()=>enabledState('HDMI-A-1\nDP-1\n Enabled: yes','HDMI-A-1'));
});
test('power wake persists restoration before turning on and restores only owned power',async()=>{
 const events=[];let on=false;
 const power=new DisplayPower({},async(cmd,args)=>{events.push(args.join(' '));if(!args.length)return{stdout:`HDMI-A-1\n Enabled: ${on?'yes':'no'}\n`};on=args.includes('--on');},value=>events.push(value));
 assert.equal(await power.prepare(),true);assert.deepEqual(events.slice(0,3),['',true,'--output HDMI-A-1 --on --preferred']);
 assert.equal(await power.prepare(),false);assert.equal(power.restoreOff,true);
 await power.restore();assert.equal(on,false);assert.equal(power.restoreOff,false);
 on=true;events.length=0;assert.equal(await power.prepare(),false);await power.restore();assert.deepEqual(events,['']);
});
test('AirPlay release does not turn output off; failures retain recovery ownership',async()=>{
 let fail=false;const calls=[];const power=new DisplayPower({},async(cmd,args)=>{calls.push(args);if(!args.length)return{stdout:'HDMI-A-1\n Enabled: no'};if(fail)throw Error('failed');});
 await power.prepare();await power.restore(true);assert.ok(!calls.some(a=>a.includes('--off')));
 await power.prepare();fail=true;await assert.rejects(power.restore());assert.equal(power.restoreOff,true);
});
test('message web server protects commands and rejects invalid origin and payload',async t=>{
 process.env.SF_TEST_WEB_KEY='test-web-key-long-enough';
 const seen=[];const server=createWebServer({port:0,tokenEnv:'SF_TEST_WEB_KEY'},async message=>{seen.push(message);return{ok:true,state:'active'};});
 t.after(async()=>{delete process.env.SF_TEST_WEB_KEY;await new Promise(r=>server.close(r));});
 await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await fetch(base)).status,200);
 assert.equal((await fetch(base+'/api/status')).status,401);
 const headers={Authorization:'Bearer test-web-key-long-enough','Content-Type':'application/json'};
 const post=(body,extra={})=>fetch(base+'/api/message',{method:'POST',headers:{...headers,...extra},body});
 assert.equal((await post('{')).status,400);
 assert.equal((await post('{}',{Origin:'http://evil.example'})).status,403);
 assert.equal((await post('x'.repeat(17000))).status,413);
 assert.equal((await post('{"type":"expire"}')).status,400);
 const message={type:'message',text:'HELLO',powerOffAfterMs:30000};
 assert.equal((await post(JSON.stringify(message))).status,200);assert.deepEqual(seen,[message]);
 assert.equal((await fetch(base+'/api/status',{headers})).status,200);
});
test('web listener refuses LAN binding without a key',()=>{
 assert.throws(()=>createWebServer({host:'0.0.0.0',tokenEnv:'MISSING_SF_TEST_KEY'},()=>{}),/access key/);
});
