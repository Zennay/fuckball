'use strict';
// Home must never claim matchmaking is live without a recent, same-origin,
// human-only native queue response. Reuses existing Quick Match observation;
// no polling, endpoints, auto join or ready check are introduced here.
(function(){
 const badge=document.querySelector('#homeView .season-line .status-pill');
 if(!badge)return;
 badge.setAttribute('role','status');badge.setAttribute('aria-live','polite');
 let observed=null;
 const MODES=['1v1','2v2','3v3','4v4'];
 const FRESH_MS=25000;
 function label(value){if(badge.textContent!==value)badge.textContent=value;}
 function selectedServer(){
  const address=document.getElementById('serverAddress')?.value.trim();
  if(!address)return false;
  try{
   const url=new URL(address);
   const expected=location.protocol==='https:'?'wss:':'ws:';
   return url.protocol===expected&&url.host===location.host&&
    url.pathname==='/ws'&&!url.username&&!url.password&&
    !url.search&&!url.hash;
  }catch{return false;}
 }
 function render(){
  const age=observed?performance.now()-observed.observedMono:Infinity;
  const live=observed&&age>=0&&age<=FRESH_MS&&
   observed.server===location.host&&selectedServer()&&navigator.onLine!==false;
  if(live){
   const total=observed.waiting;
   label('● HUMAN QUEUES VERIFIED · '+total+' WAITING');
   badge.dataset.state='live';
   badge.title='Fresh '+MODES.join(', ')+' human-only casual queue snapshot from the selected game server ('+
    location.host+'). '+total+' humans waiting. This does not promise a match or a wait time; every person must accept.';
  }else if(navigator.onLine===false){
   observed=null;label('● BROWSER OFFLINE · SOLO AVAILABLE');badge.dataset.state='offline';
   badge.title='Browser reports no network connection. Local practice is still available.';
  }else if(!selectedServer()){
   observed=null;label('● CHOOSE LIVE GAME SERVER');
   badge.dataset.state='unknown';
   badge.title='The configured multiplayer WebSocket server is not this website’s native queue server. No cross-server queue claims are shown.';
  }else{
   observed=null;label('● HUMAN QUEUE STATUS UNVERIFIED');
   badge.dataset.state='unknown';
   badge.title='This page has no fresh verified live human matchmaking snapshot. Queue status is not a promise of availability.';
  }
 }
 window.addEventListener('fuckball:queue-availability',event=>{
  const data=event.detail;
  if(!data||data.humanOnly!==true||data.ranked!==false||
   data.server!==location.host||!selectedServer()||
   !Number.isSafeInteger(data.at)||!data.modes||
   !(Number.isFinite(data.observedMono)?
     performance.now()-data.observedMono>=0&&performance.now()-data.observedMono<=5000:
     data.at<=Date.now()+2000&&Date.now()-data.at<=FRESH_MS))return;
  let waiting=0;
  for(const mode of MODES){
   const row=data.modes[mode];
   if(!row||row.needed!==Number(mode[0])*2||
    ![row.waiting,row.confirming].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=128))return;
   waiting+=row.waiting;
  }
  observed={at:data.at,observedMono:Number.isFinite(data.observedMono)?
   data.observedMono:performance.now(),server:data.server,waiting};
  render();
 });
 window.addEventListener('fuckball:queue-unavailable',()=>{observed=null;render();});
 const server=document.getElementById('serverAddress');
 server?.addEventListener('input',()=>{observed=null;render();});
 server?.addEventListener('change',()=>{observed=null;render();});
 window.addEventListener('online',render);
 window.addEventListener('offline',render);
 // Only a small local freshness clock; the original Quick Match component
 // is exclusively responsible for network requests and admission rules.
 const timer=setInterval(()=>{if(!document.hidden)render();},5000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 render();
})();