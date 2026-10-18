# Native Custom Room QR invitations · sender and recipient

Fuckball now supports two halves of a local, explicit Custom Room invitation:

1. **Host / sender:** From the **live match menu → Invite your team**, press **Show room QR** to show a scannable QR code containing a current native same-site room invite URL. This is generated only after a click, from `serverLink.room` (verified eight-character room code), using a **bundled** copy of MIT-licensed qrcodejs. There is no external QR API and the private code does not leave the device merely to render the QR. When the room changes, the menu hides, or the room becomes invalid/disconnects, the QR is cleared. The current lock/club/account status stays visible; the QR conveys no entry authority.
2. **Recipient:** From **Play → Join your team**, use **Scan QR with camera** or **Read QR from image**, where supported by the browser's built-in `BarcodeDetector` for `qr_code`. The camera opens only after a click. Camera tracks close after reading a valid invite, choosing Stop camera, hiding the tab, or a camera error; no footage is uploaded or retained. Local PNG/JPEG/WebP images up to 6 MiB, at most 4096 px per side, are decoded on-device and discarded.

Both QR input paths use the *original* strict `parseInvite` routine, the same as paste: only exactly eight permitted room-code characters or an exact same-origin and same-path invitation URL with one `room` query parameter, without fragments/credentials/extraneous query fields. On valid scan, **only the room-code input is populated**. The recipient must personally click **JOIN ROOM** and pass native server admission, club membership, lock, account and capacity rules.

If the browser does not provide native BarcodeDetector or camera, existing paste/clipboard and manual room-code joins remain functional. Sender-side QR rendering is separate and broadly supported. No ranked results, account information, players, server matchmaking, active room permissions, AI, game physics, release or production deployment changes.

## Third-party library

`dist/vendor/qrcodejs.min.js`: [davidshimjs/qrcodejs](https://github.com/davidshimjs/qrcodejs), MIT license (2012 David Shim); full notice in `dist/vendor/LICENSE-qrcodejs.txt` and `dist/vendor/THIRD-PARTY.txt`. Code is bundled and served locally, not fetched from CDN or QR generation service. The service worker asset manifest and cache version include the library and QR UI.
