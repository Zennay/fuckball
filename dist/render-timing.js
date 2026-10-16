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

/* Correction smoothing (visual only). When a snapshot changes the predicted present,
   each disc keeps the jump as an offset that fades out (half-life ~45 ms) instead of
   teleporting. Big jumps (kickoff, goal reset, teleports) snap immediately. The offset is
   measured exactly: the prediction for the same moment before and after the snapshot.
   The engine reuses one buffer for every copy (`AE`), so the "before" prediction must be
   captured as plain positions (`positions(state)`) before the next prediction is made. */
const discsOf=s=>s?.gameState?.physicsState?.discs||[];
function positions(state){return discsOf(state).map(d=>[d.pos.x,d.pos.y]);}
function createSmoother({halfLife=45,snap=60}={}){let offsets=[],last=0;
 function decay(now){const k=Math.pow(.5,Math.max(0,now-last)/halfLife);last=now;let live=false;for(const o of offsets){o[0]*=k;o[1]*=k;if(Math.abs(o[0])+Math.abs(o[1])>.01)live=true;else o[0]=o[1]=0;}if(!live)offsets=[];}
 return{
  /* before: positions() captured from the old prediction; after: the new prediction. */
  correct(before,after,now){decay(now);const b=discsOf(after);if(!Array.isArray(before)||before.length!==b.length){offsets=[];return;}
   if(offsets.length!==b.length)offsets=b.map(()=>[0,0]);
   for(let i=0;i<b.length;i++){const o=offsets[i];o[0]+=before[i][0]-b[i].pos.x;o[1]+=before[i][1]-b[i].pos.y;if(Math.hypot(o[0],o[1])>snap)o[0]=o[1]=0;}},
  /* Shifts the shown discs of a predicted copy; never touches `source` (the confirmed state). */
  apply(state,now,source){decay(now);if(!offsets.length)return state;const d=discsOf(state);if(d.length!==offsets.length){offsets=[];return state;}
   if(state===source){state=copyState(state);}const out=discsOf(state);for(let i=0;i<out.length;i++){out[i].pos.x+=offsets[i][0];out[i].pos.y+=offsets[i][1];}return state;},
  get active(){return offsets.some(o=>o[0]||o[1]);},
  reset(){offsets=[];}
 };}

/* Online guest: confirmed snapshots + clock estimate + own pending inputs.
   `lead` is the percentile of the clock window used as target. 0.5 (HaxBall) stamps inputs at
   the median arrival frame; a higher value stamps a little later so that, with the server
   holding early inputs until their frame, most inputs run exactly where they were predicted. */
function createPredictor({lead=.5}={}){const pingClock=createClock(),snapshotClock=createClock(),pending=[];let snapshotFrame=0;
 return{
  pingClock,snapshotClock,pending,lead,
  get snapshotFrame(){return snapshotFrame;},
  reset(){pingClock.reset();snapshotClock.reset();pending.length=0;snapshotFrame=0;},
  /* Host frame (may be fractional) reported in the pong for a ping sent at `sentAt` (local ms). */
  pong(hostFrame,sentAt){pingClock.add(hostFrame-sentAt*XE);},
  /* Snapshot of host frame `frame` arrived at `now`; `ack` = last own input seq it already contains. */
  snapshot(frame,now,ack){snapshotFrame=frame;snapshotClock.add(frame-now*XE);let n=0;while(n<pending.length&&pending[n].seq<=ack)n++;if(n)pending.splice(0,n);},
  offset(){return pingClock.size?pingClock.percentile(this.lead):snapshotClock.percentile(.5);},
  targetFrame(now,extrapolation=0){return (now+extrapolation)*XE+this.offset();},
  /* Own input, stamped like HaxBall at the frame the client is currently predicting. */
  input(seq,id,input,now){const frame=Math.max(snapshotFrame,Math.floor(this.targetFrame(now)),pending.length?pending[pending.length-1].frame:0);pending.push({seq,id,input,frame});if(pending.length>240)pending.splice(0,pending.length-240);return frame;},
  frames(now,extrapolation=0){return Math.max(0,Math.min(MAX_FRAMES,this.targetFrame(now,extrapolation)-snapshotFrame));},
  predict(state,now,extrapolation=0){return extrapolate(state,this.frames(now,extrapolation),pending,snapshotFrame);}
 };}

root.FuckballRenderTiming={TICK,XE,MAX_FRAMES,createClock,extrapolate,localFrames,createPredictor,createSmoother,positions};if(typeof module!=='undefined')module.exports=root.FuckballRenderTiming;
})(typeof globalThis!=='undefined'?globalThis:this);
