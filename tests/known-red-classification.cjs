'use strict';
const assert = require('node:assert/strict');
const {AssertionError} = require('node:assert');
const {isTrackedRed} = require('../scripts/qa-known-red-classifier.cjs');
const failure = message => new AssertionError({message, actual:0, expected:1, operator:'>'});

// The three deliberately tracked outcome gaps are allowed to remain RED until
// their product fixes land (#28); their scenario-specific diagnostics matter.
for (const message of [
  '50ms must predict rightward input; observed movement difference 0.000000',
  '100ms must predict rightward input; observed movement difference 0.000000',
  '200ms must predict rightward input; observed movement difference -0.001000',
  'future frame 5 must change movement by frame 12',
  'fresh speculative kick must produce the native full-strength impulse'
]) assert.equal(isTrackedRed(failure(message)), true, 'known #28 gap: ' + message);

// Unrelated assertions, empty diagnostics and runtime faults must never be
// swallowed into the tracked RED classification.
for (const message of [
  'renderer mutated authoritative ball',
  'stamped frame 5 must never affect frame 3',
  '50ms: authoritative native control must physically move',
  '50ms must predict rightward input; observed movement difference NaN',
  '50ms must predict rightward input; observed movement difference 0.000000 (crash)',
  '#28 still RED'
]) assert.equal(isTrackedRed(failure(message)), false, 'unexpected failure: ' + message);
assert.equal(isTrackedRed(new TypeError('native engine API unavailable')), false);
assert.equal(isTrackedRed(new Error('renderer missing')), false);
assert.equal(isTrackedRed(null), false);
assert.equal(isTrackedRed({message:'future frame 5 must change movement by frame 12'}), false);
console.log('PASS known-RED QA classification: 5 tracked failures, 10 unexpected runtime/contract cases rejected');
