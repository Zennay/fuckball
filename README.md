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
- **Another 20% faster free-ball travel**: 1.44× original speed (previously 1.2×), with low-speed, no-X contacts cushioned so walking into a ball keeps it on the dribbling edge. Kick strength and wall restitution are unchanged.
- **Continuous kick outline**: while Space / X (or the touch KICK button) is held, the actual black border of the player disc turns solid **white**, including before the ball arrives. Releasing restores the black border immediately; there is **no separate flashing halo** or cooldown pulsing. The local outline reacts on the next render frame instead of waiting for a 60 Hz physics step. An old held X press no longer shoots on later contact. A **baby kick** is only produced by a fresh, extremely shallow grazing press (outer 0.5 map units of reach); press closer for a full shot.
- **Solo game modes:** free training without AI, 1v1, 2v2, and 4v4 (you always control one blue player). AI teammates and opponents divide responsibility between ball interception, goal cover, central support, and wide passing lanes, rather than every bot chasing the same ball. The bot uses legal movement and shooting inputs with no teleportation or extra abilities.
- The selected-player marker follows the supplied HaxBall screenshot: an approximately **25-unit radius** translucent white ring with **2.4-unit stroke**, outside a **15-unit radius** player disc with **1.8-unit black/white stroke**. The gap remains clear for the small ball. Player labels remain below the ring.
- Multiplayer snapshots include held-kick status for remote players, and extrapolation preserves it.
- Diagonal wall runs enable **rockets**: a well-timed fresh kick while pressing into the wall adds bounded speed along the wall, even if the ball initially has little tangential momentum. Ordinary wall rebounds remain soft.
- Extrapolation defaults to **135 ms**, adjustable from **0–250 ms** in **Escape → Video/Input**, or via chat `/extrapolation 135`, `/extrap 135`, or `/e 135`. The setting persists per browser. Prediction simulates collisions, corrects overlaps, and eases small mistaken ball forecasts back to the latest true position (a subtle lag-like rollback). It is **visual only** and does not alter the server or remove latency.
- Physics simulation runs at a fixed **60 Hz** for consistent gameplay across devices; rendering uses `requestAnimationFrame` at the fastest rate the browser/display permits, with **no intentional 60 FPS cap**. A cached pitch avoids redrawing static stadium geometry each frame. Browser and display limits still apply; literal unlimited FPS is not possible.

## Immersive match UI and chat

- **Viewport-filling arena** with aspect-safe, player-and-ball tracking camera; custom BFF Big v4 geometry stays unchanged.
- **True fullscreen** is available via **F**, **⛶ FULL**, or **CLICK TO PLAY FULLSCREEN**. Browsers only permit native fullscreen after a user gesture; embedded clients may restrict it. The normal page already fills the browser viewport.
- **Escape** opens the match options screen; Escape again or Resume closes it. Video/Input contains a 135 ms default extrapolation slider, exact numeric control and render-resolution setting. Room/teams are accessible from the ROOM button or options menu.
- **Enter** focuses the always-visible match chat. In solo mode the practice bot responds locally to gameplay questions, score, controls, strategy and general chat; no AI API, login or tokens are used. In online rooms, chat goes to connected players.
- **Bots** anticipate incoming shots, designate a primary interceptor, protect goal lanes, maintain passing support positions, and time kicks near contact. The local practice chat remains available in all modes.
- **Gentle dribbling** cushions slow player-ball contact, preserving natural roll-off without changing actual kicks, high-speed rebounds or wall boosts.

## October 2026 gameplay adjustments

- Practice selector: no bots (free play), 1v1, 2v2, or 4v4, including the player on the blue team.
- Free-ball travel 1.44× original (another 20% versus the 1.2× version); dribble contact is intentionally not accelerated into a shot.
- Early X holds remain visually highlighted but cannot auto-fire on later ball contact. A deliberately near-edge new press can produce a small baby kick.
- Coordinated AI roles and diagonal wall rockets; extrapolation sometimes visibly corrects wrong forecasts without affecting the server state.
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

`npm test` includes regression tests for stadium geometry, BFF physics, baby kicks, wall boosts, ball/player collisions and high-speed swept collision, extrapolation, fractional frames at 60/120/144/240/360 Hz, headless simulation of the bundled browser game including the cached pitch and slider, plus two real WebSocket connections and room lifecycle. Practice mode regression tests cover all four team configurations and an AI teamwork smoke scenario. Additional canvas-paint regression tests verify every frame of the held white outline at 144 Hz and 240 Hz, instant release, extra-ring removal, and extrapolated remote-player kick indicators.

The game has not been validated as frame-perfect to HaxBall. The DOM/canvas VM harness verifies physics and high-Hz rendering. A separate **real Chromium smoke test** in [Fuckball browser smoke](https://github.com/Zennay/fuckball/actions/workflows/browser-smoke.yml) verifies viewport coverage, Escape menu, extrapolation changes, chat bot responses and fullscreen activation, and saves a screenshot artifact.

## Structure

- `public/index.html` — multiplayer/solo browser interface.
- `shared/stadium.js` — BFF stadium data parsed from the supplied `.hbs`.
- `shared/physics.js` — authoritative physics for solo and online.
- `shared/prediction.js` — collision-aware extrapolation and fixed-step timing.
- `shared/bot.js` — practice AI behavior (decision making, interception and shot timing).
- `server.js` — self-contained Node HTTP/WebSocket server.
- `scripts/build-standalone.js` — embeds shared source into a standalone offline HTML.
- `test/` — automated regression and integration tests, including AI goal scoring, sustained kick-outline/baby kicks and 20% ball speed.
- `stadiums/BFF Big v4.hbs` — original stadium provided by the user.