# Private Custom Room access key

## Player result

A connected Custom Room host can **Protect room**, replace an existing access key or **Remove key** from the Room controls. A private key must be 10–64 printable ASCII characters, with no leading/trailing whitespace. The host enters it twice and shares it separately from the existing shareable room URL. The key is never displayed again, put in a URL, or persisted in localStorage. When protection is enabled, the server automatically removes the room from public browsing. A protected room cannot be published until the key is removed.

A new user opening a room invite can enter the separately shared room key and continue as a guest or signed-in player. The game sends the key only in a **single native WebSocket join message**. The client immediately clears its form and connection reference after transmission. The browser refuses to send a nonempty key over unencrypted non-loopback WS (HTTPS/WSS required). A missing or incorrect key is rejected before native player allocation, snapshots or team assignment; the invite form reopens with a clean key field, preserving the explicit WATCH-first option. The guest can re-enter the correct key without navigating away. A new spectator-only invite still uses the prejoin capability negotiation introduced in PR #332; the join payload carries the key only after that negotiation.

## Server authority and privacy

- Only the **currently connected Custom Room owner** can set, rotate or clear a key through the existing native `roomAdmin` envelope. Human Quick Match never exposes the controls. The server validates the entire shape and bounds mutations to five per minute per host socket.
- The server retains **only** a random 16-byte salt and a `crypto.scryptSync`-derived 32-byte digest in this room's **volatile control-plane state**; digest and salt never enter room status, WebSocket messages, peer-host simulation snapshots, replay, browser storage, server account records or training datasets.
- Current `roomControl` reports only `accessKeySupported` and `accessKeyRequired` booleans plus a nonsecret revision number. An owner can distinguish genuine server-confirmed key rotation from a local form submission. Room membership, current authorization checks, bans, account policies, Club membership and locked/full room behavior still run independently.
- Each protected fresh join goes through room-scoped bounded admission attempts (max 12 attempts in 10 seconds and 60 per minute) before key derivation. Invalid/missing keys receive the same generic error. The server uses timing-safe byte comparison of the derived digest. Shared brute-force attempts cannot exhaust CPU without this finite room-scoped limit; when it trips, further joins fail closed until the short window expires.
- Existing connected people are **not expelled** when the host rotates the key. An authenticated reconnect with a valid, unexpired native resume ticket may reclaim the **same** reserved slot without a new key; invented or stale tickets still fail the standard rejoin checks and never become new players.
- On an actual room-owner change, the old owner's lock automatically expires. Native match and existing connections remain intact. The new owner may create their own access key.
- Key and salt are never exported with `RoomCore.exportState` and are held only by the WebSocket control-plane server, including when a browser hosts casual-game physics.

## Boundaries

This is a room admission **shared secret**, not a new account identity, identity verification or encrypted private chat. The host must share the key out of band. A key's entropy depends on the host's choice; long random phrases are preferable. Use WSS/HTTPS for the actual game URL. The feature does not affect the game's approved ball/player physics, native 60 Hz tick, ratings, AI models or human-only Quick Match.

Only static UI assets enter the PWA app shell, not secret material, room status or join results. Mandatory exact-head GitHub CI, independent review/branch protection and any authorized production deploy, active-room drain and rollback gates remain unchanged. No QA/regression/test suites were written, extended or manually run.
