/* HaxBall-equivalent extrapolation for rendering.
   Port of the official client's prediction as found in the pinned node-haxball engine:
   - RoomState extrapolation (`j1`): copy the last confirmed state, apply queued predictable
     events (own unconfirmed inputs) at their frame numbers, step whole ticks with dt=1 and
     finish with ONE fractional tick (dt = frames - floor(frames)). Capped at 120 frames.
   - Client target frame (`cW`): (now + extrapolation)*0.06 + weighted-median clock offset.
     Offset samples come from ping replies: hostFrameAtReply - pingSentAt*0.06 (`r$`), kept in a
     50-sample window whose weights decay by 0.97 per new sample, read at the 50th percentile.
   - Host / local target: (now - roomStart + extrapolation)*0.06 - currentFrame.
   The authoritative room is never modified; every prediction works on a copy. */
(function(root){'use strict';
const TICK=1000/60,XE=.06,MAX_FRAMES=120,DECAY=.97,WINDOW=50;

/* Weighted percentile window, same algorithm as HaxBall's clock estimator. */
function createClock(capacity=WINDOW,decay=DECAY){const items=[];let total=0;
 return{
  add(value){if(!Number.isFinite(value))return;total=0;let oldest=0;for(let i=0;i<items.length;i++){const it=items[i];it.age++;it.weight*=decay;if(items[oldest].age<it.age)oldest=i;total+=it.weight;}
   let entry={};if(items.length>=capacity){entry=items[oldest];total-=entry.weight;items.splice(oldest,1);}
   entry.value=value;entry.weight=1;entry.age=0;total+=1;let i=0;while(i<items.length&&items[i].value<=value)i++;items.splice(i,0,entry);},
  percentile(p=.5){if(!items.length)return 0;if(items.length===1)return items[0].value;const want=p*total;let sum=items[0].weight,i=0;while(i<items.length-1&&!(sum>=want))sum+=items[++i].weight;return items[i].value;},
  get size(){return items.length;},
  reset(){items.length=0;total=0;}
 };}

let copyId=-1; // engine copy caches start with id -1; internal ids are positive
function copyState(state){return typeof state.AE==='function'?state.AE(--copyId):state.copy();}
function applyInput(state,id,input){if(typeof state.Go==='function')state.Go(id,input);}

/* events: [{frame,id,input}] in frame order; baseFrame: host frame number of `state`. */
function extrapolate(state,frames,events=[],baseFrame=0){
 if(!state||!(frames>0))return state;
 if(frames>MAX_FRAMES)frames=MAX_FRAMES;
 const out=copyState(state),whole=frames|0,last=baseFrame+whole;let e=0;
 for(let f=baseFrame;f<=last;f++){
  while(e<events.length&&events[e].frame<=f){applyInput(out,events[e].id,events[e].input);e++;}
  out.nM(f!==last?1:frames-whole);
 }
 return out;
}

/* Frames ahead of the latest simulated tick for a locally simulated room (offline or host). */
function localFrames({now,roomStart,currentFrame,extrapolation=0}){return Math.max(0,Math.min(MAX_FRAMES,(now-roomStart+extrapolation)*XE-currentFrame));}

/* Online guest: confirmed snapshots + clock estimate + own pending inputs. */
function createPredictor(){const pingClock=createClock(),snapshotClock=createClock(),pending=[];let snapshotFrame=0,lastStamp=-Infinity,lastInput=0;
 return{
  pingClock,snapshotClock,pending,
  /* Netcode v3: extra frames of lead (from the lead controller) and per-frame input stamping. */
  lead:0,stamped:false,
  get snapshotFrame(){return snapshotFrame;},
  reset(){pingClock.reset();snapshotClock.reset();pending.length=0;snapshotFrame=0;lastStamp=-Infinity;lastInput=0;this.lead=0;},
  /* Host frame (may be fractional) reported in the pong for a ping sent at `sentAt` (local ms). */
  pong(hostFrame,sentAt){pingClock.add(hostFrame-sentAt*XE);},
  /* Snapshot of host frame `frame` arrived at `now`; `ack` = last own input seq it already contains. */
  snapshot(frame,now,ack){snapshotFrame=frame;snapshotClock.add(frame-now*XE);let n=0;while(n<pending.length&&pending[n].seq<=ack)n++;if(n)pending.splice(0,n);},
  offset(){return pingClock.size?pingClock.percentile(.5):snapshotClock.percentile(.5);},
  targetFrame(now,extrapolation=0){return (now+extrapolation)*XE+this.offset()+this.lead;},
  /* Own input, stamped like HaxBall at the frame the client is currently predicting.
     v3 (stamped): stamps never go backwards, and a kick released in the frame it was pressed moves to
     the next frame, so the host simulates every tap. Returns the stamped frame. */
  input(seq,id,input,now){let frame=Math.max(snapshotFrame,Math.floor(this.targetFrame(now)));
   if(this.stamped){frame=Math.max(frame,lastStamp);if(frame===lastStamp&&(lastInput&16)&&!(input&16))frame++;lastStamp=frame;lastInput=input;}
   pending.push({seq,id,input,frame});if(pending.length>240)pending.splice(0,pending.length-240);return frame;},
  /* v3 wire form of the inputs the host has not confirmed yet: [[seq,frame,input],...]. */
  unacked(max=32){return pending.slice(-max).map(e=>[e.seq,e.frame,e.input]);},
  frames(now,extrapolation=0){return Math.max(0,Math.min(MAX_FRAMES,this.targetFrame(now,extrapolation)-snapshotFrame));},
  predict(state,now,extrapolation=0){return extrapolate(state,this.frames(now,extrapolation),pending,snapshotFrame);}
 };}

root.FuckballRenderTiming={TICK,XE,MAX_FRAMES,createClock,extrapolate,localFrames,createPredictor};if(typeof module!=='undefined')module.exports=root.FuckballRenderTiming;
})(typeof globalThis!=='undefined'?globalThis:this);
