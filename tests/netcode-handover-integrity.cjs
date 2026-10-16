'use strict';
// Deterministic input replay / migration regression for the shared v3 timeline.
// CI exercises exactly the same serialize->resume path used by room handovers.
const assert = require('node:assert/strict');
const {createInputTimeline} = require('../dist/netcode.js');

function rand(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}
function inspect(left, right, label) {
  assert.deepEqual(right.export(), left.export(), label + ': handover preserved timeline state');
  assert.equal(right.current, left.current, label + ': effective input preserved');
  assert.equal(right.appliedSeq, left.appliedSeq, label + ': acknowledged frame sequence preserved');
  assert.equal(right.pending, left.pending, label + ': queued future events preserved');
}
let checks = 0;
for (let seed = 1; seed <= 32; seed++) {
  const random = rand(seed * 0x9e3779b1);
  const baseline = createInputTimeline();
  let resumed = createInputTimeline();
  let nextSeq = 1;
  for (let frame = 0; frame < 240; frame++) {
    const packets = [];
    const count = Math.floor(random() * 4);
    for (let i = 0; i < count; i++) {
      const value = Math.floor(random() * 32);
      const stamped = frame + Math.floor(random() * 25) - 8;
      packets.push([nextSeq++, stamped, value]);
    }
    if (packets.length && random() < .4) packets.unshift([...packets.at(-1)]);
    if (random() < .1) packets.push([0, frame, 63]); // rejected invalid input
    if (random() < .25) packets.reverse();
    const hostTime = frame + random();
    assert.equal(resumed.receive(packets, frame, hostTime),
      baseline.receive(packets, frame, hostTime), seed + ': same packet admission');
    if (frame % 7 === 0) {
      // Export/import converts to JSON over WebSocket and reconstructs the
      // host-side input buffer from authoritative snapshot.
      const copy = JSON.parse(JSON.stringify(resumed.export()));
      resumed = createInputTimeline();
      resumed.import(copy);
    }
    assert.equal(resumed.valueAt(frame), baseline.valueAt(frame),
      seed + ': identical input at frame ' + frame);
    inspect(baseline, resumed, seed + '/' + frame);
    checks++;
  }
}

// 32-bit input sequence IDs travel as unsigned snapshot ack fields. Migration
// must not reinterpret >= 2^31 as negative (which would replay duplicates).
{
  const t = createInputTimeline();
  const ids = [0x7ffffffe, 0x7fffffff, 0x80000000, 0xfffffffe];
  const packets = ids.map((seq, i) => [seq, 20 + i, i % 2 ? 0 : 16]);
  assert.equal(t.receive(packets, 19, 19.3), ids.length);
  for (let frame = 19; frame <= 24; frame++) t.valueAt(frame);
  const initial = t.export();
  const imported = createInputTimeline();
  imported.import(JSON.parse(JSON.stringify(initial)));
  inspect(t, imported, 'unsigned sequence migration');
  assert.equal(imported.receive([[0xfffffffe, 24, 16]], 25, 25), 0,
    'duplicate high-bit input cannot be reaccepted following handover');
  assert.equal(imported.receive([[0xffffffff, 25, 0]], 25, 25), 1,
    'maximum uint32 sequence accepted once after handover');
  assert.equal(imported.valueAt(25), 0);
  assert.equal(imported.appliedSeq, 0xffffffff);
  assert.equal(imported.receive([[0xffffffff, 25, 0]], 26, 26), 0,
    'retransmitted maximum sequence cannot execute twice');
}
console.log('PASS input timeline handovers: ' + checks +
  ' deterministic seed/frame comparisons, mixed jitter, kicks, duplicates, invalid packets, and uint32 ack boundary');
