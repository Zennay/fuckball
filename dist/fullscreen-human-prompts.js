'use strict';
// Fullscreen renders only the selected element's subtree. The game's native
// match/connection/consent panels are intentionally created at document.body,
// so they become invisible when the pitch or match view goes fullscreen.
// Reparent these *same* DOM nodes, keeping their original event handlers,
// server-owned permission checks and consent state fully intact.
(function(){
 const prompts=[
  '.native-room-recovery', '.native-room-restored',
  '.quick-ready-dock', '.native-rematch-dock',
  '.native-sub-consent-dock', '.native-lobby-ready-dock',
  '.native-finished-round-dock', '.native-format-dock'
 ];
 const selector=prompts.join(',');
 const originalParents=new WeakMap();
 const pitch=document.getElementById('pitch');
 const match=document.getElementById('matchView');

 function eligibleFullscreenHost(){
  const active=document.fullscreenElement;
  // Only game-owned HTML containers may become portal hosts. Never attach
  // controls to a canvas, foreign iframe or unrelated fullscreen element.
  return active&&(active===pitch||active===match)?active:null;
 }
 function sync(){
  const host=eligibleFullscreenHost();
  const nodes=document.querySelectorAll(selector);
  for(const node of nodes){
   // Only body-level prompts are supported, never a form nested in a menu.
   if(!originalParents.has(node)){
    if(node.parentElement!==document.body)continue;
    originalParents.set(node,document.body);
   }
   const target=host||originalParents.get(node);
   if(node.parentElement===target||!target?.isConnected)continue;
   const focused=document.activeElement;
   const hadFocus=focused===node||node.contains(focused);
   target.appendChild(node);
   if(hadFocus&&focused?.isConnected&&document.activeElement!==focused)
    focused.focus?.({preventScroll:true});
  }
 }
 // A real fullscreen transition is synchronous from the player's point of
 // view. The observer covers native prompts created after fullscreen begins.
 document.addEventListener('fullscreenchange',sync);
 if(typeof MutationObserver!=='undefined'){
  const observer=new MutationObserver(sync);
  observer.observe(document.body,{childList:true});
  window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
 }
 sync();
})();
