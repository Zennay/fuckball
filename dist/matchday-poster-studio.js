'use strict';
// Private Matchday Poster Studio: purely local design/export, never a server result.
(function () {
  const host=document.getElementById('homeView');
  if (!host) return;
  const FIXTURES_KEY='fuckball.local-tournaments.v1';
  const SERIES_KEY='fuckball.private-series.v1';
  const DRAFTS_KEY='fuckball.custom-poster-drafts.v1';
  const MAX_DRAFTS=8, MAX_STORE=96*1024;
  const make=(tag,text,cls)=>{
    const el=document.createElement(tag);
    if(text!==undefined&&text!==null)el.textContent=String(text);
    if(cls)el.className=cls;
    return el;
  };
  const button=(text,handler,cls)=>{
    const el=make('button',text,cls);el.type='button';el.addEventListener('click',handler);return el;
  };
  const field=(title,control)=>{
    const wrap=make('label',title);wrap.append(control);return wrap;
  };
  const input=(type,max,placeholder)=>{
    const el=make('input');el.type=type;
    if(max)el.maxLength=max;
    if(placeholder)el.placeholder=placeholder;
    return el;
  };
  const clean=(text,max)=>typeof text==='string'&&text.length<=max&&text.trim()===text&&
    !/[\u0000-\u001f\u007f-\u009f]/.test(text);
  const TEXT_LIMITS={competition:60,home:35,away:35,venue:60,tagline:84};
  const themes={
    lime:{back:'#111f23',panel:'#1e3031',accent:'#dafb66',text:'#f6f8ef',muted:'#b8cac4'},
    ice:{back:'#10212d',panel:'#1b3341',accent:'#91d9ff',text:'#f3faff',muted:'#b7cbd7'},
    ember:{back:'#231b23',panel:'#3a2930',accent:'#ffb176',text:'#fff7f1',muted:'#d9c2c0'},
    mono:{back:'#161b1b',panel:'#303637',accent:'#f7f6f1',text:'#ffffff',muted:'#c7cecc'}
  };
  const state=()=>({
    competition:competition.value.trim(),home:home.value.trim(),away:away.value.trim(),
    venue:venue.value.trim(),tagline:tagline.value.trim(),
    kickoff:kickoff.value,theme:theme.value,format:format.value,
    redScore:scoreRed.value,blueScore:scoreBlue.value
  });
  function valid(s){
    if(!s||Object.keys(TEXT_LIMITS).some(k=>!clean(s[k],TEXT_LIMITS[k])))return false;
    if(!s.home||!s.away||s.home.toLocaleLowerCase()===s.away.toLocaleLowerCase())return false;
    if(!themes[s.theme]||!['fixture','result'].includes(s.format))return false;
    if(typeof s.kickoff!=='string'||s.kickoff.length>16||s.kickoff&&
      (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s.kickoff)||
        !Number.isFinite(new Date(s.kickoff).getTime())))return false;
    if(s.format==='result'&&![s.redScore,s.blueScore].every(x=>
      /^(?:0|[1-9]\d?)$/.test(x)))return false;
    return true;
  }
  const panel=make('section',null,'matchday-poster-studio');
  panel.setAttribute('aria-label','Private Matchday Poster Studio');
  const details=make('details');
  const summary=make('summary','▣ CUSTOM POSTER DESIGNER · OPEN');
  const body=make('div',null,'poster-studio-body');
  const intro=make('p','Design a match poster from your own local fixtures, or create one from scratch. Posters and manually entered results are unofficial. Nothing is sent to a server.');
  const columns=make('div',null,'poster-studio-grid');
  const editor=make('div',null,'poster-studio-editor');
  const choose=make('select');choose.setAttribute('aria-label','Choose a locally scheduled fixture');
  const refresh=button('↻ Refresh fixtures',refreshFixtures);
  const fixtureRow=make('div',null,'poster-studio-fixture-row');
  fixtureRow.append(choose,refresh);
  const competition=input('text',60,'Friendly League');
  const home=input('text',35,'Red');
  const away=input('text',35,'Blue');
  const venue=input('text',60,'Optional pitch / venue');
  const tagline=input('text',84,'Bring your best game.');
  const kickoff=input('datetime-local');
  const theme=make('select');for(const [id,name]of [['lime','Lime / dark'],['ice','Ice blue'],['ember','Ember'],['mono','Monochrome']])
    theme.add(new Option(name,id));
  const format=make('select');
  format.add(new Option('Upcoming fixture','fixture'));
  format.add(new Option('Self-reported result','result'));
  const scoreRed=input('number'),scoreBlue=input('number');
  for(const score of [scoreRed,scoreBlue]){score.min='0';score.max='99';score.step='1';score.value='0';}
  const scoreRow=make('div',null,'poster-studio-scores');scoreRow.hidden=true;
  scoreRow.append(field('Red / home score',scoreRed),field('Blue / away score',scoreBlue));
  const teamRow=make('div',null,'poster-studio-team-row');
  teamRow.append(field('Home team',home),field('Away team',away));
  editor.append(
    make('h3','DESIGN YOUR MATCHDAY'),
    field('Load existing private friendly',fixtureRow),
    field('Competition',competition),teamRow,
    field('Kickoff (local time)',kickoff),field('Venue',venue),
    field('Short message',tagline),
    field('Poster style',theme),field('Display',format),scoreRow
  );
  const preview=make('div',null,'poster-studio-preview');
  const canvas=make('canvas');canvas.width=1200;canvas.height=675;
  canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Visual preview of your private friendly poster');
  const alternative=make('p',null,'poster-studio-alternative');
  const saveButton=button('Save new design',()=>saveDraft(),'primary');
  const copyButton=button('Save as new copy',()=>saveDraft(true));
  copyButton.hidden=true;
  const newButton=button('New design',()=>{
    activeDraftId=null;updateEditingState();choose.value='';
    notify('New design mode. Saved posters remain unchanged.');
  });
  const imageButton=button('↓ Export PNG',exportPNG,'primary');
  const textButton=button('↓ Accessible TXT',exportText);
  const printButton=button('Print',()=>{
    if(!valid(state()))return notify('Check team names and scores before printing.');
    document.body.classList.add('poster-custom-print');window.print();
  });
  window.addEventListener('afterprint',()=>document.body.classList.remove('poster-custom-print'));
  const controls=make('div',null,'poster-studio-actions');
  controls.append(saveButton,copyButton,newButton,imageButton,textButton,printButton);
  const status=make('p',null,'poster-studio-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  preview.append(canvas,alternative,controls,status);
  columns.append(editor,preview);
  const saved=make('div',null,'poster-studio-saved');
  body.append(intro,columns,saved);
  details.append(summary,body);panel.append(details);
  const cards=host.querySelector('.mode-cards');
  const parent=host.querySelector('.matchday-posters .matchday-posters-body');
  if(parent)parent.append(panel);
  else if(cards)cards.insertAdjacentElement('afterend',panel);
  else host.append(panel);
  function notify(message){status.textContent=message;}
  function drawFit(ctx,value,x,y,maxWidth,size,bold,color){
    ctx.fillStyle=color;ctx.font=(bold?'900 ':'600 ')+size+'px system-ui, sans-serif';
    let str=String(value||'');
    while(str.length>2&&ctx.measureText(str).width>maxWidth)str=str.slice(0,-2).trimEnd()+'…';
    ctx.fillText(str,x,y);
  }
  function readable(s){
    const date=s.kickoff?new Date(s.kickoff):null;
    const dateText=date&&!Number.isNaN(date.getTime())?
      date.toLocaleString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric',
        hour:'2-digit',minute:'2-digit'}):'KICKOFF TO BE CONFIRMED';
    const title=s.format==='result'?'SELF-REPORTED RESULT':'FRIENDLY MATCHDAY';
    const result=s.format==='result'?' · '+s.redScore+' – '+s.blueScore:'';
    return title+'\n'+(s.competition||'Private friendly')+'\n'+s.home+' vs '+s.away+
      result+'\n'+dateText+(s.venue?'\nVenue: '+s.venue:'')+
      (s.tagline?'\n'+s.tagline:'')+
      '\nPrivate user-created poster; no official server verification or matchmaking invitation.';
  }

  function paint(target,s){
    const ctx=target.getContext('2d');if(!ctx)return;
    const t=themes[s.theme]||themes.lime;
    ctx.fillStyle=t.back;ctx.fillRect(0,0,1200,675);
    ctx.fillStyle=t.panel;
    ctx.beginPath();ctx.moveTo(430,0);ctx.lineTo(1200,0);
    ctx.lineTo(1200,675);ctx.lineTo(750,675);ctx.closePath();ctx.fill();
    ctx.globalAlpha=.15;ctx.strokeStyle=t.accent;ctx.lineWidth=2;
    for(let x=560;x<1430;x+=58){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x-340,675);ctx.stroke();}
    ctx.globalAlpha=1;
    ctx.fillStyle=t.accent;ctx.fillRect(68,72,76,9);
    drawFit(ctx,'FUCKBALL',68,128,800,32,true,t.text);
    drawFit(ctx,'PRIVATE FRIENDLY · UNVERIFIED',68,167,900,18,false,t.muted);
    drawFit(ctx,s.competition||'YOUR MATCHDAY',68,238,1050,26,true,t.accent);
    drawFit(ctx,s.home||'HOME TEAM',68,336,1020,80,true,t.text);
    drawFit(ctx,'VS',70,395,250,27,true,t.accent);
    drawFit(ctx,s.away||'AWAY TEAM',68,487,1020,80,true,t.text);
    if(s.format==='result'){
      ctx.fillStyle=t.accent;ctx.fillRect(925,230,215,140);
      drawFit(ctx,ok?s.redScore+'  —  '+s.blueScore:'—  —  —',946,316,185,39,true,t.back);
      drawFit(ctx,'SELF-REPORTED',942,349,185,13,true,t.back);
    }else{
      drawFit(ctx,'MATCHDAY',920,307,210,25,true,t.accent);
    }
    ctx.fillStyle=t.accent;ctx.fillRect(68,535,1064,2);
    const date=s.kickoff?new Date(s.kickoff):null;
    const dateText=date&&!Number.isNaN(date.getTime())?
      date.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'KICKOFF TBC';
    drawFit(ctx,dateText,68,577,635,27,true,t.text);
    drawFit(ctx,s.venue||'VENUE TBC',68,617,700,19,false,t.muted);
    drawFit(ctx,s.tagline||'PLAY FOR THE LOVE OF FOOTBALL.',745,610,385,18,false,t.accent);
  }
  function draw(){
    const s=state(),ok=valid(s);
    saveButton.disabled=imageButton.disabled=textButton.disabled=!ok;
    printButton.disabled=!ok;
    paint(canvas,s);
    alternative.textContent=readable({...s,home:s.home||'HOME',away:s.away||'AWAY'});
    if(!ok)notify('Enter two different team names. Result mode needs whole scores from 0 to 99.');
    else if(status.textContent.startsWith('Enter two different'))notify('');
  }
  function readSeriesFixtures(){
    const stored=localStorage.getItem(SERIES_KEY);if(!stored)return[];
    if(stored.length>128*1024)throw Error('Series collection exceeds its 128 KiB limit.');
    const records=JSON.parse(stored);
    if(!Array.isArray(records)||records.length>12)throw Error('Invalid saved best-of-series collection.');
    const list=[];
    for(const serie of records){
      if(!serie||serie.version!==1||
       typeof serie.id!=='string'||!/^[a-f0-9-]{16,50}$/i.test(serie.id)||
       !clean(serie.name,60)||!serie.name||!clean(serie.red,35)||!serie.red||
       !clean(serie.blue,35)||!serie.blue||
       serie.red.toLocaleLowerCase()===serie.blue.toLocaleLowerCase()||
       ![3,5,7].includes(serie.bestOf)||!Array.isArray(serie.games)||
       serie.games.length!==serie.bestOf)
       throw Error('Unrecognised private series format.');
      const need=Math.floor(serie.bestOf/2)+1;
      let red=0,blue=0,seenEmpty=false,decided=false;
      for(const [i,game]of serie.games.entries()){
       const time=game?.kickoff===undefined?null:game.kickoff,venue=game?.venue??'';
       if(!game||game.id!=='g'+(i+1)||
        !((game.redScore===null&&game.blueScore===null)||
         (Number.isSafeInteger(game.redScore)&&Number.isSafeInteger(game.blueScore)&&
          game.redScore>=0&&game.blueScore>=0&&game.redScore<=99&&game.blueScore<=99&&
          game.redScore!==game.blueScore))||
        !(time===null||(Number.isSafeInteger(time)&&time>=1577836800000&&time<=4102444800000))||
        !clean(venue,60))
        throw Error('Invalid game score or kickoff in private series.');
       if(game.redScore===null)seenEmpty=true;
       else{
        if(seenEmpty||decided)throw Error('Best-of series result order is impossible.');
        if(game.redScore>game.blueScore)red++;else blue++;
        if(red>=need||blue>=need)decided=true;
       }
       // A finished series never advertises unused future games as live fixtures.
       if(decided&&game.redScore===null)continue;
       list.push({league:serie.name,home:serie.red,away:serie.blue,
        time,venue,red:game.redScore,blue:game.blueScore,game:i+1,
        uid:serie.id+'-'+game.id});
      }
    }
    return list;
  }
  function readFixtures(){
    const raw=localStorage.getItem(FIXTURES_KEY);
    if(!raw)return [];
    if(raw.length>128*1024)throw Error('League collection exceeds the safe reading limit.');
    const data=JSON.parse(raw);
    if(!Array.isArray(data)||data.length>8)throw Error('League collection is invalid.');
    const all=[];
    for(const league of data){
      if(!league||league.version!==1||!clean(league.name,60)||
        !Array.isArray(league.teams)||league.teams.length<2||league.teams.length>12||
        league.teams.some(n=>!clean(n,30))||
        !Array.isArray(league.fixtures)||league.fixtures.length>132)continue;
      for(const f of league.fixtures){
        if(!f||!Number.isInteger(f.home)||!Number.isInteger(f.away)||
          f.home<0||f.away<0||f.home>=league.teams.length||
          f.away>=league.teams.length||f.home===f.away)continue;
        const date=f.kickoff;
        if(date!==null&&date!==undefined&&
          (!Number.isSafeInteger(date)||date<1577836800000||date>4102444800000))continue;
        if(f.venue!==undefined&&!clean(f.venue,60))continue;
        if(!((f.homeScore===null&&f.awayScore===null)||
          ([f.homeScore,f.awayScore].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=99))))continue;
        all.push({league:league.name,home:league.teams[f.home],away:league.teams[f.away],
          time:date||null,venue:f.venue||'',red:f.homeScore,blue:f.awayScore,
          uid:String(league.id||'').replace(/[^a-zA-Z0-9-]/g,'').slice(0,50)+'-'+
            String(f.id||'').replace(/[^a-zA-Z0-9-]/g,'').slice(0,30)});
      }
    }
    try{all.push(...readSeriesFixtures());}
    catch(error){notify('Saved series posters could not be loaded: '+(error.message||'Invalid series')+
      '. League posters remain available.');}
    return all.sort((a,b)=>(a.time||Number.MAX_SAFE_INTEGER)-(b.time||Number.MAX_SAFE_INTEGER)).slice(0,256);
  }
  function localDate(ms){
    if(!ms)return '';
    const d=new Date(ms),pad=n=>String(n).padStart(2,'0');
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
  }
  let fixtures=[];
  function refreshFixtures(){
    try{fixtures=readFixtures();}
    catch{fixtures=[];notify('Stored fixture data is invalid or unavailable. You can still design a poster manually.');}
    choose.replaceChildren(new Option('Create poster manually',''));
    fixtures.forEach((f,i)=>{
      const label=f.league+(f.game?' · Game '+f.game:'')+' · '+f.home+' vs '+f.away+(f.time?' · '+new Date(f.time).toLocaleDateString():'');
      choose.add(new Option(label,String(i)));
    });
    choose.value='';
  }
  choose.addEventListener('change',()=>{
    if(choose.value==='')return;
    activeDraftId=null;updateEditingState();
    const f=fixtures[Number(choose.value)];if(!f)return;
    competition.value=f.league;home.value=f.home;away.value=f.away;
    venue.value=f.venue;kickoff.value=localDate(f.time);
    tagline.value=f.game?'PRIVATE BEST-OF SERIES · GAME '+f.game:'PLAY FOR THE LOVE OF FOOTBALL.';
    format.value=f.red===null?'fixture':'result';
    scoreRed.value=String(f.red??0);scoreBlue.value=String(f.blue??0);
    scoreRow.hidden=format.value!=='result';draw();
    notify('Loaded a local organiser fixture; scores are self-entered and unverified.');
  });
  function download(blob,filename){
    const url=URL.createObjectURL(blob);
    const a=make('a');a.href=url;a.download=filename;
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function exportPNG(){
    if(!valid(state()))return notify('Check the details before exporting.');
    draw();
    canvas.toBlob(blob=>{
      if(!blob||blob.size>12*1024*1024)return notify('This browser cannot export the poster PNG.');
      download(blob,'fuckball-private-matchday.png');
      notify('PNG saved on this device. Not uploaded or officially verified.');
    },'image/png');
  }
  function exportText(){
    if(!valid(state()))return notify('Check the details before exporting.');
    const content=readable(state())+'\n';
    download(new Blob([content],{type:'text/plain;charset=utf-8'}),'fuckball-matchday-accessible.txt');
    notify('Accessible text version saved locally.');
  }
  function readDrafts(){
    const raw=localStorage.getItem(DRAFTS_KEY);
    if(!raw)return [];
    if(raw.length>MAX_STORE)throw Error('Draft storage exceeds the safety limit.');
    const list=JSON.parse(raw);
    if(!Array.isArray(list)||list.length>MAX_DRAFTS||
      list.some(d=>!valid(d)||typeof d.id!=='string'||!/^[a-f0-9-]{16,50}$/i.test(d.id)))
      throw Error('Saved drafts are invalid.');
    if(new Set(list.map(d=>d.id)).size!==list.length)throw Error('Duplicate draft ID.');
    return list;
  }
  let drafts=[],draftsBlocked=false,draftsSnapshot='',activeDraftId=null;
  try{drafts=readDrafts();draftsSnapshot=localStorage.getItem(DRAFTS_KEY)||'';}
  catch{draftsBlocked=true;notify('Saved posters could not be verified. Existing browser data was not overwritten.');}
  const saveState=()=>{
    if(draftsBlocked)throw Error('Stored posters require recovery before new writes.');
    if((localStorage.getItem(DRAFTS_KEY)||'')!==draftsSnapshot)
      throw Error('Posters changed in another tab; reload before editing.');
    const serialized=JSON.stringify(drafts);
    if(serialized.length>MAX_STORE)throw Error('Poster collection storage limit reached.');
    localStorage.setItem(DRAFTS_KEY,serialized);
    draftsSnapshot=serialized;
  };
  function updateEditingState(){
    const selected=drafts.find(d=>d.id===activeDraftId);
    if(activeDraftId&&!selected)activeDraftId=null;
    saveButton.textContent=selected?'Update this design':'Save new design';
    copyButton.hidden=!selected;
    newButton.hidden=!selected;
  }
  function apply(s){
    for(const k of ['competition','home','away','venue','tagline','kickoff','redScore','blueScore']){
      ({competition,home,away,venue,tagline,kickoff,redScore:scoreRed,blueScore:scoreBlue}[k]).value=s[k]||'';
    }
    theme.value=s.theme;format.value=s.format;scoreRow.hidden=s.format!=='result';
    choose.value='';draw();
  }
  // Explicit, offline-only transfer. Never includes account IDs or recording bytes.
  const portableFields=['competition','home','away','venue','tagline','kickoff',
    'theme','format','redScore','blueScore'];
  const backupButton=button('↓ Backup drafts JSON',backupDrafts);
  const mediaKitButton=button('↓ Media Kit ZIP',()=>exportMediaKit());
  const importButton=button('↑ Restore drafts JSON',()=>restoreFile.click());
  const restoreFile=make('input');
  restoreFile.type='file';restoreFile.accept='.json,application/json';restoreFile.hidden=true;
  restoreFile.setAttribute('aria-label','Restore private poster drafts from JSON');
  function backupDrafts(){
    if(draftsBlocked||!drafts.length)return notify('No verified drafts are available for backup.');
    const safe=drafts.map(d=>Object.fromEntries(portableFields.map(k=>[k,d[k]])));
    const payload=JSON.stringify({format:'fuckball-private-poster-drafts',version:1,
      drafts:safe},null,2)+'\n';
    if(new TextEncoder().encode(payload).byteLength>65536)
      return notify('Draft archive exceeds the safe export size.');
    download(new Blob([payload],{type:'application/json'}),
      'fuckball-private-poster-drafts.json');
    notify('Your private draft archive was saved. The file contains no logins or game recordings.');
  }

  async function exportMediaKit(){
    if(draftsBlocked||!drafts.length)return notify('No verified posters are available to export.');
    if(typeof JSZip!=='function')return notify('The local ZIP feature is unavailable in this browser.');
    const current=drafts.slice();
    if(current.length>MAX_DRAFTS||current.some(d=>!valid(d)))
      return notify('A saved poster is invalid; no media package was created.');
    mediaKitButton.disabled=true;
    const frame=make('canvas');frame.width=1200;frame.height=675;
    let total=0;
    try{
      const zip=new JSZip();
      const records=[];
      for(let i=0;i<current.length;i++){
        const s=current[i],n=String(i+1).padStart(2,'0');
        paint(frame,s);
        const png=await new Promise((resolve,reject)=>{
          frame.toBlob(blob=>blob?resolve(blob):reject(Error('PNG rendering unavailable')),'image/png');
        });
        if(png.size>8*1024*1024||total+png.size>64*1024*1024)
          throw Error('Package would exceed the 64 MiB safety limit.');
        total+=png.size;
        zip.file('posters/poster-'+n+'.png',png,{compression:'STORE',createFolders:false});
        zip.file('posters/poster-'+n+'.txt',readable(s)+'\n',
          {compression:'STORE',createFolders:false});
        records.push(n+'. '+s.home+' vs '+s.away+' — '+(s.competition||'Private friendly'));
        notify('Creating private posters '+(i+1)+' / '+current.length+'…');
      }
      zip.file('README.txt','FUCKBALL — PRIVATE FRIENDLY MEDIA KIT\n'+
        'All results and match details were entered by the player.\n'+
        'This is NOT an official server-verified competition or invitation.\n'+
        'No player accounts, chats, room URLs, recordings or authorization data included.\n\n'+
        records.join('\n')+'\n',{compression:'STORE'});
      const blob=await zip.generateAsync({type:'blob',compression:'STORE',streamFiles:true});
      if(blob.size>64*1024*1024)throw Error('Finished package exceeds the export limit.');
      download(blob,'fuckball-private-matchday-media-kit.zip');
      notify(current.length+' private posters exported as PNG and TXT in a local ZIP.');
    }catch{
      notify('Could not prepare the private media kit. No stored posters were changed.');
    }finally{mediaKitButton.disabled=draftsBlocked||drafts.length===0;}
  }
  async function restoreDrafts(file){
    if(!file)return;
    if(draftsBlocked)return notify('Local drafts are unavailable. Reload and recover local storage before importing.');
    if(file.size===0||file.size>65536)return notify('Archive must be a nonempty JSON file of at most 64 KiB.');
    let incoming;
    try{
      const payload=JSON.parse(await file.text());
      if(payload?.format!=='fuckball-private-poster-drafts'||payload.version!==1||
        !Array.isArray(payload.drafts)||payload.drafts.length<1||
        payload.drafts.length>MAX_DRAFTS||
        payload.drafts.some(d=>!valid(d)||portableFields.some(k=>typeof d[k]!=='string')))
        throw Error('Unsupported poster archive.');
      incoming=payload.drafts.map(d=>Object.fromEntries(portableFields.map(k=>[k,d[k]])));
    }catch{return notify('Archive rejected. No saved posters were changed.');}
    if(incoming.length+drafts.length>MAX_DRAFTS)
      return notify('Not enough space: delete saved posters before importing these '+incoming.length+' drafts.');
    if(!confirm('Import '+incoming.length+' private poster drafts as NEW entries on this device? Existing drafts will be kept.'))
      return notify('Import cancelled without changes.');
    const previous=drafts;
    const newId=()=>crypto.randomUUID?crypto.randomUUID():
      Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
    drafts=[...previous,...incoming.map(d=>({id:newId(),...d}))];
    try{saveState();renderDrafts();notify(incoming.length+' private designs imported; your existing drafts were kept.');}
    catch{drafts=previous;notify('Import failed; stored posters were not replaced. Reload if another tab made changes.');}
  }
  restoreFile.addEventListener('change',async()=>{
    const file=restoreFile.files?.[0];
    try{await restoreDrafts(file);}
    finally{restoreFile.value='';}
  });
  function renderDrafts(){
    saved.replaceChildren(make('h3','SAVED POSTERS · ON THIS DEVICE'));
    const tools=make('div',null,'poster-studio-portability');
    backupButton.disabled=draftsBlocked||drafts.length===0;
    importButton.disabled=draftsBlocked||drafts.length>=MAX_DRAFTS;
    mediaKitButton.disabled=draftsBlocked||drafts.length===0;
    tools.append(backupButton,mediaKitButton,importButton,restoreFile);
    saved.append(tools);
    updateEditingState();
    if(!drafts.length)return saved.append(make('p','Save up to eight designs. They never appear on your server account.'));
    for(const d of drafts){
      const row=make('div',null,'poster-studio-draft');
      row.classList.toggle('active',activeDraftId===d.id);
      row.append(make('strong',d.home+' vs '+d.away),
        make('span',d.competition||'Private friendly'));
      row.append(button('Edit',()=>{
        activeDraftId=d.id;apply(d);details.open=true;renderDrafts();
        notify('Editing the selected saved design. Changes are not stored until you click Update this design.');
      }));
      row.append(button('Delete',()=>{
        if(!confirm('Delete only this local poster draft?'))return;
        const prior=drafts;drafts=drafts.filter(x=>x.id!==d.id);
        try{saveState();if(activeDraftId===d.id)activeDraftId=null;
          renderDrafts();notify('Saved poster deleted.');}
        catch{drafts=prior;notify('Could not delete draft; stored posters are unchanged.');}
      }));
      saved.append(row);
    }
  }
  function saveDraft(asCopy=false){
    const s=state();if(!valid(s))return notify('Enter valid details before saving.');
    const selected=!asCopy&&drafts.find(d=>d.id===activeDraftId);
    if(!selected&&drafts.length>=MAX_DRAFTS)
      return notify('Eight saved posters reached. Update an existing design or delete one first.');
    const prior=drafts;
    const id=selected?.id||(crypto.randomUUID?crypto.randomUUID():
      Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join(''));
    drafts=selected?drafts.map(d=>d.id===id?{id,...s}:d):[{id,...s},...drafts];
    try{saveState();activeDraftId=id;renderDrafts();
      notify(selected?'Saved changes to this private design.':
        asCopy?'A separate editable copy was saved.':'Poster saved privately on this device.');}
    catch{drafts=prior;notify('Save failed; previously saved posters were not changed.');}
  }
  for(const el of [competition,home,away,venue,tagline,kickoff,theme,format,scoreRed,scoreBlue]){
    el.addEventListener('input',()=>{
      if(el===format)scoreRow.hidden=format.value!=='result';
      draw();
    });
    el.addEventListener('change',()=>{
      if(el===format)scoreRow.hidden=format.value!=='result';
      draw();
    });
  }
  window.addEventListener('storage',e=>{
    if(e.key===FIXTURES_KEY||e.key===SERIES_KEY)refreshFixtures();
    if(e.key===DRAFTS_KEY){
      try{drafts=readDrafts();draftsSnapshot=localStorage.getItem(DRAFTS_KEY)||'';
        draftsBlocked=false;activeDraftId=null;renderDrafts();}
      catch{draftsBlocked=true;notify('Posters changed in another tab but could not be loaded.');}
    }
  });
  window.addEventListener('fuckball:private-competition-change',refreshFixtures);
  window.addEventListener('fuckball:open-private-poster-fixture',event=>{
    const uid=event.detail?.uid;
    if(typeof uid!=='string'||uid.length>90)return;
    refreshFixtures();
    const index=fixtures.findIndex(f=>f.uid===uid);
    if(index<0)return notify('This fixture is no longer available locally.');
    choose.value=String(index);choose.dispatchEvent(new Event('change'));
    const outer=panel.closest('.matchday-posters details');
    if(outer)outer.open=true;
    details.open=true;
    panel.scrollIntoView({behavior:'auto',block:'start'});
  });
  details.addEventListener('toggle',()=>{if(details.open)refreshFixtures();});
  home.value='Red';away.value='Blue';competition.value='Friendly Match';
  tagline.value='PLAY FOR THE LOVE OF FOOTBALL.';
  refreshFixtures();renderDrafts();draw();
})();