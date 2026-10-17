'use strict';
// 4v4 match statistics for policy A against policy B on the duel harness
// (mirrored sides per seed, BFF and Classic, elite): goals, wins, touches
// passed between teammates, possession lost and shots on target.
// A "pass" is a touch by a different teammate after ours; it is a proxy and
// also counts accidental deflections.
//   node training/match-stats.cjs <policyA.js> <policyB.js> [matches=192] [workers=4]
const path=require('node:path'),{fork}=require('node:child_process');
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function play(A,B,from,to){
 const {makeRoom}=require('./selfplay.cjs'),S={matches:0,goals:0,conceded:0,wins:0,losses:0,passesA:0,passesB:0,lostA:0,lostB:0,shotsA:0,shotsB:0,bff:[0,0],classic:[0,0]};
 for(let i=from;i<to;i++){const pair=Math.floor(i/2),side=i%2+1,map=pair%2?'Classic':'BFF',env=makeRoom(),r=env.room,random=rng(5000+pair);
  try{
   r.setCurrentStadium(env.map(map),0);r.setScoreLimit(0,0);r.setTimeLimit(0,0);for(let k=1;k<=8;k++){r.playerJoin(k,'Bot '+k,'',String(k),'','');r.setPlayerTeam(k,k<=4?1:2,0);}r.startGame(0);env.step(2);
   for(const p of r.state.players){p.aiControlled=true;r.state.updatePlayer(p.id,{pos:[p.disc.pos.x,p.disc.pos.y+(random()-.5)*40],speed:[0,0]});}
   const goal=r.gameState.stadium.goals[0],goalX=Math.abs(goal.p0.x),mouth=Math.abs(goal.p0.y-goal.p1.y)/2;let last=null;
   for(let t=0;t<3600;t++){
    if(t%2===0)for(const p of r.state.players){const M=p.team.id===side?A:B;r.playerInput(M.tactical(r.state,p.id,t,{difficulty:'elite'}),p.id);}
    const b=r.gameState.physicsState.discs[0],bvx=b.speed.x,bvy=b.speed.y;env.step(1);const b2=r.gameState.physicsState.discs[0];
    if(Math.hypot(b2.speed.x-bvx*.99,b2.speed.y-bvy*.99)<=.5)continue;
    const near=r.state.players.filter(p=>p.disc).map(p=>[p,Math.hypot(p.disc.pos.x-b2.pos.x,p.disc.pos.y-b2.pos.y)]).sort((a,c)=>a[1]-c[1])[0];
    if(!near||near[1]>=28)continue;const p=near[0],mine=p.team.id===side,tag=mine?'A':'B';
    if(last&&last.id!==p.id){if(last.team===p.team.id)S['passes'+tag]++;else S['lost'+(last.team===side?'A':'B')]++;}last={id:p.id,team:p.team.id};
    const s=p.team.id===1?1:-1;if(b2.speed.x*s>2){const tt=(s*goalX-b2.pos.x)/b2.speed.x;if(Math.abs(b2.pos.y+b2.speed.y*tt)<mouth)S['shots'+tag]++;}
   }
   const g=r.gameState,a=side===1?g.redScore:g.blueScore,c=side===1?g.blueScore:g.redScore,m=map==='BFF'?S.bff:S.classic;
   S.matches++;S.goals+=a;S.conceded+=c;m[0]+=a;m[1]+=c;if(a>c)S.wins++;else if(a<c)S.losses++;
  }finally{r.destroy();}}
 return S;
}
if(process.argv[2]==='--worker'){const [,,,a,b,from,to]=process.argv;process.send(play(require(path.resolve(a)),require(path.resolve(b)),+from,+to));}
else if(require.main===module){
 const [a,b]=process.argv.slice(2,4),n=Math.max(4,Number(process.argv[4]||192)),w=Math.max(1,Math.min(16,Number(process.argv[5]||4)));
 if(!a||!b){console.error('Usage: node training/match-stats.cjs <policyA.js> <policyB.js> [matches] [workers]');process.exit(2);}
 const per=Math.ceil(n/w/2)*2,jobs=[];
 for(let i=0;i<w;i++){const from=i*per,to=Math.min(n,from+per);if(from>=to)continue;jobs.push(new Promise((res,rej)=>{const c=fork(__filename,['--worker',a,b,from,to]);c.on('message',res);c.on('exit',code=>code&&rej(Error('worker failed')));}));}
 Promise.all(jobs).then(parts=>{const T=parts.reduce((s,p)=>{for(const k of Object.keys(p))s[k]=Array.isArray(p[k])?(s[k]||[0,0]).map((v,i)=>v+p[k][i]):(s[k]||0)+p[k];return s;},{});console.log(JSON.stringify({policyA:a,policyB:b,...T,draws:T.matches-T.wins-T.losses}));}).catch(e=>{console.error(e);process.exitCode=1;});
}
module.exports={play};
