// Minimal Vercel-like req/res mocks for testing api/ handlers without a real HTTP server.
function fakeRes() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader: function (k, v) { this.headers[k] = v; return this; },
    status: function (code) { this.statusCode = code; return this; },
    end: function (text) { this.body = text; }
  };
}

function fakeReq(method, url, cookieHeader, bodyObj) {
  var raw = bodyObj !== undefined ? JSON.stringify(bodyObj) : '';
  return {
    method: method,
    url: url || '/',
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    on: function (event, cb) {
      if (event === 'data' && raw) cb(Buffer.from(raw));
      if (event === 'end') cb();
    }
  };
}

function resBody(res) {
  try { return JSON.parse(res.body || '{}'); } catch (e) { return {}; }
}

module.exports = { fakeRes: fakeRes, fakeReq: fakeReq, resBody: resBody };
