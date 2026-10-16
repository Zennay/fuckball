'use strict';
// Regression: online rooms accept far more than 8 players, bot roster remains
// independently editable, and each team's column scrolls without stretching.
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
    assert.equal(r.hb.getPlayerList().filter(p=>p.team===1).length+r.hb.getPlayerList().filter(p=>p.team===2).length,participants);

    // A new bot is allowed even when more than 16 humans already joined.
    host.send(JSON.stringify({type:'addBot',team:1}));
    await until(()=>r.botIds.size===1);
    const botId=[...r.botIds][0];
    assert(r.hb.getPlayer(botId));
    assert.equal(r.hb.getPlayerList().length,participants+1);
    const botStatus=await until(()=>host.messages.find(x=>x.type==='room'&&x.botIds?.includes(botId)));
    assert(botStatus.botIds.includes(botId),'client receives explicit bot identities');

    host.send(JSON.stringify({type:'team',id:botId,team:2}));
    await until(()=>r.hb.getPlayer(botId).team===2);
    host.send(JSON.stringify({type:'removeBot',id:botId}));
    await until(()=>r.botIds.size===0);
    assert.equal(r.hb.getPlayerList().length,participants);
    console.log('PASS 21 humans + bot added above old 16 cap, room team changes, removal, and scrollable team UI');
  } finally {
    sockets.forEach(ws=>ws.close());
    await app.close();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
