var lib = require('../_lib');
module.exports = function (req, res) {
  if ((req.method || '').toUpperCase() !== 'POST') return lib.json(res, 405, { error: 'Expected POST but received ' + req.method + '.' });
  lib.rateLimit(req, 'pair', 12, 600, function (limitErr, limited) {
    if (limitErr) return lib.json(res, 503, { error: 'Rate-limit storage is unavailable.' });
    if (limited) return lib.json(res, 429, { error: 'Too many pairing attempts. Try again later.' });
  lib.readBody(req, function (raw) {
    var code; try { code = JSON.parse(raw).code; } catch (e) {}
    code = String(code || '').replace(/[^a-z0-9]/ig, '').toUpperCase();
    if (!code || code.length < 6) return lib.json(res, 400, { error: 'Enter the pairing code shown after Spotify login.' });
    lib.kvGet('pair:' + code, function (err, record) {
      if (err || !record || record.expires < new Date().getTime()) return lib.json(res, 401, { error: 'Code is invalid or expired.' });
      lib.kvDel('pair:' + code, function () {
        var session = { refresh_token: record.refresh_token };
        if (record.user_id) session.user_id = record.user_id;
        if (!lib.setSession(res, session, !lib.isLocalHost(req))) return lib.json(res, 500, { error: 'Session encryption is not configured.' });
        // Keep an existing account badge working after re-login so its static URL never needs replacing.
        var id = lib.badgeId(record.user_id);
        if (!id) return lib.json(res, 200, { connected: true });
        lib.kvGet('badge:' + id, function (badgeErr, badge) {
          if (badgeErr || !badge) return lib.json(res, 200, { connected: true });
          lib.kvSet('badge:' + id, { refresh_token: record.refresh_token, user_id: record.user_id }, 31536000, function () { lib.json(res, 200, { connected: true }); });
        });
      });
    });
  });
  });
};
