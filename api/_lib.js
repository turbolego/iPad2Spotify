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
function setCookie(res, name, value, maxAge) {
  res.setHeader('Set-Cookie', name + '=' + encodeURIComponent(value) + '; Max-Age=' + maxAge + '; Path=/; HttpOnly; Secure; SameSite=Lax');
}
function clearCookie(res, name) { setCookie(res, name, '', 0); }
function clientIp(req) { var forwarded = req.headers['x-forwarded-for']; return (forwarded ? forwarded.split(',')[0] : (req.headers['x-real-ip'] || 'unknown')).trim(); }
function rateLimit(req, bucket, limit, seconds, callback) { kv.kvIncr('rate:' + bucket + ':' + clientIp(req), seconds, function (err, count) { if (err) return callback(err); count = parseInt(count, 10); callback(null, count > limit, count); }); }
function base64Url(value) { return value.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function random(size) { return base64Url(crypto.randomBytes(size)); }
function redirect(res, location) { securityHeaders(res); res.statusCode = 302; res.setHeader('Location', location); res.end(); }
function origin(req) { return (process.env.APP_ORIGIN || ('https://' + req.headers.host)).replace(/\/$/, ''); }
function config(req) { return { id: process.env.SPOTIFY_CLIENT_ID, secret: process.env.SPOTIFY_CLIENT_SECRET, redirect: origin(req) + '/api/auth/callback' }; }
function request(url, options, callback) {
  var https = require('https'), parsed = require('url').parse(url), req = https.request({ hostname: parsed.hostname, path: parsed.path, method: options.method || 'GET', headers: options.headers || {} }, function (res) {
    var chunks = [];
    res.on('data', function (chunk) { chunks.push(chunk); });
    res.on('end', function () { var text = Buffer.concat(chunks).toString('utf8'), data = null; try { data = JSON.parse(text); } catch (e) {} callback(null, res.statusCode, data, text); });
  });
  req.on('error', function (err) { callback(err); });
  if (options.body) req.write(options.body);
  req.end();
}
function spotifyToken(cfg, body, callback) {
  var encoded = Buffer.from(cfg.id + ':' + cfg.secret).toString('base64');
  request('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Authorization': 'Basic ' + encoded, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }, body: body }, callback);
}
module.exports = { json: json, readBody: readBody, cookie: cookie, setCookie: setCookie, clearCookie: clearCookie, clientIp: clientIp, rateLimit: rateLimit, random: random, redirect: redirect, config: config, origin: origin, request: request, spotifyToken: spotifyToken, kvSet: kv.kvSet, kvGet: kv.kvGet, kvDel: kv.kvDel };