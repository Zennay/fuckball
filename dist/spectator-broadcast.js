'use strict';
// Spectator-only, deliberately unofficial view of current native scoreboard snapshots.
(function(){
 if(typeof isSpectatorCamera!=='function'||typeof spectatorToolbar==='undefined')return;
 const match=document.getElementById('matchView');
 const pitch=document.getElementById('pitch');
 if(!match||!pitch)return;
 const KEY='fuckball.spectator-broadcast.v1';
 const node=(tag,text,cls)=>{
  const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);
  if(cls)e.className=cls;return e;
 };
 const validText=s=>typeof s==='string'&&s.length>=1&&s.length<=18&&s===s.trim()&&
  !/[\u0000-\u001f\u007f-\u009f]/.test(s);
 let settings={red:'RED',blue:'BLUE',mode:'wide'};
 try{
  const saved=JSON.parse(localStorage.getItem(KEY)||'null');
  if(saved?.version===1){
   if(validText(saved.red))settings.red=saved.red;
   if(validText(saved.blue))settings.blue=saved.blue;
   if(['wide','compact'].includes(saved.mode))settings.mode=saved.mode;
  }
 }catch{}
 const toggle=node('button','▦ BROADCAST HUD','spectator-broadcast-toggle');
 toggle.type='button';toggle.setAttribute('aria-pressed','false');
 toggle.setAttribute('aria-label','Show private spectator broadcast scoreboard');
 const save=node('button','↓ SCORE PNG','spectator-broadcast-save');save.type='button';
 save.title='Download the current unverified scoreboard image without player names';
 spectatorToolbar.append(toggle,save);
 const overlay=node('section',undefined,'spectator-broadcast');
 overlay.hidden=true;overlay.setAttribute('aria-label','Unofficial spectator scoreboard overlay');
 const stamp=node('span','LIVE LOCAL VIEW · UNVERIFIED','spectator-broadcast-stamp');
 const scoreboard=node('div',undefined,'spectator-broadcast-score');
 const rlabel=node('span',settings.red,'spectator-broadcast-red-label');
 const red=node('strong','0','spectator-broadcast-red');
 const separator=node('span',':','spectator-broadcast-dash');
 const blue=node('strong','0','spectator-broadcast-blue');
 const blabel=node('span',settings.blue,'spectator-broadcast-blue-label');
 const clock=node('time','00:00','spectator-broadcast-time');
 scoreboard.append(rlabel,red,separator,blue,blabel,clock);
 const foot=node('small','Current native match snapshot · no verified match result','spectator-broadcast-foot');
 overlay.append(stamp,scoreboard,foot);
 pitch.append(overlay);
 const menu=document.querySelector('#menuVideoPane .rm-form');
 const panel=menu?node('section',undefined,'spectator-broadcast-settings'):null;
 if(panel){
  panel.append(node('h3','SPECTATOR BROADCAST.'),
   node('p','A voluntary read-only scoreboard overlay for spectators and Watch Bots. Team labels are personal; they do not rename server teams or verify outcomes.'));
  const redInput=node('input');redInput.value=settings.red;redInput.maxLength=18;
  redInput.setAttribute('aria-label','Personal Red team display name');
  const blueInput=node('input');blueInput.value=settings.blue;blueInput.maxLength=18;
  blueInput.setAttribute('aria-label','Personal Blue team display name');
  const mode=node('select');mode.setAttribute('aria-label','Broadcast overlay layout');
  mode.add(new Option('Wide scoreboard','wide'));
  mode.add(new Option('Compact scoreboard','compact'));
  mode.value=settings.mode;
  for(const [text,control]of [['Red label',redInput],['Blue label',blueInput],['Layout',mode]]){
   const label=node('label',text);label.append(control);panel.append(label);
  }
  const apply=node('button','Apply local overlay');apply.type='button';
  const tip=node('p','Custom labels exist only on this device. No player identity, chat or IP details are captured in the PNG.');
  const status=node('p','', 'spectator-broadcast-feedback');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  apply.onclick=()=>{
   const r=redInput.value.trim(),b=blueInput.value.trim();
   if(!validText(r)||!validText(b))return status.textContent='Use printable labels of 1–18 characters.';
   if(!['wide','compact'].includes(mode.value))return;
   settings={red:r,blue:b,mode:mode.value};
   try{localStorage.setItem(KEY,JSON.stringify({version:1,...settings}));status.textContent='Overlay preferences saved to this device.';}
   catch{status.textContent='Applied for this visit; local settings unavailable.';}
   rlabel.textContent=r;blabel.textContent=b;
   overlay.classList.toggle('compact',settings.mode==='compact');
  };
  panel.append(apply,tip,status);menu.append(panel);
 }
 let enabled=false,last=null,lastRef=null,lastRoom='',lastPaint=0;
 const viewAvailable=()=>{
  if(document.hidden||match.hidden||typeof replay!=='undefined'&&replay||
   !isSpectatorCamera()||document.getElementById('pauseMenu')?.hidden===false)return false;
  const online=typeof serverLink!=='undefined'&&!!serverLink?.room;
  const watch=!online&&(!serverLink)&&document.getElementById('mode')?.value==='watch';
  return online||watch;
 };
 const roomKey=()=>serverLink?.room||'local-watch';
 const liveSnapshot=()=>{
  if(!viewAvailable())return null;
  const g=room?.gameState;
  if(!g||![g.redScore,g.blueScore,g.timeElapsed].every(Number.isFinite)||
   !Number.isSafeInteger(g.redScore)||!Number.isSafeInteger(g.blueScore)||
   g.redScore<0||g.blueScore<0||g.redScore>500||g.blueScore>500||
   g.timeElapsed<0||g.timeElapsed>12*3600)return null;
  return {red:g.redScore,blue:g.blueScore,time:Math.floor(g.timeElapsed)};
 };
 const clockText=s=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
 const disable=()=>{
  enabled=false;last=null;lastRef=null;overlay.hidden=true;
  toggle.setAttribute('aria-pressed','false');toggle.textContent='▦ BROADCAST HUD';
  save.disabled=true;
 };
 function refresh(){
  if(!enabled)return;
  if(!viewAvailable()){disable();return;}
  const ref=room,key=roomKey();
  if(ref!==lastRef||key!==lastRoom){lastRef=ref;lastRoom=key;last=null;}
  const snapshot=liveSnapshot();
  if(!snapshot){last=null;overlay.hidden=true;save.disabled=true;return;}
  last=snapshot;
  red.textContent=String(snapshot.red);blue.textContent=String(snapshot.blue);
  clock.textContent=clockText(snapshot.time);
  // A finished round still has a genuine local score, but labeling the
  // waiting room LIVE is misleading. Never infer the official final result.
  const online=typeof serverLink!=='undefined'&&!!serverLink?.room;
  const inProgress=online?serverLink.roomState?.started===true:
   typeof started!=='undefined'&&started===true;
  stamp.textContent=inProgress?'LIVE LOCAL VIEW · UNVERIFIED':
   'BETWEEN ROUNDS · LAST LOCAL SCORE · UNVERIFIED';
  foot.textContent=inProgress?'Current native match snapshot · no verified match result':
   'No current kickoff · displayed score is the last locally observed snapshot';
  overlay.classList.toggle('between-rounds',!inProgress);
  overlay.classList.toggle('compact',settings.mode==='compact');
  overlay.hidden=false;save.disabled=false;
 }
 toggle.onclick=()=>{
  if(enabled){disable();return;}
  if(!viewAvailable())return;
  enabled=true;toggle.setAttribute('aria-pressed','true');
  toggle.textContent='◉ HUD ON';refresh();
 };
 save.disabled=true;
 save.onclick=()=>{
  refresh();
  if(!enabled||!last||!viewAvailable())return;
  const canvas=document.createElement('canvas');canvas.width=900;canvas.height=220;
  const context=canvas.getContext('2d');
  if(!context)return;
  context.fillStyle='#152d37';context.fillRect(0,0,900,220);
  context.textAlign='center';
  context.fillStyle='#d9f0dd';context.font='bold 18px system-ui';
  context.fillText(stamp.textContent.slice(0,65),450,36);
  context.fillStyle='#ff9896';context.font='bold 28px system-ui';
  context.fillText(settings.red,165,101);
  context.fillStyle='#9ccbf9';context.fillText(settings.blue,735,101);
  context.fillStyle='#fff';context.font='bold 78px system-ui';
  context.fillText(String(last.red),355,143);context.fillText(String(last.blue),545,143);
  context.font='bold 60px system-ui';context.fillText(':',450,138);
  context.font='bold 28px system-ui';context.fillText(clockText(last.time),450,191);
  context.font='14px system-ui';context.fillStyle='#bbd0c5';
  context.fillText(foot.textContent.slice(0,90),450,211);
  canvas.toBlob(blob=>{
   if(!blob||blob.size>4*1048576)return;
   const url=URL.createObjectURL(blob),a=node('a');
   a.href=url;a.download='fuckball-spectator-scoreboard.png';a.click();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
  },'image/png');
 };
 setInterval(()=>{
  if(!enabled)return;
  if(document.hidden){disable();return;}
  if(performance.now()-lastPaint<200)return;
  lastPaint=performance.now();refresh();
 },250);
 window.addEventListener('pagehide',disable);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)disable();});
})();
