# Private Friendly Tournament Desk

Fuckball's home page now includes a collapsible **Friendly Tournament Desk**. It is an offline, local organizer for friends and private clubs; it is **not an online tournament authority**.

## Use it

1. Open **Home → Friendly Tournament Desk** and choose **New tournament**.
2. Enter a tournament name and **2–12 unique team names**, one per line. Choose single round robin or two legs (home and away).
3. The app creates a complete round-by-round fixture calendar. Use **Still to play**, **All fixtures**, or **Round N** to navigate.
4. After a friendly actually takes place, enter its **manual** score (0–99 per side) and choose **Save score**. Use **Update** to correct a mistake or **Clear** to remove an unverified result.
5. The live local table is calculated from recorded fixtures: 3 points per win, 1 per draw, then goal difference, goals scored and alphabetical team name as deterministic tie-breakers.
6. **Backup JSON** downloads a complete editable-source snapshot with all fixtures, teams and results. **Restore JSON** verifies team uniqueness, schedule shape, every fixture pairing/round and bounded scores, then asks permission and creates a separate local copy. It does not overwrite an existing tournament.
7. **Table CSV** exports standings. **Fixtures CSV** exports every scheduled and played fixture with score state, dates and venues; formula-like name cells are escaped.
8. Each fixture has an optional **local kickoff date/time** and venue. Choose **Set kickoff**, or **Remove date** to clear both. The **Upcoming scheduled** view shows future kickoff dates for games without a score.
9. **Calendar ICS** downloads only fixtures with a kickoff time as an offline calendar. Times are encoded in UTC for reliable import, each event has a one-hour *placeholder* duration, and event descriptions explicitly mark friendlies as unofficial. Exporting does not invite people or create events in their accounts.

## Boundaries and data

- Existing version 1 JSON backups without kickoff/venue fields remain importable; optional schedule fields are normalized and validated before persistence.
- Supports up to **eight** local tournaments, up to **12** teams per tournament, at most **132** fixtures in a two-leg 12-team round robin, and a **128 KiB** local storage budget.
- All tournament state lives in the browser's localStorage under fuckball.local-tournaments.v1. It is not synced across devices, accounts or online servers. Backup/download uses a temporary local Blob URL. Restore accepts JSON up to **96 KiB**.
- Date/time and venue are user-entered planning notes; Calendar ICS and fixture CSV contain only the selected local friendly schedule. No remote calendar API is contacted.
- This workflow does not request server fixtures, touch native-room scores, account credentials, Club memberships, ranked outcomes, player IDs or matchmaking. **All results are manually supplied, unverified friendly scores.**
- Standings and the calendar are rendered with textContent, not injected HTML; imported fixtures must match the deterministic schedule derived from team names and leg count. Imported tournament IDs are replaced to prevent overwriting existing state.
- Deletion requires confirmation and erases only this selected local tournament. Export before deleting or clearing your browser's site data.
- Game rooms remain independent. Hosting or playing a match is still done through existing online modes. Tournament Desk does not authorize or automate a native game.

## Technical integration

- dist/tournament-desk.js owns the local UI, schedule generation, input validation and persistence.
- dist/tournament-desk.css supplies mobile layouts, keyboard focus and standings presentation.
- dist/index.html mounts the new optional home-page module without changing existing navigation or physics.
- dist/sw.js includes both public files in the offline static allowlist (v46); no APIs, account data or WebSocket endpoints.

Required existing CI/review and separate release safety gates remain unchanged. This is source delivery until CI and production release are completed.