'use strict';
// Pure in-process peer transport QA. No WebRTC network, rooms or production
// state: drive actual createPeerNet with a fake open channel and virtual clock.
const assert = require('node:assert/strict');
const {createPeerNet} = require('../dist/peer-net.js');

let now = 1000, pc, channel;
const reports = [], probes = [];
const net = createPeerNet({
  selfId:3,
  now:()=>now,
  absNow:()=>now,
  createClock:()=>({size:0, add(){}, percentile(){return 0;}}),
  createPeerConnection:()=> (pc={close(){}}),
  createWorker:()=>({postMessage(){},terminate(){}}),
  sendServer:d=>reports.push(d),
  sendServerBinary(){},
  deliverJson(){},
  deliverSnapshot(){}
});
try {
  net.connect(2); // the higher ID waits for the peer's data channel
  channel={readyState:'open',bufferedAmount:0,
    send:d=>probes.push(JSON.parse(d)),close(){}};
  pc.ondatachannel({channel});
  const pong = (t,frame=90) => channel.onmessage({
    data:JSON.stringify({type:'pq',t,frame})
  });
  const peer=net.peers.get(2);
  assert(peer&&peer.ch===channel);

  // Unsolicited and fabricated timestamps cannot create zero-ms samples.
  pong(10000000); pong(999); pong(0);
  assert.deepEqual(peer.rtts,[],'unmatched peer pong must not be admitted');

  net.tick(); // sends real peer ping at t=1000
  assert(probes.some(d=>d.type==='pp'&&d.t===1000));
  pong(1001); // a future reply wasn't sent
  assert.deepEqual(peer.rtts,[],'a fabricated future timestamp cannot set RTT to zero');

  now=1012;
  pong(1000);
  assert.deepEqual(peer.rtts,[12],'matching delivered probe is accepted with real elapsed RTT');
  pong(1000);
  assert.deepEqual(peer.rtts,[12],'a replay cannot skew the RTT median');

  now=2000;
  net.handleServer({type:'spong',t:2000,frame:120}); // valid zero-ms server RTT
  net.tick(); // report peer and server RTT, send next fresh ping
  const report=reports.filter(r=>r.type==='rtt').at(-1);
  assert.equal(report.server,0,
    'valid zero-ms server RTT must remain zero, never become unknown/null');
  assert.equal(report.peers[2],12,
    'only correlated positive RTT samples may influence election');
  assert(probes.some(d=>d.type==='pp'&&d.t===2000));
  now=2003; pong(2000);
  assert.deepEqual(peer.rtts,[12,3]);
  pong(2000);
  assert.deepEqual(peer.rtts,[12,3],'repeated response is ignored');

  // Future reply after local clock rollback is rejected, not clamped to zero.
  now=3001; net.tick();
  assert(probes.some(d=>d.type==='pp'&&d.t===3001));
  now=2999; pong(3001);
  assert.deepEqual(peer.rtts,[12,3],'negative elapsed time is not a real RTT');

  // Timeout: an extremely delayed reply is neither useful nor admitted.
  now=6000; net.tick();
  assert(probes.some(d=>d.type==='pp'&&d.t===6000));
  now=9101; pong(6000);
  assert.deepEqual(peer.rtts,[12,3],'stale RTT samples are rejected');

  // A failed channel send must not create a phantom accepted ping token.
  channel.readyState='closed';
  now=10000; net.tick(); channel.readyState='open'; pong(10000);
  assert.deepEqual(peer.rtts,[12,3],'unsent probes are not eligible');

  // A closed/replaced RTC channel must not carry forward pending probes or
  // an old median into the new connection's host-selection report.
  channel.onclose();
  assert.equal(peer.ch,null,'closed channel is no longer trusted');
  assert.deepEqual(peer.rtts,[],'previous link RTT does not describe new link');
  assert.equal(peer.pingSent.size,0,'outstanding probes from old channel are forgotten');
  const oldChannel=channel;
  channel={readyState:'open',bufferedAmount:0,send:d=>probes.push(JSON.parse(d)),close(){}};
  pc.ondatachannel({channel});
  assert.equal(peer.ch,channel);
  assert.equal(peer.pingSent.size,0);
  oldChannel.onmessage({data:JSON.stringify({type:'pq',t:10000})});
  assert.deepEqual(peer.rtts,[],'late response from replaced channel is rejected');
  now=11001; net.tick();
  assert(probes.some(d=>d.type==='pp'&&d.t===11001),'new channel sends fresh probe');
  now=11006; pong(11001);
  assert.deepEqual(peer.rtts,[5],'new channel can gather clean fresh RTT');

  console.log('PASS correlated peer RTT: spoofed/stale/replayed replies, zero RTT, channel replacement and legitimate samples');
} finally {
  net.close();
}
