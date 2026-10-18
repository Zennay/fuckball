# Private Knockout Cup Builder

Open **Home → Knockout Cup Builder** to run an entirely **device-local, unofficial** elimination competition. No private accounts, WebSocket rooms, match identities or official results are read.

## Tournament flow

1. Create a named cup with **2, 4, 8 or 16 unique teams**. Enter one team per line (1–35 characters). Optionally shuffle initial positions, or leave the submitted seed order unchanged.
2. A complete single-elimination bracket appears: Round of 16, quarter-finals, semi-finals and final as appropriate. Future fixtures remain marked *Winner pending* until the actual earlier result is recorded.
3. Enter both scores from an actual friendly (0–99). A tied result requires explicitly choosing the winning side of the **tiebreak**; the tool never invents extra-time or penalties.
4. Winners advance automatically, and the final column shows the manually recorded cup winner. An earlier result may be corrected or cleared. **If that changes who advances**, the app identifies later recorded results on that bracket path and requires confirmation before clearing only those dependent results. Unrelated matches are preserved.
5. Save a complete cup as JSON; restore it as a **new** cup after strict structural checking and explicit permission. Download match CSV (all rounds, teams, manual goals, tiebreak, advancement) or print the bracket. Delete a cup only after confirmation.

## Guarantees and limits

- Up to **8** local cups with up to **16 entrants** and **15 games** per cup. All cup data uses browser localStorage, with a **96 KiB** overall cap and a **48 KiB** backup import cap.
- Imported bracket IDs, round numbering, score state, progressing entrants, timestamps and team names are verified. No half-recorded scores, impossible later-round winners, missing fixtures, duplicate IDs or tied matches without a tiebreak outcome are admitted. Imports receive a fresh local ID and do not overwrite other cups.
- Concurrent-tab updates are detected before writes to prevent silent lost updates. Storage unavailability results in a visible error rather than fabricated persistence.
- User-entered names render as text, not HTML. CSV fields are escaped to avoid formula execution in spreadsheet applications.
- No ranked state, server scores, Club or team permissions, bots, AI policy, real game state, match physics, network requests or third-party calendars are changed.
- The cup is a **private organiser, not a tournament server**. Its results must not be represented as authoritative game or matchmaking outcomes.

## Files and release

- `dist/knockout-cup.js`: bracket model, UI, results, dependent match clearing, persistence and exports.
- `dist/knockout-cup.css`: responsive mobile bracket, keyboard focus and print presentation.
- `dist/index.html`: optional home-page module.
- `dist/sw.js`: static public-file offline pre-cache version 48; no private API data cached.

Existing mandatory CI, trusted-runner, release/permission and safe-active-room checks remain unchanged. GitHub merge alone is not a verified live VPS deployment.
