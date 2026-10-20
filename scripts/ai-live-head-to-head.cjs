'use strict';
// Read-only head-to-head research: accepted neural checkpoint vs deployed tactical policy.
// The runner must use the immutable live release's engine and policy, never a different checkout.
// Side-swapped seeds on BFF Big v4 and Classic; no model promotion or writes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const release = process.env.FUCKBALL_RELEASE_DIR;
const checkpoint = process.env.FUCKBALL_NEURAL_CHECKPOINT;
if (!release || !checkpoint) throw Error('Pinned live release and checkpoint are required');
const AI = require(path.join(release, 'dist/ai/policy.js'));
const {HBInit} = require(path.join(release, 'headless/runtime.cjs'));
const modelBytes = fs.readFileSync(checkpoint);
const model = AI.validateModel(JSON.parse(modelBytes.toString('utf8')));
const checkpointSha256 = crypto.createHash('sha256').update(modelBytes).digest('hex');
const ROLES = ['gk','dm','am','st'];
const SEEDS = [8091, 42103, 103951, 282811];
const FRAMES = 1800;
function rng(seed) {
  let s=seed>>>0;
  return ()=>(s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296;
}
function play(map,seed,neuralSide) {
  const room = HBInit({noPlayer:true});
  try {
    if(map==='Classic') room.setDefaultStadium('Classic');
    else room.setCustomStadium(fs.readFileSync(path.join(release,'dist/stadiums/bff-big-v4.hbs'),'utf8'));
    room.setScoreLimit(0);room.setTimeLimit(0);
    for(let id=1;id<=8;id++) room.addPlayer(id,'Evaluation '+id,id<=4?1:2);
    room.startGame();room.step(2);
    const random=rng(seed);
    for(let id=1;id<=8;id++){
      const disc=room.getPlayerDiscProperties(id);
      if(!disc)throw Error('Missing player disc');
      room.setPlayerDiscProperties(id,{x:disc.x,y:disc.y+(random()-.5)*36});
    }
    AI.reset(model);
    for(let tick=0;tick<FRAMES;tick++){
      if(tick%6===0) for(const p of room._room.state.players){
        const input=p.team.id===neuralSide
          ? AI.infer(model,room._room.state,p.id,ROLES[(p.id-1)%4]).input
          : AI.tactical(room._room.state,p.id,tick);
        room.setPlayerInput(p.id,input);
      }
      room.step(1);
    }
    const score=room.getScores();
    const goals=neuralSide===1?score.red:score.blue;
    const conceded=neuralSide===1?score.blue:score.red;
    if(!Number.isSafeInteger(goals)||!Number.isSafeInteger(conceded)) throw Error('Noncanonical native game score');
    return {map,seed,neuralSide,goals,conceded,
      result:goals>conceded?'W':goals<conceded?'L':'D'};
  }finally {room.destroy();}
}
const matches=[];
for(const map of ['BFF Big v4','Classic']) for(const seed of SEEDS)
  for(const neuralSide of [1,2]) matches.push(play(map,seed,neuralSide));
function summary(rows){
  const wins=rows.filter(x=>x.result==='W').length;
  const losses=rows.filter(x=>x.result==='L').length;
  const draws=rows.length-wins-losses;
  const goalsFor=rows.reduce((s,x)=>s+x.goals,0);
  const goalsAgainst=rows.reduce((s,x)=>s+x.conceded,0);
  return {matches:rows.length,wins,draws,losses,goalsFor,goalsAgainst,
    goalDifference:goalsFor-goalsAgainst,scoreRate:(wins+draws*.5)/rows.length};
}
const total=summary(matches);
const byStadium=Object.fromEntries(['BFF Big v4','Classic'].map(map=>
  [map,summary(matches.filter(x=>x.map===map))]));
const exploratoryPass=total.matches===16 && total.scoreRate>=.625
  && total.goalDifference>=6
  && Object.values(byStadium).every(x=>x.scoreRate>=.5 && x.goalDifference>=0);
console.log(JSON.stringify({
  schema:'fuckball-live-neural-vs-tactical-research-v1',
  release:process.env.FUCKBALL_RELEASE_SHA,
  checkpointSha256,
  modelName:model.name||null,
  simulatedFramesPerMatch:FRAMES,
  maps:['BFF Big v4','Classic'],
  pairedSeeds:SEEDS,
  total,byStadium,matches,exploratoryPass,
  productionPromotionAuthorized:false,
  limitation:'Only 16 offline native head-to-head matches; not human-elite evidence, independent CI approval, or permission to overwrite live gameplay.'
},null,2));