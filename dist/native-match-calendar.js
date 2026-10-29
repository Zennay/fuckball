'use strict';
// Calendar for the signed-in account's actual native-server unranked match receipts.
// No synthetic games, rating or server activity tracking; last 50 receipts only.
(function(){
 let month=null;
 const weekdays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
 const node=(tag,label,cls)=>{const e=document.createElement(tag);if(label!==null)e.textContent=label;if(cls)e.className=cls;return e;};
 const localDay=at=>{const d=new Date(at);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
 const result=row=>row.winner===0?'D':row.winner===row.team?'W':'L';
 const isReceipt=row=>row?.source==='native-server'&&row.ranked===false&&
  /^[0-9a-f]{24}$/.test(row.id||'')&&['bot','1v1','2v2','3v3','4v4'].includes(row.mode)&&
  [1,2].includes(row.team)&&[0,1,2].includes(row.winner)&&
  Number.isSafeInteger(row.at)&&row.at>0&&Number.isFinite(new Date(row.at).getTime())&&
  [row.red,row.blue].every(x=>Number.isSafeInteger(x)&&x>=0&&x<=999)&&
  Number.isSafeInteger(row.playedFrames)&&row.playedFrames>0;
 const monthKey=day=>day.slice(0,7);
 const monthLabel=key=>new Date(Number(key.slice(0,4)),Number(key.slice(5,7))-1,1)
  .toLocaleDateString(undefined,{month:'long',year:'numeric'});
 const safeText=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const download=(filename,content)=>{
  const u=URL.createObjectURL(new Blob([content],{type:'text/html;charset=utf-8'}));
  const a=document.createElement('a');a.href=u;a.download=filename;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000);
 };
 function calendarHtml(rows,selectedMonth,selectedDay,total){
  const ordered=rows.slice().sort((a,b)=>a.at-b.at);
  const counts={W:0,D:0,L:0};
  for(const row of ordered)counts[result(row)]++;
  const lines=ordered.map(row=>{
   const score=row.team===1?[row.red,row.blue]:[row.blue,row.red];
   return '<tr><td>'+safeText(new Date(row.at).toLocaleString())+'</td><td>'+
    safeText(row.mode)+'</td><td>'+result(row)+'</td><td>'+score.join('–')+
    '</td><td>'+Math.floor(row.playedFrames/60)+'s</td></tr>';
  }).join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
   '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">'+
   '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Fuckball private activity month</title>'+
   '<style>body{font:16px system-ui;max-width:850px;margin:auto;padding:20px;color:#123037}'+
   'h1{line-height:1.2}table{width:100%;border-collapse:collapse}th,td{padding:9px;border:1px solid #9ab;text-align:left}'+
   '@media print{body{padding:0}}</style></head><body><h1>Private unranked monthly play</h1>'+
   '<p><b>'+safeText(selectedDay||monthLabel(selectedMonth))+'</b> · '+ordered.length+
   ' selected, filter-matching result'+(ordered.length===1?'':'s')+
   ' of '+total+' recent authenticated native-server receipts. '+
   counts.W+' wins, '+counts.D+' draws, '+counts.L+' losses. This is not an official season, a lifetime history or a ranked table.</p>'+
   '<table><thead><tr><th>Local completion</th><th>Mode</th><th>Outcome</th><th>My score</th><th>Active seconds</th></tr></thead><tbody>'+lines+'</tbody></table>'+
   '<p><small>Generated locally. No username, opponent identity, match identifier, chat or access token included.</small></p></body></html>';
 }
 function render(host,receipts,scope,chosenDay,onSelect,authorized){
  if(!host)return null;
  host.replaceChildren();
  if(typeof authorized!=='function'||!authorized()||!Array.isArray(receipts)||!Array.isArray(scope))return null;
  const rows=receipts.filter(isReceipt).slice(0,50);
  // The caller owns the authenticated server receipt set and applies mode
  // and period. Intersect IDs with only those genuine receipts; never export
  // excluded rows merely because they share a local calendar month.
  const permitted=new Set(scope.filter(isReceipt).map(row=>row.id));
  const outcomeSelect=document.querySelector('.server-results select[aria-label="Filter online results"]');
  const outcomeName=outcomeSelect?.value||'all';
  const outcomeCode={win:'W',draw:'D',loss:'L'}[outcomeName]||null;
  const matches=row=>permitted.has(row.id)&&(!outcomeCode||result(row)===outcomeCode);
  const matching=rows.filter(matches);
  const dates=[...new Set(rows.map(row=>monthKey(localDay(row.at))))].sort().reverse();
  const activeDay=chosenDay&&/^\d{4}-\d{2}-\d{2}$/.test(chosenDay)?chosenDay:null;
  if(!dates.length)return null;
  if(!month||!dates.includes(month))month=dates[0];
  const frame=node('section',null,'native-activity-calendar');
  frame.setAttribute('aria-label','Recent authenticated online match calendar');
  const title=node('h3','MY RECENT MATCH CALENDAR');
  const intro=node('p','Only '+matching.length+' of your '+rows.length+
   ' genuine recent unranked results match the current filters. Calendar counts and private exports use this same selection. Dates use your device’s local timezone; older matches and other servers are not included.','native-calendar-info');
  const toolbar=node('div',null,'native-calendar-toolbar');
  const caption=node('label','Month');
  const picker=node('select',null);picker.setAttribute('aria-label','Choose a month with verified recent results');
  dates.forEach(value=>picker.add(new Option(monthLabel(value),value)));
  picker.value=month;caption.append(picker);
  picker.onchange=()=>{
   if(!authorized()||!dates.includes(picker.value))return;
   month=picker.value;onSelect(null);
  };
  const clear=node('button','Show all days','native-calendar-clear');clear.type='button';
  clear.hidden=!activeDay;clear.onclick=()=>{if(authorized())onSelect(null);};
  // The selected day is part of the visible result filter too; when set,
  // the download must never silently include other days in the month.
  const exportRows=matching.filter(row=>monthKey(localDay(row.at))===month&&
   (!activeDay||localDay(row.at)===activeDay));
  const printable=node('button',activeDay?'↓ Export selected day':'↓ Export filtered month','native-calendar-export');
  printable.type='button';printable.disabled=!exportRows.length;
  printable.title='Private printable HTML: '+exportRows.length+
   ' selected genuine server results, no username or receipt ID';
  const exportSummary=node('p',exportRows.length+' selected result'+
   (exportRows.length===1?'':'s')+' will be included in this private '+(activeDay?'day':'month')+
   ' report. Excluded games are never exported.','native-calendar-export-count');
  exportSummary.setAttribute('role','status');
  printable.onclick=()=>{
   if(!authorized()||!exportRows.length)return;
   try{
    download('fuckball-my-matches-'+(activeDay||month)+'.html',
     calendarHtml(exportRows,month,activeDay,rows.length));
   }catch{info.textContent='Could not export the selected results locally.';}
  };
  toolbar.append(caption,clear,printable);
  const info=node('p','Select a highlighted day to see its real match cards and use the existing filters.','native-calendar-info');
  if(activeDay)info.textContent='Selected '+activeDay+'. Match cards below are filtered to this local calendar day.';
  const grid=node('div',null,'native-calendar-grid');
  grid.setAttribute('aria-label',monthLabel(month)+' recent match dates');
  for(const day of weekdays)grid.append(node('span',day,'native-calendar-weekday'));
  const y=Number(month.slice(0,4)),m=Number(month.slice(5,7))-1;
  const pad=(new Date(y,m,1).getDay()+6)%7;
  for(let i=0;i<pad;i++){
   const spacer=node('span',null,'native-calendar-empty');spacer.setAttribute('aria-hidden','true');grid.append(spacer);
  }
  const scoped=new Set(matching.map(x=>x.id));
  const days=new Date(y,m+1,0).getDate();
  const keys=new Map();
  rows.forEach(row=>{const key=localDay(row.at);if(!keys.has(key))keys.set(key,[]);keys.get(key).push(row);});
  for(let n=1;n<=days;n++){
   const key=month+'-'+String(n).padStart(2,'0');
   const existing=keys.get(key)||[],matched=existing.filter(row=>scoped.has(row.id));
   const button=node('button',null,'native-calendar-day');
   button.type='button';button.setAttribute('aria-label',n+' '+monthLabel(month)+': '+
    matched.length+' filtered of '+existing.length+' verified recent results');
   button.append(node('b',String(n)));
   if(existing.length){
    button.classList.add('has-match');
    const badges=node('span',null,'native-calendar-day-count');
    const stat={W:0,D:0,L:0};for(const r of matched)stat[result(r)]++;
    badges.textContent=matched.length+' shown · '+stat.W+'W '+stat.D+'D '+stat.L+'L';
    button.append(badges);
    button.title=matched.length+' filtered results of '+existing.length+
     ' verified unranked matches on '+key;
    if(activeDay===key)button.classList.add('selected');
    if(!matched.length){button.disabled=true;button.title+='; no results matching current filters';}
    button.onclick=()=>{if(authorized())onSelect(activeDay===key?null:key);};
   }else{button.disabled=true;button.classList.add('no-match');}
   grid.append(button);
  }
  const hint=node('p','Day badges and downloads reflect your current filters, not unselected games. Blank days may fall outside the last 50 server results; no inferred inactivity or ranking.','native-calendar-info');
  frame.append(title,intro,toolbar,exportSummary,info,grid,hint);host.append(frame);
  const selected=activeDay?new Set((keys.get(activeDay)||[]).filter(matches).map(x=>x.id)):null;
  return selected;
 }
 window.FuckballNativeMatchCalendar={render};
})();