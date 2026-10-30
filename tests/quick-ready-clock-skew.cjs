'use strict';
// Synthetic browser-wall-clock offsets, real server queue transition and consent.
const assert=require('node:assert/strict');
const Clock=require('../dist/quick-ready-timing.js');
const {createQuickMatch}=require('../headless/quick-match.cjs');
let now=1760000000000,starts=0;
const packets=new Map();
const send=(ws,msg)=>{if(!packets.has(ws))packets.set(ws,[]);packets.get(ws).push(msg);};
const queue=createQuickMatch({clock:()=>now,send,start:()=>starts++});
const ws1={readyState:1},ws2={readyState:1};
queue.join(ws1,'alice','1v1',{matches:0});
queue.join(ws2,'bob','1v1',{matches:0});
const first=packets.get(ws1).find(p=>p.type==='queueReady');
const second=packets.get(ws2).find(p=>p.type==='queueReady');
assert(first&&second,'real server issues two human ready receipts');
assert.equal(first.id,second.id);
assert.equal(first.serverNow,now,'server signs ready offer with its own clock');
assert.equal(first.expiresAt-first.serverNow,15000,'server owns exact 15s window');
for(const skew of [-360000,0,360000]){
 const mono=4400;
 const deadline=Clock.deadline(first.expiresAt,first.serverNow,mono,now+skew);
 assert.equal(Clock.remaining(deadline,mono),15000,'local wall clock never removes valid consent');
 assert.equal(Clock.remaining(deadline,mono+6000),9000,'monotone countdown advances');
 assert.equal(Clock.remaining(deadline,mono+15001),0,'never extends consent after expiry');
 assert.equal(Clock.remaining(deadline,mono+6000),Clock.remaining(deadline,mono+6000),'clock jumps cannot change receipt');
}
queue.respond(ws1,first.id,true);
assert.equal(starts,0,'one human cannot auto-accept for another');
queue.respond(ws2,first.id,true);
assert.equal(starts,1,'both explicit server-authorized human votes start exactly one match');
assert.equal(Clock.remaining(NaN,2000),0,'invalid clock fails closed');
assert.equal(Clock.deadline(now+40000,now,100,now),15100,'unbounded receipt is capped to 15s');
const ws3={readyState:1},ws4={readyState:1};
queue.join(ws3,'clara','1v1',{matches:0});queue.join(ws4,'dan','1v1',{matches:0});
const stale=packets.get(ws3).find(p=>p.type==='queueReady');
now+=15001;
assert.throws(()=>queue.respond(ws3,stale.id,true),/no longer active/);
assert.equal(starts,1,'expired human ready never starts a match');
console.log('PASS authoritative 15s human ready receipt, +/-6min client skew, expiry and two-player consent');
