const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
class E{
 constructor(tag){this.tag=tag;this.children=[];this.hidden=false;this.disabled=false;this.textContent='';this.dataset={};this.events={};this.style={};}
 setAttribute(){} append(...a){this.children.push(...a)} replaceChildren(...a){this.children=[...a]}
 addEventListener(t,f){this.events[t]=f} click(){return this.events.click?.()}
}
const pane=new E('section'),body=new E('body'),listeners={},timers=[];
let clipboard='',consents=0;
const link={room:'ABC',quickMatchMode:null,ws:{readyState:1},roomState:{room:'ABC',round:4,owner:1,botIds:[]},roomRosterFrameFloor:10};
const net={lastSnapshot:10};
const room={state:{players:[{id:1,name:'Alice',team:{id:1}},{id:2,name:'Bob',team:{id:2}}]},
 gameState:{redScore:0,blueScore:0,timeElapsed:0}};
const doc={body,getElementById:id=>id==='menuMatchPane'?pane:null,
 createElement:tag=>new E(tag),addEventListener:(t,cb)=>listeners[t]=cb};
const ctx={document:doc,window:{addEventListener:(t,f)=>listeners[t]=f,confirm:()=>{consents++;return true}},
 serverLink:link,net,room,started:false,paused:false,menuOpen:true,
 navigator:{clipboard:{writeText:async text=>{clipboard=text}}},setInterval:f=>{timers.push(f);return 1},
 setTimeout:()=>{},Number,Date,Set,Array,Blob,URL,console};
const script=fs.readFileSync(require('path').join(__dirname,'..','dist','room-match-sheet.js'),'utf8');
vm.runInNewContext(script,ctx,{filename:'room-match-sheet.js'});
const panel=pane.children[0]; assert(panel);
const findButton=(label)=>{const actions=panel.children.find(x=>x.tag==='div'&&x.children.some(y=>y.tag==='button'));return actions?.children.find(x=>x.textContent===label)};
const copy=findButton('Copy team list');assert(copy);
assert.equal(panel.dataset.snapshotState,'waiting');assert.equal(copy.disabled,true);
net.lastSnapshot=11;timers[0]();
assert.equal(panel.dataset.snapshotState,'fresh');assert.equal(copy.disabled,false);
link.roomState.round=5;link.roomRosterFrameFloor=net.lastSnapshot;listeners['fuckball:native-session-state']();
assert.equal(panel.dataset.snapshotState,'waiting');assert.equal(copy.disabled,true);
room.state.players[0].name='Carol';net.lastSnapshot=12;timers[0]();
assert.equal(panel.dataset.snapshotState,'fresh');
(async()=>{await copy.click();assert.equal(consents,1);assert(clipboard.includes('Carol'));
 assert(clipboard.includes('SERVER ROUND 5'));assert(!clipboard.includes('Alice'));
 link.ws.readyState=3;listeners['fuckball:native-session-state']();
 assert.equal(copy.disabled,true);
 // This is the late-render lobby race: a single post-room snapshot has
 // already arrived, and the paused lobby will not publish another frame.
 const latePane=new E('section'),lateLink={
  room:'ABC',quickMatchMode:null,ws:{readyState:1},
  roomState:{room:'ABC',round:6,owner:1,botIds:[]},roomRosterFrameFloor:20};
 const lateCtx={...ctx,serverLink:lateLink,net:{lastSnapshot:21},
  document:{...doc,getElementById:id=>id==='menuMatchPane'?latePane:null}};
 vm.runInNewContext(script,lateCtx,{filename:'room-match-sheet-late.js'});
 assert.equal(latePane.children[0].dataset.snapshotState,'fresh',
  'late-rendered paused lobby must show its single valid post-room frame');
 console.log('PASS actual match-sheet UI: waiting -> fresh -> new round withheld -> new frame -> consented copy -> disconnect');})().catch(e=>{console.error(e);process.exitCode=1});
