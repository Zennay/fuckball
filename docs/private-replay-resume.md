# Private HBR2 Replay Continue Watching

**Home → My Games → Continue Watching** shows a shortlist of locally saved, unfinished replays and the last recorded HBR2 playback timestamp for each.

The user can **Continue** the original saved replay at that position, or **Forget** the playhead without deleting the actual HBR2 recording. Inside the existing replay viewer, a **Resume saved position** button allows explicit seeking to the saved timestamp and an independent **Forget saved position** action. Existing Watch / navigation / bookmarks / review queue behavior remains available.

Playback position is recorded **only** while watching a saved local replay from the original IndexedDB library. The record contains only its local opaque 32-hex ID, elapsed playback milliseconds, duration and save timestamp; it is device-private under `fuckball.local-replay-resume.v1`, capped at 30 records and expired after 90 days. There is no server endpoint, background upload, HBR2 mutation, cloud synchronization, ranked match status, player account, replay metadata overwrite, or permission escalation.

Playback completion removes the old resume point near the end of the recording. The app does not auto-switch to another game or seek without explicit user input. Opening a saved recording refuses active online/peer/Quick Match sessions and asks for consent before replacing local work. A missing or deleted local recording cannot be opened using stale metadata.

New JavaScript/CSS are static PWA assets only. Existing project CI, security, code review and protected production immutable release/rollback gates are unchanged. This source feature is not proof of a VPS live release. No QA or regression suites were added or run during development.

**Home → Continue Playing** also shows a saved resume timestamp on the existing recent recording shortcut and offers an explicit **Continue at mm:ss** action. Sudden Death full-series history is included among recent local practice shortcuts; neither shortcut sends a server request.
