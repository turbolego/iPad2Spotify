var lib = require('../_lib');
module.exports = function (req, res) {
  lib.rateLimit(req, 'poll', 40, 60, function (limitErr, limited) {
  if (limitErr) return lib.json(res, 503, { error: 'Rate-limit storage is unavailable.' });
  if (limited) return lib.json(res, 429, { error: 'Polling too frequently. Try again shortly.' });
  var sid = lib.cookie(req, 'spotify_session');
  if (!sid) return lib.json(res, 401, { error: 'Pair this fullscreen app first.' });
  lib.kvGet('session:' + sid, function (err, session) {
    if (err || !session) return lib.json(res, 401, { error: 'Session expired. Pair again.' });
    var cfg = lib.config(req);
    lib.spotifyToken(cfg, 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(session.refresh_token), function (tokenErr, tokenStatus, token) {
      if (tokenErr || tokenStatus !== 200 || !token.access_token) return lib.json(res, 401, { error: 'Spotify authorization expired. Pair again.' });
      lib.request('https://api.spotify.com/v1/me/player/currently-playing', { headers: { Authorization: 'Bearer ' + token.access_token } }, function (apiErr, status, data) {
        if (apiErr) return lib.json(res, 502, { error: 'Spotify request failed.' });
        if (status === 204) return lib.json(res, 200, { item: null, is_playing: false });
        if (status !== 200) return lib.json(res, status, data || { error: 'Spotify request failed.' });
        var item = data.item || {}, artists = (item.artists || []).map(function (artist) { return artist.name; });
        lib.kvSet('last:' + sid, { track_id: item.id, track_name: item.name, artist_name: artists.join(', '), album_name: item.album && item.album.name, album_image_url: item.album && item.album.images && item.album.images.length ? item.album.images[0].url : '', spotify_url: item.external_urls && item.external_urls.spotify, updated_at: new Date().toISOString() }, 2592000, function (saveErr) {
          if (saveErr) return lib.json(res, 503, { error: 'Could not save last-played track.' });
          lib.json(res, 200, data);
        });
      });
    });
  });
  });
};
