'use strict';
// P1 host election: untrusted or corrupt measurements must not give an
// impossible negative-cost peer control of a running game.
const assert = require('node:assert/strict');
const N = require('../dist/netcode.js');

const players = ['a', 'b'];
const valid = {
  server: {a:120, b:120},
  rogue: {a:-800, b:-800}
};
assert.equal(N.hostCost(valid,'server',players),180,
  'legitimate RTT still has the expected finite cost');
assert.equal(N.hostCost(valid,'rogue',players),Infinity,
  'negative RTT is invalid, not a superior latency');

const partial = {rogue:{a:-1,b:100},server:{a:120,b:120}};
assert.equal(N.hostCost(partial,'rogue',players),Infinity,
  'one invalid hop invalidates a complete host route');
assert.equal(N.hostCost({rogue:{a:100,b:-1}},'rogue',players),Infinity);
assert.equal(N.hostCost({rogue:{a:0,b:0}},'rogue',players),0,
  'zero RTT is valid and must not be rejected');
assert.equal(N.hostCost({rogue:{a:1,b:1}},'rogue',players),1.5,
  'small legitimate RTT remains available');
assert.equal(N.hostCost({rogue:{a:NaN,b:1}},'rogue',players),Infinity);
assert.equal(N.hostCost({rogue:{a:Infinity,b:1}},'rogue',players),Infinity);
assert.equal(N.hostCost({rogue:{a:1}},'rogue',players),Infinity);

const matrix = new Map([
  ['rogue',new Map([['a',-1],['b',20]])],
  ['server',new Map([['a',120],['b',120]])]
]);
assert.equal(N.hostCost(matrix,'rogue',players),Infinity,
  'Map telemetry has the same input validation as plain objects');

const election=N.createElection({minGain:25,ratio:.85,hold:200});
for(const now of [0,100,250,1000]){
  const decision=election.decide({
    rtt:valid, players, candidates:['rogue','server'],current:'server',now
  });
  assert.equal(decision.host,'server','impossible measurements cannot change host');
  assert.equal(decision.switch,false,'impossible peer may not be elected');
  assert.equal(decision.pending,undefined,'impossible peer may not enter hysteresis');
}
const fixedRtt={server:{a:120,b:120},rogue:{a:10,b:10}};
assert.equal(election.decide({
  rtt:fixedRtt,players,candidates:['rogue','server'],current:'server',now:1500
}).pending,'rogue','valid better RTT is still considered');
const improved=election.decide({
  rtt:fixedRtt,players,candidates:['rogue','server'],current:'server',now:1800
});
assert.equal(improved.switch,true,'legitimate lower-latency host can still win');
assert.equal(improved.host,'rogue');
console.log('PASS negative RTT rejection, Map/object bounds, legitimate zero/positive pings, peer election and hysteresis');
