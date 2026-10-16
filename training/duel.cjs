'use strict';
// Head-to-head 4v4 benchmark between two policy files (or two team profiles)
// on the real engine: alternating sides, BFF and Classic, fixed seeds.
//   node training/duel.cjs <policyA.js> <policyB.js> [matches=200] [frames=3600] [workers=4]
// Optional: DUEL_PROFILE_A / DUEL_PROFILE_B as JSON team profiles.
const path=require('node:path'),{fork}=require('node:child_process');
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function play(A,B,from,to,frames,pa,pb){
 const {makeRoom}=require('./selfplay.cjs'),total={goals:0,conceded:0,wins:0,losses:0,matches:0};
 for(let i=from;i<to;i++){const side=i%2+1,map=i%4<2?'BFF':'Classic',env=makeRoom(),r=env.room,random=rng(5000+i);
  try{r.setCurrentStadium(env.map(map),0);r.setScoreLimit(0,0);r.setTimeLimit(0,0);for(let k=1;k<=8;k++){r.playerJoin(k,'Bot '+k,'',String(k),'','');r.setPlayerTeam(k,k<=4?1:2,0);}r.startGame(0);env.step(2);
   for(const p of r.state.players){p.aiControlled=true;r.state.updatePlayer(p.id,{pos:[p.disc.pos.x,p.disc.pos.y+(random()-.5)*40],speed:[0,0]});}
   for(let t=0;t<frames;t++){if(t%2===0)for(const p of r.state.players){const mine=p.team.id===side,M=mine?A:B;r.playerInput(M.tactical(r.state,p.id,t,{difficulty:'elite',profile:mine?pa:pb}),p.id);}env.step(1);}
   const g=r.gameState,a=side===1?g.redScore:g.blueScore,c=side===1?g.blueScore:g.redScore;total.goals+=a;total.conceded+=c;total.matches++;if(a>c)total.wins++;else if(a<c)total.losses++;}finally{r.destroy();}}
 return total;
}
if(process.argv[2]==='--worker'){const [,,,a,b,from,to,frames]=process.argv;process.send(play(require(path.resolve(a)),require(path.resolve(b)),+from,+to,+frames,JSON.parse(process.env.DUEL_PROFILE_A||'{}'),JSON.parse(process.env.DUEL_PROFILE_B||'{}')));}
else if(require.main===module){
 const [a,b]=process.argv.slice(2,4),matches=Math.max(4,Number(process.argv[4]||200)),frames=Math.max(600,Number(process.argv[5]||3600)),workers=Math.max(1,Math.min(16,Number(process.argv[6]||4)));
 if(!a||!b){console.error('Usage: node training/duel.cjs <policyA.js> <policyB.js> [matches] [frames] [workers]');process.exit(2);}
 const per=Math.ceil(matches/workers),jobs=[];
 for(let w=0;w<workers;w++){const from=w*per,to=Math.min(matches,from+per);if(from>=to)continue;jobs.push(new Promise((resolve,reject)=>{const c=fork(__filename,['--worker',a,b,from,to,frames]);c.on('message',resolve);c.on('exit',code=>code&&reject(Error('worker failed')));}));}
 Promise.all(jobs).then(parts=>{const t=parts.reduce((s,p)=>{for(const k of Object.keys(s))s[k]+=p[k];return s;},{goals:0,conceded:0,wins:0,losses:0,matches:0});console.log(JSON.stringify({policyA:a,policyB:b,frames,...t,draws:t.matches-t.wins-t.losses},null,1));}).catch(e=>{console.error(e);process.exitCode=1;});
}
module.exports={play};
