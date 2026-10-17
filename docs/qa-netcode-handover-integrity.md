# Input timeline handover integrity — QA 16 Oct 2026

The input timeline acknowledges frames using **unsigned 32-bit** sequence numbers (native WebSocket snapshots write `Uint32`), but the migration import decoded `lastSeq` and `appliedSeq` using signed `|0`, turning numbers at or above 2147483648 negative.

## Regression and narrow fix
- `tests/netcode-handover-integrity.cjs`: 32 deterministic seeded streams × 240 frames = 7,680 comparisons; out-of-order packet batches, duplicates, invalid inputs, late stamps, one-frame kick bits, and JSON export/import on a seven-frame cycle. Compares complete timeline snapshots after each frame with uninterrupted baseline.
- Boundary regression exercises IDs 2147483646, 2147483647, 2147483648 and 4294967294, then confirms a duplicate high-bit input cannot be rescheduled after host handover and ID 4294967295 can be acknowledged once.
- Minimal fix in `dist/netcode.js`: decode serialized `lastSeq` and `appliedSeq` with unsigned `>>>0` rather than signed `|0`. This does **not** change input delivery time, tick rate, kick physics, interpolation or hosting election.
- Registered test in `npm test`; must pass core, app and real Chromium integration before merge.

**Scope:** protects serialized migration state and replay integrity. It does not resolve [#28](https://github.com/Zennay/fuckball/issues/28) inert speculative prediction or [#31](https://github.com/Zennay/fuckball/issues/31) 4v4 over-cap. Source recovery and live gameplay feel remain tracked separately in [#9](https://github.com/Zennay/fuckball/issues/9). No deployment.
