'use strict';
// Native server close-frame wire contract: never emit a truncated UTF-8 scalar.
// This test uses no real sockets, rooms, accounts, players or VPS services.
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {WebSocket}=require('../headless/websocket.cjs');
const decoder=new TextDecoder('utf-8',{fatal:true});

function outgoing(reason, expected) {
  class FakeSocket extends EventEmitter {
    writes=[];
    ended=false;
    setNoDelay(){}
    write(chunk){this.writes.push(Buffer.from(chunk));}
    end(){this.ended=true;}
    setTimeout(){}
    destroy(){}
  }
  const fake=new FakeSocket(), ws=new WebSocket(fake,2048);
  ws.close(1000,reason);
  assert.equal(ws.readyState,2);
  assert.equal(fake.ended,true);
  assert.equal(fake.writes.length,1,'exactly one server close frame emitted');
  const packet=fake.writes[0];
  assert.equal(packet[0],0x88,'WebSocket FIN + CLOSE opcode');
  const size=packet[1];
  assert.ok(size>=2&&size<=125,'RFC 6455 close control payload bounded');
  assert.equal(size,packet.length-2,'no extended length encoding');
  assert.equal(packet.readUInt16BE(2),1000,'normal code intact');
  const text=decoder.decode(packet.subarray(4)); // fatal decoder: original bug is RED
  assert.equal(text,expected,'must trim on a complete UTF-8 boundary');
  assert.equal(Buffer.byteLength(text,'utf8'),size-2);
  ws.close(1000,'ignored');
  assert.equal(fake.writes.length,1,'close must not send a second frame');
}

outgoing('', '');
outgoing('a'.repeat(123),'a'.repeat(123));
outgoing('a'.repeat(130),'a'.repeat(123));
outgoing('a'.repeat(122)+'é','a'.repeat(122));
outgoing('a'.repeat(120)+'🚀','a'.repeat(120));
outgoing('a'.repeat(119)+'🚀','a'.repeat(119)+'🚀');
outgoing('a'.repeat(121)+'🌟','a'.repeat(121));
outgoing('é'.repeat(100),'é'.repeat(61));
outgoing('é'.repeat(61)+'z','é'.repeat(61)+'z');
console.log('PASS WebSocket server close UTF-8 scalar boundaries, 125-byte limit and no duplicate frames');
