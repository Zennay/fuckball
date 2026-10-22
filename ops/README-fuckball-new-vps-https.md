# Fuckball public HTTPS on the NEW VPS

Scope: publish the **existing, healthy** Node multiplayer game on
`https://fuckball.zennay.nl`, without touching the trainer, checkpoints,
old VPS or game-account state. Related zCloud migration: Zennay/zCloud#1588.
This is not an automatic deployment or a training restart.

## Host and release constraints

- New destination only:
  `VM-7eb5ee16-2c71-440d-b7fd-8095d204e930` (`95.211.40.88`).
- Preserve the old VPS as rollback until production gameplay is accepted.
- Preserve the known-good live Fuckball physics/tactical release. Do **not**
  silently promote an experimental AI policy or replace the game repository
  during domain restoration.
- Preserve the **existing persistent** `FUCKBALL_DATA_DIR` with accounts,
  hashed sessions, clubs and social/match history. Never point the server at
  a fresh empty directory to make a health check pass.
- This game server uses `node server.js`, Node >=22, port 3417. Its
  `/health` returns `ok:true`, `engine:node-haxball-2.3.1`,
  `physicsHz:60` and `snapshotHz:30`. The same server handles HTTPS
  page/API traffic and WebSocket `/ws` via Caddy.
- Existing heavy HaxLab/Fuckball **training** data must remain on a validated
  separate local training block device; an rclone/FUSE archive mount is not
  equivalent. Neither this script nor its publish gate changes training.

## Admission and service

1. On the **new host**, independently establish the exact checkout path and
   immutable known-good release. Check the current Node service without
   stopping it or overwriting an existing unit.
2. Confirm the final server-state transfer is complete, and the new
   `FUCKBALL_DATA_DIR` is private, persistent and contains the expected
   data. If not, stop here and complete the separate controlled data handoff.
3. The existing systemd service should run as an unprivileged user, from
   the verified release checkout, with these environment variables:
   ```ini
   Environment=NODE_ENV=production
   Environment=HOST=127.0.0.1
   Environment=PORT=3417
   Environment=FUCKBALL_NETCODE=v3
   Environment=FUCKBALL_PEER_HOSTING=off
   Environment=FUCKBALL_DATA_DIR=/ACTUAL/EXISTING/PRIVATE/STATE
   Environment=FUCKBALL_RELEASE_SHA=ACTUAL_VERIFIED_COMMIT
   ```
   This is a **reference only**: do not install that literal state path or
   change/restart an active service without a separate authorized release.
   Do not expose 3417 on `0.0.0.0` once using the HTTPS reverse proxy.
4. Confirm `curl --fail http://127.0.0.1:3417/health` works and
   `ss -ltn` proves the only 3417 listener is `127.0.0.1:3417`.

## DNS and Caddy prerequisites

- At the authoritative DNS provider for `zennay.nl`, set
  `fuckball.zennay.nl A 95.211.40.88`. Remove or update stale AAAA
  records; no new-host IPv6 address has been approved.
- Leave `zcloud.zennay.nl`, `zssh.zennay.nl` and unrelated hosts intact.
- Caddy owns ports 80/443; let it issue the host certificate. Review and
  enable the shared root Caddyfile import **once**, preserving existing
  zSSH and zCloud routes:
  ```caddyfile
  import /etc/caddy/sites-enabled/*
  ```
- The game endpoint is public. Do **not** import the zCloud dashboard's
  Basic Auth into this game site; it would block users and WebSocket rooms.
- Confirm the active Caddy site path
  `/etc/caddy/sites-enabled/fuckball-game.caddy` is not already owned.

## Apply after operator approval

From the *approved* code checkout on the exact new host:

```bash
bash ops/publish-fuckball-new-vps-20261023.sh --status
# Only after existing game/data/route cutover is explicitly confirmed:
sudo env FUCKBALL_CUTOVER_CONFIRMED=yes \
  bash ops/publish-fuckball-new-vps-20261023.sh --apply
```

The publisher holds the same Caddy publication lock as the separately
prepared zCloud dashboard script. It refuses wrong host, bad/ambiguous DNS,
incomplete Caddy import, unhealthy or publicly-bound backend, unexpected
existing site and failed Caddy validation/reload. It installs one additive
site drop-in, checks **certificate-valid** local TLS and real `/health` JSON,
and removes its own site from active imports if validation fails.

The publisher never installs dependencies, starts/stops Node, copies app
state, changes port/firewall rules, stops old VPS jobs, manipulates runner
registrations or touches training storage.

## Acceptance from a different network

- `https://fuckball.zennay.nl/health` returns live JSON with
  `ok:true`, native engine and 60-Hz physics (not a static shell).
- `https://fuckball.zennay.nl/` serves the real game with a trusted TLS
  certificate; no browser mixed-content errors.
- From two independent browser sessions, create/join an online room via
  the same-origin `wss://fuckball.zennay.nl/ws` connection, play and
  confirm server snapshots. This checks more than a superficial HTTP 200.
- Sign in using an existing account and confirm its historical data is
  present. Preserve privacy of the account-data directory.
- Update the old-IP `.github/workflows/public-health.yml` to the new
  HTTPS origin **only after** the public game is really accepted.
- Verify the new route and known-good game still work after a separately
  authorized service restart, then retain old-host rollback as required by
  the umbrella migration.

## Current execution boundary

The connected zSSH 3.0 profile reaches the new host, but its current
`exec_mode` is `disabled`; it grants neither systemd inspection/restart
nor write access under `/etc/caddy`. Preparing this repo file does **not**
publish the domain. Use an explicitly authorized, scoped deployment channel
and preserve existing release/CI gates.
