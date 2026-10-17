'use strict';
// Future My Games/ranking safety prerequisite: an HTTP account's nickname must
// be bound to its token when joining a real WebSocket room. Session revocation
// must apply to subsequent joins and survive a server restart.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createServer}=require('../headless/server.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){
  for(let i=0;i<200;i++){const v=fn();if(v)return v;await sleep(15);}
  throw Error('Timed out: '+label);
}
async function post(base,endpoint,body){
  const r=await fetch(base+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body)});
  return {status:r.status,data:await r.json()};
}
async function who(base,token){
  const r=await fetch(base+'/api/me',{headers:{Authorization:'Bearer '+token}});
  return {status:r.status,data:await r.json()};
}
async function join(base,connections,opts){
  const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws');
  ws.inbox=[];
  ws.onmessage=e=>{if(typeof e.data==='string')ws.inbox.push(JSON.parse(e.data));};
  connections.push(ws);
  await Promise.race([
    new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;}),
    sleep(4000).then(()=>{throw Error('WebSocket timeout');})
  ]);
  ws.send(JSON.stringify({type:'join',netcode:3,...opts}));
  const reply=await until(()=>ws.inbox.find(d=>d.type==='welcome'||d.type==='error'),
    'account-bound join result');
  return {ws,reply};
}
async function main(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fuckball-account-qa-'));
  let app=null;
  const connections=[];
  try{
    app=createServer({dataDir:dir,peerHosting:false});
    const port=(await app.listen(0)).port,base='http://127.0.0.1:'+port;
    const ar=await post(base,'/api/register',{username:'Alpha_100',password:'PassOne!123'});
    const br=await post(base,'/api/register',{username:'Beta_200',password:'PassTwo!123'});
    assert.equal(ar.status,200);assert.equal(br.status,200);
    const alphaToken=ar.data.token,betaToken=br.data.token;
    assert.match(alphaToken,/^[a-f0-9]{64}$/);
    assert.match(betaToken,/^[a-f0-9]{64}$/);
    assert.notEqual(alphaToken,betaToken,'two accounts have unrelated secrets');
    assert.equal((await who(base,alphaToken)).data.username,'Alpha_100');
    assert.equal((await who(base,betaToken)).data.username,'Beta_200');
    const saved=fs.readFileSync(path.join(dir,'accounts.json'),'utf8');
    for(const value of ['PassOne!123','PassTwo!123',alphaToken,betaToken])
      assert(!saved.includes(value),'account secret never stored in plaintext');

    // The server, not client-supplied display name or an admin flag, chooses
    // identity from the valid token. Account tokens do NOT confer room rights.
    const alpha=await join(base,connections,{create:true,name:'Beta_200',
      token:alphaToken,admin:true});
    assert.equal(alpha.reply.type,'welcome');
    assert.equal(alpha.reply.name,'Alpha_100');
    assert.equal(alpha.reply.account,'Alpha_100');
    const room=app.rooms.get(alpha.reply.room);
    const beta=await join(base,connections,{room:alpha.reply.room,
      name:'Alpha_100',token:betaToken,owner:alpha.reply.id});
    assert.equal(beta.reply.type,'welcome');
    assert.equal(beta.reply.name,'Beta_200');
    assert.equal(beta.reply.account,'Beta_200');
    assert.equal(room.owner,alpha.reply.id,'first account owns this room');
    assert.equal(room.clients.size,2);
    const forbidden=await join(base,connections,{create:true,name:'aLpHa_100',
      token:'0'.repeat(64),admin:true});
    assert.equal(forbidden.reply.type,'error');
    assert.match(forbidden.reply.message,/Name reserved/);
    assert.equal(app.rooms.size,1,'rejected impersonation allocates no empty room');

    // A logged-in guest cannot inherit host rights through name matching.
    const errors=beta.ws.inbox.filter(d=>d.type==='error').length;
    beta.ws.send(JSON.stringify({type:'start',owner:alpha.reply.id,admin:true}));
    const denied=await until(()=>beta.ws.inbox.filter(d=>d.type==='error')[errors],
      'account guest controls denied');
    assert.match(denied.message,/Only the host/);
    assert.equal(room.started,false);

    // Token revocation applies to *future* WebSocket admissions; it cannot
    // silently change an already established connection's native identity.
    assert.equal((await post(base,'/api/logout',{token:alphaToken})).status,200);
    assert.equal((await who(base,alphaToken)).status,401,'revoked token no longer authenticates');
    assert.equal(room.hb.getPlayer(alpha.reply.id).name,'Alpha_100',
      'session logout does not impersonate or rename an existing socket');
    const refused=await join(base,connections,{room:alpha.reply.room,
      token:alphaToken,name:'Alpha_100'});
    assert.equal(refused.reply.type,'error');
    assert.match(refused.reply.message,/Name reserved/);
    const fresh=await post(base,'/api/login',{username:'alpha_100',password:'PassOne!123'});
    assert.equal(fresh.status,200);
    const alphaToken2=fresh.data.token;
    assert.notEqual(alphaToken2,alphaToken,'new login rotates session token');

    alpha.ws.close();
    await until(()=>room.owner===beta.reply.id,'authorized owner handover');
    const returned=await join(base,connections,{room:beta.reply.room,token:alphaToken2,
      name:'Fake moderator',admin:true});
    assert.equal(returned.reply.type,'welcome');
    assert.equal(returned.reply.name,'Alpha_100');
    assert.equal(room.owner,beta.reply.id,'re-login does not steal host authority');
    const newErr=returned.ws.inbox.filter(m=>m.type==='error').length;
    returned.ws.send(JSON.stringify({type:'start',owner:alpha.reply.id,admin:true}));
    await until(()=>returned.ws.inbox.filter(m=>m.type==='error').length>newErr,
      'rejoined former owner cannot spoof host');
    assert.equal(room.started,false);
    beta.ws.send(JSON.stringify({type:'start'}));
    await until(()=>room.started,'actual owner can start');
    assert.equal(room.clients.size,2,'room survives account logout/relogin');

    for(const ws of connections)try{ws.close();}catch{}
    await app.close();
    app=null;
    // Session hashes and nickname lock persist to disk on ordinary restart.
    app=createServer({dataDir:dir,peerHosting:false});
    const newBase='http://127.0.0.1:'+(await app.listen(0)).port;
    assert.equal((await who(newBase,alphaToken)).status,401,
      'logged-out account remains revoked after server restart');
    assert.equal((await who(newBase,alphaToken2)).data.username,'Alpha_100',
      'fresh account session remains valid after restart');
    assert.equal((await who(newBase,betaToken)).data.username,'Beta_200',
      'independent account token remains valid after restart');
    const retry=await join(newBase,connections,{create:true,name:'BETA_200'});
    assert.equal(retry.reply.type,'error','reserved nickname remains protected after restart');
    assert.match(retry.reply.message,/Name reserved/);
    const valid=await join(newBase,connections,{create:true,token:alphaToken2,name:'Beta_200'});
    assert.equal(valid.reply.type,'welcome');
    assert.equal(valid.reply.name,'Alpha_100');
    console.log('PASS account-to-room identity: reserved-name spoof denied, guest rights, logout/login, handover and persistent token revocation');
  }finally{
    for(const ws of connections)try{ws.close();}catch{}
    if(app)await app.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
