var test = require('node:test');
var assert = require('node:assert');
var path = require('node:path');
var helpers = require('./helpers');

var lib = require(path.join('..', 'api', '_lib.js'));
var badge = require(path.join('..', 'api', 'badge', '[key].js'));

function stubLib(overrides) {
  var originals = {};
  Object.keys(overrides).forEach(function (key) { originals[key] = lib[key]; lib[key] = overrides[key]; });
  return function restore() { Object.keys(originals).forEach(function (key) { lib[key] = originals[key]; }); };
}

function noRateLimit() { throw new Error('badge reads must not use the Redis rate limiter'); }
function okToken(cfg, body, cb) { cb(null, 200, { access_token: 'at' }); }
function track(name, artist, image) { return { name: name, artists: [{ name: artist }], album: { images: image ? [{ url: image }] : [] } }; }
// Routes Spotify API calls by URL: currently-playing and recently-played responses.
function spotify(current, recent) {
  return function (url, options, cb) {
    if (/currently-playing/.test(url)) return current ? cb(null, 200, { item: current }) : cb(null, 204, null);
    if (/recently-played/.test(url)) return recent ? cb(null, 200, { items: [{ track: recent }] }) : cb(null, 403, null);
    cb(new Error('unexpected url ' + url));
  };
}
function kvGetMap(map) {
  return function (key, cb) {
    if (Object.prototype.hasOwnProperty.call(map, key)) return cb(null, map[key]);
    cb(null, null);
  };
}
function cfgStatic() { return { id: 'id', secret: 'secret', redirect: 'https://example.test/cb' }; }

function callBadge(key) {
  var res = helpers.fakeRes();
  badge(helpers.fakeReq('GET', '/api/badge/' + key + '.svg'), res);
  return res;
}

test('returns 404 when badge key is missing', function (t, done) {
  var restore = stubLib({ rateLimit: noRateLimit, kvGet: kvGetMap({}) });
  var res = callBadge('nokey');
  setImmediate(function () {
    restore();
    assert.strictEqual(res.statusCode, 404);
    done();
  });
});

test('returns 503 when badge storage errors', function (t, done) {
  var restore = stubLib({ rateLimit: noRateLimit, kvGet: function (key, cb) { cb(new Error('kv down')); } });
  var res = callBadge('abc');
  setImmediate(function () {
    restore();
    assert.strictEqual(res.statusCode, 503);
    done();
  });
});

test('renders the currently playing track with embedded artwork using a single Redis read', function (t, done) {
  var reads = [];
  var restore = stubLib({
    rateLimit: noRateLimit,
    kvGet: function (key, cb) { reads.push(key); cb(null, key === 'badge:abc' ? { refresh_token: 'rt' } : null); },
    kvSet: function () { throw new Error('unexpected write'); },
    config: cfgStatic,
    spotifyToken: okToken,
    request: spotify(track('Live Title', 'Live Artist', 'https://i.scdn.co/image/live.jpg'), null),
    requestBuffer: function (url, options, cb) { cb(null, 200, Buffer.from('PNG-DATA'), { 'content-type': 'image/png' }); }
  });
  var res = callBadge('abc');
  setImmediate(function () {
    restore();
    assert.deepStrictEqual(reads, ['badge:abc']);
    assert.strictEqual(res.statusCode, 200);
    assert.match(res.headers['Cache-Control'], /s-maxage=300/);
    assert.match(res.body, /Live Title/);
    assert.match(res.body, /Live Artist/);
    assert.match(res.body, /data:image\/png;base64,UE5HLURBVEE/);
    done();
  });
});

test('falls back to the most recently played track when nothing is playing', function (t, done) {
  var restore = stubLib({
    kvGet: kvGetMap({ 'badge:abc': { refresh_token: 'rt' } }),
    config: cfgStatic,
    spotifyToken: okToken,
    request: spotify(null, track('Recent Title', 'Recent Artist', ''))
  });
  var res = callBadge('abc');
  setImmediate(function () {
    restore();
    assert.strictEqual(res.statusCode, 200);
    assert.match(res.body, /Recent Title/);
    assert.match(res.body, /Recent Artist/);
    done();
  });
});

