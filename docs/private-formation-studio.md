# Private 4v4 Formation Studio

The home page now offers an optional, locally saved football **Formation Studio** for drawing a private 4v4 plan. It does **not** control online rooms, player inputs, clubs, physics, AI policies or ranked results.

## Player workflow

1. Open Home → Formation Studio and choose New plan. Enter a short label.
2. Move the four red, four blue and ball markers by touch or mouse drag. Alternatively select a marker in the accessible position buttons, focus the tactical canvas, then use arrow keys (Shift+arrow for larger steps).
3. Choose a **4v4 formation preset** (Balanced 1–2–1, High press, Compact block). Apply it only after confirming replacement of both mirrored team layouts and clearing the previous passing arrows.
4. Use **Import .hbs background** to select a real HaxBall stadium file (up to 2 MiB). The game's existing native stadium parser validates the file. Only at most 160 bounded, visible stadium outline segments and basic dimensions are copied into this private plan; not the original raw stadium code. All player positions and arrows stay unchanged. Choose **Default pitch** to remove this visual background.
5. Select Draw passing arrow and then choose two player discs to mark an intended pass or off-ball route. At most 16 arrows are kept per plan. Clear arrows when redrawing.
6. Duplicate a plan to explore variants; Reset discs restores standard positions while retaining arrows. Multiple plans are available in a local dropdown.
7. Save PNG exports a tactical diagram; Save JSON exports the underlying editable plan. Restore JSON checks field types, coordinate limits, unique arrows and schema before requiring explicit confirmation and creating a separate plan, never overwriting current work.
8. Delete requires explicit confirmation. The collection has a hard limit of 12 plans.

## Privacy and safety

- Existing private v1 tactics JSON backups without a stadium remain importable; the optional stadium object is normalized and bounded with the existing plan.
- HBS stadium imports affect **only the locally exported diagram**, never the native game's selected stadium, live/peer room, physics, account or server. Native stadium geometry is an approximation of visible straight segments; curves, invisible barriers and collision physics are not claimed to be accurately reproduced.
- Only browser localStorage (fuckball.private-formation-studio.v1) is used. No network request or synchronization. A maximum 64 KiB local state budget, max 32 KiB imported JSON and 8 MiB PNG download bound apply.
- Coordinates are normalized between 3% and 97% of the private schematic field. The studio is intentionally **not** an in-game stadium editor or an authoritative lineup planner.
- Export happens only after an explicit button click. Imported plan IDs are replaced, preventing collisions and accidental overwrites.
- All names are text-rendered (not HTML). It does not read account/session credentials, live room data, replays or confidential network endpoints.
- Stadium import uses Utils.parseStadium / Utils.exportStadium, the game's existing native stadium parser/exporter, and derives at most 160 preview lines from its validated visible segment endpoints. Failure is explicit; no temporary server authority.
- Source files are dist/formation-studio.js and dist/formation-studio.css. The existing dist/index.html loads the module on the home page; dist/sw.js v47 adds only these public static assets to the offline practice allowlist.

Normal CI, permissions, branch protections, safe-room/queue release gates and production deploy preconditions remain unchanged. Source merged does not by itself establish a live VPS deploy.