# Native Custom Room QR invitations · sender and recipient

Fuckball now supports two halves of a local, explicit Custom Room invitation:

1. **Host / sender:** From the **live match menu → Invite your team**, press **Show room QR** to show a scannable QR code containing a current native same-site room invite URL. This is generated only after a click, from `serverLink.room` (verified eight-character room code), using a **bundled** copy of MIT-licensed qrcodejs. There is no external QR API and the private code does not leave the device merely to render the QR. When the room changes, the menu hides, or the room becomes invalid/disconnects, the QR is cleared. The current lock/club/account status stays visible; the QR conveys no entry authority.
2. **Recipient:** From **Play → Join your team**, use **Scan QR with camera** or **Read QR from image**, with native `BarcodeDetector` when available, otherwise an on-demand bundled Apache-licensed jsQR decoder (including Firefox). The camera opens only after a click. Camera tracks close after reading a valid invite, choosing Stop camera, hiding the tab, or a camera error; no footage is uploaded or retained. Local PNG/JPEG/WebP images up to 6 MiB, at most 4096 px per side, are decoded on-device and discarded.

Both QR input paths use the *original* strict `parseInvite` routine, the same as paste: only exactly eight permitted room-code characters or an exact same-origin and same-path invitation URL with one `room` query parameter, without fragments/credentials/extraneous query fields. On valid scan, **only the room-code input is populated**. The recipient must personally click **JOIN ROOM** and pass native server admission, club membership, lock, account and capacity rules.

On Firefox or browsers without native BarcodeDetector, the same user-triggered scan loads a local jsQR fallback, downsizing images to at most 1280 pixels for bounded decoding. The fallback is fetched only after a deliberate camera/image action, never from a CDN. If camera permission or image decoding is unavailable, paste/clipboard and manual room-code joins remain functional. Sender-side QR rendering is independent. No ranked results, account information, players, server matchmaking, active room permissions, AI, game physics, release or production deployment changes.

## Third-party library

`dist/vendor/qrcodejs.min.js`: [davidshimjs/qrcodejs](https://github.com/davidshimjs/qrcodejs), MIT license (2012 David Shim); full notice in `dist/vendor/LICENSE-qrcodejs.txt` and `dist/vendor/THIRD-PARTY.txt`. Code is bundled and served locally, not fetched from CDN or QR generation service. The service worker asset manifest and cache version include the library and QR UI.

## Offline decoder fallback

`dist/vendor/jsQR.js`: [cozmo/jsQR](https://github.com/cozmo/jsQR), Apache License 2.0, pinned source commit `8e6a036beafa7053dd44b1b76ac578d22b1b3311`. Full license text in `dist/vendor/LICENSE-jsQR.txt` and attribution in `dist/vendor/THIRD-PARTY.txt`. This larger decoder is **lazy-loaded only on direct user request** when native QR detection is not present; it is not added to the offline-practice pre-cache or startup network requests. Neither decoder sends raw frames, codes, tokens or image data to an external service.

## Shareable QR poster (PNG)

Inside an active native Custom Room, open the match menu, select **Show room QR**, then **Save scannable QR card (PNG)**. The browser draws a local 1200×900 branded PNG containing the real QR, exact eight-character room code, source website, and a clear notice that this invitation is not permission to enter. The access label is sourced from the room's current server control snapshot; its state may change after sharing.

PNG export reads the locally generated QR bitmap, revalidates the active native room before writing the file, and aborts if the room changed during asynchronous image encoding. No user-submitted URL, remote QR-generation service, CDN, personal token, camera image or account credentials are included. The host may share the PNG by any chosen channel; recipients use the normal same-site QR scanner and explicitly confirm native room admission. No HTTP endpoint, server authority or gameplay logic is changed.
