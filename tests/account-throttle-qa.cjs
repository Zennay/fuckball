'use strict';
// Account abuse gate: the real HTTP API must enforce one shared 20-attempt
// budget across auth routes and recover after its 10-minute sliding window.
// /api/me remains safe and readable with an already issued bearer token.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createServer}=require('../headless/server.cjs');
async function post(base,route,data){
  const res=await fetch(base+route,{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  return {status:res.status,json:await res.json()};
}
async function me(base,token){
  const res=await fetch(base+'/api/me',{headers:{Authorization:'Bearer '+token}});
  return {status:res.status,json:await res.json()};
}
async function main(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fuckball-auth-throttle-'));
  const originalNow=Date.now;
  let virtualNow=originalNow(),app=null;
  Date.now=()=>virtualNow;
  try{
    app=createServer({dataDir:dir,peerHosting:false});
    const {port}=await app.listen(0),base='http://127.0.0.1:'+port;
    const register=await post(base,'/api/register',
      {username:'Throttle_1',password:'LongEnough!456'});
    assert.equal(register.status,200);
    assert.match(register.json.token,/^[a-f0-9]{64}$/);
    const token=register.json.token;
    let requests=1;
    for(let i=0;i<10;i++){
      const bad=await post(base,'/api/login',
        {username:'Throttle_1',password:'wrongpw'+i});
      assert.equal(bad.status,400,'wrong credential must fail without new session');
      requests++;
    }
    for(let i=0;i<9;i++){
      const noop=await post(base,'/api/logout',{token:'not-a-valid-token-'+i});
      assert.equal(noop.status,200,'invalid logout is harmless but counts toward flood');
      requests++;
    }
    assert.equal(requests,20,'threshold reached across mixed auth endpoints');
    const before=await me(base,token);
    assert.equal(before.status,200,'valid identity lookup survives POST exhaustion');
    assert.equal(before.json.username,'Throttle_1');
    const blocked=await post(base,'/api/login',
      {username:'Throttle_1',password:'LongEnough!456'});
    assert.equal(blocked.status,429,'correct credentials cannot bypass rate limit');
    assert.match(blocked.json.error,/Too many attempts/);
    const blockedRegister=await post(base,'/api/register',
      {username:'Throttle_2',password:'ValidPass987'});
    assert.equal(blockedRegister.status,429,'same IP cannot switch route to evade limit');
    assert.equal((await me(base,token)).status,200,
      'read-only /api/me does not consume the POST limiter');
    assert.equal((await me(base,'0'.repeat(64))).status,401,
      'unrecognized bearer token cannot impersonate user during throttling');

    // Advance only the API's logical wall clock. Never wait 10 real minutes
    // and never mutate production time or running VPS clocks.
    virtualNow+=600001;
    const permitted=await post(base,'/api/login',
      {username:'Throttle_1',password:'LongEnough!456'});
    assert.equal(permitted.status,200,'sliding 10-minute window genuinely expires');
    assert.notEqual(permitted.json.token,token,'recovery issues independent session');
    assert.equal((await me(base,permitted.json.token)).json.username,'Throttle_1',
      'recovered token authenticates the original identity');
    const saved=fs.readFileSync(path.join(dir,'accounts.json'),'utf8');
    assert(!saved.includes('LongEnough!456')&&!saved.includes(token),
      'throttling and recovery cannot persist raw credentials');
    console.log('PASS account flood window: exactly 20 shared POST attempts, 429 on route switching, authenticated GET, 600s expiry and clean token recovery');
  }finally{
    Date.now=originalNow;
    if(app)await app.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
