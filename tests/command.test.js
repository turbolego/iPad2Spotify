var test = require('node:test');
var assert = require('node:assert');
var path = require('node:path');
var helpers = require('./helpers');

var lib = require(path.join('..', 'api', '_lib.js'));
var command = require(path.join('..', 'api', 'spotify', 'command.js'));

function stubLib(overrides) {
  var originals = {};
  Object.keys(overrides).forEach(function (key) { originals[key] = lib[key]; lib[key] = overrides[key]; });
  return function restore() { Object.keys(originals).forEach(function (key) { lib[key] = originals[key]; }); };
}

function notLimited(req, bucket, limit, seconds, cb) { cb(null, false); }
function validSession(key, cb) { cb(null, { refresh_token: 'refresh-token' }); }
function validToken(cfg, body, cb) { cb(null, 200, { access_token: 'access-token' }); }

test('rejects non-POST requests with 405', function () {
  var res = helpers.fakeRes();
  command(helpers.fakeReq('GET', '/api/spotify/command'), res);
  assert.strictEqual(res.statusCode, 405);
});

test('requires a paired session cookie', function () {
  var restore = stubLib({ rateLimit: notLimited });
  var res = helpers.fakeRes();
  command(helpers.fakeReq('POST', '/api/spotify/command', null, { action: 'play' }), res);
  restore();
  assert.strictEqual(res.statusCode, 401);
});

test('rejects an unknown playback action', function (t, done) {
  var restore = stubLib({ rateLimit: notLimited, kvGet: validSession, spotifyToken: validToken });
  var res = helpers.fakeRes();
  command(helpers.fakeReq('POST', '/api/spotify/command', 'spotify_session=sid', { action: 'shuffle' }), res);
  setImmediate(function () {
    restore();
    assert.strictEqual(res.statusCode, 400);
    assert.match(helpers.resBody(res).error, /unknown/i);
    done();
  });
});

test('rejects play_artist with an invalid artist id', function () {
  var restore = stubLib({ rateLimit: notLimited });
  var res = helpers.fakeRes();
  command(helpers.fakeReq('POST', '/api/spotify/command', 'spotify_session=sid', { action: 'play_artist', artist_id: '../etc/passwd' }), res);
  restore();
  assert.strictEqual(res.statusCode, 400);
  assert.match(helpers.resBody(res).error, /artist/i);
});

test('proxies a known action to the matching Spotify endpoint', function (t, done) {
  var calledWith = null;
  var restore = stubLib({
    rateLimit: notLimited, kvGet: validSession, spotifyToken: validToken,
    request: function (url, options, cb) { calledWith = { url: url, options: options }; cb(null, 204, null); }
  });
  var res = helpers.fakeRes();
  command(helpers.fakeReq('POST', '/api/spotify/command', 'spotify_session=sid', { action: 'next' }), res);
  setImmediate(function () {
    restore();
    assert.strictEqual(calledWith.url, 'https://api.spotify.com/v1/me/player/next');
    assert.strictEqual(calledWith.options.method, 'POST');
    assert.strictEqual(res.statusCode, 200);
    done();
  });
});

test('starts artist radio with a valid artist id via context_uri', function (t, done) {
  var calledWith = null;
  var restore = stubLib({
    rateLimit: notLimited, kvGet: validSession, spotifyToken: validToken,
    request: function (url, options, cb) { calledWith = { url: url, options: options }; cb(null, 204, null); }
  });
  var res = helpers.fakeRes();
  command(helpers.fakeReq('POST', '/api/spotify/command', 'spotify_session=sid', { action: 'play_artist', artist_id: '4NHQUGzhtTLFvgF5SZesLK' }), res);
  setImmediate(function () {
    restore();
    assert.strictEqual(calledWith.url, 'https://api.spotify.com/v1/me/player/play');
    assert.strictEqual(calledWith.options.method, 'PUT');
    assert.deepStrictEqual(JSON.parse(calledWith.options.body), { context_uri: 'spotify:artist:4NHQUGzhtTLFvgF5SZesLK' });
    assert.strictEqual(res.statusCode, 200);
    done();
  });
});

test('surfaces the real Spotify error message instead of a generic failure', function (t, done) {
  var restore = stubLib({
    rateLimit: notLimited, kvGet: validSession, spotifyToken: validToken,
    request: function (url, options, cb) { cb(null, 404, { error: { status: 404, message: 'Device not found' } }); }
  });
  var res = helpers.fakeRes();
  command(helpers.fakeReq('POST', '/api/spotify/command', 'spotify_session=sid', { action: 'play_artist', artist_id: '4NHQUGzhtTLFvgF5SZesLK' }), res);
  setImmediate(function () {
    restore();
    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(helpers.resBody(res).error, 'Device not found');
    done();
  });
});

test('targets an available device even when none is marked active', function (t, done) {
  var calls = [];
  var restore = stubLib({
    rateLimit: notLimited, kvGet: validSession, spotifyToken: validToken,
    request: function (url, options, cb) {
      calls.push(url);
      if (url.indexOf('/me/player/devices') !== -1) return cb(null, 200, { devices: [{ id: 'device-1', is_active: false }] });
      cb(null, 204, null);
    }
  });
  var res = helpers.fakeRes();
  command(helpers.fakeReq('POST', '/api/spotify/command', 'spotify_session=sid', { action: 'next' }), res);
  setImmediate(function () {
    restore();
    assert.match(calls[1], /device_id=device-1/);
    assert.strictEqual(res.statusCode, 200);
    done();
  });
});

test('maps NO_ACTIVE_DEVICE to a friendly message when no device is available', function (t, done) {
  var restore = stubLib({
    rateLimit: notLimited, kvGet: validSession, spotifyToken: validToken,
    request: function (url, options, cb) {
      if (url.indexOf('/me/player/devices') !== -1) return cb(null, 200, { devices: [] });
      cb(null, 404, { error: { status: 404, reason: 'NO_ACTIVE_DEVICE', message: 'No active device found' } });
    }
  });
  var res = helpers.fakeRes();
  command(helpers.fakeReq('POST', '/api/spotify/command', 'spotify_session=sid', { action: 'play_artist', artist_id: '4NHQUGzhtTLFvgF5SZesLK' }), res);
  setImmediate(function () {
    restore();
    assert.strictEqual(res.statusCode, 404);
    assert.match(helpers.resBody(res).error, /open spotify/i);
    done();
  });
});

test('returns 429 when rate limited', function () {
  var restore = stubLib({ rateLimit: function (req, bucket, limit, seconds, cb) { cb(null, true); } });
  var res = helpers.fakeRes();
  command(helpers.fakeReq('POST', '/api/spotify/command', 'spotify_session=sid', { action: 'play' }), res);
  restore();
  assert.strictEqual(res.statusCode, 429);
});
