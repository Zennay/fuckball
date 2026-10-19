# Offline Player Passport — in Profile

The main **Profile** view now includes an **Offline Player Passport**, deliberately separate from the native-server authenticated career. It is available whether or not the user is currently signed in, because these records belong to the local device.

It combines *only* existing validated browser-local native events from First Touch, Goal Rush (maximum 20 retained attempts), Teamwork (20 retained attempts), the solo-vs-AI practice journal (30 completed matches), and the Academy's sequential mission counter. It shows actual local W/D/L by the player's saved team, target completion fractions, native kick follow-ups, 12-mission Academy progress, First Touch completion and a latest-16 activity timeline. These are not online rankings, inferred skill scores, verified completed passes, other people's identities or official multiplayer receipts.

The **Solo Academy** shortcut opens the original Home campaign. **Refresh** rereads the allowed keys only. **Printable private passport** creates an offline, self-contained, script-free HTML report of every retained activity after an explicit export confirmation. Text is escaped, external content is disabled by a restrictive CSP, and no account credentials, tokens, server data or HBR2 replays are included. Unreadable/malformed entries are excluded rather than rewritten or turned into fabricated performance.

Because the source histories are bounded by their original modules, the passport does not pretend to report lifetime totals; it describes just the still-retained local observations. Existing Profile native-server stats, Local Data Vault, game simulation, matchmaking, physics, ranking, AI, room ownership and data writers are not changed.
