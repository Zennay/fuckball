'use strict';
// Lightweight on-pitch shortcuts to EXISTING user-triggered match tools.
// No extra room access, recordings, network requests or gameplay authority.
(function(){
 const match=document.getElementById('matchView');
 const toolbar=match?.querySelector('.hud-top-right');
 if(!match||!toolbar)return;
 const trigger=document.createElement('button');trigger.type='button';
 trigger.className='hud-button in-game-quick-trigger';
 trigger.textContent='⋯ QUICK';
 trigger.setAttribute('aria-label','Open in-game quick actions');
 trigger.setAttribute('aria-expanded','false');
 trigger.setAttribute('aria-controls','fbQuickActions');
 trigger.title='Shortcuts to existing scoreboard, connection, moments and room menu';
 toolbar.append(trigger);
 const sheet=document.createElement('section');sheet.id='fbQuickActions';
 sheet.className='in-game-quick-sheet';sheet.hidden=true;
 sheet.setAttribute('aria-label','In-game quick actions');
 const heading=document.createElement('div');heading.className='in-game-quick-heading';
 const title=document.createElement('strong');title.textContent='MATCH QUICK ACTIONS';
 const dismiss=document.createElement('button');dismiss.type='button';
 dismiss.textContent='✕';dismiss.setAttribute('aria-label','Close match quick actions');
 heading.append(title,dismiss);
 const intro=document.createElement('p');intro.textContent=
  'Your player stands still while you choose. The match clock keeps running. Nothing is shared, saved or paused unless you choose that tool.';
 const grid=document.createElement('div');grid.className='in-game-quick-grid';
 const feedback=document.createElement('p');feedback.className='in-game-quick-feedback';
 feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 sheet.append(heading,intro,grid,feedback);
 match.append(sheet);
 function busy(){
  return match.hidden||
   document.getElementById('pauseMenu')?.hidden===false||
   !!document.querySelector('dialog[open]');
 }
 // A non-modal HUD sheet must still own the human input surface while open.
 // One global flag is read by the existing shared gameplay input gate, which
 // covers keyboard, touch, gamepads, P2 and the full four-person couch mode.
 let opened=false;
 window.fuckballQuickActionsOpen=false;
 function neutralizeHumanSeats(){
  if(typeof releaseInputs==='function')releaseInputs();
 }
 function close(focus=false){
  if(!opened)return;
  opened=false;sheet.hidden=true;
  // A human may have switched directly into Quick Calls. Preserve its
  // ownership of the same native keyboard/touch/controller input gate.
  window.fuckballQuickActionsOpen=window.fuckballQuickCallsOpen===true;
  trigger.setAttribute('aria-expanded','false');
  // Never carry a pressed kick/stick/key across a panel boundary.
  neutralizeHumanSeats();
  if(focus&&!match.hidden)trigger.focus({preventScroll:true});
 }
 function targetClick(selector){
  const target=document.querySelector(selector);
  if(!target||target.hidden||target.disabled)return false;
  close();
  target.click();
  return true;
 }
 function action(name,describe,allowed,selector){
  const button=document.createElement('button');button.type='button';
  button.className='in-game-quick-action';
  const label=document.createElement('strong');label.textContent=name;
  const note=document.createElement('span');note.textContent=describe;
  button.append(label,note);
  button.addEventListener('click',()=>{
   if(!allowed()){
    feedback.textContent=name+' is not available in the current match.';
    render();return;
   }
   if(!targetClick(selector)){
    feedback.textContent=name+' could not open. Use its original control.';
    render();
   }
  });
  grid.append(button);return {button,allowed};
 }
 const actions=[
  action('▤ Scoreboard','Actual score, clock and roster',()=>!!match.querySelector('.match-center-trigger'),
   '.match-center-trigger'),
  action('⌁ Connection','Read existing RTT and snapshot information',
   ()=>!!(serverLink?.room||peerConnected)&&!!match.querySelector('.connection-details-trigger'),
   '.connection-details-trigger'),
  action('◎ Capture moment','Save a voluntary local screenshot',
   ()=>!!match.querySelector('.moment-capture')&&!replay?.loading,
   '.moment-capture'),
  action('↗ Room invite','Copy this existing native Custom Room link',
   ()=>!!serverLink?.room&&!serverLink?.quickMatchMode&&
    document.getElementById('inviteButton')?.hidden===false,
   '#inviteButton'),
  action('⚙ Match menu','Use the original gameplay and team controls',
   ()=>!!document.getElementById('matchMenuButton'),'#matchMenuButton')
 ];
 function render(){
  let count=0;
  for(const item of actions){
   const allowed=!busy()&&item.allowed();
   item.button.hidden=!allowed;item.button.disabled=!allowed;
   if(allowed)count++;
  }
  if(!count)feedback.textContent='No match shortcuts are available in the current state.';
 }
 function open(){
  if(busy()||opened)return;
  // Panels never stack. This only closes the prior view; it does not send a
  // chat message or change the authoritative online room.
  window.fuckballCloseQuickCalls?.(false);
  render();
  // Input must be stopped BEFORE focus is transferred: if someone held a
  // direction/kick while tapping Quick, no movement survives behind the UI.
  window.fuckballQuickActionsOpen=true;
  neutralizeHumanSeats();
  opened=true;sheet.hidden=false;
  trigger.setAttribute('aria-expanded','true');
  feedback.textContent='Your player is neutral while choosing. The match clock still runs.';
  (sheet.querySelector('button.in-game-quick-action:not([hidden])')||dismiss)
   .focus({preventScroll:true});
 }
 trigger.addEventListener('click',()=>{if(opened)close(true);else open();});
 dismiss.addEventListener('click',()=>close(true));
 document.addEventListener('pointerdown',event=>{
  if(opened&&!sheet.contains(event.target)&&!trigger.contains(event.target))close();
 },{passive:true});
 window.addEventListener('blur',()=>close());
 window.addEventListener('keydown',event=>{
  if(opened&&event.key==='Escape'){
   event.preventDefault();event.stopImmediatePropagation();close(true);
  }
 },true);
 const watch=new MutationObserver(()=>{
  if(opened&&busy())close();
  trigger.hidden=match.hidden;
 });
 watch.observe(match,{attributes:true,attributeFilter:['hidden']});
 const nativeMenu=document.getElementById('pauseMenu');
 if(nativeMenu)watch.observe(nativeMenu,{attributes:true,attributeFilter:['hidden']});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)close();});
 trigger.hidden=match.hidden;
})();