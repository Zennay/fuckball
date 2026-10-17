'use strict';
// Security/quality gate: an online guest must never escalate match authority
// through raw WebSocket messages, including after the owner disconnects.
const assert = require('node:assert/strict');
const {createServer} = require('../headless/server.cjs');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) {
  for (let n = 0; n < 120; n++) {
    const result = check();
    if (result) return result;
    await wait(10);
  }
  throw Error('Timed out: ' + label);
}
async function connect(url) {
  const ws = new WebSocket(url);
  ws.messages = [];
  ws.onmessage = event => {
    if (typeof event.data === 'string') ws.messages.push(JSON.parse(event.data));
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  return ws;
}

async function assertRejected(client, message, room, label) {
  const before = JSON.stringify(visibleState(room));
  const errors = client.messages.filter(m => m.type === 'error').length;
  client.send(JSON.stringify(message));
  const failure = await until(() =>
    client.messages.filter(m => m.type === 'error')[errors], label + ' server response');
  assert.match(failure.message, /Only the host can change the match/,
    label + ': server must reject an unauthorized operation');
  assert.equal(JSON.stringify(visibleState(room)), before,
    label + ': an unauthorized request cannot mutate the authoritative room');
}

function visibleState(room) {
  return {
    owner: room.owner,
    mode: room.mode,
    difficulty: room.difficulty,
    botIds: [...room.botIds].sort((a, b) => a - b),
    team: room.hb.getPlayerList().map(p => [p.id, p.team]).sort((a, b) => a[0] - b[0]),
    started: room.started,
    paused: room.paused,
    recording: room.hb._room.isRecording()
  };
}

(async () => {
  const app = createServer({peerHosting: false});
  const address = await app.listen(0);
  const url = 'ws://127.0.0.1:' + address.port + '/ws';
  const connections = [];
  try {
    const host = await connect(url);
    connections.push(host);
    host.send(JSON.stringify({type: 'join', create: true, name: 'Host', netcode: 3}));
    const joinedHost = await until(() =>
      host.messages.find(m => m.type === 'welcome'), 'host welcome');
    const guest = await connect(url);
    connections.push(guest);
    guest.send(JSON.stringify({type: 'join', room: joinedHost.room, name: 'Guest', netcode: 3}));
    const joinedGuest = await until(() =>
      guest.messages.find(m => m.type === 'welcome'), 'guest welcome');
    const room = app.rooms.get(joinedHost.room);
    assert.equal(room.owner, joinedHost.id);
    assert.notEqual(room.owner, joinedGuest.id);

    const botId = [...room.botIds][0];
    assert(Number.isInteger(botId), 'online room starts with bot roster');
    const attacks = [
      {type: 'team', id: joinedHost.id, team: 0},
      {type: 'team', id: joinedGuest.id, team: 0},
      {type: 'team', id: botId, team: 2},
      {type: 'addBot', team: 1},
      {type: 'removeBot', id: botId},
      {type: 'swap'},
      {type: 'specAll'},
      {type: 'configure', mode: 'bot', started: true, scoreLimit: 1},
      {type: 'difficulty', difficulty: 'elite'},
      {type: 'start'},
      {type: 'stop'},
      {type: 'pause', value: true},
      {type: 'record'}
    ];
    for (const payload of attacks) {
      await assertRejected(guest, payload, room, payload.type);
    }

    const oldChatCount = host.messages.filter(m => m.type === 'chat').length;
    guest.send(JSON.stringify({type: 'chat', text: 'hello from guest'}));
    const chat = await until(() =>
      host.messages.filter(m => m.type === 'chat')[oldChatCount], 'allowed guest chat');
    assert.match(chat.text, /hello from guest/);
    assert.equal(room.owner, joinedHost.id, 'chat never confers ownership');

    // The guest becomes owner ONLY after the original owner disconnects.
    host.close();
    await until(() => room.owner === joinedGuest.id, 'owner handover');
    assert(room.clients.has(joinedGuest.id), 'successor remains in the same room');
    const beforeSwap = new Map(room.hb.getPlayerList().map(p => [p.id, p.team]));
    guest.send(JSON.stringify({type: 'swap'}));
    await until(() => room.hb.getPlayerList().some(p =>
      beforeSwap.get(p.id) !== p.team), 'legitimate successor swap');
    for (const player of room.hb.getPlayerList()) {
      const oldTeam = beforeSwap.get(player.id);
      assert.equal(player.team, oldTeam ? 3 - oldTeam : 0,
        'new owner has authority over the same roster');
    }

    // A newly joined player cannot inherit owner rights or spoof a prior owner.
    const lateGuest = await connect(url);
    connections.push(lateGuest);
    lateGuest.send(JSON.stringify({
      type: 'join', room: joinedHost.room, name: 'Late guest', netcode: 3
    }));
    const late = await until(() =>
      lateGuest.messages.find(m => m.type === 'welcome'), 'late guest welcome');
    assert.notEqual(late.id, room.owner);
    await assertRejected(lateGuest, {
      type: 'team', id: joinedGuest.id, team: 0, owner: late.id
    }, room, 'spoofed team command after owner transfer');
    await assertRejected(lateGuest, {type: 'record'}, room,
      'record attempt after owner transfer');

    console.log('PASS WebSocket room authorization: 13 forbidden guest actions, allowed chat, owner handover, legitimate successor control, and no late-guest spoofing');
  } finally {
    for (const ws of connections) ws.close();
    await app.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
