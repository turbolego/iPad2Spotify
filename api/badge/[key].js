var lib = require('../_lib');
function esc(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function emptySvg(message) { return '<svg xmlns="http://www.w3.org/2000/svg" width="520" height="150" viewBox="0 0 520 150"><rect width="520" height="150" rx="10" fill="#1b231f"/><text x="25" y="55" fill="#b6d64b" font-family="Arial" font-size="16">♫ LAST PLAYED ON SPOTIFY</text><text x="25" y="95" fill="#f5f1e8" font-family="Arial" font-size="18">' + esc(message || 'No track observed yet') + '</text><text x="25" y="125" fill="#899389" font-family="Arial" font-size="12">Independent hobby project</text></svg>'; }
function trackSvg(title, artist, imageUrl) {
  var artwork = imageUrl
    ? '<image href="' + esc(imageUrl) + '" xlink:href="' + esc(imageUrl) + '" x="0" y="0" width="150" height="150" preserveAspectRatio="xMidYMid slice"/>'
    : '<rect width="150" height="150" fill="#27332b"/><text x="75" y="85" text-anchor="middle" fill="#b6d64b" font-size="48">♫</text>';
  // Truncate raw strings before escaping so a slice never cuts an HTML entity
  // in half (e.g. "&amp;" -> "&a") and produces invalid SVG/XML.
  var safeTitle = esc(String(title || '').slice(0, 52));
  var safeArtist = esc(String(artist || '').slice(0, 52));
  return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="620" height="150" viewBox="0 0 620 150">' + artwork + '<rect x="150" width="470" height="150" fill="#1b231f"/><text x="175" y="38" fill="#b6d64b" font-family="Arial" font-size="13" letter-spacing="2">LAST PLAYED ON SPOTIFY</text><text x="175" y="78" fill="#f5f1e8" font-family="Arial" font-size="22" font-weight="bold">' + safeTitle + '</text><text x="175" y="108" fill="#c4ccc3" font-family="Arial" font-size="16">' + safeArtist + '</text><text x="175" y="133" fill="#899389" font-family="Arial" font-size="11">Independent hobby project · not Spotify</text></svg>';
}
function sendSvg(res, svg) { res.statusCode = 200; res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8'); res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=600'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.end(svg); }
function artistNames(track) { return (track.artists || []).map(function (a) { return a.name; }).join(', '); }
function albumImage(track) { return track.album && track.album.images && track.album.images.length ? track.album.images[0].url : ''; }
// Resolve the badge record to a refresh token. Badges created before the encrypted-cookie
// migration store { session } and are upgraded to { refresh_token } on first render.
function resolveBadge(key, callback) {
  lib.kvGet('badge:' + key, function (err, badge) {
    if (err) return callback(err);
    if (!badge) return callback(null, null);
    if (badge.refresh_token) return callback(null, badge);
    if (!badge.session) return callback(null, null);
    lib.kvGet('session:' + badge.session, function (sessionErr, session) {
      if (sessionErr) return callback(sessionErr);
      if (!session || !session.refresh_token) return callback(null, badge);
      var upgraded = { refresh_token: session.refresh_token };
      lib.kvSet('badge:' + key, upgraded, 31536000, function () { callback(null, upgraded); });
    });
  });
}
// Live lookup straight from Spotify: what is playing now, otherwise the most recently played track.
function latestTrack(accessToken, callback) {
  var headers = { Authorization: 'Bearer ' + accessToken };
  lib.request('https://api.spotify.com/v1/me/player/currently-playing', { headers: headers, timeout: 10000 }, function (err, status, data) {
    if (!err && status === 200 && data && data.item && data.item.type !== 'episode') return callback(data.item);
    lib.request('https://api.spotify.com/v1/me/player/recently-played?limit=1', { headers: headers, timeout: 10000 }, function (recentErr, recentStatus, recent) {
      var item = !recentErr && recentStatus === 200 && recent && recent.items && recent.items[0] && recent.items[0].track;
      callback(item || null);
    });
  });
}
module.exports = function (req, res) {
  var pathname = require('url').parse(req.url).pathname, match = pathname.match(/\/api\/badge\/([^\/]+)\.svg$/i), key = null;
  try { key = match && lib.badgeId(decodeURIComponent(match[1])); } catch (e) {}
  if (!key) return lib.json(res, 404, { error: 'Badge not found.' });
  resolveBadge(key, function (err, badge) {
    if (err) return lib.json(res, 503, { error: 'Badge storage is unavailable.' });
    if (!badge) return lib.json(res, 404, { error: 'Badge not found.' });
    if (!badge.refresh_token) return sendSvg(res, emptySvg('Badge needs a new Spotify login'));
    var cfg = lib.config(req);
    lib.spotifyToken(cfg, 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(badge.refresh_token), function (tokenErr, tokenStatus, token) {
      if (tokenErr || tokenStatus !== 200 || !token || !token.access_token) return sendSvg(res, emptySvg('Spotify is unavailable right now'));
      if (token.refresh_token && token.refresh_token !== badge.refresh_token) lib.kvSet('badge:' + key, { refresh_token: token.refresh_token, user_id: badge.user_id }, 31536000, function () {});
      latestTrack(token.access_token, function (track) {
        if (!track) return sendSvg(res, emptySvg());
        var title = track.name || '', artist = artistNames(track), image = albumImage(track);
        if (!image) return sendSvg(res, trackSvg(title, artist, ''));
        // Embed artwork as a data URI; GitHub's image proxy won't load external images inside SVGs.
        lib.requestBuffer(image, {}, function (imageErr, imageStatus, imageData, headers) {
          var type = headers && headers['content-type'] && headers['content-type'].split(';')[0];
          var embedded = !imageErr && imageStatus === 200 && type && type.indexOf('image/') === 0 ? 'data:' + type + ';base64,' + imageData.toString('base64') : image;
          sendSvg(res, trackSvg(title, artist, embedded));
        });
      });
    });
  });
};
