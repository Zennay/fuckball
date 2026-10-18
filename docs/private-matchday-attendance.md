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

## Included in Game Night Pack v4

The existing Game Night Pack now backs up attendance for the included private competitions. On restore, fixture attendance follows the **newly copied league, cup or series**, never the original. The dedicated Attendance JSON export remains useful for preserving old/unattached fixture notes. See [Game Night Pack v4](game-night-pack-v4-attendance.md).

## Central knockout schedule recovery

The Matchday Hub also reads the original private cup fixture's optional
`kickoff` and `venue` values rather than treating every cup as undated. A
provisional scheduled knockout now appears in the shared upcoming fixture list,
central CSV/ICS overview and attendance selector. Cup brackets with unknown
qualifying teams explicitly remain labelled **Qualifiers pending**; setting a
date is not evidence a finalist is known or that a game has been played.

Use **Set kickoff / Edit kickoff** on a cup fixture to open its existing Cup
Builder editor, which remains the sole writer for those local match fields.

## Provisional Red / Blue 4v4 lineup

For each unsplayed fixture, the organiser can assign a friend marked **Going** to
Red (max. four players), Blue (max. four players) or Bench/unassigned. The
attendance panel displays a three-column draft team preview and headcount.
**Maybe** and **Cannot play** players remain unassigned, and changing a Going
player to a different availability automatically moves them to Bench. Team
slots cannot be overfilled. Changing this draft never moves a real online
player, invites anybody or changes any server room or actual match result.

The existing private attendance JSON and selected-match CSV now preserve each
provisional side. Older backups without a `side` field remain valid and
restore everyone unassigned on the Bench. Additive imports keep existing
players and downgrade a new incoming Red/Blue assignment to Bench when that
team already has four players; the status message states the number benched.


### Arrange or reset a friendly draft

**Arrange available players** alternates the first eight friends currently
marked Going between Red and Blue, preserving their saved list order. Remaining
friends stay on the bench. This is not skill-based balancing; it requires your
confirmation before replacing a draft. **Clear draft teams** moves everybody
to the provisional bench while preserving their availability and notes. Neither
action changes a real game room or validated competition score.


## Reuse familiar players for a new fixture

Open **Matchday Hub → Attendance**, select the **new, unsplayed** target match,
then choose another locally saved private match under **Reuse friends for another
match**. The source can be an earlier or completed competition fixture (its
organiser-entered names remain in local storage). An optional filter copies
only names previously marked Going, or the entire prior list.

A count preview distinguishes new names, already-listed names and those beyond
the 24-person target limit. After explicit confirmation, only new names are added:
**each starts Maybe / unassigned, with a blank note**. The organiser must
collect availability again and explicitly form the Red/Blue draft teams for this
new date. Existing target players, notes, responses and team sides are untouched.

The copy uses the original private attendance storage's optimistic tab conflict
checks and capacity bounds. No network request, server roster change, automatic
invitation, or claim of consent is made.

## Private match sheet

Select an unsplayed fixture and choose **Private team sheet TXT** to download
an intentionally unofficial, human-readable local text file. It includes the
original stored private competition name, actual saved kickoff and venue,
up to four players per provisional Red and Blue lineup, Going teammates on
the bench, Maybe and Out lists and the organiser's own notes. No data is sent
to online servers. Share the resulting file only with the participants you
choose, as it can include their names and private notes.


## Printable private team sheet and clipboard

Inside a still-unplayed private fixture's attendance panel, **Print team
sheet** downloads a self-contained, offline-readable HTML document with the
competition, actual entered kickoff/venue, provisional Red and Blue players,
Going bench, Maybe and Unavailable groups. Open the HTML file in a browser to
read it or print it as a normal webpage. This is not a server-generated match
report or official roster and does not claim anyone actually attended.

**Copy team sheet text** uses the clipboard only when the organiser explicitly
clicks the button and the browser supports clipboard access. It creates the
same limited roster summary in plain text; if clipboard access is unavailable,
download the printable team sheet instead.

Both formats intentionally **exclude the private per-player notes**, account
identifiers, invites, room URLs, tokens, recorded results and direct network
calls. Because names and provisional availability are personal, share the
download or clipboard text only with people you intend to inform. HTML team
sheets have no scripts, tracking, external fonts or remote resources and
escape all user-controlled names, competition names and venues.
