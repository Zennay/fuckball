'use strict';const assert=require('node:assert/strict');const{createApp}=require('./app-smoke.cjs');
const store=new Map(),a=createApp({globals:{localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))}}}),el=id=>a.elements.get(id);
// Navigation: four destinations plus the match.
for(const [tab,view]of [['tabSocial','socialView'],['tabGames','gamesView'],['tabProfile','profileView'],['tabHome','homeView']]){el(tab).click();for(const v of ['homeView','socialView','gamesView','profileView','matchView'])assert.equal(el(v).hidden,v!==view,tab+' shows only '+view);}
assert.equal(el('gamesEmpty').hidden,false);
// Size picker drives the bot match: 3v3 has six players.
el('size3').click();assert.match(el('heroPlayDetail').textContent,/You \+ 2 bots vs 3 bots/);el('heroPlay').click();a.advance(5);assert.equal(a.evalJS('room.state.players.length'),6);assert.equal(el('matchView').hidden,false);
console.log('PASS Play / Social / My Games / Profile navigation and 3v3 size picker');
// Real engine goal and full time: summary, history and rematch with swapped sides.
a.advance(240);assert(a.evalJS('room.gameState.timeElapsed>0'),'bots kicked off');a.evalJS('{room.gameState.scoreLimit=1;room.gameState.timeElapsed=125;matchLog.lastKick=1;const d=room.gameState.physicsState.discs[0];d.pos.x=680;d.pos.y=0;d.speed.x=6;d.speed.y=0;}');
for(let i=0;i<400&&!a.evalJS('pendingResult');i++)a.advance(1);assert(a.evalJS('pendingResult'),'game ended');a.evalJS('matchHooks.fullTime()');
assert.equal(el('matchSummary').hidden,false);assert.equal(el('summaryTitle').textContent,'YOU WIN');assert.equal(el('summaryScore').textContent,'1 : 0');assert.equal(el('summaryNote').textContent,'Saved to My Games.');assert.equal(a.evalJS('started'),false);
const history=JSON.parse(store.get('fuckball.history'));assert.deepEqual([history.length,history[0].result,history[0].goals,history[0].mode],[1,'W',1,'3v3']);
el('summaryRematch').click();a.advance(3);assert.equal(el('matchSummary').hidden,true);assert.equal(a.evalJS('myTeam'),2);assert.equal(a.evalJS('started'),true);assert.equal(a.evalJS('room.state.players.find(p=>p.id===1).team.id'),2);
el('tabGames').click();assert.equal(el('gamesEmpty').hidden,true);assert.equal(el('gamesList').children.length,1);assert.equal(el('statRecord').textContent,'1-0-0');
console.log('PASS full-time summary, scorer stats, saved history and side-swapping rematch');
// Short matches show a result but are not saved.
el('tabPlay').click();assert.equal(a.evalJS('paused'),true,'leaving the match pauses it');a.evalJS('togglePause()');a.advance(240);a.evalJS('{room.gameState.scoreLimit=1;matchLog.lastKick=1;const d=room.gameState.physicsState.discs[0];d.pos.x=-680;d.pos.y=0;d.speed.x=-6;d.speed.y=0;}');
for(let i=0;i<400&&!a.evalJS('pendingResult');i++)a.advance(1);a.evalJS('matchHooks.fullTime()');assert.equal(el('matchSummary').hidden,false);assert.match(el('summaryNote').textContent,/under 02:00/);assert.equal(JSON.parse(store.get('fuckball.history')).length,1);
// Chat stays open at full time: Enter focuses the summary chat, messages reach the room log.
for(const f of a.listeners['window:keydown'])f({code:'Enter',target:{tagName:'CANVAS'},preventDefault(){},stopImmediatePropagation(){},repeat:false});assert.equal(a.win.document.activeElement,el('summaryChatInput'));assert.equal(el('pauseMenu').hidden,true,'Enter does not open the menu over the summary');
el('summaryChatInput').value='gg wp';el('summaryChatForm').onsubmit({preventDefault(){}});assert(el('chatLog').children.some(r=>r.children.some(c=>c.textContent==='Player: gg wp')));assert(el('summaryChatLog').children.some(r=>r.textContent==='Player: gg wp'));assert.equal(el('summaryChatInput').value,'');
console.log('PASS chat at full time from the match summary');
// Escape menu shows the scoreboard first and Leave returns to Play.
el('summaryNew').click();a.advance(3);for(const f of a.listeners['window:keydown'])f({code:'Escape',target:{tagName:'CANVAS'},preventDefault(){},stopImmediatePropagation(){},repeat:false});assert.equal(el('pauseMenu').hidden,false);assert.equal(el('menuOverview').hidden,false);assert.equal(el('menuBoard').children.length,2);assert.equal(el('menuInvite').hidden,true);
el('menuHome').click();assert.equal(el('homeView').hidden,false);a.evalJS('room.destroy()');
console.log('PASS short matches are not saved; scoreboard-first match menu and Leave');
