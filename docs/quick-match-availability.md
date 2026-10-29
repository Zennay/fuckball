# Real-player Quick Match availability

The Quick Match home panel now shows **measured native-server queue occupancy** for 1v1, 2v2, 3v3 and 4v4. These are counts of genuine signed-in, connected human clients, not synthetic players or predictions.

The server exposes read-only `GET /api/quick-match/availability`, returning `{humanOnly:true, ranked:false, at, modes}`. For each mode, `waiting` counts connected users still in that playlist's waiting pool; `confirming` counts connected people in an unexpired ready-check; `needed` states that match format's fixed total. Party members are counted as people, but their names, team, account tokens, socket IDs, club memberships, IPs and skill estimates are never returned.

The browser refreshes these *server-only* counts every 15 seconds while the home screen is visible and shows a plain unavailable state when offline or the endpoint cannot be reached. No estimated waiting time, phantom rank, reservation, opponent identity or guarantee of future availability is shown. Starting Quick Match still requires an authenticated WebSocket and consent from **every human player** during the existing 15-second ready-check.

Because this endpoint is deliberately a public aggregate, avoid adding identity-bearing fields or exposing hidden/private Custom Rooms. It uses `Cache-Control: no-store` and is never eligible for PWA offline caching.
