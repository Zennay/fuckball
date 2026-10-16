#!/usr/bin/env node
'use strict';
// Behaviour statistics from HBR2 replays, measured the same way for humans and bots
// so the two can be compared directly:
//   node training/replay_insights.cjs out.json replay1.hbr2 [replay2.hbr2 ...]
//   node training/replay_insights.cjs --bots out.json [matches] [frames]   (tactical bots)
// Positions are mirrored so every team attacks +x and scaled by the goal-line
// distance W (goal line at ±1), so differently sized stadiums are comparable.
const fs=require('node:fs'),path=require('node:path');
const{createRuntime,HBInit}=require('../headless/runtime.cjs');

const SAMPLE=6,AFTER_RESET=90,OUTCOME=240;
function emptyAgg(){return{samples:0,games:0,kicks:[],touchesNoKick:0,keeper:{own:[],opp:[]},keeperLine:[],keeperOff:[],nearBall:[],ahead:[],support:[],stretchX:[],stretchY:[],chaserGap:[],moving:[],kickSpeed:[],passLen:[],ballSpeed:[]};}
const aggs=new Map();const agg=n=>{if(!aggs.has(n))aggs.set(n,emptyAgg());return aggs.get(n);};

function analyse(state,reader,ctx){
 const g=state.gameState,b=g?.physicsState.discs[0];if(!g||!b)return;
 const frame=reader.getCurrentFrameNo();if(frame-ctx.resetFrame<AFTER_RESET||frame%SAMPLE)return;
 const teams=[1,2].map(t=>state.players.filter(p=>p.disc&&p.team.id===t));if(teams[0].length!==teams[1].length||teams[0].length<1)return;
 const n=teams[0].length,a=agg(n),W=ctx.W;a.samples++;a.ballSpeed.push(Math.hypot(b.speed.x,b.speed.y));
 for(const t of [1,2]){const sign=t===1?1:-1,team=teams[t-1],X=p=>sign*p.disc.pos.x/W,Y=p=>p.disc.pos.y/W,bx=sign*b.pos.x/W,by=b.pos.y/W;
  const dist=p=>Math.hypot(p.disc.pos.x-b.pos.x,p.disc.pos.y-b.pos.y);
  const byDepth=team.slice().sort((p,q)=>X(p)-X(q)),keeper=byDepth[0],field=n>=3?byDepth.slice(1):team;
  const poss=ctx.lastTouchTeam===t?'own':ctx.lastTouchTeam===3-t?'opp':null;
  if(n>=3&&poss){a.keeper[poss].push(X(keeper)+1);
   // Keeper along the ball-goal line: 0 = on the goal line, 1 = at the ball; offset = distance from that line.
   const gx=-1,vx=bx-gx,vy=by,len=Math.hypot(vx,vy)||1e-9,kx=X(keeper)-gx,ky=Y(keeper);a.keeperLine.push((kx*vx+ky*vy)/(len*len));a.keeperOff.push(Math.abs(kx*vy-ky*vx)/len);}
  a.nearBall.push(team.filter(p=>dist(p)<60).length);a.ahead.push(field.filter(p=>X(p)>bx).length/field.length);
  const near=team.slice().sort((p,q)=>dist(p)-dist(q));if(near.length>1)a.support.push(Math.hypot(near[0].disc.pos.x-near[1].disc.pos.x,near[0].disc.pos.y-near[1].disc.pos.y)/W);
  if(near.length>1)a.chaserGap.push((dist(near[1])-dist(near[0]))/W);
  if(field.length>1){const xs=field.map(X),ys=field.map(Y);a.stretchX.push(Math.max(...xs)-Math.min(...xs));a.stretchY.push(Math.max(...ys)-Math.min(...ys));}
  for(const p of team)a.moving.push(Math.hypot(p.disc.speed.x,p.disc.speed.y)>1.5?1:0);
 }
}
function touch(ctx,state,reader,id,kick){const p=state.players.find(p=>p.id===id);if(!p?.disc||!(p.team.id===1||p.team.id===2))return;const frame=reader.getCurrentFrameNo(),b=state.gameState.physicsState.discs[0];
 if(!kick&&ctx.lastTouch&&ctx.lastTouch.id===id&&frame-ctx.lastTouch.frame<4){ctx.lastTouch.frame=frame;return;}
 const n=state.players.filter(q=>q.disc&&q.team.id===p.team.id).length,a=agg(n),sign=p.team.id===1?1:-1;
 // Resolve the previous kick: who touched next and how far did the ball travel.
 const k=ctx.openKick;if(k&&id!==k.id&&frame-k.frame<=OUTCOME){k.out=p.team.id===k.team?'pass':'lost';if(k.out==='pass')a.passLen.push(Math.hypot(b.pos.x-k.bx,b.pos.y-k.by)/ctx.W);ctx.openKick=null;}
 if(kick){const kk={id,team:p.team.id,frame,bx:b.pos.x,by:b.pos.y,X:sign*b.pos.x/ctx.W,goalDist:Math.hypot(sign*b.pos.x-ctx.W,b.pos.y)/ctx.W,run:Math.hypot(p.disc.speed.x,p.disc.speed.y),out:'none'};a.kicks.push(kk);ctx.openKick=kk;ctx.pendingSpeed=kk;}
 else a.touchesNoKick++;
 ctx.lastTouchTeam=p.team.id;ctx.lastTouch={id,frame};}

