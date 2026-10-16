'use strict';const assert=require('node:assert/strict');const{createApp}=require('./app-smoke.cjs');const a=createApp(),el=id=>a.elements.get(id);
function key(code,target={tagName:'CANVAS'}){let stopped=false;const ev={code,target,preventDefault(){},stopImmediatePropagation(){stopped=true;},stopPropagation(){stopped=true;},repeat:false};for(const f of a.listeners['window:keydown']||[]){f(ev);if(stopped)return;}a.listeners.keydown?.(ev);}
function keyup(code){a.listeners.keyup?.({code});}
el('heroPlay').click();a.advance(20);assert.equal(el('matchView').hidden,false);assert.equal(a.evalJS('started'),true);assert.equal(el('pauseMenu').hidden,true);
// Esc opens the translucent room menu without stopping the match.
key('Escape');assert.equal(el('pauseMenu').hidden,false);assert.equal(a.evalJS('paused'),false,'Esc never pauses');const f=a.evalJS('room.currentFrameNo');a.advance(40);assert(a.evalJS('room.currentFrameNo')>f+20,'match keeps running behind the menu');
assert.equal(el('menuMatchPane').hidden,false,'teams are shown first');
// Gameplay keys do not move the player while the menu is open; P still pauses.
const x=a.evalJS('room.state.players[0].disc.pos.x');key('KeyD');a.advance(30);keyup('KeyD');assert(Math.abs(a.evalJS('room.state.players[0].disc.pos.x')-x)<40);
key('KeyP');assert.equal(a.evalJS('paused'),true);key('KeyP');assert.equal(a.evalJS('paused'),false);a.advance(150);
// Settings and controls panes.
el('menuVideo').click();assert.equal(el('menuVideoPane').hidden,false);assert.equal(el('menuMatchPane').hidden,true);el('extrapolation').value='135';el('extrapolation').oninput();assert.equal(a.evalJS('settings.extrapolation'),135);
el('menuHelp').click();assert.equal(el('menuControlsPane').hidden,false);assert.equal(el('bindingList').children.length,6);
// Rebind "right" to KeyL: click the slot, press the key.
el('bindingList').children[3].children[1].click();key('KeyL');assert.equal(a.evalJS("settings.keys.right[0]"),'KeyL');
key('Escape');assert.equal(el('pauseMenu').hidden,true);
const before=a.evalJS('room.state.players.find(p=>p.id===1).disc.pos.x');key('KeyL');a.advance(60);keyup('KeyL');assert(a.evalJS('room.state.players.find(p=>p.id===1).disc.pos.x')>before+40,'rebound key moves the player');
el('resetBindings').click();assert.equal(a.evalJS("settings.keys.right[0]"),'ArrowRight');
// Bottom-left chat: chat key opens the input, Enter sends, messages stay in the HUD log.
key('Enter');assert.equal(el('chatForm').hidden,false,'chat opens in the corner');el('chatInput').value='hello';el('chatForm').onsubmit({preventDefault(){}});assert.equal(el('chatForm').hidden,true);assert(el('chatLog').children.some(r=>/hello/.test(r.textContent)),'message visible in HUD chat');
// Teams: move, add and remove bots; arrangement survives a restart.
key('Escape');el('menuMatch').click();el('mode').value='4v4';el('mode').onchange();assert.equal(a.evalJS('room.state.players.length'),8);
a.evalJS('movePlayer(3,0)');assert.equal(a.evalJS('room.state.players.find(p=>p.id===3).team.id'),0,'player dragged to spectators');assert.equal(el('specPlayers').children.length,1);
el('addBotBlue').click();assert.equal(a.evalJS('room.state.players.filter(p=>p.team.id===2).length'),5);
const extra=a.evalJS('Math.max(...roster.map(p=>p.id))');a.evalJS('removeBot('+extra+')');assert.equal(a.evalJS('room.state.players.filter(p=>p.team.id===2).length'),4);
el('joinBlue').click();assert.equal(a.evalJS('room.state.players.find(p=>p.id===1).team.id'),2,'join moves you');
el('resetButton').click();assert.equal(a.evalJS('room.state.players.find(p=>p.id===3).team.id'),0,'restart keeps the teams');assert.equal(a.evalJS('room.state.players.find(p=>p.id===1).team.id'),2);
// Copy link falls back to execCommand on plain HTTP (no navigator.clipboard).
let copied='';a.evalJS('document').execCommand=c=>{copied=c;return true;};a.evalJS('document').body.append=()=>{};el('inviteLink').value='http://example/?room=ABCDEFGH';a.evalJS('copyInvite(false)');
setTimeout(()=>{assert.equal(copied,'copy','clipboard fallback used');assert(/copied/.test(el('toast').textContent),el('toast').textContent);a.evalJS('room.destroy()');console.log('PASS translucent room menu keeps the match running, P pause, rebindable controls, corner chat, drag/add/remove players kept across restart, HTTP link copy');},20);
