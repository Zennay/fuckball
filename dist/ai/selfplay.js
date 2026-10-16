(function(root){'use strict';
const AI=root.FuckballAI||(typeof require==='function'?require('./policy.js'):null);
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function match(makeRoom,candidate,opponent,side,seed,map,frames=2400,collect,actor,sampleStride=12){
 if(!Number.isInteger(sampleStride)||sampleStride<1||sampleStride>60)throw Error('Invalid rollout sample stride');
 let kicks=[0,0,0],territory=0;const env=makeRoom({onPlayerBallKick:id=>{const p=r.state.players.find(p=>p.id===(id?.id??id));if(p)kicks[p.team.id]++;}}),r=env.room,random=rng(seed);
 try{r.setCurrentStadium(env.map(map),0);r.setScoreLimit(0,0);r.setTimeLimit(0,0);for(let i=1;i<=8;i++){r.playerJoin(i,'Bot '+i,'',String(i),'','');r.setPlayerTeam(i,i<=4?1:2,0);}r.startGame(0);env.step(2);for(const p of r.state.players){p.aiControlled=true;r.state.updatePlayer(p.id,{pos:[p.disc.pos.x,p.disc.pos.y+(random()-.5)*40],speed:[0,0]});}r.onPlayerBallKick=id=>{const p=r.state.players.find(p=>p.id===(id?.id??id));if(p)kicks[p.team.id]++;};
 for(let t=0;t<frames;t++){if(t%4===0)for(const p of r.state.players){const input=AI.tactical(r.state,p.id,t,{difficulty:'hard',profile:p.team.id===side?candidate:opponent});if(collect&&t%sampleStride===0){const f=AI.features(r.state,p.id),a=env.reverse(input),sign=p.team.id===1?1:-1;collect({frame:t,id:p.id,team:p.team.id,x:AI.columns.map(c=>f[c]),dir:(a.dirY+1)*3+sign*a.dirX+1,kick:+a.kick});}let action=input;if(actor&&p.team.id===side){const predicted=AI.infer(actor,r.state,p.id);if(predicted.confidence>.58&&(predicted.input&15))action=(predicted.input&15)|(input&16);}r.playerInput(action,p.id);}env.step(1);const b=r.gameState?.physicsState.discs[0];if(b)territory+=(side===1?1:-1)*Math.max(-1,Math.min(1,b.pos.x/(r.state.stadium.bgWidth||700)));}
 const g=r.gameState,goals=side===1?g.redScore:g.blueScore,conceded=side===1?g.blueScore:g.redScore;return{map,side,seed,goals,conceded,kicks:kicks[side],opponentKicks:kicks[3-side],seconds:g.timeElapsed,fitness:(goals-conceded)*100+territory/frames*2+(Math.min(10,kicks[side])-Math.min(10,kicks[3-side]))*.05};
 }finally{r.destroy();}
}
async function train(makeRoom,{generations=6,seed=20261014,frames=2400,initial,validationSeeds=4}={},progress=()=>{}){
 // Four validation games proved too noisy: the old gate promoted profiles that
 // lost over 200 independent matches. Validate on several seeds per map/side.
 validationSeeds=Math.max(1,Math.min(16,Math.floor(validationSeeds)));
 generations=Math.max(1,Math.min(20,Math.floor(generations)));frames=Math.max(600,Math.min(7200,frames));const random=rng(seed),baseline=AI.profile(initial);let champion={...baseline},accepted=0;const history=[];const pause=()=>new Promise(r=>setTimeout(r,0));
 for(let gen=0;gen<generations;gen++){const candidate=AI.profile(Object.fromEntries(Object.entries(champion).map(([k,v])=>[k,v+(random()-.5)*(k==='screen'?20:50)]))),games=[];
 for(const side of [1,2]){games.push(match(makeRoom,candidate,champion,side,seed+gen,'BFF',frames));progress({generation:gen+1,generations,percent:(gen*2+side)/(generations*2+4)*100,text:'Generation '+(gen+1)+' / '+generations});await pause();}
 const score=games.reduce((s,g)=>s+g.fitness,0);if(score>.05){champion=candidate;accepted++;}history.push({generation:gen+1,accepted:score>.05,score,games});}
 const validation=[],total=4*validationSeeds;for(let v=0;v<validationSeeds;v++)for(const map of ['BFF','Classic'])for(const side of [1,2]){validation.push(match(makeRoom,champion,baseline,side,seed+100003+v*7919,map,frames));progress({percent:(generations*2+validation.length)/(generations*2+total)*100,text:'Validation '+validation.length+' / '+total});await pause();}
 const score=validation.reduce((s,g)=>s+g.fitness,0),goalDifference=validation.reduce((s,g)=>s+g.goals-g.conceded,0),active=validation.every(g=>g.seconds>5),wins=validation.filter(g=>g.goals>g.conceded).length,losses=validation.filter(g=>g.goals<g.conceded).length,promoted=accepted>0&&score>.1&&goalDifference>0&&wins>losses&&active;
 return{schema:'fuckball-team-policy-v1',name:'Self-play team '+seed,profile:promoted?champion:baseline,candidate:champion,promoted,training:{generations,seed,frames,accepted,history},validation:{games:validation,score,goalDifference,wins,losses,active},note:'Evolutionary team tactics. Validation against the previous policy; not a human skill rating.'};
}
root.FuckballSelfPlay={match,train};if(typeof module!=='undefined')module.exports=root.FuckballSelfPlay;
})(typeof self!=='undefined'?self:globalThis);
