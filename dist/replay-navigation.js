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
 description.textContent='Recorded HBR2 playback only. Space or K pauses, ←/→ seeks 5 seconds, Shift+←/→ steps one frame, [ / ] changes speed, G / Shift+G jumps to a recorded goal.';
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
 const rates=document.createElement('div');rates.className='replay-navigation-rates';
 const slower=document.createElement('button');slower.type='button';slower.textContent='− Speed';
 const faster=document.createElement('button');faster.type='button';faster.textContent='+ Speed';
 slower.onclick=()=>speedChange(-1);faster.onclick=()=>speedChange(1);
 rates.append(slower,faster);
 help.append(description,actions,rates,status);pane.append(heading,help);controls.append(pane);
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
  if(!handler)return;
  event.preventDefault();event.stopImmediatePropagation();handler();
 },true);
})();
