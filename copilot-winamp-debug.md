Here is the implementation for the Vercel VisMap endpoint (Approach A) and the iOS 9.3.5 client integration.
This architecture generates a synthesized, beat-locked timeline from track metadata. The math uses exponential decay on the bass and treble bands to simulate the sharp attack and natural fade of percussion, which triggers Milkdrop's built-in beat detection correctly.
1. Vercel Endpoint (Node.js)
This serverless function fetches the BPM, generates the 50ms interval map, and returns a flat array optimized for low memory usage.
// api/vis-map.js
export default async function handler(req, res) {
  const { track_id } = req.query;

  if (!track_id) {
    return res.status(400).json({ error: "Missing track_id" });
  }

  try {
    // Fetch metadata from SoundStat, Musicae, or fallback
    // Replace with actual API call
    const response = await fetch(`https://api.soundstat.info/track/${track_id}`, {
      headers: { 'x-api-key': process.env.SOUNDSTAT_API_KEY }
    });
    
    const data = response.ok ? await response.json() : { bpm: 120, time_signature: 4, energy: 0.8, key: 5 };
    
    const bpm = data.bpm || 120;
    const beats_per_bar = data.time_signature || 4;
    const energy = data.energy || 0.7;
    const duration_ms = data.duration_ms || 210000; // Default to 3.5 mins
    
    const interval_ms = 50;
    const beat_interval_ms = 60000 / bpm;
    const total_frames = Math.ceil(duration_ms / interval_ms);
    
    const frames = [];
    
    for (let i = 0; i < total_frames; i++) {
      const time_ms = i * interval_ms;
      const position_in_bar = (time_ms % (beat_interval_ms * beats_per_bar)) / beat_interval_ms;
      const beat_index = Math.floor(position_in_bar); // e.g., 0, 1, 2, 3
      
      const time_since_beat = time_ms % beat_interval_ms;
      const is_beat_frame = time_since_beat < interval_ms ? 1 : 0;
      
      let bass = 0.2;
      let treble = 0.2;
      
      // Simulating a drum kit: Kicks on 1 and 3, Snares on 2 and 4
      // Exponential decay creates a sharp transient attack followed by a natural fade
      if (beat_index % 2 === 0) {
        bass = 0.2 + (0.8 * Math.exp(-time_since_beat / 150) * energy);
      } else {
        treble = 0.2 + (0.8 * Math.exp(-time_since_beat / 100) * energy);
      }
      
      // Modulate mids using a slow sine wave tied to the track's musical key
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
    
    // Cache the deterministic map at the edge for a year
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.status(200).json({
      type: "bpm_grid",
      interval_ms: interval_ms,
      frames: frames
    });
    
  } catch (error) {
    console.error("VisMap generation failed:", error);
    res.status(500).json({ type: "pseudo", error: "Failed to generate map" });
  }
}

2. iPad 2 Client Integration (Vanilla JS)
Because iOS 9.3.5 Safari lacks support for fetch() and ES6 const/let, this implementation uses strictly ES5 syntax and XMLHttpRequest.
// winamp.js (or equivalent OldMilk client script)

var visMapCache = {};
var currentVisMap = null;
var isFetchingVisMap = false;

// Trigger this whenever the track changes
function fetchVisMap(trackId) {
  if (visMapCache[trackId]) {
    currentVisMap = visMapCache[trackId];
    return;
  }

  if (isFetchingVisMap) return;
  isFetchingVisMap = true;

  // iOS 9.3.5 requires XMLHttpRequest (no fetch support)
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/vis-map?track_id=' + encodeURIComponent(trackId), true);
  
  xhr.onload = function() {
    isFetchingVisMap = false;
    if (xhr.status === 200) {
      try {
        var data = JSON.parse(xhr.responseText);
        if (data.type === "bpm_grid") {
          visMapCache[trackId] = data;
          currentVisMap = data;
        }
      } catch (e) {
        console.error("Failed to parse VisMap JSON:", e);
      }
    }
  };
  
  xhr.onerror = function() {
    isFetchingVisMap = false;
    currentVisMap = null; 
  };
  
  xhr.send();
}

// Hook into the OldMilk/Butterchurn requestAnimationFrame loop
function updateMilkdropBands(progressMs) {
  if (currentVisMap && currentVisMap.type === "bpm_grid") {
    var interval = currentVisMap.interval_ms;
    var index = Math.floor(progressMs / interval);
    
    // Safety clamp to prevent out-of-bounds errors on track end
    if (index >= currentVisMap.frames.length) {
      index = currentVisMap.frames.length - 1;
    }
    
    if (index >= 0) {
      var frame = currentVisMap.frames[index];
      
      // Inject the exact pre-calculated physics for this 50ms window
      milk.setBands({
        bass: frame[1],
        mid: frame[2],
        treble: frame[3],
        isBeat: frame[4]
      });
      return; // Exit early, skipping the fallback
    }
  }
  
  // Clean fallback if map isn't loaded yet, or API failed
  milk.setBands(generateDeterministicBands(progressMs));
}

