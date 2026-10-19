# Local Match Loadouts — real solo practice configurations

Under **Home → Local Match Loadouts**, a player can create up to eight named device-private setups for the **existing** Fuckball solo sandbox (not the human Quick Match queue).

Each loadout contains a native mode (**1v1 vs AI, Solo Practice, 2v2, 4v4**), AI difficulty (**Easy / Normal / Hard / Elite**), score limit (**none / 3 / 5 / 10 goals**), time limit (**0–99 minutes**) and a built-in/native stadium.

**Play local match with these settings** validates the selected controls and calls the original native `pendingSessionBlock()` and `quickPlay()` session path. It refuses to take over a native online room, direct-peer connection, queued human match, ready check or room invitation. If an existing local match or replay would be replaced, the player explicitly confirms first. Only then does the loadout select the original native stadium and normal local game control values and run the existing game reset. No new physics, local player or AI implementations are introduced.

**Save as new**, **Save changes to selected**, and **Delete selected** manage a strictly bounded, validated eight-item localStorage collection. Storage changes in another tab prevent stale writes. Existing unreadable collection data is never overwritten. JSON backups contain loadout names and game settings only; no accounts, tokens, player ratings, room presets or history. **Restore loadouts** requires the player to explicitly confirm replacing their own saved presets, never actual game history.

Built-in stadium identifiers are validated against the native currently installed stadium list, and imported custom stadium files are deliberately **not** stored as loadout code or included in exports. Saved loadouts are user preferences; they are not match results and confer no online capabilities.
