'use strict';
// User-requested, field-only WebM exports from LOCAL HBR2 playback.
// No account, server result, external upload, screenshots or system audio.
(function(){
 const controls=document.getElementById('replayControls');
 const canvas=document.getElementById('gameCanvas');
 if(!controls||!canvas)return;
 const row=document.createElement('div');row.className='replay-clip-tools';
 const save=document.createElement('button');save.type='button';
 save.className='replay-clip-export';save.textContent='⬇ Save 10s field clip';
 save.title='Export 10 seconds from the current replay position as a WebM video, without audio';
 const frame=document.createElement('button');frame.type='button';
 frame.className='replay-frame-export';frame.textContent='⬇ Save frame · PNG';
 frame.title='Capture the visible replay field as a PNG; player labels may be included';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel clip';
 cancel.hidden=true;
 const state=document.createElement('span');state.setAttribute('role','status');
 state.setAttribute('aria-live','polite');state.className='replay-clip-status';
 state.textContent='Exports visible field pixels, including player-name labels if shown. No audio or upload; review before sharing.';
 row.append(save,frame,cancel,state);
 controls.append(row);
 const MAX_VIDEO=48*1024*1024,CLIP_MS=10000;
 let capture=null;
 const supported=()=>typeof MediaRecorder!=='undefined'&&
  typeof canvas.captureStream==='function'&&typeof URL.createObjectURL==='function';
 function formatRemaining(ms){return Math.max(0,Math.ceil(ms/1000))+'s';}
 function type(){
  return ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']
   .find(value=>{try{return MediaRecorder.isTypeSupported(value);}catch{return false;}})||'';
 }
 function cleanup(session,discard=false){
  if(session.timer)clearTimeout(session.timer);
  if(session.pulse)clearInterval(session.pulse);
  if(discard)session.discard=true;
  try{if(session.recorder.state!=='inactive')session.recorder.stop();}catch{}
  try{session.stream.getTracks().forEach(track=>track.stop());}catch{}
  if(capture===session){
   capture=null;save.disabled=false;cancel.hidden=true;
  }
 }
 function abort(message){
  if(capture)cleanup(capture,true);
  state.textContent=message;
 }
 async function begin(){
  if(capture||!replay||controls.hidden)return;
  if(!supported()){state.textContent='Video recording is unavailable in this browser. HBR2 playback still works.';return;}
  const left=replay.length()-replay.getTime();
  if(!Number.isFinite(left)||left<1500){
   state.textContent='Seek earlier in the recording before exporting a clip.';return;
  }
  const duration=Math.min(CLIP_MS,left);
  const session={recorder:null,stream:null,timer:null,pulse:null,discard:false,parts:[],size:0,
   start:performance.now(),duration,name:'fuckball-replay-'+new Date().toISOString().replace(/[:.]/g,'-')+'.webm'};
  try{
   session.stream=canvas.captureStream(30);
   if(!session.stream.getVideoTracks().length)throw Error('Canvas capture did not provide video.');
   const format=type();
   session.recorder=new MediaRecorder(session.stream,format?{mimeType:format}:undefined);
   session.recorder.ondataavailable=event=>{
    if(session.discard||!event.data?.size)return;
    session.size+=event.data.size;
    if(session.size>MAX_VIDEO){session.discard=true;state.textContent='Clip exceeded 48 MB. Recording discarded.';cleanup(session,true);return;}
    session.parts.push(event.data);
   };
   session.recorder.onerror=()=>{
    session.discard=true;state.textContent='Video capture failed. Replay is unaffected.';
    cleanup(session,true);
   };
   session.recorder.onstop=()=>{
    try{
     if(session.discard||!session.parts.length)return;
     const blob=new Blob(session.parts,{type:'video/webm'});
     if(!blob.size||blob.size>MAX_VIDEO)throw Error('Clip could not be saved within the 48 MB limit.');
     const url=URL.createObjectURL(blob),link=document.createElement('a');
     link.href=url;link.download=session.name;document.body.append(link);link.click();link.remove();
     setTimeout(()=>URL.revokeObjectURL(url),60000);
     state.textContent='WebM clip downloaded. It may show player-name labels; review before sharing. Not ranked footage.';
    }catch(error){state.textContent=error?.message||'Video download failed.';}
   };
   // Preserve the recorded replay, not the player simulation or networking path.
   replay.setSpeed(1);document.getElementById('replayToggle').textContent='Ⅱ';
   document.getElementById('replaySpeed').value='1';
   capture=session;save.disabled=true;cancel.hidden=false;
   session.recorder.start(1000);
   session.pulse=setInterval(()=>{
    if(capture!==session)return;
    state.textContent='Recording field video · '+formatRemaining(duration-(performance.now()-session.start))+' left';
   },250);
   session.timer=setTimeout(()=>{if(capture===session)cleanup(session);},duration);
   state.textContent='Recording field video · '+formatRemaining(duration)+' left';
  }catch(error){
   if(session.recorder&&session.stream)cleanup(session,true);
   else session.stream?.getTracks().forEach(track=>track.stop());
   state.textContent='Clip export unavailable: '+(error?.message||'video capture not supported');
  }
 }
 frame.onclick=()=>{
  if(!replay||controls.hidden||typeof canvas.toBlob!=='function'){
   state.textContent='Open a local replay in a browser with canvas capture before saving a frame.';return;
  }
  frame.disabled=true;
  canvas.toBlob(blob=>{
   frame.disabled=false;
   if(!blob||!blob.size){state.textContent='Could not capture a replay frame.';return;}
   const url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download='fuckball-replay-frame-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';
   document.body.append(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
   state.textContent='PNG frame saved locally; check visible player labels before sharing.';
  },'image/png');
 };
 save.onclick=begin;
 cancel.onclick=()=>abort('Clip cancelled. Replay and existing recordings were not changed.');
 const oldClose=closeReplay;
 closeReplay=function(){abort('Clip stopped because replay closed.');oldClose();};
 const oldLoad=loadReplay;
 loadReplay=function(...args){if(capture)abort('Clip stopped because a different replay opened.');return oldLoad(...args);};
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&capture)abort('Clip stopped when the tab became hidden.');});
 if(!supported()){save.disabled=true;state.textContent='WebM clip export requires a browser with MediaRecorder and canvas capture.';}
})();
