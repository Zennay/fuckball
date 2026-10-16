'use strict';
// RFC 6455 §8.1 + §7.4: page-facing text and close reasons must be valid
// UTF-8, and reserved/unsendable close status codes must fail closed.
// This exercises the actual WebSocket transport with masked client frames.
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {WebSocket} = require('../headless/websocket.cjs');

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.writes = [];
    this.ended = false;
  }
  setNoDelay() {}
  setTimeout() {}
  write(data) {
    this.writes.push(Buffer.from(data));
    return true;
  }
  end() { this.ended = true; }
}

function masked(opcode, data) {
  const payload = Buffer.from(data);
  const mask = Buffer.from([0x27,0x38,0x44,0x5e]);
  assert(payload.length < 126, 'fixture only emits short, masked frames');
  const out = Buffer.alloc(2 + 4 + payload.length);
  out[0] = 0x80 | opcode;
  out[1] = 0x80 | payload.length;
  mask.copy(out, 2);
  for(let i=0;i<payload.length;i++) out[6+i] = payload[i] ^ mask[i&3];
  return out;
}
function clientFrame(opcode, data) {
  const socket = new FakeSocket();
  const ws = new WebSocket(socket,4096);
  const received=[];
  ws.on('message', (data,binary)=>received.push({data,binary}));
  socket.emit('data',masked(opcode,data));
  return {socket,ws,received};
}
function closeCode(result, label) {
  const {socket,received} = result;
  assert.equal(received.length,0,label+': invalid frame must not emit a message');
  assert.equal(socket.writes.length,1,label+': exactly one close frame');
  const response = socket.writes[0];
  assert.equal(response[0],0x88,label+': close opcode');
  assert.equal(response[1]&0x80,0,label+': server close must be unmasked');
  assert(response.length >= 4,label+': status present');
  assert.equal(response.length, 2+(response[1]&127),label+': close payload length valid');
  assert(socket.ended,label+': close ends the TCP output');
  return response.readUInt16BE(2);
}

let tested=0;
for(const [label, bytes] of [
  ['invalid UTF-8 continuation', Buffer.from([0xc3,0x28])],
  ['truncated UTF-8 sequence', Buffer.from([0xe2,0x82])],
  ['overlong encoding', Buffer.from([0xc0,0xaf])],
  ['invalid UTF-8 JSON field', Buffer.concat([
    Buffer.from('{"type":"chat","text":"'),Buffer.from([0xff]),Buffer.from('"}')
  ])]
]) {
  const result=clientFrame(1,bytes);
  assert.equal(closeCode(result,label),1007,label+': reject malformed text with 1007');
  tested++;
}
for(const [label, bytes] of [
  ['invalid close reason',Buffer.from([0x03,0xe8,0xff])],
  ['truncated close reason',Buffer.from([0x03,0xe8,0xe2,0x82])]
]) {
  assert.equal(closeCode(clientFrame(8,bytes),label),1007,label);
  tested++;
}
for(const code of [999,1004,1005,1006,1015,2000,2999,5000]) {
  const payload=Buffer.alloc(2);payload.writeUInt16BE(code);
  assert.equal(closeCode(clientFrame(8,payload),'reserved close '+code),1002);
  tested++;
}
{
  const utf8=Buffer.from('{"type":"chat","text":"Hallo 🌍"}');
  const got=clientFrame(1,utf8);
  assert.equal(got.socket.writes.length,0,'valid unicode text must not close');
  assert.equal(got.received.length,1);
  assert.equal(got.received[0].binary,false);
  assert.deepEqual(got.received[0].data,utf8);
  tested++;
}
{
  const data=Buffer.from([0xff,0xe2,0x82]);
  const got=clientFrame(2,data);
  assert.equal(got.socket.writes.length,0,'binary payload must not be decoded as text');
  assert.equal(got.received.length,1);
  assert.equal(got.received[0].binary,true);
  assert.deepEqual(got.received[0].data,data);
  tested++;
}
for(const code of [1000,1001,1002,1007,1014,3000,4999]) {
  const payload=Buffer.concat([Buffer.from([(code>>8)&255,code&255]),Buffer.from('ok')]);
  const got=clientFrame(8,payload);
  assert.equal(closeCode(got,'legal close '+code),1000,'valid peer close should be acknowledged');
  tested++;
}
console.log('PASS RFC6455 text/close admission: '+tested+' masked-frame assertions, valid unicode/binary and valid close codes');
