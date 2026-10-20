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

## Encrypted external offload and training continuity (21 Oct 2026)

The external archive is the mounted, encrypted `vpsarchive:zcloud-vps` crypt remote at
`/home/ubuntu/VPS-Archief` (approximately 5 TB free when configured). Its FUSE mount is
**read-only**, so the archival writers use `rclone` against the crypt remote **directly**;
trying to write to the mount path would fail.

- The persistent **user** systemd timer `fuckball-cold-archive.timer` runs every 15 minutes
  and starts `fuckball-cold-archive.service`. It executes
  `training/archive-old-cycles.sh` in this checkout.
- The archiver skips incomplete/current cycles and preserves the newest completed cycle,
  neural champion checkpoint, weights and reports. It bundles each older complete cycle
  into one remote `.tar`, reads back the encrypted remote object, and verifies full SHA256
  before deleting the local copy. Receipts are in
  `/opt/fuckball-training/archived-cycles.tsv` and
  `/home/ubuntu/zennay-cloud/fuckball-cold-archive-20261021.log`.
- Initial successfully verified offload: `cycle-00706` ->
  `vpsarchive:zcloud-vps/cold/Fuckball/training-cycles/cycle-00706-98a5ca79fc43e06f.tar`.
- The neural free-space reserve is configured in the active user unit as
  `Environment=HAXLAB_DISK_RESERVE_GIB=8` (backup:
  `~/.config/systemd/user/fuckball-ai-coach.service.bak-20261021-before-8gib-reserve`).
  With less space, small tactical-only evolution is the fallback until the separate
  5-GiB tactical safety floor. **No system can guarantee uninterrupted training if
  free disk falls below this floor or external storage becomes inaccessible.**
- A separate existing offload job is migrating the approximately 2.2-GiB old human
  replay shards to `vpsarchive:zcloud-vps/cold/Fuckball/human-replays-20261015/shards`.
  It will only remove local files after `rclone check --download` succeeds, preserving
  a symlink to the read-only external directory. For reboot resilience, the permanent
  but **not concurrently started** `fuckball-human-shards-resume.service` is enabled
  for next boot. Existing active transfer continues under
  `fuckball-human-shards-offload-20261021.service`. The human curriculum is not
  enabled until its feature/schema and usage requirements are addressed.

To restore an archived cycle manually without touching active training:

```bash
rclone copyto 'vpsarchive:zcloud-vps/cold/Fuckball/training-cycles/cycle-00706-98a5ca79fc43e06f.tar' /tmp/cycle-00706.tar
sha256sum /tmp/cycle-00706.tar  # compare to archive log's full digest before extraction
mkdir -p /tmp/fuckball-restored
# Inspect members and paths before extraction:
tar -tf /tmp/cycle-00706.tar | head -20
tar -C /tmp/fuckball-restored -xf /tmp/cycle-00706.tar
```

Do not restore archived older cycles directly over an active research directory.
