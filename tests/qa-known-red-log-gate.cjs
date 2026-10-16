'use strict';
const assert = require('node:assert/strict');
const {evaluate}=require('../scripts/qa-known-red-log-gate.cjs');
const rosterLine='KNOWN_RED_31_ACTIVE_OVERFLOW red=6 blue=6 connected=12';
const redAssert='AssertionError [ERR_ASSERTION]: 12-person lobby: exactly four active red players';
const rosterRed=[rosterLine,redAssert,'    at assertFourAside (tests/room-roster-acceptance.cjs:44:10)','  actual: 6,','  expected: 4,'].join('\n');
const rosterBlue=[
  'KNOWN_RED_31_ACTIVE_OVERFLOW red=4 blue=5 connected=12',
  'AssertionError [ERR_ASSERTION]: 12-person lobby: exactly four active blue players'
].join('\n');
const inputLabel='speculative direction affects movement at 50ms';
const inputMessage='50ms must predict rightward input; observed movement difference 0.000000';
const inputRed=[
  'PASS unrelated native control',
  'RED '+inputLabel+': '+inputMessage,
  '#28 still RED (1):',
  '- '+inputLabel+': '+inputMessage
].join('\n');
const greenInput='PASS #28 input replay acceptance: pending direction/kick affect predicted physics without mutating source';
const greenRoster='PASS #31 4v4 roster acceptance: 12+ connected, four per team, spectator join, owner and authorization invariant';
for(const [suite,code,log,want] of [
  ['roster',1,rosterRed,'KNOWN_RED'],
  ['roster',1,rosterBlue,'KNOWN_RED'],
  ['input',1,inputRed,'KNOWN_RED'],
  ['roster',0,greenRoster,'GREEN'],
  ['input',0,greenInput,'GREEN']
]) assert.equal(evaluate(suite,code,log),want,suite+': '+want);
const attacks=[
  ['roster',1,rosterLine],                          // a printed token without expected assertion
  ['roster',1,rosterRed+'\nTypeError: later server crash'],
  ['roster',1,rosterRed+'\n'+redAssert],          // duplicated assertion
  ['roster',1,rosterRed.replace('connected=12','connected=11')],
  ['roster',1,rosterRed.replace('red=6 blue=6','red=4 blue=4')],
  ['roster',1,rosterRed.replace('red=6 blue=6','red=8 blue=6')],
  ['roster',1,rosterRed.replace('red=6 blue=6','red=4 blue=6')], // mismatched first-failing team
  ['roster',0,rosterRed],['roster',137,rosterRed],
  ['roster',1,greenRoster],
  ['input',1,'#28 still RED (1):\n- '+inputLabel+': '+inputMessage],
  ['input',1,inputRed+'\nReferenceError: wrong release asset'],
  ['input',1,inputRed.replace('RED (1)','RED (2)')],
  ['input',1,inputRed.replace(inputMessage,'different failure')],
  ['input',1,inputRed+'\n- '+inputLabel+': '+inputMessage],
  ['input',137,inputRed],
  ['input',0,inputRed],
  ['input',1,inputRed.replace('50ms must predict','50ms: native control must')],
  ['input',1,inputRed+'\nUNEXPECTED QA FAILURE another test'],
  ['input',1,greenInput],
  ['input',0,greenInput+'\nRED fake: failure'],
  ['input',0,''],
  ['roster',0,''],
  ['roster',1,rosterRed+'\n#28 still RED (1):'],
  ['unknown',1,rosterRed],
];
for(const [suite,code,log] of attacks) {
  assert.throws(()=>evaluate(suite,code,log),undefined,
    'CI must reject forged, incomplete or unexpected '+suite+' acceptance evidence: '+log);
}
console.log('PASS QA known-RED log gate: 5 valid result patterns, '+attacks.length+' invalid/error-injection cases rejected');
