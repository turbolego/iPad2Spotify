var lib = require('../_lib');
// Hot path: polled every 30-60 s by the paired app, so it must not touch Redis.
module.exports = function (req, res) {
  if (!lib.cookie(req, 'spotify_session')) return lib.json(res, 401, { error: 'Pair this fullscreen app first.' });
  if (lib.memoryRateLimit(req, 'poll', 40, 60)) return lib.json(res, 429, { error: 'Polling too frequently. Try again shortly.' });
  lib.getSession(req, res, function (err, session) {
    if (err || !session) return lib.json(res, 401, { error: 'Session expired. Pair again.' });
    var cfg = lib.config(req);
    lib.spotifyToken(cfg, 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(session.refresh_token), function (tokenErr, tokenStatus, token) {
      if (tokenErr || tokenStatus !== 200 || !token || !token.access_token) return lib.json(res, 401, { error: 'Spotify authorization expired. Pair again.' });
      lib.updateRefreshToken(res, session, token);
      lib.request('https://api.spotify.com/v1/me/player/currently-playing', { headers: { Authorization: 'Bearer ' + token.access_token } }, function (apiErr, status, data) {
        if (apiErr) return lib.json(res, 502, { error: 'Spotify request failed.' });
        if (status === 204) return lib.json(res, 200, { item: null, is_playing: false });
        if (status !== 200) return lib.json(res, status, data || { error: 'Spotify request failed.' });
        lib.json(res, 200, data);
      });
    });
  });
};
