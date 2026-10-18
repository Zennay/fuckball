'use strict';
// Searchable local navigation. Commands never synthesize player input or server authority.
(function(){
 const home=document.getElementById('homeView');
 const games=document.getElementById('gamesView');
 const nav=document.querySelector('.main-nav');
 if(!home||!games||!nav)return;
 const KEY='fuckball.launchpad.v1';
 const dom=(tag,text,cls)=>{
  const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);
  if(cls)n.className=cls;return n;
 };
 const commands=[
  {id:'home',label:'Home & game modes',group:'Play',desc:'Return to the main play menu',view:'home',selector:'.mode-cards',terms:'play home local mode'},
  {id:'human',label:'Find a human match',group:'Play',desc:'Open the existing human Quick Match queue',view:'home',click:'heroFindMatch',terms:'online matchmaking people multiplayer'},
  {id:'room',label:'Browse available rooms',group:'Play',desc:'Explore publicly advertised rooms; join through native controls',view:'home',selector:'.room-browser',terms:'custom join multiplayer'},
  {id:'friends',label:'Friends & parties',group:'Play',desc:'Find your existing friendship and party tools',view:'home',selector:'.friend-party',terms:'invite friends group'},
  {id:'solo',label:'Start solo training',group:'Training',desc:'Enter the local 1v1 practice mode',view:'home',click:'quickPractice',terms:'offline bots practice ai'},
  {id:'squad',label:'Start local 4v4',group:'Training',desc:'Enter the existing four-versus-four local setup',view:'home',click:'quickSquad',terms:'bots local squads ai'},
  {id:'practice',label:'Practice Lab',group:'Training',desc:'Drills and guided personal practice',view:'home',selector:'.practice-lab',terms:'drills goals training'},
  {id:'circuit',label:'Training Circuits',group:'Training',desc:'Your locally saved practice circuit',view:'home',selector:'.practice-circuit',terms:'routine repetition'},
  {id:'journal',label:'Practice Journal',group:'Training',desc:'Personal offline training history',view:'home',selector:'.practice-journal',terms:'notes log progress'},
  {id:'league',label:'Round-robin Tournament Desk',group:'Competitions',desc:'Private team schedules, standings and results',view:'home',selector:'.tournament-desk',terms:'league table fixtures football'},
  {id:'knockout',label:'Knockout Cup Builder',group:'Competitions',desc:'Private elimination bracket and advancement',view:'home',selector:'.knockout-desk',terms:'cup elimination playoffs'},
  {id:'matchday',label:'Matchday Hub',group:'Competitions',desc:'Your local competitions and upcoming kickoffs',view:'home',selector:'.matchday-hub',terms:'calendar scoreboard planning'},
  {id:'posters',label:'Matchday Poster Studio',group:'Competitions',desc:'Create a local friendly fixture or result PNG',view:'home',selector:'.matchday-posters',terms:'image share graphic match card fixture'},
  {id:'game-night',label:'Game Night Pack',group:'Competitions',desc:'Export and restore local competition and tactics plans',view:'home',selector:'.game-night-pack',terms:'backup restore portable'},
  {id:'formation',label:'4v4 Formation Studio',group:'Competitions',desc:'Private tactics, HBS stadium drawings and passing routes',view:'home',selector:'.formation-studio',terms:'lineup tactics coach'},
  {id:'games',label:'My Games / Replay Library',group:'Replays',desc:'Manage real locally saved HBR2 recordings',view:'games',selector:'.my-games-tools',terms:'replay record archive'},
  {id:'replay-collections',label:'Replay Collections',group:'Replays',desc:'Your permanent private folders and study guides',view:'games',selector:'.replay-collections',terms:'folders highlights playlist'},
  {id:'replay-review',label:'Replay Review Queue',group:'Replays',desc:'Play a curated study session with Next / Previous',view:'games',selector:'.replay-review-queue',terms:'watchlist autoplay coaching'},
  {id:'replay-study',label:'Replay Study Hub',group:'Replays',desc:'Find personal timeline coaching observations',view:'games',selector:'.replay-study-dashboard',terms:'notes insights'},
  {id:'replay-clips',label:'Replay Clip Studio',group:'Replays',desc:'Trim existing HBR2 recordings into private clips',view:'games',selector:'.replay-clip-export',terms:'video export webm'},
  {id:'game-view',label:'Open match screen',group:'Spectate',desc:'Show the native game pitch and in-match controls',view:'play',terms:'camera spectator radar broadcast scoreboard'}
 ];
 const safeIds=list=>Array.isArray(list)&&list.length<=15&&list.every(x=>
  typeof x==='string'&&commands.some(c=>c.id===x));
 let favorites=[],recent=[],focusMode=false;
 try{
  const saved=JSON.parse(localStorage.getItem(KEY)||'null');
  if(saved?.version===1){
   if(safeIds(saved.favorites))favorites=[...new Set(saved.favorites)].slice(0,10);
   if(safeIds(saved.recent))recent=[...new Set(saved.recent)].slice(0,6);
   if(typeof saved.focusMode==='boolean')focusMode=saved.focusMode;
  }
 }catch{}
 const persist=()=>{
  try{localStorage.setItem(KEY,JSON.stringify({version:1,favorites,recent,focusMode}));}
  catch{status.textContent='Your shortcuts work for this visit; browser preference storage is unavailable.';}
 };
 const openButton=dom('button','⌕ Explore','launchpad-open');
 openButton.type='button';openButton.title='Explore Fuckball · Ctrl+K / ⌘K';
 nav.append(openButton);
 const dialog=dom('dialog',undefined,'launchpad-dialog');
 dialog.setAttribute('aria-label','Find and open a Fuckball feature');
 const header=dom('header',undefined,'launchpad-header');
 const title=dom('div');
 title.append(dom('strong','EXPLORE FUCKBALL'),dom('small','Find game modes, competition tools, replays and practice'));
 const close=dom('button','✕','launchpad-close');
 close.type='button';close.setAttribute('aria-label','Close feature search');
 header.append(title,close);
 const query=dom('input');query.type='search';query.placeholder='Search features…';
 query.maxLength=80;query.autocomplete='off';query.spellcheck=false;
 query.setAttribute('aria-label','Search Fuckball features');
 const toolbar=dom('div',undefined,'launchpad-toolbar');
 const mode=dom('button',undefined,'launchpad-mode');
 mode.type='button';
 const hint=dom('span','↵ Open · ↑↓ Navigate · Esc Close · Ctrl/⌘ K', 'launchpad-hint');
 toolbar.append(mode,hint);
 const list=dom('div',undefined,'launchpad-list');
 list.setAttribute('aria-label','Matching features');
 const status=dom('p',undefined,'launchpad-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 dialog.append(header,query,toolbar,list,status);
 document.body.append(dialog);
 let selected=0,results=[],isOpen=false,navigating=false;
 function setFocusMode(enabled,permanent=true){
  if(permanent)focusMode=enabled;
  document.body.classList.toggle('launchpad-focus-home',enabled);
  mode.textContent=enabled?'Show all home tools':'Focus home · show only game cards';
  mode.setAttribute('aria-pressed',String(enabled));
  if(permanent)persist();
 }
 setFocusMode(focusMode,false);
 const exists=c=>!c.selector||!!document.querySelector(c.selector);
 function ranked(term){
  let matched=commands.filter(exists);
  if(term){
   const needle=term.toLocaleLowerCase();
   matched=matched.filter(c=>(c.label+' '+c.desc+' '+c.group+' '+c.terms)
    .toLocaleLowerCase().includes(needle));
  }
  const index=arr=>c=>{const i=arr.indexOf(c.id);return i<0?100:i;};
  matched.sort((a,b)=>{
   const fa=index(favorites)(a),fb=index(favorites)(b);
   if(fa!==fb)return fa-fb;
   const ra=index(recent)(a),rb=index(recent)(b);
   if(ra!==rb)return ra-rb;
   return a.group.localeCompare(b.group)||a.label.localeCompare(b.label);
  });
  return matched;
 }
 function render(){
  results=ranked(query.value.trim()).slice(0,35);
  if(selected>=results.length)selected=0;
  list.replaceChildren();
  for(const [i,c] of results.entries()){
   const line=dom('div',undefined,'launchpad-result');
   line.classList.toggle('selected',i===selected);
   const primary=dom('button',undefined,'launchpad-result-main');
   primary.type='button';
   primary.append(dom('strong',c.label),dom('span',c.desc));
   const category=dom('small',c.group,'launchpad-result-group');
   const star=dom('button',favorites.includes(c.id)?'★':'☆','launchpad-pin');
   star.type='button';
   star.setAttribute('aria-label',(favorites.includes(c.id)?'Unpin ':'Pin ')+c.label);
   star.setAttribute('aria-pressed',String(favorites.includes(c.id)));
   star.title='Pin/unpin feature';
   star.onclick=()=>{
    if(favorites.includes(c.id))favorites=favorites.filter(x=>x!==c.id);
    else favorites=[c.id,...favorites].slice(0,10);
    persist();render();query.focus();
   };
   primary.onclick=()=>activate(c);
   primary.onmouseenter=()=>{selected=i;list.querySelectorAll('.launchpad-result').forEach((n,j)=>
    n.classList.toggle('selected',j===selected));};
   line.append(primary,category,star);list.append(line);
  }
  if(!results.length)list.append(dom('p','No features match your search. Try “replay”, “cup” or “practice”.','launchpad-empty'));
  status.textContent=results.length+' available features · '+favorites.length+' pinned shortcuts';
 }
 function navigate(command){
  const tab=command.view==='games'?'tabReplay':command.view==='play'?'tabPlay':'tabHome';
  document.getElementById(tab)?.click();
  if(command.click){
   const control=document.getElementById(command.click);
   if(control&&!control.disabled){control.click();return;}
   return;
  }
  if(command.view==='home')setFocusMode(false,false);
  if(!command.selector)return;
  const target=document.querySelector(command.selector);if(!target)return;
  const details=target.matches('details')?target:target.querySelector('details');
  if(details)details.open=true;
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  target.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});
  const summary=details?.querySelector('summary');
  if(summary){summary.setAttribute('tabindex','0');summary.focus({preventScroll:true});}
 }
 function activate(command){
  recent=[command.id,...recent.filter(x=>x!==command.id)].slice(0,6);
  persist();
  navigating=true;
  dialog.close();
  navigate(command);
 }
 function show(){
  if(dialog.open)return;
  query.value='';selected=0;render();
  if(typeof dialog.showModal!=='function')return;
  if(typeof releaseInputs==='function')releaseInputs();
  dialog.showModal();isOpen=true;query.focus();
 }
 openButton.onclick=show;
 close.onclick=()=>dialog.close();
 mode.onclick=()=>{setFocusMode(!focusMode);render();};
 query.addEventListener('input',()=>{selected=0;render();});
 query.addEventListener('keydown',event=>{
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();if(!results.length)return;
   selected=(selected+(event.key==='ArrowDown'?1:-1)+results.length)%results.length;render();
  }else if(event.key==='Enter'&&results[selected]){
   event.preventDefault();activate(results[selected]);
  }
 });
 dialog.addEventListener('close',()=>{
  isOpen=false;
  if(!navigating)openButton.focus({preventScroll:true});
  navigating=false;
 });
 // Prevent gameplay movement keys from reaching the underlying match when the
 // modal keyboard controls are in use. No online room changes are made.
 dialog.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key?.toLocaleLowerCase()==='k'){
   event.preventDefault();dialog.close();
  }
  event.stopPropagation();
 });
 dialog.addEventListener('click',event=>{
  if(event.target===dialog)dialog.close();
 });
 window.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&!event.altKey&&
   event.key?.toLocaleLowerCase()==='k'){
   event.preventDefault();
   if(dialog.open)dialog.close();else show();
  }
 });
 document.getElementById('tabHome')?.addEventListener('click',()=>setFocusMode(focusMode,false));
})();
