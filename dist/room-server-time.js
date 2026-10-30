'use strict';
// Read-only clock correlation for server-issued room deadlines. Never authorizes
// moderation, admission, sending, or extending a server mute.
(function(root){
 function observe(link,serverNow,monoNow=performance.now()){
  if(!link||!Number.isSafeInteger(serverNow)||serverNow<0||!Number.isFinite(monoNow))return false;
  link.roomServerClock={epoch:serverNow,mono:monoNow};return true;
 }
 function now(link,monoNow=performance.now(),wallNow=Date.now()){
  const c=link?.roomServerClock;
  if(c&&Number.isSafeInteger(c.epoch)&&Number.isFinite(c.mono)&&Number.isFinite(monoNow))
   return c.epoch+Math.max(0,monoNow-c.mono);
  return wallNow;
 }
 const api=Object.freeze({observe,now});
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.FuckballRoomServerTime=api;
})(typeof window==='object'?window:null);
