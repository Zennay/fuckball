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
  'Open existing match tools. Nothing is uploaded, recorded, shared or paused unless you choose that tool.';
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
 let opened=false;
 function close(focus=false){
  opened=false;sheet.hidden=true;trigger.setAttribute('aria-expanded','false');
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
  if(busy())return;
  render();
  opened=true;sheet.hidden=false;
  trigger.setAttribute('aria-expanded','true');
  feedback.textContent='Choose a tool. Normal game control remains unchanged.';
  sheet.querySelector('button.in-game-quick-action:not([hidden])')?.focus({preventScroll:true});
 }
 trigger.addEventListener('click',()=>{if(opened)close(true);else open();});
 dismiss.addEventListener('click',()=>close(true));
 document.addEventListener('pointerdown',event=>{
  if(opened&&!sheet.contains(event.target)&&!trigger.contains(event.target))close();
 },{passive:true});
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