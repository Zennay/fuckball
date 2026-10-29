'use strict';
// Replay Clip Studio: deliberate, bounded, local-only capture of actual HBR2
// playback. No match result, microphone, server or external upload.
(function(){
 const controls=document.getElementById('replayControls');
 const canvas=document.getElementById('gameCanvas');
 if(!controls||!canvas)return;
 const row=document.createElement('div');row.className='replay-clip-tools';
 const save=document.createElement('button');save.type='button';save.className='replay-clip-export';
 save.textContent='⬇ Export selected WebM';
 const frame=document.createElement('button');frame.type='button';frame.className='replay-frame-export';
 frame.textContent='⬇ Save frame · PNG';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel clip';cancel.hidden=true;
 const state=document.createElement('span');state.setAttribute('role','status');
 state.setAttribute('aria-live','polite');state.className='replay-clip-status';
 state.textContent='Private HBR2 field footage only. Visible player names may appear in exports.';
 const editor=document.createElement('details');editor.className='replay-clip-studio';editor.open=false;
 const heading=document.createElement('summary');heading.textContent='✂ Clip Studio · set a 1.5–10 second range';
 const body=document.createElement('div');body.className='replay-clip-studio-body';
 const note=document.createElement('p');note.textContent='Mark IN and OUT on the current replay. Preview before exporting. Clips use the recorded pitch at normal speed, without audio; no upload or verified match claims.';
 const points=document.createElement('div');points.className='replay-clip-points';
 const markIn=document.createElement('button');markIn.type='button';markIn.textContent='Mark IN at playhead';
 const markOut=document.createElement('button');markOut.type='button';markOut.textContent='Mark OUT at playhead';
 const reset=document.createElement('button');reset.type='button';reset.textContent='Reset to 10s from here';
 const readout=document.createElement('output');readout.className='replay-clip-readout';
 readout.setAttribute('aria-live','polite');
 points.append(markIn,markOut,reset);
 const goalsSection=document.createElement('section');goalsSection.className='replay-clip-goal-selector';
 const goalsHeading=document.createElement('strong');goalsHeading.textContent='MAKE A GOAL HIGHLIGHT.';
 const goalLabel=document.createElement('label');goalLabel.textContent='Actual recorded HBR2 goal marker';
 const goalSelect=document.createElement('select');goalSelect.setAttribute('aria-label','Choose a recorded goal to trim');
 goalSelect.disabled=true;goalSelect.add(new Option('Open a saved replay with goal markers',''));
 goalLabel.append(goalSelect);
 const offsets=document.createElement('div');offsets.className='replay-clip-offsets';
 function offsetSelect(text,values,selected){
  const label=document.createElement('label');label.textContent=text;
  const control=document.createElement('select');control.setAttribute('aria-label',text);
  for(const value of values)control.add(new Option(value+' seconds',String(value)));
  control.value=String(selected);label.append(control);offsets.append(label);return control;
 }
 const before=offsetSelect('Before goal',[1,2,3,4,5],3);
 const after=offsetSelect('After goal',[2,3,4,5],4);
 const useGoal=document.createElement('button');useGoal.type='button';useGoal.textContent='✂ Trim selected goal';
 useGoal.disabled=true;
 const goalStatus=document.createElement('p');goalStatus.setAttribute('role','status');
 goalStatus.setAttribute('aria-live','polite');goalStatus.className='replay-clip-goal-status';
 goalsSection.append(goalsHeading,goalLabel,offsets,useGoal,goalStatus);
 const nameLabel=document.createElement('label');nameLabel.textContent='Optional clip title';
 const title=document.createElement('input');title.type='text';title.maxLength=60;
 title.placeholder='My football highlight';title.setAttribute('aria-label','Clip filename title');
 nameLabel.append(title);
 const preview=document.createElement('button');preview.type='button';preview.textContent='▶ Preview range';
 const stopPreview=document.createElement('button');stopPreview.type='button';stopPreview.textContent='■ Stop preview';
 stopPreview.hidden=true;
 const previewRow=document.createElement('div');previewRow.className='replay-clip-preview';
 previewRow.append(preview,stopPreview);
 body.append(note,points,readout,goalsSection,nameLabel,previewRow);editor.append(heading,body);
 row.append(save,frame,cancel,state);controls.append(editor,row);
 const MAX_VIDEO=48*1024*1024,MAX_DURATION=10000,MIN_DURATION=1500;
 let capture=null,previewing=null,range=null,lastReplay=null;
 let markerToken=0,markerSource=null,markerId='',goalMarkers=[];
 const supported=()=>typeof MediaRecorder!=='undefined'&&
  typeof canvas.captureStream==='function'&&typeof URL.createObjectURL==='function';
 const available=()=>typeof replay!=='undefined'&&replay&&!controls.hidden&&
  !!document.getElementById('matchView')&&!document.getElementById('matchView').hidden;
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 const fmt=ms=>{const s=Math.floor(Math.max(0,ms)/1000);
  return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')+'.'+Math.floor(ms%1000/100);};
 function ensure(){
  if(!available())return false;
  if(lastReplay!==replay){
   if(capture)abort('Recording stopped because replay changed.');
   stopPreviewing(false);
   lastReplay=replay;range=null;
   markerSource=null;markerId='';goalMarkers=[];markerToken++;
   goalSelect.replaceChildren(new Option('Looking up saved replay goals…',''));
   goalSelect.disabled=useGoal.disabled=true;
  }
  return true;
 }
 function setRange(start,end){
  if(!ensure())return;
  const total=replay.length();
  if(!Number.isFinite(total)||total<MIN_DURATION){state.textContent='Recording is too short to export.';return;}
  const a=clamp(start,0,total),b=clamp(end,0,total);
  range={start:a,end:b,source:replay};
  render();
 }
 function activeRange(){
  if(!ensure())return null;
  if(!range||range.source!==replay){
   const at=clamp(replay.getTime(),0,replay.length());
   range={start:at,end:Math.min(replay.length(),at+MAX_DURATION),source:replay};
  }
  return range;
 }
 function render(){
  const r=range;if(!r)return;
  const duration=r.end-r.start;
  readout.textContent='IN '+fmt(r.start)+' · OUT '+fmt(r.end)+' · '+(duration/1000).toFixed(1)+'s'+
   (duration<MIN_DURATION?' (too short)':duration>MAX_DURATION?' (over 10s maximum)':' · ready');
  save.disabled=!!capture||duration<MIN_DURATION||duration>MAX_DURATION||!supported();
  preview.disabled=!!capture||!!previewing||duration<MIN_DURATION||duration>MAX_DURATION;
 }
 function stopPreviewing(pause=true){
  const current=previewing;if(!current)return;
  if(current.interval)clearInterval(current.interval);
  previewing=null;stopPreview.hidden=true;
  if(pause&&available()&&replay===current.source){
   replay.setSpeed(0);
   document.getElementById('replayToggle').textContent='▶';
  }
  render();
 }
 function cancelTimers(session){
  if(session.timer)clearTimeout(session.timer);
  if(session.pulse)clearInterval(session.pulse);
 }
 function cleanup(session,discard=false){
  cancelTimers(session);if(discard)session.discard=true;
  try{if(session.recorder?.state!=='inactive')session.recorder.stop();}catch{}
  try{session.stream?.getTracks().forEach(track=>track.stop());}catch{}
  if(capture===session){capture=null;cancel.hidden=true;render();}
 }
 function abort(message){
  if(capture)cleanup(capture,true);
  state.textContent=message;
 }
 function mime(){
  return ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']
   .find(value=>{try{return MediaRecorder.isTypeSupported(value);}catch{return false;}})||'';
 }

 function currentReplayId(){
  return typeof activeLocalReplayId==='string'&&/^[a-f0-9]{32}$/.test(activeLocalReplayId)?
   activeLocalReplayId:'';
 }
 async function refreshGoals(force=false){
  if(!available()||typeof ReplayLibrary==='undefined')return;
  const id=currentReplayId(),source=replay;
  if(!force&&markerSource===source&&markerId===id)return;
  markerSource=source;markerId=id;
  const token=++markerToken;
  goalMarkers=[];goalSelect.disabled=useGoal.disabled=true;
  goalSelect.replaceChildren(new Option(id?'Reading saved goal markers…':'Save this HBR2 recording in My Games to use goal markers.',''));
  if(!id)return;
  try{
   const item=(await ReplayLibrary.list()).find(entry=>entry.id===id);
   if(token!==markerToken||!available()||replay!==source||currentReplayId()!==id)return;
   goalMarkers=Array.isArray(item?.goals)?
    item.goals.filter(goal=>Number.isSafeInteger(goal?.frameNo)&&goal.frameNo>=0&&
     (!item.frames||goal.frameNo<=item.frames)&&[1,2].includes(goal.teamId))
    .slice(0,128).sort((a,b)=>a.frameNo-b.frameNo):[];
   goalSelect.replaceChildren();
   if(!goalMarkers.length){
    goalSelect.add(new Option('This saved replay has no recorded goal markers',''));
    goalStatus.textContent='No eligible local goal metadata. You can still select any manual IN/OUT range.';
   }else{
    goalMarkers.forEach((goal,index)=>{
     goalSelect.add(new Option((index+1)+'. '+(goal.teamId===1?'Red':'Blue')+
      ' goal · '+fmt(goal.frameNo*1000/60),String(index)));
    });
    goalStatus.textContent=goalMarkers.length+' genuine HBR2 goal markers available; not authenticated match results.';
   }
   goalSelect.disabled=useGoal.disabled=!goalMarkers.length;
  }catch(error){
   if(token!==markerToken||replay!==source)return;
   goalSelect.replaceChildren(new Option('Local goal data unavailable',''));
   goalStatus.textContent=error?.message||'Could not read saved goals.';
  }
 }
 function selectGoal(goal){
  if(!goal||capture||!ensure())return false;
  const total=replay.length(),timestamp=goal.frameNo*1000/60;
  if(!Number.isFinite(timestamp)||timestamp<0||timestamp>total+1000)return false;
  stopPreviewing();
  const from=Math.max(0,timestamp-Number(before.value)*1000);
  const to=Math.min(total,timestamp+Number(after.value)*1000);
  if(to-from<MIN_DURATION||to-from>MAX_DURATION){
   goalStatus.textContent='Selected goal is too close to the recording boundaries.';return false;
  }
  setRange(from,to);
  replay.setTime(from);replay.setSpeed(0);
  document.getElementById('replayToggle').textContent='▶';
  editor.open=true;
  if(!title.value.trim())title.value=(goal.teamId===1?'red':'blue')+'-goal-'+fmt(timestamp).replace(/[:.]/g,'-');
  goalStatus.textContent='Trimmed '+(goal.teamId===1?'Red':'Blue')+' recorded goal at '+fmt(timestamp)+
   '. Preview or export; this goal marker is local and unverified.';
  return true;
 }
 useGoal.addEventListener('click',()=>{
  const index=Number(goalSelect.value);
  if(!Number.isSafeInteger(index)||index<0||index>=goalMarkers.length)return;
  selectGoal(goalMarkers[index]);
 });
 window.addEventListener('fuckball:replay-clip-goal',async event=>{
  const detail=event.detail||{};
  if(!available()||capture||typeof detail.replayId!=='string'||detail.replayId!==currentReplayId()||
     !Number.isSafeInteger(detail.frameNo)||![1,2].includes(detail.teamId))return;
  const source=replay,id=detail.replayId;
  await refreshGoals(true);
  if(!available()||replay!==source||currentReplayId()!==id)return;
  const index=goalMarkers.findIndex(g=>g.frameNo===detail.frameNo&&g.teamId===detail.teamId);
  if(index<0)return;
  goalSelect.value=String(index);
  selectGoal(goalMarkers[index]);
 });

 markIn.onclick=()=>{
  if(capture||!ensure())return;
  const r=activeRange();setRange(replay.getTime(),r.end);
 };
 markOut.onclick=()=>{
  if(capture||!ensure())return;
  const r=activeRange();setRange(r.start,replay.getTime());
 };
 reset.onclick=()=>{
  if(capture||!ensure())return;
  const at=clamp(replay.getTime(),0,replay.length());
  setRange(at,Math.min(replay.length(),at+MAX_DURATION));
 };
 preview.onclick=()=>{
  const r=activeRange();
  if(!r||capture||previewing||r.end-r.start<MIN_DURATION||r.end-r.start>MAX_DURATION)return;
  replay.setTime(r.start);replay.setSpeed(1);
  document.getElementById('replayToggle').textContent='Ⅱ';
  document.getElementById('replaySpeed').value='1';
  const session={source:replay,interval:null};previewing=session;
  stopPreview.hidden=false;preview.disabled=true;
  state.textContent='Previewing selected replay range; no export started.';
  session.interval=setInterval(()=>{
   if(previewing!==session)return;
   if(document.hidden||!available()||replay!==session.source||replay.getSpeed()===0){
    stopPreviewing(false);state.textContent='Clip preview stopped.';return;
   }
   if(replay.getTime()>=r.end-45){
    replay.setTime(r.end);stopPreviewing();
    state.textContent='Preview complete. Export when ready.';
   }
  },65);
 };
 stopPreview.onclick=()=>{stopPreviewing();state.textContent='Preview stopped.';};
 async function begin(){
  const selected=activeRange();
  if(capture||!selected||!supported()){
   if(!supported())state.textContent='WebM export is unavailable in this browser. HBR2 playback and PNG export still work.';
   return;
  }
  const duration=selected.end-selected.start;
  if(duration<MIN_DURATION||duration>MAX_DURATION){
   state.textContent='Choose a clip from 1.5 to 10 seconds using IN and OUT.';return;
  }
  stopPreviewing();
  const session={recorder:null,stream:null,timer:null,pulse:null,parts:[],size:0,
   discard:false,source:replay,selection:{...selected},
   start:performance.now(),duration,
   name:'fuckball-'+(title.value.trim().replace(/[^a-z0-9 _-]/gi,'').trim().slice(0,50)
    .replace(/\s+/g,'-')||'replay')+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.webm'};
  try{
   replay.setTime(selected.start);replay.setSpeed(1);
   document.getElementById('replayToggle').textContent='Ⅱ';
   document.getElementById('replaySpeed').value='1';
   session.stream=canvas.captureStream(30);
   if(!session.stream.getVideoTracks().length)throw Error('Canvas capture has no video track.');
   const format=mime();
   session.recorder=new MediaRecorder(session.stream,format?{mimeType:format}:undefined);
   session.recorder.ondataavailable=event=>{
    if(session.discard||!event.data?.size)return;
    session.size+=event.data.size;
    if(session.size>MAX_VIDEO){
     state.textContent='Clip exceeds 48 MiB, discarded.';cleanup(session,true);return;
    }
    session.parts.push(event.data);
   };
   session.recorder.onerror=()=>{state.textContent='Video capture failed; replay unaffected.';cleanup(session,true);};
   session.recorder.onstop=()=>{
    if(session.discard||!session.parts.length)return;
    try{
     const video=new Blob(session.parts,{type:'video/webm'});
     if(!video.size||video.size>MAX_VIDEO)throw Error('Clip exceeds 48 MiB.');
     const url=URL.createObjectURL(video),link=document.createElement('a');
     link.href=url;link.download=session.name;document.body.append(link);link.click();link.remove();
     setTimeout(()=>URL.revokeObjectURL(url),60000);
     state.textContent='Selected '+(session.duration/1000).toFixed(1)+'s WebM downloaded. Review visible player names before sharing.';
    }catch(error){state.textContent=error.message||'Video download failed.';}
   };
   capture=session;cancel.hidden=false;save.disabled=true;preview.disabled=true;
   session.recorder.start(500);
   session.pulse=setInterval(()=>{
    if(capture!==session)return;
    if(document.hidden||!available()||replay!==session.source||replay.getSpeed()===0){
     abort('Clip cancelled when replay was hidden, changed or paused.');return;
    }
    const current=replay.getTime();
    if(current>=session.selection.end-45){
     cleanup(session);
     return;
    }
    state.textContent='Recording '+(session.duration/1000).toFixed(1)+'s selection · '+
     Math.max(0,(session.selection.end-current)/1000).toFixed(1)+'s remaining';
   },80);
   // Fail closed if the renderer or browser stalls; do not save partial clips
   // under a misleading selected length.
   session.timer=setTimeout(()=>{if(capture===session)abort('Clip discarded: playback did not finish in time.');},
    duration+3000);
   state.textContent='Recording selected clip · '+(duration/1000).toFixed(1)+'s';
  }catch(error){
   if(session.recorder&&session.stream)cleanup(session,true);
   else session.stream?.getTracks().forEach(track=>track.stop());
   state.textContent='Clip export unavailable: '+(error.message||'Capture not supported');
  }
 }
 frame.onclick=()=>{
  if(!available()||typeof canvas.toBlob!=='function'){
   state.textContent='Open an HBR2 replay in a browser with canvas capture to save a PNG.';return;
  }
  frame.disabled=true;
  canvas.toBlob(blob=>{
   frame.disabled=false;
   if(!blob?.size){state.textContent='Could not capture replay frame.';return;}
   const url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download='fuckball-frame-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';
   document.body.append(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
   state.textContent='PNG frame saved locally. Check player labels before sharing.';
  },'image/png');
 };
 save.onclick=begin;
 cancel.onclick=()=>abort('Clip cancelled. Replay and existing recordings are unchanged.');
 const originalClose=closeReplay;
 closeReplay=function(...args){abort('Clip stopped when replay closed.');stopPreviewing(false);range=null;lastReplay=null;return originalClose(...args);};
 const originalLoad=loadReplay;
 loadReplay=function(...args){abort('Clip stopped when a different replay opened.');stopPreviewing(false);range=null;lastReplay=null;return originalLoad(...args);};
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(capture)abort('Clip stopped when tab was hidden.');stopPreviewing(false);}
 });
 window.setInterval(()=>{
  if(document.hidden||!available())return;
  if(replay!==lastReplay){ensure();activeRange();render();}
  if(markerSource!==replay||markerId!==currentReplayId())refreshGoals();
 },650);
 if(!supported()){save.disabled=true;state.textContent='Video export requires MediaRecorder and canvas capture. PNG and HBR2 playback remain available.';}
})();