'use strict';
// Optional, device-local entry points: no online history or server tracking.
(function(){
 const home=document.getElementById('homeView');
 if(!home||typeof ReplayLibrary==='undefined')return;
 const make=(tag,klass,content)=>{
  const el=document.createElement(tag);if(klass)el.className=klass;
  if(content!==undefined)el.textContent=content;return el;
 };
 const section=make('section','continue-playing');
 section.setAttribute('aria-label','Continue your local play');
 const heading=make('div','continue-playing-head');
 const intro=make('div');
 intro.append(make('span','eyebrow','ON THIS DEVICE'),make('h2','','CONTINUE PLAYING.'),
  make('p','','Your recent HBR2 recordings and offline practice, ready for another session. Human Quick Match still needs a live server.'));
 const actions=make('div','continue-playing-actions');
 const library=make('button','','My Games ↗');library.type='button';
 const practice=make('button','','Practice Lab ↗');practice.type='button';
 actions.append(library,practice);heading.append(intro,actions);
 const grid=make('div','continue-playing-grid');
 const note=make('p','continue-playing-note','No personal data is uploaded by this panel.');
 note.setAttribute('role','status');note.setAttribute('aria-live','polite');
 section.append(heading,grid,note);
 const lab=home.querySelector('.practice-lab');
 const cards=home.querySelector('.mode-cards');
 if(lab)lab.insertAdjacentElement('beforebegin',section);
 else if(cards)cards.insertAdjacentElement('afterend',section);
 else home.append(section);
 library.onclick=()=>document.getElementById('tabReplay')?.click();
 practice.onclick=()=>{
  const block=home.querySelector('.practice-lab');
  const disclosure=home.querySelector('.practice-lab-disclosure');
  if(disclosure){disclosure.open=true;block?.scrollIntoView({behavior:'smooth',block:'start'});return;}
  document.getElementById('quickPractice')?.click();
 };
 let busy=false,version=0;
 const date=timestamp=>new Date(timestamp).toLocaleDateString(undefined,{month:'short',day:'numeric'});
 const duration=frames=>Number.isSafeInteger(frames)&&frames>0?
  Math.floor(frames/3600)+'m '+String(Math.floor(frames%3600/60)).padStart(2,'0')+'s':'Length unknown';
 function recentPractice(){
  const sources=[
   {key:'fuckball-local-goal-rush-history-v1',kind:'Goal Rush',valid:x=>
    [60,120,180].includes(x.duration)&&[1,3,5].includes(x.target)&&
    Number.isSafeInteger(x.goals)&&x.goals>=0&&x.goals<=999&&typeof x.completed==='boolean',
    title:x=>x.goals+' / '+x.target+' recorded goals'},
   {key:'fuckball.teamwork-native-drill.v1',kind:'Teamwork',valid:x=>
    [120,180,300].includes(x.seconds)&&[2,4,6].includes(x.target)&&
    Number.isSafeInteger(x.links)&&x.links>=0&&x.links<=99&&typeof x.completed==='boolean',
    title:x=>x.links+' / '+x.target+' teammate kick links'},
   {key:'fuckball.native-sudden-death.v1',kind:'Sudden Death',valid:x=>
    [3,5,7].includes(x.bestOf)&&[60,90,120].includes(x.duration)&&
    ['human','ai','draw'].includes(x.winner)&&
    Number.isSafeInteger(x.human)&&Number.isSafeInteger(x.ai)&&Number.isSafeInteger(x.draws)&&
    x.human>=0&&x.ai>=0&&x.draws>=0&&Array.isArray(x.rounds)&&
    x.rounds.length<=x.bestOf&&x.human+x.ai+x.draws===x.rounds.length,
    title:x=>'You '+x.human+' · AI '+x.ai+' · '+x.draws+' drawn rounds'},
   {key:'fuckball.local-practice-journal.v1',kind:'Solo Practice',valid:x=>
    ['bot','practice','2v2','4v4'].includes(x.mode)&&[1,2].includes(x.side)&&
    Number.isSafeInteger(x.red)&&x.red>=0&&x.red<=999&&
    Number.isSafeInteger(x.blue)&&x.blue>=0&&x.blue<=999,
    title:x=>'Red '+x.red+' · Blue '+x.blue}
  ];
  const results=[];
  for(const source of sources){
   let entries;
   try{entries=JSON.parse(localStorage.getItem(source.key)||'[]');}catch{continue;}
   if(!Array.isArray(entries))continue;
   for(const entry of entries.slice(0,30)){
    if(!entry||!Number.isSafeInteger(entry.at)||entry.at<=0||
      entry.at>Date.now()+86400000||!source.valid(entry))continue;
    results.push({kind:source.kind,at:entry.at,title:source.title(entry)});
   }
  }
  return results.sort((a,b)=>b.at-a.at)[0]||null;
 }
 const validReplay=r=>r&&typeof r.id==='string'&&/^[0-9a-f]{32}$/.test(r.id)&&
  typeof r.name==='string'&&r.name.length<=100&&
  Number.isSafeInteger(r.createdAt)&&r.createdAt>0&&r.createdAt<=Date.now()+86400000&&
  Number.isSafeInteger(r.size)&&r.size>0&&r.size<=32*1048576&&
  Number.isSafeInteger(r.frames)&&r.frames>=0&&r.frames<=86400000;
 async function watch(item){
  if(busy)return;busy=true;note.textContent='Opening local recording…';
  try{
   const saved=await ReplayLibrary.get(item.id);
   if(saved.item.id!==item.id||saved.bytes.length>32*1048576)
    throw Error('Saved recording is unavailable.');
   loadReplay(saved.bytes,item.name);
   activeLocalReplayId=item.id;
   if(typeof refreshReplayBookmarks==='function')await refreshReplayBookmarks();
   if(typeof refreshReplayNotes==='function')await refreshReplayNotes();
   note.textContent='Replay opened from this browser.';
  }catch(error){note.textContent='Could not open replay: '+(error.message||'Storage error');}
  finally{busy=false;}
 }
 function card(title,subtitle,tag,buttonText,handler){
  const box=make('article','continue-playing-card');
  const badge=make('span','continue-playing-badge',tag);
  const name=make('strong','',title);
  const description=make('p','',subtitle);
  const button=make('button','',buttonText);button.type='button';button.onclick=handler;
  box.append(badge,name,description,button);
  return box;
 }
 async function render(){
  const token=++version;
  try{
   const all=(await ReplayLibrary.list()).filter(validReplay).slice(0,30);
   if(token!==version)return;
   grid.replaceChildren();
   const sorted=all.sort((a,b)=>Number(b.favorite===true)-Number(a.favorite===true)||b.createdAt-a.createdAt);
   // Keep one or two recording shortcuts; no full library duplication on the Play home.
   for(const item of sorted.slice(0,2)){
    const position=window.FuckballReplayResume?.get?.(item.id);
    const clock=position?Math.floor(position.ms/60000)+'m '+String(Math.floor(position.ms/1000)%60).padStart(2,'0')+'s':'';
    grid.append(card(item.name,duration(item.frames)+' recorded · saved '+date(item.createdAt)+
      (position?' · unfinished at '+clock:''),
     item.favorite===true?'★ FAVORITE REPLAY':'LOCAL HBR2 REPLAY',
     position?'▶ Continue at '+clock:'▶ Watch replay',async()=>{
      if(!position)return watch(item);
      const success=await window.FuckballReplayResume.open(item.id);
      if(!success)note.textContent='Could not resume. Open My Games to inspect your private saved position.';
    }));
   }
   const latest=recentPractice();
   if(latest){
    grid.append(card(latest.kind,latest.title+' · '+date(latest.at),
     'LAST LOCAL PRACTICE','Open practice',()=>practice.click()));
   }else{
    grid.append(card('Train against AI','Try a goal challenge, practice teamwork or play your first solo match.',
     'OFFLINE PRACTICE','Start practice',()=>practice.click()));
   }
   if(!all.length&&latest===null){
    note.textContent='Your first locally saved replay or completed drill will appear here automatically.';
   }else note.textContent='Personal device shortcuts only · not ranked or server-verified history.';
  }catch(error){
   if(token!==version)return;
   grid.replaceChildren(card('Your local recordings','Open My Games to import or view HBR2 files.',
    'STORAGE UNAVAILABLE','Open My Games',()=>library.click()));
   note.textContent='Could not read browser replay storage: '+(error.message||'Storage unavailable');
  }
 }
 document.getElementById('tabHome')?.addEventListener('click',()=>render());
 window.addEventListener('focus',()=>{if(!home.hidden)render();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!home.hidden)render();});
 window.addEventListener('storage',()=>{if(!home.hidden)render();});
 render();
})();