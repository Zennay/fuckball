# Host Fuckball free with a real multiplayer backend

[**Deploy the complete game to Render (free)**](https://render.com/deploy?repo=https://github.com/Zennay/fuckball)

## What is included

- The existing Node.js 22 server (`npm start`), original BFF stadium and native 60 Hz engine.
- HTTPS website and same-origin secure WebSockets (`wss://`) for room creation and invitations.
- A Frankfurt deployment region near EU players and Render's free `*.onrender.com` hostname.
- Built-in server health check at `/health`. Build-time `npm test` and `node --check server.js`.
- `FUCKBALL_PEER_HOSTING=off` by default so participants' IP addresses are not exposed through peer WebRTC.
- Independent instance: deploying here does **not** change, reset or restart the VPS service at `198.244.191.182:3417`.

## First launch

1. Open the **Deploy to Render** link above, sign in/create a Render account, and approve the `fuckball-game` web-service Blueprint.
2. Keep the **Free** instance plan, review the `frankfurt` region and launch the service.
3. When it says **Live**, copy the actual HTTPS `*.onrender.com` URL from the service dashboard. The name is not reserved until Render creates it.
4. Test `<actual-url>/health` (expect `"ok":true` and `"physicsHz":60`), open the homepage, create a room and join it from another browser via its HTTPS invite link. The WebSocket stays on the same origin.
5. After verifying room joins, use the HTTPS URL for players. Keep the original VPS untouched until gameplay and physics acceptance has been checked.

### Limitations of the zero-cost plan

- **Cold starts:** after about 15 minutes without inbound HTTP traffic or WebSocket messages, the service sleeps. The first connection afterward can take about a minute. This is unsuitable for always-on competitive ranked matches.
- **Storage is temporary:** free web services have no durable filesystem. Fuckball writes local `accounts.json`. Registering or logging in may appear to work, but credentials/identities can disappear after a restart, sleep or deploy. **Treat this deployment as guest/casual play only. Do not promise durable accounts or ranking.** Use a persistent datastore/migration before inviting anyone to create an account they expect to keep.
- **In-memory rooms:** all live games/rooms end when the instance sleeps, restarts or redeploys. Room invitations then expire.
- **Usage limits:** 750 free instance hours per workspace/month plus bandwidth/build-minute limits, subject to Render's current policies; large 60 Hz rooms can use meaningful bandwidth.
- **Release safety:** `autoDeployTrigger: off` is intentional while [physics recovery #9](https://github.com/Zennay/fuckball/issues/9) remains open. New commits must be deliberately deployed through Render after CI and gameplay verification.

## Smoke test after the new URL is live

```sh
node scripts/verify-live.cjs https://YOUR-ACTUAL-RENDER-SERVICE.onrender.com
```

This checks the engine, BFF stadium hashes, client UI, a real WebSocket connection and room creation. Never invent a URL or mark the hosting migration complete before this passes.

If the requirement is **always-on, persistent multiplayer**, a free Render instance cannot promise that. The existing VPS is more reliable for production matches while this free service is evaluated.

Official references: [Render free limits](https://render.com/docs/free), [Render WebSockets](https://render.com/docs/websocket), [Render Blueprint setup](https://render.com/docs/infrastructure-as-code).
