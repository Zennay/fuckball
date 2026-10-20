'use strict';
// Reproducible, read-only comparison of exact deployed tactics versus 19 Oct evening PR #355.
// Side-swapped native 60-Hz games on both approved stadiums; never writes champion/live state.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const release=process.env.FUCKBALL_RELEASE_DIR;
const challengerPath=process.env.FUCKBALL_TACTICAL_CHALLENGER;
if(!release||!challengerPath)throw Error('Explicit immutable release and candidate paths required');
const {makeRoom}=require(path.join(release,'training/selfplay.cjs'));
const current=require(path.join(release,'dist/ai/policy.js'));
const candidate=require(path.resolve(challengerPath));
const FRAMES=2400;
const SEEDS=[30913,49253,75377,93491];
const games=[];
function rng(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function one(map,seed,candidateSide){
  const env=makeRoom(),room=env.room,random=rng(seed);
  try{
    room.setCurrentStadium(env.map(map==='BFF Big v4'?'BFF':'Classic'),0);
    room.setScoreLimit(0,0);room.setTimeLimit(0,0);
    for(let id=1;id<=8;id++){room.playerJoin(id,'Bot '+id,'',String(id),'','');room.setPlayerTeam(id,id<=4?1:2,0);}
    room.startGame(0);env.step(2);
    for(const p of room.state.players){p.aiControlled=true;room.state.updatePlayer(p.id,{pos:[p.disc.pos.x,p.disc.pos.y+(random()-.5)*40],speed:[0,0]});}
    for(let tick=0;tick<FRAMES;tick++){
      if(tick%2===0)for(const p of room.state.players){
        const policy=p.team.id===candidateSide?candidate:current;
        room.playerInput(policy.tactical(room.state,p.id,tick,{difficulty:'elite'}),p.id);
      }
      env.step(1);
    }
    const score=room.gameState;
    const goals=candidateSide===1?score.redScore:score.blueScore;
    const conceded=candidateSide===1?score.blueScore:score.redScore;
    if(!Number.isSafeInteger(goals)||!Number.isSafeInteger(conceded))throw Error('Invalid native score');
    return{map,seed,candidateSide,goals,conceded,result:goals>conceded?'W':goals<conceded?'L':'D'};
  }finally{room.destroy();}
}
function summarize(list){
 const wins=list.filter(x=>x.result==='W').length;
 const losses=list.filter(x=>x.result==='L').length;
 const draws=list.length-wins-losses;
 const goalsFor=list.reduce((s,x)=>s+x.goals,0);
 const goalsAgainst=list.reduce((s,x)=>s+x.conceded,0);
 return {matches:list.length,wins,draws,losses,goalsFor,goalsAgainst,
  goalDifference:goalsFor-goalsAgainst,scoreRate:(wins+draws/2)/(list.length||1)};
}
for(const map of ['BFF Big v4','Classic'])for(const seed of SEEDS)
  for(const side of [1,2])games.push(one(map,seed,side));
const total=summarize(games);
const byMap=Object.fromEntries(['BFF Big v4','Classic'].map(map=>[map,summarize(games.filter(g=>g.map===map))]));
const sha=(file)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const exploratoryPass=total.scoreRate>=0.5625&&total.goalDifference>=2&&total.wins>total.losses
  && Object.values(byMap).every(x=>x.scoreRate>=0.5&&x.goalDifference>=0);
console.log(JSON.stringify({schema:'fuckball-evening-tactical-vs-current-live-v1',
 deployedRelease:process.env.FUCKBALL_RELEASE_SHA,challengerCommit:process.env.FUCKBALL_CHALLENGER_SHA,
 livePolicySha256:sha(path.join(release,'dist/ai/policy.js')),
 challengerPolicySha256:sha(challengerPath),framesPerMatch:FRAMES,seeds:SEEDS,
 total,byMap,games,exploratoryPass,productionPromotionAuthorized:false,
 limitation:'Exploratory native 4v4 selection only. Require approved source integration, required CI and safe immutable live deployment.'},null,2));