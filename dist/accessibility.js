'use strict';
// Client-only accessibility preferences. No account, gameplay, physics or server writes.
(function(){
 const storageKey='fuckball.accessibility.v1';
 const systemContrast=()=>window.matchMedia?.('(prefers-contrast: more)')?.matches===true;
 const systemMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
 const keys=['contrast','large','motion','opaque','teamMarks'];
 const defaults=()=>({contrast:systemContrast(),large:false,motion:systemMotion(),opaque:false,teamMarks:false});
 const root=document.documentElement;
 let preferences=defaults(),explicit=false;
 try{
  const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
  if(saved&&saved.version===1&&typeof saved==='object'&&!Array.isArray(saved)){
   explicit=true;
   for(const key of keys)if(typeof saved[key]==='boolean')preferences[key]=saved[key];
  }
 }catch{/* Storage can be unavailable, e.g. in private browsing. */}
 const classes={contrast:'fb-access-contrast',large:'fb-access-large',motion:'fb-access-motion-reduce',opaque:'fb-access-opaque',teamMarks:'fb-access-team-marks'};
 function apply(){
  for(const key of keys)root.classList.toggle(classes[key],preferences[key]);
  root.classList.toggle('fb-access-motion-allow',!preferences.motion);
 }
 apply();
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
 intro.textContent='Tune the interface for comfort. Gameplay, physics, ratings and online opponents stay exactly the same.';
 const form=document.createElement('form');form.className='fb-access-options';
 const labels={
  contrast:['High-contrast interface','Stronger text, controls and panel borders.'],
  large:['Larger text and touch targets','Readable menus and buttons without resizing the pitch.'],
  motion:['Reduce interface motion','No animated UI effects. Never changes the 60 Hz simulation.'],
  opaque:['Solid menus instead of blur','Keeps the live game visible without frosted overlays.'],
  teamMarks:['Add distinct team symbols','A ◆ for Red and ● for Blue on the scoreboard.']
 };
 const fields={};
 for(const key of keys){
  const row=document.createElement('label');row.className='fb-access-option';
  const check=document.createElement('input');check.type='checkbox';check.name=key;
  const words=document.createElement('span'),name=document.createElement('strong'),hint=document.createElement('small');
  name.textContent=labels[key][0];hint.textContent=labels[key][1];
  words.append(name,hint);row.append(check,words);form.append(row);
  check.addEventListener('change',()=>{
   preferences[key]=check.checked;explicit=true;apply();
   try{localStorage.setItem(storageKey,JSON.stringify({version:1,...preferences}));message.textContent='Saved on this device.';}
   catch{message.textContent='Applied for this visit; browser storage is unavailable.';}
  });
  fields[key]=check;
 }
 const message=document.createElement('p');message.className='fb-access-message';
 message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 const buttons=document.createElement('div');buttons.className='fb-access-actions';
 const reset=document.createElement('button');reset.type='button';reset.textContent='Use device defaults';
 const done=document.createElement('button');done.type='button';done.className='primary';done.textContent='Done';
 buttons.append(reset,done);dialog.append(heading,intro,form,message,buttons);document.body.append(dialog);
 let opener=null;
 function fill(){
  for(const key of keys)fields[key].checked=preferences[key];
  message.textContent=explicit?'Preferences saved only on this device.':'Using device defaults. Changes save only on this device.';
 }
 function open(event){
  opener=event.currentTarget;fill();
  if(typeof dialog.showModal==='function')dialog.showModal();
  else dialog.setAttribute('open','');
  fields.contrast.focus();
 }
 function close(){
  if(typeof dialog.close==='function'&&dialog.open)dialog.close();
  else {dialog.removeAttribute('open');opener?.focus();opener=null;}
 }
 homeTrigger.addEventListener('click',open);
 matchTrigger.addEventListener('click',open);
 done.addEventListener('click',close);
 dialog.addEventListener('close',()=>{opener?.focus();opener=null;});
 dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
 reset.addEventListener('click',()=>{
  preferences=defaults();explicit=false;apply();fill();
  try{localStorage.removeItem(storageKey);}catch{message.textContent='Device defaults applied for this visit.';}
 });
 for(const [query,key] of [['(prefers-contrast: more)','contrast'],['(prefers-reduced-motion: reduce)','motion']]){
  const media=window.matchMedia?.(query);
  media?.addEventListener?.('change',()=>{if(!explicit){preferences[key]=key==='contrast'?systemContrast():systemMotion();apply();fill();}});
 }
})();
