# Native Custom Room Self-Service Bench

In Match menu → Room → 4v4 bench and substitutions, every connected human can manage only their own bench choice without waiting for a host to assign them.

**Spectators:** choose Join Red bench, Join Blue bench, or Be neutral spectator. Choices change only server-owned bench assignments. The real HaxBall player remains team 0 (spectator), with no pitch slot or elevated permissions. A pending substitution involving this player must finish before switching benches. After choosing a team bench, the player can opt into an AVAILABLE FOR SUB flag; switching away or disconnecting clears it. An accepted native substitution still requires real host or captain approval and the incoming player's own consent.

**Active players:** choose Sit out → my team bench. If the native game is playing unpaused, the option is disabled and the server refuses it. At a host pause or between games, after the human explicitly confirms, the server moves only that authenticated player to spectator team 0, clears their input, and reserves their prior team bench. Captaincy is relinquished if needed. Score, match clock, native physics and the online room are not reset; pending substitution requests involving the player must finish first.

**Captains and hosts:** The existing Rotation Desk marks actual available bench players and prefers an available volunteer when suggesting a fair time-based replacement. Readiness is advisory: a volunteer must still accept each individual substitution request from their own connected session, so the server never infers consent from the available flag.

**Security:** The server derives player identity from the actual socket, not a client-provided ID or admin flag. The Quick Match server rejects custom-room messages. Peer-hosted casual rooms use the same RoomCore authorization. Success appears only after an authoritative native room update, not from the initial click. No roster, credentials, results or player data are written to browser storage.

**Limits:** Joining a bench does not automatically make someone an active player or guarantee a slot. Hosts retain their original moderation and team-composition powers. This workflow does not grant new server admin or referee rights, manufacture competition results or affect rating.