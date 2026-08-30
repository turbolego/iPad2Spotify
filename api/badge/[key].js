var lib = require('../_lib');
function esc(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
module.exports = function (req, res) {
  lib.rateLimit(req, 'badge-read', 60, 60, function (limitErr, limited) {
    if (limitErr) return lib.json(res, 503, { error: 'Rate-limit storage is unavailable.' });
    if (limited) return lib.json(res, 429, { error: 'Badge requested too frequently.' });
    var pathname = require('url').parse(req.url).pathname, match = pathname.match(/\/api\/badge\/([a-z0-9]+)\.svg$/i), key = match && match[1].toLowerCase();
    if (!key) return lib.json(res, 404, { error: 'Badge not found.' });
    lib.kvGet('badge:' + key, function (err, badge) {
      if (err || !badge) return lib.json(res, 404, { error: 'Badge not found.' });
      lib.kvGet('last:' + badge.session, function (lastErr, track) {
        res.statusCode = 200; res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8'); res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
        if (lastErr || !track) return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="520" height="150" viewBox="0 0 520 150"><rect width="520" height="150" rx="10" fill="#1b231f"/><text x="25" y="55" fill="#b6d64b" font-family="Arial" font-size="16">♫ LAST PLAYED ON SPOTIFY</text><text x="25" y="95" fill="#f5f1e8" font-family="Arial" font-size="18">No track observed yet</text><text x="25" y="125" fill="#899389" font-family="Arial" font-size="12">Independent hobby project</text></svg>');
        var image = track.album_image_url ? '<image href="' + esc(track.album_image_url) + '" xlink:href="' + esc(track.album_image_url) + '" x="0" y="0" width="150" height="150" preserveAspectRatio="xMidYMid slice"/>' : '<rect width="150" height="150" fill="#27332b"/><text x="75" y="85" text-anchor="middle" fill="#b6d64b" font-size="48">♫</text>';
        res.end('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="620" height="150" viewBox="0 0 620 150">' + image + '<rect x="150" width="470" height="150" fill="#1b231f"/><text x="175" y="38" fill="#b6d64b" font-family="Arial" font-size="13" letter-spacing="2">LAST PLAYED ON SPOTIFY</text><text x="175" y="78" fill="#f5f1e8" font-family="Arial" font-size="22" font-weight="bold">' + esc(track.track_name).slice(0, 52) + '</text><text x="175" y="108" fill="#c4ccc3" font-family="Arial" font-size="16">' + esc(track.artist_name).slice(0, 52) + '</text><text x="175" y="133" fill="#899389" font-family="Arial" font-size="11">Independent hobby project · not Spotify</text></svg>');
      });
    });
  });
};
