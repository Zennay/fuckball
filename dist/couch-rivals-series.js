'use strict';
// Private device-local best-of competition between four genuine couch humans.
// No substitute bots, ranking writes, verified results or online messages.
(function(){
 const home=document.getElementById('homeView'),pitch=document.getElementById('matchView');
 if(!home||!pitch||typeof quickPlay!=='function')return;
 const KEY='fuckball.couch-rivals.series.v1',MAX=12;
 const make=(tag,text,klass)=>{
  const el=document.createElement(tag);
  if(text!==undefined&&text!==null)el.textContent=String(text);
  if(klass)el.className=klass;return el;
 };
 const panel=make('section',null,'couch-series');
 panel.setAttribute('aria-label','Offline four-player 2v2 series');
 panel.append(make('h2','COUCH RIVALS · SERIES'),
  make('p','Make it a real game night. First goal wins each round; Red vs Blue play best-of-3, 5 or 7 with the same four human players. All results stay on this device and are never ranked.'));
 const actions=make('div',null,'couch-series-controls');
 const formatLabel=make('label','Series format');
 const format=make('select');format.setAttribute('aria-label','2v2 series length');
 for(const n of [3,5,7])format.add(new Option('Best of '+n,String(n)));
 formatLabel.append(format);
 const start=make('button','▶ START FOUR-PLAYER SERIES');start.type='button';start.className='primary';
 const next=make('button','▶ NEXT ROUND');next.type='button';next.hidden=true;
 const end=make('button','End series');end.type='button';end.hidden=true;
 const exportButton=make('button','↓ Save series result');exportButton.type='button';exportButton.hidden=true;
 actions.append(formatLabel,start,next,end,exportButton);
 const status=make('p','Requires two independent standard gamepads for Blue. Red plays on shared keyboard.','couch-series-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const tally=make('div',null,'couch-series-tally');tally.hidden=true;
 const history=make('div',null,'couch-series-history');
 panel.append(actions,status,tally,history);
 const anchor=home.querySelector('.couch-play')||home.querySelector('.play-hub');
 if(anchor)anchor.insertAdjacentElement('afterend',panel);else home.append(panel);
 const hud=make('aside',null,'couch-series-hud');hud.hidden=true;
 hud.setAttribute('aria-label','Current four-player best-of series score');pitch.append(hud);
 let series=null,message='',archived=[];
 function announce(text){if(text!==message){message=text;status.textContent=text;}}
 function saveArchive(){
  try{localStorage.setItem(KEY,JSON.stringify({version:1,records:archived.slice(0,MAX)}));return true;}
  catch{return false;}
 }
 function readArchive(){
  try{
   const raw=localStorage.getItem(KEY);
   if(!raw||raw.length>90000)return;
   const data=JSON.parse(raw);
   if(data?.version!==1||!Array.isArray(data.records))return;
   archived=data.records.slice(0,MAX).filter(r=>r&&[3,5,7].includes(r.bestOf)&&
    Number.isFinite(r.created)&&r.created>0&&r.created<=Date.now()+86400000&&
    Number.isInteger(r.red)&&r.red>=0&&r.red<=7&&
    Number.isInteger(r.blue)&&r.blue>=0&&r.blue<=7&&
    Number.isInteger(r.draws)&&r.draws>=0&&r.draws<=50&&
    ['red','blue'].includes(r.winner));
  }catch{archived=[];}
 }
 const compact=s=>String(s||'').replace(/[\x00-\x1f\x7f-\x9f]/g,'').slice(0,24);
 function labels(){
  const players=room?.state?.players||[];
  const name=id=>compact(players.find(p=>p.id===id)?.name)||'Player '+id;
  return {red:name(1)+' + '+name(2),blue:name(3)+' + '+name(4)};
 }
 function record(){
  const result={created:series.created,bestOf:series.bestOf,red:series.red,
   blue:series.blue,draws:series.draws,winner:series.red>series.blue?'red':'blue',
   names:series.names,rounds:series.rounds.slice(0,50)};
  archived.unshift(result);archived=archived.slice(0,MAX);
  if(!saveArchive())announce('Series finished. Local history could not be saved; export your result now.');
  return result;
 }
 function displayHistory(){
  history.replaceChildren();
  if(!archived.length)return;
  history.append(make('strong','RECENT PRIVATE RESULTS'));
  for(const r of archived.slice(0,5)){
   const day=new Date(r.created);
   const title=Number.isFinite(day.getTime())?day.toLocaleDateString():'Previous series';
   history.append(make('p',title+' · Best of '+r.bestOf+' · Red '+r.red+
    ' : '+r.blue+' Blue · '+(r.winner==='red'?'Red':'Blue')+' won'+
    (r.draws?' · '+r.draws+' drawn rounds':'')));
  }
 }
 function display(){
  const active=!!series;
  start.hidden=active;formatLabel.hidden=active;
  next.hidden=!active||!series.resolved||series.complete;
  end.hidden=!active;exportButton.hidden=!active||!series.complete;
  tally.hidden=!active;hud.hidden=!active||pitch.hidden;
  if(!active){tally.replaceChildren();hud.replaceChildren();return;}
  const text='RED '+series.red+' — '+series.blue+' BLUE · Best of '+series.bestOf+
   ' · Round '+series.round+(series.draws?' · Draws '+series.draws:'');
  tally.textContent=text;hud.replaceChildren(make('strong',text));
  if(series.resolved){
   const action=make('button',series.complete?'↓ EXPORT SERIES':'▶ NEXT ROUND');
   action.type='button';action.className='couch-series-hud-action';
   action.onclick=series.complete?exportResult:nextRound;
   hud.append(action);
  }
 }
 function resolve(winner){
  if(!series||series.resolved||series.complete)return;
  series.resolved=true;
  if(winner==='red')series.red++;
  else if(winner==='blue')series.blue++;
  else series.draws++;
  series.rounds.push({number:series.round,winner});
  if(typeof paused!=='undefined'&&!paused&&typeof started!=='undefined'&&started&&room?.gameState)
   togglePause(); // Freeze actual native play until players request another round.
  const ended=Math.max(series.red,series.blue)>=Math.floor(series.bestOf/2)+1;
  if(ended){
   series.complete=true;series.final=record();
   announce((series.red>series.blue?'RED':'BLUE')+' WINS THE SERIES · '+
    series.red+'–'+series.blue+'. Download your private result or start a new series.');
   displayHistory();
  }else{
   announce((winner==='draw'?'ROUND DRAW':winner.toUpperCase()+' SCORES')+
    ' · Native game paused. Use Next round when all four players are ready.');
  }
  display();
 }
 function watch(){
  if(series&&!series.complete&&!series.resolved){
   if(document.getElementById('mode')?.value!=='couchRivals'||
    typeof replay!=='undefined'&&replay||
    typeof peerConnected!=='undefined'&&peerConnected||
    typeof serverLink!=='undefined'&&serverLink){
    series=null;announce('Couch series ended because the local match was left.');display();
   }else{
    const state=typeof room!=='undefined'?room?.gameState:null;
    if(state){
     series.seen=true;
     if((state.redScore||0)>0||(state.blueScore||0)>0)
      resolve((state.redScore||0)>(state.blueScore||0)?'red':'blue');
    }else if(series.seen){
     // Native time limit expired before the first goal.
     resolve('draw');
    }
   }
  }
  if(series)hud.hidden=pitch.hidden;
  requestAnimationFrame(watch);
 }
 function startSeries(){
  const reason=typeof pendingSessionBlock==='function'?pendingSessionBlock():'';
  if(reason){announce(reason);return;}
  if((typeof started!=='undefined'&&started||typeof replay!=='undefined'&&replay)&&
   !window.confirm('Replace the current local game or replay with a four-player series? Unsaved local progress may be lost.')){
   announce('Previous local session preserved.');return;
  }
  const prepared=window.fuckballCouchRivals?.prepare?.();
  if(!prepared?.ok){announce(prepared?.message||'Two controllers required.');return;}
  if(!quickPlay('couchRivals',true,false)){
   announce('Finish the current online or local transition before starting.');return;
  }
  const bestOf=Number(format.value);
  series={created:Date.now(),bestOf,red:0,blue:0,draws:0,round:1,
   resolved:false,complete:false,seen:false,rounds:[],names:labels(),final:null};
  announce('Round 1 live · first native goal takes the round. Four real humans, zero bots.');
  display();
 }
 function nextRound(){
  if(!series||series.complete||!series.resolved)return;
  const prepared=window.fuckballCouchRivals?.prepare?.();
  if(!prepared?.ok){announce(prepared?.message||'Reconnect both Blue controllers first.');return;}
  if(typeof resetMatch!=='function'){announce('Native match reset unavailable.');return;}
  series.round++;series.resolved=false;series.seen=false;
  resetMatch(true);
  announce('Round '+series.round+' live · first native goal wins.');
  display();
 }
 function exportResult(){
  if(!series?.complete||!series.final)return;
  const data={format:'fuckball-couch-rivals-v1',source:'offline-unverified',
   result:series.final};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],
   {type:'application/json'}));
  const link=make('a');link.href=url;
  link.download='fuckball-couch-rivals-'+new Date(series.created).toISOString().slice(0,10)+'.json';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  announce('Private unverified series result downloaded. No online upload or rating change.');
 }
 // Use the real native goal callback as the authoritative first-goal signal.
 // Defer until the engine completes its current physics callback before pausing.
 window.addEventListener('fuckball:local-couch-goal',event=>{
  if(!series||series.resolved||series.complete||
   document.getElementById('mode')?.value!=='couchRivals'||
   event.detail?.room!==room)return;
  const team=event.detail?.team;
  if(team!==1&&team!==2)return;
  queueMicrotask(()=>{
   if(series&&!series.resolved&&!series.complete)resolve(team===1?'red':'blue');
  });
 });
 start.onclick=startSeries;next.onclick=nextRound;exportButton.onclick=exportResult;
 end.onclick=()=>{
  if(!series)return;
  if(!series.complete&&!window.confirm('End the unfinished local series? Its partial result will not be saved.'))return;
  series=null;announce('Series closed. The native local match remains under your control.');display();
 };
 readArchive();displayHistory();display();requestAnimationFrame(watch);
})();
