var lib = require('../_lib');
var paths = { play: ['PUT', '/me/player/play'], pause: ['PUT', '/me/player/pause'], next: ['POST', '/me/player/next'], previous: ['POST', '/me/player/previous'] };
module.exports = function (req, res) {
  if (req.method !== 'POST') return lib.json(res, 405, { error: 'POST required' });
  lib.rateLimit(req, 'command', 60, 60, function (limitErr, limited) {
  if (limitErr) return lib.json(res, 503, { error: 'Rate-limit storage is unavailable.' });
  if (limited) return lib.json(res, 429, { error: 'Too many playback commands. Try again shortly.' });
  var sid = lib.cookie(req, 'spotify_session');
  if (!sid) return lib.json(res, 401, { error: 'Pair this fullscreen app first.' });
  lib.readBody(req, function (raw) { var body; try { body = JSON.parse(raw); } catch (e) {}
    if (body && body.action === 'play_artist') {
      var artistId = typeof body.artist_id === 'string' && /^[A-Za-z0-9]{10,30}$/.test(body.artist_id) ? body.artist_id : null;
      if (!artistId) return lib.json(res, 400, { error: 'Unknown artist.' });
      return lib.kvGet('session:' + sid, function (err, session) { if (err || !session) return lib.json(res, 401, { error: 'Session expired. Pair again.' }); var cfg = lib.config(req); lib.spotifyToken(cfg, 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(session.refresh_token), function (tokenErr, tokenStatus, token) { if (tokenErr || tokenStatus !== 200) return lib.json(res, 401, { error: 'Spotify authorization expired.' }); var payload = JSON.stringify({ context_uri: 'spotify:artist:' + artistId }); lib.request('https://api.spotify.com/v1/me/player/play', { method: 'PUT', headers: { Authorization: 'Bearer ' + token.access_token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, body: payload }, function (apiErr, status) { if (apiErr) return lib.json(res, 502, { error: 'Spotify request failed.' }); res.statusCode = status === 204 ? 200 : status; res.end(); }); }); });
    }
    var target = paths[body && body.action]; if (!target) return lib.json(res, 400, { error: 'Unknown playback command.' });
    lib.kvGet('session:' + sid, function (err, session) { if (err || !session) return lib.json(res, 401, { error: 'Session expired. Pair again.' }); var cfg = lib.config(req); lib.spotifyToken(cfg, 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(session.refresh_token), function (tokenErr, tokenStatus, token) { if (tokenErr || tokenStatus !== 200) return lib.json(res, 401, { error: 'Spotify authorization expired.' }); lib.request('https://api.spotify.com/v1' + target[1], { method: target[0], headers: { Authorization: 'Bearer ' + token.access_token, 'Content-Length': 0 } }, function (apiErr, status) { if (apiErr) return lib.json(res, 502, { error: 'Spotify request failed.' }); res.statusCode = status === 204 ? 200 : status; res.end(); }); }); });
  });
  });
};
