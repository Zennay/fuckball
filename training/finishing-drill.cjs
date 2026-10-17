'use strict';
// Finishing drill for the 4v4 striker: the ball lies 120-380 px from the blue
// goal, a red attacker starts 40-160 px away from it, and the goal is empty
// (or defended by the policy's own keeper with "keeper"). Counts goals
// within four seconds.
//   node training/finishing-drill.cjs [policy.js] [attempts=300] [BFF|Classic] [keeper]
const path=require('node:path'),{makeRoom}=require('./selfplay.cjs');
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function drill(AI,attempts=300,mapName='BFF',withKeeper=false,seed=7){
 const random=rng(seed),env=makeRoom(),r=env.room;let goals=0,frames=0;
 const kickoff=()=>{r.startGame(0);env.step(2);for(const p of r.state.players)p.aiControlled=true;r.gameState.physicsState.discs[0].speed.x=.01;env.step(1);};
 try{
  r.setCurrentStadium(env.map(mapName),0);r.setScoreLimit(0,0);r.setTimeLimit(0,0);
  for(let k=1;k<=8;k++){r.playerJoin(k,'Bot '+k,'',String(k),'','');r.setPlayerTeam(k,k<=4?1:2,0);}
  kickoff();
  const goal=r.state.stadium.goals.find(g=>g.team.id===2),gx=(goal.p0.x+goal.p1.x)/2,W=Math.abs(gx),set=(id,x,y)=>r.state.updatePlayer(id,{pos:[x,y],speed:[0,0]});
  for(let s=0;s<attempts;s++){
   const d=120+random()*Math.min(260,W*.6),a=(random()-.5)*1.6,bx=gx-Math.cos(a)*d,by=Math.sin(a)*d*.8,pa=random()*Math.PI*2,pd=40+random()*120;
   set(1,-W+30,0);set(3,-W*.5,-150);set(4,-W*.5,150);set(2,bx+Math.cos(pa)*pd,by+Math.sin(pa)*pd*.8);
   set(5,withKeeper?gx-20:-W+60,withKeeper?0:250);set(6,-W+80,-250);set(7,-W+120,250);set(8,-W+160,-250);
   const ball=r.gameState.physicsState.discs[0];ball.pos.x=bx;ball.pos.y=by;ball.speed.x=0;ball.speed.y=0;
   const start=r.gameState.redScore;
   for(let t=0;t<240;t++){
    if(t%2===0){r.playerInput(AI.tactical(r.state,2,t,{difficulty:'elite'}),2);for(const id of [1,3,4])r.playerInput(0,id);if(withKeeper)r.playerInput(AI.tactical(r.state,5,t,{difficulty:'elite'}),5);}
    env.step(1);if(r.gameState.redScore!==start){goals++;frames+=t;break;}
   }
   if(r.gameState.redScore!==start||r.gameState.blueScore){r.stopGame(0);kickoff();}
  }
 }finally{r.destroy();}
 return{map:mapName,keeper:withKeeper,attempts,goals,rate:+(goals/attempts).toFixed(3),avgFrames:goals?Math.round(frames/goals):null};
}
if(require.main===module){const AI=require(path.resolve(process.argv[2]||path.join(__dirname,'../dist/ai/policy.js')));console.log(JSON.stringify(drill(AI,Number(process.argv[3]||300),process.argv[4]||'BFF',process.argv[5]==='keeper')));}
module.exports={drill};
