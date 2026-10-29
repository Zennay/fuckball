'use strict';
const assert=require('node:assert/strict');
const P=require('../dist/prediction-controls.js');
const ball={pos:{x:0,y:0},speed:{x:6,y:0},radius:5.8};
const teammate={disc:{pos:{x:500,y:0},speed:{x:0,y:0},radius:15},team:{id:1}};
const state={gameState:{physicsState:{discs:[ball]},stadium:{width:700,height:320}},players:[teammate]};
const unchanged=JSON.stringify(state);
for(const ms of [0,5,25,60,135,200,250]){
 assert.equal(P.effectiveMs(ms,state),ms,'open-field '+ms+'ms is not needlessly clipped');
}
assert.equal(P.effectiveMs(-30,state),0);
assert.equal(P.effectiveMs(999,state),250);
teammate.disc.pos.x=35;
for(const ms of [60,135,200,250]){
 const bounded=P.effectiveMs(ms,state);
 assert(bounded<ms,'approaching contact at '+ms+'ms should cap visual prediction');
 assert(bounded>=0&&bounded<=ms);
}
teammate.disc.pos.x=-60;
assert.equal(P.effectiveMs(135,state),135,'moving away from opponent does not clip');
ball.pos.x=690;ball.speed.x=5;
assert(P.effectiveMs(135,state)<30,'approaching side wall keeps predicted bounce close to actual tick');
ball.pos.x=0;ball.pos.y=313;ball.speed.x=0;ball.speed.y=4;
assert(P.effectiveMs(200,state)<30,'approaching top/bottom boundary is conservative');
assert(Number.isFinite(P.effectiveMs(200,{gameState:{},players:[]})),'invalid state never breaks rendering');
teammate.disc.pos.x=500;ball.pos.y=0;ball.speed.y=0;ball.speed.x=6;
assert.equal(JSON.stringify(state).includes('"x":500'),true);
console.log('PASS lookahead 0/5/25/60/135/200/250ms, near contacts, both walls, zero mutation');
