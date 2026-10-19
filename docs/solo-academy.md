# Solo Academy — twelve native training missions

The **Solo Academy** is available on **Home**, directly alongside Practice Lab, Training Circuit, the Weekly Practice Plan and Training Focus. It gives solo players a **four-chapter, twelve-mission campaign**, not a new simulation or server queue.

Chapters: **First Whistle** (First Touch, 1 goal, 2 teammate kick follow-ups), **Finisher** (3-goal drill, native solo game win, 5-goal drill), **Link-up** (4 follow-ups, timed 3-goal drill, 6 follow-ups), and **Final Third** (timed 5-goal drill, new solo win, timed 6 follow-ups).

The player explicitly **Starts Academy**, **Arms** the next mission, then **Opens native drill**. The original Practice Lab modes, original physics and original Start buttons remain in charge. Goal Rush and Teamwork mission actions preselect the matching duration and goal/links target. For solo AI match goals, the Academy points to the original **Solo Training** card instead of launching an unverified game.

After the drill or solo match is actually completed, **Check native completion** reads only the original local device storage:
- First Touch completion timestamp: `fuckball.first-play-guide.v1`.
- Completed Goal Rush attempts: `fuckball-local-goal-rush-history-v1`, requiring recorded goals and exact recorded duration.
- Completed Teamwork drill records: `fuckball.teamwork-native-drill.v1`, requiring recorded native teammate kick follow-ups and duration. *Follow-up kicks are not verified completed passes.*
- Completed local solo-vs-AI matches: `fuckball.local-practice-journal.v1`, requiring the human side's recorded score to exceed the opponent's.

**Only a fresh native result with a timestamp later than the mission's own arm timestamp counts.** Earlier achievements never grant new mission credit, and completing an earlier mission cannot simultaneously complete later missions. Progress saves locally, detects browser-tab conflicts, and can be exported as a private, explicitly *non-ranked/non-server-verified* JSON record. Reset clears **only Academy progress**, preserving all source drills and game history.

This never manufactures goals, ratings, currency, trophies, AI results, match receipts, remote accounts or human multiplayer outcomes. The existing authorisation gates for real matchmaking remain unchanged. The Academy cannot start or alter a local or online game without the player's separate action in the native game component.
