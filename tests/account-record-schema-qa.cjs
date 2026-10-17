'use strict';
// Synthetic corrupt-on-disk account entries must fail before the HTTP account
// service starts; never use any real player storage or credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createAccounts} = require('../headless/accounts.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-account-record-qa-'));
try {
  const healthy = path.join(root, 'healthy');
  fs.mkdirSync(healthy);
  const accounts = createAccounts(healthy);
  const first = accounts.register('KeeperOne', 'synthetic-keeper-password');
  const prototype = accounts.register('__proto__', 'synthetic-proto-password');
  const constructor = accounts.register('constructor', 'synthetic-constructor-pass');
  assert.equal(createAccounts(healthy).user(first.token), 'KeeperOne');
  assert.equal(createAccounts(healthy).user(prototype.token), '__proto__');
  assert.equal(createAccounts(healthy).user(constructor.token), 'constructor');
  const valid = JSON.parse(fs.readFileSync(path.join(healthy, 'accounts.json'), 'utf8'));
  const sessionKey = Object.keys(valid.sessions)[0];

  const cases = [
    ['null-user', v => { v.users.keeperone = null; }],
    ['array-user', v => { v.users.keeperone = []; }],
    ['missing-user-name', v => { delete v.users.keeperone.name; }],
    ['mismatched-user-name', v => { v.users.keeperone.name = 'Different'; }],
    ['noncanonical-user-key', v => { v.users.KeeperOne = v.users.keeperone; delete v.users.keeperone; }],
    ['nonstring-salt', v => { v.users.keeperone.salt = null; }],
    ['short-salt', v => { v.users.keeperone.salt = 'xyz'; }],
    ['short-hash', v => { v.users.keeperone.hash = 'aa'; }],
    ['malformed-hash', v => { v.users.keeperone.hash = 'z'.repeat(64); }],
    ['noninteger-user-created', v => { v.users.keeperone.created = 9.5; }],
    ['negative-user-created', v => { v.users.keeperone.created = -1; }],
    ['null-session', v => { v.sessions[sessionKey] = null; }],
    ['array-session', v => { v.sessions[sessionKey] = []; }],
    ['invalid-session-hash-key', v => { v.sessions.invalid = v.sessions[sessionKey]; delete v.sessions[sessionKey]; }],
    ['missing-session-owner', v => { delete v.sessions[sessionKey].u; }],
    ['foreign-session-owner', v => { v.sessions[sessionKey].u = 'absentuser'; }],
    ['noncanonical-session-owner', v => { v.sessions[sessionKey].u = 'KeeperOne'; }],
    ['string-expiry', v => { v.sessions[sessionKey].exp = '9999999999999'; }],
    ['invalid-expiry', v => { v.sessions[sessionKey].exp = -1; }],
    ['fractional-expiry', v => { v.sessions[sessionKey].exp = 1.5; }],
  ];
  for (const [label, mutate] of cases) {
    const folder = path.join(root, label); fs.mkdirSync(folder);
    const source = structuredClone(valid);
    mutate(source);
    const file = path.join(folder, 'accounts.json');
    const raw = JSON.stringify(source);
    fs.writeFileSync(file, raw);
    assert.throws(() => createAccounts(folder),
      /Account state invalid; refusing to start\./,
      label + ': every malformed existing record must be refused at startup');
    assert.equal(fs.readFileSync(file, 'utf8'), raw,
      label + ': rejection must not rewrite or truncate existing account data');
  }
  console.log('PASS: 20 invalid nested account/session records denied, 3 legitimate existing accounts preserved');
} finally {
  fs.rmSync(root, {recursive: true, force: true});
}
