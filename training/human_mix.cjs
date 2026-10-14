'use strict';
// Optional, rights-cleared human replay demonstrations for the self-play trainer.
// Preserve whole-replay split isolation. Never copy human validation/test labels
// into the training index; provenance is kept on each human shard entry.
const fs = require('node:fs');
const path = require('node:path');
function entries(root, split) {
  const file = path.join(root, split + '.json');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(value.entries)) throw Error('Invalid ' + split + ' human index');
  return value.entries;
}
function mixHumanTraining(generated, root, limit = 64) {
  if (!Array.isArray(generated) || generated.length === 0) throw Error('Empty generated training split');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 2000) throw Error('Invalid human shard cap');
  if (!root) return { entries: generated, provenance: { enabled: false, humanShards: 0 } };
  const splits = Object.fromEntries(['train', 'validation', 'test'].map(s => [s, entries(root, s)]));
  if (Object.values(splits).some(items => items.length < 1))
    throw Error('Human train/validation/test must be nonempty and disjoint');
  const usedPaths = new Set(), usedHashes = new Set();
  const manifest = {};
  for (const [split, items] of Object.entries(splits)) {
    manifest[split] = new Set();
    for (const item of items) {
      const shard = path.resolve(item.shard_path || '');
      if (!shard.endsWith('.f32.gz') || !fs.existsSync(shard) || !fs.statSync(shard).isFile())
        throw Error('Missing human shard ' + shard);
      if (usedPaths.has(shard)) throw Error('Human split leakage: same shard in multiple splits');
      usedPaths.add(shard);
      if (typeof item.source_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.source_sha256))
        throw Error('Human replay is missing immutable SHA-256 provenance');
      if (usedHashes.has(item.source_sha256))
        throw Error('Human split leakage: duplicate replay across splits');
      usedHashes.add(item.source_sha256);
      manifest[split].add(shard);
    }
  }
  const choice = splits.train.slice().sort((a, b) => a.source_sha256.localeCompare(b.source_sha256)).slice(0, limit);
  const generatedPaths = new Set(generated.map(x => path.resolve(x.shard_path)));
  if (choice.some(item => generatedPaths.has(path.resolve(item.shard_path))))
    throw Error('Generated/human training shards overlap');
  return {
    entries: generated.concat(choice.map(item => ({ ...item, source: 'authorized-human-hbr2' }))),
    provenance: { enabled: true, humanShards: choice.length, humanValidationShards: splits.validation.length,
      humanTestShards: splits.test.length, totalAuthorizedTrainShards: splits.train.length,
      note: 'Human validation/test remain held out, not used for supervised training. Consent/license must be verified by operator.' }
  };
}
module.exports = { mixHumanTraining };
