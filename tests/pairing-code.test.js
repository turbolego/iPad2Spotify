var test = require('node:test');
var assert = require('node:assert');
var path = require('node:path');

var lib = require(path.join('..', 'api', '_lib.js'));

test('always generates the requested length', function () {
  for (var i = 0; i < 200; i++) assert.strictEqual(lib.pairingCode(8).length, 8);
});

test('only uses unambiguous alphanumeric characters', function () {
  for (var i = 0; i < 200; i++) assert.match(lib.pairingCode(8), /^[0-9A-Z]{8}$/);
});

test('never contains letters that are easy to confuse with digits', function () {
  for (var i = 0; i < 200; i++) assert.doesNotMatch(lib.pairingCode(8), /[OIL]/);
});
