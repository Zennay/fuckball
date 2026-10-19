# Private Replay Collections

**My Games → Your Collections** now supports permanent private folders for real locally saved HBR2 recordings. The existing eight-item **Review Queue** remains a separate one-time playback workflow; collections are a persistent way to curate training themes, favorite goals and examples.

## Complete player workflow

1. Open **My Games → Your Collections**, select **New collection**, then name it. You can keep up to **12** folders.
2. Filter the available local HBR2 recordings, select one and choose **Add replay**. Each collection supports up to **30** unique recordings. A recording may be in multiple collections, without duplicating its underlying bytes.
3. Choose **Review collection** to send the first eight available HBR2 shortcuts (in your order) to the existing temporary Replay Review Queue. Confirm before replacing an existing queue. The queue retains its existing Previous/Next, optional auto-next and review session controls; collections and HBR2 files stay untouched.
4. Reorder recording shortcuts using **↑/↓**, or select **Open** to play an actual saved recording through the existing HBR2 replay viewer. Existing bookmarks and coaching-note UI stay available.
5. Edit the folder name and private description, remove shortcuts, or delete a folder after confirmation. **Deleting a collection never deletes any HBR2 files.**
6. Choose **Collection JSON** to export only the folder index (IDs and private description). Choose **Restore collection** to import a compatible index as a new folder, including only recordings that really exist on the current device. Unavailable HBR2 IDs are explicitly reported and skipped, not fabricated.
7. Choose **Study guide** to download a Markdown document with each available recording’s duration, locally parsed Red/Blue goal markers, verified timestamped personal coaching notes, and optional self-review. This is an offline, self-entered research aid — no official match results, player stats or ratings are inferred.
8. Use the existing **My Games ZIP backup** separately to back up the underlying HBR2 bytes. A collection JSON **is not** a full replay archive.

## Boundaries

- Device-only data under `fuckball.replay-collections.v1`; up to **12** folders, **30** replay IDs per folder, **60 KiB** metadata storage, **16 KiB** JSON import and **96 KiB** study-guide download limit.
- An imported index must pass bounded schema and duplicate checks. Missing local recordings are skipped after explicit user confirmation; imported collections receive fresh identifiers and never overwrite an existing folder.
- Recordings are only opened by the existing `ReplayLibrary.get` + `loadReplay` flow. All HBR2 bytes and metadata stay in My Games IndexedDB, unchanged by collection management.
- Existing `ReplayLibrary.normalizeNotes` / `normalizeReview` constrain the optional Markdown coaching export; corrupted per-recording coaching details are omitted with an explanatory note. Names are rendered with `textContent` and Markdown formatting characters are escaped.
- Queue integration uses a local UI event and only accepts IDs of actually present replay metadata. It does not start or auto-accept a queue; the player must choose **Start review**.
- The component does not request online match history, rankings, players, account details, cloud endpoints, rooms, WebSocket scores, physics or bots.
- A concurrent-tab change is detected before writes to avoid silently overwriting a different folder state. Incomplete storage raises a visible message, not an invented successful save.

## Integration

New files `dist/replay-collections.js` and `dist/replay-collections.css`, loaded after existing Review Queue in My Games via `dist/index.html`. Only these public static assets are added to the service-worker offline allowlist **v51**.

All existing GitHub CI, permissions, release and safe-game-state gates remain unchanged. A merged PR does not imply the production VPS was deployed.
