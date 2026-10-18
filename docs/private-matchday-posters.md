# Private Matchday Poster Studio

**Home → Matchday Poster Studio** turns a previously saved private league fixture or manually entered friendly match result into a shareable 16:9 image. Everything is composed offline from existing browser-local data. The studio is not a live sports broadcast, does not read player identities, and does not verify official match outcomes.

## User workflow

1. Set a kickoff in **Tournament Desk** or record a genuine friendly result in **Tournament Desk / Knockout Cup Builder**.
2. Open **Matchday Poster Studio** directly from Home or through **Explore → Matchday Poster Studio**. Choose an available locally recorded fixture/result.
3. Customize the headline and subheading (for example Game Night / Private Friendly). Choose **Midnight**, **Turf** or **Light** color scheme.
4. The canvas shows local Red/Blue team names and the scheduled kickoff/venue *only when those were saved by the organiser*. For a manually recorded result it prints those two recorded score numbers; otherwise it shows **VS**, never a fabricated result.
5. Choose **Save private PNG** to download the image, or **Print preview** to print its current canvas. Names and text are user-provided and should be reviewed before sharing.

## Scope and boundaries

- Sources are localStorage keys `fuckball.local-tournaments.v1` and `fuckball.private-knockout-cups.v1`. Reads are bounded by 128 KiB/8 leagues and 96 KiB/8 cups. Basic schedule and score structure is checked before the generated poster references it. Up to 200 local fixture/result choices are shown at once.
- All rendered posters include an explicit **PRIVATE FRIENDLY · UNVERIFIED · NOT AN OFFICIAL MATCH RESULT** line. No scorer attribution, rankings, player identities, room IDs, account tokens, IP addresses, server match history or verified online scores are shown.
- The preview canvas is **1200 × 675** and is generated entirely inside the browser. An explicit PNG export is limited to **8 MiB**. No image files are uploaded and no third-party rendering API is called.
- Only headline, subheading and color scheme are persisted under `fuckball.matchday-posters.v1`. Actual scores, fixtures and identities are not copied into a separate poster database.
- Existing League/Cup pages remain the source of truth for their *manual private* data. The preview refreshes after competition edits, window visibility changes, or opening the panel.
- The feature is accessible directly or via the Explore launchpad and respects its optional Focus Home display choice. The player is always free to keep using existing CSV/ICS/JSON outputs.

## Files and release boundary

`dist/matchday-posters.js` and `dist/matchday-posters.css` are loaded after the Explore launchpad in `dist/index.html`. `dist/command-launchpad.js` has the matching search destination and Focus Home CSS is updated. Offline static cache **v54** includes only public JS/CSS; private API and account traffic are never cached.

Normal mandatory exact-head CI and all production deployment, trusted runner, authorization, room-idle and data-owner safety conditions are unchanged. GitHub merge alone does not confirm a live deployment.
