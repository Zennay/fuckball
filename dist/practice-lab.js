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
  {key:'ladder',title:'AI Gauntlet',selector:'.ai-gauntlet-setup',intro:'Win three genuine timed local 1v1 AI rounds to climb the ladder.'}
 ];
 if(!home)return;
 const existing=modules.map(m=>({...m,element:home.querySelector(m.selector)})).filter(m=>m.element);
 if(!existing.length)return;
 const KEY='fuckball.practice-lab.display.v1';
 let saved={};try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');if(s&&typeof s==='object'&&!Array.isArray(s))saved=s;}catch{}
 const root=document.createElement('section');root.className='practice-lab';
 root.setAttribute('aria-label','Optional local AI practice lab');
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
 explanation.textContent='Train against native local AI only. No bots enter human Quick Match, no leaderboard, and no game rules change.';
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
  const valid=list=>Array.isArray(list)?list.filter(x=>x&&Number.isSafeInteger(x.at)&&x.at>0&&x.at<=Date.now()+86400000).length:0;
  const parts=[];
  if(completed)parts.push('First Touch complete');
  const attempts=valid(goals)+valid(teamwork)+valid(defending)+valid(rockets);
  const ladderWins=Array.isArray(ladders)?ladders.filter(x=>x?.version===1&&Array.isArray(x.wins)&&x.wins.length===3&&Number.isSafeInteger(x.finishedAt)&&x.finishedAt>0&&x.finishedAt<=Date.now()+86400000).length:0;
  if(attempts)parts.push(attempts+' local drill attempt'+(attempts===1?'':'s'));
  if(ladderWins)parts.push(ladderWins+' completed local AI ladder'+(ladderWins===1?'':'s'));
  progress.textContent=parts.length?parts.join(' · '):'No practice history yet';
 }
 window.addEventListener('storage',renderProgress);
 root.addEventListener('focusin',renderProgress);
 renderProgress();
})();
