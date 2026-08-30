var test = require('node:test');
var assert = require('node:assert');
var fs = require('node:fs');
var path = require('node:path');

// app.js runs as a browser IIFE with no module exports, so pull out the pure
// formatTime helper by source text and evaluate it in isolation.
var source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
var match = source.match(/function formatTime\(ms\)\{[^}]*\}/);
if (!match) throw new Error('formatTime not found in app.js');
var formatTime = new Function('return ' + match[0])();

test('formats zero and sub-minute durations', function () {
  assert.strictEqual(formatTime(0), '0:00');
  assert.strictEqual(formatTime(5000), '0:05');
  assert.strictEqual(formatTime(59000), '0:59');
});

test('formats minutes with zero-padded seconds', function () {
  assert.strictEqual(formatTime(83000), '1:23');
  assert.strictEqual(formatTime(600000), '10:00');
});

test('treats missing or negative values as zero', function () {
  assert.strictEqual(formatTime(null), '0:00');
  assert.strictEqual(formatTime(undefined), '0:00');
  assert.strictEqual(formatTime(-500), '0:00');
});
