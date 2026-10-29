'use strict';
// Casually peer-hostable private rooms: WebRTC signaling and binary relay
// messages must not escape room boundaries when player IDs collide.
const assert=require('node:assert/strict');
const {createServer}=require('../headless/server.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){
  for(let i=0;i<200;i++){const val=fn();if(val)return val;await delay(12);}
  throw Error('Timeout: '+label);
}
async function join(url,all,options){
  const ws=new WebSocket(url);
  ws.inbox=[];ws.binaryCount=0;
  ws.onmessage=e=>{
    if(typeof e.data==='string')ws.inbox.push(JSON.parse(e.data));
    else ws.binaryCount++;
  };
  all.push(ws);
  await Promise.race([
    new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;}),
    delay(4000).then(()=>{throw Error('WebSocket timeout');})
  ]);
  ws.send(JSON.stringify({type:'join',netcode:3,mesh:true,...options}));
  const reply=await until(()=>ws.inbox.find(m=>m.type==='welcome'||m.type==='error'),
    'room admission');
  assert.equal(reply.type,'welcome',JSON.stringify(reply));
  await until(()=>ws.inbox.some(m=>m.type==='peering'&&m.enabled===true),
    'server enables casual peer signaling');
  return {ws,id:reply.id,room:reply.room};
}
const signals=c=>c.ws.inbox.filter(x=>x.type==='signal');
async function main(){
  const app=createServer({peerHosting:true,forceHost:()=> 'server'});
  const {port}=await app.listen(0),url='ws://127.0.0.1:'+port+'/ws',sockets=[];
  try{
    const ah=await join(url,sockets,{create:true,name:'Alpha owner'});
    const ag=await join(url,sockets,{room:ah.room,name:'Alpha guest'});
    const bh=await join(url,sockets,{create:true,name:'Beta owner'});
    const bg=await join(url,sockets,{room:bh.room,name:'Beta guest'});
    const ra=app.rooms.get(ah.room),rb=app.rooms.get(bh.room);
    assert.notEqual(ra,rb);
    assert.equal(ah.id,bh.id,'owners deliberately reuse numeric identity');
    assert.equal(ag.id,bg.id,'guests deliberately reuse numeric identity');
    assert.equal(ra.authority,'server');
    assert.equal(rb.authority,'server');

    // A valid offer stays inside A, never reaching B's identical recipient ID.
    const beforeA=signals(ag).length,beforeB=signals(bg).length;
    ah.ws.send(JSON.stringify({type:'signal',to:ag.id,
      data:{type:'offer',sdp:'alpha-private-webRTC-offer'}}));
    const offer=await until(()=>signals(ag)[beforeA],'alpha private WebRTC offer');
    assert.equal(offer.from,ah.id);
    assert.equal(offer.data.sdp,'alpha-private-webRTC-offer');
    await delay(90);
    assert.equal(signals(bg).length,beforeB,
      'beta guest must never receive alpha signaling with same recipient ID');

    // Even when the guest forges from/owner/room fields, the relay must
    // attribute the message to this socket, not metadata on the wire.
    const first=signals(ah).length,another=signals(bh).length;
    ag.ws.send(JSON.stringify({type:'signal',to:ah.id,
      from:bh.id,owner:bh.id,room:bh.room,admin:true,
      data:{type:'answer',sdp:'alpha-private-answer'}}));
    const answer=await until(()=>signals(ah)[first],'alpha socket attributed answer');
    assert.equal(answer.from,ag.id,'from must be actual authenticated room member');
    assert.equal(answer.data.sdp,'alpha-private-answer');
    await delay(90);
    assert.equal(signals(bh).length,another,'beta owner hears no alpha answer');

    // WebRTC relay bytes from a non-elected guest may not be blindly routed
    // to another participant while the server is authoritative. No room
    // needs to be paused or destroyed to reject the attempted relay.
    await delay(90);
    const beforeBinary=ah.ws.binaryCount,beforeBeta=bh.ws.binaryCount;
    const forged=Buffer.alloc(16);
    forged.writeUInt32BE(0x46425231,0);
    forged.writeUInt32BE(ah.id,4);
    forged.writeUInt32BE(0x46423203,8);
    ag.ws.send(forged);
    await delay(100);
    assert.equal(ah.ws.binaryCount,beforeBinary,
      'non-elected peer cannot inject authoritative binary snapshots');
    assert.equal(bh.ws.binaryCount,beforeBeta,'relay cannot cross room boundary');

    // RTT peer measurements are bounded to local member IDs (even if a
    // forged peer property is supplied) and cannot affect other rooms.
    ah.ws.send(JSON.stringify({type:'rtt',server:45,
      peers:{[ag.id]:9,9999:1},eligible:true}));
    await until(()=>ra.reports.has(ah.id),'alpha peer metrics admitted');
    assert.equal(ra.reports.get(ah.id).peers[ag.id],9);
    assert.equal(ra.reports.get(ah.id).peers[9999],undefined);
    assert.equal(rb.reports.size,0,'beta room cannot receive alpha telemetry');

    const bChat=bh.ws.inbox.filter(m=>m.type==='chat').length;
    bg.ws.send(JSON.stringify({type:'chat',text:'beta-still-here'}));
    const received=await until(()=>bh.ws.inbox.filter(m=>m.type==='chat')[bChat],
      'independent beta guest chat');
    assert.match(received.text,/beta-still-here/);
    assert.equal(ra.owner,ah.id);
    assert.equal(rb.owner,bh.id);
    assert.equal(ra.clients.size,2);
    assert.equal(rb.clients.size,2);
    console.log('PASS casual peer signaling privacy: same numeric IDs, local offers/answers, anti-spoof sender, unsafe relay denied, scoped RTT');
  } finally {
    for(const ws of sockets)try{ws.close();}catch{}
    await app.close();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
