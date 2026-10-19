'use strict';
// Aggregate actual HBR2 metadata already stored on THIS device, never public or
// server-authenticated ratings. No upload, telemetry or extra replay decoding.
(function(){
 const games=document.getElementById('gamesView');
 if(!games||typeof ReplayLibrary==='undefined')return;
 const panel=document.createElement('section');panel.className='local-replay-insights';
 panel.setAttribute('aria-label','Local replay insights');
 const head=document.createElement('header');head.className='replay-insights-head';
 const intro=document.createElement('div');
 const eyebrow=document.createElement('span');eyebrow.className='eyebrow';eyebrow.textContent='DEVICE-LOCAL REVIEW';
 const title=document.createElement('h2');title.textContent='REPLAY INSIGHTS.';
 const description=document.createElement('p');
 description.textContent='Your own saved HBR2 files: recorded duration, goal markers and library activity. Not official matches, skills, ranked stats or verified results.';
 intro.append(eyebrow,title,description);
 const refresh=document.createElement('button');refresh.type='button';refresh.textContent='↻ Refresh insights';
 head.append(intro,refresh);
 const filters=document.createElement('div');filters.className='replay-insights-filters';
 const periodLabel=document.createElement('label');periodLabel.textContent='Saved';
 const period=document.createElement('select');period.setAttribute('aria-label','Filter replay insights by saved date');
 for(const [value,label] of [['all','All dates'],['30','Last 30 days'],['90','Last 90 days'],['365','Last year']])
  period.add(new Option(label,value));
 periodLabel.append(period);
 const tagLabel=document.createElement('label');tagLabel.textContent='Collection';
 const tag=document.createElement('select');tag.setAttribute('aria-label','Filter replay insights by collection');
 tag.add(new Option('Every collection','all'));tagLabel.append(tag);
 const favoritesLabel=document.createElement('label');favoritesLabel.className='replay-insights-favorite';
 const favorites=document.createElement('input');favorites.type='checkbox';
 favoritesLabel.append(favorites,document.createTextNode('Favorites only'));
 filters.append(periodLabel,tagLabel,favoritesLabel);
 const summary=document.createElement('p');summary.className='replay-insights-status';summary.setAttribute('role','status');
 summary.setAttribute('aria-live','polite');
 const metrics=document.createElement('div');metrics.className='replay-insights-metrics';
 const trends=document.createElement('div');trends.className='replay-insights-trends';
 const chartTitle=document.createElement('h3');chartTitle.textContent='REPLAYS SAVED · LAST 4 WEEKS';
 const chartNote=document.createElement('p');
 chartNote.textContent='Bars show when recordings were added to this browser — not when the original matches took place.';
 const chart=document.createElement('div');chart.className='replay-insights-chart';chart.setAttribute('aria-label','Saved replay counts in four consecutive 7-day windows');
 trends.append(chartTitle,chartNote,chart);
 const section=document.createElement('div');section.className='replay-insights-top';
 const h3=document.createElement('h3');h3.textContent='MOST EVENTFUL RECORDINGS';
 const top=document.createElement('div');top.className='replay-insights-rows';
 section.append(h3,top);
 const foot=document.createElement('p');foot.className='replay-insights-foot';
 foot.textContent='This overview is calculated only from your local replay index. No opponents, accounts, club rankings or match results are inferred.';
 panel.append(head,filters,summary,metrics,trends,section,foot);
 const gallery=games.querySelector('.goal-gallery'),localList=document.getElementById('gamesList');
 games.insertBefore(panel,gallery||localList);
 let generation=0,items=[],busy=false;
 const current=()=>Date.now();
 const valid=item=>item&&typeof item==='object'&&
  typeof item.id==='string'&&/^[0-9a-f]{32}$/.test(item.id)&&
  Number.isSafeInteger(item.createdAt)&&item.createdAt>0&&item.createdAt<=current()+86400000&&
  Number.isSafeInteger(item.frames)&&item.frames>=0&&item.frames<=86400000&&
  Number.isSafeInteger(item.size)&&item.size>=0&&item.size<=32*1024*1024&&
  Array.isArray(item.goals)&&item.goals.length<=128;
 const verifiedGoals=item=>item.goals.filter(g=>g&&Number.isSafeInteger(g.frameNo)&&
  g.frameNo>=0&&(!item.frames||g.frameNo<=item.frames)&&[1,2].includes(g.teamId));
 const goalCount=item=>verifiedGoals(item).length;
 const duration=frames=>{
  const mins=Math.floor(frames/3600);
  const secs=Math.floor((frames%3600)/60);
  return mins+'m '+String(secs).padStart(2,'0')+'s';
 };
 function metric(label,value,sub){
  const element=document.createElement('article');element.className='replay-insights-metric';
  const name=document.createElement('span');name.textContent=label;
  const main=document.createElement('strong');main.textContent=value;
  const hint=document.createElement('small');hint.textContent=sub;
  element.append(name,main,hint);return element;
 }
 async function watch(item){
  if(busy)return;busy=true;
  try{
   const saved=await ReplayLibrary.get(item.id);
   if(saved.item.id!==item.id||saved.bytes.length>32*1024*1024)throw Error('The replay is unavailable.');
   loadReplay(saved.bytes,item.name||'Local replay');
   activeLocalReplayId=item.id;
   if(typeof refreshReplayBookmarks==='function')await refreshReplayBookmarks();
   if(typeof refreshReplayNotes==='function')await refreshReplayNotes();
  }catch(error){summary.textContent='Cannot open recording: '+(error?.message||'local storage unavailable');}
  finally{busy=false;}
 }
 function paint(){
  const cutoff=period.value==='all'?0:current()-Number(period.value)*86400000;
  const shown=items.filter(item=>item.createdAt>=cutoff&&
   (!favorites.checked||item.favorite===true)&&
   (tag.value==='all'||(item.tags||[]).some(t=>typeof t==='string'&&t.toLocaleLowerCase()===tag.value)));
  const frames=shown.reduce((sum,item)=>sum+item.frames,0);
  const goals=shown.flatMap(verifiedGoals);
  const red=goals.filter(g=>g.teamId===1).length,blue=goals.length-red;
  const favoritesCount=shown.filter(item=>item.favorite===true).length;
  metrics.replaceChildren(
   metric('RECORDINGS',String(shown.length),'Device-owned HBR2 files'),
   metric('RECORDED DURATION',duration(frames),'Total stored replay frames'),
   metric('GOAL MARKERS',String(goals.length),red+' red · '+blue+' blue'),
   metric('FAVORITES',String(favoritesCount),'Marked in this library'));
  summary.textContent=shown.length+' of '+items.length+' saved recordings in this view. All figures are local and unverified.';
  top.replaceChildren();
  const popular=[...shown].sort((a,b)=>goalCount(b)-goalCount(a)||b.frames-a.frames||b.createdAt-a.createdAt).slice(0,5);
  if(!popular.length){const empty=document.createElement('p');empty.textContent='No saved recordings match these filters.';top.append(empty);}
  for(const item of popular){
   const row=document.createElement('article');row.className='replay-insights-row';
   const desc=document.createElement('div');
   const name=document.createElement('strong');name.textContent=String(item.name||'Replay').slice(0,100);
   const info=document.createElement('small');
   info.textContent=goalCount(item)+' goal markers · '+duration(item.frames)+' recorded · '+new Date(item.createdAt).toLocaleDateString();
   desc.append(name,info);
   const play=document.createElement('button');play.type='button';play.textContent='▶ Watch';
   play.setAttribute('aria-label','Watch saved local replay '+String(item.name||'Replay').slice(0,100));
   play.onclick=()=>watch(item);
   row.append(desc,play);top.append(row);
  }
  chart.replaceChildren();
  const now=current(),weekly=Array.from({length:4},(_,index)=>{
   const end=now-(3-index)*7*86400000;
   const start=end-7*86400000;
   return items.filter(item=>item.createdAt>start&&item.createdAt<=end).length;
  });
  const max=Math.max(1,...weekly);
  weekly.forEach((count,i)=>{
   const bar=document.createElement('div');bar.className='replay-insights-week';
   const number=document.createElement('span');number.textContent=String(count);
   const column=document.createElement('div');column.className='replay-insights-bar';
   const fill=document.createElement('span');fill.style.height=Math.max(count?8:0,Math.round(count/max*100))+'%';
   column.append(fill);
   const legend=document.createElement('small');legend.textContent=i===3?'This week':(3-i)+'w ago';
   bar.setAttribute('aria-label',count+' saved replays, '+legend.textContent);
   bar.append(number,column,legend);chart.append(bar);
  });
 }
 async function load(){
  const seq=++generation;refresh.disabled=true;summary.textContent='Reading your local replay index…';
  try{
   const rows=await ReplayLibrary.list();
   if(seq!==generation)return;
   if(!Array.isArray(rows)||rows.length>30||!rows.every(valid))
    throw Error('Replay library metadata is unavailable or inconsistent.');
   items=rows;
   const choices=new Map();
   for(const item of items){
    for(const name of ReplayLibrary.normalizeTags(item.tags)){
     const key=name.toLocaleLowerCase();if(!choices.has(key))choices.set(key,name);
    }
   }
   const previous=tag.value;
   tag.replaceChildren(new Option('Every collection','all'));
   for(const [key,name] of [...choices].sort((a,b)=>a[1].localeCompare(b[1])))tag.add(new Option(name,key));
   tag.value=choices.has(previous)?previous:'all';
   paint();
  }catch(error){
   if(seq===generation){items=[];metrics.replaceChildren();top.replaceChildren();chart.replaceChildren();
    summary.textContent='Replay insights unavailable: '+(error?.message||'local storage blocked');}
  }finally{if(seq===generation)refresh.disabled=false;}
 }
 period.onchange=()=>paint();favorites.onchange=()=>paint();tag.onchange=()=>paint();refresh.onclick=load;
 const originalShowView=showView;
 showView=function(next){originalShowView(next);if(next==='games')load();};
 // Refresh after normal My Games mutations without changing their persistence.
 const originalRender=renderMyGames;
 renderMyGames=async function(...args){
  const value=await originalRender(...args);
  if(!games.hidden)load();
  return value;
 };
})();
