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
 const r={id:opts.id,hb,clients:new Map(),owner:0,nextId:1,mode:'4v4',difficulty:'hard',botLevels:{},teamProfile:{},started:false,paused:false,seq:0,tick:0,frame:0,v3:opts.v3!==false};
 const broadcast=data=>{for(const id of r.clients.keys())send(id,data);};
 hb.onGameTick=()=>{r.tick++;if(!r.started||r.paused)return;if(r.tick%2===0)for(const p of hb._room.state.players)if(p.id>=100)hb.setPlayerInput(p.id,AI.tactical(hb._room.state,p.id,r.tick,{difficulty:r.botLevels[p.id]||r.difficulty,profile:r.teamProfile}));};
 hb.onTeamGoal=team=>broadcast({type:'goal',team});hb.onTeamVictory=()=>{r.started=false;status();snapshot();};
 function status(){broadcast({type:'status',started:r.started,paused:r.paused});broadcast({type:'room',room:r.id,owner:r.owner,mode:r.mode,difficulty:r.difficulty,botLevels:r.botLevels,players:r.clients.size,map:hb._room.state.stadium.name});}
 function roomBytes(){return API.Replay.writeAll(Object.assign(new API.Replay.ReplayData(),{roomData:hb._room.takeSnapshot(),events:[],goalMarkers:[],totalFrames:0,version:3}));}
 /* Snapshot header v2: magic, seq, ack, frame. v3 adds the input slack in 1/1000 frame. */
 function snapshot(){const bytes=roomBytes();r.seq++;let v2=null,v3=null;
  for(const [id,c]of r.clients){if(!canSend(id))continue;
   if(c.timeline){if(!v3){v3=new Uint8Array(bytes.length+20);const h=new DataView(v3.buffer);h.setUint32(0,SNAPSHOT_V3);h.setUint32(4,r.seq);h.setUint32(12,r.frame>>>0);v3.set(bytes,20);}const h=new DataView(v3.buffer),slack=c.timeline.takeSlack();h.setUint32(8,c.timeline.appliedSeq>>>0);h.setInt32(16,Number.isFinite(slack)?Math.round(Math.max(-1e6,Math.min(1e6,slack))*1000):NO_SLACK);send(id,v3.slice());continue;}
   if(!v2){v2=new Uint8Array(bytes.length+16);const h=new DataView(v2.buffer);h.setUint32(0,SNAPSHOT_V2);h.setUint32(4,r.seq);h.setUint32(12,r.frame>>>0);v2.set(bytes,16);}new DataView(v2.buffer).setUint32(8,c.lastInputSeq||0);send(id,v2.slice());}}
 // Bots fill each team up to the mode size. A full refill happens when the
 // host picks a team setup; joins/leaves only top up or trim, so teams the
 // host arranged by dragging survive restarts.
 function addBot(team){let id=100;const used=new Set(hb._room.state.players.map(p=>p.id));while(used.has(id))id++;if(id>=1000)throw Error('Too many bots.');hb.addPlayer(id,'AI '+(id-99),team);hb._room.state.players.find(p=>p.id===id).aiControlled=true;}
 function bots(refill=true){const size=r.mode==='4v4'?4:r.mode==='2v2'?2:1;if(refill)for(const p of [...hb._room.state.players])if(p.id>=100)hb._room.playerLeave(p.id);for(const team of [1,2]){const list=hb.getPlayerList().filter(p=>p.team===team);for(let i=list.length;i<size;i++)addBot(team);if(!refill)for(const p of list.filter(p=>p.id>=100).slice(0,Math.max(0,list.length-size)))hb._room.playerLeave(p.id);}for(const p of hb._room.state.players)p.aiControlled=p.id>=100;}
 function reset(start=true){hb.stopGame();hb.startGame();r.started=start;r.paused=false;hb.pauseGame(!start);status();snapshot();}
 /* id: client/player id (< 100), chosen by the room server so it stays the same on every host. */
 function join(id,{name='Player',netcode=2}={}){if(r.clients.size>=8)throw Error('Room is full.');if(r.clients.has(id))throw Error('Already in this room.');
  const c={name:String(name||'Player').slice(0,25),timeline:r.v3&&netcode===3?Netcode.createInputTimeline():null,lastInputSeq:0};r.clients.set(id,c);r.nextId=Math.max(r.nextId,id+1);if(!r.owner)r.owner=id;
  const red=hb.getPlayerList().filter(p=>p.id<100&&p.team===1).length,blue=hb.getPlayerList().filter(p=>p.id<100&&p.team===2).length;hb.addPlayer(id,c.name,red<=blue?1:2);
  send(id,{type:'welcome',id,room:r.id,owner:r.owner,netcode:c.timeline?3:2});if(r.clients.size>4)r.mode='4v4';else if(r.clients.size>2&&r.mode==='bot')r.mode='2v2';bots(false);if(!hb._room.gameState)reset(r.started);else{status();snapshot();}return id;}
 /* Returns true when the room is now empty. */
 function leave(id){if(!r.clients.delete(id))return !r.clients.size;hb._room.playerLeave(id);if(!r.clients.size)return true;if(r.owner===id)r.owner=r.clients.keys().next().value;bots(false);status();snapshot();return false;}
 function message(id,d,hostTime=r.frame){const c=r.clients.get(id);if(!c)throw Error('Join a room first.');
  if(d.type==='in'){if(!c.timeline||!Array.isArray(d.c)||d.c.length>64)throw Error('Invalid input.');c.timeline.receive(d.c,r.frame,hostTime);return;}
  if(d.type==='input'){if(c.timeline)throw Error('Invalid input.');if(!Number.isInteger(d.value)||d.value<0||d.value>31)throw Error('Invalid input.');hb.setPlayerInput(id,d.value);if(Number.isInteger(d.seq)&&d.seq>=0&&d.seq<=0xffffffff)c.lastInputSeq=d.seq;return;}
  if(d.type==='chat'){const name=hb.getPlayer(id)?.name||'Player';for(const peer of r.clients.keys())if(peer!==id)send(peer,{type:'chat',text:name+': '+String(d.text||'').replace(/^.*?: /,'').slice(0,140)});return;}
  if(r.owner!==id)throw Error('Only the host can change the match.');
  if(d.type==='difficulty'){if(!AI.levels[d.difficulty])throw Error('Invalid difficulty.');r.difficulty=d.difficulty;r.botLevels={};for(const [bid,level]of Object.entries(d.botLevels||{}))if(Number(bid)>=100&&AI.levels[level])r.botLevels[bid]=level;r.teamProfile=AI.profile(d.teamProfile);status();return;}
  if(d.type==='team'){const pid=Number(d.id),team=Number(d.team);if(![0,1,2].includes(team)||!hb.getPlayer(pid))throw Error('Invalid player.');hb.setPlayerTeam(pid,team);status();snapshot();return;}
  if(d.type==='addBot'){const team=Number(d.team);if(![0,1,2].includes(team))throw Error('Invalid team.');if(hb._room.state.players.length>=16)throw Error('Room is full (16 players).');addBot(team);status();snapshot();return;}
  if(d.type==='removeBot'){const bid=Number(d.id);if(!(bid>=100)||!hb.getPlayer(bid))throw Error('Invalid bot.');hb._room.playerLeave(bid);status();snapshot();return;}
  if(d.type==='start')reset(true);else if(d.type==='stop'){r.started=false;r.paused=false;hb.pauseGame(true);status();snapshot();}else if(d.type==='pause'){r.paused=!!d.value;hb.pauseGame(r.paused);status();snapshot();}else if(d.type==='configure'){
   const mode=d.mode||r.mode;if(!['bot','2v2','4v4'].includes(mode))throw Error('Choose 1v1, 2v2 or 4v4.');let parsed=null;if(d.stadium){if(typeof d.stadium!=='string'||d.stadium.length>2*1024*1024)throw Error('Stadium too large.');parsed=API.Utils.parseStadium(d.stadium);if(!parsed)throw Error('Invalid stadium.');}
   for(const key of ['scoreLimit','timeLimit'])if(d[key]!=null&&(!Number.isInteger(d[key])||d[key]<0||d[key]>99))throw Error('Invalid limit.');const modeChanged=mode!==r.mode;hb.stopGame();if(parsed)hb._room.setCurrentStadium(parsed,0);if(d.scoreLimit!=null)hb.setScoreLimit(d.scoreLimit);if(d.timeLimit!=null)hb.setTimeLimit(d.timeLimit);r.mode=mode;if(AI.levels[d.difficulty])r.difficulty=d.difficulty;r.botLevels={};for(const [bid,level]of Object.entries(d.botLevels||{}))if(Number(bid)>=100&&AI.levels[level])r.botLevels[bid]=level;r.teamProfile=AI.profile(d.teamProfile);if(modeChanged||d.refill)bots(true);reset(typeof d.started==='boolean'?d.started:r.started);if(d.paused&&r.started){r.paused=true;hb.pauseGame(true);status();snapshot();}
  }else if(d.type==='record'){if(!hb._room.isRecording()){hb.startRecording();send(id,{type:'recordingStatus',active:true});}else{send(id,{type:'recordingStatus',active:false});const bytes=hb.stopRecording();send(id,{type:'recording',bytes:b64(bytes)});}}
 }
 /* One 60 Hz step: buffered inputs for this frame, the engine tick, then (every other frame) snapshots. */
 function step(){for(const [id,c]of r.clients)if(c.timeline){const v=c.timeline.valueAt(r.frame),p=hb._room.state.players.find(p=>p.id===id);if(p&&p.input!==v)hb.setPlayerInput(id,v);}
  hb.step(1);r.frame++;if(r.frame%2===0&&r.started&&!r.paused)snapshot();}
 /* final: the room really moves (a recording cannot move with it); standby copies leave it running. */
 function exportState({final=true}={}){const recording=hb._room.isRecording();if(final&&recording)hb.stopRecording();
  return{v:1,recording:!final&&recording,ai:AI.memoryOf?.(hb._room.state)??null,id:r.id,frame:r.frame,seq:r.seq,tick:r.tick,owner:r.owner,nextId:r.nextId,mode:r.mode,difficulty:r.difficulty,botLevels:r.botLevels,teamProfile:r.teamProfile,started:r.started,paused:r.paused,
   clients:[...r.clients].map(([id,c])=>[id,{name:c.name,lastInputSeq:c.lastInputSeq,timeline:c.timeline?c.timeline.export():null}]),room:roomBytes()};}
 function restore(s){hb._room.useSnapshot(API.Replay.readAll(s.room instanceof Uint8Array?s.room:Uint8Array.from(s.room)).roomData);
  for(const k of ['frame','seq','tick','owner','nextId','mode','difficulty','botLevels','teamProfile','started','paused'])r[k]=s[k];r.clients.clear();
  // Not part of the engine snapshot: which players the room's AI controls, and the AI's tactical memory.
  for(const p of hb._room.state.players)p.aiControlled=p.id>=100;AI.setMemory?.(hb._room.state,s.ai);
  for(const [id,c]of s.clients){const timeline=c.timeline?Netcode.createInputTimeline():null;if(timeline)timeline.import(c.timeline);r.clients.set(id,{name:c.name,lastInputSeq:c.lastInputSeq|0,timeline});}}
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
