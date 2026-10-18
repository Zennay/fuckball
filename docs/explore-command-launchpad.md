# Explore — Game-wide Command Launchpad

Fuckball now exposes an **Explore** button in the main game navigation and an optional searchable feature launcher.

## Player-facing workflow

1. Click **Explore** or press **Ctrl+K / ⌘K**. A keyboard-accessible dialog searches currently mounted game features across Play, Training, Competitions, Replays and Spectate.
2. Type a feature name or keyword (for example **cup**, **replay**, **practice**, **friends**, **match**, **tactics**). Select a result or use **↑/↓** then **Enter**. **Escape** closes the dialog.
3. Navigate to the chosen real game tool. Explore opens the appropriate existing Home, Match or My Games tab, expands the target if it is an optional details panel, scrolls it into view and focuses its summary. Actual gameplay actions (such as **Start solo training**) are explicitly titled rather than silently implied by general navigation.
4. Choose **☆** to pin a frequently used tool. The picker prioritizes favorites and up to six recently visited destinations. It stores only feature IDs in local browser settings; no account data, game state or remote analytics.
5. Toggle **Focus home** to leave just the core play cards visible on Home, hiding advanced panels until they are needed. This is a *local display preference*, not deletion; selecting an advanced panel from Explore temporarily exposes it again. Choose **Show all home tools** to permanently exit focus mode.

## Important distinctions

- Search results are generated from a **static, reviewed list of known game tools**, not arbitrary script execution. Only features actually present in the loaded UI are offered.
- It never synthesizes player movement, changes match scores, invokes a network action without an explicitly named user choice, accepts room invitations or bypasses game authorization.
- Favorite destinations, recent feature IDs and optional home focus preference use the bounded localStorage key `fuckball.launchpad.v1`. There is **no cloud synchronization**, telemetry or recording of entered search terms.
- If storage fails, navigation still works for the current session; the preference error is visible. The dialog uses native focus handling with support for Firefox/Chromium and a reduced-motion-aware scroll path.
- All existing product panels and direct navigation continue to work without using Explore. Keyboard input is only intercepted for the explicit Ctrl/⌘+K launch shortcut while ordinary game hotkeys are unchanged.

## Files

`dist/command-launchpad.js` and `dist/command-launchpad.css` are loaded after other public game modules by `dist/index.html`. Both are added to the public offline-practice static asset allowlist in service worker **v53**. Account APIs, rooms, secrets and personalized network responses remain outside the cache.

Existing CI, review, release approval, trusted runner and room/queue idle safety gates stay intact. Source integration alone does not prove a new production deployment.
