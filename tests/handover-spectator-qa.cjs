'use strict';
// A host migration must not resurrect bench members, lose their future inputs,
// reset match phases or silently change a 4v4 Custom Room's owner.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {HBInit}=require('../headless/runtime.cjs');
const RC=require('../dist/room-core.js');
const AI=require('../dist/ai/policy.js');
const Netcode=require('../dist/netcode.js');
const bff=fs.readFileSync('dist/stadiums/bff-big-v4.hbs','utf8');
const newRoom=()=>{
  const hb=HBInit({noPlayer:true});
  hb.setCustomStadium(bff);
  return RC.createRoomCore({hb,id:'HANDOVER',AI,Netcode,send:()=>{}});
};
function teams(r){
  return r.hb.getPlayerList().filter(p=>p.id<=12)
    .map(p=>[p.id,p.team]).sort((a,b)=>a[0]-b[0]);
}
function state(r){
  const state=r.hb._room.state;
  return JSON.stringify({
    owner:r.owner,frame:r.frame,tick:r.tick,seq:r.seq,started:r.started,
    paused:r.paused,mode:r.mode,teams:teams(r),
    players:state.players.map(p=>[p.id,p.team.id,p.input,
      p.disc?[p.disc.pos.x,p.disc.pos.y,p.disc.speed.x,p.disc.speed.y]:null]),
    scores:r.hb.getScores(),
    pending:[...r.clients].map(([id,c])=>[id,c.timeline?.export()]),
    ball:state.gameState?.physicsState?.discs?.[0]?
      [state.gameState.physicsState.discs[0].pos.x,
       state.gameState.physicsState.discs[0].pos.y,
       state.gameState.physicsState.discs[0].speed.x,
       state.gameState.physicsState.discs[0].speed.y]:null
  });
}
let a=null,b=null;
try{
  a=newRoom();
  for(let id=1;id<=12;id++)a.join(id,{name:'Member '+id,netcode:3});
  a.message(1,{type:'specAll'});
  for(let id=1;id<=8;id++)a.message(1,{type:'team',id,team:id<=4?1:2});
  assert.deepEqual(teams(a).filter(p=>p[1]===0).map(p=>p[0]),
    [9,10,11,12],'four additional humans start on spectator/bench slots');
  a.message(1,{type:'start'});
  for(let i=0;i<30;i++)a.step();
  const base=a.frame;
  a.message(1,{type:'in',c:[[1,base+10,8],[2,base+30,0]]});
  a.message(9,{type:'in',c:[[1,base+12,16],[2,base+33,0]]});
  const wire=JSON.parse(JSON.stringify(RC.encodeState(a.exportState())));
  const hb=HBInit({noPlayer:true});
  b=RC.importRoomCore(RC.decodeState(wire),{hb,AI,Netcode,send:()=>{}});
  assert.equal(state(b),state(a),'decoded host handover preserves complete room');
  assert.equal(b.owner,1);
  assert.equal(b.clients.size,12);
  assert.equal(b.clients.get(9).timeline.pending,2,
    'bench player future inputs survive migration');
  let checked=0;
  for(let tick=0;tick<240;tick++){
    for(const core of [a,b]){
      if(tick===24)core.message(core.owner,{type:'pause',value:true});
      if(tick===34)core.message(core.owner,{type:'pause',value:false});
      if(tick===70){
        core.message(core.owner,{type:'team',id:4,team:0});
        core.message(core.owner,{type:'team',id:9,team:1});
      }
      if(tick===100)core.leave(1);
      if(tick===150){
        core.message(core.owner,{type:'team',id:8,team:0});
        core.message(core.owner,{type:'team',id:10,team:2});
      }
      core.step();
    }
    assert.equal(state(b),state(a),'native handover diverges at post-handover tick '+tick);
    checked++;
  }
  assert.equal(a.owner,2,'owner automatically transfers when first host departs');
  assert.equal(b.owner,2);
  assert.equal(a.clients.size,11);
  assert.deepEqual(teams(a).filter(p=>p[1]===0).map(p=>p[0]),[4,8,11,12],
    'later substitutions preserve four explicit inactive humans');
  assert.equal(teams(a).filter(p=>p[1]===1).length,3,
    'host departure leaves three remaining human red players');
  assert.equal(teams(a).filter(p=>p[1]===2).length,4);
  assert.equal(a.hb.getPlayerList().filter(p=>p.team===1).length,4,
    'native room refills the departed owner with a bot, not a bench player');
  assert.equal(b.hb.getPlayerList().filter(p=>p.team===1).length,4);
  assert.deepEqual(teams(b),teams(a));
  console.log('PASS host migration: 12 members/4 bench, future input, pause/resume, slot transfers and owner failover across '+checked+' deterministic frames');
}finally{
  a?.destroy();
  b?.destroy();
}
