'use strict';
// Peer hosting end to end: the real room server, three simulated browsers (the real dist/peer-net.js and
// dist/peer-host.js, fake WebRTC channels with latency, the host "worker" in-process with its own engine
// realm). The room moves server → A → B, then B vanishes and the server takes over. Every client must keep
// getting snapshots with increasing frames, keep control of its own player, and see no jump at a handover.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createServer}=require('../headless/server.cjs'),{HBInit}=require('../headless/runtime.cjs');
const T=require('../dist/render-timing.js'),N=require('../dist/netcode.js'),RoomCore=require('../dist/room-core.js'),Headless=require('../dist/headless-room.js'),{createPeerNet}=require('../dist/peer-net.js'),{createPeerHost}=require('../dist/peer-host.js'),AI=require('../dist/ai/policy.js');
const wait=ms=>new Promise(r=>setTimeout(r,ms)),XE=.06,abs=()=>performance.timeOrigin+performance.now();
const SERVER_DELAY=40,PEER_DELAY=10; // one-way ms: server 80 ms RTT, peers 20 ms RTT

/* ---- one fresh engine realm per host worker, like a real Worker ---- */
const vendor=['json5.min.js','pako-jszip.min.js','haxball.js'].map(f=>fs.readFileSync(path.join(__dirname,'../dist/vendor',f),'utf8'));
function factory(w){const ctx=vm.createContext({console,crypto:require('node:crypto').webcrypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,setTimeout,clearTimeout,setInterval,clearInterval});ctx.window=ctx;for(const src of vendor)vm.runInContext(src,ctx);w.JSON5=ctx.JSON5;w.pako=ctx.pako;w.JSZip=ctx.JSZip;return ctx.abcHaxballAPI(w);}
function fakeWorker(){const w={onmessage:null,dead:false};const host=createPeerHost({Headless,RoomCore,Netcode:N,AI,factory,globals:{console,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,setInterval,clearInterval,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView},now:abs,
  post:ev=>{if(!w.dead)setImmediate(()=>!w.dead&&w.onmessage?.({data:ev}));}});
 const timer=setInterval(()=>{if(host.hosting)host.catchUp();},4);w.host=host;w.postMessage=m=>{if(!w.dead)setImmediate(()=>!w.dead&&host.handle(structuredClone(m)));};w.terminate=()=>{w.dead=true;clearInterval(timer);host.handle({cmd:'stop'});};return w;}

/* ---- fake WebRTC: offer/answer link two in-process channels with a fixed one-way delay ---- */
const pcs=new Map();let pcSeq=0;
function fakeChannel(){return{readyState:'connecting',bufferedAmount:0,onmessage:null,peer:null,send(data){const to=this.peer;if(!to||this.readyState!=='open')return;const copy=data instanceof ArrayBuffer?data.slice(0):data;setTimeout(()=>{if(to.readyState==='open')to.onmessage?.({data:copy});},PEER_DELAY);},close(){this.readyState='closed';if(this.peer)this.peer.readyState='closed';this.onclose?.();}};}
function fakePC(owner){return()=>{const pc={id:++pcSeq,owner,connectionState:'new',createDataChannel(){pc.local=fakeChannel();return pc.local;},async createOffer(){return{type:'offer',sdp:pc.id+':'+owner};},async createAnswer(){return{type:'answer',sdp:pc.id+':'+owner};},async setLocalDescription(d){pc.localDescription=d;pcs.set(pc.id,pc);},
  async setRemoteDescription(d){pc.remoteDescription=d;if(d.type==='answer'){const other=pcs.get(Number(d.sdp.split(':')[0]));const ch=fakeChannel();pc.local.peer=ch;ch.peer=pc.local;setTimeout(()=>{pc.local.readyState=ch.readyState='open';other.ondatachannel?.({channel:ch});pc.local.onopen?.();},PEER_DELAY);}},
  async addIceCandidate(){},close(){pc.local?.close();}};return pc;};}

