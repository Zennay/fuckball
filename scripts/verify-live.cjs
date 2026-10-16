'use strict';
// Public release probe for #9. The health endpoint alone cannot establish what
// renderer the browser is executing: an obsolete one-big-dt solver can have the
// right version string and still make gameplay feel wrong.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const SHA = {
  vendor: 'a0f4dbef90090f6b5c85bc48d4645e8cd3159023bc91af2b8de8225da6840a4b',
  stadium: '48772a9e29cecb28a4bd67d6ac360f87d246fe0e1d8008b12eaeeb6ab0b7bed4'
};
const sha = data => crypto.createHash('sha256').update(data).digest('hex');

// Deliberately narrow *served-asset* contract, not a claim that pending input
// replay works (#28) or the user's preferred Work physics is restored (#9).
// Keep this in sync with legitimate renderer refactors rather than deleting it.
function assertPredictionAsset(source) {
  assert.equal(typeof source, 'string', 'served renderer must be JavaScript text');
  assert.match(source, /function\s+extrapolate\s*\(/, 'renderer must export tick extrapolation');
  assert.match(source, /MAX_FRAMES\s*=\s*120\b/, 'prediction horizon must be capped at 120 frames');
  assert.match(source, /const\s+out\s*=\s*copyState\(state\)/, 'prediction must copy the authoritative state');
  assert.match(source, /for\s*\(\s*let\s+f\s*=\s*baseFrame\s*;\s*f\s*<=\s*last\s*;\s*f\+\+\s*\)/,
    'renderer must advance a 60 Hz tick timeline, not one giant integration');
  assert.match(source, /out\.nM\(\s*f\s*!==\s*last\s*\?\s*1\s*:\s*frames\s*-\s*whole\s*\)/,
    'whole native ticks plus one fractional tick must be simulated');
  assert.doesNotMatch(source, /\.nM\(\s*(?:frames|whole)\s*\)/,
    'legacy one-big-dt native extrapolation is forbidden');
  assert.match(source, /function\s+createPredictor\s*\(/, 'online guest predictor must be served');
  assert.match(source, /pending\.splice\(/, 'prediction must retain pending unacked inputs');
}

async function get(base, pathname) {
  const response = await fetch(base + pathname, {signal: AbortSignal.timeout(9000)});
  assert.equal(response.status, 200, pathname + ' must be served successfully');
  return response;
}

async function probeRoom(base, release) {
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      if (error) reject(error); else resolve();
    };
    const timer = setTimeout(() => finish(Error('WebSocket timeout')), 10000);
    ws.onerror = () => finish(Error('WebSocket failure'));
    ws.onopen = () => ws.send(JSON.stringify({
      type: 'join', create: true, name: 'Release verification', netcode: 3
    }));
    ws.onmessage = event => {
      if (typeof event.data !== 'string') return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'error') return finish(Error(data.message));
        if (data.type === 'welcome') {
          assert.match(data.room, release ? /^[A-HJ-NP-Z2-9]{8}$/ :
            /^(?:[A-F0-9]{6}|[A-HJ-NP-Z2-9]{8})$/, 'expected real shareable room ID');
          if (!release) return finish();
          ws.send(JSON.stringify({type: 'ping', t: 1}));
        } else if (data.type === 'pong') {
          assert(Number.isFinite(data.frame) && data.frame >= 0,
            'pong must carry a finite server tick for the native clock');
          finish();
        }
      } catch (error) { finish(error); }
    };
  });
}

async function verifyLive(base, expectedRelease) {
  base = String(base || 'http://127.0.0.1:3417').replace(/\/$/, '');
  const health = await (await get(base, '/health')).json();
  assert.equal(health.engine, 'node-haxball-2.3.1');
  assert.equal(health.physicsHz, 60);
  assert.equal(health.snapshotHz, 30);
  assert.equal(health.netcode, 3, 'competitive server must offer frame-stamped v3');
  if (expectedRelease) assert.equal(health.release, expectedRelease,
    'deployed SHA must be the explicitly approved release');
  const html = await (await get(base, '/')).text();
  assert(html.includes('id="pauseMenu"'), 'fullscreen match UI served');
  assert(html.includes('match.css'), 'native match CSS served');
  assert(!html.includes('/shared/physics.js'), 'retired solver must not be loaded');
  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(x => x[1]);
  const nativeIndex = scripts.indexOf('vendor/haxball.js');
  const renderIndex = scripts.indexOf('render-timing.js');
  const appIndex = scripts.indexOf('app.js');
  assert(nativeIndex >= 0 && renderIndex > nativeIndex && appIndex > renderIndex,
    'browser must load native engine then tick prediction before app startup');
  assert.equal(scripts.filter(x => x === 'render-timing.js').length, 1,
    'do not ship duplicate render timing implementations');
  assertPredictionAsset(await (await get(base, '/render-timing.js')).text());
  const release = !!expectedRelease;
  if (release) {
    assert(html.includes('id="inviteLink"'), 'shareable invite UI served');
    assert(!html.includes('id="serverRoomCode"'), 'legacy room-code field removed');
    assert(!html.includes('academy.js'), 'training controls removed from gameplay');
  }
  for (const [file, expected] of [
    ['vendor/haxball.js', SHA.vendor],
    ['stadiums/bff-big-v4.hbs', SHA.stadium]
  ]) {
    const body = await (await get(base, '/' + file)).arrayBuffer();
    assert.equal(sha(Buffer.from(body)), expected, 'served ' + file + ' must be original native bytes');
  }
  await probeRoom(base, release);
  return {verified: true, url: base, release: health.release, engine: health.engine,
    checks: ['served engine hash', 'original BFF hash', 'active 60 Hz renderer contract',
      'browser script order', '60/30Hz v3', 'real room creation'].concat(
      release ? ['invite-link UI', '8-char room id', 'server tick in pong', 'approved release SHA'] : [])};
}

module.exports = {verifyLive, assertPredictionAsset};
if (require.main === module) {
  verifyLive(process.argv[2], process.argv[3]).then(
    result => console.log(JSON.stringify(result)),
    error => { console.error(error); process.exitCode = 1; }
  );
}
