'use strict';
// RFC 6455 5.2 requires the shortest possible payload-length encoding.
// A non-minimal frame can be parsed differently by browser/intermediary peers.
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {WebSocket}=require('../headless/websocket.cjs');

class WireSocket extends EventEmitter {
  constructor(){super();this.writes=[];this.ended=false;}
  setNoDelay(){} setTimeout(){}
  write(bytes){this.writes.push(Buffer.from(bytes));return true;}
  end(){this.ended=true;}
}
function frame(opcode,size,format){
  const bytes=Buffer.alloc(size,0xa5),mask=Buffer.from([4,5,6,7]);
  let hdr;
  if(format===7){hdr=Buffer.alloc(2);hdr[1]=0x80|size;}
  else if(format===16){hdr=Buffer.alloc(4);hdr[1]=0x80|126;hdr.writeUInt16BE(size,2);}
  else{hdr=Buffer.alloc(10);hdr[1]=0x80|127;hdr.writeBigUInt64BE(BigInt(size),2);}
  hdr[0]=0x80|opcode;
  const out=Buffer.alloc(hdr.length+4+bytes.length);
  hdr.copy(out);mask.copy(out,hdr.length);
  for(let i=0;i<bytes.length;i++)out[hdr.length+4+i]=bytes[i]^mask[i&3];
  return out;
}
function headerOnly64(size){
  const out=Buffer.alloc(14);
  out[0]=0x82;out[1]=0xff;
  out.writeBigUInt64BE(size,2);
  Buffer.from([4,5,6,7]).copy(out,10);
  return out;
}
function simulate(data,max=200000){
  const socket=new WireSocket(),ws=new WebSocket(socket,max),messages=[];
  ws.on('message',(bytes,binary)=>messages.push({bytes,binary}));
  socket.emit('data',data);
  return {socket,messages};
}
function expectClose(label,bytes,code,max){
  const {socket,messages}=simulate(bytes,max);
  assert.equal(messages.length,0,label+': must not dispatch payload');
  assert.equal(socket.writes.length,1,label+': emits exactly one close');
  const b=socket.writes[0];
  assert.equal(b[0]&15,8,label+': response opcode 8');
  assert.equal(b.readUInt16BE(2),code,label+': close status');
  assert.equal(socket.ended,true,label+': TCP output closed');
}
let checks=0;
for(const [label,size,format] of [
  ['non-minimal 16-bit length 1',1,16],
  ['non-minimal 16-bit length 125',125,16],
  ['non-minimal 64-bit length 1',1,64],
  ['non-minimal 64-bit length 126',126,64]
]){
  expectClose(label,frame(2,size,format),1002);checks++;
}
expectClose('non-minimal 64-bit length 65535 (header-only)',
  headerOnly64(65535n),1002);checks++;
expectClose('64-bit length high bit reserved',headerOnly64((1n<<63n)|65536n),1002);checks++;
expectClose('valid 64-bit encoding above configured max',
  headerOnly64(65536n),1009,40000);checks++;

for(const [size,format] of [[0,7],[125,7],[126,16],[65535,16],[65536,64]]){
  const {socket,messages}=simulate(frame(2,size,format));
  assert.equal(socket.writes.length,0,'valid frame '+size+' must not be rejected');
  assert.equal(messages.length,1,'valid frame '+size+' delivered');
  assert.equal(messages[0].binary,true);
  assert.equal(messages[0].bytes.length,size,'correct payload size');
  checks++;
}
{
  const {socket,messages}=simulate(frame(9,0,7));
  assert.equal(messages.length,0,'normal ping stays transport-internal');
  assert.equal(socket.writes.length,1);
  assert.equal(socket.writes[0][0]&15,10,'normal ping produces pong');
  checks++;
}
console.log('PASS RFC6455 canonical payload lengths: '+checks+' invalid/valid masked frame checks');
