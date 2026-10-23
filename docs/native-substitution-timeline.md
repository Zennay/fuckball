# Completed Native Substitution Timeline

In a **Custom Room**, open **Match menu → Room → Team bench & substitutions → Substitution Timeline**.

The read-only timeline displays at most eight most recent actual server-issued **completed** substitution events from the current native room. Filter to Red, Blue, or both. Each event shows outgoing/incoming players when those identities are still in the current visible roster, and the raw authoritative room frame where the swap took effect.

- Pending proposals, consent requests, declined requests and disconnected players are not falsely represented as completed swaps.
- No match clock, referee signature, official player statistics, full lifetime activity or league results are inferred from raw room frames.
- Leaving/changing rooms clears the local display; observations are not stored automatically or sent over a separate network channel.
- **Save snapshot CSV** asks explicit permission before exporting visible player names, excludes account credentials, tokens and room code and includes a clear nonofficial limitation. No upload.
- Custom Room host/captain authority, player consent and pause/stoppage rules are the same server logic as before. This screen cannot initiate a swap or elevate a role.

Native BFF physics, multiplayer protocol and the Club/Quick Match processes remain unchanged.
