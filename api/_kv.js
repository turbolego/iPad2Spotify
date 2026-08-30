function call(command, callback) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return callback(new Error('KV not configured'));
  var https = require('https'), base = process.env.KV_REST_API_URL.replace(/\/$/, ''), path = '/' + command.map(encodeURIComponent).join('/');
  var req = https.request(base + path, { method: 'GET', headers: { Authorization: 'Bearer ' + process.env.KV_REST_API_TOKEN } }, function (res) { var chunks = []; res.on('data', function (c) { chunks.push(c); }); res.on('end', function () { var data; try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return callback(e); } callback(res.statusCode >= 200 && res.statusCode < 300 ? null : new Error('KV request failed'), data.result); }); });
  req.on('error', callback); req.end();
}
function kvSet(key, value, seconds, cb) { call(['set', key, JSON.stringify(value), 'EX', seconds], cb); }
function kvGet(key, cb) { call(['get', key], function (err, value) { if (err || !value) return cb(err, null); try { cb(null, JSON.parse(value)); } catch (e) { cb(e); } }); }
function kvDel(key, cb) { call(['del', key], cb); }
module.exports = { kvSet: kvSet, kvGet: kvGet, kvDel: kvDel };
