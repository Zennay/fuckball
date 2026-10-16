'use strict';
// Always-green precursor for #31: large spectator rosters remain connected,
// server-authoritative and stable across owner handover. The separate opt-in
// room-roster-acceptance test covers the still-missing 4v4 active cap.
const assert = require('node:assert/strict');
const {createServer} = require('../headless/server.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, name) {
  for (let i = 0; i < 200; i++) {
    const value = check();
    if (value) return value;
    await sleep(15);
  }
  throw Error('Timeout: ' + name);
}
async function connect(url, all, room, name) {
  const ws = new WebSocket(url);
  ws.messages = [];
  ws.onmessage = e => {
    if (typeof e.data === 'string') ws.messages.push(JSON.parse(e.data));
  };
  all.push(ws);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.send(JSON.stringify({type:'join',...(room ? {room} : {create:true}),name,netcode:3}));
  const welcome = await until(() => ws.messages.find(m => m.type === 'welcome'), name + ' welcome');
  return {ws, id:welcome.id, room:welcome.room};
}
async function main() {
  const app = createServer({peerHosting:false});
  const address = await app.listen(0);
  const url = 'ws://127.0.0.1:' + address.port + '/ws';
  const connections = [];
  try {
    const host = await connect(url, connections, null, 'Captain');
    const players = [host];
    for (let i = 1; i < 12; i++) players.push(await connect(url, connections, host.room, 'Guest ' + i));
    const room = app.rooms.get(host.room);
    assert.equal(room.clients.size, 12);
    assert.equal(room.sockets.size, 12);
    assert.equal(room.owner, host.id);
    const ids = players.map(p => p.id);
    assert.equal(new Set(ids).size, 12);
    assert(players.every(p => p.room === host.room));

    // Under the currently overfilled #31 roster, guests must not exploit
    // forged host/admin metadata or concurrent control messages to rewrite
    // team membership, game mode or start state. This green authorization
    // check is separate from the still-RED 4v4 active-cap acceptance.
    const ownerState = () => ({
      owner:room.owner, mode:room.mode, started:room.started,
      teams:room.hb.getPlayerList().map(p => [p.id,p.team]).sort((a,b)=>a[0]-b[0]),
      ids:[...room.clients.keys()].sort((a,b)=>a-b),
      socketCount:room.sockets.size
    });
    const beforeForgery = ownerState();
    const guests = players.slice(1);
    const errorOffsets = guests.map(g => g.ws.messages.filter(m => m.type === 'error').length);
    for (const guest of guests) {
      for (const message of [
        {type:'team',id:host.id,team:0,owner:guest.id,admin:true},
        {type:'specAll',owner:host.id,admin:true},
        {type:'configure',mode:'bot',started:true,owner:host.id,admin:true}
      ]) guest.ws.send(JSON.stringify(message));
    }
    await until(() => guests.every((guest,index) =>
      guest.ws.messages.filter(m => m.type === 'error').length >= errorOffsets[index]+3),
    'all 33 forged guest commands rejected');
    for (const [index, guest] of guests.entries()) {
      const errors = guest.ws.messages.filter(m => m.type === 'error')
        .slice(errorOffsets[index]);
      assert.equal(errors.length,3,'each guest receives exactly three denials');
      for (const error of errors)
        assert.match(error.message,/Only the host can change the match/,
          'forged metadata cannot grant admin rights');
    }
    assert.deepEqual(ownerState(),beforeForgery,
      '33 concurrent forged controls cannot alter teams, owner, mode or roster');
    assert.equal(app.rooms.get(host.room),room,'room link survives forged controls');

    host.ws.send(JSON.stringify({type:'specAll'}));
    await until(() => room.hb.getPlayerList().every(p => p.team === 0), 'all on spectators');
    assert.equal(room.clients.size, 12, 'spectating must not disconnect any guests');

    // Spectators have no host rights, even when they forge an owner property.
    const attacker = players[3];
    const errors = attacker.ws.messages.filter(m => m.type === 'error').length;
    attacker.ws.send(JSON.stringify({type:'team',id:attacker.id,team:1,owner:host.id}));
    const denied = await until(() => attacker.ws.messages.filter(m => m.type === 'error')[errors], 'denied promotion');
    assert.match(denied.message, /Only the host can change the match/);
    assert(room.hb.getPlayerList().every(p => p.team === 0));

    // Authoritative host assignment can selectively promote two spectators.
    host.ws.send(JSON.stringify({type:'team',id:players[1].id,team:1}));
    await until(() => room.hb.getPlayer(players[1].id).team === 1, 'red assignment');
    host.ws.send(JSON.stringify({type:'team',id:players[2].id,team:2}));
    await until(() => room.hb.getPlayer(players[2].id).team === 2, 'blue assignment');
    for (const p of players.slice(3)) {
      assert.equal(room.hb.getPlayer(p.id).team, 0, 'unselected spectator not promoted');
    }

    // Disconnecting the owner preserves all remaining spectator identities.
    host.ws.close();
    await until(() => room.owner === players[1].id, 'owner handover');
    assert.equal(room.clients.size, 11);
    assert.equal(room.sockets.size, 11);
    assert.equal(app.rooms.get(host.room), room, 'room id remains stable');
    assert.equal(room.hb.getPlayer(players[2].id).team, 2);
    for (const p of players.slice(3)) {
      assert.equal(room.hb.getPlayer(p.id).team, 0, 'handover keeps spectator state');
    }
    console.log('PASS #31 precursor: 12 online, 33 forged guest controls denied, spectate-all, selective team moves and owner handover');
  } finally {
    for (const ws of connections) ws.close();
    await app.close();
  }
}
main().catch(error => {console.error(error);process.exitCode=1;});
