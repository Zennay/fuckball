'use strict';
// Deterministic actual-engine fixtures: the policy must teach the neural model
// precise passing, off-ball runs, goalkeeper patience and decisive exits.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {HBInit}=require('../headless/runtime.cjs'),AI=require('../dist/ai/policy.js');
const r=HBInit({noPlayer:true});
try{
 r.setCustomStadium(fs.readFileSync('dist/stadiums/bff-big-v4.hbs','utf8'));
 for(let id=1;id<=8;id++)r.addPlayer(id,'Bot '+id,id<=4?1:2);
 r.startGame();r.step(2);
 const move=(id,x,y)=>r.setPlayerDiscProperties(id,{x,y,xspeed:0,yspeed:0});
 const ball=(x,y,vx=0)=>r.setDiscProperties(0,{x,y,xspeed:vx,yspeed:0});
 const state=r._room.state,p=id=>state.players.find(q=>q.id===id);
 const layout=players=>players.forEach(row=>move(...row));
 // A tightly marked support player must find an open receiving pocket.
 ball(-300,0);layout([[1,-323,0],[2,-650,0],[3,-145,115],[4,-250,-115],
   [5,350,0],[6,450,155],[7,500,-155],[8,650,0]]);
 // Position play: player 3 holds an attacking line and its spot is away
 // from a tight marker, with a passing lane from the ball.
 const free=AI.teamPlan(state,1,1)[3];
 assert(['am','st'].includes(free.role),'player 3 keeps an attacking line');
 move(5,-185,115);
 const marked=AI.teamPlan(state,1,2)[3];
 assert(['am','st'].includes(marked.role));
 assert(Math.hypot(marked.x+185,marked.y-115)>70,'receiver leaves marker behind');
 const lane=AI.chooseDelivery(state,p(1));assert(lane&&lane.type!=='shot','no shot from deep midfield');
 // A shot from close range stays inside the posts.
 ball(480,0);layout([[1,457,0],[2,-650,0],[3,-550,150],[4,-500,-150],
   [5,640,0],[6,-400,155],[7,-450,-155],[8,680,200]]);
 const shot=AI.chooseDelivery(state,p(1));
 assert.equal(shot.type,'shot','attack immediately when the goal is in range');
 assert(Math.abs(shot.y)<85-8,'target is safely inside the posts');
 // Keeper with the ball and nobody near: the decision points away from its own goal.
 ball(-500,0);layout([[1,-690,0],[2,-523,0],[3,-670,150],[4,-665,-140],
   [5,400,0],[6,420,155],[7,450,-155],[8,680,0]]);
 const calm=AI.chooseDelivery(state,p(2),{keeper:true});
 assert(calm.dx>0&&calm.type!=='shot','keeper plays the ball forward');
 // Pressure: immediate clearance forward, never into own net.
 move(5,-525,12);
 const urgent=AI.chooseDelivery(state,p(2),{keeper:true});
 assert(urgent.x>-500&&urgent.dx>0,'clear forward, never into own net');
 assert(AI.tactical(state,2,31,{difficulty:'elite'})&16,'urgent keeper acts now');
 console.log('PASS receivers leave markers, close-range shots inside the posts, keeper plays forward and clears urgently');
}finally{r.destroy();}
