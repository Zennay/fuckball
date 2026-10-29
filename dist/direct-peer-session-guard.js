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
 const nativeHost=document.getElementById('hostPeer');
 const nativeJoin=document.getElementById('joinPeer');
 const nativeCopy=document.getElementById('copySignal');
 const localSignal=document.getElementById('localSignal');
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
  if((started||replay)&&
     (typeof window.confirm!=='function'||
      !window.confirm('Leave the current local match or replay and start a direct 1v1 connection?')))
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
 const copyCode=document.createElement('button');
 copyCode.type='button';copyCode.textContent='Copy my code';
 copyCode.hidden=true;
 const retry=document.createElement('button');
 retry.type='button';retry.textContent='↻ Retry direct 1v1';retry.hidden=true;
 const cancel=document.createElement('button');
 cancel.type='button';cancel.textContent='× Cancel direct join';
 actions.append(view,copyCode,retry,cancel);
 surface.append(copy,actions);
 document.body.append(surface);
 view.addEventListener('click',()=>{
  if(!pending())return;
  if(typeof openDialog==='function'&&!dialog?.open)openDialog('networkDialog');
  status?.focus?.({preventScroll:true});
 });
 copyCode.addEventListener('click',()=>{
  // A direct offer/answer can expose network candidate information. Copy only
  // on an explicit click; use the original native clipboard/fallback handler.
  if(!pending()||!localSignal?.value||!nativeCopy||nativeCopy.disabled)return;
  nativeCopy.click();
 });
 // ICE may stay "checking"/"connecting" indefinitely without ever raising
 // "failed". Start an advisory clock only AFTER remote signalling reaches
 // actual ICE checks, not while a human is still sharing the offer/answer.
 // Timers never close an existing connection or auto-generate a new identity.
 let observedPeer=null,checkingSince=0,disconnectedSince=0;
 const failedHandshake=()=>pending()&&(
  peer?.connectionState==='failed'||peer?.iceConnectionState==='failed');
 const stalledHandshake=()=>pending()&&peer===observedPeer&&(
  checkingSince!==0&&Date.now()-checkingSince>=25000||
  disconnectedSince!==0&&Date.now()-disconnectedSince>=6000);
 retry.addEventListener('click',()=>{
  if(!(failedHandshake()||stalledHandshake())||nativeCancel.disabled)return;
  const role=peerRole;
  if(!['host','guest'].includes(role))return;
  const original=role==='host'?nativeHost:nativeJoin;
  if(!original||original.disabled||serverLink||
     typeof roomRecovery!=='undefined'&&roomRecovery.context)return;
  // Explicitly discard only this failed peer via the existing native Cancel
  // control. Reuse the original Host/Join button for a fresh consented code;
  // never recycle ICE credentials or start a connection automatically.
  nativeCancel.click();
  if(peer||peerConnected||serverLink)return;
  status.textContent='Starting a fresh '+(role==='host'?'host':'guest')+
   ' code. The previous failed exchange is no longer valid.';
  original.click();
  refresh();
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
  const pc=active?peer:null;
  // Preserve exact RTCPeerConnection identity: a retry's fresh handshake
  // must never inherit an old failed/stalled timer or connection state.
  if(pc!==observedPeer){
   observedPeer=pc;checkingSince=0;disconnectedSince=0;
  }
  if(pc){
   const checking=pc.connectionState==='connecting'||
    pc.iceConnectionState==='checking';
   if(checking&&checkingSince===0)checkingSince=Date.now();
   if(pc.iceConnectionState==='disconnected'){
    if(disconnectedSince===0)disconnectedSince=Date.now();
   }else disconnectedSince=0;
  }
  if(active!==previous){
   previous=active;
   // Reuse the original native button-state authority; only the pending
   // handshake temporarily freezes local match mutation controls.
   setButtons();
  }
  // The network dialog already contains the same original cancellation.
  surface.hidden=!active||!!dialog?.open;
  if(surface.hidden)return;
  const failed=failedHandshake(),stalled=!failed&&stalledHandshake();
  surface.dataset.phase=failed?'failed':stalled?'stalled':'pending';
  retry.disabled=nativeCancel.disabled;
  cancel.disabled=nativeCancel.disabled;
  heading.textContent=failed?'DIRECT 1v1 · CONNECTION FAILED':
   stalled?'DIRECT 1v1 · STILL WAITING FOR ICE':'DIRECT 1v1 · CONNECTION PENDING';
  copyCode.hidden=failed||!localSignal?.value||!nativeCopy;
  retry.hidden=!failed&&!stalled;
  retry.textContent=peerRole==='host'?'↻ Retry as host':'↻ Retry as guest';
  const phase=(status.textContent||'').trim().slice(0,185);
  const text=failed?
   'The direct WebRTC link failed. No match has been joined. '+
   'Choose Retry for a fresh manual code or Cancel; old codes cannot be reused.':
   stalled?
   'The browser has not established this direct connection after ICE checking. '+
   'You can keep waiting, Cancel, or explicitly Retry with a fresh private code. '+
   'Nothing was disconnected automatically.':
   (phase||'Finish exchanging the two connection codes.')+
   ' · Exchange the private offer/answer only with your intended friend. '+
   'Keep waiting or cancel explicitly.';
  if(detail.textContent!==text)detail.textContent=text;
 }
 const refreshTimer=setInterval(refresh,950);
 refreshTimer.unref?.();
 if(typeof MutationObserver==='function')for(const el of [home,match,games])
  new MutationObserver(refresh).observe(el,{attributes:true,attributeFilter:['hidden']});
 dialog?.addEventListener('close',refresh);
 document.getElementById('tabHome')?.addEventListener('click',()=>queueMicrotask(refresh));
 document.getElementById('tabPlay')?.addEventListener('click',()=>queueMicrotask(refresh));
 document.getElementById('tabReplay')?.addEventListener('click',()=>queueMicrotask(refresh));
 window.addEventListener('focus',refresh);
 refresh();
})();
