'use strict';
// #31 known-RED is specifically an *overfilled active roster*. Do not accept
// a failed join, lost sockets, missing humans or a broken team assignment as
// "expected RED" merely because they fail the four-a-side assertion.
function activeRosterOverflow(label, {connected, sockets, humans, red, blue}) {
  const counts = [connected, sockets, humans, red, blue];
  if (label !== '12-person lobby' || counts.some(n => !Number.isInteger(n) || n < 0)) return null;
  if (connected !== 12 || sockets !== 12 || humans !== 12) return null;
  if (red + blue > humans || (red <= 4 && blue <= 4)) return null;
  return 'KNOWN_RED_31_ACTIVE_OVERFLOW red=' + red + ' blue=' + blue + ' connected=12';
}
module.exports = {activeRosterOverflow};
