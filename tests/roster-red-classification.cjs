'use strict';
const assert = require('node:assert/strict');
const {activeRosterOverflow} = require('../scripts/qa-roster-overflow.cjs');
const counts = (red, blue, extra = {}) =>
  ({connected:12,sockets:12,humans:12,red,blue,...extra});
assert.equal(activeRosterOverflow('12-person lobby',counts(6,6)),
  'KNOWN_RED_31_ACTIVE_OVERFLOW red=6 blue=6 connected=12');
assert.equal(activeRosterOverflow('12-person lobby',counts(4,5)),
  'KNOWN_RED_31_ACTIVE_OVERFLOW red=4 blue=5 connected=12');
assert.equal(activeRosterOverflow('12-person lobby',counts(5,4)),
  'KNOWN_RED_31_ACTIVE_OVERFLOW red=5 blue=4 connected=12');
for(const data of [
  counts(4,4),counts(3,5,{connected:11}),counts(6,6,{sockets:11}),
  counts(6,6,{humans:11}),counts(7,7),counts(-1,11),
  counts(5,5,{red:NaN}),counts(3,3)
]) assert.equal(activeRosterOverflow('12-person lobby',data),null,
  'do not whitelist unrelated lobby corruption: '+JSON.stringify(data));
assert.equal(activeRosterOverflow('13-person lobby', counts(7,6)),null);
assert.equal(activeRosterOverflow('12-person lobby', counts(0,0)),null);
console.log('PASS 4v4 known-RED classification: oversubscribed human roster only, 10 unrelated regressions rejected');
