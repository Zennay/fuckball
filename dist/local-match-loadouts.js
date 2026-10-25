'use strict';
// Local practice setup recipes; the original quickPlay owns all game/session gates.
(function(){
 const home=document.getElementById('homeView');
 const nativeStadium=document.getElementById('stadium');
 if(!home||!nativeStadium)return;
 const KEY='fuckball.local-match-loadouts.v1',LIMIT=8,MAX_BYTES=12000;
 const modes=[['bot','1v1 · human vs AI'],['practice','Solo practice'],['2v2','2v2 practice'],['4v4','4v4 practice']];
 const difficulties=['easy','normal','hard','elite'],scores=[0,3,5,10];
 const nativeMaps=[...nativeStadium.options].filter(o=>/^\d+$/.test(o.value))
  .map(o=>({id:Number(o.value),name:o.textContent})).filter(o=>Number.isSafeInteger(o.id)&&o.id>=0&&o.id<64);
 if(!nativeMaps.length)return;
 const newNode=(tag,text,klass)=>{
  const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);
  if(klass)n.className=klass;return n;
 };
 const btn=(label,cb)=>{
  const n=newNode('button',label);n.type='button';n.onclick=cb;return n;
 };
 const validName=s=>typeof s==='string'&&s.trim()===s&&s.length>=1&&s.length<=38&&
  !/[\u0000-\u001f\u007f-\u009f]/.test(s);
 const validate=raw=>{
  if(!raw||raw.version!==1||!Array.isArray(raw.presets)||raw.presets.length>LIMIT)
   throw Error('Invalid local match preset collection.');
  const names=new Set();
  return raw.presets.map(x=>{
   if(!x||!validName(x.name)||!modes.some(m=>m[0]===x.mode)||
    !difficulties.includes(x.difficulty)||!scores.includes(x.scoreLimit)||
    !Number.isSafeInteger(x.timeLimit)||x.timeLimit<0||x.timeLimit>99||
    !nativeMaps.some(s=>s.id===x.stadium))
    throw Error('Preset has unsupported match controls or stadium.');
   const name=x.name.toLocaleLowerCase();
   if(names.has(name))throw Error('Preset names must be unique.');names.add(name);
   return {name:x.name,mode:x.mode,difficulty:x.difficulty,
    scoreLimit:x.scoreLimit,timeLimit:x.timeLimit,stadium:x.stadium};
  });
 };
 let snapshot=null,rows=[],healthy=true;
 // An array index is not an identity: another tab may reorder, rename or
 // delete a loadout while the first tab is editing it.
 let selectedName=null,selectionNeedsReview=false;
 function refreshStored(){
  try{
   const raw=localStorage.getItem(KEY);snapshot=raw;
   rows=raw===null?[]:validate(JSON.parse(raw));
   healthy=true;
  }catch{healthy=false;rows=[];}
 }
 refreshStored();
 function write(next,selection=selectedName){
  if(!healthy)throw Error('Stored presets could not be read. They were not overwritten.');
  const payload={version:1,presets:next};
  const raw=JSON.stringify(payload);
  if(raw.length>MAX_BYTES)throw Error('Preset collection is too large.');
  if(localStorage.getItem(KEY)!==snapshot){
   // Never keep a numeric selection across an external replacement: index 2
   // might now be a completely different teammate's practice preset.
   selectedName=null;selectionNeedsReview=true;
   refreshStored();render();
   throw Error('Another tab changed your saved presets. No preset was overwritten. Choose the latest saved loadout again.');
  }
  localStorage.setItem(KEY,raw);
  snapshot=raw;rows=next;selectedName=selection;
  selectionNeedsReview=false;render();
 }
 const root=newNode('section',null,'local-match-loadouts');
 root.setAttribute('aria-label','Private local match loadouts');
 const header=newNode('div',null,'local-match-loadouts-head');
 const headline=newNode('div');
 headline.append(newNode('h2','LOCAL MATCH LOADOUTS.'),newNode('p',
  'Save complete solo-vs-AI practice setups: team size, opponent difficulty, match duration, score limit and native stadium. Start only when you choose. No online rooms, AI policy or physics changes.'));
 const meta=newNode('span','0 / 8 SAVED','local-loadouts-count');
 header.append(headline,meta);
 const fields=newNode('div',null,'local-loadouts-fields');
 const name=newNode('input');name.maxLength=38;name.required=true;name.placeholder='e.g. 4v4 hard scrimmage';
 const mode=newNode('select'),difficulty=newNode('select'),score=newNode('select'),
  time=newNode('input'),map=newNode('select');
 const picker=newNode('select');picker.setAttribute('aria-label','Load saved local match setup');
 const selected=newNode('label','Saved loadout');selected.append(picker);
 for(const [value,label] of modes){const o=new Option(label,value);mode.add(o);}
 for(const value of difficulties)difficulty.add(new Option(value[0].toUpperCase()+value.slice(1),value));
 for(const value of scores)score.add(new Option(value===0?'No score limit':value+' goals',String(value)));
 for(const m of nativeMaps)map.add(new Option(m.name,String(m.id)));
 time.type='number';time.inputMode='numeric';time.min='0';time.max='99';time.step='1';time.value='7';
 function field(text,control){
  const label=newNode('label',text);label.append(control);fields.append(label);return label;
 }
 fields.append(selected);
 field('Loadout name',name);field('Offline match type',mode);field('AI difficulty',difficulty);
 field('Score limit',score);field('Time limit in minutes · 0 = none',time);
 field('Native stadium',map);
 const actions=newNode('div',null,'local-loadouts-actions');
 const play=btn('▶ Play local match with these settings',launch);
 const save=btn('＋ Save as new',saveNew);
 const update=btn('Save changes to selected',saveExisting);
 const remove=btn('Delete selected',removeSelected);
 const exportBtn=btn('↓ Backup my loadouts',backup);
 const importBtn=btn('↑ Restore loadouts',()=>upload.click());
 const upload=newNode('input');upload.type='file';upload.accept='.json,application/json';
 upload.hidden=true;upload.setAttribute('aria-label','Restore private local match loadout backup');
 actions.append(play,save,update,remove,exportBtn,importBtn,upload);
 const note=newNode('p','All saved loadouts are private device settings, not live room presets. Starting a loadout uses the original local game and asks before replacing a current local match or replay. Imported stadium files are not included.');
 const status=newNode('p',null,'local-loadouts-status');status.setAttribute('role','status');
 status.setAttribute('aria-live','polite');
 root.append(header,fields,actions,note,status);
 const after=home.querySelector('.practice-lab')||home.querySelector('.mode-cards');
 if(after)after.insertAdjacentElement('afterend',root);else home.append(root);
 function chosenIndex(){
  if(picker.value==='')return null;
  const index=Number(picker.value);
  return Number.isSafeInteger(index)&&index>=0&&index<rows.length?index:null;
 }
 function selectedIndex(){
  const index=chosenIndex();
  if(index===null||selectionNeedsReview||!selectedName||
     rows[index].name.toLocaleLowerCase()!==selectedName)return null;
  return index;
 }
 function requireSelection(){
  const i=selectedIndex();
  if(i===null)throw Error('Choose a saved loadout from the latest list before changing or deleting it.');
  return i;
 }
 function readForm(){
  const draft={name:name.value.trim(),mode:mode.value,difficulty:difficulty.value,
   scoreLimit:Number(score.value),timeLimit:Number(time.value),stadium:Number(map.value)};
  validate({version:1,presets:[draft]});
  return draft;
 }
 function fill(p){
  name.value=p.name;mode.value=p.mode;difficulty.value=p.difficulty;
  score.value=String(p.scoreLimit);time.value=String(p.timeLimit);map.value=String(p.stadium);
 }
 function render(){
  // Bind selection by normalized NAME rather than stale list position.
  // Cross-tab changes intentionally disarm the selection until the human
  // explicitly chooses a current entry in the refreshed list.
  const current=!selectionNeedsReview&&selectedName?
   rows.findIndex(row=>row.name.toLocaleLowerCase()===selectedName):-1;
  picker.replaceChildren(new Option('Choose a saved loadout',''));
  rows.forEach((row,i)=>picker.add(new Option(row.name,String(i))));
  picker.value=current>=0?String(current):'';
  if(current<0)selectedName=null;
  meta.textContent=rows.length+' / '+LIMIT+' SAVED';
  picker.disabled=remove.disabled=update.disabled=!healthy||!rows.length;
  save.disabled=!healthy||rows.length>=LIMIT;
  exportBtn.disabled=!healthy||!rows.length;
  if(!healthy){
   status.textContent='Existing local match presets are unreadable. Storage was not overwritten. Restore the damaged data manually before saving.';
  }
 }
 picker.onchange=()=>{
  const index=chosenIndex();
  selectedName=index===null?null:rows[index].name.toLocaleLowerCase();
  selectionNeedsReview=false;
  if(index!==null){
   fill(rows[index]);
   status.textContent='Selected '+rows[index].name+' from the current saved list. No game started.';
  }else status.textContent='Choose a saved loadout before editing or deleting it.';
 };
 function saveNew(){
  try{
   const item=readForm();
   if(rows.length>=LIMIT)throw Error('Eight local loadouts is the maximum.');
   if(rows.some(x=>x.name.toLocaleLowerCase()===item.name.toLocaleLowerCase()))
    throw Error('A loadout with this name already exists; select it to update.');
   write([...rows,item],item.name.toLocaleLowerCase());
   status.textContent='New local loadout saved. It will only start when you click Play.';
  }catch(e){status.textContent=e.message||'Could not save loadout.';}
 }
 function saveExisting(){
  try{
   const i=requireSelection();
   const item=readForm();
   if(rows.some((x,n)=>n!==i&&x.name.toLocaleLowerCase()===item.name.toLocaleLowerCase()))
    throw Error('Another saved loadout already uses that name.');
   write(rows.map((x,n)=>n===i?item:x),item.name.toLocaleLowerCase());
   status.textContent='Saved changes to the selected local loadout.';
  }catch(e){status.textContent=e.message||'Loadout not updated.';}
 }
 function removeSelected(){
  try{
   const i=requireSelection();
   if(!confirm('Remove saved local loadout "'+rows[i].name+'"? Your native practice results and matches will remain unchanged.'))return;
   write(rows.filter((_,n)=>n!==i),'');status.textContent='Only the selected loadout was deleted. Choose another before editing.';
  }catch(e){status.textContent=e.message||'Loadout not deleted.';}
 }
 function launch(){
  let draft;
  try{draft=readForm();}catch(e){status.textContent=e.message||'Invalid loadout.';return;}
  if(typeof quickPlay!=='function'||typeof pendingSessionBlock!=='function'){
   status.textContent='The native practice launcher is unavailable.';return;
  }
  const block=pendingSessionBlock();
  if(block){status.textContent=block;return;}
  if((started||replay)&&!confirm('Replace your current solo match or replay with "'+draft.name+
   '"? Unsaved local gameplay or recordings could be lost.'))return;
  const target=defaults?.[draft.stadium];
  if(!target||nativeStadium.querySelector('option[value="'+draft.stadium+'"]')===null){
   status.textContent='This stadium is unavailable. Select another native stadium.';return;
  }
  const goals=document.getElementById('scoreLimit'),
   minutes=document.getElementById('timeLimit'),
   difficultyControl=document.getElementById('botDifficulty'),
   stadiumLabel=document.getElementById('stadiumLabel'),
   nativeMode=document.getElementById('mode');
  if(!goals||!minutes||!difficultyControl||!stadiumLabel||!nativeMode){
   status.textContent='Native match controls are unavailable. Your settings were not changed.';return;
  }
  // The native launcher snapshots these controls synchronously into the
  // offline room. Preserve their previous values if its own session gate
  // rejects kickoff, and do not persist a rejected loadout to player prefs.
  const previous={
   stadiumValue:nativeStadium.value,stadium,stadiumLabel:stadiumLabel.textContent,
   goals:goals.value,minutes:minutes.value,difficultyControl:difficultyControl.value,
   difficulty:settings.difficulty,botLevels:settings.botLevels,timeLimit:settings.timeLimit,
   mode:nativeMode.value
  };
  const restore=()=>{
   nativeStadium.value=previous.stadiumValue;stadium=previous.stadium;
   stadiumLabel.textContent=previous.stadiumLabel;
   goals.value=previous.goals;minutes.value=previous.minutes;
   difficultyControl.value=previous.difficultyControl;
   settings.difficulty=previous.difficulty;settings.botLevels=previous.botLevels;
   settings.timeLimit=previous.timeLimit;
   // A failed native reset can change quickPlay's mode select before kickoff.
   // Restore only the UI choice when there is no active match to mislabel;
   // never claim to resurrect a prior native room or its roster.
   if(!started&&!serverLink&&!peerConnected&&!replay)nativeMode.value=previous.mode;
  };
  const recoverHome=()=>{
   // Keep failed local launches actionable, never strand the player on a
   // Play screen without a running game. This is not a match rollback.
   if(!started&&!serverLink&&!peerConnected&&!replay&&typeof showView==='function'){
    try{showView('home');}catch{}
   }
  };
  let launched=false,kickoffObserved=false;
  const observeKickoff=()=>{kickoffObserved=true;};
  window.addEventListener('fuckball:local-match-kickoff',observeKickoff);
  try{
   // The original native launcher enforces authority once more. Never fire
   // change handlers or create our own physics/game instance.
   nativeStadium.value=String(draft.stadium);stadium=target;
   stadiumLabel.textContent=target.name.toUpperCase();
   goals.value=String(draft.scoreLimit);minutes.value=String(draft.timeLimit);
   difficultyControl.value=draft.difficulty;
   settings.difficulty=draft.difficulty;settings.botLevels={};settings.timeLimit=draft.timeLimit;
   launched=quickPlay(draft.mode,true);
  }catch(error){
   if(kickoffObserved&&!serverLink&&!peerConnected&&!replay&&started){
    try{startStop();}catch{}
   }
   restore();
   recoverHome();
   status.textContent='Native kickoff failed. Preferences restored; check the current match before restarting.';
   return;
  }finally{
   window.removeEventListener('fuckball:local-match-kickoff',observeKickoff);
  }
  if(!launched||!kickoffObserved){
   if(kickoffObserved&&!serverLink&&!peerConnected&&!replay&&started){
    try{startStop();}catch{}
   }
   restore();
   recoverHome();
   status.textContent='Native game rejected the session. Original match settings restored.';
   return;
  }
  try{savePrefs();}
  catch{
   status.textContent='Native '+draft.mode+' practice started with "'+draft.name+
    '", but its settings could not be saved for next time.';return;
  }
  status.textContent='Native '+draft.mode+' practice started with "'+draft.name+'". No online server joined.';
 }
 function download(payload,filename){
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}));
  const link=newNode('a');link.href=url;link.download=filename;
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 function backup(){
  if(!healthy||!rows.length)return;
  download({format:'fuckball-local-match-loadouts',version:1,source:'private-device-only',
   exportedAt:new Date().toISOString(),presets:rows},
  'fuckball-local-match-loadouts-'+new Date().toISOString().slice(0,10)+'.json');
  status.textContent='Loadout backup saved. It contains only local configuration, no user account or server data.';
 }
 upload.onchange=async()=>{
  const file=upload.files?.[0];upload.value='';if(!file)return;
  if(file.size<=0||file.size>MAX_BYTES){status.textContent='Choose a loadout JSON file no larger than 12 KB.';return;}
  try{
   const parsed=JSON.parse(await file.text());
   if(parsed?.format!=='fuckball-local-match-loadouts'||parsed.version!==1||
    parsed.source!=='private-device-only')throw Error('Unsupported local match loadout backup.');
   const incoming=validate({version:1,presets:parsed.presets});
   if(!confirm('Replace '+rows.length+' saved local match loadouts with '+
    incoming.length+' from this device backup? No real matches or practice history will change.'))return;
   write(incoming,'');status.textContent='Restored '+incoming.length+' private match loadouts. Choose an entry to edit it.';
  }catch(e){status.textContent='Restore refused: '+(e.message||'Unsupported data');}
 };
 window.addEventListener('storage',e=>{
  if(e.key!==KEY&&e.key!==null)return;
  selectedName=null;selectionNeedsReview=true;
  refreshStored();render();
  status.textContent='Another tab changed your saved loadouts. The previous selection is cleared so editing cannot overwrite a different preset. Choose the latest entry again.';
 });
 fill({name:'My solo match',mode:'bot',difficulty:'hard',scoreLimit:3,timeLimit:7,stadium:nativeMaps[0].id});
 render();
})();
