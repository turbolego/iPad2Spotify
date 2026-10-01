// api/vis-map.js
// Vercel VisMap endpoint (Approach A) – beat-locked timeline from track metadata
// Generates 50ms interval map using exponential decay on bass/treble to trigger Milkdrop beat detection
module.exports = async function handler(req, res) {
  const rawTrackId = req.query && req.query.track_id;

  if (!rawTrackId) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Missing track_id' }));
  }

  // Validate trackId: alphanumeric + hyphen/underscore only (Spotify IDs are base62)
  const trackId = String(rawTrackId).replace(/[^a-zA-Z0-9_-]/g, '');
  if (trackId !== rawTrackId || trackId.length === 0 || trackId.length > 100) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Invalid track_id format' }));
  }

  try {
    let data = { bpm: 120, time_signature: 4, energy: 0.8, key: 5 };
    let usedFallback = true;

    try {
      const apiKey = process.env.SOUNDSTAT_API_KEY || '';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`https://api.soundstat.info/track/${encodeURIComponent(trackId)}`, {
        headers: { 'x-api-key': apiKey },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response && response.ok) {
        const json = await response.json();
        if (json && typeof json === 'object') {
          data = json;
          usedFallback = false;
        }
      }
    } catch (_) {
      // fallback to defaults
    }

    // Validate and clamp upstream metadata
    const bpmRaw = Number(data.bpm);
    const bpm = Number.isFinite(bpmRaw) && bpmRaw >= 40 && bpmRaw <= 250 ? bpmRaw : 120;

    const tsRaw = Number(data.time_signature);
    const beats_per_bar = Number.isFinite(tsRaw) && tsRaw >= 1 && tsRaw <= 12 ? Math.floor(tsRaw) : 4;

    const energyRaw = Number(data.energy);
    const energy = typeof energyRaw === 'number' && Number.isFinite(energyRaw) ? Math.max(0, Math.min(1, energyRaw)) : 0.7;

    const durationRaw = Number(data.duration_ms);
    const duration_ms = Number.isFinite(durationRaw) && durationRaw > 0 && durationRaw <= 20*60*1000 ? durationRaw : 210000; // max 20 min

    const keyRaw = Number(data.key);
    const keyVal = Number.isFinite(keyRaw) && keyRaw >= 0 && keyRaw <= 11 ? keyRaw : 5;

    const interval_ms = 50;
    const beat_interval_ms = 60000 / bpm;
    const total_frames = Math.ceil(duration_ms / interval_ms);

    const frames = [];

    for (let i = 0; i < total_frames; i++) {
      const time_ms = i * interval_ms;
      const position_in_bar = (time_ms % (beat_interval_ms * beats_per_bar)) / beat_interval_ms;
      const beat_index = Math.floor(position_in_bar);

      const time_since_beat = time_ms % beat_interval_ms;
      const is_beat_frame = time_since_beat < interval_ms ? 1 : 0;

      let bass = 0.2;
      let treble = 0.2;

      if (beat_index % 2 === 0) {
        bass = 0.2 + (0.8 * Math.exp(-time_since_beat / 150) * energy);
      } else {
        treble = 0.2 + (0.8 * Math.exp(-time_since_beat / 100) * energy);
      }

      const key_mod = 1 + (keyVal / 12);
      const mid = 0.3 + (Math.abs(Math.sin((time_ms * bpm / 120000) * Math.PI * key_mod)) * 0.4 * energy);

      frames.push([
        time_ms,
        parseFloat(bass.toFixed(3)),
        parseFloat(mid.toFixed(3)),
        parseFloat(treble.toFixed(3)),
        is_beat_frame
      ]);
    }

    // Cache immutable only when we got real metadata, avoid caching fallback for a year
    if (usedFallback) {
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({
      type: 'bpm_grid',
      interval_ms: interval_ms,
      frames: frames
    }));
  } catch (error) {
    console.error('VisMap generation failed:', error);
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 500;
    res.end(JSON.stringify({ type: 'pseudo', error: 'Failed to generate map' }));
  }
};
