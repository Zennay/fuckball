'use strict';
// Offline best-of series: round results come solely from the native 60 Hz
// local 1v1 game score. No alternate physics, online rank or server authority.
(function(){
 const home=document.getElementById('homeView');
 const pitch=document.getElementById('matchView');
 if(!home||!pitch||!document.getElementById('quickPractice'))return;
 const KEY='fuckball.native-sudden-death.v1',MAX=20;
 const LENGTHS=[3,5,7],DURATIONS=[60,90,120];
 const node=(tag,text,klass)=>{
  const n=document.createElement(tag);
  if(text!==undefined&&text!==null)n.textContent=String(text);
  if(klass)n.className=klass;
  return n;
 };
 const section=node('section',null,'sudden-death-setup');
 section.setAttribute('aria-label','Offline sudden death best of series');
 section.append(node('h2','SUDDEN DEATH.'),
  node('p','Play a first-goal best-of series against native local AI or another real player on the same screen. Actual native goals decide each round. The results are private and unranked.'));
 const fields=node('div',null,'sudden-death-fields');
 const opponentLabel=node('label','Opponent'),opponent=node('select');
 opponent.setAttribute('aria-label','Choose native AI or couch human opponent');
 opponent.add(new Option('Local AI','ai'));opponent.add(new Option('Player 2 · couch','human'));
 opponentLabel.append(opponent);
 opponent.addEventListener('change',()=>{
  status.textContent=opponent.value==='human'?
   'Player 1 vs Player 2: use shared keyboard or two separate gamepads in local Couch 1v1.':
   'Native local AI: complete full first-goal rounds for a private best-of result.';
 });
 const gamesLabel=node('label','Series length'),games=node('select');
 games.setAttribute('aria-label','Best of rounds');
 for(const length of LENGTHS)games.add(new Option('Best of '+length,String(length)));
 games.value='5';gamesLabel.append(games);
 const timeLabel=node('label','Round clock'),time=node('select');
 time.setAttribute('aria-label','Active round duration');
 for(const seconds of DURATIONS)time.add(new Option(seconds+' seconds',String(seconds)));
 time.value='90';timeLabel.append(time);
 const start=node('button','▶ START BEST-OF SERIES');
 start.type='button';start.className='primary';
 const continueSeries=node('button','↗ Return to paused series','sudden-death-return');
 continueSeries.type='button';continueSeries.hidden=true;
 fields.append(opponentLabel,gamesLabel,timeLabel,start,continueSeries);
 const status=node('p','Complete all needed rounds to save a private series result.','sudden-death-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const archive=node('div',null,'sudden-death-history');
 const header=node('div',null,'sudden-death-history-header');
 header.append(node('h3','MY LOCAL SERIES'));
 const download=node('button','↓ Export series'),clear=node('button','Clear history');
 download.type=clear.type='button';header.append(download,clear);
 const rows=node('div',null,'sudden-death-history-rows');archive.append(header,rows);
 section.append(fields,status,archive);
 const anchor=home.querySelector('.keep-away-setup')||home.querySelector('.mode-cards');
 if(anchor)anchor.insertAdjacentElement('afterend',section);else home.append(section);
 const hud=node('aside',null,'sudden-death-hud');hud.hidden=true;
 hud.setAttribute('aria-label','Native local sudden death series scoreboard');
 const title=node('strong','SUDDEN DEATH · LOCAL 1v1');
 const clock=node('span',null,'sudden-death-clock');
 const result=node('p',null,'sudden-death-progress');
 result.setAttribute('role','status');result.setAttribute('aria-live','polite');
 const roundList=node('ol',null,'sudden-death-rounds');
 const controls=node('div',null,'sudden-death-actions');
 const next=node('button','▶ Play next round');
 const stop=node('button','Stop series');
 const retry=node('button','Play another series');
 const dismiss=node('button','Dismiss');
 for(const b of [next,stop,retry,dismiss])b.type='button';
 controls.append(next,stop,retry,dismiss);
 hud.append(title,clock,result,roundList,controls);pitch.append(hud);
 let session=null;
 // Each native restart owns a distinct epoch even though the room object is reused.
 // A later manual kickoff must never be stopped by a superseded series.
 let nativeEpoch=0;
 window.addEventListener('fuckball:local-match-kickoff',()=>{nativeEpoch++;});
 const activeSeries=s=>!!s&&['starting','running','between'].includes(s.phase);
 function stillOwnsSeries(s){
  return activeSeries(s)&&s.room===room&&s.kickoffEpoch===nativeEpoch&&
   !!started&&!serverLink&&!peerConnected&&!peer&&!replay;
 }
 function paintReturn(){
  const s=session,owned=stillOwnsSeries(s);
  continueSeries.hidden=!owned||!pitch.hidden;
  if(owned){
   continueSeries.textContent='↗ Return to series · '+
    (s.rounds.length+1)+' / '+s.bestOf+' rounds';
  }
 }
 continueSeries.addEventListener('click',()=>{
  if(!stillOwnsSeries(session)){
   status.textContent='That local series is no longer the current native game.';
   paintReturn();return;
  }
  // Existing local-focus-pause UI owns explicit unpause. Returning to the
  // pitch must not silently advance time or overwrite the saved round state.
  showView('play');
  paintReturn();
 });
 function preserveWhenAway(s){
  if(!stillOwnsSeries(s))return false;
  if(!paused){
   try{togglePause();}catch{}
  }
  // Fail closed if the native 60 Hz simulation cannot be paused. An offscreen
  // best-of must never score or time out without its human controller.
  if(!paused){
   finalize(s,false);
   status.textContent='Could not pause this local series safely. It was stopped.';
   return false;
  }
  if(Number.isSafeInteger(room.currentFrameNo))s.frame=room.currentFrameNo;
  if(s.phase==='starting')s.bootAt=performance.now();
  status.textContent='Sudden Death '+s.human+'–'+s.other+
   ' · '+s.rounds.length+' real rounds preserved. Return to the pitch to continue.';
  paintReturn();return true;
 }
 const validHistory=x=>{
  if(!x||!Number.isSafeInteger(x.at)||x.at<=0||x.at>Date.now()+86400000||
   !LENGTHS.includes(x.bestOf)||!DURATIONS.includes(x.duration)||
   !Array.isArray(x.rounds)||x.rounds.length<1||x.rounds.length>x.bestOf||
   !Number.isSafeInteger(x.draws)||x.draws<0||x.draws>7)return false;
  const couch=x.opponent==='human';
  if(!couch&&x.opponent!==undefined&&x.opponent!=='ai')return false;
  const a=couch?x.player1:x.human,b=couch?x.player2:x.ai;
  const first=couch?'player1':'human',second=couch?'player2':'ai';
  if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<0||b<0||
   a>7||b>7||a+b+x.draws!==x.rounds.length)return false;
  if(!x.rounds.every(r=>r&&[first,second,'draw'].includes(r.winner)&&
   Number.isSafeInteger(r.frames)&&r.frames>=0&&r.frames<=x.duration*60+120))return false;
  return x.rounds.filter(r=>r.winner===first).length===a&&
   x.rounds.filter(r=>r.winner===second).length===b&&
   x.rounds.filter(r=>r.winner==='draw').length===x.draws&&
   x.winner===(a>b?first:b>a?second:'draw')&&
   (x.rounds.length===x.bestOf||a>=Math.floor(x.bestOf/2)+1||
    b>=Math.floor(x.bestOf/2)+1);
 };
 function read(){
  try{
   const arr=JSON.parse(localStorage.getItem(KEY)||'[]');
   return Array.isArray(arr)?arr.slice(0,MAX).filter(validHistory):[];
  }catch{return[];}
 }
 function paintHistory(){
  const history=read();rows.replaceChildren();
  download.disabled=clear.disabled=!history.length;
  if(!history.length){
   rows.append(node('p','Finish a local AI or two-player native best-of series to build a private history.'));
   return;
  }
  for(const record of history.slice(0,8)){
   const entry=node('article',null,'sudden-death-history-row');
   const couch=record.opponent==='human';
   const first=couch?record.player1:record.human,second=couch?record.player2:record.ai;
   const label=couch?'COUCH 1v1':record.winner==='human'?'SERIES WON':record.winner==='ai'?'AI WON':'SERIES DRAW';
   entry.append(node('strong',label+' · '+first+'–'+second+
    ' ('+record.draws+' drawn)'),
    node('span',record.rounds.length+' genuine rounds · '+record.duration+
     's clock · '+new Date(record.at).toLocaleDateString()));
   const card=node('button','↓ Save private PNG scorecard');card.type='button';
   card.onclick=async()=>{
    card.disabled=true;
    try{
     if(!window.SuddenDeathCard?.download)throw Error('Scorecard renderer unavailable.');
     await window.SuddenDeathCard.download(record);
     status.textContent='Private native series scorecard saved as a PNG on this device.';
    }catch(error){
     status.textContent=error?.message||'Could not download the series scorecard.';
    }finally{card.disabled=false;}
   };
   entry.append(card);rows.append(entry);
  }
 }
 function save(s){
  const couch=s.opponent==='human',first=couch?'player1':'human',
   second=couch?'player2':'ai';
  const rounds=s.rounds.map(r=>({winner:r.winner==='human'?first:
   r.winner==='other'?second:'draw',frames:r.frames}));
  const entry=couch?
   {at:Date.now(),bestOf:s.bestOf,duration:s.duration,opponent:'human',
    rounds,player1:s.human,player2:s.other,draws:s.draws,
    winner:s.human>s.other?first:s.other>s.human?second:'draw'}:
   {at:Date.now(),bestOf:s.bestOf,duration:s.duration,rounds,
    human:s.human,ai:s.other,draws:s.draws,
    winner:s.human>s.other?'human':s.other>s.human?'ai':'draw'};
  let stored=false;
  try{
   localStorage.setItem(KEY,JSON.stringify([entry,...read()].slice(0,MAX)));
   stored=true;
  }catch{}
  paintHistory();
  return stored;
 }
 download.onclick=()=>{
  const history=read();if(!history.length)return;
  const content=JSON.stringify({format:'fuckball-offline-native-sudden-death',version:1,
   origin:'private approved local engine scores, not verified ranking',
   exportedAt:new Date().toISOString(),series:history},null,2);
  const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));
  const a=node('a');a.href=url;a.download='fuckball-sudden-death-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
 };
 clear.onclick=()=>{
  if(!read().length||!confirm('Delete only your private Sudden Death series history on this device?'))return;
  try{localStorage.removeItem(KEY);status.textContent='Local Sudden Death history cleared.';}
  catch{status.textContent='Browser storage unavailable.';}
  paintHistory();
 };
 paintHistory();
 const own=()=>room?.state?.players?.find?.(p=>p.id===1);
 function ready(opponentType){
  const p=own(),couch=opponentType==='human';
  return !serverLink&&!peerConnected&&!replay&&started&&!pitch.hidden&&
   document.getElementById('mode')?.value===(couch?'local':'bot')&&room?.gameState&&
   Number.isSafeInteger(room.currentFrameNo)&&
   Number.isSafeInteger(room.gameState.redScore)&&
   Number.isSafeInteger(room.gameState.blueScore)&&
   p?.disc&&[1,2].includes(p?.team?.id)&&!botIds.has(1)&&
   room.state.players.some(x=>x.id!==1&&
    (couch?x.id===2&&!botIds.has(2):botIds.has(x.id))&&
    x.disc&&[1,2].includes(x.team?.id)&&x.team.id!==p.team.id);
 }
 function blocked(){
  if(serverLink||peerConnected)return 'Leave the current online or peer-hosted session first.';
  if(document.getElementById('joinScreen')?.hidden===false)return 'Close the open room invitation first.';
  if(document.querySelector('.quick-queue-actions button:not([hidden]),.quick-ready:not([hidden])'))
   return 'Cancel the active human Quick Match search or ready check first.';
  return '';
 }
 const score=()=>[room.gameState.redScore,room.gameState.blueScore];
 function render(s){
  // On a phone the active match needs an unobstructed, compact score HUD;
  // expand the historical rounds and actions when a round finishes.
  hud.setAttribute('data-phase',s.phase);
  const finished=s.phase==='complete'||s.phase==='stopped';
  const waiting=s.phase==='between';
  title.textContent=s.phase==='complete'?'SERIES COMPLETE · '+(s.opponent==='human'?'TWO PLAYERS':'LOCAL AI'):
   s.phase==='stopped'?'SERIES STOPPED · NOT SAVED':'SUDDEN DEATH · LOCAL 1v1';
  clock.textContent=finished?'Final · '+s.rounds.length+' recorded round'+(s.rounds.length===1?'':'s'):
   waiting?'Round '+s.rounds.length+' complete · choose next round':
    'Round '+(s.rounds.length+1)+'/'+s.bestOf+' · '+Math.max(0,Math.ceil((s.duration*60-s.elapsed)/60))+'s left';
  result.textContent=(s.opponent==='human'?'Player 1 ':'You ')+s.human+' · '+(s.opponent==='human'?'Player 2 ':'AI ')+s.other+' · Draws '+s.draws+
   (waiting?' · next round requires your click':s.phase==='running'?' · first real goal wins':'');
  roundList.replaceChildren();
  for(const r of s.rounds){
   const rlabel=r.winner==='human'?(s.opponent==='human'?'PLAYER 1 GOAL':'YOU SCORED'):
    r.winner==='other'?(s.opponent==='human'?'PLAYER 2 GOAL':'AI SCORED'):'NO GOAL · DRAW';
   roundList.append(node('li','Round '+(roundList.childElementCount+1)+': '+rlabel+
    ' at '+(r.frames/60).toFixed(1)+'s'));
  }
  next.hidden=!waiting;
  stop.hidden=finished;
  retry.hidden=dismiss.hidden=!finished;
  dismiss.textContent=finished&&!started?'↗ Return to Home':'Dismiss';
  paintReturn();
 }
 function stopOwnedNative(s){
  if(s.room!==room||s.kickoffEpoch!==nativeEpoch||
   serverLink||peerConnected||replay||!started)return false;
  // Only stop a native kickoff launched by this series, never a replacement match.
  try{startStop();return !started;}catch{return false;}
 }
 function finalize(s,complete){
  if(session!==s)return;
  // Finishing a best-of ends the exact native kickoff owned by this series.
  // Previously completion left the real room started=true and paused=true:
  // dismissing the HUD revealed a seemingly frozen match. Never stop any
  // later user-started or online/peer game (stopOwnedNative checks epoch).
  const stopped=stopOwnedNative(s);
  const stillOwnsStarted=started&&s.room===room&&
   s.kickoffEpoch===nativeEpoch&&!serverLink&&!peerConnected&&!replay;
  s.phase=complete?'complete':'stopped';
  if(complete){
   const stored=save(s);
   status.textContent=(stored?
    'Best-of complete. Native game finished and local result saved.':
    'Best-of complete, but private browser storage could not save your result.')+
    (stillOwnsStarted&&!stopped?
     ' The native match could not be stopped; stop it before playing again.':'');
  }else{
   status.textContent='Series interrupted. Partial rounds were not saved.'+
    (stillOwnsStarted&&!stopped?
     ' Stop the still-active local match before starting another series.':'');
  }
  render(s);
 }
 // A failed *next* kickoff should not erase genuine results already played.
 // Preserve the completed rounds only if the interrupted native kickoff can
 // be stopped or was never started. Do not retry automatically or invent goals.
 function recoverFailedNextRound(s,message){
  if(session!==s)return;
  const stopped=stopOwnedNative(s);
  if(s.rounds.length&&(!started||stopped)&&!serverLink&&!peerConnected&&!replay){
   s.phase='between';
   hud.hidden=false;
   render(s);
   status.textContent=message+' Your previous '+s.rounds.length+
    ' real round'+(s.rounds.length===1?' is':'s are')+
    ' preserved. Select Play next round to retry explicitly.';
   return;
  }
  finalize(s,false);
  status.textContent=message+' Series stopped to protect native match ownership.';
 }
 function roundOver(winner){
  const s=session;
  if(!s||s.phase!=='running')return;
  s.rounds.push({winner,frames:Math.min(s.duration*60,s.elapsed)});
  if(winner==='human')s.human++;
  else if(winner==='other')s.other++;
  else s.draws++;
  s.phase='between';
  // Stop the real local native game at the declared end of this round.
  // The next native round still requires an explicit player action.
  if(room===s.room&&nativeEpoch===s.kickoffEpoch&&
   !serverLink&&!peerConnected&&!replay&&!paused){
   try{
    room.setGamePaused(true,0);paused=true;releaseInputs();setButtons();
   }catch{
    // A goal still counts even if the native pause fails. Do not leave a
    // live, uncontrolled offline match playing behind the between-round UI.
    const stopped=stopOwnedNative(s);
    status.textContent=stopped?
     'Round recorded. Native pause failed, so the local match was stopped.':
     'Round recorded, but native pause/stop failed. Stop that match before another round.';
   }
  }
  const majority=Math.floor(s.bestOf/2)+1;
  if(s.human>=majority||s.other>=majority||s.rounds.length>=s.bestOf)
   finalize(s,true);
  else render(s);
 }
 function acceptBoot(s){
  if(session!==s||s.phase!=='starting'||nativeEpoch!==s.kickoffEpoch||
   room!==s.room||!ready(s.opponent))return false;
  s.side=own().team.id;
  // Keep the score captured at native kickoff: a goal during the short
  // player-spawn grace period must still decide this first-goal round.
  if(!s.score)s.score=score();
  s.frame=room.currentFrameNo;s.elapsed=0;s.phase='running';
  render(s);
  status.textContent='Native match running. The next goal or complete active clock decides this round.';
  return true;
 }
 function tick(){
  const s=session;
  if(!s)return;
  // A different real kickoff, server room or replay invalidates the old
  // series, even while the user is reading Home/My Games.
  if(activeSeries(s)&&s.room&&!stillOwnsSeries(s)){
   finalize(s,false);return;
  }
  if(s.phase==='between'){paintReturn();return;}
  if(s.phase==='starting'){
   // An invite/queue opened during boot must not claim a local 1v1 kickoff.
   if(blocked()){finalize(s,false);return;}
   if(document.hidden||pitch.hidden){preserveWhenAway(s);return;}
   if(!acceptBoot(s)&&performance.now()-s.bootAt>=1200){
    recoverFailedNextRound(s,'The new native players did not become ready.');
   }
   return;
  }
  if(s.phase!=='running')return;
  if(document.hidden||pitch.hidden){preserveWhenAway(s);return;}
  // Disc objects can disappear briefly during the native goal/reset animation.
  // Check stable match authority here, and let the real score settle the round.
  if(serverLink||peerConnected||peer||replay||!started||
   nativeEpoch!==s.kickoffEpoch||room!==s.room||
   document.getElementById('mode')?.value!==(s.opponent==='human'?'local':'bot')||
   !room?.gameState||!Number.isSafeInteger(room.currentFrameNo)||
   !Number.isSafeInteger(room.gameState.redScore)||
   !Number.isSafeInteger(room.gameState.blueScore)||
   room.currentFrameNo<s.frame){
   finalize(s,false);return;
  }
  const now=room.currentFrameNo;
  if(!paused)s.elapsed+=Math.max(0,now-s.frame);
  s.frame=now;
  const current=score();
  if(current[0]<s.score[0]||current[1]<s.score[1]){
   finalize(s,false);return;
  }
  const localTeam=own()?.team?.id;
  // A real team switch is not a goal-reset animation. Never attribute a
  // score from that changed player context to the previous series round.
  if(localTeam!=null&&localTeam!==s.side){finalize(s,false);return;}
  const ownPoints=current[s.side===1?0:1]-s.score[s.side===1?0:1];
  const aiPoints=current[s.side===1?1:0]-s.score[s.side===1?1:0];
  if(ownPoints>0||aiPoints>0){
   roundOver(ownPoints>0&&aiPoints===0?'human':aiPoints>0&&ownPoints===0?'other':'draw');
   return;
  }
  // The scorer's disc or team may be detached for a goal/reset frame.
  // A verified score delta is authoritative; otherwise reject a truly
  // changed team before the round continues.
  if(localTeam!==s.side){finalize(s,false);return;}
  if(s.elapsed>=s.duration*60){roundOver('draw');return;}
  render(s);
 }
 function bootRound(s){
  if(session!==s)return;
  const msg=blocked();
  if(msg){status.textContent=msg;return;}
  const before=nativeEpoch;
  try{
   if(!quickPlay(s.opponent==='human'?'local':'bot',true,true))
    throw Error('Native offline 1v1 is unavailable.');
   if(nativeEpoch===before||!started||serverLink||peerConnected||replay)
    throw Error('Native offline kickoff was not confirmed.');
   s.room=room;s.kickoffEpoch=nativeEpoch;s.bootAt=performance.now();
   s.score=Number.isSafeInteger(room?.gameState?.redScore)&&
    Number.isSafeInteger(room?.gameState?.blueScore)?score():null;
   s.phase='starting';hud.hidden=false;render(s);
   status.textContent='Native kickoff sent. Waiting briefly for both players to spawn…';
   acceptBoot(s);
  }catch(error){
   // The native engine may have started before a later startup step failed.
   // Capture that specific kickoff so finalize can stop only our orphan match.
   if(nativeEpoch!==before){s.room=room;s.kickoffEpoch=nativeEpoch;}
   recoverFailedNextRound(s,error?.message||'Unable to start native local match.');
  }
 }
 start.onclick=()=>{
  const reason=blocked();
  if(reason){status.textContent=reason;return;}
  if((started||replay)&&!confirm('Start a new offline best-of series? Your current unsaved local match or replay will be replaced.')){
   status.textContent='Existing local game preserved.';return;
  }
  const bestOf=Number(games.value),duration=Number(time.value),opponentType=opponent.value;
  if(!LENGTHS.includes(bestOf)||!DURATIONS.includes(duration)||
   !['ai','human'].includes(opponentType))return;
  const s={bestOf,duration,opponent:opponentType,phase:'between',room:null,side:0,score:[0,0],
   frame:0,elapsed:0,rounds:[],human:0,other:0,draws:0};
  session=s;bootRound(s);
 };
 next.onclick=()=>{
  const s=session;if(!s||s.phase!=='between')return;
  bootRound(s);
 };
 stop.onclick=()=>{if(session&&['starting','running','between'].includes(session.phase))finalize(session,false);};
 retry.onclick=()=>start.click();
 dismiss.onclick=()=>{
  const finished=!!session&&['complete','stopped'].includes(session.phase);
  // The completed result has already been recorded. Dismissing must leave a
  // visible playable choice, not an abandoned paused pitch without controls.
  session=null;hud.hidden=true;
  if(finished&&!started&&!serverLink&&!peerConnected&&!replay)
   showView('home');
 };
 window.setInterval(tick,120);
 // The actual local match is already paused by views.js when changing tabs.
 // Keep genuine best-of rounds and the precise original kickoff ownership.
 const previousShowView=showView;
 showView=function(view){
  previousShowView(view);
  if(view!=='play'&&activeSeries(session))preserveWhenAway(session);
  paintReturn();
 };
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&activeSeries(session))preserveWhenAway(session);
  else paintReturn();
 });
 window.addEventListener('focus',paintReturn);
})();
