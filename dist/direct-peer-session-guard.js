'use strict';
// Direct-peer admission boundary. Uses the original beginPeer/disconnect buttons,
// but refuses to discard a live room, search or in-flight handshake.
(function(){
 const home=document.getElementById('homeView');
 const match=document.getElementById('matchView');
 const games=document.getElementById('gamesView');
 const status=document.getElementById('networkStatus');
 const nativeCancel=document.getElementById('disconnectPeer');
 const dialog=document.getElementById('networkDialog');
 if(!home||!match||!games||!status||!nativeCancel||typeof beginPeer!=='function')return;
 const pending=()=>typeof peer!=='undefined'&&!!peer&&!peerConnected;
 const liveConflict=()=>{
  if(typeof onlineSessionConflict==='function')return onlineSessionConflict();
  if(typeof serverLink!=='undefined'&&serverLink)
   return 'Leave or cancel your existing online room before starting direct 1v1.';
  if(typeof roomRecovery!=='undefined'&&roomRecovery.context)
   return 'Stop room reconnection before starting direct 1v1.';
  if(typeof peer!=='undefined'&&peer)
   return 'Finish or cancel your existing direct-peer connection first.';
  return '';
 };
 const originalBeginPeer=beginPeer;
 beginPeer=async function(role){
  if(role!=='host'&&role!=='guest')throw Error('Choose Host or Join explicitly.');
  const problem=liveConflict();
  if(problem)throw Error(problem);
  if(typeof window.RTCPeerConnection!=='function')
   throw Error('WebRTC is unavailable in this browser. Your current match was preserved.');
  if(room?.isRecording?.())
   throw Error('Save your active match recording before changing to direct 1v1.');
  if((started||replay)&&typeof window.confirm==='function'&&
     !window.confirm('Leave the current local match or replay and start a direct 1v1 connection?'))
   throw Error('Original local game kept. No peer connection was created.');
  // All checks happen before original beginPeer's disconnect/reset. The
  // original browser host/join exchange remains authoritative.
  const result=await originalBeginPeer(role);
  refresh();
  return result;
 };
 const surface=document.createElement('aside');
 surface.className='direct-peer-pending';
 surface.hidden=true;
 surface.setAttribute('role','region');
 surface.setAttribute('aria-label','Direct-peer handshake in progress');
 const copy=document.createElement('div');
 const heading=document.createElement('strong');
 heading.textContent='DIRECT 1v1 · CONNECTION PENDING';
 const detail=document.createElement('p');
 detail.setAttribute('role','status');detail.setAttribute('aria-live','polite');
 copy.append(heading,detail);
 const actions=document.createElement('div');
 actions.className='direct-peer-pending-actions';
 const view=document.createElement('button');
 view.type='button';view.className='primary';view.textContent='↗ View connection';
 const cancel=document.createElement('button');
 cancel.type='button';cancel.textContent='× Cancel direct join';
 actions.append(view,cancel);
 surface.append(copy,actions);
 document.body.append(surface);
 view.addEventListener('click',()=>{
  if(!pending())return;
  if(typeof openDialog==='function'&&!dialog?.open)openDialog('networkDialog');
  status?.focus?.({preventScroll:true});
 });
 cancel.addEventListener('click',()=>{
  if(!pending()||nativeCancel.disabled)return;
  nativeCancel.click();refresh();
 });
 const frozenIds=['startButton','resetButton','mode','stadium',
  'scoreLimit','timeLimit','recordButton','pauseButton'];
 const originalSetButtons=setButtons;
 setButtons=function(...args){
  const result=originalSetButtons(...args);
  if(pending())for(const id of frozenIds){
   const control=document.getElementById(id);
   if(control)control.disabled=true;
  }
  return result;
 };
 let previous=false;
 function refresh(){
  const active=pending();
  if(active!==previous){
   previous=active;
   // Reuse the original native button-state authority; only the pending
   // handshake temporarily freezes local match mutation controls.
   setButtons();
  }
  // The network dialog already contains the same original cancellation.
  surface.hidden=!active||!!dialog?.open;
  if(surface.hidden)return;
  const phase=(status.textContent||'').trim().slice(0,185);
  const text=(phase||'Finish exchanging the two connection codes.')+
   ' · Keep waiting or cancel explicitly; no new room will be started.';
  if(detail.textContent!==text)detail.textContent=text;
 }
 const refreshTimer=setInterval(refresh,950);
 refreshTimer.unref?.();
 for(const el of [home,match,games])new MutationObserver(refresh)
  .observe(el,{attributes:true,attributeFilter:['hidden']});
 dialog?.addEventListener('close',refresh);
 document.getElementById('tabHome')?.addEventListener('click',()=>queueMicrotask(refresh));
 document.getElementById('tabPlay')?.addEventListener('click',()=>queueMicrotask(refresh));
 document.getElementById('tabReplay')?.addEventListener('click',()=>queueMicrotask(refresh));
 window.addEventListener('focus',refresh);
 refresh();
})();
