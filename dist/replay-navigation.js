'use strict';
// Replay-only playback shortcuts. Does not control live matches, players or physics.
(function(){
 const controls=document.getElementById('replayControls');
 const match=document.getElementById('matchView');
 if(!controls||!match)return;
 const pane=document.createElement('details');pane.className='replay-navigation';
 const heading=document.createElement('summary');heading.textContent='⌨ Replay navigation · frame / goal / speed';
 const help=document.createElement('div');help.className='replay-navigation-content';
 const description=document.createElement('p');
 description.textContent='Recorded HBR2 playback only. Space or K pauses, ←/→ seeks 5 seconds, Shift+←/→ steps one frame, [ / ] changes speed, G / Shift+G jumps to a recorded goal. Mark A/B for a repeatable study clip (Shift+A/B/L).';
 const actions=document.createElement('div');actions.className='replay-navigation-actions';
 const status=document.createElement('span');status.className='replay-navigation-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 function button(label,description,handler){
  const el=document.createElement('button');el.type='button';
  el.textContent=label;el.setAttribute('aria-label',description);el.onclick=handler;
  actions.append(el);return el;
 }
 const available=()=>!controls.hidden&&!match.hidden&&typeof replay!=='undefined'&&!!replay;
 const show=message=>{status.textContent=message;};
 const toggle=document.getElementById('replayToggle'),speed=document.getElementById('replaySpeed');
 const seek=(milliseconds,frame=false)=>{
  if(!available())return;
  const total=replay.length(),before=replay.getTime();
  if(!Number.isFinite(total)||!Number.isFinite(before)||total<=0)return;
  const next=Math.min(total,Math.max(0,before+milliseconds));
  if(frame){
   replay.setSpeed(0);toggle.textContent='▶';
  }
  replay.setTime(next);
  show((frame?'Frame step':'Seek')+' · '+Math.floor(next/1000)+'s / '+Math.floor(total/1000)+'s');
 };
 function speedChange(direction){
  if(!available())return;
  const options=[.5,1,2,4],current=Number(speed.value)||1;
  let index=options.indexOf(current);if(index<0)index=1;
  const target=options[Math.max(0,Math.min(options.length-1,index+direction))];
  speed.value=String(target);
  if(replay.getSpeed()!==0){replay.setSpeed(target);toggle.textContent='Ⅱ';}
  show('Playback speed '+target+'×'+(replay.getSpeed()===0?' · paused':''));
 }
 let goalToken=0;
 async function jumpGoal(direction){
  if(!available()||typeof ReplayLibrary==='undefined')return;
  const playback=replay,id=typeof activeLocalReplayId==='string'?activeLocalReplayId:'';
  if(!/^[a-f0-9]{32}$/.test(id)){
   show('Goal navigation requires a replay saved in My Games.');return;
  }
  const token=++goalToken;
  try{
   const item=(await ReplayLibrary.list()).find(x=>x.id===id);
   if(token!==goalToken||!available()||replay!==playback||activeLocalReplayId!==id)return;
   const markers=Array.isArray(item?.goals)?item.goals.filter(x=>x&&
    Number.isSafeInteger(x.frameNo)&&x.frameNo>=0&&
    (!item.frames||x.frameNo<=item.frames)&&[1,2].includes(x.teamId))
    .sort((a,b)=>a.frameNo-b.frameNo):[];
   if(!markers.length){show('No saved HBR2 goal markers in this recording.');return;}
   const current=replay.getTime()/1000*60;
   const marker=direction>0?markers.find(x=>x.frameNo>current+15):
    [...markers].reverse().find(x=>x.frameNo<current-15);
   if(!marker){show(direction>0?'No later recorded goals.':'No earlier recorded goals.');return;}
   const timestamp=Math.min(replay.length(),Math.max(0,marker.frameNo-120)*1000/60);
   replay.setTime(timestamp);
   show((marker.teamId===1?'Red':'Blue')+' goal marker · around '+Math.floor(marker.frameNo/60)+'s · local replay, unverified');
  }catch(error){show('Could not read local goal markers: '+(error.message||'Storage unavailable'));}
 }
 button('◀ 5s','Seek back five seconds',()=>seek(-5000));
 button('‹ 1 frame','Step back one recorded frame and pause',()=>seek(-1000/60,true));
 button('Ⅱ / ▶','Pause or resume local replay',()=>{
  if(!available())return;toggle.click();show(replay.getSpeed()?'Playback running':'Playback paused');
 });
 button('1 frame ›','Step forward one recorded frame and pause',()=>seek(1000/60,true));
 button('5s ▶','Seek forward five seconds',()=>seek(5000));
 button('‹ Goal','Jump to previous recorded goal',()=>jumpGoal(-1));
 button('Goal ›','Jump to next recorded goal',()=>jumpGoal(1));
 // Player-owned rehearsal loop for actual HBR2 playback. Never affects live gameplay.
 const loop=document.createElement('section');loop.className='replay-navigation-loop';
 loop.setAttribute('aria-label','Replay A to B loop');
 const loopTitle=document.createElement('strong');loopTitle.textContent='REPLAY STUDY LOOP · A / B';
 const loopIntro=document.createElement('p');
 loopIntro.textContent='Mark the start and end of a recorded moment, then repeat only that section. This stays in the current replay and does not modify HBR2 data.';
 const loopActions=document.createElement('div');loopActions.className='replay-navigation-loop-actions';
 const loopStart=document.createElement('button');loopStart.type='button';loopStart.textContent='A · Mark start';
 const loopEnd=document.createElement('button');loopEnd.type='button';loopEnd.textContent='B · Mark end';
 const loopToggle=document.createElement('button');loopToggle.type='button';loopToggle.textContent='▶ Repeat A–B';
 const loopClear=document.createElement('button');loopClear.type='button';loopClear.textContent='Clear loop';
 const loopState=document.createElement('p');loopState.className='replay-navigation-loop-state';
 loopState.setAttribute('role','status');loopState.setAttribute('aria-live','polite');
 let loopReplay=null,loopA=null,loopB=null,loopEnabled=false;
 const clock=n=>n===null?'not set':(n/1000).toFixed(2)+'s';
 function renderLoop(message){
  const valid=loopA!==null&&loopB!==null&&loopB-loopA>=250;
  loopToggle.disabled=!valid;loopToggle.textContent=loopEnabled?'Ⅱ Stop repeating':'▶ Repeat A–B';
  loopToggle.setAttribute('aria-pressed',String(loopEnabled));
  loopState.textContent=(message?message+' · ':'')+'A '+clock(loopA)+' / B '+clock(loopB)+
   (valid?' · '+((loopB-loopA)/1000).toFixed(2)+'s clip':' · Set A and B at least 0.25 seconds apart')+
   (loopEnabled?' · REPEATING':'');
 }
 function resetLoop(why){
  loopReplay=available()?replay:null;
  loopA=loopB=null;loopEnabled=false;
  renderLoop(why||'Loop cleared');
 }
 function mark(which){
  if(!available())return;
  if(loopReplay!==replay)resetLoop('Recording changed');
  const time=replay.getTime(),duration=replay.length();
  if(!Number.isFinite(time)||!Number.isFinite(duration)||duration<=0)return;
  const value=Math.max(0,Math.min(time,duration));
  if(which==='A'){
   loopA=value;
   if(loopB!==null&&loopB-loopA<250){loopB=null;loopEnabled=false;}
  }else{
   loopB=value;
   if(loopA!==null&&loopB-loopA<250)loopEnabled=false;
  }
  renderLoop((which==='A'?'Start':'End')+' marked from recorded HBR2');
 }
 loopStart.onclick=()=>mark('A');
 loopEnd.onclick=()=>mark('B');
 loopToggle.onclick=()=>{
  if(!available()||loopReplay!==replay)return resetLoop('Recording changed');
  if(loopA===null||loopB===null||loopB-loopA<250)return renderLoop('Set valid A and B points first');
  loopEnabled=!loopEnabled;
  if(loopEnabled){
   if(replay.getTime()<loopA||replay.getTime()>=loopB)replay.setTime(loopA);
   if(replay.getSpeed()===0){
    const rate=Number(speed.value)||1;
    replay.setSpeed(rate);toggle.textContent='Ⅱ';
   }
  }
  renderLoop(loopEnabled?'Loop enabled':'Loop paused');
 };
 loopClear.onclick=()=>resetLoop('Loop disabled');
 loopActions.append(loopStart,loopEnd,loopToggle,loopClear);
 loop.append(loopTitle,loopIntro,loopActions,loopState);
 renderLoop();
 function maintainLoop(){
  if(!available()){
   if(loopReplay!==null)resetLoop('Replay closed');
   return;
  }
  if(loopReplay!==replay)return resetLoop('New replay selected');
  if(!loopEnabled)return;
  const time=replay.getTime();
  if(Number.isFinite(time)&&replay.getSpeed()!==0&&time>=loopB&&loopB!==null)
   replay.setTime(loopA);
 }
 window.setInterval(()=>{if(!document.hidden)maintainLoop();},120);
 const rates=document.createElement('div');rates.className='replay-navigation-rates';
 const slower=document.createElement('button');slower.type='button';slower.textContent='− Speed';
 const faster=document.createElement('button');faster.type='button';faster.textContent='+ Speed';
 slower.onclick=()=>speedChange(-1);faster.onclick=()=>speedChange(1);
 rates.append(slower,faster);
 const cameraRow=document.createElement('div');cameraRow.className='replay-navigation-camera';
 const cameraLabel=document.createElement('label');cameraLabel.textContent='Replay camera';
 const cameraSelect=document.createElement('select');cameraSelect.setAttribute('aria-label','Follow recorded player or show full pitch');
 cameraSelect.add(new Option('Full pitch','-1'));cameraLabel.append(cameraSelect);
 const cameraHint=document.createElement('small');
 cameraHint.textContent='Follow a real player visible in the recorded HBR2 frames. Does not affect gameplay or recorded data.';
 cameraRow.append(cameraLabel,cameraHint);
 let lastReplay=null,lastRoster='',follow=-1;
 function refreshCamera(){
  if(!available()||typeof renderer==='undefined')return;
  if(replay!==lastReplay){
   lastReplay=replay;lastRoster='';follow=-1;renderer.followPlayerId=-1;
  }
  const players=Array.isArray(replay.state?.players)?
   replay.state.players.filter(p=>Number.isSafeInteger(p?.id)&&p.id>=0&&
    [1,2].includes(p.team?.id)&&p.disc):[];
  const signature=players.map(p=>p.id+':'+p.team.id+':'+p.name).join('|');
  if(signature===lastRoster)return;
  lastRoster=signature;
  const previous=follow;
  cameraSelect.replaceChildren(new Option('Full pitch','-1'));
  for(const p of players){
   const side=p.team.id===1?'Red':'Blue';
   cameraSelect.add(new Option(side+' · '+String(p.name||'Player').slice(0,30),String(p.id)));
  }
  if(previous>=0&&!players.some(p=>p.id===previous)){
   follow=-1;renderer.followPlayerId=-1;
   show('Selected recorded player is no longer on the pitch. Switched to full pitch.');
  }
  cameraSelect.value=String(follow);
 }
 cameraSelect.onchange=()=>{
  if(!available()||typeof renderer==='undefined')return;
  const candidate=Number(cameraSelect.value);
  if(!Number.isSafeInteger(candidate)||candidate < -1)return;
  const present=candidate===-1||Array.isArray(replay.state?.players)&&
   replay.state.players.some(p=>p.id===candidate&&[1,2].includes(p.team?.id)&&p.disc);
  if(!present){cameraSelect.value='-1';renderer.followPlayerId=-1;follow=-1;
   show('Recorded player is not active in this frame.');return;}
  follow=candidate;renderer.followPlayerId=candidate;
  show(candidate===-1?'Camera: full recorded pitch.':'Camera: following recorded player '+cameraSelect.selectedOptions[0].textContent+'.');
 };
 help.append(description,actions,rates,loop,cameraRow,status);pane.append(heading,help);controls.append(pane);
 window.setInterval(()=>{if(!document.hidden&&available())refreshCamera();},700);
 window.addEventListener('keydown',event=>{
  if(!available()||event.defaultPrevented||document.hidden||event.altKey||
   event.ctrlKey||event.metaKey||document.querySelector('dialog[open]')||
   document.getElementById('pauseMenu')?.hidden===false||
   event.target?.isContentEditable||
   ['INPUT','SELECT','TEXTAREA','BUTTON'].includes(event.target?.tagName))return;
  const hotkey=event.code;
  let handler;
  if((hotkey==='Space'||hotkey==='KeyK')&&!event.shiftKey)
   handler=()=>toggle.click();
  else if(hotkey==='ArrowLeft')handler=()=>seek(event.shiftKey?-1000/60:-5000,event.shiftKey);
  else if(hotkey==='ArrowRight')handler=()=>seek(event.shiftKey?1000/60:5000,event.shiftKey);
  else if(hotkey==='Comma'&&!event.shiftKey)handler=()=>seek(-1000/60,true);
  else if(hotkey==='Period'&&!event.shiftKey)handler=()=>seek(1000/60,true);
  else if(hotkey==='BracketLeft'&&!event.shiftKey)handler=()=>speedChange(-1);
  else if(hotkey==='BracketRight'&&!event.shiftKey)handler=()=>speedChange(1);
  else if(hotkey==='KeyG')handler=()=>jumpGoal(event.shiftKey?-1:1);
  else if(event.shiftKey&&hotkey==='KeyA')handler=()=>mark('A');
  else if(event.shiftKey&&hotkey==='KeyB')handler=()=>mark('B');
  else if(event.shiftKey&&hotkey==='KeyL')handler=()=>loopToggle.click();
  if(!handler)return;
  event.preventDefault();event.stopImmediatePropagation();handler();
 },true);
})();
