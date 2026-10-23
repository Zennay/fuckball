# Fuckball 4v4 tactical measurement: native event scorecard

Issue: [#356](https://github.com/Zennay/fuckball/issues/356). This is **measurement**, not neural training or an AI promotion procedure. Original physics, live rooms, game speed and online matchmaking are untouched. The research runner is independent of ongoing source owners [#354](https://github.com/Zennay/fuckball/pull/354) and [#355](https://github.com/Zennay/fuckball/pull/355).

## Reproducible offline runner
```sh
node training/tactical-scorecard-runner.cjs 1200 training/output/tactical-scorecard.json
node training/tactical-scorecard-runner.cjs 3600 training/output/tactical-scorecard.json training/output/candidate-profile.json
```

This creates four side-swapped native-engine 4v4 contests (BFF and Classic, one each candidate side). The fixed default policy remains the opponent. Profile arguments are research-only; no file in `dist/` is changed and the runner never deploys or promotes. Every goal in the main aggregate comes from the **engine scoreboard**, not projected shots. Native engine kick and goal events are separately counted for provenance comparison.

## Implemented metrics
- Pass attempts and physical first-receipt: observed planned delivery at real engine kick; fresh proximity **plus ball-velocity impulse** for inferred receptions; target reception vs interception vs unresolved, never infer success from a hypothetical pass.
- Pressure-adjusted and target-specific completion, geometric lane margin and risk-bin calibration (open, contested, blocked), progressive successful receptions, safe backward recycle, timed moving through-balls, successive physical-contact A-B-A one-twos, estimated local 2v1 leverage.
- First keeper-distribution outcome and costly clearance, pressure on keeper at kick, planned wall-bank attempts vs side-wall contact and friendly recovery.
- Defensive 4v4 shape: one outfield presser, two distinct goal-side man-markers and goalkeeper anchoring the goal, unmarked high-risk receivers, estimated blocked receiver lanes, ticks to regain shape after losing the last verified kickoff-team possession.
- Off-ball support paths, triangular spacing, role-switch rate, inferred shot-selection regret where an obvious safely progressing teammate existed, biggest-kicker share, human partner presence.
- Team and per-side native kicks/goals. Missing unsupported metrics are explicitly `null` (never deceptive zero success on no attempts). Each derived value is annotated with evidence provenance; official possession retention, causal rocket advantage and true counterfactual shot regret are **not** claimed.

## Data reliability
- **Authoritative** = actual engine kick or goal callback and actual engine scoreboard.
- **Observed-inferred** = ball-radius contact combined with impulse; physical contact inference can undercount when there is no observable impulse.
- **Estimated** = pitch geometry, role/tracking heuristics, or planned candidate trajectories. This is not real xG, authoritative possession or pass denial.
- **Unavailable** = no safe evidence in that native offline match; displayed as `null`, not as an invented percentage.
- Only compare data across adequate sample sizes; tiny four-game samples reveal instrumentation, **not** model superiority. Do not reward trivial sideways passes or optimize these counters in isolation; native goals/points and independent held-out opponents remain the decisive selection signals.

## Operations
Read-only isolated VPS smoke evidence: 4 native games at 120 frames completed and wrote a scorecard; defensive spacing and off-ball support measures were emitted. A longer low-priority probe collided with the heavily-loaded VPS and was terminated by timeout. Do **not** run concurrent large evaluations while the persistent trainer, HaxLab trainer and other shared workloads are busy. Existing continuous training continues unmodified.

Before release/merging use established GitHub PR checks and safe owner gates. This runner is not a production deploy path.
