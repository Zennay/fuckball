# My Moments — local match screenshot gallery

During a Fuckball match or replay, press **◎ Capture** in the top-right pitch toolbar or match menu, or press **F8** with the keyboard. Fuckball captures the game canvas and adds the visible score and clock, creates a PNG and stores it in the **Moments** library on **this device only**.

Open **Moments** in the main navigation to browse thumbnails, download the original PNG, share through supported device share sheets or delete selected pictures. You can clear the gallery with explicit confirmation. Sharing gracefully falls back to a local PNG download if browser file sharing is unavailable.

The gallery is bounded to **24 screenshots / 96 MB total**, with each PNG capped at 8 MB and a maximum 1920×1080 canvas region. It stores blobs and minimal local labels in IndexedDB. A screenshot is an image of the pitch, not an official result, account record, server-backed replay or rank. A human must explicitly capture/share; no automatic opponent surveillance, uploads or cloud sync. Clearing browser data may delete these images; download what you want to keep.

The canvas capture reads the **already-rendered** game and overlays local scoreboard text. It never changes the 60 Hz engine, simulation, network input or server authority. It works offline for the local practice/replay modes with the PWA assets installed. All in-game screenshots remain private to the browser until the player explicitly shares a PNG. Normal mandatory CI and explicit VPS deployment gates still apply.
