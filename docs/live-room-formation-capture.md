# Capture live Custom Room positions into Formation Studio

While connected to a genuine, non-Quick-Match native Custom Room, open **Match menu → Room → LIVE FORMATION CAPTURE**. When four Red and four Blue on-pitch players have actual disc positions, the button becomes available.

1. Choose **Capture native 4v4 positions** and explicitly confirm the private save.
2. The eight actual local-client-observed player-disc positions are normalized to the existing 1000×1000 tactics board using the native stadium half-width and half-height, and stored in stable per-side slot order.
3. A **new** private Formation Studio plan is created. Open Formation Studio on Home to move discs, sketch passing arrows, export an optional PNG or JSON, or delete the plan.

**No player name, account, room ID, chat, token, live score or server ranking is copied to the plan.** Only integer disc positions are stored; the ball marker is deliberately reset to the centre because native ball identity is not guaranteed in every host transport. Full native teams and connected player discs are required. If the match or roster changes before confirmation, a fresh snapshot is taken; no background imports or hidden page actions occur.

This is a personal drawing of the latest locally received native snapshot, **not** a verified league lineup, signed referee receipt, replay recording or input to the real room. The original physics, server room, bot AI and accepted substitution permissions are untouched. The importing Formation Studio validates the immutable nine-point layout, timestamp, 4v4 composition, storage limits and private plan schema before making a new plan.
