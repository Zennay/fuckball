# Fuckball 26

A full-viewport football game, using the same unmodified node-haxball 2.3.1 physics engine in the browser, headless training and the authoritative multiplayer server. The original BFF Big v4 stadium is preserved byte-for-byte.

## Play and host

Node.js 22 or newer; no Node dependencies required for the game/server:

```sh
npm start
# http://localhost:3417
# HOST and PORT can override the listen address.
```

The field fills the browser viewport. Esc opens a translucent, HaxBall-style room menu on top of the running match — the game never stops for it (P pauses). The menu opens on the teams: Red, Spectators and Blue, and the host drags players (and bots) between them, adds bots with **+ Bot** or removes them with ×. **Copy room link** (online) or **Create online room** (offline) sits at the top of the menu. Below the teams: Start/Stop, Pause, Swap teams, All to spectators, Record, and time limit, score limit and stadium. Bot difficulty is set per bot next to its name. Replays are opened from the home screen. Esc closes the menu again; there is no separate resume button. The score is centred at the top of the pitch and the only pause indicator is the engine's own “Game Paused”. Teams you arrange survive restarts and limit changes.

- **Controls** tab: every action (up, down, left, right, kick, open chat) has two rebindable key slots. Defaults: arrows/WASD, Space/X, Enter for chat.
- **Chat** sits in the bottom-left corner, always visible but small; messages fade after a few seconds. Press the chat key to type, Enter to send, Esc to close.
- **Ping and FPS** are shown under the chat (local games show LOCAL).
- **Settings** tab (second tab): name, camera, zoom, rendering, FPS limit (up to 1000 or Unlimited; above the display refresh rate an extra MessageChannel loop renders between animation frames), sound, extrapolation, fullscreen.
- **Chat commands**: `/extrapolation <ms>`, `/fps <limit|0|unlimited>`, `/zoom <0.6–2>`, `/camera full|follow`, `/name <nick>`, `/sound on|off`, `/quality native|performance`, `/ping`, `/clear`, `/help`. They change your local settings and are never sent to the room.
- **Network**: the server disables Nagle batching (`TCP_NODELAY`) and enables TCP keep-alive on room sockets; a dropped client rejoins the same room automatically (three attempts with back-off).

