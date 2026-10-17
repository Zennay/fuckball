'use strict';
// Native synthetic filesystem boundary: never touch an actual account store.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {createAccounts} = require('../headless/accounts.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-accounts-safe-ingress-'));
const modulePath = path.resolve(__dirname, '../headless/accounts.cjs');
const script = 'try { require(' + JSON.stringify(modulePath) +
  ').createAccounts(process.argv[1]); process.exit(0); } catch { process.exit(7); }';
function rejectsQuickly(folder) {
  const checked = spawnSync(process.execPath, ['-e', script, folder], {
    cwd: path.dirname(modulePath), encoding: 'utf8', timeout: 1600,
    maxBuffer: 8192,
  });
  assert.equal(checked.error, undefined,
    'account startup must not block on named pipes or untrusted paths');
  assert.equal(checked.status, 7, 'invalid account state must fail closed');
  assert.equal(checked.stdout, '', 'account file contents must not be logged');
  assert.equal(checked.stderr, '', 'private paths must not enter startup diagnostics');
}
try {
  // First install and valid persisted sessions remain operational.
  const fresh = path.join(root, 'fresh'); fs.mkdirSync(fresh);
  const accounts = createAccounts(fresh);
  const {token} = accounts.register('KeeperOne','synthetic-pass');
  assert.equal(createAccounts(fresh).user(token), 'KeeperOne');
  assert.equal(accounts.reserved('KeeperOne'), true);
  const saved = fs.readFileSync(path.join(fresh,'accounts.json'),'utf8');

  const pipe = path.join(root, 'pipe'); fs.mkdirSync(pipe);
  const fifo = path.join(pipe, 'accounts.json');
  const mkfifo = spawnSync('mkfifo', [fifo], {timeout: 1600});
  assert.equal(mkfifo.status, 0, 'POSIX FIFO fixture must exist');
  rejectsQuickly(pipe);  // Old fs.readFileSync() would hang forever.

  const linked = path.join(root, 'linked'); fs.mkdirSync(linked);
  fs.symlinkSync(path.join(fresh, 'accounts.json'), path.join(linked, 'accounts.json'));
  rejectsQuickly(linked); // Must not inspect files outside this account root.

  const directory = path.join(root, 'directory'); fs.mkdirSync(directory);
  fs.mkdirSync(path.join(directory,'accounts.json'));
  rejectsQuickly(directory);

  const huge = path.join(root, 'oversize'); fs.mkdirSync(huge);
  fs.writeFileSync(path.join(huge,'accounts.json'),'');
  fs.truncateSync(path.join(huge,'accounts.json'), 8*1024*1024+1);
  rejectsQuickly(huge);

  const corrupt = path.join(root, 'corrupt'); fs.mkdirSync(corrupt);
  fs.writeFileSync(path.join(corrupt, 'accounts.json'), '{"users":', 'utf8');
  rejectsQuickly(corrupt);
  assert.equal(fs.readFileSync(path.join(fresh,'accounts.json'),'utf8'),saved,
    'none of the rejection paths may modify a healthy account file');
  console.log('PASS bounded regular account admission, FIFO no-hang, symlink, directory, corrupt JSON, normal sessions');
} finally {
  fs.rmSync(root, {recursive:true,force:true});
}
