# Private 4v4 Formation Studio

The home page now offers an optional, locally saved football **Formation Studio** for drawing a private 4v4 plan. It does **not** control online rooms, player inputs, clubs, physics, AI policies or ranked results.

## Player workflow

1. Open Home → Formation Studio and choose New plan. Enter a short label.
2. Move the four red, four blue and ball markers by touch or mouse drag. Alternatively select a marker in the accessible position buttons, focus the tactical canvas, then use arrow keys (Shift+arrow for larger steps).
3. Select Draw passing arrow and then choose two player discs to mark an intended pass or off-ball route. At most 16 arrows are kept per plan. Clear arrows when redrawing.
4. Duplicate a plan to explore variants; Reset discs restores standard positions while retaining arrows. Multiple plans are available in a local dropdown.
5. Save PNG exports a tactical diagram; Save JSON exports the underlying editable plan. Restore JSON checks field types, coordinate limits, unique arrows and schema before requiring explicit confirmation and creating a separate plan, never overwriting current work.
6. Delete requires explicit confirmation. The collection has a hard limit of 12 plans.

## Privacy and safety

- Only browser localStorage (fuckball.private-formation-studio.v1) is used. No network request or synchronization. A maximum 64 KiB local state budget, max 32 KiB imported JSON and 8 MiB PNG download bound apply.
- Coordinates are normalized between 3% and 97% of the private schematic field. The studio is intentionally **not** an in-game stadium editor or an authoritative lineup planner.
- Export happens only after an explicit button click. Imported plan IDs are replaced, preventing collisions and accidental overwrites.
- All names are text-rendered (not HTML). It does not read account/session credentials, live room data, replays or confidential network endpoints.
- Source files are dist/formation-studio.js and dist/formation-studio.css. The existing dist/index.html loads the module on the home page; dist/sw.js v47 adds only these public static assets to the offline practice allowlist.

Normal CI, permissions, branch protections, safe-room/queue release gates and production deploy preconditions remain unchanged. Source merged does not by itself establish a live VPS deploy.