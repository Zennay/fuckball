'use strict';
// Real native-room regression for AI tactics cached within a shared tick.
// Offline BFF v4; no model training, user sessions, or physics modifications.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { HBInit } = require('../headless/runtime.cjs');
const AI = require('../dist/ai/policy.js');

const room = HBInit({ noPlayer: true });
try {
  room.setCustomStadium(fs.readFileSync('dist/stadiums/bff-big-v4.hbs', 'utf8'));
  for (let id = 1; id <= 8; id++) {
    room.addPlayer(id, 'Player ' + id, id <= 4 ? 1 : 2);
  }
  room.startGame();
  room.step(2);
  room.setDiscProperties(0, { x: 0, y: 0, xspeed: 0, yspeed: 0 });
  for (const [id, x, y] of [
    [1, -23, 0], [2, -650, 0], [3, 130, 100], [4, 60, -35],
    [5, 35, 0], [6, 400, 100], [7, 500, -100], [8, 650, 0]
  ]) room.setPlayerDiscProperties(id, { x, y, xspeed: 0, yspeed: 0 });
  const state = room._room.state;
  const tick = 100;
  const first = AI.teamPlan(state, 1, tick);
  assert.equal(first[2].role, 'keeper', 'precondition: leftmost player is keeper');
  assert.strictEqual(AI.teamPlan(state, 1, tick), first,
    'identical snapshots should reuse the plan within one tick');

  // A host migration, human takeover, or role handoff may change AI control
  // without a game tick or position change. The cache must not assign a
  // genuine human a bot keeper assignment.
  const human = state.players.find(p => p.id === 2);
  human.aiControlled = false;
  const afterTakeover = AI.teamPlan(state, 1, tick);
  assert.notStrictEqual(afterTakeover, first,
    'human/AI flag change must invalidate tactic cache at same position/tick');
  assert.notEqual(afterTakeover[2].role, 'keeper',
    'human player must not retain a cached bot keeper assignment');
  assert.equal(afterTakeover[1].role, 'keeper',
    'a real AI teammate must take over the keeper position');
  assert.strictEqual(AI.teamPlan(state, 1, tick), afterTakeover,
    'unchanged human snapshot should remain cacheable');

  // Interception/reach explicitly depends on player speed and radii. A same
  // tick velocity change must not cause a stale keeper interception target.
  room.setPlayerDiscProperties(1, { xspeed: 9, yspeed: -4 });
  const afterVelocity = AI.teamPlan(state, 1, tick);
  assert.notStrictEqual(afterVelocity, afterTakeover,
    'player-velocity change must invalidate same-tick interception plan');
  assert.strictEqual(AI.teamPlan(state, 1, tick), afterVelocity);

  room.setDiscProperties(0, { radius: 6.5 });
  const afterBallRadius = AI.teamPlan(state, 1, tick);
  assert.notStrictEqual(afterBallRadius, afterVelocity,
    'ball contact radius change must invalidate keeper touch prediction');
  assert.strictEqual(AI.teamPlan(state, 1, tick), afterBallRadius);

  human.aiControlled = true;
  const afterBotReturn = AI.teamPlan(state, 1, tick);
  assert.notStrictEqual(afterBotReturn, afterBallRadius,
    'AI control restoration must invalidate same-tick plan');
  assert.equal(afterBotReturn[1].role, 'keeper',
    'sticky valid keeper selection remains stable after bot return');

  for (const intent of Object.values(afterBotReturn)) {
    assert.ok(Number.isFinite(intent.x) && Number.isFinite(intent.y),
      'rebuilt tactics must remain finite');
  }
  console.log('PASS native AI tactical cache: AI/human identity, velocities, ball radius, stable fast-path');
} finally {
  room.destroy();
}