test('renders the empty state when Spotify has no current or recent track', function (t, done) {
  var restore = stubLib({ kvGet: kvGetMap({ 'badge:abc': { refresh_token: 'rt' } }), config: cfgStatic, spotifyToken: okToken, request: spotify(null, null) });
  var res = callBadge('abc');
  setImmediate(function () {
    restore();
    assert.strictEqual(res.statusCode, 200);
    assert.match(res.body, /No track observed yet/);
    done();
  });
});

test('renders a placeholder instead of failing when the token refresh fails', function (t, done) {
  var restore = stubLib({ kvGet: kvGetMap({ 'badge:abc': { refresh_token: 'rt' } }), config: cfgStatic, spotifyToken: function (cfg, body, cb) { cb(null, 400, { error: 'invalid_grant' }); } });
  var res = callBadge('abc');
  setImmediate(function () {
    restore();
    assert.strictEqual(res.statusCode, 200);
    assert.match(res.body, /Spotify is unavailable/);
    done();
  });
});

test('falls back to the remote image URL when the artwork fetch fails', function (t, done) {
  var restore = stubLib({
    kvGet: kvGetMap({ 'badge:abc': { refresh_token: 'rt' } }), config: cfgStatic, spotifyToken: okToken,
    request: spotify(track('Live Title', 'Live Artist', 'https://i.scdn.co/image/live.jpg'), null),
    requestBuffer: function (url, options, cb) { cb(new Error('image blocked')); }
  });
  var res = callBadge('abc');
  setImmediate(function () {
    restore();
    assert.match(res.body, /Live Title/);
    assert.match(res.body, /i\.scdn\.co\/image\/live\.jpg/);
    done();
  });
});

test('upgrades a legacy { session } badge record to store the refresh token', function (t, done) {
  var writes = [];
  var restore = stubLib({
    kvGet: kvGetMap({ 'badge:abc': { session: 'sid' }, 'session:sid': { refresh_token: 'legacy-rt' } }),
    kvSet: function (key, value, seconds, cb) { writes.push({ key: key, value: value }); cb(null); },
    config: cfgStatic,
    spotifyToken: function (cfg, body, cb) { assert.match(body, /refresh_token=legacy-rt/); cb(null, 200, { access_token: 'at' }); },
    request: spotify(track('Live Title', 'Live Artist', ''), null)
  });
  var res = callBadge('abc');
  setImmediate(function () {
    restore();
    assert.deepStrictEqual(writes, [{ key: 'badge:abc', value: { refresh_token: 'legacy-rt' } }]);
    assert.match(res.body, /Live Title/);
    done();
  });
});

test('asks for a new login when a legacy badge session no longer exists', function (t, done) {
  var restore = stubLib({ kvGet: kvGetMap({ 'badge:abc': { session: 'sid' } }), config: cfgStatic });
  var res = callBadge('abc');
  setImmediate(function () {
    restore();
    assert.strictEqual(res.statusCode, 200);
    assert.match(res.body, /new Spotify login/);
    done();
  });
});

test('truncates before escaping so a slice never splits an HTML entity', function (t, done) {
  // Raw "&" sits at index 51, right at the 52-char slice boundary. Escaping first would
  // let the slice land inside "&amp;" and produce invalid XML.
  var rawTitle = 'A'.repeat(51) + '&' + 'BBBBBBBBBB';
  var restore = stubLib({ kvGet: kvGetMap({ 'badge:abc': { refresh_token: 'rt' } }), config: cfgStatic, spotifyToken: okToken, request: spotify(track(rawTitle, 'Some Artist', ''), null) });
  var res = callBadge('abc');
  setImmediate(function () {
    restore();
    var titleMatch = res.body.match(/<text x="175" y="78"[^>]*>([^<]*)<\/text>/);
    assert.ok(titleMatch, 'expected a title text element in the badge');
    assert.strictEqual(titleMatch[1], 'A'.repeat(51) + '&amp;');
    done();
  });
});
