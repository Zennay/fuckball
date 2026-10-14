'use strict';
const assert=require('node:assert/strict');
const SP=require('../dist/ai/selfplay.js');
const AI=require('../dist/ai/policy.js');
const {makeRoom}=require('../training/selfplay.cjs');
function run(seed){const rows=[];const result=SP.match(makeRoom,AI.defaultProfile,AI.defaultProfile,1,seed,'BFF',600,row=>rows.push(row),undefined,4);return {result,rows};}
const a=run(1001),b=run(1001),c=run(2048);
assert.deepEqual(a,b,'same seed must reproduce exact trajectory and labels');
assert.equal(a.rows.length,c.rows.length,'seed must not change sample counts');
assert.notDeepEqual(a.rows[0].x,c.rows[0].x,'fresh seed must vary initial engine rollout state');
assert(a.rows.every(row=>row.x.every(Number.isFinite)));
console.log('PASS fixed-seed reproducibility and independent randomized 4v4 native rollout states');
