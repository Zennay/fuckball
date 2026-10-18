'use strict';
// Regression: online rooms keep unlimited lobby connections while the active
// 4v4 roster stays capped, unauthorized promotions fail, and sidebars scroll.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {createServer} = require('../headless/server.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  for (let i=0;i<180;i++) {
    const result=check();
    if(result)return result;
    await wait(20);
  }
  throw Error('Timed out waiting for room data');
}
async function connect(url) {
  const ws=new WebSocket(url);
  ws.messages=[];
  ws.onmessage=e=>{if(typeof e.data==='string')ws.messages.push(JSON.parse(e.data));};
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  return ws;
}
async function main() {
  const css=fs.readFileSync('dist/room.css','utf8');
  const html=fs.readFileSync('dist/index.html','utf8');
  assert.match(css,/\.rm-players\{[^}]*max-height:/);
  assert.match(css,/\.rm-players\{[^}]*overflow-y:auto/);
  for(const id of ['redPlayers','bluePlayers','specPlayers']){
    assert.match(html,new RegExp('id="'+id+'"[^>]*tabindex="0"'));
  }
  assert.doesNotMatch(html,/Up to 8 players/);
  const app=createServer();
  const address=await app.listen(0);
  const url='ws://127.0.0.1:'+address.port+'/ws';
  const sockets=[];
  try {
    const host=await connect(url);sockets.push(host);
    host.send(JSON.stringify({type:'join',create:true,name:'Host'}));
    const welcome=await until(()=>host.messages.find(x=>x.type==='welcome'));
    assert.equal(welcome.id,1);
    const participants=21;
    for(let i=1;i<participants;i++) {
      const client=await connect(url);sockets.push(client);
      client.send(JSON.stringify({type:'join',room:welcome.room,name:'Guest '+i}));
      const joined=await until(()=>client.messages.find(x=>x.type==='welcome'||x.type==='error'));
      assert.equal(joined.type,'welcome',JSON.stringify(joined));
    }
    const r=app.rooms.get(welcome.room);
    assert.equal(r.clients.size,participants);
    assert.equal(r.hb.getPlayerList().filter(p=>!r.botIds.has(p.id)).length,participants);
    assert.equal(r.owner,1);
    const players=()=>r.hb.getPlayerList();
    const active=team=>players().filter(p=>p.team===team);
    assert.equal(active(1).length,4,'maximum four active red players');
    assert.equal(active(2).length,4,'maximum four active blue players');
    assert.equal(active(0).length,participants-8,'extra connected humans remain spectators');
    assert.equal(r.sockets.size,participants,'no participant loses the room connection');

    // No owner, bot or forged client command may make a ninth active player.
    const errors=()=>host.messages.filter(x=>x.type==='error');
    let previousErrors=errors().length;
    host.send(JSON.stringify({type:'addBot',team:1}));
    const fullError=await until(()=>errors()[previousErrors]);
    assert.match(fullError.message,/full|bench/i);
    assert.equal(r.botIds.size,0,'a full side cannot receive an extra active bot');

    // Spectator bots can still be registered and safely removed in a full lobby.
    host.send(JSON.stringify({type:'addBot',team:0}));
    await until(()=>r.botIds.size===1);
    const botId=[...r.botIds][0];
    assert.equal(r.hb.getPlayer(botId).team,0);
    assert.equal(players().length,participants+1);
    previousErrors=errors().length;
    host.send(JSON.stringify({type:'team',id:botId,team:2}));
    await until(()=>errors()[previousErrors]);
    assert.equal(r.hb.getPlayer(botId).team,0,'no promotion into full blue team');
    host.send(JSON.stringify({type:'removeBot',id:botId}));
    await until(()=>r.botIds.size===0);

    // Ordinary spectators cannot promote themselves with forged host claims.
    const unprivileged=sockets[12],spectatorId=13;
    assert.equal(r.hb.getPlayer(spectatorId).team,0);
    const beforeGuest=unprivileged.messages.filter(x=>x.type==='error').length;
    unprivileged.send(JSON.stringify({type:'team',id:spectatorId,team:1,owner:r.owner,admin:true}));
    const denied=await until(()=>unprivileged.messages.filter(x=>x.type==='error')[beforeGuest]);
    assert.match(denied.message,/host|permit|authoriz/i);
    assert.equal(r.hb.getPlayer(spectatorId).team,0);

    // The owner can free exactly one active slot and then assign an existing
    // inactive member; connected count and team caps stay unchanged.
    const outgoing=active(1)[0].id;
    host.send(JSON.stringify({type:'team',id:outgoing,team:0}));
    await until(()=>r.hb.getPlayer(outgoing).team===0);
    host.send(JSON.stringify({type:'team',id:spectatorId,team:1}));
    await until(()=>r.hb.getPlayer(spectatorId).team===1);
    assert.equal(active(1).length,4);
    assert.equal(active(2).length,4);
    assert.equal(active(0).length,participants-8);
    assert.equal(r.clients.size,participants);
    console.log('PASS 21 connected humans with exactly 4v4 active, bench/spectators, full-team denial, owner slot transfer, and retained room sockets');
  } finally {
    sockets.forEach(ws=>ws.close());
    await app.close();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
