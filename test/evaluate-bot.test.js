'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {makeGame,evaluateEpisode,evaluateSuite,requireLegalControl}=require('../scripts/evaluate-bot');

test('headless evaluation uses the real BFF Big v4 engine with both teams',()=>{
  for(const mode of [1,2,4]){
    const game=makeGame(mode,7);
    assert.equal(game.players.length,mode*2);
    assert.equal(game.players.filter(p=>p.team===1).length,mode);
    assert.equal(game.players.filter(p=>p.team===2).length,mode);
    assert.equal(game.phase,'playing');
    assert.equal(game.freeze,0);
  }
});

test('identical seeds and tick budgets generate identical gameplay fingerprints',()=>{
  const a=evaluateEpisode({mode:2,seed:11,ticks:180});
  const b=evaluateEpisode({mode:2,seed:11,ticks:180});
  const c=evaluateEpisode({mode:2,seed:12,ticks:180});
  assert.deepEqual(a,b);
  assert.notEqual(a.fingerprint,c.fingerprint);
  assert.match(a.fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(a.ticks,180);
  assert.ok(a.ballTravel>=0);
});

test('all game sizes produce measured metrics with no physics shortcuts',()=>{
  const report=evaluateSuite({modes:[1,2,4],seeds:[0],ticks:180});
  assert.equal(report.episodes.length,3);
  assert.equal(report.totals.episodes,3);
  assert.equal(report.totals.ticks,540);
  for(const episode of report.episodes){
    assert.deepEqual(episode.score.length,2);
    assert.equal(episode.kicks.length,2);
    assert.ok(Number.isFinite(episode.ballTravel));
    assert.equal(episode.phase,'playing');
  }
});

test('invalid bot outputs are rejected instead of silently creating bogus training data',()=>{
  assert.throws(()=>requireLegalControl({x:Infinity,y:0,kick:false}),/normalized finite/);
  assert.throws(()=>requireLegalControl({x:1,y:1,kick:false}),/normalized finite/);
  assert.throws(()=>evaluateEpisode({mode:1,ticks:1,policy:()=>({x:0,y:0,kick:'no'})}),/normalized finite/);
  assert.throws(()=>evaluateEpisode({mode:3,ticks:10}),/mode must/);
  assert.throws(()=>evaluateEpisode({mode:4,ticks:36001}),/ticks must/);
});

test('CLI exposes machine-readable JSON for offline training comparison',()=>{
  const script=path.join(__dirname,'..','scripts','evaluate-bot.js');
  const r=spawnSync(process.execPath,[script,'--mode','1','--ticks','40','--seeds','2'],{encoding:'utf8',timeout:10000});
  assert.equal(r.status,0,r.stderr);
  const report=JSON.parse(r.stdout);
  assert.deepEqual(report.episodes.map(x=>[x.mode,x.seed,x.ticks]),[[1,0,40],[1,1,40]]);
  assert.equal(report.totals.episodes,2);
});
