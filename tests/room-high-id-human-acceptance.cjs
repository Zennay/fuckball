'use strict';
// RED acceptance for large persistent lobbies: player IDs above 100 are not
// bot identities. Native handover must restore aiControlled using botIds,
// never by guessing from the numeric ID. Product fix belongs to #31 owner.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {HBInit}=require('../headless/runtime.cjs');
const RC=require('../dist/room-core.js');
const Netcode=require('../dist/netcode.js');
const AI=require('../dist/ai/policy.js');
const bff=fs.readFileSync('dist/stadiums/bff-big-v4.hbs','utf8');
function fresh(){
  const hb=HBInit({noPlayer:true});
  hb.setCustomStadium(bff);
  return RC.createRoomCore({hb,id:'HIGH-ID-HUMAN',AI,Netcode,send:()=>{}});
}
let original=null,resumed=null;
try{
  original=fresh();
  original.join(1,{name:'Owner',netcode:3});
  // IDs 100+ are already used for bots in older rooms. At 100 connected
  // humans, the server's monotonically allocated human ID legitimately
  // crosses this range; use one high ID directly for a small fast fixture.
  const humanId=200;
  original.join(humanId,{name:'Actual human 200',netcode:3});
  assert(original.clients.has(humanId),'real human connection is admitted');
  assert(!original.botIds.has(humanId),'human is not in the explicit bot list');
  const before=original.hb._room.state.players.find(p=>p.id===humanId);
  assert(before&&before.disc,'high-ID human has native player disc');
  assert.equal(before.aiControlled,false,'before migration human is not AI');
  const state=RC.decodeState(JSON.parse(JSON.stringify(
    RC.encodeState(original.exportState()))));
  const hb2=HBInit({noPlayer:true});
  resumed=RC.importRoomCore(state,{hb:hb2,AI,Netcode,send:()=>{}});
  assert(resumed.clients.has(humanId),'host migration retained human socket identity');
  assert(!resumed.botIds.has(humanId),'host migration retained explicit bot membership');
  const restored=resumed.hb._room.state.players.find(p=>p.id===humanId);
  assert(restored&&restored.disc,'high-ID player survived native snapshot');
  assert.equal(restored.team.id,before.team.id,'human kept assigned team');
  assert.equal(restored.aiControlled,false,
    'high-ID human must not become bot/AI-controlled after host migration');
  for(const p of resumed.hb._room.state.players){
    assert.equal(p.aiControlled,resumed.botIds.has(p.id),
      'AI control strictly follows explicit botIds, never numeric ID '+p.id);
  }
  console.log('PASS high-ID human handover: ID '+humanId+
    ' retains actual-human identity, native team, connection and explicit bot flags');
}finally{
  original?.destroy();
  resumed?.destroy();
}
