'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const DEFAULT_CANDIDATE = 'ae54b5956d4018340f6142c54457c8d579a8cc95';
const LIVE_INCUMBENT = '84f819633fad77ccdbeac1f5fe6b69374ce421d7';
const LIVE_ENGINE = '84f819633fad77ccdbeac1f5fe6b69374ce421d7';

function argsOf(argv) {
  const out = {smoke: false};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--smoke') { out.smoke = true; continue; }
    if (!['--candidate', '--incumbent', '--engine', '--frames', '--output'].includes(arg))
      throw new Error('Unknown argument: ' + arg);
    if (!argv[i + 1] || argv[i + 1].startsWith('--'))
      throw new Error('Missing value for ' + arg);
    const key = arg.slice(2);
    out[key] = argv[++i];
  }
  out.candidate = out.candidate || DEFAULT_CANDIDATE;
  out.incumbent = out.incumbent || LIVE_INCUMBENT;
  out.engine = out.engine || LIVE_ENGINE;
  out.frames = Number(out.frames || (out.smoke ? 120 : 2400));
  if (!Number.isSafeInteger(out.frames) || out.frames < 120 || out.frames > 7200)
    throw new Error('frames must be an integer from 120 to 7200');
  for (const key of ['candidate', 'incumbent', 'engine'])
    if (!/^[0-9a-f]{40}$/.test(out[key])) throw new Error('Invalid commit SHA for ' + key);
  if (out.candidate === out.incumbent) throw new Error('Candidate and incumbent commits must differ');
  out.output = path.resolve(out.output || 'training/output/attack-regression-duel.json');
  return out;
}

