'use strict';
// Unattended, checkpointed VPS research loop. Candidates must beat the incumbent
// in actual side-swapped 4v4 games and unfamiliar-teammate trials to be selected.
// Never writes gameplay assets or the live champion/promotion pointer.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const root = path.resolve(process.argv[2] || 'training/output/continuous');
const rawWindow = process.argv[3] || '12';
const forever = rawWindow === 'forever';
const hours = forever ? null : Number(rawWindow);
if (!forever && (!Number.isFinite(hours) || hours < 1 || hours > 72))
  throw Error('Training window must be 1-72 hours or "forever"');
const episodes = boundEnv('HAXLAB_EPISODES', 192, 6, 200);
const generations = boundEnv('HAXLAB_GENERATIONS', 10, 1, 20);
const leagueFrames = boundEnv('HAXLAB_LEAGUE_FRAMES', 2400, 300, 18000);
const lowDiskGiB = boundEnv('HAXLAB_DISK_RESERVE_GIB', 10, 2, 1000);
function boundEnv(name, defaultValue, min, max) {
  const value = process.env[name] === undefined ? String(defaultValue) : process.env[name];
  if (!/^[0-9]+$/.test(value)) throw Error(name + ' must be an unsigned integer');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw Error(name + ' outside allowed range');
  return n;
}
fs.mkdirSync(root, { recursive: true });
const stateFile = path.join(root, 'status.json');
const lock = path.join(root, 'trainer.lock');
const stopFile = path.join(root, 'STOP');
let locked = false, child = null, stop = false;
try {
  const fd = fs.openSync(lock, 'wx');
  try { fs.writeFileSync(fd, String(process.pid)); } finally { fs.closeSync(fd); }
  locked = true;
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  let oldPid;
  try { oldPid = Number(fs.readFileSync(lock, 'utf8').trim()); } catch {}
  if (!Number.isInteger(oldPid) || oldPid < 1) throw Error('Training lock is corrupt. Investigate before removal.');
  try {
    process.kill(oldPid, 0);
    throw Error('Another trainer (' + oldPid + ') owns this directory');
  } catch (signalError) {
    if (signalError.code !== 'ESRCH') throw signalError;
    fs.unlinkSync(lock);
    // Do not race multiple failed starts after clearing an orphaned lock.
    throw Error('Recovered stale training lock; restart to continue');
  }
}
let state = { cycles: 0, matches: 0, bestGeneration: 0, championUpdates: 0 };
try { state = { ...state, ...JSON.parse(fs.readFileSync(stateFile, 'utf8')) }; } catch {}
const start = Date.now();
const deadline = forever ? Infinity : start + hours * 3600000;
function save(extra) {
  state = { ...state, ...extra, updatedAt: new Date().toISOString() };
  fs.writeFileSync(stateFile + '.tmp', JSON.stringify(state, null, 2));
  fs.renameSync(stateFile + '.tmp', stateFile);
}
function copyAtomic(from, to) {
  const tmp = to + '.tmp';
  fs.copyFileSync(from, tmp);
  fs.renameSync(tmp, to);
}
function halt() {
  stop = true;
  if (child && child.pid) {
    // Detached process group includes a possible Python fine-tuning child.
    try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch {} }
  }
}
process.on('SIGINT', halt);
process.on('SIGTERM', halt);
function run(executable, args, env) {
  return new Promise((resolve, reject) => {
    // CWD never depends on caller; runner/service must check out a pinned release.
    child = spawn(executable, args, { cwd: path.resolve(__dirname, '..'),
      env, stdio: 'inherit', detached: process.platform !== 'win32' });
    child.once('error', reject);
    child.once('exit', (code, signal) => { child = null; resolve({ code, signal }); });
    if (stop) halt();
  });
}
function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
async function main() {
  save({ status: 'starting', mode: forever ? 'forever' : 'bounded',
    deadline: forever ? null : new Date(deadline).toISOString(),
    episodesPerCycle: episodes, generationsPerCycle: generations,
    livePromoted: false, note: 'Selected training champion is NOT live game AI.' });
  if (fs.existsSync(stopFile)) return save({ status: 'stopped', reason: 'STOP file' });
  while (!stop && Date.now() < deadline && !fs.existsSync(stopFile)) {
    const disk = fs.statfsSync(root);
    if (disk.bavail * disk.bsize < lowDiskGiB * 1024 ** 3) {
      save({ status: 'paused', reason: 'low disk space' });
      await new Promise(resolve => setTimeout(resolve, 60000));
      continue;
    }
    const cycle = (state.cycles || 0) + 1;
    const dir = path.join(root, 'cycle-' + String(cycle).padStart(5, '0'));
    const seed = randomBytes(4).readUInt32LE(0);
    const champion = path.join(root, 'latest-model.json');
    const weights = path.join(root, 'latest-weights.npz');
    const incumbent = fs.existsSync(champion) ? champion : path.join(__dirname, '../dist/ai/trained-model.json');
    const env = { ...process.env, OPENBLAS_NUM_THREADS: '2', OMP_NUM_THREADS: '2',
      HAXLAB_SOURCE_MODEL: incumbent };
    if (fs.existsSync(champion) && fs.existsSync(weights)) env.HAXLAB_INITIAL_WEIGHTS = weights;
    else delete env.HAXLAB_INITIAL_WEIGHTS;
    save({ status: 'training', activeCycle: cycle, seed, incumbent, activeStage: 'self-play generation' });
    const trained = await run(process.execPath,
      ['training/haxlab_selfplay.cjs', dir, String(episodes), String(generations), String(seed)], env);
    if (stop || fs.existsSync(stopFile)) break;
    if (trained.code !== 0) throw Error('Training subprocess exited ' + trained.code + '/' + trained.signal);
    save({ status: 'evaluating', activeStage: 'side-swapped 4v4 neural league' });
    const leaguePath = path.join(dir, 'league.json');
    const evaluated = await run(process.execPath,
      ['training/league.cjs', path.join(dir, 'candidate.json'), incumbent,
        leaguePath, String((seed + 1000001) >>> 0), String(leagueFrames),
        path.join(dir, 'league-replays')], env);
    if (stop || fs.existsSync(stopFile)) break;
    if (evaluated.code !== 0) throw Error('League subprocess exited ' + evaluated.code + '/' + evaluated.signal);
    const league = read(leaguePath);
    const metrics = read(path.join(dir, 'weights/metrics.json')).untouched_test;
    const arena = read(path.join(dir, 'arena.json'));
    const team = read(path.join(dir, 'team-policy.json'));
    // The trusted league module is solely responsible for the promotion gate.
    if (league.schema !== 'fuckball-neural-league-v1' || typeof league.gate?.promoted !== 'boolean' ||
        !league.headToHead || !league.unfamiliarPartners) throw Error('Malformed league evaluation');
    if (league.gate.promoted) {
      // Preserve a few prior checkpoint JSON files for historical evaluation.
      const archive = path.join(root, 'champions');
      fs.mkdirSync(archive, { recursive: true });
      if (fs.existsSync(champion))
        copyAtomic(champion, path.join(archive, 'champion-' + String(state.bestGeneration || 0).padStart(5, '0') + '.json'));
      copyAtomic(path.join(dir, 'weights/model.npz'), weights);
      copyAtomic(path.join(dir, 'candidate.json'), champion);
    }
    const report = { cycle, seed, metrics, arena, teamPromoted: team.promoted,
      league: { candidateHash: league.candidateHash, incumbentHash: league.incumbentHash,
        headToHead: league.headToHead, unfamiliarPartners: league.unfamiliarPartners,
        gate: league.gate }, selectedForTraining: league.gate.promoted, livePromoted: false };
    const reportFile = path.join(root, 'cycle-' + cycle + '-report.json');
    fs.writeFileSync(reportFile + '.tmp', JSON.stringify(report, null, 2));
    fs.renameSync(reportFile + '.tmp', reportFile);
    save({ status: 'checkpointed', cycles: cycle, matches: (state.matches || 0) +
      episodes + league.games.length, generatedMatches: (state.generatedMatches || 0) + episodes,
      leagueMatches: (state.leagueMatches || 0) + league.games.length,
      lastCandidateAccepted: league.gate.promoted,
      championUpdates: (state.championUpdates || 0) + Number(league.gate.promoted),
      bestGeneration: league.gate.promoted ? cycle : (state.bestGeneration || 0),
      gateReasons: league.gate.reasons, leagueHeadToHead: league.headToHead,
      leagueUnfamiliarPartners: league.unfamiliarPartners,
      directionAccuracy: metrics.direction_accuracy, kickF1: metrics.kick_f1,
      activeStage: 'idle', livePromoted: false });
    // Checkpoints/reports/champion history survive; keep last two rollout datasets.
    for (const name of fs.readdirSync(root))
      if (/^cycle-\d{5}$/.test(name) && Number(name.slice(6)) < cycle - 1)
        fs.rmSync(path.join(root, name), { recursive: true, force: true });
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  save({ status: 'stopped', reason: stop ? 'signal' : fs.existsSync(stopFile) ? 'STOP file' : 'window completed',
    activeStage: null, livePromoted: false });
}
main().catch(error => {
  console.error(error);
  save({ status: 'failed', error: String(error.message || error), livePromoted: false });
  process.exitCode = 1;
}).finally(() => { if (locked) fs.rmSync(lock, { force: true }); });
