/* HBInit-style wrapper around one engine room, shared by the Node room server (headless/runtime.cjs)
   and the browser host worker (dist/host-worker.js). `runtime` = {API, advance(frames)} where advance
   moves the engine's injected clock by whole 60 Hz frames, so stepping is exact and manual. */
(function(root){'use strict';
function createHeadless(runtime,options={}){const {API}=runtime;const callbacks={},host={};const player=p=>p?({id:p.id,name:p.name,team:p.team.id,admin:!!p.isAdmin,input:p.input||0,position:p.disc?{...p.disc.pos}:null,avatar:p.avatar,auth:p.auth,conn:p.conn}):null;
const by=id=>player(room.state.players.find(p=>p.id===id));
for(const name of ['onGameTick','onTeamGoal','onPositionsReset'])callbacks[name]=(...args)=>host[name]?.(...args);
callbacks.onPlayerJoin=p=>host.onPlayerJoin?.(player(p));
callbacks.onPlayerLeave=(p,reason,ban,byId)=>{const snapshot=player(p);host.onPlayerLeave?.(snapshot);if(reason!=null)host.onPlayerKicked?.(snapshot,reason,ban,by(byId));};
callbacks.onPlayerBallKick=id=>host.onPlayerBallKick?.(by(id));
callbacks.onPlayerTeamChange=(id,team,byId)=>host.onPlayerTeamChange?.(by(id),by(byId));
callbacks.onPlayerAdminChange=(id,admin,byId)=>host.onPlayerAdminChange?.(by(id),by(byId));
callbacks.onGameStart=id=>host.onGameStart?.(by(id));callbacks.onGameStop=id=>host.onGameStop?.(by(id));
callbacks.onGameEnd=()=>host.onTeamVictory?.(host.getScores());
callbacks.onGamePauseChange=(paused,id)=>{host[paused?'onGamePause':'onGameUnpause']?.(by(id));host.onGamePauseChange?.(paused,by(id));};
callbacks.onStadiumChange=(stadium,id)=>host.onStadiumChange?.(stadium.name,by(id));
callbacks.onKickRateLimitChange=(min,rate,burst,id)=>host.onKickRateLimitSet?.(min,rate,burst,by(id));
callbacks.onTeamsLockChange=(locked,id)=>host.onTeamsLockChange?.(locked,by(id));
callbacks.onPlayerChat=(id,msg)=>host.onPlayerChat?.(by(id),msg);
const previousInputs=new Map();callbacks.onPlayerInputChange=(id,input)=>{const prev=previousInputs.get(id)||0;previousInputs.set(id,input);host.onPlayerInput?.(by(id),prev);host.onPlayerActivity?.(by(id));};
const room=API.Room.sandbox(callbacks,{controlledPlayerId:0});
Object.assign(host,{name:options.roomName||'Fuckball headless',_room:room,_runtime:runtime,CollisionFlags:API.CollisionFlags,InputFlags:{up:1,down:2,left:4,right:8,kick:16},
 setDefaultStadium(name){const s=API.Utils.getDefaultStadiums().find(s=>s.name===name);if(!s)throw Error('Unknown stadium: '+name);room.setCurrentStadium(s,0);},setCustomStadium(text){room.setCurrentStadium(API.Utils.parseStadium(text),0);},startGame:()=>room.startGame(0),stopGame:()=>room.stopGame(0),pauseGame:p=>room.setGamePaused(!!p,0),setScoreLimit:v=>room.setScoreLimit(v,0),setTimeLimit:v=>room.setTimeLimit(v,0),setTeamsLock:v=>room.setTeamsLock(v,0),setPlayerTeam:(id,t)=>room.setPlayerTeam(id,t,0),setPlayerAdmin:(id,a)=>room.setPlayerAdmin(id,a,0),setPlayerAvatar:(id,a)=>room.setPlayerAvatar(a,id),setKickRateLimit:(a,b,c)=>room.setKickRateLimit(a,b,c,0),setTeamColors:(team,angle,text,colors)=>room.setTeamColors(team,angle,[text,...colors],0),getPlayerList:()=>room.state.players.map(player),getPlayer:id=>player(room.state.players.find(p=>p.id===id)),getBallPosition:()=>room.gameState?{...room.gameState.physicsState.discs[0].pos}:null,getScores:()=>room.gameState?{red:room.gameState.redScore,blue:room.gameState.blueScore,time:room.gameState.timeElapsed,scoreLimit:room.gameState.scoreLimit,timeLimit:room.gameState.timeLimit}:null,
 getDiscProperties(id){return flatten(room.gameState?.physicsState.discs[id]);},getPlayerDiscProperties(id){return flatten(room.state.players.find(p=>p.id===id)?.disc);},setDiscProperties:(id,p)=>room.setDiscProperties(id,0,p,0),setPlayerDiscProperties:(id,p)=>room.setDiscProperties(id,1,p,0),getDiscCount:()=>room.gameState?.physicsState.discs.length||0,
 startRecording:()=>room.startRecording(),stopRecording:()=>room.stopRecording(),sendChat:(msg,target)=>host.onAnnouncement?.(String(msg),target),sendAnnouncement:(msg,target=null,color=-1,style='normal',sound=1)=>{const styles={normal:0,bold:1,italic:2,small:3,'small-bold':4,'small-italic':5};room.sendAnnouncement(String(msg),color,styles[style]??0,sound,target,0);host.onAnnouncement?.(String(msg),target,color,style,sound);},kickPlayer:(id,reason,ban)=>room.kickPlayer(id,reason,ban,0),clearBan:()=>{},clearBans:()=>{},setPassword(){throw Error('Passwords are managed by the Fuckball room server, not the local simulation.');},setRequireRecaptcha(){throw Error('Official HaxBall hosting/recaptcha is not used by this standalone runtime.');},
 addPlayer(id,name='Bot',team=0){room.playerJoin(id,name,'',String(id),'local','local');room.setPlayerTeam(id,team,0);},setPlayerInput:(id,input)=>room.playerInput(input,id),step:runtime.advance,destroy:()=>{clearInterval(host._timer);room.destroy();},run(){if(host._timer)return host;let last=performance.now(),acc=0;host._timer=setInterval(()=>{const now=performance.now();acc+=Math.min(250,now-last);last=now;while(acc>=1000/60){runtime.advance(1);acc-=1000/60;}},4);return host;}});
if(!options.noPlayer)host.addPlayer(0,options.playerName||'Host',0);return host;
}
function flatten(d){return d?{x:d.pos.x,y:d.pos.y,xspeed:d.speed.x,yspeed:d.speed.y,xgravity:d.gravity?.x||0,ygravity:d.gravity?.y||0,radius:d.radius,bCoeff:d.bCoef,invMass:d.invMass,damping:d.damping,color:d.color,cMask:d.cMask,cGroup:d.cGroup}:null;}

/* Engine instance on an injected clock. `factory` = abcHaxballAPI, `globals` = what the engine needs from
   window (JSON5, pako, crypto, TextEncoder, ...). One instance per JS realm: two engines in the same realm
   share internal timers, so the browser runs its host engine in a worker. */
/* The clock is n·(1000/60) + 1 µs, not a running sum: summing 1000/60 drifts, and the engine then
   occasionally runs 0 or 2 ticks in one advance (about 1 in 3,000). Exactly one tick per frame keeps
   host frame numbers equal to engine ticks, which client prediction and handovers rely on. */
function createRuntime(factory,globals={}){let time=0,frames=0,seq=0;const pending=new Map();const window={...globals,performance:{now:()=>time},requestAnimationFrame:f=>{pending.set(++seq,f);return seq;},cancelAnimationFrame:id=>pending.delete(id)};window.window=window;const API=factory(window);function advance(count=1){for(let n=0;n<count;n++){time=++frames*(1000/60)+1e-3;const callbacks=[...pending.values()];pending.clear();for(const f of callbacks)f(time);}}return{API,advance,window};}
root.FuckballHeadless={createHeadless,createRuntime};if(typeof module!=='undefined')module.exports=root.FuckballHeadless;
})(typeof globalThis!=='undefined'?globalThis:this);
