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
    console.log('PASS public-release renderer probe: actual HTTP+WS room and 9 adversarial old-physics/prediction asset mutations rejected');
  } finally {
    await app.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
