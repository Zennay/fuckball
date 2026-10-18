# Private Matchday Attendance Board

This feature lives inside **Home → Matchday Hub → Private Match Attendance**.
It works with validated, unsplayed, device-local round-robin league fixtures, private
knockout-cup fixtures and best-of-three/five/seven series games. These are *friendly
organiser notes*, not an online team roster, authoritative attendance or an invitation.

## Organise one private fixture

1. Open the Matchday Hub and select **✓ Attendance**.
2. Select an unsplayed match. Future rounds with unknown cup qualifiers can still
   have provisional availability; participant names remain separate from bracket teams.
3. Add up to 24 friends to that fixture, each marked **Going**, **Maybe** or **Cannot
   play** with an optional private 120-character note.
4. Change status, save notes, or remove a participant. The summary counts update
   immediately. A person cannot be listed twice under the same case-insensitive name.
5. Export that fixture to CSV for a spreadsheet, or back up *all* privately recorded
   attendance to JSON. A compatible JSON file can be restored **additively**: matching
   names are preserved, unknown/finished fixtures are skipped, and full matches are
   not overwritten.
6. Clear a single fixture's attendance list only after two explicit confirmations.

## Storage and data integrity

- The browser stores a versioned `fuckball.private-match-attendance.v1` collection
  in localStorage. Limits: 200 fixtures, 24 names per fixture, 35 characters per
  name, 120 characters per note, 1 MiB total.
- Fixture selectors come solely from the existing, rigorously checked private
  league/cup/best-of collection parser. Invalid or completed fixtures cannot be
  edited through the availability board. Existing notes for unavailable fixtures
  are preserved in exported backups instead of silently discarded.
- Before every mutation, the original localStorage value is compared against
  the last loaded snapshot; edits from another browser tab cause a reload and an
  explicit retry request instead of silent overwrites.
- Broken or inaccessible localStorage disables writes; no automatic repair/clear
  operation destroys the original data.
- Imported JSON is fully parsed and bounded before any mutation. Unknown match IDs,
  duplicates and entries exceeding capacity cannot overwrite the organiser's
  current notes. Exported CSV cells starting with formula metacharacters are
  neutralised.
- Personal names/notes are *not sent to the server*, not connected to accounts,
  not included in actual online room invites and not used to authoritatively
  report match results. User-controlled downloads can still be shared externally.
- The existing offline-first PWA retrieves updated public Matchday Hub JavaScript
  and CSS through its network-first asset cache after an online load. No private
  attendance state is cached by the service worker.

## Boundaries

Does not affect approved BFF 60 Hz physics, AI champion/training, live match
server state, online matchmaking, Clubs or competitive ratings. A downloaded
private attendance roster is not proof that anyone actually attended a match.
