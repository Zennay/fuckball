/* Peer hosting, browser side (docs/netcode-plan.md). Every client in a room keeps a WebRTC data channel
   to every other client (signalled through the room server), measures round trips on each of them and
   reports them to the server, which picks the host with the best connection for everyone. When this
   browser is chosen it runs the room in a worker (dist/host-worker.js) and serves snapshots and pongs
   directly over the data channels; inputs always go to the room server too, so it can take over at once.
   The authority only changes at an exact frame: snapshots from the new host count from that frame on.
   Everything is injected so the same code runs in Node tests with fake channels and an in-process host. */
(function(root){'use strict';
const XE=.06,RELAY=0x46425231;
function median(v){if(!v.length)return NaN;const s=[...v].sort((a,b)=>a-b);return s[s.length>>1];}
function frameOf(buf){try{const v=new DataView(buf);const m=v.getUint32(0);return m===0x46423203||m===0x46423201?{frame:v.getUint32(12),ack:v.getUint32(8)}:null;}catch{return null;}}
function createPeerNet(o){
 const {selfId,sendServer,sendServerBinary,deliverJson,deliverSnapshot,createPeerConnection,createWorker,now,absNow,createClock}=o;
 const iceServers=o.iceServers||[{urls:'stun:stun.l.google.com:19302'}];
 const peers=new Map(),serverRtts=[],serverClock=createClock(),unacked=[];
 // Correlate peer pong samples to genuinely transmitted probes; never treat a
 // fabricated future/replayed timestamp as an instantaneous RTT.
 let authority='server',pending=null,hosting=false,hostClock=null,worker=null,closed=false,switchSamples=[],lastReport=0;
 const st={get authority(){return authority;},get pending(){return pending;},get hosting(){return hosting;},peers,unacked};
 const serverRtt=()=>median(serverRtts);
 /* Room time in frames: our own clock while hosting, otherwise the room server's clock. */
 function roomTimeNow(t=now()){if(hostClock)return hostClock.frame+(absNow()-hostClock.at)*XE;const rtt=serverRtt();return serverClock.size?t*XE+serverClock.percentile(.5)-(Number.isFinite(rtt)?rtt/2*XE:0):NaN;}
 function openPeer(id){const p=peers.get(id);return p&&p.ch&&p.ch.readyState==='open'?p:null;}
 function sendPeer(id,data){const p=openPeer(id);if(!p)return false;try{if(p.ch.bufferedAmount>262144)return false;p.ch.send(typeof data==='string'||data instanceof ArrayBuffer||ArrayBuffer.isView(data)?data:JSON.stringify(data));return true;}catch{return false;}}

 /* ---------- mesh ---------- */
 function connect(id){if(peers.has(id)||id===selfId)return;const pc=createPeerConnection({iceServers}),p={id,pc,ch:null,rtts:[],queue:[],pingSent:new Map()};peers.set(id,p);
  pc.onicecandidate=e=>{if(e.candidate)sendServer({type:'signal',to:id,data:{ice:e.candidate.toJSON?e.candidate.toJSON():e.candidate}});};
  pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed'||pc.connectionState==='closed')p.failed=true;};
  const setup=ch=>{p.ch=ch;ch.binaryType='arraybuffer';ch.onmessage=e=>onPeerMessage(id,e.data);ch.onclose=()=>{if(p.ch===ch)p.ch=null;};};
  if(selfId<id){setup(pc.createDataChannel('fb',{ordered:false,maxRetransmits:0}));pc.createOffer().then(d=>pc.setLocalDescription(d)).then(()=>sendServer({type:'signal',to:id,data:{sdp:pc.localDescription.toJSON?pc.localDescription.toJSON():pc.localDescription}})).catch(()=>{p.failed=true;});}
  else pc.ondatachannel=e=>setup(e.channel);}
 function disconnect(id){const p=peers.get(id);if(!p)return;peers.delete(id);try{p.ch?.close();}catch{}try{p.pc.close();}catch{}}
 async function signal(from,data){if(!peers.has(from))connect(from);const p=peers.get(from);if(!p)return;const pc=p.pc;try{
  if(data.sdp){await pc.setRemoteDescription(data.sdp);for(const c of p.queue.splice(0))await pc.addIceCandidate(c);if(data.sdp.type==='offer'){await pc.setLocalDescription(await pc.createAnswer());sendServer({type:'signal',to:from,data:{sdp:pc.localDescription.toJSON?pc.localDescription.toJSON():pc.localDescription}});}}
  else if(data.ice){if(pc.remoteDescription)await pc.addIceCandidate(data.ice);else p.queue.push(data.ice);}}catch{p.failed=true;}}

 /* ---------- traffic from peers ---------- */
 function onPeerMessage(id,data){if(closed)return;
  if(data instanceof ArrayBuffer){fromSource(id,data);return;}
  let d;try{d=JSON.parse(data);}catch{return;}
  if(d.type==='pp'){sendPeer(id,{type:'pq',t:d.t,frame:roomTimeNow()});return;}
  if(d.type==='pq'){const p=peers.get(id);if(!p||!Number.isFinite(d.t)||!p.pingSent.has(d.t))return;
   const rtt=now()-d.t;
   p.pingSent.delete(d.t); // a probe contributes at most once
   if(!Number.isFinite(rtt)||rtt<0||rtt>3000)return; // clock skew / stale reply
   p.rtts.push(rtt);if(p.rtts.length>9)p.rtts.shift();
   if(pending&&pending.host===id&&Number.isFinite(d.frame))switchSamples.push({frame:d.frame,sentAt:d.t});return;}
  if(d.type==='ping'&&hosting){sendPeer(id,{type:'pong',t:d.t,frame:roomTimeNow()});return;}
  if(d.type==='pong'&&id===authority){deliverJson(d);return;}
  if(d.type==='in'&&worker)worker.postMessage({cmd:'msg',from:id,d});}

 /* Snapshots: from the current authority, or from the next one once it reaches the handover frame. */
 function fromSource(source,buf){const info=frameOf(buf);if(!info)return;
  if(source!==authority){if(!pending||pending.host!==source||info.frame<pending.frame)return;
   authority=source;if(source==='server')unacked.length=0;const samples=source===selfId?[{frame:roomTimeNow(),sentAt:now()}]:switchSamples;pending=null;switchSamples=[];o.onClockSwitch?.(samples,authority);o.onAuthority?.({host:authority});}
  if(source!=='server'){while(unacked.length&&unacked[0][0]<=info.ack)unacked.shift();}
  deliverSnapshot(buf);}

 /* ---------- worker (this browser hosts) ---------- */
 function ensureWorker(){if(worker)return worker;worker=createWorker();worker.onmessage=e=>onWorker(e.data);return worker;}
 function onWorker(ev){if(closed)return;
  if(ev.ev==='send'){const {to,data}=ev;
   if(data instanceof Uint8Array){const buf=data.byteOffset===0&&data.byteLength===data.buffer.byteLength?data.buffer:data.slice().buffer;
    if(to===selfId){fromSource(selfId,buf);return;}if(sendPeer(to,buf))return;const relay=new Uint8Array(buf.byteLength+8),h=new DataView(relay.buffer);h.setUint32(0,RELAY);h.setUint32(4,to);relay.set(new Uint8Array(buf),8);sendServerBinary(relay);return;}
   if(to===selfId)deliverJson(data);else sendServer({type:'hostOut',to,d:data});return;}
  if(ev.ev==='standby'){sendServer({type:'standby',state:o.encodeState(ev.state)});return;}
  if(ev.ev==='released'){hosting=false;hostClock=null;sendServer({type:'released',state:o.encodeState(ev.state),epoch:ev.epoch});return;}
  if(ev.ev==='hosting'){hosting=true;return;}
  if(ev.ev==='error')o.onError?.(ev.message);}

 /* ---------- traffic from the room server ---------- */
 function handleServer(d){if(closed)return false;
  switch(d.type){
   case 'mesh':{const want=new Set((d.peers||[]).filter(id=>id!==selfId));for(const id of [...peers.keys()])if(!want.has(id))disconnect(id);for(const id of want)connect(id);return true;}
   case 'signal':signal(d.from,d.data||{});return true;
   case 'spong':{if(!Number.isFinite(d.t))return true;const rtt=Math.max(0,now()-d.t);serverRtts.push(rtt);if(serverRtts.length>9)serverRtts.shift();if(Number.isFinite(d.frame)){serverClock.add(d.frame-d.t*XE);if(pending&&pending.host==='server')switchSamples.push({frame:d.frame,sentAt:d.t});}return true;}
   case 'authority':{pending={host:d.host,frame:d.frame,epoch:d.epoch};switchSamples=[];o.onAuthority?.({host:authority,pending:d.host,name:d.name});
    if(d.host===selfId)ensureWorker();else if(d.host==='server'){for(let i=0;i<6;i++)setTimeout(()=>sendServer({type:'sping',t:now()}),i*40);}else for(let i=0;i<10;i++)setTimeout(()=>sendPeer(d.host,{type:'pp',t:now()}),i*40);
    if(d.host===authority)pending=null;return true;}
   case 'takeover':{ensureWorker();const rtt=serverRtt();hostClock={frame:d.frame+(Number.isFinite(rtt)?rtt/2*XE:0),at:absNow()};worker.postMessage({cmd:'takeover',state:d.state,frame:hostClock.frame,at:hostClock.at,epoch:d.epoch});hosting=true;return true;}
   case 'release':worker?.postMessage({cmd:'release',frame:d.frame,epoch:d.epoch});return true;
   case 'hostIn':ensureWorker().postMessage({cmd:'msg',from:d.from,d:d.d});return true;
   case 'hostLeave':worker?.postMessage({cmd:'leave',id:d.id});return true;
   case 'stopHost':worker?.postMessage({cmd:'stop'});hosting=false;hostClock=null;return true;
  }
  return false;}
 /* Snapshot bytes that arrived over the room server's WebSocket (its own, or relayed from a peer host). */
 function serverBinary(buf){const v=new DataView(buf);if(buf.byteLength>=8&&v.getUint32(0)===RELAY){fromSource(authority==='server'?pending?.host??'server':authority,buf.slice(8));return;}fromSource('server',buf);}

 /* ---------- traffic from the app (online guest) ---------- */
 /* Returns true when the message was fully handled here; otherwise the caller also sends it to the server. */
 function route(d){if(closed)return false;
  if(d.type==='ping'){if(authority==='server')return false;if(authority===selfId){deliverJson({type:'pong',t:d.t,frame:roomTimeNow()});return true;}return sendPeer(authority,d);}
  if(d.type==='in'){for(const c of d.c||[])if(!unacked.length||c[0]>unacked[unacked.length-1][0])unacked.push(c);if(unacked.length>32)unacked.splice(0,unacked.length-32);sendInputsToHost();return false;}
  return false;}
 function inputHost(){const h=pending&&pending.host!=='server'?pending.host:authority;return h==='server'?null:h;}
 function sendInputsToHost(){const h=inputHost();if(h==null||!unacked.length)return;const msg={type:'in',c:unacked.slice()};if(h===selfId)worker?.postMessage({cmd:'msg',from:selfId,d:msg});else sendPeer(h,JSON.stringify(msg));}

 /* ---------- periodic work (call every ~50 ms) ---------- */
 let lastPing=0;
 function tick(){if(closed)return;const t=now();
  if(inputHost()!=null&&inputHost()!==selfId)sendInputsToHost(); // redundant resend over the unreliable channel
  if(t-lastPing>=1000){lastPing=t;sendServer({type:'sping',t});
   for(const [id,p]of peers){if(sendPeer(id,{type:'pp',t})){
    p.pingSent.set(t,true);
    if(p.pingSent.size>4)p.pingSent.delete(p.pingSent.keys().next().value);
   }}
  }
  if(t-lastReport>=2000){lastReport=t;const rtts={};for(const [id,p]of peers)if(openPeer(id)&&p.rtts.length)rtts[id]=Math.round(median(p.rtts));
   const meshed=[...peers.keys()].every(id=>openPeer(id));sendServer({type:'rtt',server:Math.round(serverRtt())||null,peers:rtts,eligible:!!(o.canHost?.()&&meshed)});}
  if(hosting)worker?.postMessage({cmd:'tick'});}
 /* This browser can no longer host well (tab hidden): ask the server to take the room back now. */
 function relinquish(reason){if(hosting||pending?.host===selfId)sendServer({type:'hostRelease',reason});}
 function close(){closed=true;for(const id of [...peers.keys()])disconnect(id);try{worker?.terminate();}catch{}worker=null;hosting=false;}
 return Object.assign(st,{handleServer,serverBinary,route,tick,relinquish,close,roomTimeNow,serverRtt,connect,disconnect});
}
root.FuckballPeerNet={createPeerNet,RELAY};if(typeof module!=='undefined')module.exports=root.FuckballPeerNet;
})(typeof globalThis!=='undefined'?globalThis:this);
