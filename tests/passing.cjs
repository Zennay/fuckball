'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {HBInit}=require('../headless/runtime.cjs'),AI=require('../dist/ai/policy.js');
const r=HBInit({noPlayer:true});
try{
 r.setCustomStadium(fs.readFileSync('dist/stadiums/bff-big-v4.hbs','utf8'));
 for(let i=1;i<=8;i++)r.addPlayer(i,'Bot '+i,i<=4?1:2);
 r.startGame();r.step(2);
 const ball=(x,y)=>r.setDiscProperties(0,{x,y,xspeed:0,yspeed:0});
 const move=(id,x,y,vx=0,vy=0)=>r.setPlayerDiscProperties(id,{x,y,xspeed:vx,yspeed:vy});
 ball(-350,0);
 move(1,-374,0);move(2,-650,0);move(3,-150,105,0,1.8);move(4,-240,-175);
 move(5,120,200);move(6,200,-200);move(7,300,140);move(8,650,0);
 const state=r._room.state,p=id=>state.players.find(q=>q.id===id);
 const open=AI.chooseDelivery(state,p(1));
 assert.equal(open.type,'pass','prefer midfield passing to shooting from distance');
 assert.equal(open.receiverId,3,'choose free advanced receiver');
 assert(open.y>105,'lead moving receiver rather than passing to their old location');
 assert(open.x>-350,'passing direction must move the ball upfield');
 // Block the obvious central lane. A pass planner must not drill it straight
 // through an opponent just because that teammate is farthest forward.
 move(5,-245,50);
 const blocked=AI.chooseDelivery(state,p(1));
 assert.notEqual(blocked.receiverId,3,'blocked passing lane must be rejected');
 // A goalkeeper able to pass has no reason to blindly clear to midfield.
 ball(-510,12);move(2,-537,12);move(1,-300,80);move(3,-120,155);move(4,-290,-135);
 move(5,75,200);move(6,90,-250);move(7,180,100);move(8,640,0);
 const keeper=AI.chooseDelivery(state,p(2),{keeper:true});
 assert.equal(keeper.type,'pass','keeper chooses accurate distribution to teammate');
 assert([1,3,4].includes(keeper.receiverId),'keeper must pass to an actual teammate');
 assert(keeper.x>-510,'keeper distributes away from own goal');
 // Under pressure and without a safe receiver, immediately clear forward.
 move(1,-610,15);move(3,-600,130);move(4,-610,-110);
 move(5,-565,12);move(6,-573,94);move(7,-571,-93);move(8,-330,0);
 const urgent=AI.chooseDelivery(state,p(2),{keeper:true});
 assert(['clear','pass'].includes(urgent.type),'emergency decision is decisive');
 if(urgent.type==='pass')assert(urgent.margin>=8,'only an uncontested safety pass under pressure');
 else assert(urgent.x>-510,'keeper clears away from the goal');
 const before=JSON.stringify(r.getDiscProperties(0));
 for(const difficulty of ['normal','hard','elite'])for(const id of [1,2,3,4]){
  const input=AI.tactical(state,id,7,{difficulty});
  assert(input>=0&&input<=31,'valid fast decision');
 }
 assert.equal(JSON.stringify(r.getDiscProperties(0)),before,'no physics mutation');
 assert.equal(AI.levels.elite.reaction,1,'elite reacts every engine tick');
 console.log('PASS passing priorities, moving receiver lead, blocked lanes, keeper distribution, emergency clearing, fast reactions and engine isolation');
}finally{r.destroy();}
