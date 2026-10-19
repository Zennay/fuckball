'use strict';
// Comeback Arena: authentic offline native 1v1 score/time; virtual deficit is
// practice-only arithmetic, never injected into the engine or online results.
(function(){
 const home=document.getElementById('homeView'),match=document.getElementById('matchView');
 if(!home||!match||!document.getElementById('quickPractice'))return;
 const KEY='fuckball.native-comeback-arena.v1',MAX=20,DURATIONS=[60,120,180],DEFICITS=[1,2,3],DAY=86400000;
 const el=(tag,text,klass)=>{const node=document.createElement(tag);
  if(text!==undefined&&text!==null)node.textContent=String(text);
  if(klass)node.className=klass;return node;};
 const panel=el('section',null,'comeback-arena');
 panel.setAttribute('aria-label','Native offline comeback challenge');
 panel.append(el('h2','COMEBACK ARENA.'),el('p',
  'Can you turn the game around? Start one, two or three VIRTUAL goals down against native local AI. Play a full real 1v1 clock: your actual goals and conceded goals determine whether you overcome the practice-only handicap. Real engine score, normal settings, physics and online results are never modified.'));
 const fields=el('div',null,'comeback-fields');
 const deficitLabel=el('label','Practice-only goal deficit'),deficit=el('select');
 deficit.setAttribute('aria-label','Choose virtual starting goal deficit');
 for(const n of DEFICITS)deficit.add(new Option(n+' virtual goal'+(n===1?'':'s')+' behind',String(n)));
 deficit.value='2';deficitLabel.append(deficit);
 const durationLabel=el('label','Active play duration'),duration=el('select');
 duration.setAttribute('aria-label','Comeback challenge active duration');
 for(const n of DURATIONS)duration.add(new Option(n+' seconds',String(n)));
 duration.value='120';durationLabel.append(duration);
 const start=el('button','▶ START COMEBACK','primary');start.type='button';
 fields.append(deficitLabel,durationLabel,start);
 const status=el('p','Only full-clock native 1v1 results are recorded. Virtual goals are never real match goals.','comeback-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const history=el('section',null,'comeback-history');
 const historyHead=el('div',null,'comeback-history-head');
 historyHead.append(el('h3','MY LOCAL COMEBACKS'));
 const exportBtn=el('button','↓ Export local attempts'),clear=el('button','Clear history');
 exportBtn.type=clear.type='button';historyHead.append(exportBtn,clear);
 const records=el('div',null,'comeback-records');
 history.append(historyHead,records);
 panel.append(fields,status,history);
 const anchor=home.querySelector('.ai-gauntlet-setup')||home.querySelector('.clean-sheet-setup')||home.querySelector('.mode-cards');
 if(anchor)anchor.insertAdjacentElement('afterend',panel);else home.append(panel);
 const hud=el('aside',null,'comeback-hud');hud.hidden=true;
 hud.setAttribute('aria-label','Active offline comeback challenge');
 const badge=el('strong','COMEBACK · VIRTUAL GOAL DEFICIT');
 const clock=el('span',null,'comeback-clock'),score=el('p',null,'comeback-score');
 score.setAttribute('role','status');score.setAttribute('aria-live','polite');
 const gauge=el('progress');gauge.max=100;gauge.value=0;
 gauge.setAttribute('aria-label','Completed native unpaused play clock');
 const actions=el('div',null,'comeback-actions');
 const stop=el('button','Stop drill'),again=el('button','Retry challenge'),close=el('button','Close');
 for(const button of [stop,again,close])button.type='button';
 again.hidden=close.hidden=true;actions.append(stop,again,close);
 hud.append(badge,clock,score,gauge,actions);match.append(hud);
 let active=null;
 const now=()=>Date.now();
 const valid=x=>x&&Number.isSafeInteger(x.at)&&x.at>0&&x.at<=now()+DAY&&
  DURATIONS.includes(x.duration)&&DEFICITS.includes(x.deficit)&&
  Number.isSafeInteger(x.scored)&&x.scored>=0&&x.scored<=999&&
  Number.isSafeInteger(x.conceded)&&x.conceded>=0&&x.conceded<=999&&
  Number.isSafeInteger(x.elapsed)&&x.elapsed>=x.duration&&x.elapsed<=x.duration+1&&
  typeof x.completed==='boolean'&&x.completed===(x.scored>x.conceded+x.deficit);
 function read(){
  try{const value=JSON.parse(localStorage.getItem(KEY)||'[]');
   return Array.isArray(value)&&value.length<=MAX?value.filter(valid):[];
  }catch{return[];}
 }
 function renderHistory(){
  const rows=read();records.replaceChildren();exportBtn.disabled=clear.disabled=!rows.length;
  if(!rows.length){records.append(el('p','Finish your first full-clock native comeback attempt to build a private history.'));return;}
  for(const row of rows.slice(0,7)){
   const finalFor=row.scored,finalAgainst=row.conceded+row.deficit;
   const outcome=row.completed?'COMEBACK WON':finalFor===finalAgainst?'VIRTUAL DRAW':'CHALLENGE LOST';
   const item=el('article',null,'comeback-record');
   item.append(el('strong',outcome+' · '+finalFor+'–'+finalAgainst+' adjusted'),
    el('span','Native score '+row.scored+'–'+row.conceded+' · started '+row.deficit+' virtual goal'+(row.deficit===1?'':'s')+' down · '+row.duration+'s active · '+new Date(row.at).toLocaleDateString()));
   records.append(item);
  }
  const wins=rows.filter(row=>row.completed).length;
  records.append(el('p',wins+' comeback goal'+(wins===1?'':'s')+' met in '+rows.length+' retained full-clock local attempt'+(rows.length===1?'':'s')+'.','comeback-history-summary'));
 }
 function save(s){
  const record={at:now(),duration:s.duration,deficit:s.deficit,
   elapsed:s.duration,scored:s.scored,conceded:s.conceded,
   completed:s.scored>s.conceded+s.deficit};
  const saved=persist([record,...read()].slice(0,MAX));
  if(!saved)status.textContent='The local match finished, but browser storage could not save your result.';
  renderHistory();
 }
 function persist(rows){try{localStorage.setItem(KEY,JSON.stringify(rows));return true;}catch{return false;}}
 exportBtn.onclick=()=>{
  const rows=read();if(!rows.length)return;
  const data={format:'fuckball-native-comeback-arena',version:1,
   source:'unranked device-only native local goals with explicitly virtual starting deficit',
   warning:'Adjusted score is practice arithmetic, not a match result or verified player record.',
   exportedAt:new Date().toISOString(),attempts:rows};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=el('a');a.href=url;a.download='fuckball-native-comebacks-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 };
 clear.onclick=()=>{
  if(!read().length||!confirm('Erase only the Comeback Arena attempts stored on this device? Actual online games and other training stay untouched.'))return;
  try{localStorage.removeItem(KEY);status.textContent='Only the local comeback history was cleared.';}
  catch{status.textContent='Could not clear browser storage.';}renderHistory();
 };
 function matchReady(){
  if(serverLink||peerConnected||replay||!room||!started||match.hidden||!room.gameState)return false;
  if(!Number.isSafeInteger(room.currentFrameNo)||room.currentFrameNo<0||
     !Number.isSafeInteger(room.gameState.redScore)||!Number.isSafeInteger(room.gameState.blueScore))return false;
  const mine=room.state?.players?.find?.(p=>p.id===1);
  const bot=room.state?.players?.find?.(p=>p.id===2);
  return !!mine&&!!bot&&[1,2].includes(mine.team?.id)&&bot.team?.id===3-mine.team.id&&
   !botIds.has(1)&&botIds.has(2);
 }
 function side(){return room?.state?.players?.find?.(p=>p.id===1)?.team?.id;}
 function blocked(){
  if(serverLink||peerConnected)return 'Leave the current online room before entering offline Comeback Arena.';
  if(typeof pendingSessionBlock==='function')return pendingSessionBlock();
  if(document.querySelector('.quick-queue-actions button:not([hidden]),.quick-ready:not([hidden])'))
   return 'Cancel the active human Quick Match search first.';
  return document.getElementById('joinScreen')?.hidden===false?
   'Close the current invitation or sign-in first.':'';
 }
 function readScore(s){
  const g=s.room.gameState;
  return s.side===1?[g.redScore,g.blueScore]:[g.blueScore,g.redScore];
 }
 function progress(s){
  const remain=Math.max(0,Math.ceil((s.duration*60-s.frames)/60));
  const adjustedAgainst=s.conceded+s.deficit;
  clock.textContent=remain+'s remaining · '+s.scored+'–'+adjustedAgainst+' VIRTUAL SCORE';
  score.textContent='REAL ENGINE '+s.scored+'–'+s.conceded+' · virtual handicap +'+s.deficit+
   ' against · '+(s.scored>adjustedAgainst?'Ahead for now':s.scored===adjustedAgainst?'Level for now':'Trailing');
  gauge.value=Math.min(100,Math.round(100*s.frames/(s.duration*60)));
 }
 function finish(message,complete=false){
  const s=active;if(!s)return;active=null;
  if(complete)save(s);
  const adjustedAgainst=s.conceded+s.deficit;
  badge.textContent=message;
  clock.textContent=complete?'FULL CLOCK · '+s.scored+'–'+adjustedAgainst+' ADJUSTED':'Incomplete · nothing saved';
  score.textContent=complete?(s.scored>adjustedAgainst?
   'COMEBACK ACHIEVED · you finished ahead after the virtual handicap.':
   s.scored===adjustedAgainst?'VIRTUAL DRAW · equal after the virtual handicap.':
   'CHALLENGE LOST · try to overturn the handicap next round.'):
   'The real local game was interrupted; no full-clock practice attempt was credited.';
  if(complete)gauge.value=100;
  stop.hidden=true;again.hidden=false;close.hidden=false;
 }
 function dismiss(){active=null;hud.hidden=true;stop.hidden=false;again.hidden=true;close.hidden=true;}
 function tick(){
  const s=active;if(!s)return;
  if(document.hidden){finish('COMEBACK · TAB HIDDEN');return;}
  if(!matchReady()||room!==s.room||side()!==s.side||room.currentFrameNo<s.frame){
   finish('COMEBACK · MATCH OR TEAM CHANGED');return;
  }
  const [mine,theirs]=readScore(s);
  if(mine<s.initialFor||theirs<s.initialAgainst){finish('COMEBACK · MATCH RESTARTED');return;}
  const delta=room.currentFrameNo-s.frame;
  if(delta>240){finish('COMEBACK · FRAME INTERRUPTED');return;}
  if(!paused)s.frames+=delta;
  s.frame=room.currentFrameNo;
  s.scored=Math.min(999,mine-s.initialFor);
  s.conceded=Math.min(999,theirs-s.initialAgainst);
  progress(s);
  if(s.frames>=s.duration*60)finish('COMEBACK · FULL TIME',true);
 }
 start.onclick=()=>{
  const reason=blocked();if(reason){status.textContent=reason;return;}
  if((started||replay)&&!confirm('Start a new native offline Comeback Arena 1v1? Your current local match or replay, including unsaved progress, will be replaced.')){
   status.textContent='Your current local game was preserved.';return;
  }
  const secs=Number(duration.value),goals=Number(deficit.value);
  if(!DURATIONS.includes(secs)||!DEFICITS.includes(goals)){status.textContent='Choose supported comeback settings.';return;}
  dismiss();
  try{
   if(!quickPlay('bot',true,true))throw Error('Native local 1v1 could not start without replacing your active session.');
   if(!matchReady())throw Error('Native 1v1 unavailable. Leave the online room first.');
   const team=side(),g=room.gameState;
   active={room,side:team,duration:secs,deficit:goals,frames:0,
    frame:room.currentFrameNo,
    initialFor:team===1?g.redScore:g.blueScore,
    initialAgainst:team===1?g.blueScore:g.redScore,scored:0,conceded:0};
   badge.textContent='COMEBACK · VIRTUAL HANDICAP';
   stop.hidden=false;again.hidden=true;close.hidden=true;hud.hidden=false;
   status.textContent='Real offline native 1v1 started. The virtual deficit affects ONLY this training challenge.';
   progress(active);
  }catch(error){dismiss();status.textContent=error?.message||'Could not launch local comeback.';}
 };
 stop.onclick=()=>finish('COMEBACK · STOPPED');
 again.onclick=()=>start.click();close.onclick=dismiss;
 window.setInterval(tick,150);
 window.addEventListener('storage',event=>{if(event.key===KEY||event.key===null)renderHistory();});
 const oldShowView=showView;
 showView=function(destination){if(destination!=='play'&&active)finish('COMEBACK · LEFT PITCH');oldShowView(destination);};
 renderHistory();
})();
