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
 const erase=document.createElement('button');erase.type='button';erase.className='server-results-erase';
 erase.textContent='Erase my server history';erase.title='Also removes career totals on this server';
 controls.append(filterLabel,modeLabel,periodLabel,exportButton,erase);
 const status=document.createElement('p');status.className='server-results-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const summary=document.createElement('p');summary.className='server-results-count';
 const list=document.createElement('div');list.className='server-results-grid';list.setAttribute('aria-label','My online match results');
 const divider=document.createElement('h2');divider.className='server-local-heading';divider.textContent='SAVED REPLAYS ON THIS DEVICE';
 const detail=document.createElement('p');detail.className='server-results-note';
 detail.textContent='Online result receipts do not include HBR2 playback. Your local recordings below stay on this device. Account totals may outlive the 50 most recent server receipts.';
 panel.append(heading,controls,status,summary,list,detail);
 games.insertBefore(panel,document.getElementById('gamesStatus'));
 games.insertBefore(divider,document.getElementById('gamesStatus'));
 let generation=0,currentToken=null,currentUser=null,items=null,busy=false;
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
  items=null;currentToken=null;currentUser=null;list.replaceChildren();
  summary.textContent='';status.textContent=message;
  exportButton.disabled=true;erase.disabled=true;
 }
 function render(){
  list.replaceChildren();
  if(!items)return;
  const filtered=items.filter(item=>
   (filter.value==='all'||outcome(item)===filter.value)&&
   (mode.value==='all'||item.mode===mode.value)&&
   (period.value==='all'||item.at>=Date.now()-Number(period.value)*86400000));
  summary.textContent=filtered.length+' shown · '+items.length+' recent server results · unranked';
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
   actions.append(share);card.append(top,sub,when,actions);list.append(card);
  }
 }
 async function load(){
  const seq=++generation,account=authenticated();
  if(!account){reset('Sign in through the online account menu to see your private server results.');return;}
  currentToken=null;items=null;list.replaceChildren();summary.textContent='';
  status.textContent='Loading online results for '+account.username+'…';
  refresh.disabled=true;exportButton.disabled=true;erase.disabled=true;
  try{
   const response=await fetch('/api/match-history',{
    headers:{Authorization:'Bearer '+account.token},cache:'no-store'
   });
   const data=await response.json().catch(()=>({}));
   if(seq!==generation||authenticated()?.token!==account.token)return;
   if(response.status===401)throw Error('Session expired. Sign in again.');
   if(!response.ok)throw Error(data.error||'Online match history unavailable.');
   if(data.source!=='native-server'||data.ranked!==false||
      data.durable!==true||!Array.isArray(data.items)||data.items.length>50||
      !data.items.every(valid))throw Error('Server results could not be verified.');
   currentToken=account.token;currentUser=account.username;
   items=data.items.slice().sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id));
   status.textContent='Private results for '+currentUser+'. Stored on this server only; never a ranked rating.';
   exportButton.disabled=false;erase.disabled=false;render();
  }catch(e){if(seq===generation)reset(e.message||'Online results unavailable.');}
  finally{if(seq===generation)refresh.disabled=false;}
 }
 refresh.onclick=()=>load();
 filter.onchange=()=>render();mode.onchange=()=>render();period.onchange=()=>render();
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
  if(busy||!items||!currentToken||authenticated()?.token!==currentToken)return;
  if(!confirm('Erase your match history AND career totals stored on this server? This cannot be undone. Local replays are kept.'))return;
  if(!confirm('Confirm permanent erasure of all your server-recorded match receipts and career statistics.'))return;
  const token=currentToken;busy=true;erase.disabled=true;
  try{
   const response=await fetch('/api/match-history',{
    method:'DELETE',headers:{Authorization:'Bearer '+token},cache:'no-store'
   });
   const payload=await response.json().catch(()=>({}));
   if(authenticated()?.token!==token){reset('Account changed. Refresh results.');return;}
   if(!response.ok||payload.ok!==true)throw Error(payload.error||'Could not erase server history.');
   await load();status.textContent='Your server history and career totals were erased. Local replays are unaffected.';
  }catch(e){status.textContent=e.message||'Could not erase server history.';erase.disabled=false;}
  finally{busy=false;}
 };
 // Hook into the existing view router, after app.js/views.js/profile integration.
 const previousShowView=showView;
 showView=function(next){
  previousShowView(next);
  if(next==='games')load();
  else{generation++;currentToken=null;items=null;exportButton.disabled=true;erase.disabled=true;}
 };
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&!games.hidden&&authenticated()?.token!==currentToken)load();
 });
})();
