var lib = require('../_lib');
module.exports = function (req, res) {
  var cfg = lib.config(req);
  if (!cfg.id || !cfg.secret) return lib.json(res, 500, { error: 'Vercel Spotify environment variables are not configured.' });
  var state = lib.random(18);
  lib.setCookie(res, 'spotify_oauth_state', state, 600);
  lib.redirect(res, 'https://accounts.spotify.com/authorize?' + [
    'response_type=code', 'client_id=' + encodeURIComponent(cfg.id), 'scope=' + encodeURIComponent('user-read-currently-playing user-read-playback-state user-modify-playback-state'), 'redirect_uri=' + encodeURIComponent(cfg.redirect), 'state=' + encodeURIComponent(state), 'show_dialog=true'
  ].join('&'));
};
