'use strict';
// Public release probe for #9. The health endpoint alone cannot establish what
// renderer the browser is executing: an obsolete one-big-dt solver can have the
// right version string and still make gameplay feel wrong.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {createRuntime} = require('../headless/runtime.cjs');

const SHA = {
  vendor: 'a0f4dbef90090f6b5c85bc48d4645e8cd3159023bc91af2b8de8225da6840a4b',
  stadium: '48772a9e29cecb28a4bd67d6ac360f87d246fe0e1d8008b12eaeeb6ab0b7bed4'
};
const sha = data => crypto.createHash('sha256').update(data).digest('hex');

// Deliberately narrow *served-asset* contract, not a claim that pending input
// replay works (#28) or the user's preferred Work physics is restored (#9).
// Keep this in sync with legitimate renderer refactors rather than deleting it.
// Ignore inert comments and quoted literals when matching required renderer
// structure. A marker copied into a comment/string must not authorize release.
// This remains a source-structure check, not full behavioral physics parity.
function executableCode(source) {
  let out='', mode='code';
  for(let i=0;i<source.length;i++) {
    const ch=source[i],next=source[i+1];
    if(mode==='code') {
      if(ch==='/'&&next==='*'){mode='block';out+='  ';i++;continue;}
      if(ch==='/'&&next==='/'){mode='line';out+='  ';i++;continue;}
      if(ch==="'"||ch==='"'||ch==='\u0060'){mode=ch;out+=' ';continue;}
      out+=ch;
    } else if(mode==='line') {
      if(ch==='\n'){mode='code';out+='\n';}else out+=' ';
    } else if(mode==='block') {
      if(ch==='*'&&next==='/'){mode='code';out+='  ';i++;}else out+=ch==='\n'?'\n':' ';
    } else {
      if(ch==='\\'){out+=' ';if(i+1<source.length){out+=' ';i++;}continue;}
      if(ch===mode)mode='code';
      out+=ch==='\n'?'\n':' ';
    }
  }
  return out;
}

