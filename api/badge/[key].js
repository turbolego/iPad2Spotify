var lib = require('../_lib');
function esc(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function emptySvg() { return '<svg xmlns="http://www.w3.org/2000/svg" width="520" height="150" viewBox="0 0 520 150"><rect width="520" height="150" rx="10" fill="#1b231f"/><text x="25" y="55" fill="#b6d64b" font-family="Arial" font-size="16">♫ LAST PLAYED ON SPOTIFY</text><text x="25" y="95" fill="#f5f1e8" font-family="Arial" font-size="18">No track observed yet</text><text x="25" y="125" fill="#899389" font-family="Arial" font-size="12">Independent hobby project</text></svg>'; }
function trackSvg(title, artist, imageUrl) {
  var artwork = imageUrl
    ? '<image href="' + esc(imageUrl) + '" xlink:href="' + esc(imageUrl) + '" x="0" y="0" width="150" height="150" preserveAspectRatio="xMidYMid slice"/>'
    : '<rect width="150" height="150" fill="#27332b"/><text x="75" y="85" text-anchor="middle" fill="#b6d64b" font-size="48">♫</text>';
  return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="620" height="150" viewBox="0 0 620 150">' + artwork + '<rect x="150" width="470" height="150" fill="#1b231f"/><text x="175" y="38" fill="#b6d64b" font-family="Arial" font-size="13" letter-spacing="2">LAST PLAYED ON SPOTIFY</text><text x="175" y="78" fill="#f5f1e8" font-family="Arial" font-size="22" font-weight="bold">' + esc(title).slice(0, 52) + '</text><text x="175" y="108" fill="#c4ccc3" font-family="Arial" font-size="16">' + esc(artist).slice(0, 52) + '</text><text x="175" y="133" fill="#899389" font-family="Arial" font-size="11">Independent hobby project · not Spotify</text></svg>';
}
function sendSvg(res, svg) { res.statusCode = 200; res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8'); res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.end(svg); }
// Render the cached `last:` snapshot. Every live-enrichment failure path
// (missing session, refresh-token expired, Spotify API down, album-art fetch
// blocked) falls back to this helper, so a working badge never blanks out
// just because Spotify is briefly unreachable. Only when there is no cached
// snapshot at all do we render the "No track observed yet" placeholder.
function renderCached(res, track) { sendSvg(res, trackSvg(track.track_name || '', track.artist_name || '', track.album_image_url || '')); }
module.exports = function (req, res) {
  lib.rateLimit(req, 'badge-read', 60, 60, function (limitErr, limited) {
    if (limitErr) return lib.json(res, 503, { error: 'Rate-limit storage is unavailable.' });
    if (limited) return lib.json(res, 429, { error: 'Badge requested too frequently.' });
    var pathname = require('url').parse(req.url).pathname, match = pathname.match(/\/api\/badge\/([a-z0-9]+)\.svg$/i), key = match && match[1].toLowerCase();
    if (!key) return lib.json(res, 404, { error: 'Badge not found.' });
    lib.kvGet('badge:' + key, function (err, badge) {
      if (err || !badge) return lib.json(res, 404, { error: 'Badge not found.' });
      lib.kvGet('last:' + badge.session, function (lastErr, track) {
        // Only the absence of any cached `last:` record is treated as "the
        // badge has never been used" — in that one case we render the empty
        // placeholder. If a record exists at all, we always render it; live
        // enrichment (which needs a track_id to call the Spotify API) is an
        // optional upgrade on top, never a gate.
        if (lastErr || !track) return sendSvg(res, emptySvg());
        var cfg = lib.config(req);
        if (!track.track_id) return renderCached(res, track);
        lib.kvGet('session:' + badge.session, function (sessionErr, session) {
          if (sessionErr || !session || !session.refresh_token) return renderCached(res, track);
          lib.spotifyToken(cfg, 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(session.refresh_token), function (tokenErr, tokenStatus, token) {
            if (tokenErr || tokenStatus !== 200 || !token.access_token) return renderCached(res, track);
            lib.request('https://api.spotify.com/v1/tracks/' + encodeURIComponent(track.track_id), { headers: { Authorization: 'Bearer ' + token.access_token } }, function (apiErr, apiStatus, spotifyTrack) {
              if (apiErr || apiStatus !== 200 || !spotifyTrack) return renderCached(res, track);
              var liveTitle = spotifyTrack.name || track.track_name || '';
              var liveArtist = (spotifyTrack.artists || []).map(function (a) { return a.name; }).join(', ') || track.artist_name || '';
              var liveImage = spotifyTrack.album && spotifyTrack.album.images && spotifyTrack.album.images.length ? spotifyTrack.album.images[0].url : track.album_image_url || '';
              if (!liveImage) return sendSvg(res, trackSvg(liveTitle, liveArtist, ''));
              lib.requestBuffer(liveImage, {}, function (imageErr, imageStatus, imageData, headers) {
                var type = headers && headers['content-type'] && headers['content-type'].split(';')[0];
                if (!imageErr && imageStatus === 200 && type && type.indexOf('image/') === 0) {
                  liveImage = 'data:' + type + ';base64,' + imageData.toString('base64');
                } else {
                  liveImage = track.album_image_url || '';
                }
                sendSvg(res, trackSvg(liveTitle, liveArtist, liveImage));
              });
            });
          });
        });
      });
    });
  });
};
