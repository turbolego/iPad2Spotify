var test = require('node:test');
var assert = require('node:assert');
var path = require('node:path');
var helpers = require('./helpers');

process.env.SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || 'test-secret';
var lib = require(path.join('..', 'api', '_lib.js'));
var logout = require(path.join('..', 'api', 'auth', 'logout.js'));

function stubLib(overrides) {
  var originals = {};
  Object.keys(overrides).forEach(function (key) { originals[key] = lib[key]; lib[key] = overrides[key]; });
  return function restore() { Object.keys(originals).forEach(function (key) { lib[key] = originals[key]; }); };
}
function noKv() { throw new Error('Redis must not be used'); }

test('sealed sessions round-trip without exposing the refresh token', function () {
  var sealed = lib.sealSession({ refresh_token: 'secret-refresh-token' });
  assert.match(sealed, /^v1\.[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(sealed, /secret-refresh-token/);
  assert.strictEqual(lib.openSession(sealed).refresh_token, 'secret-refresh-token');
});

test('tampered or foreign session cookies are rejected', function () {
  var sealed = lib.sealSession({ refresh_token: 'rt' });
  var last = sealed.charAt(sealed.length - 1);
  assert.strictEqual(lib.openSession(sealed.slice(0, -1) + (last === 'A' ? 'B' : 'A')), null);
  assert.strictEqual(lib.openSession('v1.garbage'), null);
  var original = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'a-different-secret';
  try { assert.strictEqual(lib.openSession(sealed), null); } finally {
    if (original === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = original;
  }
});

test('getSession reads encrypted cookies without Redis', function (t, done) {
  var restore = stubLib({ kvGet: noKv, kvDel: noKv });
  var req = helpers.fakeReq('GET', '/', 'spotify_session=' + lib.sealSession({ refresh_token: 'rt' }));
  lib.getSession(req, helpers.fakeRes(), function (err, session) {
    restore();
    assert.ifError(err);
    assert.strictEqual(session.refresh_token, 'rt');
    done();
  });
});

test('getSession migrates a legacy Redis session id to an encrypted cookie', function (t, done) {
  var sid = 'LegacySessionId_abcdefghijklmnop';
  var reads = [];
  var restore = stubLib({ kvGet: function (key, cb) { reads.push(key); cb(null, { refresh_token: 'legacy-rt' }); } });
  var res = helpers.fakeRes();
  lib.getSession(helpers.fakeReq('GET', '/', 'spotify_session=' + sid), res, function (err, session) {
    restore();
    assert.ifError(err);
    assert.deepStrictEqual(reads, ['session:' + sid]);
    assert.strictEqual(session.refresh_token, 'legacy-rt');
    var value = decodeURIComponent(res.headers['Set-Cookie'].split(';')[0].split('=').slice(1).join('='));
    assert.strictEqual(lib.openSession(value).refresh_token, 'legacy-rt');
    done();
  });
});

test('memoryRateLimit limits per bucket and client within a window', function () {
  var req = { headers: { 'x-forwarded-for': '203.0.113.' + Math.floor(Math.random() * 250) } };
  assert.strictEqual(lib.memoryRateLimit(req, 'test-bucket', 2, 60), false);
  assert.strictEqual(lib.memoryRateLimit(req, 'test-bucket', 2, 60), false);
  assert.strictEqual(lib.memoryRateLimit(req, 'test-bucket', 2, 60), true);
  assert.strictEqual(lib.memoryRateLimit(req, 'other-bucket', 2, 60), false);
});

test('logout clears an encrypted session cookie without touching Redis', function () {
  var restore = stubLib({ kvDel: noKv });
  var res = helpers.fakeRes();
  logout(helpers.fakeReq('POST', '/api/auth/logout', 'spotify_session=' + lib.sealSession({ refresh_token: 'rt' })), res);
  restore();
  assert.strictEqual(res.statusCode, 200);
  assert.match(res.headers['Set-Cookie'], /Max-Age=0/);
});

test('logout deletes a legacy Redis session', function () {
  var deleted = null;
  var restore = stubLib({ kvDel: function (key, cb) { deleted = key; cb(null); } });
  var res = helpers.fakeRes();
  logout(helpers.fakeReq('POST', '/api/auth/logout', 'spotify_session=LegacySessionId_abcdefghijklmnop'), res);
  restore();
  assert.strictEqual(deleted, 'session:LegacySessionId_abcdefghijklmnop');
  assert.strictEqual(res.statusCode, 200);
});

test('forged legacy cookies cannot drive unbounded Redis lookups', function (t, done) {
  var reads = 0;
  var restore = stubLib({ kvGet: function (key, cb) { reads++; cb(null, null); } });
  var headers = { cookie: 'spotify_session=ForgedSessionId_abcdefghijklmnop', 'x-forwarded-for': '198.51.100.7' };
  var remaining = 10;
  (function next() {
    if (!remaining--) { restore(); assert.strictEqual(reads, 5); return done(); }
    lib.getSession({ headers: headers }, helpers.fakeRes(), function () { next(); });
  })();
});
