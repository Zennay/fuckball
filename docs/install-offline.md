# Installable Fuckball and offline local practice

Fuckball can be installed as a Progressive Web App (PWA) when served over HTTPS or localhost. Android/desktop browsers may offer **Install Fuckball** on Home. On supported iOS browsers use **Share → Add to Home Screen**. The install flow and controller-friendly local practice are separate from multiplayer.

## Available with no connection

- Local 1v1 practice versus the shipped tactical AI.
- Local 4v4 against the shipped bots, with unchanged accepted native 60 Hz simulation.
- Locally stored, previously downloaded HBR2 recordings in **My Games**, including bookmarks, offline playback and local export.
- Room preset settings stored on the device. A saved setup never proves or creates a live online room.

When initially installed online, the service worker stores one complete, bounded set of **public static assets** in `fuckball-offline-practice-v1`. It refuses an incomplete pre-cache rather than advertising a half-installed offline copy. Later public assets are refreshed **network first**, with locally cached versions only when a network request cannot complete. Browser storage eviction or a failed install can remove offline availability.

## Never available offline

Creating/joining rooms, public room browsing, club/member data, account login, Quick Match, matchmaking, online results and server-verified career totals all require a real game-server connection. A disconnected private room invitation is not resolved to a fake cached match: it receives a 503 offline explanation. The device's `navigator.onLine` is only a network hint, not proof the game server is healthy.

The worker does **not** intercept or cache `/api/*`, `/health`, `/ws`, WebSocket upgrades, account bearers, match snapshots, mutable server results or unlisted URLs. Only a fixed list of public CSS, JS, stadium bundles, index, manifest and home-screen icons is eligible. Existing privacy, authorization, native game physics and ranked-integrity rules remain unchanged.

## Hosting caveats

- A public HTTP **IP address** is not a secure browser context. PWA installation and service worker registration generally require HTTPS or localhost. Enabling this source code alone does **not** make the VPS IP HTTPS.
- A server-backed HTTPS reverse proxy or the existing Render HTTPS service can host the web app; a future deployment still must pass the repository's existing release and server-authority gates.
- The native Node server serves PNG icons as `image/png` and the manifest as `application/json`; `sw.js` is a same-origin classic service worker under the current application root.
- Install controls appear only when the browser fires `beforeinstallprompt`. Other browsers use their own installation menu.

## Release expectations

Merge via normal first-party PR CI. Never treat a GitHub merge as a live VPS release. An actual release requires explicit approved source, current native service and queue-aware guards, working self-hosted runner, zero in-flight users, and post-promotion health identity matching the approved SHA. No QA suite was added by this feature.
