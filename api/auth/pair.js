var lib = require('../_lib');
module.exports = function (req, res) {
  if (req.method !== 'POST') return lib.json(res, 405, { error: 'POST required' });
  lib.readBody(req, function (raw) {
    var code; try { code = JSON.parse(raw).code; } catch (e) {}
    code = String(code || '').replace(/[^a-z0-9]/ig, '').toUpperCase();
    if (!code || code.length < 6) return lib.json(res, 400, { error: 'Enter the pairing code shown after Spotify login.' });
    lib.kvGet('pair:' + code, function (err, record) {
      if (err || !record || record.expires < new Date().getTime()) return lib.json(res, 401, { error: 'Code is invalid or expired.' });
      lib.kvDel('pair:' + code, function () {
        var sid = lib.random(24);
        lib.kvSet('session:' + sid, { refresh_token: record.refresh_token }, 2592000, function (saveErr) {
          if (saveErr) return lib.json(res, 503, { error: 'Session storage failed.' });
          lib.setCookie(res, 'spotify_session', sid, 2592000);
          lib.json(res, 200, { connected: true });
        });
      });
    });
  });
};
