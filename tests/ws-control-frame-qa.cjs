'use strict';
// RFC 6455 control frames MUST have FIN=1 and at most 125 payload bytes.
// This exercises the real TCP upgrade and wire parser, not a mocked method.
const assert = require('node:assert/strict');
const net = require('node:net');
const crypto = require('node:crypto');
const {createServer} = require('../headless/server.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label) {
  for (let i = 0; i < 160; i++) {
    const answer = fn();
    if (answer) return answer;
    await sleep(10);
  }
  throw Error('Timed out: ' + label);
}
async function upgraded(port) {
  const socket = net.createConnection({port, host:'127.0.0.1'});
  let inbound = Buffer.alloc(0);
  socket.on('data', bytes => {inbound = Buffer.concat([inbound, bytes]);});
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  const key = crypto.randomBytes(16).toString('base64');
  socket.write('GET /ws HTTP/1.1\r\nHost: 127.0.0.1:' + port +
    '\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ' + key + '\r\n\r\n');
  const headerEnd = await until(() => {
    const pos = inbound.indexOf('\r\n\r\n');
    return pos >= 0 ? pos + 4 : 0;
  }, 'HTTP upgrade');
  assert.match(inbound.subarray(0, headerEnd).toString(),/^HTTP\/1\.1 101 Switching Protocols/);
  return {socket, data: () => inbound.subarray(headerEnd)};
}
function maskedFrame(opcode, payload, forceExtended = false) {
  const data = Buffer.from(payload), mask = Buffer.from([11,29,41,53]);
  const extended = forceExtended || data.length >= 126;
  const out = Buffer.alloc((extended ? 4 : 2) + 4 + data.length);
  out[0] = 0x80 | opcode;
  out[1] = 0x80 | (extended ? 126 : data.length);
  let pos = 2;
  if (extended) {out.writeUInt16BE(data.length, 2); pos = 4;}
  mask.copy(out, pos);pos += 4;
  for(let i=0;i<data.length;i++)out[pos+i] = data[i] ^ mask[i%4];
  return out;
}
async function verify(port, name, frame, expectedOpcode, expectedCloseCode) {
  const conn = await upgraded(port);
  try {
    conn.socket.write(frame);
    const packet = await until(() => conn.data().length >= 4 ? conn.data() : null, name + ' reply');
    assert.equal(packet[0] & 0x0f, expectedOpcode, name + ' response opcode');
    if (expectedCloseCode != null) {
      assert.equal(packet.readUInt16BE(2), expectedCloseCode,
        name + ' must close with protocol-error code 1002');
    }
  } finally {
    conn.socket.destroy();
  }
}
async function main() {
  const app=createServer({peerHosting:false});
  const {port}=await app.listen(0);
  try {
    await verify(port, 'oversized ping', maskedFrame(9, Buffer.alloc(126, 0x61)), 8, 1002);
    await verify(port, 'oversized pong', maskedFrame(10, Buffer.alloc(126, 0x62)), 8, 1002);
    await verify(port, 'malformed close payload', maskedFrame(8, Buffer.from([0x03])), 8, 1002);
    // Valid control frames still work after malicious sockets have been rejected.
    await verify(port, 'normal ping', maskedFrame(9, Buffer.from('pong')), 10, null);
    assert.equal(app.rooms.size, 0, 'bad transport input must not allocate a game room');
    console.log('PASS WebSocket control frames: oversized ping/pong and 1-byte close fail 1002; normal ping survives');
  } finally {await app.close();}
}
main().catch(error => {console.error(error);process.exitCode=1;});
