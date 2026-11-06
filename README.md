# Jifsaw 🧩

A jigsaw puzzle where the picture is a looping GIF instead of a still image.
Pick a difficulty and a GIF theme, then drag interlocking pieces back together
while the image keeps playing underneath.

**Play it:** https://jifsaw.com/

<p>
  <img src="docs/screenshot-gameplay.png" alt="Jifsaw mid-puzzle: a partly-solved GIF jigsaw with shiny, dealt-out pieces below the board" width="49%">
  <img src="docs/screenshot-win.png" alt="Jifsaw win screen showing the solved time, difficulty, and a confetti burst" width="49%">
</p>

## Running it locally

No build step is required. Serve the folder over HTTP, for example:

```powershell
python -m http.server 5173 --bind 127.0.0.1
```

Open `http://127.0.0.1:5173`. The production GIF proxy only allows the deployed
origins, so starting a puzzle locally in live mode will fail its CORS check.
For manual local gameplay, temporarily set `USE_LIVE_API = false` in `giphy.js`
to use the curated `gifs.json` pool; restore it before committing. Do not add
`null` or wildcard origins to the production proxy. Automated browser tests mock
the GIF service and do not need a real API key or changes to live mode.

## How it works

- **Pieces** are cut on an HTML5 `<canvas>` using generated interlocking
  jigsaw-piece paths, sized and cached per piece.
- **The image** is a looping `<video>` element (an mp4 version of the GIF),
  redrawn into each piece every frame — so the puzzle picture keeps playing
  while you solve it.
- **GIFs** currently load live from Giphy through the Cloudflare Worker
  configured in `giphy.js`. The Worker keeps the Giphy API key server-side;
  the browser does not receive the key. The Worker is public, so its shared
  Giphy quota can be consumed by callers outside the game. It applies a
  best-effort limit of 30 requests per minute per client IP and Cloudflare
  location when the rate-limit binding is configured. `gifs.json` remains
  available as a curated pool, but live mode is enabled by default. There is
  no automatic fallback: if the Worker returns 429 or is down, the player
  sees an error. To recover, set `USE_LIVE_API = false` in `giphy.js` and
  redeploy. See [`scripts/refresh-gifs.md`](scripts/refresh-gifs.md) for
  details.

## Testing

Requires Node.js 22.22.2+, 24.15.0+, or 26+ (matching `engines.node`), and Python 3 for the browser-test server. Install locked dev dependencies with `npm ci`, then:

- `npm test` — unit tests (Vitest) for the pure logic in `puzzle.js` (piece
  geometry) and `giphy.js` (the random-offset fix that stops repeated GIFs)
- `npm run test:e2e` — Playwright smoke tests against a local static server:
  mobile layout, theme/difficulty controls, full puzzle deal, and the
  New-button reset — covers the real regressions found in earlier sessions

Install Chromium once with `npx playwright install chromium` before running the
browser suite. GitHub Actions runs the unit suite, browser suite, and `npm audit`.

## Stack

Vanilla HTML, CSS, and JavaScript. No framework, no bundler, no dependencies.

- `index.html` / `style.css` — layout and visual design
- `app.js` — UI wiring (difficulty slider, theme picker, game flow)
- `puzzle.js` — piece cutting, rendering, drag/drop and snap-to-place
- `giphy.js` — live Giphy API requests through the configured Worker, with a curated static pool available
- `confetti.js` — win-screen confetti

---

Built by [GTBR](https://gtbr.co.uk/)
