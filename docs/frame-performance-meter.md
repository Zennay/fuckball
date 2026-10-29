# Frame Performance Meter — player-side rendered FPS trends

Open a genuine local, replay or online game and click **PERF** near the match menu. The optional compact panel reads only the FPS number already maintained by the game's render loop. It samples approximately once per foreground second for a rolling 90-second view.

- The displayed median and low-end P10 FPS are computed from retained observations of the game's own painted FPS counter. This is a subjective local display-performance indicator, **not** a GPU profiler, native 60Hz simulation benchmark, server tick measurement, ping, jitter or packet-loss metric.
- Set a personal FPS display goal (60 / 120 / 144 / 165 / 240) to highlight whether recent actual readings are near that number; this does not alter any setting or promise the hardware can reach it.
- **Apply native Performance preset** clicks the already shipped Performance profile through its existing native UI, which selects 70% rendering and a 60-FPS display cap. It does not affect physics, input, game speed, authoritative netcode, opponents or the room host.
- The player may export a small temporary CSV of seconds/FPS only. It contains no token, account name, player identity, room code, match result or replay contents. Nothing is uploaded or persisted without this deliberate file action.
- Collected samples are discarded when the tab or match becomes hidden; the graph only redraws when the panel is open to avoid unnecessary frame overhead. Reducing FPS cap may lower the readings but not the simulation's fixed 60 Hz.

This is a user-facing performance visibility and configuration feature, **not** a QA suite, regression run, or claim of an independently validated hardware performance figure.