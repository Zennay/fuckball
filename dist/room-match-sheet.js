'use strict';
// Read-only, manually exported Custom Room rosters. Never a match result receipt,
// account directory, ranked claim, or an official competition team sheet.
(function(){
 const pane=document.getElementById('menuMatchPane');
 if(!pane)return;
 const panel=document.createElement('section');panel.className='native-match-sheet';
 panel.setAttribute('aria-label','Current Custom Room match sheet');
 const heading=document.createElement('div');heading.className='native-match-sheet-head';
 const title=document.createElement('strong');title.textContent='LIVE MATCH SHEET.';
 const badge=document.createElement('span');badge.textContent='OBSERVED · UNOFFICIAL';
 heading.append(title,badge);
 const description=document.createElement('p');
 description.textContent='See the actual current Red, Blue and inactive rosters from your Custom Room. Export only when you intend to share player names. This is a point-in-time snapshot, not an official result or verified lineup.';
 const score=document.createElement('p');score.className='native-match-sheet-score';
 const counters=document.createElement('p');counters.className='native-match-sheet-counts';
 const rows=document.createElement('div');rows.className='native-match-sheet-roster';
 const buttons=document.createElement('div');buttons.className='native-match-sheet-actions';
 const status=document.createElement('p');status.className='native-match-sheet-status';
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 function button(text,fn){
  const item=document.createElement('button');item.type='button';item.textContent=text;
  item.addEventListener('click',fn);buttons.append(item);return item;
 }
 const refresh=button('↻ Refresh lineup',()=>{render();status.textContent='Current visible roster refreshed. No changes were sent to the room.';});
 const copy=button('Copy team list',()=>transfer('copy'));
 const csv=button('↓ Export CSV',()=>transfer('csv'));
 const svg=button('↓ Export lineup card SVG',()=>transfer('svg'));
 panel.append(heading,description,score,counters,rows,buttons,status);
 pane.append(panel);panel.hidden=true;
 function snapshot(){
  const live=typeof serverLink!=='undefined'?serverLink:null;
  if(!live?.room||live.quickMatchMode||!room?.state||
     !Array.isArray(room.state.players))return null;
  const players=room.state.players;
  if(players.length>128)return null;
  const roster=[];
  const seen=new Set();
  for(const p of players){
   if(!Number.isSafeInteger(p?.id)||p.id<0||seen.has(p.id)||
      ![0,1,2].includes(p.team?.id))continue;
   seen.add(p.id);
   const raw=typeof p.name==='string'?p.name.trim():'Player';
   const name=raw.slice(0,32).replace(/[\u0000-\u001f\u007f-\u009f]/g,'').trim()||'Player';
   const bot=p.aiControlled===true||(typeof botIds!=='undefined'&&botIds?.has?.(p.id));
   roster.push({name,team:p.team.id,bot,host:p.id===live.roomControl?.owner});
  }
  const g=room.gameState;
  const valid=n=>Number.isSafeInteger(n)&&n>=0&&n<=999;
  const actual=valid(g?.redScore)&&valid(g?.blueScore)&&
   Number.isFinite(g?.timeElapsed)&&g.timeElapsed>=0&&g.timeElapsed<=86400;
  const score=actual?{red:g.redScore,blue:g.blueScore,seconds:Math.floor(g.timeElapsed)}:null;
  return {roster,score,at:new Date(),state:typeof started!=='undefined'&&started?
   (typeof paused!=='undefined'&&paused?'PAUSED':'IN PROGRESS'):'LOBBY / INTERMISSION'};
 }
 function group(roster,team){return roster.filter(x=>x.team===team);}
 function mode(team){return team===1?'RED':team===2?'BLUE':'INACTIVE / SPECTATING';}
 function formatClock(seconds){return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
 function line(p){return p.name+(p.bot?' · BOT':'')+(p.host?' · HOST':'');}
 function summary(data){
  return data.score?'Red '+data.score.red+' – '+data.score.blue+' Blue · '+
   formatClock(data.score.seconds)+' elapsed · '+data.state:
   'No active match score available · '+data.state;
 }
 function render(){
  const data=snapshot();panel.hidden=!data;
  if(!data){rows.replaceChildren();score.textContent='';counters.textContent='';return;}
  score.textContent=summary(data);
  counters.textContent='Red '+group(data.roster,1).length+' · Blue '+group(data.roster,2).length+
   ' · inactive '+group(data.roster,0).length+' · '+data.roster.length+' visible players';
  rows.replaceChildren();
  for(const team of [1,2,0]){
   const section=document.createElement('section');
   section.className='native-match-sheet-team native-match-sheet-team-'+team;
   const title=document.createElement('strong');title.textContent=mode(team);
   const list=document.createElement('ul');
   const candidates=group(data.roster,team);
   if(!candidates.length){
    const empty=document.createElement('li');empty.textContent='No players shown';list.append(empty);
   }else for(const player of candidates){
    const item=document.createElement('li');item.textContent=line(player);list.append(item);
   }
   section.append(title,list);rows.append(section);
  }
  copy.disabled=csv.disabled=svg.disabled=!data.roster.length;
 }
 const permission=()=>window.confirm('Export visible player names and team assignments from your current Custom Room? This data can identify other players. Share only with their consent. No server upload is performed.');
 function textSummary(data){
  return ['FUCKBALL · CUSTOM ROOM MATCH SHEET',
   'Observed '+data.at.toLocaleString()+' · UNOFFICIAL / NOT RANKED',
   summary(data),'',
   ...[1,2,0].flatMap(team=>[mode(team),...group(data.roster,team).map(p=>'  • '+line(p)),'']),
   'Point-in-time client observation only. The server may change lineup or results after export.'].join('\n');
 }
 function csvValue(value){
  let s=String(value);
  if(/^[=+\-@\t\r]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
 }
 function download(filename,contents,mime){
  const blob=new Blob([contents],{type:mime});
  if(blob.size>512*1024)throw Error('Match sheet exceeds safe download size.');
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;
  document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 function xml(value){return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
 function svgCard(data){
  const r=group(data.roster,1),b=group(data.roster,2),other=group(data.roster,0);
  const rows=Math.max(1,r.length,b.length);
  const height=Math.max(680,330+rows*39+other.length*31+95);
  if(height>6500)throw Error('Roster is too large for a readable share card. Export CSV instead.');
  let image='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 '+height+
   '" width="1200" height="'+height+'">'+
   '<title>Fuckball current Custom Room lineup · unofficial</title>'+
   '<rect width="1200" height="'+height+'" fill="#132d35"/>'+
   '<rect width="1200" height="12" fill="#ddffae"/>'+
   '<text x="60" y="83" font-family="system-ui,sans-serif" font-size="38" font-weight="800" fill="#edffea">FUCKBALL · LIVE MATCH SHEET</text>'+
   '<text x="60" y="123" font-family="system-ui,sans-serif" font-size="20" fill="#d0ddd7">OBSERVED · '+xml(data.at.toLocaleString())+' · UNOFFICIAL</text>'+
   '<text x="60" y="175" font-family="system-ui,sans-serif" font-size="23" fill="#e5f5df">'+xml(summary(data))+'</text>'+
   '<rect x="52" y="202" width="530" height="'+(rows*39+88)+'" rx="14" fill="#42303b"/>'+
   '<rect x="618" y="202" width="530" height="'+(rows*39+88)+'" rx="14" fill="#243f5b"/>'+
   '<text x="74" y="250" font-family="system-ui,sans-serif" font-size="29" font-weight="800" fill="#ffb2b0">RED · '+r.length+'</text>'+
   '<text x="640" y="250" font-family="system-ui,sans-serif" font-size="29" font-weight="800" fill="#a6c8ff">BLUE · '+b.length+'</text>';
  function ellipsis(value,n){const chars=Array.from(value);return chars.length>n?chars.slice(0,n-1).join('')+'…':value;}
  for(const [list,x] of [[r,74],[b,640]])for(let i=0;i<list.length;i++){
   image+='<text x="'+x+'" y="'+(293+i*39)+'" font-family="system-ui,sans-serif" font-size="22" fill="#fff">'+
    xml(ellipsis(line(list[i]),37))+'</text>';
  }
  let cursor=320+rows*39;
  image+='<text x="60" y="'+cursor+'" font-family="system-ui,sans-serif" font-size="22" font-weight="800" fill="#c0dfc9">INACTIVE / SPECTATING · '+other.length+'</text>';
  for(const player of other){
   cursor+=31;
   image+='<text x="67" y="'+cursor+'" font-family="system-ui,sans-serif" font-size="19" fill="#d6e4e2">'+
    xml(ellipsis(line(player),70))+'</text>';
  }
  image+='<text x="60" y="'+(height-45)+'" font-family="system-ui,sans-serif" font-size="16" fill="#c9d9d0">Current device snapshot only · no official result, rankings, opponent authentication or invitations</text></svg>';
  return image;
 }
 async function transfer(type){
  const data=snapshot();
  if(!data||!data.roster.length){
   status.textContent='No current Custom Room roster is available.';render();return;
  }
  if(!permission()){status.textContent='Sharing cancelled; no data exported.';return;}
  try{
   if(type==='copy'){
    if(typeof navigator.clipboard?.writeText!=='function')throw Error('Clipboard unavailable. Use CSV instead.');
    await navigator.clipboard.writeText(textSummary(data));
    status.textContent='The current team list was copied locally. Names are shared only when you paste it.';
   }else if(type==='csv'){
    const output=[['Observed UTC','Snapshot phase','Red score','Blue score','Elapsed seconds','Team','Player label','Type','Host'],
     ...data.roster.map(p=>[data.at.toISOString(),data.state,data.score?.red??'',
      data.score?.blue??'',data.score?.seconds??'',mode(p.team),p.name,p.bot?'Bot':'Human',
      p.host?'Yes':'No'])];
    const eol=String.fromCharCode(13,10);
    download('fuckball-current-room-sheet.csv',String.fromCharCode(0xFEFF)+
      output.map(row=>row.map(csvValue).join(',')).join(eol)+eol,'text/csv;charset=utf-8');
    status.textContent='Current team sheet CSV exported locally. Do not share names without consent.';
   }else if(type==='svg'){
    download('fuckball-current-room-sheet.svg',svgCard(data),'image/svg+xml;charset=utf-8');
    status.textContent='Shareable snapshot card exported locally. Changes after capture are not tracked.';
   }
  }catch(e){status.textContent='Export failed: '+(e.message||'Browser access unavailable');}
 }
 const shown=()=>typeof menuOpen!=='undefined'&&menuOpen&&!pane.hidden;
 setInterval(()=>{if(shown())render();else panel.hidden=true;},1500);
 render();
})();