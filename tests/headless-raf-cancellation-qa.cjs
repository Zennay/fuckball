'use strict';
// Native RAF loop quality gate: canceled callbacks must not execute even if
// another callback cancels them during the *same* frame dispatch.
const assert = require('node:assert/strict');
const {createRuntime} = require('../headless/runtime.cjs');

const {window, advance} = createRuntime();
const calls = [];
let second;
window.requestAnimationFrame(time => {
  calls.push(['first',time]);
  window.cancelAnimationFrame(second);
  window.requestAnimationFrame(next => calls.push(['deferred',next]));
});
second = window.requestAnimationFrame(time => calls.push(['canceled',time]));
advance(1);
assert.deepEqual(calls.map(entry=>entry[0]),['first'],
  'cancellation during dispatch must skip the still-pending second callback');
assert(Math.abs(calls[0][1]-(1000/60+.001))<1e-6,
  'first frame retains the exact 60 Hz virtual clock');
advance(1);
assert.deepEqual(calls.map(entry=>entry[0]),['first','deferred'],
  'new RAF requests inside a frame must wait until the next frame');
assert(Math.abs(calls[1][1]-(2000/60+.001))<1e-6,
  'nested callback uses next frame virtual timestamp');

const previously = window.requestAnimationFrame(()=>calls.push(['pre-canceled',0]));
window.cancelAnimationFrame(previously);
advance(1);
assert(!calls.some(entry=>entry[0]==='pre-canceled'));
window.requestAnimationFrame(()=>calls.push(['new',0]));
advance(1);
assert.deepEqual(calls.map(entry=>entry[0]),['first','deferred','new'],
  'later callbacks still run normally after cancellation');
console.log('PASS current-frame cancellation, pre-cancellation, next-frame scheduling, 60Hz virtual clock');
