'use strict';
// Candidate-vs-champion 4v4 league on the SAME pinned physics engine used by the game.
// This evaluates checkpoints; it never mutates the live model or the champion pointer.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { HBInit } = require('../headless/runtime.cjs');
const AI = require('../dist/ai/policy.js');

const MAPS = ['BFF Big v4', 'Classic'];
const ROLES = ['gk', 'dm', 'am', 'st'];
function integer(raw, name, low, high) {
  if (!/^(0|[1-9][0-9]*)$/.test(String(raw))) throw Error(name + ' must be an unsigned integer');
  const x = Number(raw);
  if (!Number.isSafeInteger(x) || x < low || x > high) throw Error(name + ' out of range');
  return x;
}
function randomFor(seed) {
  let n = seed >>> 0;
  return () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function modelHash(model) {
  return crypto.createHash('sha256').update(JSON.stringify(model)).digest('hex');
}
function scoreFor(goals, against) {
  return goals > against ? 1 : goals < against ? 0 : 0.5;
}
function runMatch({ candidate, incumbent, candidateSide, map = 'BFF Big v4', seed = 101, frames = 2400, mixed = false, replayPath = null }) {
  if (![1, 2].includes(candidateSide)) throw Error('Invalid side');
  if (!MAPS.includes(map)) throw Error('Invalid stadium');
  frames = integer(frames, 'frames', 300, 18000);
  seed = integer(seed, 'seed', 0, 0xffffffff);
  AI.validateModel(candidate);
  AI.validateModel(incumbent);
  const room = HBInit({ noPlayer: true });
  let tick = 0;
  const kicks = { 1: 0, 2: 0 }, kickers = { 1: new Set(), 2: new Set() };
  const passes = { 1: 0, 2: 0 }, samples = { 1: 0, 2: 0 };
  const spacing = { 1: 0, 2: 0 }, defenders = { 1: 0, 2: 0 };
  let previousKick = null, recordStarted = false;
  try {
    if (map === 'Classic') room.setDefaultStadium('Classic');
    else room.setCustomStadium(fs.readFileSync(path.join(__dirname, '../dist/stadiums/bff-big-v4.hbs'), 'utf8'));
    room.setScoreLimit(0); room.setTimeLimit(0);
    for (let i = 1; i <= 8; i++) room.addPlayer(i, 'Eval ' + i, i <= 4 ? 1 : 2);
    room.onPlayerBallKick = p => {
      if (!p || ![1, 2].includes(p.team)) return;
      kicks[p.team]++;
      kickers[p.team].add(p.id);
      // A deliberately *conservative proxy*: consecutive kicks by DIFFERENT
      // teammates with no intervening opponent kick. Not claimed to be all passes.
      if (previousKick && previousKick.team === p.team && previousKick.id !== p.id &&
          tick - previousKick.tick >= 1 && tick - previousKick.tick <= 180) passes[p.team]++;
      previousKick = { team: p.team, id: p.id, tick };
    };
    room.startGame();
    room.step(2);
    if (replayPath) { room.startRecording(); recordStarted = true; }
    const rng = randomFor(seed);
    // Mirror paired games by team side, vary only legal initial player positions.
    for (let i = 1; i <= 8; i++) {
      const disc = room.getPlayerDiscProperties(i);
      if (!disc) throw Error('Player missing from active 4v4 game');
      room.setPlayerDiscProperties(i, { x: disc.x, y: disc.y + (rng() - 0.5) * 36 });
    }
    AI.reset(candidate); AI.reset(incumbent);
    for (tick = 0; tick < frames; tick++) {
      if (tick % 6 === 0) {
        for (const p of room._room.state.players) {
          const index = (p.id - 1) % 4;
          const policy = p.team.id === candidateSide ? candidate : incumbent;
          const input = mixed && (index === 1 || index === 3)
            ? AI.tactical(room._room.state, p.id, tick, { difficulty: 'hard' })
            : AI.infer(policy, room._room.state, p.id, ROLES[index]).input;
          room.setPlayerInput(p.id, input);
        }
      }
      if (tick % 12 === 0) {
        const state = room._room.state;
        const ball = state.gameState?.physicsState.discs[0];
        if (ball) for (const side of [1, 2]) {
          const members = state.players.filter(p => p.team.id === side && p.disc);
          if (members.length !== 4) throw Error('4v4 state lost players');
          const pairDistances = [];
          for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++)
            pairDistances.push(Math.hypot(members[a].disc.pos.x - members[b].disc.pos.x,
              members[a].disc.pos.y - members[b].disc.pos.y));
          spacing[side] += pairDistances.reduce((a, b) => a + b, 0) / pairDistances.length;
          // Positional cover proxy: any player between ball and their own goal
          // while ball is in their defensive half. Not a complete defensive metric.
          const defensiveBall = (side === 1 ? ball.pos.x < 0 : ball.pos.x > 0);
          if (defensiveBall && members.some(p => side === 1
            ? p.disc.pos.x < ball.pos.x - 15 : p.disc.pos.x > ball.pos.x + 15))
            defenders[side]++;
          samples[side]++;
        }
      }
      room.step(1);
    }
    const result = room.getScores();
    const goals = candidateSide === 1 ? result.red : result.blue;
    const conceded = candidateSide === 1 ? result.blue : result.red;
    const metrics = side => ({
      goals: side === 1 ? result.red : result.blue,
      kicks: kicks[side],
      distinctKickers: kickers[side].size,
      passChainsProxy: passes[side],
      meanPairDistance: Number((spacing[side] / (samples[side] || 1)).toFixed(2)),
      defensiveCoverSampleRate: Number((defenders[side] / (samples[side] || 1)).toFixed(3))
    });
    if (recordStarted) {
      const bytes = room.stopRecording();
      recordStarted = false;
      fs.mkdirSync(path.dirname(replayPath), { recursive: true });
      fs.writeFileSync(replayPath, Buffer.from(bytes));
    }
    return { map, seed, frames, side: candidateSide, mixed, goals, conceded,
      points: scoreFor(goals, conceded), candidate: metrics(candidateSide),
      incumbent: metrics(3 - candidateSide), replay: replayPath };
  } finally {
    if (recordStarted) { try { room.stopRecording(); } catch {} }
    room.destroy();
  }
}
function summarise(matches) {
  const sum = field => matches.reduce((total, m) => total + field(m), 0);
  const count = matches.length;
  return { matches: count, points: sum(m => m.points), scoreRate: sum(m => m.points) / (count || 1),
    goalDifference: sum(m => m.goals - m.conceded),
    goalsFor: sum(m => m.goals), goalsAgainst: sum(m => m.conceded),
    meanPairDistance: sum(m => m.candidate.meanPairDistance) / (count || 1),
    meanCoverRate: sum(m => m.candidate.defensiveCoverSampleRate) / (count || 1),
    passChainsProxy: sum(m => m.candidate.passChainsProxy),
    distinctKickers: sum(m => m.candidate.distinctKickers),
    totalKicks: sum(m => m.candidate.kicks) };
}
function decideGate(headToHead, unfamiliar) {
  // Winning is primary; positional health and unfamiliar-partner play are
  // separate regression floors. Do not reward meaningless touches alone.
  const reasons = [];
  if (headToHead.matches < 8 || headToHead.scoreRate < 0.5625 || headToHead.goalDifference <= 0)
    reasons.push('no convincing side-swapped advantage over incumbent');
  if (unfamiliar.matches < 4 || unfamiliar.scoreRate < 0.5 || unfamiliar.goalDifference < 0)
    reasons.push('regression with unfamiliar tactical teammates');
  if (!(headToHead.meanPairDistance > 20 && headToHead.meanPairDistance < 700) ||
      !(unfamiliar.meanPairDistance > 20 && unfamiliar.meanPairDistance < 700))
    reasons.push('collapsed or nonsensical team spacing');
  if (headToHead.totalKicks < 2 || unfamiliar.totalKicks < 1)
    reasons.push('insufficient on-ball participation');
  return { promoted: reasons.length === 0, reasons };
}
function evaluate({ candidate, incumbent, seed = 101, frames = 2400, replayDir = null }) {
  seed = integer(seed, 'seed', 0, 0xffffffff);
  frames = integer(frames, 'frames', 300, 18000);
  const matches = [], unfamiliarMatches = [];
  // Fixed seeds and mirrors; evaluate more games over time before elite claims.
  for (const [mi, map] of MAPS.entries()) for (const [si, offset] of [0, 53].entries())
    for (const side of [1, 2]) {
      const matchSeed = (seed + mi * 1009 + offset) >>> 0;
      const replay = replayDir ? path.join(replayDir,
        'champion-' + map.replace(/[^a-z0-9]/gi, '-') + '-' + si + '-side-' + side + '.hbr2') : null;
      matches.push(runMatch({ candidate, incumbent, candidateSide: side, seed: matchSeed, map, frames, replayPath: replay }));
    }
  for (const [mi, map] of MAPS.entries()) for (const side of [1, 2]) {
    const matchSeed = (seed + 5001 + mi * 991) >>> 0;
    unfamiliarMatches.push(runMatch({ candidate, incumbent, candidateSide: side, seed: matchSeed,
      map, frames, mixed: true }));
  }
  const head = summarise(matches), unfamiliar = summarise(unfamiliarMatches);
  const gate = decideGate(head, unfamiliar);
  return { schema: 'fuckball-neural-league-v1',
    candidateHash: modelHash(candidate), incumbentHash: modelHash(incumbent),
    configuration: { seed, frames, maps: MAPS, sideSwapped: true,
      note: 'Human-style partners are tactical proxies, NOT genuine human players.' },
    headToHead: head, unfamiliarPartners: unfamiliar, gate,
    games: [...matches, ...unfamiliarMatches],
    note: 'Checkpoint selection evidence only. Never claims elite-human performance or triggers live deployment.' };
}
function main() {
  const [candidatePath, championPath, outputPath, seedRaw = '101', framesRaw = '2400', replayDir] = process.argv.slice(2);
  if (!candidatePath || !championPath || !outputPath)
    throw Error('Usage: node training/league.cjs CANDIDATE CHAMPION REPORT.json [seed] [frames] [replayDir]');
  const candidate = AI.validateModel(JSON.parse(fs.readFileSync(candidatePath, 'utf8')));
  const incumbent = AI.validateModel(JSON.parse(fs.readFileSync(championPath, 'utf8')));
  const report = evaluate({ candidate, incumbent, seed: integer(seedRaw, 'seed', 0, 0xffffffff),
    frames: integer(framesRaw, 'frames', 300, 18000), replayDir: replayDir || null });
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath + '.tmp', JSON.stringify(report, null, 2));
  fs.renameSync(outputPath + '.tmp', outputPath);
  console.log(JSON.stringify({ outputPath, promoted: report.gate.promoted,
    headToHead: report.headToHead, unfamiliarPartners: report.unfamiliarPartners,
    reasons: report.gate.reasons }));
}
if (require.main === module) { try { main(); } catch (error) { console.error(error); process.exitCode = 1; } }
module.exports = { runMatch, summarise, decideGate, evaluate, integer, scoreFor };
