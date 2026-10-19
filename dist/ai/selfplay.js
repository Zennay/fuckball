(function(root){'use strict';
const AI=root.FuckballAI||(typeof require==='function'?require('./policy.js'):null);
const Telemetry=(typeof module!=='undefined'&&typeof require==='function')
 ?require('../../training/ball-telemetry.cjs').BallTelemetry:null;
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
// Controlled native-engine situations enrich imitation data and evolution.
// Official validation always uses independent, ordinary kickoff positions.
function seedTrainingScene(room,side,scenario){
 if(scenario===null||scenario===undefined)return;
 const st=room.state.stadium,w=Math.abs(st.bgWidth||st.width||650)-55,h=Math.abs(st.bgHeight||st.height||280)-35;
 const layouts=[
  {ball:[-.12,0],team:[[-.19,0],[-.78,0],[.14,.42],[-.27,-.55]],opp:[[.08,.08],[.2,-.45],[.56,.52],[.78,0]]},
  {ball:[-.62,.16],team:[[-.36,.22],[-.68,.16],[-.12,-.42],[-.22,.55]],opp:[[-.25,.02],[.22,.45],[.3,-.5],[.82,0]]},
  {ball:[.56,-.09],team:[[.5,-.09],[-.75,0],[.18,.45],[.24,-.49]],opp:[[.81,0],[.78,.36],[.49,.47],[-.4,-.1]]},
  {ball:[-.09,.06],team:[[-.15,.06],[-.8,0],[.18,.42],[-.22,-.6]],opp:[[.18,.44],[.42,-.25],[.58,.52],[.85,0]]},
  // Keeper distribution under high press, requiring a side pass rather than
  // a blind kick straight at the opponent.
  {ball:[-.82,.04],team:[[-.78,.07],[-.92,0],[-.5,.39],[-.4,-.28]],opp:[[-.62,.04],[-.42,-.2],[.05,.5],[.83,0]]},
  // Wall-bank candidate near an attacking side wall.
  {ball:[.57,.66],team:[[.52,.67],[-.8,0],[.36,.15],[.61,-.32]],opp:[[.63,.58],[.7,.17],[.78,-.06],[.88,0]]},
  // Two attackers versus one central defender, with a through-ball lane.
  {ball:[.29,0],team:[[.25,0],[-.79,0],[.49,.28],[.6,-.24]],opp:[[.49,.08],[-.2,.32],[.13,-.5],[.87,0]]},
  // Pressed midfielder with a valid backward recycling option.
  {ball:[-.3,0],team:[[-.32,0],[-.87,0],[-.51,.35],[-.24,-.37]],opp:[[-.21,0],[-.35,-.39],[.36,.39],[.87,0]]},
  // Defensive overload: three outfielders must press and mark goal-side.
  {ball:[-.58,.54],team:[[-.53,.57],[-.85,0],[-.41,-.1],[-.32,.68]],opp:[[-.43,.5],[-.3,-.02],[-.1,-.54],[.85,0]]}
 ];
 const cfg=layouts[scenario%layouts.length],sign=side===1?1:-1;
 const team=room.state.players.filter(p=>p.team.id===side).sort((a,b)=>a.id-b.id),
  opponents=room.state.players.filter(p=>p.team.id===3-side).sort((a,b)=>a.id-b.id);
 for(const [players,coordinates] of [[team,cfg.team],[opponents,cfg.opp]])
  players.forEach((p,i)=>{const [x,y]=coordinates[i];room.state.updatePlayer(p.id,{pos:[sign*x*w,y*h],speed:[0,0]});});
 room.state.updateDisc(0,{pos:[sign*cfg.ball[0]*w,cfg.ball[1]*h],speed:[0,0]});
}
function match(makeRoom,candidate,opponent,side,seed,map,frames=2400,collect,actor,sampleStride=12,scenario=null){
 if(!Number.isInteger(sampleStride)||sampleStride<1||sampleStride>60)throw Error('Invalid rollout sample stride');
 let kicks=[0,0,0],territory=0,frame=0;
 const telemetry=Telemetry?new Telemetry():null,planned=new Map();
 const env=makeRoom({onPlayerBallKick:id=>{const p=r.state.players.find(p=>p.id===(id?.id??id));
  if(p){kicks[p.team.id]++;telemetry?.kick(p,planned.get(p.id),r.state,frame);}}}),r=env.room,random=rng(seed);
 try{r.setCurrentStadium(env.map(map),0);r.setScoreLimit(0,0);r.setTimeLimit(0,0);for(let i=1;i<=8;i++){r.playerJoin(i,'Bot '+i,'',String(i),'','');r.setPlayerTeam(i,i<=4?1:2,0);}r.startGame(0);env.step(2);for(const p of r.state.players){p.aiControlled=true;r.state.updatePlayer(p.id,{pos:[p.disc.pos.x,p.disc.pos.y+(random()-.5)*40],speed:[0,0]});}if(scenario!==null&&scenario!==undefined)seedTrainingScene(r,side,scenario);
 r.onPlayerBallKick=id=>{const p=r.state.players.find(p=>p.id===(id?.id??id));
  if(p){kicks[p.team.id]++;telemetry?.kick(p,planned.get(p.id),r.state,frame);}};
 r.onTeamGoal=team=>telemetry?.goal(team?.id??team,frame);
 for(let t=0;t<frames;t++){frame=t;if(t%4===0)for(const p of r.state.players){const selected=p.team.id===side?candidate:opponent;const input=AI.tactical(r.state,p.id,t,{difficulty:'hard',profile:selected});
 if(telemetry){const plan=AI.teamPlan(r.state,p.team.id,t,selected);planned.set(p.id,plan[p.id]);}if(collect&&t%sampleStride===0){const f=AI.features(r.state,p.id),a=env.reverse(input),sign=p.team.id===1?1:-1;collect({frame:t,id:p.id,team:p.team.id,x:AI.columns.map(c=>f[c]),dir:(a.dirY+1)*3+sign*a.dirX+1,kick:+a.kick});}let action=input;if(actor&&p.team.id===side){const predicted=AI.infer(actor,r.state,p.id);if(predicted.confidence>.58&&(predicted.input&15))action=(predicted.input&15)|(input&16);}r.playerInput(action,p.id);}env.step(1);telemetry?.frame(r.state,t);const b=r.gameState?.physicsState.discs[0];if(b)territory+=(side===1?1:-1)*Math.max(-1,Math.min(1,b.pos.x/(r.state.stadium.bgWidth||700)));}
 const g=r.gameState,goals=side===1?g.redScore:g.blueScore,conceded=side===1?g.blueScore:g.redScore;
 telemetry?.finish();
 const ours=telemetry?.summary(side),theirs=telemetry?.summary(3-side);
 // Actual score remains overwhelmingly important. Only verified first-touch
 // completions and modeled on-target attempts can adjust a tied game.
 const skill=ours?(Math.min(10,ours.passCompleted)*.3-Math.min(10,ours.passIntercepted)*.5+
   Math.min(8,ours.shotProjectedOnTarget)*.14-Math.min(8,ours.shotAttempts-ours.shotProjectedOnTarget)*.12-
   Math.min(10,ours.keeperTurnovers)*.65+Math.min(10,ours.keeperDistributionsCompleted)*.2):0;
 return{map,side,seed,scenario,goals,conceded,kicks:kicks[side],opponentKicks:kicks[3-side],
  seconds:g.timeElapsed,events:ours,opponentEvents:theirs,
  fitness:(goals-conceded)*100+territory/frames*2+
   (Math.min(10,kicks[side])-Math.min(10,kicks[3-side]))*.05+skill};
 }finally{r.destroy();}
}
async function train(makeRoom,{generations=6,seed=20261014,frames=2400,initial,validationSeeds=4}={},progress=()=>{}){
 // Four validation games proved too noisy: the old gate promoted profiles that
 // lost over 200 independent matches. Validate on several seeds per map/side.
 validationSeeds=Math.max(1,Math.min(16,Math.floor(validationSeeds)));
 generations=Math.max(1,Math.min(20,Math.floor(generations)));frames=Math.max(600,Math.min(7200,frames));const random=rng(seed),baseline=AI.profile(initial);let champion={...baseline},accepted=0;const history=[];const pause=()=>new Promise(r=>setTimeout(r,0));
 for(let gen=0;gen<generations;gen++){const candidate=AI.profile(Object.fromEntries(Object.entries(champion).map(([k,v])=>{
  const delta={screen:20,passSafety:9,overloadReward:.14,keeperRiskTime:16,bankRisk:.14,shotAggression:.12}[k]??50;
  return[k,v+(random()-.5)*delta];
 }))),games=[];
 for(const side of [1,2]){games.push(match(makeRoom,candidate,champion,side,seed+gen,'BFF',frames));progress({generation:gen+1,generations,percent:(gen*2+side)/(generations*2+4)*100,text:'Generation '+(gen+1)+' / '+generations});await pause();}
 // One rotating training scene per generation, always mirrored by the next
 // generation. This is training evidence, never frozen release validation.
 const scenario=gen%9;
 games.push(match(makeRoom,candidate,champion,gen%2+1,seed+190001+gen,'Classic',frames,null,null,12,scenario));
 const score=games.reduce((s,g)=>s+g.fitness,0);if(score>.05){champion=candidate;accepted++;}history.push({generation:gen+1,accepted:score>.05,score,games});}
 const validation=[],total=4*validationSeeds;for(let v=0;v<validationSeeds;v++)for(const map of ['BFF','Classic'])for(const side of [1,2]){validation.push(match(makeRoom,champion,baseline,side,seed+100003+v*7919,map,frames));progress({percent:(generations*2+validation.length)/(generations*2+total)*100,text:'Validation '+validation.length+' / '+total});await pause();}
 const score=validation.reduce((s,g)=>s+g.fitness,0),goalDifference=validation.reduce((s,g)=>s+g.goals-g.conceded,0),active=validation.every(g=>g.seconds>5),wins=validation.filter(g=>g.goals>g.conceded).length,losses=validation.filter(g=>g.goals<g.conceded).length,promoted=accepted>0&&score>.1&&goalDifference>0&&wins>losses&&active;
 return{schema:'fuckball-team-policy-v1',name:'Self-play team '+seed,profile:promoted?champion:baseline,candidate:champion,promoted,training:{generations,seed,frames,accepted,history},validation:{games:validation,score,goalDifference,wins,losses,active},note:'Evolutionary team tactics. Validation against the previous policy; not a human skill rating.'};
}
root.FuckballSelfPlay={match,train};if(typeof module!=='undefined')module.exports=root.FuckballSelfPlay;
})(typeof self!=='undefined'?self:globalThis);
