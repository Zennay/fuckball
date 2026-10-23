# Custom Room team-only chat — operator and product contract

## What players can do

While connected to a Custom Room on a supporting server, open **Enter → chat** and select **ROOM** (everyone) or **TEAM** (current Red/Blue side only). Team messages show a `[TEAM · RED]` or `[TEAM · BLUE]` prefix; team-specific one-tap tactical phrases are available beneath the HUD. The existing editable chat callouts follow the selected outbound channel. The separate in-game Quick Calls panel still uses its original public native-room path.

A player can join a team channel only when the native server has assigned them an active Red/Blue slot, or when a neutral player is assigned to that side's bench. Unaffiliated spectators, bots, and disconnected clients cannot send or receive team messages. Team membership is recomputed for **each** message and recipient from the current server-known roster and bench associations, never from claimed client name, team, or role. Transfers and substitutions change delivery immediately; no backlog/history is replayed.

## Delivery and moderation

The existing `chat` WebSocket message accepts an optional `audience:'team'` only for Custom Rooms. The absence of `audience` stays public for older clients. The server gates new clients with `roomControl.teamChatSupported`; the browser refuses team sends against old/Quick Match servers, **never converts an intended private message into public chat**. Every sender is bound to its admitted socket/player ID. Existing 140-character printable-text admission, per-socket 4 messages / 10 seconds throttle and host-issued chat mute apply equally to both audiences. Team messages are server-acknowledged and are not sent to the other team or neutral spectators. The sender is included in recipients for an acknowledgement via the ordinary native UI log.

Messages are ephemeral room chat, not encrypted end-to-end and not persisted as a replay or separate account history. The control-plane server handles them, so operators with server access may have visibility. Neither player-owned peer hosts nor client metadata can authorize team delivery. Legacy peer-host `hostOut.chat` is blocked; real room chat must traverse the existing moderation envelope. This feature does **not** grant host moderation, ranked matchmaking, account permissions, or AI controls.

## Release constraints

No change to approved physics, 60 Hz tick, current native room team transitions, ranked rating, HaxLab learning, or datasets. The UI and server must be deployed together by the existing authorized immutable release route; a newer client alone must not advertise privacy on an older server. Mandatory CI, code review, server authorization, deployment/drain and rollback gates are not modified. GitHub source integration does not prove the live server has received this feature.
