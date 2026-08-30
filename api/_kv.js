function call(command, callback) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return callback(new Error('KV variables are missing from this deployment'));
  var https = require('https'), parsed = require('url').parse(process.env.KV_REST_API_URL.replace(/\/$/, '') + '/' + command.map(encodeURIComponent).join('/'));
  var req = https.request({ protocol: parsed.protocol, hostname: parsed.hostname, port: parsed.port, path: parsed.path, method: 'GET', headers: { Authorization: 'Bearer ' + process.env.KV_REST_API_TOKEN } }, function (res) { var chunks = []; res.on('data', function (c) { chunks.push(c); }); res.on('end', function () { var text = Buffer.concat(chunks).toString('utf8'), data; try { data = JSON.parse(text); } catch (e) { return callback(new Error('KV returned a non-JSON response')); } callback(res.statusCode >= 200 && res.statusCode < 300 ? null : new Error('KV returned HTTP ' + res.statusCode), data.result); }); });
  req.on('error', function () { callback(new Error('KV connection failed')); }); req.end();
}
function kvSet(key, value, seconds, cb) { call(['set', key, JSON.stringify(value), 'EX', seconds], cb); }
function kvGet(key, cb) { call(['get', key], function (err, value) { if (err || !value) return cb(err, null); try { cb(null, JSON.parse(value)); } catch (e) { cb(e); } }); }
function kvDel(key, cb) { call(['del', key], cb); }
module.exports = { kvSet: kvSet, kvGet: kvGet, kvDel: kvDel };
