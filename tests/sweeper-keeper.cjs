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
 assert(plan[2].x>-560,'keeper must challenge a nearby attacker');
 assert(plan[2].y>35,'keeper tracks the attack wide of goal center');
 r.setDiscProperties(0,{x:-420,y:0,xspeed:-8,yspeed:0});
 const shot=AI.teamPlan(state,1,4);
 assert.equal(shot[2].role,'keeper');
 assert(shot[2].x<plan[2].x-40,'keeper recovers to stop an actual incoming shot');
 const original=JSON.stringify(r.getDiscProperties(0));
 for(const id of [1,2,3,4])AI.tactical(state,id,6,{difficulty:'elite'});
 assert.equal(JSON.stringify(r.getDiscProperties(0)),original,'AI never changes engine physics');
 console.log('PASS sticky 4v4 sweeper keeper, proactive challenge, shot recovery and physics isolation');
}finally{r.destroy();}
