'use strict';
// Netcode v3: input timeline, lead control, smoothing, host election, real server negotiation and a
// short network simulation against the classic netcode (docs/netcode-plan.md).
const assert=require('node:assert/strict'),N=require('../dist/netcode.js'),T=require('../dist/render-timing.js'),{createServer}=require('../headless/server.cjs'),{simulate}=require('../scripts/netsim.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));

// 1. Input timeline: exact frames, redundancy, late inputs, taps never merged.
{const t=N.createInputTimeline();
 assert.equal(t.receive([[1,10,8],[2,12,0]],5,5.2),2);assert.equal(t.receive([[1,10,8],[2,12,0]],5,5.3),0,'redundant resends are ignored');
 assert.equal(t.valueAt(9),0);assert.equal(t.valueAt(10),8);assert.equal(t.appliedSeq,1);assert.equal(t.valueAt(11),8);assert.equal(t.valueAt(12),0);
 assert(Math.abs(t.takeSlack()-4.8)<1e-9,'slack = stamped frame − host time (lowest since last report)');assert(Number.isNaN(t.takeSlack()));
 // A burst that arrives late (e.g. after a TCP stall) is replayed in order, one change per frame.
 t.receive([[3,20,16],[4,21,0],[5,22,16],[6,23,0]],30,30.5);assert.equal(t.late,4);
 const seen=[];for(let f=30;f<36;f++)seen.push(t.valueAt(f));assert.deepEqual(seen,[16,0,16,0,0,0],'both late taps are simulated');
 // A kick released in the frame it was pressed is held for that frame.
 const u=N.createInputTimeline();u.receive([[1,40,16],[2,40,0]],39,39);assert.equal(u.valueAt(40),16);assert.equal(u.valueAt(41),0);
 // Invalid entries and far-future stamps.
 const v=N.createInputTimeline();assert.equal(v.receive([[1,5,99],[2,'x',1],null,[3,1e9,4]],0,0),1);assert.equal(v.valueAt(60),4,'far-future stamps are clamped');}

// 2. Predictor stamping (v3): monotonic, kick taps survive, unacked resend list.
{const p=T.createPredictor();p.stamped=true;p.pong(100,0);
 const a=p.input(1,1,16,0),b=p.input(2,1,0,0);assert.equal(b,a+1,'release in the press frame moves to the next frame');
 p.lead=-5;assert(p.input(3,1,4,0)>=b,'stamps never go backwards');assert.deepEqual(p.unacked().map(e=>e[0]),[1,2,3]);
 p.snapshot(a,0,2);assert.deepEqual(p.unacked().map(e=>e[0]),[3],'acknowledged inputs are dropped');}

// 3. Lead controller: converges to the margin, reacts to late inputs, ignores one-off outliers.
{const c=N.createLeadController({initial:1.5});let now=0;
 for(let i=0;i<600;i++){now+=16.7;c.feed(c.lead-0.4,now);c.update(now);}assert(Math.abs(c.lead-1)<.3,'converges: lead '+c.lead);
 for(let i=0;i<300;i++){now+=16.7;c.feed(c.lead-3.2,now);c.update(now);}assert(c.lead>3.4&&c.lead<4.2,'more jitter → more lead: '+c.lead);
 const before=c.lead;c.feed(-40,now);now+=16.7;c.update(now);assert(c.lead-before<.1,'one outlier only nudges the clock (≤5 % speed)');}

// 4. Smoother: offsets decay, big jumps snap, the authoritative state is never touched.
{const disc=(x,y)=>({pos:{x,y}}),state=(...d)=>({players:[],gameState:{physicsState:{discs:d}}});
 const s=N.createSmoother({ball:45,snap:90});s.correct(state(disc(10,0)),state(disc(0,0)));
 const r1=state(disc(0,0));s.apply(r1,0);assert.equal(r1.gameState.physicsState.discs[0].pos.x,10,'first frame shows the old position');
 const r2=state(disc(0,0));s.apply(r2,45);assert(Math.abs(r2.gameState.physicsState.discs[0].pos.x-10/Math.E)<1e-9,'exponential decay');
 const r3=state(disc(0,0));s.apply(r3,400);assert(r3.gameState.physicsState.discs[0].pos.x<.05);assert(!s.active);
 s.correct(state(disc(500,0)),state(disc(0,0)));assert(!s.active,'kickoff resets snap instead of sliding across the pitch');}

// 5. Host election: lowest worst ping, hysteresis, immediate failover.
{const rtt={a:{b:200,c:240,s:110},b:{a:200,c:60,s:120},c:{a:240,b:60,s:130},s:{a:110,b:120,c:130}};const players=['a','b','c'];
 assert.equal(N.hostCost(rtt,'a',players),220+120,'a: worst pair b↔c through a = 220, horizon 240/2');assert.equal(N.hostCost(rtt,'s',players),125+65);
 const e=N.createElection({hold:5000});assert.equal(e.decide({rtt,players,candidates:['a','b','c','s'],current:'a',now:0}).switch,false,'waits before switching');
 const d=e.decide({rtt,players,candidates:['a','b','c','s'],current:'a',now:6000});assert.equal(d.switch,true);assert.equal(d.host,'s','a server in the middle beats any player at home');
 assert.equal(e.decide({rtt,players,candidates:['a','b','c'],current:'s',now:6100}).host,'b','failover when the host disappears');
 const e2=N.createElection();assert.equal(e2.decide({rtt:{a:{b:100},b:{a:100}},players:['a','b'],candidates:['a','b'],current:'a',now:0}).switch,false,'equal cost never flips');}

(async()=>{
 // 6. Real server: v3 negotiation, frame-stamped inputs move the player, classic clients still work, FUCKBALL_NETCODE=classic.
 async function session(app,netcode,create=true,room=''){const a=await app.listen(0).catch(()=>null)||app.address;const ws=new WebSocket('ws://127.0.0.1:'+a.port+'/ws');ws.binaryType='arraybuffer';const msgs=[],snaps=[];ws.onmessage=e=>{if(e.data instanceof ArrayBuffer)snaps.push(e.data);else msgs.push(JSON.parse(e.data));};await new Promise(r=>ws.onopen=r);ws.send(JSON.stringify({type:'join',create,room,name:'T',netcode}));for(let i=0;i<100&&!msgs.some(m=>m.type==='welcome');i++)await wait(10);return{ws,msgs,snaps,welcome:msgs.find(m=>m.type==='welcome')};}
 const app=createServer(),addr=await app.listen(0);app.address=addr;
 try{
  const v=await session(app,3);assert.equal(v.welcome.netcode,3);v.ws.send(JSON.stringify({type:'start'}));await wait(150);
  const last=()=>new DataView(v.snaps.at(-1));assert.equal(last().getUint32(0),0x46423203,'v3 snapshot header');
  const frame=last().getUint32(12),r=app.rooms.get(v.welcome.room),me=()=>r.hb.getPlayer(v.welcome.id).position.x,x0=me();
  v.ws.send(JSON.stringify({type:'in',c:[[1,frame+12,8]]}));await wait(120);
  const early=me();await wait(250);assert(me()>early+5,'stamped input applied once its frame came');assert(Math.abs(early-x0)<1,'not before its frame');
  assert.equal(new DataView(v.snaps.at(-1)).getUint32(8),1,'ack = applied input seq');
  const c=await session(app,2,false,v.welcome.room);assert.equal(c.welcome.netcode,2);await wait(120);assert.equal(new DataView(c.snaps.at(-1)).getUint32(0),0x46423201,'classic client keeps the classic header');
  c.ws.send(JSON.stringify({type:'input',value:4,seq:1}));const cx=r.hb.getPlayer(c.welcome.id).position.x;await wait(200);assert(r.hb.getPlayer(c.welcome.id).position.x<cx-5,'classic input still works');
  v.ws.close();c.ws.close();
 }finally{await app.close();}
 const off=createServer({netcode:'classic'}),offAddr=await off.listen(0);off.address=offAddr;
 try{const s=await session(off,3);assert.equal(s.welcome.netcode,2,'server switch falls back to classic');s.ws.close();}finally{await off.close();}

 // 7. Network simulation, EU–South America (200 ms, ±15 ms, 0.5 % loss): v3 keeps every tap and renders far smoother.
 const classic=simulate({profile:'eu-sa',mode:'classic',transport:'tcp',seconds:15}),v3=simulate({profile:'eu-sa',mode:'v3',transport:'udp',seconds:15}),v3tcp=simulate({profile:'eu-sa',mode:'v3',transport:'tcp',seconds:15});
 assert.equal(v3.hostTaps,v3.taps,'v3/udp: no kick tap lost');assert.equal(v3tcp.hostTaps,v3tcp.taps,'v3/tcp: no kick tap lost');assert(classic.hostTaps<classic.taps,'classic loses one-frame taps (baseline check)');
 assert(v3.ballJerk.p99<classic.ballJerk.p99/2,'ball renders smoother: '+v3.ballJerk.p99+' vs '+classic.ballJerk.p99);
 assert(v3.ownCorrection.p50===0,'own player normally never corrected');
 console.log('PASS netcode v3: frame-stamped input timeline, late bursts and taps, lead control, smoothing, host election, server negotiation/classic fallback and EU–SA simulation (taps '+v3.hostTaps+'/'+v3.taps+' vs classic '+classic.hostTaps+'/'+classic.taps+', ball jerk p99 '+v3.ballJerk.p99.toFixed(2)+' vs '+classic.ballJerk.p99.toFixed(2)+')');
})().catch(e=>{console.error(e);process.exit(1);});
