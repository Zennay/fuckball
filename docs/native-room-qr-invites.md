# Native Custom Room QR invite scanner

The existing **Play → Join your team** invite section now offers two explicitly user-initiated QR input options where the browser supports native `BarcodeDetector` for `qr_code`:

- **Scan QR with camera** requests local camera access after a click and stops all media tracks after successful decoding, Stop camera, page hide, invalid permission, or a camera error. Only the visible page processes video; no images or frames are uploaded to Fuckball or a third party.
- **Read QR from image** accepts only PNG/JPEG/WebP files of at most 6 MiB and decoded images at most 4096×4096 pixels, using the browser's local ImageBitmap and closing its buffer afterward. The image is never stored or uploaded.

Both decode paths call the same strict `parseInvite` routine as manual paste: an eight-character native room code or an exact same-origin, same-path invitation link with one `room` parameter. Other domains, additional query parameters, fragments, credentials, unrecognized codes and malformed QR values are rejected.

A valid scan **only fills the room-code field**. The person must choose **JOIN ROOM**; the original server join flow still enforces room availability, lock/club/account permissions and current connection state. If the native QR API or camera is unavailable (for example in Firefox), manual paste and clipboard invite entry remain fully functional. No bot, physics, matchmaking, ranking, account, replay or server policy is changed.

There are no cloud QR APIs, extra permissions in the web manifest, automatic camera startup, background scanning or saved images. Browser camera permission remains browser-managed. The service worker's offline cache key was bumped to ship this client-side capability.
