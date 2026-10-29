#!/usr/bin/env node
/* Network simulator for the online netcode (docs/netcode-plan.md, step 0).
   A real engine host (60 Hz, snapshots at 30 Hz, two bots) and two remote clients with their own engine,
   predictor and clock. Client A has the profile's latency/jitter/loss, client B a good 20 ms line.
   Inputs come from the tactical AI looking at the client's own predicted view, plus one-frame kick taps.
   Transports: 'tcp' (ordered; a lost packet stalls everything behind it until retransmission) or
   'udp' (unordered; lost packets are gone). Modes: 'classic' (inputs applied on arrival, hard
   corrections) and 'v3' (frame-stamped inputs, host input buffer, lead control, smoothing).
   Usage: node scripts/netsim.cjs [seconds] [profile ...] */
'use strict';
const fs=require('node:fs'),path=require('node:path'),{HBInit}=require('../headless/runtime.cjs');
const T=require('../dist/render-timing.js'),N=require('../dist/netcode.js'),AI=require('../dist/ai/policy.js');
const bff=fs.readFileSync(path.join(__dirname,'../dist/stadiums/bff-big-v4.hbs'),'utf8');
const TICK=1000/60;
const PROFILES={
 lan:{rtt:20,jitter:2,loss:0},
 'eu-sa':{rtt:200,jitter:15,loss:.005},
 'eu-asia-wifi':{rtt:250,jitter:35,loss:.02},
};
function rng(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}

/* One direction of a link. send(at, payload) -> schedules delivery into `queue`. */
function link({rtt,jitter,loss},transport,random){
 const oneWay=rtt/2;let lastDelivery=0,n=0;
 const delay=()=>{let d=oneWay+Math.abs((random()+random()+random()-1.5)*jitter*1.4);if(random()<.02)d+=random()*jitter*4;return d;};
 return{send(queue,at,payload){const lost=random()<loss;
  if(transport==='udp'){if(!lost)queue.push({at:at+delay(),n:++n,payload});return;}
  // TCP: retransmission after ~max(200 ms, RTT + 4·jitter); in-order delivery holds back everything behind it.
  let t=at+delay();if(lost)t+=Math.max(200,rtt+4*jitter);t=Math.max(t,lastDelivery);lastDelivery=t;queue.push({at:t,n:++n,payload});}};
}
const stats=values=>{const v=[...values].sort((a,b)=>a-b),q=p=>v.length?v[Math.min(v.length-1,Math.floor(p*(v.length-1)))]:0;return{mean:v.length?v.reduce((a,b)=>a+b,0)/v.length:0,p50:q(.5),p95:q(.95),p99:q(.99),max:v.length?v[v.length-1]:0,n:v.length};};

