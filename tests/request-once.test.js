var test = require('node:test');
var assert = require('node:assert');
var path = require('node:path');

// Regression test for Copilot review (PR #4): the request/timeout helper must
// fire its callback EXACTLY ONCE even when an upstream error AND a timeout race.
// Previously req.abort() inside setTimeout fired the 'error' event which called
// the callback again -> double callback (e.g. ECONNRESET from destroy()).
// Fixed by a one-shot `done` guard + req.destroy(err) centralizing the error path.

var lib = require(path.join('..', 'api', '_lib.js'));

function buildFakeReq() {
  var fakeReq = {
    _timeoutCb: null, destroyed: false,
    onerror: null,
    on: function (ev, cb) { if (ev === 'error') this.onerror = cb; return this; },
    setTimeout: function (ms, cb) { this._timeoutCb = cb; return this; },
    write: function () {},
    end: function () {
      // Simulate a stalled request: the upstream never responds, the timeout
      // fires, and destroy(err) emits 'error' (the ECONNRESET/cancel race).
      if (this._timeoutCb) this._timeoutCb();
    },
    destroy: function (err) {
      if (this.onerror) this.onerror(err || new Error('ECONNRESET'));
      this.destroyed = true;
    }
  };
  return fakeReq;
}

test('request() calls back exactly once when timeout + error race', function () {
  var seen = [];
  var fakeReq = buildFakeReq();
  var orig = require('https').request;
  require('https').request = function () { return fakeReq; };
  try {
    lib.request('https://example.com/x', {}, function (err, status, data) {
      seen.push({ err: err && err.message, status: status, data: data });
    });
  } finally { require('https').request = orig; }
  // Without the one-shot guard, BOTH the destroy() error and the earlier
  // callback would fire -> seen.length > 1. Guard ensures exactly one.
  assert.strictEqual(seen.length, 1, 'callback must fire exactly once, got ' + seen.length);
});