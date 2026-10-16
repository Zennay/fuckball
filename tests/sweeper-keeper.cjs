'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {HBInit}=require('../headless/runtime.cjs');
const AI=require('../dist/ai/policy.js');
const r=HBInit({noPlayer:true});
try{
 r.setCustomStadium(fs.readFileSync('dist/stadiums/bff-big-v4.hbs','utf8'));
 for(let id=1;id<=8;id++)r.addPlayer(id,'Bot '+id,id<=4?1:2);
 r.startGame();r.step(2);
 r.setDiscProperties(0,{x:0,y:0,xspeed:0,yspeed:0});
 for(const [id,x,y] of [[1,-20,0],[2,-650,0],[3,130,100],[4,60,-35],
                         [5,35,0],[6,400,100],[7,500,-100],[8,650,0]]){
   r.setPlayerDiscProperties(id,{x,y,xspeed:0,yspeed:0});
 }
 const state=r._room.state,goals=state.gameState.stadium.goals;
 const left=(goals.find(g=>g.team.id===1).p0.x+goals.find(g=>g.team.id===1).p1.x)/2;
 let plan=AI.teamPlan(state,1,0);
 assert.equal(plan[1].role,'chaser');
 assert.equal(plan[2].role,'keeper');
 assert(plan[2].x-left>140,'4v4 keeper must play out rather than hug goal line');
 r.setDiscProperties(0,{x:-525,y:80,xspeed:0,yspeed:0});
 r.setPlayerDiscProperties(2,{x:-570,y:45});
 r.setPlayerDiscProperties(5,{x:-530,y:80});
 plan=AI.teamPlan(state,1,2);
 assert.equal(plan[2].role,'keeper','keeper remains assigned as opposition advances');
 // Attacker owns the ball close to goal: narrow the angle on the ball-goal line.
 const cross=(plan[2].x-left)*80-plan[2].y*(-525-left);
 assert(Math.abs(cross)/Math.hypot(-525-left,80)<6,'keeper stands on the ball-goal line');
 assert(plan[2].x>left+30&&plan[2].x<-525,'keeper is off the line but goal-side of the ball');
 assert(plan[2].y>5,'keeper shifts toward the ball side');
 // Loose ball the keeper reaches first, well outside the box: sweep and clear.
 r.setDiscProperties(0,{x:-430,y:-60,xspeed:-1,yspeed:0});
 r.setPlayerDiscProperties(2,{x:-520,y:-40,xspeed:0,yspeed:0});
 r.setPlayerDiscProperties(5,{x:-150,y:0});r.setPlayerDiscProperties(1,{x:-100,y:200});
 const sweep=AI.teamPlan(state,1,3);
 assert.equal(sweep[2].clear,true,'keeper leaves the box to clear a loose ball');
 assert(Math.hypot(sweep[2].x+430,sweep[2].y+60)<70,'keeper goes to the ball');
 // Incoming shot: step onto its path in front of goal instead of backing onto the line.
 r.setPlayerDiscProperties(2,{x:-600,y:30,xspeed:0,yspeed:0});r.setPlayerDiscProperties(5,{x:-300,y:200});
 r.setDiscProperties(0,{x:-420,y:0,xspeed:-8,yspeed:0});
 const shot=AI.teamPlan(state,1,4);
 assert.equal(shot[2].role,'keeper');assert.equal(shot[2].clear,true);
 assert(Math.abs(shot[2].y)<12,'keeper moves onto the shot line');
 assert(shot[2].x>left+40,'keeper meets the shot in front of goal');
 let input=0;for(let t=0;t<40;t++){input=AI.tactical(state,2,6+t,{difficulty:'elite'});r.setPlayerInput(2,input);r.step(1);if(state.gameState.redScore+state.gameState.blueScore)break;}
 assert.equal(state.gameState.blueScore,0,'shot is stopped');
 const original=JSON.stringify(r.getDiscProperties(0));
 for(const id of [1,2,3,4])AI.tactical(state,id,6,{difficulty:'elite'});
 assert.equal(JSON.stringify(r.getDiscProperties(0)),original,'AI never changes engine physics');
 console.log('PASS sticky 4v4 sweeper keeper: angle narrowing, sweeping loose balls, meeting shots in front of goal and physics isolation');
}finally{r.destroy();}
