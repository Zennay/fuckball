'use strict';
// #31 Custom Rooms: host exit during a paused native 60Hz game must preserve
// the match, freeze clock/ball and transfer authority exactly once.
// This is a real HTTP + WebSocket integration test, not a mocked room core.
const assert = require('node:assert/strict');
const {createServer} = require('../headless/server.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(check, label) {
  for (let attempt = 0; attempt < 250; attempt++) {
    const value = check();
    if (value) return value;
    await sleep(12);
  }
  throw Error('Timed out: ' + label);
}
async function join(url, sockets, data) {
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  ws.messages = [];
  ws.frames = [];
  ws.onmessage = event => {
    if (typeof event.data === 'string') {
      ws.messages.push(JSON.parse(event.data));
    } else if (event.data instanceof ArrayBuffer && event.data.byteLength >= 20) {
      const header = new DataView(event.data);
      if (header.getUint32(0) === 0x46423203) ws.frames.push(header.getUint32(12));
    }
  };
  sockets.push(ws);
  await Promise.race([
    new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; }),
    sleep(4000).then(() => { throw Error('WebSocket open timeout'); })
  ]);
  ws.send(JSON.stringify({type:'join',netcode:3,...data}));
  const welcome = await until(() => ws.messages.find(m => m.type === 'welcome' || m.type === 'error'), 'join');
  assert.equal(welcome.type, 'welcome', JSON.stringify(welcome));
  return {ws, ...welcome};
}
function game(room, playerId) {
  const state = room.hb._room.state;
  const disc = state.players.find(p => p.id === playerId)?.disc;
  const ball = state.gameState?.physicsState?.discs?.[0];
  assert(disc && ball, 'native player and game ball exist');
  const scores = room.hb.getScores();
  return {
    ball:[ball.pos.x,ball.pos.y,ball.speed.x,ball.speed.y],
    player:[disc.pos.x,disc.pos.y,disc.speed.x,disc.speed.y],
    score:[scores.red,scores.blue,scores.time]
  };
}
async function main() {
  const app = createServer({peerHosting:false});
  const {port} = await app.listen(0);
  const url = 'ws://127.0.0.1:' + port + '/ws', sockets = [];
  try {
    const host = await join(url,sockets,{create:true,name:'Original host'});
    const successor = await join(url,sockets,{room:host.room,name:'Successor'});
    const observer = await join(url,sockets,{room:host.room,name:'Non-host'});
    const room = app.rooms.get(host.room);
    assert.equal(room.owner,host.id);
    host.ws.send(JSON.stringify({type:'start'}));
    await until(() => room.started && !room.paused,'native match starts');
    await until(() => successor.ws.frames.length >= 5,'real native v3 frames');
    host.ws.send(JSON.stringify({type:'pause',value:true}));
    await until(() => room.paused,'host pauses');
    const beforeExit = game(room,successor.id);
    await sleep(110);
    assert.deepEqual(game(room,successor.id),beforeExit,'native pause freezes score, clock, player and ball');

    host.ws.close();
    await until(() => room.owner === successor.id && room.clients.size === 2,'server-authoritative host transfer');
    assert.equal(room.started,true,'host departure does not end active match');
    assert.equal(room.paused,true,'host departure cannot implicitly resume');
    assert.equal(app.rooms.get(host.room),room,'shareable room link survives');
    assert.deepEqual(game(room,successor.id),beforeExit,'host departure does not reset paused native game');

    // A new peer can join the existing link while the match stays paused,
    // but must not acquire control or disturb existing game state.
    const newcomer = await join(url,sockets,{room:host.room,name:'Late spectator'});
    assert.equal(newcomer.room,host.room);
    assert.equal(room.owner,successor.id);
    assert.equal(room.clients.size,3);
    assert.equal(room.paused,true);
    const afterJoin = game(room,successor.id);
    await sleep(115);
    assert.deepEqual(game(room,successor.id),afterJoin,'pause remains frozen after join');

    for (const untrusted of [observer,newcomer]) {
      const errors = untrusted.ws.messages.filter(m => m.type === 'error').length;
      untrusted.ws.send(JSON.stringify({type:'pause',value:false,owner:host.id,admin:true}));
      const rejected = await until(() =>
        untrusted.ws.messages.filter(m => m.type === 'error')[errors], 'forged resume refused');
      assert.match(rejected.message,/Only the host/i,'forged owner metadata must not bypass permissions');
      assert.equal(room.paused,true,'non-owner cannot unfreeze native match');
      assert.equal(room.owner,successor.id);
    }
    const lastFrame = successor.ws.frames.at(-1);
    await sleep(110);
    assert.equal(successor.ws.frames.at(-1),lastFrame,
      'paused authoritative snapshots cannot progress after handover');

    successor.ws.send(JSON.stringify({type:'pause',value:false}));
    await until(() => !room.paused,'new legitimate host resumes');
    const oldTime = game(room,successor.id).score[2];
    await until(() => game(room,successor.id).score[2] > oldTime,
      'native clock advances after authorized resume');
    await until(() => successor.ws.frames.at(-1) > lastFrame,
      'new gameplay snapshots advance after resume');
    assert.equal(room.started,true);
    assert.equal(room.clients.size,3);
    assert.equal(room.owner,successor.id);
    assert.equal(app.rooms.get(host.room),room);
    console.log('PASS #31 paused owner failover: native freeze, preserved room, late join, spoofed-resume denial and legitimate successor resume');
  } finally {
    for (const ws of sockets) try { ws.close(); } catch {}
    await app.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
