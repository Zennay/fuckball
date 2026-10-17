(function(root){'use strict';
const columns=['own_x','own_y','own_vx','own_vy','ball_dx','ball_dy','ball_dvx','ball_dvy'];for(const [prefix,n]of [['tm',3],['op',4]])for(let i=1;i<=n;i++)for(const field of ['dx','dy','dvx','dvy','present'])columns.push(prefix+i+'_'+field);columns.push('score_diff');
const key=(x,y,k)=> (y<0?1:y>0?2:0)|(x<0?4:x>0?8:0)|(k?16:0);
function features(state,id){const p=state.players.find(p=>p.id===id),g=state.gameState,b=g?.physicsState.discs[0],d=p?.disc;if(!b||!d)return null;const sign=p.team.id===1?1:-1,values=[sign*d.pos.x,d.pos.y,sign*d.speed.x,d.speed.y,sign*(b.pos.x-d.pos.x),b.pos.y-d.pos.y,sign*(b.speed.x-d.speed.x),b.speed.y-d.speed.y];for(const [team,limit]of [[p.team.id,3],[3-p.team.id,4]]){const ps=state.players.filter(q=>q.id!==id&&q.disc&&q.team.id===team).sort((a,b)=>Math.hypot(a.disc.pos.x-d.pos.x,a.disc.pos.y-d.pos.y)-Math.hypot(b.disc.pos.x-d.pos.x,b.disc.pos.y-d.pos.y)).slice(0,limit);for(let i=0;i<limit;i++){const o=ps[i]?.disc;values.push(...(o?[sign*(o.pos.x-d.pos.x),o.pos.y-d.pos.y,sign*(o.speed.x-d.speed.x),o.speed.y-d.speed.y,1]:[0,0,0,0,0]));}}values.push(sign*(g.redScore-g.blueScore));return Object.fromEntries(columns.map((c,i)=>[c,values[i]]));}
const histories=new WeakMap(),tactics=new WeakMap(),plans=new WeakMap();
function validateModel(m){if(m?.schema!=='fuckball-policy-v1'||!Array.isArray(m.input_columns)||![33,44].includes(m.input_columns.length)||!m.input_columns.every(c=>columns.includes(c))||new Set(m.input_columns).size!==m.input_columns.length)throw Error('Unsupported model schema.');const n=m.input_columns.length,h=m.b1?.length,window=m.window||1,roles=m.w2?4:0,h2=m.w2?m.b2?.length:h;if(!Number.isInteger(window)||window<1||window>16||!Number.isInteger(h)||h<8||h>512||!Number.isInteger(h2)||h2<8||h2>512)throw Error('Unsupported model size.');const matrices=[['w1',n*window+roles,h],['wd',h2,9],['wk',h2,1]];if(m.w2)matrices.push(['w2',h,h2]);for(const [name,rows,cols]of matrices){if(!Array.isArray(m[name])||m[name].length!==rows||!m[name].every(row=>Array.isArray(row)&&row.length===cols&&row.every(v=>Number.isFinite(v)&&Math.abs(v)<1e5)))throw Error('Invalid model weights: '+name);}const vectors=[['mean',n],['std',n],['b1',h],['bd',9],['bk',1]];if(m.w2)vectors.push(['b2',h2]);for(const [name,size]of vectors)if(!Array.isArray(m[name])||m[name].length!==size||!m[name].every(Number.isFinite))throw Error('Invalid model vector: '+name);if(!m.std.every(v=>v>0)||!Number.isFinite(m.kick_threshold)||m.kick_threshold<0||m.kick_threshold>1)throw Error('Invalid normalization or threshold.');if(m.w2&&(!Array.isArray(m.role_order)||m.role_order.join(',')!=='gk,dm,am,st'))throw Error('Invalid role order.');return m;}
function reset(m){if(m)histories.delete(m);}
// Tactical memory of a room (sticky striker/keeper per team), so a room that moves to another host keeps its bots' roles.
function memoryOf(state){const m=tactics.get(state);return m?JSON.parse(JSON.stringify(m)):null;}
function setMemory(state,memory){if(memory&&typeof memory==='object')tactics.set(state,JSON.parse(JSON.stringify(memory)));else tactics.delete(state);}
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
const levels={easy:{reaction:18,lead:5,aim:.93,teamwork:false},normal:{reaction:6,lead:12,aim:.88,teamwork:true},hard:{reaction:2,lead:18,aim:.84,teamwork:true},elite:{reaction:1,lead:24,aim:.84,teamwork:true}};
const defaultProfile={support:115,spread:115,cover:150,press:110,screen:55};
function profile(raw={}){const out={};for(const k of Object.keys(defaultProfile)){const n=Number(raw[k]);out[k]=Number.isFinite(n)?Math.max(k==='screen'?30:60,Math.min(k==='screen'?90:220,n)):defaultProfile[k];}return out;}
// Engine player movement from rest (plus current velocity) after k frames.
function playerPhysics(s){const pp=s?.playerPhysics||{};const a=Number(pp.VW??pp.acceleration)||.1,d=Number(pp.m??pp.damping)||.96;return{a,d,vmax:a*d/(1-d)};}
function reach(p,k,tx,ty,ph){const d=p.disc,dx=tx-d.pos.x,dy=ty-d.pos.y,l=Math.hypot(dx,dy)||1,v0=(d.speed.x*dx+d.speed.y*dy)/l,g=ph.d*(1-Math.pow(ph.d,k))/(1-ph.d);return ph.vmax*(k-g)+v0*g;}
// Earliest frame at which player p can touch the moving ball (walls ignored).
function intercept(b,p,ph,max=90){if(!p?.disc)return null;let x=b.pos.x,y=b.pos.y,vx=b.speed.x,vy=b.speed.y;const damp=b.damping||.99,r=p.disc.radius+b.radius;for(let k=0;k<=max;k+=2){if(k){for(let i=0;i<2;i++){x+=vx;y+=vy;vx*=damp;vy*=damp;}}if(Math.hypot(x-p.disc.pos.x,y-p.disc.pos.y)-r<=Math.max(0,reach(p,k,x,y,ph)))return{k,x,y};}return null;}
function teamPlan(state,teamId,tick=0,raw={}){
 // All teammates share one plan per tick; computing it once keeps the
 // keeper's interception search cheap with eight bots.
 let cache=plans.get(state);if(!cache)plans.set(state,cache={});const ball=state.gameState?.physicsState.discs[0];
 // Same-tick host handovers can change whether a human is AI-controlled
 // without moving anyone. Keeper/interception also depends on individual
 // speed and collision radii. All of these must invalidate cached tactics;
 // unchanged snapshots still share one plan to bound eight-bot CPU work.
 const sig=tick+':'+JSON.stringify(raw)+':'+(ball?ball.pos.x+','+ball.pos.y+','+ball.speed.x+','+ball.speed.y+','+ball.radius+','+ball.damping:'')+':'+state.players.map(p=>p.id+'.'+p.team.id+'.'+(p.aiControlled===false?'human':'ai')+(p.disc?'.'+p.disc.pos.x+'.'+p.disc.pos.y+'.'+p.disc.speed.x+'.'+p.disc.speed.y+'.'+p.disc.radius:'')).join('|');
 if(cache[teamId]?.sig===sig)return cache[teamId].plan;const plan=buildPlan(state,teamId,tick,raw);cache[teamId]={sig,plan};return plan;
}
function buildPlan(state,teamId,tick=0,raw={}){
 const g=state.gameState,b=g?.physicsState.discs[0],team=state.players.filter(p=>p.disc&&p.team.id===teamId),ops=state.players.filter(p=>p.disc&&p.team.id===3-teamId),cfg=profile(raw),sign=teamId===1?1:-1;if(!b||!team.length)return {};
 const s=g.stadium,goal=s.goals.find(x=>x.team.id!==teamId),own=s.goals.find(x=>x.team.id===teamId),gx=goal?(goal.p0.x+goal.p1.x)/2:sign*(s.bgWidth||s.width-50),ox=own?(own.p0.x+own.p1.x)/2:-gx,height=s.bgHeight||s.height-30;
 const dist=p=>Math.hypot(p.disc.pos.x-b.pos.x,p.disc.pos.y-b.pos.y),score=p=>dist(p)+Math.max(0,sign*(p.disc.pos.x-b.pos.x))*.45;
 const bots=team.filter(p=>p.aiControlled!==false);let memory=tactics.get(state);if(!memory)tactics.set(state,memory={});
 // Keep one sweeper-keeper assigned across possession changes. A role flip
 // each time the keeper approached the ball made the whole defense hesitate.
 const keeperCandidates=bots.slice().sort((a,c)=>sign*(a.disc.pos.x-c.disc.pos.x)||a.id-c.id);
 const sticky=keeperCandidates.find(p=>p.id===memory['keeper'+teamId]);
 const keeper=team.length>=3&&bots.length>1?(sticky||keeperCandidates[0]):null;
 if(keeper)memory['keeper'+teamId]=keeper.id;
 const field=bots.filter(p=>p!==keeper),rank=(field.length?field:team.filter(p=>p!==keeper)).slice().sort((a,c)=>score(a)-score(c)||a.id-c.id);
 const previous=rank.find(p=>p.id===memory[teamId]);
 const chaser=previous&&score(previous)<score(rank[0])+25?previous:rank[0];
 memory[teamId]=chaser?.id;
 const carrier=team.filter(p=>p!==keeper&&dist(p)<40&&sign*(b.pos.x-p.disc.pos.x)>-5).sort((a,c)=>dist(a)-dist(c))[0];
 const leader=carrier||chaser;const remaining=bots.filter(p=>p.id!==leader.id);
 const nearest=ops.slice().sort((a,c)=>dist(a)-dist(c))[0],underPressure=nearest&&dist(nearest)<cfg.press,ownDanger=sign*b.pos.x<-Math.abs(gx)*.55,attacking=carrier&&!ownDanger;
 const free=remaining.filter(p=>p!==keeper).sort((a,c)=>a.id-c.id),plan={};
 const physics=playerPhysics(s);
 for(const p of team){let role='chaser',x=b.pos.x-sign*22,y=b.pos.y,clear=false;
  if(p===keeper){
    // 4v4 keeper: narrow the angle from in front of goal, leave the box to
    // sweep loose balls it reaches first, and step onto the path of shots
    // instead of backing onto the line. Targets only; physics is untouched.
    role='keeper';
    const width=Math.abs(gx),gy=own?Math.abs(own.p0.y-own.p1.y)/2:85,depth=Math.max(0,sign*(b.pos.x-ox));
    const mine=intercept(b,p,physics,120),theirs=ops.map(o=>intercept(b,o,physics,120)).filter(Boolean).reduce((m,i)=>Math.min(m,i.k),Infinity);
    const mates=team.filter(q=>q!==p&&q.disc).map(q=>intercept(b,q,physics,120)).filter(Boolean).reduce((m,i)=>Math.min(m,i.k),Infinity);
    const toGoal=b.speed.x*sign<-.6?(ox-b.pos.x)/b.speed.x:Infinity,shotY=b.pos.y+b.speed.y*(Number.isFinite(toGoal)?toGoal:0);
    const shot=Number.isFinite(toGoal)&&toGoal>0&&toGoal<150&&Math.abs(shotY)<gy+45;
    const mineDepth=mine?sign*(mine.x-ox):Infinity;
    const sweep=mine&&mineDepth<width*.9&&mine.k+3<theirs&&(mine.k<=mates+4||theirs<mates);
    if(shot&&mine&&mineDepth>-5){
      // Meet the shot as early as it can be reached.
      role='keeper';x=mine.x;y=mine.y;clear=true;
    }else if(sweep){
      x=mine.x;y=mine.y;clear=true;
    }else{
      // Stand on the ball-goal line. Further out when the ball is far away or
      // we have it, closer when an attacker is near; never past the ball.
      const vx=b.pos.x-ox,vy=b.pos.y,len=Math.hypot(vx,vy)||1;
      const out=carrier&&!ownDanger?Math.min(330,150+depth*.3):Math.max(38,Math.min(230,len*.36));
      const d=Math.min(out,Math.max(30,len-70));
      x=ox+vx/len*d;y=vy/len*d;
      y=Math.max(-height+30,Math.min(height-30,y));
    }
   }
  else if(p.id!==leader.id){const i=free.indexOf(p),lane=(i%2? -1:1);role=i===0?'support':'cover';x=b.pos.x+sign*(i===0?cfg.support:-cfg.cover);y=b.pos.y+lane*cfg.spread;
   // One teammate screens the nearest defender only while we control the ball under pressure.
   // The other teammate stays available as a passing option; the keeper retains cover.
   if(i===1&&attacking&&underPressure&&Math.hypot(nearest.disc.pos.x-p.disc.pos.x,nearest.disc.pos.y-p.disc.pos.y)<240){role='screen';const vx=nearest.disc.pos.x-carrier.disc.pos.x,vy=nearest.disc.pos.y-carrier.disc.pos.y,len=Math.hypot(vx,vy)||1;x=carrier.disc.pos.x+vx/len*Math.min(cfg.screen,len*.65);y=carrier.disc.pos.y+vy/len*Math.min(cfg.screen,len*.65);}
   else if(i===0&&!carrier&&underPressure&&ownDanger){role='press';x=b.pos.x-sign*35;y=b.pos.y+(p.disc.pos.y>b.pos.y?1:-1)*35;}
  }
  if(role==='support'||role==='cover'){
   const pocket=supportTarget(b,p,ops,x,y,sign,Math.abs(gx)-35,height-35);
   x=pocket.x;y=pocket.y;
  }
  plan[p.id]={role,clear,x:Math.max(-Math.abs(gx)+22,Math.min(Math.abs(gx)-22,x)),y:Math.max(-height+22,Math.min(height-22,y)),leader:leader.id};
 }return plan;
}
// Assess a *moving* passing lane, not just whether today's straight line is empty.
// Receiver and opponents advance while the ball is travelling. Positive clearance
// means the ball is likely to pass the defender with space to spare.
function laneMargin(ball,tx,ty,opponents){
 const vx=tx-ball.pos.x,vy=ty-ball.pos.y,length=Math.hypot(vx,vy);
 if(length<1)return -Infinity;
 let margin=Infinity;
 for(const o of opponents){
  const d=o.disc;const t=Math.max(0,Math.min(1,((d.pos.x-ball.pos.x)*vx+(d.pos.y-ball.pos.y)*vy)/(length*length)));
  if(t<.035||t>.97)continue;
  const travel=Math.min(28,t*length/6.8);
  const px=d.pos.x+d.speed.x*travel*.65,py=d.pos.y+d.speed.y*travel*.65;
  const predictedT=Math.max(0,Math.min(1,((px-ball.pos.x)*vx+(py-ball.pos.y)*vy)/(length*length)));
  if(predictedT<.04||predictedT>.97)continue;
  const gap=Math.hypot(px-ball.pos.x-vx*predictedT,py-ball.pos.y-vy*predictedT)-(d.radius+ball.radius+6);
  margin=Math.min(margin,gap);
 }
 return margin;
}
// Keep the puck-like HaxBall physics intact: only select a target/direction;
// physical kicks remain radial and must be aligned by moving behind the ball.
// Select an actual gap *inside* the posts instead of always shooting centrally.
// Prefer the centre on ties, but move the shot towards an unblocked corner.
function shotTarget(ball,goal,opponents){
 const gx=(goal.p0.x+goal.p1.x)/2,gy=(goal.p0.y+goal.p1.y)/2;
 const half=Math.max(0,Math.abs(goal.p0.y-goal.p1.y)/2-ball.radius-9);
 let best=null;
 for(const fraction of [0,-.55,.55,-.85,.85]){
  const y=gy+half*fraction,margin=laneMargin(ball,gx,y,opponents);
  const score=Math.min(100,margin)*1.5-Math.abs(fraction)*8;
  if(!best||score>best.score)best={x:gx,y,margin,score};
 }
 return best;
}
// Find a receiving pocket rather than waiting for a static formation marker.
// Nearby markers and interception paths both matter; small moves win ties to
// prevent perpetual lateral zig-zagging when already open.
function supportTarget(ball,p,opponents,baseX,baseY,sign,width,height){
 const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
 let best=null;
 for(const forward of [0,65,-45])for(const wide of [0,-75,75,-135,135]){
  const x=clamp(baseX+sign*forward,-width,width);
  const y=clamp(baseY+wide,-height,height);
  const gap=Math.min(190,...opponents.map(o=>Math.hypot(o.disc.pos.x-x,o.disc.pos.y-y)));
  const margin=laneMargin(ball,x,y,opponents);
  const value=gap*.85+Math.min(90,margin)*.6-
    Math.hypot(x-baseX,y-baseY)*.17-
    Math.hypot(x-p.disc.pos.x,y-p.disc.pos.y)*.045;
  if(!best||value>best.value)best={x,y,value,gap,margin};
 }
 return best;
}
function chooseDelivery(state,p,options={}){
 const g=state.gameState,b=g?.physicsState.discs[0];
 if(!p?.disc||!b)return null;
 const sign=p.team.id===1?1:-1,s=g.stadium,ops=state.players.filter(q=>q.disc&&q.team.id===3-p.team.id);
 const goal=s.goals.find(q=>q.team.id===3-p.team.id),own=s.goals.find(q=>q.team.id===p.team.id);
 const gx=goal?(goal.p0.x+goal.p1.x)/2:sign*(s.bgWidth||s.width-50),gy=goal?(goal.p0.y+goal.p1.y)/2:0;
 const ox=own?(own.p0.x+own.p1.x)/2:-gx;
 const x=b.pos.x,y=b.pos.y,goalDistance=Math.hypot(gx-x,gy-y);
 const threat=Math.min(Infinity,...ops.map(o=>Math.min(Math.hypot(o.disc.pos.x-x,o.disc.pos.y-y),Math.hypot(o.disc.pos.x-p.disc.pos.x,o.disc.pos.y-p.disc.pos.y))));
 const pressured=threat<(options.keeper?115:85),defending=sign*(x-ox)<(Math.abs(gx-ox)*.36);
 const shot=goal?shotTarget(b,goal,ops):{x:gx,y:gy,margin:laneMargin(b,gx,gy,ops)};
 const shotMargin=shot.margin,shotOpen=shotMargin>2&&sign*(gx-x)>0;
 const height=s.bgHeight||s.height-30,width=Math.abs(gx)-30;
 let best=null;
 for(const q of state.players){
  if(q.id===p.id||!q.disc||q.team.id!==p.team.id)continue;
  const d=q.disc,initial=Math.hypot(d.pos.x-x,d.pos.y-y);
  if(initial<65||initial>820)continue;
  const lead=Math.min(22,Math.max(3,initial/8));
  const tx=Math.max(-width,Math.min(width,d.pos.x+d.speed.x*lead));
  const ty=Math.max(-height,Math.min(height,d.pos.y+d.speed.y*lead));
  const length=Math.hypot(tx-x,ty-y);
  if(length<65)continue;
  const forward=sign*(tx-x);
  // A backwards safety pass is useful, but don't ping-pong to a deeply
  // positioned keeper while everyone else is already in the attacking half.
  if(options.keeper&&forward<25)continue; // Never gift a goal-side backpass.
  if(forward< -190&&!pressured)continue;
  const margin=laneMargin(b,tx,ty,ops);
  if(margin<(pressured?8:3))continue;
  const openness=Math.min(180,...ops.map(o=>Math.hypot(o.disc.pos.x-tx,o.disc.pos.y-ty)));
  if(openness<42)continue;
  const keeperPenalty=sign*(tx-ox)<90?70:0;
  const score=forward*.65+Math.min(openness,155)*.63+Math.min(margin,75)*.40-length*.17-keeperPenalty+
    (forward>20&&forward<370?42:0);
  if(!best||score>best.score)best={type:'pass',x:tx,y:ty,receiverId:q.id,score,margin,pressure:pressured};
 }
 // A clear shot from scoring range beats a speculative extra pass. Otherwise
 // use the best safe teammate; even an open distant goal is not an instruction
 // to shoot from midfield when teammates can make progress.
 if(!options.keeper&&shotOpen&&goalDistance<270&&(!best||!pressured&&goalDistance<195))
  return {type:'shot',x:shot.x,y:shot.y,margin:shotMargin,pressure:pressured};
 if(best&&(options.keeper||goalDistance>270||!shotOpen||pressured||best.score>145))
  return best;
 if(shotOpen&&!options.keeper)
  return {type:'shot',x:shot.x,y:shot.y,margin:shotMargin,pressure:pressured};
 if(best)return best;
 // A goalkeeper may wait briefly for a teammate to break free when safe.
 // Never stall with an attacker approaching, a ball headed into our goal or
 // during an emergency sweep. The caller caps this wait at 24 engine ticks.
 const atKeeper=Math.hypot(x-p.disc.pos.x,y-p.disc.pos.y)<70;
 const incoming=sign*b.speed.x<-.9&&sign*(x-ox)<340;
 if(options.keeper&&!options.forceClear&&!pressured&&!incoming&&atKeeper&&sign*(x-ox)>135)
  return {type:'hold',x:x+sign*160,y,pressure:false,margin:0};
 // Search several CLEARING LANES, not just the nearest attacker's feet.
 // When no pass exists and pressure is real, pick the least interceptable
 // forward flank immediately rather than requiring a perfect opportunity.
 const flank=ops.length?(ops.reduce((a,o)=>a+Math.sign(y-o.disc.pos.y),0)>=0?1:-1):(y>=0?1:-1);
 const tx=Math.max(-width,Math.min(width,x+sign*(options.keeper||defending?430:320)));
 let safest=null;
 for(const side of [flank,-flank])for(const offset of [125,195,260]){
  const ty=Math.max(-height,Math.min(height,y+side*offset));
  const margin=laneMargin(b,tx,ty,ops);
  const score=Math.min(135,margin)-Math.abs(ty-y)*.085+(side===flank?5:0);
  if(!safest||score>safest.score)safest={type:'clear',x:tx,y:ty,pressure:pressured,margin,score};
 }
 return safest;
}
function tactical(state,id,tick=0,options={}){
 const p=state.players.find(p=>p.id===id),b=state.gameState?.physicsState.discs[0];if(!p?.disc||!b)return 0;
 const level=levels[options.difficulty]||levels.hard;
 if(tick%level.reaction!==0)return (p.input||0)&15;
 const team=state.players.filter(q=>q.disc&&q.team.id===p.team.id);
 if(team.length<3||!level.teamwork)return legacyTactical(state,id,tick);
 const plan=teamPlan(state,p.team.id,tick,options.profile),intent=plan[id],d=p.disc,sign=p.team.id===1?1:-1;
 let x=intent.x,y=intent.y;
 const dx=b.pos.x-d.pos.x,dy=b.pos.y-d.pos.y,dist=Math.hypot(dx,dy);
 const keeper=intent.role==='keeper';
 const memory=tactics.get(state)||{};
 const waitingKey='distributionWait'+id;
 let target=chooseDelivery(state,p,{keeper});
 if(keeper&&target.type==='hold'){
  if(!Number.isFinite(memory[waitingKey])||tick<memory[waitingKey])memory[waitingKey]=tick;
  if(tick-memory[waitingKey]>=24){
   target=chooseDelivery(state,p,{keeper:true,forceClear:true});
   // Limit waiting even when the receiver stays covered: the goalkeeper
   // must distribute decisively instead of oscillating indefinitely.
  }
 }else delete memory[waitingKey];
 const ax=target.x-b.pos.x,ay=target.y-b.pos.y,len=Math.hypot(ax,ay)||1;
 const alignment=(dx*ax+dy*ay)/Math.max(1,dist*len);
 const aligned=alignment>level.aim;
 if(intent.role==='chaser'){
  const lead=Math.min(level.lead,dist/8),decay=b.damping||.99;
  const travel=Math.abs(1-decay)<1e-6?lead:(1-Math.pow(decay,lead))/(1-decay);
  x=b.pos.x+b.speed.x*travel-ax/len*(b.radius+d.radius+3);
  y=b.pos.y+b.speed.y*travel-ay/len*(b.radius+d.radius+3);
  if(dx*sign<0&&Math.abs(dy)<35)y=b.pos.y+(d.pos.y>=b.pos.y?1:-1)*45;
  if(dist<45&&aligned){x=b.pos.x;y=b.pos.y;}
 }
 // Keep teammates wide and available instead of letting receivers bunch up
 // behind an opponent. This affects intention only, not engine collisions.
 if(intent.role==='support'||intent.role==='cover'){
  const ops=state.players.filter(q=>q.disc&&q.team.id===3-p.team.id);
  const obstruction=ops.find(q=>Math.hypot(q.disc.pos.x-x,q.disc.pos.y-y)<65);
  if(obstruction){
   const side=y>=obstruction.disc.pos.y?1:-1;
   y+=side*70;
   x+=sign*35;
  }
 }
 if(intent.role!=='chaser'&&intent.role!=='screen'&&!intent.clear)
  for(const q of team)if(q.id!==id){const vx=d.pos.x-q.disc.pos.x,vy=d.pos.y-q.disc.pos.y,l=Math.hypot(vx,vy);if(l>0&&l<45){x+=vx/l*(45-l);y+=vy/l*(45-l);}}
 if(intent.clear){
  // The sweeper must meet the incoming shot first. Once close enough to kick,
  // use the SAME aimed distribution decision as the field players.
  if(dist<55){x=b.pos.x-ax/len*(b.radius+d.radius-3);y=b.pos.y-ay/len*(b.radius+d.radius-3);}
  const goalSide=sign*dx>=-3;
  const urgent=target.type==='clear'&&goalSide&&alignment>.42;
  const mx=x-d.pos.x-d.speed.x*(dist<60?2:5),my=y-d.pos.y-d.speed.y*(dist<60?2:5);
  const kick=dist<d.radius+b.radius+4.2&&target.type!=='hold'&&(aligned||urgent)&&!(p.input&16);
  return key(Math.abs(mx)<1.5?0:Math.sign(mx),Math.abs(my)<1.5?0:Math.sign(my),kick);
 }
 // A keeper who collects without an emergency sweep must distribute too.
 if(intent.role==='keeper'&&dist<65){
  x=b.pos.x-ax/len*(b.radius+d.radius-3);
  y=b.pos.y-ay/len*(b.radius+d.radius-3);
  if(dist<44&&aligned){x=b.pos.x;y=b.pos.y;}
 }
 const mx=x-d.pos.x-d.speed.x*(dist<65?3:5),my=y-d.pos.y-d.speed.y*(dist<65?3:5);
 const contact=dist<d.radius+b.radius+3.8;
 const kick=contact&&aligned&&target.type!=='hold'&&!(p.input&16)&&intent.role!=='screen'&&
   (intent.role==='chaser'||intent.role==='keeper'||dist<34);
 return key(Math.abs(mx)<2?0:Math.sign(mx),Math.abs(my)<2?0:Math.sign(my),kick);
}
root.FuckballAI={intercept,playerPhysics,levels,defaultProfile,profile,teamPlan,chooseDelivery,laneMargin,legacyTactical,columns,key,features,validateModel,infer,tactical,reset,memoryOf,setMemory};if(typeof module!=='undefined')module.exports=root.FuckballAI;
})(typeof window!=='undefined'?window:globalThis);
