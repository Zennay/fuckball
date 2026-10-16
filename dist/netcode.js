/* Netcode v3 (see docs/netcode-plan.md). Shared by the browser and the Node room server.
   - Input timeline (host): inputs are stamped with the host frame they are meant for and applied
     exactly at that frame, so jitter no longer moves your own player and a one-frame kick tap cannot
     be overwritten before it is simulated. Late inputs are applied at the next frame and counted.
   - Lead controller (client): keeps the client just far enough ahead of the host that inputs arrive
     in time, by nudging the client clock (time dilation, a few percent) from host slack reports.
   - Smoother (client): when a snapshot corrects the prediction, the error is kept as a visual offset
     that decays in tens of milliseconds instead of teleporting. Only the rendered copy is touched.
   - Host election (peer hosting): picks the host whose worst ping to the players is lowest, with
     hysteresis so the host only moves for a real, lasting improvement.
   Nothing here changes the physics engine or its parameters. */
(function(root){'use strict';
const XE=.06,KICK=16,FUTURE=60;

/* ---------- host side ---------- */
function createInputTimeline(){
 const changes=[];let lastSeq=0,current=0,appliedSeq=0,slack=Infinity,late=0,total=0,lastFrame=-Infinity,lastValue=0,lastShifted=false;
 return{
  get current(){return current;},get appliedSeq(){return appliedSeq;},get lastSeq(){return lastSeq;},get late(){return late;},get total(){return total;},
  /* list: [[seq,frame,value],...] in any order, duplicates allowed (redundant resends).
     nextFrame: the frame the host simulates next; hostTime: host time in frames (fractional). */
  receive(list,nextFrame,hostTime=nextFrame){
   if(!Array.isArray(list))return 0;let accepted=0;
   const fresh=list.filter(c=>Array.isArray(c)&&Number.isInteger(c[0])&&c[0]>lastSeq&&c[0]<=0xffffffff&&Number.isInteger(c[1])&&Number.isInteger(c[2])&&c[2]>=0&&c[2]<=31).sort((a,b)=>a[0]-b[0]);
   for(const [seq,stamped,value]of fresh){
    if(seq<=lastSeq)continue;lastSeq=seq;total++;accepted++;
    const s=stamped-hostTime;if(s<slack)slack=s;
    let frame=Math.min(stamped,nextFrame+FUTURE),wasLate=false;if(frame<nextFrame){frame=nextFrame;late++;wasLate=true;}
    // Never reorder or merge: late changes (e.g. a burst after a TCP stall) are replayed one per frame
    // after earlier ones, and a kick released in the frame it was pressed is held for that frame.
    if(frame<lastFrame||(wasLate||lastShifted)&&frame===lastFrame)frame=wasLate||lastShifted?lastFrame+1:lastFrame;
    if(frame===lastFrame&&(lastValue&KICK)&&!(value&KICK))frame++;lastShifted=frame!==stamped;lastFrame=frame;lastValue=value;
    let i=changes.length;while(i>0&&changes[i-1].frame>frame)i--;changes.splice(i,0,{seq,frame,value});
   }
   return accepted;
  },
  /* Input for the step that simulates `frame`; consumes changes stamped at or before it. */
  valueAt(frame){while(changes.length&&changes[0].frame<=frame){const c=changes.shift();current=c.value;appliedSeq=c.seq;}return current;},
  /* Lowest slack (stamped frame − host time) since the last call, or NaN when nothing arrived. */
  takeSlack(){const s=slack;slack=Infinity;return Number.isFinite(s)?s:NaN;},
  reset(value=0){changes.length=0;current=value;slack=Infinity;lastFrame=-Infinity;lastValue=value;lastShifted=false;}
 };}

/* ---------- client side ---------- */
function percentile(values,p){if(!values.length)return NaN;const v=[...values].sort((a,b)=>a-b);return v[Math.min(v.length-1,Math.max(0,Math.floor(p*(v.length-1))))];}
/* Keeps a low percentile (5th) of host slack near `margin` frames (an input is on time while slack ≥ 0). Speeds the client clock up by at most
   `up` and slows it by at most `down` (fractions of real time), so changes are never visible as jumps. */
function createLeadController({margin=.6,quantile=.05,initial=1.5,min=0,max=15,up=.05,down=.02,span=3000,deadband=.2}={}){
 const samples=[];let lead=initial,last=NaN;
 const expire=now=>{while(samples.length&&now-samples[0].at>span)samples.shift();};
 return{
  get lead(){return lead;},get samples(){return samples.length;},
  /* slack: frames an input arrived before it was needed (negative = late), measured with the lead at that time. */
  feed(slack,now){if(!Number.isFinite(slack)||!Number.isFinite(now))return;samples.push({at:now,v:Math.max(-4,Math.min(30,slack))});if(samples.length>240)samples.shift();},
  /* now: ms. Returns the current lead in frames. */
  update(now){const dt=Number.isFinite(last)?Math.min(250,Math.max(0,now-last))*XE:0;last=now;expire(now);if(samples.length<6||!dt)return lead;
   const low=percentile(samples.map(s=>s.v),quantile),err=margin-low;if(Math.abs(err)<deadband)return lead;
   const step=Math.max(-down*dt,Math.min(up*dt,err)),next=Math.max(min,Math.min(max,lead+step)),applied=next-lead;
   // Reports already in flight were measured with the old lead: shift them so the change is not counted twice.
   if(applied)for(const s of samples)s.v+=applied;lead=next;return lead;},
  reset(value=initial){samples.length=0;lead=value;last=NaN;}
 };}

/* Visual correction smoothing. correct(before, after): the same instant predicted from the old and the
   new snapshot. apply(state, now): adds the decaying offsets to a rendered COPY of the state. */
function createSmoother({ball=45,player=80,own=40,snap=90}={}){
 let offsets=[],last=NaN,count=-1;
 const discs=s=>s?.gameState?.physicsState?.discs||[];
 function tau(state,i,ownId){if(i===0)return ball;const p=state.players?.find(p=>p.disc&&discs(state)[i]===p.disc);return p&&p.id===ownId?own:player;}
 return{
  get active(){return offsets.some(Boolean);},
  correct(before,after){if(!offsets.some(Boolean))last=NaN;const a=discs(before),b=discs(after);if(a.length!==b.length||a.length!==count){offsets=[];count=b.length;if(a.length!==b.length)return;}
   for(let i=0;i<a.length;i++){const o=offsets[i]||{x:0,y:0};o.x+=a[i].pos.x-b[i].pos.x;o.y+=a[i].pos.y-b[i].pos.y;offsets[i]=Math.hypot(o.x,o.y)>snap||Math.hypot(o.x,o.y)<1e-3?null:o;}},
  apply(state,now,ownId){const d=discs(state);if(d.length!==count){offsets=[];count=d.length;last=now;return state;}
   const dt=Number.isFinite(last)?Math.max(0,Math.min(250,now-last)):0;last=now;
   for(let i=0;i<d.length;i++){const o=offsets[i];if(!o)continue;const k=Math.exp(-dt/tau(state,i,ownId));o.x*=k;o.y*=k;if(Math.hypot(o.x,o.y)<.05){offsets[i]=null;continue;}d[i].pos.x+=o.x;d[i].pos.y+=o.y;}
   return state;},
  reset(){offsets=[];last=NaN;count=-1;}
 };}

/* ---------- peer hosting ---------- */
/* rtt: Map/object id -> Map/object id -> ms (symmetric measurements, missing = unreachable).
   players: ids that play; candidates: ids that may host (players and/or servers).
   Cost of a host = its worst round trip to any player (the host itself plays at 0). */
function hostCost(rtt,host,players){let worst=0;for(const p of players){if(p===host)continue;const v=get(rtt,host,p)??get(rtt,p,host);if(!Number.isFinite(v))return Infinity;if(v>worst)worst=v;}return worst;}
function get(m,a,b){const row=m instanceof Map?m.get(a):m?.[a];return row instanceof Map?row.get(b):row?.[b];}
/* Hysteresis: switch only when the best candidate beats the current host by `minGain` ms and `ratio`,
   continuously for `hold` ms (or immediately when the current host is gone/unreachable). */
function createElection({minGain=25,ratio=.85,hold=8000}={}){
 let better=null,since=0;
 return{
  decide({rtt,players,candidates,current,now}){
   let best=null,bestCost=Infinity;for(const c of candidates){const cost=hostCost(rtt,c,players);if(cost<bestCost||cost===bestCost&&c===current){best=c;bestCost=cost;}}
   const currentCost=candidates.includes(current)?hostCost(rtt,current,players):Infinity;
   if(best==null)return{host:current,switch:false,cost:currentCost};
   if(!Number.isFinite(currentCost))return{host:best,switch:best!==current,cost:bestCost,reason:'host unavailable'};
   if(best===current||!(bestCost<=currentCost-minGain&&bestCost<=currentCost*ratio)){better=null;return{host:current,switch:false,cost:currentCost};}
   if(better!==best){better=best;since=now;}
   if(now-since<hold)return{host:current,switch:false,cost:currentCost,pending:best};
   better=null;return{host:best,switch:true,cost:bestCost,from:currentCost,reason:'lower worst ping'};
  },
  reset(){better=null;}
 };}

root.FuckballNetcode={XE,KICK,createInputTimeline,createLeadController,createSmoother,percentile,hostCost,createElection};
if(typeof module!=='undefined')module.exports=root.FuckballNetcode;
})(typeof globalThis!=='undefined'?globalThis:this);
