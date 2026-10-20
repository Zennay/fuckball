'use strict';
// Persistent tactical self-play ladder fed by the HaxLab data-generation cycle.
// Selection is based on real 4v4 outcomes, NEVER imitation accuracy.
// Training-only: this file cannot modify live game assets or neural champions.
const fs = require('node:fs');
const path = require('node:path');
const AI = require('../dist/ai/policy.js');
const SP = require('../dist/ai/selfplay.js');
const { makeRoom } = require('./selfplay.cjs');

const PROFILE_KEYS = Object.keys(AI.defaultProfile).sort();
const SCHEMA = 'fuckball-tactical-checkpoint-v1';
function checkedProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(PROFILE_KEYS)) {
    throw Error('Tactical profile must contain exactly the current tactical parameters');
  }
  for (const k of PROFILE_KEYS) {
    const v=value[k], bounds=AI.profileBounds?.[k]||(k==='screen'?[30,90]:[60,220]);
    const [min,max]=bounds;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
      throw Error('Invalid tactical parameter ' + k);
  }
  return Object.fromEntries(PROFILE_KEYS.map(k => [k, value[k]]));
}
function readCheckpoint(file) {
  const checkpoint = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (checkpoint.schema !== SCHEMA) throw Error('Unsupported tactical checkpoint');
  return { ...checkpoint, profile: checkedProfile(checkpoint.profile) };
}
function uint(raw, name) {
  if (!/^(0|[1-9][0-9]*)$/.test(String(raw)) || Number(raw) > 0xffffffff)
    throw Error('Invalid ' + name);
  return Number(raw);
}
function writeAtomic(file, object) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const temp = file + '.' + process.pid + '.tmp';
  try {
    fs.writeFileSync(temp, JSON.stringify(object, null, 2) + '\n', { flag: 'wx' });
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
function tournament(candidate, incumbent, seed, frames) {
  const games = [];
  // Independent seeds, both sides, both stadiums: not the evolutionary
  // trainer's 4-seed gate or neural league's held-out scenario suite.
  for (let s = 0; s < 4; s++) for (const map of ['BFF', 'Classic'])
    for (const side of [1, 2]) {
      const gameSeed = (seed + 3900017 + s * 7919 + (map === 'Classic' ? 1171 : 0)) >>> 0;
      const g = SP.match(makeRoom, candidate, incumbent, side, gameSeed, map, frames);
      games.push({ seed: gameSeed, map, side, goals: g.goals, conceded: g.conceded,
        kicks: g.kicks, opponentKicks: g.opponentKicks, territoryFitness: g.fitness,
        events: g.events || null, opponentEvents: g.opponentEvents || null });
    }
  const wins = games.filter(g => g.goals > g.conceded).length;
  const losses = games.filter(g => g.goals < g.conceded).length;
  const goalsFor = games.reduce((n, g) => n + g.goals, 0);
  const goalsAgainst = games.reduce((n, g) => n + g.conceded, 0);
  const count = key => games.reduce((n, g) => n + (g.events?.[key] || 0), 0);
  const passAttempts=count('passAttempts'),passCompleted=count('passCompleted');
  const shotAttempts=count('shotAttempts'),shotsScored=count('shotsScored');
  const football={ passAttempts,passCompleted,passToTarget:count('passToTarget'),
    passIntercepted:count('passIntercepted'),passMissed:count('passMissed'),
    passCompletionRate:passAttempts?passCompleted/passAttempts:0,
    shotAttempts,shotProjectedOnTarget:count('shotProjectedOnTarget'),
    shotsScored,shotConversionRate:shotAttempts?shotsScored/shotAttempts:0,
    keeperClearances:count('keeperClearances'),
    keeperDistributionsCompleted:count('keeperDistributionsCompleted'),
    keeperTurnovers:count('keeperTurnovers') };
  return { matches: games.length, wins, losses, draws: games.length-wins-losses,
    scoreRate: (wins + (games.length-wins-losses)/2)/games.length,
    goalsFor, goalsAgainst, goalDifference: goalsFor-goalsAgainst,
    football,
    kicksFor: games.reduce((n,g)=>n+g.kicks,0),
    kicksAgainst: games.reduce((n,g)=>n+g.opponentKicks,0), games };
}
function decide(incumbent, defaultBaseline, teamPromoted, changed) {
  const reasons = [];
  if (!teamPromoted) reasons.push('tactical self-play did not select a challenger');
  if (!changed) reasons.push('tactical profile unchanged');
  if (!incumbent) reasons.push('no independent incumbent evaluation');
  else if (incumbent.matches < 16 || incumbent.scoreRate < 0.5625 ||
           incumbent.goalDifference < 2 || incumbent.wins <= incumbent.losses)
    reasons.push('no convincing side-swapped improvement over tactical incumbent');
  if (defaultBaseline && (defaultBaseline.matches < 16 ||
      defaultBaseline.scoreRate < 0.5 || defaultBaseline.goalDifference < 0))
    reasons.push('regression versus frozen default tactical baseline');
  return { selectedForTraining: reasons.length === 0, reasons };
}
function main() {
  const [teamFile, championFile, reportFile, seedArg='20261020', framesArg='2400'] = process.argv.slice(2);
  if (!teamFile || !championFile || !reportFile)
    throw Error('Usage: node training/tactical-champion.cjs TEAM.json CHAMPION.json REPORT.json [seed] [frames]');
  const seed = uint(seedArg, 'seed'), frames = uint(framesArg, 'frames');
  if (frames < 600 || frames > 7200) throw Error('frames must be 600-7200');
  const team = JSON.parse(fs.readFileSync(teamFile, 'utf8'));
  if (team.schema !== 'fuckball-team-policy-v1' || typeof team.promoted !== 'boolean')
    throw Error('Untrusted team-policy artifact');
  const challenger = checkedProfile(team.profile);
  const incumbentCheckpoint = fs.existsSync(championFile) ? readCheckpoint(championFile) : null;
  const incumbent = incumbentCheckpoint?.profile || checkedProfile(AI.defaultProfile);
  const same = JSON.stringify(challenger) === JSON.stringify(incumbent);
  const againstIncumbent = team.promoted && !same ? tournament(challenger, incumbent, seed, frames) : null;
  // Keep an immutable initial-game benchmark even after several generations
  // of training-only champions. Never trust progress against only an easy rival.
  const againstDefault = team.promoted && !same && incumbentCheckpoint
    ? tournament(challenger, checkedProfile(AI.defaultProfile), (seed+100019)>>>0, frames)
    : null;
  const gate = decide(againstIncumbent, againstDefault, team.promoted, !same);
  const report = { schema: 'fuckball-tactical-ladder-v1', seed, frames,
    incumbent: incumbentCheckpoint?.sourceCycle || 'frozen-default',
    teamPromoted: team.promoted, againstIncumbent, againstDefault, gate,
    note: 'Tactical profile selection only. Not live model or neural promotion.' };
  // Evidence is always persisted before selecting a training-only champion.
  writeAtomic(reportFile, report);
  if (gate.selectedForTraining) writeAtomic(championFile, { schema: SCHEMA,
    sourceCycle: path.basename(path.dirname(teamFile)),
    profile: challenger, evidence: {
      incumbent: { scoreRate: againstIncumbent.scoreRate, goalDifference: againstIncumbent.goalDifference },
      default: againstDefault ? { scoreRate: againstDefault.scoreRate,
        goalDifference: againstDefault.goalDifference } : null },
    note: 'Research checkpoint only. Must be independently evaluated before any opt-in live release.' });
  console.log(JSON.stringify({ selectedForTraining: gate.selectedForTraining,
    againstIncumbent: againstIncumbent && { scoreRate: againstIncumbent.scoreRate,
      goalDifference: againstIncumbent.goalDifference },
    againstDefault: againstDefault && { scoreRate: againstDefault.scoreRate,
      goalDifference: againstDefault.goalDifference },
    reasons: gate.reasons }));
}
if (require.main === module) { try { main(); } catch (e) { console.error(e); process.exitCode = 1; } }
module.exports = { checkedProfile, readCheckpoint, decide, tournament };
