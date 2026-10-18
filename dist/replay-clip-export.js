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
 const nameLabel=document.createElement('label');nameLabel.textContent='Optional clip title';
 const title=document.createElement('input');title.type='text';title.maxLength=60;
 title.placeholder='My football highlight';title.setAttribute('aria-label','Clip filename title');
 nameLabel.append(title);
 const preview=document.createElement('button');preview.type='button';preview.textContent='▶ Preview range';
 const stopPreview=document.createElement('button');stopPreview.type='button';stopPreview.textContent='■ Stop preview';
 stopPreview.hidden=true;
 const previewRow=document.createElement('div');previewRow.className='replay-clip-preview';
 previewRow.append(preview,stopPreview);
 body.append(note,points,readout,nameLabel,previewRow);editor.append(heading,body);
 row.append(save,frame,cancel,state);controls.append(editor,row);
 const MAX_VIDEO=48*1024*1024,MAX_DURATION=10000,MIN_DURATION=1500;
 let capture=null,previewing=null,range=null,lastReplay=null;
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
 },650);
 if(!supported()){save.disabled=true;state.textContent='Video export requires MediaRecorder and canvas capture. PNG and HBR2 playback remain available.';}
})();