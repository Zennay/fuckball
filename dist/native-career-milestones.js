'use strict';
// Genuine native-server career aggregates. Local milestones are personal
// intentions, not official badges, prizes, matchmaking Elo or ranked progress.
(function(){
 const RULES=[
  {id:'matches',label:'Finished matches',targets:[1,5,10,25,50,100,250,500,1000]},
  {id:'wins',label:'Recorded wins',targets:[1,3,5,10,25,50,100,250,500]},
  {id:'goals',label:'Goals scored',targets:[1,5,10,25,50,100,250,500,1000]},
  {id:'minutes',label:'Active play minutes',targets:[5,15,30,60,120,300,600,1200,2400]}
 ];
 const VALID=new Set(RULES.map(x=>x.id));
 const PREFIX='fuckball.personal-career-target.v1.';
 const dom=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!==null)e.textContent=txt;if(cls)e.className=cls;return e;};
 const escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 function extract(stats){
  if(!stats||typeof stats!=='object')return null;
  const inputs={
   matches:stats.matches,wins:stats.wins,goals:stats.goalsFor,
   minutes:Number.isSafeInteger(stats.playedFrames)&&stats.playedFrames>=0?
    Math.floor(stats.playedFrames/3600):null
  };
  if(!Object.values(inputs).every(x=>Number.isSafeInteger(x)&&x>=0))return null;
  return inputs;
 }
 const progress=(count,rule)=>{
  const last=rule.targets[rule.targets.length-1];
  const next=rule.targets.find(target=>target>count);
  if(next===undefined)return {next:null,done:rule.targets.length,fraction:100,last};
  const previous=rule.targets.filter(target=>target<=count).at(-1)||0;
  return {next,done:rule.targets.filter(target=>target<=count).length,
   fraction:Math.round(100*(count-previous)/(next-previous)),last};
 };
 function restore(raw){
  try{
   const x=JSON.parse(raw);
   return x?.version===1&&VALID.has(x.goal)?x.goal:null;
  }catch{return null;}
 }
 function printReport(stats,goal){
  const cells=RULES.map(rule=>{
   const value=stats[rule.id],p=progress(value,rule);
   return '<tr><td>'+escape(rule.label)+'</td><td>'+value+'</td><td>'+
    (p.next===null?'All listed milestones reached':'Next: '+p.next)+
    '</td><td>'+p.done+' of '+rule.targets.length+'</td></tr>';
  }).join('');
  const chosen=RULES.find(r=>r.id===goal);
  const html='<!doctype html><html lang="en"><head><meta charset="utf-8">'+
   '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">'+
   '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Fuckball personal career milestones</title>'+
   '<style>body{font:16px system-ui;max-width:760px;margin:auto;padding:24px;color:#17333b;line-height:1.6}'+
   'table{border-collapse:collapse;width:100%}th,td{border:1px solid #aaa;padding:10px;text-align:left}'+
   '@media print{body{padding:0}}</style></head><body><h1>My personal career milestones</h1>'+
   '<p>Private progress from actual native-server account career aggregates. Not global ratings, official awards, future game predictions or ranked achievements.</p>'+
   '<p>My personal next focus: <strong>'+escape(chosen?.label||'Finished matches')+'</strong></p>'+
   '<table><thead><tr><th>Category</th><th>Recorded</th><th>Personal milestone</th><th>Targets passed</th></tr></thead><tbody>'+
   cells+'</tbody></table>'+
   '<p><small>The current server stores these totals; this offline printout is a point-in-time private copy. No username, tokens or opponent data included.</small></p></body></html>';
  const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;
  a.download='fuckball-personal-career-progress-'+new Date().toISOString().slice(0,10)+'.html';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 async function exportCareerCard(totals,authorized){
  // Self-owned, explicitly exported unranked account totals. Canvas only;
  // no server fetch, remote images, username, token or opponent identity.
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=675;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Your browser cannot create the image.');
  const bg=ctx.createLinearGradient(0,0,1200,675);
  bg.addColorStop(0,'#102b32');bg.addColorStop(1,'#315347');
  ctx.fillStyle=bg;ctx.fillRect(0,0,1200,675);
  ctx.strokeStyle='rgba(207,244,183,.15)';ctx.lineWidth=5;
  ctx.strokeRect(32,32,1136,611);
  ctx.beginPath();ctx.moveTo(600,32);ctx.lineTo(600,643);ctx.stroke();
  ctx.beginPath();ctx.arc(600,337,130,0,Math.PI*2);ctx.stroke();
  ctx.font='bold 24px system-ui,sans-serif';ctx.fillStyle='#bbf29b';
  ctx.fillText('FUCKBALL  /  MY PERSONAL CAREER',64,99);
  ctx.font='bold 56px system-ui,sans-serif';ctx.fillStyle='#f0fced';
  ctx.fillText('THE NUMBERS.',64,171);
  const data=[
   ['COMPLETED ROUNDS',totals.matches],
   ['RECORDED WINS',totals.wins],
   ['GOALS SCORED',totals.goals],
   ['ACTIVE MINUTES',totals.minutes]
  ];
  data.forEach(([label,value],i)=>{
   const x=i%2===0?64:630,y=i<2?264:454;
   ctx.fillStyle='rgba(14,37,42,.9)';ctx.fillRect(x,y,506,150);
   ctx.font='bold 17px system-ui,sans-serif';ctx.fillStyle='#bce3c2';ctx.fillText(label,x+22,y+38);
   ctx.font='bold 64px system-ui,sans-serif';ctx.fillStyle='#e8ffbb';
   ctx.fillText(Number(value).toLocaleString(),x+22,y+115);
  });
  ctx.font='19px system-ui,sans-serif';ctx.fillStyle='#d0e4d9';
  ctx.fillText('Actual account totals on this server only · UNRANKED · Not a global skill rating',64,637);
  const blob=await new Promise((resolve,reject)=>
   canvas.toBlob(value=>value?resolve(value):reject(Error('Image rendering failed.')),'image/png'));
  if(!authorized())throw Error('Account changed during export. Reload your own Profile.');
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;
  a.download='fuckball-personal-career-'+new Date().toISOString().slice(0,10)+'.png';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 function mount(host,stats,username,authorized){
  if(!host)return;
  host.replaceChildren();
  const totals=extract(stats);
  if(!totals||typeof authorized!=='function'||!authorized()||
   typeof username!=='string'||!username||username.length>80)return;
  const key=PREFIX+encodeURIComponent(username.toLowerCase());
  let selected=null,lastRaw=null;
  try{lastRaw=localStorage.getItem(key);selected=restore(lastRaw);}catch{}
  selected||='matches';
  const section=dom('section',null,'native-career-milestones');
  section.setAttribute('aria-label','Personal native server career milestones');
  const title=dom('h2','MY CAREER MILESTONES');
  const intro=dom('p','Personal benchmarks calculated from your actual account statistics on this server. They do not give prizes, ranked placements, medals or extra play rights.','native-career-intro');
  const picker=document.createElement('label');picker.textContent='My next focus';
  const select=document.createElement('select');select.setAttribute('aria-label','Choose personal career milestone focus');
  RULES.forEach(rule=>select.add(new Option(rule.label,rule.id)));
  select.value=selected;picker.append(select);
  const focusText=dom('p',null,'native-career-focus');
  const message=dom('p','These personal targets never automatically unlock anything in game.','native-career-status');
  message.setAttribute('role','status');message.setAttribute('aria-live','polite');
  const cards=dom('div',null,'native-career-cards');
  const buttons=dom('div',null,'native-career-buttons');
  const exportBtn=dom('button','↓ Export private milestone report');
  exportBtn.type='button';
  exportBtn.onclick=()=>{
   if(!authorized()){message.textContent='Account changed. Reload your profile before exporting.';return;}
   try{printReport(totals,selected);message.textContent='Offline career progress report saved locally. No server data was changed.';}
   catch{message.textContent='Could not create the offline report.';}
  };
  const imageBtn=dom('button','↓ Export career image PNG');imageBtn.type='button';
  imageBtn.onclick=async()=>{
   if(!authorized()){message.textContent='Account changed. Reload Profile before exporting.';return;}
   imageBtn.disabled=true;
   try{
    await exportCareerCard(totals,authorized);
    message.textContent='Private unranked career card exported locally; no name or ID included.';
   }catch(error){message.textContent=error?.message||'Could not create the career image.';}
   finally{imageBtn.disabled=false;}
  };
  const playBtn=dom('button','Go to Play →');playBtn.type='button';
  playBtn.onclick=()=>{
   if(!authorized()){message.textContent='Account changed. Reload your profile before playing.';return;}
   // Only opens the native Play screen. It never auto-joins matchmaking.
   document.getElementById('tabHome')?.click();
  };
  buttons.append(exportBtn,imageBtn,playBtn);
  section.append(title,intro,picker,focusText,cards,buttons,message);
  host.append(section);
  function render(){
   cards.replaceChildren();
   for(const rule of RULES){
    const current=totals[rule.id],p=progress(current,rule);
    const card=dom('article',null,'native-career-card');
    if(rule.id===selected)card.classList.add('is-focus');
    const caption=dom('span',rule.label);
    const count=dom('strong',current.toLocaleString());
    const detail=dom('small',p.next===null?
     'All '+p.done+' predefined personal targets reached':
     'Next personal milestone: '+p.next.toLocaleString()+' · '+p.done+' prior targets');
    const bar=document.createElement('progress');bar.max=100;bar.value=p.fraction;
    bar.setAttribute('aria-label',rule.label+' progress to next personal milestone');
    const choose=dom('button',rule.id===selected?'Current focus ✓':'Choose this focus');
    choose.type='button';choose.disabled=rule.id===selected;
    choose.onclick=()=>{select.value=rule.id;select.dispatchEvent(new Event('change'));};
    card.append(caption,count,detail,bar,choose);cards.append(card);
   }
   const rule=RULES.find(r=>r.id===selected),p=progress(totals[selected],rule);
   focusText.textContent=p.next===null?rule.label+': all listed personal milestones reached.':
    'Focus: '+rule.label+' · '+totals[selected]+' recorded · next personal goal '+p.next+'.';
  }
  select.onchange=()=>{
   if(!authorized()){message.textContent='Account changed. Reload your own profile.';return;}
   if(!VALID.has(select.value))return;
   try{
    if(localStorage.getItem(key)!==lastRaw){
     message.textContent='Focus changed in another tab. Reload Profile to avoid overwriting it.';return;
    }
    const next=JSON.stringify({version:1,goal:select.value});
    localStorage.setItem(key,next);lastRaw=next;selected=select.value;
    message.textContent='Personal focus saved only in this browser for this account.';
    render();
   }catch{message.textContent='Browser storage unavailable; focus not saved.';}
  };
  render();
 }
 window.FuckballNativeCareerMilestones={mount};
})();