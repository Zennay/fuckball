'use strict';
// Honest, local-only connection feedback based on existing actual round-trip
// measurements and authoritative snapshot arrival times. Never gates gameplay.
(function(){
 const match=document.getElementById('matchView');
 if(!match||!document.getElementById('hudPing'))return;
 const panel=document.createElement('aside');
 panel.className='connection-warning';panel.hidden=true;
 panel.setAttribute('aria-label','Match connection quality');
 panel.setAttribute('role','status');panel.setAttribute('aria-live','polite');
 const heading=document.createElement('strong');
 const description=document.createElement('p');
 const metric=document.createElement('span');metric.className='connection-warning-metric';
 metric.setAttribute('aria-hidden','true');
 const dismiss=document.createElement('button');dismiss.type='button';
 dismiss.textContent='Hide';dismiss.setAttribute('aria-label','Hide this connection warning');
 panel.append(heading,description,metric,dismiss);
 const hud=document.getElementById('hudCorner');
 (hud?.parentElement||match).append(panel);
 let current='clear',dismissed=null,session=null,roster=null,rosterFreshAt=0;
 function clear(){
  panel.hidden=true;current='clear';dismissed=null;
 }
 dismiss.addEventListener('click',()=>{
  dismissed=current;panel.hidden=true;
 });
 const healthy=ms=>Number.isFinite(ms)&&ms>=1&&ms<=10000;
 const readings=()=>{
  // Server latencyRoster produces a fresh Map on every server-issued sample.
  // Its previous values are not valid indefinitely: the connection details
  // pane also expires old native server challenge receipts after six seconds.
  const native=!!serverLink?.room,now=performance.now();
  const sampleMap=native&&serverLink.serverPings instanceof Map?
   serverLink.serverPings:null;
  if(sampleMap!==roster){roster=sampleMap;rosterFreshAt=roster?now:0;}
  const fresh=!!roster&&now-rosterFreshAt<=6000;
  const nativeSample=fresh?roster.get(networkPlayerId):null;
  const ms=native?(healthy(nativeSample)?nativeSample:null):
   (healthy(net.rtt)?net.rtt:null);
  const source=native?'server':'peer';
  const jitter=!native&&healthy(net.jitter)?net.jitter:null;
  // A stopped/paused round is intentionally not sending match snapshots.
  // Do not label ordinary lobby or pause as an interrupted connection.
  const running=native?serverLink.roomState?.started===true&&
   serverLink.roomState?.paused!==true:started&&!paused;
  const recent=running&&net.lastSnapshot>0&&Number.isFinite(net.lastSnapshot)?
   Math.max(0,now-net.lastSnapshot):null;
  return {ms,source,jitter,recent};
 };
 function refresh(){
  const native=!!serverLink?.room;
  if(document.hidden||match.hidden||replay||(!native&&!peerConnected)){
   clear();session=null;roster=null;rosterFreshAt=0;return;
  }
  // A room code can be reused by a new socket/player. Warnings dismissed in
  // the previous session must not hide a real new-session warning.
  const key=native?serverLink:
   (typeof peer!=='undefined'&&peer?peer:channel);
  if(key!==session){session=key;clear();roster=null;rosterFreshAt=0;}
  const {ms,source,jitter,recent}=readings();
  panel.dataset.transport=native?'native':'peer';
  let severity='clear';
  if(recent!==null&&recent>3500)severity='stalled';
  else if(ms!==null&&(ms>=220||jitter!==null&&jitter>=85))severity='poor';
  else if(ms!==null&&(ms>=140||jitter!==null&&jitter>=45))severity='slow';
  // Small hysteresis stops a warning flickering at a threshold.
  if(current==='poor'&&severity==='slow'&&ms!==null&&ms>=195)severity='poor';
  if(current==='slow'&&severity==='clear'&&ms!==null&&ms>=125)severity='slow';
  if(current!==severity){
   current=severity;dismissed=null;
   panel.dataset.level=severity;
   if(severity==='stalled'){
    heading.textContent='GAME UPDATES DELAYED';
    description.textContent='No recent match snapshot. Your connection may be interrupted; avoid relying on the displayed position.';
   }else if(severity==='poor'){
    heading.textContent='POOR CONNECTION';
    description.textContent='High measured latency or jitter can delay your actions and cause visible corrections.';
   }else if(severity==='slow'){
    heading.textContent='SLOW CONNECTION';
    description.textContent='Network latency is elevated. Movement and kicks may feel less responsive.';
   }
  }
  if(severity==='clear'){panel.hidden=true;metric.textContent='';return;}
  const pieces=[];
  if(ms!==null)pieces.push(Math.round(ms)+' ms '+(source==='server'?'server-challenge RTT':'direct-peer RTT'));
  if(jitter!==null)pieces.push(Math.round(jitter)+' ms jitter');
  if(recent!==null&&recent>3500)pieces.push('last update '+(recent/1000).toFixed(1)+'s ago');
  metric.textContent=pieces.join(' · ')||'Connection recovering';
  panel.hidden=dismissed===severity;
 }
 // A very cheap passive UI observer. No additional pings, permissions, API
 // requests, timing changes, server writes, or input mutations.
 const interval=setInterval(refresh,1100);
 document.addEventListener('visibilitychange',refresh);
 window.addEventListener('online',refresh);
 window.addEventListener('offline',refresh);
 refresh();
})();
