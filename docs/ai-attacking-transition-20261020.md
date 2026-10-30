# Attacking-transition regression fix — research policy only

Issue: https://github.com/Zennay/fuckball/issues/360

## Evidence and failure mode
The new tactical policy lost 18 of 64 paired native 4v4 matches against the Oct 19 live champion, winning only four (4–23 goals). This update does **not** claim a proven win-rate improvement. It targets two identifiable reasons the experimental policy can stop attacking.

1. **False defensive state.** Previously, simply seeing the ball inside our own half, without a player in immediate carrying range, committed two non-chasers to goal-side man-marking. This could happen even when our chaser had the earlier physics-derived interception. The new role switch compares **both teams' earliest reachable touch** before marking. One player remains lead presser/chaser; when our team should reach the ball first, receivers regain forward support.
2. **No-progress ball retention.** A policy waiting for a perfect kick can deny actual forward contact indefinitely. The attacking carrier remembers meaningful forward progress and, after 105 native ticks without it in the attacking half, discounts holding. During pressure or a stall, an immediate real-contact rollout may authorize a forward kick **only** if it does not enter our own goal and its assessed field value is above -0.25.

All ball/player physics, speed, goalkeeper risk checks, training weights, stadiums and production champion pointers are unchanged.

## Integration safety
- Change is stacked on the research source branch from #355; do **not** cherry-pick directly into live `main` without branch reconciliation.
- HaxLab neural checkpoint and tactical champion promotions are independent. No new model has been promoted.
- Before any deployment, use the existing balanced native game evidence against the immutable Oct 19 champion `84f819633fad77ccdbeac1f5fe6b69374ce421d7`, in **both** BFF and Classic with mirrored sides and identical seeds. Report wins/draws/losses, goals, kicks, goalkeeper turnovers and completed receptions, and reject if goals or wins regress.
- Performance of this proposed fix remains **unmeasured** at commit time. Do not infer live improvement from code review or trainer acceptance.
