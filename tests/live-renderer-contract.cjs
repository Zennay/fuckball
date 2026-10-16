'use strict';
// #9 regression gate for the real public-release checker, not just source
// presence or a self-reported /health version.
const assert = require('node:assert/strict');
const {createServer} = require('../headless/server.cjs');
const {assertPredictionAsset, verifyLive} = require('../scripts/verify-live.cjs');

(async () => {
  const app = createServer({peerHosting: false});
  const addr = await app.listen(0);
  const base = 'http://127.0.0.1:' + addr.port;
  try {
    const result = await verifyLive(base);
    assert.equal(result.verified, true);
    assert(result.checks.includes('active 60 Hz renderer contract'));
    assert(result.checks.includes('advancing authoritative 60 Hz room clock'));
    assert(result.checks.includes('live v3 snapshots over advancing frames'));
    assert(result.checks.includes('acknowledged native input movement'));

    const response = await fetch(base + '/render-timing.js');
    assert.equal(response.status, 200);
    const served = await response.text();
    assertPredictionAsset(served);

    const mutations = [
      ['obsolete single giant dt',
        served.replace('out.nM(f!==last?1:frames-whole)', 'out.nM(frames)')],
      ['removed copy protection',
        served.replace('const out=copyState(state)', 'const out=state')],
      ['removed prediction cap',
        served.replace('MAX_FRAMES=120', 'MAX_FRAMES=9999')],
      ['missing input predictor',
        served.replace('function createPredictor()', 'function createOldPredictor()')],
      ['missing tick progression',
        served.replace('f<=last;f++', 'f<=last;f+=frames')],
      ['copy-state promise hidden in comment',
        served.replace('const out=copyState(state)',
          'const out=state; /* const out=copyState(state) */')],
      ['60 Hz native tick promise hidden in comment',
        served.replace('out.nM(f!==last?1:frames-whole)',
          'out.nM(frames + 0); /* out.nM(f!==last?1:frames-whole) */')],
      ['predictor function name hidden in quoted text',
        served.replace('function createPredictor()',
          'const fakeName="function createPredictor()"; function obsoletePredictor()')],
      ['unacked input retention hidden in line comment',
        served.replace('pending.splice(0,n);',
          'pending.length=0; // pending.splice(0,n);')]
    ];
    for (const [label, source] of mutations) {
      assert.notEqual(source, served, label + ': fixture must mutate the shipped code');
      assert.throws(() => assertPredictionAsset(source), assert.AssertionError,
        label + ': public verifier must reject the faulty served asset');
    }
    // An upstream proxy can return index HTML or strip protective response
    // headers despite all JavaScript source markers remaining unchanged.
    const networkFetch = globalThis.fetch;
    for (const [label, mutate] of [
      ['HTML fallback', headers => headers.set('content-type', 'text/html; charset=utf-8')],
      ['missing nosniff', headers => headers.delete('x-content-type-options')]
    ]) {
      globalThis.fetch = async (...args) => {
        const upstream = await networkFetch(...args);
        if (String(args[0]) !== base + '/render-timing.js') return upstream;
        const headers = new Headers(upstream.headers);
        mutate(headers);
        return new Response(await upstream.arrayBuffer(), {status: upstream.status, headers});
      };
      try {
        await assert.rejects(verifyLive(base), assert.AssertionError,
          label + ': public verifier must reject unusable served JavaScript');
      } finally {
        globalThis.fetch = networkFetch;
      }
    }
    // Exercise the actual public checker against a live room whose WebSocket
    // clock data is tampered in transit; /health and static assets stay valid.
    const NativeWebSocket = globalThis.WebSocket;
    for (const [label, tamper, errorPattern] of [
      ['frozen authoritative room tick', (() => {
        let first;
        return data => {
          if (data.type !== 'pong') return;
          if (first === undefined) first = data.frame;
          else data.frame = first;
        };
      })(), /room clock must advance/],
      ['wrong second ping correlation', data => {
        if (data.type === 'pong' && data.t === 2) data.t = 1;
      }, /second room pong must echo/]
    ]) {
      class TamperedWebSocket {
        constructor(url) {
          this.real = new NativeWebSocket(url);
          this.real.onopen = event => this.onopen?.(event);
          this.real.onerror = event => this.onerror?.(event);
          this.real.onmessage = event => {
            if (typeof event.data !== 'string') {
              this.onmessage?.(event);
              return;
            }
            const data = JSON.parse(event.data);
            tamper(data);
            this.onmessage?.({data: JSON.stringify(data)});
          };
        }
        send(data) { this.real.send(data); }
        close() { this.real.close(); }
      }
      globalThis.WebSocket = TamperedWebSocket;
      try {
        await assert.rejects(verifyLive(base), errorPattern,
          label + ': static health cannot substitute for an advancing 60 Hz clock');
      } finally {
        globalThis.WebSocket = NativeWebSocket;
      }
    }
    // Real WebSocket byte injection: a healthy HTTP service and pong clock
    // cannot be green when actual gameplay snapshots are stale or corrupt.
    for (const [label, mutate, expected] of [
      ['invalid v3 snapshot magic', (view) => view.setUint32(0, 0x46423201),
        /native snapshot v3 magic/],
      ['replayed snapshot sequence', (view, first) => view.setUint32(4, first.seq),
        /snapshot sequence must increase/],
      ['frozen snapshot frame', (view, first) => view.setUint32(12, first.frame),
        /authoritative snapshot frames must advance/],
      ['corrupt native replay payload', view => {
        const wire = new Uint8Array(view.buffer, view.byteOffset + 20, view.byteLength - 20);
        wire.fill(0);
      }, /native snapshot replay must decode successfully|live gameplay snapshot/],
      ['input ACK is never delivered', view => view.setUint32(8,0),
        /native room must acknowledge the frame-stamped test input/]
    ]) {
      let started = false, count = 0, first = null;
      class SnapshotTamperWebSocket {
        constructor(url) {
          this.real = new NativeWebSocket(url);
          this.real.binaryType = 'arraybuffer';
          this.real.onopen = event => this.onopen?.(event);
          this.real.onerror = event => this.onerror?.(event);
          this.real.onclose = event => this.onclose?.(event);
          this.real.onmessage = event => {
            if (typeof event.data === 'string') {
              const msg = JSON.parse(event.data);
              if (msg.type === 'status' && msg.started === true) started = true;
              this.onmessage?.(event);
              return;
            }
            if (!started || !(event.data instanceof ArrayBuffer)) {
              this.onmessage?.(event);
              return;
            }
            const clone = event.data.slice(0), view = new DataView(clone);
            if (view.byteLength > 20) {
              count++;
              if (!first) first = {seq:view.getUint32(4),frame:view.getUint32(12)};
              if (count >= (['replayed snapshot sequence', 'frozen snapshot frame'].includes(label) ? 2 : 1))
                mutate(view, first);
            }
            this.onmessage?.({data:clone});
          };
        }
        set binaryType(value) { this.real.binaryType = value; }
        get binaryType() { return this.real.binaryType; }
        send(data) { this.real.send(data); }
        close() { this.real.close(); }
      }
      globalThis.WebSocket = SnapshotTamperWebSocket;
      try {
        await assert.rejects(verifyLive(base), expected,
          label + ': stale/incompatible gameplay packets are not a healthy release');
        assert(count >= (['replayed snapshot sequence', 'frozen snapshot frame'].includes(label) ? 2 : 1),
          label + ': binary snapshot tamper must actually be injected');
      } finally { globalThis.WebSocket = NativeWebSocket; }
    }
    console.log('PASS public-release probe: real HTTP+WS room, 9 source mutations, 2 bad headers, 2 clock faults and 5 binary snapshot/input-ACK attacks rejected');
  } finally {
    await app.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
