// Test for api/vis-map.js
var test = require('node:test');
var assert = require('node:assert');
var path = require('node:path');
var helpers = require('./helpers');

var visMap = require(path.join('..', 'api', 'vis-map.js'));
var lib = require(path.join('..', 'api', '_lib.js'));

// Mock fetch and memoryRateLimit
global.fetch = null;
function resetMocks() {
  global.fetch = null;
  // Delete memoryRateLimit if defined so handler's typeof check is undefined
  delete global.memoryRateLimit;
}

// Helper to create a mock fetch that returns a Promise resolving to a Response-like object
function mockFetch(opts) {
  return function (url, options) {
    // opts can be {status, ok, jsonData, error}
    if (opts.error) {
      return Promise.reject(new Error(opts.error));
    }
    var resp = {
      status: opts.status || 200,
      ok: opts.ok !== undefined ? opts.ok : (opts.status && opts.status >= 200 && opts.status < 300),
      json: function () { return Promise.resolve(opts.jsonData || {}); }
    };
    return Promise.resolve(resp);
  };
}

// Wrapper to call visMap handler and wait for it to finish (since it's async but doesn't return promise)
function callHandler(req, res) {
  // We'll override res.end to resolve a promise when called
  return new Promise((resolve) => {
    const originalEnd = res.end;
    res.end = function (chunk) {
      this.body = chunk;
      originalEnd.call(this, chunk);
      resolve();
    };
    visMap(req, res);
  });
}

test('vis-map: missing track_id returns 400', async function (t) {
  resetMocks();
  var res = helpers.fakeRes();
  var req = helpers.fakeReq('GET', '/api/vis-map'); // no query
  // Ensure query object exists (maybe null)
  req.query = {};
  await callHandler(req, res);
  assert.strictEqual(res.statusCode, 400);
  var body = helpers.resBody(res);
  assert.strictEqual(body.error, 'Missing track_id');
});

test('vis-map: invalid track_id format returns 400', async function (t) {
  resetMocks();
  var res = helpers.fakeRes();
  var req = helpers.fakeReq('GET', '/api/vis-map?track_id=invalid!@#');
  // Parse query manually since fakeReq doesn't
  req.query = { track_id: 'invalid!@#' };
  await callHandler(req, res);
  assert.strictEqual(res.statusCode, 400);
  var body = helpers.resBody(res);
  assert.strictEqual(body.error, 'Invalid track_id format');
});

test('vis-map: upstream success uses real data and sets immutable cache', async function (t) {
  resetMocks();
  // Mock fetch to return successful response with valid metadata
  global.fetch = mockFetch({
    status: 200,
    ok: true,
    jsonData: { bpm: 140, time_signature: 4, energy: 0.9, key: 1, duration_ms: 180000 }
  });
  // Also we need to mock memoryRateLimit to return false (no rate limiting)
  global.memoryRateLimit = function () { return false; };
  var res = helpers.fakeRes();
  var req = helpers.fakeReq('GET', '/api/vis-map?track_id=validid');
  req.query = { track_id: 'validid' };
  await callHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  var body = helpers.resBody(res);
  assert.strictEqual(body.type, 'bpm_grid');
  assert.strictEqual(body.interval_ms, 50);
  // frames length should be duration_ms / 50 rounded up
  assert.strictEqual(body.frames.length, Math.ceil(180000 / 50));
  // Check cache header: should be immutable max-age=31536000
  // Note: header key is case-insensitive; we stored as 'Cache-Control'
  assert.strictEqual(res.headers['Cache-Control'], 'public, max-age=31536000, immutable');
});

test('vis-map: upstream non-2xx triggers fallback and short cache', async function (t) {
  resetMocks();
  global.fetch = mockFetch({ status: 404, ok: false });
  global.memoryRateLimit = function () { return false; };
  var res = helpers.fakeRes();
  var req = helpers.fakeReq('GET', '/api/vis-map?track_id=notfound');
  req.query = { track_id: 'notfound' };
  await callHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  var body = helpers.resBody(res);
  assert.strictEqual(body.type, 'bpm_grid');
  // Should have used fallback data (defaults)
  // Check that cache header is short
  assert.strictEqual(res.headers['Cache-Control'], 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
});

test('vis-map: upstream error (network) triggers fallback', async function (t) {
  resetMocks();
  global.fetch = mockFetch({ error: 'network error' });
  global.memoryRateLimit = function () { return false; };
  var res = helpers.fakeRes();
  var req = helpers.fakeReq('GET', '/api/vis-map?track_id=error');
  req.query = { track_id: 'error' };
  await callHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  var body = helpers.resBody(res);
  assert.strictEqual(body.type, 'bpm_grid');
  assert.strictEqual(res.headers['Cache-Control'], 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
});

test('vis-map: frame generation values are sensible', async function (t) {
  resetMocks();
  global.fetch = mockFetch({
    status: 200,
    ok: true,
    jsonData: { bpm: 60, time_signature: 3, energy: 0.5, key: 0, duration_ms: 60000 } // 1 minute, 60bpm -> 1 beat per second, 3 beats per bar
  });
  global.memoryRateLimit = function () { return false; };
  var res = helpers.fakeRes();
  var req = helpers.fakeReq('GET', '/api/vis-map?track_id=frame');
  req.query = { track_id: 'frame' };
  await callHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  var body = helpers.resBody(res);
  assert.strictEqual(body.interval_ms, 50);
  // duration_ms = 60000 -> total_frames = 60000/50 = 1200
  assert.strictEqual(body.frames.length, 1200);
  // Each frame: [time_ms, bass, mid, treble, is_beat_frame]
  // Spot-check a few frames
  var frame0 = body.frames[0]; // time 0
  assert.strictEqual(frame0[0], 0);
  // bass should be 0.2 + 0.8*exp(0)*energy = 0.2 + 0.8*0.5 = 0.6
  assert.ok(Math.abs(frame0[1] - 0.6) < 0.001);
  // treble at beat_index 0? beat_index = floor(position_in_bar). position_in_bar = (0 % (beat_interval_ms*beats_per_bar))/beat_interval_ms
  // beat_interval_ms = 60000/60 = 1000ms. beats_per_bar=3 -> bar interval = 3000ms.
  // position_in_bar = 0 => beat_index=0 (even) => bass used, treble = 0.2
  assert.ok(Math.abs(frame0[2] - 0.3) < 0.001); // mid formula: 0.3 + (|sin(...)| * 0.4 * energy). At time 0, sin(0)=0 => mid=0.3
  assert.ok(Math.abs(frame0[3] - 0.2) < 0.001);
  // is_beat_frame: time_since_beat = 0 % 1000 = 0 < 50? yes => 1
  assert.strictEqual(frame0[4], 1);
});
