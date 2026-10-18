# Adjustable mobile touch controls

The existing on-pitch joystick and kick button can be configured from **Match Settings → Touch Controls**. Players can reverse the layout for left-handed use (Kick left, joystick right), enlarge or shrink controls from 75–150%, and adjust the movement deadzone (4–24 device-independent CSS pixels, scaled with the control size). **Reset touch layout** restores the default right-handed layout.

Preferences are stored locally on this browser under `fuckball.touch-controls.v1`; they do not travel with accounts, server match history or exported ranked results. Both pointer handlers continue sending the same native input bitset through the existing approved 60 Hz input path. This changes button size, placement and the joystick's threshold only, **not player acceleration, physics, wall bounce, kick strength, prediction or matchmaking**.

The toolbar is shown on mobile/touch layouts only; desktop keyboard and gamepad controls stay fully available. Mute, match security and network authority remain unrelated to local touch preferences.

This release adds a browser-only client module and styling, plus a minimal existing joystick input threshold hook. Offline PWA shell includes the static module and stylesheet, but local practice is the only offline match type. Normal existing PR CI and explicit server release permissions remain required.