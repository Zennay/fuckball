# Match Audio Guide

Choose **Match menu → Video → Live Score Guide**. All three options default off.

- **Goal captions**: short readable captions from observed changes of exactly one goal in the rendered native scoreboard.
- **Speak goals**: when supported, announce only the observed team and current native score through browser speech synthesis.
- **Speak minutes**: optional one-minute elapsed-clock reminders, dependent on voice being enabled.

The feature intentionally re-baselines whenever the match disappears, the menu opens, browser focus is lost, or a replay is active, and rejects resets, backward time, implausible jumps and duplicate score updates. No player or scorer is guessed. Screen reader visual captions use a polite live region. Preferences are device-only, with cross-tab sync.

It reads the already displayed match scoreboard and never changes physics, game state, other players, authentication, chat, server protocol, or ranking. The feature is unavailable where the browser lacks speech synthesis; visual captions can still work. During online games, these are **local display observations**, not certified referee events.
