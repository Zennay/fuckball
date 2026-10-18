# Game Night Pack v4 — portable private attendance

**Home → Game Night Pack** now includes self-entered attendance records for the leagues,
knockout cups and best-of series in the same local archive. This is not a live RSVP,
room invitation or server-confirmed player roster.

On export, only attendance attached to actual fixtures in the included private
competitions is placed in the pack. Retired/orphaned notes are retained on the
source device and can still be preserved using **Matchday Hub → Attendance → Backup JSON**.
The larger 2 MiB pack limit keeps the attendance payload bounded to 1 MiB.

On restoration, the existing leagues/cups/series are *never overwritten*: the
importer validates all records first and creates new IDs for the copied
competitions. Corresponding attendance rows are linked to those **new IDs**, so
editing the imported match cannot change the source fixture's availability.
There are at most 200 local attendance fixtures and 24 names per fixture.
A concurrent-tab change cancels import; partial localStorage writes attempt
rollback without overwriting another tab's newer content.

Packs from v1, v2 and v3 still import using their original item formats and
contain no attendance. Version 4 validates each attendance reference against
a real competition fixture inside that pack before applying any state changes.
Any forged, missing or invalid roster/fixture aborts the operation.

A Game Night Pack has no accounts, credentials, personal room links, ranked
scores, or HBR2 replays. Exporting it is a deliberate download, which the
organiser may choose to share. It is not an official match result.
