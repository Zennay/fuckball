'use strict';
// Device-private best-of-three/five/seven friendlies. No verified server matches.
(function(){
 const home=document.getElementById('homeView');if(!home)return;
 const KEY='fuckball.private-series.v1',MAX=12,MAX_BYTES=128*1024,MAX_FILE=128*1024;
 const validName=(v,n)=>typeof v==='string'&&v.length>0&&v.length<=n&&v===v.trim()&&
  !/[\u0000-\u001f\u007f-\u009f]/.test(v);
 const validId=v=>typeof v==='string'&&/^[a-f0-9-]{16,50}$/i.test(v);
 const validAt=v=>Number.isSafeInteger(v)&&v>=1600000000000&&v<=Date.now()+86400000;
 const score=v=>v===null||(Number.isSafeInteger(v)&&v>=0&&v<=99);
 const when=v=>v===null||(Number.isSafeInteger(v)&&v>=1577836800000&&v<=4102444800000);
 const text=(tag,value,cls)=>{
  const node=document.createElement(tag);
  if(value!==undefined&&value!==null)node.textContent=String(value);
  if(cls)node.className=cls;return node;
 };
 const button=(label,fn)=>{
  const node=text('button',label);node.type='button';node.onclick=fn;return node;
 };
 const label=(title,input)=>{
  const box=text('label',title);box.append(input);return box;
 };
 const uid=()=>crypto.randomUUID?crypto.randomUUID():
  Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
 const localTime=n=>{
  if(n===null)return'';
  const d=new Date(n),p=x=>String(x).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+
   p(d.getHours())+':'+p(d.getMinutes());
 };
 function inspect(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.version!==1||
    !validId(raw.id)||!validName(raw.name,60)||![3,5,7].includes(raw.bestOf)||
    !validName(raw.red,35)||!validName(raw.blue,35)||
    raw.red.toLocaleLowerCase()===raw.blue.toLocaleLowerCase()||
    !validAt(raw.createdAt)||!validAt(raw.updatedAt)||raw.updatedAt<raw.createdAt||
    !Array.isArray(raw.games)||raw.games.length!==raw.bestOf)
    throw Error('Invalid private best-of-series metadata.');
  const games=[],need=Math.floor(raw.bestOf/2)+1;
  let red=0,blue=0,started=false,decided=false,recorded=0;
  for(let i=0;i<raw.bestOf;i++){
   const g=raw.games[i],kickoff=g?.kickoff===undefined?null:g.kickoff;
   const venue=g?.venue===undefined?'':g.venue;
   if(!g||g.id!=='g'+(i+1)||!score(g.redScore)||!score(g.blueScore)||
    (g.redScore===null)!==(g.blueScore===null)||
    (g.redScore!==null&&g.redScore===g.blueScore)||
    !when(kickoff)||typeof venue!=='string'||venue.length>60||
    venue!==venue.trim()||/[\u0000-\u001f\u007f-\u009f]/.test(venue))
    throw Error('Invalid game result or kickoff in private series.');
   if(g.redScore!==null){
    if(decided||started)throw Error('Games must be played in order and stop when a team wins.');
    recorded++;if(g.redScore>g.blueScore)red++;else blue++;
    if(red===need||blue===need)decided=true;
   }else started=true;
   games.push({id:g.id,redScore:g.redScore,blueScore:g.blueScore,kickoff,venue});
  }
  return {series:{version:1,id:raw.id,name:raw.name,red:raw.red,blue:raw.blue,
    bestOf:raw.bestOf,createdAt:raw.createdAt,updatedAt:raw.updatedAt,games},
   red,blue,recorded,winner:red>=need?raw.red:blue>=need?raw.blue:null};
 }
 function validateCollection(items){
  if(!Array.isArray(items)||items.length>MAX)throw Error('Invalid series collection.');
  const seen=new Set(),valid=items.map(item=>inspect(item));
  for(const entry of valid){
   if(seen.has(entry.series.id))throw Error('Duplicate private series identity.');
   seen.add(entry.series.id);
  }
  if(JSON.stringify(items).length>MAX_BYTES)throw Error('Private series storage limit reached.');
  return valid;
 }
 let snapshot=null,items=[],healthy=true,selected='',message='',errorText='';
 function read(){
  snapshot=localStorage.getItem(KEY);
  if(snapshot!==null&&snapshot.length>MAX_BYTES)throw Error('Stored series exceeds 128 KiB.');
  items=validateCollection(snapshot?JSON.parse(snapshot):[]).map(x=>x.series);
 }
 try{read();}catch(error){healthy=false;errorText=error.message||'Local series unavailable';items=[];}
 // Serialize each local mutation and (on supported browsers) synchronize all
 // tabs before touching device-private history. This is not a server result.
 let pendingWrite=Promise.resolve();
 const writeLock=KEY+':exclusive-write';
 function persist(list){
  if(!healthy)return Promise.reject(Error('Unreadable private series storage. Download its original bytes first.'));
  // Capture the operator's original view BEFORE waiting for another tab.
  const before=items,proposed=validateCollection(list).map(x=>x.series);
  const work=pendingWrite.catch(()=>{}).then(async()=>{
   const commit=()=>{
    const raw=localStorage.getItem(KEY);
    if(raw!==null&&raw.length>MAX_BYTES)
     throw Error('Stored private series exceeds 128 KiB. No changes were saved.');
    const latest=validateCollection(raw?JSON.parse(raw):[]).map(x=>x.series);
    // A no-lock browser cannot make a truly atomic multi-tab write. Fall
    // back to refusing even unrelated stale changes, never blindly replacing.
    if(!navigator.locks?.request&&raw!==snapshot)
     throw Error('Another tab changed series data. Refresh before saving.');
    const oldById=new Map(before.map(x=>[x.id,x]));
    const proposedById=new Map(proposed.map(x=>[x.id,x]));
    const merged=new Map(latest.map(x=>[x.id,x]));
    // Merge edits to DIFFERENT series; edits to the same series always
    // fail closed if the authoritative stored version has changed.
    for(const previous of before){
     const next=proposedById.get(previous.id);
     if(next&&JSON.stringify(next)===JSON.stringify(previous))continue;
     const current=merged.get(previous.id);
     if(!current||JSON.stringify(current)!==JSON.stringify(previous))
      throw Error('This series changed in another tab. Refresh before editing that series.');
     if(next)merged.set(previous.id,next);
     else merged.delete(previous.id);
    }
    for(const next of proposed){
     if(oldById.has(next.id))continue;
     if(merged.has(next.id))
      throw Error('Another tab already uses this series identity. Try creating it again.');
     merged.set(next.id,next);
    }
    // Keep the unchanged historical records; refuse overflow or corruption.
    const normalized=validateCollection([...merged.values()]).map(x=>x.series);
    const next=JSON.stringify(normalized);
    localStorage.setItem(KEY,next);
    snapshot=next;items=normalized;
    window.dispatchEvent(new Event('fuckball:private-competition-change'));
   };
   if(typeof navigator!=='undefined'&&navigator.locks?.request)
    return navigator.locks.request(writeLock,{mode:'exclusive'},commit);
   return commit();
  });
  pendingWrite=work.catch(()=>{});
  return work;
 }
 const section=text('section',null,'best-of-series');
 const details=text('details');const summary=text('summary','⚔ BEST-OF SERIES · OPEN');
 const inner=text('div',null,'series-inner');
 const heading=text('h2','BEST OF THREE. OR FIVE. OR SEVEN.');
 const info=text('p','Plan private friendly series, enter each real game score, and let the series winner follow actual results. Never a ranked or server-verified outcome.');
 const tools=text('div',null,'series-actions');
 const choose=text('select');choose.setAttribute('aria-label','Select private match series');
 const createToggle=button('＋ New series',()=>{creation.hidden=!creation.hidden;if(!creation.hidden)name.focus();});
 const backup=button('↓ Backup all JSON',downloadAll);
 const restore=button('↑ Restore JSON',()=>{file.value='';file.click();});
 const csv=button('↓ Games CSV',downloadCSV),calendar=button('↓ Calendar ICS',downloadCalendar);
 const scorecard=button('↓ Share scorecard SVG',downloadScorecard);
 const shareText=button('Copy series summary',copySummary);
 scorecard.className='series-share-action';shareText.className='series-share-action';
 const remove=button('Delete series',deleteSeries);
 const file=text('input');file.type='file';file.accept='.json,application/json';file.hidden=true;
 tools.append(choose,createToggle,backup,restore,csv,calendar,scorecard,shareText,remove,file);
 const creation=text('form',null,'series-new');creation.hidden=true;
 const name=text('input');name.required=true;name.maxLength=60;name.placeholder='Friday night finals';
 const redName=text('input');redName.required=true;redName.maxLength=35;redName.placeholder='Red Lions';
 const blueName=text('input');blueName.required=true;blueName.maxLength=35;blueName.placeholder='Blue Wolves';
 const format=text('select');for(const n of [3,5,7])format.add(new Option('Best of '+n,String(n)));
 const create=text('button','Create private series');create.type='submit';
 creation.append(label('Series name',name),label('Red team',redName),
  label('Blue team',blueName),label('Series format',format),create);
 const note=text('p',null,'series-status');note.setAttribute('role','status');note.setAttribute('aria-live','polite');
 const recovery=text('section',null,'series-recovery');recovery.hidden=true;
 const recoveryText=text('p','Saved private series could not be read safely. This panel will not overwrite it. Download the untouched bytes and resolve the storage problem before editing.');
 const rawDownload=button('↓ Download untouched local data',()=>{
  try{
   const raw=localStorage.getItem(KEY);
   if(!raw||raw!==snapshot)throw Error('Stored data changed; reload first.');
   download('fuckball-series-unreadable-backup.json',raw,'application/json',true);
   inform('Raw local series bytes downloaded; original storage remains unchanged.');
  }catch(e){inform('Could not back up stored bytes: '+e.message);}
 });
 recovery.append(recoveryText,rawDownload);
 const board=text('section',null,'series-board');
 inner.append(heading,info,tools,creation,note,recovery,board);
 details.append(summary,inner);section.append(details);
 const anchor=home.querySelector('.matchday-hub')||home.querySelector('.mode-cards');
 if(anchor)anchor.insertAdjacentElement('afterend',section);else home.append(section);
 const current=()=>items.find(i=>i.id===selected)||null;
 function inform(m){message=m;note.textContent=m;}
 function download(filename,value,mime,raw=false){
  const blob=new Blob([value],{type:mime});
  if(!raw&&blob.size>MAX_FILE)throw Error('File exceeds 128 KiB.');
  const url=URL.createObjectURL(blob);
  const a=text('a');a.href=url;a.download=filename;
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 function filename(v){return 'fuckball-'+v.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,40).replace(/^-|-$/g,'')||'series';}
 // A download must never claim to include a game that is still awaiting
 // a queued browser lock. Refresh the source before every portable export.
 async function freshSeriesForExport(){
  await pendingWrite;
  if(!healthy)throw Error('Local series is unreadable; export its untouched bytes instead.');
  if(localStorage.getItem(KEY)!==snapshot){
   try{read();healthy=true;errorText='';message='Latest series refreshed before export.';}
   catch(error){
    healthy=false;items=[];selected='';
    errorText=error.message||'Unreadable private series data';
    render();
    throw Error('Another tab saved unreadable data. Untouched bytes were preserved.');
   }
   render();
  }
  return current();
 }
 async function downloadAll(){
  try{
   await freshSeriesForExport();
   download('fuckball-private-series.json',
    JSON.stringify({format:'fuckball-private-series',version:1,exportedAt:Date.now(),series:items},null,2),
    'application/json;charset=utf-8');
   inform('All private series exported locally. No online match or account data included.');
  }catch(e){inform('Export failed: '+e.message);}
 }
 const cell=v=>{
  let s=String(v);
  if(/^[=+\-@\t\r]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
 };
 async function downloadCSV(){
  let v;
  try{v=await freshSeriesForExport();}catch(e){return inform('CSV export blocked: '+e.message);}
  if(!v)return;
  const rows=[['Game','Red','Blue','Red goals','Blue goals','Winner','Kickoff UTC','Venue'],
   ...v.games.map((g,i)=>[i+1,v.red,v.blue,
    g.redScore??'',g.blueScore??'',g.redScore===null?'':g.redScore>g.blueScore?v.red:v.blue,
    g.kickoff===null?'':new Date(g.kickoff).toISOString(),g.venue])];
  try{download(filename(v)+'-games.csv','\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n','text/csv;charset=utf-8');
   inform('Private game results and dates exported as CSV.');}
  catch(e){inform('CSV export failed: '+e.message);}
 }
 async function downloadCalendar(){
  let v;
  try{v=await freshSeriesForExport();}catch(e){return inform('Calendar export blocked: '+e.message);}
  if(!v)return;
  // A decided series must not export unnecessary future fixtures.
  const state=statusFor(v);
  const rows=v.games.filter((x,i)=>x.kickoff!==null&&(!state.winner||i<state.recorded));
  if(!rows.length)return inform('No required games have a saved kickoff. A decided series never exports unnecessary future fixtures.');
  const escape=s=>String(s).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
  const stamp=n=>new Date(n).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const fold=s=>{
   const encoder=new TextEncoder();let out='',width=0;
   for(const char of s){const bytes=encoder.encode(char).length;
    if(width+bytes>72){out+='\r\n ';width=1;}out+=char;width+=bytes;}
   return out;
  };
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','CALSCALE:GREGORIAN',
   'PRODID:-//Fuckball//Private Best of Series//EN','X-WR-CALNAME:'+escape(v.name+' private series')];
  for(const game of rows){
   const n=Number(game.id.slice(1));
   lines.push('BEGIN:VEVENT','UID:'+v.id+'-'+game.id+'@local.fuckball',
    'DTSTAMP:'+stamp(Date.now()),'DTSTART:'+stamp(game.kickoff),'DURATION:PT1H',
    'SUMMARY:'+escape(v.red+' vs '+v.blue+' · Game '+n),
    'DESCRIPTION:'+escape('Unofficial private friendly. Kickoff provisional; series may finish early. No invitation sent.'),
    ...(game.venue?['LOCATION:'+escape(game.venue)]:[]),'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  try{download(filename(v)+'-schedule.ics',lines.map(fold).join('\r\n')+'\r\n','text/calendar;charset=utf-8');
   inform(rows.length+' private kickoffs exported. Dates are provisional; no invitations were sent.');}
  catch(e){inform('Calendar export failed: '+e.message);}
 }
 // Explicit, portable exports: only deliberately entered series names, scores and provisional plans.
 // No accounts, private storage IDs, online results or auto-posting are included.
 function shareLines(v,info){
  const lines=[v.name+' · Best of '+v.bestOf+' (private / unofficial)',
   v.red+' '+info.red+' – '+info.blue+' '+v.blue,
   info.winner?'Winner: '+info.winner:'First to '+info.needed+' wins · '+info.recorded+' games recorded'];
  for(let i=0;i<v.games.length;i++){
   const g=v.games[i],required=!info.winner||i<info.recorded;
   let row='Game '+(i+1)+': ';
   if(g.redScore!==null)row+=v.red+' '+g.redScore+' – '+g.blueScore+' '+v.blue;
   else if(!required)row+='not required (series decided)';
   else row+='not played';
   if(g.kickoff!==null&&required)
    row+=' · provisional '+new Date(g.kickoff).toLocaleString();
   if(g.venue&&required)row+=' · '+g.venue;
   lines.push(row);
  }
  lines.push('Local, manually entered results. Not ranked or verified. No invitation sent.');
  return lines;
 }
 async function copySummary(){
  let v;
  try{v=await freshSeriesForExport();}catch(e){return inform('Copy blocked: '+e.message);}
  if(!v||!healthy)return;
  try{
   if(!navigator.clipboard?.writeText)throw Error('Clipboard access is unavailable in this browser.');
   await navigator.clipboard.writeText(shareLines(v,statusFor(v)).join('\n'));
   inform('Series summary copied. Paste it wherever you choose; nothing was uploaded.');
  }catch(e){inform('Copy unavailable: '+e.message+' Use the SVG or CSV export instead.');}
 }
 async function downloadScorecard(){
  let v;
  try{v=await freshSeriesForExport();}catch(e){return inform('Scorecard export blocked: '+e.message);}
  if(!v||!healthy)return;
  try{
   const info=statusFor(v);
   const esc=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
   // Each label is shortened for the graphic, but never changes the stored result.
   const short=(x,n)=>Array.from(x).length>n?Array.from(x).slice(0,n-1).join('')+'…':x;
   const label=(x,y,value,size=25,fill='#e7f9ef',weight=600)=>
    '<text x="'+x+'" y="'+y+'" font-family="system-ui, sans-serif" font-size="'+size+
    '" font-weight="'+weight+'" fill="'+fill+'">'+esc(value)+'</text>';
   const height=414+v.games.length*74;
   let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="'+height+
    '" viewBox="0 0 1000 '+height+'" role="img" aria-labelledby="series-title series-desc">'+
    '<title id="series-title">'+esc(v.name)+' — local private best-of scorecard</title>'+
    '<desc id="series-desc">Unverified, manually entered results and provisional game plans. Never ranked or official.</desc>'+
    '<rect width="1000" height="'+height+'" fill="#102830"/>'+
    '<rect width="1000" height="14" fill="#c8f49e"/>'+
    label(52,76,'FUCKBALL  /  PRIVATE SERIES',24,'#c8f49e',800)+
    label(52,119,short(v.name,46),33,'#f2ffeb',800)+
    label(52,162,'BEST OF '+v.bestOf+'  ·  FIRST TO '+info.needed,21,'#afcec5',750)+
    '<rect x="48" y="187" width="904" height="116" rx="20" fill="#214649"/>'+
    label(76,239,short(v.red,22),30,'#ffaba5',800)+
    label(76,280,short(v.blue,22),30,'#a7cbff',800)+
    label(807,239,String(info.red),38,'#ffaba5',850)+
    label(807,280,String(info.blue),38,'#a7cbff',850)+
    label(52,344,info.winner?'WINNER · '+short(info.winner,42):
     info.recorded+' OF '+v.bestOf+' GAMES RECORDED',23,'#d8ffb2',800);
   for(let i=0;i<v.games.length;i++){
    const g=v.games[i],y=364+i*74,required=!info.winner||i<info.recorded;
    const state=g.redScore!==null?'RECORDED':required?'NOT PLAYED':'NOT REQUIRED';
    const points=g.redScore===null?'—  :  —':g.redScore+'  :  '+g.blueScore;
    const detail=(!required?'Series already decided':g.kickoff===null?'No kickoff set':
     'Provisional · '+new Date(g.kickoff).toLocaleString()+
      (g.venue?' · '+g.venue:''));
    svg+='<rect x="48" y="'+y+'" width="904" height="65" rx="13" fill="#193942"/>'+
     label(68,y+28,'GAME '+(i+1),21,'#d2f2d9',800)+
     label(243,y+28,points,27,'#fcfff7',800)+
     label(445,y+28,state,19,g.redScore!==null?'#c8f49e':'#f2ddab',750)+
     label(68,y+53,short(detail,95),15,'#bfd1cf',450);
   }
   svg+=label(52,height-16,'UNOFFICIAL · DEVICE-LOCAL · NO SERVER-VERIFIED SCORES',16,'#a7c6c1',700)+'</svg>';
   download(filename(v)+'-scorecard.svg',svg,'image/svg+xml;charset=utf-8');
   inform('Shareable private scorecard exported as SVG; no result was uploaded or verified.');
  }catch(e){inform('Scorecard export failed: '+e.message);}
 }
 function statusFor(v){
  const result=inspect(v),needed=Math.floor(v.bestOf/2)+1;
  return {...result,needed};
 }
 async function update(id,change){
  const v=items.find(x=>x.id===id);if(!v)throw Error('Series changed in another view.');
  const next=inspect({...v,updatedAt:Math.max(v.createdAt,Date.now()),games:change(v)}).series;
  await persist(items.map(x=>x.id===id?next:x));
  render();
 }
 async function scoreGame(v,i,h,a){
  const prior=statusFor(v);
  if(prior.winner)throw Error('The series is decided. Undo the most recent game to correct a result.');
  if(i!==prior.recorded)throw Error('Record games in order; undo the last score to correct it.');
  if(!Number.isSafeInteger(h)||!Number.isSafeInteger(a)||h<0||a<0||h>99||a>99||h===a)
   throw Error('A best-of game needs a decisive whole-number score from 0 to 99.');
  await update(v.id,x=>x.games.map((g,j)=>j===i?{...g,redScore:h,blueScore:a}:g));
  inform('Real, manually entered game '+(i+1)+' saved. The series standings updated.');
 }
 async function undoGame(v){
  const info=statusFor(v);if(!info.recorded)return inform('No recorded game to undo.');
  if(!window.confirm('Remove the last manually entered game result? Kickoff date is preserved.'))return;
  try{await update(v.id,x=>x.games.map((g,j)=>j===info.recorded-1?
    {...g,redScore:null,blueScore:null}:g));
   inform('The latest game result was cleared. Series standings recalculated.');}
  catch(e){inform('Undo failed: '+e.message);}
 }
 async function scheduleGame(v,i,value,venue){
  const kickoff=value===''?null:new Date(value).getTime();
  if(value!==''&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)||
   !Number.isFinite(kickoff)||localTime(kickoff)!==value))
   throw Error('Enter a valid local kickoff time.');
  if(!when(kickoff)||typeof venue!=='string'||venue.length>60||
   /[\u0000-\u001f\u007f-\u009f]/.test(venue)||venue.trim()!==venue)
   throw Error('Invalid kickoff or venue.');
  await update(v.id,x=>x.games.map((g,j)=>j===i?{...g,kickoff,venue}:g));
  inform('Provisional local kickoff saved; no online fixture was created.');
 }
 function render(){
  recovery.hidden=healthy;board.replaceChildren();
  choose.replaceChildren(new Option('Choose a private series…',''));
  for(const v of items)choose.add(new Option(v.name,v.id));
  if(!current()&&items.length)selected=items[0].id;
  choose.value=current()?.id||'';
  const v=current(),enabled=!!v&&healthy;
  backup.disabled=!healthy||!items.length;createToggle.disabled=remove.disabled=!healthy;
  csv.disabled=calendar.disabled=scorecard.disabled=shareText.disabled=!enabled;
  restore.disabled=!healthy;create.disabled=!healthy;
  note.textContent=message||(healthy?'Everything here is device-private and unverified.':
   'Unreadable original data: '+errorText);
  if(!v)return void(board.append(text('p','Create your first best-of series with two teams.')));
  const data=statusFor(v),head=text('div',null,'series-scoreboard');
  const result=text('div',null,'series-tally');
  const title=text('h3',v.name),numbers=text('strong',v.red+' '+data.red+' – '+data.blue+' '+v.blue);
  const detail=text('p',data.winner?'🏆 '+data.winner+' wins the private series':
   'First to '+data.needed+' wins · '+data.recorded+'/'+v.bestOf+' games recorded');
  const progress=text('progress');progress.max=v.bestOf;progress.value=data.recorded;
  progress.setAttribute('aria-label','Recorded games in series');
  result.append(title,numbers,detail,progress);
  head.append(result,button('Undo latest game result',()=>undoGame(v)));
  board.append(head);
  const planner=text('details',null,'series-batch-schedule');
  const plannerSummary=text('summary','🗓 Plan every remaining game');
  const plannerBody=text('div',null,'series-batch-body');
  const help=text('p','Set one starting local kickoff and the number of days between games. Preview exact dates before changing anything. Recorded results are never modified; existing kickoffs are preserved by default.');
  const inputs=text('form',null,'series-batch-form');
  const first=text('input');first.type='datetime-local';first.required=true;
  first.setAttribute('aria-label','First game local kickoff');
  const gap=text('input');gap.type='number';gap.min='1';gap.max='30';gap.step='1';gap.value='2';gap.required=true;
  const place=text('input');place.type='text';place.maxLength=60;place.placeholder='Optional shared venue';
  const keep=text('input');keep.type='checkbox';keep.checked=true;
  const preserve=label('Preserve already planned kickoffs',keep);preserve.className='series-batch-preserve';
  const previewButton=button('Preview entire series',()=>previewPlan());
  const saveButton=text('button','Confirm and save plan');saveButton.type='submit';saveButton.disabled=true;
  const output=text('div',null,'series-batch-preview');
  output.setAttribute('role','status');output.setAttribute('aria-live','polite');
  let prepared=null;
  const planSignature=()=>JSON.stringify([v.id,snapshot,first.value,gap.value,place.value,keep.checked]);
  function clearPreview(){
   prepared=null;saveButton.disabled=true;output.replaceChildren();
  }
  for(const control of [first,gap,place,keep]){
   control.addEventListener('input',clearPreview);
   control.addEventListener('change',clearPreview);
  }
  function calculatePlan(){
   if(!healthy||current()?.id!==v.id)throw Error('Select a readable series first.');
   if(data.winner)throw Error('The series is already decided. No further games need scheduling.');
   const value=first.value;
   if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw Error('Choose a first kickoff time in your local timezone.');
   const start=new Date(value);
   if(!Number.isFinite(start.getTime())||localTime(start.getTime())!==value||!when(start.getTime()))
    throw Error('First kickoff is invalid or outside the supported years.');
   const step=Number(gap.value),venue=place.value.trim();
   if(!Number.isSafeInteger(step)||step<1||step>30)
    throw Error('Choose 1–30 days between games.');
   if(venue.length>60||/[\u0000-\u001f\u007f-\u009f]/.test(venue))
    throw Error('Venue must be a single line under 60 characters.');
   const proposed=new Map(),diff=[];
   for(let i=0;i<v.games.length;i++){
    const game=v.games[i];
    if(game.redScore!==null||(keep.checked&&game.kickoff!==null))continue;
    const date=new Date(start.getTime());
    // Calendar-day arithmetic keeps the intended local clock time through DST.
    date.setDate(start.getDate()+i*step);
    const kickoff=date.getTime();
    if(!when(kickoff))throw Error('One planned kickoff exceeds the supported calendar years.');
    proposed.set(game.id,{...game,kickoff,venue:venue||game.venue});
    diff.push({game:i+1,kickoff,venue:venue||game.venue});
   }
   if(!diff.length)throw Error('No unscheduled games. Uncheck Preserve to reschedule unplayed games.');
   const candidate=inspect({...v,updatedAt:Math.max(v.createdAt,Date.now()),
    games:v.games.map(g=>proposed.get(g.id)||g)}).series;
   return{signature:planSignature(),candidate,diff};
  }
  function previewPlan(){
   clearPreview();
   try{
    prepared=calculatePlan();saveButton.disabled=false;
    output.append(text('strong',prepared.diff.length+' proposed private kickoffs · no server fixtures created.'));
    const list=text('ol');
    for(const entry of prepared.diff){
     const item=text('li','Game '+entry.game+' · '+
      new Date(entry.kickoff).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})+
      (entry.venue?' · '+entry.venue:''));
     list.append(item);
    }
    output.append(list,text('p','All existing game results and winning records stay unchanged. '+
     'Later matches may become unnecessary if a team clinches the series early.'));
   }catch(error){output.append(text('p',error.message||'Cannot plan games.'));}
  }
  inputs.onsubmit=async e=>{
   e.preventDefault();
   if(!prepared||prepared.signature!==planSignature()){
    clearPreview();return inform('The series plan changed. Preview it again before saving.');
   }
   if(!window.confirm('Save '+prepared.diff.length+' provisional kickoff dates for "'+v.name+
     '"? Scores remain unchanged and no invitations are sent.'))return;
   try{
    await persist(items.map(x=>x.id===v.id?prepared.candidate:x));
    message=prepared.diff.length+' provisional series kickoffs saved. Export Calendar ICS to share dates.';
    render();
   }catch(error){clearPreview();inform('Schedule not saved: '+(error.message||'Storage error'));}
  };
  inputs.append(label('First local kickoff',first),label('Days between games',gap),
   label('Shared venue · optional',place),preserve,previewButton,saveButton);
  plannerBody.append(help,inputs,output);planner.append(plannerSummary,plannerBody);
  if(!data.winner)board.append(planner);

  const grid=text('div',null,'series-fixtures');
  for(const [i,g]of v.games.entries()){
   const card=text('article',null,'series-game');
   card.dataset.gameId=g.id;card.tabIndex=-1;
   const line=text('div',null,'series-game-heading');
   const state=g.redScore!==null?v.red+' '+g.redScore+' – '+g.blueScore+' '+v.blue:
    data.winner?'Not needed · series decided':i===data.recorded?'Next game':'Waiting for earlier games';
   line.append(text('strong','Game '+(i+1)),text('span',state));
   const form=text('form',null,'series-score-form');
   const h=text('input');h.type='number';h.min='0';h.max='99';h.step='1';
   h.inputMode='numeric';h.placeholder='Red';h.required=true;
   h.setAttribute('aria-label',v.red+' goals, game '+(i+1));
   const a=text('input');a.type='number';a.min='0';a.max='99';a.step='1';
   a.inputMode='numeric';a.placeholder='Blue';a.required=true;
   a.setAttribute('aria-label',v.blue+' goals, game '+(i+1));
   if(g.redScore!==null){h.value=String(g.redScore);a.value=String(g.blueScore);}
   const submit=text('button','Save game result');submit.type='submit';
   const canScore=healthy&&!data.winner&&i===data.recorded;
   h.disabled=a.disabled=submit.disabled=!canScore;
   form.onsubmit=async event=>{
    event.preventDefault();
    if(!/^(0|[1-9]\d?)$/.test(h.value)||!/^(0|[1-9]\d?)$/.test(a.value))
     return inform('Enter whole-number goals (0–99) for both teams.');
    try{await scoreGame(v,i,Number(h.value),Number(a.value));}
    catch(error){inform(error.message);}
   };
   form.append(label(v.red+' goals',h),label(v.blue+' goals',a),submit);
   const schedule=text('form',null,'series-schedule-form');
   const date=text('input');date.type='datetime-local';date.value=localTime(g.kickoff);
   date.setAttribute('aria-label','Game '+(i+1)+' provisional kickoff');
   const venue=text('input');venue.maxLength=60;venue.placeholder='Venue · optional';venue.value=g.venue;
   venue.setAttribute('aria-label','Game '+(i+1)+' venue');
   const save=text('button','Save kickoff');save.type='submit';save.disabled=!healthy;
   const clear=button('Remove kickoff',async()=>{
    try{await scheduleGame(v,i,'','');}catch(e){inform(e.message);}
   });clear.disabled=!healthy||g.kickoff===null;
   schedule.onsubmit=async event=>{
    event.preventDefault();
    try{await scheduleGame(v,i,date.value,venue.value.trim());}catch(e){inform(e.message);}
   };
   schedule.append(label('Provisional local date',date),label('Venue',venue),save,clear);
   card.append(line,form,schedule);
   if(!data.winner||g.redScore!==null){
    const poster=button('▣ Design match poster',()=>window.dispatchEvent(
     new CustomEvent('fuckball:open-private-poster-fixture',{detail:{uid:v.id+'-'+g.id}})));
    poster.className='series-game-poster';
    card.append(poster);
   }
   grid.append(card);
  }
  board.append(grid);
 }
 creation.onsubmit=async e=>{
  e.preventDefault();
  const n=name.value.trim(),r=redName.value.trim(),b=blueName.value.trim(),size=Number(format.value);
  if(!validName(n,60)||!validName(r,35)||!validName(b,35)||
   r.toLocaleLowerCase()===b.toLocaleLowerCase()||![3,5,7].includes(size))
   return inform('Enter a name and two different valid teams.');
  if(items.length>=MAX)return inform('Maximum 12 private series reached. Back up and delete one.');
  const now=Date.now(),v={version:1,id:uid(),name:n,red:r,blue:b,bestOf:size,
   createdAt:now,updatedAt:now,games:Array.from({length:size},(_,i)=>({
    id:'g'+(i+1),redScore:null,blueScore:null,kickoff:null,venue:''}))};
  try{await persist([...items,v]);selected=v.id;creation.hidden=true;message='Private series created.';render();}
  catch(error){inform(error.message);}
 };
 choose.onchange=()=>{selected=choose.value;message='';render();};
 async function deleteSeries(){
  const v=current();if(!v)return;
  if(!window.confirm('Delete "'+v.name+'" and all its local scores/dates? Export a backup first.'))return;
  try{await persist(items.filter(x=>x.id!==v.id));selected='';message='Series deleted locally.';render();}
  catch(error){inform(error.message);}
 }
 file.onchange=async()=>{
  const chosen=file.files?.[0];file.value='';if(!chosen)return;
  if(chosen.size<1||chosen.size>MAX_FILE)
   return inform('Use a series backup smaller than 128 KiB.');
  try{
   const pack=JSON.parse(await chosen.text());
   if(!pack||pack.format!=='fuckball-private-series'||pack.version!==1||
     !Array.isArray(pack.series)||!pack.series.length)
    throw Error('Not a private best-of-series backup.');
   const imported=validateCollection(pack.series).map(x=>x.series);
   if(imported.length+items.length>MAX)throw Error('Not enough space for every imported series.');
   const now=Date.now(),copies=imported.map(x=>({
    ...x,id:uid(),createdAt:now,updatedAt:now,games:x.games.map(g=>({...g}))}));
   if(!window.confirm('Import '+copies.length+' private series as new copies? Existing series remain unchanged.'))return;
   await persist([...items,...copies]);selected=copies[0].id;
   message=copies.length+' private series imported as separate copies.';render();
  }catch(error){inform('Import refused: '+(error.message||'Invalid file'));}
 };
 window.addEventListener('storage',event=>{
  if(event.key!==KEY)return;
  try{
   read();healthy=true;errorText='';message='Series refreshed from another tab.';
  }catch(e){healthy=false;snapshot=event.newValue;items=[];
   errorText=e.message||'Unreadable local series storage';selected='';
   message='Another tab changed stored series into unreadable data. Original bytes protected.';}
  render();
 });
 window.addEventListener('fuckball:create-private-series',async event=>{
  const request=event.detail;
  const respond=(ok,detail)=>window.dispatchEvent(new CustomEvent('fuckball:private-series-created',{
   detail:ok?{ok:true,id:detail}:{ok:false,reason:detail}
  }));
  try{
   if(!request||!validId(request.sourceId)||!validName(request.sourceName,60)||
    !validName(request.red,35)||!validName(request.blue,35)||
    request.red.toLocaleLowerCase()===request.blue.toLocaleLowerCase()||
    ![3,5,7].includes(request.bestOf))
    throw Error('Invalid private cup finalists or series format.');
   if(!healthy)throw Error('Saved series data is unreadable. Export the original bytes before making changes.');
   if(items.length>=MAX)throw Error('Twelve series already exist. Export and delete an older series first.');
   // The UI handoff only ever creates an empty independent organiser.
   // No cup score is copied, and no server identity/authorization is inferred.
   const now=Date.now(),title=request.sourceName.slice(0,43).trim()+' · Final series';
   const created=inspect({version:1,id:uid(),name:title,red:request.red,blue:request.blue,
    bestOf:request.bestOf,createdAt:now,updatedAt:now,
    games:Array.from({length:request.bestOf},(_,i)=>({
     id:'g'+(i+1),redScore:null,blueScore:null,kickoff:null,venue:''
    }))}).series;
   await persist([...items,created]);selected=created.id;
   message='New best-of-'+created.bestOf+' series created for '+created.red+' vs '+created.blue+
    '. All games are unplayed and unofficial.';
   details.open=true;render();
   section.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?
    'auto':'smooth',block:'start'});
   choose.focus({preventScroll:true});
   respond(true,created.id);
  }catch(error){respond(false,error.message||'Could not save private series.');}
 });
 window.addEventListener('fuckball:open-private-series',event=>{
  const request=event.detail;
  if(!validId(request?.id))return;
  const series=items.find(v=>v.id===request.id);
  if(!series)return;
  selected=series.id;details.open=true;render();
  const validGame=typeof request.gameId==='string'&&/^g[1-7]$/.test(request.gameId)&&
   series.games.some(g=>g.id===request.gameId);
  const target=validGame?Array.from(board.querySelectorAll('.series-game')).find(card=>
   card.dataset.gameId===request.gameId):null;
  if(target){
   target.classList.add('series-game-target');
   target.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?
    'auto':'smooth',block:'center'});
   const focus=request.field==='schedule'?target.querySelector('input[type="datetime-local"]'):
    target.querySelector('.series-score-form input:not(:disabled)');
   (focus||target).focus({preventScroll:true});
   inform('Opened '+series.name+' · '+request.gameId.toUpperCase()+
    '. Existing private score and schedule forms remain authoritative for local entries.');
  }else{
   section.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?
    'auto':'smooth',block:'start'});
   choose.focus({preventScroll:true});
  }
 });
 render();
})();
