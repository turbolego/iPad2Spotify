# iPad2Spotify

A deliberately lightweight Spotify now-playing dashboard for an **iPad 2 running iOS 9.3.6 and Safari 9**. The iPad is a display and remote control; playback remains on another Spotify device.

## Why this implementation is old-fashioned

This app has no framework, package manager, build step, service worker, or runtime dependency. It is written for the capabilities available in iOS 9 Safari:

- `XMLHttpRequest` instead of `fetch()`
- ES5-style JavaScript instead of `async`/`await`, modules, or arrow functions
- a bundled pure-JavaScript SHA-256 implementation instead of Web Crypto
- regular HTTPS hosting instead of a modern PWA requirement
- a 1024 × 768 landscape-first layout

## Setup

1. Create an application in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Add the exact deployed URL of this page as a Redirect URI. The URL must match exactly, including `https`, path, and trailing slash behavior.
3. Host this repository on an HTTPS site. GitHub Pages works for a static deployment; a local HTTP server is useful for development.
4. Open the page in Safari on the iPad 2 and paste the Spotify Client ID.
5. Select **Connect to Spotify**, approve the requested permissions, and return to the dashboard.

The requested scopes are `user-read-currently-playing`, `user-read-playback-state`, and `user-modify-playback-state`. Playback controls require a Spotify Premium account and an active, controllable Spotify device. The dashboard itself does not play audio.

## Features

The display shows album artwork, track, artist, album, active device, playback progress, elapsed and total time, play/pause, previous, next, and volume. It polls every four seconds and advances the progress bar between API responses so the display feels continuous without putting unnecessary load on an old iPad.

Tokens and the Client ID are stored in `localStorage` on the iPad. The **Disconnect** action clears the access token; use **Settings** to clear the active session and enter a different Client ID.

## Compatibility notes

The app intentionally avoids `fetch`, `URLSearchParams`, Web Crypto, template literals, promises, `let`, `const`, `class`, `async`, and `await`. It should be served over HTTPS in production because Spotify OAuth redirect URIs and API requests require a secure origin. Album artwork comes directly from Spotify CDN URLs.

Spotify may return `204 No Content` when there is no active playback, `401` for an expired token, `403` for an unavailable command, or `429` when requests are rate-limited. The UI handles the normal no-playback and token-refresh paths and reports a gentle rate-limit message.

## Files

- `index.html` — semantic dashboard markup and iOS web-app metadata
- `styles.css` — landscape dashboard visual design with old Safari-safe prefixes
- `app.js` — PKCE authentication, XHR client, polling, progress, and controls

## License

MIT. See the repository history and related projects from [turbolego](https://github.com/turbolego).
