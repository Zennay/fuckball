# Strong Oct 19 live AI as the frozen tactical training baseline

## Why the training base was changed

On 20 Oct 2026, a genuine 64-game, 4v4, side-swapped comparison of the experimental policy `f75c21921661f8a69543f2731da24797c34974aa` against the live Oct 19 policy `84f819633fad77ccdbeac1f5fe6b69374ce421d7` resulted in 4W/42D/18L, 4–23 goals and 1044–1319 kicks from the experimental policy's perspective. Both BFF and Classic stadiums were represented evenly, both sides used the exact same seeds, each game lasted 2400 native frames. Archive: `/home/ubuntu/zennay-cloud/fuckball-head-to-head-20261020.json`; tracking issue #360.

The experimental strategy is therefore **not an appropriate tactical starting point**. This training-only checkout restores `dist/ai/policy.js` **byte-for-byte** from the immutable, deployed Oct 19 release. SHA256: `ff4694172a891c787fd6e4f5222803bd4731c409afbea6a98cdc4fbc3e85f933`.

## Operating behavior

- The tactical baseline is the Oct 19 live policy, with its 5 supported profile values: `support`, `spread`, `cover`, `press`, `screen`. Experimental 10-parameter values must not silently replace the live baseline.
- Other training-support files (low-disk loop, independent champion gate, native engine driver and telemetry) are retained, without switching the policy back to the failed experimental option search.
- The trainer keeps existing `/opt/fuckball-training` neural checkpoints (707 cycles when switched), historical data and research artifacts; `latest-team-profile.json` is research-only.
- On low disk, the tactical-only league can run while the expensive neural rollout remains behind its 10 GiB free reserve.
- New tactical profiles are candidates, not live champions. Their side-swapped football outcomes must beat the incumbent and a fixed default. Never promote based on imitation accuracy, touches, or mere training cycles.
- Do not change the actual public server, physics, player velocities, or live champion from this branch.

## Deployment provenance and rollback

The user systemd unit `fuckball-ai-coach.service` now starts this training-only checkout, not the experimental PR #359 checkout. Original unit backed up at `~/.config/systemd/user/fuckball-ai-coach.service.bak-20261020-before-live-strong-baseline`.

Public gameplay continues on the separate immutable `/opt/fuckball-releases/84f819633fad77ccdbeac1f5fe6b69374ce421d7-39214993688` process; research does not change it.

If a future candidate beats this strong baseline in an independent, paired, football-based league, integrate that change into a fresh candidate branch, run the existing release gates and explicitly authorize a production deployment. Keep this old model frozen as a permanent benchmark; do not replace it by simply merging #355/#359.
