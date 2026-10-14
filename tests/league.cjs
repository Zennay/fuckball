'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AI = require('../dist/ai/policy.js');
const { runMatch, evaluate, decideGate, scoreFor, integer } = require('../training/league.cjs');
const { mixHumanTraining } = require('../training/human_mix.cjs');
const model = AI.validateModel(JSON.parse(fs.readFileSync('dist/ai/trained-model.json', 'utf8')));
assert.equal(scoreFor(2, 1), 1);
assert.equal(scoreFor(0, 0), 0.5);
assert.equal(scoreFor(1, 2), 0);
assert.throws(() => integer('1.2', 'foo', 0, 100), /integer/);
assert.throws(() => integer('-2', 'foo', 0, 100), /integer/);
assert.throws(() => decideGate({ matches: 0, scoreRate: 1, goalDifference: 5,
  meanPairDistance: 150, totalKicks: 10 }, { matches: 4, scoreRate: 1, goalDifference: 5,
  meanPairDistance: 150, totalKicks: 10 }).promoted, /never/);
// A tied candidate cannot be promoted; win-only rewards cannot bypass partner tests.
const good = { matches: 8, scoreRate: .625, goalDifference: 3, meanPairDistance: 190, totalKicks: 18 };
const peers = { matches: 4, scoreRate: .5, goalDifference: 0, meanPairDistance: 180, totalKicks: 8 };
assert.equal(decideGate(good, peers).promoted, true);
assert.equal(decideGate({ ...good, scoreRate: .5 }, peers).promoted, false);
assert.equal(decideGate(good, { ...peers, meanPairDistance: 0 }).promoted, false);
assert.equal(decideGate(good, { ...peers, scoreRate: .25 }).promoted, false);
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'fuckball-league-'));
try {
  const replay = path.join(base, 'match.hbr2');
  const a = runMatch({ candidate: model, incumbent: model, candidateSide: 1, seed: 900,
    map: 'BFF Big v4', frames: 300, replayPath: replay });
  assert.equal(a.frames, 300);
  assert.equal(a.side, 1);
  assert.equal(a.candidate.meanPairDistance > 0, true);
  assert.equal(a.incumbent.meanPairDistance > 0, true);
  assert.equal(a.candidate.distinctKickers <= 4, true);
  assert.equal(fs.readFileSync(replay).subarray(0, 4).toString(), 'HBR2');
  const b = runMatch({ candidate: model, incumbent: model, candidateSide: 2, seed: 900,
    map: 'BFF Big v4', frames: 300 });
  assert.deepEqual({ a: a.goals, b: a.conceded }, { a: b.conceded, b: b.goals },
    'identical policies on swapped sides must have mirror-symmetric outcomes');
  const series = evaluate({ candidate: model, incumbent: model, seed: 100, frames: 300 });
  assert.equal(series.games.length, 12);
  assert.equal(series.headToHead.matches, 8);
  assert.equal(series.unfamiliarPartners.matches, 4);
  assert.equal(series.gate.promoted, false, 'same model must not falsely beat itself');
  assert(series.games.every(g => g.candidate.meanPairDistance > 0 && g.incumbent.meanPairDistance > 0));
  const human = path.join(base, 'human');
  fs.mkdirSync(human);
  const ids = ['a', 'b', 'c'];
  for (const [i, split] of ['train', 'validation', 'test'].entries()) {
    const shard = path.join(human, split + '.f32.gz');
    fs.writeFileSync(shard, 'fixture');
    fs.writeFileSync(path.join(human, split + '.json'),
      JSON.stringify({ entries: [{ shard_path: shard, source_sha256: ids[i].repeat(64) }] }));
  }
  const synthetic = [{ shard_path: path.join(base, 'synth.f32.gz') }];
  assert.equal(mixHumanTraining(synthetic, null).entries.length, 1);
  const mixed = mixHumanTraining(synthetic, human);
  assert.equal(mixed.entries.length, 2);
  assert.equal(mixed.provenance.humanValidationShards, 1);
  assert.equal(mixed.provenance.humanTestShards, 1);
  const testIndex = path.join(human, 'test.json');
  const old = JSON.parse(fs.readFileSync(testIndex));
  fs.writeFileSync(testIndex, fs.readFileSync(path.join(human, 'train.json')));
  assert.throws(() => mixHumanTraining(synthetic, human), /leakage/);
  fs.writeFileSync(testIndex, JSON.stringify(old));
  console.log('PASS 4v4 neural league games, side swapping, HBR2 replays, gate and human split integrity');
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}
