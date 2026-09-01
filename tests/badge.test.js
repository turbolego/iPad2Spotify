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

function notLimited(req, bucket, limit, seconds, cb) { cb(null, false); }
function limited(req, bucket, limit, seconds, cb) { cb(null, true); }
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

test('returns 429 when rate limited', function () {
  var restore = stubLib({ rateLimit: limited });
  var res = callBadge('abc');
  restore();
  assert.strictEqual(res.statusCode, 429);
});

test('returns 404 when badge key is missing', function (t, done) {
  var restore = stubLib({ rateLimit: notLimited, kvGet: kvGetMap({}) });
  var res = callBadge('missing');
  setImmediate(function () {
    restore();
    assert.strictEqual(res.statusCode, 404);
    done();
  });
});

test('returns 503 when last-played storage errors', function (t, done) {
  function erringKvGet(key, cb) {
    if (key === 'badge:abc') return cb(null, { session: 'sid' });
    return cb(new Error('kv down'));
  }
  var restore = stubLib({ rateLimit: notLimited, kvGet: erringKvGet });
  var res = callBadge('abc');
  setImmediate(function () {
    restore();
    assert.strictEqual(res.statusCode, 503);
    assert.match(helpers.resBody(res).error, /storage/i);
    done();
  });
});

test('renders "No track observed yet" when no last-played track is cached', function (t, done) {
  var map = { 'badge:abc': { session: 'sid' } };
  var restore = stubLib({ rateLimit: notLimited, kvGet: kvGetMap(map) });
  var res = callBadge('abc');
  setImmediate(function () {
    restore();
    assert.strictEqual(res.statusCode, 200);
    assert.match(res.headers['Content-Type'], /image\/svg\+xml/);
    assert.match(res.body, /No track observed yet/);
    done();
  });
});

test('falls back to cached track when session lookup fails', function (t, done) {
  var map = {
    'badge:abc': { session: 'sid' },
    'last:sid': { track_id: 'trk1', track_name: 'Cached Title', artist_name: 'Cached Artist', album_image_url: 'https://i.scdn.co/image/cached.jpg' }
  };
  // session:<sid> is intentionally absent — kvGet returns null.
  var restore = stubLib({ rateLimit: notLimited, kvGet: kvGetMap(map), config: cfgStatic });
  var res = callBadge('abc');
  setImmediate(function () {
    restore();
    assert.strictEqual(res.statusCode, 200);
    assert.doesNotMatch(res.body, /No track observed yet/);
    assert.match(res.body, /Cached Title/);
    assert.match(res.body, /Cached Artist/);
    assert.match(res.body, /i\.scdn\.co\/image\/cached\.jpg/);
    done();
  });
});

test('falls back to cached track when refresh-token request fails', function (t, done) {
  var map = {
    'badge:abc': { session: 'sid' },
    'last:sid': { track_id: 'trk1', track_name: 'Cached Title', artist_name: 'Cached Artist', album_image_url: 'https://i.scdn.co/image/cached.jpg' },
    'session:sid': { refresh_token: 'rt' }
  };
  var restore = stubLib({
    rateLimit: notLimited,
    kvGet: kvGetMap(map),
    config: cfgStatic,
    spotifyToken: function (cfg, body, cb) { cb(new Error('spotify unreachable')); }
  });
  var res = callBadge('abc');
  setImmediate(function () {
    restore();
    assert.strictEqual(res.statusCode, 200);
    assert.match(res.body, /Cached Title/);
    assert.match(res.body, /Cached Artist/);
    done();
  });
});

test('falls back to cached track when token endpoint returns non-200', function (t, done) {
  var map = {
    'badge:abc': { session: 'sid' },
    'last:sid': { track_id: 'trk1', track_name: 'Cached Title', artist_name: 'Cached Artist', album_image_url: 'https://i.scdn.co/image/cached.jpg' },
    'session:sid': { refresh_token: 'rt' }
  };
  var restore = stubLib({
    rateLimit: notLimited,
    kvGet: kvGetMap(map),
    config: cfgStatic,
    spotifyToken: function (cfg, body, cb) { cb(null, 401, { error: 'invalid_grant' }); }
  });
  var res = callBadge('abc');
  setImmediate(function () {
    restore();
    assert.strictEqual(res.statusCode, 200);
    assert.match(res.body, /Cached Title/);
    done();
  });
});

test('falls back to cached track when Spotify track API call fails', function (t, done) {
  var map = {
    'badge:abc': { session: 'sid' },
    'last:sid': { track_id: 'trk1', track_name: 'Cached Title', artist_name: 'Cached Artist', album_image_url: 'https://i.scdn.co/image/cached.jpg' },
    'session:sid': { refresh_token: 'rt' }
  };
  var restore = stubLib({
    rateLimit: notLimited,
    kvGet: kvGetMap(map),
    config: cfgStatic,
    spotifyToken: function (cfg, body, cb) { cb(null, 200, { access_token: 'at' }); },
    request: function (url, options, cb) { cb(new Error('spotify api down')); }
  });
  var res = callBadge('abc');
  setImmediate(function () {
    restore();
    assert.strictEqual(res.statusCode, 200);
    assert.match(res.body, /Cached Title/);
    done();
  });
});

