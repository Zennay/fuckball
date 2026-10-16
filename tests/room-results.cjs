'use strict';const assert=require('node:assert/strict');const{createServer}=require('../headless/server.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));function connect(url){return new Promise((resolve,reject)=>{const ws=new WebSocket(url);ws.binaryType='arraybuffer';ws.messages=[];ws.onmessage=({data})=>{if(typeof data==='string')ws.messages.push(JSON.parse(data));};ws.onopen=()=>resolve(ws);ws.onerror=reject;});}async function until(fn,ms=3000){for(let t=0;t<ms;t+=10){const x=fn();if(x)return x;await wait(10);}throw Error('Timed out waiting for server');}
(async()=>{const app=createServer();const address=await app.listen(0);let a,b;try{const url='ws://127.0.0.1:'+address.port+'/ws';
// Room created at the chosen size; bots fill 3v3.
a=await connect(url);a.send(JSON.stringify({type:'join',create:true,name:'Host',mode:'3v3'}));const welcome=await until(()=>a.messages.find(x=>x.type==='welcome'));const r=app.rooms.get(welcome.room);assert.equal(r.mode,'3v3');
b=await connect(url);b.send(JSON.stringify({type:'join',room:welcome.room,name:'Guest'}));const guest=await until(()=>b.messages.find(x=>x.type==='welcome'));assert.equal(r.hb.getPlayerList().length,6);
// Each player's reported RTT is shared with the room.
a.send(JSON.stringify({type:'ping',t:1,rtt:42}));b.send(JSON.stringify({type:'ping',t:1,rtt:87}));const pings=await until(()=>b.messages.find(x=>x.type==='pings'&&x.pings[welcome.id]===42&&x.pings[guest.id]===87));assert.equal(pings.pings[welcome.id],42);
console.log('PASS 3v3 rooms at the chosen size and per-player ping broadcast');
// Real goal through the engine: last kicker scores; result lists scorers and ends the match.
a.send(JSON.stringify({type:'start'}));await until(()=>r.started);const g=()=>r.hb._room.gameState;await until(()=>g()?.timeElapsed>0,10000);g().scoreLimit=1;r.hb.onPlayerBallKick(r.hb.getPlayer(welcome.id));const ball=g().physicsState.discs[0];ball.pos.x=680;ball.pos.y=0;ball.speed.x=6;ball.speed.y=0;
const goal=await until(()=>a.messages.find(x=>x.type==='goal'));assert.deepEqual([goal.team,goal.scorer.id,goal.scorer.own],[1,welcome.id,false]);
const result=await until(()=>b.messages.find(x=>x.type==='result'));assert.deepEqual([result.red,result.blue,result.mode,result.goals.length,result.goals[0].name],[1,0,'3v3',1,'Host']);assert.equal(r.started,false);
console.log('PASS goal scorer attribution and full-time result for every client');
// Rematch: host only; humans swap sides and the score resets.
b.send(JSON.stringify({type:'rematch'}));await until(()=>b.messages.find(x=>x.type==='error'));const before=[r.hb.getPlayer(welcome.id).team,r.hb.getPlayer(guest.id).team];
a.send(JSON.stringify({type:'rematch'}));await until(()=>r.started&&r.hb.getPlayer(welcome.id).team!==before[0]);assert.deepEqual([r.hb.getPlayer(welcome.id).team,r.hb.getPlayer(guest.id).team],before.map(t=>3-t));assert.equal(g().redScore+g().blueScore,0);assert.equal(r.goals.length,0);assert.equal(r.hb.getPlayerList().length,6);
console.log('PASS host-only rematch swaps sides and resets the score');
// Admins: appointed by the owner; may pause, move and remove players, but not the owner or other admins' roles.
const errors=()=>b.messages.filter(x=>x.type==='error').length,errBefore=errors();b.send(JSON.stringify({type:'pause',value:true}));await until(()=>errors()>errBefore);assert.equal(r.paused,false,'non-admin cannot pause');
a.send(JSON.stringify({type:'admin',id:guest.id,value:true}));await until(()=>b.messages.find(x=>x.type==='room'&&x.admins?.includes(guest.id)));await until(()=>b.messages.find(x=>x.type==='notice'&&/is now an admin/.test(x.text)));
b.send(JSON.stringify({type:'pause',value:true}));await until(()=>r.paused);b.send(JSON.stringify({type:'pause',value:false}));await until(()=>!r.paused);
b.send(JSON.stringify({type:'move',id:welcome.id,team:0}));await until(()=>r.hb.getPlayer(welcome.id).team===0);assert.equal(r.hb.getPlayerList().filter(p=>p.team===1||p.team===2).length,6,'bots fill the moved player\'s slot');b.send(JSON.stringify({type:'move',id:welcome.id,team:1}));await until(()=>r.hb.getPlayer(welcome.id).team===1);
let n=errors();b.send(JSON.stringify({type:'kick',id:welcome.id}));await until(()=>errors()>n);n=errors();b.send(JSON.stringify({type:'admin',id:welcome.id,value:false}));await until(()=>errors()>n);assert.equal(r.owner,welcome.id);
const c=await connect(url);c.send(JSON.stringify({type:'join',room:welcome.room,name:'Third'}));const third=await until(()=>c.messages.find(x=>x.type==='welcome'));b.send(JSON.stringify({type:'kick',id:third.id}));await until(()=>c.messages.find(x=>x.type==='kicked'));await until(()=>r.clients.size===2);assert.equal(r.hb.getPlayer(third.id),null);c.close();
a.send(JSON.stringify({type:'admin',id:guest.id,value:false}));await until(()=>!r.admins.has(guest.id));n=errors();b.send(JSON.stringify({type:'pause',value:true}));await until(()=>errors()>n);assert.equal(r.paused,false);
console.log('PASS owner appoints admins; admins pause, move and remove players; roles are protected');
}finally{a?.close();b?.close();await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
