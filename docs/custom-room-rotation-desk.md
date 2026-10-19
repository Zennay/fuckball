# Custom Room Rotation Desk

**Match menu → Room → 4v4 Team bench & substitutions → Rotation Desk**.

The desk reads only the existing authoritative Custom Room roster, server-issued accumulated active frames, team bench assignments, appointed captains, active substitution requests and disconnect markers. Each side gets its own active/bench list and playing-time display.

### Real workflow
1. Pick Red or Blue and inspect the current on-pitch players and assigned bench.
2. The desk can suggest rotating the **longest-active connected player** off for the **least-active connected eligible teammate** on that side’s bench. Missing server measurements do not become guessed playing time.
3. The **Manual Rotation** selector also supports any current connected on-pitch player and available same-side bench player, for a host/captain who wants a different tactical swap.
4. An eligible captain or the host can click **Prepare**. The genuine existing Native Room Out/In selectors are filled in and its **Propose swap** button is focused.
5. Nothing is transmitted until the operator explicitly clicks the native propose button. The original server rechecks permissions, live roster, identity, overlap, queue and pause rules; the incoming bench player still has to consent. Pending team swaps disable suggestions.
6. Explicit optional local CSV export lists the roster and observed on-pitch time. Player names are not exported without confirmation; no endpoint, cloud or third-party service is contacted.

This is **not** automatic rebalancing, guaranteed fairness, an official match statistic, or a verified league result. Bots are excluded from human rotations; reconnecting players cannot be suggested. The desk never gives a spectator captain authority or changes the accepted BFF physics / netcode / server protocol / Quick Match / Clubs.

PWA stores its UI assets, never a roster snapshot or credential.
