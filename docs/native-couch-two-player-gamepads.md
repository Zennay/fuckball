# Native Couch 1v1 — Two Local Players, Two Gamepads

The Home screen now contains **Couch 1v1**, a first-class entry to the existing approved `quickPlay('local')` mode. The game still creates two *actual human-controlled native players* on the BFF pitch, without any bots, alternate physics, matchmaking service, login, fake scoreboards, rating or new network input channel.

Player 1 uses existing **WASD + F** controls or the existing controller selected in Controller Setup. Player 2 uses **arrow keys + Slash / Enter / Numpad 0**, and can now additionally use a **different** standard Gamepad API controller: left stick/D-pad for direction and A/X/right-trigger to kick. Both sets of inputs merge through the **existing deduplicated `sendInput` → `room.playerInput`** path, not new simulation controls.

## Safe ownership

- Player 1's existing user-selected physical Gamepad API port remains authoritative for their controller. A tiny read-only `sourceIndex()` access exposes only the browser's ephemeral port index (not device identity or saved IDs).
- Player 2 may explicitly pick another connected standard pad (port 1–16) or use the first available pad **not currently assigned to Player 1**. An explicit disconnected port stays neutral; it never silently takes over Player 1's controller.
- The second pad is ignored unless an **offline**, **two-player**, **unpaused** native game is visible and the input menu/dialogue isn't open. In online rooms, peer games, Quick Match, other practice modes and replay, the second pad sends **no** controls.
- P2's input-only reader is reset upon disconnection, window blur, tab hiding, pause or menu entry. Original keyboard remains available; no controller pairing identity is persisted or sent to servers.
- Starting Couch 1v1 checks the existing queue, invite, peer and server restrictions and requires confirmation before replacing a local game or replay.

## Release boundary

Static UI, CSS and PWA assets only, with a targeted native P2 controller-input extension. Existing mandatory GitHub exact-head CI, protected review/security gates and authorized production release/drain/rollback remain unchanged. This is **source integration**, not evidence of a live server deploy. No new manual QA, regression or test suites were written, expanded or run.

## Local native Co-op teams (2v2 and 4v4)

The Couch home panel now has two additional **actual playable** choices: **Team Up 2v2** and **Team Up 4v4**. Both original native human IDs 1 and 2 join the same Red team, controlled separately through the existing shared-keyboard or distinct-controller input; the original tactical AI controls the remaining players.

- **2v2:** 2 real Red teammates face 2 native Blue bots, without adding substitute human competitors.
- **4v4:** 2 real Red teammates plus 2 genuine native AI teammates face 4 genuine native Blue AI opponents. The engine keeps its actual teams, score, match duration and native ball/player physics.
- Starting either mode uses the existing explicit local quick-play authorization and asks consent before replacing an unsaved local match. Online rooms, human queues and direct peers cannot be silently switched into a co-op lobby.
- Input ownership, gamepad disconnect safety, neutral handling on pause/blur/menu and the explicit P2 keyboard mapping also apply to both Co-op modes. Player 2 is released to neutral on exit or loss of input, preventing sticky movement.
- Co-op results are observed in the original local scoreboard only, **not** stored or promoted to ranked matchmaking, Club results, an Elo score, or a fabricated verified AI victory.

No new network protocol, simulated physics or AI algorithm was introduced. Existing native AI tactical policies are reused. Source integration has no authority to cut over a live VPS.
