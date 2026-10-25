'use strict';
// Device-private coaching board built only from receipts returned by the authenticated native server.
// This never writes a server result, changes a ranking, infers an official performance metric or controls a match.
(function(){
 const PREFIX='fuckball.private-next-match-focus.v1.';
 const FOCI={finishing:'Finishing',passing:'Passing',defending:'Defending',
  positioning:'Positioning',teamwork:'Teamwork',decisions:'Decision making'};
 const focusKeys=Object.keys(FOCI);
 const safeText=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const download=(filename,type,content)=>{
  const url=URL.createObjectURL(new Blob([content],{type}));
  const a=document.createElement('a');a.href=url;a.download=filename;
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
 };
 function readPlan(raw){
  try{
   const obj=JSON.parse(raw);
   return obj?.version===1&&focusKeys.includes(obj.focus)&&
    typeof obj.action==='string'&&obj.action.length<=200&&obj.action.trim().length>0&&
    Number.isSafeInteger(obj.updatedAt)&&obj.updatedAt>0?
    {focus:obj.focus,action:obj.action,updatedAt:obj.updatedAt}:null;
  }catch{return null;}
 }
 const result=row=>row.winner===0?'Draw':row.winner===row.team?'Win':'Loss';
 const date=at=>{const d=new Date(at);return Number.isFinite(d.getTime())?d.toLocaleDateString():'Unknown date';};
 function mount(host,user,authorized,receipts,readReviews){
  if(!host||typeof authorized!=='function'||typeof readReviews!=='function'||
    typeof user!=='string'||!user||user.length>80)return ()=>{};
  const key=PREFIX+encodeURIComponent(user.toLowerCase());
  // Never allow a stored review to become a match: only currently signed-in,
  // server-validated receipts are joined against account-scoped browser notes.
  const verified=new Map((Array.isArray(receipts)?receipts:[]).filter(row=>
   /^[0-9a-f]{24}$/.test(row?.id||'')&&row.source==='native-server'&&row.ranked===false).map(row=>[row.id,row]));
  const section=document.createElement('section');section.className='private-coach';
  section.setAttribute('aria-label','Private next match coaching studio');
  const title=document.createElement('h3');title.textContent='NEXT MATCH STUDIO';
  const help=document.createElement('p');help.className='private-coach-help';
  help.textContent='Build a practical next-game focus from your own device-only notes attached to genuine recent unranked server results. Nothing here changes scores, ratings, teammates or your account.';
  const form=document.createElement('div');form.className='private-coach-goal';
  const focusLabel=document.createElement('label');focusLabel.textContent='Next-game focus';
  const focus=document.createElement('select');focus.setAttribute('aria-label','Next-game coaching focus');
  focusKeys.forEach(id=>focus.add(new Option(FOCI[id],id)));
  focusLabel.append(focus);
  const actionLabel=document.createElement('label');actionLabel.textContent='One action to try next match';
  const action=document.createElement('textarea');action.rows=2;action.maxLength=200;
  action.placeholder='Example: Look for a free teammate before shooting (200 characters max).';
  action.setAttribute('aria-label','One action to try next match');
  actionLabel.append(action);
  const buttons=document.createElement('div');buttons.className='private-coach-actions';
  const save=document.createElement('button');save.type='button';save.textContent='Save next-game plan';
  const clear=document.createElement('button');clear.type='button';clear.textContent='Clear plan';
  const reload=document.createElement('button');
  reload.type='button';reload.textContent='↻ Load latest saved goal';
  reload.hidden=true;
  reload.setAttribute('aria-label','Review the latest goal saved in another browser tab');
  const exportBtn=document.createElement('button');exportBtn.type='button';exportBtn.textContent='↓ Export offline coaching sheet';
  const backup=document.createElement('button');backup.type='button';backup.textContent='↓ Backup personal goal';
  const restore=document.createElement('button');restore.type='button';restore.textContent='↑ Restore personal goal';
  const input=document.createElement('input');input.type='file';input.hidden=true;input.accept='.json,application/json';
  const notesLabel=document.createElement('label');notesLabel.className='private-coach-checkbox';
  const includeNotes=document.createElement('input');includeNotes.type='checkbox';includeNotes.checked=false;
  notesLabel.append(includeNotes,document.createTextNode('Include private review note text in export'));
  buttons.append(save,clear,reload,exportBtn,backup,restore,input);
  form.append(focusLabel,actionLabel,buttons,notesLabel);
  const status=document.createElement('p');status.className='private-coach-status';
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const filters=document.createElement('div');filters.className='private-coach-filter';
  const filterLabel=document.createElement('label');filterLabel.textContent='Review focus';
  const reviewFilter=document.createElement('select');reviewFilter.setAttribute('aria-label','Filter my recent reviewed matches');
  reviewFilter.add(new Option('All saved focuses','all'));
  focusKeys.forEach(id=>reviewFilter.add(new Option(FOCI[id],id)));
  reviewFilter.add(new Option('General notes','none'));filterLabel.append(reviewFilter);
  const summary=document.createElement('p');summary.className='private-coach-summary';
  filters.append(filterLabel,summary);
  const tiles=document.createElement('div');tiles.className='private-coach-tiles';
  const reviewsList=document.createElement('div');reviewsList.className='private-coach-review-list';
  const limit=document.createElement('p');limit.className='private-coach-limit';
  section.append(title,help,form,status,filters,tiles,reviewsList,limit);
  host.append(section);
  let savedRaw=null,externalChange=false;
  try{savedRaw=localStorage.getItem(key);}catch{status.textContent='Private browser storage is unavailable.';}
  const initial=readPlan(savedRaw);
  if(initial){focus.value=initial.focus;action.value=initial.action;}
  clear.disabled=!initial;
  function validSession(){
   if(authorized())return true;
   status.textContent='Account session changed. Reload your signed-in match history first.';
   return false;
  }
  function markExternalChange(){
   externalChange=true;reload.hidden=false;
   status.textContent='Your goal changed in another tab. Your draft is preserved. Choose Load latest saved goal before changing or exporting this goal.';
   save.disabled=clear.disabled=restore.disabled=backup.disabled=exportBtn.disabled=true;
  }
  function unchanged(){
   try{
    if(localStorage.getItem(key)===savedRaw){
     if(externalChange){externalChange=false;reload.hidden=true;refresh();}
     return true;
    }
    markExternalChange();
   }catch{status.textContent='Private browser storage is unavailable.';}
   return false;
  }
  // Cross-tab writes do not trigger a same-tab storage event. Keep the
  // current draft untouched and require an explicit reload before editing.
  function inspectExternal(){
   if(!section.isConnected||!authorized())return;
   try{
    if(localStorage.getItem(key)!==savedRaw)markExternalChange();
   }catch{status.textContent='Private browser storage is unavailable.';}
  }
  const onExternalStorage=event=>{
   if(!section.isConnected){window.removeEventListener('storage',onExternalStorage);return;}
   if(event.key===key||event.key===null)inspectExternal();
  };
  window.addEventListener('storage',onExternalStorage);
  window.addEventListener('focus',inspectExternal);
  reload.onclick=()=>{
   if(!validSession())return;
   if(!confirm('Load the newest saved goal from this browser and replace your unsaved form text? No verified match results or reviews will be changed.'))return;
   if(!validSession())return;
   try{
    const raw=localStorage.getItem(key),goal=readPlan(raw);
    savedRaw=raw;externalChange=false;reload.hidden=true;
    focus.value=goal?.focus||focusKeys[0];action.value=goal?.action||'';
    refresh();
    status.textContent=goal?'Latest private goal loaded. You can edit it now.':
     'No current saved goal. Your form has been reset for a new goal.';
   }catch{status.textContent='Could not read your current private goal.';}
  };
  function joined(){
   let notes=[];
   try{notes=readReviews();}catch{}
   return (Array.isArray(notes)?notes:[]).filter(note=>verified.has(note.id)&&
    (note.focus==='none'||focusKeys.includes(note.focus))&&typeof note.note==='string'&&
    note.note.length<=280).map(note=>({...note,match:verified.get(note.id)}))
    .sort((a,b)=>b.match.at-a.match.at||a.id.localeCompare(b.id));
  }
  save.onclick=()=>{
   if(!validSession()||!unchanged())return;
   const text=action.value.trim();
   if(!focusKeys.includes(focus.value)||!text||text.length>200){
    status.textContent='Choose a focus and one action (up to 200 characters).';return;
   }
   try{
    const raw=JSON.stringify({version:1,focus:focus.value,action:text,updatedAt:Date.now()});
    localStorage.setItem(key,raw);savedRaw=raw;clear.disabled=false;
    status.textContent='Your next-game plan is saved privately on this device. It does not award a completed match.';
    refresh();
   }catch{status.textContent='Could not save your plan on this device.';}
  };
  clear.onclick=()=>{
   if(!validSession()||!unchanged())return;
   const expected=savedRaw;
   if(!confirm('Delete your private next-match plan from this browser? Match reviews and server results stay intact.'))return;
   // A different tab may save while this modal is open. Never erase that
   // newly saved private work on the basis of a pre-confirmation check.
   if(!validSession()||!unchanged()||savedRaw!==expected)return;
   try{localStorage.removeItem(key);savedRaw=null;action.value='';clear.disabled=true;
    status.textContent='Private next-match plan cleared.';refresh();
   }catch{status.textContent='Could not clear your local plan.';}
  };
  // Account-bound backup of a user-written goal only. No receipt, score or ranking import.
  backup.onclick=()=>{
   if(!validSession()||!unchanged())return;
   const goal=readPlan(savedRaw);
   if(!goal){status.textContent='Save your personal goal before exporting it.';return;}
   try{
    download('fuckball-next-match-goal-'+new Date().toISOString().slice(0,10)+'.json',
     'application/json',JSON.stringify({format:'fuckball-device-goal',version:1,account:user,
      notice:'Private self-written intention, not a verified result or rating.',goal},null,2));
    status.textContent='Goal backup exported locally. It contains your account name and goal; keep it private.';
   }catch{status.textContent='Could not export your private goal.';}
  };
  restore.onclick=()=>{if(validSession())input.click();};
  input.onchange=async()=>{
   const file=input.files?.[0];input.value='';
   if(!file||!validSession())return;
   if(file.size>8192){status.textContent='A goal backup must be at most 8 KB.';return;}
   restore.disabled=true;
   try{
    const payload=JSON.parse(await file.text());
    if(!validSession()||!unchanged())return;
    if(payload?.format!=='fuckball-device-goal'||payload.version!==1||
     typeof payload.account!=='string'||payload.account.toLowerCase()!==user.toLowerCase())
     throw Error('This goal backup is not from your signed-in account.');
    const goal=readPlan(JSON.stringify(payload.goal));
    if(!goal||goal.updatedAt>Date.now()+86400000)
     throw Error('The selected file has no valid goal.');
    if(readPlan(savedRaw)&&!confirm('Replace your saved goal with this backup? Match reviews and original server results remain unchanged.'))return;
    if(!validSession()||!unchanged())return;
    const value=JSON.stringify({version:1,focus:goal.focus,action:goal.action,updatedAt:goal.updatedAt});
    localStorage.setItem(key,value);savedRaw=value;
    focus.value=goal.focus;action.value=goal.action;
    refresh();
    status.textContent='Private goal restored on this device. No match results or rankings were imported.';
   }catch(error){status.textContent=error?.message||'Could not restore the private goal.';}
   finally{restore.disabled=false;}
  };
  function coachSheet(notes,includePrivateNotes){
   const plan=readPlan(savedRaw);
   // A standalone offline report: no script, server URL, account identity, receipt IDs,
   // opponent handles, token or background network requests.
   const numbers=focusKeys.map(id=>({id,n:notes.filter(x=>x.focus===id).length})).filter(x=>x.n);
   const title='Fuckball — Private Next Match Coaching Sheet';
   const line='<p><strong>Source:</strong> '+notes.length+' reviewed genuine recent server receipts with device-only notes. Unranked; not lifetime or official analysis.</p>';
   const task=plan?'<section><h2>One action for my next match</h2><p><strong>'+safeText(FOCI[plan.focus])+
    '</strong>: '+safeText(plan.action)+'</p></section>':'<p>No next-match plan saved yet.</p>';
   const categories='<section><h2>Review focus</h2><ul>'+numbers.map(x=>'<li>'+
    safeText(FOCI[x.id])+': '+x.n+' review'+(x.n===1?'':'s')+'</li>').join('')+'</ul></section>';
   const entries='<section><h2>Recent reviewed matches</h2>'+notes.map(x=>
    '<article><strong>'+safeText(date(x.match.at))+' · '+safeText(x.match.mode)+
    ' · '+result(x.match)+' · '+safeText(FOCI[x.focus]||'General')+'</strong>'+
    (includePrivateNotes&&x.note?'<p>'+safeText(x.note).replace(/\n/g,'<br>')+'</p>':'')+
    '</article>').join('')+'</section>';
   return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">'+
    '<meta name="viewport" content="width=device-width, initial-scale=1">'+
    '<title>'+title+'</title><style>body{font:16px system-ui,sans-serif;max-width:810px;'+
    'padding:28px;margin:auto;line-height:1.6;color:#142b30}h1,h2{line-height:1.2}'+
    'section{margin-top:28px}article{margin:12px 0;padding:12px;border:1px solid #9aa;'+
    'border-radius:8px}p{overflow-wrap:anywhere;white-space:normal}@media print{body{padding:0}}</style></head>'+
    '<body><h1>'+title+'</h1>'+line+task+categories+entries+
    '<footer><small>Private personal notes only. No online standings, ratings or verified skill claims. Generated locally.</small></footer></body></html>';
  }
  exportBtn.onclick=()=>{
   if(!validSession()||!unchanged())return;
   const includePrivateNotes=includeNotes.checked;
   if(includePrivateNotes&&!confirm('Include your PRIVATE coaching note text in the exported HTML file? Keep the file safe.'))return;
   // Confirmation dialogs yield to other tabs and sign-out. Do not export
   // cached notes or a prior account's records after such a change.
   if(!validSession()||!unchanged())return;
   const notes=joined();
   if(!notes.length&&!readPlan(savedRaw)){status.textContent='Save a plan or review a verified match first.';return;}
   try{
    download('fuckball-private-next-match-'+new Date().toISOString().slice(0,10)+'.html','text/html',coachSheet(notes,includePrivateNotes));
    status.textContent='Standalone offline coaching sheet exported'+(includePrivateNotes?' with private note text.':'. Notes were excluded by default.');
   }catch{status.textContent='Offline coaching sheet could not be created.';}
  };
  function refresh(){
   if(!validSession())return;
   const notes=joined();
   const visible=reviewFilter.value==='all'?notes:notes.filter(x=>x.focus===reviewFilter.value);
   const plan=readPlan(savedRaw);
   summary.textContent=visible.length+' shown of '+notes.length+' privately reviewed genuine recent matches.';
   clear.disabled=backup.disabled=!plan||externalChange;
   save.disabled=restore.disabled=exportBtn.disabled=externalChange;
   tiles.replaceChildren();reviewsList.replaceChildren();
   const cards=[['VERIFIED REVIEWS',String(notes.length)],['FOCUS CATEGORIES',String(new Set(notes.filter(x=>x.focus!=='none').map(x=>x.focus)).size)],
    ['NEXT MATCH GOAL',plan?FOCI[plan.focus]:'Not set']];
   cards.forEach(([label,value])=>{
    const card=document.createElement('div');card.className='private-coach-tile';
    const name=document.createElement('span');name.textContent=label;
    const detail=document.createElement('strong');detail.textContent=value;
    card.append(name,detail);tiles.append(card);
   });
   const tally=document.createElement('div');tally.className='private-coach-bars';
   const highest=Math.max(1,...focusKeys.map(id=>notes.filter(x=>x.focus===id).length));
   focusKeys.forEach(id=>{
    const count=notes.filter(x=>x.focus===id).length;
    if(!count)return;
    const row=document.createElement('button');row.type='button';row.className='private-coach-bar';
    row.setAttribute('aria-label','Show '+count+' reviewed matches focused on '+FOCI[id]);
    const label=document.createElement('span');label.textContent=FOCI[id];
    const progress=document.createElement('progress');progress.max=highest;progress.value=count;
    const amount=document.createElement('b');amount.textContent=String(count);
    row.append(label,progress,amount);
    row.onclick=()=>{reviewFilter.value=id;refresh();};
    tally.append(row);
   });
   reviewsList.append(tally);
   const recent=document.createElement('div');recent.className='private-coach-recents';
   for(const row of visible.slice(0,12)){
    const card=document.createElement('article');card.className='private-coach-recent';
    const meta=document.createElement('strong');
    meta.textContent=date(row.match.at)+' · '+row.match.mode+' · '+result(row.match)+
     ' · '+(FOCI[row.focus]||'General note');
    const note=document.createElement('p');note.textContent=row.note||'Focus saved without a written note.';
    card.append(meta,note);recent.append(card);
   }
   if(!visible.length){
    const empty=document.createElement('p');empty.textContent=notes.length?
     'No genuine recent match reviews in this focus. Change the filter to see your other notes.':
     'Open a genuine online result above to save your first private coaching review.';
    recent.append(empty);
   }
   reviewsList.append(recent);
   limit.textContent='Only the latest '+verified.size+' receipts returned by this server can appear here. Older private notes remain in your export vault, not in these aggregates. The game will not auto-mark goals complete.';
  }
  reviewFilter.onchange=refresh;
  refresh();
  return refresh;
 }

 // Carry the player's optional self-set focus into the main Play landing page.
 // Read-only and session-bound; it neither starts a match nor marks a goal complete.
 function pinHomeGoal(){
  const home=document.getElementById('homeView');
  const hero=home?.querySelector('.hero-grid');
  if(!hero)return;
  const banner=document.createElement('aside');
  banner.className='private-coach-home';banner.hidden=true;
  banner.setAttribute('aria-label','My saved next-match focus');
  const label=document.createElement('span');label.textContent='MY PRIVATE NEXT-MATCH GOAL';
  const focus=document.createElement('strong');
  const action=document.createElement('p');
  const edit=document.createElement('button');edit.type='button';
  edit.textContent='Edit in My Games →';
  edit.addEventListener('click',()=>document.getElementById('tabReplay')?.click());
  banner.append(label,focus,action,edit);
  hero.insertAdjacentElement('afterend',banner);
  function refresh(){
   const account=typeof settings!=='undefined'?settings.account:null;
   if(!account?.token||typeof account.username!=='string'||!account.username||
      account.username.length>80){banner.hidden=true;return;}
   let plan=null;
   try{plan=readPlan(localStorage.getItem(PREFIX+
    encodeURIComponent(account.username.toLowerCase())));}catch{}
   if(!plan){banner.hidden=true;return;}
   focus.textContent=FOCI[plan.focus];
   action.textContent=plan.action;
   banner.hidden=false;
  }
  // Account sign-in/out and server-driven session invalidation call renderAccount,
  // which updates this native button; observation avoids polling during 60 Hz play.
  const accountButton=document.getElementById('accountButton');
  if(accountButton)new MutationObserver(refresh).observe(accountButton,
   {childList:true,subtree:true,characterData:true});
  window.addEventListener('storage',e=>{
   if(e.key===null||e.key.startsWith(PREFIX)||e.key==='fuckball.settings')refresh();
  });
  document.getElementById('tabHome')?.addEventListener('click',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.addEventListener('focus',refresh);
  refresh();
 }
 pinHomeGoal();
 window.FuckballPrivateMatchCoach={mount};
})();