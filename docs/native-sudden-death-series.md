# Native Sudden Death Series — player behavior

A separate **offline, unranked** 1v1 against the existing real local AI. No alternative simulation, server-authoritative human matching, private accounts, Elo, physics, or permanent match settings are changed.

## Play

Open **Home → Practice Lab → Sudden Death**, select Best of 3/5/7 and an active 60/90/120-second round clock, then start. Starting a new series asks consent before replacing an already running local match or replay. Fresh native 1v1 is created with ordinary real local AI on each **player-initiated** next round.

The player whose side scores the first **native engine** goal wins that round. If neither scores before the configured **active native frame** duration, the round is drawn. All goals use the actual engine score, not client guesses at ball crossing, AI aim, shots or saved-match metadata. A score reset, new room, lost player identity, tab hiding, or leaving the pitch interrupts the series, **without** saving a fictitious complete result. Pausing the engine also pauses the round clock.

The series finishes as soon as either side earns a majority of rounds, or the chosen round count is exhausted (including draws). A draw in the overall series is shown as a draw rather than an invented win. Round-by-round results are displayed on the match overlay; starting the next round requires an explicit button click.

## Persistence and privacy

Only completed series are retained in device-local storage, bounded to the 20 newest records, using the key `fuckball.native-sudden-death.v1`. Home shows a private history with JSON export and deletion. Practice Lab includes this mode and aggregates saved, actually won series as local practice **objectives**, not competitive win rate or verifiable Elo. No player name, token, scorecard, location or match upload occurs. Interrupted rounds never enter history.

PWA assets for the mode are static-only; the service worker does not cache live room state, public listings, WebSocket frames, protected-room keys or accounts.

## Release boundary

Source and static assets are available in GitHub after merge. They do **not** prove a VPS live release. Existing required CI, review, access and authorized immutable release/drain/rollback controls apply. No QA suites are added or invoked as part of this feature.

## Share a private local result card

Every completed saved series now has a **Save private PNG scorecard** action. The result card draws the actual local round wins/draws and time configuration on a self-contained browser canvas and downloads the PNG to the device. It contains **no usernames, tokens or account identifiers**, and deliberately labels the result as unranked and not server-verified. Incomplete series cannot be exported as results.
