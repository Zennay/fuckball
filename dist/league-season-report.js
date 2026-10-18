'use strict';
// Read-only season analysis for self-entered private leagues; no network or account writes.
(function(){
  const el=(tag,text,cls)=>{
    const node=document.createElement(tag);
    if(text!==undefined&&text!==null)node.textContent=String(text);
    if(cls)node.className=cls;
    return node;
  };
  const button=(label,action)=>{
    const b=el('button',label);b.type='button';b.addEventListener('click',action);return b;
  };
  const recorded=f=>Number.isSafeInteger(f.homeScore)&&Number.isSafeInteger(f.awayScore);
  const gamesInOrder=fixtures=>fixtures.slice().sort((a,b)=>
    a.round-b.round||(a.time??Infinity)-(b.time??Infinity)||
    String(a.fixtureId).localeCompare(String(b.fixtureId)));
  const outcome=(f,club)=>{
    if(!recorded(f))return null;
    const home=f.home===club,own=home?f.homeScore:f.awayScore;
    const theirs=home?f.awayScore:f.homeScore;
    return own>theirs?'W':own<theirs?'L':'D';
  };
  const when=f=>f.time===null?'Kickoff not scheduled':new Intl.DateTimeFormat(undefined,{
    dateStyle:'medium',timeStyle:'short'
  }).format(new Date(f.time));
  const join=(...nodes)=>{const frag=document.createDocumentFragment();frag.append(...nodes);return frag;};
  const csvCell=value=>{
    let s=String(value??'');
    if(/^\s*[=+\-@\t\r]/.test(s))s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  };
  const exportFile=(data,name,type)=>{
    const url=URL.createObjectURL(new Blob([data],{type}));
    const a=el('a');a.href=url;a.download=name;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  };
  const escapeHTML=x=>String(x??'').replace(/[&<>"']/g,
    ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const printable=(league,fixtures,team)=>{
    const all=league.standings;
    const tableRows=all.map((row,i)=>'<tr>'+[
      i+1,row.name,row.p,row.w,row.d,row.l,row.gf,row.ga,row.gd,row.pts
    ].map(v=>'<td>'+escapeHTML(v)+'</td>').join('')+'</tr>').join('');
    const fixturesRows=fixtures.map(f=>'<tr>'+[
      'Round '+f.round,when(f),f.home,f.away,
      recorded(f)?f.homeScore+' – '+f.awayScore:'Not played',f.venue||'—'
    ].map(v=>'<td>'+escapeHTML(v)+'</td>').join('')+'</tr>').join('');
    return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
      '<meta name="viewport" content="width=device-width,initial-scale=1">'+
      '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;">'+
      '<title>'+escapeHTML(league.name)+' – private season report</title><style>'+
      'body{font:15px system-ui,sans-serif;max-width:1100px;margin:36px auto;padding:0 20px;color:#142b2b}'+
      'h1{font-size:27px}h2{margin-top:28px}p{line-height:1.5}table{border-collapse:collapse;width:100%;font-size:12px}'+
      'th,td{text-align:left;border:1px solid #b4c2bd;padding:8px;overflow-wrap:anywhere}'+
      'th{background:#e4ede7}tr{break-inside:avoid}'+
      '@media print{body{margin:0}h1{font-size:22px}table{font-size:10px}}'+
      '</style></head><body><h1>'+escapeHTML(league.name)+' · private season report</h1>'+
      '<p>Self-entered results, not verified by a game server or an official competition. '+
      'Generated on this device. Share only if you want to disclose these privately saved names and fixtures.</p>'+
      '<p><strong>Scope:</strong> '+escapeHTML(team||'Every team')+' · '+
      fixtures.filter(recorded).length+' completed of '+fixtures.length+' shown fixtures</p>'+
      '<h2>League standings</h2><table><thead><tr>'+
      ['#','Team','P','W','D','L','GF','GA','GD','Pts'].map(x=>'<th>'+x+'</th>').join('')+
      '</tr></thead><tbody>'+tableRows+'</tbody></table>'+
      '<h2>Recorded and remaining fixtures</h2><table><thead><tr>'+
      ['Round','Kickoff','Home','Away','Score','Venue'].map(x=>'<th>'+x+'</th>').join('')+
      '</tr></thead><tbody>'+fixturesRows+'</tbody></table></body></html>';
  };
  function build(league){
    if(league?.type!=='League'||!Array.isArray(league.fixtures)||
       !Array.isArray(league.standings))return null;
    const games=gamesInOrder(league.fixtures),clubs=league.standings.map(t=>t.name);
    const wrap=el('section',null,'league-season-centre');
    wrap.setAttribute('aria-label','Private league season centre');
    wrap.append(el('h4','SEASON CENTRE'),
      el('p','Explore form, head-to-head records and remaining games from scores you entered on this device. No ranked or server-verified results.'));
    const controls=el('div',null,'league-season-controls');
    const label=el('label','Focus team');const select=el('select');
    select.setAttribute('aria-label','Focus team for local season analysis');
    const every=el('option','All teams');every.value='';select.append(every);
    for(const name of clubs){const option=el('option',name);option.value=name;select.append(option);}
    label.append(select);controls.append(label);wrap.append(controls);
    const stats=el('div',null,'league-season-metrics');
    const view=el('div',null,'league-season-view');
    const message=el('p',null,'league-season-message');
    message.setAttribute('role','status');message.setAttribute('aria-live','polite');
    wrap.append(stats,view);
    const actions=el('div',null,'league-season-actions');
    actions.append(
      button('↓ Season fixtures CSV',()=>{
        const filtered=chosenGames();
        const rows=[['Round','Kickoff (local)','Home','Away','Home goals','Away goals','Venue','Result status','Private league'],
          ...filtered.map(f=>[f.round,f.time===null?'':when(f),f.home,f.away,
            recorded(f)?f.homeScore:'',recorded(f)?f.awayScore:'',f.venue||'',
            recorded(f)?'Self-entered':'Unplayed',league.name])];
        exportFile('\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n',
          'fuckball-private-season-fixtures.csv','text/csv;charset=utf-8');
        message.textContent='Private season fixtures saved locally. No data was uploaded.';
      }),
      button('↓ Printable season report',()=>{
        exportFile(printable(league,chosenGames(),select.value),
          'fuckball-private-season-report.html','text/html;charset=utf-8');
        message.textContent='Printable private HTML report saved locally. Open it to print or share deliberately.';
      })
    );
    wrap.append(actions,message);
    function chosenGames(){
      return games.filter(f=>!select.value||f.home===select.value||f.away===select.value);
    }
    function render(){
      const club=select.value,filtered=chosenGames(),
        finished=filtered.filter(recorded),pending=filtered.filter(f=>!recorded(f)),
        goals=finished.reduce((sum,f)=>sum+f.homeScore+f.awayScore,0);
      stats.replaceChildren();
      const point=(name,value)=>{
        const card=el('div',null,'league-season-metric');
        card.append(el('strong',value),el('span',name));stats.append(card);
      };
      point('Recorded games',finished.length);
      point('Remaining games',pending.length);
      point('Goals recorded',goals);
      if(club){
        const row=league.standings.find(t=>t.name===club);
        point('Points',row?.pts??0);
      }else point('Teams',clubs.length);
      view.replaceChildren();
      if(club){
        const heading=el('h5','Recent form · '+club),form=el('div',null,'league-season-form');
        const recent=finished.slice(-5).reverse();
        for(const f of recent){
          const symbol=outcome(f,club),badge=el('span',symbol,'league-form-'+symbol);
          badge.title=(f.home+' '+f.homeScore+' – '+f.awayScore+' '+f.away);
          badge.setAttribute('aria-label',(symbol==='W'?'Win':symbol==='L'?'Loss':'Draw')+
            ': '+badge.title);
          form.append(badge);
        }
        if(!recent.length)form.append(el('p','No recorded result for this team.'));
        view.append(heading,form);
        const byOpponent=new Map();
        for(const f of finished){
          const opponent=f.home===club?f.away:f.home;
          const value=byOpponent.get(opponent)||{p:0,w:0,d:0,l:0,gf:0,ga:0};
          const own=f.home===club?f.homeScore:f.awayScore,
            other=f.home===club?f.awayScore:f.homeScore;
          value.p++;value.gf+=own;value.ga+=other;
          value[own>other?'w':own<other?'l':'d']++;
          byOpponent.set(opponent,value);
        }
        const h2h=el('div',null,'league-season-headtohead');
        h2h.append(el('h5','Head-to-head · recorded scores'));
        if(!byOpponent.size)h2h.append(el('p','No opponents with a recorded score yet.'));
        else{
          const table=el('table');table.setAttribute('aria-label','Local head-to-head for '+club);
          const thead=el('thead'),headRow=el('tr');
          for(const key of ['Opponent','P','W','D','L','GF','GA']){
            const th=el('th',key);th.scope='col';headRow.append(th);
          }
          thead.append(headRow);table.append(thead);
          const tbody=el('tbody');
          for(const [opponent,v] of [...byOpponent.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
            const tr=el('tr');
            for(const value of [opponent,v.p,v.w,v.d,v.l,v.gf,v.ga])tr.append(el('td',value));
            tbody.append(tr);
          }
          table.append(tbody);h2h.append(table);
        }
        view.append(h2h);
      }
      const list=el('div',null,'league-season-fixtures');
      list.append(el('h5',club?'Fixtures · '+club:'All league fixtures'));
      const filter=el('label','Show');const state=el('select');
      state.setAttribute('aria-label','Select recorded or unplayed league fixtures');
      for(const [value,name] of [['remaining','Unplayed games'],['played','Recorded scores'],['all','All fixtures']]){
        const opt=el('option',name);opt.value=value;state.append(opt);
      }
      filter.append(state);list.append(filter);
      const rows=el('div',null,'league-season-fixture-list');
      const count=el('p',null,'league-season-count');
      list.append(rows,count);
      function showFixtures(){
        const items=state.value==='remaining'?pending:state.value==='played'?finished:filtered;
        rows.replaceChildren();
        const displayed=items.slice(0,24);
        for(const f of displayed){
          const fixture=el('div',null,'league-season-fixture');
          const title=el('strong',f.home+' vs '+f.away),detail=el('span',
            'Round '+f.round+' · '+when(f)+(f.venue?' · '+f.venue:''));
          const score=el('span',recorded(f)?
            f.homeScore+' – '+f.awayScore+' · entered score':'Awaiting result',
            recorded(f)?'league-fixture-played':'league-fixture-pending');
          fixture.append(title,detail,score);rows.append(fixture);
        }
        if(!items.length)rows.append(el('p','No fixtures in this view.'));
        count.textContent=items.length>24?
          'Showing 24 of '+items.length+' fixtures. Download CSV or HTML for the complete list.':
          items.length+' fixtures shown. Only the original league editor can change scores.';
      }
      state.addEventListener('change',showFixtures);showFixtures();view.append(list);
    }
    select.addEventListener('change',render);render();
    return wrap;
  }
  window.FuckballLeagueSeasonReport=Object.freeze({build});
})();