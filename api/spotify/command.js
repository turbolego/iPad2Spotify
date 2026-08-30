var lib = require('../_lib');
var paths = { play: ['PUT', '/me/player/play'], pause: ['PUT', '/me/player/pause'], next: ['POST', '/me/player/next'], previous: ['POST', '/me/player/previous'] };
function artistIdFrom(body) {
  return body && typeof body.artist_id === 'string' && /^[A-Za-z0-9]{10,30}$/.test(body.artist_id) ? body.artist_id : null;
}
function spotifyErrorMessage(data) {
  var err = data && data.error;
  if (!err) return 'Spotify request failed.';
  if (typeof err === 'string') return err;
  return err.message || err.reason || 'Spotify request failed.';
}
module.exports = function (req, res) {
  if (req.method !== 'POST') return lib.json(res, 405, { error: 'POST required' });
  lib.rateLimit(req, 'command', 60, 60, function (limitErr, limited) {
  if (limitErr) return lib.json(res, 503, { error: 'Rate-limit storage is unavailable.' });
  if (limited) return lib.json(res, 429, { error: 'Too many playback commands. Try again shortly.' });
  var sid = lib.cookie(req, 'spotify_session');
  if (!sid) return lib.json(res, 401, { error: 'Pair this fullscreen app first.' });
  lib.readBody(req, function (raw) { var body; try { body = JSON.parse(raw); } catch (e) {}
    var isArtist = body && body.action === 'play_artist';
    var artistId = isArtist ? artistIdFrom(body) : null;
    if (isArtist && !artistId) return lib.json(res, 400, { error: 'Unknown artist.' });
    var target = !isArtist && paths[body && body.action];
    if (!isArtist && !target) return lib.json(res, 400, { error: 'Unknown playback command.' });
    lib.kvGet('session:' + sid, function (err, session) { if (err || !session) return lib.json(res, 401, { error: 'Session expired. Pair again.' }); var cfg = lib.config(req); lib.spotifyToken(cfg, 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(session.refresh_token), function (tokenErr, tokenStatus, token) { if (tokenErr || tokenStatus !== 200 || !token.access_token) return lib.json(res, 401, { error: 'Spotify authorization expired.' });
      var method = isArtist ? 'PUT' : target[0];
      var path = isArtist ? '/me/player/play' : target[1];
      var payload = isArtist ? JSON.stringify({ context_uri: 'spotify:artist:' + artistId }) : null;
      var headers = { Authorization: 'Bearer ' + token.access_token };
      if (payload) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(payload); } else { headers['Content-Length'] = 0; }
      lib.request('https://api.spotify.com/v1' + path, { method: method, headers: headers, body: payload }, function (apiErr, status, data) {
        if (apiErr) return lib.json(res, 502, { error: 'Spotify request failed.' });
        if (status === 200 || status === 204) return lib.json(res, 200, {});
        lib.json(res, status, { error: spotifyErrorMessage(data) });
      });
    }); });
  });
  });
};

