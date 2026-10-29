'use strict';
// Unranked native Custom Room format voting. The server owns the only vote
// state; only the original host-approved configure path can change the game.
(function(){
 const pane=document.getElementById('menuMatchPane');if(!pane)return;
 const make=(tag,text,cls)=>{const e=document.createElement(tag);
  if(text!==undefined&&text!==null)e.textContent=String(text);
  if(cls)e.className=cls;return e;};
 const section=make('section',null,'native-match-format');
 section.setAttribute('aria-label','Native match format vote');
 section.hidden=true;
 section.append(make('h3','MATCH FORMAT VOTE.'));
 section.append(make('p','Choose how long to play and the native score limit. Every connected human has one server-recorded vote. Only the host can apply a clear winner before kickoff.'));
 const currentRules=make('p',null,'native-match-format-current');
 section.append(currentRules);
 const choices=make('div',null,'native-match-format-choices');
 const actions=make('div',null,'native-match-format-actions');
 const cast=make('button','VOTE FOR THIS FORMAT');cast.className='primary';
 const remove=make('button','Remove my vote');
 const apply=make('button','HOST · APPLY WINNING FORMAT');
 for(const btn of [cast,remove,apply]){btn.type='button';actions.append(btn);}
 const status=make('p',null,'native-match-format-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 section.append(choices,actions,status,
  make('small','No votes start, pause or rank a game. Applying a format invokes the existing native host configuration, leaving the room waiting for kickoff.'));
 const after=pane.querySelector('.native-stadium-ballot')||pane.querySelector('.native-lobby-ready');
 if(after)after.insertAdjacentElement('afterend',section);else pane.append(section);
 let signature='',selected=2;
 let ballotLink=null,ballotRoom='',ballotRound=null,ballotPlayer=null;
 let pendingVote=null,pendingApply=null;
 function source(){
  const link=typeof serverLink!=='undefined'?serverLink:null,state=link?.roomState;
  if(!link?.room||link.quickMatchMode||!state||state.started||state.lastResult||
   !Array.isArray(state.matchFormatOptions)||state.matchFormatOptions.length!==4||
   !Array.isArray(state.matchFormatVotes)||state.matchFormatVotes.length>128)return null;
  const list=state.matchFormatOptions;
  if(list.some((o,i)=>!o||o.id!==i||typeof o.name!=='string'||o.name.length<1||
   o.name.length>70||!Number.isSafeInteger(o.minutes)||!Number.isSafeInteger(o.goals)||
   o.minutes<1||o.minutes>99||o.goals<1||o.goals>99))return null;
  return{link,state,list};
 }
 // The same four options do not imply the same player, room or round.
 // Invalidate local intent when the actual admitted session changes.
 function syncSession(d,mine,sign){
  const changed=ballotLink!==d.link||ballotRoom!==d.link.room||
   ballotRound!==d.state.round||ballotPlayer!==networkPlayerId||signature!==sign;
  if(changed){
   ballotLink=d.link;ballotRoom=d.link.room;ballotRound=d.state.round;
   ballotPlayer=networkPlayerId;signature=sign;selected=mine??2;
   pendingVote=null;pendingApply=null;status.textContent='';
  }
  return changed;
 }
 function refreshPending(d,mine){
  if(pendingVote){
   if(pendingVote.choice===mine){
    status.textContent='Native server confirmed your '+(mine===undefined?'vote removal.':'format vote.');
    pendingVote=null;
   }else if(Date.now()-pendingVote.sentAt>3500){
    status.textContent='No server vote update received. Check your connection and retry manually.';
    pendingVote=null;
   }else status.textContent='Vote sent · waiting for server-confirmed ballot update.';
  }else if(pendingApply){
   const confirmed=d.state.matchFormatVotes.length===0&&
    d.state.matchFormatWinner==null&&
    d.state.timeLimit===pendingApply.minutes&&
    d.state.scoreLimit===pendingApply.goals;
   if(confirmed){
    status.textContent='Native server confirmed the new match format.';
    pendingApply=null;
   }else if(Date.now()-pendingApply.sentAt>3500){
    status.textContent='No host action receipt received. Review room settings and retry manually.';
    pendingApply=null;
   }else status.textContent='Host request sent · waiting for server-confirmed rules.';
  }
 }
 function render(){
  const d=source();section.hidden=!d;
  if(!d){signature='';ballotLink=null;pendingVote=null;pendingApply=null;return;}
  const {link,state,list}=d;
  const limits=Number.isSafeInteger(state.scoreLimit)&&state.scoreLimit>=0&&
   Number.isSafeInteger(state.timeLimit)&&state.timeLimit>=0;
  currentRules.textContent=limits?
   'CURRENT NATIVE RULES · '+state.timeLimit+' minutes · '+state.scoreLimit+' goals':
   'Current server match rules are not available from this room version.';
  const counts=list.map(()=>0),votes=new Map(state.matchFormatVotes.filter(row=>
   Array.isArray(row)&&row.length===2&&Number.isSafeInteger(row[0])&&
   Number.isSafeInteger(row[1])&&row[1]>=0&&row[1]<list.length));
  for(const choice of votes.values())counts[choice]++;
  const mine=votes.get(networkPlayerId),sign=JSON.stringify(list);
  if(syncSession(d,mine,sign)){
   choices.replaceChildren();
   for(const option of list){
    const label=make('label',null,'native-match-format-choice'),radio=make('input');
    radio.type='radio';radio.name='native-match-format-choice';radio.value=String(option.id);
    radio.checked=option.id===selected;
    radio.addEventListener('change',()=>selected=option.id);
    label.append(radio,make('span',option.name),make('strong','0','native-match-format-count'));
    choices.append(label);
   }
  }
  [...choices.children].forEach((row,i)=>{
   row.querySelector('strong').textContent=counts[i]+' vote'+(counts[i]===1?'':'s');
   row.classList.toggle('native-match-format-winning',state.matchFormatWinner===i);
  });
  const human=room?.state?.players?.some?.(p=>p.id===networkPlayerId&&!botIds.has(p.id))===true;
  const canSend=human&&link.ws?.readyState===1&&state.kickoff==null;
  refreshPending(d,mine);
  cast.disabled=!canSend||!!pendingVote;
  remove.disabled=!canSend||mine===undefined||!!pendingVote;
  apply.hidden=!link.isOwner;
  const winner=state.matchFormatWinner;
  apply.disabled=!link.isOwner||!canSend||!!pendingApply||
   !Number.isSafeInteger(winner)||winner<0||winner>=list.length;
  if(!pendingVote&&!pendingApply&&!status.textContent.startsWith('Native server confirmed')&&
     !status.textContent.startsWith('No server vote')&&!status.textContent.startsWith('No host action'))
   status.textContent=state.kickoff!=null?
    'Format voting is locked during the server kickoff countdown.':
    !human?'Only an admitted human can vote.':
    link.ws?.readyState!==1?'The room connection is closed. No vote can be sent.':
    Number.isSafeInteger(winner)&&list[winner]?
     'Clear leader: '+list[winner].name+' · '+counts.reduce((a,b)=>a+b,0)+' actual votes.':
     'An outright winner needs at least two human votes.'+
      (mine!==undefined?' Your vote: '+list[mine].name+'.':'');
 }
 function admittedVoteAction(host=false){
  const d=source();
  if(!d)return null;
  if(ballotLink!==d.link||ballotRound!==d.state.round||
     ballotRoom!==d.link.room||ballotPlayer!==networkPlayerId){
   render();
   status.textContent='Room or player changed. Review the new ballot before acting.';
   return null;
  }
  const human=room?.state?.players?.some?.(p=>
   p.id===networkPlayerId&&!botIds.has(p.id))===true;
  if(!human||host&&!d.link.isOwner||d.link.ws?.readyState!==1||
     d.state.kickoff!=null){
   status.textContent='Only a connected, admitted human'+(host?' room host':'')+
    ' may act before kickoff. No request was sent.';
   return null;
  }
  return d;
 }
 cast.onclick=()=>{
  const d=admittedVoteAction();
  if(!d||pendingVote||!Number.isSafeInteger(selected)||selected<0||
     selected>=d.list.length)return;
  const mine=d.state.matchFormatVotes.find(v=>
   Array.isArray(v)&&v[0]===networkPlayerId)?.[1];
  if(mine===selected){
   status.textContent='The server already recorded your vote for this format.';
   return;
  }
  d.link.send({type:'matchFormatVote',choice:selected});
  pendingVote={choice:selected,sentAt:Date.now()};
  render();
 };
 remove.onclick=()=>{
  const d=admittedVoteAction();
  if(!d||pendingVote)return;
  const mine=d.state.matchFormatVotes.some(v=>Array.isArray(v)&&
   v[0]===networkPlayerId);
  if(!mine)return;
  d.link.send({type:'matchFormatVote',choice:null});
  pendingVote={choice:undefined,sentAt:Date.now()};
  render();
 };
 apply.onclick=()=>{
  const d=admittedVoteAction(true),winner=d?.state.matchFormatWinner;
  if(!d||pendingApply||!Number.isSafeInteger(winner)||!d.list[winner])return;
  const chosen=d.list[winner];
  if(!confirm('Apply '+chosen.name+
   ' using the original host configuration? This refreshes the idle room and clears ready flags, without starting the game.'))return;
  // A socket/room can be replaced while native confirmation is displayed.
  const now=admittedVoteAction(true);
  if(!now||now.link!==d.link||now.state.round!==d.state.round||
     now.state.matchFormatWinner!==winner)return;
  now.link.send({type:'matchFormatApply'});
  pendingApply={minutes:chosen.minutes,goals:chosen.goals,sentAt:Date.now()};
  render();
 };
 // A format ballot is a server-owned Custom Room choice. Players who are
 // browsing Home or My Games must not need to hunt for a hidden match menu.
 // This compact ballot is a view/controller over the existing native buttons;
 // it never infers votes from clicks or changes the host's authority.
 const dock=make('aside',null,'native-format-dock');
 dock.hidden=true;dock.setAttribute('role','region');
 dock.setAttribute('aria-label','Live Custom Room match format ballot');
 const summary=make('div',null,'native-format-dock-summary');
 const headline=make('strong','CUSTOM ROOM · CHOOSE A MATCH FORMAT');
 const tally=make('p',null,'native-format-dock-tally');
 tally.setAttribute('role','status');tally.setAttribute('aria-live','polite');
 summary.append(headline,tally);
 const dockControls=make('div',null,'native-format-dock-controls');
 const dockSelect=make('select');
 dockSelect.setAttribute('aria-label','Your match format vote');
 const dockVote=make('button','✓ Vote');dockVote.type='button';dockVote.className='primary';
 const dockRemove=make('button','Remove vote');dockRemove.type='button';
 const dockApply=make('button','Host · apply winner');dockApply.type='button';
 const dockView=make('button','View room');dockView.type='button';
 dockControls.append(dockSelect,dockVote,dockRemove,dockApply,dockView);
 dock.append(summary,dockControls);
 document.body.append(dock);
 let dockOwner=null,dockRoom='',dockRound=null,dockPlayer=null,dockOptions='';
 let dockChoice=2;
 function ballotParticipant(){
  return room?.state?.players?.some?.(p=>
   p.id===networkPlayerId&&!botIds.has(p.id))===true;
 }
 function renderDock(){
  const d=source();
  const outsideMatch=document.querySelector('#homeView:not([hidden])')||
   document.querySelector('#gamesView:not([hidden])');
  const live=!!d&&!!outsideMatch;
  dock.hidden=!live;
  if(!live)return;
  const {link,state,list}=d;
  const signature=JSON.stringify(list);
  if(dockOwner!==link||dockRoom!==link.room||dockRound!==state.round||
     dockPlayer!==networkPlayerId||dockOptions!==signature){
   dockOwner=link;dockRoom=link.room;dockRound=state.round;
   dockPlayer=networkPlayerId;dockOptions=signature;
   const mine=state.matchFormatVotes.find(row=>
    Array.isArray(row)&&row[0]===networkPlayerId&&
    Number.isSafeInteger(row[1])&&row[1]>=0&&row[1]<list.length);
   dockChoice=mine?mine[1]:2;
   dockSelect.replaceChildren();
   for(const option of list){
    const item=new Option(option.name,String(option.id));
    dockSelect.add(item);
   }
  }
  dockSelect.value=String(dockChoice);
  const validVotes=state.matchFormatVotes.filter(row=>Array.isArray(row)&&
   row.length===2&&Number.isSafeInteger(row[0])&&
   Number.isSafeInteger(row[1])&&row[1]>=0&&row[1]<list.length);
  const mine=validVotes.find(row=>row[0]===networkPlayerId);
  const winner=state.matchFormatWinner;
  const host=link.isOwner===true;
  const connected=link.ws?.readyState===1;
  const canVote=ballotParticipant()&&connected&&state.kickoff==null;
  const rules=Number.isSafeInteger(state.timeLimit)&&
   Number.isSafeInteger(state.scoreLimit)?
   state.timeLimit+' min / '+state.scoreLimit+' goals':'rules pending';
  const leader=Number.isSafeInteger(winner)&&list[winner]?
   ' · winner: '+list[winner].name:' · no clear winner yet';
  const newText='Current: '+rules+' · '+validVotes.length+
   ' human votes'+leader+(mine?' · your vote: '+list[mine[1]].name:
   ' · no confirmed vote from you')+
   (state.kickoff!=null?' · locked during server kickoff.':
    link.ws?.readyState!==1?' · disconnected; no votes can be sent.':
    pendingVote?' · waiting for a real vote update.':
    pendingApply?' · awaiting server host-format receipt.':'');
  if(tally.textContent!==newText)tally.textContent=newText;
  dockSelect.disabled=!canVote||!!pendingVote;
  dockVote.disabled=!canVote||!!pendingVote;
  dockRemove.disabled=!canVote||!mine||!!pendingVote;
  dockApply.hidden=!host;
  dockApply.disabled=!host||!canVote||!!pendingApply||
   !Number.isSafeInteger(winner)||!list[winner];
 }
 dockSelect.addEventListener('change',()=>{
  dockChoice=Number(dockSelect.value);renderDock();
 });
 function delegateBallot(action){
  const d=source();
  if(!d||!ballotParticipant()||d.link.ws?.readyState!==1||
     d.state.kickoff!=null)return;
  // Synchronize the hidden native input state, then delegate to the
  // identical original handler that submits the current player vote.
  render();
  let submitted=false;
  if(action==='cast'){
   if(!Number.isSafeInteger(dockChoice)||!d.list[dockChoice])return;
   selected=dockChoice;
   for(const input of choices.querySelectorAll('input')){
    input.checked=Number(input.value)===selected;
   }
   if(!cast.disabled){cast.click();submitted=!!pendingVote;}
  }else if(action==='remove'&&!remove.disabled){
   remove.click();submitted=!!pendingVote;
  }
  if(submitted)tally.textContent='Vote sent · waiting for the server ballot update.';
 }
 dockVote.addEventListener('click',()=>delegateBallot('cast'));
 dockRemove.addEventListener('click',()=>delegateBallot('remove'));
 dockApply.addEventListener('click',()=>{
  const d=source(),winner=d?.state.matchFormatWinner;
  if(!d||!d.link.isOwner||d.link.ws?.readyState!==1||
     d.state.kickoff!=null||!Number.isSafeInteger(winner)||!d.list[winner])return;
  render();
  if(!apply.disabled)apply.click(); // Includes original host confirmation.
 });
 dockView.addEventListener('click',()=>{
  if(!source())return;
  document.querySelector('#tabPlay')?.click();
  if(typeof openMatchMenu==='function')openMatchMenu('menuMatchPane','menuMatch');
  render();section.scrollIntoView?.({block:'nearest',behavior:'auto'});
  (cast.disabled?section:cast).focus?.({preventScroll:true});
 });
 const tick=setInterval(()=>{
  // Continue checking server receipts and session replacement while the
  // native menu is hidden; the global dock shows the same authoritative state.
  render();
  if(typeof menuOpen==='undefined'||!menuOpen||pane.hidden)section.hidden=true;
  renderDock();
 },1000);
 tick?.unref?.();
 for(const id of ['tabHome','tabPlay','tabGames']){
  document.querySelector('#'+id)?.addEventListener('click',()=>queueMicrotask(renderDock));
 }
 render();renderDock();
})();
