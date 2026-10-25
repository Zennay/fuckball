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
 const overview=document.createElement('section');overview.className='connection-session-overview';
 const overviewTitle=document.createElement('strong');overviewTitle.textContent='SESSION HEALTH · LAST 5 MINUTES';
 const overviewDetail=document.createElement('p');overviewDetail.className='connection-session-summary';
 overviewDetail.textContent='Waiting for measured match updates.';
 const overviewActions=document.createElement('div');overviewActions.className='connection-session-actions';
 const exportButton=document.createElement('button');exportButton.type='button';exportButton.textContent='↓ Save private diagnostics';
 const exportMessage=document.createElement('p');exportMessage.setAttribute('role','status');
 exportMessage.setAttribute('aria-live','polite');exportMessage.className='connection-session-export-status';
 overviewActions.append(exportButton);overview.append(overviewTitle,overviewDetail,overviewActions,exportMessage);
 const tips=document.createElement('section');tips.className='connection-details-tips';
 const tipHeading=document.createElement('strong');tipHeading.textContent='WHAT THESE NUMBERS MEAN';
 const tipText=document.createElement('p');
 tipText.textContent='RTT is a measured round trip, not a connection speed. Native server challenge and peer-host transport are different sources and are labeled separately; only peer transport supplies comparable jitter. Old native ping values expire after 6 seconds without a new server roster. A stale match snapshot means the displayed game may be delayed.';
 const tipHint=document.createElement('p');
 tipHint.textContent='If the connection feels unstable, try a wired connection or stable Wi-Fi, close heavy downloads and check whether other devices share your network. These readings are advisory, not a matchmaking decision or a game result.';
 tips.append(tipHeading,tipText,tipHint);
 const footer=document.createElement('p');footer.className='connection-details-privacy';
 footer.textContent='Private to this tab · Last 45 readings in memory · Reset when the connection changes, including rejoining the same room';
 dialog.append(header,state,tiles,chartBox,overview,tips,footer);
 document.body.append(dialog);
 let session=null,history=[],sessionSamples=[],sessionStarted=0;
 let rosterSource=null,rosterFreshAt=0;
 function num(x){return x===null||!Number.isFinite(x)?null:Math.round(x);}
 function percentile(values,fraction){
  if(!values.length)return null;
  const at=(values.length-1)*fraction,low=Math.floor(at),high=Math.ceil(at);
  return Math.round(values[low]+(values[high]-values[low])*(at-low));
 }
 function summary(){
  const latency=sessionSamples.map(x=>x.rttMs).filter(x=>x!==null).sort((a,b)=>a-b);
  const stalled=sessionSamples.filter(x=>x.snapshotAgeMs!==null&&x.snapshotAgeMs>=3500).length;
  const total=sessionSamples.length;
  overviewDetail.textContent=total?(
   latency.length+'/'+total+' ticks with real RTT · median '+(latency.length?percentile(latency,.5)+' ms':'unavailable')+
   ' · P95 '+(latency.length?percentile(latency,.95)+' ms':'unavailable')+
   ' · '+stalled+' stale-snapshot observations (≥3.5 s). '+
   'Sources are labeled per sample; no RTT is inferred from stale data. '+
   'These are observations, NOT packet-loss or gameplay results.'
  ):'Waiting for measured match updates.';
  exportButton.disabled=!total;
 }
 exportButton.addEventListener('click',()=>{
  if(!sessionSamples.length){exportMessage.textContent='No observations to export.';return;}
  // Deliberately excludes room IDs, player names, addresses, tokens and
  // match results; strictly the transient metrics already displayed here.
  const payload={format:'fuckball-private-connection-diagnostics',version:1,
   exportedAt:new Date().toISOString(),sampling:'foreground only, approximately once per second',
   readings:sessionSamples.map(x=>({...x}))};
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='fuckball-private-connection.json';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  exportMessage.textContent='Private metrics saved locally; no upload or room identifier included.';
 });
 // A zero RTT is this game's unset sentinel after disconnect; never display
 // it as a genuine 0ms ping. Measured zero jitter remains a valid reading.
 const validRTT=x=>Number.isFinite(x)&&x>=1&&x<=10000;
 const validJitter=x=>Number.isFinite(x)&&x>=0&&x<=10000;
 function online(){return !replay&&!match.hidden&&(!!serverLink?.room||peerConnected);}
 function sample(){
  const now=performance.now(),native=!!serverLink?.room;
  const roster=native&&serverLink.serverPings instanceof Map?
   serverLink.serverPings:null;
  // Each native latency roster is a new server-issued Map. A ping sample is
  // not "live" forever merely because its last value is still in that Map.
  if(roster!==rosterSource){
   rosterSource=roster;rosterFreshAt=roster?now:0;
  }
  const freshRoster=!!roster&&now-rosterFreshAt<=6000;
  const serverRTT=freshRoster?roster.get(networkPlayerId):null;
  const fromServer=serverRTT!==null&&validRTT(serverRTT);
  // Native server RTT and peer-host RTT have different measurement sources.
  // Never silently substitute an unrelated local transport value as the
  // server's measured ping; if peer-hosting exists label it explicitly.
  const peerTransport=!native||!!serverLink?.net;
  const peerRTT=peerTransport&&validRTT(net.rtt)?net.rtt:null;
  const ms=fromServer?serverRTT:peerRTT;
  const fromPeer=!fromServer&&peerRTT!==null;
  const j=fromPeer&&validJitter(net.jitter)?net.jitter:null;
  const ageMs=net.lastSnapshot>0&&Number.isFinite(net.lastSnapshot)?
   Math.max(0,now-net.lastSnapshot):null;
  const source=fromServer?'fresh server challenge':
   fromPeer?(native?'peer-host transport':'direct-peer transport'):
   native&&roster&&!freshRoster?'server RTT stale — awaiting new sample':
   native?'no current server RTT':'no current direct-peer RTT';
  return {ms,j,ageMs,source};
 }
 function setStatus(s){
  if(s.ageMs!==null&&s.ageMs>=3500)return ['Delayed snapshots','stalled'];
  if(s.ms!==null&&(s.ms>=220||s.j!==null&&s.j>=85))return ['High delay','poor'];
  if(s.ms!==null&&(s.ms>=140||s.j!==null&&s.j>=45))return ['Elevated latency','slow'];
  if(s.ms!==null)return ['Receiving live match updates','good'];
  if(s.source.startsWith('server RTT stale'))
   return ['Server latency sample has expired · waiting for a fresh receipt','unknown'];
  return ['Waiting for reliable RTT data','unknown'];
 }
 function render(s){
  const [label,level]=setStatus(s);
  dialog.dataset.level=level;
  state.textContent=label+' · '+(serverLink?.room?'Native room/server':'Direct peer match');
  rtt.val.textContent=s.ms!==null?Math.round(s.ms)+' ms':'—';
  rtt.extra.textContent=s.source;
  jitter.val.textContent=s.j!==null?Math.round(s.j)+' ms':'—';
  jitter.extra.textContent=s.j!==null?'Measured peer transport variation':
   'No comparable jitter for this RTT source';
  age.val.textContent=s.ageMs!==null?Math.round(s.ageMs)+' ms':'—';
  age.extra.textContent=s.ageMs!==null?'Time since latest match snapshot':'No snapshot timestamp yet';
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
  summary();
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
   session=null;history=[];sessionSamples=[];sessionStarted=0;
   rosterSource=null;rosterFreshAt=0;
   if(dialog.open)dialog.close();
   return;
  }
  // Session identity, not a reusable room code, bounds private observations.
  // A new socket in the *same room* must not inherit old latency history.
  const key=serverLink?.room?serverLink:
   (typeof peer!=='undefined'&&peer?peer:channel);
  if(key!==session){
   history=[];sessionSamples=[];sessionStarted=performance.now();session=key;
   rosterSource=null;rosterFreshAt=0;
  }
  const s=sample();history.push({ms:s.ms});
  sessionSamples.push({elapsedSeconds:Math.max(0,Math.round((performance.now()-sessionStarted)/1000)),
   rttMs:num(s.ms),jitterMs:num(s.j),snapshotAgeMs:num(s.ageMs),source:s.source});
  if(sessionSamples.length>300)sessionSamples.shift();
  if(history.length>45)history.shift();
  if(dialog.open)render(s);
 }
 window.setInterval(tick,1000);
 document.addEventListener('visibilitychange',tick);
 tick();
})();