function git(args, cwd) {
  const result = spawnSync('git', args, {cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
  if (result.error || result.status !== 0)
    throw new Error('git ' + args.join(' ') + ' failed: ' +
      (result.error ? result.error.message : (result.stderr || '').trim()));
  return result.stdout.trimEnd();
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function loadPolicy(repoRoot, commit, label, tempRoot) {
  const source = git(['show', commit + ':dist/ai/policy.js'], repoRoot);
  const blob = git(['rev-parse', commit + ':dist/ai/policy.js'], repoRoot);
  const file = path.join(tempRoot, label + '-policy.js');
  fs.writeFileSync(file, source + '\n', {flag: 'wx'});
  const ai = require(file);
  for (const key of ['teamPlan', 'tactical', 'profile'])
    if (typeof ai[key] !== 'function') throw new Error(label + ' policy is missing ' + key);
  return {ai, commit, blob, sha256: sha256(source)};
}

function freshStats() {
  return {
    kicks: 0, passAttempts: 0, passCompletions: 0, passTargetReceipts: 0,
    passInterceptions: 0, passUnresolved: 0, shotAttempts: 0, shotsOnTarget: 0,
    keeperDistributions: 0, keeperRecoveries: 0, keeperTurnovers: 0,
    keeperUnresolved: 0, attackingThirdFrames: 0
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function game(makeRoom, candidate, incumbent, mapName, candidateSide, seed, frames) {
  let room = null;
  let tick = 0;
  let plans = {1: {}, 2: {}};
  const stats = {1: freshStats(), 2: freshStats()};
  let pendingPass = null;
  let keeperRelease = null;
  let activeShot = null;
  let previousBall = null;
  let touching = new Set();

  const policyFor = team => team === candidateSide ? candidate.ai : incumbent.ai;
  const profileFor = team => {
    const ai = policyFor(team);
    return ai.profile(ai.defaultProfile);
  };

  function finishPass(kind, player) {
    if (!pendingPass) return;
    const record = pendingPass;
    const m = stats[record.team];
    if (kind === 'received') {
      m.passCompletions++;
      if (player && player.id === record.target) m.passTargetReceipts++;
    } else if (kind === 'intercepted') {
      m.passInterceptions++;
    } else {
      m.passUnresolved++;
    }
    pendingPass = null;
  }

  function finishKeeper(player) {
    if (!keeperRelease) return;
    if (!player) stats[keeperRelease.team].keeperUnresolved++;
    else if (player.team.id === keeperRelease.team)
      stats[keeperRelease.team].keeperRecoveries++;
    else stats[keeperRelease.team].keeperTurnovers++;
    keeperRelease = null;
  }

  const callbacks = {
    onPlayerBallKick: id => {
      if (!room) return;
      const playerId = id && typeof id === 'object' ? id.id : id;
      const player = room.state.players.find(p => p.id === playerId);
      if (!player || ![1, 2].includes(player.team.id)) return;
      const team = player.team.id;
      const m = stats[team];
      if (pendingPass) {
        const confirmedContact = tick - pendingPass.tick >= 2 && player.id !== pendingPass.kicker;
        finishPass(confirmedContact ?
          (player.team.id === pendingPass.team ? 'received' : 'intercepted') : 'unresolved', player);
      }
      if (keeperRelease) {
        const confirmedContact = tick - keeperRelease.tick >= 2 && player.id !== keeperRelease.kicker;
        finishKeeper(confirmedContact ? player : null);
      }
      activeShot = null;
      m.kicks++;
      const intent = plans[team] && plans[team][player.id];
      const option = intent && intent.option;
      if (option && option.kind === 'pass') {
        m.passAttempts++;
        pendingPass = {
          team, kicker: player.id,
          target: Number.isInteger(option.to) ? option.to : null,
          tick
        };
      }
      if (intent && intent.role === 'keeper') {
        m.keeperDistributions++;
        keeperRelease = {team, kicker: player.id, tick};
      }
      if (option && (option.kind === 'shot' || option.kind === 'bank'))
        activeShot = {team, tick};
    },
    onTeamGoal: teamValue => {
      const team = teamValue && typeof teamValue === 'object' ? teamValue.id : teamValue;
      if (activeShot && activeShot.team === team) {
        stats[team].shotsOnTarget++;
        activeShot = null;
      }
    }
  };

  const env = makeRoom(callbacks);
  room = env.room;
  try {
    room.setCurrentStadium(env.map(mapName), 0);
    room.setScoreLimit(0, 0);
    room.setTimeLimit(0, 0);
    for (let id = 1; id <= 8; id++) {
      room.playerJoin(id, 'Bot ' + id, '', String(id), '', '');
      room.setPlayerTeam(id, id <= 4 ? 1 : 2, 0);
    }
    room.startGame(0);
    env.step(2);
    for (const player of room.state.players) {
      player.aiControlled = true;
      const drift = (Math.imul(seed + player.id * 19, 2654435761) >>> 0) % 31 - 15;
      room.state.updatePlayer(player.id, {
        pos: [player.disc.pos.x, player.disc.pos.y + drift],
        speed: [0, 0]
      });
    }

    const stadium = room.state.gameState.stadium;
    const width = Math.abs(stadium.bgWidth || stadium.width - 50);
    const targetGoals = {
      1: stadium.goals.find(goal => goal.team.id === 2),
      2: stadium.goals.find(goal => goal.team.id === 1)
    };
    const start = process.hrtime.bigint();
    const initialBall = room.state.gameState.physicsState.discs[0];
    previousBall = {
      x: initialBall.speed.x, y: initialBall.speed.y,
      posX: initialBall.pos.x, posY: initialBall.pos.y
    };

    for (tick = 0; tick < frames; tick++) {
      if (tick % 4 === 0) {
        for (const team of [1, 2]) {
          const ai = policyFor(team);
          plans[team] = ai.teamPlan(room.state, team, tick, profileFor(team));
        }
        for (const player of room.state.players) {
          const ai = policyFor(player.team.id);
          const input = ai.tactical(room.state, player.id, tick, {
            difficulty: 'hard', profile: profileFor(player.team.id)
          });
          room.playerInput(input, player.id);
        }
      }

      const beforeX = previousBall && previousBall.posX;
      const beforeY = previousBall && previousBall.posY;
      env.step(1);
      const ball = room.state.gameState && room.state.gameState.physicsState.discs[0];
      if (!ball) continue;

      if (activeShot && tick - activeShot.tick > 180) activeShot = null;
      if (activeShot && previousBall && targetGoals[activeShot.team]) {
        const goal = targetGoals[activeShot.team];
        const goalX = (goal.p0.x + goal.p1.x) / 2;
        const sign = activeShot.team === 1 ? 1 : -1;
        const yMin = Math.min(goal.p0.y, goal.p1.y) - ball.radius;
        const yMax = Math.max(goal.p0.y, goal.p1.y) + ball.radius;
        const crossed = sign * (beforeX - goalX) < 0 &&
          sign * (ball.pos.x - goalX) >= 0;
        if (crossed && ball.pos.y >= yMin && ball.pos.y <= yMax) {
          stats[activeShot.team].shotsOnTarget++;
          activeShot = null;
        }
      }

      const damping = ball.damping || 0.99;
      const impulse = previousBall ?
        Math.hypot(ball.speed.x - previousBall.x * damping,
          ball.speed.y - previousBall.y * damping) : 0;
      const nowTouching = new Set();
      const contacts = [];
      for (const player of room.state.players) {
        if (!player.disc || ![1, 2].includes(player.team.id)) continue;
        const gap = distance(player.disc.pos, ball.pos) - player.disc.radius - ball.radius;
        if (gap <= 1.35) {
          nowTouching.add(player.id);
          if (!touching.has(player.id) && impulse > 0.12)
            contacts.push({player, gap});
        }
      }
      if (contacts.length) {
        contacts.sort((a, b) => a.gap - b.gap || a.player.id - b.player.id);
        const player = contacts[0].player;
        if (pendingPass && tick - pendingPass.tick >= 2 && player.id !== pendingPass.kicker)
          finishPass(player.team.id === pendingPass.team ? 'received' : 'intercepted', player);
        if (keeperRelease && tick - keeperRelease.tick >= 2 && player.id !== keeperRelease.kicker)
          finishKeeper(player);
      }
      touching = nowTouching;

      for (const team of [1, 2]) {
        const sign = team === 1 ? 1 : -1;
        if (sign * ball.pos.x > width / 3) stats[team].attackingThirdFrames++;
      }
      previousBall = {
        x: ball.speed.x, y: ball.speed.y,
        posX: ball.pos.x, posY: ball.pos.y
      };
      if (pendingPass && tick - pendingPass.tick > 180) finishPass('unresolved');
      if (keeperRelease && tick - keeperRelease.tick > 180) finishKeeper(null);
    }

    const elapsedSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const final = room.gameState;
    const red = Number(final.redScore) || 0;
    const blue = Number(final.blueScore) || 0;
    const candidateGoals = candidateSide === 1 ? red : blue;
    const opponentGoals = candidateSide === 1 ? blue : red;
    const outcome = candidateGoals > opponentGoals ? 'win' :
      candidateGoals < opponentGoals ? 'loss' : 'draw';
    const projectStats = team => Object.assign({}, stats[team]);
    return {
      seed, stadium: mapName, candidateSide, frames,
      engineScore: {red, blue},
      candidate: {team: candidateSide, goalsFor: candidateGoals,
        goalsAgainst: opponentGoals, outcome, stats: projectStats(candidateSide)},
      incumbent: {team: 3 - candidateSide, goalsFor: opponentGoals,
        goalsAgainst: candidateGoals,
        outcome: outcome === 'win' ? 'loss' : outcome === 'loss' ? 'win' : 'draw',
        stats: projectStats(3 - candidateSide)},
      elapsedSeconds: Number(elapsedSeconds.toFixed(3))
    };
  } finally {
    if (room && typeof room.destroy === 'function') room.destroy();
  }
}

function sumStats(games, side) {
  const out = freshStats();
  for (const match of games) {
    const stats = match[side].stats;
    for (const key of Object.keys(out)) out[key] += stats[key] || 0;
  }
  return out;
}

function summarize(games) {
  const wins = games.filter(g => g.candidate.outcome === 'win').length;
  const draws = games.filter(g => g.candidate.outcome === 'draw').length;
  const losses = games.filter(g => g.candidate.outcome === 'loss').length;
  const goalsFor = games.reduce((sum, g) => sum + g.candidate.goalsFor, 0);
  const goalsAgainst = games.reduce((sum, g) => sum + g.candidate.goalsAgainst, 0);
  return {
    matches: games.length, wins, draws, losses,
    scoreRate: games.length ? +((wins + draws * 0.5) / games.length).toFixed(4) : null,
    goalsFor, goalsAgainst, goalDifference: goalsFor - goalsAgainst,
    candidate: sumStats(games, 'candidate'),
    incumbent: sumStats(games, 'incumbent')
  };
}

function gateFor(games, fullRun, candidateCommit, incumbentCommit, engineCommit) {
  const overall = summarize(games);
  const reasons = [];
  if (!fullRun) reasons.push('not a full 64-match, 2400-frame balanced evaluation');
  if (incumbentCommit !== LIVE_INCUMBENT)
    reasons.push('incumbent is not the pinned 19 October live policy');
  if (engineCommit !== LIVE_ENGINE)
    reasons.push('engine is not the pinned 19 October live runtime');
  if (overall.scoreRate === null || overall.scoreRate <= 0.55)
    reasons.push('candidate match-point rate must exceed 55%');
  if (overall.wins <= overall.losses)
    reasons.push('candidate must win more matches than it loses');
  if (overall.goalDifference <= 0)
    reasons.push('candidate must have positive actual goal difference');
  for (const stadium of ['BFF', 'Classic']) {
    const perStadium = summarize(games.filter(g => g.stadium === stadium));
    if (perStadium.matches !== 32)
      reasons.push(stadium + ' requires 32 paired matches');
    if (perStadium.scoreRate === null || perStadium.scoreRate < 0.40)
      reasons.push(stadium + ' match-point rate is below 40%');
    if (perStadium.goalDifference < -4)
      reasons.push(stadium + ' goal difference is a severe regression');
  }
  return {
    schema: 'fuckball-attack-champion-gate-v1',
    passed: reasons.length === 0,
    eligibleForOwnerReview: reasons.length === 0,
    livePromotionPerformed: false,
    reasons,
    criteria: {
      fullBalancedGames: 64, framesPerGame: 2400,
      minimumOverallScoreRateExclusive: 0.55,
      requiresMoreWinsThanLosses: true,
      requiresPositiveGoalDifference: true,
      perStadiumMinimumScoreRate: 0.40,
      perStadiumMinimumGoalDifference: -4
    }
  };
}

function main() {
  const options = argsOf(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '..');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fuckball-attack-duel-'));
  const engineRoot = path.join(tempRoot, 'engine');
  let worktreeAdded = false;
  try {
    git(['worktree', 'add', '--detach', engineRoot, options.engine], repoRoot);
    worktreeAdded = true;
    const candidate = loadPolicy(repoRoot, options.candidate, 'candidate', tempRoot);
    const incumbent = loadPolicy(repoRoot, options.incumbent, 'incumbent', tempRoot);
    const {makeRoom} = require(path.join(engineRoot, 'training/selfplay.cjs'));
    const seeds = options.smoke ? [20261020] :
      Array.from({length: 16}, (_, index) => 20261020 + index * 97);
    const maps = ['BFF', 'Classic'];
    const sides = [1, 2];
    const games = [];
    for (const seed of seeds) {
      for (const map of maps) {
        for (const side of sides) {
          const result = game(makeRoom, candidate, incumbent, map, side, seed, options.frames);
          games.push(result);
          process.stderr.write('attack-duel ' + games.length + '/' +
            (seeds.length * maps.length * sides.length) + ' ' + map +
            ' side=' + side + ' seed=' + seed + ' ' + result.candidate.outcome +
            ' ' + result.candidate.goalsFor + '-' + result.candidate.goalsAgainst + '\n');
        }
      }
    }
    const fullRun = !options.smoke && options.frames === 2400 &&
      seeds.length === 16 && games.length === 64;
    const gate = gateFor(games, fullRun, options.candidate, options.incumbent, options.engine);
    const byStadium = Object.fromEntries(maps.map(map => [map, summarize(games.filter(g => g.stadium === map))]));
    const result = {
      schema: 'fuckball-native-attack-duel-v1',
      createdAt: new Date().toISOString(),
      engineCommit: options.engine,
      engineTreeSha: git(['rev-parse', options.engine + '^{tree}'], repoRoot),
      candidatePolicy: {commit: candidate.commit, blob: candidate.blob, sha256: candidate.sha256},
      incumbentPolicy: {commit: incumbent.commit, blob: incumbent.blob, sha256: incumbent.sha256},
      design: {
        kind: 'native-engine 4v4 tactical policy-to-policy head-to-head',
        seeds, stadiums: maps, candidateSides: sides, framesPerGame: options.frames,
        games: games.length, smokeOnly: options.smoke,
        sideSwap: 'same seed and stadium are run with candidate on both teams',
        liveStateChanged: false
      },
      summary: summarize(games),
      byStadium,
      gate,
      livePromotionPerformed: false,
      limitations: [
        'Goals and final scores are authoritative native-engine scoreboard values.',
        'Pass receptions and interceptions are observed-inferred from fresh player contact plus ball impulse; they are not official possession events.',
        'Shot attempts are counted only when an actual native kick has a contemporaneous shot/bank intent. Shots on target are inferred from goal-mouth crossing or an actual goal.',
        'Attacking-third frames measure ball territory, not team possession.',
        'This runner writes only the requested evidence JSON. It cannot change production assets, live services, champion pointers or training checkpoints.'
      ],
      games
    };
    fs.mkdirSync(path.dirname(options.output), {recursive: true});
    const temporaryOutput = options.output + '.' + process.pid + '.tmp';
    fs.writeFileSync(temporaryOutput, JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
    fs.renameSync(temporaryOutput, options.output);
    process.stdout.write(JSON.stringify({
      output: options.output,
      matches: games.length,
      summary: result.summary,
      byStadium,
      gate,
      livePromotionPerformed: false
    }, null, 2) + '\n');
  } finally {
    if (worktreeAdded) {
      try { git(['worktree', 'remove', '--force', engineRoot], repoRoot); }
      catch (error) { process.stderr.write('warning: could not remove temporary engine worktree: ' + error.message + '\n'); }
    }
    fs.rmSync(tempRoot, {recursive: true, force: true});
  }
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    process.stderr.write((error && error.stack) ? error.stack + '\n' : String(error) + '\n');
    process.exitCode = 1;
  }
}
