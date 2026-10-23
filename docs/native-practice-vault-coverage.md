# Local Data Vault — native offline practice coverage

The existing **My Local Data Vault** now includes all six additional native local practice sources: **Goal Rush**, **Teamwork**, **Clean Sheet**, **Rocket Kick**, **Keep Away**, and **Sudden Death**. Previously only a subset of native achievements (AI Gauntlet and Comeback Arena) was in the vault.

Each source is an explicit device-local storage key, separately selectable in the original archive view. Up to 20 recent, structurally validated records are included per source with bounded text payload sizes. Sudden Death entries are checked against actual per-round recorded outcomes, frame lengths, counts and winning series condition. Other sources use the documented native practice counters and completion expressions; no unverifiable saves, possession percentages, ranks or AI achievements are invented.

Exports are JSON proof and evidence summaries only. Imported archives may be **opened for inspection and individual read-only download**, but no importer writes another device's fake local victories, account/Elo records, match outcomes, replays or rewards. Original categories and existing archive format version remain backward compatible. The vault does not touch session tokens, HBR2 IndexedDB records or production data.

Only the local vault UI/source and this documented product boundary changed. No new QA, regression or tests have been authored or executed. Existing mandatory exact-current-head CI, review, authorization and protected live VPS release gates remain required.
