# Match View Presets

Open **Match menu → Settings → MATCH VIEW PRESETS**. Choose a preset; changes apply immediately to **existing native client settings controls** and are saved through their original handlers.

- **Balanced:** native resolution, refresh-rate rendering, full pitch, standard HUD and audio.
- **Performance:** 70% resolution, 60 FPS display cap, full pitch, focused HUD; no simulation tick or network change.
- **Quiet Pitch:** focused HUD, local pitch-chat text hidden, sound effects off. Does **not** mute anyone, change message delivery or conceal chat from the server.
- **High Visibility:** native resolution with high-contrast scoreboard/menu appearance.
- **Spectator View:** full pitch, native quality and clear HUD (camera only; does not change team or grant spectator rights).

**Undo last preset** restores the exact previous UI settings while staying on the active tab (clears when the document is hidden). You can always fine-tune individual options in the same native Settings pane.

The feature never changes physics, input mappings, gameplay prediction, WebSocket/peer transport, host identity, online ranking, authoritative chat moderation or accounts. Render FPS limits are display settings, not the native 60Hz simulation speed.
