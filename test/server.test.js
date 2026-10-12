'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const PORT=41000+Math.floor(Math.random()*10000);
function client(){
  return new Promise((resolve,reject)=>{
    const ws=new WebSocket(`ws://127.0.0.1:${PORT}/`),queue=[];let watcher;
    ws.addEventListener('message',e=>{try{const msg=JSON.parse(e.data);queue.push(msg);if(watcher)watcher();}catch{}});
    ws.addEventListener('open',()=>resolve({ws,queue,send:obj=>ws.send(JSON.stringify(obj)),
      next:async(type,timeout=4000)=>{
        const start=Date.now();while(Date.now()-start<timeout){
          const i=queue.findIndex(m=>m.type===type);
          if(i>=0)return queue.splice(i,1)[0];
          await new Promise(r=>{watcher=r;setTimeout(r,30);});watcher=null;
        }throw new Error(`Timeout waiting for ${type}; available=${queue.map(m=>m.type)}`);
      }}));
    ws.addEventListener('error',e=>reject(e));
  });
}
test('two browser WebSocket clients can create, join, play, pause and stop a match', {timeout:18000},async()=>{
  const server=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(PORT)},stdio:'pipe'});
  const clients=[];
  try{
    let ready=false;
    for(let i=0;i<100;i++){
      try{const res=await fetch(`http://127.0.0.1:${PORT}/health`);if(res.ok){ready=true;break;}}catch{}
      await sleep(30);
    }
    assert.ok(ready,'server should start using only Node built-ins');
    const botScript=await fetch(`http://127.0.0.1:${PORT}/shared/bot.js`);
    assert.equal(botScript.status,200,'online client should load the AI module');
    assert.match(await botScript.text(),/function decide\(/);
    const a=await client();clients.push(a);a.send({type:'create',name:'Alice'});
    const joined=await a.next('joined');assert.match(joined.code,/^[A-Z0-9]{6}$/);
    const lobby1=await a.next('lobby');assert.equal(lobby1.players[0].team,0);
    a.send({type:'team',team:1});
    const b=await client();clients.push(b);b.send({type:'join',code:joined.code,name:'Bob'});
    const joinedB=await b.next('joined');assert.equal(joinedB.code,joined.code);
    b.send({type:'team',team:2});
    a.send({type:'settings',scoreLimit:5,timeLimit:5,rebound:0.85});
    await sleep(100);
    a.send({type:'start'});
    let started=false;
    for(let i=0;i<20;i++){
      const m=await a.next('state');
      if(m.game.phase==='playing'&&m.game.players.length===2){
        assert.equal(m.game.scoreLimit,5);assert.equal(m.game.timeLimit,5);assert.equal(m.game.rebound,0.85);
        started=true;break;
      }
    }
    assert.ok(started,'game should contain both teams and active settings');
    a.send({type:'input',x:1,y:0,kick:false});await sleep(200);
    let remoteIntentSeen=false;
    for(let i=0;i<25;i++){
      const packet=await a.next('state');
      const alice=packet.game.players.find(p=>p.id===joined.id);
      if(alice?.inputX===1&&alice?.inputY===0){remoteIntentSeen=true;break;}
    }
    assert.equal(remoteIntentSeen,true,'server snapshots must transmit held movement inputs');
    a.send({type:'pause'});await sleep(100);
    a.send({type:'stop'});await sleep(100);
    const health=await (await fetch(`http://127.0.0.1:${PORT}/health`)).json();
    assert.equal(health.rooms,1);assert.equal(health.peers,2);
    b.ws.close();await sleep(70);
    assert.equal((await (await fetch(`http://127.0.0.1:${PORT}/health`)).json()).peers,1);
  }finally{
    for(const c of clients)c.ws.close();
    server.kill('SIGTERM');
    await Promise.race([new Promise(r=>server.once('exit',r)),sleep(600)]);
  }
});