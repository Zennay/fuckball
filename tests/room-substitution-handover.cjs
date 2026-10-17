'use strict';
// #31 native state handover: roles/time survive; pending consent never does.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {HBInit}=require('../headless/runtime.cjs');
const RoomCore=require('../dist/room-core.js');
const AI=require('../dist/ai/policy.js');
const Netcode=require('../dist/netcode.js');

function createEngine(){
  const hb=HBInit({noPlayer:true});
  hb.setCustomStadium(fs.readFileSync('dist/stadiums/bff-big-v4.hbs','utf8'));
  hb.setScoreLimit(0);
  hb.setTimeLimit(0);
  return hb;
}
let original=null,restored=null;
try {
  original=RoomCore.createRoomCore({
    hb:createEngine(),id:'HANDOVER1',AI,Netcode,v3:true,send:()=>{}
  });
  for(let id=1;id<=12;id++)original.join(id,{name:'Human '+id,netcode:3});
  // More than 100 participants legitimately exhaust low-numbered IDs.
  // A high-ID connected human is not AI, even when the same room has bots.
  const highHuman=200;
  original.join(highHuman,{name:'Real human 200',netcode:3});
  assert(original.clients.has(highHuman),'explicit high-ID human was admitted');
  assert(!original.botIds.has(highHuman),'client is not in the bot registry');
  assert.equal(original.hb._room.state.players.find(p=>p.id===highHuman).aiControlled,false,
    'human 200 is not AI on the original host');
  assert.equal(original.hb.getPlayerList().filter(p=>p.team===1).length,4);
  assert.equal(original.hb.getPlayerList().filter(p=>p.team===2).length,4);
  assert.equal(original.hb.getPlayer(9).team,0);
  original.message(1,{type:'bench',id:9,team:1});
  original.message(1,{type:'appointCaptain',team:1,id:3});
  original.message(3,{type:'subRequest',outId:1,inId:9});
  const first=original.pendingSubs.get(1).requestId;
  original.message(9,{type:'subAccept',team:1,outId:1,requestId:first,accept:true});
  assert.equal(original.hb.getPlayer(9).team,1);
  assert.equal(original.hb.getPlayer(1).team,0);
  original.message(1,{type:'start'});
  for(let i=0;i<35;i++)original.step();
  const nineFrames=original.activeFrames.get(9);
  assert.equal(nineFrames,35,'human playing time matches authoritative frames');
  assert.equal(original.activeFrames.get(1)||0,0,'bench must not gain time');
  original.message(1,{type:'pause',value:true});
  for(let i=0;i<20;i++)original.step();
  assert.equal(original.activeFrames.get(9),nineFrames,'pause does not advance playing time');
  // Emulate actual peer-host transport: the room travels as JSON/base64,
  // not only as an in-memory native object reference.
  const frozen=RoomCore.decodeState(JSON.parse(JSON.stringify(
    RoomCore.encodeState(original.exportState({final:false})))));
  assert.equal(frozen.subSeq,first);
  assert.equal(new Map(frozen.captains).get(1),3);
  assert.equal(new Map(frozen.benches).get(1),1);
  assert.equal(new Map(frozen.activeFrames).get(9),nineFrames);

  // Rebuild on a fresh native room, not another reference to the same engine.
  const successorEngine=createEngine();
  const delivered=[];
  restored=RoomCore.importRoomCore(frozen,{hb:successorEngine,AI,Netcode,v3:true,
    send:(id,data)=>{if(data?.type==='playingTime')delivered.push({id,...data});}
  });
  assert.notEqual(restored.hb,original.hb);
  assert.equal(restored.owner,1,'the original host still owns the room');
  assert(restored.clients.has(highHuman),'migration retains high-ID connection');
  assert(!restored.botIds.has(highHuman),'migration does not invent a bot');
  assert.equal(restored.hb._room.state.players.find(p=>p.id===highHuman).aiControlled,false,
    'high-ID real person must not become AI on the new host');
  for(const p of restored.hb._room.state.players)
    assert.equal(p.aiControlled,restored.botIds.has(p.id),
      'native AI membership matches botIds for player '+p.id);
  assert.equal(restored.captains.get(1),3,'authorized captain survives handover');
  assert.equal(restored.benches.get(1),1,'side-specific bench survives handover');
  assert.equal(restored.activeFrames.get(9),nineFrames,'active frames survive handover');
  assert.equal(restored.activeFrames.get(1)||0,0);
  assert.equal(restored.pendingSubs.size,0,'unconfirmed approvals must NOT survive handover');
  assert.equal(restored.subSeq,first,'nonce high-water mark is persisted');
  assert.equal(restored.paused,true);
  assert.equal(restored.started,true);
  assert.throws(()=>restored.message(2,{type:'subRequest',outId:9,inId:1}),
    /captain|host|team/i,'blue participant cannot nominate red substitution');

  restored.message(3,{type:'subRequest',outId:9,inId:1});
  const second=restored.pendingSubs.get(1).requestId;
  assert(second>first,'fresh request after handover has a different nonce');
  assert.throws(()=>restored.message(1,{type:'subAccept',team:1,outId:9,requestId:first,accept:true}),
    /current substitution/i,'delayed pre-handover consent must fail');
  assert.equal(restored.pendingSubs.get(1).accepted,false);
  restored.message(1,{type:'subAccept',team:1,outId:9,requestId:second,accept:true});
  assert.equal(restored.hb.getPlayer(1).team,1);
  assert.equal(restored.hb.getPlayer(9).team,0);
  assert.equal(restored.pendingSubs.size,0);
  assert.equal(restored.captains.get(1),3,'unaffected captain remains appointed');
  const after=restored.activeFrames.get(9);
  restored.message(1,{type:'pause',value:false});
  for(let i=0;i<24;i++)restored.step();
  assert.equal(restored.activeFrames.get(1),24,'incoming human earns only resumed active time');
  assert(delivered.some(event=>event.frame===60&&event.activeFrames.some(([pid,n])=>pid===1&&n>0)),
    'authoritative 1Hz event reports accrued live human frames');
  assert.equal(restored.activeFrames.get(9),after,'benched human stops earning time after handover');
  assert.equal(restored.hb.getPlayerList().filter(p=>p.team===1).length,4);
  assert.equal(restored.hb.getPlayerList().filter(p=>p.team===2).length,4);
  // The restored high-ID spectator must still be allowed to become a real
  // substitute with a normal consent-bearing human WebSocket identity.
  restored.message(1,{type:'pause',value:true});
  restored.message(1,{type:'bench',id:highHuman,team:1});
  restored.message(3,{type:'subRequest',outId:1,inId:highHuman});
  const highRequestId=restored.pendingSubs.get(1).requestId;
  restored.message(highHuman,{type:'subAccept',team:1,outId:1,requestId:highRequestId,accept:true});
  assert.equal(restored.hb.getPlayer(highHuman).team,1);
  assert.equal(restored.hb.getPlayer(1).team,0);
  assert.equal(restored.hb._room.state.players.find(p=>p.id===highHuman).aiControlled,false);
  assert.equal(restored.activeFrames.get(highHuman)||0,0,'no bench time credited to high-ID human');
  restored.message(1,{type:'pause',value:false});
  for(let i=0;i<30;i++)restored.step();
  assert.equal(restored.activeFrames.get(highHuman),30,'newly active high-ID human earns 30 live frames');
  const beforePauseEvents=delivered.length;
  restored.message(1,{type:'pause',value:true});
  for(let i=0;i<25;i++)restored.step(); // cross 120, but never publish fake live minutes
  assert.equal(delivered.length,beforePauseEvents,'a paused room emits no played-time advances');
  assert.equal(restored.activeFrames.get(highHuman),30,'paused frames do not count as played');
  restored.message(1,{type:'pause',value:false});
  for(let i=0;i<48;i++)restored.step(); // cross 180, the next authoritative stats pulse
  assert.equal(restored.activeFrames.get(highHuman),78,'resumed live time is continuous');
  assert(delivered.some(e=>e.frame===180&&e.activeFrames.some(([pid,n])=>pid===highHuman&&n>=76)),
    'later stats pulse carries high-ID human active time after migration');
  assert.equal(restored.hb.getPlayerList().filter(p=>p.team===1).length,4);
  assert.equal(restored.hb.getPlayerList().filter(p=>p.team===2).length,4);
  console.log('PASS #31 native handover preserves captain/bench/playtime and prevents stale consent/overflow');
} finally {
  restored?.destroy();
  original?.destroy();
}
