'use strict';
// Account-owned, server-originated results shown separately from device-local HBR2.
// No result is inferred from a client recording or labelled ranked.
(function(){
 const games=document.getElementById('gamesView');
 if(!games)return;
 const panel=document.createElement('section');
 panel.className='server-results';panel.setAttribute('aria-label','Signed-in server match results');
 const heading=document.createElement('div');heading.className='server-results-head';
 const title=document.createElement('div');
 const eyebrow=document.createElement('span');eyebrow.className='eyebrow';eyebrow.textContent='ACCOUNT MATCH HISTORY';
 const h=document.createElement('h2');h.textContent='ONLINE RESULTS.';
 const description=document.createElement('p');
 description.textContent='Completed rounds verified by this native game server. Private to your signed-in account; not ranked, and not replay recordings.';
 title.append(eyebrow,h,description);
 const refresh=document.createElement('button');refresh.type='button';refresh.textContent='↻ Refresh results';
 heading.append(title,refresh);
 const controls=document.createElement('div');controls.className='server-results-controls';
 const filterLabel=document.createElement('label');filterLabel.textContent='Show';
 const filter=document.createElement('select');filter.setAttribute('aria-label','Filter online results');
 for(const [value,label] of [['all','All results'],['win','Wins'],['draw','Draws'],['loss','Losses']])
  filter.add(new Option(label,value));
 filterLabel.append(filter);
 const periodLabel=document.createElement('label');periodLabel.textContent='When';
 const period=document.createElement('select');period.className='server-results-period';
 period.setAttribute('aria-label','Filter result date');
 for(const [value,label] of [['all','Any time'],['7','Past 7 days'],['30','Past 30 days'],['90','Past 90 days']])period.add(new Option(label,value));
 periodLabel.append(period);
 const modeLabel=document.createElement('label');modeLabel.textContent='Mode';
 const mode=document.createElement('select');mode.setAttribute('aria-label','Filter online match mode');
 for(const value of ['all','1v1','2v2','3v3','4v4','bot'])
  mode.add(new Option(value==='all'?'All modes':value==='bot'?'Vs AI':value,value));
 modeLabel.append(mode);
 const exportButton=document.createElement('button');exportButton.type='button';exportButton.textContent='↓ Export server results';
 const csvButton=document.createElement('button');csvButton.type='button';csvButton.textContent='↓ Export shown CSV';
 csvButton.title='Only current visible result rows, without usernames or receipt IDs';
 const erase=document.createElement('button');erase.type='button';erase.className='server-results-erase';
 erase.textContent='Erase my server history';erase.title='Also removes career totals on this server';
 controls.append(filterLabel,modeLabel,periodLabel,exportButton,csvButton,erase);
 const status=document.createElement('p');status.className='server-results-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const summary=document.createElement('p');summary.className='server-results-count';
 const form=document.createElement('div');form.className='server-results-form';
 form.setAttribute('aria-label','Verified unranked online match form for selected mode and period');
 const insights=document.createElement('section');insights.className='server-form-explorer';
 insights.setAttribute('aria-label','Recent server match form and playlists');insights.hidden=true;
 const insightsHeading=document.createElement('h3');insightsHeading.textContent='YOUR RECENT FORM.';
 const insightsText=document.createElement('p');insightsText.className='server-form-explorer-explain';
 insightsText.textContent='Only actual unranked results in your selected time window and playlist. This is not a lifetime record, Elo, or official ranked placement.';
 const insightsStats=document.createElement('div');insightsStats.className='server-form-explorer-stats';
 const trend=document.createElement('div');trend.className='server-form-explorer-trend';
 const trendLabel=document.createElement('strong');trendLabel.textContent='RECENT MATCHES · NEWEST FIRST';
 const trendPills=document.createElement('div');trendPills.className='server-form-explorer-pills';
 trend.append(trendLabel,trendPills);
 const playlists=document.createElement('div');playlists.className='server-form-explorer-playlists';
 insights.append(insightsHeading,insightsText,insightsStats,trend,playlists);
 const sessionHost=document.createElement('div');sessionHost.className='native-session-anchor';
 const list=document.createElement('div');list.className='server-results-grid';list.setAttribute('aria-label','My online match results');
 const divider=document.createElement('h2');divider.className='server-local-heading';divider.textContent='SAVED REPLAYS ON THIS DEVICE';
 const reviewVault=document.createElement('div');reviewVault.className='server-review-vault-anchor';
 const detail=document.createElement('p');detail.className='server-results-note';
 detail.textContent='Online result receipts do not include HBR2 playback. Your local recordings below stay on this device. Account totals may outlive the 50 most recent server receipts.';
 panel.append(heading,controls,status,summary,form,insights,sessionHost,list,reviewVault,detail);
 games.insertBefore(panel,document.getElementById('gamesStatus'));
 games.insertBefore(divider,document.getElementById('gamesStatus'));
 let generation=0,currentToken=null,currentUser=null,items=null,busy=false;
 let selectedSession=null,visibleRows=[];
 const valid=x=>x&&typeof x==='object'&&
  typeof x.id==='string'&&/^[0-9a-f]{24}$/.test(x.id)&&
  ['bot','1v1','2v2','3v3','4v4'].includes(x.mode)&&
  [0,1,2].includes(x.winner)&&[1,2].includes(x.team)&&
  Number.isSafeInteger(x.red)&&x.red>=0&&x.red<=999&&
  Number.isSafeInteger(x.blue)&&x.blue>=0&&x.blue<=999&&
  Number.isSafeInteger(x.at)&&x.at>0&&
  Number.isSafeInteger(x.playedFrames)&&x.playedFrames>0&&
  x.source==='native-server'&&x.ranked===false;
 const outcome=item=>item.winner===0?'draw':item.winner===item.team?'win':'loss';
 const elapsed=frames=>Math.floor(frames/3600)+'m '+String(Math.floor(frames%3600/60)).padStart(2,'0')+'s';
 function authenticated(){
  const token=settings.account?.token;
  const username=settings.account?.username;
  return typeof token==='string'&&token.length>0&&
   typeof username==='string'&&username.length>0?{token,username}:null;
 }
 function reset(message){
  selectedSession=null;visibleRows=[];sessionHost.replaceChildren();
  items=null;currentToken=null;currentUser=null;list.replaceChildren();
  summary.textContent='';form.replaceChildren();insights.hidden=true;insightsStats.replaceChildren();trendPills.replaceChildren();playlists.replaceChildren();status.textContent=message;
  exportButton.disabled=true;csvButton.disabled=true;erase.disabled=true;reviewVault.replaceChildren();
 }
 function renderInsights(scope){
  insights.hidden=!scope.length;
  insightsStats.replaceChildren();trendPills.replaceChildren();playlists.replaceChildren();
  if(!scope.length)return;
  // Receipts are explicitly limited to the server's recent 50; never claim
  // lifetime streaks or official matchmaking ratings.
  const ordered=scope.slice().sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id));
  const wins=ordered.filter(x=>outcome(x)==='win').length;
  const percent=Math.round(100*wins/ordered.length);
  const first=outcome(ordered[0]);
  let run=0;
  for(const item of ordered){if(outcome(item)!==first)break;run++;}
  const goals=ordered.reduce((sum,item)=>sum+(item.team===1?item.red-item.blue:item.blue-item.red),0);
  for(const [label,value] of [
   ['RECENT WIN PERCENTAGE',percent+'% of '+ordered.length+' receipts'],
   ['CURRENT RECENT RUN',run+' '+(first==='win'?'win':first==='loss'?'loss':'draw')+(run===1?'':'s')],
   ['GOAL DIFFERENCE',(goals>=0?'+':'')+goals]
  ]){
   const tile=document.createElement('div');tile.className='server-form-explorer-stat';
   const key=document.createElement('span');key.textContent=label;
   const number=document.createElement('strong');number.textContent=value;
   tile.append(key,number);insightsStats.append(tile);
  }
  for(const item of ordered.slice(0,10)){
   const result=outcome(item);
   const chip=document.createElement('button');chip.type='button';
   chip.className='server-form-explorer-chip result-'+result;
   chip.textContent=result==='win'?'W':result==='loss'?'L':'D';
   chip.title=new Date(item.at).toLocaleString()+' · '+item.mode+
    ' · '+(item.team===1?item.red:item.blue)+'-'+(item.team===1?item.blue:item.red);
   chip.setAttribute('aria-label',result+' on '+new Date(item.at).toLocaleDateString()+
    '. Show only '+result+' results.');
   chip.onclick=()=>{
    if(!items?.includes(item)||authenticated()?.token!==currentToken)return;
    filter.value=result;render();
    status.textContent='Showing '+result+' receipts in the selected period and playlist.';
   };
   trendPills.append(chip);
  }
  // Unlike global/ranked leaderboards, this view only compares the user's
  // own recent receipts; each row is a clickable filter.
  if(mode.value==='all'){
   const title=document.createElement('strong');title.textContent='YOUR RECENT RESULTS BY MODE';
   playlists.append(title);
   for(const playlist of ['1v1','2v2','3v3','4v4','bot']){
    const subset=scope.filter(x=>x.mode===playlist);
    if(!subset.length)continue;
    const button=document.createElement('button');button.type='button';
    button.className='server-form-explorer-playlist';
    const label=document.createElement('strong');label.textContent=playlist==='bot'?'Vs AI':playlist;
    const details=document.createElement('span');
    const count=type=>subset.filter(x=>outcome(x)===type).length;
    details.textContent=subset.length+' played · '+count('win')+' W / '+count('draw')+
     ' D / '+count('loss')+' L';
    button.append(label,details);
    button.onclick=()=>{
     if(!items||!currentToken||authenticated()?.token!==currentToken)return;
     mode.value=playlist;filter.value='all';render();
     status.textContent='Showing your own '+(playlist==='bot'?'Vs AI':playlist)+' unranked receipts.';
    };
    playlists.append(button);
   }
  }
 }
 function render(){
  list.replaceChildren();
  if(!items)return;
  // Never keep another account's private results visible after sign-out or a switch.
  const active=authenticated();
  if(active?.token!==currentToken||active?.username!==currentUser){
   generation++;reset('Account changed. Private online results have been hidden.');return;
  }
  const scope=items.filter(item=>
   (mode.value==='all'||item.mode===mode.value)&&
   (period.value==='all'||item.at>=Date.now()-Number(period.value)*86400000));
  const sessionSet=window.FuckballNativePlaySessions?.render(sessionHost,items,scope,selectedSession,session=>{
   if(!items||!currentToken||authenticated()?.token!==currentToken||
    authenticated()?.username!==currentUser)return;
   selectedSession=session;render();
   if(session)list.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth',block:'start'});
  },()=>!!items&&!!currentToken&&authenticated()?.token===currentToken&&authenticated()?.username===currentUser);
  const filtered=scope.filter(item=>(filter.value==='all'||outcome(item)===filter.value)&&
   (!sessionSet||sessionSet.has(item.id)));
  visibleRows=filtered;
  summary.textContent=filtered.length+' shown · '+scope.length+' in this period and mode · '+
   items.length+' recent server receipts · unranked';
  form.replaceChildren();
  renderInsights(scope);
  if(window.FuckballOnlineMatchReviews&&currentToken&&currentUser){
   window.FuckballOnlineMatchReviews.renderToolbar(reviewVault,currentUser,()=>
    !!items&&!!currentToken&&authenticated()?.token===currentToken&&
    authenticated()?.username===currentUser,items);
  }else reviewVault.replaceChildren();
  if(scope.length){
   const count=type=>scope.reduce((n,x)=>n+Number(outcome(x)===type),0);
   const gf=scope.reduce((n,x)=>n+(x.team===1?x.red:x.blue),0);
   const ga=scope.reduce((n,x)=>n+(x.team===1?x.blue:x.red),0);
   const minutes=Math.floor(scope.reduce((n,x)=>n+x.playedFrames,0)/3600);
   for(const [label,value] of [
    ['RECENT FORM',count('win')+' W · '+count('draw')+' D · '+count('loss')+' L'],
    ['GOALS FOR / AGAINST',gf+' / '+ga],
    ['RECORDED ACTIVE PLAY',minutes+' min']
   ]){
    const card=document.createElement('div');card.className='server-form-stat';
    const title=document.createElement('span');title.textContent=label;
    const number=document.createElement('strong');number.textContent=value;
    card.append(title,number);form.append(card);
   }
  }
  if(!filtered.length){
   const empty=document.createElement('p');empty.className='server-results-empty';
   empty.textContent=items.length?'No results match those filters.':'No eligible online results yet. Complete a native-server match while signed in.';
   list.append(empty);return;
  }
  for(const item of filtered){
   const card=document.createElement('article');card.className='server-result server-result-'+outcome(item);
   const top=document.createElement('div');top.className='server-result-top';
   const badge=document.createElement('strong');badge.textContent=outcome(item).toUpperCase();
   const score=document.createElement('span');score.className='server-result-score';
   score.textContent=(item.team===1?item.red:item.blue)+' : '+(item.team===1?item.blue:item.red);
   top.append(badge,score);
   const sub=document.createElement('p');
   sub.textContent=(item.mode==='bot'?'Vs AI':item.mode)+' · '+(item.team===1?'Red':'Blue')+
    ' · '+elapsed(item.playedFrames)+' active';
   const when=document.createElement('small');
   const time=new Date(item.at);
   when.textContent=Number.isFinite(time.getTime())?time.toLocaleString():'Date unavailable';
   const actions=document.createElement('div');actions.className='server-result-actions';
   const share=document.createElement('button');share.type='button';share.textContent='↗ Share score card';
   share.title='Share an unranked result as a private, locally generated PNG with no usernames';
   share.addEventListener('click',async()=>{
    if(!items?.includes(item)||!currentToken||authenticated()?.token!==currentToken){
     status.textContent='Sign in again before sharing a server result.';return;
    }
    share.disabled=true;
    try{
     if(!window.FuckballMatchCards)throw Error('Score card renderer is unavailable.');
     status.textContent=await window.FuckballMatchCards.download(item);
    }catch(error){status.textContent=error?.message||'Could not share this result.';}
    finally{share.disabled=false;}
   });
   actions.append(share);card.append(top,sub,when,actions);
   window.FuckballOnlineMatchReviews?.renderInto(card,item,currentUser,()=>
    !!items?.includes(item)&&!!currentToken&&authenticated()?.token===currentToken&&
    authenticated()?.username===currentUser);
   list.append(card);
  }
 }
 async function load(){
  const seq=++generation,account=authenticated();
  if(!account){reset('Sign in through the online account menu to see your private server results.');return;}
  currentToken=null;items=null;list.replaceChildren();summary.textContent='';form.replaceChildren();insights.hidden=true;
  status.textContent='Loading online results for '+account.username+'…';
  refresh.disabled=true;exportButton.disabled=true;csvButton.disabled=true;erase.disabled=true;
  try{
   const response=await fetch('/api/match-history',{
    headers:{Authorization:'Bearer '+account.token},cache:'no-store'
   });
   const data=await response.json().catch(()=>({}));
   if(seq!==generation||authenticated()?.token!==account.token||authenticated()?.username!==account.username)return;
   if(response.status===401)throw Error('Session expired. Sign in again.');
   if(!response.ok)throw Error(data.error||'Online match history unavailable.');
   if(data.source!=='native-server'||data.ranked!==false||
      data.durable!==true||!Array.isArray(data.items)||data.items.length>50||
      !data.items.every(valid))throw Error('Server results could not be verified.');
   currentToken=account.token;currentUser=account.username;
   items=data.items.slice().sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id));
   selectedSession=null;
   status.textContent='Private results for '+currentUser+'. Stored on this server only; never a ranked rating.';
   exportButton.disabled=false;csvButton.disabled=false;erase.disabled=false;render();
  }catch(e){if(seq===generation)reset(e.message||'Online results unavailable.');}
  finally{if(seq===generation)refresh.disabled=false;}
 }
 refresh.onclick=()=>load();
 filter.onchange=()=>render();mode.onchange=()=>render();period.onchange=()=>render();
 csvButton.onclick=()=>{
  if(!items||!currentToken||authenticated()?.token!==currentToken)return;
  // Export only the selected rows, not raw account data or match receipt IDs.
  const shown=visibleRows.filter(item=>items.includes(item));
  if(!shown.length){status.textContent='No visible online results to export.';return;}
  const rows=[['UTC date','Mode','Outcome','Side','Goals for','Goals against','Active seconds','Ranked'],
   ...shown.map(item=>{
    const date=new Date(item.at);
    return [Number.isFinite(date.getTime())?date.toISOString():'',item.mode,outcome(item),
     item.team===1?'Red':'Blue',item.team===1?item.red:item.blue,
     item.team===1?item.blue:item.red,Math.floor(item.playedFrames/60),'No'];
   })];
  const encode=value=>'"'+String(value).replace(/"/g,'""')+'"';
  const newline=String.fromCharCode(13,10);
  const content=String.fromCharCode(0xFEFF)+rows.map(row=>row.map(encode).join(',')).join(newline)+newline;
  const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;
  anchor.download='fuckball-unranked-online-form-'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  status.textContent=shown.length+' filtered, unranked server result(s) exported locally without account names or receipt IDs.';
 };
 exportButton.onclick=()=>{
  if(!items||!currentToken||authenticated()?.token!==currentToken)return;
  const data={source:'fuckball-native-server',ranked:false,account:currentUser,
   exportedAt:new Date().toISOString(),notice:'Results recorded on this server, not ranked or replay files.',
   items};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const anchor=document.createElement('a');anchor.href=url;
  anchor.download='fuckball-online-results-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 erase.onclick=async()=>{
  if(busy||!items||!currentToken)return;
  const token=currentToken,user=currentUser,sourceItems=items,seq=generation;
  const ownSession=()=>{
   const now=authenticated();
   if(now?.token!==token||now?.username!==user||
    generation!==seq||items!==sourceItems)return false;
   // Confirmations can keep this tab blocked while a different browser tab
   // changes the persisted sign-in. Fail closed before irreversible deletion.
   try{
    const saved=JSON.parse(localStorage.getItem('fuckball.settings')||'null')?.account;
    return saved?.token===token&&saved?.username===user;
   }catch{return false;}
  };
  if(!ownSession()){
   status.textContent='Account changed. Reload your own results before deleting anything.';return;
  }
  if(!confirm('Erase your match history AND career totals stored on this server? This cannot be undone. Local replays are kept.'))return;
  if(!confirm('Confirm permanent erasure of all your server-recorded match receipts and career statistics.'))return;
  if(!ownSession()){
   status.textContent='Account changed during confirmation. Nothing was deleted.';return;
  }
  // Disable repeated destructive clicks until the one native-server DELETE
  // resolves. The server retains final authority over account ownership.
  busy=true;erase.disabled=true;refresh.disabled=true;
  exportButton.disabled=true;csvButton.disabled=true;
  status.textContent='Deleting this account’s server history…';
  try{
   const response=await fetch('/api/match-history',{
    method:'DELETE',headers:{Authorization:'Bearer '+token},cache:'no-store'
   });
   const payload=await response.json().catch(()=>({}));
   if(!ownSession()){
    reset('Account changed during deletion. Refresh the current account to see its state.');return;
   }
   if(!response.ok||payload.ok!==true)throw Error(payload.error||'Could not erase server history.');
   await load();
   if(authenticated()?.token===token&&authenticated()?.username===user)
    status.textContent='Your server history and career totals were erased. Local replays are unaffected.';
  }catch(e){
   if(ownSession())status.textContent=e.message||'Could not erase server history.';
  }finally{
   busy=false;
   if(authenticated()?.token===currentToken&&authenticated()?.username===currentUser&&items){
    erase.disabled=false;exportButton.disabled=false;csvButton.disabled=false;
   }
   refresh.disabled=false;
  }
 };
 // Hook into the existing view router, after app.js/views.js/profile integration.
 const previousShowView=showView;
 showView=function(next){
  previousShowView(next);
  if(next==='games')load();
  else{generation++;currentToken=null;currentUser=null;items=null;selectedSession=null;
   visibleRows=[];sessionHost.replaceChildren();list.replaceChildren();reviewVault.replaceChildren();form.replaceChildren();insights.hidden=true;insightsStats.replaceChildren();trendPills.replaceChildren();playlists.replaceChildren();exportButton.disabled=true;csvButton.disabled=true;erase.disabled=true;}
 };
 // The native account UI is updated on login, logout and server-forced
 // invalidation. Clear sensitive match cards synchronously on the next DOM
 // microtask, without touching authentication/server-client or polling gameplay.
 function syncAccount(){
  const account=authenticated();
  if(account?.token===currentToken&&account?.username===currentUser)return;
  generation++;reset(account?'Account changed. Fetching only your own server results…':
   'Signed out. Private server results and coaching notes were hidden.');
  if(account&&!games.hidden)load();
 }
 const accountLabel=document.getElementById('joinAccount');
 if(accountLabel)new MutationObserver(syncAccount).observe(accountLabel,
  {childList:true,subtree:true,characterData:true});
 window.addEventListener('storage',event=>{
  if(event.key!==null&&event.key!=='fuckball.settings')return;
  // A second tab may have logged out or switched accounts. Do not reuse
  // stale in-memory credentials or display old account-owned cards.
  try{
   const prefs=JSON.parse(localStorage.getItem('fuckball.settings')||'null');
   const persisted=prefs?.account;
   const current=authenticated();
   if(persisted?.token!==current?.token||persisted?.username!==current?.username){
    generation++;reset('Account changed in another tab. Reload to see private online results.');
   }
  }catch{
   generation++;reset('Account storage changed. Reload before viewing private online results.');
  }
 });
 window.addEventListener('fuckball:online-review-imported',()=>{
  if(items&&currentToken&&!games.hidden&&authenticated()?.token===currentToken){
   render();status.textContent='Your own private notes were restored on this device; genuine server receipts are unchanged.';
  }
 });
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&!games.hidden&&authenticated()?.token!==currentToken)load();
 });
})();
