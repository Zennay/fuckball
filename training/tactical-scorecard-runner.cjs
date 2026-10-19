'use strict';
// Offline native 60Hz 4v4 tactical measurement. Research-only: cannot
// promote, deploy, access live room state or modify immutable replay data.
// Usage: node training/tactical-scorecard-runner.cjs [frames=1200] [output.json]
//        [candidate-profile.json]
const fs=require('node:fs'), path=require('node:path');
const AI=require('../dist/ai/policy.js');
const {makeRoom}=require('./selfplay.cjs');
const {TacticalMetrics}=require('./tactical-metrics.cjs');
function integer(raw,min,max,label){
  if(!/^[0-9]+$/.test(String(raw)))throw Error('Invalid '+label);
  const n=Number(raw);if(!Number.isSafeInteger(n)||n<min||n>max)
    throw Error('Invalid '+label+' range '+min+'-'+max);
  return n;
}
function matchup(frames,map,side,profile,seed){
  let tick=0,plans={1:{},2:{}},r;
  const meter=new TacticalMetrics();
  const env=makeRoom({
    onPlayerBallKick:id=>{
      const player=r?.state?.players?.find(p=>p.id===(id?.id??id));
      if(player)meter.kick(player,plans[player.team.id]?.[player.id],r.state,tick);
    },
    onTeamGoal:team=>meter.goal(team?.id??team,tick)
  }),room=env.room;
  r=room;
  try {
    room.setCurrentStadium(env.map(map),0);
    room.setScoreLimit(0,0);
    room.setTimeLimit(0,0);
    for(let i=1;i<=8;i++){
      room.playerJoin(i,'Bot '+i,'',String(i),'','');
      room.setPlayerTeam(i,i<=4?1:2,0);
    }
    room.startGame(0);env.step(2);
    for(const p of room.state.players) {
      p.aiControlled=true;
      // Start at actual initial positions with controlled mirrored jitter.
      const drift=((Math.imul(seed+p.id*19,2654435761)>>>0)%31)-15;
      room.state.updatePlayer(p.id,{pos:[p.disc.pos.x,p.disc.pos.y+drift],speed:[0,0]});
    }
    const start=process.hrtime.bigint();
    for(let t=0;t<frames;t++){
      tick=t;
      if(t%4===0){
        plans={
          1:AI.teamPlan(room.state,1,t,side===1?profile:AI.defaultProfile),
          2:AI.teamPlan(room.state,2,t,side===2?profile:AI.defaultProfile)
        };
        for(const p of room.state.players){
          const selected=p.team.id===side?profile:AI.defaultProfile;
          room.playerInput(AI.tactical(room.state,p.id,t,
            {difficulty:'hard',profile:selected}),p.id);
        }
      }
      env.step(1);
      meter.frame(room.state,t,plans);
    }
    const elapsed=Number(process.hrtime.bigint()-start)/1e9;
    const game=room.gameState,metrics=meter.finish();
    return {
      map,side,frames,seed,wallSeconds:+elapsed.toFixed(3),
      engineScore:{red:game.redScore,blue:game.blueScore},
      nativeGoalsAudit:{
        red:metrics[1].raw.nativeGoals,blue:metrics[2].raw.nativeGoals,
        note:'Event callbacks can differ from post-step scoreboard; authoritative scoreboard wins.'
      },
      candidate:metrics[side],opponent:metrics[3-side]
    };
  }finally{room.destroy();}
}
function main(){
  const frames=integer(process.argv[2]||1200,120,7200,'frames');
  const output=path.resolve(process.argv[3]||'training/output/tactical-scorecard.json');
  const profile=process.argv[4]?
    AI.profile(JSON.parse(fs.readFileSync(process.argv[4],'utf8'))):AI.defaultProfile;
  const seed=20261020;
  const games=[];
  for(const map of ['BFF','Classic'])
    for(const side of [1,2])
      games.push(matchup(frames,map,side,profile,seed+(map==='BFF'?0:101)+side));
  const result={
    schema:'fuckball-native-tactical-scorecard-v1',createdAt:new Date().toISOString(),
    source:'local native-engine offline deterministic mirrored 4v4',
    candidateProfile:profile,comparisonProfile:AI.defaultProfile,games,
    aggregate:{
      games:games.length,scorePoints:games.reduce((s,g)=>{
        const d=(g.side===1?1:-1)*(g.engineScore.red-g.engineScore.blue);
        return s+(d>0?1:d===0?.5:0);
      },0),
      goalsFor:games.reduce((s,g)=>s+(g.side===1?g.engineScore.red:g.engineScore.blue),0),
      goalsAgainst:games.reduce((s,g)=>s+(g.side===1?g.engineScore.blue:g.engineScore.red),0)
    },
    limitations:'Only four seeded games by default, no deployment/promotion authority; contact/shape proxies are estimates, not official stats. Use larger independent holdout for model selection.'
  };
  fs.mkdirSync(path.dirname(output),{recursive:true});
  const temp=output+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(result,null,2));
  fs.renameSync(temp,output);
  console.log(JSON.stringify({output,aggregate:result.aggregate,
    measuredCategories:Object.keys(games[0].candidate.derived)},null,2));
}
if(require.main===module){
  try{main();}catch(e){console.error(e);process.exitCode=1;}
}
module.exports={matchup};
