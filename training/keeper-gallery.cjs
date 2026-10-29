'use strict';
// Shooting gallery for the 4v4 keeper: an attacker holds the ball while the
// keeper sets itself, then the ball is struck at a random spot in the goal
// mouth. Only the keeper (and the shooter's follow-up run) are controlled.
//   node training/keeper-gallery.cjs [policy.js] [shots=400] [map=BFF|Classic]
const path=require('node:path'),{makeRoom}=require('./selfplay.cjs');
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function gallery(AI,shots=400,mapName='BFF',seed=99){
 const random=rng(seed),res={shots:0,goals:0,saves:0,wide:0,byRange:{near:[0,0],mid:[0,0],far:[0,0]}};
 const env=makeRoom(),r=env.room;
 try{
  r.setCurrentStadium(env.map(mapName),0);r.setScoreLimit(0,0);r.setTimeLimit(0,0);
  for(let k=1;k<=8;k++){r.playerJoin(k,'Bot '+k,'',String(k),'','');r.setPlayerTeam(k,k<=4?1:2,0);}
  r.startGame(0);env.step(2);for(const p of r.state.players)p.aiControlled=true;
  const st=r.state.stadium,goal=st.goals.find(g=>g.team.id===1),ox=(goal.p0.x+goal.p1.x)/2,gy=Math.abs(goal.p0.y-goal.p1.y)/2,width=Math.abs(ox);
  const set=(id,x,y)=>r.state.updatePlayer?r.state.updatePlayer(id,{pos:[x,y],speed:[0,0]}):null;
  for(let s=0;s<shots;s++){
   const dist=60+random()*Math.min(420,width*.75),ang=(random()-.5)*1.7,bx=ox+Math.cos(ang)*dist,by=Math.sin(ang)*dist*.9;
   // Park outfield players away from the action; team 1's sticky keeper is the deepest player.
   set(1,ox+15,0);set(2,ox+width*1.2,-150);set(3,ox+width*1.2,0);set(4,ox+width*1.2,150);
   set(5,bx+18,by);set(6,-ox*.6,-120);set(7,-ox*.6,0);set(8,-ox*.6,120);
   const ball=r.gameState.physicsState.discs[0];ball.pos.x=bx;ball.pos.y=by;ball.speed.x=0;ball.speed.y=0;
   const startScore=r.gameState.blueScore;let t=0;
   for(;t<70;t++){r.playerInput(AI.tactical(r.state,1,t,{difficulty:'elite'}),1);for(const id of [2,3,4,5,6,7,8])r.playerInput(0,id);env.step(1);ball.pos.x=bx;ball.pos.y=by;ball.speed.x=0;ball.speed.y=0;}
   const ty=(random()*2-1)*(gy-8),speed=5.5+random()*5,dx=ox-bx,dy=ty-by,l=Math.hypot(dx,dy);ball.speed.x=dx/l*speed;ball.speed.y=dy/l*speed;
   let scored=false;
   for(let k=0;k<180;k++){r.playerInput(AI.tactical(r.state,1,t+k,{difficulty:'elite'}),1);env.step(1);if(r.gameState.blueScore!==startScore){scored=true;break;}const b=r.gameState.physicsState.discs[0];if(k>10&&(Math.sign(ox)*b.speed.x<-.3||Math.hypot(b.speed.x,b.speed.y)<.4))break;}
   // Saved only if the ball is not still rolling in.
   if(!scored){for(let k=0;k<120&&r.gameState.blueScore===startScore;k++){r.playerInput(AI.tactical(r.state,1,t+400+k,{difficulty:'elite'}),1);env.step(1);}scored=r.gameState.blueScore!==startScore;}
   const band=dist<180?'near':dist<330?'mid':'far';res.shots++;res.byRange[band][0]++;
   if(scored){res.goals++;res.byRange[band][1]++;}else res.saves++;
   if(scored){r.stopGame(0);r.startGame(0);env.step(2);for(const p of r.state.players)p.aiControlled=true;}
  }
 }finally{r.destroy();}
 res.saveRate=+(res.saves/res.shots).toFixed(3);for(const k of Object.keys(res.byRange)){const [n,g]=res.byRange[k];res.byRange[k]={shots:n,goals:g,saveRate:n?+(1-g/n).toFixed(3):null};}
 return res;
}
if(require.main===module){const AI=require(path.resolve(process.argv[2]||path.join(__dirname,'../dist/ai/policy.js')));console.log(JSON.stringify(gallery(AI,Number(process.argv[3]||400),process.argv[4]||'BFF')));}
module.exports={gallery};
