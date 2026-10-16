'use strict';
// Quality gate for tactical distribution: ball, player positions and velocities
// reflected across the centre line must lead to equivalent decisions for Red
// and Blue. This guards regressions in shot/pass accuracy and keeper urgency
// without altering native physics or automatically promoting an AI model.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {HBInit}=require('../headless/runtime.cjs');
const AI=require('../dist/ai/policy.js');
const stadium=fs.readFileSync('dist/stadiums/bff-big-v4.hbs','utf8');
const EPS=1e-6;

function scenario(team, ball, positions) {
  const sign=team===1?1:-1;
  const room=HBInit({noPlayer:true});
  room.setCustomStadium(stadium);
  for(let id=1;id<=8;id++)room.addPlayer(id,'Player '+id,id<=4?team:3-team);
  room.setTimeLimit(0);room.setScoreLimit(0);room.startGame();room.step(2);
  room.setDiscProperties(0,{x:ball[0]*sign,y:ball[1],xspeed:0,yspeed:0});
  for(const [id,x,y,vx=0,vy=0] of positions)
    room.setPlayerDiscProperties(id,{x:x*sign,y,xspeed:vx*sign,yspeed:vy});
  const state=room._room.state;
  const decision=(id,opts={})=>AI.chooseDelivery(state,state.players.find(p=>p.id===id),opts);
  return {room,state,sign,decision};
}
const open=[
  [1,-374,0],[2,-650,0],[3,-150,105,0,1.8],[4,-240,-175],
  [5,120,200],[6,200,-200],[7,300,140],[8,650,0]
];
const keeper=[
  [1,-300,80],[2,-537,12],[3,-120,155],[4,-290,-135],
  [5,75,200],[6,90,-250],[7,180,100],[8,640,0]
];
const urgent=[
  [1,-610,15],[2,-537,12],[3,-600,130],[4,-610,-110],
  [5,-565,12],[6,-573,94],[7,-571,-93],[8,-330,0]
];
const shot=[
  [1,576,0],[2,-650,0],[3,180,140],[4,230,-170],
  [5,100,200],[6,150,-210],[7,-30,100],[8,-650,0]
];
const cases=[
  {label:'open moving receiver',ball:[-350,0],positions:open,id:1,
    check:d=>{assert.equal(d.type,'pass');assert.equal(d.receiverId,3);
      assert(d.y>105,'lead receiver ahead of old location');}},
  {label:'blocked central pass lane',ball:[-350,0],
    positions:open.map(p=>p[0]===5?[5,-245,50]:p),id:1,
    check:d=>assert.notEqual(d.receiverId,3,'opponent blocks original passing lane')},
  {label:'keeper safe distribution',ball:[-510,12],positions:keeper,id:2,opts:{keeper:true},
    check:d=>{assert.equal(d.type,'pass','keeper must distribute to real teammate');
      assert([1,3,4].includes(d.receiverId));}},
  {label:'keeper emergency clearance',ball:[-510,12],positions:urgent,id:2,opts:{keeper:true},
    check:d=>{assert(['pass','clear'].includes(d.type),'keeper must decide under pressure');
      if(d.type==='pass')assert(d.margin>=8,'no contested desperation pass');
      else assert(d.x>-510,'clear away from own goal');}},
  {label:'open short-range goal',ball:[600,0],positions:shot,id:1,
    check:d=>{assert.equal(d.type,'shot','open goal must not cause an unnecessary pass');
      assert(Math.abs(d.y)<EPS,'shot must be centered on goal');}}
];
let checks=0;
for(const c of cases){
  const results=[];
  for(const side of [1,2]){
    const {room,state,sign,decision}=scenario(side,c.ball,c.positions);
    try{
      const before=JSON.stringify(room.getDiscProperties(0));
      const choice=decision(c.id,c.opts);
      assert(choice&&['pass','shot','clear'].includes(choice.type),c.label+': decisive targeting');
      const normalized={...choice,x:choice.x*sign};
      c.check(normalized);
      assert(Number.isFinite(normalized.x)&&Number.isFinite(normalized.y),
        c.label+': finite target coordinates');
      assert.equal(JSON.stringify(room.getDiscProperties(0)),before,
        c.label+': tactical decision must never change native ball physics');
      const input=AI.tactical(state,c.id,13,{difficulty:'elite'});
      assert(Number.isInteger(input)&&input>=0&&input<=31,
        c.label+': tactical input must remain bounded and finite');
      assert.equal(JSON.stringify(room.getDiscProperties(0)),before,
        c.label+': tactical frame must not mutate native ball');
      results.push(normalized);checks+=3;
    } finally{room.destroy();}
  }
  const [red,blue]=results;
  assert.equal(red.type,blue.type,c.label+': team swap changes decision type');
  assert.equal(red.receiverId,blue.receiverId,c.label+': team swap changes receiver');
  assert(Math.abs(red.x-blue.x)<EPS,c.label+': mirrored x target differs');
  assert(Math.abs(red.y-blue.y)<EPS,c.label+': y target differs');
  checks+=4;
}
console.log('PASS mirrored tactical delivery: '+cases.length+
  ' native BFF scenarios for both teams, '+checks+
  ' pass/shot/keeper/urgency and no-physics-mutation checks');
