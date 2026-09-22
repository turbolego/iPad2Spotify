/* ES5/XHR only: compatible with Safari on iOS 9. */
(function () {
  'use strict';
  var current = null, timer, minimalist = false;
  function id(name){return document.getElementById(name)}
  function message(text){id('message').innerHTML=text}
function request(method,url,body,done){if(url.charAt(0)==='/')url=location.protocol+'//'+location.host+url;var x=new XMLHttpRequest();var called=false;function finish(status,data){if(called)return;called=true;done(status,data)}x.open(method,url,true);if(body)x.setRequestHeader('Content-Type','application/json');x.timeout=120000;x.onreadystatechange=function(){if(x.readyState===4){var d={};try{d=JSON.parse(x.responseText||'{}')}catch(e){}if(x.status===0){setTimeout(function(){finish(0,d)},0)}else finish(x.status,d)}};x.ontimeout=function(){finish(0,{error:'Request timed out.'})};x.onerror=function(){finish(0,{error:'Could not reach the server.'})};x.send(body?JSON.stringify(body):null)}
  function showPlayer(){id('setup').className='card hidden';id('player').className='player';id('status').innerHTML='Connected';poll()}
  // Winamp mode toggle (native ES5/CSS skin; no Webamp bundle needed)
  var winampOn = false;
  var isPlayingState = false;
  function refreshBodyClass() {
    var cls = [];
    if (minimalist) cls.push('minimalist');
    if (winampOn) cls.push('winamp-active');
    if (winampOn && isPlayingState) cls.push('winamp-playing');
    document.body.className = cls.join(' ');
  }
  function setWinamp(on) {
    winampOn = on;
    if (on) {
      // Stop Milkdrop visualization when entering Winamp mode with no music playing
      if (window.__oldmilkStopLoop) window.__oldmilkStopLoop();
      // Hide shell to show winamp background
      var shell = document.querySelector('.shell');
      if (shell) shell.style.display = 'none';
      // Show winamp-player section
      var winampPlayer = document.getElementById('winamp-player');
      if (winampPlayer) winampPlayer.className = 'winamp';
      for (var ri = 0; ri < moduleKeys.length; ri++) { var rel = moduleEls[moduleKeys[ri]]; if (rel) rel.className = rel.className.replace(' hidden',''); }
    } else {
      // Show shell when exiting Winamp mode
      var shell = document.querySelector('.shell');
      if (shell) shell.style.display = 'block';
      var winampPlayerOff = document.getElementById('winamp-player');
      if (winampPlayerOff) winampPlayerOff.className = 'winamp hidden';
      stopMilkdrop();
      if (window.__oldmilkStartLoop) window.__oldmilkStartLoop();
    }
    id('player').className = 'player' + (on ? ' hidden' : '');
    id('winamp-toggle').innerHTML = on ? 'Exit Winamp' : 'Winamp Mode';
    id('winamp-toggle').className = on ? 'secondary small-button winamp-on' : 'secondary small-button';
    refreshBodyClass();
    if (on) { render(current); updateEqGraph(); }
  }
  function winampCommand(action) { command(action); }
  id('winamp-toggle').addEventListener('click', function () { setWinamp(!winampOn); });
  id('winamp-exit').addEventListener('click', function () { setWinamp(false); });
  id('winamp-prev').addEventListener('click', function () { winampCommand('previous'); });
  id('winamp-next').addEventListener('click', function () { winampCommand('next'); });
  id('winamp-stop').addEventListener('click', function () { winampCommand('pause'); });
  id('winamp-play').addEventListener('click', function () { winampCommand(current && current.is_playing ? 'pause' : 'play'); });
  id('winamp-pause').addEventListener('click', function () { winampCommand('pause'); });
  // ---- Settings menu (click on WINAMP title to open) ----
  var settingsOpen = false;
  var settingsMenu = id('winamp-menu');
  var winampTitle = id('winamp-main').querySelector('.wtitle-text');
  function toggleSettings() {
    settingsOpen = !settingsOpen;
    settingsMenu.className = 'winamp-menu' + (settingsOpen ? '' : ' hidden');
    if (settingsOpen) {
      var rect = winampTitle.getBoundingClientRect();
      settingsMenu.style.left = (id('winamp-main').offsetLeft + 2) + 'px';
      settingsMenu.style.top = (rect.bottom + 2) + 'px';
    }
  }
  function closeSettings() { settingsOpen = false; settingsMenu.className = 'winamp-menu hidden'; }
  if (winampTitle) {
    winampTitle.addEventListener('click', function (e) { e.stopPropagation(); toggleSettings(); });
  }
  document.addEventListener('click', function (e) {
    if (settingsOpen && !settingsMenu.contains(e.target) && e.target !== winampTitle) closeSettings();
  });
  settingsMenu.addEventListener('click', function (e) { e.stopPropagation(); });
  // NodeList has no .forEach in iOS 9.3.5 Safari, so iterate manually.
  (function () {
    var menuItems = document.querySelectorAll('.menu-item');
    for (var mi = 0; mi < menuItems.length; mi++) {
      (function (item) {
        item.addEventListener('click', function () {
          var action = item.getAttribute('data-action');
          if (action === 'set-bg') {
            closeSettings();
            id('winamp-bg-input').click();
          } else if (action === 'clear-bg') {
            closeSettings();
            if (typeof localStorage !== 'undefined') localStorage.removeItem('winamp-bg-image');
            applyBackgroundImage();
          }
        });
      })(menuItems[mi]);
    }
  })();
  // Background image handling
  function applyBackgroundImage() {
    var winampEl = id('winamp-player');
    var bgData = (typeof localStorage !== 'undefined') ? localStorage.getItem('winamp-bg-image') : null;
    var base = winampEl.className.replace(/\s*has-bg\s*/, ' ');
    if (bgData) {
      winampEl.style.backgroundImage = 'url(' + bgData + ')';
      winampEl.className = base + ' has-bg';
    } else {
      winampEl.style.backgroundImage = '';
      winampEl.className = base;
    }
  }
  id('winamp-bg-input').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      if (typeof localStorage !== 'undefined') localStorage.setItem('winamp-bg-image', ev.target.result);
      applyBackgroundImage();
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be selected again
    e.target.value = '';
  });
  // Apply background on load
  applyBackgroundImage();
  // ---- Movable Webamp-style module windows (main/playlist/equalizer/milkdrop) ----
  var SNAP = 15;
  var WIN = { main: 275, playlist: 275, eq: 275, milkdrop: 275 };
  var moduleEls = {};
  var moduleKeys = ['main','playlist','eq','milkdrop'];
  for (var mk = 0; mk < moduleKeys.length; mk++) moduleEls[moduleKeys[mk]] = id('winamp-' + moduleKeys[mk]);
  var windowBounds = {};
  function mwh() { try { return window.innerHeight || document.documentElement.clientHeight || 768; } catch (e) { return 768; } }
  function mww() { try { return window.innerWidth || document.documentElement.clientWidth || 1024; } catch (e) { return 1024; } }
  function clampWin(k, x, y) {
    var w = WIN[k], h = mwh();
    if (moduleEls[k] && moduleEls[k].offsetWidth) w = moduleEls[k].offsetWidth;
    if (x < -w + 40) x = -w + 40;
    if (x > mww() - 40) x = mww() - 40;
    if (y < 0) y = 0;
    if (y > h - 30) y = h - 30;
    return { x: x, y: y };
  }
  function placeWin(k, x, y) {
    var el = moduleEls[k]; if (!el) return;
    var c = clampWin(k, x, y);
    el.style.left = c.x + 'px'; el.style.top = c.y + 'px';
    windowBounds[k] = { x: c.x, y: c.y, w: el.offsetWidth || WIN[k], h: el.offsetHeight || 116 };
  }
  function initWinLayout() {
    placeWin('main', 20, 40);
    placeWin('playlist', 310, 40);
    placeWin('eq', 20, 181);
    placeWin('milkdrop', 310, 181);
  }
  // Real Winamp snaps the window you're dragging to the edges of whichever stationary
  // window (or screen edge) it comes close to touching, not the other way around.
  function moduleSize(k) {
    var el = moduleEls[k];
    return { w: (el && el.offsetWidth) || WIN[k], h: (el && el.offsetHeight) || 116 };
  }
  function computeSnap(k, x, y) {
    var size = moduleSize(k), w = size.w, h = size.h;
    var bestX = x, bestY = y, snappedX = false, snappedY = false;
    for (var oi = 0; oi < moduleKeys.length; oi++) {
      var o = moduleKeys[oi];
      if (o === k) continue;
      var ob = windowBounds[o];
      if (!ob) continue;
      var vOverlap = y < ob.y + ob.h && y + h > ob.y;
      var hOverlap = x < ob.x + ob.w && x + w > ob.x;
      if (!snappedX && vOverlap) {
        if (Math.abs((x + w) - ob.x) < SNAP) { bestX = ob.x - w; snappedX = true; }
        else if (Math.abs(x - (ob.x + ob.w)) < SNAP) { bestX = ob.x + ob.w; snappedX = true; }
      }
      if (!snappedY && hOverlap) {
        if (Math.abs((y + h) - ob.y) < SNAP) { bestY = ob.y - h; snappedY = true; }
        else if (Math.abs(y - (ob.y + ob.h)) < SNAP) { bestY = ob.y + ob.h; snappedY = true; }
      }
    }
    if (!snappedX) {
      if (Math.abs(x) < SNAP) bestX = 0;
      else if (Math.abs((x + w) - mww()) < SNAP) bestX = mww() - w;
    }
    if (!snappedY) {
      if (Math.abs(y) < SNAP) bestY = 0;
      else if (Math.abs((y + h) - mwh()) < SNAP) bestY = mwh() - h;
    }
    return { x: bestX, y: bestY };
  }
  var drag = null;
  function onDragStart(k, ev) {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    var el = moduleEls[k];
    var x = el.offsetLeft, y = el.offsetTop;
    var startX = (ev && (ev.touches ? ev.touches[0].clientX : ev.clientX)) || 0;
    var startY = (ev && (ev.touches ? ev.touches[0].clientY : ev.clientY)) || 0;
    drag = { k: k, startMouseX: startX, startMouseY: startY, startX: x, startY: y };
    if (moduleEls[k]) moduleEls[k].style.zIndex = 100;
  }
  function onDragMove(ev) {
    if (!drag) return;
    var cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
    var cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
    var nx = drag.startX + (cx - drag.startMouseX);
    var ny = drag.startY + (cy - drag.startMouseY);
    var snapped = computeSnap(drag.k, nx, ny);
    placeWin(drag.k, snapped.x, snapped.y);
  }
  function onDragEnd() {
    drag = null;
  }
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);
  document.addEventListener('touchmove', onDragMove);
  document.addEventListener('touchend', onDragEnd);
  moduleKeys.forEach(function (k) {
    var title = moduleEls[k].querySelector('.wtitle');
    if (title) {
      title.addEventListener('mousedown', function (e) { if (e.target.className.indexOf && String(e.target.className).indexOf('wbtn') === -1) onDragStart(k, e); });
      title.addEventListener('touchstart', function (e) { if (e.target.className.indexOf && String(e.target.className).indexOf('wbtn') === -1) onDragStart(k, e); });
    }
  });
  function toggleModule(k) {
    var el = moduleEls[k]; if (!el) return;
    var hidden = el.className.indexOf('hidden') !== -1;
    if (hidden) el.className = el.className.replace(' hidden', '');
    else el.className += ' hidden';
  }
  function shadeModule(k) {
    var el = moduleEls[k]; if (!el) return;
    var shades = el.className.indexOf('shaded') !== -1;
    if (shades) el.className = el.className.replace(' shaded', '');
    else el.className += ' shaded';
  }
  // wire close/min buttons on each title bar
  function eachNode(selector, fn) { var nodes = document.querySelectorAll(selector); for (var ni = 0; ni < nodes.length; ni++) fn(nodes[ni]); }
  eachNode('.wbtn-close', function (b) { b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); toggleModule(b.getAttribute('data-mod')); }); });
  eachNode('.wbtn-min', function (b) { b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); shadeModule(b.getAttribute('data-mod')); }); });
  // Equalizer sliders: live feedback + the connecting graph line
  function updateEqGraph() {
    var bandsEl = id('eq-bands');
    var line = id('eq-graph-line');
    var svg = id('eq-graph');
    if (!bandsEl || !line || !svg) return;
    var wraps = bandsEl.getElementsByClassName('eq-slider-wrap');
    if (!wraps.length) return;
    var bandsRect = bandsEl.getBoundingClientRect();
    var firstRect = wraps[0].getBoundingClientRect();
    var height = firstRect.height;
    if (!height) return;
    svg.style.top = (firstRect.top - bandsRect.top) + 'px';
    svg.style.height = height + 'px';
    svg.setAttribute('viewBox', '0 0 ' + bandsRect.width + ' ' + height);
    var pts = '';
    for (var i = 0; i < wraps.length; i++) {
      var wr = wraps[i].getBoundingClientRect();
      var cx = (wr.left - bandsRect.left) + wr.width / 2;
      var input = wraps[i].getElementsByTagName('input')[0];
      var v = input ? parseInt(input.value, 10) : 50;
      var cy = height * (1 - v / 100);
      pts += cx + ',' + cy + ' ';
    }
    line.setAttribute('points', pts);
  }
  eachNode('.eq-slider', function (s) {
    function updateVal() {
      var v = parseInt(s.value, 10);
      var band = s.getAttribute('data-band');
      var valEl = s.parentNode.parentNode ? s.parentNode.parentNode.querySelector('.eq-val') : null;
      if (valEl) valEl.innerHTML = (band === 'preamp') ? (v - 50) : (v - 50);
      updateEqGraph();
    }
    s.addEventListener('input', updateVal);
    s.addEventListener('change', updateVal);
    updateVal();
  });
  if (window.addEventListener) window.addEventListener('resize', updateEqGraph);
  // EQ ON / AUTO toggles
  var eqOn = true, eqAuto = false;
  function refreshEqToggles() {
    var eqOnEl = id('eq-on');
    var eqAutoEl = id('eq-auto');
    if (eqOnEl) eqOnEl.className = 'eq-btn' + (eqOn ? ' eq-on' : '');
    if (eqAutoEl) eqAutoEl.className = 'eq-btn' + (eqAuto ? ' eq-on' : '');
  }
  var eqOnEl = id('eq-on');
  var eqAutoEl = id('eq-auto');
  if (eqOnEl) eqOnEl.addEventListener('click', function () { eqOn = !eqOn; if (!eqOn) eqAuto = false; refreshEqToggles(); });
  if (eqAutoEl) eqAutoEl.addEventListener('click', function () { eqAuto = !eqAuto; if (eqAuto) eqOn = true; refreshEqToggles(); });
  // OldMilk package visualizer (WebGL 1 with ES5-safe fallback).
  var milkViz = null, milkAnim = null;
  function initMilkdrop() {
    var c = id('milkdrop-canvas');
    if (!c || !window.OldMilk) return;
    if (!milkViz) {
      milkViz = window.oldmilkViz || window.OldMilk.createVisualizer(c, { width: 275, height: 116 });
      milkViz.setAudioSource(null);
    }
  }
  function milkdropFrame() {
    if (!winampOn) { milkAnim = null; return; }
    initMilkdrop();
    if (milkViz) milkViz.render();
    if (winampOn && isPlayingState) milkAnim = setTimeout(milkdropFrame, 33);
    else milkAnim = null;
  }
  function startMilkdrop() {
    if (winampOn && !milkAnim && isPlayingState) {
      initMilkdrop();
      milkAnim = setTimeout(milkdropFrame, 50);
      // Restart the OldMilk RAF auto-loop when playing starts
      if (window.__oldmilkStartLoop) window.__oldmilkStartLoop();
    }
  }
  function stopMilkdrop() {
    if (milkAnim) { clearTimeout(milkAnim); milkAnim = null; }
    // Stop the OldMilk RAF auto-loop and force black canvas
    // (OldMilk auto-loops via RAF at line 222-225 of oldmilk.js)
    if (window.__oldmilkStopLoop) window.__oldmilkStopLoop();
    var canvas = id('milkdrop-canvas');
    if (canvas && canvas.getContext) {
      try {
        var g2d = canvas.getContext('2d');
        if (g2d) { g2d.fillStyle = '#000'; g2d.fillRect(0, 0, canvas.width, canvas.height); }
      } catch (e) {}
    }
  }
  initWinLayout();
  function pair(){var code=id('pairing-code').value.replace(/[^a-z0-9]/ig,'').toUpperCase();if(!code){message('Enter the code shown in Safari after Spotify login.');return}message('Pairing this fullscreen app…');request('POST','/api/auth/pair',{code:code},function(status,data){if(status===200){message('');showPlayer()}else if(status===0)message('Could not reach the server. Check the connection and try again.');else message((data&&data.error)||('Pairing failed (status '+status+'). Try a new code.'))})}
  function login(){window.location.href='/api/auth/login'}
  function formatTime(ms){if(!ms||ms<0)ms=0;var totalSec=Math.floor(ms/1000),m=Math.floor(totalSec/60),s=totalSec%60;return m+':'+(s<10?'0':'')+s}
  function schedulePoll(delay){if(timer)clearTimeout(timer);timer=setTimeout(poll,delay)}
  function pollDelay(data){var item=data&&data.item;if(!item)return 30000;if(!data.is_playing)return 30000;var duration=item.duration_ms||0,progress=data.progress_ms||0,remaining=duration-progress;if(remaining>0&&remaining<=20000)return Math.max(3000,Math.min(10000,remaining-2000));return 15000}
  function updateTimeline(){if(!current||!current.item){id('timeline-fill').style.width='0%';id('time-elapsed').innerHTML='0:00';id('time-duration').innerHTML='0:00';id('winamp-fill').style.width='0%';var knobEmpty=id('winamp-fill-knob');if(knobEmpty)knobEmpty.style.left='0%';id('winamp-elapsed').innerHTML='0:00';id('winamp-duration').innerHTML='0:00';return}var duration=current.item.duration_ms||0,elapsed=current.progress_ms||0;if(current.is_playing)elapsed+=Date.now()-current.fetched_at;if(elapsed>duration)elapsed=duration;var pct=duration?Math.round(Math.min(100,elapsed/duration*100)):0;id('timeline-fill').style.width=pct+'%';id('time-elapsed').innerHTML=formatTime(elapsed);id('time-duration').innerHTML=formatTime(duration);id('winamp-fill').style.width=pct+'%';var knob=id('winamp-fill-knob');if(knob)knob.style.left=pct+'%';id('winamp-elapsed').innerHTML=formatTime(elapsed);id('winamp-duration').innerHTML=formatTime(duration)}
  function setPlaying(isPlaying){isPlayingState=!!isPlaying;id('play').className=isPlaying?'play icon-play is-playing':'play icon-play';refreshBodyClass();if(isPlaying)startMilkdrop();else stopMilkdrop()}
  function setWinampTrack(text){var el=id('winamp-track');if(el)el.innerHTML=text||'Nothing playing'}
  function togglePlaylistRowSelection(row){if(!row)return;var sel=row.className.indexOf('pl-selected')!==-1;row.className=sel?row.className.replace(' pl-selected',''):row.className+' pl-selected'}
  function removeSelectedPlaylistRows(){var list=id('winamp-playlist-list');if(!list)return;var rows=list.getElementsByClassName('playlist-row');var toRemove=[];for(var i=0;i<rows.length;i++){if(rows[i].className.indexOf('pl-selected')!==-1)toRemove.push(rows[i])}if(!toRemove.length&&rows.length)toRemove.push(rows[0]);for(var j=0;j<toRemove.length;j++)list.removeChild(toRemove[j])}
  function selectAllPlaylistRows(){var list=id('winamp-playlist-list');if(!list)return;var rows=list.getElementsByClassName('playlist-row');var allSelected=rows.length>0;for(var i=0;i<rows.length;i++){if(rows[i].className.indexOf('pl-selected')===-1){allSelected=false;break}}for(var j=0;j<rows.length;j++){var withoutSel=rows[j].className.replace(' pl-selected','');rows[j].className=allSelected?withoutSel:withoutSel+' pl-selected'}}
  function reversePlaylistOrder(){var list=id('winamp-playlist-list');if(!list)return;var rows=[];var children=list.getElementsByClassName('playlist-row');for(var i=0;i<children.length;i++)rows.push(children[i]);for(var j=rows.length-1;j>=0;j--)list.appendChild(rows[j])}
  function toggleCompactPlaylist(){var pl=id('winamp-playlist');if(!pl)return;var compact=pl.className.indexOf('compact')!==-1;pl.className=compact?pl.className.replace(' compact',''):pl.className+' compact'}
  function updateWinampPlaylist(name,artist,isPlaying){var list=id('winamp-playlist-list');if(!list)return;var rows=list.getElementsByClassName('playlist-row');for(var i=0;i<rows.length;i++){var keepSel=rows[i].className.indexOf('pl-selected')!==-1;rows[i].className='playlist-row'+(keepSel?' pl-selected':'');}var key=(name||'Nothing playing')+'|'+(artist||''); for(var ci=0;ci<rows.length;ci++){if((rows[ci].getAttribute ? rows[ci].getAttribute('data-track') : rows[ci]._trackKey)===key){rows[ci].className+=isPlaying?' current-row':'';return;}} var row=document.createElement('div');if(row.setAttribute)row.setAttribute('data-track',key);row._trackKey=key;row.className='playlist-row'+(isPlaying?' current-row':'');var ex=document.createElement('span');ex.className='pl-exit';ex.innerHTML='×';var num=document.createElement('span');num.className='pl-num';num.innerHTML=name||'Nothing playing';row.appendChild(ex);row.appendChild(num);var first=list.firstChild;if(first)list.insertBefore(row,first);else list.appendChild(row); while(list.getElementsByClassName('playlist-row').length>12)list.removeChild(list.lastChild)}
  // Delegate clicks so both the static sample rows and dynamically-added rows support selection/removal.
  (function () {
    var listEl = id('winamp-playlist-list');
    if (!listEl) return;
    listEl.addEventListener('click', function (e) {
      var target = e.target;
      if (target && target.className && String(target.className).indexOf('pl-exit') !== -1) {
        var row = target.parentNode;
        if (row && row.parentNode) row.parentNode.removeChild(row);
        return;
      }
      while (target && target !== listEl && (!target.className || String(target.className).indexOf('playlist-row') === -1)) {
        target = target.parentNode;
      }
      if (target && target !== listEl) togglePlaylistRowSelection(target);
    });
  })();
  function render(data){var item=data&&data.item;if(!item){id('title').innerHTML='Nothing playing';id('artist').innerHTML='Start Spotify on another device';id('album').innerHTML='';id('minimalist-artist').innerHTML='';id('minimalist-title').innerHTML='Nothing playing';id('art').style.display='none';id('placeholder').className='';setPlaying(false);setWinampTrack('');current=null;updateTimeline();return}current=data;current.fetched_at=Date.now();var artist=item.artists.map(function(a){return a.name}).join(', ');var artUrl=(item.album&&item.album.images&&item.album.images.length)?item.album.images[0].url:'';id('title').innerHTML=item.name;id('artist').innerHTML=artist;id('album').innerHTML=item.album.name;id('minimalist-artist').innerHTML=artist;id('minimalist-title').innerHTML=item.name;setPlaying(!!data.is_playing);setWinampTrack('*** '+escapeHtml(artist)+' — '+escapeHtml(item.name));updateWinampPlaylist(escapeHtml(item.name),escapeHtml(artist),data.is_playing);if(artUrl){id('art').src=artUrl;id('art').style.display='block';id('placeholder').className='hidden'}updateTimeline()}
  function poll(){if(document.hidden)return;var load=id('loading-indicator');if(load)load.className='loading-indicator';request('GET','/api/spotify/currently-playing',null,function(status,data){if(load)load.className='loading-indicator hidden';if(status===200){render(data);schedulePoll(pollDelay(data))}else if(status===401){id('status').innerHTML='Not connected';id('player-message').innerHTML=data.error||'Pair again.';schedulePoll(30000)}else{id('player-message').innerHTML='Waiting for Spotify…';schedulePoll(30000)}})}
  function command(action){request('POST','/api/spotify/command',{action:action},function(status,data){if(status!==200){id('player-message').innerHTML=data.error||'Command failed'}schedulePoll(750)})}
  setInterval(updateTimeline,1000);
  function createBadge(){var url = '/api/badge/'+Date.now(); request('POST', url, {}, function(status,data){if(status===200){window.prompt('Copy this Markdown into your GitHub profile README:', '[![Last played on Spotify]('+data.url+')](https://'+window.location.host+'/)')}else id('player-message').innerHTML=data.error||'Could not create badge.'})}
  function escapeHtml(text){return text.replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function openArtistModal(){id('artist-modal').className='modal';switchSearchMode('artist');id('artist-query').value='';id('playlist-query').value='';id('artist-results').innerHTML='';id('artist-message').innerHTML='';id('artist-query').focus()}
  function closeArtistModal(){id('artist-modal').className='modal hidden'}
  function switchSearchMode(type){var isPlaylist=type==='playlist';id('search-tab-artist').className=isPlaylist?'search-tab':'search-tab search-tab-active';id('search-tab-playlist').className=isPlaylist?'search-tab search-tab-active':'search-tab';id('artist-query-label').className=isPlaylist?'hidden':'';id('playlist-query-label').className=isPlaylist?'':'hidden';var artistField=id('artist-query'),playlistField=id('playlist-query');artistField.className=isPlaylist?'hidden':'';playlistField.className=isPlaylist?'':'hidden';artistField.value='';playlistField.value='';id('artist-results').innerHTML='';id('artist-message').innerHTML='';(isPlaylist?playlistField:artistField).focus()}
  function searchArtist(){var mode=id('search-tab-playlist').className.indexOf('search-tab-active')!==-1?'playlist':'artist';var q=(mode==='playlist'?id('playlist-query'):id('artist-query')).value.trim();if(!q){id('artist-message').innerHTML='Enter a'+(mode==='playlist'?' playlist name':'n artist name')+'.';return}id('artist-message').innerHTML='Searching…';id('artist-results').innerHTML='';var endpoint='/api/spotify/search-'+(mode==='playlist'?'playlist':'artist')+'?q='+encodeURIComponent(q);request('GET',endpoint,null,function(status,data){var key=mode==='playlist'?'playlists':'artists';if(status!==200){id('artist-message').innerHTML=data.error||'Search failed.';return}var items=data[key]||[];if(!items.length){id('artist-message').innerHTML='No '+(mode==='playlist'?'playlists':'artists')+' found.';return}id('artist-message').innerHTML='';var html='';for(var i=0;i<items.length;i++){html+='<button type="button" class="artist-result" data-id="'+items[i].id+'">'+escapeHtml(items[i].name)+'</button>'}id('artist-results').innerHTML=html;var buttons=id('artist-results').getElementsByTagName('button');for(var j=0;j<buttons.length;j++){buttons[j].onclick=function(){playTarget(mode,this.getAttribute('data-id'),this.innerHTML)}}})}
  function playTarget(mode,itemId,name){var noun=mode==='playlist'?'playlist':'artist radio';id('artist-message').innerHTML='Starting '+name+' ('+noun+')…';var body={action:mode==='playlist'?'play_playlist':'play_artist'};body[mode==='playlist'?'playlist_id':'artist_id']=itemId;request('POST','/api/spotify/command',body,function(status,data){if(status!==200){id('artist-message').innerHTML=data.error||'Could not start '+noun+'.';schedulePoll(750);return}closeArtistModal();schedulePoll(750)})}
  function enterMinimalist(){minimalist=true;id('minimalist').innerHTML='Regular View';refreshBodyClass()}
  function exitMinimalist(){minimalist=false;id('exit-modal').className='modal hidden';id('minimalist').innerHTML='Minimalist View';refreshBodyClass()}
  id('winamp-pl-add').onclick=function(){if(current)updateWinampPlaylist(escapeHtml(current.item.name),escapeHtml(current.item.artists[0].name),!!current.is_playing)};
  id('winamp-pl-remove').onclick=removeSelectedPlaylistRows;
  id('winamp-pl-sel').onclick=selectAllPlaylistRows;
  id('winamp-pl-misc').onclick=reversePlaylistOrder;
  id('winamp-pl-list').onclick=toggleCompactPlaylist;
  id('eq-preset').onclick=function(){var vals=[35,42,50,58,65,58,50,42,35,30,25];var ss=document.querySelectorAll('.eq-slider');for(var pi=0;pi<ss.length;pi++){ss[pi].value=vals[pi]||50;var ev=document.createEvent('Event');ev.initEvent('change',true,true);ss[pi].dispatchEvent(ev);}};
  var shuffleEl=id('winamp-shuffle'),repeatEl=id('winamp-repeat'),shuffleOn=false,repeatOn=false;
  if(shuffleEl)shuffleEl.addEventListener('click',function(){shuffleOn=!shuffleOn;shuffleEl.className='winamp-btn winamp-shuffle'+(shuffleOn?' winamp-btn-active':'')});
  if(repeatEl)repeatEl.addEventListener('click',function(){repeatOn=!repeatOn;repeatEl.className='winamp-btn winamp-repeat'+(repeatOn?' winamp-btn-active':'')});
  function refreshMiniToggle(btn,k){if(!btn)return;var hidden=moduleEls[k]&&moduleEls[k].className.indexOf('hidden')!==-1;btn.className='mini-toggle'+(hidden?'':' winamp-btn-active')}
  var eqToggleEl=id('winamp-eq-toggle'),plToggleEl=id('winamp-pl-toggle');
  if(eqToggleEl)eqToggleEl.addEventListener('click',function(){toggleModule('eq');refreshMiniToggle(eqToggleEl,'eq')});
  if(plToggleEl)plToggleEl.addEventListener('click',function(){toggleModule('playlist');refreshMiniToggle(plToggleEl,'playlist')});
  refreshMiniToggle(eqToggleEl,'eq');refreshMiniToggle(plToggleEl,'playlist');
  var volbarEl=id('winamp-volbar');
  function setVolumeFromEvent(e){if(!volbarEl)return;var rect=volbarEl.getBoundingClientRect?volbarEl.getBoundingClientRect():{left:0,width:100};var clientX=e.touches?e.touches[0].clientX:e.clientX;var pct=Math.max(0,Math.min(1,(clientX-rect.left)/rect.width));var pctRound=Math.round(pct*100);var fill=id('winamp-vol-fill');if(fill)fill.style.width=pctRound+'%';var knob=id('winamp-vol-knob');if(knob)knob.style.left=pctRound+'%'}
  if(volbarEl){volbarEl.addEventListener('mousedown',setVolumeFromEvent);volbarEl.addEventListener('touchstart',setVolumeFromEvent)}
  var balbarEl=id('winamp-balbar');
  function setBalanceFromEvent(e){if(!balbarEl)return;var rect=balbarEl.getBoundingClientRect?balbarEl.getBoundingClientRect():{left:0,width:100};var clientX=e.touches?e.touches[0].clientX:e.clientX;var pct=Math.max(0,Math.min(100,Math.round((clientX-rect.left)/rect.width*100)));var fill=id('winamp-bal-fill');if(fill){if(pct>=50){fill.style.left='50%';fill.style.width=(pct-50)+'%'}else{fill.style.left=pct+'%';fill.style.width=(50-pct)+'%'}}var knob=id('winamp-bal-knob');if(knob)knob.style.left=pct+'%'}
  if(balbarEl){balbarEl.addEventListener('mousedown',setBalanceFromEvent);balbarEl.addEventListener('touchstart',setBalanceFromEvent)}
  var volFillInit=id('winamp-vol-fill');if(volFillInit)volFillInit.style.width='75%';
  var volKnobInit=id('winamp-vol-knob');if(volKnobInit)volKnobInit.style.left='75%';
  var balFillInit=id('winamp-bal-fill');if(balFillInit){balFillInit.style.left='50%';balFillInit.style.width='0%'}
  var balKnobInit=id('winamp-bal-knob');if(balKnobInit)balKnobInit.style.left='50%';
  document.addEventListener('visibilitychange',function(){if(document.hidden){if(timer)clearTimeout(timer);timer=null;}else if(!id('player').className.match(/hidden/) || winampOn) schedulePoll(0);},false);
  id('refresh').onclick=function(){schedulePoll(0);};id('login').onclick=login;id('pair').onclick=pair;id('pairing-code').onkeyup=function(e){if(e&&e.keyCode===13)pair()};id('previous').onclick=function(){command('previous')};id('next').onclick=function(){command('next')};id('play').onclick=function(){command(current&&current.is_playing?'pause':'play')};id('minimalist').onclick=function(){if(minimalist)exitMinimalist();else enterMinimalist()};id('badge').onclick=createBadge;id('art-tap').onclick=function(){if(minimalist)id('exit-modal').className='modal';};id('exit-yes').onclick=exitMinimalist;id('exit-no').onclick=function(){id('exit-modal').className='modal hidden'};id('disconnect').onclick=function(){request('POST','/api/auth/logout',null,function(){location.reload()})};id('search-artist').onclick=openArtistModal;id('search-tab-artist').onclick=function(){switchSearchMode('artist')};id('search-tab-playlist').onclick=function(){switchSearchMode('playlist')};id('artist-search-go').onclick=searchArtist;id('artist-cancel').onclick=closeArtistModal;id('artist-query').onkeyup=function(e){if(e&&e.keyCode===13)searchArtist()};id('playlist-query').onkeyup=function(e){if(e&&e.keyCode===13)searchArtist()};
  request('GET','/api/spotify/currently-playing',null,function(status){if(status===200)showPlayer()});
}());
