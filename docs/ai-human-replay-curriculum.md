# Fuckball human replay curriculum — operator contract

> Source-only until merged and safely installed in a **separate research checkout**; no live model, gameplay physics or replay is modified.

## What the VPS evidence establishes (20 Oct 2026)

- Existing continuous Fuckball research has completed at least 693 candidate cycles and its latest retained provenance says `enabled:false`, `humanShards:0`.
- An independent `/home/ubuntu/fuckball-human/data` human index is present: 7,265 training rows but only 2,700 distinct replay SHAs/shard paths, 337 distinct validation replays and 338 distinct test replays.
- The original input reader rejected repeated **identical** training rows as fatal split leakage, and human replay sharded features lack the optional tm3/op4 player slots and score difference required by the current generated 4v4 teacher format.
- HaxLab's separately managed generation loop already trains from its own human-imitation manifest and never implies the Fuckball tactical AI is live-updated.

## New conversion at the training boundary

`training/human_mix.cjs` now:
1. Requires explicit rights/recording authorization: `HAXLAB_HUMAN_RIGHTS_CONFIRMED=yes` **and** a configured `HAXLAB_HUMAN_DATA=/path/to/approved/index`. The mere presence of a replay file does not imply training rights. Do not set this flag without operator verification of capture rights, retention/privacy and relevant licenses/consent.
2. Deduplicates **identical** entries within a split by source SHA, while rejecting conflicting duplicates or any SHA crossing train/validation/test; reads only regular sharded files.
3. Filters to BFF Big v4, BFF Classic v3 and Classic demonstrations, excluding 7v7/unrelated stadiums from the native 4v4 imitation sample.
4. Rotates selections by deterministic hash of replay SHA and cycle number, rather than always taking the first 64 alphanumerically. Reserves up to 25% of the cap for compatible Classic examples, reducing BFF-only overfitting; default cap 64 remains resource-bounded.
5. Converts selected source `.f32.gz` shards into the exact generated sample schema, respecting column names and labels. **Only** missing optional `tm3_*`, `op4_*` and `score_diff` may be zero-imputed; all other missing fields, nonfinite floats and malformed metadata fail closed.
6. Writes temporary normalized shards *inside that research cycle*, not the original replay/source folders. Training retains the last two rollout datasets, so this creates no permanent replay copies. Validation/test remains untouched and is not fed to training.
7. Writes counts, eligible maps, selected 4v4 demonstrations, deduplicated rows and conversion policy to `human-data-provenance.json`.

## Reading outcome and avoiding false success

```sh
node training/learning-progress.cjs /opt/fuckball-training
```

Reports 20/100-cycle trends, last challenger result against incumbent and unfamiliar-partner games, kick F1, direction accuracy, live-promotion flag, available disk and last retained human replay provenance. A 0.6 score rate against an **evolving** incumbent is not a 60% win rate against elite humans. Replays train imitation ability; improvement still requires side-swapped held-out 4v4 competition and a nonregression champion gate.

## Overnight operational limits
- The actual VPS research loop already runs `forever` in a dedicated checkout; do **not** run another heavyweight continuous loop or replace its checkout mid-cycle.
- Machine was at ~87% disk used, very high load and nearly full swap. Keep its existing disk-reserve pause and no-concurrent-trainer lock. This source change is not automatically in the live daemon; integration at an approved cycle boundary comes only after required GitHub checks.
- No claim that all 2,700 unique train replays have been used: each authorized cycle will sample a bounded rotating subset.
