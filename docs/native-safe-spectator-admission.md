# Native safe spectator admission for Custom Rooms

## Player-facing behavior

- Joining through a Custom Room invite link now offers **Watch first · join as spectator**. When selected, the browser must negotiate support **before** sending the join packet. A legacy server that does not acknowledge the capability within 4.5 seconds never receives that join packet; the player sees an explanation, not a silent switch to an active game slot.
- **Irrespective of the client version or preference**, when a Custom Room is already playing, counting down to kickoff or showing a completed match/rematch decision, every *new* player enters the neutral spectator position. The current room and native active players are not replaced, their bot lineup or game rules are not reset, and spectator joins cannot silently cancel a rematch proposal.
- A normal pre-game join still auto-assigns an available team slot as before. When both teams are full, newcomers occupy the spectator slot. An inactive spectator does not alter the room's selected 1v1/2v2/4v4 mode.
- The UI reports the server-confirmed spectator status and directs players to ask the room host for a team or assigned bench position. Existing host/captain substitution permissions, team roster controls and pause/consent flow remain authoritative. Spectator admission is not an authorization to promote yourself.
- **Reconnect is not a fresh join.** A previously admitted player who reconnects with their valid original session remains in their reserved original position and receives no new spectator preference. Quick Match continues its existing original human team assignment and secure reconnect protocol unchanged.

## Native protocol

New optional join request field: `spectate: true` (strict boolean). Created rooms cannot request it; only established Custom Room joins can. Server additionally enforces spectator admission for live, kickoff and finished round states regardless of what the client asks.

The pre-admission `{type:'spectatorAdmissionInfo'}` on an **unjoined WebSocket** returns `{type:'spectatorAdmissionInfo',supported:true}` from an updated server. It does not reserve a room slot or disclose another room's membership. Only after this response will the opt-in client send the standard authenticated join. An old server's error or timeout cancels the operation without calling join. Server welcome includes `spectatorAdmission` and `liveAdmission` as advisory actual native outcomes; the browser also rejects mismatches for explicit Watch requests.

Room-core decides the team slot inside the same native join operation, prior to state snapshots. In spectator mode it leaves the team's bot roster, game mode and existing rematch votes alone; it only adds the neutral disc and updates room status. The joined player remains subject to the existing room capacity, bans, membership, account, admission and native server authority checks. Room peer-hosting pauses for the server's established safe join/handover route as before.

## Guardrails

No approved 60Hz physics, ball contact/kicks, ranking, HaxLab training, model pointer, account identity or match score changes. No private roster details enter the capability reply. No separate queue or background process. Static PWA cache version only; never offline-cache match state. No manual QA, regressions or validation suites created or run. Require all existing exact-head CI/review/protected-main and authorized production release/drain/rollback gates. GitHub source integration alone does not mean a VPS deployment occurred.
