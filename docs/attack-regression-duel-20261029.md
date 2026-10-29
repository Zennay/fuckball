# Pinned native 4v4 attack-regression duel

Issue: [#360](https://github.com/Zennay/fuckball/issues/360).

This runner compares the experimental tactical policy that includes the attack-transition repair with the actual 19 October live policy, using the exact 19 October native engine. It is research-only: it never edits the production bundle, trainer checkpoints, live service, or champion pointer.

## Reproducible pins

- Candidate policy commit: ae54b5956d4018340f6142c54457c8d579a8cc95
- Incumbent live policy commit: 84f819633fad77ccdbeac1f5fe6b69374ce421d7
- Native engine/runtime commit: 84f819633fad77ccdbeac1f5fe6b69374ce421d7
- Policy source is loaded with git show and its Git blob SHA plus SHA-256 are included in the output.
- The engine runs in a temporary detached Git worktree; it is removed after the evidence file is written.

The evaluator requires the relevant Git history to be available. GitHub Actions checks out full history before invoking the runner.

## Commands

A bounded wiring smoke is four matches at 120 frames each:

    node training/attack-regression-duel.cjs --smoke --output /tmp/fuckball-attack-smoke.json

The full issue gate is 16 seeds × BFF/Classic × both candidate sides = 64 games at 2,400 frames each:

    node training/attack-regression-duel.cjs --output training/output/attack-regression-duel.json

A full run writes one JSON evidence file with every seed, stadium, candidate side, official engine score, outcome, actual kick counts, intended pass/shot actions at kick time, inferred physical receipts/interceptions, keeper first-touch outcomes, shot attempts/on-target estimates, and attacking-third ball-territory frames. Per-stadium and overall aggregates are included.

## Selection gate

The output only marks a candidate eligible for owner review if the run is complete and balanced, the incumbent and engine pins match the frozen live baseline, the candidate scores more than 55% match points, wins more games than it loses, has positive actual goal difference, and neither stadium has a match-point rate below 40% or goal difference below -4.

Passing the gate does not promote a model. It produces evidence for human review only. A smoke run, partial run, different incumbent, different engine, or incomplete match matrix cannot pass.

## Metric provenance

- **Authoritative:** final native-engine scoreboard and actual kick callbacks.
- **Observed-inferred:** pass completion/interception and keeper first-touch outcomes, inferred from new player contact plus ball-velocity impulse. These are not official possession events.
- **Observed-inferred shot target:** an actual goal or observed ball crossing the target goal mouth after a recorded shot/bank-intent kick.
- **Territory proxy:** frames with the ball in the attacking third. This is ball territory, not team possession.
- **Unavailable:** any causal possession or expected-goals claim not supported by the runtime evidence is deliberately omitted.

The script is an offline evaluator, not a production deployment path. Do not change the live policy or close #360 merely because the runner or CI succeeds; the recorded match outcomes must pass the independent balanced gate.
