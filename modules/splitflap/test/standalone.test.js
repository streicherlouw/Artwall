"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Controller } = require("../standalone/controller");
function setup(overrides = {}) {
  const events = [];
  const io = {
    writeState: async phase => { events.push(phase); },
    airplayActive: async () => false,
    prepareHandoff: async () => { events.push("fade"); },
    acquireDisplay: async () => { events.push("stop-mm"); },
    openRenderer: async () => { events.push("open"); },
    closeRenderer: async () => { events.push("close"); },
    releaseDisplay: async () => { events.push("start-mm"); },
    show: async text => { events.push(text); },
    automaticText: () => "NEWS",
    ...overrides
  };
  return { control: new Controller(io), events };
}
test("standalone fades, releases display handoff graphics, persists, updates and restores", async () => {
  const { control, events } = setup();
  await control.dispatch({ type: "activate", text: "FIRST" });
  assert.deepEqual(events, ["fading", "fade", "stop-mm", "open", "animating", "FIRST", "active"]);
  await control.dispatch({ type: "message", text: "SECOND" });
  assert.equal(events.filter(event => event === "open").length, 1);
  assert.equal((await control.dispatch({ type: "status" })).state, "active");
  await control.dispatch({ type: "deactivate" });
  assert.deepEqual(events.slice(-4), ["stopping", "close", "start-mm", "idle"]);
  await control.dispatch({ type: "deactivate" });
  assert.equal(events.filter(event => event === "start-mm").length, 1);
});
test("renderer startup failure restores display handoff and allows a retry", async () => {
  let attempts = 0;
  const { control, events } = setup({ openRenderer: async () => { if (++attempts === 1) throw new Error("GPU unavailable"); } });
  await assert.rejects(control.dispatch({ type: "activate" }), /GPU/);
  assert.equal(control.state, "idle"); assert.ok(events.includes("start-mm"));
  await control.dispatch({ type: "activate" }); assert.equal(control.state, "active");
});
test("renderer crash restores display handoff", async () => {
  const { control, events } = setup();
  await control.dispatch({ type: "activate" });
  await control.dispatch({ type: "renderer-exit" });
  assert.equal(control.state, "idle"); assert.ok(events.includes("start-mm"));
});
test("AirPlay priority prevents stealing or restarting display handoff over a stream", async () => {
  let streaming = true;
  const { control, events } = setup({ airplayActive: async () => streaming });
  await assert.rejects(control.dispatch({ type: "activate" }), /AirPlay/);
  assert.deepEqual(events, []);
  streaming = false; await control.dispatch({ type: "activate" });
  streaming = true; await control.dispatch({ type: "airplay" });
  assert.equal(control.state, "suspended"); assert.ok(!events.includes("start-mm"));
});
test("rapid start-stop commands are serialized and auto mode uses providers", async () => {
  const { control, events } = setup();
  await Promise.all([control.dispatch({ type: "activate", mode: "auto" }), control.dispatch({ type: "deactivate" })]);
  assert.equal(control.state, "idle");
  assert.ok(events.indexOf("NEWS") < events.indexOf("close"));
});
test("invalid commands have no display side effects", async () => {
  const { control, events } = setup();
  for (const message of [null, {}, { type: "message" }, { type: "message", text: "x", duration: 3000 }, { type: "activate", text: "" }, { type: "activate", mode: "bad" }]) await assert.rejects(control.dispatch(message));
  assert.deepEqual(events, []);
});

