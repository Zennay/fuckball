'use strict';
// Client-only grouping of authenticated native-server receipts by the elapsed
// gap between completion timestamps. Not a server session ID or ranked record.
(function(){
 const GAPS=[30,45,60,120];
 let gapMinutes=45,limit=6;
 const text=(tag,value,klass)=>{
  const el=document.createElement(tag);el.textContent=value;
  if(klass)el.className=klass;return el;
 };
 const fmt=ts=>{const d=new Date(ts);return Number.isFinite(d.getTime())?d.toLocaleString():'Unknown time';};
 const escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const result=x=>x.winner===0?'Draw':x.winner===x.team?'Win':'Loss';
 const gf=x=>x.team===1?x.red:x.blue,ga=x=>x.team===1?x.blue:x.red;
 const valid=x=>x?.source==='native-server'&&x.ranked===false&&
  typeof x.id==='string'&&/^[0-9a-f]{24}$/.test(x.id)&&
  Number.isSafeInteger(x.at)&&x.at>0&&Number.isFinite(new Date(x.at).getTime())&&[1,2].includes(x.team)&&
  [0,1,2].includes(x.winner)&&['1v1','2v2','3v3','4v4','bot'].includes(x.mode)&&
  Number.isSafeInteger(x.playedFrames)&&x.playedFrames>0&&
  [x.red,x.blue].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=999);
 function group(rows){
  const ordered=(Array.isArray(rows)?rows:[]).filter(valid)
   .slice(0,50).sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id));
  const groups=[];
  for(const entry of ordered){
   const last=groups[groups.length-1],previous=last?.rows[last.rows.length-1];
   if(!last||previous.at-entry.at>gapMinutes*60000){
    groups.push({key:entry.id,rows:[entry]});
   }else last.rows.push(entry);
  }
  return groups;
 }
 const totals=rows=>{
  const n=kind=>rows.reduce((sum,row)=>sum+Number(result(row)===kind),0);
  return {wins:n('Win'),draws:n('Draw'),losses:n('Loss'),
   goalsFor:rows.reduce((sum,row)=>sum+gf(row),0),
   goalsAgainst:rows.reduce((sum,row)=>sum+ga(row),0),
   frames:rows.reduce((sum,row)=>sum+row.playedFrames,0)};
 };
 function save(name,type,body){
  const url=URL.createObjectURL(new Blob([body],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 const ownDate=()=>new Date().toISOString().slice(0,10);
 function exportCsv(rows){
  // Fixed, receipt-validated columns. No token, handle, arbitrary formula
  // input, opponent identity, internal receipt ID or account JSON.
  const cols=[['UTC completion','Mode','Outcome','Side','Goals for','Goals against','Active seconds','Ranked'],
   ...rows.map(x=>[new Date(x.at).toISOString(),x.mode,result(x),x.team===1?'Red':'Blue',
    gf(x),ga(x),Math.floor(x.playedFrames/60),'No'])];
  const csv='\ufeff'+cols.map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(',')).join('\r\n')+'\r\n';
  save('fuckball-recent-play-session-'+ownDate()+'.csv','text/csv;charset=utf-8',csv);
 }
 function exportHtml(rows){
  const stats=totals(rows);
  const cards=rows.map(x=>'<article><b>'+escape(fmt(x.at))+' · '+escape(x.mode)+
    ' · '+result(x)+'</b><p>Red '+x.red+' : '+x.blue+
    ' · My side: '+(x.team===1?'Red':'Blue')+
    ' · Me: '+gf(x)+' – '+ga(x)+' · '+Math.floor(x.playedFrames/60)+' active sec</p></article>').join('');
  const html='<!doctype html><html lang="en"><head><meta charset="utf-8">'+
   '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; form-action &#39;none&#39;; base-uri &#39;none&#39;">'+
   '<meta name="viewport" content="width=device-width,initial-scale=1">'+
   '<title>Fuckball — Private recent play grouping</title><style>'+
   'body{font:16px system-ui,sans-serif;line-height:1.6;max-width:760px;margin:auto;padding:24px;color:#143039}'+
   'article{padding:10px 15px;border:1px solid #9ab;border-radius:8px;margin:9px 0}p{margin:6px 0}'+
   'h1{line-height:1.2}@media print{body{padding:0}}</style></head><body>'+
   '<h1>My recent play grouping</h1><p>Generated locally from '+rows.length+
   ' genuine, unranked, server-returned match receipts. These matches were grouped by at most '+
   gapMinutes+' minutes between successive recorded completion timestamps. This is not an official game session, ranked placement or lifetime tally.</p>'+
   '<p><strong>Recent grouping:</strong> '+stats.wins+' W / '+stats.draws+' D / '+stats.losses+' L. '+
   'Goals for '+stats.goalsFor+', against '+stats.goalsAgainst+
   '. Total recorded active play '+Math.floor(stats.frames/60)+' seconds.</p>'+
   cards+'<footer><small>No account names, access keys, private chat, opponents, or match identifiers included. Offline personal export only.</small></footer></body></html>';
  save('fuckball-recent-play-session-'+ownDate()+'.html','text/html;charset=utf-8',html);
 }
 function render(host,receipts,scope,selected,onSelect,authorized){
  if(!host)return null;
  host.replaceChildren();
  if(!Array.isArray(receipts)||!Array.isArray(scope)||typeof authorized!=='function'||!authorized())return null;
  const clusters=group(receipts);
  const active=clusters.find(x=>x.key===selected)||null;
  const ids=active?new Set(active.rows.map(x=>x.id)):null;
  const section=document.createElement('section');section.className='native-play-sessions';
  section.setAttribute('aria-label','Recent online match session explorer');
  const title=text('h3','RECENT PLAY SESSIONS');
  const desc=text('p','Your server stores separate, unranked match receipts—not session IDs. These are device-calculated groups based on time between recorded match completions, limited to the latest 50 server receipts.','native-session-intro');
  const top=document.createElement('div');top.className='native-session-top';
  const label=text('label','Maximum gap between results');
  const gap=document.createElement('select');gap.setAttribute('aria-label','Gap for grouping recent online results');
  GAPS.forEach(n=>gap.add(new Option(n+' min',String(n))));
  gap.value=String(gapMinutes);label.append(gap);
  gap.onchange=()=>{
   const next=Number(gap.value);if(!GAPS.includes(next)||!authorized())return;
   gapMinutes=next;limit=6;onSelect(null);
  };
  const hint=text('p',clusters.length+' estimated play group'+(clusters.length===1?'':'s')+
   ' within your '+receipts.length+' most recent native server receipts. Not lifetime data.','native-session-count');
  top.append(label,hint);
  const message=text('p',active?'Showing one estimated play group below. Your existing filters still apply.':
   'Select a group to narrow the actual online result cards below.','native-session-message');
  const clear=text('button','Show all recent results','native-session-clear');clear.type='button';
  clear.hidden=!active;clear.onclick=()=>{if(authorized())onSelect(null);};
  const grid=document.createElement('div');grid.className='native-session-grid';
  const scopeIds=new Set(scope.map(x=>x.id));
  clusters.slice(0,limit).forEach((cluster,index)=>{
   const rows=cluster.rows,stats=totals(rows),visible=rows.filter(x=>scopeIds.has(x.id));
   const box=document.createElement('article');box.className='native-session-card';
   if(active?.key===cluster.key)box.classList.add('selected');
   const heading=text('strong','GROUP '+(index+1)+' · '+rows.length+' result'+(rows.length===1?'':'s'));
   const range=text('small',fmt(rows[rows.length-1].at)+' → '+fmt(rows[0].at));
   const detail=text('p',stats.wins+' W · '+stats.draws+' D · '+stats.losses+' L · goals '+stats.goalsFor+
    '–'+stats.goalsAgainst+' · '+Math.floor(stats.frames/60)+'s active play');
   const scoped=text('small',visible.length+' result'+(visible.length===1?'':'s')+' match your chosen period/mode');
   const actions=document.createElement('div');actions.className='native-session-actions';
   const show=text('button',active?.key===cluster.key?'Selected ✓':'Show these results');
   show.type='button';show.disabled=active?.key===cluster.key||!visible.length;
   show.onclick=()=>{if(authorized())onSelect(cluster.key);};
   const csv=text('button','↓ CSV');csv.type='button';csv.title='Local download without account or receipt IDs';
   const html=text('button','↓ Print sheet');html.type='button';html.title='Offline printable summary without account or receipt IDs';
   const safeAction=action=>()=>{
    if(!authorized()){message.textContent='Session changed. Reload your own results before exporting.';return;}
    try{action(rows);message.textContent='Private session report generated locally, not uploaded.';}
    catch{message.textContent='Could not export the chosen play grouping.';}
   };
   csv.onclick=safeAction(exportCsv);html.onclick=safeAction(exportHtml);
   actions.append(show,csv,html);box.append(heading,range,detail,scoped,actions);grid.append(box);
  });
  const more=text('button','Show more play groups','native-session-more');more.type='button';
  more.hidden=clusters.length<=limit;more.onclick=()=>{
   if(!authorized())return;limit+=6;onSelect(selected||null);
  };
  section.append(title,desc,top,message,clear,grid,more);
  host.append(section);
  return ids;
 }
 window.FuckballNativePlaySessions={render};
})();