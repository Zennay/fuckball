'use strict';
// Real player-facing FPS history from the application's existing painted-FPS
// counter. No synthetic benchmark, input simulation, game tick changes, or
// new network telemetry.
(function(){
 const match=document.getElementById('matchView');
 const corner=match?.querySelector('.hud-top-right');
 const nativeFPS=document.getElementById('fpsValue');
 if(!match||!corner||!nativeFPS)return;
 const make=(tag,text,cls)=>{const e=document.createElement(tag);
  if(text!==undefined&&text!==null)e.textContent=String(text);
  if(cls)e.className=cls;return e;};
 const open=make('button','▥ PERF','hud-button frame-meter-trigger');
 open.type='button';open.setAttribute('aria-label','Show local frame performance history');
 open.setAttribute('aria-expanded','false');
 corner.insertBefore(open,corner.firstChild);
 const panel=make('section',null,'frame-meter-panel');
 panel.hidden=true;panel.setAttribute('aria-label','Live local rendered frame performance');
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');
 const top=make('header',null,'frame-meter-head');
 const title=make('div');
 title.append(make('span','LOCAL RENDER DIAGNOSTICS','frame-meter-eyebrow'),
  make('h2','FRAME PERFORMANCE.'));
 const close=make('button','✕');close.type='button';close.setAttribute('aria-label','Close frame performance panel');
 top.append(title,close);
 const intro=make('p','Uses the FPS value this game already renders. Observes up to 90 recent foreground seconds; no extra benchmark, server ping, hardware profiling or uploads. FPS is display performance, not the native 60 Hz physics tick.');
 const targetWrap=make('label','Your display FPS goal'),target=make('select');
 target.setAttribute('aria-label','FPS target used only for on-screen comparisons');
 for(const fps of [60,120,144,165,240])target.add(new Option(fps+' FPS',String(fps)));
 target.value='144';targetWrap.append(target);
 const stats=make('div',null,'frame-meter-stats');
 const median=make('strong','—'),low=make('strong','—'),count=make('strong','0');
 for(const [label,value]of[['RECENT MEDIAN FPS',median],['LOW-END P10 FPS',low],['VISIBLE SAMPLES',count]]){
  const tile=make('div',null,'frame-meter-tile');tile.append(make('span',label),value);stats.append(tile);
 }
 const gauge=make('p','Waiting for native rendered FPS samples.','frame-meter-condition');
 gauge.setAttribute('role','status');gauge.setAttribute('aria-live','polite');
 const bars=make('div',null,'frame-meter-bars');bars.setAttribute('role','img');
 bars.setAttribute('aria-label','No observed FPS readings yet');
 const legend=make('p','Each bar is one actual foreground FPS reading. Navigation, paused games and hidden tabs are not measured; gaps are not synthetic samples.');
 const gaps=make('p','No observation gaps recorded.','frame-meter-gaps');
 gaps.setAttribute('role','status');
 gaps.setAttribute('aria-live','polite');
 const actions=make('div',null,'frame-meter-actions');
 const fast=make('button','Apply native Performance preset');
 const save=make('button','↓ Save private FPS CSV');
 const reset=make('button','Clear this local view');
 for(const button of [fast,save,reset]){button.type='button';actions.append(button);}
 const notice=make('p','', 'frame-meter-notice');
 notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 panel.append(top,intro,targetWrap,stats,gauge,bars,legend,gaps,actions,notice);
 match.append(panel);
 let samples=[],second=0,wasVisible=false,sessionKey='',sessionStartedAt=0;
 let awayAt=0,gapCount=0,gapSeconds=0,lastGameElapsed=null;
 const games=document.getElementById('gamesView');
 const evidence=games?make('aside',null,'frame-meter-evidence'):null;
 const evidenceText=evidence?make('div',null,'frame-meter-evidence-copy'):null;
 const evidenceTitle=evidence?make('strong','MATCH FPS EVIDENCE · PRIVATE'):null;
 const evidenceDetail=evidence?make('p'):null;
 const evidenceActions=evidence?make('div',null,'frame-meter-evidence-actions'):null;
 const evidenceReturn=evidence?make('button','↗ Return to match'):null;
 const evidenceSave=evidence?make('button','↓ Save measured FPS CSV'):null;
 const evidenceClear=evidence?make('button','Clear readings'):null;
 if(evidence){
  evidence.hidden=true;
  evidence.setAttribute('aria-label','Local observed FPS evidence from this match');
  evidenceText.append(evidenceTitle,evidenceDetail);
  evidenceActions.append(evidenceReturn,evidenceSave,evidenceClear);
  evidence.append(evidenceText,evidenceActions);
  if(typeof games.prepend==='function')games.prepend(evidence);
  else games.append(evidence);
 }
 function matchKey(){
  return serverLink?.room?'native:'+serverLink.room:
   typeof peerConnected!=='undefined'&&peerConnected?'direct-peer':
   typeof replay!=='undefined'&&replay?'replay':'local';
 }
 function matchClock(){
  const elapsed=typeof replay!=='undefined'&&replay?
   replay.gameState?.timeElapsed:room?.gameState?.timeElapsed;
  return Number.isFinite(elapsed)&&elapsed>=0?elapsed:null;
 }
 function updateEvidence(){
  if(!evidence)return;
  evidence.hidden=!samples.length;
  if(evidence.hidden)return;
  const values=samples.map(x=>x.fps).sort((a,b)=>a-b);
  evidenceDetail.textContent=samples.length+' actual foreground FPS readings · median '+
   quantile(values,.5)+' FPS · low-end P10 '+quantile(values,.1)+' FPS. '+
   gapCount+' unmeasured period'+(gapCount===1?'':'s')+
   ' (about '+gapSeconds+'s away). Only locally observed data; not a device benchmark or official match evidence.';
 }
 evidenceReturn?.addEventListener('click',()=>document.getElementById('tabPlay')?.click());
 evidenceSave?.addEventListener('click',()=>save.click());
 evidenceClear?.addEventListener('click',()=>{clearData();notice.textContent='Private FPS observations cleared.';});
 const quantile=(sorted,p)=>{
  if(!sorted.length)return null;
  const at=(sorted.length-1)*p,lo=Math.floor(at),hi=Math.ceil(at);
  return Math.round(sorted[lo]+(sorted[hi]-sorted[lo])*(at-lo));
 };
 function clearData(){
  samples=[];second=0;sessionStartedAt=0;awayAt=0;gapCount=0;gapSeconds=0;lastGameElapsed=null;
  median.textContent=low.textContent='—';count.textContent='0';
  bars.replaceChildren();gauge.textContent='Waiting for native rendered FPS samples.';
  bars.setAttribute('aria-label','No observed FPS readings yet');
  save.disabled=true;gaps.textContent='No observation gaps recorded.';
  updateEvidence();
 }
 function render(){
  const values=samples.map(x=>x.fps),sorted=values.slice().sort((a,b)=>a-b);
  const m=quantile(sorted,.5),p10=quantile(sorted,.1),goal=Number(target.value);
  median.textContent=m??'—';low.textContent=p10??'—';count.textContent=String(samples.length);
  gaps.textContent=gapCount?
   gapCount+' unmeasured period'+(gapCount===1?'':'s')+
    ' · approximately '+gapSeconds+'s skipped while playing view was unavailable. No FPS values inferred.':
   'No unmeasured navigation or background periods in this sample window.';
  updateEvidence();
  if(!values.length){gauge.textContent='Waiting for real foreground FPS readings.';bars.replaceChildren();save.disabled=true;return;}
  gauge.textContent=m>=goal*.9?'Rendering near your '+goal+' FPS goal':
   'Rendering below your selected '+goal+' FPS goal · use native Performance or lower FPS target';
  // Keep this display small: repaint the history only if the player opened
  // PERF; sample collection itself never causes a chart repaint.
  bars.replaceChildren();
  const max=Math.max(goal,Math.max(...values),30);
  for(const sample of samples){
   const bar=make('span',null,'frame-meter-bar');
   bar.style.height=Math.max(3,Math.min(100,100*sample.fps/max))+'%';
   bar.title=sample.fps+' observed FPS · '+sample.t+'s since first reading (gaps unmeasured)';
   bar.setAttribute('aria-hidden','true');bars.append(bar);
  }
  bars.setAttribute('aria-label',samples.length+' actual foreground FPS samples, median '+m+
   ', tenth percentile '+p10+' FPS, minimum '+Math.min(...values)+', maximum '+Math.max(...values)+'.');
  save.disabled=false;
 }
 function capture(){
  const visible=!match.hidden&&!document.hidden&&document.visibilityState==='visible';
  const active=typeof started==='undefined'||started===true||
   typeof replay!=='undefined'&&!!replay;
  const observing=visible&&active&&!(typeof paused!=='undefined'&&paused===true);
  open.hidden=!visible;
  if(!observing){
   if(wasVisible){wasVisible=false;if(samples.length)awayAt=Date.now();}
   if(!visible&&!panel.hidden)toggle(false);
   return;
  }
  const key=matchKey(),elapsed=matchClock();
  // Keep only one active local/peer/native/replay session. If the native
  // room or playback changes, or a new round resets the clock, never blend
  // unrelated FPS evidence into one session.
  if(sessionKey!==key||lastGameElapsed!==null&&elapsed!==null&&
     elapsed+2<lastGameElapsed){
   clearData();
   sessionKey=key;
  }
  if(!wasVisible){
   wasVisible=true;
   if(awayAt&&samples.length){
    gapCount++;
    gapSeconds+=Math.max(0,Math.round((Date.now()-awayAt)/1000));
   }
   awayAt=0;
  }
  const raw=nativeFPS.textContent?.trim()||'';
  if(!/^\d{1,4}$/.test(raw))return;
  const fps=Number(raw);
  if(!Number.isSafeInteger(fps)||fps<1||fps>2000)return;
  const now=Date.now();
  if(!sessionStartedAt)sessionStartedAt=now;
  samples.push({t:Math.round((now-sessionStartedAt)/1000),fps});
  second++;
  if(elapsed!==null)lastGameElapsed=elapsed;
  if(samples.length>90)samples.shift();
  if(!panel.hidden)render();
  else updateEvidence();
 }
 function toggle(show){
  panel.hidden=!show;open.setAttribute('aria-expanded',String(show));
  if(show){render();close.focus({preventScroll:true});}
  else open.focus({preventScroll:true});
 }
 open.onclick=()=>toggle(panel.hidden);
 close.onclick=()=>toggle(false);
 panel.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.stopPropagation();toggle(false);}
 });
 target.onchange=render;
 fast.onclick=()=>{
  const preset=[...document.querySelectorAll('.match-view-preset-card')].find(x=>
   x.querySelector('strong')?.textContent==='PERFORMANCE');
  if(!preset){notice.textContent='Open native Settings and select Performance rendering manually.';return;}
  preset.click();
  notice.textContent='Native Performance profile requested through existing game controls; compare subsequent real FPS readings.';
 };
 reset.onclick=()=>{clearData();notice.textContent='Only this browser tab’s temporary readings were cleared.';};
 save.onclick=()=>{
  if(!samples.length){notice.textContent='No real FPS measurements to export.';return;}
  const rows=['Elapsed seconds since first foreground sample,Observed painted FPS,Measurement note',
   ['OBSERVATION_GAPS',gapCount,'About '+gapSeconds+' seconds outside foreground observation; no missing FPS inferred'].map(v=>
    '"'+String(v).replace(/"/g,'""')+'"').join(','),
   ...samples.map(x=>[x.t,x.fps,'Real visible native FPS counter sample; no GPU frame timing, room identity or server latency'].map(v=>
    '"'+String(v).replace(/"/g,'""')+'"').join(','))];
  const url=URL.createObjectURL(new Blob(['\ufeff'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=make('a');a.href=url;a.download='fuckball-local-fps-readings.csv';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  notice.textContent='Private FPS readings exported locally. No room or account information included.';
 };
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(wasVisible&&samples.length)awayAt=Date.now();
   wasVisible=false;if(!panel.hidden)toggle(false);}
 });
 window.addEventListener('pagehide',clearData);
 window.setInterval(capture,1000);
})();