function assertPredictionAsset(source) {
  assert.equal(typeof source, 'string', 'served renderer must be JavaScript text');
  const active=executableCode(source);
  assert.match(active, /function\s+extrapolate\s*\(/, 'renderer must export tick extrapolation');
  assert.match(active, /MAX_FRAMES\s*=\s*120\b/, 'prediction horizon must be capped at 120 frames');
  assert.match(active, /const\s+out\s*=\s*copyState\(state\)/, 'prediction must copy the authoritative state');
  assert.match(active, /for\s*\(\s*let\s+f\s*=\s*baseFrame\s*;\s*f\s*<=\s*last\s*;\s*f\+\+\s*\)/,
    'renderer must advance a 60 Hz tick timeline, not one giant integration');
  assert.match(active, /out\.nM\(\s*f\s*!==\s*last\s*\?\s*1\s*:\s*frames\s*-\s*whole\s*\)/,
    'whole native ticks plus one fractional tick must be simulated');
  assert.doesNotMatch(active, /\.nM\(\s*(?:frames|whole)\s*\)/,
    'legacy one-big-dt native extrapolation is forbidden');
  assert.match(active, /function\s+createPredictor\s*\(/, 'online guest predictor must be served');
  assert.match(active, /if\s*\(\s*n\s*\)\s*pending\.splice\(\s*0\s*,\s*n\s*\)/,
    'prediction must prune acknowledged inputs, not just cap the pending queue');
}

async function get(base, pathname) {
  const response = await fetch(base + pathname, {signal: AbortSignal.timeout(9000)});
  assert.equal(response.status, 200, pathname + ' must be served successfully');
  return response;
}

// Release acceptance: an actual joined room must advance its 60 Hz clock
// AND stream fresh binary v3 snapshots at its advertised 30 Hz rate once
// started. /health + two pongs alone can conceal a broken snapshot loop.
async function probeRoom(base, release) {
  const Replay = createRuntime().API.Replay;
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
    ws.binaryType = 'arraybuffer';
    let settled = false, firstFrame = null, secondPingTimer = null;
    let phase = 'joining', ownId = null, inputStamp = null, firstOwnX = null, appliedInput = false, movedOwn = false, firstSnapshot = null, lastSeq = null, lastFrame = null, framesSeen = 0;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (secondPingTimer !== null) clearTimeout(secondPingTimer);
      try { ws.close(); } catch {}
      if (error) reject(error); else resolve();
    };
    const timer = setTimeout(() => finish(Error('WebSocket room/snapshot timeout')), 10000);
    ws.onerror = () => finish(Error('WebSocket room/snapshot failure'));
    ws.onclose = () => finish(Error('WebSocket closed before live snapshots were verified'));
    ws.onopen = () => ws.send(JSON.stringify({
      type: 'join', create: true, name: 'Release verification', netcode: 3
    }));
    ws.onmessage = event => {
      if (settled) return;
      try {
        if (typeof event.data !== 'string') {
          if (phase !== 'snapshots') return; // Ignore initial lobby snapshot.
          const bytes = event.data;
          assert(bytes instanceof ArrayBuffer || ArrayBuffer.isView(bytes),
            'binary WebSocket snapshots must be ArrayBuffer data');
          const view = bytes instanceof ArrayBuffer ?
            new DataView(bytes) : new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          assert(view.byteLength > 20, 'snapshot must contain binary v3 header and native room data');
          assert.equal(view.getUint32(0), 0x46423203, 'native snapshot v3 magic must be served');
          // Decode the actual engine payload: a server could send perfect header
          // counters and still ship unreadable or wrong-stadium physics frames.
          let nativeState;
          try {
            const wire = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
            nativeState = Replay.readAll(wire.slice(20)).roomData;
          } catch (error) {
            assert.fail('native snapshot replay must decode successfully: ' + error.message);
          }
          assert.equal(nativeState?.stadium?.name, 'BFF Big v4',
            'live gameplay snapshot must use the original BFF Big v4 stadium');
          assert(nativeState.players?.some(player => player.id === ownId && player.disc),
            'live snapshot must include the joined human with a native disc');
          const ball = nativeState.gameState?.physicsState?.discs?.[0];
          assert(ball && Number.isFinite(ball.pos?.x) && Number.isFinite(ball.pos?.y),
            'live snapshot must include a finite native ball position');
          const own = nativeState.players.find(player => player.id === ownId);
          if (firstOwnX === null) firstOwnX = own.disc.pos.x;
          if (own.disc.pos.x > firstOwnX + 0.05) movedOwn = true;
          const ack = view.getUint32(8);
          assert(ack <= 1, 'temporary test player must never ACK unknown input sequences');
          if (ack === 1) appliedInput = true;
          const seq = view.getUint32(4), frame = view.getUint32(12);
          assert(seq > 0 && Number.isSafeInteger(frame), 'snapshot sequence/frame must be valid');
          if (lastSeq !== null) {
            assert(seq > lastSeq, 'snapshot sequence must increase, not replay stale packets');
            assert(frame > lastFrame, 'authoritative snapshot frames must advance');
          } else firstSnapshot = frame;
          lastSeq = seq;
          lastFrame = frame;
          framesSeen++;
          if (framesSeen >= 4 && appliedInput && movedOwn) {
            assert(lastFrame >= firstSnapshot + 4,
              'live snapshots must span multiple 60 Hz ticks (' + firstSnapshot + ' to ' + lastFrame + ')');
            finish();
          } else if (framesSeen >= 20) {
            assert(appliedInput, 'native room must acknowledge the frame-stamped test input');
            assert(movedOwn, 'authoritative native room must move its own player after input');
            assert.fail('native room failed to produce advancing acknowledged gameplay');
          }
          return;
        }
        const data = JSON.parse(event.data);
        if (data.type === 'error') return finish(Error(data.message));
        if (data.type === 'welcome' && phase === 'joining') {
          assert.match(data.room, release ? /^[A-HJ-NP-Z2-9]{8}$/ :
            /^(?:[A-F0-9]{6}|[A-HJ-NP-Z2-9]{8})$/, 'expected real shareable room ID');
          assert.equal(data.netcode, 3, 'room must negotiate binary snapshot v3');
          ownId = data.id;
          assert(Number.isInteger(ownId) && ownId > 0, 'room must assign a real player id');
          phase = 'clock';
          ws.send(JSON.stringify({type: 'ping', t: 1}));
        } else if (data.type === 'pong' && phase === 'clock') {
          assert(Number.isFinite(data.frame) && data.frame >= 0,
            'pong must carry a finite authoritative server tick');
          if (firstFrame === null) {
            assert.equal(data.t, 1, 'first room pong must echo the first ping');
            firstFrame = data.frame;
            secondPingTimer = setTimeout(() => {
              if (!settled) ws.send(JSON.stringify({type: 'ping', t: 2}));
            }, 160);
          } else {
            assert.equal(data.t, 2, 'second room pong must echo the later ping');
            assert(data.frame > firstFrame,
              'authoritative 60 Hz room clock must advance between two pongs');
            inputStamp = Math.ceil(data.frame) + 2;
            phase = 'starting';
            ws.send(JSON.stringify({type: 'start'}));
          }
        } else if (data.type === 'status' && phase === 'starting' && data.started === true) {
          phase = 'snapshots';
          ws.send(JSON.stringify({type:'in',c:[[1,inputStamp,8]]}));
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
  const renderer = await get(base, '/render-timing.js');
  assert.match(renderer.headers.get('content-type') || '',
    /^\s*(?:text|application)\/javascript(?:\s*;|$)/i,
    'served prediction asset must have a JavaScript MIME type, not HTML fallback');
  assert.equal((renderer.headers.get('x-content-type-options') || '').toLowerCase(),
    'nosniff', 'browser must not be asked to MIME-sniff the prediction script');
  assertPredictionAsset(await renderer.text());
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
      'browser script order', '60/30Hz v3', 'real room creation', 'advancing authoritative 60 Hz room clock', 'live v3 snapshots over advancing frames', 'acknowledged native input movement'].concat(
      release ? ['invite-link UI', '8-char room id', 'server tick in pong', 'approved release SHA'] : [])};
}

module.exports = {verifyLive, assertPredictionAsset};
if (require.main === module) {
  verifyLive(process.argv[2], process.argv[3]).then(
    result => console.log(JSON.stringify(result)),
    error => { console.error(error); process.exitCode = 1; }
  );
}
