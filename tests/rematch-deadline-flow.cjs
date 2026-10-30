'use strict';
const assert=require('node:assert/strict');
const {createApp}=require('./app-smoke.cjs');
const a=createApp(),el=id=>a.elements.get(id);
a.evalJS(`networkPlayerId=2;window.sentRematchVotes=[];
 serverLink={room:'NATIVE',quickMatchMode:null,isOwner:false,ws:{readyState:1},
 send:d=>window.sentRematchVotes.push(d),roomState:{room:'NATIVE',round:4,
 started:false,lastResult:{round:4,red:2,blue:1,winner:1,finalPlayers:[{id:2,name:'Human guest',finalTeam:2,playedFrames:600}]},
 rematch:{id:41,required:[1,2],accepted:[1],expiresAt:Date.now()+45000}}};
 renderNextMatchPanel();`);
assert.equal(el('rematchAccept').hidden,false,'native player can vote before deadline');
assert.match(el('nextMatchInfo').textContent,/Rematch awaiting 1 of 2 players/);
const rosterNode=el('nextMatchPlayers').children[0];
const statusText=el('nextMatchInfo').textContent;
assert(rosterNode,'actual final native roster rendered');
a.evalJS('serverLink.roomState.rematch.expiresAt=Date.now()+39000;refreshNativeRematchCountdown()');
assert.strictEqual(el('nextMatchPlayers').children[0],rosterNode,'countdown keeps roster DOM stable');
assert.equal(el('nextMatchInfo').textContent,statusText,'polite live status does not repeat countdown');
assert.match(el('nextMatchTitle').textContent,/39s to vote/);
// The global Home/My Games consent dock is a second native view of the same
// server vote: its polite status must not announce every ticking second.
a.evalJS("document.getElementById('matchView').hidden=true;renderGlobalRematchDock()");
const dock=a.win.document.body.children.find(x=>x.className==='native-rematch-dock');
assert(dock&&!dock.hidden,'global dock visible outside match');
const dockTitle=dock.children[0].children[0],dockStatus=dock.children[0].children[1];
const dockAnnouncement=dockStatus.textContent;
a.evalJS('serverLink.roomState.rematch.expiresAt=Date.now()+35000;renderGlobalRematchDock()');
assert.equal(dockStatus.textContent,dockAnnouncement,'global live status stable while seconds tick');
assert.match(dockTitle.textContent,/35s left/,'global visual countdown remains accurate');

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
// A lost room connection must never describe the postgame room as playable.
a.evalJS('serverLink.roomState.started=false;serverLink.roomState.rematch=null;serverLink.isOwner=true;serverLink.ws.readyState=3;renderNextMatchPanel()');
assert.match(el('nextMatchInfo').textContent,/Connection unavailable/i,'offline result explains unavailable actions');
assert.doesNotMatch(el('nextMatchInfo').textContent,/keep playing with the same room link/i);
assert.equal(el('nextGame').disabled,true,'offline host cannot start another round');
a.evalJS('serverLink.roomState.lastResult=null;renderNextMatchPanel()');
assert.match(el('nextMatchInfo').textContent,/Connection unavailable/i,'offline lobby explains inability to start');
assert.doesNotMatch(el('nextMatchInfo').textContent,/Everyone remains connected/i);
a.evalJS("serverLink.roomState.lastResult={round:4,red:2,blue:1,winner:1,finalPlayers:[]};serverLink.ws.readyState=1;renderNextMatchPanel()");
el('rematchRequest').click();
a.evalJS('serverLink.ws.readyState=3;renderNextMatchPanel()');
assert.match(el('nextMatchInfo').textContent,/Request confirmation unavailable/i,'offline pending request has no server receipt');
assert.doesNotMatch(el('nextMatchInfo').textContent,/Request sent · waiting/i);
a.evalJS('room.destroy()');
console.log('PASS native rematch expiry, foreground refresh, single consent send, receipt and new-round transition');
