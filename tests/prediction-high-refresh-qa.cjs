'use strict';
// #28 post-fix high-refresh *microbenchmark* and correctness contract.
// This exercises native BFF snapshot copies 60/144/240/500 times per second,
// not a Chromium frame-rate benchmark; wall times are diagnostics, never a
// CI hardware-dependent FPS guarantee.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {HBInit}=require('../headless/runtime.cjs');
const Render=require('../dist/render-timing.js');
const bff=fs.readFileSync('dist/stadiums/bff-big-v4.hbs','utf8');
const room=HBInit({noPlayer:true});
function redX(state){return state.players.find(p=>p.id===1).disc.pos.x;}
function median(values){const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];}
try{
  room.setCustomStadium(bff);
  for(let id=1;id<=8;id++)room.addPlayer(id,'Player '+id,id<=4?1:2);
  room.setTimeLimit(0);room.setScoreLimit(0);room.startGame();room.step(2);
  room.setDiscProperties(0,{x:0,y:0,xspeed:0,yspeed:0});
  for(let id=1;id<=8;id++)room.setPlayerDiscProperties(id,{
    x:id===1?-100:id<=4?-390+id*20:300+id*20,
    y:id===1?0:(id%2?180:-180),xspeed:0,yspeed:0
  });
  const source=room._room.state,initial=redX(source);
  const physicsBefore=JSON.stringify(room.getDiscProperties(0));
  const original=JSON.stringify({
    players:source.players.map(p=>[p.id,p.disc?.pos.x,p.disc?.pos.y,p.input]),
    ball:room.getDiscProperties(0)
  });
  const predictor=Render.createPredictor();
  predictor.stamped=true;
  predictor.snapshot(100,0,0);
  predictor.input(1,1,8,0); // own unacknowledged rightward movement
  const diagnostics=[];
  let checkCount=0;
  for(const hz of [60,144,240,500]){
    const durations=[],history=[];
    const end=200,interval=1000/hz;
    for(let now=interval;now<=end+1e-8;now+=interval){
      const start=process.hrtime.bigint();
      const predicted=predictor.predict(source,now);
      durations.push(Number(process.hrtime.bigint()-start)/1e6);
      assert.notStrictEqual(predicted,source,'native prediction is an independent copy at '+hz+'Hz');
      assert(Number.isFinite(redX(predicted)),'finite native prediction at '+hz+'Hz');
      assert.equal(redX(source),initial,'prediction cannot move authoritative player');
      history.push({predicted,x:redX(predicted)});
      checkCount+=3;
    }
    assert(history.length>=11,'enough representative high-refresh samples');
    const first=history[0],last=history.at(-1);
    assert(last.x>first.x+.05,'pending input must move predicted own player at '+hz+'Hz');
    const endX=redX(last.predicted);
    // Predict a different timestamp; old objects must not be overwritten by
    // native reusable AE buffers. This was #28's original silent regression.
    predictor.predict(source,200);
    assert.equal(redX(first.predicted),first.x,'first published frame remains immutable');
    assert.equal(redX(last.predicted),endX,'last published frame remains immutable');
    const ordered=[...durations].sort((a,b)=>a-b);
    diagnostics.push({
      refreshHz:hz,samples:durations.length,
      medianPredictionMs:Number(median(durations).toFixed(4)),
      p95PredictionMs:Number(ordered[Math.ceil(.95*ordered.length)-1].toFixed(4))
    });
    checkCount+=4;
  }
  // A confirmed ACK removes only the speculative delta; a previous result
  // must stay fixed and the source must remain identical after both paths.
  const at200=predictor.predict(source,200),withPending=redX(at200);
  predictor.snapshot(100,0,1);
  assert.equal(predictor.pending.length,0,'server acknowledgement prunes own input');
  const idle=predictor.predict(source,200);
  assert(withPending>redX(idle)+.05,'ACK removes speculative motion from new prediction');
  assert.equal(redX(at200),withPending,'ACK cannot retroactively rewrite an old frame');
  assert.equal(JSON.stringify(room.getDiscProperties(0)),physicsBefore,
    'high refresh must not mutate native ball physics');
  assert.equal(JSON.stringify({
    players:source.players.map(p=>[p.id,p.disc?.pos.x,p.disc?.pos.y,p.input]),
    ball:room.getDiscProperties(0)
  }),original,'high refresh must not mutate the source or native player inputs');
  console.log('PASS #28 high-refresh native snapshot isolation: '+checkCount+
    ' checks, pending input, ACK and stable published frames');
  console.log('QA_HIGH_REFRESH_DIAGNOSTICS '+JSON.stringify({
    schema:'fuckball-native-prediction-throughput-v1',
    platform:process.platform,engine:'native BFF 8 players',
    note:'isolated headless prediction timings, NOT browser FPS or a production SLA',
    data:diagnostics
  }));
} finally {room.destroy();}
