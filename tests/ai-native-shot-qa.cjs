'use strict';
// End-to-end tactical finishing contract: the planner must result in an
// actual native BFF goal, not merely report that a goal-shaped target exists.
// Both teams use the identical reflected shot geometry; no synthetic impulses,
// speed multipliers, goalkeeper teleporting or learned-model promotion.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {HBInit}=require('../headless/runtime.cjs');
const AI=require('../dist/ai/policy.js');
const bff=fs.readFileSync('dist/stadiums/bff-big-v4.hbs','utf8');

function attempt(team){
  const sign=team===1?1:-1,room=HBInit({noPlayer:true});
  try{
    room.setCustomStadium(bff);
    room.setScoreLimit(0);room.setTimeLimit(0);
    for(let id=1;id<=8;id++)
      room.addPlayer(id,'Player '+id,id<=4?team:3-team);
    room.startGame();room.step(2);
    room.setDiscProperties(0,{x:600*sign,y:0,xspeed:0,yspeed:0});
    for(const [id,x,y] of [
      [1,577,0],[2,-650,0],[3,190,170],[4,220,-170],
      [5,-250,230],[6,-200,-230],[7,-450,140],[8,-650,-160]
    ]) room.setPlayerDiscProperties(id,{
      x:x*sign,y,xspeed:0,yspeed:0
    });
    const state=room._room.state,actor=state.players.find(p=>p.id===1);
    const target=AI.chooseDelivery(state,actor);
    assert.equal(target.type,'shot',
      'unobstructed scoring chance should be recognized');
    assert(Math.abs(target.y)<1e-6,'shot targets center of goal');
    assert(target.x*sign>600,'shot is aimed forward at opponent goal');
    const ballBefore=JSON.stringify(room.getDiscProperties(0));
    const input=AI.tactical(state,1,7,{difficulty:'elite'});
    assert(input&16,'elite striker must kick immediately when aligned at contact');
    assert.equal(JSON.stringify(room.getDiscProperties(0)),ballBefore,
      'AI decides, physics engine alone moves/kicks ball');
    room.setPlayerInput(1,input);
    room.step(1);
    const impulse=room.getDiscProperties(0).xspeed*sign;
    assert(impulse>4,'native shot must produce meaningful forward ball impulse');
    room.setPlayerInput(1,0);
    let goalFrame=0;
    for(let tick=1;tick<=150;tick++){
      room.step(1);
      const score=room.getScores();
      if((team===1?score.red:score.blue)>0){
        goalFrame=tick;
        assert.equal(team===1?score.blue:score.red,0,
          'mirrored attacking shot must never count as own goal');
        break;
      }
    }
    assert(goalFrame>0,
      'real native BFF shot from open chance must score within 150 ticks');
    return {team,goalFrame,impulse};
  } finally{room.destroy();}
}
const red=attempt(1),blue=attempt(2);
assert(Math.abs(red.impulse-blue.impulse)<1e-5,
  'left and right sides must deliver the same native kick strength');
assert(Math.abs(red.goalFrame-blue.goalFrame)<=1,
  'mirrored shots should score at the same native engine frame');
console.log('PASS native shot execution: both sides score from a clear chance, aligned tactical kick produces native impulse; mirrored goal frames '+red.goalFrame+'/'+blue.goalFrame);
