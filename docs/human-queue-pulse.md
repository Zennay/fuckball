# Human Queue Pulse — Quick Match

**Play → Quick Match** shows a compact **Live Human Queue Pulse** after the selected WebSocket game server is confirmed to match the website server and its human-only, non-ranked queue occupancy API returns valid information.

It highlights which of the real 1v1, 2v2, 3v3 or 4v4 human playlists **currently has the most people waiting or confirming**. The action **Search [mode] with real people** still requires the user's deliberate click and invokes the existing native queue submission, account checks and multiplayer ready-check. Every format remains independently selectable.

If the same playlist remains the most populated on two consecutive valid snapshots, the display shows the increase, decrease or unchanged number of observed people since the previous sample. This is **not** an estimated wait, predicted admission probability, rating or outcome claim. It does not count bots or global players.

The suggested queue disappears when the server address is invalid/changed, cross-origin, unavailable or offline; if this browser tab is hidden; or when data validation fails. The button rejects entries older than 25 seconds, and cannot start a new search while an existing search is active.

No new network request, tracking, analytics service, account write, matchmaking algorithm, permissions or server API was added. This component reuses the existing public aggregate queue response and current human-only queue function.
