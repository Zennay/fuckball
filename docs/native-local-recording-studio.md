# Local Native HBR2 Recording Studio

## Player experience

The existing **Match → Recording Studio** provides explicit options to **start recording each new offline kick-off** and **save a finished native HBR2 into My Games**. Players can still press the existing **● Record** button or the Studio's Start/Stop action. Neither option changes match physics, 60 Hz simulation, AI choices, game rules or server-authorized matchmaking.

When a genuine local engine recording finishes, the **original `.hbr2` is downloaded immediately**, exactly as before. When the player has also opted into saving to My Games, the **identical native bytes** are passed to the existing canonical `ReplayLibrary.save` method (which validates HBR2 content, preserves recording frames and uses the original IndexedDB transaction). No unofficial result, badge, replay timing, account history, server verification or competitive rating is added.

- Auto-record only arms subsequent **offline** game kick-offs. It neither restarts nor changes the currently running match.
- An active Custom Room, Quick Match, direct-peer session, replay or pending invitation cannot be auto-recorded as a local session. Other existing native recording workflows keep their original file download.
- The original download is maintained even when saving to My Games fails, is too large (32 MB per replay), lacks quota or is disabled. The user receives an actionable status message. Concurrent saves are limited and serialized; any overflow leaves the downloaded original available for manual import.
- Both options default to **off** and are saved only in a bounded browser-local preference. No server calls, tracking, file uploads, account tokens or new IndexedDB schema.
- My Games is still limited to its canonical 30 local recordings / 160 MB total. Saved files are immediately available in the existing replay browser, bookmarks, ZIP backup, Continue Watching and study workflows.

## Integration / release

The existing engine `finishRecording` exports a constrained local event after its original download. The original `resetMatch` emits a post-kickoff event only after creating its real game; the optional UI listens without wrapping or replacing physics functions. New UI/CSS is part of the static offline PWA shell, without caching private recordings or online room traffic.

This is browser-owned footage and may contain recorded participant names. The feature never uploads those names. It is **not** a ranked result or evidence of a live VPS release. Protected GitHub branch, mandatory CI/security review and separately authorized immutable production release/drain/rollback gates remain unchanged. No manually written or run QA/regression suites.
