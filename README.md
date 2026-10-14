# Fuckball 26

A full-viewport football game, using the same unmodified node-haxball 2.3.1 physics engine in the browser, headless training and the authoritative multiplayer server. The original BFF Big v4 stadium is preserved byte-for-byte.

## Play and host

Node.js 22 or newer; no Node dependencies required for the game/server:

```sh
npm start
# http://localhost:3417
# HOST and PORT can override the listen address.
```

The field fills the browser viewport. Esc opens the FC-inspired pause menu: teams/match, camera/network, replays, chat, Academy and controls. Browser full-screen is optional under Beeld & verbinding. The default camera fits the complete stadium. Choose Speler volgen for a closer camera.

On a self-hosted server, choose Samen spelen, then Room maken. Share the six-character room code. The server supports up to eight humans, fills 1v1/2v2/4v4 with tactical bots, and authorizes match changes only for the room owner. The owner transfers when they leave. Rooms disappear after the last person leaves. Player names and rooms are ephemeral; no accounts are implemented.

Static hosting (including the private Site) supports local play and direct WebRTC 1v1 through manual connection codes. The separate Node server requires its own hosting. HTTPS clients require a `wss://` endpoint. A reverse proxy can terminate TLS. Cross-origin room connections are disabled by default; set `ALLOW_CROSS_ORIGIN=1` only when deliberately exposing the server to another origin. Direct WebRTC has STUN but no TURN fallback.

## Physics recovery / issue #9

The previous `shared/physics.js` was a separate approximation with 1.10x player acceleration, 1.20x ball displacement, custom kicks and a shared wall/contact restitution. It is **not loaded** by this release. `server.js` now starts `headless/server.cjs`, serving `dist/` and simulating with `dist/vendor/haxball.js`.

- BFF player acceleration: 0.11; kicking acceleration: 0.083; player restitution: 0.
- Ball radius: 5.8; inverse mass: 1.5; restitution: 0.412; damping: 0.99.
- Kick strength: 4.545. The engine applies inverse mass to the impulse: 6.8175 velocity change before damping in an isolated stationary kick.
- No extra speed scaling, magnetic dribbling, custom contact solver or extrapolation-driven authoritative motion.
- Simulation: fixed 60 Hz. Server and peer snapshots: 30 Hz. Extrapolation: user 0–200 ms, total online prediction capped at 250 ms. Rendering never mutates authoritative state. Old sequence numbers are discarded; acknowledged inputs are not re-applied.

This is a compatible independent engine, not proprietary HaxBall source. Current official HaxBall bit-for-bit parity is not claimed. HBS JSON5 and HBR2 v3 are supported; Flash .hbr is not. The official room list/service is not connected.

## Extrapolation, sweeper keeper and high-refresh rendering

The native physics simulation remains fixed at 60 ticks/s. Rendering is scheduled by the browser's `requestAnimationFrame`, with fractional-tick visual lookahead for high-refresh monitors. The pause menu shows **actual rendered FPS**, not simulated physics ticks. A 300Hz browser/display may approach 300 FPS if the computer can render each frame quickly; a 60Hz display cannot show 300 distinct frames through ordinary animation frames.

Esc → Settings → Extrapolation: start at 0–35 ms locally. Higher values (up to 200 ms) lead players farther ahead, but extrapolation is automatically reduced before likely ball/player or wall collisions to prevent premature speculative rebounds. Direct-play guests also factor in bounded snapshot age and optional adaptive network delay. This alters the *display only*, not the engine's collision response, scoring or speed. The frame rate and collision guard are covered by Canvas and headless regression tests.

Esc → Settings → Rendering → Performance · 70% reduces the internal canvas resolution to improve FPS on demanding screens; Native resolution keeps maximum sharpness.

In 4v4, the assigned AI keeper acts as a sweeper: it supports the team farther upfield, steps toward an unmarked ball carrier and recovers toward goal for incoming shots. Its assignment stays stable through chaser changes; movement obeys the same player physics as everyone else.

## AI Academy

The bundled `BFF Replay BC 02` model was trained with the user's original HaxLab NumPy trainer on six BFF replays (192,563 examples); a seventh replay calibrates the kick threshold; an eighth is a separate test (24,688 examples). Direction accuracy: 54.02%, majority-direction baseline 19.44%; kick F1: 0.188. These are imitation metrics, not win rates. The arena benchmark shows kickoff stalls and no wins over the tactical policy. Therefore **tactical is the default**, and the neural model is explicitly an evaluation candidate.

Tactical bots use interception, stable striker assignment, defensive cover, forward support/pass options and contact-timed kick re-arming. A human is given possession priority only when actually near the ball. There are no bot-only physics powers.

Replay Lab processes files locally in a Worker. Select 1–20 unique HBR2 files to analyze; at least 3 to train. Whole files form train/validation/test splits, normalization uses only training rows, and the kick threshold is selected on validation. The browser keeps up to 16,000 reservoir-sampled rows per replay. Exported JSON weights can be imported back into the game. Training does not automatically promote a new model over tactical bots.

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


## 4v4 team AI and HaxLab self-play

Home → **4v4** starts you plus seven bots. Esc → Teams → **Watch 4v4 bots** starts eight bots. Set Easy, Normal, Hard or Elite globally or on each bot's roster entry. Online room hosts can change difficulty; guests cannot. Levels change decision frequency and tactics, never player speed, kick power or collision rules.

Team AI assigns a ball carrier/chaser, passing support, cover and keeper. A supporting player screens a nearby opponent only when the team has possession under pressure; otherwise it keeps a passing lane or covers behind the ball. This is a heuristic team controller, not a claim of human-level play.

Academy → **HaxLab training** runs real 4v4 simulations with the bundled engine. It evolves five team-tactic parameters, tests on separate seeds and both team sides on BFF and Classic, then generates disjoint match datasets for a portable neural policy. Stop terminates the worker. Validated team tactics can be applied; neural candidates can be selected manually or exported.

For the original HaxLab NumPy trainer, run from the repository root:

```sh
python3 -m pip install numpy
node training/haxlab_selfplay.cjs training/output/haxlab-selfplay 12 3
```

This runs 12 natural 4v4 matches and three tactic generations, uses the current neural policy for assisted rollout movement, labels visited states with the team teacher, writes HaxLab-compatible shards, trains with `training/haxlab/baseline.py`, exports a candidate and runs the arena benchmark. Split assignment is by whole match. Initial position variation is confined to episode setup; no physics parameters are changed. Output includes weights, held-out metrics, team tactics and arena results. The neural candidate does not replace the live model automatically. Browser training uses the portable JS trainer with the same feature schema; the CLI uses the original HaxLab trainer.

The first run is a small bootstrap dataset, not evidence of elite playing strength. A positive tactics score includes ball territory and relative kick activity; drawn games alone do not establish a stronger player.
