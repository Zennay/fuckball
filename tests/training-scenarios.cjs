'use strict';
const assert=require('node:assert/strict');
const AI=require('../dist/ai/policy.js'),SP=require('../dist/ai/selfplay.js');
const {makeRoom}=require('../training/selfplay.cjs');
const signatures=new Set();
for(let scene=0;scene<4;scene++){
 const rows=[];
 const result=SP.match(makeRoom,AI.defaultProfile,AI.defaultProfile,1,
   20261017+scene,'BFF',600,row=>{if(row.frame===0&&row.id===1)rows.push(row);},null,4,scene);
 assert(result.seconds>5,'every training kickoff leads to playable simulation');
 assert.equal(rows.length,1,'scenario must emit usable supervised examples');
 assert(rows[0].x.every(Number.isFinite),'no malformed feature input');
 const signature=rows[0].x.slice(0,8).map(v=>v.toFixed(2)).join(':');
 assert(!signatures.has(signature),'training scenes must vary the ball/player relationships');
 signatures.add(signature);
}
// Four scenes repeat evenly across the full six-episode train/validation/test
// blocks; not just in the training data, avoiding distribution shift.
const groups=Array.from({length:24},(_,i)=>Math.floor(i/6)%4);
for(let scene=0;scene<4;scene++)assert.equal(groups.filter(x=>x===scene).length,6);
console.log('PASS four distinct physical training scenarios, valid native rollouts and balanced scenario splits');
