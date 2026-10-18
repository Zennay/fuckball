# Private Matchday Hub

The **Matchday Hub** on the Fuckball home page is a single, read-only summary of local friendly competition data. It unifies the previously merged **Tournament Desk** (round-robin leagues) and **Knockout Cup Builder** without creating new accounts, records, online results or server requests.

## Player workflow

1. Open **Home → Matchday Hub**. See local competition totals, recorded manual friendlies, league leaders and knockout winners (all self-entered/unverified).
2. Review up to 12 upcoming *manually scheduled* league fixtures across leagues, sorted by local kickoff. Locations appear only if the organiser entered them.
3. Use **Leagues**, **Cups** or **Tactics** to jump to the corresponding home-page organiser. The target panel expands automatically.
4. Choose **Overview CSV** for a private snapshot of competitions, progress, leader/winner labels and upcoming fixtures. CSV guards against formula-leading team and venue values. No upload or sharing takes place.
5. The Hub refreshes after local score/schedule changes, returning Home, opening the panel, cross-tab storage changes or explicit Refresh.

## Data and safety

- Reads only the browser localStorage keys `fuckball.local-tournaments.v1` and `fuckball.private-knockout-cups.v1`. Both collections are separately size-bounded, collection-limited and structurally validated before summary data is used.
- It does **not** change any competition data. It is a read-only local view. Existing league/cup save functions now emit a strictly local `fuckball:private-competition-change` event so the UI updates without polling or network calls.
- Competition names, score states and future kickoff times are treated as **manual/unverified friendly information**. A cup winner is derived only from the saved bracket and result chain. A league leader is labeled *current leader*, not champion.
- If either collection is malformed or unavailable, only that collection is skipped and a warning is shown. There is no automatic deletion, repair or score fabrication.
- No API, accounts, Clubs, ranked/ratings, ready-check, room input, user IDs, live scores, stadiums, AI model, physics, HBR2 or deployment state is read or mutated by this tool.
- The Hub is available in the optional offline public static pack (service-worker v49), alongside the existing separate organisers.

## Owned files

- `dist/matchday-hub.js` + `dist/matchday-hub.css`: dashboard.
- `dist/tournament-desk.js` + `dist/knockout-cup.js`: only local save-success event emissions.
- `dist/index.html` + `dist/sw.js`: mounting and offline static assets.

Required CI, owner claims, reviewer protections and release/room-idle/data-owner gates remain untouched. Merged source is not a claim of VPS-live deployment.
