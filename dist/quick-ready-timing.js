'use strict';
// Server time is a protocol receipt, not a clock to synchronize with Date.now.
// Keep the one short human confirmation deadline monotone after admission.
(function(root){
 const MAX_READY_MS=15000;
 function deadline(expiresAt,serverNow,monoNow,wallNow){
  if(!Number.isSafeInteger(expiresAt)||!Number.isFinite(monoNow))return monoNow;
  const serverAnchored=Number.isSafeInteger(serverNow);
  const delta=expiresAt-(serverAnchored?serverNow:wallNow);
  if(!Number.isFinite(delta))return monoNow;
  return monoNow+Math.max(0,Math.min(MAX_READY_MS,delta));
 }
 function remaining(deadlineMono,monoNow){
  return Number.isFinite(deadlineMono)&&Number.isFinite(monoNow)?
   Math.max(0,deadlineMono-monoNow):0;
 }
 const api=Object.freeze({deadline,remaining});
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.FuckballQuickReadyTime=api;
 })(typeof window==='object'?window:null);