test('uses live track data when refresh + lookup + image all succeed', function (t, done) {
  var map = {
    'badge:abc': { session: 'sid' },
    'last:sid': { track_id: 'trk1', track_name: 'Cached Title', artist_name: 'Cached Artist', album_image_url: 'https://i.scdn.co/image/cached.jpg' },
    'session:sid': { refresh_token: 'rt' }
  };
  var spotifyTrack = { name: 'Live Title', artists: [{ name: 'Live Artist' }], album: { images: [{ url: 'https://i.scdn.co/image/live.jpg' }] } };
  var imageBuf = Buffer.from('PNG-DATA');
  var restore = stubLib({
    rateLimit: notLimited,
    kvGet: kvGetMap(map),
    config: cfgStatic,
    spotifyToken: function (cfg, body, cb) { cb(null, 200, { access_token: 'at' }); },
    request: function (url, options, cb) { cb(null, 200, spotifyTrack); },
    requestBuffer: function (url, options, cb) { cb(null, 200, imageBuf, { 'content-type': 'image/png' }); }
  });
  var res = callBadge('abc');
  setImmediate(function () {
    restore();
    assert.strictEqual(res.statusCode, 200);
    assert.match(res.body, /Live Title/);
    assert.match(res.body, /Live Artist/);
    assert.match(res.body, /data:image\/png;base64,UE5HLURBVEE/);
    done();
  });
});

test('still renders cached track when live image fetch fails', function (t, done) {
  var map = {
    'badge:abc': { session: 'sid' },
    'last:sid': { track_id: 'trk1', track_name: 'Cached Title', artist_name: 'Cached Artist', album_image_url: 'https://i.scdn.co/image/cached.jpg' },
    'session:sid': { refresh_token: 'rt' }
  };
  var spotifyTrack = { name: 'Live Title', artists: [{ name: 'Live Artist' }], album: { images: [{ url: 'https://i.scdn.co/image/live.jpg' }] } };
  var restore = stubLib({
    rateLimit: notLimited,
    kvGet: kvGetMap(map),
    config: cfgStatic,
    spotifyToken: function (cfg, body, cb) { cb(null, 200, { access_token: 'at' }); },
    request: function (url, options, cb) { cb(null, 200, spotifyTrack); },
    requestBuffer: function (url, options, cb) { cb(new Error('image blocked')); }
  });
  var res = callBadge('abc');
  setImmediate(function () {
    restore();
    assert.strictEqual(res.statusCode, 200);
    // Live title/artist still apply, but image falls back to the cached URL.
    assert.match(res.body, /Live Title/);
    assert.match(res.body, /Live Artist/);
    assert.match(res.body, /i\.scdn\.co\/image\/cached\.jpg/);
    done();
  });
});

test('uses cached title/artist/image when track has no track_id', function (t, done) {
  // Defensive: a malformed cached record without track_id still shouldn't
  // show the empty state when the user clearly intended to display a track
  // and provided a name. This guards against future schema drift.
  var map = {
    'badge:abc': { session: 'sid' },
    'last:sid': { track_id: '', track_name: 'Just A Name', artist_name: 'Just An Artist', album_image_url: '' }
  };
  var restore = stubLib({ rateLimit: notLimited, kvGet: kvGetMap(map), config: cfgStatic });
  var res = callBadge('abc');
  setImmediate(function () {
    restore();
    assert.strictEqual(res.statusCode, 200);
    // No track_id means live enrichment can't run, so cached snapshot renders.
    assert.match(res.body, /Just A Name/);
    assert.match(res.body, /Just An Artist/);
    done();
  });
});

test('truncates before escaping so a slice never splits an HTML entity', function (t, done) {
  // The bug being guarded against: if we escape first, then slice, a raw
  // "&" inflates from 1 char to 5 chars ("&amp;") after escaping. A naive
  // slice(0, 52) on the escaped string can land inside that entity and
  // produce broken XML like "...AAAA&amp" cut off mid-entity.
  //
  // To prove the test fails on the old code, place the raw "&" at index 51
  // (right at the slice boundary). Raw: 51 As + "&" + 10 Bs (length 62).
  // Escaped: 51 As + "&amp;" + 10 Bs (length 66). Buggy escape-then-slice
  // cuts at position 52 of the escaped form, which is the second char of
  // "&amp;" -> "A*51 + &a" (invalid XML, no "p;" or ";"). With the fix, the
  // raw slice(0, 52) cuts cleanly at the "&" so the "&" itself is dropped.
  var rawTitle = 'A'.repeat(51) + '&' + 'BBBBBBBBBB';
  var map = {
    'badge:abc': { session: 'sid' },
    'last:sid': { track_id: '', track_name: rawTitle, artist_name: 'Some Artist', album_image_url: '' }
  };
  var restore = stubLib({ rateLimit: notLimited, kvGet: kvGetMap(map), config: cfgStatic });
  var res = callBadge('abc');
  setImmediate(function () {
    restore();
    assert.strictEqual(res.statusCode, 200);
    // With the fix, the raw slice(0, 52) keeps the "&" at index 51, then
    // escape converts it to "&amp;". The title is therefore 51 As followed
    // by a complete "&amp;" entity — never a truncated entity like "&a"
    // or "&&" or "&;".
    var titleMatch = res.body.match(/<text x="175" y="78"[^>]*>([^<]*)<\/text>/);
    assert.ok(titleMatch, 'expected a title text element in the badge');
    assert.strictEqual(titleMatch[1], 'A'.repeat(51) + '&amp;', 'title must be 51 As + complete &amp; entity');
    // The trailing B's must be dropped.
    assert.doesNotMatch(titleMatch[1], /B/);
    done();
  });
});
