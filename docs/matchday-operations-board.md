# Matchday Action Board — device-local organiser workflow

Open **Home → Matchday Hub**. The Action Board appears above saved competitions and uses the existing validated league, knockout and best-of fixtures.

The board groups four kinds of **non-official private planning reminders**:
- **Past planned kickoff without entered score:** Review the original fixture. This is not proof the match actually took place.
- **Eligible fixture missing kickoff:** Jump straight to the existing date editor.
- **Kickoff within 72 hours:** Recheck the organiser-entered schedule and venue in the original editor.
- **Optional 4v4 draft gap:** If an upcoming private fixture has fewer than four saved Going players on either draft side, jump into the existing attendance editor. The board never asserts a 4v4 match is required or that marked Going friends are actually present. This hint is not shown if attendance data cannot be read.

Users can search by competition/team/venue, filter a category, inspect the first 12 reminders and progressively reveal more without losing the full dataset. **Complete action CSV** exports every matching reminder even beyond the on-screen limit, safely quotes CSV fields and neutralises formula-prefixed names. Exports are local and require deliberate action.

No synthetic scores, online claims, invitations or account information. The action board is **read-only** and never writes competitions or attendance; every change is made only via existing canonical editors. Inactive or currently locked cup/series stages are excluded. Data invalid according to existing private-storage validators is excluded, and unreadable attendance hides 4v4 hints rather than silently replacing that data. Browser-only offline support is included.