/* ---- a simulated browser: online guest + peer hosting ---- */
function client(port,name,{create=false,room=''}={}){
 const c={name,id:null,snaps:[],corrections:[],authorityLog:[],input:0,seq:0,predictor:T.createPredictor(),lead:N.createLeadController(),decoder:HBInit({noPlayer:true}),dead:false};c.predictor.stamped=true;
 const ws=new WebSocket('ws://127.0.0.1:'+port+'/ws');ws.binaryType='arraybuffer';c.ws=ws;
 const toServer=data=>{if(c.dead)return;setTimeout(()=>{if(ws.readyState===1)ws.send(data);},SERVER_DELAY);};
 const sendServer=d=>toServer(JSON.stringify(d));
 const own=s=>s.players.find(p=>p.id===c.id)?.disc;
 function predictOwn(t){const s=c.predictor.predict(c.decoder._room.state,t,0);const d=own(s);return d?{x:d.pos.x,y:d.pos.y}:null;}
 function deliverSnapshot(buf){if(c.dead)return;const v=new DataView(buf),t=performance.now();if(v.getUint32(0)!==0x46423203)return;const seq=v.getUint32(4);if(seq<=(c.lastSeq||0))return;c.lastSeq=seq;const frame=v.getUint32(12),raw=v.getInt32(16);
  const before=c.ready?predictOwn(t):null;c.decoder._room.useSnapshot(c.decoder._runtime.API.Replay.readAll(new Uint8Array(buf.slice(20))).roomData);c.ready=true;c.predictor.snapshot(frame,t,v.getUint32(8));if(raw!==-2147483648&&c.predictor.pingClock.size>=8)c.lead.feed(raw/1000,t);
  const after=predictOwn(t);if(before&&after)c.corrections.push({t,d:Math.hypot(before.x-after.x,before.y-after.y),authority:c.net?.authority});
  c.snaps.push({t,frame,seq,authority:c.net?c.net.authority:'server',x:c.decoder._room.state.players.find(p=>p.id===c.id)?.disc?.pos.x});}
 function deliverJson(d){if(d.type==='pong'&&Number.isFinite(d.frame))c.predictor.pong(d.frame,d.t);if(d.type==='welcome'){c.id=d.id;c.room=d.room;c.welcome=d;}if(d.type==='error')c.error=d.message;}
 ws.onmessage=e=>setTimeout(()=>{if(c.dead)return;if(e.data instanceof ArrayBuffer){if(c.net)c.net.serverBinary(e.data);else deliverSnapshot(e.data);return;}const d=JSON.parse(e.data);
  if(d.type==='peering'&&!c.net){c.net=createPeerNet({selfId:c.id,sendServer,sendServerBinary:u8=>toServer(u8),deliverJson,deliverSnapshot,createPeerConnection:fakePC(c.id),createWorker:()=>(c.worker=fakeWorker()),now:()=>performance.now(),absNow:abs,createClock:T.createClock,encodeState:RoomCore.encodeState,canHost:()=>!c.dead&&!c.hidden,
   onClockSwitch:samples=>{c.predictor.pingClock.reset();for(const s of samples)c.predictor.pong(s.frame,s.sentAt);},onAuthority:info=>c.authorityLog.push({...info,t:performance.now()})});return;}
  if(c.net&&c.net.handleServer(d))return;deliverJson(d);},SERVER_DELAY);
 ws.onopen=()=>sendServer({type:'join',create,room,name,netcode:3,mesh:true});
 let frameNo=0;
 c.timer=setInterval(()=>{if(c.dead||!c.id)return;const t=performance.now();frameNo++;c.predictor.lead=c.lead.update(t);c.net?.tick();
  if(frameNo%15===0||c.predictor.pingClock.size<8&&frameNo%4===0){const d={type:'ping',t};if(!c.net?.route(d))sendServer(d);}
  // Each player runs back and forth (1.5 s per direction) and taps kick: steady, checkable own motion.
  const dir=Math.floor(t/1500)%2?4:8,input=dir|(frameNo%20===0?16:0);if(input!==c.input&&c.ready){c.input=input;const seq=++c.seq,frame=c.predictor.input(seq,c.id,input,t);const d={type:'in',c:[[seq,frame,input]]};c.net?.route(d);sendServer(d);}},1000/60);
 c.kill=()=>{c.dead=true;clearInterval(c.timer);c.worker?.terminate();c.net?.close();ws.close();};
 c.stop=()=>{c.dead=true;clearInterval(c.timer);c.worker?.terminate();c.net?.close();try{ws.close();}catch{}c.decoder.destroy();};
 return c;}

async function until(fn,ms=8000,what='condition'){const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await wait(20);}throw Error('Timed out waiting for '+what);}
function continuity(c,from,to,label){const s=c.snaps.filter(x=>x.t>=from&&x.t<=to);assert(s.length>10,label+': '+c.name+' got snapshots ('+s.length+')');
 let worstGap=0,worstFrameGap=0;for(let i=1;i<s.length;i++){assert(s[i].frame>=s[i-1].frame,label+': frames never go back for '+c.name);worstGap=Math.max(worstGap,s[i].t-s[i-1].t);worstFrameGap=Math.max(worstFrameGap,s[i].frame-s[i-1].frame);}
 return{worstGap,worstFrameGap,count:s.length};}

