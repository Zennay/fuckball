'use strict';
// One compact, optional home for existing local AI practice. No alternate game
// flow, permissions, rankings or physics: reparent the already-bound controls.
(function(){
 const home=document.getElementById('homeView');
 const modules=[
  {key:'first',title:'First Touch',selector:'.first-play-card',intro:'Learn movement, kicking and scoring.'},
  {key:'goals',title:'Goal Rush',selector:'.goal-rush-setup',intro:'Beat a local scoring target.'},
  {key:'team',title:'Teamwork',selector:'.teamwork-panel',intro:'Train real teammate kick follow-ups.'},
  {key:'defense',title:'Clean Sheet',selector:'.clean-sheet-setup',intro:'Protect your own goal against local AI for the full active clock.'},
  {key:'rockets',title:'Rocket Kick',selector:'.native-ball-burst',intro:'Train real ball speed following your own native kicks.'},
  {key:'ladder',title:'AI Gauntlet',selector:'.ai-gauntlet-setup',intro:'Win three genuine timed local 1v1 AI rounds to climb the ladder.'},
  {key:'comeback',title:'Comeback Arena',selector:'.comeback-arena',intro:'Recover from a virtual goal deficit in a complete real offline 1v1.'},
  {key:'keepaway',title:'Keep Away',selector:'.keep-away-setup',intro:'Build genuine kick streaks before the local AI or a goal breaks control.'},
  {key:'sudden',title:'Sudden Death',selector:'.sudden-death-setup',intro:'First-goal best-of versus native AI or a real Couch 1v1 opponent.'}
 ];
 if(!home)return;
 const existing=modules.map(m=>({...m,element:home.querySelector(m.selector)})).filter(m=>m.element);
 if(!existing.length)return;
 const KEY='fuckball.practice-lab.display.v1';
 let saved={};try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');if(s&&typeof s==='object'&&!Array.isArray(s))saved=s;}catch{}
 const root=document.createElement('section');root.className='practice-lab';
 root.setAttribute('aria-label','Optional local AI and Couch practice lab');
 const disclosure=document.createElement('details');disclosure.className='practice-lab-disclosure';
 const summary=document.createElement('summary');summary.className='practice-lab-summary';
 const summaryIcon=document.createElement('span');summaryIcon.className='practice-lab-icon';summaryIcon.textContent='↗';
 const name=document.createElement('div');name.className='practice-lab-heading';
 const title=document.createElement('strong');title.textContent='PRACTICE LAB.';
 const caption=document.createElement('small');caption.textContent='Optional offline lessons, scoring and teammate links — real approved physics.';
 name.append(title,caption);
 const badges=document.createElement('div');badges.className='practice-lab-badges';
 const count=document.createElement('span');count.textContent=existing.length+' drills available';
 const progress=document.createElement('span');progress.className='practice-lab-count';
 badges.append(count,progress);
 summary.append(summaryIcon,name,badges);disclosure.append(summary);
 const content=document.createElement('div');content.className='practice-lab-content';
 const explanation=document.createElement('p');
 explanation.className='practice-lab-help';
 explanation.textContent='Train with native local AI or play the two-human Couch Sudden Death series. Human Quick Match, server results and rankings are separate; physics is unchanged.';
 const tabs=document.createElement('div');tabs.className='practice-lab-tabs';
 tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Choose offline practice');
 const panes=document.createElement('div');panes.className='practice-lab-panes';
 const buttons=[];
 for(const item of existing){
  const tab=document.createElement('button');tab.type='button';tab.setAttribute('role','tab');
  tab.id='practice-lab-tab-'+item.key;
  const pane=document.createElement('section');pane.id='practice-lab-pane-'+item.key;
  pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby',tab.id);
  pane.tabIndex=0;
  tab.setAttribute('aria-controls',pane.id);
  const text=document.createElement('span');text.className='practice-lab-tab-title';text.textContent=item.title;
  const desc=document.createElement('small');desc.textContent=item.intro;
  tab.append(text,desc);
  panes.append(pane);tabs.append(tab);pane.append(item.element);
  buttons.push({key:item.key,tab,pane});
 }
 content.append(explanation,tabs,panes);disclosure.append(content);root.append(disclosure);
 const online=home.querySelector('.quick-queue-panel');
 const cards=home.querySelector('.mode-cards');
 if(online)online.insertAdjacentElement('afterend',root);
 else if(cards)cards.insertAdjacentElement('afterend',root);
 else home.append(root);
 let active=buttons.some(x=>x.key===saved.tab)?saved.tab:buttons[0].key;
 function activate(key,focus){
  active=key;
  for(const {key:k,tab,pane}of buttons){
   const show=k===key;tab.setAttribute('aria-selected',String(show));
   tab.tabIndex=show?0:-1;pane.hidden=!show;
   if(show&&focus)tab.focus();
  }
  try{localStorage.setItem(KEY,JSON.stringify({tab:key,open:disclosure.open}));}catch{}
 }
 for(const [index,item] of buttons.entries()){
  item.tab.addEventListener('click',()=>activate(item.key,false));
  item.tab.addEventListener('keydown',event=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
   event.preventDefault();
   const pos=event.key==='Home'?0:event.key==='End'?buttons.length-1:
    (index+(event.key==='ArrowRight'?1:buttons.length-1))%buttons.length;
   activate(buttons[pos].key,true);
  });
 }
 disclosure.open=saved.open===true;
 disclosure.addEventListener('toggle',()=>{
  try{localStorage.setItem(KEY,JSON.stringify({tab:active,open:disclosure.open}));}catch{}
  if(disclosure.open)renderProgress();
 });
 activate(active,false);
 function getLocal(key){
  try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}
 }
 function renderProgress(){
  const first=getLocal('fuckball.first-play-guide.v1');
  const completed=first&&first.version===1&&Number.isSafeInteger(first.at)&&first.at>0&&first.at<=Date.now()+86400000;
  const goals=getLocal('fuckball-local-goal-rush-history-v1');
  const teamwork=getLocal('fuckball.teamwork-native-drill.v1');
  const defending=getLocal('fuckball.clean-sheet-history.v1');
  const rockets=getLocal('fuckball.native-ball-burst-history.v1');
  const ladders=getLocal('fuckball.ai-gauntlet-history.v1');
  const comebacks=getLocal('fuckball.native-comeback-arena.v1');
  const keepaway=getLocal('fuckball.native-keep-away.v1');
  const sudden=getLocal('fuckball.native-sudden-death.v1');
  const valid=list=>Array.isArray(list)?list.filter(x=>x&&Number.isSafeInteger(x.at)&&x.at>0&&x.at<=Date.now()+86400000).length:0;
  const parts=[];
  if(completed)parts.push('First Touch complete');
  const attempts=valid(goals)+valid(teamwork)+valid(defending)+valid(rockets)+valid(comebacks)+valid(keepaway)+valid(sudden);
  const ladderWins=Array.isArray(ladders)?ladders.filter(x=>x?.version===1&&Array.isArray(x.wins)&&x.wins.length===3&&Number.isSafeInteger(x.finishedAt)&&x.finishedAt>0&&x.finishedAt<=Date.now()+86400000).length:0;
  if(attempts)parts.push(attempts+' local drill attempt'+(attempts===1?'':'s'));
  if(ladderWins)parts.push(ladderWins+' completed local AI ladder'+(ladderWins===1?'':'s'));
  progress.textContent=parts.length?parts.join(' · '):'No practice history yet';
 }
 function setupInsights(){
  const metrics=[
   {key:'goals',name:'Goal Rush',store:'fuckball-local-goal-rush-history-v1',valid:x=>
    [60,120,180].includes(x.duration)&&[1,3,5].includes(x.target)&&
    Number.isSafeInteger(x.goals)&&x.goals>=0&&x.goals<=999&&
    Number.isSafeInteger(x.elapsed)&&x.elapsed>=0&&x.elapsed<=180&&
    typeof x.completed==='boolean'&&x.completed===(x.goals>=x.target)},
   {key:'team',name:'Teamwork',store:'fuckball.teamwork-native-drill.v1',valid:x=>
    [120,180,300].includes(x.seconds)&&[2,4,6].includes(x.target)&&
    Number.isSafeInteger(x.links)&&x.links>=0&&x.links<=99&&
    Number.isSafeInteger(x.attempts)&&x.attempts>=0&&x.attempts<=9999&&
    Number.isSafeInteger(x.elapsed)&&x.elapsed>=0&&x.elapsed<=300&&
    typeof x.completed==='boolean'&&x.completed===(x.links>=x.target)},
   {key:'defense',name:'Clean Sheet',store:'fuckball.clean-sheet-history.v1',valid:x=>
    [60,120,180].includes(x.duration)&&[0,1,2].includes(x.allowance)&&
    Number.isSafeInteger(x.conceded)&&x.conceded>=0&&x.conceded<=999&&
    Number.isSafeInteger(x.scored)&&x.scored>=0&&x.scored<=999&&
    Number.isSafeInteger(x.elapsed)&&x.elapsed>=x.duration&&x.elapsed<=x.duration+1&&
    typeof x.completed==='boolean'&&x.completed===(x.conceded<=x.allowance)},
   {key:'rockets',name:'Rocket Kick',store:'fuckball.native-ball-burst-history.v1',valid:x=>
    [60,120,180].includes(x.duration)&&[3,5,7].includes(x.threshold)&&
    [1,3,5].includes(x.target)&&Number.isSafeInteger(x.hits)&&x.hits>=0&&x.hits<=999&&
    Number.isSafeInteger(x.kicks)&&x.kicks>=x.hits&&x.kicks<=9999&&
    Number.isSafeInteger(x.elapsed)&&x.elapsed>=0&&x.elapsed<=x.duration+1&&
    Number.isFinite(x.peak)&&x.peak>=0&&x.peak<=1000&&
    typeof x.completed==='boolean'&&x.completed===(x.hits>=x.target)},
   {key:'comeback',name:'Comeback Arena',store:'fuckball.native-comeback-arena.v1',valid:x=>
    [60,120,180].includes(x.duration)&&[1,2,3].includes(x.deficit)&&
    Number.isSafeInteger(x.scored)&&x.scored>=0&&x.scored<=999&&
    Number.isSafeInteger(x.conceded)&&x.conceded>=0&&x.conceded<=999&&
    Number.isSafeInteger(x.elapsed)&&x.elapsed>=x.duration&&x.elapsed<=x.duration+1&&
    typeof x.completed==='boolean'&&x.completed===(x.scored>x.conceded+x.deficit)},
   {key:'keepaway',name:'Keep Away',store:'fuckball.native-keep-away.v1',valid:x=>
    [60,120,180].includes(x.duration)&&[3,5,8].includes(x.target)&&
    Number.isSafeInteger(x.best)&&x.best>=0&&x.best<=999&&
    Number.isSafeInteger(x.kicks)&&x.kicks>=x.best&&x.kicks<=9999&&
    Number.isSafeInteger(x.breaks)&&x.breaks>=0&&x.breaks<=9999&&
    Number.isSafeInteger(x.elapsed)&&x.elapsed>=x.duration&&x.elapsed<=x.duration+1&&
    typeof x.completed==='boolean'&&x.completed===(x.best>=x.target)},
   {key:'sudden',name:'Sudden Death',store:'fuckball.native-sudden-death.v1',valid:x=>{
    if(![3,5,7].includes(x.bestOf)||![60,90,120].includes(x.duration)||
     !Array.isArray(x.rounds)||x.rounds.length<1||x.rounds.length>x.bestOf||
     !Number.isSafeInteger(x.draws)||x.draws<0||x.draws>7)return false;
    const couch=x.opponent==='human',first=couch?'player1':'human',
     second=couch?'player2':'ai',a=couch?x.player1:x.human,b=couch?x.player2:x.ai;
    return (couch||x.opponent===undefined||x.opponent==='ai')&&
     Number.isSafeInteger(a)&&Number.isSafeInteger(b)&&a>=0&&b>=0&&a<=7&&b<=7&&
     a+b+x.draws===x.rounds.length&&
     x.rounds.every(r=>r&&[first,second,'draw'].includes(r.winner)&&
      Number.isSafeInteger(r.frames)&&r.frames>=0&&r.frames<=x.duration*60+120)&&
     x.rounds.filter(r=>r.winner===first).length===a&&
     x.rounds.filter(r=>r.winner===second).length===b&&
     x.rounds.filter(r=>r.winner==='draw').length===x.draws&&
     x.winner===(a>b?first:b>a?second:'draw')&&
     (x.rounds.length===x.bestOf||a>=Math.floor(x.bestOf/2)+1||
      b>=Math.floor(x.bestOf/2)+1)&&
     typeof x.completed==='boolean'&&x.completed===(a>b);
   }}
  ];
  const part=document.createElement('details');part.className='practice-insights';
  const sum=document.createElement('summary');sum.textContent='PRACTICE INSIGHTS · MY NATIVE RESULTS';
  const lead=document.createElement('p');
  lead.textContent='Only the most recent saved attempts on this browser. Goals met are personal drill objectives, NOT win rate, Elo, verified skill or full lifetime activity. Interrupted games and other devices are not counted.';
  const controls=document.createElement('div');controls.className='practice-insights-controls';
  const periodLabel=document.createElement('label');periodLabel.textContent='Lookback';
  const period=document.createElement('select');period.setAttribute('aria-label','Local drill history period');
  for(const [id,label] of [['7','Past 7 days'],['30','Past 30 days'],['all','All retained attempts']])
   period.add(new Option(label,id));
  period.value='30';periodLabel.append(period);
  const refresh=document.createElement('button');refresh.type='button';refresh.textContent='↻ Update';
  const exportSummary=document.createElement('button');exportSummary.type='button';
  exportSummary.textContent='↓ Export private summary';
  const exportCard=document.createElement('button');exportCard.type='button';
  exportCard.textContent='↓ Save private PNG card';
  exportCard.setAttribute('aria-label','Save local practice goals as a private PNG image');
  controls.append(periodLabel,refresh,exportSummary,exportCard);
  const board=document.createElement('div');board.className='practice-insights-board';
  const advice=document.createElement('p');advice.className='practice-insights-advice';
  const explore=document.createElement('button');explore.type='button';explore.textContent='Explore a drill ↗';
  const message=document.createElement('p');message.className='practice-insights-message';
  message.setAttribute('role','status');
  part.append(sum,lead,controls,board,advice,explore,message);
  content.insertBefore(part,tabs);
  const DAY=86400000;
  let snapshot=[];
  function savedRows(metric,now){
   const rows=getLocal(metric.store);
   if(!Array.isArray(rows)||rows.length>20)return[];
   return rows.filter(x=>x&&typeof x==='object'&&
    Number.isSafeInteger(x.at)&&x.at>0&&x.at<=now+DAY&&
    (metric.key==='sudden'?metric.valid({...x,completed:(x.winner==='human'||x.winner==='player1')}):metric.valid(x)));
  }
  function aggregate(rows){return{
   attempts:rows.length,met:rows.filter(x=>x.completed===true).length
  };}
  function renderInsights(){
   const now=Date.now(),days=period.value==='all'?null:Number(period.value);
   const cutoff=days===null?0:now-days*DAY;
   board.replaceChildren();snapshot=[];
   for(const metric of metrics){
    const rows=savedRows(metric,now).filter(x=>x.at>=cutoff);
    const counts=metric.key==='sudden'?{attempts:rows.length,met:rows.filter(x=>x.winner==='human'||x.winner==='player1').length}:aggregate(rows);
    const card=document.createElement('article');card.className='practice-insights-card';
    const title=document.createElement('strong');title.textContent=metric.name;
    const outcome=document.createElement('p');
    outcome.textContent=counts.attempts?
     counts.met+' of '+counts.attempts+' saved goals met':
     'No saved attempt in this period';
    const bar=document.createElement('progress');
    bar.max=counts.attempts||1;bar.value=counts.met;
    bar.setAttribute('aria-label',metric.name+' goals met out of saved attempts');
    const detail=document.createElement('small');
    if(days===null||days<7||!rows.length)detail.textContent='Personal objective only · actual native records';
    else{
     const recent=aggregate(rows.filter(x=>x.at>=now-7*DAY));
     const older=aggregate(rows.filter(x=>x.at<now-7*DAY&&x.at>=now-14*DAY));
     detail.textContent=recent.attempts&&older.attempts?
      'Latest 7d '+recent.met+'/'+recent.attempts+' · prior 7d '+older.met+'/'+older.attempts:
      'Two 7-day periods with saved attempts needed for comparison';
    }
    card.append(title,outcome,bar,detail);board.append(card);
    snapshot.push({key:metric.key,name:metric.name,attempts:counts.attempts,goalsMet:counts.met});
   }
   const ladders=getLocal('fuckball.ai-gauntlet-history.v1');
   const levels={standard:['easy','normal','hard'],elite:['normal','hard','elite']};
   const completed=Array.isArray(ladders)&&ladders.length<=12?ladders.filter(x=>x&&
    x.version===1&&Object.hasOwn(levels,x.route)&&[60,120].includes(x.duration)&&
    Number.isSafeInteger(x.startedAt)&&x.startedAt>0&&x.startedAt<=now+DAY&&
    Number.isSafeInteger(x.finishedAt)&&x.finishedAt>=x.startedAt&&
    x.finishedAt<=now+DAY&&x.finishedAt>=cutoff&&
    Number.isSafeInteger(x.retries)&&x.retries>=0&&x.retries<=999&&
    Array.isArray(x.wins)&&x.wins.length===3&&x.wins.every((w,i)=>w&&
     w.level===levels[x.route][i]&&w.duration===x.duration&&
     Number.isSafeInteger(w.for)&&Number.isSafeInteger(w.against)&&
     w.against>=0&&w.for>w.against&&w.for<=999&&
     Number.isSafeInteger(w.at)&&w.at>=x.startedAt&&w.at<=x.finishedAt)).length:0;
   const note=document.createElement('p');note.className='practice-insights-gauntlet';
   note.textContent=completed+' complete AI Gauntlet ladder(s) in the selected retained period (only full three-win completions saved).';
   board.append(note);
   snapshot.push({key:'ladder',name:'AI Gauntlet',completedLadders:completed});
   const target=snapshot.filter(x=>Number.isSafeInteger(x.attempts)).sort((a,b)=>a.attempts-b.attempts)[0];
   advice.textContent=target?
    'Explore '+target.name+': '+target.attempts+' recorded attempts in this lookback. This is a coverage suggestion, not a diagnosis of your skill.':
    'Play a native drill to build your own private history.';
   explore.onclick=()=>{
    if(!target)return;activate(target.key,true);
    document.getElementById('practice-lab-pane-'+target.key)?.scrollIntoView({block:'start',behavior:'auto'});
   };
   exportSummary.disabled=exportCard.disabled=!snapshot.some(x=>x.attempts>0||x.completedLadders>0);
   message.textContent='Showing only validated saved native drill records; no account data or server requests.';
  }

  refresh.onclick=renderInsights;
  period.onchange=renderInsights;
  part.addEventListener('toggle',()=>{if(part.open)renderInsights();});
  window.addEventListener('storage',event=>{
   if(event.key===null||metrics.some(x=>x.store===event.key)||
    event.key==='fuckball.ai-gauntlet-history.v1'){
    if(part.open)renderInsights();
   }
  });
  exportSummary.onclick=()=>{
   if(!snapshot.some(x=>x.attempts>0||x.completedLadders>0))return;
   const packet={format:'fuckball-local-native-practice-insights',version:1,
    window:period.value,exportedAt:new Date().toISOString(),
    source:'validated saved device-only native offline results',
    disclaimer:'Not ranked performance, Elo, official game stats or a complete lifetime record.',
    results:snapshot};
   const blob=new Blob([JSON.stringify(packet,null,2)],{type:'application/json'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download='fuckball-private-practice-insights.json';
   document.body.append(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),30000);
   message.textContent='Private native drill summary downloaded. No server upload.';
  };
  function saveProgressCard(){
   if(!snapshot.some(x=>x.attempts>0||x.completedLadders>0))return;
   if(!window.confirm('Save a private 1200×675 PNG with only your device-local drill goal counts? There are no names, accounts or rankings on this image.'))return;
   const entries=snapshot.map(x=>({...x})),windowLabel=
    period.value==='7'?'LAST 7 DAYS':period.value==='30'?'LAST 30 DAYS':'RETAINED RECORDS';
   const canvas=document.createElement('canvas');
   canvas.width=1200;canvas.height=675;
   const context=canvas.getContext('2d');
   if(!context){message.textContent='PNG drawing is unavailable in this browser.';return;}
   const c=context;
   function box(x,y,w,h,r,fill,stroke){
    c.beginPath();c.roundRect(x,y,w,h,r);
    c.fillStyle=fill;c.fill();
    if(stroke){c.lineWidth=2;c.strokeStyle=stroke;c.stroke();}
   }
   c.fillStyle='#10272e';c.fillRect(0,0,1200,675);
   box(34,29,1132,617,27,'#1a3438','#668e80');
   c.fillStyle='#dff5a9';c.font='900 41px system-ui, sans-serif';
   c.fillText('FUCKBALL / PRACTICE INSIGHTS',70,94);
   c.fillStyle='#cfe0d5';c.font='600 20px system-ui, sans-serif';
   c.fillText(windowLabel+' · AS OF '+new Date().toISOString().slice(0,10)+' · THIS DEVICE',71,133);
   const items=entries.filter(x=>x.key!=='ladder'&&x.key!=='comeback').slice(0,4);
   for(const [i,row] of items.entries()){
    const x=70+(i%2)*545,y=166+Math.floor(i/2)*169;
    box(x,y,510,149,17,'#284940','#658e7d');
    c.fillStyle='#e9f6c4';c.font='800 25px system-ui, sans-serif';
    c.fillText(row.name,x+23,y+38);
    c.fillStyle='#f5fff1';c.font='700 26px system-ui, sans-serif';
    c.fillText(row.attempts?row.goalsMet+' / '+row.attempts+' GOALS MET':'NO SAVED ATTEMPTS',x+23,y+78);
    c.fillStyle='#39584d';c.fillRect(x+23,y+99,465,14);
    if(row.attempts>0){
     c.fillStyle='#b7e29a';c.fillRect(x+23,y+99,Math.min(465,Math.round(465*row.goalsMet/row.attempts)),14);
    }
    c.fillStyle='#d1e0d1';c.font='500 15px system-ui, sans-serif';
    c.fillText('Native saved drill objectives · not competitive wins',x+23,y+136);
   }
   box(70,518,1055,61,14,'#2d5045');
   const gauntlet=entries.find(x=>x.key==='ladder')?.completedLadders||0;
   c.fillStyle='#e3f4b2';c.font='800 21px system-ui, sans-serif';
   c.font='800 19px system-ui, sans-serif';
   c.fillText('AI GAUNTLET · '+gauntlet+' completed three-win ladders',94,542);
   const comeback=entries.find(x=>x.key==='comeback');
   c.font='650 17px system-ui, sans-serif';
   c.fillText('COMEBACK ARENA · '+(comeback?.goalsMet||0)+' / '+(comeback?.attempts||0)+' virtual deficits overcome',94,570);
   c.fillStyle='#c7d9cf';c.font='500 16px system-ui, sans-serif';
   c.fillText('Saved local observations only. Not Elo, official match statistics, or full lifetime history.',73,612);
   const link=document.createElement('a');
   function download(blob){
    if(!blob){message.textContent='Could not encode the PNG image.';return;}
    const url=URL.createObjectURL(blob);
    link.href=url;link.download='fuckball-private-native-practice-'+period.value+'.png';
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    message.textContent='Private PNG summary saved. No network request or account details.';
   }
   canvas.toBlob(download,'image/png');
  }
  exportCard.onclick=saveProgressCard;

  renderInsights();
 }
 setupInsights();
 window.addEventListener('storage',renderProgress);
 root.addEventListener('focusin',renderProgress);
 renderProgress();
})();
