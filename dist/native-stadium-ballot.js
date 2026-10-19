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
 let selected=null,optionSignature='';
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
  if(!d)return;
  const {link,state,list}=d;
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
  const human=room?.state?.players?.some?.(p=>p.id===networkPlayerId&&!botIds.has(p.id))===true;
  cast.disabled=!human||state.kickoff!=null;
  retract.disabled=!human||mine===undefined||state.kickoff!=null;
  const winner=state.stadiumBallotWinner;
  apply.hidden=!link.isOwner;
  apply.disabled=!link.isOwner||state.kickoff!=null||
   !Number.isSafeInteger(winner)||winner<0||winner>=list.length;
  apply.textContent=winner===0?'HOST · KEEP CURRENT PITCH':'HOST · APPLY LEADING PITCH';
  status.textContent=state.kickoff?
   'Ballot changes are locked while the native kickoff countdown runs.':
   Number.isSafeInteger(winner)&&list[winner]?
    'Clear winner: '+list[winner].name+'. Only the host can apply it.':
    'At least two votes and an outright leader are needed before the host can apply a stadium.';
 }
 cast.onclick=()=>{
  const d=native();if(!d||d.state.kickoff!=null||
   !Number.isSafeInteger(selected)||selected<0||selected>=d.list.length)return;
  d.link.send({type:'stadiumBallot',choice:selected});
  status.textContent='Submitting your vote to the native room…';
 };
 retract.onclick=()=>{
  const d=native();if(!d||d.state.kickoff!=null)return;
  d.link.send({type:'stadiumBallot',choice:null});
  status.textContent='Requesting native vote removal…';
 };
 apply.onclick=()=>{
  const d=native(),winner=d?.state.stadiumBallotWinner;
  if(!d||!d.link.isOwner||d.state.kickoff!=null||
   !Number.isSafeInteger(winner)||!d.list[winner])return;
  if(!confirm('Apply the voted '+d.list[winner].name+
   ' pitch through the existing native host configuration? This refreshes the waiting room and clears readiness. No match starts automatically.'))return;
  d.link.send({type:'stadiumBallotApply'});
  status.textContent='Host request sent. The real room server will decide whether this vote can be applied.';
 };
 setInterval(()=>{if(typeof menuOpen!=='undefined'&&menuOpen&&!pane.hidden)render();
  else section.hidden=true;},1100);
 render();
})();
