/* The room host that runs inside a player's browser (in dist/host-worker.js, or directly in Node tests).
   It receives the room from the room server at an exact frame ('takeover'), keeps stepping it on the
   shared room clock, and hands it back at an exact frame ('release'). While hosting it posts a standby
   copy every 10 frames so the server can take over instantly if this browser disappears.
   Events posted to the owner: {ev:'send',to,data} (snapshot bytes or JSON for one client),
   {ev:'standby',state}, {ev:'released',state,epoch}, {ev:'hosting',frame}, {ev:'error',message}. */
(function(root){'use strict';
const XE=.06,STANDBY_EVERY=10,MAX_CATCH_UP=240;
function createPeerHost({Headless,RoomCore,Netcode,AI,factory,globals,post,now}){
 let core=null,clock=null,releaseAt=Infinity,epoch=0,buffered=[];
 const roomTime=(t=now())=>clock?clock.frame+(t-clock.at)*XE:NaN;
 function deliver({from,d}){try{core.message(from,d,roomTime());}catch(e){post({ev:'send',to:from,data:{type:'error',message:e.message}});}}
 function catchUp(){if(!core)return;const target=Math.min(Math.floor(roomTime()),releaseAt);let n=0;
  while(core.frame<target&&n++<MAX_CATCH_UP){core.step();if(core.frame%STANDBY_EVERY===0&&core.frame<releaseAt)post({ev:'standby',state:core.exportState({final:false})});}
  if(core.frame>=releaseAt){const state=core.exportState();core.destroy();core=null;clock=null;post({ev:'released',state,epoch});releaseAt=Infinity;}}
 function handle(m){
  if(m.cmd==='takeover'){if(core)core.destroy();const hb=Headless.createHeadless(Headless.createRuntime(factory,globals),{noPlayer:true});
   core=RoomCore.importRoomCore(m.state.room instanceof Uint8Array?m.state:RoomCore.decodeState(m.state),{hb,AI,Netcode,v3:true,send:(to,data)=>post({ev:'send',to,data})});
   epoch=m.epoch|0;releaseAt=Infinity;clock={frame:m.frame,at:m.at};
   // Inputs that reached this browser before the room did (sent for frames after the handover).
   for(const b of buffered)deliver(b);buffered=[];post({ev:'hosting',frame:core.frame,epoch});catchUp();return;}
  if(m.cmd==='msg'){if(!core){if(m.d?.type==='in'){buffered.push(m);if(buffered.length>512)buffered.shift();}return;}deliver(m);return;}
  if(m.cmd==='release'){if(!core)return;epoch=m.epoch|0;releaseAt=Math.max(core.frame,m.frame|0);catchUp();return;}
  if(m.cmd==='leave'){core?.leave(m.id);return;}
  if(m.cmd==='tick'){catchUp();return;}
  if(m.cmd==='stop'){core?.destroy();core=null;clock=null;buffered=[];return;}
 }
 return{handle,catchUp,roomTime,get hosting(){return !!core;},get core(){return core;}};
}
root.FuckballPeerHost={createPeerHost};if(typeof module!=='undefined')module.exports=root.FuckballPeerHost;
})(typeof globalThis!=='undefined'?globalThis:this);
