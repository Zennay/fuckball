# External neural rollout storage

## Why

On 20 October 2026 the production VPS root filesystem was 95% occupied (5.7 GiB free). Its verified external mount `/home/ubuntu/VPS-Archief` has 5 TB capacity and was approximately 1% occupied. Training currently needs a conservative 10 GiB reserve for full neural rollout datasets, so lack of *root* free space downgrades to tactical-only evolution.

## New behavior (only after research-service rollout)

- `training/continuous.cjs` detects a **separate device** mounted at `/home/ubuntu/VPS-Archief` and stores **future disposable per-cycle neural shards, learned weights and independent match replays** at `<mount>/fuckball-training/<12-char-hash-of-original-root>/cycles/cycle-NNNNN`.
- Existing main training root remains the owner of single-process `trainer.lock`, `STOP`, `status.json`, long-term models, trusted weights, latest tactical champion, historical match reports and training champion archive.
- External scratch gets the 10 GiB training reserve check. The internal root still needs at least 2 GiB for checkpoint/status/log headroom.
- `HAXLAB_EXTERNAL_MOUNT` overrides the mount; `HAXLAB_CYCLE_SCRATCH` selects an explicit descendant of the verified external mount. If explicitly configured and missing/unmounted/unwritable, training **fails closed** before taking the trainer lock. With the automatic default, missing/unusable archive falls back to the old internal 10 GiB check and tactical-only training.
- Only old `cycle-00000` directories are cleaned, after a completed checkpoint, in either current scratch or legacy local root. The last two cycle datasets, persistent model/checkpoint evidence, raw human replay source, STOP file, production serving and original training lock remain untouched.
- Research service status includes `cycleScratch` and `externalCycleStorage` for confirming which filesystem actually owns new data.

**Not a migration of historic files:** existing human replay archives and already-generated checkpoints are not moved. There is no production restart or activation in this source PR. It must first integrate with PR #359 and be deployed at a safe trainer-cycle boundary by the authorized service owner.

## Safety and release

No training policy weights, AI gameplay bundle, match physics, human-data permissions or live champion pointer are changed. Neither model quality nor win rate can be inferred from the amount of stored training data.
