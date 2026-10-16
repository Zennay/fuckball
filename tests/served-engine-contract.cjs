'use strict';
// QA release gate for #9. Test what the actual HTTP/WebSocket server exposes,
// rather than inferring the runtime from source-file existence or health alone.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const {createServer} = require('../headless/server.cjs');

const SHA = {
  vendor: 'a0f4dbef90090f6b5c85bc48d4645e8cd3159023bc91af2b8de8225da6840a4b',
  bff: '48772a9e29cecb28a4bd67d6ac360f87d246fe0e1d8008b12eaeeb6ab0b7bed4'
};
const digest = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

async function receiveWelcome(url) {
  const ws = new WebSocket(url);
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('WebSocket room welcome timed out')), 2500);
      ws.onopen = () => ws.send(JSON.stringify({type: 'join', create: true, name: 'QA native probe', netcode: 3}));
      ws.onerror = () => { clearTimeout(timer); reject(Error('WebSocket connection failed')); };
      ws.onmessage = event => {
        if (typeof event.data !== 'string') return;
        const message = JSON.parse(event.data);
        if (message.type !== 'welcome' && message.type !== 'error') return;
        clearTimeout(timer);
        if (message.type === 'error') reject(Error(message.message));
        else resolve(message);
      };
    });
  } finally {
    ws.close();
  }
}

(async () => {
  const app = createServer({peerHosting: false});
  const address = await app.listen(0);
  const base = 'http://127.0.0.1:' + address.port;
  try {
    const healthResponse = await fetch(base + '/health');
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.equal(health.ok, true);
    assert.equal(health.engine, 'node-haxball-2.3.1');
    assert.equal(health.physicsHz, 60);
    assert.equal(health.snapshotHz, 30);
    assert.equal(health.netcode, 3, 'online default must use frame-stamped inputs');

    const indexResponse = await fetch(base + '/');
    assert.equal(indexResponse.status, 200);
    const html = await indexResponse.text();
    const scripts = [...html.matchAll(/<script\s+src="([^"]+)"[^>]*>/g)].map(match => match[1]);
    assert(scripts.length >= 10, 'browser must serve the full runtime script chain');
    assert.equal(scripts.filter(script => script === 'vendor/haxball.js').length, 1,
      'native engine must load once');
    assert(scripts.indexOf('vendor/haxball.js') < scripts.indexOf('app.js'),
      'native engine must load before application startup');
    assert(scripts.includes('render-timing.js'), 'native prediction sampler must be loaded');
    assert(scripts.includes('room-core.js'), 'shared authoritative room engine must be loaded');
    assert(scripts.includes('stadiums/bff-big-v4.js'), 'original BFF stadium client data must load');
    for (const script of scripts) {
      assert(!script.includes('..') && !script.includes('/shared/') &&
        !/^(?:shared\/)?(?:physics|prediction)\.js$/.test(script),
        'legacy custom solver must never be referenced: ' + script);
      const response = await fetch(base + '/' + script);
      assert.equal(response.status, 200, 'active browser script is actually served: ' + script);
      assert.match(response.headers.get('content-type') || '', /javascript/,
        'active script has JavaScript content-type: ' + script);
    }

    const binaries = [
      ['vendor/haxball.js', SHA.vendor],
      ['stadiums/bff-big-v4.hbs', SHA.bff]
    ];
    for (const [pathname, hash] of binaries) {
      const response = await fetch(base + '/' + pathname);
      assert.equal(response.status, 200);
      assert.equal(digest(Buffer.from(await response.arrayBuffer())), hash,
        'served ' + pathname + ' must have original pinned bytes');
    }
    assert.equal(digest(fs.readFileSync('dist/stadiums/bff-big-v4.hbs')), SHA.bff);

    // A stale /shared path must not leak the retired 1.10x/1.20x solver as
    // a playable browser asset; the main server should serve dist/ ONLY.
    for (const pathname of [
      'shared/physics.js',
      'shared/prediction.js',
      'physics.js',
      'prediction.js'
    ]) {
      const response = await fetch(base + '/' + pathname);
      assert.equal(response.status, 404,
        'retired physics code must not be an HTTP asset: ' + pathname);
    }

    const welcome = await receiveWelcome(base.replace(/^http/, 'ws') + '/ws');
    assert.match(welcome.room, /^[A-HJ-NP-Z2-9]{8}$/);
    const room = app.rooms.get(welcome.room);
    assert(room, 'a real native authoritative room was created');
    assert.equal(room.hb._room.state.stadium.name, 'BFF Big v4');
    assert.equal(room.v3, true, 'authoritative room uses native frame-timed network input');
    assert.equal(room.hb._room.state.stadium.bg.width > 0, true);

    console.log('PASS served native physics contract: live HTTP engine/stadium hashes, ' +
      scripts.length + ' active browser assets, 4 rejected legacy solver paths, 60/30Hz, ' +
      'v3 WebSocket and native BFF room creation');
  } finally {
    await app.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
