'use strict';
// Only these experimentally reproduced #28 *outcome* failures are expected RED.
// A missing asset, TypeError, native-room regression or unrelated assertion
// must fail CI, not masquerade as the known speculative-input product gap.
const {AssertionError} = require('node:assert');
const KNOWN = [
  /^(?:50|100|200)ms must predict rightward input; observed movement difference -?(?:\d+\.?\d*|\.\d+)$/,
  /^future frame 5 must change movement by frame 12$/,
  /^fresh speculative kick must produce the native full-strength impulse$/
];
function isTrackedRed(error) {
  return error instanceof AssertionError && KNOWN.some(pattern => pattern.test(error.message));
}
module.exports = {isTrackedRed};
