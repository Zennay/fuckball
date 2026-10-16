'use strict';
// Release truth guard: README cannot promise capabilities disproved by
// integration/known-RED QA tests. These are documentation release claims,
// not substitutes for the executable game acceptance checks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const readme = fs.readFileSync('README.md', 'utf8');
assert.match(readme, /21 concurrent players are exercised/, 'docs must describe tested online room connection scale');
assert.match(readme, /issue #31/, 'docs must disclose pending four-per-side/bench acceptance');
assert.match(readme, /issue #28/, 'docs must disclose inert speculative direction prediction');
assert.match(readme, /Registered account names\/password verifiers and hashed session tokens can persist/,
  'docs must acknowledge existing persistent accounts without inventing ranked profiles');
assert.match(readme, /verified ranked identity, lifetime match history and complete reconnect restoration are not implemented/,
  'docs must distinguish basic accounts from competitive match identity');
for (const misleading of [
  /supports up to eight humans/i,
  /no accounts are implemented/i,
  /your own moves show instantly/i,
  /original HaxBall bit-for-bit parity/i
]) {
  assert.doesNotMatch(readme, misleading, 'README contains a misleading product acceptance claim');
}
console.log('PASS QA release-documentation contract: online room capacity, accounts, known RED #28/#31 and no implied HaxBall parity');
