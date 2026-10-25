'use strict';
// Native Custom Room referee control: the server, not client UI, validates
// appointment and the narrow pause/resume permission on the real socket.
(function(){
 const menu=document.getElementById('menuMatchPane');
 const pitch=document.getElementById('matchView');
 if(!menu||!pitch)return;
 const make=(tag,label,cls)=>{const x=document.createElement(tag);
  if(label!==undefined&&label!==null)x.textContent=String(label);
  if(cls)x.className=cls;return x;};
 const panel=make('section',null,'room-referee-console');
 panel.setAttribute('aria-label','Custom room referee console');
 const title=make('div',null,'room-referee-heading');
 title.append(make('strong','ROOM REFEREE'),make('span','HOST-APPOINTED · PAUSE ONLY'));
 const description=make('p','A host can authorize one connected human to pause or resume this Custom Room. This never grants moderation, team selection, result editing or control of another person’s account.');
 const state=make('p','Waiting for current room.','room-referee-status');
 state.setAttribute('role','status');state.setAttribute('aria-live','polite');
 const hostControls=make('div',null,'room-referee-host');
 const chooseLabel=make('label','Appointed referee'),choose=make('select');
 choose.setAttribute('aria-label','Nominate an admitted current room human as referee');
 chooseLabel.append(choose);
 const appoint=make('button','Apply referee assignment');appoint.type='button';
 hostControls.append(chooseLabel,appoint);
 const actions=make('div',null,'room-referee-actions');
 const pause=make('button','Pause game'),resume=make('button','Resume game');
 pause.type=resume.type='button';pause.className='primary';
 actions.append(pause,resume);
 const promptNote=make('p','', 'room-referee-request');promptNote.hidden=true;
 const notice=make('p','', 'room-referee-feedback');
 notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 panel.append(title,description,state,hostControls,actions,promptNote,notice);
 const anchor=document.getElementById('subPanel')||menu.firstElementChild;
 if(anchor)anchor.insertAdjacentElement('afterend',panel);else menu.append(panel);
 const pitchPrompt=make('button','REFEREE · Pause requested','room-referee-pitch-prompt');
 pitchPrompt.type='button';pitchPrompt.hidden=true;
 pitchPrompt.setAttribute('aria-label','Referee: open room menu to consider pause request');
 pitch.append(pitchPrompt);
 // A human-appointed referee can be on Home / My Games when an active team
 // asks the room for a timed pause. Keep the original permission-bound action
 // reachable without changing the server's role or pause authority.
 const dock=make('aside',null,'room-referee-global');
 dock.hidden=true;dock.setAttribute('role','region');
 dock.setAttribute('aria-label','Live referee pause request');
 const dockCopy=make('div',null,'room-referee-global-copy');
 const dockHeading=make('strong','PAUSE REQUEST · YOU ARE REFEREE');
 const dockStatus=make('p');
 dockStatus.setAttribute('role','status');dockStatus.setAttribute('aria-live','polite');
 dockCopy.append(dockHeading,dockStatus);
 const dockActions=make('div',null,'room-referee-global-actions');
 const dockPause=make('button','Ⅱ Pause game','primary');
 const dockView=make('button','↗ Review match');
 dockPause.type=dockView.type='button';
 dockActions.append(dockPause,dockView);dock.append(dockCopy,dockActions);
 document.body.append(dock);
 let lastRoom=null,lastLink=null,lastKey='',pausePending=null;
 const validId=v=>Number.isSafeInteger(v)&&v>0;
 const nativeTeam=p=>typeof p?.team==='number'?p.team:p?.team?.id;
 function snapshot(){
  const link=typeof serverLink!=='undefined'?serverLink:null;
  if(!link?.room||link.quickMatchMode||!link.roomState||
   !Array.isArray(room?.state?.players)||room.state.players.length>128)return null;
  const state=link.roomState;
  const disconnected=new Set(Array.isArray(state.disconnectedIds)?state.disconnectedIds:[]);
  const bots=typeof botIds!=='undefined'&&botIds instanceof Set?botIds:new Set();
  const people=[];
  const seen=new Set();
  for(const p of room.state.players){
   if(!validId(p?.id)||seen.has(p.id)||bots.has(p.id)||p.aiControlled===true)continue;
   seen.add(p.id);
   if(![0,1,2].includes(nativeTeam(p)))continue;
   if(disconnected.has(p.id))continue;
   people.push({id:p.id,name:typeof p.name==='string'?
    p.name.replace(/[\u0000-\u001f\u007f-\u009f]/g,'').trim().slice(0,25)||'Player':'Player',
    side:nativeTeam(p)});
  }
  const referee=validId(state.refereeId)?state.refereeId:0;
  const person=people.find(p=>p.id===referee);
  const req=state.pauseRequest&&validId(state.pauseRequest.by)&&
   [1,2].includes(state.pauseRequest.team)&&
   Number.isSafeInteger(state.pauseRequest.expiresAt)&&
   state.pauseRequest.expiresAt>Date.now()?state.pauseRequest:null;
  return{link,people,referee,refereeName:person?.name||null,
   isReferee:!!person&&referee===networkPlayerId,
   isHost:link.isOwner===true,request:req,
   online:link.ws?.readyState===1,
   // The authoritative server sends started/paused as a separate status
   // packet; its room payload contains refereeId/pauseRequest but not those
   // flags. The original channel applies that packet to these shared flags.
   // A connected admitted current link and actual appointed roster member
   // are still required before the referee can act.
   running:typeof started!=='undefined'&&started===true,
   paused:typeof paused!=='undefined'&&paused===true};
 }
 function render(){
  const d=snapshot();
  if(!d){panel.hidden=true;pitchPrompt.hidden=true;dock.hidden=true;
   lastKey='';lastRoom=null;lastLink=null;pausePending=null;return;}
  panel.hidden=false;
  if(lastRoom!==d.link.room||lastLink!==d.link){
   lastKey='';lastRoom=d.link.room;lastLink=d.link;
   notice.textContent='';pausePending=null;
  }
  if(!d.running||d.paused||!d.online)pausePending=null;
  if(pausePending&&Date.now()-pausePending.at>3000){
   pausePending=null;
   notice.textContent='No server pause confirmation yet. You may explicitly retry.';
  }
  const liveRequest=d.isReferee&&!!d.request&&d.running&&!d.paused&&d.online;
  // The original on-pitch shortcut remains the only prompt on the pitch.
  // Home and My Games instead expose a body-mounted contextual action.
  dock.hidden=!liveRequest||!pitch.hidden||document.hidden;
  if(!dock.hidden){
   const actor=d.people.find(p=>p.id===d.request.by);
   const seconds=Math.max(0,Math.ceil((d.request.expiresAt-Date.now())/1000));
   dockStatus.textContent=(actor?.name||'An active human')+
    ' asked to pause the current server match · '+seconds+
    's left. Only your explicit vote can request a pause.'+
    (pausePending?' · Awaiting native confirmation.':'');
   dockPause.disabled=!!pausePending;
  }
  const key=JSON.stringify([d.link.room,d.referee,d.people,d.isHost,d.isReferee,d.request,d.running,d.paused,d.online,!!pausePending]);
  // Menu-open state changes independently of room packets; keep the optional
  // pitch prompt correct even when the authoritative room data is unchanged.
  pitchPrompt.hidden=!(liveRequest&&
   document.getElementById('pauseMenu')?.hidden&&!document.hidden&&!pitch.hidden);
  if(key===lastKey)return;
  lastKey=key;
  state.textContent=d.referee>0?'Referee: '+(d.refereeName||'reconnecting / unavailable')+
   (d.isReferee?' · YOU ARE THE REFEREE':''):
   'No referee appointed. The host keeps all original controls.';
  hostControls.hidden=!d.isHost;
  if(d.isHost){
   const previous=choose.value;
   choose.replaceChildren(new Option('No appointed referee','0'));
   for(const p of d.people)choose.add(new Option(p.name+(p.side===0?' · spectator':' · playing'),String(p.id)));
   const allowed=[...choose.options].map(x=>x.value);
   choose.value=allowed.includes(previous)?previous:String(allowed.includes(String(d.referee))?d.referee:0);
   appoint.disabled=!allowed.includes(choose.value)||Number(choose.value)===d.referee;
  }
  actions.hidden=!d.isReferee;
  pause.hidden=!d.running||d.paused;
  resume.hidden=!d.running||!d.paused;
  pause.disabled=!d.isReferee||!d.running||d.paused||!d.online||!!pausePending;
  resume.disabled=!d.isReferee||!d.running||!d.paused||!d.online;
  const pending=d.request&&d.running&&!d.paused;
  promptNote.hidden=!(pending&&(d.isReferee||d.isHost));
  if(!promptNote.hidden){
   const person=d.people.find(p=>p.id===d.request.by);
   promptNote.textContent=(person?.name||'An active human')+
    ' requested a pause. Only you decide whether to stop the actual clock.';
  }

 }
 choose.onchange=()=>{
  const d=snapshot();
  if(d?.isHost)appoint.disabled=Number(choose.value)===d.referee;
 };
 appoint.onclick=()=>{
  const d=snapshot(),id=Number(choose.value);
  if(!d?.isHost||!Number.isSafeInteger(id)||id<0||
   (id!==0&&!d.people.some(p=>p.id===id)))return;
  if(!window.confirm(id?
   'Appoint this connected human as room referee with pause/resume permissions only?':
   'Revoke referee pause/resume rights?'))return;
  d.link.send({type:'appointReferee',id});
  notice.textContent='Assignment requested. Awaiting the authoritative native room update.';
 };
 function changePause(value){
  const d=snapshot();
  if(!d?.isReferee||!d.running||d.paused===value||!d.online||
     value&&pausePending)return;
  d.link.send({type:'refereePause',value});
  if(value)pausePending={link:d.link,at:Date.now()};
  notice.textContent=(value?'Pause':'Resume')+' requested by the appointed referee. Waiting for the native room update.';
 }
 pause.onclick=()=>changePause(true);
 resume.onclick=()=>changePause(false);
 dockPause.onclick=()=>{
  const d=snapshot();
  if(d?.isReferee&&d.request&&d.online&&d.running&&!d.paused){
   render();if(!pause.disabled)pause.click();
   render();
  }
 };
 dockView.onclick=()=>{
  const d=snapshot();if(!d?.isReferee||!d.request)return;
  document.getElementById('tabPlay')?.click();
  if(typeof openMatchMenu==='function')openMatchMenu('menuMatchPane','menuMatch');
  render();
  panel.scrollIntoView?.({behavior:'auto',block:'nearest'});
  (pause.disabled?panel:pause).focus?.({preventScroll:true});
 };
 pitchPrompt.onclick=()=>{
  const d=snapshot();
  if(!d?.isReferee||!d.request)return;
  if(typeof openMatchMenu==='function')openMatchMenu('menuMatchPane','menuMatch');
  pause.focus({preventScroll:true});
 };
 setInterval(()=>{if(!document.hidden)render();},1300);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){pitchPrompt.hidden=true;dock.hidden=true;}else render();});
 render();
})();