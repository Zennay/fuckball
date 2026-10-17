'use strict';
// Model promotion prerequisite: reject structurally corrupted replay-trained
// weight files before they are used for live bot decisions. This is entirely
// offline, deterministic and never promotes a model or changes native physics.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const AI=require('../dist/ai/policy.js');
const baseline=JSON.parse(fs.readFileSync('dist/ai/trained-model.json','utf8'));
const original=JSON.stringify(baseline);
assert.equal(AI.validateModel(baseline),baseline,'committed model is schema-valid');
assert.equal(JSON.stringify(baseline),original,'validation never rewrites shipped weights');
const adversarial=[
  ['schema mismatch',m=>{m.schema='arbitrary-policy';}],
  ['missing input columns',m=>{delete m.input_columns;}],
  ['input column count',m=>{m.input_columns.pop();}],
  ['unknown feature name',m=>{m.input_columns[0]='secret_extra_feature';}],
  ['duplicate feature',m=>{m.input_columns[1]=m.input_columns[0];}],
  ['short hidden layer',m=>{m.b1=m.b1.slice(0,7);}],
  ['oversized hidden layer',m=>{m.b1=Array(513).fill(0);}],
  ['invalid temporal window',m=>{m.window=17;}],
  ['fractional temporal window',m=>{m.window=1.5;}],
  ['missing weight matrix',m=>{delete m.w1;}],
  ['missing one first-layer row',m=>{m.w1.pop();}],
  ['ragged first-layer row',m=>{m.w1[0].pop();}],
  ['infinite input weight',m=>{m.w1[0][0]=Infinity;}],
  ['NaN input weight',m=>{m.w1[0][0]=NaN;}],
  ['oversized input weight',m=>{m.w1[0][0]=100001;}],
  ['invalid direction head count',m=>{m.wd.pop();}],
  ['ragged direction output',m=>{m.wd[0].pop();}],
  ['invalid kick head width',m=>{m.wk[0].push(1);}],
  ['NaN kick weight',m=>{m.wk[0][0]=NaN;}],
  ['truncated input mean',m=>{m.mean.pop();}],
  ['infinite input mean',m=>{m.mean[0]=Infinity;}],
  ['zero normalization',m=>{m.std[0]=0;}],
  ['negative normalization',m=>{m.std[0]=-0.001;}],
  ['NaN normalization',m=>{m.std[0]=NaN;}],
  ['incomplete hidden bias',m=>{m.b1.pop();}],
  ['bad direction bias',m=>{m.bd[0]=NaN;}],
  ['bad kick bias length',m=>{m.bk=[];}],
  ['negative kick threshold',m=>{m.kick_threshold=-0.1;}],
  ['threshold above one',m=>{m.kick_threshold=1.1;}],
  ['non-finite kick threshold',m=>{m.kick_threshold=Infinity;}]
];
let rejected=0;
function rejectBad(label,origin,change){
  const sourceJSON=JSON.stringify(origin);
  const mutant=structuredClone(origin);
  change(mutant);
  assert.throws(()=>AI.validateModel(mutant),Error,
    label+': invalid model must fail before inference or live promotion');
  assert.equal(JSON.stringify(origin),sourceJSON,
    label+': source fixture must remain unchanged');
  rejected++;
}
for(const [label,fn] of adversarial)rejectBad(label,baseline,fn);

// Also validate the supported role-conditioned second-layer model format,
// which has a distinct (n*window+4) first-layer and h->h2 second layer.
const h=baseline.b1.length,h2=16,columns=baseline.input_columns.length;
const roleModel=structuredClone(baseline);
roleModel.window=1;
roleModel.w1=Array.from({length:columns+4},(_,i)=>
  i<columns?baseline.w1[i].slice():Array(h).fill(0));
roleModel.w2=Array.from({length:h},()=>Array(h2).fill(0));
roleModel.b2=Array(h2).fill(0);
roleModel.wd=Array.from({length:h2},()=>Array(9).fill(0));
roleModel.wk=Array.from({length:h2},()=>[0]);
roleModel.role_order=['gk','dm','am','st'];
assert.equal(AI.validateModel(roleModel),roleModel,
  'known-safe role-conditioned model schema is admissible');
for(const [label,fn] of [
  ['missing role order',m=>{delete m.role_order;}],
  ['incorrect role order',m=>{m.role_order.reverse();}],
  ['missing role input row',m=>{m.w1.pop();}],
  ['missing second-layer row',m=>{m.w2.pop();}],
  ['ragged second-layer row',m=>{m.w2[0].pop();}],
  ['non-finite role weight',m=>{m.w2[0][0]=NaN;}],
  ['wrong second-layer bias',m=>{m.b2.pop();}],
  ['wrong second-layer direction head',m=>{m.wd.pop();}],
  ['role second-layer kick head',m=>{m.wk[0][0]=Infinity;}]
])rejectBad(label,roleModel,fn);
assert.equal(JSON.stringify(baseline),original,
  'testing malformed models must not corrupt the committed live baseline');
console.log('PASS fail-closed AI weight admission: 2 supported layouts, '+rejected+
  ' malicious/invalid shape, value, feature and normalization mutations');
