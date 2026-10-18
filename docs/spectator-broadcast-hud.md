# Read-only Spectator Broadcast HUD

Fuckball's existing native spectator tools now offer a voluntary **Broadcast HUD** while watching a real room or using **Watch Bots** locally. It is a lightweight visual score strip for streaming or saving a scoreboard image, not a match official, feed or network broadcaster.

## User workflow

1. Enter a genuine spectator camera view or start Watch Bots. Choose **BROADCAST HUD** on the existing spectator toolbar. A responsive overlay shows only the **current native Red / Blue score and match clock**. If real score data is not available, the overlay is hidden instead of inventing a result.
2. Open match Settings → **Spectator Broadcast** to customize Red and Blue display labels (1–18 printable characters) and choose Wide or Compact. Save changes only to browser localStorage; labels are not sent to the room and never change actual team names.
3. Choose **SCORE PNG** to download a 900 × 220 private PNG containing the current observed scoreboard, chosen local labels and a prominent *UNVERIFIED* notice. No player names, chat, account IDs, room URL, match tokens or IP data are included.
4. Switch the toggle off to return to a normal match view. Switching away from spectator mode, changing to replay, hiding the browser tab or leaving the room automatically closes the overlay. The overlay is noninteractive over the pitch and never sends controls.

## Boundaries

- Only existing validated native `room.gameState` score and clock fields are read. If the snapshot is missing or invalid, save is disabled and no old score is displayed.
- The data is an **observed local snapshot**, not official server confirmation of a match result, identity, scorer, rankings or statistics. A saved PNG is user-selected and potentially shareable outside the app only by the user.
- This tool makes no network calls and does not change physics, player inputs, camera choice, matchmaking, room protocol, server authority, Club rosters or replay files.
- Settings are device-local under `fuckball.spectator-broadcast.v1`; only display labels and layout are persisted. The actual scores and clock are not stored.
- UI: `dist/spectator-broadcast.js`, `dist/spectator-broadcast.css` loaded from `dist/index.html`. Public offline pack static allowlist version **v50**; no account or API cache.

Existing exact-head CI, release permissions, trusted-runner and safe-room/queue gates remain unchanged. GitHub integration is not evidence of deployment to the live VPS.
