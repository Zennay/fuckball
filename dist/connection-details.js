'use strict';
// Player-facing connection transparency from EXISTING actual native/peer RTT,
// jitter and snapshot telemetry. No new pings, tests, uploads or netcode writes.
(function(){
 const match=document.getElementById('matchView');
 const hud=document.querySelector('#hudCorner .hud-net');
 if(!match||!hud||!window.HTMLDialogElement)return;
 const button=document.createElement('button');button.type='button';
 button.className='connection-details-trigger';
 button.textContent='Connection ▴';
 button.setAttribute('aria-label','Open current connection details');
 button.hidden=true;
 hud.append(button);
 const dialog=document.createElement('dialog');dialog.className='connection-details-dialog';
 dialog.setAttribute('aria-label','Live connection details');
 const header=document.createElement('header');header.className='connection-details-header';
 const heading=document.createElement('div');
 const title=document.createElement('h2');title.textContent='CONNECTION DETAILS.';
 const subtitle=document.createElement('p');subtitle.textContent='Live readings from your current match. No extra traffic is generated and nothing is saved.';
 heading.append(title,subtitle);
 const close=document.createElement('button');close.type='button';
 close.setAttribute('aria-label','Close connection details');close.textContent='✕';
 header.append(heading,close);
 const state=document.createElement('p');state.className='connection-details-state';
 state.setAttribute('role','status');state.setAttribute('aria-live','polite');
 const tiles=document.createElement('div');tiles.className='connection-details-metrics';
 const rttTile=document.createElement('div'), jitterTile=document.createElement('div'), ageTile=document.createElement('div');
 function tile(node,label){
  node.className='connection-details-tile';
  const name=document.createElement('span');name.textContent=label;
  const val=document.createElement('strong');val.textContent='—';
  const extra=document.createElement('small');
  node.append(name,val,extra);
  return {val,extra};
 }
 const rtt=tile(rttTile,'ROUND-TRIP TIME');
 const jitter=tile(jitterTile,'JITTER');
 const age=tile(ageTile,'LATEST SNAPSHOT');
 tiles.append(rttTile,jitterTile,ageTile);
 const chartBox=document.createElement('section');chartBox.className='connection-details-chart-box';
 chartBox.setAttribute('aria-label','Last 45 seconds of measured round-trip time');
 const chartTitle=document.createElement('div');chartTitle.className='connection-details-chart-heading';
 const chartHeading=document.createElement('strong');chartHeading.textContent='LAST 45 READINGS';
 const chartCaption=document.createElement('span');chartCaption.textContent='Existing RTT samples · 1 per second';
 chartTitle.append(chartHeading,chartCaption);
 const chart=document.createElement('div');chart.className='connection-details-chart';
 chart.setAttribute('role','img');chart.setAttribute('aria-label','No latency samples yet');
 chartBox.append(chartTitle,chart);
 const tips=document.createElement('section');tips.className='connection-details-tips';
 const tipHeading=document.createElement('strong');tipHeading.textContent='WHAT THESE NUMBERS MEAN';
 const tipText=document.createElement('p');
 tipText.textContent='RTT is the round trip of an actual measured message; lower is generally better. Jitter is variation between measurements. A stale snapshot means the displayed game state may be delayed. Network route, Wi-Fi and other device traffic can affect all three.';
 const tipHint=document.createElement('p');
 tipHint.textContent='If the connection feels unstable, try a wired connection or stable Wi-Fi, close heavy downloads and check whether other devices share your network. These readings are advisory, not a matchmaking decision or a game result.';
 tips.append(tipHeading,tipText,tipHint);
 const footer=document.createElement('p');footer.className='connection-details-privacy';
 footer.textContent='Private to this tab · Last 45 measurements in memory only · Cleared on disconnect/room switch';
 dialog.append(header,state,tiles,chartBox,tips,footer);
 document.body.append(dialog);
 let session=null,history=[];
 const valid=x=>Number.isFinite(x)&&x>=1&&x<=10000;
 function online(){return !replay&&!match.hidden&&(!!serverLink?.room||peerConnected);}
 function sample(){
  const native=!!serverLink?.room&&serverLink.serverPings instanceof Map;
  const serverRTT=native?serverLink.serverPings.get(networkPlayerId):undefined;
  const fromServer=valid(serverRTT);
  const ms=fromServer?serverRTT:valid(net.rtt)?net.rtt:null;
  // Peer-net jitter is not the jitter of server-issued ping samples.
  const j=valid(net.jitter)?net.jitter:null;
  const ageMs=net.lastSnapshot>0&&Number.isFinite(net.lastSnapshot)?
   Math.max(0,performance.now()-net.lastSnapshot):null;
  return {ms,j,ageMs,source:fromServer?'server challenge':valid(net.rtt)?'peer/direct sample':'unavailable'};
 }
 function setStatus(s){
  if(s.ageMs!==null&&s.ageMs>=3500)return ['Delayed snapshots','stalled'];
  if(s.ms!==null&&(s.ms>=220||s.j!==null&&s.j>=85))return ['High delay','poor'];
  if(s.ms!==null&&(s.ms>=140||s.j!==null&&s.j>=45))return ['Elevated latency','slow'];
  if(s.ms!==null)return ['Receiving live match updates','good'];
  return ['Waiting for reliable RTT data','unknown'];
 }
 function render(s){
  const [label,level]=setStatus(s);
  dialog.dataset.level=level;
  state.textContent=label+' · '+(serverLink?.room?'Native room/server':'Direct peer match');
  rtt.val.textContent=s.ms!==null?Math.round(s.ms)+' ms':'—';
  rtt.extra.textContent=s.source;
  jitter.val.textContent=s.j!==null?Math.round(s.j)+' ms':'—';
  jitter.extra.textContent=s.j!==null?'Existing network variation':'No jitter measurement';
  age.val.textContent=s.ageMs!==null?Math.round(s.ageMs)+' ms':'—';
  age.extra.textContent=s.ageMs!==null?'Since last authoritative update':'No snapshot timestamp yet';
  chart.replaceChildren();
  let good=0;
  for(const x of history){
   const bar=document.createElement('span');bar.className='connection-details-bar';
   if(x.ms===null){
    bar.classList.add('missing');bar.style.height='3%';
    bar.title='RTT not available';
   }else{
    good++;bar.style.height=Math.max(5,Math.min(100,Math.round(x.ms/400*100)))+'%';
    bar.title=Math.round(x.ms)+' ms RTT';
    if(x.ms>=220)bar.dataset.level='poor';else if(x.ms>=140)bar.dataset.level='slow';
   }
   bar.setAttribute('aria-hidden','true');chart.append(bar);
  }
  chart.setAttribute('aria-label',good?'Actual RTT ranged from '+Math.round(Math.min(...history.filter(x=>x.ms!==null).map(x=>x.ms)))+
   ' to '+Math.round(Math.max(...history.filter(x=>x.ms!==null).map(x=>x.ms)))+
   ' milliseconds over '+history.length+' recent samples.':'No reliable RTT samples yet.');
 }
 button.onclick=()=>{
  if(!online())return;
  if(!dialog.open)dialog.showModal();
  render(sample());
 };
 close.onclick=()=>dialog.close();
 dialog.addEventListener('keydown',event=>{
  if(event.key==='Escape')event.stopPropagation(); // preserve native dialog close
 });
 dialog.addEventListener('close',()=>{if(!match.hidden)button.focus();});
 function tick(){
  const active=online()&&!document.hidden;
  button.hidden=!active;
  if(!active){
   session=null;history=[];
   if(dialog.open)dialog.close();
   return;
  }
  const key=serverLink?.room?'server:'+serverLink.room:'direct-peer';
  if(key!==session){history=[];session=key;}
  const s=sample();history.push({ms:s.ms});
  if(history.length>45)history.shift();
  if(dialog.open)render(s);
 }
 window.setInterval(tick,1000);
 document.addEventListener('visibilitychange',tick);
 tick();
})();