**Room links and accounts.** Opening a room link first shows a join screen: type a nickname, join as a guest (random `Guest 1234` name), or log in / create an account. An account (username + password, scrypt-hashed, stored in `accounts.json` under `FUCKBALL_DATA_DIR`, systemd's `STATE_DIRECTORY`, or `./data`) reserves that nickname: guests cannot join under it, and a logged-in player always plays under the account name. Sessions are random tokens of which only a hash is stored; there is no e-mail or password recovery. Settings → Account shows who you are and logs out.

**Lobby.** Until the game is started the pitch is hidden behind a “Game not started” card with Start game (host) or “Waiting for the host”, so a waiting room never looks paused. Time limit takes any whole number of minutes (0 = none, default 7). **Swap teams** flips Red and Blue; **All to spectators** clears both teams. Bots show their difficulty next to their name.

On a self-hosted server, choose Online (or Esc → Create online room). The room menu opens with the room link (`/?room=XXXXXXXX`) and **Copy room link**; copying also works on plain-HTTP servers (where the browser clipboard API is unavailable) through a fallback; anyone who opens the link joins that room directly, with no code to type. Expired or full rooms show a clear message and the link is removed from the address bar. Room IDs are 8 random characters (~40 bits) and are no longer listed by `/api/rooms`. The server supports up to eight humans, fills 1v1/2v2/4v4 with tactical bots, and authorizes match changes only for the room owner. The owner transfers when they leave. Rooms disappear after the last person leaves. Player names and rooms are ephemeral; no accounts are implemented.

Static hosting (including the private Site) supports local play; invite links need the Node server. Direct WebRTC 1v1 with manual connection codes remains available under Play online → Advanced connection. The separate Node server requires its own hosting. HTTPS clients require a `wss://` endpoint. A reverse proxy can terminate TLS. Cross-origin room connections are disabled by default; set `ALLOW_CROSS_ORIGIN=1` only when deliberately exposing the server to another origin. Direct WebRTC has STUN but no TURN fallback.

## Physics recovery / issue #9

The previous `shared/physics.js` was a separate approximation with 1.10x player acceleration, 1.20x ball displacement, custom kicks and a shared wall/contact restitution. It is **not loaded** by this release. `server.js` now starts `headless/server.cjs`, serving `dist/` and simulating with `dist/vendor/haxball.js`.

- BFF player acceleration: 0.11; kicking acceleration: 0.083; player restitution: 0.
- Ball radius: 5.8; inverse mass: 1.5; restitution: 0.412; damping: 0.99.
- Kick strength: 4.545. The engine applies inverse mass to the impulse: 6.8175 velocity change before damping in an isolated stationary kick.
- No extra speed scaling, magnetic dribbling, custom contact solver or extrapolation-driven authoritative motion.
- Simulation: fixed 60 Hz. Server and peer snapshots: 30 Hz with the server tick. Extrapolation: HaxBall model (see below), capped at 120 frames. Rendering never mutates authoritative state. Old sequence numbers are discarded; acknowledged inputs are not re-applied.

This is a compatible independent engine, not proprietary HaxBall source. Current official HaxBall bit-for-bit parity is not claimed. HBS JSON5 and HBR2 v3 are supported; Flash .hbr is not. The official room list/service is not connected.

## Extrapolation (HaxBall-equivalent) and high-refresh rendering

Rendering uses the same prediction as the official HaxBall client, ported from the pinned engine (`dist/render-timing.js`):

- **Stepping (`j1`).** Each rendered frame copies the last confirmed state, replays your own unconfirmed inputs at the frames they were stamped, runs whole 60 Hz engine ticks and finishes with one fractional tick (`dt = frames − ⌊frames⌋`). Capped at 120 frames. Positions are identical to the real engine through collisions and kicks. The old renderer did a single big step (`dt = 6` for 100 ms) and lerped between two of those, which drifted badly (e.g. 60 px vs 18 px real after 20 ticks).
- **Online timing (`cW`).** The client renders at `(now + extrapolation)·0.06 + clock offset`. Offset samples come from ping replies (`server tick at reply − ping sent time`) in a 50-sample window with 0.97 decay, read at the weighted median. So, like HaxBall, you see ahead of the last snapshot by about your latency, your own moves show instantly, and other players continue with their last known input. Snapshots (30 Hz) and pongs carry the server tick (packet header v2, `0x46423201`).
- **Local / host timing.** `(now − roomStart + extrapolation)·0.06 − currentFrame`, giving smooth 120/144/240 Hz frames between ticks.
- **Setting.** Esc → Settings → Extrapolation, −200 to 1000 ms, default 0 (as in HaxBall). Visual only; the server and engine remain authoritative and untouched.

`tests/render-timing.cjs` checks positions against the engine's own tick through a ball/player contact, the fractional tick, own-input replay, the cap, isolation and the clock estimator.

## Netcode v3 (online play at 200 ms)

Online rooms and direct 1v1 connections use netcode v3 by default (design and measurements: `docs/netcode-plan.md`). Physics and the engine are unchanged; the server stays authoritative.

- **Frame-stamped inputs.** The client stamps every input change with the host frame it is meant for. The host keeps a small per-player buffer and applies each input exactly at that frame, so jitter no longer moves your own player, and short kick taps can no longer be lost when packets arrive bunched up. Late inputs are replayed in order, one change per frame.
- **Lead control.** Each snapshot carries the input "slack" the host measured for that client. The client nudges its own clock (at most 5% faster or 2% slower) so the 5th percentile of the slack stays just above zero. On a stable line that is about one frame; on wifi with spikes it is a few frames.
- **Smooth corrections.** When a snapshot corrects the prediction, the error becomes a visual offset that decays in ~40–80 ms. Above 90 units (kickoff, goal reset) the view snaps instead. Only the rendered copy is touched.
- **Switch.** Esc → Settings → Netcode → *Classic* restores the previous behaviour for new connections; `FUCKBALL_NETCODE=classic` does the same for the whole server. Old and new clients can share a room (snapshot header `0x46423201` classic, `0x46423203` v3 with a slack field).

### Peer hosting (the room moves to the best connection)

An online room can run in a player's browser when that gives everyone a better connection, and it moves seamlessly as connections change. The Node server stays the coordinator and the safety net.

- Every client keeps a WebRTC data channel to every other client (signalled through the server), measures round trips and reports them. The server scores each candidate (itself and every eligible browser) by the worst delay between two players through it, plus half the worst prediction horizon. It switches only for at least 25 ms and 15% gain, held for 8 s.
- **Handover at an exact frame.** The old host steps to frame M and exports the engine state, every input timeline, the room settings, the bots' memory and the counters. The new host continues bit for bit (`tests/handover.cjs`), and clients switch at the first snapshot ≥ M. A browser host runs the room in a Web Worker (`dist/host-worker.js`), because two engines in one page share internal timers.
- **Failover.** A browser host sends a standby copy about 6 times a second, and every input also goes to the server. If the host vanishes, the server continues from the copy plus its own inputs. A hidden tab hands the room back at once. A player joining while a browser hosts brings the room back to the server first.
- **Trade-offs.** Players in a room see each other's IP address (WebRTC, as in HaxBall). A browser host could cheat. There is no TURN server, so players without a direct channel keep the room on the server. Because of the IP exposure, peer hosting is **off by default**: set `FUCKBALL_PEER_HOSTING=on` on the server to enable it. Esc → Settings → *Peer hosting* also opts a single browser out.
- `npm run test:browser` checks real Chromium pages: WebRTC mesh, worker host, handovers and failover. `tests/peer-hosting.cjs` runs the full protocol with simulated browsers.

The engine runtime clock is now `n·(1000/60) + 1 µs` instead of a running sum, so `step(1)` is always exactly one engine tick. Before, about 1 in 3,300 steps ran 0 or 2 ticks.

`node scripts/netsim.cjs [seconds] [profile ...]` (or `npm run netsim`) runs real engines over a simulated network (TCP or UDP behaviour, latency, jitter, loss) and compares classic with v3. Measurements: `docs/netcode-plan.md`. `tests/netcode.cjs` keeps the key properties under test.

## VPS training

`node training/continuous.cjs /opt/fuckball-training 12` runs a 12-hour window in batches of 192 matches. It fine-tunes the previous checkpoint and uses it for the next rollout; normalization changes are compensated when weights resume. Checkpoints, metrics and arena results persist, while only two recent generated datasets are retained. A STOP file or service stop ends training. Low disk space pauses generation. Candidates never overwrite live gameplay automatically.

The `fuckball-training` service uses a two-CPU quota, a 3GB memory limit and lower scheduling priority. `/api/training` exposes completed matches/cycles and latest metrics for operators; it is not shown in the game. The existing GitHub training workflow remains separate.

## Backend AI training (not in the game)

Training is backend-only. The game has no Academy tab, model import/export, replay training or self-play controls; bots in the game always use the tactical team AI with the selected difficulty. The browser worker modules under `dist/ai/` remain only because the CLI/VPS training and tests import them; the page does not load them.

### Training history


The bundled `BFF Replay BC 02` model was trained with the user's original HaxLab NumPy trainer on six BFF replays (192,563 examples); a seventh replay calibrates the kick threshold; an eighth is a separate test (24,688 examples). Direction accuracy: 54.02%, majority-direction baseline 19.44%; kick F1: 0.188. These are imitation metrics, not win rates. The arena benchmark shows kickoff stalls and no wins over the tactical policy. Therefore **tactical is the default**, and the neural model is explicitly an evaluation candidate.

Tactical bots use interception, stable striker assignment, defensive cover, forward support/pass options and contact-timed kick re-arming. A human is given possession priority only when actually near the ball. There are no bot-only physics powers.

The former in-browser Replay Lab worker (`dist/ai/trainer-worker.js`) is kept only for the CLI/test pipeline: whole files form train/validation/test splits, normalization uses only training rows, and the kick threshold is selected on validation. Training never promotes a model into the game automatically.

For reproducible offline training, install NumPy in your own Python environment:

```sh
python3 -m pip install numpy
node training/import_replays.cjs /path/to/replays training/human-data
python3 training/train.py --data training/human-data --output training/human-output --name 'BFF candidate' --source-kind human-bff-replays --epochs 20
node training/benchmark.cjs dist/ai/trained-model.json 3600
```

For synthetic teacher demonstrations:

```sh
node training/generate.cjs training/data 1337 60
python3 training/train.py --epochs 20
```

HaxLab's original detailed replay analyzer is retained:

```sh
node training/haxlab/decode_replay.cjs match.hbr2 30 > report.json
```

`training/export_model.py model.npz metrics.json model.json` imports baseline and temporal two-layer HaxLab models when their feature metadata is available. Recovered weights without readable metadata were not promoted. No claim of elite playing strength is made.

## Headless scripts

```sh
node headless/run.cjs headless/example.js 3600
```

`headless/runtime.cjs` exports `HBInit` and `createRuntime`. Local game functions cover players, teams, admins, stadiums, limits, disc properties, kick limits, announcements, recording, pause and game/player callbacks. Added helpers: `addPlayer`, `setPlayerInput`, `step`, `run`, `destroy`. Scripts run as trusted local code, with Node `require`; the VM is not a security sandbox. Local mutations are synchronous; official HaxBall mutations are asynchronous. Official token/recaptcha hosting and ban/auth management are not emulated. Unsupported service settings fail explicitly.

## Verification

```sh
npm test
npm run build:solo
```

Core checks cover the pinned engine/map hashes, analytic displacement and acceleration, correct inverse-mass kick impulse, zero-restition player contact, BFF walls, goals, all stadiums, replay reconstruction, worker training/split separation, HBInit callbacks, real HTTP/WebSocket rooms and host authorization.

The application/Canvas harness additionally covers full match input, the Esc menu, reconfiguration while paused, cameras, replays, 4v4, direct-peer synchronization, stale snapshot rejection and two real app clients connected to the headless server. It requires `@napi-rs/canvas` (0.1.100) from `CODEX_PRIMARY_RUNTIME_NODE_MODULES` or local node_modules:

```sh
npm install --no-save --package-lock=false @napi-rs/canvas@0.1.100
npm run test:ui
```

These are executable application and native Canvas tests, not visual browser inspection. Real-browser layout, mobile touch, external NAT traversal and comparative latency against HaxBall still need device verification. Lower internet ping is not promised; prediction reduces visible waiting, not physical network round-trip time.

## Provenance and release protection

- node-haxball engine/renderer/language: https://github.com/wxyz-abcd/node-haxball at `4d4b88f1e5e25d484d27819ee6a4699720bda164`, MIT. Engine SHA256: `a0f4dbef90090f6b5c85bc48d4645e8cd3159023bc91af2b8de8225da6840a4b`.
- BFF Big v4 from Zennay/fuckball: SHA256 `48772a9e29cecb28a4bd67d6ac360f87d246fe0e1d8008b12eaeeb6ab0b7bed4`.
- HaxLab analyzer/extractor/trainer: Zennay/Haxlab at `3478539730f62ca0812e93af50aa9692fd14f7e1`. JS entry point adapted to the bundled headless API.
- UI reference: EA FC pause/settings screens. The implementation uses Fuckball branding and CSS, with no EA game assets.
- Third-party license notices are under `dist/vendor/`.

VPS publication must deploy an explicit tested commit into a new release directory. Never reset a live Work-session working tree and never re-enable automatic legacy deployment as a side effect. The old solver may remain in repository history/legacy files but must never be used by the active entry point.


## Goalkeeper and AI evaluation (October 2026)

The 4v4 keeper no longer hugs its line. It stands on the ball–goal line to narrow the angle (far out when its team has the ball), leaves the box to sweep any loose ball it can reach before every opponent (engine-accurate interception: player acceleration/damping, ball damping), steps onto the path of shots instead of backing into the net, and attacks the ball from the goal side so contact clears it. Targets and inputs only — no physics changes. The team plan is computed once per tick and shared, which keeps eight bots cheap.

`node training/duel.cjs <policyA.js> <policyB.js> [matches] [frames] [workers]` plays 4v4 matches on BFF and Classic. Every seed is played twice with the sides swapped, so two identical policies score exactly equal (an earlier version alternated sides across different seeds, which gave identical policies a 36–18 split and made small differences meaningless). `node training/keeper-gallery.cjs [policy.js] [shots] [BFF|Classic]` fires random shots (60–480 px, 5.5–10.5 px/frame) at a set keeper and reports save rates by range.

| Comparison (fair mirrored harness) | Result |
| --- | --- |
| Current keeper vs previous policy, 400 matches | 209–38 goals, 159 W / 219 D / 22 L |
| Keeper gallery, 300 shots, BFF | 84% saved (previous keeper 63%) |
| Keeper gallery, 300 shots, Classic | 93% saved (previous keeper 75%) |
| Gallery-tuned variants (closer to the shooter), 400 matches vs current | 52–65 and 49–70: better in the gallery, worse in matches (dribbled past), not adopted |
| Goal-side recovery / earlier shot interception variant, 400 matches vs current | 64–70, not adopted |
| VPS self-play profile vs default profile (older harness, previous keeper) | 86–99 over 200 matches, not adopted |
| VPS neural model steering vs tactical (older harness, previous keeper) | 34–54 over 100 matches, not adopted |

Self-play promotion validates on 16 games (four seeds × two maps × both sides) and requires a positive goal difference and more wins than losses.

## 4v4 team AI and HaxLab self-play

Home → **4v4** starts you plus seven bots. Esc → Advanced → **Watch 4v4 bots** starts eight bots. Set Easy, Normal, Hard or Elite globally or per bot under Advanced. Online room hosts can change difficulty; guests cannot. Levels change decision frequency and tactics, never player speed, kick power or collision rules.

Team AI assigns a ball carrier/chaser, passing support, cover and keeper. A supporting player screens a nearby opponent only when the team has possession under pressure; otherwise it keeps a passing lane or covers behind the ball. This is a heuristic team controller, not a claim of human-level play.

HaxLab self-play (CLI/VPS only) runs real 4v4 simulations with the bundled engine. It evolves five team-tactic parameters, tests on separate seeds and both team sides on BFF and Classic, then generates disjoint match datasets for a portable neural policy. Results are written to the training output directory; nothing is applied to the live game automatically.

For the original HaxLab NumPy trainer, run from the repository root:

```sh
python3 -m pip install numpy
node training/haxlab_selfplay.cjs training/output/haxlab-selfplay 12 3
```

This runs 12 natural 4v4 matches and three tactic generations, uses the current neural policy for assisted rollout movement, labels visited states with the team teacher, writes HaxLab-compatible shards, trains with `training/haxlab/baseline.py`, exports a candidate and runs the arena benchmark. Split assignment is by whole match. Initial position variation is confined to episode setup; no physics parameters are changed. Output includes weights, held-out metrics, team tactics and arena results. The neural candidate does not replace the live model automatically.

The first run is a small bootstrap dataset, not evidence of elite playing strength. A positive tactics score includes ball territory and relative kick activity; drawn games alone do not establish a stronger player.
