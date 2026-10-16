'use strict';
// Real TCP HTTP/1.1 WebSocket handshake regression. A malformed upgrade must
// not create a game/room WebSocket nor receive 101 Switching Protocols.
const assert = require('node:assert/strict');
const net = require('node:net');
const crypto = require('node:crypto');
const {createServer} = require('../headless/server.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function exchange(port, {key, connection='Upgrade', version='13', upgrade='websocket', path='/ws'}={}) {
  const socket = net.createConnection({host:'127.0.0.1',port});
  // Register BEFORE any reply: invalid handshakes can already be closed by
  // the server when the response header is read.
  const closed = new Promise(resolve => socket.once('close', resolve));
  let response='';
  socket.on('data', bytes => {response += bytes.toString('latin1');});
  try {
    await Promise.race([
      new Promise((resolve, reject) => {socket.once('connect',resolve);socket.once('error',reject);}),
      sleep(3000).then(()=>{throw Error('connect timeout');})
    ]);
    const fields = ['GET '+path+' HTTP/1.1', 'Host: 127.0.0.1:'+port,
      'Upgrade: '+upgrade, 'Sec-WebSocket-Version: '+version,
      'Sec-WebSocket-Key: '+key];
    if(connection!==null) fields.splice(3,0,'Connection: '+connection);
    socket.write(fields.join('\r\n')+'\r\n\r\n');
    for(let i=0;i<300&&!response.includes('\r\n\r\n');i++)await sleep(10);
    assert(response.includes('\r\n\r\n'), 'HTTP handshake response received');
    return response.split('\r\n')[0];
  } finally {
    // An upgraded socket may still be registered with the HTTP server for a
    // microtask after destroy(). Wait for close before server teardown.
    socket.destroy();
    await Promise.race([
      closed,
      sleep(2000).then(() => {throw Error('TCP fixture close timeout');})
    ]);
  }
}
async function main() {
  const app = createServer({peerHosting:false});
  const {port}=await app.listen(0);
  const valid = Buffer.alloc(16).toString('base64');
  assert.equal(valid.length,24);
  const noncanonical = valid.slice(0,-3)+'B==';
  assert.notEqual(Buffer.from(noncanonical,'base64').toString('base64'),noncanonical,
    'noncanonical last base64 sextet has nonzero pad bits');
  const cases = [
    ['normal browser upgrade', {key:valid}, true],
    ['valid keep-alive/Upgrade token list', {key:valid,connection:'keep-alive, Upgrade'}, true],
    ['noncanonical base64 key', {key:noncanonical}, false],
    ['URL-safe base64 alphabet', {key:'_'+valid.slice(1)}, false],
    ['missing Connection header', {key:valid,connection:null}, false],
    ['Connection header without Upgrade', {key:valid,connection:'keep-alive'}, false],
    ['wrong WebSocket version', {key:valid,version:'12'}, false],
    ['non-WebSocket upgrade token', {key:valid,upgrade:'h2c'}, false]
  ];
  try {
    for (const [name, request, allowed] of cases) {
      const line = await exchange(port, request);
      console.log('HANDSHAKE ' + name + ': ' + line);
      if(allowed) assert.match(line,/^HTTP\/1\.1 101 Switching Protocols$/,name);
      else assert.doesNotMatch(line,/^HTTP\/1\.1 101 /,
        name+': invalid upgrade must not create an accepted WebSocket');
      assert.equal(app.rooms.size,0,name+': no game room on any handshake');
    }
    console.log('PASS WebSocket handshake: '+cases.length+' valid/invalid raw HTTP upgrade cases');
  } catch(error) {
    console.error('HANDSHAKE ASSERTION FAILED:', error.stack||error);
    throw error;
  } finally {
    // A bare await app.close() can strand the test promise while Node exits
    // successfully with an empty event loop: never silently turn RED green.
    await Promise.race([
      app.close(),
      sleep(2000).then(() => {throw Error('WebSocket test cleanup timeout');})
    ]);
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
