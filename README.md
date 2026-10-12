# Fuckball — BFF Big v4 ⚽

An independent, playable HaxBall-inspired browser football game, based on the user's **BFF Big v4.hbs** stadium. This is **not** the official HaxBall implementation, and its custom physics are an approximation of the closed-source HaxBall engine. No official HaxBall graphics, code, or branding are included.

## Play online — no downloads

**[🎮 Play Fuckball on the VPS](http://198.244.191.182:3417/)**

The server runs continuously under systemd on vps-bb300bba. Play solo or create multiplayer rooms directly in your browser. The deployment workflow in [Zennay/zCloud](https://github.com/Zennay/zCloud/blob/main/.github/workflows/deploy-fuckball.yml) checks for game updates every 10 minutes and does not restart a healthy server when the deployed commit is unchanged. Public HTTP + WebSocket checks run twice per hour via [Public Fuckball health](https://github.com/Zennay/fuckball/actions/workflows/public-health.yml).

The current direct-IP URL uses HTTP and WebSocket (not TLS). Add a domain plus HTTPS/WSS reverse proxy when one is available.

## Play immediately

Open `dist/Pulseball-BFF-Big-v4-Play-Solo.html` in a desktop browser. This standalone file requires no install or internet connection and includes an AI practice opponent. Use **WASD / arrow keys** to move and **Space / X** to kick.

## Gameplay and stadium

- BFF Big v4 stadium loaded from `stadiums/BFF Big v4.hbs` (also embedded in `shared/stadium.js`): 1400 × 640 visible field, ±708.3 goal lines, 170-unit goal opening, authored field markings, goalposts and colors.
- Ball radius **5.8**, ball inverse mass **1.5** and BFF original rebound **0.412**. Original HBS player accelerations are **0.11** and **0.083**. For this version, player acceleration is tuned **+10%** to **0.121** (normal) and **0.0913** (while kicking). The same unchanged damping makes the steady-state speed 10% higher. Kick strength stays **4.545**. Unspecified physical constants are approximated.
- **Ball travel at 1.2× the original**: restores coherent ball pace and uses natural player-ball impulses without magnetic dribbling. The original 0.412 coefficient now also directly controls the default wall rebound (41.2% velocity retention), undoing the later custom 76% multiplier; opt-in room settings still allow higher rebound, avoiding excessive slowdown.
- **Continuous kick outline**: while Space / X (or the touch KICK button) is held, the actual black border of the player disc turns solid **white**, including before the ball arrives. Releasing restores the black border immediately; there is **no separate flashing halo** or cooldown pulsing. The local outline reacts on the next render frame instead of waiting for a 60 Hz physics step. A shot requires a **new Space/X press in range**; any valid press fires at full strength. Mere player-ball contact never shoots, and holding a key before contact cannot produce a weak or delayed shot.
- **Solo game modes:** free training without AI, 1v1, 2v2, and 4v4 (you always control one blue player). AI teammates and opponents divide responsibility between ball interception, goal cover, central support, and wide passing lanes, rather than every bot chasing the same ball. The bot uses legal movement and shooting inputs with no teleportation or extra abilities.
- The selected-player marker follows the supplied HaxBall screenshot: an approximately **25-unit radius** translucent white ring with **2.4-unit stroke**, outside a **15-unit radius** player disc with **1.8-unit black/white stroke**. The gap remains clear for the small ball. Player labels remain below the ring.
- Multiplayer snapshots include held-kick status for remote players, and extrapolation preserves it.
- Wall bounces and tight-angle deflections come from the same physical collision solver, not artificial directional boosts. Wall impacts retain energy according to the host's rebound setting; the rendered ball rim meets the actual field boundary.
- Extrapolation defaults to **0 ms** (responsive mode), adjustable from **0–250 ms** in **Escape → Video/Input**, or via chat `/extrapolation 135`, `/extrap 135`, or `/e 135`. The setting persists per browser. The old auto-saved 135 ms default is migrated once to 0 ms; explicit post-migration preferences remain intact. Multiplayer renders from the latest snapshot with a bounded inter-packet forward prediction instead of interpolating a full packet behind. Prediction simulates collisions, corrects overlaps and uses a shorter horizon when a collision is imminent. Unexpected corrections converge quickly to avoid perceived lag. It is **visual only** and does not alter the server or remove latency.
- Physics simulation runs at a fixed **60 Hz** for consistent gameplay across devices; rendering uses `requestAnimationFrame` at the fastest rate the browser/display permits, with **no intentional 60 FPS cap**. A cached pitch avoids redrawing static stadium geometry each frame. Browser and display limits still apply; literal unlimited FPS is not possible.

## Immersive match UI and chat

- **Viewport-filling arena** with aspect-safe, player-and-ball tracking camera; custom BFF Big v4 geometry stays unchanged.
- **True fullscreen** is available via **F**, **⛶ FULL**, or **CLICK TO PLAY FULLSCREEN**. Browsers only permit native fullscreen after a user gesture; embedded clients may restrict it. The normal page already fills the browser viewport.
- **Escape** opens the match options screen; Escape again or Resume closes it. Video/Input contains a zero-delay default extrapolation slider, exact numeric control and render-resolution setting. Room/teams are accessible from the ROOM button or options menu.
- **Enter** focuses the always-visible match chat. In solo mode the practice bot responds locally to gameplay questions, score, controls, strategy and general chat; no AI API, login or tokens are used. In online rooms, chat goes to connected players.
- **Bots** anticipate incoming shots, keep a stable primary interceptor until another player is materially better positioned, respect human ball proximity, avoid visibly blocked pass lanes, protect goal lanes, maintain passing support and time kicks near contact. The local practice chat remains available in all modes.
- **Natural dribbling** resolves incidental contact as momentum transfer between physical discs. There is no special ball-velocity cap, attraction, scripted half-shot or additional wall-boost impulse.

## October 2026 gameplay adjustments

- Practice selector: no bots (free play), 1v1, 2v2, or 4v4, including the player on the blue team.
- Ball pace restored to 1.2× original; low-speed contact cannot become an accidental shot.
- Early X holds remain visually highlighted but cannot auto-fire on later ball contact. Each deliberate fresh press inside kick range creates a full kick, including grazing contacts.
- Active team AI runs into pass-receiving lanes; native BFF wall bounce and impact-limited extrapolation avoid premature-looking rebounds.
- HaxLab champion artifacts are Python NumPy `.npz` snapshots and not automatically compatible with this standalone JavaScript physics engine. The game uses a deterministic rule bot until a separately evaluated/exported policy is available; no unverified model is silently deployed.

## v0.7 adjustments

- Player acceleration and resulting cruising speed increased by 10% for both human players and the practice AI.
- In-game outlines and ring gaps adjusted to match the supplied screenshot. Held kick still paints only the player disc border white.

## Online rooms

Requires **Node.js 20+**. From the extracted project folder:

```bash
npm test
npm run build:solo
npm start
```

Visit **http://localhost:3000**. Create a room or join using its six-character code. New users join as spectators and choose Red/Blue; the host starts the match. The same server provides WebSockets, room codes, team controls, chat, and authoritative 60 Hz physics. For internet play deploy the Node server behind HTTPS + WebSocket-capable reverse proxy; a static host alone cannot run room multiplayer.

## Test coverage

`npm test` includes regression tests for stadium geometry, BFF physics, edge-triggered full-power kicks, non-sticky ball/player collisions and high-speed swept collision, extrapolation, fractional frames at 60/120/144/240/360 Hz, headless simulation of the bundled browser game including the cached pitch and slider, plus two real WebSocket connections and room lifecycle. Practice mode regression tests cover all four team configurations and an AI teamwork smoke scenario. Additional canvas-paint regression tests verify every frame of the held white outline at 144 Hz and 240 Hz, instant release, extra-ring removal, and extrapolated remote-player kick indicators.

The game has not been validated as frame-perfect to HaxBall. The DOM/canvas VM harness verifies physics and high-Hz rendering. A separate **real Chromium smoke test** in [Fuckball browser smoke](https://github.com/Zennay/fuckball/actions/workflows/browser-smoke.yml) verifies viewport coverage, Escape menu, extrapolation changes, chat bot responses and fullscreen activation, and saves a screenshot artifact.

## Structure

- `public/index.html` — multiplayer/solo browser interface.
- `shared/stadium.js` — BFF stadium data parsed from the supplied `.hbs`.
- `shared/physics.js` — authoritative physics for solo and online.
- `shared/prediction.js` — collision-aware extrapolation and fixed-step timing.
- `shared/bot.js` — practice AI behavior (decision making, interception and shot timing).
- `server.js` — self-contained Node HTTP/WebSocket server.
- `scripts/build-standalone.js` — embeds shared source into a standalone offline HTML.
- `test/` — automated regression and integration tests, including AI goal scoring, explicit full-power kicks and 20% ball speed.
- `stadiums/BFF Big v4.hbs` — original stadium provided by the user.
## HaxLab replay-based AI upgrade path

The HaxLab project already extracts action-supervised samples from `.hbr2` files with `tools/extract_imitation.js`: player-relative ball velocity/position, up to 2 teammate and 3 opponent relative vectors, and left/right/up/down + kick labels (see `Zennay/Haxlab`). Those replays can be a source for **offline imitation training**, but the existing HaxLab champion is a Python/NumPy artifact; its input schema, scaling, predicted actions, and runtime must be verified before a browser deployment. In particular, high offline action accuracy does not prove useful on-ball 4v4 play.

The current browser game deliberately runs the deterministic bot rather than loading an unverified remote model. A candidate learned bot should first be tested for game scoring, own-goals, possession turnovers, coordination, input rate and collision feel on a held-out replay set and in 4v4 simulation. Promote it only if it measurably improves over this baseline and can run without blocking the 60 Hz game loop. Matching HaxBall exactly still requires side-by-side human playtesting; the solver is an independent approximation, not HaxBall source code.
