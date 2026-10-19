# Native Custom Room referee

Open **Match menu → Room → Room Referee**.

**Appointment:** the authoritative connected room owner may assign exactly one currently connected human (including a spectator) to the referee role, or revoke it by choosing No appointed referee. Player identity comes from the actual room/socket; the server rejects impersonation and bot IDs. It does not require a Club, and is not part of human Quick Match. An appointed referee is identified in the current room state. Leaving, disconnecting, or a change in owner revokes this delegation.

**Authorized behavior:** the referee can pause and resume an already running Custom Room game via the native RoomCore; the authoritative game clock, score, round, physical model and existing substitution logic remain unchanged. Pausing also executes only consented native substitutions at a stoppage through the same server path the host already used. Referee actions have a small server cooldown and are not inferred from client flags.

**Not authorized:** this role cannot start/reset/stop matches, become host, edit team rosters or bots, create/join Clubs, bypass admission, moderate or ban anyone, see private account details, fabricate match outcomes, change ranked ratings or override the incoming player's individual substitution consent. The host keeps existing original controls and can revoke the role.

**Pause requests:** a genuine guest pause request is visible to the appointed referee in their own UI, including a small optional on-pitch callout. The referee must explicitly open the Room menu and click Pause; requests neither trigger pauses automatically nor create match penalties. Host pause controls remain available independently.

**Persistence:** only the current valid role ID is added to the existing native room state and host handover snapshot, validated against connected human membership on restore. No credentials or user account data are included in the new state. On host ownership transfer the old delegation is revoked. The PWA caches the UI only and never persists a room authority offline.