function simulate({profile='eu-sa',mode='v3',transport='tcp',seconds=30,seed=7}={}){
 const random=rng(seed),netA=typeof profile==='string'?PROFILES[profile]:profile,netB={rtt:20,jitter:2,loss:0},v3=mode==='v3';
 const host=HBInit({noPlayer:true});host.setCustomStadium(bff);host.setScoreLimit(0);host.setTimeLimit(0);
 for(const [id,team]of [[1,1],[2,2],[101,1],[102,2]])host.addPlayer(id,'P'+id,team);host.startGame();
 const hostRoom=host._room,API=host._runtime.API;
 let hostFrame=0,lastStep=0,snapshotSeq=0;const hostTime=t=>hostFrame+(t-lastStep)/TICK;
 const toHost=[],queues=[];
 function makeClient(id,net,clockOffset){
  const c=HBInit({noPlayer:true});c.setCustomStadium(bff);
  const client={id,net,up:link(net,transport,random),down:link(net,transport,random),inbox:[],engine:c,room:c._room,API:c._runtime.API,
   predictor:T.createPredictor(),lead:N.createLeadController(),smoother:N.createSmoother(),offset:clockOffset,
   timeline:N.createInputTimeline(),cutoffSeq:0,hostSeq:0,lastInputSeq:0,received:0,ready:false,seq:0,input:0,tap:0,pingCount:0,
   m:{own:[],ball:[],other:[],ownJerk:[],ballJerk:[],otherJerk:[],taps:0,hostTaps:0,lag:[],lead:[]},render:{own:[],ball:[],other:[]}};
  client.predictor.stamped=v3;queues.push(client.inbox);return client;}
 const A=makeClient(1,netA,12345.6),B=makeClient(2,netB,-777.7),clients=[A,B];
 const local=(c,t)=>t+c.offset;
 function deliverToHost(t,{from,msg}){const c=clients.find(c=>c.id===from);
  if(msg.type==='ping'){c.down.send(c.inbox,t,{type:'pong',t:msg.t,frame:hostTime(t)});return;}
  if(msg.type==='input'){if(c.lastInputSeq<msg.seq){c.lastInputSeq=msg.seq;host.setPlayerInput(c.id,msg.value);}return;}
  if(msg.type==='in')c.timeline.receive(msg.c,hostFrame,hostTime(t));}
 function hostStep(t){
  for(const c of clients)if(v3){const v=c.timeline.valueAt(hostFrame);host.setPlayerInput(c.id,v);}
  for(const c of clients){const now=hostRoom.state.players.find(p=>p.id===c.id)?.input|0,seq=v3?c.timeline.appliedSeq:c.lastInputSeq;if((now&16)&&!(c.prevHostInput&16)&&seq<=c.cutoffSeq)c.m.hostTaps++;c.prevHostInput=now;}
  if(hostFrame%2===0)for(const id of [101,102])host.setPlayerInput(id,AI.tactical(hostRoom.state,id,hostFrame,{difficulty:'hard'}));
  host.step(1);hostFrame++;lastStep=t;
  if(hostFrame%2===0){const bytes=API.Replay.writeAll(Object.assign(new API.Replay.ReplayData(),{roomData:hostRoom.takeSnapshot(),events:[],goalMarkers:[],totalFrames:0,version:3}));snapshotSeq++;
   for(const c of clients)c.down.send(c.inbox,t,{type:'snap',seq:snapshotSeq,frame:hostFrame,ack:v3?c.timeline.appliedSeq:c.lastInputSeq,slack:v3?c.timeline.takeSlack():NaN,bytes:Uint8Array.from(bytes)});}
 }
 function predict(c,now){const s=c.predictor.predict(c.room.state,now,0);return s===c.room.state?s.copy():s;}
 const discOf=(s,id)=>s.players.find(p=>p.id===id)?.disc;
 const pos=d=>d?{x:d.pos.x,y:d.pos.y}:null;
 const dist=(a,b)=>a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;
 function deliverToClient(c,t,msg){const now=local(c,t);
  if(msg.type==='pong'){c.predictor.pong(msg.frame,msg.t);return;}
  if(msg.type!=='snap'||msg.seq<=c.received)return;c.received=msg.seq;
  const before=c.ready?predict(c,now):null;
  const data=c.API.Replay.readAll(msg.bytes);c.room.useSnapshot(data.roomData);c.room.setSimulationSpeed(0);c.ready=true;
  c.predictor.snapshot(msg.frame,now,msg.ack);if(v3&&c.predictor.pingClock.size>=8)c.lead.feed(msg.slack,now);
  if(before){const after=predict(c,now),other=clients.find(o=>o!==c).id;
   c.m.own.push(dist(pos(discOf(before,c.id)),pos(discOf(after,c.id))));c.m.ball.push(dist(pos(before.gameState.physicsState.discs[0]),pos(after.gameState.physicsState.discs[0])));c.m.other.push(dist(pos(discOf(before,other)),pos(discOf(after,other))));
   if(v3)c.smoother.correct(before,after);}
 }
 function clientFrame(c,t,frameNo,end){if(!c.ready)return;const now=local(c,t);
  if(v3){c.predictor.lead=c.lead.update(now);c.m.lead.push(c.predictor.lead);}
  const s=predict(c,now);if(v3)c.smoother.apply(s,now,c.id);
  const other=clients.find(o=>o!==c).id;
  for(const [key,p] of [['own',pos(discOf(s,c.id))],['ball',pos(s.gameState.physicsState.discs[0])],['other',pos(discOf(s,other))]]){const h=c.render[key];h.push(p);if(h.length>3)h.shift();
   if(h.length===3&&h.every(Boolean))c.m[key+'Jerk'].push(Math.hypot(h[2].x-2*h[1].x+h[0].x,h[2].y-2*h[1].y+h[0].y));}
  // Input: the AI plays on what this client sees, plus a one-frame kick tap every ~half second.
  // Like a human: mostly sensible play, sometimes a sudden run in a random direction, and short kick taps.
  let input=c.input;if(frameNo%2===0)input=AI.tactical(s,c.id,frameNo,{difficulty:'hard'});
  if(frameNo%90===0)c.dash={until:frameNo+12+Math.floor(random()*18),dir:[1,2,4,8,5,6,9,10][Math.floor(random()*8)]};
  if(c.dash&&frameNo<c.dash.until)input=c.dash.dir|(input&16);
  if(c.tap===2){c.tap=0;input&=15;}else if(frameNo%31===0){input|=16;c.tap=2;}
  if(input!==c.input){const counted=t<end-1500;if((input&16)&&!(c.input&16)&&counted)c.m.taps++;c.input=input;const seq=++c.seq;if(counted)c.cutoffSeq=seq;const frame=c.predictor.input(seq,c.id,input,now);
   if(v3)c.up.send(toHost,t,{from:c.id,msg:{type:'in',c:transport==='udp'?c.predictor.unacked(16):[[seq,frame,input]]}});else c.up.send(toHost,t,{from:c.id,msg:{type:'input',value:input,seq}});}
  else if(v3&&transport==='udp'&&c.predictor.pending.length)c.up.send(toHost,t,{from:c.id,msg:{type:'in',c:c.predictor.unacked(16)}});
 }
 const end=seconds*1000;let nextStep=TICK;const nextFrame=new Map(clients.map((c,i)=>[c,TICK*(.37+.29*i)])),frameNos=new Map(clients.map(c=>[c,0])),nextPing=new Map(clients.map(c=>[c,0]));
 for(let t=0;t<=end;t+=.5){
  {const due=toHost.filter(m=>m.at<=t).sort((a,b)=>a.at-b.at||a.n-b.n);if(due.length){toHost.splice(0,toHost.length,...toHost.filter(m=>m.at>t));for(const m of due)deliverToHost(m.at,m.payload);}}
  for(const c of clients){const due=c.inbox.filter(m=>m.at<=t).sort((a,b)=>a.at-b.at||a.n-b.n);if(due.length){c.inbox.splice(0,c.inbox.length,...c.inbox.filter(m=>m.at>t));for(const m of due)deliverToClient(c,m.at,m.payload);}}
  while(t>=nextStep){hostStep(nextStep);nextStep+=TICK;}
  for(const c of clients){if(t>=nextPing.get(c)){c.up.send(toHost,t,{from:c.id,msg:{type:'ping',t:local(c,t)}});nextPing.set(c,t+(++c.pingCount<8?60:1000));}
   if(t>=nextFrame.get(c)){const n=frameNos.get(c)+1;frameNos.set(c,n);clientFrame(c,t,n,end);nextFrame.set(c,nextFrame.get(c)+TICK);}}
 }
 const out={};for(const c of [A]){const m=c.m;out.ownCorrection=stats(m.own);out.ballCorrection=stats(m.ball);out.otherCorrection=stats(m.other);out.ownJerk=stats(m.ownJerk);out.ballJerk=stats(m.ballJerk);out.otherJerk=stats(m.otherJerk);
  out.taps=m.taps;out.hostTaps=m.hostTaps;out.lateInputs=v3?c.timeline.late:null;out.inputs=c.seq;out.lead=v3?stats(m.lead):null;}
 host.destroy();for(const c of clients)c.engine.destroy();return out;
}
module.exports={simulate,PROFILES};
if(require.main===module){
 const args=process.argv.slice(2),seconds=Number(args[0])||30,profiles=args.slice(1).length?args.slice(1):Object.keys(PROFILES);
 const f=v=>v.toFixed(2).padStart(7);
 console.log('Client A on the profile, client B on 20 ms. Distances in stadium units (player radius 15, ball 5.8).');
 console.log('correction = jump in the predicted position when a snapshot arrives; jerk = rendered 2nd difference per frame (p99/max).');
 for(const profile of profiles){console.log('\n== '+profile+' '+JSON.stringify(PROFILES[profile]));
  console.log('mode         own corr p95/max   ball corr p95/max   other corr p95/max   own jerk p99/max   ball jerk p99/max   other jerk p99/max   taps host/sent  late');
  for(const [mode,transport]of [['classic','tcp'],['v3','tcp'],['v3','udp']]){const r=simulate({profile,mode,transport,seconds});
   console.log((mode+'/'+transport).padEnd(12),f(r.ownCorrection.p95),f(r.ownCorrection.max),' ',f(r.ballCorrection.p95),f(r.ballCorrection.max),' ',f(r.otherCorrection.p95),f(r.otherCorrection.max),'  ',f(r.ownJerk.p99),f(r.ownJerk.max),' ',f(r.ballJerk.p99),f(r.ballJerk.max),' ',f(r.otherJerk.p99),f(r.otherJerk.max),'  ',String(r.hostTaps+'/'+r.taps).padStart(9),' ',r.lateInputs==null?'  -':String(r.lateInputs+'/'+r.inputs));}}
}
