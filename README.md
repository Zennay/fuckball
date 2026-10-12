# Fuckball — BFF Big v4 ⚽

An independent, playable HaxBall-inspired browser football game, based on the user's **BFF Big v4.hbs** stadium. This is **not** the official HaxBall implementation, and its custom physics are an approximation of the closed-source HaxBall engine. No official HaxBall graphics, code, or branding are included.

## Always-on browser version

After deployment, visit the public URL from the GitHub Actions deployment run; no downloads are needed. The Node.js server serves solo mode and multiplayer WebSocket rooms.

## Play immediately

Open `dist/Pulseball-BFF-Big-v4-Play-Solo.html` in a desktop browser. This standalone file requires no install or internet connection and includes an AI practice opponent. Use **WASD / arrow keys** to move and **Space / X** to kick.

## Gameplay and stadium

- BFF Big v4 stadium loaded from `stadiums/BFF Big v4.hbs` (also embedded in `shared/stadium.js`): 1400 × 640 visible field, ±708.3 goal lines, 170-unit goal opening, authored field markings, goalposts and colors.
- Ball radius **5.8**, ball inverse mass **1.5** and BFF original rebound **0.412**. Original HBS player accelerations are **0.11** and **0.083**. For this version, player acceleration is tuned **+10%** to **0.121** (normal) and **0.0913** (while kicking). The same unchanged damping makes the steady-state speed 10% higher. Kick strength stays **4.545**. Unspecified physical constants are approximated.
- **20% faster ball travel** (1.2× distance traveled each tick, for kicks, movement and wall rebounds) without changing ball restitution or kick strength values.
- **Continuous kick outline**: while Space / X (or the touch KICK button) is held, the actual black border of the player disc turns solid **white**, including before the ball arrives. Releasing restores the black border immediately; there is **no separate flashing halo** or cooldown pulsing. The local outline reacts on the next render frame instead of waiting for a 60 Hz physics step. Shooting very early still produces a weaker **baby kick** on contact, and re-pressing restores full power.
- **Smarter solo opponent**: prediction including wall bounces, positional interception, approaching from behind the ball, braking near contact, avoiding own goals, and aligning full-strength shots toward the opponent goal. The bot uses legal movement and shooting inputs with no teleportation or extra abilities.
- The selected-player marker follows the supplied HaxBall screenshot: an approximately **25-unit radius** translucent white ring with **2.4-unit stroke**, outside a **15-unit radius** player disc with **1.8-unit black/white stroke**. The gap remains clear for the small ball. Player labels remain below the ring.
- Multiplayer snapshots include held-kick status for remote players, and extrapolation preserves it.
- A deliberate moving kick against a wall can accelerate the ball tangentially, while normal rebound stays soft.
- Extrapolation slider **0–200 ms**, default **0 ms**. Prediction simulates collisions using the same physics engine and corrects between-frame overlaps. Prediction is **visual only** and does not alter the server or remove latency.
- Physics simulation runs at a fixed **60 Hz** for consistent gameplay across devices; rendering uses `requestAnimationFrame` at the fastest rate the browser/display permits, with **no intentional 60 FPS cap**. A cached pitch avoids redrawing static stadium geometry each frame. Browser and display limits still apply; literal unlimited FPS is not possible.

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

`npm test` includes regression tests for stadium geometry, BFF physics, baby kicks, wall boosts, ball/player collisions and high-speed swept collision, extrapolation, fractional frames at 60/120/144/240/360 Hz, headless simulation of the bundled browser game including the cached pitch and slider, plus two real WebSocket connections and room lifecycle. Additional canvas-paint regression tests verify every frame of the held white outline at 144 Hz and 240 Hz, instant release, extra-ring removal, and extrapolated remote-player kick indicators.

The game has not been validated as frame-perfect to HaxBall. Sandbox Chromium launch was blocked/timed out at packaging time, so the browser was tested with a DOM/canvas VM harness rather than a real graphical session.

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