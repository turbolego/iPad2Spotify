var crypto = require('crypto');
var kv = require('./_kv');

function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https://i.scdn.co; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}
function json(res, status, body) {
  securityHeaders(res);
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
function readBody(req, callback) {
  var chunks = [];
  req.on('data', function (chunk) { chunks.push(chunk); });
  req.on('end', function () { callback(Buffer.concat(chunks).toString('utf8')); });
}
function cookie(req, name) {
  var raw = req.headers.cookie || '', match = raw.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}
function setCookie(res, name, value, maxAge, secure) {
  var attrs = name + '=' + encodeURIComponent(value) + '; Max-Age=' + maxAge + '; Path=/; HttpOnly; SameSite=Lax';
  if (secure !== false) attrs += '; Secure';
  res.setHeader('Set-Cookie', attrs);
}
function clearCookie(res, name) { setCookie(res, name, '', 0); }
function clientIp(req) { var forwarded = req.headers['x-forwarded-for']; return (forwarded ? forwarded.split(',')[0] : (req.headers['x-real-ip'] || 'unknown')).trim(); }
function rateLimit(req, bucket, limit, seconds, callback) { kv.kvIncr('rate:' + bucket + ':' + clientIp(req), seconds, function (err, count) { if (err) return callback(err); count = parseInt(count, 10); callback(null, count > limit, count); }); }
// Best-effort per-instance limiter for hot paths so normal polling never touches Redis.
var memoryBuckets = {}, memoryPruneAt = 0;
function memoryRateLimit(req, bucket, limit, seconds) {
  var now = Date.now(), key = bucket + ':' + clientIp(req), entry = memoryBuckets[key];
  if (now > memoryPruneAt) {
    for (var k in memoryBuckets) if (memoryBuckets[k].reset <= now) delete memoryBuckets[k];
    memoryPruneAt = now + 60000;
    entry = memoryBuckets[key];
  }
  if (!entry || entry.reset <= now) entry = memoryBuckets[key] = { count: 0, reset: now + seconds * 1000 };
  entry.count++;
  return entry.count > limit;
}
var SESSION_COOKIE = 'spotify_session', SESSION_MAX_AGE = 2592000;
function sessionKey() {
  var secret = process.env.SESSION_SECRET || process.env.SPOTIFY_CLIENT_SECRET;
  if (!secret) return null;
  return crypto.createHash('sha256').update('ipad2spotify-session-v1:' + secret).digest();
}
function sealSession(session) {
  var key = sessionKey();
  if (!key) return null;
  var iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  var data = Buffer.concat([cipher.update(JSON.stringify(session.user_id ? { refresh_token: session.refresh_token, user_id: session.user_id } : { refresh_token: session.refresh_token }), 'utf8'), cipher.final()]);
  return 'v1.' + base64Url(Buffer.concat([iv, cipher.getAuthTag(), data]));
}
function openSession(value) {
  var key = sessionKey();
  if (!key || typeof value !== 'string' || value.indexOf('v1.') !== 0) return null;
  try {
    var raw = Buffer.from(value.slice(3).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (raw.length < 29) return null;
    var decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    var session = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
    return session && typeof session.refresh_token === 'string' ? session : null;
  } catch (e) { return null; }
}
function setSession(res, session, secure) {
  var sealed = sealSession(session);
  if (!sealed) return false;
  setCookie(res, SESSION_COOKIE, sealed, SESSION_MAX_AGE, secure);
  return true;
}
function isLegacySessionId(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(value); }
// Reads the session from the encrypted cookie without Redis. Sessions created before the
// cookie migration are looked up in Redis once, re-issued as encrypted cookies, then left to expire.
function getSession(req, res, callback) {
  var value = cookie(req, SESSION_COOKIE);
  if (!value) return callback(null, null);
  var session = openSession(value);
  if (session) return callback(null, session);
  if (!isLegacySessionId(value)) return callback(null, null);
  // A genuine legacy cookie migrates on its first lookup; cap forged ones so they can't drive Redis traffic.
  if (module.exports.memoryRateLimit(req, 'legacy-session', 5, 3600)) return callback(null, null);
  module.exports.kvGet('session:' + value, function (err, legacy) {
    if (err) return callback(err);
    if (!legacy || !legacy.refresh_token) return callback(null, null);
    // The legacy key is left to expire on its own so pre-migration badges can still resolve it.
    module.exports.setSession(res, legacy);
    callback(null, legacy);
  });
}
// Spotify may rotate refresh tokens; keep the cookie in sync when it does.
function updateRefreshToken(res, session, token) {
  if (token && token.refresh_token && token.refresh_token !== session.refresh_token) {
    session.refresh_token = token.refresh_token;
    module.exports.setSession(res, session);
  }
}
// Spotify user IDs are numeric, base62, or legacy usernames; they double as the stable badge key.
function badgeId(userId) {
  var id = String(userId || '').toLowerCase();
  return /^[a-z0-9._-]{1,64}$/.test(id) ? id : null;
}
function spotifyUserId(accessToken, callback) {
  module.exports.request('https://api.spotify.com/v1/me', { headers: { Authorization: 'Bearer ' + accessToken }, timeout: 10000 }, function (err, status, data) {
    callback(!err && status === 200 && data && badgeId(data.id) ? data.id : null);
  });
}
function base64Url(value) { return value.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function random(size) { return base64Url(crypto.randomBytes(size)); }
// Fixed-length, human-typeable code: 32-char alphabet (no 0/O, 1/I/L confusion) maps
// bytes % 32 with zero modulo bias since 256 is an exact multiple of 32.
var PAIRING_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function pairingCode(length) {
  var alphabet = PAIRING_ALPHABET;
  var alphabetLen = alphabet.length;
  var maxValidByte = 256 - (256 % alphabetLen);
  var out = '';
  while (out.length < length) {
    var byte = crypto.randomBytes(1)[0];
    if (byte >= maxValidByte) continue;
    out += alphabet[byte % alphabetLen];
  }
  return out;
}
function redirect(res, location) { securityHeaders(res); res.statusCode = 302; res.setHeader('Location', location); res.end(); }
// 127.0.0.1/localhost so `vercel dev` (plain http) can build a matching redirect_uri and
// non-Secure cookies; Spotify requires 127.0.0.1 rather than localhost for loopback testing.
function isLocalHost(req) { return /^(127\.0\.0\.1|localhost)(:\d+)?$/i.test((req && req.headers && req.headers.host) || ''); }
function origin(req) { if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN.replace(/\/$/, ''); return (isLocalHost(req) ? 'http://' : 'https://') + req.headers.host; }
function config(req) { return { id: process.env.SPOTIFY_CLIENT_ID, secret: process.env.SPOTIFY_CLIENT_SECRET, redirect: origin(req) + '/api/auth/callback' }; }
function request(url, options, callback) {
  var called = false;
  var timer;
  function done(err, status, data, text) {
    if (called) return; called = true;
    if (timer) clearTimeout(timer);
    callback(err, status, data, text);
  }
  var https = require('https'), parsed = require('url').parse(url), req = https.request({ hostname: parsed.hostname, path: parsed.path, method: options.method || 'GET', headers: options.headers || {} }, function (res) {
    var chunks = [];
    res.on('data', function (chunk) { chunks.push(chunk); });
    res.on('end', function () { var text = Buffer.concat(chunks).toString('utf8'), data = null; try { data = JSON.parse(text); } catch (e) {} done(null, res.statusCode, data, text); });
    res.on('error', function (err) { done(err); });
    res.on('aborted', function () { done(new Error('Request aborted.')); });
  });
  req.on('error', function (err) { done(err); });
  var timeout = options.timeout || 120000;
  timer = setTimeout(function () { req.destroy(); done(new Error('Upstream request timed out.')); }, timeout);
  req.setTimeout(timeout, function () { req.destroy(new Error('Upstream request timed out.')); });
  if (options.body) req.write(options.body);
  req.end();
}
function spotifyToken(cfg, body, callback) {
  var encoded = Buffer.from(cfg.id + ':' + cfg.secret).toString('base64');
  request('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Authorization': 'Basic ' + encoded, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }, body: body, timeout: 10000 }, callback);
}
function requestBuffer(url, options, callback) {
  var called = false;
  function done(err, status, data, headers) {
    if (called) return; called = true;
    callback(err, status, data, headers);
  }
  var https = require('https'), parsed = require('url').parse(url), req = https.request({ hostname: parsed.hostname, path: parsed.path, method: options.method || 'GET', headers: options.headers || {} }, function (res) { var chunks = []; res.on('data', function (chunk) { chunks.push(chunk); }); res.on('end', function () { done(null, res.statusCode, Buffer.concat(chunks), res.headers); }); res.on('error', function (err) { done(err); }); res.on('aborted', function () { done(new Error('Request aborted.')); }); });
  req.on('error', function (err) { done(err); });
  req.setTimeout(120000, function () { req.destroy(new Error('Upstream request timed out.')); });
  req.end();
}
module.exports = { json: json, readBody: readBody, cookie: cookie, setCookie: setCookie, clearCookie: clearCookie, clientIp: clientIp, rateLimit: rateLimit, memoryRateLimit: memoryRateLimit, sealSession: sealSession, openSession: openSession, setSession: setSession, getSession: getSession, isLegacySessionId: isLegacySessionId, updateRefreshToken: updateRefreshToken, badgeId: badgeId, spotifyUserId: spotifyUserId, random: random, pairingCode: pairingCode, redirect: redirect, config: config, origin: origin, isLocalHost: isLocalHost, request: request, requestBuffer: requestBuffer, spotifyToken: spotifyToken, kvSet: kv.kvSet, kvGet: kv.kvGet, kvDel: kv.kvDel };
