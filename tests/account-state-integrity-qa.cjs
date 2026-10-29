'use strict';
// Account state recovery safety: invalid persisted records must never be
// interpreted as a fresh, empty player registry and overwritten on signup.
// Uses private temp folders only; no gameplay, network, or production data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createAccounts}=require('../headless/accounts.cjs');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'fuckball-account-state-qa-'));
let checked=0;
try {
  const empty=path.join(root,'fresh');
  const first=createAccounts(empty);
  assert.equal(first.reserved('NewUser'),false,'first launch without a file remains permitted');
  const issued=first.register('NewUser','change-me1');
  assert.match(issued.token,/^[a-f0-9]{64}$/);
  assert.equal(createAccounts(empty).user(issued.token),'NewUser',
    'a normal first signup remains durable');
  checked++;

  const cases=[
    ['truncated-json','{"users":'],
    ['null-root','null'],
    ['array-root','[]'],
    ['missing-users','{"sessions":{}}'],
    ['missing-sessions','{"users":{}}'],
    ['users-array','{"users":[],"sessions":{}}'],
    ['sessions-array','{"users":{},"sessions":[]}'],
    ['users-string','{"users":"gone","sessions":{}}'],
    ['sessions-null','{"users":{},"sessions":null}'],
    ['prototype-bad','{"users":0,"sessions":{}}']
  ];
  for(const [name,raw] of cases) {
    const dir=path.join(root,name);
    fs.mkdirSync(dir);
    const file=path.join(dir,'accounts.json');
    fs.writeFileSync(file,raw,'utf8');
    assert.throws(()=>createAccounts(dir),/account|state|invalid|unavailable|corrupt/i,
      name+': malformed existing state must stop startup');
    assert.equal(fs.readFileSync(file,'utf8'),raw,
      name+': existing file must remain byte-for-byte unchanged');
    checked++;
  }

  // An existing directory where a file is expected is a real read error,
  // not ENOENT; the server must not silently enter first-run mode.
  const badType=path.join(root,'unreadable-record');
  fs.mkdirSync(path.join(badType,'accounts.json'),{recursive:true});
  assert.throws(()=>createAccounts(badType),
    /account|state|invalid|unavailable|directory|read/i,
    'non-file account source is not an empty account database');
  checked++;

  // Restore from a previously known-good copy and preserve account identity
  // instead of re-registering/claiming someone else's reserved nickname.
  const file=path.join(empty,'accounts.json');
  const knownGood=fs.readFileSync(file,'utf8');
  fs.writeFileSync(file,'{broken','utf8');
  assert.throws(()=>createAccounts(empty),/account|state|invalid|unavailable|corrupt/i);
  assert.equal(fs.readFileSync(file,'utf8'),'{broken');
  fs.writeFileSync(file,knownGood,'utf8');
  const restored=createAccounts(empty);
  assert.equal(restored.user(issued.token),'NewUser');
  assert.equal(restored.reserved('newuser'),true);
  checked++;

  console.log('PASS '+checked+' account-state fail-closed fixtures; first-run and recovery are durable');
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
