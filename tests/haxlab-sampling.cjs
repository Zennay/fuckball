'use strict';
const assert=require('node:assert/strict');
const SP=require('../dist/ai/selfplay.js');
const AI=require('../dist/ai/policy.js');
const {makeRoom}=require('../training/selfplay.cjs');

// Same physics/game state, but denser action snapshots for supervised rollouts.
// Browser Academy keeps its original 12-frame sampling default.
const normal=[],dense=[];
const a=SP.match(makeRoom,AI.defaultProfile,AI.defaultProfile,1,4499,'BFF',600,row=>normal.push(row));
const b=SP.match(makeRoom,AI.defaultProfile,AI.defaultProfile,1,4499,'BFF',600,row=>dense.push(row),undefined,4);
assert.equal(normal.length,8*(600/12));
assert.equal(dense.length,8*(600/4));
assert.equal(a.fitness,b.fitness,'recording cadence must never affect physics or results');
assert.equal(a.goals,b.goals);
assert.equal(a.conceded,b.conceded);
assert(dense.every(row=>row.x.length===AI.columns.length && row.dir>=0&&row.dir<=8));
assert(dense.every(row=>row.frame%4===0));
assert.throws(()=>SP.match(makeRoom,AI.defaultProfile,AI.defaultProfile,1,1,'BFF',600,null,null,0),/sample stride/);
console.log('PASS native HaxLab 4v4 4-frame sampling preserves the same headless engine outcomes');
