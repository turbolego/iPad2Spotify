var lib = require('../_lib');
module.exports = function (req, res) {
  var sid = lib.cookie(req, 'spotify_session');
  if (!sid) { lib.clearCookie(res, 'spotify_session'); return lib.json(res, 200, { disconnected: true }); }
  lib.kvDel('session:' + sid, function () { lib.clearCookie(res, 'spotify_session'); lib.json(res, 200, { disconnected: true }); });
};
