'use strict';
// Server input scheduling (stamped frames) and visual correction smoothing.
const assert=require('node:assert/strict'),fs=require('node:fs'),{createServer}=require('../headless/server.cjs'),{HBInit}=require('../headless/runtime.cjs'),T=require('../dist/render-timing.js');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<300;i++){const x=fn();if(x)return x;await wait(5);}throw Error('Timed out');}
(async()=>{
 // 1. Smoother: exact offset from before/after predictions, fades out, snaps on big jumps, never touches the source.
 const hb=HBInit({noPlayer:true});hb.setCustomStadium(fs.readFileSync('dist/stadiums/bff-big-v4.hbs','utf8'));hb.addPlayer(1,'P',1);hb.startGame();hb.step(2);
 const state=hb._room.state,ball=s=>s.gameState.physicsState.discs[0].pos;
 const before=T.positions(T.extrapolate(state,1));before[0][0]+=10;
 const sm=T.createSmoother({halfLife:40});sm.correct(before,T.extrapolate(state,1),1000);
 const x0=ball(state).x,shown=sm.apply(state,1000,state);assert.notEqual(shown,state,'source is copied, never shifted');assert.equal(ball(state).x,x0,'confirmed state untouched');
 assert(Math.abs(ball(shown).x-(x0+10))<1e-9,'starts exactly where the old prediction showed the ball');
 assert(Math.abs(ball(sm.apply(T.extrapolate(state,1),1040,state)).x-ball(T.extrapolate(state,1)).x-5)<1e-6,'half the correction left after one half-life');
 assert.equal(sm.apply(T.extrapolate(state,1),2000,state).gameState.physicsState.discs[0].pos.x,ball(T.extrapolate(state,1)).x,'fully faded');assert(!sm.active);
 const jump=T.positions(T.extrapolate(state,1));jump[0][0]+=200;sm.correct(jump,T.extrapolate(state,1),3000);assert(!sm.active,'kickoff-size jumps snap');
 hb.destroy();
 // 2. Predictor stamps are monotonic and returned to the caller.
 const pr=T.createPredictor({lead:.75});pr.snapshot(100,0,0);pr.pong(105,0);const f1=pr.input(1,1,8,0),f2=pr.input(2,1,0,0);assert(f1>=100&&f2>=f1);assert.equal(pr.lead,.75);
 // 3. Server: an early stamped input waits for its frame and is only acked once applied; late input runs at once.
 let frame=0;const app=createServer({onStep:f=>{frame=f;}}),addr=await app.listen(0);
 const ws=new WebSocket('ws://127.0.0.1:'+addr.port+'/ws');ws.binaryType='arraybuffer';const msgs=[],acks=[];ws.onmessage=e=>{if(typeof e.data==='string')msgs.push(JSON.parse(e.data));else acks.push(new DataView(e.data).getUint32(8));};
 try{await new Promise(r=>ws.onopen=r);ws.send(JSON.stringify({type:'join',create:true,name:'T'}));const w=await until(()=>msgs.find(m=>m.type==='welcome'));
  ws.send(JSON.stringify({type:'configure',mode:'bot',started:true,scoreLimit:0,timeLimit:0}));await until(()=>msgs.find(m=>m.type==='status'&&m.started));
  const room=app.rooms.get(w.room),me=()=>room.hb._room.state.players.find(p=>p.id===w.id);
  const at=frame+20;ws.send(JSON.stringify({type:'input',value:8,seq:1,frame:at}));await wait(80);
  assert.equal(me().input,0,'early input waits for its frame');assert(acks.at(-1)<1,'not acknowledged before it ran');
  await until(()=>frame>at+1);assert.equal(me().input,8,'runs at its stamped frame');await until(()=>acks.at(-1)===1);
  ws.send(JSON.stringify({type:'input',value:4,seq:2,frame:frame-30}));await until(()=>me().input===4);
  ws.send(JSON.stringify({type:'input',value:2,seq:3}));await until(()=>me().input===2);
  ws.send(JSON.stringify({type:'input',value:1,seq:4,frame:frame+100000}));await until(()=>me().input===1);
  console.log('PASS stamped inputs wait for their frame and are acked when applied, late/unstamped/absurd stamps run at once; correction smoothing is exact, fades, snaps and never mutates confirmed state');
 }finally{ws.close();await app.close();}
})().catch(e=>{console.error(e);process.exit(1);});
