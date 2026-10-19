# Solo Academy — Live Mission Companion

While an Academy mission is explicitly armed and a **real native LOCAL practice match** is running, a small nonmodal HUD shows the active mission and the source drill required. This applies only to offline play; it is hidden for online WebSocket rooms, peer matches, recordings being replayed, hidden tabs and inactive native games.

The companion reads only the existing mission and the original saved device-local First Touch / Goal Rush / Teamwork / solo match records. Once an original native drill records a **fresh successful completion** after the mission was armed, the HUD shows **Claim saved result**. This click calls the same original Academy progression mechanism as **Check native completion** on Home. No synthetic score, gamestate tick, AI inference, online result or automatically claimed achievement is introduced.

**Academy ↗** navigates back through the existing Home control. In the existing navigation flow, active offline matches are paused as normal. The HUD suppresses itself while the already-existing three-step Training Circuit HUD is visible so its instructions are not obscured. On mobile the compact prompt is placed above the lower touch control region.

All saved values remain device-private, and the player controls each mission transition. No additional requests, engine changes, permissions, background scheduling or tests are added.
