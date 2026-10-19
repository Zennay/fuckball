'use strict';
// Player-authored local challenge presets, never authority over matches/results.
(function(){
 const host=document.querySelector('.practice-lab-content');
 if(!host)return;
 const KEY='fuckball.practice-challenge-exchange.v1',MAX=16,HASH='#practice-challenge=';
 const MODES={
  goals:{name:'Goal Rush',tab:'goals',selector:'.goal-rush-setup',fields:[
   ['duration','Drill length',[60,120,180]],['target','Goals to score',[1,3,5]]]},
  team:{name:'Teamwork',tab:'team',selector:'.teamwork-panel',fields:[
   ['duration','Active time',[120,180,300]],['target','Teammate links',[2,4,6]]]},
  defense:{name:'Clean Sheet',tab:'defense',selector:'.clean-sheet-setup',fields:[
   ['duration','Active time',[60,120,180]],['allowance','Max goals conceded',[0,1,2]]]},
  rockets:{name:'Rocket Kick',tab:'rockets',selector:'.native-ball-burst',fields:[
   ['duration','Active time',[60,120,180]],['threshold','Minimum speed (raw engine units)',[3,5,7]],['target','Qualifying kicks',[1,3,5]]]},
  comeback:{name:'Comeback Arena',tab:'comeback',selector:'.comeback-arena',fields:[
   ['deficit','Virtual goal deficit',[1,2,3]],['duration','Active time',[60,120,180]]]}
 };
 const available=Object.keys(MODES).filter(k=>document.querySelector(MODES[k].selector));
 if(!available.length)return;
 const make=(tag,content,klass)=>{const e=document.createElement(tag);
  if(content!==undefined&&content!==null)e.textContent=String(content);
  if(klass)e.className=klass;return e;};
 function normalize(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.version!==1||
   typeof raw.mode!=='string'||!available.includes(raw.mode)||
   typeof raw.name!=='string'||raw.name.trim().length<1||raw.name.trim().length>48||
   /[\u0000-\u001f\u007f]/u.test(raw.name)||!raw.options||typeof raw.options!=='object'||Array.isArray(raw.options))
   throw Error('Invalid or unsupported local practice challenge.');
  const def=MODES[raw.mode],options={};
  const names=def.fields.map(f=>f[0]);
  if(Object.keys(raw.options).length!==names.length||
   Object.keys(raw.options).some(n=>!names.includes(n)))
   throw Error('The challenge has unsupported options.');
  for(const [key,,choices] of def.fields){
   if(!choices.includes(raw.options[key]))throw Error('The challenge has an invalid '+key+'.');
   options[key]=raw.options[key];
  }
  return{version:1,mode:raw.mode,name:raw.name.trim(),options};
 }
 function record(){const def=MODES[mode.value];const options={};
  for(const [key] of def.fields)options[key]=Number(inputs.get(key).value);
  return normalize({version:1,mode:mode.value,name:name.value,options});}
 function storeList(){
  try{const raw=JSON.parse(localStorage.getItem(KEY)||'null');
   if(!raw||raw.version!==1||!Array.isArray(raw.items)||raw.items.length>MAX)return[];
   return raw.items.map(normalize);
  }catch{return[];}
 }
 function store(items){
  try{localStorage.setItem(KEY,JSON.stringify({version:1,items:items.map(normalize).slice(0,MAX)}));return true;}
  catch{return false;}
 }
 function link(item){
  // Never leak a room invite, recovery ticket or other query into a share URL.
  const url=new URL(window.location.pathname,window.location.origin);
  url.hash=HASH.slice(1)+encodeURIComponent(JSON.stringify(normalize(item)));
  return url.href;
 }
 function parseShare(text){
  if(typeof text!=='string'||text.length>2500)throw Error('Challenge link or JSON is too large.');
  const value=text.trim();let data=value;
  if(value.startsWith('http://')||value.startsWith('https://')){
   const url=new URL(value);
   if(url.origin!==location.origin||url.pathname!==location.pathname)
    throw Error('This is not a challenge link for this game.');
   if(!url.hash.startsWith(HASH))throw Error('No challenge is included in this link.');
   data=decodeURIComponent(url.hash.slice(HASH.length));
  }else if(value.startsWith(HASH))data=decodeURIComponent(value.slice(HASH.length));
  else if(value.startsWith(HASH.slice(1)))data=decodeURIComponent(value.slice(HASH.length-1));
  const raw=JSON.parse(data);
  return normalize(raw?.format==='fuckball-practice-challenge'&&raw.challenge?raw.challenge:raw);
 }
 const root=make('details',null,'challenge-exchange');
 root.setAttribute('aria-label','Offline practice challenge exchange');
 const summary=make('summary','CHALLENGE EXCHANGE · CREATE & SHARE LOCAL DRILLS');
 const intro=make('p','Set a real offline drill, save a preset on this device, or send its options as a link. Opening a shared challenge never starts a game or imports results. No accounts, ratings or server data are shared.');
 const fields=make('div',null,'challenge-exchange-fields');
 const nameLabel=make('label','Challenge title'),name=make('input');
 name.type='text';name.maxLength=48;name.required=true;name.value='My practice challenge';
 name.autocomplete='off';nameLabel.append(name);
 const modeLabel=make('label','Native offline drill'),mode=make('select');
 for(const id of available)mode.add(new Option(MODES[id].name,id));
 modeLabel.append(mode);
 const options=make('div',null,'challenge-exchange-options');
 fields.append(nameLabel,modeLabel,options);
 const actions=make('div',null,'challenge-exchange-actions');
 const save=make('button','Save on this device'),copy=make('button','Copy challenge link');
 const apply=make('button','Set up this drill');apply.className='primary';
 for(const b of [save,copy,apply])b.type='button';
 actions.append(apply,save,copy);
 const msg=make('p','No multiplayer or rankings are changed.','challenge-exchange-status');
 msg.setAttribute('role','status');msg.setAttribute('aria-live','polite');
 const incoming=make('section',null,'challenge-exchange-incoming');
 incoming.append(make('h3','OPEN A SHARED CHALLENGE'));
 const paste=make('textarea');paste.rows=2;paste.maxLength=2500;paste.placeholder='Paste a Fuckball challenge URL or challenge JSON';paste.setAttribute('aria-label','Challenge link or JSON');
 const inspect=make('button','Preview challenge');inspect.type='button';
 const pending=make('div',null,'challenge-exchange-preview');pending.hidden=true;
 incoming.append(paste,inspect,pending);
 const saved=make('section',null,'challenge-exchange-saved');
 saved.append(make('h3','MY SAVED CHALLENGES'));
 const list=make('div',null,'challenge-exchange-list');saved.append(list);
 const transfers=make('div',null,'challenge-exchange-actions');
 const download=make('button','Download my challenge pack'),upload=make('button','Import challenge pack');
 download.type=upload.type='button';
 const fileInput=make('input');fileInput.type='file';fileInput.accept='.json,application/json';fileInput.hidden=true;
 fileInput.setAttribute('aria-label','Import saved offline practice challenge pack');
 transfers.append(download,upload,fileInput);saved.append(transfers);
 root.append(summary,intro,fields,actions,msg,incoming,saved);
 host.prepend(root);
 let inputs=new Map(),preview=null;
 function setMsg(t){msg.textContent=t;}
 function rebuild(){
  options.replaceChildren();inputs=new Map();
  for(const [key,label,choices] of MODES[mode.value].fields){
   const wrap=make('label',label),select=make('select');
   select.setAttribute('aria-label','Challenge '+label);
   for(const choice of choices)select.add(new Option(String(choice),String(choice)));
   if(key==='duration'&&choices.includes(120))select.value='120';
   wrap.append(select);options.append(wrap);inputs.set(key,select);
  }
 }
 mode.addEventListener('change',rebuild);rebuild();
 function display(item){
  name.value=item.name;mode.value=item.mode;rebuild();
  for(const [key,val] of Object.entries(item.options))inputs.get(key).value=String(val);
  root.open=true;root.scrollIntoView({block:'nearest',behavior:'auto'});
 }
 function setUp(item){
  item=normalize(item);
  const def=MODES[item.mode],card=document.querySelector(def.selector);
  const nativeFields=card?.querySelectorAll('label select');
  if(!card||!nativeFields||nativeFields.length<def.fields.length){
   setMsg('This local drill is unavailable. No match was started.');return;
  }
  for(const [index,[key]] of def.fields.entries()){
   const select=nativeFields[index];
   if(![...select.options].some(o=>o.value===String(item.options[key]))){
    setMsg('This drill has changed its available options. No match was started.');return;
   }
  }
  for(const [index,[key]] of def.fields.entries()){
   const select=nativeFields[index];select.value=String(item.options[key]);
   select.dispatchEvent(new Event('change',{bubbles:true}));
  }
  const disclosure=document.querySelector('.practice-lab-disclosure');
  if(disclosure)disclosure.open=true;
  const tab=document.getElementById('practice-lab-tab-'+def.tab);
  if(tab)tab.click();
  card.scrollIntoView({block:'nearest',behavior:'auto'});
  const button=card.querySelector('button.primary');
  if(button)button.focus({preventScroll:true});
  setMsg('Ready: '+item.name+'. Review the real '+def.name+' options and press its START button yourself.');
 }
 async function copyLink(item){
  const url=link(item);
  try{
   if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
   await navigator.clipboard.writeText(url);setMsg('Challenge link copied. It contains drill options only.');
  }catch{
   paste.value=url;paste.focus();paste.select();
   setMsg('Clipboard unavailable. Copy the selected challenge link manually.');
  }
 }
 // The native drill history is the only source for the *device-local*
 // observation below. Matching settings do not prove a preset was activated.
 const histories={
  goals:{key:'fuckball-local-goal-rush-history-v1',matches:(x,o)=>x.duration===o.duration&&x.target===o.target,
   valid:x=>Number.isSafeInteger(x.goals)&&x.goals>=0&&x.goals<=999&&
    Number.isSafeInteger(x.elapsed)&&x.elapsed>=0&&x.elapsed<=180&&
    x.completed===(x.goals>=x.target)},
  team:{key:'fuckball.teamwork-native-drill.v1',matches:(x,o)=>x.seconds===o.duration&&x.target===o.target,
   valid:x=>Number.isSafeInteger(x.links)&&x.links>=0&&x.links<=99&&
    Number.isSafeInteger(x.elapsed)&&x.elapsed>=0&&x.elapsed<=300&&
    x.completed===(x.links>=x.target)},
  defense:{key:'fuckball.clean-sheet-history.v1',matches:(x,o)=>x.duration===o.duration&&x.allowance===o.allowance,
   valid:x=>Number.isSafeInteger(x.conceded)&&x.conceded>=0&&x.conceded<=999&&
    Number.isSafeInteger(x.elapsed)&&x.elapsed>=x.duration&&x.elapsed<=x.duration+1&&
    x.completed===(x.conceded<=x.allowance)},
  rockets:{key:'fuckball.native-ball-burst-history.v1',matches:(x,o)=>x.duration===o.duration&&x.threshold===o.threshold&&x.target===o.target,
   valid:x=>Number.isSafeInteger(x.hits)&&x.hits>=0&&x.hits<=999&&
    Number.isSafeInteger(x.elapsed)&&x.elapsed>=0&&x.elapsed<=x.duration+1&&
    x.completed===(x.hits>=x.target)},
  comeback:{key:'fuckball.native-comeback-arena.v1',matches:(x,o)=>x.duration===o.duration&&x.deficit===o.deficit,
   valid:x=>Number.isSafeInteger(x.scored)&&x.scored>=0&&x.scored<=999&&
    Number.isSafeInteger(x.conceded)&&x.conceded>=0&&x.conceded<=999&&
    Number.isSafeInteger(x.elapsed)&&x.elapsed>=x.duration&&x.elapsed<=x.duration+1&&
    x.completed===(x.scored>x.conceded+x.deficit)}
 };
 function matchingLocalHistory(item){
  const h=histories[item.mode];
  try{
   const rows=JSON.parse(localStorage.getItem(h.key)||'[]');
   if(!Array.isArray(rows)||rows.length>20)return null;
   const found=rows.filter(x=>x&&typeof x==='object'&&!Array.isArray(x)&&
    Number.isSafeInteger(x.at)&&x.at>0&&x.at<=Date.now()+86400000&&
    typeof x.completed==='boolean'&&h.matches(x,item.options)&&h.valid(x));
   return{attempts:found.length,met:found.filter(x=>x.completed).length};
  }catch{return null;}
 }
 function showList(){
  const all=storeList();list.replaceChildren();
  if(!all.length){list.append(make('p','No saved presets yet.'));return;}
  all.forEach((item,index)=>{
   const row=make('article',null,'challenge-exchange-row');
   const description=make('span',item.name+' · '+MODES[item.mode].name+' · '+
    MODES[item.mode].fields.map(([k])=>k+' '+item.options[k]).join(' · '));
   const controls=make('div');
   const load=make('button','Edit'),go=make('button','Prepare'),share=make('button','Share'),remove=make('button','Remove');
   for(const b of [load,go,share,remove])b.type='button';
   load.onclick=()=>display(item);go.onclick=()=>{display(item);setUp(item);};
   share.onclick=()=>copyLink(item);
   remove.onclick=()=>{
    const current=storeList();const found=current.findIndex(x=>JSON.stringify(x)===JSON.stringify(item));
    if(found===-1)return;
    current.splice(found,1);
    if(store(current)){setMsg('Saved challenge removed from this device.');showList();}
    else setMsg('Browser storage refused the change.');
   };
   const history=matchingLocalHistory(item);
   const historyNote=make('small',history?
    history.attempts+' matching recent device-only attempt'+(history.attempts===1?'':'s')+
    ' · '+history.met+' personal objective'+(history.met===1?'':'s')+' met':
    'Local attempt records unavailable');
   historyNote.className='challenge-exchange-history-note';
   historyNote.title='Only retained native offline attempts with the same settings; not proof this saved preset was used. No shared or ranked results.';
   controls.append(load,go,share,remove);row.append(description,historyNote,controls);list.append(row);
  });
 }
 function showPreview(item){
  preview=normalize(item);pending.replaceChildren();pending.hidden=false;
  pending.append(make('strong',preview.name+' · '+MODES[preview.mode].name));
  pending.append(make('p',MODES[preview.mode].fields.map(([k,label])=>label+': '+preview.options[k]).join(' · ')));
  const accept=make('button','Use these settings'),saveIncoming=make('button','Save this preset');
  accept.type=saveIncoming.type='button';
  accept.onclick=()=>{display(preview);setUp(preview);};
  saveIncoming.onclick=()=>{const list=storeList();if(list.length>=MAX){setMsg('Limit: 16 saved local presets. Remove one first.');return;}
   if(store([preview,...list])){showList();setMsg('Saved shared preset locally. No game was started.');}
   else setMsg('Browser storage is unavailable.');
  };
  pending.append(accept,saveIncoming);
 }
 apply.onclick=()=>{try{setUp(record());}catch(e){setMsg(e.message);}};
 save.onclick=()=>{try{const item=record(),items=storeList();
  if(items.length>=MAX){setMsg('Limit: 16 saved local presets. Remove one first.');return;}
  if(store([item,...items])){showList();setMsg('Challenge saved only on this device.');}
  else setMsg('Browser storage is unavailable.');
 }catch(e){setMsg(e.message);}};
 copy.onclick=()=>{try{copyLink(record());}catch(e){setMsg(e.message);}};
 inspect.onclick=()=>{try{showPreview(parseShare(paste.value));setMsg('Preview only. Select Use or Save to accept.');}
  catch(e){preview=null;pending.hidden=true;pending.replaceChildren();setMsg(e.message);}};

 download.onclick=()=>{
  const items=storeList();
  if(!items.length){setMsg('No saved challenges to export.');return;}
  const payload=JSON.stringify({format:'fuckball-practice-challenge-pack',version:1,items},null,2);
  const url=URL.createObjectURL(new Blob([payload],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='fuckball-practice-challenges.json';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  setMsg('Exported '+items.length+' private challenge presets. No results or accounts included.');
 };
 upload.onclick=()=>fileInput.click();
 fileInput.addEventListener('change',async()=>{
  const file=fileInput.files?.[0];fileInput.value='';
  if(!file)return;
  if(file.size>16384||file.size===0){setMsg('Challenge pack must be a non-empty JSON file under 16 KB.');return;}
  try{
   const source=JSON.parse(await file.text());
   if(!source||source.format!=='fuckball-practice-challenge-pack'||source.version!==1||
    !Array.isArray(source.items)||source.items.length<1||source.items.length>MAX)
    throw Error('Not a supported challenge pack.');
   // Validate the entire pack before writing a single item. Nothing is trusted
   // about a local file; the native drill selectors remain the final authority.
   const incoming=source.items.map(normalize),current=storeList(),combined=[...current];
   let added=0;
   for(const item of incoming){
    if(combined.some(x=>JSON.stringify(x)===JSON.stringify(item)))continue;
    if(combined.length>=MAX)throw Error('16-preset limit. Remove a local preset before importing.');
    combined.push(item);added++;
   }
   if(!store(combined))throw Error('Browser storage unavailable; nothing imported.');
   showList();setMsg(added+' presets imported locally; '+(incoming.length-added)+' exact duplicates skipped. No results imported.');
  }catch(e){setMsg(e.message||'Challenge pack could not be read. Nothing changed.');}
 });
 window.addEventListener('storage',event=>{if(event.key===KEY||Object.values(histories).some(h=>h.key===event.key))showList();});
 root.addEventListener('toggle',()=>{if(root.open)showList();});
 showList();
 // Only a passive preview on arrival. Unknown fragments belong to other game flows.
 if(window.location.hash.startsWith(HASH)){
  try{showPreview(parseShare(window.location.hash));root.open=true;
   setMsg('Shared challenge detected. Nothing was started or saved. Review the preview.');
  }catch{setMsg('The shared challenge link is invalid or unsupported. Nothing was changed.');}
 }
})();