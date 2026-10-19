# Human Quick Match Recovery

**Play → Quick Match** now provides a visible **Search Interrupted** recovery panel after a genuine server cancellation, queue disconnection or non-requeued ready-check failure. It remembers only the format of the most recent attempted human solo search for this page visit, with no account credentials, queue tickets or room data saved.

**Retry [mode] human search** is a **fresh user gesture**: the native client validates the current account session, configured WebSocket URL (including HTTPS requiring WSS), current room/peer status and supported search mode before connecting again. It never automatically rejoins, accepts a ready check, changes rankings or installs bots. The user can instead open the original server configuration screen or dismiss the panel. Search progress and queue admission remain server-authoritative.

The retry action is not offered for party queue attempts because the original party composition and leader authority may have changed: party players must restart from the native party control. It is hidden on deliberate local cancel, declined ready check and successful match start. Server events arriving after a local cancellation cannot silently offer a new search when the player has already stopped.

Existing local and online matches, custom room authority, live game physics and replay code are untouched. The recovery UI is accessible and responsive. It does not poll, reconnect or perform network requests until the player deliberately clicks its original queue action. No QA/regression suites were added.
