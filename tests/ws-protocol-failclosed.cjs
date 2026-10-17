'use strict';
// Fail-closed live WebSocket protocol regression. Deliberately does not
// modify production room/network implementation or 4v4 semantics (#31).
const assert = require('node:assert/strict');
const {createServer} = require('../headless/server.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(check, label) {
  for (let i = 0; i < 200; i++) {
    const result = check();
    if (result) return result;
    await sleep(15);
  }
  throw Error('Timed out: ' + label);
}
async function connect(url, sockets) {
  const ws = new WebSocket(url);
  ws.inbox = [];
  ws.onmessage = event => {
    if (typeof event.data === 'string') ws.inbox.push(JSON.parse(event.data));
  };
  sockets.push(ws);
  await Promise.race([
    new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; }),
    sleep(3000).then(() => { throw Error('WebSocket did not open'); })
  ]);
  return ws;
}
async function welcome(ws, join) {
  ws.send(JSON.stringify(join));
  const msg = await until(() => ws.inbox.find(x => x.type === 'welcome' || x.type === 'error'),
    'join result');
  assert.equal(msg.type, 'welcome', JSON.stringify(msg));
  return msg;
}
async function rejects(ws, payload, label, pattern) {
  const count = ws.inbox.filter(x => x.type === 'error').length;
  ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
  const err = await until(() => ws.inbox.filter(x => x.type === 'error')[count], label);
  assert.equal(err.type, 'error');
  if (pattern) assert.match(err.message, pattern, label);
}
function state(room) {
  return JSON.stringify({
    owner: room.owner,
    clients: [...room.clients.keys()],
    bots: [...room.botIds].sort((a,b) => a-b),
    players: room.hb.getPlayerList().map(p => [p.id, p.team]).sort((a,b) => a[0]-b[0]),
    mode: room.mode,
    started: room.started,
    paused: room.paused,
    difficulty: room.difficulty
  });
}
async function main() {
  const app = createServer({peerHosting:false});
  const addr = await app.listen(0);
  const url = 'ws://127.0.0.1:' + addr.port + '/ws';
  const sockets = [];
  let checks = 0;
  try {
    const stranger = await connect(url, sockets);
    for (const [label, payload] of [
      ['non-JSON', '{broken'],
      ['null JSON', 'null'],
      ['JSON array', '[]'],
      ['command before join', {type:'team',id:1,team:1}],
      ['input before join', {type:'input',value:16}],
      ['admin spoof before join', {type:'configure',owner:1,started:true}]
    ]) {
      await rejects(stranger, payload, label);
      assert.equal(app.rooms.size, 0, label + ' must not create a room');
      checks++;
    }
    const host = await connect(url, sockets);
    const h = await welcome(host, {type:'join',create:true,name:'Host',netcode:3});
    const guest = await connect(url, sockets);
    const g = await welcome(guest, {type:'join',room:h.room,name:'Guest',netcode:3});
    const room = app.rooms.get(h.room);
    assert.equal(room.owner, h.id);
    assert.notEqual(g.id, h.id);
    const initial = state(room);

    for (const [label, payload, pattern] of [
      ['repeat join', {type:'join',room:h.room,create:true,name:'Second join'}, /Already in a room/],
      ['forged owner team', {type:'team',id:g.id,team:0,owner:h.id,admin:true}, /Only the host/],
      ['forged host roster', {type:'addBot',team:1,owner:h.id}, /Only the host/],
      ['forged start', {type:'start',owner:h.id}, /Only the host/],
      ['forged configure', {type:'configure',started:false,scoreLimit:99,owner:h.id}, /Only the host/],
      ['malformed v3 input', {type:'in',c:'not an array'}, /Invalid input/],
      ['oversized input batch', {type:'in',c:Array.from({length:65},(_,i)=>[i+1,0,16])}, /Invalid input/],
      ['legacy guest input with v3', {type:'input',value:16}, /Invalid input/],
      ['bogus v3 input', {type:'in',c:null}, /Invalid input/],
      ['malformed JSON while joined', '{', null],
      ['null JSON while joined', 'null', null]
    ]) {
      await rejects(guest, payload, label, pattern);
      assert.equal(state(room), initial, label + ' may not change room ownership, roster or settings');
      checks++;
    }
    // Errors must be per-client: valid guest chat and host control still work.
    const beforeChat = host.inbox.filter(x => x.type === 'chat').length;
    guest.send(JSON.stringify({type:'chat',text:'still here'}));
    const message = await until(() => host.inbox.filter(x => x.type === 'chat')[beforeChat], 'guest chat');
    assert.match(message.text,/still here/);
    assert.equal(state(room), initial, 'chat must not grant privileges');
    checks++;

    host.send(JSON.stringify({type:'team',id:g.id,team:0}));
    await until(() => room.hb.getPlayer(g.id).team === 0, 'authorized spectator change');
    assert.equal(room.clients.size, 2);
    assert.equal(room.owner, h.id);
    checks++;

    console.log('PASS WebSocket fail-closed protocol: ' + checks +
      ' malformed/untrusted request assertions; legitimate host and guest flows survive');
  } finally {
    for (const ws of sockets) ws.close();
    await app.close();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
