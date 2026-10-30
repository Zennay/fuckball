'use strict';
const assert=require('node:assert/strict');
const {createApp}=require('./app-smoke.cjs');
const a=createApp(),el=id=>a.elements.get(id);
a.evalJS(`networkPlayerId=2;window.sentRematchVotes=[];
 serverLink={room:'NATIVE',quickMatchMode:null,isOwner:false,ws:{readyState:1},
 send:d=>window.sentRematchVotes.push(d),roomState:{room:'NATIVE',round:4,
 started:false,lastResult:{round:4,red:2,blue:1,winner:1,finalPlayers:[]},
 rematch:{id:41,required:[1,2],accepted:[1],expiresAt:Date.now()+45000}}};
 renderNextMatchPanel();`);
assert.equal(el('rematchAccept').hidden,false,'native player can vote before deadline');
assert.match(el('nextMatchInfo').textContent,/Rematch awaiting 1 of 2 players/);
// Server may not send a packet exactly at the deadline; the visible UI must
// refresh and withdraw controls, not continue to advertise a stale vote.
a.evalJS('serverLink.roomState.rematch.expiresAt=Date.now()-1;refreshNativeRematchCountdown()');
assert.equal(el('rematchAccept').hidden,true,'expired consent withdrawn');
assert.equal(el('rematchDecline').hidden,true,'expired decline withdrawn');
assert.match(el('nextMatchInfo').textContent,/Voting deadline passed/);
el('rematchAccept').click();
assert.equal(a.evalJS('window.sentRematchVotes.length'),0,'stale vote never sent');
// Foregrounding after a background-throttled timer also refreshes consent.
a.evalJS('serverLink.roomState.rematch.expiresAt=Date.now()+40000');
a.listeners['window:focus'].find(f=>String(f).includes('refreshNativeRematchCountdown'))();
assert.equal(el('rematchAccept').hidden,false,'valid native vote restored');
a.evalJS('serverLink.roomState.rematch.id=42');
el('rematchAccept').click();el('rematchAccept').click();
assert.equal(a.evalJS('window.sentRematchVotes.length'),1,'vote sent only once');
assert.equal(a.evalJS('window.sentRematchVotes[0].id'),42);
assert.equal(el('rematchAccept').disabled,true,'await server receipt');
a.evalJS('serverLink.roomState.rematch.accepted=[1,2];refreshNativeRematchCountdown()');
assert.equal(el('rematchAccept').hidden,true,'native receipt removes consent');
a.evalJS('serverLink.roomState.started=true;serverLink.roomState.rematch=null;refreshNativeRematchCountdown()');
assert.equal(el('nextMatchPanel').hidden,true,'new game hides postgame vote');
a.evalJS('room.destroy()');
console.log('PASS native rematch expiry, foreground refresh, single consent send, receipt and new-round transition');
