'use strict';
// Release gate for Fuckball physics issue #9: compare rendered state with the
// pinned native 60 Hz engine, not with the retired shared/physics.js solver.
// This is an automated parity check, NOT proof of subjective HaxBall feel.
// Queued speculative input behavior needs a separate RED->GREEN fix (#28).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {HBInit} = require('../headless/runtime.cjs');
const Render = require('../dist/render-timing.js');

const bff = fs.readFileSync('dist/stadiums/bff-big-v4.hbs', 'utf8');
const HORIZONS_MS = [0, 50, 100, 200];
const REFRESH_HZ = [60, 120, 144, 240];
const EPS = 1e-9;

function openRoom() {
  const room = HBInit({noPlayer: true});
  room.setCustomStadium(bff);
  room.addPlayer(1, 'Red', 1);
  room.addPlayer(2, 'Blue', 2);
  room.setScoreLimit(0);
  room.setTimeLimit(0);
  room.startGame();
  room.step(2);
  room.setPlayerInput(1, 0);
  room.setPlayerInput(2, 0);
  room.setPlayerDiscProperties(1, {x: -400, y: 100, xspeed: 0, yspeed: 0});
  room.setPlayerDiscProperties(2, {x: 400, y: -100, xspeed: 0, yspeed: 0});
  room.setDiscProperties(0, {x: 0, y: 0, xspeed: 0, yspeed: 0});
  return room;
}

function readings(state) {
  const discs = state.gameState.physicsState.discs;
  const result = [];
  for (const [i, disc] of discs.entries()) {
    if (!disc) continue;
    result.push({key: 'disc ' + i, values: [disc.pos.x, disc.pos.y, disc.speed.x, disc.speed.y]});
  }
  return result;
}

function equalPhysics(actual, expected, label) {
  const a = readings(actual);
  const b = readings(expected);
  assert.equal(a.length, b.length, label + ': count of simulated discs');
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].key, b[i].key, label + ': disc identity');
    for (let n = 0; n < 4; n++) {
      assert(Number.isFinite(a[i].values[n]) && Number.isFinite(b[i].values[n]),
        label + ': non-finite ' + a[i].key + ' component ' + n);
      assert(Math.abs(a[i].values[n] - b[i].values[n]) < EPS,
        label + ': ' + a[i].key + ' component ' + n +
        ', render=' + a[i].values[n] + ', native=' + b[i].values[n]);
    }
  }
}

// Deliberately separate reference implementation: step the real HaxBall
// physics once per 60 Hz tick; fractional display frames use a final partial
// native tick. Replay local inputs on their recorded frame, never as one
// giant dt update.
function nativeTruth(state, frames, events = [], baseFrame = 0) {
  // Zero lookahead returns the current snapshot without any simulation.
  if (!(frames > 0)) return state.copy();
  const copy = state.copy();
  const full = Math.floor(frames);
  let nextEvent = 0;
  for (let f = 0; f <= full; f++) {
    while (nextEvent < events.length && events[nextEvent].frame <= baseFrame + f) {
      const event = events[nextEvent++];
      copy.Go(event.id, event.input);
    }
    const delta = f < full ? 1 : frames - full;
    // Native HaxBall's render sampler calls nM(0) for an exact whole-frame
    // horizon. That zero-dt call still applies damping to stored velocities
    // (but not position). Mirror the renderer, not an idealised integrator.
    copy.nM(delta);
  }
  return copy;
}

const scenarios = [
  {
    name: 'open-field flight',
    setup(room) { room.setDiscProperties(0, {x: 0, y: 0, xspeed: 6, yspeed: -1}); }
  },
  {
    name: 'native BFF wall rebound',
    setup(room) { room.setDiscProperties(0, {x: 0, y: 300, xspeed: 0, yspeed: 6}); }
  },
  {
    name: 'player-ball collision',
    setup(room) {
      room.setPlayerDiscProperties(1, {x: -65, y: 0, xspeed: 1, yspeed: 0});
      room.setDiscProperties(0, {x: -10, y: 0, xspeed: -3, yspeed: 0});
      room.setPlayerInput(1, 8);
    }
  },
  {
    name: 'authoritative native kick impulse and subsequent flight',
    setup(room) {
      room.setPlayerDiscProperties(1, {x: -23, y: 0, xspeed: 0, yspeed: 0});
      room.setDiscProperties(0, {x: 0, y: 0, xspeed: 0, yspeed: 0});
      // Kicks are executed by the authoritative Room's input handler, not
      // directly by RoomState.Go() during a speculative visual replay.
      room.setPlayerInput(1, 16);
      room.step(1);
      assert(room.getDiscProperties(0).xspeed > 4,
        'native room must produce a real full-strength kick on fresh press');
      room.setPlayerInput(1, 0);
    }
  },
  {
    name: 'input changes after an already active player move',
    setup(room) {
      room.setPlayerDiscProperties(1, {x: -100, y: -60, xspeed: 0, yspeed: 0});
      room.setDiscProperties(0, {x: 0, y: 0, xspeed: 0, yspeed: 0});
      room.setPlayerInput(1, 8);
      room.step(1);
    },
    events: [{frame: 2, id: 1, input: 4}, {frame: 3, id: 1, input: 20},
      {frame: 4, id: 1, input: 4}, {frame: 8, id: 1, input: 0}]

  }
];

let checks = 0;
for (const scenario of scenarios) {
  const room = openRoom();
  try {
    scenario.setup(room);
    const source = room._room.state;
    const before = JSON.stringify(readings(source));
    const events = scenario.events || [];
    for (const ms of HORIZONS_MS) {
      const frames = ms * 60 / 1000;
      equalPhysics(Render.extrapolate(source, frames, events), nativeTruth(source, frames, events),
        scenario.name + ' @ ' + ms + 'ms');
      checks++;
    }
    // All refresh rates must sample the SAME authoritative 60 Hz timeline.
    // Include fractional render frames (144/240 Hz) through contacts/bounces.
    for (const hz of REFRESH_HZ) {
      for (let paint = 1; paint <= 24; paint++) {
        const frames = paint * 60 / hz;
        equalPhysics(Render.extrapolate(source, frames, events), nativeTruth(source, frames, events),
          scenario.name + ' paint ' + paint + '/' + hz + 'Hz');
        checks++;
      }
    }
    assert.equal(JSON.stringify(readings(source)), before,
      scenario.name + ': rendering must never mutate authoritative physics');
    const capped = Render.extrapolate(source, 500, events);
    equalPhysics(capped, nativeTruth(source, 120, events),
      scenario.name + ': maximum 120 predicted 60 Hz frames');
    checks++;
    // Known limitation tracked in #28: queued local changes may not yet alter
    // motion in the native RoomState copy. Both paths above are compared for
    // actual parity, but their difference from an idle prediction is NOT a
    // release gate until the input-replay implementation is corrected.
  } finally {
    room.destroy();
  }
}
console.log('PASS native BFF physics latency/refresh matrix: ' + scenarios.length +
  ' scenarios, 0/50/100/200ms, 60/120/144/240Hz, input taps, non-mutation, cap (' +
  checks + ' parity checks)');
