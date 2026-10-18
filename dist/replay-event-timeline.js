'use strict';
// One replay-only visual event timeline, derived solely from the saved local HBR2.
// Does not read remote results, change physics/input, or send any network request.
(function(){
 const controls=document.getElementById('replayControls');
 const match=document.getElementById('matchView');
 if(!controls||!match||typeof ReplayLibrary==='undefined')return;
 const make=(tag,cls='',text)=>{
  const element=document.createElement(tag);
  if(cls)element.className=cls;
  if(text!==undefined)element.textContent=text;
  return element;
 };
 const section=make('section','replay-event-timeline');
 section.setAttribute('aria-label','Replay event timeline');
 section.hidden=true;
 const header=make('div','replay-event-head');
 const heading=make('div');
 heading.append(make('span','replay-event-eyebrow','RECORDED HBR2 · ON THIS DEVICE'),
  make('h2','','MATCH TIMELINE'),
  make('p','','Navigate real recorded goal markers, your saved moments and private coaching notes. These are local replay cues, not official match statistics.'));
 const actions=make('div','replay-event-head-actions');
 const refresh=make('button','','↻ Refresh moments');
 const exportReport=make('button','','↓ Export timeline');
 for(const b of [refresh,exportReport]){b.type='button';actions.append(b);}
 header.append(heading,actions);
 const strip=make('div','replay-event-strip'),position=make('input','replay-event-scrub');
 position.type='range';position.min='0';position.max='1000';position.step='1';
 position.setAttribute('aria-label','Seek to a position in the saved replay');
 const ticks=make('div','replay-event-ticks');ticks.setAttribute('aria-label','Recorded replay event markers');
 strip.append(ticks,position);
 const legend=make('div','replay-event-legend');
 for(const [cls,label] of [['goal','HBR2 goals'],['bookmark','Saved moments'],['note','Private notes']]){
  legend.append(make('span','replay-event-legend-'+cls,label));
 }
 const bar=make('div','replay-event-bar'),clock=make('strong','replay-event-clock','00:00 / 00:00');
 const prev=make('button','','‹ Previous cue'),next=make('button','','Next cue ›');
 prev.type=next.type='button';bar.append(clock,prev,next);
 const filters=make('div','replay-event-filters');
 const filterLabel=make('label','','Show events');
 const filter=make('select');
 filter.setAttribute('aria-label','Filter timeline events');
 for(const [key,label] of [['all','All events'],['goal','Recorded goals'],['bookmark','Saved moments'],['note','Coaching notes']])
  filter.add(new Option(label,key));
 filterLabel.append(filter);
 const summary=make('span','replay-event-count');
 filters.append(filterLabel,summary);
 const list=make('ol','replay-event-list');
 const expand=make('button','replay-event-expand','Show all timeline events');expand.type='button';
 const status=make('p','replay-event-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 section.append(header,strip,legend,bar,filters,list,expand,status);
 controls.append(section);
 let id='',playback=null,events=[],frameLimit=0,name='',serial=0,busy=false;
 let all=false,lastLoad=0,frameCache=-1,previousKey='',lastView='',ready=false;
 const fmt=frame=>{
  const seconds=Math.floor(Math.max(0,frame)/60);
  return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
 };
 const validId=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
 function active(){
  return !match.hidden&&!controls.hidden&&typeof replay!=='undefined'&&!!replay&&
   validId(typeof activeLocalReplayId==='undefined'?'':activeLocalReplayId);
 }
 function ours(){
  return active()&&playback===replay&&id===activeLocalReplayId;
 }
 const currentFrame=()=>ours()&&Number.isFinite(replay.getTime())?
  Math.min(frameLimit,Math.max(0,Math.round(replay.getTime()*60/1000))):0;
 function seek(entry){
  if(!ours())return;
  // Starting just before a goal gives useful lead-up; annotations are exact frames.
  const frame=entry.kind==='goal'?Math.max(0,entry.frameNo-120):entry.frameNo;
  replay.setTime(Math.min(replay.length(),frame*1000/60));
  replay.setSpeed(0);
  document.getElementById('replayToggle').textContent='▶';
  status.textContent='Paused at '+fmt(frame)+' · '+entry.label+'.';
  updatePosition(true);
 }
 function matching(){return events.filter(e=>filter.value==='all'||e.kind===filter.value);}
 function updatePosition(force=false){
  if(!ours())return;
  const frame=currentFrame();
  if(!force&&frame===frameCache)return;
  frameCache=frame;
  const ratio=frameLimit?frame/frameLimit:0;
  position.value=String(Math.round(Math.max(0,Math.min(1,ratio))*1000));
  clock.textContent=fmt(frame)+' / '+fmt(frameLimit);
  const available=matching();
  prev.disabled=!available.some(e=>e.frameNo<frame-15);
  next.disabled=!available.some(e=>e.frameNo>frame+15);
  for(const button of ticks.children)
   button.classList.toggle('is-past',Number(button.dataset.frame)<=frame);
 }
 function step(direction){
  if(!ours())return;
  const frame=currentFrame(),list=matching();
  const cue=direction>0?list.find(e=>e.frameNo>frame+15):
   [...list].reverse().find(e=>e.frameNo<frame-15);
  if(cue)seek(cue);
  else status.textContent=direction>0?'No later cue in the selected filter.':'No earlier cue in the selected filter.';
 }
 prev.onclick=()=>step(-1);next.onclick=()=>step(1);
 function createTick(entry,index){
  const button=make('button','replay-event-pin is-'+entry.kind,'');
  button.type='button';
  button.dataset.frame=String(entry.frameNo);
  button.style.left=(Math.min(99.5,Math.max(.5,entry.frameNo/frameLimit*100)))+'%';
  button.title=fmt(entry.frameNo)+' · '+entry.label;
  button.setAttribute('aria-label','Jump to '+entry.kind+' at '+fmt(entry.frameNo)+': '+entry.label);
  button.style.setProperty('--stack',String(index%3));
  button.onclick=()=>seek(entry);
  return button;
 }
 function render(){
  if(!ours()){section.hidden=true;return;}
  section.hidden=false;
  const items=matching();
  ticks.replaceChildren();list.replaceChildren();
  for(let i=0;i<items.length;i++)ticks.append(createTick(items[i],i));
  summary.textContent=items.length+' shown · '+events.length+' total';
  const showing=all?items:items.slice(0,12);
  for(const entry of showing){
   const row=make('li','replay-event-entry is-'+entry.kind);
   const button=make('button','replay-event-jump');
   button.type='button';button.onclick=()=>seek(entry);
   const time=make('strong','',fmt(entry.frameNo));
   const copy=make('span','replay-event-entry-copy');
   copy.append(make('strong','',entry.label),
    make('small','',entry.kind==='goal'?'Recorded goal marker · unverified':
     entry.kind==='bookmark'?'Private saved moment':'Private coaching · '+entry.category));
   if(entry.text)copy.append(make('span','replay-event-entry-detail',entry.text));
   button.append(time,copy);row.append(button);list.append(row);
  }
  if(!items.length)list.append(make('li','replay-event-empty',
   'No '+(filter.value==='all'?'recorded cues':filter.selectedOptions[0].textContent.toLowerCase())+
   ' in this replay. Save a moment or coaching note to add it to the timeline.'));
  expand.hidden=items.length<=12;
  expand.textContent=all?'Show fewer events':'Show all '+items.length+' events';
  updatePosition(true);
 }
 async function refreshData(){
  if(!active()||busy)return;
  const token=++serial,recording=replay,replayId=activeLocalReplayId;
  busy=true;refresh.disabled=true;
  try{
   const item=(await ReplayLibrary.list()).find(x=>x.id===replayId);
   if(token!==serial||!active()||replay!==recording||activeLocalReplayId!==replayId)return;
   if(!item)throw Error('The recording is no longer stored here.');
   if(!Number.isFinite(recording.length())||recording.length()<=0)throw Error('Replay duration unavailable.');
   const limit=Math.max(1,Math.floor(recording.length()*60/1000));
   const end=Number.isSafeInteger(item.frames)&&item.frames>0?
    Math.min(limit,item.frames):limit;
   const list=[];
   if(Array.isArray(item.goals))
    for(const marker of item.goals.slice(0,128)){
     if(!marker||!Number.isSafeInteger(marker.frameNo)||marker.frameNo<0||
      marker.frameNo>end||![1,2].includes(marker.teamId))continue;
     list.push({kind:'goal',frameNo:marker.frameNo,
      label:marker.teamId===1?'Red goal':'Blue goal',text:'',category:''});
    }
   for(const bookmark of ReplayLibrary.normalizeBookmarks(item.bookmarks,end)){
    list.push({kind:'bookmark',frameNo:bookmark.frameNo,label:bookmark.label,text:'',category:''});
   }
   for(const note of ReplayLibrary.normalizeNotes(item.notes,end)){
    list.push({kind:'note',frameNo:note.frameNo,label:note.label,text:note.text,category:note.category});
   }
   const priority={goal:0,bookmark:1,note:2};
   list.sort((a,b)=>a.frameNo-b.frameNo||priority[a.kind]-priority[b.kind]);
   if(token!==serial||!active()||replay!==recording||activeLocalReplayId!==replayId)return;
   id=replayId;playback=recording;frameLimit=limit;name=String(item.name||'Replay').slice(0,100);
   events=list;lastLoad=Date.now();all=false;frameCache=-1;
   status.textContent='Timeline read from local HBR2 goal markers, saved moments and private notes.';
   render();
  }catch(error){
   if(token===serial){section.hidden=false;status.textContent='Timeline unavailable: '+(error.message||'Could not read replay');}
  }finally{if(token===serial){busy=false;refresh.disabled=false;}}
 }
 refresh.onclick=refreshData;
 filter.onchange=()=>{all=false;render();};
 expand.onclick=()=>{all=!all;render();};
 position.addEventListener('change',()=>{
  if(!ours())return;
  const target=Number(position.value);
  if(!Number.isFinite(target))return;
  const frame=Math.max(0,Math.min(frameLimit,Math.round(frameLimit*target/1000)));
  replay.setTime(Math.min(replay.length(),frame*1000/60));
  replay.setSpeed(0);
  document.getElementById('replayToggle').textContent='▶';
  status.textContent='Paused at '+fmt(frame)+' · manual replay seek.';
  updatePosition(true);
 });
 exportReport.onclick=()=>{
  if(!ours()||!events.length)return;
  const clean=value=>String(value).replace(/[\x00-\x1f\x7f]/g,' ').replace(/[<>]/g,'').slice(0,360);
  const lines=['# Fuckball · Personal replay event timeline','','Recording: '+clean(name),
   'Source: locally saved HBR2; not a verified online match or ranked result.',
   'Generated: '+new Date().toLocaleString(),''];
  for(const entry of events){
   lines.push('## '+fmt(entry.frameNo)+' — '+clean(entry.label),'',
    entry.kind==='goal'?'Recorded goal marker (local, unverified)':
    entry.kind==='bookmark'?'Saved personal moment':'Private coaching: '+clean(entry.category),'');
   if(entry.text)lines.push(clean(entry.text),'');
  }
  const blob=new Blob([lines.join('\n')],{type:'text/markdown;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='fuckball-replay-events-'+new Date().toISOString().slice(0,10)+'.md';
  document.body.append(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),30000);
  status.textContent='Private timeline exported locally. You choose whether to share the file.';
 };
 function pulse(){
  if(document.hidden)return;
  if(!active()){
   if(id){++serial;id='';playback=null;events=[];section.hidden=true;}
   return;
  }
  if(id!==activeLocalReplayId||playback!==replay){
   if(!busy){++serial;id='';playback=null;events=[];section.hidden=true;refreshData();}
   return;
  }
  updatePosition();
  // Private IndexedDB metadata can be changed from bookmarks, notebook or another tab.
  // Refresh infrequently; never poll remote servers or decode large replay bytes.
  if(!busy&&Date.now()-lastLoad>6000)refreshData();
 }
 window.refreshReplayEventTimeline=refreshData;
 window.setInterval(pulse,180);
 section.hidden=true;
})();