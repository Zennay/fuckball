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
 const free=AI.teamPlan(state,1,1)[3];
 assert.equal(free.role,'support');
 move(5,-185,115);
 const marked=AI.teamPlan(state,1,2)[3];
 assert.equal(marked.role,'support');
 assert(Math.hypot(marked.x-free.x,marked.y-free.y)>65,'marked receiver changes lane');
 assert(Math.hypot(marked.x+185,marked.y-115)>70,'receiver leaves marker behind');
 // Keep shooting within the posts but exploit the uncovered far corner.
 ball(480,0);layout([[1,457,0],[2,-650,0],[3,-550,150],[4,-500,-150],
   [5,640,0],[6,-400,155],[7,-450,-155],[8,680,200]]);
 const shot=AI.chooseDelivery(state,p(1));
 assert.equal(shot.type,'shot','attack immediately when a goal lane is available');
 assert(Math.abs(shot.y)>20,'aim around centrally positioned defender');
 assert(Math.abs(shot.y)<85-8,'target is safely inside the posts');
 assert(shot.margin>2,'chosen trajectory beats defender intercept');
 // Keeper has no safe pass. Wait briefly instead of kicking into an attacker,
 // then act by 24 frames even if the situation never improves.
 ball(-500,0);layout([[1,-690,0],[2,-523,0],[3,-670,150],[4,-665,-140],
   [5,400,0],[6,420,155],[7,450,-155],[8,680,0]]);
 assert.equal(AI.chooseDelivery(state,p(2),{keeper:true}).type,'hold');
 const early=AI.tactical(state,2,0,{difficulty:'elite'});
 assert.equal(early&16,0,'safe keeper does not instantly punt');
 const later=AI.tactical(state,2,30,{difficulty:'elite'});
 assert(later&16,'bounded waiting: goalkeeper eventually clears');
 // Pressure overrides waiting immediately, with no backwards clearance.
 move(5,-525,12);
 const urgent=AI.chooseDelivery(state,p(2),{keeper:true});
 assert.notEqual(urgent.type,'hold','nearby attacker forces an immediate decision');
 assert(urgent.x>-500,'clear forward, never into own net');
 assert(AI.tactical(state,2,31,{difficulty:'elite'})&16,'urgent keeper acts now');
 console.log('PASS intelligent receiving runs, open-post goal aim, bounded keeper hold and urgent directional clearance');
}finally{r.destroy();}
