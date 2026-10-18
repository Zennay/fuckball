# Private Game Night Pack

The home page now offers a **Game Night Pack** for preparing a complete offline friendly event. It transfers local competition **planning state only**: round-robin leagues, knockout brackets and private Formation Studio tactics diagrams. It does **not** transfer player accounts, room tokens, online fixtures, verified scores, original stadium files or recorded HBR2 bytes.

## User workflow

1. Open **Home → Game Night Pack**. The private inventory shows how many local leagues, cups and tactics plans are stored on this device.
2. Choose **Backup game night** to download a single dated `.json` file with all three sets, including user-entered scores, optional league kickoff times and venues, cup progression and saved tactics geometry.
3. On another device, open **Home → Game Night Pack → Restore game night**. The app checks the portable format and thoroughly validates **every** record. It also confirms each existing collection has enough free capacity.
4. Review the confirmation message showing how many league, cup and tactics copies will be added. Choose Cancel to leave everything untouched. Confirm to insert them as **new, separately identified private copies**; existing items are not replaced.
5. The installed League, Cup, Formation and Matchday panels are refreshed after a completed restore. This requires no account, network or server. You can then update the new copies independently.

## Safety and limits

- Reads only these existing browser-local keys:
  - `fuckball.local-tournaments.v1` (up to 8 leagues; maximum 128 KiB).
  - `fuckball.private-knockout-cups.v1` (up to 8 cups; maximum 96 KiB).
  - `fuckball.private-formation-studio.v1` (up to 12 formation plans; maximum 64 KiB).
- A portable pack is at most **320 KiB**. Imported leagues must have the exact deterministic round-robin schedule for their entrants and legs; knockout scores and tiebreaks must have valid advancing-team provenance; tactics discs, directed arrows and optional HBS-derived visible drawing must be within their supported local bounds.
- Every imported item receives a fresh local identifier. Existing scores remain self-entered and **unverified**, not server-confirmed results. No account/session, ranked state or online match data is accepted.
- The browser has **no atomic multi-key localStorage transaction**. Import stages and checks all three complete target collections before writing, rechecks the previous values immediately before mutation, performs bounded synchronous writes, and on write failure attempts to restore the saved previous values. If browser storage itself fails, the UI explicitly asks the user to reload and inspect the data. Do not treat this as database-grade ACID.
- Same-tab update events are emitted only after all writes succeed. Existing League/Cup/Formation panels then re-read their own original-format records; no global network event is sent.
- The pack is **not** a substitute for the existing `My Games → Backup all ZIP` flow, which is needed to transfer underlying saved HBR2 recordings and coaching history. Back up real replay files separately.
- All descriptions and names are treated as plain text. Only a user-initiated download or restore reads or changes private planning data.

## Technical integration

`dist/game-night-pack.js` and `dist/game-night-pack.css` are loaded on the game home page by `dist/index.html`. The installed offline static file allowlist version **v52** includes them and still excludes account APIs, rooms, tokens and private network traffic.

The merge is source delivery only; existing exact-head CI, trusted-runner, approval, idle-room and production deploy gates remain in place. No new live VPS release is implied.
