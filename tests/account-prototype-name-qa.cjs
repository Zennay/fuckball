'use strict';
// Persistent account usernames must be ordinary keys, never prototype slots.
// Only temp account files are touched; no login server or external users.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createAccounts}=require('../headless/accounts.cjs');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fuckball-prototype-name-qa-'));
try {
  let accounts=createAccounts(dir);
  for(const username of ['constructor','__proto__','toString']){
    assert.equal(accounts.reserved(username),false,
      username+': unregistered nickname is not reserved by Object.prototype');
    const password='safe-pass-'+username;
    const issued=accounts.register(username,password);
    assert.equal(issued.username,username);
    assert.equal(accounts.user(issued.token),username,
      username+': token must resolve the real registered account');
    assert.equal(accounts.login(username,password).username,username);
    assert.equal(accounts.reserved(username),true);
  }
  accounts=createAccounts(dir);
  for(const username of ['constructor','__proto__','toString']){
    assert.equal(accounts.reserved(username),true,
      username+': saved username survives reboot');
    assert.equal(accounts.login(username,'safe-pass-'+username).username,username);
  }
  const saved=JSON.parse(fs.readFileSync(path.join(dir,'accounts.json'),'utf8'));
  for(const name of ['constructor','__proto__','tostring']){
    assert(Object.hasOwn(saved.users,name),
      name+': key persists as a real data property, not prototype mutation');
  }
  assert.equal({}.polluted,undefined);
  console.log('PASS reserved prototype-like nicknames are safely registerable and durable');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
