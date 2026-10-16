'use strict';
// Executable, intentionally opt-in future acceptance gate for issue #31.
// Do NOT add this to npm test before server-enforced 4v4 rosters ship:
// today's server admits >8 active players, so this contract is expected RED.
const assert = require('node:assert/strict');
const {createServer} = require('../headless/server.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(check, description) {
  for (let attempt = 0; attempt < 250; attempt++) {
    const result = check();
    if (result) return result;
    await sleep(20);
  }
  throw Error('Timed out: ' + description);
}
async function connect(url, joins, options) {
  const ws = new WebSocket(url);
  ws.messages = [];
  ws.onmessage = event => {
    if (typeof event.data === 'string') ws.messages.push(JSON.parse(event.data));
  };
  joins.push(ws);
  await Promise.race([
    new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    }),
    sleep(5000).then(() => { throw Error('WebSocket open timeout'); })
  ]);
  ws.send(JSON.stringify(options));
  const response = await until(() => ws.messages.find(m => m.type === 'welcome' || m.type === 'error'), 'join response');
  assert.equal(response.type, 'welcome', JSON.stringify(response));
  return {ws, welcome: response};
}
function roster(room) {
  const humans = room.hb.getPlayerList().filter(p => !room.botIds.has(p.id));
  const red = humans.filter(p => p.team === 1);
  const blue = humans.filter(p => p.team === 2);
  const inactive = humans.filter(p => p.team === 0);
  return {humans, red, blue, inactive};
}
function assertFourAside(room, connected, label) {
  const teams = roster(room);
  assert.equal(room.clients.size, connected, label + ': keep every client connected');
  assert.equal(room.sockets.size, connected, label + ': keep every WebSocket in the room');
  assert.equal(teams.humans.length, connected, label + ': never silently remove or replace a human');
  assert.equal(teams.red.length, 4, label + ': exactly four active red players');
  assert.equal(teams.blue.length, 4, label + ': exactly four active blue players');
  assert.equal(teams.inactive.length, connected - 8,
    label + ': all additional humans must be on bench/spectator slots');
  assert.equal(teams.red.length + teams.blue.length, 8, label + ': no ninth active player');
  return teams;
}
async function main() {
  const app = createServer({peerHosting: false});
  const addr = await app.listen(0);
  const url = 'ws://127.0.0.1:' + addr.port + '/ws';
  const sockets = [];
  try {
    const host = await connect(url, sockets, {type:'join',create:true,name:'Captain',netcode:3});
    const roomId = host.welcome.room;
    const ids = new Set([host.welcome.id]);
    for (let index = 1; index < 12; index++) {
      const guest = await connect(url, sockets, {
        type:'join',room:roomId,name:'Member ' + index,netcode:3
      });
      assert.equal(guest.welcome.room, roomId, 'every link resolves to the same persistent room');
      assert(!ids.has(guest.welcome.id), 'every join receives a unique player id');
      ids.add(guest.welcome.id);
    }
    const room = app.rooms.get(roomId);
    assert(room, 'room still exists');
    assert.equal(room.owner, host.welcome.id, 'owner cannot change just because benches fill');
    assertFourAside(room, 12, '12-person lobby');

    // A room at active capacity must still admit spectators without turning
    // an ordinary new join into a ninth on-pitch player.
    const spectator = await connect(url, sockets, {
      type:'join',room:roomId,name:'Extra spectator',netcode:3
    });
    assert.equal(spectator.welcome.room, roomId);
    assertFourAside(room, 13, '13-person lobby');
    assert.equal(room.hb.getPlayer(spectator.welcome.id).team, 0,
      'join after full lineup must start inactive');
    assert.equal(room.owner, host.welcome.id);

    // Client-controlled WebSocket team messages must not bypass the active cap.
    const before = room.hb.getPlayerList().map(p => [p.id, p.team]);
    const errorsBefore = spectator.ws.messages.filter(m => m.type === 'error').length;
    spectator.ws.send(JSON.stringify({
      type:'team',id:spectator.welcome.id,team:1,
      owner:host.welcome.id,admin:true
    }));
    const error = await until(() =>
      spectator.ws.messages.filter(m => m.type === 'error')[errorsBefore],
      'unauthorized spectator team move must be rejected');
    assert.match(error.message, /host|admin|captain|permiss|authoriz|forbid/i);
    assert.deepEqual(room.hb.getPlayerList().map(p => [p.id, p.team]), before,
      'forged authorization must not change the active roster');

    console.log('PASS #31 4v4 roster acceptance: 12+ connected, four per team, spectator join, owner and authorization invariant');
  } finally {
    for (const ws of sockets) ws.close();
    await app.close();
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
