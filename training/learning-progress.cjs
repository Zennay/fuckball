'use strict';
// Read-only evidence report for an unattended tactical/NN training run.
// A high imitation score does not imply a strong match policy.
const fs = require('node:fs');
const path = require('node:path');
function safeRead(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { return null; }
}
function mean(values) {
  const nums = values.filter(x => typeof x === 'number' && Number.isFinite(x));
  return nums.length ? Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(5)) : null;
}
function summarize(rows) {
  const valid = rows.filter(x => x.report?.league?.headToHead && x.report?.league?.gate);
  const accepted = valid.filter(x => x.report.league.gate.promoted);
  const distributions = rows.map(x => x.report?.metrics);
  const score = type => mean(valid.map(x => x.report.league[type]?.scoreRate));
  return {
    cycles: rows.length, completeLeagueReports: valid.length, trainingAccepted: accepted.length,
    acceptanceRate: valid.length ? Number((accepted.length / valid.length).toFixed(4)) : null,
    neuralVsIncumbentScoreRate: score('headToHead'),
    unfamiliarPartnerScoreRate: score('unfamiliarPartners'),
    neuralVsIncumbentGoalDifference: valid.reduce((a, b) =>
      a + (Number(b.report.league.headToHead.goalDifference) || 0), 0),
    directionAccuracy: mean(distributions.map(x => x?.direction_accuracy)),
    kickF1: mean(distributions.map(x => x?.kick_f1)),
    // Model-only 4-game diagnostic is too small for promotion evidence.
    arenaSampledWins: rows.reduce((a, x) => a + (x.report?.arena?.matches || []).filter(
      m => m.model_goals > m.tactical_goals).length, 0),
    arenaSampledGames: rows.reduce((a, x) => a + (x.report?.arena?.matches?.length || 0), 0)
  };
}
function report(root) {
  const dir = path.resolve(root);
  const status = safeRead(path.join(dir, 'status.json'));
  if (!status) throw Error('Missing persisted training status at ' + dir);
  const files = fs.readdirSync(dir).filter(x => /^cycle-[0-9]+-report\.json$/.test(x));
  const rows = files.map(name => {
    const file = path.join(dir, name);
    const number = Number(name.match(/^cycle-([0-9]+)/)[1]);
    return { number, report: safeRead(file), recordedAt: fs.statSync(file).mtime.toISOString() };
  }).filter(x => x.report && x.report.cycle === x.number)
    .sort((a, b) => a.number - b.number);
  const last = rows.at(-1), provenancePath = last &&
    path.join(dir, 'cycle-' + String(last.number).padStart(5, '0'),
      'human-data-provenance.json');
  const provenance = provenancePath && safeRead(provenancePath);
  const disk = fs.statfsSync(dir);
  const freeGiB = Number((disk.bavail * disk.bsize / 1024 ** 3).toFixed(2));
  const recent = n => summarize(rows.slice(-n));
  const warnings = [];
  if (freeGiB < 12) warnings.push('Low available disk; do not increase parallel workloads or remove reserve.');
  if (status.status === 'paused') warnings.push('Trainer reports paused: ' + status.reason);
  if (status.status === 'failed') warnings.push('Trainer failed: ' + status.error);
  if (last?.report?.arena?.matches?.length &&
      !last.report.arena.matches.some(x => x.model_goals > x.tactical_goals))
    warnings.push('Newest neural candidate won zero games in its tiny tactical arena; no live-quality claim.');
  if (provenance?.enabled === false) warnings.push('Last retained cycle used zero human replay shards.');
  if (!provenance) warnings.push('Per-cycle human replay provenance not retained for the latest cycle.');
  const lastGate = last?.report?.league?.gate;
  const live = status.livePromoted === true;
  if (live) warnings.push('Status says livePromoted; verify independently via deployed health SHA.');
  return {
    schema: 'fuckball-learning-evidence-v1', generatedAt: new Date().toISOString(),
    source: dir, status: {
      status: status.status, stage: status.activeStage || null, cycleInProgress: status.activeCycle,
      completedCycles: status.cycles, generatedMatches: status.generatedMatches,
      leagueMatches: status.leagueMatches, totalReportedMatches: status.matches,
      acceptedTrainingChampions: status.championUpdates, livePromoted: live,
      lastUpdatedAt: status.updatedAt, freeDiskGiB: freeGiB
    },
    windows: { last20: recent(20), last100: recent(100), all: summarize(rows) },
    latestCompleted: last ? {
      cycle: last.number, recordedAt: last.recordedAt,
      candidateAcceptedForTraining: lastGate?.promoted ?? null,
      gateReasons: lastGate?.reasons ?? [],
      headToHead: last.report?.league?.headToHead ?? null,
      unfamiliarPartners: last.report?.league?.unfamiliarPartners ?? null,
      imitation: last.report?.metrics || null,
      arena: last.report?.arena?.matches || []
    } : null,
    humanReplayEvidence: provenance ? {
      enabled: provenance.enabled, shardsUsed: provenance.humanShards || 0,
      eligibleTrainReplays: provenance.humanUniqueTrainReplays ?? null,
      validationReplays: provenance.humanValidationReplays ?? null,
      testReplays: provenance.humanTestReplays ?? null,
      rightsGate: provenance.rightsGate || null
    } : null,
    warnings,
    limitations: 'Training-only candidates; arena samples and successive incumbents are not fixed-human win rates. Holdout and public deploy require independent proof.'
  };
}
if (require.main === module) {
  try { console.log(JSON.stringify(report(process.argv[2] || 'training/output/continuous'), null, 2)); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { report, summarize };
