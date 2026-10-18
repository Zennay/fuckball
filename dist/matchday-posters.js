'use strict';
// Private share artwork composed from self-entered friendly data, never online outcomes.
(function(){
 const home=document.getElementById('homeView');if(!home)return;
 const LEAGUES='fuckball.local-tournaments.v1',CUPS='fuckball.private-knockout-cups.v1';
 const text=(tag,value,cls)=>{
  const e=document.createElement(tag);if(value!==undefined&&value!==null)e.textContent=String(value);
  if(cls)e.className=cls;return e;
 };
 const button=(label,fn)=>{
  const b=text('button',label);b.type='button';b.addEventListener('click',fn);return b;
 };
 const validName=(name,max=60)=>typeof name==='string'&&name.length>0&&name.length<=max&&
  !/[\u0000-\u001f\u007f-\u009f]/.test(name);
 const scoreOk=n=>n===null||(Number.isSafeInteger(n)&&n>=0&&n<=99);
 const KEY='fuckball.matchday-posters.v1';
 let preference={theme:'midnight',title:'GAME NIGHT',caption:'PRIVATE FRIENDLY'};
 try{
  const saved=JSON.parse(localStorage.getItem(KEY)||'null');
  if(saved?.version===1){
   if(['midnight','turf','light'].includes(saved.theme))preference.theme=saved.theme;
   if(validName(saved.title,36))preference.title=saved.title;
   if(validName(saved.caption,48))preference.caption=saved.caption;
  }
 }catch{}
 function readArray(key,maxChars,max){
  const raw=localStorage.getItem(key);
  if(!raw)return[];
  if(raw.length>maxChars)throw Error('Local competition data exceeds supported size.');
  const data=JSON.parse(raw);
  if(!Array.isArray(data)||data.length>max)throw Error('Local competition collection is malformed.');
  return data;
 }
 function leagueCards(){
  const entries=readArray(LEAGUES,128*1024,8),cards=[];
  for(const entry of entries){
   if(!validName(entry?.name)||!Array.isArray(entry.teams)||
    entry.teams.length<2||entry.teams.length>12||!Array.isArray(entry.fixtures)||
    entry.fixtures.length>132||entry.teams.some(t=>!validName(t,30)))continue;
   for(const [i,f]of entry.fixtures.entries()){
    if(!f||!Number.isSafeInteger(f.home)||!Number.isSafeInteger(f.away)||
     f.home<0||f.home>=entry.teams.length||f.away<0||f.away>=entry.teams.length||
     f.home===f.away||!scoreOk(f.homeScore)||!scoreOk(f.awayScore)||
     ((f.homeScore===null)!==(f.awayScore===null)))continue;
    const kickoff=f.kickoff===undefined?null:f.kickoff;
    if(kickoff!==null&&(!Number.isSafeInteger(kickoff)||kickoff<1577836800000||kickoff>4102444800000))continue;
    if(f.homeScore===null&&kickoff===null)continue;
    const kind=f.homeScore===null?'fixture':'result';
    cards.push({key:'league-'+entry.id+'-'+i,kind,competition:entry.name,
     red:entry.teams[f.home],blue:entry.teams[f.away],
     redScore:f.homeScore,blueScore:f.awayScore,
     kickoff,venue:typeof f.venue==='string'?f.venue.slice(0,60):'',
     category:'ROUND '+(Number.isSafeInteger(f.round)?f.round:'?')+' · PRIVATE LEAGUE'});
   }
  }
  return cards;
 }
 function cupCards(){
  const entries=readArray(CUPS,96*1024,8),cards=[];
  for(const entry of entries){
   const count=entry.teams?.length;
   if(!validName(entry?.name)||![2,4,8,16].includes(count)||
    entry.teams.some(t=>!validName(t,35))||!Array.isArray(entry.matches)||
    entry.matches.length!==count-1)continue;
   const rounds=Math.log2(count);
   const byRound=(r,g)=>{
    const idx=Array.from({length:r},(_,n)=>count/(2**(n+1))).reduce((s,n)=>s+n,0)+g;
    return entry.matches[idx];
   };
   const resolve=(r,g)=>{
    if(r===0){
     const m=byRound(0,g);
     if(!m||!scoreOk(m.homeScore)||!scoreOk(m.awayScore)||
      m.homeScore===null||m.awayScore===null)return null;
     if(m.homeScore>m.awayScore)return 2*g;
     if(m.homeScore<m.awayScore)return 2*g+1;
     return m.tiebreak==='home'?2*g:m.tiebreak==='away'?2*g+1:null;
    }
    const h=resolve(r-1,g*2),a=resolve(r-1,g*2+1),m=byRound(r,g);
    if(h===null||a===null||!m||!scoreOk(m.homeScore)||!scoreOk(m.awayScore)||
     m.homeScore===null||m.awayScore===null)return null;
    return m.homeScore>m.awayScore?h:m.homeScore<m.awayScore?a:
     m.tiebreak==='home'?h:m.tiebreak==='away'?a:null;
   };
   for(let r=0;r<rounds;r++){
    for(let g=0;g<count/(2**(r+1));g++){
     const m=byRound(r,g);
     if(!m||!scoreOk(m.homeScore)||!scoreOk(m.awayScore)||
      m.homeScore===null||m.awayScore===null)continue;
     const home=r===0?g*2:resolve(r-1,g*2);
     const away=r===0?g*2+1:resolve(r-1,g*2+1);
     if(home===null||away===null)continue;
     cards.push({key:'cup-'+entry.id+'-'+r+'-'+g,kind:'result',
      competition:entry.name,red:entry.teams[home],blue:entry.teams[away],
      redScore:m.homeScore,blueScore:m.awayScore,kickoff:null,venue:'',
      category:(r===rounds-1?'FINAL':'ROUND '+(r+1))+' · PRIVATE KNOCKOUT'});
    }
   }
  }
  return cards;
 }
 const section=text('section',null,'matchday-posters');
 section.setAttribute('aria-label','Private Matchday Poster Studio');
 const details=text('details');details.append(text('summary','🖼 MATCHDAY POSTER STUDIO · OPEN'));
 const content=text('div',null,'matchday-posters-body');
 const heading=text('h2','DESIGN YOUR MATCH CARD.');
 const intro=text('p','Turn a privately scheduled fixture or manually recorded friendly result into a shareable image. Always labelled UNVERIFIED. No player names, accounts, chat or server results are accessed.');
 const tools=text('div',null,'matchday-posters-tools');
 const picker=text('select');picker.setAttribute('aria-label','Choose a local friendly fixture or result');
 const refresh=button('↻ Refresh matches',refreshMatches);
 const theme=text('select');theme.setAttribute('aria-label','Poster color style');
 for(const [id,name]of [['midnight','Midnight'],['turf','Turf'],['light','Light']])
  theme.add(new Option(name,id));
 theme.value=preference.theme;
 const title=text('input');title.type='text';title.maxLength=36;title.value=preference.title;
 title.setAttribute('aria-label','Private poster headline');
 const caption=text('input');caption.type='text';caption.maxLength=48;caption.value=preference.caption;
 caption.setAttribute('aria-label','Private poster subheading');
 tools.append(picker,refresh,theme,title,caption);
 const canvas=text('canvas');canvas.width=1200;canvas.height=675;
 canvas.setAttribute('aria-label','Generated private match card preview');
 canvas.setAttribute('role','img');
 const actions=text('div',null,'matchday-posters-actions');
 const download=button('↓ Save private PNG',savePNG);
 const print=button('Print preview',()=>window.print());
 actions.append(download,print);
 const status=text('p',null,'matchday-posters-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 content.append(heading,intro,tools,canvas,actions,status);details.append(content);
 section.append(details);
 const anchor=home.querySelector('.game-night-pack')||home.querySelector('.matchday-hub')||home.querySelector('.mode-cards');
 if(anchor)anchor.insertAdjacentElement('afterend',section);else home.append(section);
 let cards=[],selected=null,problem='';
 function persist(){
  preference={
   theme:theme.value,title:title.value.trim().slice(0,36)||'GAME NIGHT',
   caption:caption.value.trim().slice(0,48)||'PRIVATE FRIENDLY'
  };
  try{localStorage.setItem(KEY,JSON.stringify({version:1,...preference}));}
  catch{status.textContent='Poster preferences are temporary: browser storage is unavailable.';}
 }
 function refreshMatches(){
  const previous=selected?.key;problem='';
  try{cards=[...leagueCards(),...cupCards()].slice(0,200);}
  catch(error){cards=[];problem=error.message||'Local competitions cannot be read.';}
  cards.sort((a,b)=>{
   const au=a.kind==='fixture'&&a.kickoff!==null?a.kickoff:Infinity;
   const bu=b.kind==='fixture'&&b.kickoff!==null?b.kickoff:Infinity;
   return au-bu||a.competition.localeCompare(b.competition);
  });
  picker.replaceChildren(new Option(cards.length?'Choose a local match':'No saved matches with schedule or result',''));
  for(const c of cards)picker.add(new Option((c.kind==='fixture'?'UPCOMING · ':'RESULT · ')+
   c.competition+' · '+c.red+' vs '+c.blue,c.key));
  selected=cards.find(c=>c.key===previous)||cards[0]||null;
  picker.value=selected?.key||'';
  download.disabled=print.disabled=!selected;
  status.textContent=problem||(selected?'Manual, unofficial local friendly data only. Ready to preview.':
   'Add a kickoff in the Tournament Desk or record a real friendly result to make a poster.');
  draw();
 }
 const wrapped=(ctx,value,max,lineHeight,startY,maxLines=2)=>{
  const words=String(value).split(/\s+/),lines=[''];
  for(const word of words){
   const next=(lines[lines.length-1]+' '+word).trim();
   if(ctx.measureText(next).width>max&&lines[lines.length-1]){
    lines.push(word);
   }else lines[lines.length-1]=next;
  }
  lines.slice(0,maxLines).forEach((line,i)=>ctx.fillText(line,startY.x,startY.y+i*lineHeight,max));
 };
 function draw(){
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const dark=theme.value!=='light';
  const background=theme.value==='midnight'?['#102c39','#1e5b4f']:
   theme.value==='turf'?['#0b4430','#147353']:['#f7f9ed','#d1e9d3'];
  const grad=ctx.createLinearGradient(0,0,1200,675);
  grad.addColorStop(0,background[0]);grad.addColorStop(1,background[1]);
  ctx.fillStyle=grad;ctx.fillRect(0,0,1200,675);
  const white=dark?'#f6fff4':'#15332d',muted=dark?'#cadccc':'#356452';
  ctx.strokeStyle=dark?'rgba(238,255,240,.12)':'rgba(36,84,61,.12)';
  ctx.lineWidth=2;ctx.strokeRect(38,38,1124,599);
  ctx.beginPath();ctx.arc(600,340,220,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.moveTo(600,40);ctx.lineTo(600,635);ctx.stroke();
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle=dark?'#d5f8b1':'#286644';ctx.font='800 31px system-ui';
  ctx.fillText((title.value.trim()||'GAME NIGHT').slice(0,36).toUpperCase(),600,105,950);
  ctx.fillStyle=muted;ctx.font='700 20px system-ui';
  ctx.fillText((caption.value.trim()||'PRIVATE FRIENDLY').slice(0,48).toUpperCase(),600,147,1000);
  if(!selected){
   ctx.font='600 30px system-ui';ctx.fillText('SELECT A SAVED PRIVATE FIXTURE',600,330,900);
   return;
  }
  ctx.fillStyle=muted;ctx.font='700 21px system-ui';
  ctx.fillText(selected.category,600,208,950);
  ctx.font='700 20px system-ui';
  ctx.fillText(selected.competition,600,244,950);
  ctx.textAlign='center';ctx.font='900 50px system-ui';
  ctx.fillStyle=dark?'#ff9e9d':'#aa3040';
  ctx.fillText(selected.red.slice(0,35),305,330,450);
  ctx.fillStyle=dark?'#9bc9ff':'#265ca5';
  ctx.fillText(selected.blue.slice(0,35),895,330,450);
  ctx.font='900 95px system-ui';ctx.fillStyle=white;
  const result=selected.kind==='result';
  ctx.fillText(result?String(selected.redScore):'–',445,435);
  ctx.fillText(result?String(selected.blueScore):'–',755,435);
  ctx.font='700 44px system-ui';ctx.fillText(result?':':'VS',600,430);
  ctx.font='600 27px system-ui';ctx.fillStyle=muted;
  const date=selected.kickoff===null?null:new Date(selected.kickoff)
   .toLocaleString(undefined,{dateStyle:'long',timeStyle:'short'});
  ctx.fillText(date||'MANUAL RESULT · TIME NOT RECORDED',600,516,1000);
  if(selected.venue)ctx.fillText('VENUE · '+selected.venue.slice(0,60),600,557,1000);
  ctx.font='800 16px system-ui';ctx.fillStyle=dark?'#f1ecb1':'#655b1f';
  ctx.fillText('PRIVATE FRIENDLY · UNVERIFIED · NOT AN OFFICIAL MATCH RESULT',600,610,1100);
 }
 picker.addEventListener('change',()=>{selected=cards.find(c=>c.key===picker.value)||null;draw();});
 for(const control of [theme,title,caption]){
  control.addEventListener(control===theme?'change':'input',()=>{persist();draw();});
 }
 function savePNG(){
  if(!selected||document.hidden)return;
  draw();
  canvas.toBlob(blob=>{
   if(!blob||blob.size<=0||blob.size>8*1048576){
    status.textContent='PNG export unavailable or too large.';return;
   }
   const url=URL.createObjectURL(blob),a=text('a');
   a.href=url;a.download='fuckball-private-match-card.png';a.click();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
   status.textContent='Private match card saved as PNG. Check any locally entered names before sharing.';
  },'image/png');
 }
 refreshMatches();
 details.addEventListener('toggle',()=>{if(details.open)refreshMatches();});
 document.getElementById('tabHome')?.addEventListener('click',()=>{if(details.open)refreshMatches();});
 window.addEventListener('storage',e=>{
  if([LEAGUES,CUPS].includes(e.key)&&details.open)refreshMatches();
 });
 window.addEventListener('fuckball:private-competition-change',()=>{
  if(details.open)refreshMatches();
 });
})();
