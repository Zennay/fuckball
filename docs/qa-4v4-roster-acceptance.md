# 4v4 active-roster acceptance — issue #31

Status: **known RED against main (16 Oct 2026)**. The current join implementation in `dist/room-core.js` adds each new human directly to red or blue, and `tests/room-capacity.cjs` intentionally asserts that all 21 joined humans are active. The current passing capacity smoke is **not** evidence of compliant four-a-side rooms.

## Execute

- `npm test` — existing release regressions, deliberately unchanged. This command must remain green during separate product implementation.
- `npm run test:roster-acceptance` — standalone forward-looking acceptance, **expected to fail** at the first 12-person roster assertion until issue #31 is implemented. Do not suppress its failure or silently mark it as passed.
- Once the server enforces active slots and bench/spectator admission, run this test on CI and then include it in the normal core suite; replace the now-contradictory "21 active" invariant in `tests/room-capacity.cjs` while keeping the 21-client connection test.

## Acceptance covered by the executable gate

1. Twelve simultaneous human identities join via one stable room ID, and every socket remains connected.
2. Four active red, four active blue, four inactive humans; never an extra active player.
3. A thirteenth attendee joins successfully as an inactive spectator with the same room ID and unchanged owner.
4. A spectator cannot spoof owner/captain permissions through a raw WebSocket team command to promote themselves.

## Still required before #31 is complete

- Distinguish team-specific bench from generic spectator in the public protocol/UI and validate the distinction with explicit role assertions.
- Implement server-side roster-ownership and captain-specific team authority; incoming substitute consent; forbid stale, duplicated and concurrent substitutions; maintain eight active slots at all times.
- Apply substitutions only at permitted server-controlled stoppages. Assert preserved score, game clock, room ID and socket connections.
- Track playing-time and goal/event attribution only while a user is actively on the pitch; bench and spectator time are excluded.
- Exercise disconnect/rejoin, bot occupancy, peer-host takeover and owner succession with a full room.
- Run latency/prediction + browser checks at 0/50/100/200 ms, then real side-by-side HaxBall feel validation for the separately tracked physics work.

**Ownership boundary:** This branch is QA-only; it makes no runtime, engine, stadium, physics, deployment, or permission changes. Issue #31 is a product feature gap and must stay open while this gate is red.
