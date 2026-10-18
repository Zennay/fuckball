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
 let current='clear',dismissed=null,latestRoom=null;
 function clear(){
  panel.hidden=true;current='clear';dismissed=null;
 }
 dismiss.addEventListener('click',()=>{
  dismissed=current;panel.hidden=true;
 });
 const healthy=ms=>Number.isFinite(ms)&&ms>=1&&ms<=10000;
 const readings=()=>{
  // Prefer server-issued challenge/response RTT. Never accept self-reported
  // roster latency as an authority or fabricate a reading from "online".
  const native=serverLink?.room&&serverLink.serverPings instanceof Map;
  const serverSample=native?serverLink.serverPings.get(networkPlayerId):undefined;
  const ms=healthy(serverSample)?serverSample:healthy(net.rtt)?net.rtt:null;
  const source=healthy(serverSample)?'server':'connection';
  const jitter=healthy(net.jitter)?net.jitter:null;
  const recent=net.lastSnapshot>0&&Number.isFinite(net.lastSnapshot)
   ?Math.max(0,performance.now()-net.lastSnapshot):null;
  return {ms,source,jitter,recent};
 };
 function refresh(){
  if(document.hidden||match.hidden||replay||!peerConnected){
   clear();latestRoom=null;return;
  }
  const roomId=serverLink?.room||'peer';
  if(roomId!==latestRoom){latestRoom=roomId;clear();}
  const {ms,source,jitter,recent}=readings();
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
  if(ms!==null)pieces.push(Math.round(ms)+' ms '+(source==='server'?'server RTT':'measured RTT'));
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
