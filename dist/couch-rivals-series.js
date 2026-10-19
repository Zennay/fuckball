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
  make('p','Make it a real game night. Choose 2v2, 3v3 or 4v4, then play best-of-3, 5 or 7; Red vs Blue use the same four real human players, with native AI filling any extra team slots. All results stay on this device and are never ranked.'));
 const actions=make('div',null,'couch-series-controls');
 const formatLabel=make('label','Series format');
 const format=make('select');format.setAttribute('aria-label','Four-player series length');
 for(const n of [3,5,7])format.add(new Option('Best of '+n,String(n)));
 formatLabel.append(format);
 const teamLabel=make('label','Native squad size');
 const teamSize=make('select');teamSize.setAttribute('aria-label','Four-player series team size');
 for(const n of [2,3,4])teamSize.add(new Option(n+'v'+n+(n===2?' · no bots':
  ' · '+(n-2)+' AI teammate'+(n===4?'s':'')+' per team'),String(n)));
 teamLabel.append(teamSize);
 const start=make('button','▶ START FOUR-PLAYER SERIES');start.type='button';start.className='primary';
 const next=make('button','▶ NEXT ROUND');next.type='button';next.hidden=true;
 const end=make('button','End series');end.type='button';end.hidden=true;
 const exportButton=make('button','↓ Save series result');exportButton.type='button';exportButton.hidden=true;
 const imageButton=make('button','↓ Save PNG scorecard');imageButton.type='button';imageButton.hidden=true;
 actions.append(formatLabel,teamLabel,start,next,end,exportButton,imageButton);
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
    ['red','blue'].includes(r.winner)&&
    (r.teamSize===undefined||[2,3,4].includes(r.teamSize)));
  }catch{archived=[];}
 }
 const compact=s=>String(s||'').replace(/[\x00-\x1f\x7f-\x9f]/g,'').slice(0,24);
 function labels(){
  const players=room?.state?.players||[];
  const name=id=>compact(players.find(p=>p.id===id)?.name)||'Player '+id;
  return {red:name(1)+' + '+name(2),blue:name(3)+' + '+name(4)};
 }
 function record(){
  const result={created:series.created,bestOf:series.bestOf,teamSize:series.teamSize,red:series.red,
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
   const row=make('div',null,'couch-series-history-row');
   row.append(make('p',title+' · '+(r.teamSize||2)+'v'+(r.teamSize||2)+
    ' · Best of '+r.bestOf+' · Red '+r.red+' : '+r.blue+' Blue · '+
    (r.winner==='red'?'Red':'Blue')+' won'+
    (r.draws?' · '+r.draws+' drawn rounds':'')));
   const card=make('button','↓ PNG');card.type='button';
   card.setAttribute('aria-label','Download private PNG scorecard from '+title);
   card.onclick=()=>savePng(r);row.append(card);history.append(row);
  }
 }
 function display(){
  const active=!!series;
  start.hidden=active;formatLabel.hidden=active;teamLabel.hidden=active;
  next.hidden=!active||!series.resolved||series.complete;
  end.hidden=!active;exportButton.hidden=!active||!series.complete;
  imageButton.hidden=!active||!series.complete;
  tally.hidden=!active;hud.hidden=!active||pitch.hidden;
  if(!active){tally.replaceChildren();hud.replaceChildren();return;}
  const text='RED '+series.red+' — '+series.blue+' BLUE · '+series.teamSize+
   'v'+series.teamSize+' · Best of '+series.bestOf+
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
   if(document.getElementById('mode')?.value!==series.mode||
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
  const size=Number(teamSize.value);
  if(![2,3,4].includes(size)){announce('Choose a supported native team size.');return;}
  const mode=size===2?'couchRivals':size===3?'couchRivals3v3':'couchRivals4v4';
  // Refuse a not-yet-integrated native mode; never advertise a playable series
  // if its roster format does not exist on the selected deployed shell.
  if(!Array.from(document.getElementById('mode')?.options||[]).some(o=>o.value===mode)){
   announce('Selected native team size is unavailable in this build.');return;
  }
  if(!quickPlay(mode,true,false)){
   announce('Finish the current online or local transition before starting.');return;
  }
  const bestOf=Number(format.value);
  series={created:Date.now(),bestOf,teamSize:size,mode,red:0,blue:0,draws:0,round:1,
   resolved:false,complete:false,seen:false,rounds:[],names:labels(),final:null};
  announce('Round 1 live · '+size+'v'+size+' with four real humans and '+
   (size-2)+' AI teammate(s) per team. First native goal wins.');
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
   document.getElementById('mode')?.value!==series.mode||
   event.detail?.room!==room)return;
  const team=event.detail?.team;
  if(team!==1&&team!==2)return;
  const source=series;
  queueMicrotask(()=>{
   if(series===source&&!source.resolved&&!source.complete)
    resolve(team===1?'red':'blue');
  });
 });
 function savePng(saved){
  const result=saved&&typeof saved==='object'&&!Array.isArray(saved)?
   saved:(series?.complete?series.final:null);
  if(!result)return;
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=675;
  const ctx=canvas.getContext?.('2d');
  if(!ctx){announce('PNG export is unavailable in this browser. Use JSON export instead.');return;}
  try{
   const gradient=ctx.createLinearGradient(0,0,1200,675);
   gradient.addColorStop(0,'#102f34');gradient.addColorStop(1,'#0a1d2c');
   ctx.fillStyle=gradient;ctx.fillRect(0,0,1200,675);
   const text=(value,x,y,size,color='#eef9eb',weight=700,width=1080)=>{
    ctx.fillStyle=color;ctx.font=weight+' '+size+'px system-ui, sans-serif';
    ctx.fillText(String(value),x,y,width);
   };
   ctx.fillStyle='#c7f29e';ctx.fillRect(62,58,77,8);
   text('FUCKBALL / COUCH RIVALS',62,115,25,'#d0f3b1',800);
   text('FOUR HUMAN PLAYERS · LOCAL ONLY',62,154,19,'#b9d2cc',600);
   const size=[2,3,4].includes(result.teamSize)?result.teamSize:2;
   text(size+'v'+size+' · BEST OF '+result.bestOf,62,228,44,'#f8fdeb',850);
   ctx.fillStyle='#264955';ctx.fillRect(62,270,1076,230);
   text('RED',98,318,23,'#ffb6b6',800);
   text(String(result.names?.red||'Player 1 + Player 2'),98,362,25,'#f9e6e2',750,400);
   text('BLUE',705,318,23,'#a6d6ff',800);
   text(String(result.names?.blue||'Player 3 + Player 4'),705,362,25,'#e1f1ff',750,400);
   text(String(result.red),190,463,86,'#ffd7d7',900);
   text(':',556,449,67,'#d7ecd6',700);
   text(String(result.blue),855,463,86,'#bde4ff',900);
   text((result.winner==='red'?'RED':'BLUE')+' WIN',63,560,36,'#d3f7a8',850);
   text((result.draws||0)+' DRAWN ROUNDS · '+(result.rounds?.length||0)+' ROUNDS PLAYED',63,595,18,'#c7dcdb',650);
   ctx.fillStyle='#587d76';ctx.fillRect(62,617,1076,1);
   text('UNVERIFIED · DEVICE-LOCAL · NOT A RANKED RESULT',62,650,17,'#bad2c8',650);
   const date=new Date(result.created);
   if(Number.isFinite(date.getTime()))text(date.toLocaleDateString(),900,650,16,'#b1c8c0',550,235);
   canvas.toBlob(blob=>{
    if(!blob){announce('PNG export failed. Your original result is still available as JSON.');return;}
    const url=URL.createObjectURL(blob),link=make('a');link.href=url;
    link.download='fuckball-couch-series-'+size+'v'+size+'-'+
     new Date(result.created).toISOString().slice(0,10)+'.png';
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    announce('Private 2D series PNG saved; local score, not a server-verified result.');
   },'image/png');
  }catch{
   announce('PNG export is not supported in this browser. Your JSON result remains available.');
  }
 }
 start.onclick=startSeries;next.onclick=nextRound;
 exportButton.onclick=exportResult;imageButton.onclick=savePng;
 end.onclick=()=>{
  if(!series)return;
  if(!series.complete&&!window.confirm('End the unfinished local series? Its partial result will not be saved.'))return;
  series=null;announce('Series closed. The native local match remains under your control.');display();
 };
 readArchive();displayHistory();display();requestAnimationFrame(watch);
})();
