'use strict';
// zSentinel cross-project QA, Fuckball #9.
// Deterministic, offline native BFF Big v4 wall symmetry/restitution acceptance.
// This is NOT verification of the lost Work-session physics or a live deployment.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { HBInit } = require('../headless/runtime.cjs');

const STADIUM = fs.readFileSync('dist/stadiums/bff-big-v4.hbs', 'utf8');
const BOUNCE = 0.412; // Native BFF v4 stadium bCoef; NOT the retired custom solver.
const EPS = 1e-4;

function near(actual, expected, context) {
  assert(Number.isFinite(actual), context + ': non-finite number');
  assert(Math.abs(actual - expected) <= EPS,
    context + ': expected ' + expected + ', got ' + actual);
}

function nativeRoom() {
  const room = HBInit({ noPlayer: true });
  room.setCustomStadium(STADIUM);
  room.addPlayer(1, 'Red', 1);
  room.addPlayer(2, 'Blue', 2);
  room.setScoreLimit(0);
  room.setTimeLimit(0);
  room.startGame();
  room.step(2);
  room.setPlayerInput(1, 0);
  room.setPlayerInput(2, 0);
  room.setPlayerDiscProperties(1, { x: -400, y: 150, xspeed: 0, yspeed: 0 });
  room.setPlayerDiscProperties(2, { x: 400, y: 150, xspeed: 0, yspeed: 0 });
  return room;
}

function wallTrial(sign, speed) {
  const room = nativeRoom();
  try {
    room.setDiscProperties(0, {
      x: 0, y: sign * 313, xspeed: 0, yspeed: sign * speed, damping: 1
    });
    room.step(1);
    const ball = room.getDiscProperties(0);
    near(ball.x, 0, 'wall x displacement');
    near(ball.xspeed, 0, 'wall x velocity');
    near(ball.yspeed, -sign * speed * BOUNCE, 'native wall restitution');
    assert(sign * ball.yspeed < 0, 'ball must travel back into the pitch');
    return { y: ball.y, vy: ball.yspeed };
  } finally {
    room.destroy();
  }
}

let comparisons = 0;
for (const speed of [5, 7.5, 10]) {
  const bottom = wallTrial(+1, speed);
  const top = wallTrial(-1, speed);
  near(top.y, -bottom.y, 'mirrored BFF wall location @ ' + speed);
  near(top.vy, -bottom.vy, 'mirrored BFF wall rebound @ ' + speed);
  comparisons += 2;
}

// A second nonzero trajectory is sampled twice from independent rooms to
// expose ambient time/randomness or state-sharing in native tick progression.
function deterministicTrace() {
  const room = nativeRoom();
  const trace = [];
  try {
    room.setDiscProperties(0, { x: 0, y: 120, xspeed: 6, yspeed: 4, damping: 0.99 });
    room.setPlayerDiscProperties(1, { x: -45, y: 120, xspeed: 0, yspeed: 0 });
    room.setPlayerInput(1, 8); // Native right-movement input.
    for (let frame = 0; frame < 90; frame++) {
      room.step(1);
      const ball = room.getDiscProperties(0);
      const red = room.getPlayerDiscProperties(1);
      const state = [ball.x, ball.y, ball.xspeed, ball.yspeed,
        red.x, red.y, red.xspeed, red.yspeed];
      for (const value of state) assert(Number.isFinite(value),
        'nonfinite authoritative state at frame ' + frame);
      trace.push(state);
    }
    return trace;
  } finally {
    room.destroy();
  }
}

const first = deterministicTrace();
const second = deterministicTrace();
assert.deepEqual(second, first, '90 native 60Hz ticks must reproduce exactly');
assert(first.some((state, frame) => frame > 0 && state[0] !== first[0][0]),
  'the moving ball trajectory must be nontrivial');
console.log('PASS native BFF Big v4: ' + comparisons +
  ' mirrored wall comparisons, 3 speeds, native 0.412 restitution, ' +
  '90 exact deterministic 60Hz frames; live physics recovery remains gated (#9)');
