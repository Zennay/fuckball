# Fuckball autonomous 4v4 AI research league

Research specification — 2026-10-15. This is **not** proof of superhuman performance. Native physics and live game deployment are not changed.

## Mission

Ultimately outperform the very best human 4v4 squads on their best days, while cooperating naturally with unfamiliar real-player teammates. Passing lanes, off-ball support, covering runs, wall play, screens and occasional double kicks / wall rockets matter more than maximizing ball touches.

## Autonomous training implementation

- Existing headless engine simulates actual eight-player 60 Hz matches and produces HBR2 replays.
- Existing tactical evolution + human-imitation trainer creates a new candidate and independent train/validation/test splits.
- Training league plays eight candidate-vs-incumbent 4v4 matches: BFF Big v4 and Classic, two seeds per stadium, both team sides. HBR2 evaluation replays saved.
- Four additional mixed-partner matches use frozen tactical teammates for two of four slots on each side. This tests transfer to unfamiliar **bot** teammates, not real-human compatibility.
- A candidate becomes the **training-only** latest checkpoint if it beats incumbent with sufficient match score and goal difference, does not regress in mixed-partner trials and has non-collapsed spacing and activity. Rejections leave the incumbent unchanged.
- Repeats on fresh seeds; 'forever' mode runs until a STOP file, signal, low disk safety pause or failure. Outcomes, seeds, checks and selected checkpoint are recorded. No automatic live model promotion or gameplay deployment.

## Start, stop, status

Command: node training/continuous.cjs /opt/fuckball-league-training forever

Status: /opt/fuckball-league-training/status.json

Stop after current batch: touch /opt/fuckball-league-training/STOP

Configuration: HAXLAB_EPISODES (default 192, range 6-200); HAXLAB_GENERATIONS (10, 1-20); HAXLAB_LEAGUE_FRAMES (2400, 300-18000); HAXLAB_DISK_RESERVE_GIB (10, 2-1000).

Systemd should start automatically on boot, restart failures with rate limits, cap CPU 200% and memory 3GB, lower scheduling priority, and prevent overlapping trainers with a PID lock. Run from a versioned checkout **separate from /opt/fuckball**, preserving Work-session game files and physics issue #9. Deployment is independent from frozen zCloud deploy-fuckball.yml.

## Using authorized human replays

Import legitimately obtained HBR2 files with the existing training/import_replays.cjs command; verify recording rights, privacy and consent. The importer separates whole replay files into train/validation/test. Set HAXLAB_HUMAN_DATA to its output folder. Optional HAXLAB_HUMAN_MAX_SHARDS defaults to 64. Human train shards can be mixed into each new candidate cycle; human heldout validation/test shards must stay isolated, and duplicate source hashes across splits fail closed.

## Tactics and measurement

Current native tactical AI already assigns an interceptor, keeper, passing support, defensive cover and conditional screen, and its neural state features include positions/velocities of nearby teammates and opponents. The challenger league adds goal differential, team pair spacing, cover-rate proxy, distinct kickers and consecutive teammate-kick chains. **Kick-chain metric is only a passing proxy**; it cannot distinguish every real pass from an accidental collision. Do not reward this proxy alone.

Research roadmap:
1. Recover ball touches/receivers from authoritative physics to label real passes, dangerous passes and expected possession value.
2. Train learned role handoffs and off-ball spacing across attack/defense phases, with counter-reward for redundant ball chasing.
3. Add curriculum for wall banks, passing triangles, double kicks, decoy runs and legal player screens, all using real physics and cooldowns.
4. Move beyond tactical imitation to multi-agent reinforcement learning/policy optimization with a historical champion pool and opponent diversity.
5. Train and test mixed teams of independent bot versions, then study authorized human replay behavior and explicit human partner-play evaluations.
6. Freeze independent Arena seeds and opponents, require performance confidence intervals, holdout quality and safety gates; champion changes must never silently mutate the live game.
7. Only call it **better than elite humans** after blinded independent 4v4 series against top human squads, on their preferred stadiums and in peak lineups across fair latency conditions.

Current 8+4 league gate is an initial checkpoint filter, not a statistically rigorous proof. More complex AI will need more computing than the initial 2-CPU quota.
## Tactical AI learns from HaxLab's self-play (training-only)

The fixed rule-based bot and the neural model have different promotion tracks. HaxLab's neural imitation weights are **not** suitable for direct live replacement: a model may score well on replay actions and still lose closed-loop matches. Instead, the training loop now feeds its evolutionary **tactical team profiles** into a durable, independent tactical ladder.

Every completed HaxLab cycle can:
1. Warm-start tactical profile evolution from `latest-team-profile.json`, if there is a previously accepted training-only champion.
2. Produce `team-policy.json` with five tactical parameters: support distance, spread, defensive cover, pressure range and screening distance.
3. Compare an evolved candidate against the current tactical checkpoint, using **16 fresh, side-swapped native 4v4 games** (BFF and Classic, four seeds and both sides); after a checkpoint exists, also compare against the frozen original default profile in 16 further games.
4. Accept the candidate only if evolution itself selected it, incumbent comparison has at least **56.25% match score**, **+2 goal differential** and more wins than losses, and the frozen default profile is not regressed (at least 50% match score and nonnegative goal difference).
5. Persist a versioned `latest-team-profile.json` for the **next research cycle** and a separate per-cycle `tactical-league.json` receipt. A rejection leaves the current tactical champion untouched.

The tactical report is included in each `cycle-N-report.json` and the research `status.json` as `tacticalChampionUpdates`, `lastTacticalCandidateAccepted`, `tacticalScoreRate`, `tacticalGoalDifference` and `tacticalGateReasons`. The neural league still chooses neural training checkpoints separately. These small deterministic leagues provide selection evidence only, **not** reliable human-strength estimates.

**There is no live tactical AI promotion here.** In particular, these scripts do not update `dist/ai/policy.js`, `trained-model.json`, the deployed release or online matches. The live default remains the independently measured tactical option-search policy. To use a selected research profile in production, run a larger independent frozen comparison and complete the normal explicit release process. Changes in neural accuracy cannot by themselves trigger a tactical promotion.

Training-only manual invocation:

```sh
node training/tactical-champion.cjs training/output/cycle-00001/team-policy.json \
  training/output/latest-team-profile.json training/output/cycle-00001/tactical-league.json \
  20261020 2400
```

This evaluation complements, rather than replaces, the neural promotion gates and does not run any QA suite.
