'use strict';
// A successful login/register/logout response must describe DURABLE state.
// Inject an artificial rename failure against one private temp accounts.json.
// No changes to VPS, live user files, services, or game physics.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createAccounts}=require('../headless/accounts.cjs');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fuckball-account-write-qa-'));
const file=path.join(dir,'accounts.json');
const originalRename=fs.renameSync;
let fails=0;
function outage(source,destination){
  if(destination===file) {
    fails++;
    const error=new Error('Synthetic private-disk outage');
    error.code='EIO';
    throw error;
  }
  return originalRename(source,destination);
}
try{
  const accounts=createAccounts(dir);
  const first=accounts.register('KeeperOne','registered-pass1');
  assert.equal(createAccounts(dir).user(first.token),'KeeperOne');
  const stable=fs.readFileSync(file,'utf8');

  // Register must not expose a token to a user if the corresponding new
  // identity/session could not be committed. It must also roll back memory.
  fs.renameSync=outage;
  assert.throws(()=>accounts.register('GhostUser','registered-pass2'),
    /account|persist|save|store|unavailable/i,
    'failed signup persistence must never return a successful token');
  assert.equal(accounts.reserved('GhostUser'),false,
    'failed signup cannot reserve a name only in volatile memory');
  assert.equal(fs.readFileSync(file,'utf8'),stable,
    'failed rename must preserve previously durable player identities');

  // Successful password validation alone is not enough: a newly issued login
  // session must be on disk BEFORE the token is returned to the caller.
  assert.throws(()=>accounts.login('KeeperOne','registered-pass1'),
    /account|persist|save|store|unavailable/i,
    'failed login session persistence must not return a token');
  assert.equal(accounts.user(first.token),'KeeperOne',
    'storage error must not revoke unrelated durable sessions');

  // A failed logout must not claim revocation that will disappear on restart.
  assert.throws(()=>accounts.logout(first.token),
    /account|persist|save|store|unavailable/i,
    'failed logout persistence must never acknowledge revocation');
  assert.equal(accounts.user(first.token),'KeeperOne',
    'logout error preserves the original session locally');
  assert.equal(createAccounts(dir).user(first.token),'KeeperOne',
    'existing session is still valid after restart on failed logout');

  assert.equal(fails,3,'all three writes were actually subjected to EIO');
  fs.renameSync=originalRename;

  // A temporary outage is recoverable; no ghost user/session may linger.
  const fresh=accounts.register('GhostUser','registered-pass2');
  assert.equal(createAccounts(dir).user(fresh.token),'GhostUser');
  assert.equal(accounts.reserved('GhostUser'),true);
  const next=accounts.login('KeeperOne','registered-pass1');
  assert.equal(createAccounts(dir).user(next.token),'KeeperOne');
  accounts.logout(first.token);
  assert.equal(createAccounts(dir).user(first.token),null);
  console.log('PASS account writes are durable and transactional under 3 injected EIO failures');
}finally{
  fs.renameSync=originalRename;
  fs.rmSync(dir,{recursive:true,force:true});
}
