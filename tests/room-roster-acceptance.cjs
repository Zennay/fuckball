'use strict';
// Executable, intentionally opt-in future acceptance gate for issue #31.
// Do NOT add this to npm test before server-enforced 4v4 rosters ship:
// today's server admits >8 active players, so this contract is expected RED.
const assert = require('node:assert/strict');
const {createServer} = require('../headless/server.cjs');
const {activeRosterOverflow} = require('../scripts/qa-roster-overflow.cjs');
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
  const evidence = activeRosterOverflow(label, {
    connected:room.clients.size, sockets:room.sockets.size,
    humans:teams.humans.length, red:teams.red.length, blue:teams.blue.length
  });
  if (evidence) console.error(evidence);
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

    // Assign an explicit red bench slot; spectators cannot consent for peers.
    // These requests use actual per-client WebSocket identities, not trusted
    // host-provided input IDs or mocked callback authorization.
    const entering=spectator.welcome.id, departing=host.welcome.id;
    host.ws.send(JSON.stringify({type:'bench',id:entering,team:1}));
    await until(()=>room.benches.get(entering)===1,'owner assigned red bench');
    host.ws.send(JSON.stringify({type:'subRequest',outId:departing,inId:entering}));
    await until(()=>room.pendingSubs.get(1)?.inId===entering,'red substitution proposed');
    const firstRequestId=room.pendingSubs.get(1).requestId;
    assert(Number.isSafeInteger(firstRequestId)&&firstRequestId>0,'request must carry a unique integer id');
    const adversary=sockets[11];
    const beforeErrors=adversary.messages.filter(m=>m.type==='error').length;
    adversary.send(JSON.stringify({type:'subAccept',team:1,outId:departing,requestId:firstRequestId,accept:true,admin:true}));
    const impersonation=await until(()=>adversary.messages.filter(m=>m.type==='error')[beforeErrors],'fake consent denied');
    assert.match(impersonation.message,/current substitution|player|consent/i);
    assert.equal(room.hb.getPlayer(entering).team,0,'third-party consent has no effect');
    assert.equal(room.pendingSubs.get(1).accepted,false,'forgery does not flip consent');
    spectator.ws.send(JSON.stringify({type:'subAccept',team:1,outId:departing,requestId:firstRequestId,accept:true}));
    await until(()=>room.hb.getPlayer(entering).team===1,'accepted pregame substitution');
    assert.equal(room.hb.getPlayer(departing).team,0);
    assert.equal(room.benches.get(departing),1,'outgoing player takes a red bench seat');
    assert(!room.benches.has(entering),'incoming player vacates bench');
    assert.equal(room.pendingSubs.size,0,'completed substitution consumed exactly once');
    assertFourAside(room,13,'pregame substitution keeps full room');

    // A second consent during live play queues, but cannot rewrite players
    // until the server-controlled pause boundary is actually reached.
    host.ws.send(JSON.stringify({type:'start'}));
    await until(()=>room.started===true,'host starts 4v4 match');
    const nextIncoming=12, nextOutgoing=entering;
    assert.equal(room.hb.getPlayer(nextIncoming).team,0);
    host.ws.send(JSON.stringify({type:'bench',id:nextIncoming,team:1}));
    await until(()=>room.benches.get(nextIncoming)===1,'second red bench assigned');
    host.ws.send(JSON.stringify({type:'subRequest',outId:nextOutgoing,inId:nextIncoming}));
    await until(()=>room.pendingSubs.get(1)?.inId===nextIncoming,'live substitution proposed');
    const secondRequestId=room.pendingSubs.get(1).requestId;
    assert(secondRequestId>firstRequestId,'request sequence must increase');
    adversary.send(JSON.stringify({type:'subAccept',team:1,outId:nextOutgoing,requestId:secondRequestId,accept:true}));
    await until(()=>room.pendingSubs.get(1)?.accepted===true,'incoming player consent recorded');
    assert.equal(room.hb.getPlayer(nextIncoming).team,0,'accepted candidate stays benched during live play');
    assert.equal(room.hb.getPlayer(nextOutgoing).team,1,'outgoing player stays on field during live play');

    host.ws.send(JSON.stringify({type:'pause',value:true}));
    await until(()=>room.paused===true&&room.hb.getPlayer(nextIncoming).team===1,'pause applies authorized swap');
    assert.equal(room.hb.getPlayer(nextOutgoing).team,0);
    assertFourAside(room,13,'pause-gated substitution preserves active slots');
    const scoreBefore=room.hb._room.gameState;
    const score=[scoreBefore.redScore,scoreBefore.blueScore];
    await sleep(80);
    assert.deepEqual([room.hb._room.gameState.redScore,room.hb._room.gameState.blueScore],score,
      'pause/substitution preserves match score without resetting');
    assert.equal(room.started,true,'substitution never resets match lifecycle');
    assert.equal(room.owner,departing,'benching owner never transfers host privileges');
    assert.equal(room.pendingSubs.size,0,'no replayable pending request after accepted swap');
    const errorCount=adversary.messages.filter(m=>m.type==='error').length;
    adversary.send(JSON.stringify({type:'subAccept',team:1,outId:nextOutgoing,requestId:secondRequestId,accept:true}));
    await until(()=>adversary.messages.filter(m=>m.type==='error')[errorCount],'duplicate consent denied');
    assert.equal(room.hb.getPlayer(nextIncoming).team,1);
    assertFourAside(room,13,'duplicate consent cannot make ninth player');

    // An expired request must release the side without allowing replay of
    // old consent for the exact same outgoing/incoming pair.
    host.ws.send(JSON.stringify({type:'subRequest',outId:nextIncoming,inId:nextOutgoing}));
    await until(()=>room.pendingSubs.get(1)?.inId===nextOutgoing,'first post-pause nomination');
    const expiredRequestId=room.pendingSubs.get(1).requestId;
    room.pendingSubs.get(1).expiresAt=Date.now()-1;
    host.ws.send(JSON.stringify({type:'subRequest',outId:nextIncoming,inId:nextOutgoing}));
    await until(()=>room.pendingSubs.get(1)?.requestId>expiredRequestId,'expired nomination replaced without side lock');
    const renewedRequestId=room.pendingSubs.get(1).requestId;
    assert.equal(renewedRequestId,expiredRequestId+1,'request sequence increases across expiry');
    const expiredErrors=spectator.ws.messages.filter(m=>m.type==='error').length;
    spectator.ws.send(JSON.stringify({type:'subAccept',team:1,outId:nextIncoming,requestId:expiredRequestId,accept:true}));
    const stale=await until(()=>spectator.ws.messages.filter(m=>m.type==='error')[expiredErrors],'stale consent rejected');
    assert.match(stale.message,/substitution|consent|current|invalid/i);
    assert.equal(room.pendingSubs.get(1)?.requestId,renewedRequestId);
    assert.equal(room.pendingSubs.get(1)?.accepted,false,'old consent cannot approve new request');
    assert.equal(room.hb.getPlayer(nextOutgoing).team,0,'stale consent does not promote a player');
    assert.equal(room.hb.getPlayer(nextIncoming).team,1,'stale consent does not bench active player');

    const malformedErrors=spectator.ws.messages.filter(m=>m.type==='error').length;
    spectator.ws.send(JSON.stringify({type:'subAccept',team:1,outId:nextIncoming,requestId:String(renewedRequestId),accept:true}));
    await until(()=>spectator.ws.messages.filter(m=>m.type==='error')[malformedErrors],'string nonce denied');
    assert.equal(room.pendingSubs.get(1)?.accepted,false,'noninteger nonce is invalid');
    assert.equal(room.exportState({final:false}).subSeq,renewedRequestId,'monotonic ID persists across handover export');

    spectator.ws.send(JSON.stringify({type:'subAccept',team:1,outId:nextIncoming,requestId:renewedRequestId,accept:true}));
    await until(()=>room.hb.getPlayer(nextOutgoing).team===1,'fresh consent accepted at paused boundary');
    assert.equal(room.hb.getPlayer(nextIncoming).team,0);
    assert.equal(room.pendingSubs.size,0,'completed request cannot replay');
    assertFourAside(room,13,'renewed consent preserves team caps and all connections');

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
