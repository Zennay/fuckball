'use strict';
// Full-strength native kicks are one authoritative room action; rendering must
// never substitute the retired custom/baby-kick physics for this behavior.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {HBInit} = require('../headless/runtime.cjs');
const bff = fs.readFileSync('dist/stadiums/bff-big-v4.hbs', 'utf8');
const room = HBInit({noPlayer: true});
let callbacks = 0;
try {
  room.setCustomStadium(bff);
  room.addPlayer(1, 'Red', 1);
  room.addPlayer(2, 'Blue', 2);
  room.setScoreLimit(0);
  room.setTimeLimit(0);
  room.startGame();
  room.step(2);
  room.onPlayerBallKick = player => {
    assert.equal(player.id, 1, 'the real red player kicked');
    callbacks++;
  };

  function setupShot() {
    room.setPlayerDiscProperties(1, {x: -23, y: 0, xspeed: 0, yspeed: 0});
    room.setPlayerDiscProperties(2, {x: 400, y: 150, xspeed: 0, yspeed: 0});
    room.setDiscProperties(0, {x: 0, y: 0, xspeed: 0, yspeed: 0});
  }

  setupShot();
  room.setPlayerInput(1, room.InputFlags.kick);
  room.step(1);
  const first = room.getDiscProperties(0).xspeed;
  assert(first > 4, 'fresh press creates a real native full-strength shot');
  assert.equal(callbacks, 1, 'one kick callback on first press');

  room.step(12);
  assert.equal(callbacks, 1, 'holding while the ball flies away does not invent extra kicks');
  room.setPlayerInput(1, 0);
  room.step(1);

  setupShot();
  room.setPlayerInput(1, room.InputFlags.kick);
  room.step(1);
  const second = room.getDiscProperties(0).xspeed;
  assert.equal(callbacks, 2, 'a new press after release produces another authoritative kick');
  assert(Math.abs(second - first) < 1e-7,
    'same stadium state must produce the same shot impulse, not a weak baby kick');

  room.setPlayerInput(1, 0);
  room.step(1);
  assert.equal(callbacks, 2, 'release alone does not create a kick');
  console.log('PASS native BFF kick press/release: full impulse, no extra flying-ball kicks, identical repeat impulse and exactly two authoritative callbacks');
} finally {
  room.destroy();
}
