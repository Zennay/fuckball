'use strict';
// A room handed to another engine instance (another host) continues bit for bit: engine state, frame-stamped
// input timelines, room settings, the bots' tactical memory and which players they control all move with it.
// Also: one engine tick per step (the exact runtime clock), and standby exports keep a recording running.
const assert=require('node:assert/strict'),fs=require('node:fs'),RC=require('../dist/room-core.js'),{HBInit}=require('../headless/runtime.cjs'),N=require('../dist/netcode.js'),AI=require('../dist/ai/policy.js');
const bff=fs.readFileSync('dist/stadiums/bff-big-v4.hbs','utf8');
{const hb=HBInit({noPlayer:true});hb.setDefaultStadium('Classic');hb.addPlayer(1,'a',1);hb.startGame();let t=0;hb.onGameTick=()=>t++;for(let i=0;i<50000;i++){const b=t;hb.step(1);assert.equal(t-b,1,'exactly one engine tick per step (step '+i+')');}hb.destroy();}
for(const mode of ['bot','2v2','4v4']){
 const hb=HBInit({noPlayer:true});hb.setCustomStadium(bff);const r=RC.createRoomCore({hb,id:'X',AI,Netcode:N,send:()=>{}});r.join(1,{name:'a',netcode:3});r.join(2,{name:'b',netcode:3});r.message(1,{type:'configure',mode,started:true});
 r.message(2,{type:'in',c:[[1,r.frame+30,4]]});for(let i=0;i<700;i++)r.step();
 if(mode==='4v4'){r.message(1,{type:'record'});for(let i=0;i<20;i++)r.step();assert.equal(r.exportState({final:false}).recording,true);assert(hb._room.isRecording(),'standby copies keep recording');}
 r.message(2,{type:'in',c:[[2,r.frame+20,0]]});
 const moved=RC.decodeState(JSON.parse(JSON.stringify(RC.encodeState(r.exportState())))),hb2=HBInit({noPlayer:true}),r2=RC.importRoomCore(moved,{hb:hb2,AI,Netcode:N,send:()=>{}});
 assert.equal(r2.frame,r.frame);assert.equal(r2.seq,r.seq);assert.equal(r2.tick,r.tick);assert.equal(r2.mode,mode);assert.equal(r2.owner,1);assert.equal(r2.clients.get(2).timeline.pending,1,'pending future input moves with the room');
 const dump=h=>JSON.stringify([h._room.state.players.map(p=>[p.id,p.disc?.pos.x,p.disc?.pos.y,p.input]),h.getBallPosition(),h.getScores()]);
 for(const h of [r,r2])h.message(1,{type:'in',c:[[1,h.frame+2,8],[2,h.frame+40,6],[3,h.frame+90,16],[4,h.frame+91,1]]});
 for(let i=0;i<3600;i++){r.step();r2.step();assert.equal(dump(hb2),dump(hb),mode+': identical '+i+' frames after the handover');}
 hb.destroy();hb2.destroy();}
console.log('PASS handover: one tick per step, and a moved room continues bit for bit for 60 s in 1v1, 2v2 and 4v4 (inputs, settings, bots, recording-safe standby)');
