'use strict';
// Compare user-owned local HBR2 recordings: frame counts, genuine recorded goal
// markers and bookmarks. Not a match outcome, rating, or server-verified report.
(function(){
 const games=document.getElementById('gamesView');
 if(!games||typeof ReplayLibrary==='undefined')return;
 const MAX_FILE=32*1048576;
 const panel=document.createElement('section');panel.className='replay-compare-studio';
 panel.setAttribute('aria-label','Compare two locally saved match replays');
 const make=(tag,klass,text)=>{
  const node=document.createElement(tag);if(klass)node.className=klass;
  if(text!==undefined)node.textContent=text;return node;
 };
 const heading=make('header','replay-compare-head');
 const copy=make('div','');
 copy.append(make('span','eyebrow','LOCAL REPLAY REVIEW'),
  make('h2','','COMPARE TWO GAMES.'),
  make('p','','Compare actual HBR2 recording length, goal markers and saved moments. This is personal replay analysis, not an official match result or rank.'));
 const refresh=make('button','','↻ Refresh library');refresh.type='button';
 heading.append(copy,refresh);
 const controls=make('div','replay-compare-controls');
 const selectors=[];
 for(const letter of ['A','B']){
  const label=make('label','','Recording '+letter);
  const select=document.createElement('select');
  select.setAttribute('aria-label','Select local HBR2 recording '+letter);
  label.append(select);selectors.push(select);controls.append(label);
 }
 const sideLabel=make('label','','Goal markers');
 const side=document.createElement('select');side.setAttribute('aria-label','Choose which goal-side markers are shown');
 for(const [value,label] of [['all','Both sides'],['1','Red only'],['2','Blue only']])side.add(new Option(label,value));
 sideLabel.append(side);controls.append(sideLabel);
 const summary=make('p','replay-compare-status','Load two saved recordings to compare.');
 summary.setAttribute('role','status');summary.setAttribute('aria-live','polite');
 const comparisons=make('div','replay-compare-cards');
 const difference=make('div','replay-compare-difference');
 const timelines=make('div','replay-compare-timelines');
 const footer=make('div','replay-compare-footer');
 footer.append(make('small','','Only replay index metadata is read until you choose Watch or a goal marker. Clicks never send data to a server.'));
 panel.append(heading,controls,summary,comparisons,difference,timelines,footer);
 const entry=document.querySelector('.local-replay-insights')||document.querySelector('.goal-gallery')||document.getElementById('gamesList');
 games.insertBefore(panel,entry);
 const valid=item=>item&&typeof item.id==='string'&&/^[0-9a-f]{32}$/.test(item.id)&&
  typeof item.name==='string'&&item.name.length<=100&&
  Number.isSafeInteger(item.createdAt)&&item.createdAt>0&&item.createdAt<=Date.now()+86400000&&
  Number.isSafeInteger(item.size)&&item.size>0&&item.size<=MAX_FILE&&
  Number.isSafeInteger(item.frames)&&item.frames>=0&&item.frames<=86400000&&
  Array.isArray(item.goals)&&item.goals.length<=128;
 function goals(item){
  return item.goals.filter(x=>x&&Number.isSafeInteger(x.frameNo)&&x.frameNo>=0&&
   (!item.frames||x.frameNo<=item.frames)&&[1,2].includes(x.teamId));
 }
 const format=frames=>{
  if(!Number.isSafeInteger(frames)||frames<0)return 'Unknown';
  const total=Math.floor(frames/60);
  return Math.floor(total/60)+'m '+String(total%60).padStart(2,'0')+'s';
 };
 const filteredGoals=item=>{
  const markers=goals(item);
  return side.value==='all'?markers:markers.filter(x=>String(x.teamId)===side.value);
 };
 let recordings=[],sequence=0,busy=false;
 const selected=()=>selectors.map(s=>recordings.find(item=>item.id===s.value)||null);
 async function refreshLibrary(){
  const token=++sequence;
  summary.textContent='Reading your local replay index…';
  try{
   const all=(await ReplayLibrary.list()).filter(valid).slice(0,30);
   if(token!==sequence)return;
   const previous=selectors.map(s=>s.value);
   recordings=all;
   for(let i=0;i<2;i++){
    const select=selectors[i];select.replaceChildren();
    select.add(new Option('Choose a replay',''));
    for(const item of all){
     const name=(item.favorite===true?'★ ':'')+item.name+' · '+new Date(item.createdAt).toLocaleDateString();
     select.add(new Option(name,item.id));
    }
    const fallback=all[i]?.id||'';
    const next=all.some(x=>x.id===previous[i])?previous[i]:fallback;
    select.value=next;
   }
   if(selectors[0].value&&selectors[0].value===selectors[1].value){
    selectors[1].value=all.find(x=>x.id!==selectors[0].value)?.id||'';
   }
   paint();
  }catch(error){
   if(token!==sequence)return;
   summary.textContent='Local replay library unavailable: '+(error.message||'Storage error');
   comparisons.replaceChildren();difference.replaceChildren();timelines.replaceChildren();
  }
 }
 function detailRow(name,value){
  const row=make('div','replay-compare-data');
  row.append(make('span','',name),make('strong','',value));return row;
 }
 async function watch(item,frameNo){
  if(busy)return;busy=true;
  summary.textContent='Opening a recording from this browser…';
  try{
   const saved=await ReplayLibrary.get(item.id);
   if(saved.item.id!==item.id||saved.bytes.length>MAX_FILE)
    throw Error('This replay is no longer available.');
   loadReplay(saved.bytes,item.name);
   activeLocalReplayId=item.id;
   if(typeof refreshReplayBookmarks==='function')await refreshReplayBookmarks();
   if(Number.isSafeInteger(frameNo)&&frameNo>=0&&typeof replay!=='undefined'&&replay){
    replay.setTime(Math.max(0,frameNo-180)*1000/60);
    replay.setSpeed(1);
   }
   summary.textContent='Opened '+item.name+' from your local device.';
  }catch(error){summary.textContent='Cannot open local replay: '+(error.message||'Unknown error');}
  finally{busy=false;}
 }
 function compareCard(item,index){
  const card=make('article','replay-compare-card');
  const top=make('div','replay-compare-card-top');
  top.append(make('span','replay-compare-letter','REPLAY '+(index?'B':'A')),make('strong','',item.name));
  const markers=goals(item);
  const first=markers.length?Math.min(...markers.map(x=>x.frameNo)):null;
  const last=markers.length?Math.max(...markers.map(x=>x.frameNo)):null;
  const red=markers.filter(x=>x.teamId===1).length;
  const blue=markers.length-red;
  const memo=Array.isArray(item.bookmarks)?item.bookmarks.filter(b=>b&&
   Number.isSafeInteger(b.frameNo)&&b.frameNo>=0&&b.frameNo<=item.frames).length:0;
  const rows=make('div','replay-compare-facts');
  rows.append(
   detailRow('Recorded duration',format(item.frames)),
   detailRow('Goal markers',String(markers.length)+' · Red '+red+' / Blue '+blue),
   detailRow('First goal marker',first===null?'None':format(first)),
   detailRow('Last goal marker',last===null?'None':format(last)),
   detailRow('Saved bookmarks',String(memo)));
  const open=make('button','','▶ Watch full replay');open.type='button';open.onclick=()=>watch(item);
  card.append(top,rows,open);return card;
 }
 function drawTimeline(item,index){
  const lane=make('section','replay-compare-timeline');
  const title=make('div','replay-compare-timeline-head');
  title.append(make('strong','','REPLAY '+(index?'B':'A')),
   make('span','',filteredGoals(item).length+' matching goal markers'));
  const track=make('div','replay-compare-track');track.setAttribute('aria-label','Replay '+(index?'B':'A')+' goal marker timeline');
  const markers=filteredGoals(item).sort((a,b)=>a.frameNo-b.frameNo).slice(0,128);
  if(!item.frames||markers.length===0){
   const empty=make('p','replay-compare-empty',!item.frames?
    'Recording duration unavailable — position cannot be calculated.':'No recorded goal markers for this filter.');
   lane.append(title,empty);return lane;
  }
  for(const marker of markers){
   const button=make('button','replay-compare-marker team-'+marker.teamId);
   button.type='button';
   const fraction=Math.min(1,Math.max(0,marker.frameNo/item.frames));
   button.style.left=(fraction*100)+'%';
   const team=marker.teamId===1?'Red':'Blue';
   button.setAttribute('aria-label','Watch '+team+' goal marker at '+format(marker.frameNo)+' in replay '+(index?'B':'A'));
   button.title=team+' marker · '+format(marker.frameNo);
   button.onclick=()=>watch(item,marker.frameNo);
   track.append(button);
  }
  const ticks=make('div','replay-compare-ticks');
  ticks.append(make('small','','0:00'),make('small','',format(Math.floor(item.frames/2))),make('small','',format(item.frames)));
  lane.append(title,track,ticks);return lane;
 }
 function paint(){
  const [a,b]=selected();
  comparisons.replaceChildren();difference.replaceChildren();timelines.replaceChildren();
  if(!a||!b||a.id===b.id){
   summary.textContent=recordings.length<2?'Save or import at least two HBR2 recordings in My Games to compare them.':
    'Choose two different locally stored recordings to start.';
   return;
  }
  summary.textContent='Two local HBR2 recordings selected. Goal markers are events in the saved replay, not certified results.';
  comparisons.append(compareCard(a,0),compareCard(b,1));
  const aGoals=goals(a),bGoals=goals(b);
  const delta=make('p','replay-compare-delta');
  const goalDelta=bGoals.length-aGoals.length;
  const goalText=goalDelta===0?'Both have the same number of recorded goal markers.':
   'Replay B has '+Math.abs(goalDelta)+(goalDelta>0?' more':' fewer')+' recorded goal marker'+(Math.abs(goalDelta)===1?'':'s')+'.';
  const timeDelta=Math.round((b.frames-a.frames)/60);
  const timeText=a.frames&&b.frames?
   ' Recorded duration difference: '+Math.abs(timeDelta)+'s '+(timeDelta>0?'longer in B.':timeDelta<0?'shorter in B.':'(same duration).'):
   ' Duration comparison unavailable for one or both recordings.';
  delta.textContent=goalText+timeText;
  difference.append(delta);
  timelines.append(drawTimeline(a,0),drawTimeline(b,1));
 }
 selectors.forEach(s=>s.addEventListener('change',paint));
 side.addEventListener('change',paint);
 refresh.onclick=refreshLibrary;
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!games.hidden)refreshLibrary();});
 games.addEventListener('focusin',()=>{
  if(games.hidden||document.activeElement?.closest('.replay-compare-studio'))return;
  refreshLibrary();
 });
 refreshLibrary();
})();