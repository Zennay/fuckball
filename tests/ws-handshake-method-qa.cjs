'use strict';
// RFC 6455 §4.1: a WebSocket HTTP upgrade MUST use GET / HTTP/1.1.
// Real loopback TCP requests, no room engine, auth credentials or VPS.
const assert=require('node:assert/strict');
const http=require('node:http');
const net=require('node:net');
const {WebSocketServer}=require('../headless/websocket.cjs');

const server=http.createServer((req,res)=>{res.statusCode=404;res.end('Not found');});
const accepted=[];
const upgrades=new WebSocketServer({server,maxPayload:1024});
upgrades.on('connection',ws=>{
  accepted.push(ws);
  ws.once('close',()=>{});
});
async function exchange(port,method) {
  const socket=net.createConnection({host:'127.0.0.1',port});
  try {
    await new Promise((resolve,reject)=>{
      socket.once('connect',resolve);
      socket.once('error',reject);
    });
    const response=new Promise((resolve,reject)=>{
      let data='';
      const timer=setTimeout(()=>reject(Error('Timed out waiting for '+method+' handshake')),2500);
      socket.on('data',bytes=>{
        data+=bytes.toString('latin1');
        if(data.includes('\r\n\r\n')){clearTimeout(timer);resolve(data.split('\r\n')[0]);}
      });
      socket.on('error',error=>{clearTimeout(timer);reject(error);});
      socket.on('close',()=>{if(!data.includes('\r\n\r\n')){clearTimeout(timer);reject(Error('Handshake closed without HTTP response for '+method));}});
    });
    socket.write(method+' /ws HTTP/1.1\r\nHost: 127.0.0.1:'+port+
      '\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13'+
      '\r\nSec-WebSocket-Key: AAAAAAAAAAAAAAAAAAAAAA==\r\n\r\n');
    return await response;
  } finally {
    socket.destroy();
  }
}

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const port=server.address().port;
    const get=await exchange(port,'GET');
    assert.match(get,/^HTTP\/1\.1 101 Switching Protocols$/,
      'valid RFC 6455 GET must still connect');
    for(const method of ['POST','HEAD','PUT','DELETE','OPTIONS']){
      const before=accepted.length;
      const status=await exchange(port,method);
      assert.doesNotMatch(status,/^HTTP\/1\.1 101 /,
        method+' must not establish a WebSocket');
      assert.equal(accepted.length,before,
        method+' must not allocate a WebSocket connection');
    }
    assert.equal(accepted.length,1,'only the valid GET was accepted');
    console.log('PASS RFC 6455: GET upgrade accepted, five non-GET upgrades rejected');
  }finally{
    for(const ws of accepted)ws.socket.destroy();
    server.closeAllConnections?.();
    await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
