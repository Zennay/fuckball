'use strict';
// Physics-derived match events for research, not player-facing official stats.
// Kicks are authoritative engine events; receptions require a fresh collision
// proximity AND a measurable speed impulse (never just a predicted pass).
class BallTelemetry {
 constructor() {
  this.teams={1:this.empty(),2:this.empty()};
  this.pending=null;this.shot=null;this.tick=0;
  this.prevBall=null;this.touching=new Set();
 }
 empty(){return{passAttempts:0,passCompleted:0,passToTarget:0,passIntercepted:0,
  passMissed:0,shotAttempts:0,shotProjectedOnTarget:0,shotsScored:0,
  keeperClearances:0,keeperDistributionsCompleted:0,keeperTurnovers:0,
  keeperSaves:0,physicalTouches:0};}
 finalizePass(outcome,player) {
  const q=this.pending;if(!q)return;const m=this.teams[q.team];
  if(outcome==='completed'){m.passCompleted++;if(player===q.target)m.passToTarget++;
   if(q.keeper)m.keeperDistributionsCompleted++;}
  else if(outcome==='intercepted'){m.passIntercepted++;if(q.keeper)m.keeperTurnovers++;}
  else m.passMissed++;
  this.pending=null;
 }
 kick(player,plan,state,tick){
  const id=player.id,team=player.team.id;
  if(!(team===1||team===2))return;
  if(this.pending) {
   if(this.pending.team!==team)this.finalizePass('intercepted',id);
   else if(this.pending.kicker!==id)this.finalizePass('completed',id);
   else this.finalizePass('missed');
  }
  if(this.shot&&this.shot.team!==team)this.shot=null;
  const m=this.teams[team],o=plan?.option;
  if(plan?.role==='keeper')m.keeperClearances++;
  const pass=o?.kind==='pass'&&Number.isInteger(o.to)&&o.to!==id;
  if(pass){
   m.passAttempts++;this.pending={team,kicker:id,target:o.to,keeper:plan.role==='keeper',
    tick,ballX:state.gameState.physicsState.discs[0].pos.x,escaped:false};
  }
  // A shot attempt must be an actual kick AND a planned attacking shot.
  // Projected on-target is only a model estimate; goals are observed scores.
  const ball=state.gameState?.physicsState.discs[0];
  const sign=team===1?1:-1;
  const attacking=ball&&sign*ball.pos.x>0;
  if(attacking&&(o?.kind==='shot'||o?.kind==='bank')){
   m.shotAttempts++;
   if(o.roll?.goal>0||Number.isFinite(o.roll?.shotT))m.shotProjectedOnTarget++;
   this.shot={team,tick};
  }
 }
 goal(team,tick){
  if(!(team===1||team===2))return;
  if(this.shot&&this.shot.team===team&&tick-this.shot.tick<240)
   this.teams[team].shotsScored++;
  this.shot=null;
  if(this.pending)this.finalizePass('missed');
 }
 frame(state,tick,plans=null){
  this.tick=tick;
  const b=state.gameState?.physicsState.discs[0];
  if(!b)return;
  if(this.pending&&tick-this.pending.tick>180)this.finalizePass('missed');
  if(this.shot&&tick-this.shot.tick>240)this.shot=null;
  const pvs=state.players.filter(p=>p.disc&&(p.team.id===1||p.team.id===2));
  const contacts=new Set();
  const candidates=[];
  const drag=b.damping||.99,expected=this.prevBall&&
   {x:this.prevBall.x*drag,y:this.prevBall.y*drag};
  const impulse=expected?Math.hypot(b.speed.x-expected.x,b.speed.y-expected.y):0;
  for(const p of pvs){
   const d=Math.hypot(p.disc.pos.x-b.pos.x,p.disc.pos.y-b.pos.y);
   const radius=p.disc.radius+b.radius;
   if(d<=radius+1.35){contacts.add(p.id);
    if(!this.touching.has(p.id)&&impulse>.12)
     candidates.push({p,dist:d-radius});}
  }
  candidates.sort((a,z)=>a.dist-z.dist||a.p.id-z.p.id);
  if(candidates.length) {
   const p=candidates[0].p,team=p.team.id;
   this.teams[team].physicalTouches++;
   if(this.pending){
    // The initial kicker's own ball contact does not complete a pass.
    const q=this.pending,elapsed=tick-q.tick;
    if(p.id!==q.kicker&&elapsed>=2)
     this.finalizePass(team===q.team?'completed':'intercepted',p.id);
   }
   if(this.shot&&this.shot.team!==team){
    if(plans?.get(p.id)?.role==='keeper'&&
       this.shot&&tick-this.shot.tick<180) {
     // Only a goalkeeper touching an incoming shot is counted as a save.
     const ownGoal=state.gameState.stadium.goals.find(g=>g.team.id===team);
     if(ownGoal){const gx=(ownGoal.p0.x+ownGoal.p1.x)/2;
      if(Math.hypot(p.disc.pos.x-gx,p.disc.pos.y)<175)
       this.teams[team].keeperSaves++;}
    }
    this.shot=null;
   }
  }
  this.touching=contacts;
  this.prevBall={x:b.speed.x,y:b.speed.y};
 }
 finish(){
  // An unreceived pass at full-time is a miss, never quietly omitted from
  // the denominator because its 180-tick window did not expire yet.
  if(this.pending)this.finalizePass('missed');
 }
 summary(team){
  const m={...this.teams[team]};
  return{...m,passCompletionRate:m.passAttempts?Number((m.passCompleted/m.passAttempts).toFixed(4)):0,
   shotConversionRate:m.shotAttempts?Number((m.shotsScored/m.shotAttempts).toFixed(4)):0,
   note:'Kicks/goals from engine; completions inferred from fresh physics contact plus impulse; on-target predicted, not official tracking.'};
 }
}
module.exports={BallTelemetry};
