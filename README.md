# iPad2Spotify

A Spotify currently-playing dashboard designed for an iPad 2 running Safari/iOS 9.3.6. It shows album artwork, track information, playback state, and playback controls while Spotify plays on another device.

The frontend uses old-browser-compatible ES5 JavaScript and `XMLHttpRequest`. Spotify credentials and tokens are handled by Vercel Functions, not by the iPad browser.

Since we need to use Vercel anyways, the webapp creates a shortcode for a "badge" you can add to your github profile or anywhere displaying the song played last:

[![Last played on Spotify](https://ipad2spotify.vercel.app/api/badge/mubt1yl4wmxywii.svg)](https://ipad2spotify.vercel.app/)

<img width="2048" height="1536" alt="16575086-a7c7-4d9c-8d69-fe333fd9baf2" src="https://github.com/user-attachments/assets/be86356a-907a-4f3b-b0cd-2bd4d81a1b36" />


## What this project solves

An iPad 2 Home Screen web app runs in fullscreen mode, but interactive Spotify OAuth may open normal Safari. This project uses a two-step flow:

1. Open the deployed app in normal Safari on any device and select **Login to Spotify and get pairing code**.
2. Complete Spotify authorization. The callback displays a short-lived pairing code.
3. Open the deployed app from the iPad Home Screen.
4. Select **Enter pairing code** and enter the code.
5. The fullscreen app receives its own secure session and displays playback.

The pairing code expires after ten minutes and is deleted after it is claimed. The Home Screen app does not need to open Spotify login again unless its session expires.

## Fork and deploy your own copy

### 1. Fork this repository

Open [github.com/turbolego/iPad2Spotify](https://github.com/turbolego/iPad2Spotify) and select **Fork**. Choose your own GitHub account or organization and create the fork.

You can also clone the fork locally if you want to make changes:

```bash
git clone https://github.com/YOUR-GITHUB-USERNAME/iPad2Spotify.git
```

No build step or package installation is required.

### 2. Create a Spotify Developer app

Sign in to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) with the Spotify account whose playback should be displayed.

Select **Create app** and enter an app name and description. After creation:

1. Copy the **Client ID**.
2. Reveal and copy the **Client Secret**.
3. Keep the Client Secret private.

Do not commit the Client Secret to GitHub or place it in `index.html`, `app.js`, a URL, or any browser-visible file.

Spotify documentation: [Apps](https://developer.spotify.com/documentation/web-api/concepts/apps)

### 3. Import the fork into Vercel

Open the [Vercel Dashboard](https://vercel.com/dashboard):

1. Select **Add New → Project**.
2. Find your fork of `iPad2Spotify`.
3. Select **Import**.
4. Use the repository root as the Root Directory.
5. Choose **Other** as the Framework Preset, or leave automatic detection enabled.
6. Leave Build Command, Install Command, and Output Directory empty.
7. Select **Deploy**.

Vercel automatically exposes files under `api/` as serverless functions. The project is a plain static frontend plus Vercel Functions and needs no build command.

Copy the production URL, for example:

```text
https://your-project.vercel.app
```

### 4. Create the Redis/KV storage

The pairing flow needs a small shared database because Spotify login happens in normal Safari while the pairing code is entered in the separate fullscreen Home Screen app.

In the Vercel project:

1. Open the **Storage** tab.
2. Select **Create Database** or **Connect Store**.
3. Choose the available **Upstash Redis** integration.
4. Create a database and connect it to this Vercel project.
5. Select the **Production** environment.

The integration should add these variables to the project:

```text
KV_REST_API_URL
KV_REST_API_TOKEN
```

The current implementation uses the normal read/write token. Do not use `KV_REST_API_READ_ONLY_TOKEN` for `KV_REST_API_TOKEN`, because the application must create, read, and delete pairing/session/badge records.

If the integration provides equivalent variables with different names, add aliases in Vercel:

```text
KV_REST_API_URL   = your Redis REST URL
KV_REST_API_TOKEN = your Redis REST read/write token
```

Upstash’s Vercel integration is documented at [Upstash for Vercel](https://vercel.com/marketplace/upstash).

### 5. Add Vercel environment variables

Open:

```text
Vercel project → Settings → Environment Variables
```

Add these variables for **Production**:

```text
SPOTIFY_CLIENT_ID       = Client ID copied from Spotify
SPOTIFY_CLIENT_SECRET   = Client Secret copied from Spotify
KV_REST_API_URL         = supplied by Upstash Redis
KV_REST_API_TOKEN       = supplied by Upstash Redis
```

Optionally add:

```text
APP_ORIGIN = https://your-project.vercel.app
```

`APP_ORIGIN` is useful when using a custom domain. Do not include a trailing slash. If it is omitted, the application derives the origin from the incoming request host.

`SPOTIFY_CLIENT_SECRET` and the Redis token are server-only variables. Do not prefix them with `NEXT_PUBLIC_`.

Vercel documentation: [Environment Variables](https://vercel.com/docs/environment-variables)

### 6. Add the Spotify Redirect URI

Using the production URL from Vercel, construct:

```text
https://your-project.vercel.app/api/auth/callback
```

In the Spotify Developer Dashboard:

1. Open your Spotify app.
2. Select **Edit Settings**.
3. Find **Redirect URIs**.
4. Add the exact callback URL.
5. Select **Add** if required.
6. Select **Save**.

The redirect URI must match exactly, including `https`, the Vercel hostname, `/api/auth/callback`, capitalization, and trailing slash behavior.

Spotify documentation: [Redirect URIs](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri)

### 7. Redeploy after configuring variables

Environment-variable changes apply only to new deployments. In Vercel, open **Deployments**, select the latest deployment’s menu, and choose **Redeploy**.

Alternatively, push a new commit to the production branch of your fork.

### 8. Test login and pairing

Open the Vercel production URL in normal Safari or another browser and select **Login to Spotify and get pairing code**. Authorize the requested scopes:

- `user-read-currently-playing`
- `user-read-playback-state`
- `user-modify-playback-state`

After authorization, the callback page displays a pairing code. Open the same Vercel URL in Safari on the iPad, select **Add to Home Screen**, and open the new icon. In the fullscreen app select **Enter pairing code**, enter the code, and confirm.

You can complete the login on a phone or computer, then enter the resulting code on the iPad.

## GitHub README last-played badge

After pairing the app and observing at least one playing track, select **Create GitHub README Badge** in the regular player. The app creates a random public badge key and displays Markdown similar to:

```markdown
[![Last played on Spotify](https://your-project.vercel.app/api/badge/abc123.svg)](https://your-project.vercel.app/)
```

Copy that Markdown into a GitHub profile `README.md`. The SVG displays the last track observed by the paired app, including album artwork, song title, and artist. For each badge request, the server uses the stored track ID with Spotify’s `GET /v1/tracks/{id}` endpoint and selects `album.images[0].url`, the highest-resolution artwork returned by Spotify. It then embeds the downloaded image data inside the SVG so GitHub does not need to load a remote image nested inside the badge. The badge is a public image URL: anyone who can see the README source can request it.

The badge is updated when the app successfully polls Spotify, normally about every five seconds while the iPad app is open. It does not independently monitor Spotify while the iPad app is closed. GitHub and image proxies may cache the image, so changes can appear with a delay of up to several minutes.

The badge key is a viewing key, not a playback-control credential. It does not expose Spotify access tokens, refresh tokens, Redis credentials, or the private session cookie. The badge record expires after one year; create a new badge from the app if it expires.

## Features

The dashboard provides:

- current album artwork,
- track title,
- artist and album,
- current playback state,
- play/pause,
- previous track,
- next track,
- automatic polling approximately every five seconds,
- a custom SVG last-played card for GitHub profile READMEs,
- Minimalist View with centered album artwork and track text.

The regular player also has a **Minimalist View** button. Minimalist View centers the album cover on the screen and places the artist and song name directly below it, hiding the other controls and interface elements. Tap the album cover to open the **Exit minimalist view?** confirmation. Select **yes** to return to the regular player or **no** to continue viewing the minimalist display.

Playback controls generally require a Spotify Premium account and an active controllable Spotify device. The dashboard does not play audio itself.

## Vercel endpoints

- `/api/auth/login` — starts Spotify authorization
- `/api/auth/callback` — exchanges the authorization code and creates a pairing code
- `/api/auth/pair` — claims a one-time pairing code
- `/api/auth/logout` — deletes the current server-side session
- `/api/spotify/currently-playing` — returns playback state and stores the latest observed track
- `/api/spotify/command` — allowlisted play, pause, next, and previous commands
- `/api/badge/create` — creates an authenticated public badge key
- `/api/badge/<key>.svg` — returns the public GitHub-compatible SVG card

## Public-service notice and hardening

This is an independent hobby project and is **not operated, sponsored, endorsed, or maintained by Spotify**. Spotify is a trademark of Spotify AB. This project uses Spotify’s public Web API under the account holder’s own authorization and is not an official Spotify client.

If you deploy this repository publicly, visitors can use your Vercel deployment and shared Spotify Developer application. They may consume Vercel Function invocations, Redis operations, and Spotify API quota. The included API applies lightweight Redis-backed per-IP limits to login starts, OAuth callbacks, pairing attempts, playback polling, playback commands, badge creation, and badge requests. These limits reduce casual abuse but are not a complete DDoS or identity system; monitor your Vercel and Redis usage and disable or protect the deployment if it is abused.

The **Disconnect** button calls `/api/auth/logout`, deletes the active server-side session where possible, and clears the browser cookie. Users should also revoke this app from their Spotify account settings if they want to remove its authorization completely.

A public badge reveals the selected account’s last observed track metadata and album artwork. Do not create a public badge if that listening information should remain private.

Before making a repository public, audit the complete Git history for credentials. Environment variables must remain only in Vercel. If a secret has ever been committed, rotate it even if the file was later deleted.

The deployment includes security hardening headers (Content Security Policy, HSTS, X-Content-Type-Options, X-Frame-Options, and Referrer-Policy) applied via `vercel.json` on static routes and programmatically on API responses. These mitigate XSS, clickjacking, MIME-sniffing, and protocol-downgrade attacks.

## iPad 2 compatibility

The frontend intentionally avoids `fetch`, ES modules, promises, `async`/`await`, `let` and `const`, service workers, Web Crypto requirements, and modern build-tool dependencies.

It uses ES5 JavaScript, `XMLHttpRequest`, old Safari-safe markup, and iOS Home Screen metadata. Vercel Functions run server-side and are independent of the iPad’s old JavaScript engine.

## Limitations

Vercel cannot force interactive Spotify login to remain inside an iOS 9 standalone Home Screen window. The pairing flow is intentional: login takes place in normal Safari or another browser, and the authenticated session is then transferred to the fullscreen app using a one-time code.

The badge represents the last track observed while the paired app was polling. It is not a continuous Spotify listening-history monitor. GitHub image caching can delay visible updates.

GitHub Pages alone cannot safely store the Spotify Client Secret or maintain the shared pairing/session state required by this flow.

## License

MIT.
