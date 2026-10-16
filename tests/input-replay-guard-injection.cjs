'use strict';
// Adversarial control execution proof for #28. The accepted prediction RED must
// never hide a broken native room input handler or source-state mutation.
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');

const injections = [
  {
    name:'authoritative direction silently ignored',
    setup:`const native=require('./headless/runtime.cjs');
const real=native.HBInit;
native.HBInit=(...args)=>{
  const room=real(...args);
  const original=room.setPlayerInput;
  room.setPlayerInput=(id,input)=>original.call(room,id,input===8?0:input);
  return room;
};`,
    expected:/authoritative native control must physically move/
  },
  {
    name:'speculative rendering corrupts the authoritative state',
    setup:`const render=require('./dist/render-timing.js');
const original=render.extrapolate;
render.extrapolate=(state,...args)=>{
  const result=original(state,...args);
  state.players.find(p=>p.id===1).disc.pos.x+=10;
  return result;
};`,
    expected:/rendering must never modify authoritative physics/
  },
  {
    name:'authoritative native kick handler disabled',
    setup:`const native=require('./headless/runtime.cjs');
const real=native.HBInit;
native.HBInit=(...args)=>{
  const room=real(...args);
  const original=room.setPlayerInput;
  room.setPlayerInput=(id,input)=>original.call(room,id,input===16?0:input);
  return room;
};`,
    expected:/same kick must be demonstrably possible in authoritative native room/
  }
];

for(const scenario of injections) {
  const result=spawnSync(process.execPath,['-e',
    scenario.setup+"\nrequire('./tests/input-replay-acceptance.cjs');"],{
    cwd:process.cwd(),encoding:'utf8',timeout:15000,maxBuffer:1024*1024
  });
  if(result.error) throw result.error;
  const output=(result.stdout||'')+'\n'+(result.stderr||'');
  assert.notEqual(result.status,0,
    scenario.name+': injected regression must not pass the QA canary');
  assert.match(output,/UNEXPECTED QA FAILURE /,
    scenario.name+': must be classified as an unexpected failure rather than known RED');
  assert.match(output,scenario.expected,
    scenario.name+': the independent control should be executed before speculative RED');
}
console.log('PASS #28 acceptance guard injections: 3 native input/state failures cannot be hidden by known RED prediction');
