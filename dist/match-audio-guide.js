'use strict';
// Optional player-side score narration. Reads the rendered native scoreboard;
// does not create match events, alter physics, join rooms or export private data.
(function(){
 const match=document.getElementById('matchView');
 const red=document.getElementById('redScore'),blue=document.getElementById('blueScore'),clock=document.getElementById('clock');
 const video=document.querySelector('#menuVideoPane .rm-form');
 if(!match||!red||!blue||!clock||!video)return;
 const KEY='fuckball.match-audio-guide.v1';
 const defaults={captions:false,voice:false,minutes:false};
 function load(){
  try{
   const x=JSON.parse(localStorage.getItem(KEY)||'null');
   return x&&x.version===1&&Object.keys(defaults).every(k=>typeof x[k]==='boolean')?
    {captions:x.captions,voice:x.voice,minutes:x.minutes}:{...defaults};
  }catch{return{...defaults};}
 }
 let prefs=load(),previous=null,captionTimer=0,lastVoice=0,ownSpeech=null,
  previewSpeaking=false;
 const speechAvailable=typeof window.speechSynthesis!=='undefined'&&typeof window.SpeechSynthesisUtterance==='function';
 const section=document.createElement('fieldset');section.className='match-audio-guide-options';
 const legend=document.createElement('legend');legend.textContent='LIVE SCORE GUIDE';
 const note=document.createElement('p');
 note.textContent='Optional local goal captions, spoken score and minute reminders from the real displayed scoreboard. OFF by default. Never claims who scored, never reads chat and never changes gameplay.';
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
 preview.setAttribute('aria-label','Preview score voice on this device');
 preview.addEventListener('click',()=>{
  if(!speechAvailable||!prefs.voice)return;
  speak('Voice preview. Red one, Blue zero.',true);
 });
 const support=document.createElement('p');support.className='match-audio-guide-help';
 support.textContent=speechAvailable?'Voice uses your browser’s speech synthesizer; mute or adjust device volume as usual.':
  'Speech synthesis is unavailable here; visual captions still work.';
 section.prepend(legend,note);section.append(preview,support);video.append(section);
 const caption=document.createElement('aside');caption.className='match-audio-guide-caption';
 caption.setAttribute('role','status');caption.setAttribute('aria-live','polite');caption.hidden=true;
 match.append(caption);
 function stopSpeech(){
  if(ownSpeech&&speechAvailable){
   try{window.speechSynthesis.cancel();}catch{}
  }
  ownSpeech=null;previewSpeaking=false;
 }
 function sync(){
  for(const key of Object.keys(controls))controls[key].checked=prefs[key];
  controls.minutes.disabled=!prefs.voice;
  controls.voice.disabled=!speechAvailable;
  preview.disabled=!speechAvailable||!prefs.voice;
  if(!prefs.captions)caption.hidden=true;
  if(!prefs.voice)stopSpeech();
 }
 sync();
 function visibleActive(){
  // A displayed score is not proof of a currently running match. In particular,
  // the scoreboard stays mounted while local games are paused, during server
  // lobby/rematch voting, and through disconnect/replay transitions.
  if(match.hidden||document.visibilityState!=='visible'||!document.hasFocus()||
   !document.getElementById('pauseMenu')?.hidden||
   typeof replay!=='undefined'&&!!replay)return false;
  if(typeof serverLink!=='undefined'&&serverLink){
   const state=serverLink.roomState;
   return !!serverLink.room&&state?.started===true&&state.paused!==true;
  }
  return typeof started!=='undefined'&&started===true&&
   (typeof paused==='undefined'||paused!==true);
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
   previewSpeaking=explicitPreview;
   const utterance=new window.SpeechSynthesisUtterance(text);utterance.lang='en-GB';
   utterance.rate=1;utterance.pitch=1;utterance.volume=.8;
   ownSpeech=utterance;
   utterance.onend=()=>{if(ownSpeech===utterance){ownSpeech=null;previewSpeaking=false;}};
   utterance.onerror=()=>{if(ownSpeech===utterance){ownSpeech=null;previewSpeaking=false;}};
   window.speechSynthesis.speak(utterance);
  }catch{ownSpeech=null;previewSpeaking=false;}
 }
 function show(text){
  if(!prefs.captions)return;
  clearTimeout(captionTimer);caption.textContent=text;caption.hidden=false;
  captionTimer=setTimeout(()=>{caption.hidden=true;},4200);
 }
 function silenceAndRebaseline(){
  previous=null;stopSpeech();caption.hidden=true;
  if(captionTimer){clearTimeout(captionTimer);captionTimer=0;}
 }
 function poll(){
  if(!visibleActive()){
   // An explicit Voice Preview is allowed while the settings menu is open.
   // It is still cancelled immediately by blur, tab changes or navigation.
   if(!previewSpeaking)silenceAndRebaseline();
   return;
  }
  const current=sample();if(!current){previous=null;return;}
  const last=previous;previous=current;
  if(!last)return;
  if(current.time<last.time-2||current.time-last.time>3)return; // seek/reset/stale render
  const dr=current.red-last.red,db=current.blue-last.blue;
  if((dr===1&&db===0)||(db===1&&dr===0)){
   const team=dr===1?'Red':'Blue';
   const text=team+' scores. Red '+current.red+', Blue '+current.blue+'.';
   show(text);speak(text);return;
  }
  if(dr!==0||db!==0)return;
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
 const menu=document.getElementById('pauseMenu');
 if(typeof MutationObserver==='function'){
  const visibilityObserver=new MutationObserver(()=>{
   if(!visibleActive())silenceAndRebaseline();
  });
  visibilityObserver.observe(match,{attributes:true,attributeFilter:['hidden']});
  if(menu)visibilityObserver.observe(menu,{attributes:true,attributeFilter:['hidden']});
 }
})();