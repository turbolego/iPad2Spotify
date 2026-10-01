// Test for api/vis-map.js
var test = require('node:test');
var assert = require('node:assert');
var path = require('node:path');
var helpers = require('./helpers');

var visMap = require(path.join('..', 'api', 'vis-map.js'));
var lib = require(path.join('..', 'api', '_lib.js'));

// Mock fetch
global.fetch = null;
function resetMocks() {
  global.fetch = null;
}

// Helper to create a mock fetch that returns a Promise resolving to a Response-like object
function mockFetch(opts) {
  return function (url, options) {
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

// Wrapper to call visMap handler and wait for it to finish
function callHandler(req, res) {
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

// Helper to create a request with a specific IP
function makeReq(ip, trackId) {
  var req = helpers.fakeReq('GET', '/api/vis-map?track_id=' + encodeURIComponent(trackId));
  req.headers['x-forwarded-for'] = ip;
  req.query = { track_id: trackId };
  return req;
}

test('vis-map: missing track_id returns 400', async function (t) {
  resetMocks();
  var res = helpers.fakeRes();
  var req = helpers.fakeReq('GET', '/api/vis-map');
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
  req.query = { track_id: 'invalid!@#' };
  await callHandler(req, res);
  assert.strictEqual(res.statusCode, 400);
  var body = helpers.resBody(res);
  assert.strictEqual(body.error, 'Invalid track_id format');
});

test('vis-map: upstream success uses real data and sets immutable cache', async function (t) {
  resetMocks();
  global.fetch = mockFetch({
    status: 200,
    ok: true,
    jsonData: { bpm: 140, time_signature: 4, energy: 0.9, key: 1, duration_ms: 180000 }
  });
  // Use a unique IP to avoid rate limiting
  var res = helpers.fakeRes();
  var req = makeReq('10.0.0.1', 'validid');
  await callHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  var body = helpers.resBody(res);
  assert.strictEqual(body.type, 'bpm_grid');
  assert.strictEqual(body.interval_ms, 50);
  assert.strictEqual(body.frames.length, Math.ceil(180000 / 50));
  assert.strictEqual(res.headers['Cache-Control'], 'public, max-age=31536000, immutable');
});

test('vis-map: upstream non-2xx triggers fallback and short cache', async function (t) {
  resetMocks();
  global.fetch = mockFetch({ status: 404, ok: false });
  var res = helpers.fakeRes();
  var req = makeReq('10.0.0.2', 'notfound');
  await callHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  var body = helpers.resBody(res);
  assert.strictEqual(body.type, 'bpm_grid');
  assert.strictEqual(res.headers['Cache-Control'], 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
});

test('vis-map: upstream error (network) triggers fallback', async function (t) {
  resetMocks();
  global.fetch = mockFetch({ error: 'network error' });
  var res = helpers.fakeRes();
  var req = makeReq('10.0.0.3', 'error');
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
    jsonData: { bpm: 60, time_signature: 3, energy: 0.5, key: 0, duration_ms: 60000 }
  });
  var res = helpers.fakeRes();
  var req = makeReq('10.0.0.4', 'frame');
  await callHandler(req, res);
  assert.strictEqual(res.statusCode, 200);
  var body = helpers.resBody(res);
  assert.strictEqual(body.interval_ms, 50);
  assert.strictEqual(body.frames.length, 1200);
  var frame0 = body.frames[0];
  assert.strictEqual(frame0[0], 0);
  assert.ok(Math.abs(frame0[1] - 0.6) < 0.001);
  assert.ok(Math.abs(frame0[2] - 0.3) < 0.001);
  assert.ok(Math.abs(frame0[3] - 0.2) < 0.001);
  assert.strictEqual(frame0[4], 1);
});

test('vis-map: rate limit returns 429 after 20 requests/min from same IP', async function (t) {
  resetMocks();
  global.fetch = mockFetch({
    status: 200,
    ok: true,
    jsonData: { bpm: 120, time_signature: 4, energy: 0.8, key: 5, duration_ms: 210000 }
  });
  var ip = '10.0.0.100';
  // Make 20 requests - all should succeed (limit is 20/min)
  for (var i = 0; i < 20; i++) {
    var res = helpers.fakeRes();
    var req = makeReq(ip, 'track' + i);
    await callHandler(req, res);
    assert.strictEqual(res.statusCode, 200, 'Request ' + i + ' should succeed');
  }
  // 21st request should be rate limited
  var res = helpers.fakeRes();
  var req = makeReq(ip, 'track21');
  await callHandler(req, res);
  assert.strictEqual(res.statusCode, 429);
  var body = helpers.resBody(res);
  assert.strictEqual(body.error, 'Too many requests. Try again shortly.');
});