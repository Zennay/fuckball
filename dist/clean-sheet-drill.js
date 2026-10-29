'use strict';
// Defensive offline challenge using ONLY the approved native local match score
// and unpaused game frames. Never computes saves, shots faced or ranked stats.
(function(){
 const home=document.getElementById('homeView'),match=document.getElementById('matchView');
 if(!home||!match||!document.getElementById('quickPractice'))return;
 const KEY='fuckball.clean-sheet-history.v1',MAX=20;
 const DURATIONS=[60,120,180],ALLOW=[0,1,2];
 const el=(tag,value,klass)=>{const n=document.createElement(tag);
  if(value!==undefined&&value!==null)n.textContent=String(value);
  if(klass)n.className=klass;return n;};
 const panel=el('section',null,'clean-sheet-setup');
 panel.setAttribute('aria-label','Offline defensive clean sheet challenge');
 const heading=el('h2','CLEAN SHEET CHALLENGE.');
 const intro=el('p','Defend your goal against native local AI for the entire active clock. Normal game score/time limits are disabled for this drill only; your standard settings remain unchanged. This is offline practice, not verified saves or ranked competition.');
 const settings=el('div',null,'clean-sheet-fields');
 const durationLabel=el('label','Active match duration');
 const duration=el('select');duration.setAttribute('aria-label','Defensive drill length');
 DURATIONS.forEach(n=>duration.add(new Option(n+' seconds',String(n))));
 duration.value='120';durationLabel.append(duration);
 const allowanceLabel=el('label','Maximum goals conceded');
 const allowance=el('select');allowance.setAttribute('aria-label','Maximum goals conceded to achieve the goal');
 ALLOW.forEach(n=>allowance.add(new Option(n===0?'0 · clean sheet':String(n)+' or fewer',String(n))));
 allowanceLabel.append(allowance);
 const start=el('button','▶ START DEFENDING');start.type='button';start.className='primary';
 settings.append(durationLabel,allowanceLabel,start);
 const status=el('p','Complete the full local defensive clock to earn a practice result.','clean-sheet-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const history=el('section',null,'clean-sheet-history');
 const historyHead=el('div',null,'clean-sheet-history-head');
 historyHead.append(el('h3','MY DEFENSIVE TRAINING'));
 const download=el('button','↓ Export results');download.type='button';
 const clear=el('button','Clear history');clear.type='button';
 historyHead.append(download,clear);
 const records=el('div',null,'clean-sheet-records');
 history.append(historyHead,records);
 panel.append(heading,intro,settings,status,history);
 // The original native defensive match should survive harmless Home/My Games
 // navigation. Return never changes team, opponent, timer or authority.
 const returnPanel=el('aside',null,'clean-sheet-return');
 returnPanel.hidden=true;
 returnPanel.setAttribute('role','region');
 returnPanel.setAttribute('aria-label','Paused defensive training session');
 const returnText=el('p');
 returnText.setAttribute('role','status');
 const returnButton=el('button','↗ Return to Clean Sheet');
 returnButton.type='button';
 returnPanel.append(returnText,returnButton);
 document.body.append(returnPanel);
 const anchor=home.querySelector('.teamwork-panel')||home.querySelector('.goal-rush-setup')||home.querySelector('.mode-cards');
 if(anchor)anchor.insertAdjacentElement('afterend',panel);else home.append(panel);
 const hud=el('aside',null,'clean-sheet-hud');hud.hidden=true;
 hud.setAttribute('aria-label','Live native offline defending challenge');
 const badge=el('strong','CLEAN SHEET · LOCAL AI');
 const clock=el('span',null,'clean-sheet-clock');
 const score=el('p',null,'clean-sheet-progress');score.setAttribute('role','status');score.setAttribute('aria-live','polite');
 const gauge=el('progress');gauge.max=100;gauge.value=0;gauge.setAttribute('aria-label','Active defending time completed');
 const actions=el('div',null,'clean-sheet-actions');
 const stop=el('button','Stop drill'),pauseButton=el('button','Ⅱ Pause native match'),again=el('button','Play again'),close=el('button','Close');
 for(const b of [stop,pauseButton,again,close])b.type='button';
 again.hidden=true;close.hidden=true;actions.append(pauseButton,stop,again,close);
 hud.append(badge,clock,score,gauge,actions);match.append(hud);
 let active=null,parked=false;
 function updateReturn(){
  returnPanel.hidden=!active||!parked||!match.hidden||document.hidden;
  if(returnPanel.hidden)return;
  const s=active;
  returnText.textContent='Clean Sheet paused · '+s.conceded+' conceded / '+
   s.allowance+' allowed · '+Math.max(0,s.duration-Math.ceil(s.frames/60))+
   's of active defending left. Same local match, no clock skipped.';
 }
 returnButton.addEventListener('click',()=>{
  if(!active||!parked||!match.hidden||document.hidden)return;
  document.getElementById('tabPlay')?.click();
  // Existing user pause/resume control is the only way to restart the
  // simulation. Returning here must never unpause or create a new match.
  updateReturn();
 });
 const now=()=>Date.now();
 function read(){
  try{
   const rows=JSON.parse(localStorage.getItem(KEY)||'[]');
   if(!Array.isArray(rows)||rows.length>MAX)return[];
   return rows.filter(x=>x&&Number.isSafeInteger(x.at)&&x.at>0&&x.at<=now()+86400000&&
    DURATIONS.includes(x.duration)&&ALLOW.includes(x.allowance)&&
    Number.isSafeInteger(x.conceded)&&x.conceded>=0&&x.conceded<=999&&
    Number.isSafeInteger(x.scored)&&x.scored>=0&&x.scored<=999&&
    Number.isSafeInteger(x.elapsed)&&x.elapsed>=x.duration&&x.elapsed<=x.duration+1&&
    typeof x.completed==='boolean'&&x.completed===(x.conceded<=x.allowance));
  }catch{return[];}
 }
 function paintHistory(){
  const rows=read();records.replaceChildren();download.disabled=clear.disabled=!rows.length;
  if(!rows.length){records.append(el('p','Finish a real local defensive drill to save your first result.'));return;}
  for(const row of rows.slice(0,8)){
   const item=el('article',null,'clean-sheet-record');
   item.append(el('strong',(row.completed?'GOAL MET':'GOAL MISSED')+' · '+row.conceded+' conceded / '+row.allowance+' allowed'),
    el('span',row.scored+' scored · '+row.duration+'s active play · '+new Date(row.at).toLocaleDateString()));
   records.append(item);
  }
  const perfect=rows.filter(x=>x.conceded===0).length;
  records.append(el('p',perfect+' completed full-clock clean sheet'+(perfect===1?'':'s')+
   ' in your '+rows.length+' most recent saved local attempt'+(rows.length===1?'':'s')+'.','clean-sheet-history-summary'));
 }
 function save(s){
  const record={at:now(),duration:s.duration,allowance:s.allowance,
   elapsed:s.duration,conceded:s.conceded,scored:s.scored,completed:s.conceded<=s.allowance};
  let saved=false;
  try{localStorage.setItem(KEY,JSON.stringify([record,...read()].slice(0,MAX)));saved=true;}
  catch{}
  paintHistory();
  return saved;
 }
 download.onclick=()=>{
  const rows=read();if(!rows.length)return;
  const data={format:'fuckball-native-local-defense',version:1,source:'device-only-unranked-approved-game-scores',
   note:'Full-clock local defensive results only. No verified saves, matchmaking rank or leaderboard.',exportedAt:new Date().toISOString(),attempts:rows};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=el('a');a.href=url;a.download='fuckball-local-defending-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 };
 clear.onclick=()=>{
  if(!read().length||!confirm('Delete the Clean Sheet practice history stored on this device? Original online results, replays and other training remain.'))return;
  try{localStorage.removeItem(KEY);status.textContent='Only the local defensive training history was cleared.';}
  catch{status.textContent='Browser storage unavailable.';}
  paintHistory();
 };
 paintHistory();
 const matchReady=()=>{
  if(serverLink||peerConnected||replay||!room||!started||match.hidden||!room.gameState||
     document.getElementById('mode')?.value!=='bot')return false;
  if(!Number.isSafeInteger(room.currentFrameNo)||room.currentFrameNo<0)return false;
  if(!Number.isSafeInteger(room.gameState.redScore)||!Number.isSafeInteger(room.gameState.blueScore))return false;
  const players=room.state?.players;
  if(!Array.isArray(players))return false;
  const human=players.find(p=>p?.id===1),side=human?.team?.id;
  const activePlayers=players.filter(p=>[1,2].includes(p?.team?.id));
  // An authentic native 1v1 must have exactly one human and one genuine
  // approved AI opponent; a stale bot ID or changed lineup is not proof.
  const opponent=activePlayers.find(p=>p?.id!==1);
  return [1,2].includes(side)&&human?.disc&&!botIds?.has?.(1)&&
   activePlayers.length===2&&opponent?.disc&&opponent.aiControlled===true&&
   botIds?.has?.(opponent.id)&&opponent.team.id===(side===1?2:1);
 };
 const team=()=>room?.state?.players?.find?.(p=>p.id===1)?.team?.id;
 function reason(){
  if(serverLink||peerConnected)return 'Leave your live room or connecting server before local practice.';
  if(document.querySelector('.quick-queue-actions button:not([hidden]),.quick-ready:not([hidden])'))
   return 'Cancel human Quick Match or finish its ready check before local practice.';
  if(document.getElementById('joinScreen')?.hidden===false)
   return 'Close the open room invitation before starting local practice.';
  return '';
 }
 function progress(s){
  const left=Math.max(0,Math.ceil((s.duration*60-s.frames)/60));
  clock.textContent=left+'s left · '+s.conceded+' conceded / '+s.allowance+' allowed'+(parked||paused?' · PAUSED':'');
  pauseButton.textContent=paused?'▶ Resume native match':'Ⅱ Pause native match';
  score.textContent=(parked||paused?'Paused · explicitly resume the same offline match. ':'')+
   s.scored+' for · '+s.conceded+' against · actual native 1v1 AI score';
  gauge.value=Math.min(100,Math.floor(s.frames/(s.duration*60)*100));
 }
 function finish(label,complete=false){
  const s=active;if(!s)return;active=null;parked=false;updateReturn();
  if(complete){
   const saved=save(s);
   status.textContent=saved?'Full native AI defensive clock completed; private result saved on this device.':
    'Full native AI defensive clock completed, but browser storage refused the result.';
  }else status.textContent='Defensive drill interrupted; no result was stored.';
  badge.textContent=label;
  clock.textContent=complete?
   s.conceded+' actual goal'+(s.conceded===1?'':'s')+' conceded in '+s.duration+' active seconds':
   'Interrupted · result not saved';
  score.textContent=complete?(s.conceded<=s.allowance?
   'Defensive goal achieved. Full active clock completed.':'Goal missed. Practice again anytime.'):
   'This was not a complete full-clock local attempt; nothing was recorded.';
  gauge.value=complete?100:gauge.value;
  pauseButton.hidden=true;stop.hidden=true;again.hidden=false;close.hidden=false;
 }
 function quit(){
  active=null;parked=false;updateReturn();
  hud.hidden=true;badge.textContent='CLEAN SHEET · LOCAL AI';
  pauseButton.hidden=false;stop.hidden=false;again.hidden=true;close.hidden=true;
 }
 function park(){
  const s=active;if(!s)return;
  // A hidden drill still belongs to one immutable native match. If the
  // player launched a different local game or online room, do not show a
  // misleading Resume prompt or preserve old defensive counters.
  if(room!==s.room||serverLink||peerConnected||replay||!started||
     team()!==s.side||room.currentFrameNo<s.frame){
   finish('CLEAN SHEET · GAME CHANGED');return;
  }
  // Pause the original offline simulation before hiding it; do not invent
  // match time or defensive outcomes while the player cannot see the pitch.
  if(!serverLink&&!peerConnected&&!replay&&room===s.room&&started&&!paused)
   togglePause();
  if(room===s.room&&Number.isSafeInteger(room.currentFrameNo))
   s.frame=room.currentFrameNo;
  parked=true;progress(s);updateReturn();
 }
 function tick(){
  const s=active;if(!s)return;
  if(document.hidden||match.hidden){park();return;}
  if(!matchReady()||room!==s.room||team()!==s.side||room.currentFrameNo<s.frame){
   finish('CLEAN SHEET · GAME CHANGED');return;
  }
  const frame=room.currentFrameNo;
  if(parked||paused){
   s.frame=frame;
   if(!paused)parked=false;
   progress(s);updateReturn();
   return;
  }
  s.frames+=Math.max(0,frame-s.frame);
  s.frame=frame;
  const current=room.gameState;
  const mine=s.side===1?current.redScore:current.blueScore;
  const theirs=s.side===1?current.blueScore:current.redScore;
  if(mine<s.initialFor||theirs<s.initialAgainst){finish('CLEAN SHEET · MATCH RESTARTED');return;}
  s.scored=Math.min(999,mine-s.initialFor);
  s.conceded=Math.min(999,theirs-s.initialAgainst);
  progress(s);
  if(s.frames>=s.duration*60)finish('CLEAN SHEET · TIME UP',true);
 }
 start.onclick=()=>{
  const blocked=reason();if(blocked){status.textContent=blocked;return;}
  if((started||replay)&&!confirm('Start Clean Sheet in a fresh native local 1v1 game? Your current unsaved solo match or replay will be replaced.')){
   status.textContent='Current match preserved. Defensive drill did not start.';return;
  }
  const seconds=Number(duration.value),allowed=Number(allowance.value);
  if(!DURATIONS.includes(seconds)||!ALLOW.includes(allowed)){status.textContent='Choose supported drill settings.';return;}
  quit();
  try{
   if(!quickPlay('bot',true,true))throw Error('Native offline 1v1 could not start. Existing session was kept.');
   if(!matchReady())throw Error('Offline native 1v1 is unavailable. Leave any existing online game.');
   const side=team(),g=room.gameState;
   active={room,side,duration:seconds,allowance:allowed,
    initialFor:side===1?g.redScore:g.blueScore,initialAgainst:side===1?g.blueScore:g.redScore,
    frame:room.currentFrameNo,frames:0,conceded:0,scored:0};
   parked=false;updateReturn();
   badge.textContent='CLEAN SHEET · LOCAL AI';
   pauseButton.hidden=false;stop.hidden=false;again.hidden=true;close.hidden=true;
   hud.hidden=false;status.textContent='Defense challenge running in a real native local AI match.';
   progress(active);
  }catch(error){quit();status.textContent=error?.message||'Local defensive challenge unavailable.';}
 };
 pauseButton.onclick=()=>{
  const s=active;if(!s||parked||document.hidden||match.hidden)return;
  if(room!==s.room||!matchReady()||team()!==s.side){finish('CLEAN SHEET · GAME CHANGED');return;}
  const wasPaused=paused;
  // Delegate to original native pause and neutral-input authority.
  togglePause();
  if(paused===wasPaused){status.textContent='Native pause control unavailable.';return;}
  status.textContent=paused?'Native match paused; no defensive time is counted.':
   'Native match resumed; defensive full-clock challenge continues.';
  progress(s);
 };
 stop.onclick=()=>finish('CLEAN SHEET · STOPPED');
 again.onclick=()=>start.click();
 close.onclick=quit;
 window.setInterval(tick,150);
 // Preserve the user's existing native view routing and network permissions.
 const previousShowView=showView;
 showView=function(next){
  if(next!=='play'&&active)park();
  previousShowView(next);
  updateReturn();
 };
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&active)park();
  else updateReturn();
 });
 window.addEventListener('focus',updateReturn);
})();