function readReplay(file){return new Promise(resolve=>{const API=createRuntime({realtimeClock:true}).API,data=Uint8Array.from(fs.readFileSync(file));let reader,done=false;const ctx={resetFrame:0,lastTouchTeam:0,W:1,openKick:null};
 const finish=()=>{if(done)return;done=true;clearTimeout(timer);try{reader?.destroy?.();}catch{}resolve();};
 const callbacks={
  onGameTick:()=>{const s=reader.state,g=s.gameState;if(!g)return;const goals=g.stadium.goals;ctx.W=goals.length?Math.max(...goals.map(q=>Math.abs((q.p0.x+q.p1.x)/2))):(g.stadium.width||400);
   if(ctx.pendingSpeed&&reader.getCurrentFrameNo()-ctx.pendingSpeed.frame>=2){const b=g.physicsState.discs[0];ctx.pendingSpeed.speed=Math.hypot(b.speed.x,b.speed.y);const n=s.players.filter(q=>q.disc&&q.team.id===ctx.pendingSpeed.team).length;agg(n).kickSpeed.push(ctx.pendingSpeed.speed);ctx.pendingSpeed=null;}
   analyse(s,reader,ctx);},
  onPlayerBallKick:id=>touch(ctx,reader.state,reader,id,true),
  onCollisionDiscVsDisc:(d1,p1,d2,p2)=>{if(d1===0&&p2!=null)touch(ctx,reader.state,reader,p2,false);else if(d2===0&&p1!=null)touch(ctx,reader.state,reader,p1,false);},
  onTeamGoal:team=>{if(ctx.openKick&&ctx.openKick.team===team)ctx.openKick.out='goal';else if(ctx.openKick)ctx.openKick.out='ownGoal';ctx.openKick=null;ctx.resetFrame=reader.getCurrentFrameNo()+1e9;},
  onPositionsReset:()=>{ctx.resetFrame=reader.getCurrentFrameNo();ctx.lastTouchTeam=0;ctx.openKick=null;},
  onGameStart:()=>{ctx.resetFrame=reader.getCurrentFrameNo();ctx.lastTouchTeam=0;for(const a of aggs.values())a.games+=0;},
 };
 const timer=setTimeout(finish,180000);
 try{reader=API.Replay.read(data,callbacks,{requestAnimationFrame:f=>setImmediate(()=>f(Date.now())),cancelAnimationFrame:clearImmediate});reader.onEnd=finish;reader.setSpeed(100000);}catch{finish();}});}

