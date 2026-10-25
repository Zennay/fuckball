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
 let signature='',selected=2,ballotLink=null,ballotRound=null,ballotRoom=null;
 let pendingVote=null,pendingApply=null,feedback='',feedbackUntil=0;
 const connected=link=>link?.ws?.readyState===1;
 function showFeedback(message){feedback=message;feedbackUntil=Date.now()+4500;}
 function receiptStatus(d){
  if(!d)return '';
  const votes=d.state.matchFormatVotes;
  const mine=votes.find(row=>Array.isArray(row)&&row[0]===networkPlayerId&&
   Number.isSafeInteger(row[1])&&row[1]>=0&&row[1]<d.list.length);
  if(pendingVote){
   if(pendingVote.link!==d.link||pendingVote.round!==d.state.round)pendingVote=null;
   else if(d.state!==pendingVote.state&&
     (pendingVote.choice===null?!mine:mine?.[1]===pendingVote.choice)){
    showFeedback('The server confirmed your match format vote.');
    pendingVote=null;
   }else if(Date.now()-pendingVote.sentAt>3500){
    showFeedback('No server vote receipt. Check the room and retry manually.');
    pendingVote=null;
   }else return 'Vote submitted; awaiting the actual server ballot update…';
  }
  if(pendingApply){
   if(pendingApply.link!==d.link||pendingApply.round!==d.state.round)pendingApply=null;
   else if(d.state!==pendingApply.state&&
      d.state.timeLimit===pendingApply.minutes&&
      d.state.scoreLimit===pendingApply.goals&&
      d.state.matchFormatVotes.length===0){
    showFeedback('The server confirmed the winning match format.');
    pendingApply=null;
   }else if(Date.now()-pendingApply.sentAt>3500){
    showFeedback('The server did not confirm the format change. Review the latest room rules.');
    pendingApply=null;
   }else return 'Host request sent; awaiting authoritative server rules…';
  }
  return Date.now()<feedbackUntil?feedback:'';
 }
 function activeBallot(host=false){
  const d=source();
  if(!d||d.link!==ballotLink||d.link.room!==ballotRoom||
     d.state.round!==ballotRound){
   render();status.textContent='The room or voting round changed. Review the current options first.';
   return null;
  }
  if(!connected(d.link)){
   status.textContent='The room connection is not open. No vote was sent.';
   return null;
  }
  if(d.state.kickoff!=null||host&&!d.link.isOwner){
   status.textContent='This ballot is locked or only the real host can change the format.';
   return null;
  }
  return d;
 }
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
 function render(){
  const d=source();section.hidden=!d;
  if(!d){signature='';ballotLink=null;ballotRound=null;ballotRoom=null;
   pendingVote=null;pendingApply=null;return;}
  const {link,state,list}=d;
  // Every room uses the same options: refresh selection on native room/round
  // changes instead of carrying another player's previous choice forward.
  if(ballotLink!==link||ballotRoom!==link.room||ballotRound!==state.round){
   signature='';selected=2;pendingVote=null;pendingApply=null;
   feedback='';feedbackUntil=0;
   ballotLink=link;ballotRoom=link.room;ballotRound=state.round;
  }
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
  if(sign!==signature){
   signature=sign;selected=mine??2;choices.replaceChildren();
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
  const open=connected(link);
  cast.disabled=!open||!human||state.kickoff!=null||!!pendingVote;
  remove.disabled=!open||!human||mine===undefined||state.kickoff!=null||!!pendingVote;
  apply.hidden=!link.isOwner;
  const winner=state.matchFormatWinner;
  apply.disabled=!open||!link.isOwner||state.kickoff!=null||!!pendingApply||
   !Number.isSafeInteger(winner)||winner<0||winner>=list.length;
  const receipt=receiptStatus(d);
  status.textContent=receipt||(!open?'The original room connection is offline. Nothing can be sent.':
   state.kickoff?
   'Format voting is locked during the server kickoff countdown.':
   Number.isSafeInteger(winner)&&list[winner]?
    'Clear leader: '+list[winner].name+' · '+counts.reduce((a,b)=>a+b,0)+' actual votes.':
    'An outright winner needs at least two human votes.'+
     (mine!==undefined?' Your vote: '+list[mine].name+'.':''));
 }
 cast.onclick=()=>{
  const d=activeBallot();
  if(!d||pendingVote||!Number.isSafeInteger(selected)||
     selected<0||selected>=d.list.length)return;
  d.link.send({type:'matchFormatVote',choice:selected});
  pendingVote={link:d.link,round:d.state.round,state:d.state,
   choice:selected,sentAt:Date.now()};
  status.textContent='Submitting your match format choice to the real room server…';
 };
 remove.onclick=()=>{
  const d=activeBallot();
  if(!d||pendingVote)return;
  d.link.send({type:'matchFormatVote',choice:null});
  pendingVote={link:d.link,round:d.state.round,state:d.state,
   choice:null,sentAt:Date.now()};
  status.textContent='Removing your native match format vote…';
 };
 apply.onclick=()=>{
  const d=activeBallot(true),winner=d?.state.matchFormatWinner;
  if(!d||pendingApply||!Number.isSafeInteger(winner)||!d.list[winner])return;
  const selectedFormat=d.list[winner];
  if(!confirm('Apply '+selectedFormat.name+
   ' using the original host configuration? This refreshes the idle room and clears ready flags, without starting the game.'))return;
  // A blocking confirmation dialog can outlive the room or winning vote.
  const latest=activeBallot(true);
  if(!latest||latest.link!==d.link||latest.state.matchFormatWinner!==winner){
   status.textContent='The winning vote changed during confirmation. Review it again.';
   return;
  }
  latest.link.send({type:'matchFormatApply'});
  pendingApply={link:d.link,round:d.state.round,state:d.state,
   minutes:selectedFormat.minutes,goals:selectedFormat.goals,sentAt:Date.now()};
  status.textContent='Host format request sent; waiting for server confirmation.';
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
 let dockOwner=null,dockRound=null,dockOptions='';
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
  if(dockOwner!==link||dockRound!==state.round||dockOptions!==signature){
   dockOwner=link;dockRound=state.round;dockOptions=signature;
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
   (state.kickoff!=null?' · locked during server kickoff.':'');
  if(tally.textContent!==newText)tally.textContent=newText;
  dockSelect.disabled=!canVote||!!pendingVote;
  dockVote.disabled=!canVote||!!pendingVote;
  dockRemove.disabled=!canVote||!mine||!!pendingVote;
  dockApply.hidden=!host;
  dockApply.disabled=!host||!connected||!!pendingApply||state.kickoff!=null||
   !Number.isSafeInteger(winner)||!list[winner];
  const receipt=receiptStatus(d);
  if(receipt)tally.textContent=receipt;
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
  if(action==='cast'){
   if(!Number.isSafeInteger(dockChoice)||!d.list[dockChoice])return;
   selected=dockChoice;
   for(const input of choices.querySelectorAll('input')){
    input.checked=Number(input.value)===selected;
   }
   if(!cast.disabled)cast.click();
  }else if(action==='remove'&&!remove.disabled)remove.click();
  tally.textContent='Request sent to the room server · waiting for its vote update.';
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
  if(typeof menuOpen!=='undefined'&&menuOpen&&!pane.hidden)render();
  else section.hidden=true;
  renderDock();
 },1000);
 tick?.unref?.();
 for(const id of ['tabHome','tabPlay','tabGames']){
  document.querySelector('#'+id)?.addEventListener('click',()=>queueMicrotask(renderDock));
 }
 render();renderDock();
})();
