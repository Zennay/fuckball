'use strict';
// Client-only accessibility preferences. No account, gameplay, physics or server writes.
(function(){
 const storageKey='fuckball.accessibility.v1';
 const systemContrast=()=>window.matchMedia?.('(prefers-contrast: more)')?.matches===true;
 const systemMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
 const keys=['contrast','large','motion','opaque','teamMarks'];
 const defaults=()=>({contrast:systemContrast(),large:false,motion:systemMotion(),opaque:false,teamMarks:false});
 const root=document.documentElement;
 // Native dialogs take focus away from the pitch. The global input gate
 // prevents NEW input while they are open, but input from a held key, stick
 // or gamepad can remain latched if no keyup/pointerup is delivered.
 // A single read-only DOM observer neutralizes the original input seats
 // at the transition to an open dialog; it never pauses a shared match.
 function neutralizeGameControls(){
  if(typeof releaseInputs==='function')releaseInputs();
 }
 let hadOpenDialog=!!document.querySelector('dialog[open]');
 if(typeof MutationObserver!=='undefined'&&document.body){
  const modalGuard=new MutationObserver(()=>{
   const isOpen=!!document.querySelector('dialog[open]');
   if(isOpen&&!hadOpenDialog)neutralizeGameControls();
   hadOpenDialog=isOpen;
  });
  modalGuard.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
 }
 // Overrides are per setting. Changing button size must not unexpectedly
 // freeze the OS's reduced-motion or higher-contrast preference.
 let overrides={},preferences=defaults();
 function restore(){
  overrides={};
  try{
   const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
   if(!saved||typeof saved!=='object'||Array.isArray(saved))return;
   // V1 saved all effective booleans, so preserve the user's original
   // experience by treating those explicit values as legacy overrides.
   const values=saved.version===2?saved.overrides:
    saved.version===1?saved:null;
   if(!values||typeof values!=='object'||Array.isArray(values))return;
   for(const key of keys)if(typeof values[key]==='boolean')overrides[key]=values[key];
  }catch{/* Storage is optional, including in private browsing. */}
 }
 const resolved=()=>({...defaults(),...overrides});
 restore();
 const classes={contrast:'fb-access-contrast',large:'fb-access-large',motion:'fb-access-motion-reduce',opaque:'fb-access-opaque',teamMarks:'fb-access-team-marks'};
 function apply(){
  preferences=resolved();
  for(const key of keys)root.classList.toggle(classes[key],preferences[key]);
  root.classList.toggle('fb-access-motion-allow',!preferences.motion);
 }
 apply();
 // The visible pitch scoreboard has only colored, detached spans. Give a
 // screen reader one truthful, current, human-readable *displayed* snapshot.
 // This is not a server receipt or a new score/goal event.
 const scoreboard=document.querySelector('#matchView .scoreboard');
 const redScore=document.getElementById('redScore');
 const blueScore=document.getElementById('blueScore');
 const matchClock=document.getElementById('clock');
 const redTeam=scoreboard?.querySelector('.team-name.red');
 const blueTeam=scoreboard?.querySelector('.team-name.blue');
 function readDisplayedScore(){
  if(!scoreboard||!redScore||!blueScore||!matchClock)
   return 'The match scoreboard is not available in this view.';
  const red=redScore.textContent.trim(),blue=blueScore.textContent.trim(),
   time=matchClock.textContent.trim();
  if(!/^\d{1,3}$/.test(red)||!/^\d{1,3}$/.test(blue)||
     !/^\d{1,3}:[0-5]\d$/.test(time))
   return 'The displayed scoreboard is not ready yet.';
  return 'Displayed scoreboard: Red '+red+', Blue '+blue+
   '. Displayed match clock '+time+'.';
 }
 function syncScoreDescription(){
  if(!scoreboard)return;
  scoreboard.setAttribute('role','group');
  scoreboard.setAttribute('aria-live','off');
  const desc=readDisplayedScore();
  if(scoreboard.getAttribute('aria-label')!==desc)
   scoreboard.setAttribute('aria-label',desc);
  if(redTeam)redTeam.setAttribute('aria-label',
   preferences.teamMarks?'Red team, diamond marker':'Red team');
  if(blueTeam)blueTeam.setAttribute('aria-label',
   preferences.teamMarks?'Blue team, circle marker':'Blue team');
 }
 syncScoreDescription();
 if(scoreboard&&typeof MutationObserver==='function'){
  const observed=new MutationObserver(syncScoreDescription);
  // The clock and numeric score are authoritative only as displayed;
  // never observe our own ARIA attributes or infer unseen goal events.
  for(const target of [redScore,blueScore,matchClock])
   if(target)observed.observe(target,{childList:true,characterData:true,subtree:true});
 }
 const homeTrigger=document.createElement('button');
 homeTrigger.type='button';homeTrigger.id='accessibilityButton';
 homeTrigger.textContent='Aa';homeTrigger.setAttribute('aria-label','Accessibility preferences');
 homeTrigger.title='Accessibility preferences';
 const header=document.querySelector('.club-header .profile');
 const before=document.getElementById('helpButton');
 if(header)header.insertBefore(homeTrigger,before||null);
 const matchTrigger=document.createElement('button');
 matchTrigger.type='button';matchTrigger.id='matchAccessibilityButton';
 matchTrigger.className='hud-button';matchTrigger.textContent='Aa';
 matchTrigger.setAttribute('aria-label','Accessibility preferences');
 matchTrigger.title='Accessibility preferences';
 const menuButton=document.getElementById('matchMenuButton');
 if(menuButton?.parentElement)menuButton.parentElement.insertBefore(matchTrigger,menuButton);
 if(!header&&!menuButton)return;
 const dialog=document.createElement('dialog');
 dialog.className='fb-access-dialog';dialog.setAttribute('aria-labelledby','fbAccessTitle');
 const heading=document.createElement('h2');heading.id='fbAccessTitle';heading.textContent='Accessibility';
 const intro=document.createElement('p');
 intro.textContent='Choose only what you need. Unchanged contrast and motion follow your device automatically; gameplay, physics and online opponents stay the same.';
 const form=document.createElement('form');form.className='fb-access-options';
 const labels={
  contrast:['High-contrast interface','Stronger text, controls and panel borders.'],
  large:['Larger text and touch targets','Readable menus and buttons without resizing the pitch.'],
  motion:['Reduce interface motion','No animated UI effects. Never changes the 60 Hz simulation.'],
  opaque:['Solid menus instead of blur','Keeps the live game visible without frosted overlays.'],
  teamMarks:['Add distinct team symbols','A ◆ for Red and ● for Blue on the scoreboard.']
 };
 const fields={},origins={};
 for(const key of keys){
  const row=document.createElement('label');row.className='fb-access-option';
  const check=document.createElement('input');check.type='checkbox';check.name=key;
  const words=document.createElement('span'),name=document.createElement('strong'),hint=document.createElement('small');
  name.textContent=labels[key][0];hint.textContent=labels[key][1];
  const origin=document.createElement('em');origin.className='fb-access-origin';
  words.append(name,hint,origin);row.append(check,words);form.append(row);
  check.addEventListener('change',()=>{
   overrides[key]=check.checked;
   apply();syncScoreDescription();fill();
   try{
    localStorage.setItem(storageKey,JSON.stringify({version:2,overrides}));
    message.textContent='Saved on this device. Unchanged settings still follow the device.';
   }catch{message.textContent='Applied for this visit; browser storage is unavailable.';}
  });
  fields[key]=check;origins[key]=origin;
 }
 const message=document.createElement('p');message.className='fb-access-message';
 message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 const buttons=document.createElement('div');buttons.className='fb-access-actions';
 const reset=document.createElement('button');reset.type='button';reset.textContent='Use device defaults';
 const done=document.createElement('button');done.type='button';done.className='primary';done.textContent='Done';
 const scoreReview=document.createElement('div');
 scoreReview.className='fb-access-score-review';
 const scoreReviewButton=document.createElement('button');
 scoreReviewButton.type='button';
 scoreReviewButton.textContent='Read displayed match score';
 scoreReviewButton.setAttribute('aria-label','Read current displayed red and blue score and match clock');
 const scoreReviewStatus=document.createElement('p');
 scoreReviewStatus.setAttribute('role','status');
 scoreReviewStatus.setAttribute('aria-live','polite');
 scoreReviewStatus.textContent='Score review is on demand. It reads the visible scoreboard, not a new server event.';
 scoreReviewButton.addEventListener('click',()=>{
  scoreReviewStatus.textContent=readDisplayedScore();
 });
 scoreReview.append(scoreReviewButton,scoreReviewStatus);
 buttons.append(reset,done);
 dialog.append(heading,intro,form,scoreReview,message,buttons);
 document.body.append(dialog);
 let opener=null;
 function fill(){
  for(const key of keys){
   fields[key].checked=preferences[key];
   const custom=Object.prototype.hasOwnProperty.call(overrides,key);
   origins[key].textContent=custom?'Your preference':
    key==='contrast'||key==='motion'?'Follows device':'Default';
   origins[key].dataset.source=custom?'custom':'device';
  }
  message.textContent=Object.keys(overrides).length?
   'Your selected options are saved only on this device. Other options follow defaults.':
   'Using device defaults. Change any option to customize just that setting.';
 }
 function open(event){
  if(dialog.open)return;
  opener=event.currentTarget;fill();
  // Release held keyboard/touch/gamepad inputs BEFORE focus crosses into
  // the modal. This also covers browsers where MutationObserver callbacks
  // are delayed until after the next paint.
  neutralizeGameControls();
  if(typeof dialog.showModal==='function')dialog.showModal();
  else dialog.setAttribute('open','');
  message.textContent='Match controls are released while settings are open. The game continues normally for other players.';
  fields.contrast.focus();
 }
 function close(){
  if(typeof dialog.close==='function'&&dialog.open)dialog.close();
  else {dialog.removeAttribute('open');opener?.focus();opener=null;}
 }
 // Native dialogs handle Escape themselves. Legacy/fallback browsers need
 // a keyboard escape route that restores the original trigger focus.
 dialog.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&typeof dialog.close!=='function'){
   event.preventDefault();close();
  }
 });
 homeTrigger.addEventListener('click',open);
 matchTrigger.addEventListener('click',open);
 done.addEventListener('click',close);
 dialog.addEventListener('close',()=>{
  // No modal should leave a held kick/movement active on return to the pitch.
  neutralizeGameControls();
  opener?.focus();opener=null;
 });
 dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
 reset.addEventListener('click',()=>{
  overrides={};apply();syncScoreDescription();fill();
  try{localStorage.removeItem(storageKey);}catch{message.textContent='Device defaults applied for this visit.';}
 });
 for(const [query,key] of [['(prefers-contrast: more)','contrast'],['(prefers-reduced-motion: reduce)','motion']]){
  const media=window.matchMedia?.(query);
  media?.addEventListener?.('change',()=>{
   if(!Object.prototype.hasOwnProperty.call(overrides,key)){
    apply();syncScoreDescription();fill();
   }
  });
 }
 // A second tab changes preferences without reloading the running game.
 // Never sync a user's session, controls, match, chat or server data.
 window.addEventListener('storage',event=>{
// Reset to OS/device defaults when another tab calls localStorage.clear().
  // Also keep main's accessible read-only score review synchronized.
  if(event.key!==storageKey&&event.key!==null)return;
  restore();apply();syncScoreDescription();fill();
  scoreReviewStatus.textContent='Settings synchronized. Use Read displayed match score to review the visible score.';
  message.textContent='Accessibility preferences synchronized from another tab.';
 });
})();

/* Bootstrap the standalone, privacy-bounded player setup passport without
 * claiming the active Clubs owner's dist/index.html integration path. */
(function(){
 const script=document.createElement('script');
 script.src=new URL('./personal-setup-passport.js',document.currentScript?.src||document.baseURI).href;
 script.async=false;
 document.head.append(script);
})();
