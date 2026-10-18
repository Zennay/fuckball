'use strict';
// HBR2 replay analysis controls are local playback only. Never mutate saved
// recordings, send game inputs or imply official match results.
(function(){
 const controls=document.getElementById('replayControls');
 if(!controls)return;
 const panel=document.createElement('section');panel.className='replay-analysis';
 panel.setAttribute('aria-label','Replay frame and loop analysis controls');
 const heading=document.createElement('div');heading.className='replay-analysis-heading';
 const title=document.createElement('strong');title.textContent='REPLAY ANALYSIS.';
 const counter=document.createElement('output');counter.setAttribute('aria-live','off');
 counter.textContent='Frame —';heading.append(title,counter);
 const scrub=document.createElement('div');scrub.className='replay-analysis-steps';
 const loopBar=document.createElement('div');loopBar.className='replay-analysis-loop';
 const status=document.createElement('p');status.className='replay-analysis-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const help=document.createElement('small');help.textContent=
  'Keyboard: J back 5s · K play/pause · L forward 5s · ,/. single frame · I set A · O set B. Offline replay files remain yours.';
 panel.append(heading,scrub,loopBar,status,help);controls.append(panel);
 let current=null,start=null,end=null,looping=false,lastUpdate=0;
 function button(text,label,handler,group){
  const node=document.createElement('button');node.type='button';node.textContent=text;
  node.setAttribute('aria-label',label);node.onclick=handler;group.append(node);return node;
 }
 function active(){
  if(typeof replay==='undefined'||!replay||document.getElementById('replayControls')?.hidden)return null;
  if(current!==replay){current=replay;start=null;end=null;looping=false;status.textContent='Choose A and B to repeat a passage.';}
  return replay;
 }
 function position(){
  const player=active();if(!player)return null;
  const frames=Math.max(0,Math.round(player.length()*60/1000));
  const now=Math.max(0,Math.min(frames,Math.round(player.getTime()*60/1000)));
  return{player,frame:now,total:frames};
 }
 function seek(frame,pause=false){
  const state=position();if(!state)return;
  const target=Math.max(0,Math.min(state.total,Math.round(frame)));
  if(pause){state.player.setSpeed(0);document.getElementById('replayToggle').textContent='▶';}
  state.player.setTime(target*1000/60);
  // The engine's own read/render callback remains the single source of truth.
  render();
 }
 const backFive=button('−5s','Jump backward five seconds',()=>{const s=position();if(s)seek(s.frame-300);},scrub);
 const previous=button('◀ Frame','Step backward one frame and pause',()=>{const s=position();if(s)seek(s.frame-1,true);},scrub);
 const next=button('Frame ▶','Step forward one frame and pause',()=>{const s=position();if(s)seek(s.frame+1,true);},scrub);
 const forwardFive=button('+5s','Jump forward five seconds',()=>{const s=position();if(s)seek(s.frame+300);},scrub);
 const markA=button('Set A','Set replay loop start at current frame',()=>{
  const s=position();if(!s)return;start=s.frame;
  if(end!==null&&end<=start){end=null;looping=false;}
  status.textContent='Loop start saved at '+fmt(start/60)+'.';render();
 },loopBar);
 const markB=button('Set B','Set replay loop end at current frame',()=>{
  const s=position();if(!s)return;
  if(start===null){status.textContent='Set the loop start (A) first.';return;}
  if(s.frame<=start){status.textContent='Loop end must come after A.';return;}
  end=s.frame;status.textContent='Loop end saved at '+fmt(end/60)+'.';render();
 },loopBar);
 const toggleLoop=button('↻ Loop off','Enable or disable repeating selected replay segment',()=>{
  if(start===null||end===null||end<=start){
   status.textContent='Set two distinct frames A and B first.';return;
  }
  looping=!looping;
  if(looping){const s=position();if(s&&(s.frame<start||s.frame>=end))seek(start);}
  status.textContent=looping?'Segment loop enabled. Playback will repeat A → B.':'Segment loop disabled.';
  render();
 },loopBar);
 button('Clear A/B','Clear replay loop markers',()=>{
  start=null;end=null;looping=false;status.textContent='Loop markers cleared.';render();
 },loopBar);
 function render(){
  const s=position();
  panel.hidden=!s;
  if(!s)return;
  counter.textContent='Frame '+s.frame.toLocaleString()+' / '+s.total.toLocaleString()+
   ' · '+fmt(s.frame/60)+' / '+fmt(s.total/60);
  previous.disabled=s.frame<=0;backFive.disabled=s.frame<=0;
  next.disabled=s.frame>=s.total;forwardFive.disabled=s.frame>=s.total;
  markA.textContent=start===null?'Set A':'A '+fmt(start/60);
  markB.textContent=end===null?'Set B':'B '+fmt(end/60);
  toggleLoop.disabled=start===null||end===null||end<=start;
  toggleLoop.textContent=looping?'↻ Loop on':'↻ Loop off';
  toggleLoop.setAttribute('aria-pressed',String(looping));
 }
 function refresh(){
  const s=position();
  if(!s){panel.hidden=true;return;}
  if(looping&&start!==null&&end!==null&&end>start&&
     s.frame>=end&&s.player.getSpeed()>0)seek(start);
  const now=performance.now();
  if(now-lastUpdate>180){lastUpdate=now;render();}
 }
 window.addEventListener('keydown',event=>{
  if(event.repeat||event.altKey||event.ctrlKey||event.metaKey||
     !active()||document.getElementById('matchView')?.hidden||
     document.getElementById('pauseMenu')?.hidden===false||
     ['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName)||
     event.target?.isContentEditable||document.querySelector('dialog[open]'))return;
  const handlers={
   KeyJ:()=>backFive.click(),KeyK:()=>document.getElementById('replayToggle').click(),
   KeyL:()=>forwardFive.click(),Comma:()=>previous.click(),Period:()=>next.click(),
   KeyI:()=>markA.click(),KeyO:()=>markB.click()
  };
  const handler=handlers[event.code];
  if(handler){event.preventDefault();handler();}
 });
 setInterval(()=>{if(!document.hidden)refresh();},100);
 render();
})();
