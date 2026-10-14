(function(root){'use strict';
const columns=['own_x','own_y','own_vx','own_vy','ball_dx','ball_dy','ball_dvx','ball_dvy'];for(const [prefix,n]of [['tm',3],['op',4]])for(let i=1;i<=n;i++)for(const field of ['dx','dy','dvx','dvy','present'])columns.push(prefix+i+'_'+field);columns.push('score_diff');
const key=(x,y,k)=> (y<0?1:y>0?2:0)|(x<0?4:x>0?8:0)|(k?16:0);
function features(state,id){const p=state.players.find(p=>p.id===id),g=state.gameState,b=g?.physicsState.discs[0],d=p?.disc;if(!b||!d)return null;const sign=p.team.id===1?1:-1,values=[sign*d.pos.x,d.pos.y,sign*d.speed.x,d.speed.y,sign*(b.pos.x-d.pos.x),b.pos.y-d.pos.y,sign*(b.speed.x-d.speed.x),b.speed.y-d.speed.y];for(const [team,limit]of [[p.team.id,3],[3-p.team.id,4]]){const ps=state.players.filter(q=>q.id!==id&&q.disc&&q.team.id===team).sort((a,b)=>Math.hypot(a.disc.pos.x-d.pos.x,a.disc.pos.y-d.pos.y)-Math.hypot(b.disc.pos.x-d.pos.x,b.disc.pos.y-d.pos.y)).slice(0,limit);for(let i=0;i<limit;i++){const o=ps[i]?.disc;values.push(...(o?[sign*(o.pos.x-d.pos.x),o.pos.y-d.pos.y,sign*(o.speed.x-d.speed.x),o.speed.y-d.speed.y,1]:[0,0,0,0,0]));}}values.push(sign*(g.redScore-g.blueScore));return Object.fromEntries(columns.map((c,i)=>[c,values[i]]));}
const histories=new WeakMap(),tactics=new WeakMap();
function validateModel(m){if(m?.schema!=='fuckball-policy-v1'||!Array.isArray(m.input_columns)||![33,44].includes(m.input_columns.length)||!m.input_columns.every(c=>columns.includes(c))||new Set(m.input_columns).size!==m.input_columns.length)throw Error('Unsupported model schema.');const n=m.input_columns.length,h=m.b1?.length,window=m.window||1,roles=m.w2?4:0,h2=m.w2?m.b2?.length:h;if(!Number.isInteger(window)||window<1||window>16||!Number.isInteger(h)||h<8||h>512||!Number.isInteger(h2)||h2<8||h2>512)throw Error('Unsupported model size.');const matrices=[['w1',n*window+roles,h],['wd',h2,9],['wk',h2,1]];if(m.w2)matrices.push(['w2',h,h2]);for(const [name,rows,cols]of matrices){if(!Array.isArray(m[name])||m[name].length!==rows||!m[name].every(row=>Array.isArray(row)&&row.length===cols&&row.every(v=>Number.isFinite(v)&&Math.abs(v)<1e5)))throw Error('Invalid model weights: '+name);}const vectors=[['mean',n],['std',n],['b1',h],['bd',9],['bk',1]];if(m.w2)vectors.push(['b2',h2]);for(const [name,size]of vectors)if(!Array.isArray(m[name])||m[name].length!==size||!m[name].every(Number.isFinite))throw Error('Invalid model vector: '+name);if(!m.std.every(v=>v>0)||!Number.isFinite(m.kick_threshold)||m.kick_threshold<0||m.kick_threshold>1)throw Error('Invalid normalization or threshold.');if(m.w2&&(!Array.isArray(m.role_order)||m.role_order.join(',')!=='gk,dm,am,st'))throw Error('Invalid role order.');return m;}
function reset(m){if(m)histories.delete(m);}
function infer(m,state,id,role='st'){const f=features(state,id);if(!f)return{input:0,confidence:0};const frame=m.input_columns.map((c,i)=>(f[c]-m.mean[i])/m.std[i]);let x=frame;if(m.w2){let all=histories.get(m);if(!all)histories.set(m,all=new Map());let sequence=all.get(id);if(!sequence)all.set(id,sequence=[]);sequence.push(frame);if(sequence.length>m.window)sequence.shift();const padding=Array.from({length:m.window-sequence.length},()=>sequence[0]);x=[...padding,...sequence].flat().concat(m.role_order.map(r=>+(r===role)));}let hidden=m.b1.map((b,j)=>Math.max(0,b+x.reduce((v,a,i)=>v+a*m.w1[i][j],0)));if(m.w2)hidden=m.b2.map((b,j)=>Math.max(0,b+hidden.reduce((v,a,i)=>v+a*m.w2[i][j],0)));const logits=m.bd.map((b,j)=>b+hidden.reduce((v,a,i)=>v+a*m.wd[i][j],0));const best=logits.indexOf(Math.max(...logits)),confidence=1/logits.reduce((s,z)=>s+Math.exp(z-logits[best]),0),kp=1/(1+Math.exp(-(m.bk[0]+hidden.reduce((v,a,i)=>v+a*m.wk[i][0],0))));const sign=state.players.find(p=>p.id===id).team.id===1?1:-1;return{input:key((best%3-1)*sign,Math.floor(best/3)-1,kp>=m.kick_threshold&&!(state.players.find(p=>p.id===id).input&16)&&Math.hypot(f.ball_dx,f.ball_dy)<=(m.kick_max_distance||31)),confidence,kickProbability:kp,directionClass:best};}
function legacyTactical(state,id,tick=0){const g=state.gameState,p=state.players.find(p=>p.id===id),ball=g?.physicsState.discs[0],d=p?.disc;if(!d||!ball)return 0;const sign=p.team.id===1?1:-1,s=g.stadium,team=state.players.filter(q=>q.disc&&q.team.id===p.team.id),opponents=state.players.filter(q=>q.disc&&q.team.id!==p.team.id&&q.team.id!==0);const goal=s.goals.find(q=>q.team.id!==p.team.id),ownGoal=s.goals.find(q=>q.team.id===p.team.id);const gx=goal?(goal.p0.x+goal.p1.x)/2:sign*(s.bgWidth||s.width-50),gy=goal?(goal.p0.y+goal.p1.y)/2:0,ownX=ownGoal?(ownGoal.p0.x+ownGoal.p1.x)/2:-gx;const width=Math.abs(gx),height=s.bgHeight||s.height-30;
const distance=q=>Math.hypot(q.disc.pos.x-ball.pos.x,q.disc.pos.y-ball.pos.y);const eligible=team.filter(q=>q.aiControlled!==false);const priority=q=>distance(q)+Math.max(0,sign*(q.disc.pos.x-ball.pos.x))*0.3;const ranked=(eligible.length?eligible:team).slice().sort((a,b)=>priority(a)-priority(b)||a.id-b.id);let strategy=tactics.get(state);if(!strategy)tactics.set(state,strategy={});const last=ranked.find(q=>q.id===strategy[p.team.id]);const selected=last&&priority(last)<=priority(ranked[0])+35?last:ranked[0];strategy[p.team.id]=selected.id;const human=team.find(q=>q.aiControlled===false&&distance(q)<35);const leader=human||selected;const ordered=[leader,...ranked.filter(q=>q.id!==leader.id)];const lead=Math.min(20,distance(p)/8);const decay=ball.damping||.99,travel=(1-Math.pow(decay,lead))/(1-decay||1);const bx=Math.max(-width+8,Math.min(width-8,ball.pos.x+ball.speed.x*travel)),by=Math.max(-height+10,Math.min(height-10,ball.pos.y+ball.speed.y*travel));let tx=bx-sign*(ball.radius+d.radius+7),ty=by,role='striker';
if(team.length>=3&&p.id!==ordered[0].id&&p.id===ranked.filter(q=>q.id!==ordered[0].id).sort((a,b)=>sign*(a.disc.pos.x-b.disc.pos.x))[0]?.id&&distance(p)>80){role='keeper';tx=ownX+sign*45;ty=Math.max(-65,Math.min(65,ball.pos.y*.65));if(ball.speed.x*sign<-.4){const t=(tx-ball.pos.x)/ball.speed.x;if(t>0&&t<140)ty=Math.max(-75,Math.min(75,ball.pos.y+ball.speed.y*t));}}
else if(ordered[0].id!==id&&team.length>1){role='support';const rank=ordered.findIndex(q=>q.id===id);tx=bx+sign*(rank===1?115:-85);ty=by+(rank%2?1:-1)*Math.min(125,height*.45);}
let aimX=gx,aimY=gy;const laneClear=(x,y)=>{const vx=x-ball.pos.x,vy=y-ball.pos.y,len=vx*vx+vy*vy;return !opponents.some(o=>{const t=Math.max(0,Math.min(1,((o.disc.pos.x-ball.pos.x)*vx+(o.disc.pos.y-ball.pos.y)*vy)/Math.max(1,len)));return t>.05&&t<.95&&Math.hypot(o.disc.pos.x-ball.pos.x-vx*t,o.disc.pos.y-ball.pos.y-vy*t)<o.disc.radius+ball.radius+5;});};
if(!laneClear(aimX,aimY)){const mates=team.filter(q=>q.id!==id&&sign*(q.disc.pos.x-ball.pos.x)>15&&distance(q)>55&&laneClear(q.disc.pos.x,q.disc.pos.y)).sort((a,b)=>sign*(b.disc.pos.x-a.disc.pos.x));if(mates[0]){aimX=mates[0].disc.pos.x;aimY=mates[0].disc.pos.y;}else aimY=(gy+(ball.pos.y>0?-1:1)*45);}
const ax=aimX-ball.pos.x,ay=aimY-ball.pos.y,al=Math.hypot(ax,ay)||1,dx=ball.pos.x-d.pos.x,dy=ball.pos.y-d.pos.y,dist=Math.hypot(dx,dy);if(role==='striker'){tx=bx-ax/al*(ball.radius+d.radius+3);ty=by-ay/al*(ball.radius+d.radius+3);if(dx*sign<0&&Math.abs(dy)<35){ty=by+(d.pos.y>=by?1:-1)*45;}}
const aligned=(dx*ax+dy*ay)/Math.max(1,dist*al)>.78;const close=dist<d.radius+ball.radius+3.8;const kick=close&&aligned&&!(p.input&16);if(dist<45&&aligned&&role==='striker'){tx=ball.pos.x;ty=ball.pos.y;}
tx=Math.max(-width+20,Math.min(width-20,tx));ty=Math.max(-height+20,Math.min(height-20,ty));const mx=tx-d.pos.x-d.speed.x*5,my=ty-d.pos.y-d.speed.y*5;return key(Math.abs(mx)<2?0:Math.sign(mx),Math.abs(my)<2?0:Math.sign(my),kick);}
const levels={easy:{reaction:18,lead:5,aim:.93,teamwork:false},normal:{reaction:8,lead:12,aim:.85,teamwork:true},hard:{reaction:4,lead:18,aim:.78,teamwork:true},elite:{reaction:2,lead:24,aim:.72,teamwork:true}};
const defaultProfile={support:115,spread:115,cover:150,press:110,screen:55};
function profile(raw={}){const out={};for(const k of Object.keys(defaultProfile)){const n=Number(raw[k]);out[k]=Number.isFinite(n)?Math.max(k==='screen'?30:60,Math.min(k==='screen'?90:220,n)):defaultProfile[k];}return out;}
function teamPlan(state,teamId,tick=0,raw={}){
 const g=state.gameState,b=g?.physicsState.discs[0],team=state.players.filter(p=>p.disc&&p.team.id===teamId),ops=state.players.filter(p=>p.disc&&p.team.id===3-teamId),cfg=profile(raw),sign=teamId===1?1:-1;if(!b||!team.length)return {};
 const s=g.stadium,goal=s.goals.find(x=>x.team.id!==teamId),own=s.goals.find(x=>x.team.id===teamId),gx=goal?(goal.p0.x+goal.p1.x)/2:sign*(s.bgWidth||s.width-50),ox=own?(own.p0.x+own.p1.x)/2:-gx,height=s.bgHeight||s.height-30;
 const dist=p=>Math.hypot(p.disc.pos.x-b.pos.x,p.disc.pos.y-b.pos.y),score=p=>dist(p)+Math.max(0,sign*(p.disc.pos.x-b.pos.x))*.45;
 const bots=team.filter(p=>p.aiControlled!==false),rank=(bots.length?bots:team).slice().sort((a,c)=>score(a)-score(c)||a.id-c.id);let memory=tactics.get(state);if(!memory)tactics.set(state,memory={});const previous=rank.find(p=>p.id===memory[teamId]);const chaser=previous&&score(previous)<score(rank[0])+25?previous:rank[0];memory[teamId]=chaser.id;
 const carrier=team.filter(p=>dist(p)<40&&sign*(b.pos.x-p.disc.pos.x)>-5).sort((a,c)=>dist(a)-dist(c))[0];const leader=carrier||chaser;const remaining=bots.filter(p=>p.id!==leader.id),keeper=team.length>=3?remaining.slice().sort((a,c)=>sign*(a.disc.pos.x-c.disc.pos.x)||a.id-c.id)[0]:null;
 const nearest=ops.slice().sort((a,c)=>dist(a)-dist(c))[0],underPressure=nearest&&dist(nearest)<cfg.press,ownDanger=sign*b.pos.x<-Math.abs(gx)*.55,attacking=carrier&&!ownDanger;
 const free=remaining.filter(p=>p!==keeper).sort((a,c)=>a.id-c.id),plan={};
 for(const p of team){let role='chaser',x=b.pos.x-sign*22,y=b.pos.y;
  if(p===keeper){
    // Sweeper keeper in 4v4: close the space behind the press rather than
    // remaining pinned to the goal line. Stay behind the ball and recover
    // for genuine shots; these are target positions, never physics overrides.
    role='keeper';
    const depth=Math.max(0,sign*(b.pos.x-ox)),width=Math.abs(gx);
    const forwardDepth=ownDanger?Math.max(90,Math.min(165,depth*.5)):Math.min(345,155+depth*.30);
    x=ox+sign*forwardDepth;
    y=Math.max(-Math.min(height*.62,160),Math.min(Math.min(height*.62,160),b.pos.y*.8));
    const opponentOnBall=nearest&&dist(nearest)<95;
    const openToChallenge=team.filter(q=>q!==p&&q.disc).every(q=>dist(q)>dist(p)-45);
    if(opponentOnBall&&depth<width*.95&&openToChallenge){
      // Attack the ball carrier early when no outfield teammate can cover it.
      x=ox+sign*Math.min(365,Math.max(105,depth-18));
      y=Math.max(-height+30,Math.min(height-30,b.pos.y+b.speed.y*3));
    }
    if(b.speed.x*sign< -1.15&&depth<420){
      const toGoal=(ox-b.pos.x)/b.speed.x;
      const shotY=b.pos.y+b.speed.y*Math.max(0,toGoal);
      if(toGoal>0&&toGoal<80&&Math.abs(shotY)<110){
        // Recover for actual goal-bound shots; do not chase through the net.
        x=ox+sign*65;
        y=Math.max(-95,Math.min(95,shotY));
      }
    }
   }
  else if(p.id!==leader.id){const i=free.indexOf(p),lane=(i%2? -1:1);role=i===0?'support':'cover';x=b.pos.x+sign*(i===0?cfg.support:-cfg.cover);y=b.pos.y+lane*cfg.spread;
   // One teammate screens the nearest defender only while we control the ball under pressure.
   // The other teammate stays available as a passing option; the keeper retains cover.
   if(i===1&&attacking&&underPressure&&Math.hypot(nearest.disc.pos.x-p.disc.pos.x,nearest.disc.pos.y-p.disc.pos.y)<240){role='screen';const vx=nearest.disc.pos.x-carrier.disc.pos.x,vy=nearest.disc.pos.y-carrier.disc.pos.y,len=Math.hypot(vx,vy)||1;x=carrier.disc.pos.x+vx/len*Math.min(cfg.screen,len*.65);y=carrier.disc.pos.y+vy/len*Math.min(cfg.screen,len*.65);}
   else if(i===0&&!carrier&&underPressure&&ownDanger){role='press';x=b.pos.x-sign*35;y=b.pos.y+(p.disc.pos.y>b.pos.y?1:-1)*35;}
  }
  plan[p.id]={role,x:Math.max(-Math.abs(gx)+22,Math.min(Math.abs(gx)-22,x)),y:Math.max(-height+22,Math.min(height-22,y)),leader:leader.id};
 }return plan;
}
function tactical(state,id,tick=0,options={}){
 const p=state.players.find(p=>p.id===id),b=state.gameState?.physicsState.discs[0];if(!p?.disc||!b)return 0;const level=levels[options.difficulty]||levels.hard;if(tick%level.reaction!==0)return (p.input||0)&15;
 const team=state.players.filter(q=>q.disc&&q.team.id===p.team.id);if(team.length<3||!level.teamwork)return legacyTactical(state,id,tick);
 const plan=teamPlan(state,p.team.id,tick,options.profile),intent=plan[id],d=p.disc,sign=p.team.id===1?1:-1;let x=intent.x,y=intent.y;const dx=b.pos.x-d.pos.x,dy=b.pos.y-d.pos.y,dist=Math.hypot(dx,dy),g=state.gameState.stadium.goals.find(q=>q.team.id!==p.team.id);let ax=(g?(g.p0.x+g.p1.x)/2:sign*700)-b.pos.x,ay=(g?(g.p0.y+g.p1.y)/2:0)-b.pos.y;
 const opponents=state.players.filter(q=>q.disc&&q.team.id===3-p.team.id);const clear=(vx,vy)=>!opponents.some(o=>{const t=((o.disc.pos.x-b.pos.x)*vx+(o.disc.pos.y-b.pos.y)*vy)/(vx*vx+vy*vy||1);return t>.03&&t<1&&Math.hypot(o.disc.pos.x-b.pos.x-vx*t,o.disc.pos.y-b.pos.y-vy*t)<o.disc.radius+b.radius+5;});
 if(!clear(ax,ay)){const mate=team.filter(q=>q.id!==id&&sign*(q.disc.pos.x-b.pos.x)>30&&clear(q.disc.pos.x-b.pos.x,q.disc.pos.y-b.pos.y)).sort((a,c)=>sign*(c.disc.pos.x-a.disc.pos.x))[0];if(mate){ax=mate.disc.pos.x-b.pos.x;ay=mate.disc.pos.y-b.pos.y;}else ay+=(b.pos.y>0?-1:1)*50;}
 const len=Math.hypot(ax,ay)||1,aligned=(dx*ax+dy*ay)/Math.max(1,dist*len)>level.aim;
 if(intent.role==='chaser'){const lead=Math.min(level.lead,dist/8),decay=b.damping||.99,travel=Math.abs(1-decay)<1e-6?lead:(1-Math.pow(decay,lead))/(1-decay);x=b.pos.x+b.speed.x*travel-ax/len*(b.radius+d.radius+3);y=b.pos.y+b.speed.y*travel-ay/len*(b.radius+d.radius+3);if(dx*sign<0&&Math.abs(dy)<35)y=b.pos.y+(d.pos.y>=b.pos.y?1:-1)*45;if(dist<45&&aligned){x=b.pos.x;y=b.pos.y;}}
 // Separate supporting teammates without changing engine collisions or applying forces.
 if(intent.role!=='chaser'&&intent.role!=='screen')for(const q of team)if(q.id!==id){const vx=d.pos.x-q.disc.pos.x,vy=d.pos.y-q.disc.pos.y,l=Math.hypot(vx,vy);if(l>0&&l<45){x+=vx/l*(45-l);y+=vy/l*(45-l);}}
 const mx=x-d.pos.x-d.speed.x*5,my=y-d.pos.y-d.speed.y*5,kick=dist<d.radius+b.radius+3.8&&aligned&&!(p.input&16);return key(Math.abs(mx)<2?0:Math.sign(mx),Math.abs(my)<2?0:Math.sign(my),kick);
}
root.FuckballAI={levels,defaultProfile,profile,teamPlan,legacyTactical,columns,key,features,validateModel,infer,tactical,reset};if(typeof module!=='undefined')module.exports=root.FuckballAI;
})(typeof window!=='undefined'?window:globalThis);
