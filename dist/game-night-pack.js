'use strict';
// Portable, device-local game night: no account, server, room or verified match state.
(function(){
 const home=document.getElementById('homeView');if(!home)return;
 const FORMAT='fuckball-private-game-night',VERSION=1,MAX_FILE=320*1024;
 const TYPES=[
  {kind:'leagues',key:'fuckball.local-tournaments.v1',max:8,bytes:128*1024},
  {kind:'cups',key:'fuckball.private-knockout-cups.v1',max:8,bytes:96*1024},
  {kind:'formations',key:'fuckball.private-formation-studio.v1',max:12,bytes:64*1024}
 ];
 const dom=(tag,text,cls)=>{
  const e=document.createElement(tag);
  if(text!==undefined&&text!==null)e.textContent=String(text);
  if(cls)e.className=cls;
  return e;
 };
 const button=(name,handler)=>{
  const b=dom('button',name);b.type='button';b.addEventListener('click',handler);return b;
 };
 const nameOk=(v,max)=>typeof v==='string'&&v.length>=1&&v.length<=max&&v===v.trim()&&
  !/[\u0000-\u001f\u007f-\u009f]/.test(v);
 const idOk=v=>typeof v==='string'&&/^[a-f0-9-]{16,50}$/i.test(v);
 const atOk=v=>Number.isSafeInteger(v)&&v>=1600000000000&&v<=Date.now()+86400000;
 const scoreOk=v=>v===null||(Number.isSafeInteger(v)&&v>=0&&v<=99);
 const unique=names=>new Set(names.map(x=>x.toLocaleLowerCase())).size===names.length;
 const uuid=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
 function fixtures(n,legs){
  const ids=Array.from({length:n},(_,i)=>i);
  if(n%2)ids.push(-1);
  const rounds=[];
  for(let r=0;r<ids.length-1;r++){
   const games=[];
   for(let i=0;i<ids.length/2;i++){
    const a=ids[i],b=ids[ids.length-i-1];
    if(a<0||b<0)continue;
    const swap=(r+i)%2===1;
    games.push({round:r+1,home:swap?b:a,away:swap?a:b});
   }
   rounds.push(games);ids.splice(1,0,ids.pop());
  }
  if(legs===2){
   const initial=rounds.length;
   for(let i=0;i<initial;i++)rounds.push(rounds[i].map(x=>({
    round:x.round+initial,home:x.away,away:x.home
   })));
  }
  return rounds.flatMap((r,i)=>r.map((g,j)=>({...g,id:'r'+(i+1)+'g'+(j+1)})));
 }
 function league(x){
  if(!x||x.version!==1||!idOk(x.id)||!nameOk(x.name,60)||![1,2].includes(x.legs)||
   !Array.isArray(x.teams)||x.teams.length<2||x.teams.length>12||
   x.teams.some(n=>!nameOk(n,30))||!unique(x.teams)||
   !atOk(x.createdAt)||!atOk(x.updatedAt)||x.updatedAt<x.createdAt||
   !Array.isArray(x.fixtures))throw Error('Invalid saved league metadata.');
  const expected=fixtures(x.teams.length,x.legs);
  if(x.fixtures.length!==expected.length)throw Error('Invalid saved league fixture count.');
  const matches=expected.map((m,i)=>{
   const f=x.fixtures[i],when=f?.kickoff===undefined?null:f.kickoff;
   const venue=f?.venue===undefined?'':f.venue;
   if(!f||f.id!==m.id||f.round!==m.round||f.home!==m.home||f.away!==m.away||
    !scoreOk(f.homeScore)||!scoreOk(f.awayScore)||
    (f.homeScore===null)!==(f.awayScore===null)||
    !(when===null||(Number.isSafeInteger(when)&&when>=1577836800000&&when<=4102444800000))||
    typeof venue!=='string'||venue.length>60||venue!==venue.trim()||
    /[\u0000-\u001f\u007f-\u009f]/.test(venue))
    throw Error('Invalid saved fixture or score.');
   return {...m,homeScore:f.homeScore,awayScore:f.awayScore,kickoff:when,venue};
  });
  return {version:1,id:x.id,name:x.name,teams:x.teams.slice(),legs:x.legs,
   createdAt:x.createdAt,updatedAt:x.updatedAt,fixtures:matches};
 }
 function cup(x){
  if(!x||x.version!==1||!idOk(x.id)||!nameOk(x.name,60)||
   ![2,4,8,16].includes(x.teams?.length)||x.teams.some(n=>!nameOk(n,35))||
   !unique(x.teams)||!atOk(x.createdAt)||!atOk(x.updatedAt)||
   x.updatedAt<x.createdAt||!Array.isArray(x.matches)||x.matches.length!==x.teams.length-1)
   throw Error('Invalid saved knockout cup.');
  const rounds=Math.log2(x.teams.length),matches=[];let i=0;
  for(let r=0;r<rounds;r++){
   for(let j=0;j<x.teams.length/(2**(r+1));j++,i++){
    const m=x.matches[i];
    const tie=m?.homeScore!==null&&m?.homeScore===m?.awayScore;
    if(!m||m.id!=='r'+(r+1)+'m'+(j+1)||m.round!==r||m.game!==j||
     !scoreOk(m.homeScore)||!scoreOk(m.awayScore)||
     (m.homeScore===null)!==(m.awayScore===null)||
     ![null,'home','away'].includes(m.tiebreak)||
     (tie&&m.tiebreak===null)||(!tie&&m.tiebreak!==null))
     throw Error('Invalid knockout pairing or tiebreak.');
    matches.push({id:m.id,round:r,game:j,homeScore:m.homeScore,
     awayScore:m.awayScore,tiebreak:m.tiebreak});
   }
  }
  const resolve=(r,g)=>{
   const m=matches.find(x=>x.round===r&&x.game===g);
   const h=r===0?g*2:resolve(r-1,g*2);
   const a=r===0?g*2+1:resolve(r-1,g*2+1);
   if(h===null||a===null){
    if(m.homeScore!==null)throw Error('A knockout result is missing its qualifiers.');
    return null;
   }
   if(m.homeScore===null)return null;
   if(m.homeScore>m.awayScore)return h;
   if(m.homeScore<m.awayScore)return a;
   return m.tiebreak==='home'?h:a;
  };
  resolve(rounds-1,0);
  return {version:1,id:x.id,name:x.name,teams:x.teams.slice(),matches,
   createdAt:x.createdAt,updatedAt:x.updatedAt};
 }
 const position=p=>Array.isArray(p)&&p.length===2&&p.every(v=>
  Number.isSafeInteger(v)&&v>=30&&v<=970);
 function formation(x){
  if(!x||x.version!==1||!idOk(x.id)||!nameOk(x.name,45)||!atOk(x.updatedAt)||
   !Array.isArray(x.spots)||x.spots.length!==9||!x.spots.every(position)||
   !Array.isArray(x.arrows)||x.arrows.length>16)
   throw Error('Invalid tactics plan.');
  const arrowKeys=new Set(),arrows=[];
  for(const a of x.arrows){
   if(!Array.isArray(a)||a.length!==2||a.some(n=>!Number.isSafeInteger(n)||n<0||n>7)||
    a[0]===a[1]||arrowKeys.has(a.join(':')))throw Error('Invalid tactics passing arrow.');
   arrowKeys.add(a.join(':'));arrows.push(a.slice());
  }
  const st=x.stadium===undefined?null:x.stadium;
  if(st!==null){
   if(!st||typeof st!=='object'||!nameOk(st.name,45)||
    !Number.isSafeInteger(st.width)||st.width<1||st.width>10000||
    !Number.isSafeInteger(st.height)||st.height<1||st.height>10000||
    !Array.isArray(st.lines)||st.lines.length>160||
    st.lines.some(line=>!Array.isArray(line)||line.length!==2||
     line.some(point=>!Array.isArray(point)||point.length!==2||
      point.some(n=>!Number.isSafeInteger(n)||n<0||n>1000))))
    throw Error('Invalid stadium drawing.');
  }
  return {version:1,id:x.id,name:x.name,spots:x.spots.map(p=>p.slice()),
   arrows,stadium:st===null?null:{...st,lines:st.lines.map(line=>line.map(p=>p.slice()))},
   updatedAt:x.updatedAt};
 }
 const validators={leagues:league,cups:cup,formations:formation};
 function validated(type,items){
  const schema=TYPES.find(x=>x.kind===type);
  if(!schema||!Array.isArray(items)||items.length>schema.max)
   throw Error('Invalid '+type+' collection.');
  const result=items.map(validators[type]);
  if(new Set(result.map(x=>x.id)).size!==result.length)
   throw Error('Duplicate '+type+' identity.');
  if(JSON.stringify(result).length>schema.bytes)
   throw Error(type+' exceeds its own storage limit.');
  return result;
 }
 function readAll(){
  const snapshots={},lists={};
  for(const item of TYPES){
   const raw=localStorage.getItem(item.key);
   if(raw!==null&&raw.length>item.bytes)throw Error(item.kind+' local data is oversized.');
   snapshots[item.key]=raw;
   lists[item.kind]=validated(item.kind,raw?JSON.parse(raw):[]);
  }
  return {snapshots,lists};
 }
 const section=dom('section',undefined,'game-night-pack');
 section.setAttribute('aria-label','Private Game Night Pack');
 const disclosure=dom('details');
 const summary=dom('summary','🎒 GAME NIGHT PACK · OPEN');
 const inner=dom('div',undefined,'game-night-body');
 inner.append(dom('h2','TAKE YOUR GAME NIGHT WITH YOU.'),
  dom('p','Backup private league calendars, knockout brackets and tactical diagrams together. Restore additional copies on another device. This never transfers recorded HBR2 files, accounts or verified online scores.'));
 const controls=dom('div',undefined,'game-night-controls');
 const exportButton=button('↓ Backup game night',exportPack);
 const importButton=button('↑ Restore game night',()=>file.click());
 const refresh=button('↻ Refresh inventory',inspect);
 const file=dom('input');file.type='file';file.accept='.json,application/json';file.hidden=true;
 controls.append(exportButton,importButton,refresh,file);
 const grid=dom('div',undefined,'game-night-summary');
 const message=dom('p',undefined,'game-night-message');
 message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 inner.append(controls,grid,message);disclosure.append(summary,inner);section.append(disclosure);
 const anchor=home.querySelector('.matchday-hub')||home.querySelector('.mode-cards');
 if(anchor)anchor.insertAdjacentElement('afterend',section);else home.append(section);
 let busy=false;
 const info=s=>message.textContent=s;
 function inspect(){
  grid.replaceChildren();
  try{
   const {lists}=readAll();
   for(const [type,title]of [['leagues','Round-robin leagues'],['cups','Knockout cups'],['formations','Tactics plans']]){
    const card=dom('article',undefined,'game-night-counter');
    card.append(dom('strong',lists[type].length),dom('span',title));grid.append(card);
   }
   info('Only local planning data. All scores are self-entered and unverified.');
  }catch(error){info('Unable to read private game night data: '+(error.message||'Storage error'));}
 }
 function download(filename,value){
  const blob=new Blob([value],{type:'application/json'});
  if(blob.size>MAX_FILE)throw Error('Backup exceeds the 320 KiB portable limit.');
  const url=URL.createObjectURL(blob),link=dom('a');
  link.href=url;link.download=filename;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 function exportPack(){
  if(busy)return;busy=true;exportButton.disabled=true;
  try{
   const {lists}=readAll();
   const pack={format:FORMAT,version:VERSION,createdAt:Date.now(),
    ...lists,notice:'Private user-organised plans only; not verified server results'};
   download('fuckball-private-game-night-'+new Date().toISOString().slice(0,10)+'.json',
    JSON.stringify(pack,null,2));
   info('Portable private game night backup downloaded. Export My Games separately for actual HBR2 recordings.');
  }catch(error){info('Game night backup could not be created: '+(error.message||'Storage error'));}
  finally{busy=false;exportButton.disabled=false;}
 }
 file.onchange=async()=>{
  const candidate=file.files?.[0];file.value='';if(!candidate||busy)return;
  if(candidate.size<1||candidate.size>MAX_FILE)
   return info('Select a private Game Night Pack JSON file smaller than 320 KiB.');
  busy=true;importButton.disabled=true;
  try{
   const data=JSON.parse(await candidate.text());
   if(data?.format!==FORMAT||data.version!==VERSION||!atOk(data.createdAt))
    throw Error('Unsupported Game Night Pack.');
   const imported={};
   for(const item of TYPES)imported[item.kind]=validated(item.kind,data[item.kind]);
   const {snapshots,lists}=readAll(),next={},totals={};
   const now=Date.now();
   for(const item of TYPES){
    const incoming=imported[item.kind];
    if(incoming.length+lists[item.kind].length>item.max)
     throw Error('Not enough room for '+item.kind+'. Export and delete individual old items first.');
    const additions=incoming.map(x=>{
     const copy={...x,id:uuid(),updatedAt:now};
     if(item.kind!=='formations')copy.createdAt=now;
     return copy;
    });
    next[item.key]=JSON.stringify(validated(item.kind,[...lists[item.kind],...additions]));
    totals[item.kind]=additions.length;
   }
   if(!totals.leagues&&!totals.cups&&!totals.formations)
    throw Error('This pack has no game night items to restore.');
   if(!window.confirm('Add '+totals.leagues+' leagues, '+totals.cups+' cups and '+
      totals.formations+' private tactics plans to this device? Existing items are preserved.'))return;
   // localStorage has no multi-key transaction. Snapshot each old value, stage every new
   // value, then do bounded synchronous writes with rollback on a storage exception.
   const written=[];
   try{
    for(const item of TYPES){
     if(localStorage.getItem(item.key)!==snapshots[item.key])
      throw Error('Game night data changed in another tab. Refresh and retry.');
    }
    for(const item of TYPES){
     localStorage.setItem(item.key,next[item.key]);written.push(item.key);
    }
   }catch(error){
    for(const key of written.reverse()){
     try{
      if(snapshots[key]===null)localStorage.removeItem(key);
      else localStorage.setItem(key,snapshots[key]);
     }catch{/* Cannot safely recover browser storage: report explicitly below. */}
    }
    throw Error('Import was interrupted; reload and inspect existing items before retrying. '+(error.message||''));
   }
   // Notify the three same-tab consumers only after the complete set has been written.
   for(const item of TYPES){
    window.dispatchEvent(new StorageEvent('storage',{
     key:item.key,oldValue:snapshots[item.key],newValue:next[item.key],
     storageArea:localStorage,url:location.href
    }));
   }
   window.dispatchEvent(new Event('fuckball:private-competition-change'));
   inspect();
   info('Restored '+totals.leagues+' leagues, '+totals.cups+' knockout cups and '+
    totals.formations+' tactics plans as additional private copies. No server data changed.');
  }catch(error){info('Game Night Pack not restored: '+(error.message||'File/storage error'));}
  finally{busy=false;importButton.disabled=false;}
 };
 disclosure.addEventListener('toggle',()=>{if(disclosure.open)inspect();});
 window.addEventListener('storage',event=>{
  if(TYPES.some(x=>x.key===event.key)&&disclosure.open)inspect();
 });
 inspect();
})();