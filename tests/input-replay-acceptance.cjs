'use strict';
// Opt-in, expected-RED acceptance for input replay issue #28.
// Unlike native parity checks, this test requires speculative input to
// ACTUALLY change movement/kick outcomes before an authoritative snapshot.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {HBInit} = require('../headless/runtime.cjs');
const Render = require('../dist/render-timing.js');
const stadium = fs.readFileSync('dist/stadiums/bff-big-v4.hbs', 'utf8');
const failures = [];

function openRoom() {
  const room = HBInit({noPlayer:true});
  room.setCustomStadium(stadium);
  room.addPlayer(1, 'Red', 1);
  room.addPlayer(2, 'Blue', 2);
  room.setScoreLimit(0);
  room.setTimeLimit(0);
  room.startGame();
  room.step(2);
  room.setPlayerInput(1, 0);
  room.setPlayerInput(2, 0);
  room.setPlayerDiscProperties(1, {x:-100,y:-60,xspeed:0,yspeed:0});
  room.setPlayerDiscProperties(2, {x:400,y:100,xspeed:0,yspeed:0});
  room.setDiscProperties(0, {x:0,y:0,xspeed:0,yspeed:0});
  return room;
}
function playerX(state) {
  const player = state.players.find(p => p.id === 1);
  assert(player && player.disc, 'native red-player disc is available');
  return player.disc.pos.x;
}
function ballSpeed(state) { return state.gameState.physicsState.discs[0].speed.x; }
function check(label, block) {
  try { block(); console.log('PASS ' + label); }
  catch (error) {
    failures.push(label + ': ' + error.message);
    console.error('RED ' + label + ': ' + error.message);
  }
}

check('speculative direction changes prediction at 50/100/200ms', () => {
  const room = openRoom();
  try {
    const source = room._room.state;
    const original = playerX(source);
    const sourceBefore = JSON.stringify({
      red:playerX(source),ball:ballSpeed(source)
    });
    for (const ms of [50, 100, 200]) {
      const ahead = ms * 60 / 1000;
      const idle = Render.extrapolate(source, ahead);
      const moved = Render.extrapolate(source, ahead,
        [{frame:0,id:1,input:8}], 0);
      assert(Math.abs(playerX(moved) - playerX(idle)) > 0.05,
        ms + 'ms prediction must reflect pending rightward direction input');
    }
    assert.equal(JSON.stringify({red:playerX(source),ball:ballSpeed(source)}),
      sourceBefore, 'render extrapolation may not mutate authoritative state');

    // Prove this same stadium/player does move when the native authoritative
    // room receives the same input; otherwise the fixture is not meaningful.
    room.setPlayerInput(1, 8);
    room.step(12);
    assert(playerX(room._room.state) > original + 0.05,
      'native authoritative 12 ticks must move the red player');
  } finally { room.destroy(); }
});

check('speculative fresh kick predicts a real native ball impulse', () => {
  const room = openRoom();
  try {
    room.setPlayerDiscProperties(1, {x:-23,y:0,xspeed:0,yspeed:0});
    room.setDiscProperties(0, {x:0,y:0,xspeed:0,yspeed:0});
    const source = room._room.state;
    const unchanged = ballSpeed(source);
    const prediction = Render.extrapolate(source, 2, [{frame:0,id:1,input:16}]);
    assert(ballSpeed(prediction) > unchanged + 4,
      'fresh speculative kick must produce the native full-strength impulse');
    assert.equal(ballSpeed(source), unchanged,
      'speculation must not change the authoritative ball');
    room.setPlayerInput(1, 16);
    room.step(1);
    assert(room.getDiscProperties(0).xspeed > unchanged + 4,
      'same kick must be demonstrably possible in authoritative native room');
  } finally { room.destroy(); }
});

if (failures.length) {
  console.error('\n#28 still RED (' + failures.length + '):\n- ' + failures.join('\n- '));
  process.exitCode = 1;
} else {
  console.log('PASS #28 input replay acceptance: pending direction/kick affect predicted physics without mutating source');
}
