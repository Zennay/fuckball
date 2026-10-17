'use strict';
// Regression for #28: each published prediction must stay an independent
// snapshot when native RoomState.AE() internally reuses a single cache object.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { HBInit } = require('../headless/runtime.cjs');
const Render = require('../dist/render-timing.js');

// A cache-only engine cannot meet the published independent-snapshot contract.
assert.throws(() => Render.extrapolate({ AE: () => ({ nM() {} }) }, 1),
  /independent state\.copy/, 'do not silently fall back to mutable cache-only state');

const room = HBInit({ noPlayer: true });
try {
  room.setCustomStadium(fs.readFileSync('dist/stadiums/bff-big-v4.hbs', 'utf8'));
  room.addPlayer(1, 'Red', 1);
  room.addPlayer(2, 'Blue', 2);
  room.setScoreLimit(0);
  room.setTimeLimit(0);
  room.startGame();
  room.step(2);
  room.setPlayerInput(1, 0);
  room.setPlayerInput(2, 0);
  room.setPlayerDiscProperties(1, { x: -100, y: -60, xspeed: 0, yspeed: 0 });
  room.setPlayerDiscProperties(2, { x: 400, y: 100, xspeed: 0, yspeed: 0 });
  room.setDiscProperties(0, { x: 0, y: 0, xspeed: 0, yspeed: 0 });
  const source = room._room.state;
  const x = s => s.players.find(p => p.id === 1).disc.pos.x;
  const original = x(source);
  const idle = Render.extrapolate(source, 12);
  const idleX = x(idle);
  const moved = Render.extrapolate(source, 12, [{ frame: 0, id: 1, input: 8 }]);
  assert.notStrictEqual(moved, idle, 'predictions may not alias the same mutable native AE cache');
  assert.equal(x(idle), idleX, 'subsequent prediction may not rewrite previous published snapshot');
  assert(x(moved) > idleX + 0.05, 'speculative native direction must move predicted position');
  assert.equal(x(source), original, 'authoritative room must not be mutated by prediction');

  // Real guest-facing predictor must retain the speculative state even after
  // a later server acknowledgement removes that pending input.
  const guest = Render.createPredictor();
  guest.snapshot(0, 0, -1);
  guest.input(1, 1, 8, 0);
  const pendingPrediction = guest.predict(source, 200);
  const pendingX = x(pendingPrediction);
  guest.snapshot(0, 0, 1); // acknowledge the outstanding input
  const confirmedPrediction = guest.predict(source, 200);
  assert.equal(guest.pending.length, 0, 'ack must remove only its pending input');
  assert(pendingX > x(confirmedPrediction) + 0.05,
    'guest prediction must include unconfirmed input while it is pending');
  assert.equal(x(pendingPrediction), pendingX,
    'later acknowledged guest prediction may not rewrite prior speculative result');

  const before = Render.extrapolate(source, 3, [{ frame: 5, id: 1, input: 8 }]);
  const beforeX = x(before);
  const after = Render.extrapolate(source, 12, [{ frame: 5, id: 1, input: 8 }]);
  const idle12 = Render.extrapolate(source, 12);
  assert.equal(x(before), beforeX, 'later predictions may not rewrite pre-event frame');
  assert(x(after) > x(idle12) + 0.05, 'future stamped input must take effect in later frame');
  console.log('PASS #28 independent immutable-history snapshots + native direction replay');
} finally { room.destroy(); }
