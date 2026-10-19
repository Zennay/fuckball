# Fresh Custom Room admission across peer-host migration

The Fuckball game simulation can temporarily run on a player's selected browser host while a **trusted central control-plane server** continues to own room identity, admissions and the optional private room access key. When a fresh participant arrives, the control plane may enqueue the socket and reclaim simulation authority before creating the new native player. A host can change admission settings while the handover is pending.

To avoid treating an old access decision as irrevocable authority, the original native join now records **only a non-secret access-key revision**, not the key itself, after the ordinary current-room approval. Immediately before actually allocating the player socket/native ID after the peer-host handover, the control plane rechecks:
- whether the room has been locked, filled or banned the visitor;
- whether current signed-in / Club restrictions still admit this user;
- whether the room's access-key revision is **exactly** the revision originally verified when the fresh join arrived.

If a host rotates/removes/sets a key during the transition, the waiting participant is rejected with a clear error and must rejoin with the new policy. This avoids a stale verified secret becoming an admission bypass. The check is done before native game player creation or any new room team/score/physics mutation. The server does not retain or forward the original plaintext key in the pending socket queue.

A valid, previously admitted player with a genuine original reconnect ticket uses the existing reserved-slot rejoin route; that route does not require a fresh access key and is not interrupted by normal secret rotations. Human-only Quick Match keeps its separate secure matchmaking admission and skips Custom Room controls. No peer host gains access rights. Existing player positions, rematch consent, scores, physics, room IDs and replay data remain unchanged.

No manual QA/test/regression suites were written or run. Existing mandatory exact-head CI, independent review, protected-main and authorized live game-VPS deployment/drain/rollback requirements remain unchanged; GitHub source changes do not establish that production was deployed.
