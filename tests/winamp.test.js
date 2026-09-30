'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const W = require('../winamp.js');

const root = path.join(__dirname, '..');
const track = (over) => Object.assign({
  is_playing: true,
  progress_ms: 30000,
  item: { id: 'abc123', name: 'Song', duration_ms: 200000, album: { name: 'Album' }, artists: [{ name: 'A' }, { name: 'B' }] }
}, over);
const flatEq = () => ({ on: true, preamp: 50, bands: [50, 50, 50, 50, 50, 50, 50, 50, 50, 50] });

test('fromSpotify maps a playing track', () => {
  const s = W.fromSpotify(track(), 1000);
  assert.strictEqual(s.status, 'playing');
  assert.strictEqual(s.artist, 'A, B');
  assert.strictEqual(s.title, 'Song');
  assert.strictEqual(s.trackId, 'abc123');
  assert.strictEqual(s.durationMs, 200000);
  assert.strictEqual(s.progressMs, 30000);
});

test('fromSpotify maps paused, and a missing item to stopped (not "playing")', () => {
  assert.strictEqual(W.fromSpotify(track({ is_playing: false }), 0).status, 'paused');
  assert.strictEqual(W.fromSpotify({ item: null, is_playing: true }, 0).status, 'stopped');
  assert.strictEqual(W.fromSpotify({ item: null, is_playing: false }, 0).status, 'stopped');
  assert.strictEqual(W.fromSpotify(null, 0).status, 'stopped');
});

test('positionMs advances only while playing and clamps to duration', () => {
  const playing = W.fromSpotify(track(), 1000);
  assert.strictEqual(W.positionMs(playing, 6000), 35000);
  assert.strictEqual(W.positionMs(playing, 1000 + 10 * 60000), 200000);
  const paused = W.fromSpotify(track({ is_playing: false }), 1000);
  assert.strictEqual(W.positionMs(paused, 60000), 30000);
  assert.strictEqual(W.positionMs(W.fromSpotify(null, 0), 5000), 0);
});

test('spectrum is deterministic, bounded and track-dependent', () => {
  const p = W.trackProfile('abc123');
  const a = W.spectrum(p, 42.5, 200, flatEq(), new Array(19));
  const b = W.spectrum(W.trackProfile('abc123'), 42.5, 200, flatEq(), new Array(19));
  assert.deepStrictEqual(a, b);
  a.forEach((v) => assert.ok(v >= 0 && v <= 1));
  assert.ok(a.some((v) => v > 0.05), 'mid-song spectrum should not be silent');
  const other = W.spectrum(W.trackProfile('zzz999'), 42.5, 200, flatEq(), new Array(19));
  assert.notDeepStrictEqual(a, other);
});

test('spectrum fades in at the start and out at the end of a track', () => {
  const p = W.trackProfile('abc123');
  const sum = (arr) => arr.reduce((s, v) => s + v, 0);
  assert.strictEqual(sum(W.spectrum(p, 0, 200, flatEq(), new Array(19))), 0);
  assert.strictEqual(sum(W.spectrum(p, 200, 200, flatEq(), new Array(19))), 0);
});

test('EQ shapes the spectrum and can be switched off', () => {
  const p = W.trackProfile('abc123');
  const boosted = flatEq();
  boosted.bands[0] = 100;
  const flat = W.spectrum(p, 42.5, 200, flatEq(), new Array(19));
  const bass = W.spectrum(p, 42.5, 200, boosted, new Array(19));
  assert.ok(bass[0] >= flat[0]);
  assert.ok(bass[0] > flat[0] || flat[0] === 1);
  assert.strictEqual(W.eqGainDb(Object.assign(boosted, { on: false }), 0), 0);
  assert.strictEqual(W.eqGainDb(boosted, 0), 0);
  boosted.on = true;
  assert.strictEqual(W.eqGainDb(boosted, 0), 12);
});

test('slider/dB conversion matches Winamp range', () => {
  assert.strictEqual(W.sliderToDb(0), -12);
  assert.strictEqual(W.sliderToDb(50), 0);
  assert.strictEqual(W.sliderToDb(100), 12);
  assert.strictEqual(W.dbToSlider(-12), 0);
  assert.strictEqual(W.dbToSlider(12), 100);
  W.EQ_PRESETS.forEach((p) => p.bands.forEach((db) => assert.ok(Math.abs(db) <= 12, p.name)));
});

