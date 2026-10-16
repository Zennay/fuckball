'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createServer}=require('../headless/server.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fuckball-accounts-')),app=createServer({dataDir:dir}),a=await app.listen(0),base='http://127.0.0.1:'+a.port;
 const post=(route,body)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(async r=>({status:r.status,body:await r.json()}));
 function join(msg){return new Promise((resolve,reject)=>{const ws=new WebSocket(base.replace('http','ws')+'/ws');const t=setTimeout(()=>reject(Error('timeout')),3000);ws.onopen=()=>ws.send(JSON.stringify({type:'join',create:true,...msg}));ws.onmessage=e=>{if(typeof e.data!=='string')return;const d=JSON.parse(e.data);if(d.type==='welcome'||d.type==='error'){clearTimeout(t);resolve({d,ws});}};});}
 try{
  let r=await post('/api/register',{username:'Keeper_1',password:'secret1'});assert.equal(r.status,200);assert.match(r.body.token,/^[0-9a-f]{64}$/);const token=r.body.token;
  assert.equal((await post('/api/register',{username:'keeper_1',password:'other12'})).status,400,'usernames are unique, case-insensitive');
  assert.equal((await post('/api/register',{username:'x',password:'secret1'})).status,400,'username rules');
  assert.equal((await post('/api/login',{username:'Keeper_1',password:'wrongpw'})).status,400);
  r=await post('/api/login',{username:'keeper_1',password:'secret1'});assert.equal(r.status,200);assert.equal(r.body.username,'Keeper_1');
  const raw=fs.readFileSync(path.join(dir,'accounts.json'),'utf8');assert(!raw.includes('secret1')&&!raw.includes(token),'no plain passwords or tokens on disk');
  const me=await fetch(base+'/api/me',{headers:{Authorization:'Bearer '+token}});assert.equal((await me.json()).username,'Keeper_1');
  let j=await join({name:'keeper_1'});assert.equal(j.d.type,'error');assert.match(j.d.message,/^Name reserved/,'guests cannot take an account name');j.ws.close();
  j=await join({name:'whatever',token});assert.equal(j.d.type,'welcome');assert.equal(j.d.name,'Keeper_1','logged-in players play under their account name');
  const room=app.rooms.get(j.d.room);await new Promise(r=>setTimeout(r,50));
  const teamOf=id=>room.hb.getPlayer(id).team,id=j.d.id,before=teamOf(id);
  j.ws.send(JSON.stringify({type:'swap'}));await new Promise(r=>setTimeout(r,50));assert.equal(teamOf(id),3-before,'swap flips Red and Blue');
  j.ws.send(JSON.stringify({type:'specAll'}));await new Promise(r=>setTimeout(r,50));assert(room.hb.getPlayerList().every(p=>p.team===0),'everyone to spectators');
  j.ws.close();
  console.log('PASS accounts: register/login, hashed storage, reserved nicknames, account names in rooms; host swap and all-to-spectators');
 }finally{await app.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