test("wake waits with blank frame and expires only after settling", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let owns = false; let release;
  const {control,events} = setup({
    prepareDisplay: async () => { owns=true; events.push("wake"); return true; },
    ownsDisplay: () => owns,
    waitForScreen: async () => { events.push("wait-five-seconds"); },
    show: async text => { events.push(text); await new Promise(r => { release=r; }); },
    restoreDisplay: async airplay => { events.push(airplay ? "release-power" : "off"); owns=false; }
  });
  const pending=control.dispatch({type:"message",text:"ALERT",powerOffAfterMs:1000});
  while(!release) await Promise.resolve();
  assert.equal(control.state,"animating");
  assert.ok(events.indexOf("open") < events.indexOf("wait-five-seconds"));
  assert.ok(events.indexOf("wait-five-seconds") < events.indexOf("ALERT"));
  t.mock.timers.tick(5000); assert.equal(control.powerOffAt,null);
  release(); await pending;
  t.mock.timers.tick(999); assert.equal(control.state,"active");
  t.mock.timers.tick(1); await control.tail;
  assert.equal(control.state,"idle"); assert.ok(events.includes("off"));
});
test("already-on display expires timed announcements; a replacement cancels expiry", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  let owns=false;
  const {control}=setup({prepareDisplay:async()=>false,ownsDisplay:()=>owns});
  await control.dispatch({type:"message",text:"ON",powerOffAfterMs:1000});
  assert.ok(control.powerOffAt);
  t.mock.timers.tick(2000); await control.tail; assert.equal(control.state,"idle");
  owns=true;
  await control.dispatch({type:"message",text:"TIMED",powerOffAfterMs:1000});
  await control.dispatch({type:"message",text:"PERSISTENT"});
  t.mock.timers.tick(2000); await control.tail;
  assert.equal(control.state,"active"); assert.equal(control.powerOffAt,null);
});
test("active display switched off is blanked before wake delay", async () => {
  let woke=false;
  const {control,events}=setup({prepareDisplay:async()=>woke,blankDisplay:async()=>events.push("blank"),waitForScreen:async()=>events.push("wait")});
  await control.dispatch({type:"message",text:"OLD"}); woke=true;
  await control.dispatch({type:"message",text:"NEW"});
  assert.ok(events.indexOf("blank")<events.indexOf("wait"));
  assert.ok(events.indexOf("wait")<events.indexOf("NEW"));
});
test("AirPlay pauses timeout and restores the existing renderer; explicit stop cancels return", async t => {
 t.mock.timers.enable({apis:['setTimeout','Date']});let streaming=false;const events=[];
 const {control}=setup({airplayActive:async()=>streaming,suspendRenderer:async()=>events.push('hide'),resumeRenderer:async()=>events.push('show')});
 await control.dispatch({type:'message',text:'ALERT',powerOffAfterMs:1000});
 t.mock.timers.tick(400);streaming=true;await control.dispatch({type:'airplay'});
 assert.equal(control.state,'suspended');assert.equal(control.powerOffAt,null);
 t.mock.timers.tick(10000);await control.tail;assert.equal(control.state,'suspended');
 streaming=false;await control.dispatch({type:'airplay-ended'});assert.equal(control.state,'active');assert.deepEqual(events,['hide','show']);
 t.mock.timers.tick(599);await control.tail;assert.equal(control.state,'active');
 t.mock.timers.tick(1);await control.tail;assert.equal(control.state,'idle');
 await control.dispatch({type:'message',text:'STAY'});streaming=true;await control.dispatch({type:'airplay'});
 await control.dispatch({type:'deactivate'});streaming=false;await control.dispatch({type:'airplay-ended'});assert.equal(control.state,'idle');
});
test("invalid power timeouts are rejected before taking the display", async () => {
  const {control,events}=setup();
  for(const value of [0,-1,999,1.5,"30000",86400001]) await assert.rejects(control.dispatch({type:"message",text:"X",powerOffAfterMs:value}));
  await assert.rejects(control.dispatch({type:"activate",mode:"auto",powerOffAfterMs:1000}));
  assert.deepEqual(events,[]);
});

test("screen restoration still runs if restarting display handoff fails", async () => {
  let restored=false;
  const {control}=setup({releaseDisplay:async()=>{throw new Error("PM2 failed");},restoreDisplay:async()=>{restored=true;}});
  await control.dispatch({type:"message",text:"ALERT"});
  await assert.rejects(control.dispatch({type:"deactivate"}),/PM2 failed/);
  assert.equal(restored,true);
  assert.equal(control.state,"stopping");
});
