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
  node('p','Play a best-of series against the native local AI. Each round ends on the first actual goal or the active round clock. Both sides use the approved football engine; this is private, unranked practice.'));
 const fields=node('div',null,'sudden-death-fields');
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
 fields.append(gamesLabel,timeLabel,start);
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
 const validHistory=x=>x&&Number.isSafeInteger(x.at)&&x.at>0&&x.at<=Date.now()+86400000&&
  LENGTHS.includes(x.bestOf)&&DURATIONS.includes(x.duration)&&
  Array.isArray(x.rounds)&&x.rounds.length>=1&&x.rounds.length<=x.bestOf&&
  x.rounds.every(r=>['human','ai','draw'].includes(r.winner)&&
   Number.isSafeInteger(r.frames)&&r.frames>=0&&r.frames<=x.duration*60+120)&&
  ['human','ai','draw'].includes(x.winner)&&
  Number.isSafeInteger(x.human)&&Number.isSafeInteger(x.ai)&&Number.isSafeInteger(x.draws)&&
  x.human>=0&&x.ai>=0&&x.draws>=0&&x.human+x.ai+x.draws===x.rounds.length&&
  x.rounds.filter(r=>r.winner==='human').length===x.human&&
  x.rounds.filter(r=>r.winner==='ai').length===x.ai&&
  x.rounds.filter(r=>r.winner==='draw').length===x.draws&&
  x.winner===(x.human>x.ai?'human':x.ai>x.human?'ai':'draw')&&
  (x.rounds.length===x.bestOf||
   x.human>=Math.floor(x.bestOf/2)+1||
   x.ai>=Math.floor(x.bestOf/2)+1);
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
   rows.append(node('p','Finish your first native local AI best-of series to build a private history.'));
   return;
  }
  for(const record of history.slice(0,8)){
   const entry=node('article',null,'sudden-death-history-row');
   const label=record.winner==='human'?'SERIES WON':record.winner==='ai'?'AI WON':'SERIES DRAW';
   entry.append(node('strong',label+' · '+record.human+'–'+record.ai+
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
  const rounds=s.rounds.map(r=>({winner:r.winner,frames:r.frames}));
  const entry={at:Date.now(),bestOf:s.bestOf,duration:s.duration,rounds,
   human:s.human,ai:s.ai,draws:s.draws,
   winner:s.human>s.ai?'human':s.ai>s.human?'ai':'draw'};
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
 function ready(){
  const p=own();
  return !serverLink&&!peerConnected&&!replay&&started&&!pitch.hidden&&
   document.getElementById('mode')?.value==='bot'&&room?.gameState&&
   Number.isSafeInteger(room.currentFrameNo)&&
   Number.isSafeInteger(room.gameState.redScore)&&
   Number.isSafeInteger(room.gameState.blueScore)&&
   p?.disc&&[1,2].includes(p?.team?.id)&&!botIds.has(1)&&
   room.state.players.some(x=>x.id!==1&&botIds.has(x.id)&&
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
  const finished=s.phase==='complete'||s.phase==='stopped';
  const waiting=s.phase==='between';
  title.textContent=s.phase==='complete'?'SERIES COMPLETE · LOCAL AI':
   s.phase==='stopped'?'SERIES STOPPED · NOT SAVED':'SUDDEN DEATH · LOCAL 1v1';
  clock.textContent=finished?'Final · '+s.rounds.length+' recorded round'+(s.rounds.length===1?'':'s'):
   waiting?'Round '+s.rounds.length+' complete · choose next round':
    'Round '+(s.rounds.length+1)+'/'+s.bestOf+' · '+Math.max(0,Math.ceil((s.duration*60-s.elapsed)/60))+'s left';
  result.textContent='You '+s.human+' · AI '+s.ai+' · Draws '+s.draws+
   (waiting?' · next round requires your click':s.phase==='running'?' · first real goal wins':'');
  roundList.replaceChildren();
  for(const r of s.rounds){
   const rlabel=r.winner==='human'?'YOU SCORED':r.winner==='ai'?'AI SCORED':'NO GOAL · DRAW';
   roundList.append(node('li','Round '+(roundList.childElementCount+1)+': '+rlabel+
    ' at '+(r.frames/60).toFixed(1)+'s'));
  }
  next.hidden=!waiting;
  stop.hidden=finished;
  retry.hidden=dismiss.hidden=!finished;
 }
 function finalize(s,complete){
  if(session!==s)return;
  s.phase=complete?'complete':'stopped';
  if(complete){
   const stored=save(s);
   status.textContent=stored?
    'Best-of series complete. Local result saved on this device.':
    'Best-of series complete, but browser storage could not save your result.';
  }else{
   status.textContent='Series interrupted. Partial rounds were not saved.';
  }
  render(s);
 }
 function roundOver(winner){
  const s=session;
  if(!s||s.phase!=='running')return;
  s.rounds.push({winner,frames:Math.min(s.duration*60,s.elapsed)});
  if(winner==='human')s.human++;
  else if(winner==='ai')s.ai++;
  else s.draws++;
  s.phase='between';
  const majority=Math.floor(s.bestOf/2)+1;
  if(s.human>=majority||s.ai>=majority||s.rounds.length>=s.bestOf)
   finalize(s,true);
  else render(s);
 }
 function tick(){
  const s=session;
  if(!s||s.phase!=='running')return;
  if(document.hidden){finalize(s,false);return;}
  if(!ready()||room!==s.room||own()?.team?.id!==s.side||
   room.currentFrameNo<s.frame){finalize(s,false);return;}
  const now=room.currentFrameNo;
  if(!paused)s.elapsed+=Math.max(0,now-s.frame);
  s.frame=now;
  const current=score();
  if(current[0]<s.score[0]||current[1]<s.score[1]){
   finalize(s,false);return;
  }
  const ownPoints=current[s.side===1?0:1]-s.score[s.side===1?0:1];
  const aiPoints=current[s.side===1?1:0]-s.score[s.side===1?1:0];
  if(ownPoints>0||aiPoints>0){
   roundOver(ownPoints>0&&aiPoints===0?'human':aiPoints>0&&ownPoints===0?'ai':'draw');
   return;
  }
  if(s.elapsed>=s.duration*60){roundOver('draw');return;}
  render(s);
 }
 function bootRound(s){
  if(session!==s)return;
  const msg=blocked();
  if(msg){status.textContent=msg;return;}
  try{
   if(!quickPlay('bot',true,true)||!ready())throw Error('Native offline 1v1 is unavailable.');
   s.room=room;s.side=own().team.id;s.score=score();
   s.frame=room.currentFrameNo;s.elapsed=0;s.phase='running';
   hud.hidden=false;render(s);
   status.textContent='Native match running. The next goal or complete active clock decides this round.';
  }catch(error){
   finalize(s,false);
   status.textContent=error?.message||'Unable to start native local match.';
  }
 }
 start.onclick=()=>{
  const reason=blocked();
  if(reason){status.textContent=reason;return;}
  if((started||replay)&&!confirm('Start a new offline best-of series? Your current unsaved local match or replay will be replaced.')){
   status.textContent='Existing local game preserved.';return;
  }
  const bestOf=Number(games.value),duration=Number(time.value);
  if(!LENGTHS.includes(bestOf)||!DURATIONS.includes(duration))return;
  const s={bestOf,duration,phase:'between',room:null,side:0,score:[0,0],
   frame:0,elapsed:0,rounds:[],human:0,ai:0,draws:0};
  session=s;bootRound(s);
 };
 next.onclick=()=>{
  const s=session;if(!s||s.phase!=='between')return;
  bootRound(s);
 };
 stop.onclick=()=>{if(session&&['running','between'].includes(session.phase))finalize(session,false);};
 retry.onclick=()=>start.click();
 dismiss.onclick=()=>{session=null;hud.hidden=true;};
 window.setInterval(tick,120);
 const previousShowView=showView;
 showView=function(view){
  if(view!=='play'&&session&&['running','between'].includes(session.phase))
   finalize(session,false);
  previousShowView(view);
 };
})();
