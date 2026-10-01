// api/vis-map.js
// Vercel VisMap endpoint (Approach A) – beat-locked timeline from track metadata
// Generates 50ms interval map using exponential decay on bass/treble to trigger Milkdrop beat detection
module.exports = async function handler(req, res) {
  const trackId = req.query && req.query.track_id;

  if (!trackId) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Missing track_id' }));
  }

  try {
    let data = { bpm: 120, time_signature: 4, energy: 0.8, key: 5 };
    try {
      const apiKey = process.env.SOUNDSTAT_API_KEY || '';
      const response = await fetch(`https://api.soundstat.info/track/${trackId}`, {
        headers: { 'x-api-key': apiKey }
      });
      if (response && response.ok) {
        data = await response.json();
      }
    } catch (_) {
      // fallback to defaults
    }

    const bpm = data.bpm || 120;
    const beats_per_bar = data.time_signature || 4;
    const energy = data.energy || 0.7;
    const duration_ms = data.duration_ms || 210000;

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

      const key_mod = 1 + ((data.key || 1) / 12);
      const mid = 0.3 + (Math.abs(Math.sin((time_ms * bpm / 120000) * Math.PI * key_mod)) * 0.4 * energy);

      frames.push([
        time_ms,
        parseFloat(bass.toFixed(3)),
        parseFloat(mid.toFixed(3)),
        parseFloat(treble.toFixed(3)),
        is_beat_frame
      ]);
    }

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
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
