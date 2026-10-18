#!/usr/bin/env node
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const{HBInit}=require('./runtime.cjs'),{WebSocketServer}=require('./websocket.cjs'),{createAccounts}=require('./accounts.cjs'),AI=require('../dist/ai/policy.js'),Netcode=require('../dist/netcode.js');
// Netcode v3 (frame-stamped inputs + input buffer, docs/netcode-plan.md). FUCKBALL_NETCODE=classic turns it off.
const NETCODE_V3=(process.env.FUCKBALL_NETCODE||'v3')!=='classic';
const ROOM_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_RECONNECT_MS=30000;
function createServer(options={}){
 const v3Enabled=options.netcode?options.netcode!=='classic':NETCODE_V3;
 const reconnectMs=Math.max(5000,Math.min(120000,Number(options.reconnectWindowMs)||DEFAULT_RECONNECT_MS));
 let shuttingDown=false;
 const root=path.resolve(__dirname,'../dist'),bff=fs.readFileSync(path.join(root,'stadiums/bff-big-v4.hbs'),'utf8'),rooms=new Map(),clients=new Set();
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.hbs':'application/json','.txt':'text/plain; charset=utf-8','.zip':'application/zip'};
 const accounts=createAccounts(options.dataDir!==undefined?options.dataDir:process.env.FUCKBALL_DATA_DIR||process.env.STATE_DIRECTORY||path.resolve(__dirname,'../data')),authHits=new Map();
 // Account API: same-origin JSON, small bodies, 20 attempts per IP per 10 minutes.
 function accountApi(req,res,route){const json=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  if(route==='/api/me'){const token=(req.headers.authorization||'').replace(/^Bearer /,'');const name=accounts.user(token);json(name?200:401,name?{username:name}:{error:'Not logged in.'});return;}
  if(req.method!=='POST'){json(405,{error:'POST required.'});return;}
  const ip=req.socket.remoteAddress||'',now=Date.now(),hits=(authHits.get(ip)||[]).filter(t=>now-t<600000);if(hits.length>=20){json(429,{error:'Too many attempts. Try again later.'});return;}hits.push(now);authHits.set(ip,hits);
  let body='';req.setEncoding('utf8');req.on('data',c=>{body+=c;if(body.length>4096)req.destroy();});req.on('end',()=>{try{const d=JSON.parse(body||'{}');if(route==='/api/logout'){accounts.logout(d.token);json(200,{ok:true});return;}const out=route==='/api/register'?accounts.register(d.username,d.password):accounts.login(d.username,d.password);json(200,out);}catch(e){json(400,{error:e.message});}});}
 const server=http.createServer((req,res)=>{const route=req.url?.split('?')[0];if(['/api/register','/api/login','/api/logout','/api/me'].includes(route)){accountApi(req,res,route);return;}if(req.url?.split('?')[0]==='/api/training'){let status={status:'unavailable'};try{const raw=JSON.parse(fs.readFileSync(process.env.FUCKBALL_TRAINING_STATUS||'/opt/fuckball-training/status.json','utf8'));status=Object.fromEntries(['status','cycles','matches','activeCycle','episodesPerCycle','directionAccuracy','kickF1','arenaWins','arenaGames','livePromoted','updatedAt','deadline','reason'].filter(k=>raw[k]!==undefined).map(k=>[k,raw[k]]));}catch{}res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(status));return;}if(req.url?.split('?')[0]==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,engine:'node-haxball-2.3.1',release:process.env.FUCKBALL_RELEASE_SHA||'local',physicsHz:60,snapshotHz:30,rooms:rooms.size,netcode:v3Enabled?3:2,peerHosting}));return;}
  if(req.url?.split('?')[0]==='/api/rooms'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify([...rooms.values()].map(r=>({players:r.sockets.size,reserved:r.parked.size,map:r.hb._room.state.stadium.name,started:r.started}))));return;}
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.stat(file,(err,stat)=>{if(err||!stat.isFile()){res.writeHead(404).end('Not found');return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});fs.createReadStream(file).pipe(res);});
 });
 // Track the underlying TCP sockets as well as admitted WebSockets: HTTP
 // upgrades and early handshake rejections can outlive the room client set.
 const openSockets=new Set();
 server.on('connection',socket=>{
  openSockets.add(socket);
  socket.once('close',()=>openSockets.delete(socket));
 });
 const wss=new WebSocketServer({server,maxPayload:2*1024*1024});
 const send=(ws,data)=>{if(ws.readyState===1&&ws.socket.writableLength<262144)ws.send(typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data));};
 const RoomCore=require('../dist/room-core.js'),XE=.06,RELAY=0x46425231,HOST_OUT=new Set(['status','room','chat','goal','subApplied','playingTime','matchResult','matchRestart','error','recordingStatus','recording']);
 /* Peer hosting (docs/netcode-plan.md): the room can run in a player's browser when that gives everyone a
    better connection. This server stays the coordinator: it measures, elects, hands the room over at an
    exact frame, keeps a standby copy plus every input, and takes the room back instantly when the host
    leaves, hides its tab or stops reporting. OFF by default: direct WebRTC channels show players each
    other's IP addresses. FUCKBALL_PEER_HOSTING=on enables it. */
 const peerHosting=options.peerHosting??(process.env.FUCKBALL_PEER_HOSTING==='on'&&v3Enabled);
 const electionOptions={minGain:25,ratio:.85,hold:8000,...options.election},cooldown=options.migrationCooldown??10000,standbyTimeout=options.standbyTimeout??1500;
 const toWire=data=>data instanceof Uint8Array?Buffer.from(data.buffer,data.byteOffset,data.byteLength):data;
 function createRoom(){if(rooms.size>=16)throw Error('Server is full.');let id;do{id=Array.from(crypto.randomBytes(8),b=>ROOM_ALPHABET[b%ROOM_ALPHABET.length]).join('');}while(rooms.has(id));const hb=HBInit({noPlayer:true,roomName:'Fuckball '+id});hb.setCustomStadium(bff);hb.setScoreLimit(3);hb.setTimeLimit(7);
  // While a browser hosts, this copy is only a standby: it must not talk to the clients.
  const sockets=new Map(),r=RoomCore.createRoomCore({hb,id,AI,Netcode,v3:v3Enabled,send:(cid,data)=>{if(r.authority!=='server')return;const ws=sockets.get(cid);if(ws)send(ws,toWire(data));},canSend:cid=>{const ws=sockets.get(cid);return !!ws&&ws.socket.writableLength<65536;}});
  Object.assign(r,{sockets,authority:'server',epoch:0,migration:null,clock:0,reports:new Map(),standby:null,standbyAt:0,lastMigration:-Infinity,pendingJoins:[],sessionTokens:new Map(),parked:new Map(),penalty:new Map(),election:Netcode.createElection(electionOptions)});rooms.set(id,r);return r;}
 const roomTime=r=>r.clock+fraction();
 const hostSocket=r=>r.authority==='server'?null:r.sockets.get(r.authority);
 function meshUpdate(r){if(!peerHosting)return;const ids=[...r.sockets].filter(([,ws])=>ws.mesh).map(([id])=>id);for(const id of ids)send(r.sockets.get(id),{type:'mesh',peers:ids});}
 function announce(r,host){const name=host==='server'?'server':r.hb.getPlayer(host)?.name||'Player '+host;for(const ws of r.sockets.values())send(ws,{type:'authority',host,frame:r.migration?.frame??r.frame,epoch:r.epoch,name});}
 /* Plan a handover at frame M, far enough ahead that every client hears about it before M. */
 function migrate(r,to,reason){if(r.migration||to===r.authority)return;const rtts=[...r.reports.values()].map(x=>x.server).filter(Number.isFinite),worst=rtts.length?Math.max(...rtts):150;
  r.epoch++;r.migration={to,from:r.authority,frame:Math.ceil(r.clock+(worst+60)*XE)+2,epoch:r.epoch,started:Date.now(),reason};announce(r,to);
  if(r.authority!=='server')send(hostSocket(r),{type:'release',frame:r.migration.frame,epoch:r.epoch});}
 function takeover(r,to,state){const ws=r.sockets.get(to);if(!ws){r.migration=null;r.authority='server';r.epoch++;announce(r,'server');return;}send(ws,{type:'takeover',state:RoomCore.encodeState(state),frame:roomTime(r),epoch:r.epoch});
  r.authority=to;r.standby=state;r.standbyAt=Date.now();r.migration=null;r.lastMigration=Date.now();if(r.pendingJoins.length)migrate(r,'server','join');}
 /* Continue on this server from a host's export. Inputs that only reached this server are merged in. */
 function resume(r,state,{failover=false}={}){const mine=new Map([...r.clients].map(([id,c])=>[id,c.timeline?.export()]));r.authority='server';r.restore(state);if(failover)r.seq+=1000;
  for(const [id,c]of r.clients){const own=mine.get(id);if(own&&c.timeline)c.timeline.receive(own.changes.filter(x=>x[0]>c.timeline.lastSeq),r.frame,r.frame);}
  for(const id of [...r.clients.keys()])if(!r.sockets.has(id)&&!r.parked.has(id))r.leave(id);
  for(const id of r.parked.keys())if(r.clients.has(id))r.disconnected.add(id);
  for(const [id,ws]of r.sockets)if(!r.clients.has(id))try{r.join(id,{name:ws.name,netcode:ws.netcode,account:ws.account});}catch{}
  r.migration=null;r.standby=null;r.lastMigration=Date.now();r.status();
  for(const ws of r.pendingJoins.splice(0))if(ws.readyState===1)try{join(ws,r);}catch(e){ws.room=null;ws.pendingResumeToken=null;send(ws,{type:'error',message:e?.message||'Unable to rejoin.'});}}
 function failover(r,reason){if(r.authority==='server'||!r.standby)return;const old=hostSocket(r);r.penalty.set(r.authority,Date.now()+60000);r.epoch++;resume(r,r.standby,{failover:true});r.migration={frame:r.frame};announce(r,'server');r.migration=null;if(old)send(old,{type:'stopHost'});}
 function election(r){if(!peerHosting||r.migration||r.hb._room.isRecording()||r.authority!=='server'&&r.standby?.recording||Date.now()-r.lastMigration<cooldown||!r.sockets.size)return;
  const now=Date.now(),players=[...r.sockets.keys()],rtt={server:{}};
  for(const id of players){const rep=r.reports.get(id);rtt[id]={};if(!rep||now-rep.at>6000)continue;if(Number.isFinite(rep.server)){rtt.server[id]=rep.server;rtt[id].server=rep.server;}
   for(const [peer,ms]of Object.entries(rep.peers||{})){const other=r.reports.get(Number(peer))?.peers?.[id];rtt[id][peer]=Number.isFinite(other)?(ms+other)/2:ms;}}
  const candidates=['server',...players.filter(id=>{const rep=r.reports.get(id);return rep&&now-rep.at<6000&&rep.eligible&&r.sockets.get(id)?.mesh&&!(r.penalty.get(id)>now);})];
  const forced=options.forceHost?.(r,candidates);if(forced!==undefined){if(forced!==r.authority&&(forced==='server'||candidates.includes(forced)))migrate(r,forced,'forced');return;}
  const d=r.election.decide({rtt,players,candidates,current:r.authority,now});if(d.switch)migrate(r,d.host,d.reason);}
 // A per-connection bearer ticket is never placed in the room URL, status, or host snapshots.
 function issueTicket(ws,r,id){const ticket=crypto.randomBytes(32).toString('hex');r.sessionTokens.set(id,ticket);send(ws,{type:'resumeTicket',ticket,windowMs:reconnectMs});}
 function rejoin(ws,r,ticket){
  if(typeof ticket!=='string'||!/^[0-9a-f]{64}$/.test(ticket))throw Error('Session expired. Join the room again.');
  let id=null,claim=null;
  for(const [pid,p]of r.parked){if(p.ticket.length===ticket.length&&crypto.timingSafeEqual(Buffer.from(p.ticket),Buffer.from(ticket))){id=pid;claim=p;break;}}
  if(id===null||Date.now()>claim.expiresAt||!r.clients.has(id)||r.sockets.has(id))throw Error('Session expired. Join the room again.');
  if(claim.account&&claim.account!==ws.account)throw Error('Session belongs to a different account.');
  clearTimeout(claim.timer);r.parked.delete(id);ws.room=r;ws.playerId=id;r.sockets.set(id,ws);
  const c=r.clients.get(id);c.timeline=r.v3&&ws.netcode===3?Netcode.createInputTimeline():null;c.lastInputSeq=0;
  send(ws,{type:'welcome',id,room:r.id,owner:r.owner,name:c.name,account:claim.account,netcode:c.timeline?3:2,resumed:true});
  issueTicket(ws,r,id);r.setConnected(id,true);
  if(ws.mesh)send(ws,{type:'peering',enabled:true});meshUpdate(r);
 }
 // Disconnection is not a voluntary leave: retain the role and match clock, not inputs or offline playing time.
 function park(ws){const r=ws.room,id=ws.playerId;if(!r||id==null||!r.clients.has(id))return false;
  if(r.authority!=='server'&&r.standby)failover(r,'participant disconnected');
  if(r.authority!=='server')return false;
  const ticket=r.sessionTokens.get(id);if(!ticket)return false;
  ws.room=null;r.sockets.delete(id);r.reports.delete(id);
  const claim={ticket,account:ws.account||null,expiresAt:Date.now()+reconnectMs,timer:null};
  claim.timer=setTimeout(()=>{if(r.parked.get(id)!==claim)return;r.parked.delete(id);r.sessionTokens.delete(id);if(r.leave(id)){r.destroy();rooms.delete(r.id);}meshUpdate(r);},reconnectMs);
  claim.timer.unref?.();r.parked.set(id,claim);r.setConnected(id,false);meshUpdate(r);return true;
 }
 function join(ws,r){
  // A browser host cannot add players; take the room back first (a seamless handover), then join.
  if(r.authority!=='server'){if(!r.pendingJoins.includes(ws))r.pendingJoins.push(ws);ws.room=r;if(!r.migration)migrate(r,'server','join');return;}
  if(ws.pendingResumeToken){const ticket=ws.pendingResumeToken;ws.pendingResumeToken=null;rejoin(ws,r,ticket);return;}
  while(r.botIds.has(r.nextId)||r.clients.has(r.nextId))r.nextId++;const id=r.nextId;ws.room=r;ws.playerId=id;r.sockets.set(id,ws);try{r.join(id,{name:ws.name,netcode:ws.netcode,account:ws.account});}catch(e){r.sockets.delete(id);ws.room=null;if(!r.clients.size){r.destroy();rooms.delete(r.id);}throw e;}
  if(ws.resumeEnabled)issueTicket(ws,r,id);if(ws.mesh)send(ws,{type:'peering',enabled:true});meshUpdate(r);}
 function leave(ws){const r=ws.room;if(!r)return;ws.room=null;const queued=r.pendingJoins.indexOf(ws);if(queued>=0){r.pendingJoins.splice(queued,1);return;}
  const id=ws.playerId;r.sockets.delete(id);r.reports.delete(id);r.sessionTokens.delete(id);const claim=r.parked.get(id);if(claim){clearTimeout(claim.timer);r.parked.delete(id);}
  if(r.authority===id){if(!r.sockets.size){r.destroy();rooms.delete(r.id);return;}failover(r,'host left');}
  else if(r.authority!=='server'){send(hostSocket(r),{type:'hostLeave',id});if(!r.sockets.size){r.destroy();rooms.delete(r.id);}meshUpdate(r);return;}
  if(r.leave(id)){r.destroy();rooms.delete(r.id);return;}meshUpdate(r);}
 function fromHost(r,ws,d){if(r.authority!==ws.playerId)return;
  if(d.type==='hostOut'){const to=r.sockets.get(Number(d.to));if(to&&d.d&&HOST_OUT.has(d.d.type))send(to,d.d);return;}
  if(d.type==='standby'){try{r.standby=RoomCore.decodeState(d.state);r.standbyAt=Date.now();for(const [id,c]of r.standby.clients)if(c.timeline)r.clients.get(id)?.timeline?.prune(c.timeline.appliedSeq,c.timeline.current);}catch{}return;}
  if(d.type==='released'){let state;try{state=RoomCore.decodeState(d.state);}catch{failover(r,'bad release');return;}const m=r.migration;
   if(m&&m.to!=='server'&&m.to!==ws.playerId&&r.sockets.has(m.to)){resume(r,state);r.epoch=m.epoch;takeover(r,m.to,r.exportState());return;}
   // Unplanned (tab hidden), or the next host left meanwhile: the server keeps the room, so say so.
   const announceServer=!m||m.to!=='server';resume(r,state);if(announceServer){r.epoch++;r.migration={frame:state.frame};announce(r,'server');r.migration=null;}return;}
  // Not a candidate again until a fresh report says it can host (e.g. its tab is visible again).
  if(d.type==='hostRelease'){const rep=r.reports.get(ws.playerId);if(rep)rep.eligible=false;if(!r.migration)migrate(r,'server',d.reason||'host released');}}
 wss.on('connection',ws=>{clients.add(ws);ws.lastSeen=Date.now();ws.rateStart=Date.now();ws.messages=0;ws.on('close',()=>{if(shuttingDown||ws.intentionalLeave||ws.peerClosed||!park(ws))leave(ws);clients.delete(ws);});ws.on('message',(raw,binary)=>{try{const now=Date.now();ws.lastSeen=now;const r0=ws.room;if(now-ws.rateStart>1000){ws.rateStart=now;ws.messages=0;}if(++ws.messages>(r0&&r0.authority===ws.playerId?2000:180))throw Error('Too many messages.');
   // Snapshot bytes from a browser host for a client without a direct channel to it.
   if(binary){if(r0&&r0.authority===ws.playerId&&raw.length>8&&raw.readUInt32BE(0)===RELAY){const to=r0.sockets.get(raw.readUInt32BE(4));if(to&&to.socket.writableLength<65536)send(to,raw.subarray(8));}return;}
   const d=JSON.parse(raw.toString());
   if(d.type==='ping'){send(ws,ws.room?{type:'pong',t:d.t,frame:roomTime(ws.room)}:{type:'pong',t:d.t,frame:frame+fraction()});return;}
   if(d.type==='sping'){send(ws,{type:'spong',t:d.t,frame:ws.room?roomTime(ws.room):null});return;}
   if(d.type==='join'){if(ws.room)throw Error('Already in a room.');const account=accounts.user(d.token),name=account||String(d.name||'Player').trim().slice(0,25)||'Player';if(!account&&accounts.reserved(name))throw Error('Name reserved: that nickname belongs to an account. Log in or pick another name.');const r=d.create?createRoom():rooms.get(String(d.room||'').toUpperCase());if(!r)throw Error('Room not found.');ws.name=name;ws.account=account||null;ws.resumeEnabled=!!account||d.resumeOptIn===true;ws.netcode=d.netcode;ws.mesh=peerHosting&&d.mesh===true&&d.netcode===3&&v3Enabled;if(d.resume!==undefined)ws.pendingResumeToken=d.resume;join(ws,r);return;}
   const r=ws.room;if(!r||ws.playerId==null)throw Error('Join a room first.');
   if(d.type==='leave'){ws.intentionalLeave=true;ws.close(1000,'Left room');return;}
   if(d.type==='latencyReply'){
    // A reply counts only for a server-issued single-use nonce on this socket.
    // Client-submitted RTT figures never enter the roster measurements.
    const pending=ws.pendingLatency;
    if(pending&&typeof d.nonce==='string'&&d.nonce===pending.nonce){
     const elapsed=Date.now()-pending.at;
     ws.pendingLatency=null;
     if(elapsed>=0&&elapsed<=10000){ws.measuredLatency=elapsed;ws.measuredLatencyAt=Date.now();}
    }
    return;
   }
   if(d.type==='signal'){const to=r.sockets.get(Number(d.to));if(to&&to.mesh&&ws.mesh)send(to,{type:'signal',from:ws.playerId,data:d.data});return;}
   if(d.type==='rtt'){const peers={};for(const [k,v]of Object.entries(d.peers||{}))if(r.sockets.has(Number(k))&&Number.isFinite(v)&&v>=0&&v<5000)peers[k]=v;r.reports.set(ws.playerId,{server:Number.isFinite(d.server)?d.server:null,peers,eligible:d.eligible===true,at:now});return;}
   if(['hostOut','standby','released','hostRelease'].includes(d.type)){fromHost(r,ws,d);return;}
   if(r.authority!=='server'){
    // A browser hosts: keep every input for the standby copy and pass everything on to the host.
    if(d.type==='in'){try{r.message(ws.playerId,d,r.frame);}catch{}if(ws.playerId!==r.authority)send(hostSocket(r),{type:'hostIn',from:ws.playerId,d});return;}
    send(hostSocket(r),{type:'hostIn',from:ws.playerId,d});return;}
   r.message(ws.playerId,d,r.hostTime(fraction()));
  }catch(e){const message=typeof e?.message==='string'&&e.message.trim()?e.message:'Invalid room request.';send(ws,{type:'error',message});}});});
 const fraction=()=>accumulator/(1000/60);
 function tickRoom(r){r.clock++;
  if(r.authority==='server'){let n=0;while(r.frame<r.clock&&n++<240)r.step();
   const m=r.migration;if(m&&m.from==='server'&&m.to!=='server'&&r.frame>=m.frame){if(r.sockets.has(m.to))takeover(r,m.to,r.exportState());else{r.migration=null;announce(r,'server');}}}
  else{const m=r.migration,late=m?Date.now()-m.started>3000+standbyTimeout:Date.now()-r.standbyAt>standbyTimeout;if(late)failover(r,m?'release timeout':'standby timeout');}
  if(r.clock%60===0)election(r);}
 let previous=performance.now(),accumulator=0,frame=0;const timer=setInterval(()=>{const now=performance.now();accumulator+=Math.min(250,now-previous);previous=now;let advanced=false;while(accumulator>=1000/60){for(const r of rooms.values())tickRoom(r);accumulator-=1000/60;frame++;advanced=true;}if(advanced&&frame%600===0)for(const ws of clients)if(Date.now()-ws.lastSeen>45000)ws.close(1001,'Timeout');},4);timer.unref();
 // Give every admitted human an independently measured WebSocket round-trip
 // without trusting claimed ping values or revealing cross-room identities.
 const latencyTimer=setInterval(()=>{
  const now=Date.now();
  for(const r of rooms.values()){
   const samples=[];
   for(const [id,ws] of r.sockets){
    if(ws.readyState!==1)continue;
    if(!ws.pendingLatency||now-ws.pendingLatency.at>10000){
     const nonce=crypto.randomBytes(12).toString('hex');
     ws.pendingLatency={nonce,at:now};
     send(ws,{type:'latencyProbe',nonce});
    }
    if(samples.length<256){
     const age=now-(ws.measuredLatencyAt||0);
     samples.push([id,Number.isSafeInteger(ws.measuredLatency)&&age>=0&&age<15000?ws.measuredLatency:null]);
    }
   }
   if(!samples.length)continue;
   const packet={type:'latencyRoster',samples,measuredTo:'server',truncated:r.sockets.size>256};
   for(const ws of r.sockets.values())send(ws,packet);
  }
 },5000);latencyTimer.unref();
 const close=()=>new Promise(resolve=>{
  shuttingDown=true;clearInterval(timer);clearInterval(latencyTimer);
  // Graceful WebSocket close first; do not strand shutdown forever if a raw
  // upgrade or HTTP keep-alive client ignores the closing handshake.
  for(const ws of clients)ws.close();
  for(const r of rooms.values()){for(const p of r.parked.values())clearTimeout(p.timer);r.parked.clear();r.destroy();}rooms.clear();
  const watchdog=setTimeout(()=>{
   for(const ws of clients)ws.socket.destroy();
   for(const socket of openSockets)socket.destroy();
   server.closeAllConnections?.();
  },500);
  server.close(()=>{clearTimeout(watchdog);resolve();});
 });return{server,rooms,close,listen:(port=options.port||3417,host=options.host||'127.0.0.1')=>new Promise(resolve=>server.listen(port,host,()=>resolve(server.address())))};
}
module.exports={createServer};if(require.main===module){const app=createServer();app.listen(Number(process.env.PORT)||3417,process.env.HOST||'0.0.0.0').then(a=>console.log('Fuckball headless server: http://'+a.address+':'+a.port));for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>app.close().then(()=>process.exit(0)));}
