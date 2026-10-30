'use strict';
// The UI reflects reconnect retry progress, never authorizes a reconnection.
// Simulate a real elapsed 5s retry with both directions of device clock drift.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.hidden=false;this.textContent='';this.listeners={};}
 append(...children){this.children.push(...children);}
 setAttribute(){}
 addEventListener(type,listener){this.listeners[type]=listener;}
 focus(){}
}
const body=new Element('body');
const match=new Element('main');
let mono=1000,wall=1700000000000,nextTimer=1;
const timers=new Map();
const window={addEventListener(){}};
const context=vm.createContext({
 document:{body,getElementById:id=>id==='matchView'?match:null,createElement:tag=>new Element(tag)},
 window,
 Date:{now:()=>wall},
 performance:{now:()=>mono},
 setInterval(callback){const id=nextTimer++;timers.set(id,callback);return id;},
 clearInterval(id){timers.delete(id);}
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/room-recovery.js'),'utf8'),context);
const controller=window.FuckballRoomRecovery;
assert(controller,'native recovery UI is available');
const panel=body.children[0],progress=panel.children[3];
const info={phase:'waiting',attempt:1,max:3,delay:5000,retry(){},cancel(){}};
const tick=()=>{for(const cb of [...timers.values()])cb();};
controller.show(info);
assert.match(progress.textContent,/retry in 5s/,'first countdown starts at actual delay');
mono+=1500;wall+=360000;tick();
assert.match(progress.textContent,/retry in 4s/,'forward wall-clock change must not expire retry');
mono+=1500;wall-=720000;tick();
assert.match(progress.textContent,/retry in 2s/,'backward wall-clock change must not extend retry');
mono+=3000;tick();
assert.match(progress.textContent,/retry in 0s/,'countdown clamps to zero');
controller.show({phase:'offline',attempt:1,max:3,retry(){},cancel(){}});
assert.match(progress.textContent,/Waiting for the device to come online/,'offline state remains readable');
controller.hide();
assert.equal(panel.hidden,true,'explicit hide still clears reconnect panel');
console.log('PASS native reconnect countdown under +/-6min device clock drift and offline/cancel');