(async()=>{
 let target='server';const app=createServer({peerHosting:true,forceHost:()=>target,migrationCooldown:0,standbyTimeout:600}),addr=await app.listen(0);const port=addr.port;
 const all=[];try{
  const A=client(port,'A',{create:true});all.push(A);await until(()=>A.room,5000,'A joins');
  const B=client(port,'B',{room:A.room}),C=client(port,'C',{room:A.room});all.push(B,C);await until(()=>B.id&&C.id,5000,'B and C join');
  A.ws.send(JSON.stringify({type:'configure',mode:'2v2',started:true}));
  await until(()=>all.every(c=>c.net&&[...c.net.peers.values()].filter(p=>p.ch?.readyState==='open').length===2),8000,'full mesh');
  await until(()=>all.every(c=>c.snaps.length>30),8000,'snapshots from the server');
  const r=app.rooms.get(A.room);assert.equal(r.authority,'server');

  // 1. server → A
  const tStart=performance.now();let t0=tStart;target=A.id;await until(()=>all.every(c=>c.net.authority===A.id),8000,'everyone on host A');assert.equal(r.authority,A.id);await wait(1500);
  for(const c of all){const k=continuity(c,t0,performance.now(),'server→A');assert(k.worstGap<400,'server→A: no stall for '+c.name+' ('+k.worstGap.toFixed(0)+' ms)');}
  const tb=performance.now();await wait(1800);const xs=B.snaps.filter(x=>x.t>tb&&Number.isFinite(x.x)).map(x=>x.x);assert(Math.max(...xs)-Math.min(...xs)>20,'B still controls its player while A hosts');
  assert(A.worker.host.hosting,'A runs the room in its worker');

  // 2. A → B (peer to peer)
  t0=performance.now();target=B.id;await until(()=>all.every(c=>c.net.authority===B.id),8000,'everyone on host B');assert.equal(r.authority,B.id);await wait(1500);
  for(const c of all){const k=continuity(c,t0,performance.now(),'A→B');assert(k.worstGap<400,'A→B: no stall for '+c.name+' ('+k.worstGap.toFixed(0)+' ms)');}
  assert(!A.worker.host.hosting,'A stopped hosting');

  // 3. D joins while B hosts: the room goes back to the server for the join, then to B again.
  const D=client(port,'D',{room:A.room});all.push(D);await until(()=>D.id,8000,'D joins while B hosts');
  await until(()=>r.authority===B.id&&[A,C,D].every(c=>c.net&&c.net.authority===B.id),15000,'back on host B with D');
  const dSeen=D.snaps.length;await wait(800);assert(D.snaps.length-dSeen>=15,'D gets snapshots from B');
  // 4. B hides its tab: it hands the room back at once and is no longer a candidate.
  B.hidden=true;t0=performance.now();B.net.relinquish('tab hidden');await until(()=>r.authority==='server'&&[A,C,D].every(c=>c.net.authority==='server'),8000,'B released the room');await wait(800);
  for(const c of [A,C,D]){const k=continuity(c,t0,performance.now(),'release');assert(k.worstGap<400,'release: no stall for '+c.name);}
  await wait(2500);assert.equal(r.authority,'server','a hidden tab is not elected');
  // 5. A hosts, then vanishes: the server takes over from its standby copy plus the inputs it kept.
  target=A.id;await until(()=>[B,C,D].every(c=>c.net.authority===A.id),15000,'host A again');await wait(500);
  target='server';t0=performance.now();const before=Math.max(...[C,D].map(c=>c.snaps.at(-1).frame));A.kill();
  await until(()=>r.authority==='server'&&[C,D].every(c=>c.net.authority==='server'&&c.snaps.at(-1).t>t0+200),8000,'failover to the server');await wait(1200);
  for(const c of [C,D]){const k=continuity(c,t0,performance.now(),'failover');assert(k.worstGap<1500,'failover: back within the standby timeout for '+c.name+' ('+k.worstGap.toFixed(0)+' ms)');assert(c.snaps.at(-1).frame>before+60,'game kept going');}
  assert.equal(r.clients.has(A.id),false,'A left the room');

  // 4. Handovers are invisible on your own player: corrections around each switch are as small as normal ones.
  if(process.env.DEBUG_PH)for(const c of [C,D]){console.log(c.name,'switches',JSON.stringify(c.authorityLog.map(a=>[Math.round(a.t),a.host,a.pending])));console.log(c.name,'big',JSON.stringify(c.corrections.filter(x=>x.d>2).map(x=>[Math.round(x.t),+x.d.toFixed(1),x.authority])));}
  for(const c of [C,D]){const corr=c.corrections.filter(x=>x.t>tStart).map(x=>x.d);const worst=Math.max(0,...corr);assert(worst<8,c.name+': own player never jumps (worst correction '+worst.toFixed(2)+')');}
  // 6. No forcing: with the server at 80 ms and players 20 ms apart, the measured election moves the room to a player.
  for(const c of all)c.stop();all.length=0;await app.close();
  const app2=createServer({peerHosting:true,election:{hold:1500},migrationCooldown:0}),port2=(await app2.listen(0)).port;try{
   const E=client(port2,'E',{create:true});all.push(E);await until(()=>E.room,5000,'E');const F=client(port2,'F',{room:E.room});all.push(F);await until(()=>F.id,5000,'F');
   E.ws.send(JSON.stringify({type:'configure',mode:'bot',started:true}));const r2=app2.rooms.get(E.room);
   await until(()=>r2.authority!=='server'&&[E,F].every(c=>c.net?.authority===r2.authority),20000,'elected peer host');
  }finally{for(const c of all)c.stop();all.length=0;await app2.close();}
  console.log('PASS peer hosting: full mesh, seamless handovers server→A→B (no stall, own player keeps control, no jumps), join while a player hosts, hidden-tab release, instant failover when the host vanishes, and a measured election that picks a player host');
 }finally{for(const c of all)c.stop();await app.close();}
})().catch(e=>{console.error(e);process.exit(1);});
