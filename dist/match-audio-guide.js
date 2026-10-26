'use strict';
// Optional player-side score narration. Reads the rendered native scoreboard;
// does not create match events, alter physics, join rooms or export private data.
(function(){
 const match=document.getElementById('matchView');
 const red=document.getElementById('redScore'),blue=document.getElementById('blueScore'),clock=document.getElementById('clock');
 const video=document.querySelector('#menuVideoPane .rm-form');
 if(!match||!red||!blue||!clock||!video)return;
 const KEY='fuckball.match-audio-guide.v1';
 const menu=document.getElementById('pauseMenu');
 const videoPane=document.getElementById('menuVideoPane');
 const networkDialog=document.getElementById('networkDialog');
 const joinScreen=document.getElementById('joinScreen');
 function overlayOpen(){
  // A locally visible pitch behind a modal is not a foreground match.
  // Never narrate scores through connection or account/join overlays.
  if(networkDialog?.open===true||joinScreen?.hidden===false)return true;
  return !!document.querySelector('dialog[open]');
 }
 function canPreview(){
  // Explicit voice previews belong to the currently visible Settings pane,
  // not to a prior tab, a hidden game or a background browser window.
  return match.hidden===false&&menu?.hidden===false&&
   videoPane?.hidden===false&&document.visibilityState==='visible'&&
   document.hasFocus()&&!overlayOpen();
 }
 const defaults={captions:false,voice:false,minutes:false};
 function load(){
  try{
   const x=JSON.parse(localStorage.getItem(KEY)||'null');
   return x&&x.version===1&&Object.keys(defaults).every(k=>typeof x[k]==='boolean')?
    {captions:x.captions,voice:x.voice,minutes:x.minutes}:{...defaults};
  }catch{return{...defaults};}
 }
 let prefs=load(),previous=null,captionTimer=0,lastVoice=0,ownSpeech=null,
  previewSpeaking=false,observedSource=null,lastSampleSequence=null;
 function sourceLabel(text){
  if(provenance.textContent!==text)provenance.textContent=text;
 }
 const speechAvailable=typeof window.speechSynthesis!=='undefined'&&typeof window.SpeechSynthesisUtterance==='function';
 const section=document.createElement('fieldset');section.className='match-audio-guide-options';
 const legend=document.createElement('legend');legend.textContent='LIVE SCORE GUIDE';
 const note=document.createElement('p');
 note.textContent='Optional goal captions, spoken score and minute reminders from the live scoreboard. OFF by default. Online cues stop when fresh game frames stop arriving. Never claims who scored, reads chat or changes gameplay.';
 const controls={};
 for(const [key,title,hint] of [
  ['captions','Goal captions','Readable short-lived pitch caption when the displayed native score increases.'],
  ['voice','Speak goals','Use this browser’s on-device speech output if supported.'],
  ['minutes','Speak minutes','Optional elapsed match minute reminders; requires spoken goals enabled.']
 ]){
  const row=document.createElement('label');row.className='match-audio-guide-option';
  const check=document.createElement('input');check.type='checkbox';
  check.checked=prefs[key];check.disabled=key==='voice'&&!speechAvailable;
  const words=document.createElement('span'),bold=document.createElement('strong'),small=document.createElement('small');
  bold.textContent=title;small.textContent=hint;words.append(bold,small);row.append(check,words);
  section.append(row);controls[key]=check;
  check.addEventListener('change',()=>{
   prefs[key]=check.checked;
   if(key==='voice'&&!prefs.voice)stopSpeech();
   try{localStorage.setItem(KEY,JSON.stringify({version:1,...prefs}));}catch{}
   sync();previous=null;
  });
 }
 // One explicit, on-device voice preview lets players verify their browser's
 // speech output before entering live play. Never simulate a goal or change
 // the official scoreboard in order to provide this preview.
 const preview=document.createElement('button');
 preview.type='button';preview.className='match-audio-guide-preview';
 preview.textContent='▶ Preview voice';
 preview.setAttribute('aria-label','Preview or stop the on-device score voice');
 preview.setAttribute('aria-pressed','false');
 function syncPreviewButton(){
  preview.textContent=previewSpeaking?'■ Stop preview':'▶ Preview voice';
  preview.setAttribute('aria-pressed',String(previewSpeaking));
 }
 preview.addEventListener('click',()=>{
  if(previewSpeaking){stopSpeech();return;}
  if(!speechAvailable||!prefs.voice||!canPreview())return;
  speak('Voice preview. Red one, Blue zero.',true);
 });
 const support=document.createElement('p');support.className='match-audio-guide-help';
 support.textContent=speechAvailable?'Voice uses your browser’s speech synthesizer; mute or adjust device volume as usual.':
  'Speech synthesis is unavailable here; visual captions still work.';
 const provenance=document.createElement('p');
 provenance.className='match-audio-guide-provenance';
 provenance.setAttribute('role','status');
 provenance.setAttribute('aria-live','polite');
 provenance.textContent='Awaiting a visible, current match scoreboard.';
 section.prepend(legend,note);section.append(preview,support,provenance);video.append(section);
 const caption=document.createElement('aside');caption.className='match-audio-guide-caption';
 caption.setAttribute('role','status');caption.setAttribute('aria-live','polite');caption.hidden=true;
 match.append(caption);
 function stopSpeech(){
  if(ownSpeech&&speechAvailable){
   try{window.speechSynthesis.cancel();}catch{}
  }
  ownSpeech=null;previewSpeaking=false;syncPreviewButton();
 }
 function sync(){
  for(const key of Object.keys(controls))controls[key].checked=prefs[key];
  controls.minutes.disabled=!prefs.voice;
  controls.voice.disabled=!speechAvailable;
  preview.disabled=!speechAvailable||!prefs.voice;
  if(!prefs.captions)caption.hidden=true;
  if(!prefs.voice)stopSpeech();
  syncPreviewButton();
 }
 sync();
 function visibleActive(){
  // A displayed score is not proof of a currently running match. In particular,
  // the scoreboard stays mounted while local games are paused, during server
  // lobby/rematch voting, and through disconnect/replay transitions.
  if(match.hidden||document.visibilityState!=='visible'||!document.hasFocus()||
   !document.getElementById('pauseMenu')?.hidden||
   typeof replay!=='undefined'&&!!replay||overlayOpen())return false;
  if(typeof serverLink!=='undefined'&&serverLink){
   const state=serverLink.roomState;
   return !!serverLink.room&&state?.started===true&&state.paused!==true;
  }
  return typeof started!=='undefined'&&started===true&&
   (typeof paused==='undefined'||paused!==true);
 }
 // The DOM scoreboard is not an authoritative event stream. Require an
 // admitted and currently snapshotted native session, or a real local/peer
 // game, and key each observation to its transport and server-issued round.
 // Numeric player IDs, room codes and a reused clock are not enough to
 // distinguish different human matches.
// A snapshot received once is not proof a multiplayer score is still live.
 // Only a recently applied actual frame may ground further speech/captions.
 function freshReceivedFrame(){
  if(typeof net==='undefined'||!Number.isSafeInteger(net.receivedSequence)||
     net.receivedSequence<1||!Number.isFinite(net.lastSnapshot)||
     net.lastSnapshot<=0)return false;
  const elapsed=performance.now()-net.lastSnapshot;
  return elapsed>=0&&elapsed<=1600;
 }
 function currentScoreSource(){
  if(typeof serverLink!=='undefined'&&serverLink){
   const link=serverLink;
   if(!link.room||link.ws?.readyState!==1||link.roomState?.started!==true)
    return null;
   if(!freshReceivedFrame())return null;
   if(link.roomState.room&&link.roomState.room!==link.room)return null;
   const round=Number.isSafeInteger(link.roomState.round)&&link.roomState.round>=0?
    link.roomState.round:null;
   return{kind:'native',transport:link,room:link.room,round,
    sequence:net.receivedSequence};
  }
  if(typeof peerConnected!=='undefined'&&peerConnected){
   const transport=typeof channel!=='undefined'&&channel?channel:
    typeof peer!=='undefined'?peer:null;
   if(!transport)return null;
   // Hosts have locally authoritative physics; direct-peer guests need
   // fresh actual input snapshots rather than a stored scoreboard.
   const guest=typeof peerRole!=='undefined'&&peerRole==='guest';
   if(guest&&!freshReceivedFrame())return null;
   return{kind:'peer',transport,room:null,round:null,
    sequence:guest?net.receivedSequence:null};
  }
  if(typeof room==='undefined'||!room)return null;
  return{kind:'local',transport:room,room:null,round:null,sequence:null};
 }
 function sameScoreSource(a,b){
  return !!a&&!!b&&a.kind===b.kind&&a.transport===b.transport&&
   a.room===b.room&&a.round===b.round;
 }
 function sample(){
  const r=Number(red.textContent.trim()),b=Number(blue.textContent.trim());
  const time=clock.textContent.trim();
  const m=/^(\d{1,3}):([0-5]\d)$/.exec(time);
  if(!Number.isSafeInteger(r)||!Number.isSafeInteger(b)||r<0||b<0||r>999||b>999||!m)return null;
  return{red:r,blue:b,time:Number(m[1])*60+Number(m[2])};
 }
 function speak(text,explicitPreview=false){
  if(!prefs.voice||!speechAvailable||!explicitPreview&&!visibleActive())return;
  const now=Date.now();
  if(!explicitPreview&&now-lastVoice<1450)return;
  lastVoice=now;
  try{
   if(ownSpeech)window.speechSynthesis.cancel();
   previewSpeaking=explicitPreview;syncPreviewButton();
   const utterance=new window.SpeechSynthesisUtterance(text);utterance.lang='en-GB';
   utterance.rate=1;utterance.pitch=1;utterance.volume=.8;
   ownSpeech=utterance;
   utterance.onend=()=>{
    if(ownSpeech===utterance){ownSpeech=null;previewSpeaking=false;syncPreviewButton();}
   };
   utterance.onerror=()=>{
    if(ownSpeech===utterance){ownSpeech=null;previewSpeaking=false;syncPreviewButton();}
   };
   window.speechSynthesis.speak(utterance);
  }catch{ownSpeech=null;previewSpeaking=false;syncPreviewButton();}
 }
 function show(text){
  if(!prefs.captions)return;
  clearTimeout(captionTimer);caption.textContent=text;caption.hidden=false;
  captionTimer=setTimeout(()=>{caption.hidden=true;},4200);
 }
 function silenceAndRebaseline(){
  previous=null;lastSampleSequence=null;stopSpeech();caption.hidden=true;
  if(captionTimer){clearTimeout(captionTimer);captionTimer=0;}
 }
 function poll(){
  const active=visibleActive();
  if(previewSpeaking&&(active||!canPreview())){
   // A preview may never outlive Settings, its current window or a dialog
   // transition. Also stop it before a genuine match becomes audible.
   stopSpeech();
  }
  if(!active){
   // An explicit, visible voice preview is not a game event. All hidden or
   // obscured games are silenced and reset before any further score cue.
   if(!previewSpeaking)silenceAndRebaseline();
   observedSource=null;
   sourceLabel(previewSpeaking?
    'On-device voice preview · not a verified score event.':
    'Paused · only a visible active match can produce score cues.');
   return;
  }
  const identity=currentScoreSource();
  if(!identity){
   observedSource=null;
   silenceAndRebaseline();
   sourceLabel('Waiting for fresh verified match frames · no score cues while the connection is stale.');
   return;
  }
  const current=sample();
  if(!current){
   observedSource=null;
   silenceAndRebaseline();
   sourceLabel('Scoreboard unavailable · no goal announcements.');
   return;
  }
  if(!sameScoreSource(observedSource,identity)){
   // The first score after a connection, room or round change is ONLY a
   // baseline. Never narrate it as a new goal from the previous session.
   silenceAndRebaseline();
   observedSource=identity;
   previous=current;
   lastSampleSequence=identity.sequence;
   sourceLabel(identity.kind==='native'?
    'Current admitted online room · '+(identity.round===null?
     'server round not supplied':'server round '+identity.round)+
     ' · live snapshot received.':
    identity.kind==='peer'?'Current direct-peer match · live scoreboard.':
     'Current local match · live scoreboard.');
   return;
  }
  if(identity.sequence!==null){
   // Re-reading the same scoreboard without a new native/guest packet
   // cannot justify another spoken human goal.
   if(identity.sequence===lastSampleSequence)return;
   if(lastSampleSequence!==null&&identity.sequence<lastSampleSequence){
    silenceAndRebaseline();previous=current;
    lastSampleSequence=identity.sequence;return;
   }
   lastSampleSequence=identity.sequence;
  }
  const last=previous;previous=current;
  if(!last)return;
  if(current.time<last.time-2||current.time-last.time>3){
   // Large jumps are a reset, stale render or time discontinuity, not
   // independently verified goal events.
   silenceAndRebaseline();previous=current;return;
  }
  const dr=current.red-last.red,db=current.blue-last.blue;
  if((dr===1&&db===0)||(db===1&&dr===0)){
   const team=dr===1?'Red':'Blue';
   const text=team+' scores. Red '+current.red+', Blue '+current.blue+'.';
   show(text);speak(text);return;
  }
  if(dr!==0||db!==0){
   // Corrections, resets and multiple-goal jumps must not generate a
   // misleading one-goal narration on the next frame.
   if(dr<0||db<0){stopSpeech();caption.hidden=true;}
   return;
  }
  if(prefs.minutes&&prefs.voice&&Math.floor(current.time/60)>Math.floor(last.time/60)&&
   current.time>=60){
   speak(Math.floor(current.time/60)+' minute'+(current.time>=120?'s':'')+' played.');
  }
 }
 setInterval(poll,350);
 window.addEventListener('storage',event=>{
  if(event.key!==KEY)return;
  prefs=load();sync();silenceAndRebaseline();
 });
 // Do not continue speech after leaving the game, switching applications or
 // closing the tab. On return, sample the real authoritative score as a fresh
 // baseline rather than announcing changes that happened while away.
 window.addEventListener('blur',silenceAndRebaseline);
 window.addEventListener('focus',silenceAndRebaseline);
 document.addEventListener('visibilitychange',silenceAndRebaseline);
 window.addEventListener('pagehide',silenceAndRebaseline);
 window.addEventListener('fuckball:native-session-state',()=>{
  // This event is emitted when the authoritative socket is replaced or
  // terminated; kill any previous spoken result immediately.
  observedSource=null;silenceAndRebaseline();
  sourceLabel('Room changed · waiting for the current match scoreboard.');
 });
 if(typeof MutationObserver==='function'){
  const visibilityObserver=new MutationObserver(()=>{
   if(!visibleActive())silenceAndRebaseline();
  });
  visibilityObserver.observe(match,{attributes:true,attributeFilter:['hidden']});
  if(menu)visibilityObserver.observe(menu,{attributes:true,attributeFilter:['hidden']});
  if(videoPane)visibilityObserver.observe(videoPane,{attributes:true,attributeFilter:['hidden']});
  if(networkDialog)visibilityObserver.observe(networkDialog,{attributes:true,attributeFilter:['open']});
  if(joinScreen)visibilityObserver.observe(joinScreen,{attributes:true,attributeFilter:['hidden']});
 }
 // View and dialog changes silence any voice immediately (not only when the
 // 350ms score polling interval next wakes up).
 for(const id of ['tabHome','tabPlay','tabGames','menuMatch','menuHelp','menuVideo']){
  document.getElementById(id)?.addEventListener('click',()=>{
   if(previewSpeaking&&!canPreview())stopSpeech();
   if(!visibleActive()&&!previewSpeaking)silenceAndRebaseline();
  });
 }
})();