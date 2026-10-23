'use strict';
// Native-match research scorecard. Only engine kicks/goals are authoritative;
// ball receipts require inferred fresh contact + impulse; tactical margins
// and defensive roles are model-derived estimates, never official player stats.
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rate = (n, d) => d ? +(n / d).toFixed(4) : null;
const avg = (sum, n) => n ? +(sum / n).toFixed(3) : null;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function corridor(from, to, point) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const t = clamp(((point.x - from.x) * dx + (point.y - from.y) * dy) /
    Math.max(1, dx * dx + dy * dy), 0, 1);
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}
function freshStats() {
  return {
    nativeKicks: 0, nativeGoals: 0, passAttempts: 0, passesReceived: 0,
    passesToTarget: 0, passIntercepted: 0, passUnresolved: 0,
    contestedPasses: 0, contestedCompleted: 0, passMargins: 0,
    passMarginSamples: 0, progressivePasses: 0, throughBalls: 0,
    throughBallsCompleted: 0, backPasses: 0, safeBackPasses: 0,
    passByRisk: { open: [0, 0], contested: [0, 0], blocked: [0, 0] },
    oneTwos: 0, shotAttempts: 0, bankAttempts: 0, bankWallBounces: 0,
    bankTeamRecoveries: 0, shotOptionRegretEstimates: 0,
    keeperDistributions: 0, keeperFirstTeamTouches: 0,
    keeperFirstOpponentTouches: 0, costlyKeeperClearances: 0,
    shapeFrames: 0, coordinatedDefenseFrames: 0, pressFrames: 0,
    unmarkedThreatSum: 0, shapeRecoveryTicks: 0, recoveries: 0,
    spacingFrames: 0, separatedFrames: 0, supportFrames: 0,
    availableSupportFrames: 0, overloadAttempts: 0, overloadCompleted: 0,
    roleSwitches: 0, roleSamples: 0, humanTeammateFrames: 0,
    keeperUnderPressure: 0, lateLeadKicks: 0, lateChasingKicks: 0,
    tempoSampledKicks: 0, blockedThreatLaneFrames: 0, laneFrames: 0,
    pressingRegains: 0, pressingTurnoversTracked: 0,
    reboundTouches: 0, sampledFrames: 0,
    kickers: Object.create(null)
  };
}
class TacticalMetrics {
  constructor() {
    this.m = {1: freshStats(), 2: freshStats()};
    this.pending = null;
    this.lastKickTeam = null;
    this.lastTouch = null;
    this.touches = [];
    this.prevBall = null;
    this.touching = new Set();
    this.roleById = new Map();
    this.recovery = {1:null,2:null};
    this.pressEvent = null;
    this.bankEvent = null;
    this.shotEvent = null;
  }
  finalizePass(type, player, state, tick) {
    const q = this.pending;
    if (!q) return;
    const m = this.m[q.team];
    if (type === 'received') {
      m.passesReceived++;
      if (player?.id === q.target) m.passesToTarget++;
      if (q.contested) m.contestedCompleted++;
      if (q.through) m.throughBallsCompleted++;
      if (q.overload) m.overloadCompleted++;
      if (q.back) m.safeBackPasses++;
      const ball = state?.gameState?.physicsState?.discs?.[0];
      if (ball && q.sign * (ball.pos.x - q.x) > 35) m.progressivePasses++;
      if (q.keeper) m.keeperFirstTeamTouches++;
      m.passByRisk[q.risk][1]++;
    } else if (type === 'intercepted') {
      m.passIntercepted++;
      if (q.keeper) {
        m.keeperFirstOpponentTouches++;
        if (state?.gameState?.physicsState?.discs?.[0] &&
            q.sign * state.gameState.physicsState.discs[0].pos.x < -220)
          m.costlyKeeperClearances++;
      }
    } else {
      m.passUnresolved++;
    }
    this.pending = null;
  }
  kick(p, intent, state, tick) {
    if (!p?.disc || ![1,2].includes(p.team?.id)) return;
    const team = p.team.id, sign = team === 1 ? 1 : -1, m = this.m[team];
    if (this.pending) {
      this.finalizePass(team !== this.pending.team ? 'intercepted' :
        p.id !== this.pending.kicker ? 'received' : 'unresolved', p, state, tick);
    }
    const other = this.lastKickTeam;
    if (other && other !== team) {
      this.recovery[other] = tick;
      if (this.pressEvent && this.pressEvent.team === team &&
          tick - this.pressEvent.tick <= 120) this.m[team].pressingRegains++;
    }
    this.lastKickTeam = team;
    m.nativeKicks++;
    m.kickers[p.id] = (m.kickers[p.id] || 0) + 1;
    const b = state.gameState?.physicsState.discs[0], option = intent?.option;
    if (!b) return;
    const teammates = state.players.filter(q => q.disc && q.team.id === team && q.id !== p.id);
    const opponents = state.players.filter(q => q.disc && q.team.id === 3-team);
    const ownNear = teammates.filter(q => dist(q.disc.pos, b.pos) < 300);
    const nearestDefender = opponents.reduce((n,q) => Math.min(n,dist(q.disc.pos,b.pos)),Infinity);
    if (intent?.role === 'keeper') {
      m.keeperDistributions++;
      if (nearestDefender < 120) m.keeperUnderPressure++;
    }
    if (option?.kind === 'pass' && Number.isInteger(option.to)) {
      m.passAttempts++;
      const receiver = teammates.find(q => q.id === option.to);
      let margin = null;
      if (receiver) {
        margin = opponents.reduce((minimum, q) => Math.min(minimum,
          corridor(b.pos, receiver.disc.pos, q.disc.pos) -
          q.disc.radius - b.radius), Infinity);
      }
      const risk = margin === null || margin < 4 ? 'blocked' : margin < 24 ? 'contested' : 'open';
      m.passByRisk[risk][0]++;
      const contested = nearestDefender < 90 || risk !== 'open';
      if (contested) m.contestedPasses++;
      if (margin !== null) { m.passMargins += margin; m.passMarginSamples++; }
      const back = receiver && sign*(receiver.disc.pos.x - b.pos.x) < -15;
      if (back) m.backPasses++;
      const through = receiver && sign*(receiver.disc.pos.x - b.pos.x) > 60 &&
        sign*receiver.disc.speed.x > 0.1;
      if (through) m.throughBalls++;
      const overload = receiver && opponents.filter(q =>
        dist(q.disc.pos, receiver.disc.pos) < 110).length <= 1 &&
        ownNear.length >= 2;
      if (overload) m.overloadAttempts++;
      this.pending = {team, sign, kicker:p.id,target:option.to, x:b.pos.x,
        tick, risk, contested, keeper:intent.role==='keeper', back, through, overload};
    } else if (option?.kind === 'shot' || option?.kind === 'bank') {
      m.shotAttempts++;
      this.shotEvent = {team, tick};
      if (option.kind === 'bank') {
        m.bankAttempts++;
        this.bankEvent = {team, tick, bounced:false};
      }
      // Heuristic opportunity regret, not ground-truth expected goals.
      if (teammates.some(q => sign*(q.disc.pos.x - b.pos.x) > 55 &&
        !opponents.some(o => corridor(b.pos,q.disc.pos,o.disc.pos) <
          o.disc.radius+b.radius+10))) m.shotOptionRegretEstimates++;
    }
    if (state.gameState?.timeElapsed > 120) {
      m.tempoSampledKicks++;
      const g = state.gameState, lead = sign * (g.redScore - g.blueScore);
      if (lead > 0) m.lateLeadKicks++;
      if (lead < 0) m.lateChasingKicks++;
    }
  }
  goal(team, tick) {
    if (![1,2].includes(team)) return;
    this.m[team].nativeGoals++;
    if (this.pending) this.finalizePass('unresolved', null, null, tick);
    this.shotEvent = null;
    this.bankEvent = null;
    this.lastKickTeam = null;
  }
  frame(state, tick, plans={}) {
    const b = state.gameState?.physicsState?.discs?.[0];
    if (!b) return;
    if (this.pending && tick - this.pending.tick > 180)
      this.finalizePass('unresolved',null,state,tick);
    const st = state.gameState.stadium;
    const touchNow = new Set(), possible = [];
    const drag = b.damping || .99;
    const impulse = this.prevBall ?
      Math.hypot(b.speed.x - this.prevBall.x*drag,b.speed.y - this.prevBall.y*drag) : 0;
    const all = state.players.filter(p => p.disc && [1,2].includes(p.team.id));
    for (const p of all) {
      if (dist(p.disc.pos,b.pos) <= p.disc.radius+b.radius+1.35) {
        touchNow.add(p.id);
        if (!this.touching.has(p.id) && impulse > .12)
          possible.push({p,delta:dist(p.disc.pos,b.pos)-p.disc.radius-b.radius});
      }
    }
    if (possible.length) {
      possible.sort((a,c)=>a.delta-c.delta||a.p.id-c.p.id);
      const p = possible[0].p, old=this.lastTouch;
      if (this.pending && p.id !== this.pending.kicker &&
          tick - this.pending.tick >= 2)
        this.finalizePass(p.team.id === this.pending.team ?
          'received' : 'intercepted',p,state,tick);
      if (this.bankEvent && this.bankEvent.bounced &&
          p.team.id === this.bankEvent.team) {
        this.m[p.team.id].bankTeamRecoveries++;
        this.bankEvent=null;
      }
      if (this.shotEvent && this.shotEvent.team !== p.team.id &&
          Math.abs(b.pos.x) > 400) this.m[p.team.id].reboundTouches++;
      this.touches.push({id:p.id,team:p.team.id,tick});
      if (this.touches.length > 5) this.touches.shift();
      const seq=this.touches.slice(-3);
      if (seq.length===3 && seq[0].team===seq[1].team &&
          seq[1].team===seq[2].team && seq[0].id===seq[2].id &&
          seq[0].id!==seq[1].id && seq[2].tick - seq[0].tick <= 180)
        this.m[seq[0].team].oneTwos++;
      this.lastTouch=p.team.id;
    }
    this.touching=touchNow;
    if (this.bankEvent && tick - this.bankEvent.tick > 180) this.bankEvent=null;
    if (this.bankEvent) {
      const width=Math.abs(st.bgWidth||st.width||700),height=Math.abs(st.bgHeight||st.height||280);
      if (!this.bankEvent.bounced &&
          (Math.abs(b.pos.y)>height-b.radius-4 || Math.abs(b.pos.x)>width-b.radius-4)) {
        this.bankEvent.bounced=true;
        this.m[this.bankEvent.team].bankWallBounces++;
      }
    }
    this.prevBall={x:b.speed.x,y:b.speed.y};
    if (tick%6!==0) return;
    for (const team of [1,2]) {
      const m=this.m[team],players=all.filter(q=>q.team.id===team),
        enemy=all.filter(q=>q.team.id===3-team),teamPlan=plans[team]||{};
      if (players.length!==4 || enemy.length!==4) continue;
      m.sampledFrames++;
      const sign=team===1?1:-1;
      const goalie=players.find(p=>teamPlan[p.id]?.role==='keeper');
      if (!goalie) continue;
      const field=players.filter(p=>p!==goalie);
      for (const p of players) {
        const role=teamPlan[p.id]?.role;
        if (typeof role !== 'string') continue;
        const previous=this.roleById.get(p.id);
        if (previous && previous!==role) m.roleSwitches++;
        this.roleById.set(p.id,role);
        m.roleSamples++;
      }
      const outfieldDistances=[
        dist(field[0].disc.pos,field[1].disc.pos),
        dist(field[1].disc.pos,field[2].disc.pos),
        dist(field[0].disc.pos,field[2].disc.pos)];
      m.spacingFrames++;
      if (Math.min(...outfieldDistances)>55 &&
          Math.max(...outfieldDistances)<420) m.separatedFrames++;
      if (players.some(p=>p.aiControlled===false)) m.humanTeammateFrames++;
      const options=field.filter(q=>dist(q.disc.pos,b.pos)>40 &&
        dist(q.disc.pos,b.pos)<300 && !enemy.some(o=>
        corridor(b.pos,q.disc.pos,o.disc.pos)<o.disc.radius+b.radius+10));
      m.supportFrames++;
      if (options.length>0) m.availableSupportFrames++;
      // Defensive shape is scored only with a trusted last-kicker proxy.
      if (this.lastKickTeam===3-team) {
        m.shapeFrames++;
        const press=field.slice().sort((a,c)=>
          dist(a.disc.pos,b.pos)-dist(c.disc.pos,b.pos))[0];
        const markers=field.filter(p=>p!==press);
        const own=st.goals?.find(g=>g.team.id===team);
        const ownX=own?(own.p0.x+own.p1.x)/2: -sign*600;
        const threats=enemy.slice().sort((a,c)=>
          Math.abs(a.disc.pos.x-ownX)-Math.abs(c.disc.pos.x-ownX));
        const assigned=new Set();
        let marked=0;
        for (const defender of markers) {
          const opponent=threats.find(o=>!assigned.has(o.id) &&
            sign*(defender.disc.pos.x-o.disc.pos.x)<=12 &&
            dist(defender.disc.pos,o.disc.pos)<115);
          if(opponent){assigned.add(opponent.id);marked++;}
        }
        m.unmarkedThreatSum+=Math.max(0,Math.min(2,threats.length)-marked);
        const goalieReady=Math.abs(goalie.disc.pos.x-ownX)<85;
        const pressReady=dist(press.disc.pos,b.pos)<110;
        if(pressReady){
          m.pressFrames++;
          this.pressEvent={team,tick};
        }
        if(marked===2&&goalieReady&&pressReady){
          m.coordinatedDefenseFrames++;
          if(this.recovery[team]!==null){
            m.recoveries++;m.shapeRecoveryTicks+=Math.max(0,tick-this.recovery[team]);
            this.recovery[team]=null;
          }
        }
        m.laneFrames++;
        const enemyReceiver=threats.find(p=>dist(p.disc.pos,b.pos)>60);
        if(enemyReceiver && markers.some(p=>
          corridor(b.pos,enemyReceiver.disc.pos,p.disc.pos)<p.disc.radius+b.radius+10))
          m.blockedThreatLaneFrames++;
      }
    }
  }
  finish() {
    if (this.pending) this.finalizePass('unresolved',null,null,0);
    return Object.fromEntries([1,2].map(team=>{
      const m=this.m[team],kicks=Object.values(m.kickers);
      const participation=kicks.length ? Math.max(...kicks)/m.nativeKicks : null;
      return [team,{
        schema:'fuckball-tactical-research-scorecard-v1', raw:m,
        derived:{
          pressuredPassCompletion:rate(m.contestedCompleted,m.contestedPasses),
          passCompletion:rate(m.passesReceived,m.passAttempts),
          targetedPassCompletion:rate(m.passesToTarget,m.passAttempts),
          interceptionRate:rate(m.passIntercepted,m.passAttempts),
          interceptionMarginEstimate:avg(m.passMargins,m.passMarginSamples),
          progressivePassRate:rate(m.progressivePasses,m.passesReceived),
          throughBallSuccess:rate(m.throughBallsCompleted,m.throughBalls),
          backwardRecycleSuccess:rate(m.safeBackPasses,m.backPasses),
          defensiveCoverRate:rate(m.coordinatedDefenseFrames,m.shapeFrames),
          dangerousUnmarkedPerDefensiveSample:avg(m.unmarkedThreatSum,m.shapeFrames),
          pressWhileDefendingRate:rate(m.pressFrames,m.shapeFrames),
          laneDenialEstimateRate:rate(m.blockedThreatLaneFrames,m.laneFrames),
          meanDefensiveRecoveryTicks:avg(m.shapeRecoveryTicks,m.recoveries),
          outfieldSpacingRate:rate(m.separatedFrames,m.spacingFrames),
          availableSafeSupportRate:rate(m.availableSupportFrames,m.supportFrames),
          overloadPassCompletion:rate(m.overloadCompleted,m.overloadAttempts),
          keeperFirstTeamTouchRate:rate(m.keeperFirstTeamTouches,m.keeperDistributions),
          keeperOpponentFirstTouchRate:rate(m.keeperFirstOpponentTouches,m.keeperDistributions),
          possibleShotRegretEstimateRate:rate(m.shotOptionRegretEstimates,m.shotAttempts),
          bankWallContactRate:rate(m.bankWallBounces,m.bankAttempts),
          bankRecoveryRate:rate(m.bankTeamRecoveries,m.bankAttempts),
          roleSwitchesPerHundredSamples:rate(m.roleSwitches*100,m.roleSamples),
          oneTwosObservedInferred:m.oneTwos,
          ballHogLargestKickerShare:participation===null?null:+participation.toFixed(4),
          projectedPassRiskCalibration:Object.fromEntries(
            Object.entries(m.passByRisk).map(([key,[attempts,completed]])=>
              [key,{attempts,completion:rate(completed,attempts)}])),
          humanCooperation:null,
          causalWallBoostAdvantage:null,
          actualShotSelectionRegret:null,
          actualOpponentPassDenial:null,
          officialPossessionRetention:null
        },
        provenance:{
          authoritative:['nativeKicks','nativeGoals'],
          observedInferred:['passesReceived','passIntercepted','oneTwos','bankWallBounces'],
          estimated:['interceptionMarginEstimate','possibleShotRegretEstimateRate',
            'defensiveCoverRate','laneDenialEstimateRate','availableSafeSupportRate'],
          unavailable:['humanCooperation','causalWallBoostAdvantage',
            'actualShotSelectionRegret','actualOpponentPassDenial',
            'officialPossessionRetention'],
          notes:'No fake 100% rates on empty denominators; unknown values are null. Defensive possession proxy uses last native kicker. Ball contact inferred by radius + impulse.'
        }
      }];
    }));
  }
}
module.exports={TacticalMetrics};