test('text glyphs map to TEXT.BMP cells, folding accents and unknown characters', () => {
  assert.deepStrictEqual(W.textGlyphs('A1:'), [[0, 0], [1, 1], [1, 12]]);
  assert.deepStrictEqual(W.textGlyphs('é'), [[0, 4]]);
  assert.deepStrictEqual(W.textGlyphs('Ö'), [[2, 1]]);
  assert.deepStrictEqual(W.textGlyphs('\u4e2d'), [[0, 30]]);
});

test('clock digits and marquee text', () => {
  assert.deepStrictEqual(W.clockDigits(65000), [0, 1, 0, 5]);
  assert.deepStrictEqual(W.clockDigits(200 * 60000), [9, 9, 5, 9]);
  assert.strictEqual(W.marqueeText(W.fromSpotify(track(), 0)), 'A, B - Song (3:20)');
  assert.match(W.marqueeText(W.fromSpotify(null, 0)), /nothing playing/);
});

test('layout docks windows and fits the viewport', () => {
  const all = W.computeLayout({ eq: true, pl: true, md: true }, 1024, 768);
  assert.deepStrictEqual(all.pos.eq, { x: 0, y: 116 });
  assert.deepStrictEqual(all.pos.pl, { x: 0, y: 232 });
  assert.deepStrictEqual(all.pos.md, { x: 275, y: 0, h: 348 });
  assert.ok(all.width * all.scale <= 1024 && all.height * all.scale <= 768);
  const portrait = W.computeLayout({ eq: true, pl: true, md: true }, 768, 1024);
  assert.deepStrictEqual(portrait.pos.md, { x: 0, y: 348, h: 232 });
  assert.ok(portrait.scale > (768 / 550) * 0.96, "stacking beats side-by-side in portrait");
  const main = W.computeLayout({}, 1024, 768);
  assert.strictEqual(main.height, 116);
  assert.strictEqual(main.scale, 3);
  assert.strictEqual(main.pos.md, undefined);
});

test('settings fall back to defaults on corrupt storage', () => {
  const bad = { getItem: () => '{not json' };
  const s = W.loadSettings(bad);
  assert.strictEqual(s.eq.bands.length, 10);
  assert.strictEqual(s.vis, 'analyzer');
  assert.strictEqual(W.loadSettings(null).open.md, true);
});

test('index.html wires Winamp mode without the removed winamp2-js port', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="winamp-toggle"/);
  assert.match(html, /id="winamp"/);
  assert.match(html, /href="winamp\.css/);
  assert.ok(html.indexOf('oldmilk.js') < html.indexOf('winamp.js') && html.indexOf('winamp.js') < html.indexOf('app.js'));
  assert.doesNotMatch(html, /winamp2-js/);
});

test('every skin image referenced by winamp.css exists', () => {
  const css = fs.readFileSync(path.join(root, 'winamp.css'), 'utf8');
  const urls = Array.from(new Set((css.match(/url\(([^)]+)\)/g) || []).map((u) => u.slice(4, -1))));
  assert.ok(urls.length > 10);
  urls.forEach((u) => assert.ok(fs.existsSync(path.join(root, u)), u));
});

test('front-end scripts stay ES5 for iOS 9 Safari', () => {
  ['winamp.js', 'app.js', 'vendor/oldmilk/oldmilk.js'].forEach((file) => {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(src, /(^|[^.\w])(let|const|class)\s/m, file);
    assert.doesNotMatch(src, /=>|`/, file);
  });
});

test('OldMilk exposes host-driven rendering and no longer starts its own loop', () => {
  const src = fs.readFileSync(path.join(root, 'vendor/oldmilk/oldmilk.js'), 'utf8');
  assert.match(src, /setBands:/);
  assert.match(src, /function render\(timeSec\)/);
  assert.doesNotMatch(src, /requestAnimationFrame/);
  assert.doesNotMatch(src, /__oldmilk/);
});
