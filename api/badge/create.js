var lib = require('../_lib');
module.exports = function (req, res) {
  if ((req.method || '').toUpperCase() !== 'POST') return lib.json(res, 405, { error: 'Expected POST but received ' + req.method + '.' });
  lib.rateLimit(req, 'badge-create', 3, 3600, function (limitErr, limited) {
    if (limitErr) return lib.json(res, 503, { error: 'Rate-limit storage is unavailable.' });
    if (limited) return lib.json(res, 429, { error: 'Too many badge keys created. Try again later.' });
    var sid = lib.cookie(req, 'spotify_session');
    if (!sid) return lib.json(res, 401, { error: 'Pair this fullscreen app first.' });
    var key = lib.random(12).replace(/[-_]/g, '').toLowerCase();
    lib.kvSet('badge:' + key, { session: sid }, 31536000, function (err) {
      if (err) return lib.json(res, 503, { error: 'Could not create badge key.' });
      lib.json(res, 200, { key: key, url: lib.origin(req) + '/api/badge/' + key + '.svg' });
    });
  });
};
