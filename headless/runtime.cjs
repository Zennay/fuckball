'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
// Exact clock: n·(1000/60) + 1 µs (see dist/headless-room.js) so each advance is exactly one engine tick.
function createRuntime(options={}){let time=0,frames=0,seq=0;const pending=new Map();const window={console,performance:{now:()=>options.realtimeClock?performance.now():time},crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame:f=>{pending.set(++seq,f);return seq;},cancelAnimationFrame:id=>pending.delete(id),TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView};window.window=window;const context=vm.createContext(window);for(const f of ['json5.min.js','pako-jszip.min.js','haxball.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/vendor',f),'utf8'),context,{filename:f});const API=context.abcHaxballAPI(window);function advance(count=1){for(let n=0;n<count;n++){time=++frames*(1000/60)+1e-3;const ids=[...pending.keys()];for(const id of ids){const f=pending.get(id);pending.delete(id);if(f)f(time);}}}return{API,advance,context,window};}
const shared=require('../dist/headless-room.js');
function createHeadless(options={}){return shared.createHeadless(createRuntime(),options);}
module.exports={createRuntime,HBInit:createHeadless};
