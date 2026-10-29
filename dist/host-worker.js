/* Web Worker that hosts an online room in this browser (peer hosting, dist/peer-host.js).
   A worker is its own JS realm, so this engine instance and its injected clock cannot interfere with
   the page's renderer engine, and the simulation keeps a steady 60 Hz while the page renders. */
'use strict';
self.window=self;
importScripts('vendor/json5.min.js','vendor/pako-jszip.min.js','vendor/haxball.js','ai/policy.js','netcode.js','headless-room.js','room-core.js','peer-host.js');
const now=()=>performance.timeOrigin+performance.now();
const globals={console,crypto:self.crypto,setTimeout:(...a)=>setTimeout(...a),clearTimeout:id=>clearTimeout(id),setInterval:(...a)=>setInterval(...a),clearInterval:id=>clearInterval(id),TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,JSON5:self.JSON5,pako:self.pako,JSZip:self.JSZip};
const host=FuckballPeerHost.createPeerHost({Headless:FuckballHeadless,RoomCore:FuckballRoomCore,Netcode:FuckballNetcode,AI:FuckballAI,factory:abcHaxballAPI,globals,now,
 post:ev=>{if(ev.ev==='send'&&ev.data instanceof Uint8Array)self.postMessage(ev,[ev.data.buffer]);else self.postMessage(ev);}});
self.onmessage=e=>{try{host.handle(e.data);}catch(err){self.postMessage({ev:'error',message:String(err&&err.message||err)});}};
setInterval(()=>{if(host.hosting)try{host.catchUp();}catch(err){self.postMessage({ev:'error',message:String(err&&err.message||err)});}},4);
