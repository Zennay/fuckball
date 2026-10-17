'use strict';
// Integration smoke: malformed UTF-8 must never reach a real game room
// through the HTTP upgraded WebSocket server. No external hosts or VPS.
const assert=require('node:assert/strict');
const net=require('node:net');
const crypto=require('node:crypto');
const {createServer}=require('../headless/server.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){
  for(let n=0;n<200;n++){const value=fn();if(value)return value;await sleep(10);}
  throw Error('Timeout: '+label);
}
async function rawClient(port){
  const socket=net.createConnection({port,host:'127.0.0.1'});
  let received=Buffer.alloc(0);
  socket.on('data',buf=>{received=Buffer.concat([received,buf]);});
  socket.on('error',()=>{});
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
  const key=crypto.randomBytes(16).toString('base64');
  socket.write('GET /ws HTTP/1.1\r\nHost: 127.0.0.1:'+port+
    '\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: '+key+'\r\n\r\n');
  const headerEnd=await until(()=>{
    const pos=received.indexOf('\r\n\r\n');
    return pos<0?0:pos+4;
  },'WebSocket upgrade');
  assert.match(received.subarray(0,headerEnd).toString(),/^HTTP\/1\.1 101 /);
  return {socket,body:()=>received.subarray(headerEnd)};
}
function frame(opcode,payload){
  const bytes=Buffer.from(payload),mask=Buffer.from([2,3,5,7]);
  assert(bytes.length<126);
  const out=Buffer.alloc(6+bytes.length);
  out[0]=0x80|opcode;out[1]=0x80|bytes.length;
  mask.copy(out,2);
  for(let i=0;i<bytes.length;i++)out[i+6]=bytes[i]^mask[i&3];
  return out;
}
async function rejectRaw(port,opcode,payload,code,label){
  const c=await rawClient(port);
  try {
    c.socket.write(frame(opcode,payload));
    const reply=await until(()=>c.body().length>=4?c.body():null,label+' server close');
    assert.equal(reply[0]&15,8,label+': close opcode');
    assert.equal(reply.readUInt16BE(2),code,label+': close status');
  } finally {c.socket.destroy();}
}
async function main(){
  const app=createServer({peerHosting:false});
  const {port}=await app.listen(0);
  let browser;
  try {
    await rejectRaw(port,1,Buffer.from([0xc3,0x28]),1007,'invalid text');
    await rejectRaw(port,8,Buffer.from([0x03,0xe8,0xff]),1007,'invalid close reason');
    await rejectRaw(port,8,Buffer.from([0x03,0xed]),1002,'reserved close 1005');
    assert.equal(app.rooms.size,0,'invalid frames must not allocate game rooms');

    browser=new WebSocket('ws://127.0.0.1:'+port+'/ws');
    const messages=[];
    browser.onmessage=e=>{if(typeof e.data==='string')messages.push(JSON.parse(e.data));};
    await new Promise((resolve,reject)=>{browser.onopen=resolve;browser.onerror=reject;});
    browser.send(JSON.stringify({type:'join',create:true,name:'Speler 🌍',netcode:3}));
    const welcome=await until(()=>messages.find(x=>x.type==='welcome'),'healthy Unicode room join');
    assert.equal(welcome.name,'Speler 🌍','valid international player name retained');
    assert.equal(app.rooms.size,1);
    console.log('PASS real-TCP invalid UTF-8/close cases + valid Unicode multiplayer join');
  } finally {
    if(browser)browser.close();
    await app.close();
  }
}
main().catch(err=>{console.error(err);process.exitCode=1;});
