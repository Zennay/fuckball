'use strict';
// Collaborative pre-match stadium ballot, backed entirely by the native room.
// No local simulation of votes, stadium changes, identities or scores.
(function(){
 const pane=document.getElementById('menuMatchPane');
 if(!pane)return;
 const make=(tag,label,klass)=>{
  const e=document.createElement(tag);
  if(label!==undefined&&label!==null)e.textContent=String(label);
  if(klass)e.className=klass;
  return e;
 };
 const section=make('section',null,'native-stadium-ballot');
 section.setAttribute('aria-label','Custom Room stadium ballot');
 section.hidden=true;
 section.append(make('h3','STADIUM BALLOT.'));
 const intro=make('p','Vote together on a genuine native pitch. Every connected human may cast or change one vote. A clear winner with at least two votes can be applied only by the real room host. No vote automatically changes a match.');
 section.append(intro);
 const current=make('p',null,'native-stadium-ballot-current');
 const options=make('div',null,'native-stadium-ballot-options');
 const actions=make('div',null,'native-stadium-ballot-actions');
 const cast=make('button','CAST MY VOTE');cast.type='button';cast.className='primary';
 const retract=make('button','Remove my vote');retract.type='button';
 const apply=make('button','HOST · APPLY WINNER');apply.type='button';
 actions.append(cast,retract,apply);
 const status=make('p',null,'native-stadium-ballot-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const note=make('small','Voting never authorizes a room restart. Applying a pitch uses the native host configuration and returns the room to pre-game. Existing match results, rematch consent and Quick Match are untouched.');
 section.append(current,options,actions,status,note);
 const anchor=document.querySelector('#menuMatchPane .native-lobby-ready');
 if(anchor)anchor.insertAdjacentElement('afterend',section);
 else pane.append(section);
 let selected=null,optionSignature='',ballotLink=null,ballotRound=null,ballotMap=null;
 let pendingVote=null,pendingApply=null;
 const connectionOpen=link=>link?.ws?.readyState===1;
 const humanInRoom=()=>room?.state?.players?.some?.(p=>
  p.id===networkPlayerId&&!botIds.has(p.id))===true;
 function clearBallotSession(){
  selected=null;optionSignature='';ballotLink=null;ballotRound=null;ballotMap=null;
  pendingVote=null;pendingApply=null;
 }
 function currentBallotAction(requireHost=false){
  const d=native();
  if(!d||d.link!==ballotLink||d.state.round!==ballotRound||
     d.state.map!==ballotMap){
   render();
   status.textContent='The room or stadium vote changed. Review the current ballot before acting.';
   return null;
  }
  if(!connectionOpen(d.link)){
   status.textContent='Room connection is not open. No vote was sent.';
   return null;
  }
  if(!humanInRoom()||requireHost&&!d.link.isOwner){
   status.textContent='Only an admitted human'+(requireHost?' room host':'')+' can take this action.';
   return null;
  }
  if(d.state.kickoff!=null){
   status.textContent='The server countdown has locked this ballot.';
   return null;
  }
  return d;
 }
 function native(){
  const link=typeof serverLink!=='undefined'?serverLink:null;
  const state=link?.roomState;
  if(!link?.room||link.quickMatchMode||!state||state.started||state.lastResult)return null;
  const list=state.stadiumBallotOptions;
  if(!Array.isArray(list)||list.length<2||list.length>9||list.some((o,i)=>
   !o||o.id!==i||typeof o.name!=='string'||o.name.length<1||o.name.length>48))return null;
  if(!Array.isArray(state.stadiumBallotVotes)||state.stadiumBallotVotes.length>128)return null;
  return {link,state,list};
 }
 function render(){
  const d=native();
  section.hidden=!d;
  if(!d){if(ballotLink)clearBallotSession();return;}
  const {link,state,list}=d;
  // All rooms expose the same server ballot options. Rebuild the selection
  // when the real socket/room, round, or selected pitch changes; a choice
  // made in the previous room must never be carried into the new one.
  const sessionChanged=ballotLink!==link||ballotRound!==state.round||
   ballotMap!==state.map;
  if(sessionChanged){
   selected=null;optionSignature='';pendingVote=null;pendingApply=null;
   ballotLink=link;ballotRound=state.round;ballotMap=state.map;
  }
  const votes=new Map(state.stadiumBallotVotes.filter(v=>
   Array.isArray(v)&&v.length===2&&Number.isSafeInteger(v[0])&&
   Number.isSafeInteger(v[1])&&v[1]>=0&&v[1]<list.length));
  const tally=Array.from({length:list.length},()=>0);
  for(const v of votes.values())tally[v]++;
  const mine=votes.get(networkPlayerId);
  const signature=JSON.stringify(list);
  if(signature!==optionSignature){
   optionSignature=signature;selected=mine??0;options.replaceChildren();
   list.forEach(o=>{
    const card=make('label',null,'native-stadium-ballot-option');
    const radio=make('input');radio.type='radio';radio.name='native-stadium-ballot-choice';
    radio.value=String(o.id);radio.checked=o.id===selected;
    radio.addEventListener('change',()=>{selected=o.id;});
    const text=make('span',o.name);
    const count=make('strong','0','native-stadium-ballot-votes');
    card.append(radio,text,count);options.append(card);
   });
  }
  const all=[...options.querySelectorAll('.native-stadium-ballot-option')];
  for(const [i,row]of all.entries()){
   row.querySelector('.native-stadium-ballot-votes').textContent=tally[i]+' vote'+(tally[i]===1?'':'s');
   row.classList.toggle('native-stadium-ballot-leader',state.stadiumBallotWinner===i);
  }
  const total=tally.reduce((a,b)=>a+b,0);
  current.textContent='CURRENT SERVER PITCH · '+String(state.map||'Unknown')+
   ' · '+total+' confirmed vote'+(total===1?'':'s')+
   (mine!==undefined?' · YOUR VOTE: '+list[mine].name:' · you have not voted');
  const human=humanInRoom(),canSend=human&&connectionOpen(link)&&state.kickoff==null;
  cast.disabled=!canSend||!!pendingVote;
  retract.disabled=!canSend||mine===undefined||!!pendingVote;
  const winner=state.stadiumBallotWinner;
  apply.hidden=!link.isOwner;
  apply.disabled=!link.isOwner||!canSend||!!pendingApply||
   !Number.isSafeInteger(winner)||winner<0||winner>=list.length;
  apply.textContent=winner===0?'HOST · KEEP CURRENT PITCH':'HOST · APPLY LEADING PITCH';
  if(pendingVote){
   const confirmed=pendingVote.choice===null?mine===undefined:mine===pendingVote.choice;
   if(confirmed){
    status.textContent='The server confirmed your '+(mine===undefined?'vote removal.':'vote for '+list[mine].name+'.');
    pendingVote=null;
   }else if(Date.now()-pendingVote.sentAt>3500){
    status.textContent='No server vote receipt arrived. Review your connection and retry manually.';
    pendingVote=null;
   }else status.textContent='Vote sent. Awaiting the real server ballot update…';
  }else if(pendingApply){
   const confirmed=state.stadiumBallotVotes.length===0&&winner===null;
   if(confirmed){
    status.textContent='The server accepted the host action and cleared the ballot.';
    pendingApply=null;
   }else if(Date.now()-pendingApply.sentAt>3500){
    status.textContent='The server has not confirmed the pitch action. Review the vote before retrying.';
    pendingApply=null;
   }else status.textContent='Host request sent. Awaiting the server stadium update…';
  }else status.textContent=state.kickoff?
   'Ballot changes are locked while the native kickoff countdown runs.':
   !connectionOpen(link)?'The room connection is unavailable. No vote can be sent.':
   Number.isSafeInteger(winner)&&list[winner]?
    'Clear winner: '+list[winner].name+'. Only the host can apply it.':
    'At least two votes and an outright leader are needed before the host can apply a stadium.';
 }
 cast.onclick=()=>{
  const d=currentBallotAction();
  if(!d||pendingVote||!Number.isSafeInteger(selected)||selected<0||
     selected>=d.list.length)return;
  const choice=selected;
  d.link.send({type:'stadiumBallot',choice});
  pendingVote={choice,sentAt:Date.now()};
  render();
 };
 retract.onclick=()=>{
  const d=currentBallotAction();
  if(!d||pendingVote)return;
  const hasVote=d.state.stadiumBallotVotes.some(v=>Array.isArray(v)&&
   v[0]===networkPlayerId);
  if(!hasVote)return;
  d.link.send({type:'stadiumBallot',choice:null});
  pendingVote={choice:null,sentAt:Date.now()};
  render();
 };
 apply.onclick=()=>{
  const d=currentBallotAction(true),winner=d?.state.stadiumBallotWinner;
  if(!d||pendingApply||!Number.isSafeInteger(winner)||!d.list[winner])return;
  if(!confirm('Apply the voted '+d.list[winner].name+
   ' pitch through the existing native host configuration? This refreshes the waiting room and clears readiness. No match starts automatically.'))return;
  d.link.send({type:'stadiumBallotApply'});
  pendingApply={sentAt:Date.now()};
  render();
 };
 setInterval(()=>{if(typeof menuOpen!=='undefined'&&menuOpen&&!pane.hidden)render();
  else section.hidden=true;},1100);
 render();
})();
