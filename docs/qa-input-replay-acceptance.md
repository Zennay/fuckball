# Speculative client input replay — issue #28

**Status (16 Oct 2026): product acceptance not achieved.** Physics parity tests compare two implementations of the *same inert speculative replay*. A green parity matrix does **not** prove own inputs influence prediction before the host replies.

## Execute

- `npm test`: standard known-green release suite, unchanged.
- `npm run test:input-replay-acceptance`: isolated RED-to-GREEN acceptance for issue #28, currently expected to report failures. Keep opt-in until implementation changes make both checks green; then promote it to the standard suite.

The two checks are independent so a failed direction test does not hide the failed speculative kick scenario:

1. **Movement:** extrapolating copied 60 Hz native BFF state with a rightward local input at frame 0 must diverge from idle extrapolation at 50, 100 and 200 ms, without mutating the authoritative input state. A matching direct `HBInit.setPlayerInput` + authoritative 12-tick step validates that this fixture is physically able to move.
2. **Kick:** a new speculative press near the stationary ball must predict a full native impulse, leave the original state unchanged, and be consistent with a real headless `setPlayerInput` kick. A spurious baby impulse cannot pass.

The test is intentionally outcome-based, **not** merely an assertion that `RoomState.Go` copied an input bit or that two inert extrapolators agree. It does not tune the native physics, change the BFF stadium, alter netcode behavior, activate deployment, or claim verified official HaxBall game feel.

## Additional readiness for resolution

- RED-to-GREEN with implementation change in the dedicated prediction product lane.
- Non-mutating extrapolation, no double kicks, release/repress callback consistency and no phantom goals.
- Compare side-by-side actual host snapshot reconciliation and browser input jitter at 0/50/100/200 ms, 60/120/144/240 Hz and peer-host fallback.
- Maintain authoritative native BFF 60 Hz stepping, existing input buffer clock and standalone physics recovery P0 #9.

## Per-horizon diagnostic refinement (16 Oct 2026)
The opt-in suite now reports separate RED/PASS results for 50, 100 and 200 ms native direction predictions instead of stopping after the first 50 ms failure; it also verifies that a future-stamped input cannot change physics *before* its frame and must change movement *after* its frame. Native authoritative comparisons and the independent fresh-kick pass remain intact. These outcome checks still do not gate `npm test` while issue #28 is unresolved.
