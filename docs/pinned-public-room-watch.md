# Pinned public rooms: live seat watch

Go to **Play → Public Rooms → Browse rooms**. Pin a publicly listed room to your local bookmarks. Your pinned room card now distinguishes **PUBLIC · OPEN SEATS**, **PUBLIC · NO FREE SEATS**, and **CURRENT STATUS UNKNOWN** using the existing latest public directory response.

For a freshly advertised public room with a reported free seat, the card offers **Join public room** (or **Sign in / join public**). This opens the original join interface. The authoritative game server still checks permissions, account, host visibility and capacity. A stale, full or unlisted room never gets the new live-join action.

With at least one pin, switch on **Watch pinned availability**. While the public browser panel is open and the tab is visible, it compares **only** successive successful responses from the existing auto-refreshed public listing (20-second polling already existed). It announces a new public free-seat opportunity in the browser after the room transitions from unavailable to available. It never silently joins a room.

Watch is **off by default**, only lasts for the current page session, uses no new endpoint, never requests Notification permission, never polls in a hidden tab or closed panel, and does not track private rooms, usernames, identities, or full room lists beyond host-approved entries. Network failure or reopening the panel resets the comparison baseline to avoid false alerts. A bookmarked code is not proof of ongoing access, and notifications do not guarantee admission.

Room pin imports and changes reset the comparison baseline so adding an already available pin is not mistakenly reported as a newly opened room.
