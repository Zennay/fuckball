# Native Room Chat — Position Call Packs

Open **Esc → Settings → Team Callouts** after loading the game. The existing
four one-tap room chat shortcuts can be edited as before. This extension adds
four **optional** position packs alongside General:

- **GK / goalkeeper:** organisation around the goal, far post, clearing,
  goalkeeper readiness.
- **DM / defender:** team shape, cover, safe back pass, switching wings.
- **AM / playmaker:** offering a pass, one-two, teammate runs and wings.
- **ST / striker:** passing to space, crossing, shooting and rebounds.

Choosing a role preset requires confirmation and replaces exactly the four
local phrases, through the existing validated Save action. It does **not**
select a team, promote a captain, alter the native room or send a chat message.

The **Export phrases** button downloads a versioned JSON containing exactly
those four short strings. **Restore phrases** accepts a file up to 4 KiB with
the matching format, validates each 1–48-character message using the original
native chat shortcut validator and asks confirmation before replacing settings.
It stops if localStorage changed in another tab while the file was being read.

**Network and moderation boundaries:** Sending still requires manually tapping
one of the existing in-match callout buttons. It uses the existing authenticated
native room chat form, honors server chat muting and the client 2.5-second
cooldown, never replaces an unfinished handwritten message, and does not
send in the background. It does not bypass moderation, publish contact data,
change official stats or create team authority. Presets and downloaded JSON
files are device-private until deliberately shared.
