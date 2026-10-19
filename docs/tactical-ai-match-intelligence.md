# Fuckball: measured match intelligence and tactical/HaxLab fusion

## What runs where
- Native 60 Hz physics and human input have not been changed.
- The default match bot is deterministic tactical option-search, not an unproven neural policy.
- HaxLab evolves neural imitation checkpoints separately. Its tactical profile self-play is a safer way to improve the proven bot: a new tactical checkpoint must first win simulated matches on both sides and both stadiums (see PR #354).

## Tactical decisions
- **Passes:** Simulate first-receiver reach against the nearest defender using the same ball damping, kick impulse, collisions envelope and wall reflections as the match engine. Favor passes with an adequate first-receipt margin; penalize likely interceptions. Available teammates and a local 2-v-1 overload can improve the decision, but safe progression and goals still dominate.
- **Finishing:** Search shot openings and two deliberate side-wall bank paths using an actual physics rollout. Rocket/bank candidates must beat ordinary kicks on simulated value; the bot does not wall-kick at random.
- **Keeper distribution:** Get behind a favorable passing/clearance normal, require the actual contact trajectory not to produce an immediate avoidable turnover, and retain rapid direct clearance when opponents are behind the ball. Predicted bank-shot arrivals replace straight-line-only goalkeeping.
- **Defending:** The goalkeeper guards the last line. In 4v4, one outfielder presses the ball while two different outfielders man-mark separate dangerous opponents goal-side. Supporting players still find open pockets in possession.
- **Training situations:** Nine canonical scenes cycle through ordinary openings, high pressing, keeper clearances, two attackers versus one defender, through balls, retreating/back passes, side-wall rebounds, and coordinated marking. These scenes enrich candidate generation; independent ordinary kickoff games determine acceptance.

## Measurements and their trust levels

| Statistic | Source | Interpretation |
|---|---|---|
| Goals for/against | Authoritative engine scoreboard | Exact native match result |
| Kick events | Authoritative native `onPlayerBallKick` | Exact kicks, not inferred from input |
| Pass attempts | Recorded planned pass at a **real kick** | Tactical bot intent, not any random ball movement |
| Pass completed | First subsequent teammate **physical touch**, observed as fresh collision-radius proximity plus a ball-velocity impulse | Conservative inferred reception; no promise of perfect event tracing |
| Completed to target | First recipient matches the originally planned teammate | Stronger signal than completion to any teammate |
| Pass intercepted | First subsequent *opponent* physical touch or kick | A lost planned delivery |
| Pass missed | No observed receipt before 180 ticks or a later incompatible kick | Includes unresolved/inconclusive receptions |
| Shot attempts | Actual kick + attacking shot intent | Does not count speculative planned shots that were never kicked |
| Projected on target | Candidate physics rollout predicts goal-line entry | Prediction, not confirmed on-target event |
| Shot conversion | Goal after a recorded shot attempt within bounded horizon | Approximation; actual goals remain authoritative |
| Keeper clearances | Actual keeper kick | Decisions acted upon, not imagined options |
| Keeper distribution completed | First teammate receipt following keeper kick | Useful team-possession continuation |
| Keeper turnover | Opponent first receipt after intended keeper pass | Recoverable keeper-choice error |
| Keeper saves | Defensive goal-mouth touch on an active opposing attempt | Proximity/impulse based, not official tracked saves |

`BallTelemetry` is used by the native headless evolutionary simulation, not by the public server or an untrusted browser. `match(...)` returns `events` and `opponentEvents`. The tactical candidate fitness now rewards a **bounded** number of completions and quality shots, penalizes immediate interceptions and keeper turnovers, and gives a goal differential one hundred times the weight of a single possession proxy. Passing the ball repeatedly without attacking cannot outrank a team that genuinely scores more.

### Remaining shortcomings
- The current engine has no authoritative pass-receipt callback. Physical impulses can undercount low-energy receptions or mistake a close simultaneous touch. Treat pass percentages as training diagnostics until a native collision event hook exists.
- On-target shot prediction is physics-derived, not calibrated xG. A later improvement should reconstruct actual shot trajectory and block/contact chain, including several bounces.
- Only ordinary side-swapped closed-loop matches determine release eligibility; no isolated HaxLab imitation score is proof of an elite opponent.
- No research checkpoint in these changes updates the live bot. Release requires clean existing CI, representative matches, rollback capability and a separate safe production deploy.
