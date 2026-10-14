'use strict';
// HaxBall-equivalent extrapolation: verified against the engine's own 60 Hz tick (state.nM(1)).
const assert=require('node:assert/strict'),fs=require('node:fs'),{HBInit}=require('../headless/runtime.cjs'),T=require('../dist/render-timing.js');
const bff=fs.readFileSync('dist/stadiums/bff-big-v4.hbs','utf8');
function setup(){const r=HBInit({noPlayer:true});r.setCustomStadium(bff);r.addPlayer(1,'Player',1);r.startGame();r.step(2);
 // Player runs right into a ball moving left: a real contact happens within ~10 ticks.
 r.setPlayerDiscProperties(1,{x:-60,y:0,xspeed:1,yspeed:0});r.setDiscProperties(0,{x:0,y:0,xspeed:-3,yspeed:0});r.setPlayerInput(1,8);return r;}
const positions=s=>s.gameState.physicsState.discs.map(d=>[d.pos.x,d.pos.y]);
const close=(a,b,msg)=>{assert.equal(a.length,b.length);a.forEach((v,i)=>assert(Math.abs(v[0]-b[i][0])<1e-9&&Math.abs(v[1]-b[i][1])<1e-9,msg+' disc '+i+': '+v+' vs '+b[i]));};
const ticks=(state,n,events=[])=>{const c=state.copy();for(let f=0;f<n;f++){for(const e of events)if(e.frame===f)c.Go(e.id,e.input);c.nM(1);}return c;};
const r=setup();try{
 const state=r._room.state,before=JSON.stringify(positions(state));
 // 1. Whole frames: identical positions to really ticking the engine, including through the contact.
 let contact=false;
 for(let n=1;n<=24;n++){const pred=positions(T.extrapolate(state,n)),truth=positions(ticks(state,n));close(pred,truth,'frame '+n+' matches engine ticks');if(n>1&&truth[0][0]>positions(ticks(state,n-1))[0][0])contact=true;}
 assert(contact,'scenario includes a real ball/player contact');
 // 2. Not a single big Euler step (the previous implementation): 20 frames differ greatly from dt=20.
 const bigStep=state.copy();bigStep.nM(20);assert(Math.abs(positions(bigStep)[0][0]-positions(T.extrapolate(state,20))[0][0])>10);
 // 3. Fractional frame = whole ticks + ONE partial tick (HaxBall j1), so 240 Hz frames move between ticks.
 const p2=positions(T.extrapolate(state,2))[0][0],p25=positions(T.extrapolate(state,2.5))[0][0],p3=positions(T.extrapolate(state,3))[0][0];
 assert(Math.abs(p25-(p2+p3)/2)<1e-9,'half tick is half of the next tick displacement');
 const seq=[0,.25,.5,.75,1].map(f=>positions(T.extrapolate(state,4+f))[0][0]);for(let i=1;i<seq.length;i++)assert(seq[i]<seq[i-1],'ball keeps moving at sub-tick frames');
 // 4. Own input replayed at its stamped frame, like HaxBall's pending local events.
 const ev=[{frame:3,id:1,input:4}];close(positions(T.extrapolate(state,8,ev,0)),positions(ticks(state,8,ev)),'own input applied at its frame');
 // 5. Cap, zero and isolation.
 assert.equal(T.extrapolate(state,0),state);assert.deepEqual(positions(T.extrapolate(state,500)),positions(T.extrapolate(state,120)),'capped at 120 frames');
 assert.equal(JSON.stringify(positions(state)),before,'prediction never mutates the authoritative state');
 // 6. Local/host timing: (now - roomStart + extrapolation)*0.06 - currentFrame.
 assert(Math.abs(T.localFrames({now:1000+8.3333,roomStart:1000,currentFrame:0})-.5)<1e-3);
 assert(Math.abs(T.localFrames({now:2000,roomStart:1000,currentFrame:60,extrapolation:100})-6)<1e-9);
 assert.equal(T.localFrames({now:2000,roomStart:1000,currentFrame:60,extrapolation:-200}),0);
 // 7. Clock estimator: weighted 50th percentile with 0.97 decay favours recent samples.
 const clock=T.createClock();for(let i=0;i<50;i++)clock.add(0);for(let i=0;i<25;i++)clock.add(10);assert.equal(clock.percentile(.5),10);
 const c2=T.createClock();[3,1,2].forEach(v=>c2.add(v));assert.equal(c2.percentile(.5),2);
 // 8. Guest predictor: ping clock drives the target frame; acknowledged inputs are dropped.
 const p=T.createPredictor();p.snapshot(600,10000,0);assert(Math.abs(p.frames(10000))<1e-9,'snapshot clock alone renders at snapshot time');
 p.pong(612,10000-200);// host was at frame 612 when answering a ping sent 200 ms ago
 assert(Math.abs(p.frames(10000)-24)<1e-9,'ping clock leads by time since the ping (HaxBall cW)');
 assert(Math.abs(p.frames(10000,100)-30)<1e-9,'user extrapolation adds on top');
 p.input(1,1,8,10000);p.input(2,1,0,10050);assert.equal(p.pending.length,2);assert.equal(p.pending[0].frame,624);
 p.snapshot(615,10060,1);assert.equal(p.pending.length,1,'acknowledged inputs removed');
 console.log('PASS HaxBall extrapolation: exact engine ticks through contacts, fractional final tick, own-input replay, 120-frame cap, isolation, weighted-median clock and guest timing');
}finally{r.destroy();}
