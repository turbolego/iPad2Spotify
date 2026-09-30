var lib = require('../_lib');
module.exports = function (req, res) {
  var value = lib.cookie(req, 'spotify_session');
  function done() { lib.clearCookie(res, 'spotify_session'); lib.json(res, 200, { disconnected: true }); }
  // Only sessions from before the encrypted-cookie migration live in Redis.
  if (value && lib.isLegacySessionId(value) && !lib.openSession(value)) return lib.kvDel('session:' + value, done);
  done();
};
