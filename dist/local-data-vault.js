'use strict';
// Voluntary local data archives. Never read general settings, tokens or account data.
(function(){
 const profile=document.getElementById('careerProfileView');if(!profile)return;
 const make=(tag,text,klass)=>{
  const node=document.createElement(tag);
  if(text!==undefined&&text!==null)node.textContent=String(text);
  if(klass)node.className=klass;return node;
 };
 const click=(label,handler)=>{
  const b=make('button',label);b.type='button';b.addEventListener('click',handler);return b;
 };
 const SCOPES=[
  {id:'league',key:'fuckball.local-tournaments.v1',name:'Private leagues',limit:8,chars:128*1024},
  {id:'cup',key:'fuckball.private-knockout-cups.v1',name:'Private knockout cups',limit:8,chars:96*1024},
  {id:'series',key:'fuckball.private-series.v1',name:'Private best-of series',limit:12,chars:128*1024},
  {id:'attendance',key:'fuckball.private-match-attendance.v1',name:'Private match attendance',limit:200,chars:1024*1024},
  {id:'pins',key:'fuckball.pinned-public-rooms.v1',name:'Pinned public room codes',limit:12,chars:4096},
  {id:'loadouts',key:'fuckball.local-match-loadouts.v1',name:'Local match loadouts',limit:8,chars:12000},
  {id:'academy',key:'fuckball.solo-academy.v1',name:'Solo Academy progress',limit:1,chars:12000},
  {id:'gauntlet',key:'fuckball.ai-gauntlet-history.v1',name:'Completed native AI Gauntlets',limit:12,chars:24000},
  {id:'comeback',key:'fuckball.native-comeback-arena.v1',name:'Native Comeback Arena history',limit:20,chars:24000},
  {id:'goals',key:'fuckball-local-goal-rush-history-v1',name:'Native Goal Rush attempts',limit:20,chars:24000},
  {id:'teamwork',key:'fuckball.teamwork-native-drill.v1',name:'Native Teamwork kick links',limit:20,chars:24000},
  {id:'defense',key:'fuckball.clean-sheet-history.v1',name:'Native Clean Sheet attempts',limit:20,chars:24000},
  {id:'rockets',key:'fuckball.native-ball-burst-history.v1',name:'Native Rocket Kick attempts',limit:20,chars:24000},
  {id:'keepaway',key:'fuckball.native-keep-away.v1',name:'Native Keep Away kick streaks',limit:20,chars:24000},
  {id:'sudden',key:'fuckball.native-sudden-death.v1',name:'Native Sudden Death series',limit:20,chars:40000}
 ];
 const NATIVE_SCOPES=new Set(['goals','teamwork','defense','rockets','keepaway','sudden']);
 const known=new Map(SCOPES.map(scope=>[scope.id,scope]));
 const format='fuckball-local-data-vault',version=1,MAX_FILE=1536*1024;
 const itemValid=(scope,item)=>{
  if(scope.id==='pins')return typeof item==='string'&&/^[A-HJ-NP-Z2-9]{8}$/.test(item);
  if(scope.id==='loadouts')return !!item&&typeof item==='object'&&!Array.isArray(item)&&
   typeof item.name==='string'&&item.name.length>0&&item.name.length<=38&&
   item.name===item.name.trim()&&
   !/[\u0000-\u001f\u007f-\u009f]/.test(item.name)&&
   ['bot','practice','2v2','4v4'].includes(item.mode)&&
   ['easy','normal','hard','elite'].includes(item.difficulty)&&
   [0,3,5,10].includes(item.scoreLimit)&&Number.isSafeInteger(item.timeLimit)&&
   item.timeLimit>=0&&item.timeLimit<=99&&Number.isSafeInteger(item.stadium)&&
   item.stadium>=0&&item.stadium<64;
  if(scope.id==='academy')return !!item&&typeof item==='object'&&!Array.isArray(item)&&
   item.version===1&&Number.isSafeInteger(item.startedAt)&&
   item.startedAt>0&&item.startedAt<=Date.now()+86400000&&
   Number.isSafeInteger(item.next)&&item.next>=0&&item.next<=12&&
   Array.isArray(item.proofs)&&item.proofs.length===item.next&&
   (item.armedAt===null||Number.isSafeInteger(item.armedAt)&&
    item.armedAt>0&&item.armedAt<=Date.now()+86400000)&&
   item.proofs.every((proof,i)=>proof&&proof.mission===i&&
    ['touch','goals','team','match'].includes(proof.type)&&
    Number.isSafeInteger(proof.at)&&proof.at>0&&proof.at<=Date.now()+86400000&&
    Number.isSafeInteger(proof.armedAt)&&proof.armedAt>0&&proof.armedAt<proof.at);
  if(scope.id==='gauntlet'){
   const levels={standard:['easy','normal','hard'],elite:['normal','hard','elite']};
   return !!item&&item.version===1&&Object.hasOwn(levels,item.route)&&
    [60,120].includes(item.duration)&&Number.isSafeInteger(item.startedAt)&&
    Number.isSafeInteger(item.finishedAt)&&item.startedAt>0&&
    item.finishedAt>=item.startedAt&&item.finishedAt<=Date.now()+86400000&&
    item.finishedAt-item.startedAt<=30*86400000&&
    Number.isSafeInteger(item.retries)&&item.retries>=0&&item.retries<=999&&
    Array.isArray(item.wins)&&item.wins.length===3&&item.wins.every((w,i)=>
     w&&w.level===levels[item.route][i]&&w.duration===item.duration&&
     Number.isSafeInteger(w.for)&&Number.isSafeInteger(w.against)&&
     w.for>w.against&&w.against>=0&&w.for<=999&&
     Number.isSafeInteger(w.at)&&w.at>=item.startedAt&&w.at<=item.finishedAt);
  }
  if(scope.id==='comeback')return !!item&&typeof item==='object'&&
   Number.isSafeInteger(item.at)&&item.at>0&&item.at<=Date.now()+86400000&&
   [60,120,180].includes(item.duration)&&[1,2,3].includes(item.deficit)&&
   Number.isSafeInteger(item.scored)&&item.scored>=0&&item.scored<=999&&
   Number.isSafeInteger(item.conceded)&&item.conceded>=0&&item.conceded<=999&&
   Number.isSafeInteger(item.elapsed)&&item.elapsed>=item.duration&&
   item.elapsed<=item.duration+1&&typeof item.completed==='boolean'&&
   item.completed===(item.scored>item.conceded+item.deficit);
  if(NATIVE_SCOPES.has(scope.id)){
   if(!item||typeof item!=='object'||Array.isArray(item)||
    !Number.isSafeInteger(item.at)||item.at<=0||item.at>Date.now()+86400000)return false;
   const int=(v,upper)=>Number.isSafeInteger(v)&&v>=0&&v<=upper;
   if(scope.id==='goals')return [60,120,180].includes(item.duration)&&
    [1,3,5].includes(item.target)&&int(item.goals,999)&&int(item.elapsed,180)&&
    typeof item.completed==='boolean'&&item.completed===(item.goals>=item.target);
   if(scope.id==='teamwork')return [120,180,300].includes(item.seconds)&&
    [2,4,6].includes(item.target)&&int(item.links,99)&&
    int(item.attempts,9999)&&int(item.elapsed,300)&&
    typeof item.completed==='boolean'&&item.completed===(item.links>=item.target);
   if(scope.id==='defense')return [60,120,180].includes(item.duration)&&
    [0,1,2].includes(item.allowance)&&int(item.conceded,999)&&
    int(item.scored,999)&&int(item.elapsed,item.duration+1)&&
    item.elapsed>=item.duration&&typeof item.completed==='boolean'&&
    item.completed===(item.conceded<=item.allowance);
   if(scope.id==='rockets')return [60,120,180].includes(item.duration)&&
    [3,5,7].includes(item.threshold)&&[1,3,5].includes(item.target)&&
    int(item.hits,999)&&int(item.kicks,9999)&&item.kicks>=item.hits&&
    Number.isFinite(item.peak)&&item.peak>=0&&item.peak<=1000&&
    int(item.elapsed,item.duration+1)&&typeof item.completed==='boolean'&&
    item.completed===(item.hits>=item.target);
   if(scope.id==='keepaway')return [60,120,180].includes(item.duration)&&
    [3,5,8].includes(item.target)&&int(item.best,999)&&
    int(item.kicks,9999)&&item.kicks>=item.best&&int(item.breaks,9999)&&
    int(item.elapsed,item.duration+1)&&item.elapsed>=item.duration&&
    typeof item.completed==='boolean'&&item.completed===(item.best>=item.target);
   if(scope.id==='sudden'){
    if(![3,5,7].includes(item.bestOf)||![60,90,120].includes(item.duration)||
     !Array.isArray(item.rounds)||item.rounds.length<1||
     item.rounds.length>item.bestOf||!int(item.draws,7))return false;
    const couch=item.opponent==='human',first=couch?'player1':'human',
     second=couch?'player2':'ai',a=couch?item.player1:item.human,
     b=couch?item.player2:item.ai;
    if(!couch&&item.opponent!==undefined&&item.opponent!=='ai')return false;
    if(!int(a,7)||!int(b,7)||a+b+item.draws!==item.rounds.length||
     !item.rounds.every(r=>r&&[first,second,'draw'].includes(r.winner)&&
      int(r.frames,item.duration*60+120))||
     item.rounds.filter(r=>r.winner===first).length!==a||
     item.rounds.filter(r=>r.winner===second).length!==b||
     item.rounds.filter(r=>r.winner==='draw').length!==item.draws)return false;
    return item.winner===(a>b?first:b>a?second:'draw')&&
     (item.rounds.length===item.bestOf||
      a>=Math.floor(item.bestOf/2)+1||
      b>=Math.floor(item.bestOf/2)+1);
   }
  }
  if(scope.id==='attendance')return !!item&&typeof item==='object'&&
   typeof item.key==='string'&&Array.isArray(item.people)&&item.people.length<=24;
  return !!item&&typeof item==='object'&&!Array.isArray(item)&&item.version===1&&
   typeof item.id==='string'&&/^[a-f0-9-]{16,50}$/i.test(item.id)&&
   typeof item.name==='string'&&item.name.length>0&&item.name.length<=60;
 };
 function validate(scope,items){
  if(!Array.isArray(items)||items.length>scope.limit||!items.every(item=>itemValid(scope,item)))
   throw Error(scope.name+': unexpected source data. Use the original editor for recovery.');
  if(JSON.stringify(items).length>scope.chars)
   throw Error(scope.name+': source exceeds the supported size.');
  const ids=items.map((item,index)=>NATIVE_SCOPES.has(scope.id)?'local-'+index:
   scope.id==='pins'?item:
   scope.id==='attendance'?item.key:
    scope.id==='loadouts'?item.name.toLocaleLowerCase():
   scope.id==='gauntlet'?item.startedAt+':'+item.finishedAt+':'+item.route:
   scope.id==='comeback'?item.at+':'+item.deficit+':'+item.duration:
     scope.id==='academy'?'solo-academy':item.id);
  if(new Set(ids).size!==ids.length)throw Error(scope.name+': duplicate records.');
  return items;
 }
 function read(scope){
  const raw=localStorage.getItem(scope.key);
  if(raw===null)return [];
  if(raw.length>scope.chars)throw Error(scope.name+': saved data too large.');
  const parsed=JSON.parse(raw);
  return validate(scope,scope.id==='attendance'?
   (parsed?.version===1&&Array.isArray(parsed.entries)?parsed.entries:null):
   scope.id==='loadouts'?
    (parsed?.version===1&&Array.isArray(parsed.presets)?parsed.presets:null):
   scope.id==='academy'?[parsed]:parsed);
 }
 function save(name,payload){
  const json=typeof payload==='string'?payload:JSON.stringify(payload,null,2);
  const url=URL.createObjectURL(new Blob([json],{type:'application/json;charset=utf-8'}));
  const link=make('a');link.href=url;link.download=name;
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 const panel=make('section',null,'local-vault');
 panel.setAttribute('aria-label','Device-local data vault');
 const title=make('h2','MY LOCAL DATA VAULT.');
 const intro=make('p','Review and archive private competitions, match attendance, saved public room codes and native solo training progress and loadouts on this device. These are NOT your online account, HBR2 replay files or authenticated match results.');
 const warning=make('p','Exports can reveal private friend names, schedules, notes and bookmarked room codes. Keep downloaded files private. All native AI drill and series proof summaries are reference-only; importing archives cannot award progression or verified results. No data is uploaded or deleted by this vault.','local-vault-warning');
 const top=make('div',null,'local-vault-actions');
 const downloadAll=click('↓ Export selected archive',()=>downloadArchive());
 const browse=click('Browse native backup files',()=>{
  try{showArchive(archive().datasets.map(dataset=>({
   scope:known.get(dataset.scope),items:dataset.items
  })));
   message.textContent='Select an individual native-format backup. No local records were altered.';
  }catch(e){message.textContent=e.message||'Private data unavailable.';}
 });
 const refresh=click('↻ Refresh local inventory',()=>renderOwn());
 const upload=make('input');upload.type='file';upload.accept='.json,application/json';upload.hidden=true;
 upload.setAttribute('aria-label','Import vault archive for inspection');
 const importButton=click('↑ Open archive for extraction',()=>upload.click());
 top.append(downloadAll,browse,importButton,refresh,upload);
 const allScopes=make('div',null,'local-vault-categories');
 const extractSection=make('section',null,'local-vault-extraction');
 extractSection.hidden=true;extractSection.append(make('h3','ARCHIVE CONTENTS (NOT RESTORED)'));
 const extractInfo=make('p');
 const extractList=make('div',null,'local-vault-extract-list');
 extractSection.append(extractInfo,extractList);
 const message=make('p',null,'local-vault-message');
 message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 panel.append(title,intro,warning,top,allScopes,extractSection,message);
 profile.insertBefore(panel,profile.querySelector('.career-profile-footnote'));
 const checks=new Map();
 for(const scope of SCOPES){
  const row=make('article',null,'local-vault-category');
  const check=make('input');check.type='checkbox';check.checked=true;
  check.setAttribute('aria-label','Include '+scope.name+' in archive');
  const text=make('div');const label=make('strong',scope.name);
  const detail=make('span');detail.setAttribute('aria-live','polite');
  text.append(label,detail);row.append(check,text);allScopes.append(row);
  checks.set(scope.id,{check,detail});
 }
 function renderOwn(){
  let readable=0,problems=0;
  for(const scope of SCOPES){
   const {check,detail}=checks.get(scope.id);
   try{
    const items=read(scope);
    detail.textContent=items.length+' record'+(items.length===1?'':'s')+
     ' · up to '+Math.round(scope.chars/1024)+' KiB per category';
    check.disabled=false;readable++;
   }catch{
    detail.textContent='Unreadable private data · excluded from archive, not overwritten.';
    check.checked=false;check.disabled=true;problems++;
   }
  }
  downloadAll.disabled=browse.disabled=readable===0;
  message.textContent=(problems?problems+' category read failure(s). ':'')+
   'Only the '+SCOPES.length+' explicitly listed browser keys are inspected. Your account credentials and IndexedDB replays are never included.';
 }
 function archive(){
  const selected=SCOPES.filter(scope=>checks.get(scope.id).check.checked);
  if(!selected.length)throw Error('Choose at least one local data category.');
  const datasets=selected.map(scope=>({scope:scope.id,items:read(scope)}));
  const packed={format,version,createdAt:new Date().toISOString(),datasets,
   note:'Private device-local data and native-only training observations. Extraction never restores data or awards wins.'};
  if(JSON.stringify(packed).length>MAX_FILE)throw Error('Archive exceeds 1.5 MiB. Export fewer categories.');
  return packed;
 }
 function downloadArchive(){
  try{
   const packed=archive();
   if(!confirm('Download '+packed.datasets.length+
    ' selected private data categories? The JSON may include friend names, locations and notes.'))return;
   save('fuckball-private-data-vault-'+new Date().toISOString().slice(0,10)+'.json',packed);
   message.textContent='Private device archive downloaded. It is not an online-account export or a one-click restore.';
  }catch(e){message.textContent=e.message||'Archive unavailable.';}
 }
 function unpack(value){
  if(!value||value.format!==format||value.version!==version||
    !Array.isArray(value.datasets)||value.datasets.length>SCOPES.length)
   throw Error('Unsupported private data archive.');
  const used=new Set(),datasets=[];
  for(const record of value.datasets){
   const scope=known.get(record?.scope);
   if(!scope||used.has(scope.id))throw Error('Unknown or repeated archive category.');
   used.add(scope.id);validate(scope,record.items);
   datasets.push({scope,items:record.items});
  }
  return datasets;
 }
 function exportItem(scope,item){
  switch(scope.id){
  case 'league':return {...item,exportedAt:Date.now(),
   notice:'Unofficial manual friendly results; no server verification'};
  case 'cup':return {...item,note:'Manual, unverified friendly results'};
  default:return item;
  }
 }
 function showArchive(datasets){
  extractList.replaceChildren();
  extractInfo.textContent='Preview only: '+datasets.length+
   ' categories. Nothing has been written to browser storage. Download individual native-format files where supported. All native practice summaries are read-only and cannot restore earned milestones or competitive results.';
  for(const {scope,items}of datasets){
   const group=make('div',null,'local-vault-extract-group');
   group.append(make('strong',scope.name+' · '+items.length+' records'));
   const actions=make('div',null,'local-vault-extract-actions');
   if(scope.id==='league'||scope.id==='cup'){
    for(const [i,item] of items.entries()){
     const name=(typeof item.name==='string'?item.name:'item')
      .toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,32)||'item';
     actions.append(click('↓ '+(item.name||'Private item'),()=>{
      save('fuckball-'+scope.id+'-'+name+'-'+(i+1)+'.json',exportItem(scope,item));
      message.textContent='Individual '+scope.name+' backup downloaded. Restore only through the matching original editor.';
     }));
    }
   }else if(scope.id==='series'){
    actions.append(click('↓ Best-of series backup',()=>save('fuckball-private-series.json',
     {format:'fuckball-private-series',version:1,exportedAt:Date.now(),series:items})));
   }else if(scope.id==='attendance'){
    actions.append(click('↓ Attendance backup',()=>save('fuckball-private-attendance.json',
     {version:1,entries:items})));
   }else if(scope.id==='pins'){
    actions.append(click('↓ Public bookmarks backup',()=>save('fuckball-public-room-bookmarks.json',
     {format:'fuckball-public-room-bookmarks',version:1,exportedAt:new Date().toISOString(),rooms:items})));
   }else if(scope.id==='loadouts'){
    actions.append(click('↓ Native local match loadouts',()=>save('fuckball-local-match-loadouts.json',
     {format:'fuckball-local-match-loadouts',version:1,source:'private-device-only',
      exportedAt:new Date().toISOString(),presets:items})));
   }else if(NATIVE_SCOPES.has(scope.id)){
    if(items.length)actions.append(click('↓ '+scope.name+' (read-only)',()=>{
     save('fuckball-native-'+scope.id+'-practice-history.json',{
      format:'fuckball-native-local-'+scope.id,version:1,
      source:'device-only native practice observations',
      disclaimer:'Not server-verified match results, rankings or transferable achievements.',
      exportedAt:new Date().toISOString(),attempts:items
     });
     message.textContent='Private '+scope.name+' proof saved. No milestones or match results restored.';
    }));
   }else if(scope.id==='comeback'){
    actions.append(click('↓ Comeback Arena native training history (read-only)',()=>{
     save('fuckball-comeback-arena-proof.json',{
      format:'fuckball-native-comeback-arena',version:1,
      source:'private device-only native score and virtual practice deficit',
      warning:'Adjusted score is not a real native match score or ranked result.',
      exportedAt:new Date().toISOString(),attempts:items
     });
     message.textContent='Local native Comeback Arena summary saved. Archive import cannot award a comeback.';
    }));
   }else if(scope.id==='gauntlet'){
    actions.append(click('↓ Native AI Gauntlet history (read-only proof)',()=>{
     save('fuckball-local-ai-gauntlet-proof.json',{
      format:'fuckball-native-local-ai-gauntlet',version:1,
      source:'private device-local native match observations, not verified or ranked',
      exportedAt:new Date().toISOString(),ladders:items
     });
     message.textContent='Local AI Gauntlet history downloaded. Opening an archive never credits wins or changes active ladders.';
    }));
   }else if(scope.id==='academy'){
    const progress=items[0];
    if(progress)actions.append(click('↓ Academy progress proof summary (read-only)',()=>{
     save('fuckball-solo-academy-progress.json',{
      format:'fuckball-solo-academy',version:1,exportedAt:new Date().toISOString(),
      source:'local recorded drill evidence; non-ranked and not server-verified',
      completed:progress.next,startedAt:progress.startedAt,
      proofs:progress.proofs.map((proof,i)=>({mission:i+1,
       completedAt:new Date(proof.at).toISOString(),kind:proof.type}))
     });
     message.textContent='Academy proof summary downloaded for reference. It cannot be restored as completed missions on another device.';
    }));
   }
   if(!actions.children.length)actions.append(make('p','No records in this category.'));
   group.append(actions);extractList.append(group);
  }
  extractSection.hidden=false;
 }
 upload.addEventListener('change',async()=>{
  const file=upload.files?.[0];upload.value='';
  if(!file)return;
  if(file.size>MAX_FILE||file.size===0){
   message.textContent='Choose a private vault JSON archive up to 1.5 MiB.';return;
  }
  try{
   const datasets=unpack(JSON.parse(await file.text()));
   showArchive(datasets);
   message.textContent='Private archive opened in memory only; choose which original backup files to extract.';
  }catch(e){
   extractSection.hidden=true;extractList.replaceChildren();
   message.textContent='Archive refused without writing browser data: '+(e.message||'invalid file');
  }
 });
 window.addEventListener('storage',event=>{
  if(SCOPES.some(scope=>scope.key===event.key)||event.key===null)renderOwn();
 });
 document.querySelector('.career-profile-open')?.addEventListener('click',renderOwn);
 renderOwn();
})();
