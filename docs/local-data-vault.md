# Local Data Vault — Profile

Open **Profile → My Local Data Vault** to review five *explicitly allowlisted* browser-only data categories: private leagues, knockout cups, best-of series, match attendance, and consciously pinned public room codes.

- **Refresh local inventory** counts records independently. Unreadable or oversized categories are labelled and excluded. The original data is not modified or replaced.
- Choose categories and **Export selected archive** to create one portable private JSON archive, capped at 1.5 MiB. It includes no server account data, access tokens, passwords, ranking, matches, AI models or IndexedDB HBR2 recordings. Keep the file private because friend names, notes, schedules, venues and pinned room codes can be sensitive.
- **Browse native backup files** to extract current selected categories directly. **Open archive for extraction** opens a previously downloaded Vault JSON file in memory, verifies its expected categories and sizes, and makes the same extraction actions available. Extraction never writes to browser storage.
- Leagues/cups are extracted individually into their existing native import formats. All private best-of series, attendance and public bookmark codes are downloaded in the native formats those respective existing editors import. **Restore only through the original module**, which remains responsible for data validation, ID collision handling, user consent and preserving independent changes.
- Archives are offline and export by explicit click only. This Vault is *not* a cross-account cloud sync, not an all-storage backup, not an automatic restore and not a method for importing official results. The existing user-owned replay manager exports HBR2 files separately; the original player setup passport handles gamepad, keyboard and accessibility settings.

The Vault performs **no destructive clear/reset** and does not enumerate arbitrary localStorage keys; it reads only the five named keys and never touches the general preferences store. A corrupt category remains untouched so original app recovery can be used.
