/* One online room: players, teams, bots, match control, inputs and snapshots, on a manually stepped
   engine (FuckballHeadless). The same code runs on the Node room server and in a player's browser
   (dist/host-worker.js), so the room can move between them (peer hosting, docs/netcode-plan.md).
   exportState()/importRoomCore() carry everything the next host needs: the exact engine state, the
   room settings, every client's input timeline and the frame/snapshot counters. */
(function(root){'use strict';
const SNAPSHOT_V2=0x46423201,SNAPSHOT_V3=0x46423203,NO_SLACK=-2147483648;
function b64(bytes){if(typeof Buffer!=='undefined')return Buffer.from(bytes).toString('base64');let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));return btoa(s);}

/* opts: {hb, id, AI, Netcode, v3=true, send(clientId, objectOrUint8Array), canSend(clientId)} */
function createRoomCore(opts){
 const {hb,AI,Netcode}=opts,send=opts.send,canSend=opts.canSend||(()=>true),API=hb._runtime.API;
 const r={id:opts.id,hb,clients:new Map(),owner:0,nextId:1,botIds:new Set(),mode:'4v4',difficulty:'hard',botLevels:{},teamProfile:{},started:false,paused:false,seq:0,tick:0,frame:0,v3:opts.v3!==false,benches:new Map(),pendingSubs:new Map(),subSeq:0,captains:new Map(),activeFrames:new Map(),subEvents:[]};
 const broadcast=data=>{for(const id of r.clients.keys())send(id,data);};
 // Expired consent requests must never hold a side's substitution slot forever.
 // This cleanup also applies to accepted requests waiting for a later pause.
 function expireSubs(now=Date.now()){let changed=false;for(const [team,p]of r.pendingSubs)if(!Number.isFinite(p.expiresAt)||now>p.expiresAt){r.pendingSubs.delete(team);changed=true;}return changed;}
 hb.onGameTick=()=>{r.tick++;if(!r.started||r.paused)return;if(r.tick%2===0)for(const p of hb._room.state.players)if(r.botIds.has(p.id))hb.setPlayerInput(p.id,AI.tactical(hb._room.state,p.id,r.tick,{difficulty:r.botLevels[p.id]||r.difficulty,profile:r.teamProfile}));};
 hb.onTeamGoal=team=>broadcast({type:'goal',team});hb.onTeamVictory=()=>{r.started=false;status();snapshot();};
 function status(){expireSubs();broadcast({type:'status',started:r.started,paused:r.paused});broadcast({type:'room',room:r.id,owner:r.owner,mode:r.mode,difficulty:r.difficulty,botLevels:r.botLevels,botIds:[...r.botIds],players:r.clients.size,map:hb._room.state.stadium.name,benches:[...r.benches],captains:[...r.captains],activeFrames:[...r.activeFrames],recentSubs:r.subEvents.slice(-8),pendingSubs:[...r.pendingSubs.values()].map(s=>({team:s.team,outId:s.outId,inId:s.inId,requestedBy:s.requestedBy,requestId:s.requestId,expiresAt:s.expiresAt,accepted:s.accepted}))});}
 // The same preflight is required for BOTH match configuration and live
 // difficulty changes. Never mutate a running room before reading user data.
 function normalizeProfile(raw){
  if(raw!==undefined&&(raw===null||typeof raw!=='object'||Array.isArray(raw)))throw Error('Invalid team profile.');
  try{return AI.profile(raw||{});}catch{throw Error('Invalid team profile.');}
 }
 // Unknown bot IDs are ignored for compatibility with clients that cache
 // old bot rosters. An existing bot cannot receive a prototype-inherited or
 // malformed difficulty: reject BEFORE changing any live settings.
 function normalizeBotLevels(raw){
  if(raw!==undefined&&raw!==null&&(typeof raw!=='object'||Array.isArray(raw)))throw Error('Invalid bot levels.');
  const levels={};
  for(const [bid,level]of Object.entries(raw||{}))if(r.botIds.has(Number(bid))){
   if(typeof level!=='string'||!Object.hasOwn(AI.levels,level))throw Error('Invalid bot levels.');
   levels[bid]=level;
  }
  return levels;
 }
 function roomBytes(){return API.Replay.writeAll(Object.assign(new API.Replay.ReplayData(),{roomData:hb._room.takeSnapshot(),events:[],goalMarkers:[],totalFrames:0,version:3}));}
 /* Snapshot header v2: magic, seq, ack, frame. v3 adds the input slack in 1/1000 frame. */
 function snapshot(){const bytes=roomBytes();r.seq++;let v2=null,v3=null;
  for(const [id,c]of r.clients){if(!canSend(id))continue;
   if(c.timeline){if(!v3){v3=new Uint8Array(bytes.length+20);const h=new DataView(v3.buffer);h.setUint32(0,SNAPSHOT_V3);h.setUint32(4,r.seq);h.setUint32(12,r.frame>>>0);v3.set(bytes,20);}const h=new DataView(v3.buffer),slack=c.timeline.takeSlack();h.setUint32(8,c.timeline.appliedSeq>>>0);h.setInt32(16,Number.isFinite(slack)?Math.round(Math.max(-1e6,Math.min(1e6,slack))*1000):NO_SLACK);send(id,v3.slice());continue;}
   if(!v2){v2=new Uint8Array(bytes.length+16);const h=new DataView(v2.buffer);h.setUint32(0,SNAPSHOT_V2);h.setUint32(4,r.seq);h.setUint32(12,r.frame>>>0);v2.set(bytes,16);}new DataView(v2.buffer).setUint32(8,c.lastInputSeq||0);send(id,v2.slice());}}
 // Bots fill each team up to the mode size. A full refill happens when the
 // host picks a team setup; joins/leaves only top up or trim, so teams the
 // host arranged by dragging survive restarts.
 function addBot(team){let id=100;const used=new Set(hb._room.state.players.map(p=>p.id));while(used.has(id))id++;hb.addPlayer(id,'AI '+(id-99),team);r.botIds.add(id);hb._room.state.players.find(p=>p.id===id).aiControlled=true;}
 function bots(refill=true){const size=r.mode==='4v4'?4:r.mode==='2v2'?2:1;if(refill)for(const p of [...hb._room.state.players])if(r.botIds.has(p.id)){hb._room.playerLeave(p.id);r.botIds.delete(p.id);}for(const team of [1,2]){const list=hb.getPlayerList().filter(p=>p.team===team);for(let i=list.length;i<size;i++)addBot(team);if(!refill)for(const p of list.filter(p=>r.botIds.has(p.id)).slice(0,Math.max(0,list.length-size))){hb._room.playerLeave(p.id);r.botIds.delete(p.id);}}for(const p of hb._room.state.players)p.aiControlled=r.botIds.has(p.id);}
 function reset(start=true){r.pendingSubs.clear();r.activeFrames.clear();r.subEvents.length=0;hb.stopGame();hb.startGame();r.started=start;r.paused=false;hb.pauseGame(!start);status();snapshot();}
 /* id: unique client/player id, chosen by the server and never reused for a bot. */
 function join(id,{name='Player',netcode=2,account=null}={}){if(r.botIds.has(id))throw Error('Player ID already in use.');if(r.clients.has(id))throw Error('Already in this room.');
  const c={name:String(name||'Player').slice(0,25),timeline:r.v3&&netcode===3?Netcode.createInputTimeline():null,lastInputSeq:0};r.clients.set(id,c);r.nextId=Math.max(r.nextId,id+1);if(!r.owner)r.owner=id;
  const red=hb.getPlayerList().filter(p=>!r.botIds.has(p.id)&&p.team===1).length,blue=hb.getPlayerList().filter(p=>!r.botIds.has(p.id)&&p.team===2).length;
  // Connected clients are unlimited, but only four HUMANS may be active per
  // side. Extra participants start on the spectator/bench slot (team 0).
  // bots(false) below yields a bot slot to an admitted human immediately.
  const assigned=red>=4&&blue>=4?0:red>=4?2:blue>=4?1:red<=blue?1:2;
  hb.addPlayer(id,c.name,assigned);
  send(id,{type:'welcome',id,room:r.id,owner:r.owner,name:c.name,account:account||null,netcode:c.timeline?3:2});if(r.clients.size>4)r.mode='4v4';else if(r.clients.size>2&&r.mode==='bot')r.mode='2v2';bots(false);if(!hb._room.gameState)reset(r.started);else{status();snapshot();}return id;}
 /* Returns true when the room is now empty. */
 function leave(id){if(!r.clients.delete(id))return !r.clients.size;r.benches.delete(id);for(const [team,captain]of r.captains)if(captain===id)r.captains.delete(team);for(const [team,p]of r.pendingSubs)if(p.inId===id||p.outId===id||p.requestedBy===id)r.pendingSubs.delete(team);hb._room.playerLeave(id);if(!r.clients.size)return true;if(r.owner===id)r.owner=r.clients.keys().next().value;bots(false);status();snapshot();return false;}
 // An approved substitute executes only while the game is stopped/paused.
 // It changes team slots atomically in one JavaScript turn: no score, clock,
 // session id, room id or physics state reset.
 function completeSub(team){
  const p=r.pendingSubs.get(team);if(!p||!p.accepted)return false;
  if(r.started&&!r.paused)return false;
  const valid=Date.now()<=p.expiresAt&&r.clients.has(p.inId)&&r.clients.has(p.outId)&&
   r.clients.has(p.requestedBy)&&(p.requestedBy===r.owner||r.captains.get(team)===p.requestedBy)&&
   r.benches.get(p.inId)===team&&hb.getPlayer(p.inId)?.team===0&&hb.getPlayer(p.outId)?.team===team;
  r.pendingSubs.delete(team);
  if(!valid)return false;
  hb.setPlayerTeam(p.outId,0);hb.setPlayerTeam(p.inId,team);
  if(r.captains.get(team)===p.outId)r.captains.delete(team);
  r.benches.delete(p.inId);r.benches.set(p.outId,team);
  const event={team,outId:p.outId,inId:p.inId,requestedBy:p.requestedBy,requestId:p.requestId,frame:r.frame};
  r.subEvents.push(event);if(r.subEvents.length>128)r.subEvents.shift();
  broadcast({type:'subApplied',...event});
  return true;
 }
 function message(id,d,hostTime=r.frame){const c=r.clients.get(id);if(!c)throw Error('Join a room first.');
  if(d.type==='in'){if(!c.timeline||!Array.isArray(d.c)||d.c.length>64)throw Error('Invalid input.');c.timeline.receive(d.c,r.frame,hostTime);return;}
  if(d.type==='input'){if(c.timeline)throw Error('Invalid input.');if(!Number.isInteger(d.value)||d.value<0||d.value>31)throw Error('Invalid input.');hb.setPlayerInput(id,d.value);if(Number.isInteger(d.seq)&&d.seq>=0&&d.seq<=0xffffffff)c.lastInputSeq=d.seq;return;}
  if(d.type==='chat'){const name=hb.getPlayer(id)?.name||'Player';for(const peer of r.clients.keys())if(peer!==id)send(peer,{type:'chat',text:name+': '+String(d.text||'').replace(/^.*?: /,'').slice(0,140)});return;}
  // Consent comes from the named incoming human's own authenticated socket,
  // never from a host-provided arbitrary player id or client-supplied admin flag.
  if(d.type==='subAccept'){
   if(!Number.isSafeInteger(d.team)||!Number.isSafeInteger(d.outId)||!Number.isSafeInteger(d.requestId)||d.requestId<1||![1,2].includes(d.team)||typeof d.accept!=='boolean')throw Error('Invalid substitution consent.');
   expireSubs();const p=r.pendingSubs.get(d.team);
   if(!p||p.inId!==id||p.outId!==d.outId||p.requestId!==d.requestId)throw Error('No current substitution for this player.');
   if(!d.accept)r.pendingSubs.delete(d.team);
   else{if(p.accepted)throw Error('Substitution already accepted.');p.accepted=true;completeSub(d.team);}
   status();snapshot();return;
  }
  if(d.type==='subRequest'){
   if(!Number.isSafeInteger(d.outId)||!Number.isSafeInteger(d.inId)||d.outId===d.inId||!r.clients.has(d.outId)||!r.clients.has(d.inId))throw Error('Invalid substitution participants.');
   const team=hb.getPlayer(d.outId)?.team;
   if(r.owner!==id&&r.captains.get(team)!==id)throw Error('Only host or own-team captain may request a substitution.');
   if(![1,2].includes(team)||hb.getPlayer(d.inId)?.team!==0||r.benches.get(d.inId)!==team)throw Error('Incoming player must be on the outgoing team bench.');
   expireSubs();if(r.pendingSubs.has(team))throw Error('Substitution already pending for this side.');
   if(!Number.isSafeInteger(r.subSeq+1))throw Error('Substitution request sequence exhausted.');
   r.pendingSubs.set(team,{team,outId:d.outId,inId:d.inId,requestedBy:id,requestId:++r.subSeq,accepted:false,expiresAt:Date.now()+60000});
   status();return;
  }
  if(r.owner!==id)throw Error('Only the host can change the match.');
  // Preserve existing host-controlled live-room setup for legacy rooms, but
  // an in-progress nominated swap cannot be bypassed by a direct roster edit.
  // Wider live-lineup policy belongs to reviewed referee/rules UX, not this fix.
  if(r.started&&!r.paused&&r.pendingSubs.size>0&&['team','swap','specAll','addBot','removeBot'].includes(d.type))
   throw Error('Pause the match before changing the active lineup.');
  if(d.type==='appointCaptain'){
   if(!Number.isSafeInteger(d.team)||![1,2].includes(d.team)||!Number.isSafeInteger(d.id)||d.id<0)throw Error('Invalid captain assignment.');
   if(d.id!==0&&(!r.clients.has(d.id)||hb.getPlayer(d.id)?.team!==d.team))throw Error('Captain must be a connected active player on that team.');
   const previous=r.captains.get(d.team);
   if(d.id===0)r.captains.delete(d.team);else r.captains.set(d.team,d.id);
   if(previous!==d.id)for(const [side,p]of r.pendingSubs)if(p.requestedBy===previous&&side===d.team)r.pendingSubs.delete(side);
   status();return;
  }
  if(d.type==='bench'){
   if(!Number.isSafeInteger(d.id)||!Number.isSafeInteger(d.team)||![0,1,2].includes(d.team)||!r.clients.has(d.id)||hb.getPlayer(d.id)?.team!==0)throw Error('Only inactive connected humans may join a bench.');
   for(const [team,p]of r.pendingSubs)if(p.inId===d.id||p.outId===d.id)r.pendingSubs.delete(team);
   if(d.team===0)r.benches.delete(d.id);else r.benches.set(d.id,d.team);
   status();return;
  }
  if(d.type==='difficulty'){if(typeof d.difficulty!=='string'||!Object.hasOwn(AI.levels,d.difficulty))throw Error('Invalid difficulty.');const profile=normalizeProfile(d.teamProfile);const levels=normalizeBotLevels(d.botLevels);r.difficulty=d.difficulty;r.botLevels=levels;r.teamProfile=profile;status();return;}
  if(d.type==='team'){const pid=Number(d.id),team=Number(d.team);if(![0,1,2].includes(team)||!hb.getPlayer(pid))throw Error('Invalid player.');
   if(team!==0&&hb.getPlayer(pid).team!==team&&hb.getPlayerList().filter(p=>p.team===team&&p.id!==pid).length>=4)throw Error('Team is full; move an active player to the bench first.');
   const previous=hb.getPlayer(pid).team;for(const [side,p]of r.pendingSubs)if(p.inId===pid||p.outId===pid)r.pendingSubs.delete(side);
   if(team!==previous&&r.captains.get(previous)===pid)r.captains.delete(previous);
   hb.setPlayerTeam(pid,team);
   if(team===0&&[1,2].includes(previous)&&r.clients.has(pid))r.benches.set(pid,previous);
   else if(team!==0)r.benches.delete(pid);
   status();snapshot();return;}
  if(d.type==='swap'){r.pendingSubs.clear();for(const p of hb.getPlayerList())if(p.team)hb.setPlayerTeam(p.id,3-p.team);for(const [pid,team]of r.benches)r.benches.set(pid,3-team);r.captains=new Map([...r.captains].map(([team,cid])=>[3-team,cid]));status();snapshot();return;}
  if(d.type==='specAll'){r.pendingSubs.clear();r.captains.clear();for(const p of hb.getPlayerList())if(p.team){if(r.clients.has(p.id))r.benches.set(p.id,p.team);hb.setPlayerTeam(p.id,0);}status();snapshot();return;}
  if(d.type==='addBot'){const team=Number(d.team);if(![0,1,2].includes(team))throw Error('Invalid team.');
   if(team!==0&&hb.getPlayerList().filter(p=>p.team===team).length>=4)throw Error('Team is full; add this bot to spectators instead.');
   addBot(team);status();snapshot();return;}
  if(d.type==='removeBot'){const bid=Number(d.id);if(!r.botIds.has(bid)||!hb.getPlayer(bid))throw Error('Invalid bot.');hb._room.playerLeave(bid);r.botIds.delete(bid);status();snapshot();return;}
  if(d.type==='start')reset(true);else if(d.type==='stop'){r.pendingSubs.clear();r.started=false;r.paused=false;hb.pauseGame(true);status();snapshot();}else if(d.type==='pause'){r.paused=!!d.value;hb.pauseGame(r.paused);if(r.paused)for(const side of [...r.pendingSubs.keys()])completeSub(side);status();snapshot();}else if(d.type==='configure'){
   const mode=d.mode==null?r.mode:d.mode;if(!['bot','2v2','4v4'].includes(mode))throw Error('Choose 1v1, 2v2 or 4v4.');let parsed=null;if(d.stadium!=null){if(typeof d.stadium!=='string'||!d.stadium.trim()||d.stadium.length>2*1024*1024)throw Error('Invalid stadium.');
    // Native parser failures can be strings, null or implementation details.
    // Fail closed with a fixed message, before touching any live match state.
    try{parsed=API.Utils.parseStadium(d.stadium);}catch{throw Error('Invalid stadium.');}
    if(!parsed)throw Error('Invalid stadium.');}
   for(const key of ['scoreLimit','timeLimit'])if(d[key]!=null&&(!Number.isInteger(d[key])||d[key]<0||d[key]>99))throw Error('Invalid limit.');
   // Do not interrupt an ongoing game before the same validated profile preflight.
   const nextProfile=normalizeProfile(d.teamProfile);
   const nextLevels=normalizeBotLevels(d.botLevels);
   if(d.difficulty!=null&&(typeof d.difficulty!=='string'||!Object.hasOwn(AI.levels,d.difficulty)))throw Error('Invalid difficulty.');
   const modeChanged=mode!==r.mode;hb.stopGame();if(parsed)hb._room.setCurrentStadium(parsed,0);if(d.scoreLimit!=null)hb.setScoreLimit(d.scoreLimit);if(d.timeLimit!=null)hb.setTimeLimit(d.timeLimit);r.mode=mode;if(typeof d.difficulty==='string'&&Object.hasOwn(AI.levels,d.difficulty))r.difficulty=d.difficulty;r.botLevels=nextLevels;r.teamProfile=nextProfile;if(modeChanged||d.refill)bots(true);reset(typeof d.started==='boolean'?d.started:r.started);if(d.paused&&r.started){r.paused=true;hb.pauseGame(true);status();snapshot();}
  }else if(d.type==='record'){if(!hb._room.isRecording()){hb.startRecording();send(id,{type:'recordingStatus',active:true});}else{send(id,{type:'recordingStatus',active:false});const bytes=hb.stopRecording();send(id,{type:'recording',bytes:b64(bytes)});}}
 }
 /* One 60 Hz step: buffered inputs for this frame, the engine tick, then (every other frame) snapshots. */
 function step(){for(const [id,c]of r.clients)if(c.timeline){const v=c.timeline.valueAt(r.frame),p=hb._room.state.players.find(p=>p.id===id);if(p&&p.input!==v)hb.setPlayerInput(id,v);}
  // Use authoritative 60 Hz game steps, not wall clock or total socket lifetime.
  // Spectators, benches, paused frames and bots never gain human play time.
  if(r.started&&!r.paused)for(const p of hb.getPlayerList())if(r.clients.has(p.id)&&[1,2].includes(p.team))r.activeFrames.set(p.id,(r.activeFrames.get(p.id)||0)+1);
  hb.step(1);r.frame++;if(r.frame%60===0){if(expireSubs())status();if(r.started&&!r.paused)broadcast({type:'playingTime',frame:r.frame,activeFrames:[...r.activeFrames]});}if(r.frame%2===0&&r.started&&!r.paused)snapshot();}
 /* final: the room really moves (a recording cannot move with it); standby copies leave it running. */
 function exportState({final=true}={}){const recording=hb._room.isRecording();if(final&&recording)hb.stopRecording();
  return{v:1,recording:!final&&recording,ai:AI.memoryOf?.(hb._room.state)??null,id:r.id,frame:r.frame,seq:r.seq,tick:r.tick,owner:r.owner,nextId:r.nextId,botIds:[...r.botIds],mode:r.mode,difficulty:r.difficulty,botLevels:r.botLevels,teamProfile:r.teamProfile,started:r.started,paused:r.paused,benches:[...r.benches],captains:[...r.captains],activeFrames:[...r.activeFrames],subEvents:r.subEvents.map(e=>({...e})),subSeq:r.subSeq,
   clients:[...r.clients].map(([id,c])=>[id,{name:c.name,lastInputSeq:c.lastInputSeq,timeline:c.timeline?c.timeline.export():null}]),room:roomBytes()};}
 function restore(s){hb._room.useSnapshot(API.Replay.readAll(s.room instanceof Uint8Array?s.room:Uint8Array.from(s.room)).roomData);
  for(const k of ['frame','seq','tick','owner','nextId','mode','difficulty','botLevels','teamProfile','started','paused'])r[k]=s[k];r.clients.clear();r.benches.clear();r.captains.clear();r.activeFrames.clear();r.subEvents.length=0;r.pendingSubs.clear();r.subSeq=Number.isSafeInteger(s.subSeq)&&s.subSeq>=0?s.subSeq:0;const humanIds=new Set((s.clients||[]).map(([id])=>id));
  // Legacy states can omit botIds; their connected client roster still proves
  // which high numeric IDs are people. New exports carry explicit bot IDs.
  r.botIds=new Set(Array.isArray(s.botIds)?s.botIds:hb._room.state.players.filter(p=>p.id>=100&&!humanIds.has(p.id)).map(p=>p.id));
  // Numeric player IDs are NOT AI identities: a persistent room can admit
  // real humans with IDs >= 100. Restore only the authoritative bot membership
  // from the exported room, never infer it from an id threshold.
  for(const p of hb._room.state.players)p.aiControlled=r.botIds.has(p.id);AI.setMemory?.(hb._room.state,s.ai);
  for(const [id,c]of s.clients){const timeline=c.timeline?Netcode.createInputTimeline():null;if(timeline)timeline.import(c.timeline);r.clients.set(id,{name:c.name,lastInputSeq:c.lastInputSeq|0,timeline});}for(const entry of s.benches||[])if(Array.isArray(entry)&&entry.length===2&&r.clients.has(entry[0])&&[1,2].includes(entry[1])&&hb.getPlayer(entry[0])?.team===0)r.benches.set(entry[0],entry[1]);for(const entry of s.captains||[])if(Array.isArray(entry)&&entry.length===2&&[1,2].includes(entry[0])&&r.clients.has(entry[1])&&hb.getPlayer(entry[1])?.team===entry[0])r.captains.set(entry[0],entry[1]);for(const entry of s.activeFrames||[])if(Array.isArray(entry)&&entry.length===2&&Number.isSafeInteger(entry[0])&&entry[0]>0&&Number.isSafeInteger(entry[1])&&entry[1]>=0&&entry[1]<=r.frame)r.activeFrames.set(entry[0],entry[1]);
  // Completed swap receipts are bounded match history, not pending authority.
  // Never restore consent grants from another browser's handover payload.
  if(Array.isArray(s.subEvents))for(const e of s.subEvents.slice(-128))
   if(e&&[1,2].includes(e.team)&&[e.outId,e.inId,e.requestedBy,e.requestId].every(n=>Number.isSafeInteger(n)&&n>0)&&
      e.outId!==e.inId&&Number.isSafeInteger(e.frame)&&e.frame>=0&&e.frame<=r.frame)
    r.subEvents.push({team:e.team,outId:e.outId,inId:e.inId,requestedBy:e.requestedBy,requestId:e.requestId,frame:e.frame});
 }
 return Object.assign(r,{status,snapshot,join,leave,message,step,exportState,restore,bots,reset,
  hostTime:fraction=>r.frame+Math.max(0,Math.min(1,fraction||0)),
  pong:(t,fraction)=>({type:'pong',t,frame:r.frame+Math.max(0,Math.min(1,fraction||0))}),
  destroy:()=>hb.destroy()});
}
/* A room continuing from an exported state on a new engine (`hb` must have no players yet). */
function importRoomCore(state,opts){const core=createRoomCore({...opts,id:state.id});core.restore(state);return core;}
/* JSON-safe form of an export (room bytes as base64), for WebSocket transport. */
function encodeState(s){return{...s,room:b64(s.room)};}
function decodeState(s){if(typeof s.room!=='string')return s;let bytes;if(typeof Buffer!=='undefined')bytes=Uint8Array.from(Buffer.from(s.room,'base64'));else{const bin=atob(s.room);bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);}return{...s,room:bytes};}
root.FuckballRoomCore={createRoomCore,importRoomCore,encodeState,decodeState,SNAPSHOT_V2,SNAPSHOT_V3};if(typeof module!=='undefined')module.exports=root.FuckballRoomCore;
})(typeof globalThis!=='undefined'?globalThis:this);