function recordBots(matches,frames){const AI=require('../dist/ai/policy.js'),bff=fs.readFileSync(path.join(__dirname,'../dist/stadiums/bff-big-v4.hbs'),'utf8'),files=[];
 const dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'fb-bots-'));
 for(let m=0;m<matches;m++){const hb=HBInit({noPlayer:true});hb.setCustomStadium(bff);hb.setScoreLimit(0);hb.setTimeLimit(0);for(let i=0;i<8;i++){hb.addPlayer(100+i,'AI '+i,i<4?1:2);}for(const p of hb._room.state.players)p.aiControlled=true;
  let tick=0,seed=1000+m;const rand=()=>(seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;hb.onGameTick=()=>{tick++;if(tick%2===0)for(const p of hb._room.state.players)hb.setPlayerInput(p.id,AI.tactical(hb._room.state,p.id,tick,{difficulty:'hard'}));};
  hb.startRecording();hb.startGame();hb.step(1);for(const p of hb._room.state.players)hb.setPlayerDiscProperties(p.id,{y:p.disc.pos.y+(rand()-.5)*40});hb.step(frames);const bytes=hb.stopRecording(),f=path.join(dir,'bots-'+m+'.hbr2');fs.writeFileSync(f,bytes);files.push(f);hb.destroy();}
 return files;}

const q=(a,p)=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);return +s[Math.floor(p*(s.length-1))].toFixed(3);};
const mean=a=>a.length?+(a.reduce((s,v)=>s+v,0)/a.length).toFixed(3):null;
function summary(){const out={};for(const [n,a]of [...aggs].sort((x,y)=>x[0]-y[0])){if(a.samples<200)continue;const k=a.kicks,resolved=k.filter(x=>x.out!=='none');
 const share=(list,f)=>list.length?+(list.filter(f).length/list.length).toFixed(3):null;
 out[n+'v'+n]={samples:a.samples,
  keeperDepthOwnPossession:{median:q(a.keeper.own,.5),p90:q(a.keeper.own,.9)},keeperDepthOppPossession:{median:q(a.keeper.opp,.5),p90:q(a.keeper.opp,.9)},
  keeperAlongBallGoalLine:{median:q(a.keeperLine,.5),p10:q(a.keeperLine,.1),p90:q(a.keeperLine,.9)},keeperOffLine:{median:q(a.keeperOff,.5)},
  playersWithin60OfBall:mean(a.nearBall),fieldPlayersAheadOfBall:mean(a.ahead),nearestTeammateToBallCarrier:{median:q(a.support,.5)},secondPlayerExtraDistance:{median:q(a.chaserGap,.5)},
  fieldStretchX:{median:q(a.stretchX,.5)},fieldStretchY:{median:q(a.stretchY,.5)},movingShare:mean(a.moving),ballSpeed:{median:q(a.ballSpeed,.5)},
  kicksPerMinute:+(k.length/(a.samples*SAMPLE/3600)).toFixed(2),touchesWithoutKickPerKick:+(a.touchesNoKick/Math.max(1,k.length)).toFixed(2),
  kickOutcome:{pass:share(resolved,x=>x.out==='pass'),lost:share(resolved,x=>x.out==='lost'),goal:share(resolved,x=>x.out==='goal')},
  kickRunSpeed:{median:q(k.map(x=>x.run),.5)},ballSpeedAfterKick:{median:q(a.kickSpeed,.5),p90:q(a.kickSpeed,.9)},passLength:{median:q(a.passLen,.5),p90:q(a.passLen,.9)},
  kickFieldX:{p25:q(k.map(x=>x.X),.25),median:q(k.map(x=>x.X),.5),p75:q(k.map(x=>x.X),.75)},
  goalKicks:{count:k.filter(x=>x.out==='goal').length,goalDistMedian:q(k.filter(x=>x.out==='goal').map(x=>x.goalDist),.5),goalDistP90:q(k.filter(x=>x.out==='goal').map(x=>x.goalDist),.9)},
  kicksInsideFinalQuarter:{share:share(k,x=>x.goalDist<.5),goalRate:share(k.filter(x=>x.goalDist<.5),x=>x.out==='goal')}};}
 return out;}

(async()=>{const args=process.argv.slice(2);let out,files;
 if(args[0]==='--bots'){out=args[1];files=recordBots(Number(args[2])||6,Number(args[3])||10800);}else{out=args[0];files=args.slice(1);}
 if(!out||!files.length){console.error('usage: replay_insights.cjs out.json replays... | --bots out.json [matches] [frames]');process.exit(2);}
 let i=0;for(const f of files){await readReplay(f);if(++i%25===0)console.error(i+'/'+files.length);}
 const result={replays:files.length,generatedAt:new Date().toISOString(),stats:summary()};fs.writeFileSync(out,JSON.stringify(result,null,1));console.log(JSON.stringify(result,null,1));})();
