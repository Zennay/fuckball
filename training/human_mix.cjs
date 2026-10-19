'use strict';
// Rights-gated human HBR2 curriculum for the native self-play trainer.
// Never contaminate generated validation/test or rewrite immutable sources.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const HASH = /^[a-f0-9]{64}$/;
const OPTIONAL_MISSING = /^(?:tm3|op4)_(?:dx|dy|dvx|dvy|present)$|^score_diff$/;
const MAX_UNCOMPRESSED = 32 * 1024 * 1024;

function load(root, split) {
  const obj = JSON.parse(fs.readFileSync(path.join(root, split + '.json'), 'utf8'));
  if (!Array.isArray(obj.entries)) throw Error('Invalid ' + split + ' human index');
  return obj.entries;
}
function fileInfo(item) {
  if (!item || typeof item !== 'object' || typeof item.shard_path !== 'string' ||
      !path.isAbsolute(item.shard_path) || typeof item.source_sha256 !== 'string' ||
      !HASH.test(item.source_sha256)) throw Error('Invalid human replay provenance');
  const shard = path.resolve(item.shard_path);
  if (!shard.endsWith('.f32.gz')) throw Error('Invalid human shard suffix');
  const stat = fs.lstatSync(shard);
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Human shard must be a regular file');
  return { ...item, shard_path: shard };
}
function score(sha, cycle) {
  return crypto.createHash('sha256').update(String(cycle) + ':' + sha)
    .digest().readUInt32BE(0);
}
function normalizeShard(item, columns, targetDir) {
  const src = item.shard_path;
  const meta = JSON.parse(fs.readFileSync(src.replace(/\.f32\.gz$/, '.meta.json'), 'utf8'));
  if (meta.schema !== 'haxlab-imitation-shard-v2' || !Array.isArray(meta.columns) ||
      !Number.isSafeInteger(meta.rowWidth) || meta.rowWidth !== meta.columns.length ||
      new Set(meta.columns).size !== meta.columns.length) throw Error('Unsupported human shard layout');
  const absent = columns.filter(column => !meta.columns.includes(column));
  if (absent.some(column => !OPTIONAL_MISSING.test(column))) {
    throw Error('Unsafe missing human feature: ' + absent.join(','));
  }
  const raw = zlib.gunzipSync(fs.readFileSync(src), { maxOutputLength: MAX_UNCOMPRESSED });
  if (raw.length % (meta.rowWidth * 4) !== 0 || raw.length === 0)
    throw Error('Invalid human float32 shard');
  const rows = raw.length / 4 / meta.rowWidth;
  const input = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const output = new Float32Array(rows * columns.length);
  const indices = columns.map(column => meta.columns.indexOf(column));
  for (let r = 0; r < rows; r++) {
    const offset = r * meta.rowWidth, target = r * columns.length;
    for (let c = 0; c < columns.length; c++) {
      const value = indices[c] < 0 ? 0 : input[offset + indices[c]];
      if (!Number.isFinite(value)) throw Error('Nonfinite human demonstration');
      output[target + c] = value;
    }
  }
  const stem = item.source_sha256;
  const dest = path.join(targetDir, stem + '.f32.gz');
  const staging = dest + '.tmp';
  fs.writeFileSync(staging, zlib.gzipSync(Buffer.from(output.buffer), { level: 5 }));
  fs.renameSync(staging, dest);
  const metadata = {
    schema: 'haxlab-imitation-shard-v2', columns, rowWidth: columns.length,
    samples: rows, stadium: item.stadium, source: 'authorized-human-hbr2',
    source_sha256: stem, imputedMissingFeatures: absent,
    note: 'Missing optional player slots and score difference are zero-imputed, not observed.'
  };
  fs.writeFileSync(dest.replace(/\.f32\.gz$/, '.meta.json'), JSON.stringify(metadata));
  return { ...item, shard_path: dest, source: 'authorized-human-hbr2', samples: rows };
}
function mixHumanTraining(generated, root, limit = 64) {
  if (!Array.isArray(generated) || generated.length === 0)
    throw Error('Empty generated training split');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 2000)
    throw Error('Invalid human shard cap');
  if (!root) return { entries: generated, provenance: { enabled: false, humanShards: 0 } };
  if (process.env.HAXLAB_HUMAN_RIGHTS_CONFIRMED !== 'yes')
    throw Error('Human replay rights/consent not explicitly confirmed; cannot train on this dataset');
  const splits = Object.fromEntries(['train', 'validation', 'test'].map(s => [s, load(root, s)]));
  const unique = {}, seenSha = new Map(), seenPath = new Map(), collapsed = {};
  for (const [split, items] of Object.entries(splits)) {
    unique[split] = new Map();
    collapsed[split] = 0;
    for (const raw of items) {
      const item = fileInfo(raw), sha = item.source_sha256, shard = item.shard_path;
      if (seenSha.has(sha) && seenSha.get(sha).split !== split)
        throw Error('Human split leakage: replay SHA in multiple splits');
      if (seenPath.has(shard) && seenPath.get(shard) !== sha)
        throw Error('Human split leakage: shard has conflicting provenance');
      if (unique[split].has(sha)) {
        const first = unique[split].get(sha);
        if (first.shard_path !== shard || first.stadium !== item.stadium ||
            first.samples !== item.samples)
          throw Error('Conflicting repeated human replay entries');
        collapsed[split]++;
        continue;
      }
      seenSha.set(sha, { split, shard });
      seenPath.set(shard, sha);
      unique[split].set(sha, item);
    }
    if (!unique[split].size) throw Error('Human ' + split + ' split is empty');
  }
  const outputRoot = path.dirname(path.resolve(generated[0].shard_path));
  const meta = JSON.parse(fs.readFileSync(generated[0].shard_path.replace(/\.f32\.gz$/, '.meta.json'), 'utf8'));
  if (meta.schema !== 'haxlab-imitation-shard-v2' || !Array.isArray(meta.columns) ||
      meta.columns.length !== meta.rowWidth || new Set(meta.columns).size !== meta.columns.length)
    throw Error('Generated training shard schema is not canonical');
  const generatedPaths = new Set(generated.map(x => path.resolve(x.shard_path)));
  const cycle = Number((outputRoot.match(/cycle-(\d+)$/) || [])[1] || 0);
  // Side-balanced BFF Big and Classic demonstrations only. Non-4v4 map
  // variants remain archived but are not blindly mixed into BFF/Classic.
  const eligible = [...unique.train.values()].filter(x =>
    x.stadium === 'BFF Big v4' || x.stadium === 'BFF Classic v3' || x.stadium === 'Classic');
  const byMap = {
    BFF: eligible.filter(x => x.stadium === 'BFF Big v4'),
    Classic: eligible.filter(x => x.stadium !== 'BFF Big v4')
  };
  for (const list of Object.values(byMap))
    list.sort((a, b) => score(a.source_sha256, cycle) - score(b.source_sha256, cycle) ||
      a.source_sha256.localeCompare(b.source_sha256));
  const minority = Math.min(byMap.Classic.length, Math.floor(limit / 4));
  const choice = byMap.Classic.slice(0, minority)
    .concat(byMap.BFF.slice(0, limit - minority))
    .concat(byMap.Classic.slice(minority, Math.max(minority, limit - byMap.BFF.length)))
    .slice(0, limit);
  if (!choice.length) throw Error('No eligible 4v4 human replay shards');
  if (choice.some(x => generatedPaths.has(x.shard_path)))
    throw Error('Generated/human training shards overlap');
  const targetDir = path.join(outputRoot, 'human-normalized');
  fs.mkdirSync(targetDir, { recursive: true });
  const adapted = choice.map(item => normalizeShard(item, meta.columns, targetDir));
  return {
    entries: generated.concat(adapted),
    provenance: {
      enabled: true, rightsGate: 'operator-confirmed', humanShards: adapted.length,
      humanUniqueTrainReplays: unique.train.size,
      humanValidationReplays: unique.validation.size,
      humanTestReplays: unique.test.size,
      collapsedRepeatedTrainRows: collapsed.train, retainedEligibleTrainReplays: eligible.length,
      excludedNon4v4TrainReplays: unique.train.size - eligible.length,
      selectedBFF: adapted.filter(x => x.stadium === 'BFF Big v4').length,
      selectedClassic: adapted.filter(x => x.stadium !== 'BFF Big v4').length,
      curriculumCycle: cycle, imputationPolicy: 'only tm3/op4 empty slots and score_diff',
      note: 'Per-cycle replay rotation, no source mutation. Held-out human validation/test are not trained on.'
    }
  };
}
module.exports = { mixHumanTraining };
