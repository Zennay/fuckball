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
 const legend=make('p','Each bar represents one real foreground reading of the existing FPS counter, oldest first.');
 const actions=make('div',null,'frame-meter-actions');
 const fast=make('button','Apply native Performance preset');
 const save=make('button','↓ Save private FPS CSV');
 const reset=make('button','Clear this local view');
 for(const button of [fast,save,reset]){button.type='button';actions.append(button);}
 const notice=make('p','', 'frame-meter-notice');
 notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 panel.append(top,intro,targetWrap,stats,gauge,bars,legend,actions,notice);
 match.append(panel);
 let samples=[],second=0,wasVisible=false;
 const quantile=(sorted,p)=>{
  if(!sorted.length)return null;
  const at=(sorted.length-1)*p,lo=Math.floor(at),hi=Math.ceil(at);
  return Math.round(sorted[lo]+(sorted[hi]-sorted[lo])*(at-lo));
 };
 function clearData(){
  samples=[];second=0;median.textContent=low.textContent='—';count.textContent='0';
  bars.replaceChildren();gauge.textContent='Waiting for native rendered FPS samples.';
  bars.setAttribute('aria-label','No observed FPS readings yet');
  save.disabled=true;
 }
 function render(){
  const values=samples.map(x=>x.fps),sorted=values.slice().sort((a,b)=>a-b);
  const m=quantile(sorted,.5),p10=quantile(sorted,.1),goal=Number(target.value);
  median.textContent=m??'—';low.textContent=p10??'—';count.textContent=String(samples.length);
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
   bar.title=sample.fps+' FPS · '+sample.t+'s since the panel opened';
   bar.setAttribute('aria-hidden','true');bars.append(bar);
  }
  bars.setAttribute('aria-label',samples.length+' actual foreground FPS samples, median '+m+
   ', tenth percentile '+p10+' FPS, minimum '+Math.min(...values)+', maximum '+Math.max(...values)+'.');
  save.disabled=false;
 }
 function capture(){
  const visible=!match.hidden&&!document.hidden&&document.visibilityState==='visible';
  open.hidden=!visible;
  if(!visible){
   if(wasVisible){wasVisible=false;clearData();}
   if(!panel.hidden)toggle(false);
   return;
  }
  if(!wasVisible){wasVisible=true;clearData();}
  const raw=nativeFPS.textContent?.trim()||'';
  if(!/^\d{1,4}$/.test(raw))return;
  const fps=Number(raw);
  if(!Number.isSafeInteger(fps)||fps<1||fps>2000)return;
  samples.push({t:++second,fps});
  if(samples.length>90)samples.shift();
  if(!panel.hidden)render();
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
  const rows=['Seconds in local session,Observed painted FPS,Limitation',
   ...samples.map(x=>[x.t,x.fps,'App FPS counter observation (not GPU frame timing or server latency)'].map(v=>
    '"'+String(v).replace(/"/g,'""')+'"').join(','))];
  const url=URL.createObjectURL(new Blob(['\ufeff'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=make('a');a.href=url;a.download='fuckball-local-fps-readings.csv';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  notice.textContent='Private FPS readings exported locally. No room or account information included.';
 };
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearData();if(!panel.hidden)toggle(false);}});
 window.setInterval(capture,1000);
})();
