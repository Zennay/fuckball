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
  const d=source();section.hidden=!d;if(!d){signature='';return;}
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
  cast.disabled=!human||state.kickoff!=null;
  remove.disabled=!human||mine===undefined||state.kickoff!=null;
  apply.hidden=!link.isOwner;
  const winner=state.matchFormatWinner;
  apply.disabled=!link.isOwner||state.kickoff!=null||!Number.isSafeInteger(winner)||
   winner<0||winner>=list.length;
  status.textContent=state.kickoff?
   'Format voting is locked during the server kickoff countdown.':
   Number.isSafeInteger(winner)&&list[winner]?
    'Clear leader: '+list[winner].name+' · '+counts.reduce((a,b)=>a+b,0)+' actual votes.':
    'An outright winner needs at least two human votes.'+
     (mine!==undefined?' Your vote: '+list[mine].name+'.':'');
 }
 cast.onclick=()=>{
  const d=source();if(!d||d.state.kickoff!=null||
   !Number.isSafeInteger(selected)||selected<0||selected>=d.list.length)return;
  d.link.send({type:'matchFormatVote',choice:selected});
  status.textContent='Submitting your match format choice to the real room server…';
 };
 remove.onclick=()=>{
  const d=source();if(!d||d.state.kickoff!=null)return;
  d.link.send({type:'matchFormatVote',choice:null});
  status.textContent='Removing your native match format vote…';
 };
 apply.onclick=()=>{
  const d=source(),winner=d?.state.matchFormatWinner;
  if(!d||!d.link.isOwner||d.state.kickoff!=null||
   !Number.isSafeInteger(winner)||!d.list[winner])return;
  const selectedFormat=d.list[winner];
  if(!confirm('Apply '+selectedFormat.name+
   ' using the original host configuration? This refreshes the idle room and clears ready flags, without starting the game.'))return;
  d.link.send({type:'matchFormatApply'});
  status.textContent='Host format request sent to native room. Existing server permissions still apply.';
 };
 setInterval(()=>{
  if(typeof menuOpen!=='undefined'&&menuOpen&&!pane.hidden)render();
  else section.hidden=true;
 },1000);
 render();
})();
