# Jifsaw 🧩

A jigsaw puzzle where the picture is a looping GIF instead of a still image.
Pick a difficulty and a GIF theme, then drag interlocking pieces back together
while the image keeps playing underneath.

**Play it:** https://csvillain.github.io/Jifsaw/

<p>
  <img src="docs/screenshot-gameplay.png" alt="Jifsaw mid-puzzle: a partly-solved GIF jigsaw with shiny, dealt-out pieces below the board" width="49%">
  <img src="docs/screenshot-win.png" alt="Jifsaw win screen showing the solved time, difficulty, and a confetti burst" width="49%">
</p>

## Running it locally

No build step, no install. Either:

- Open `index.html` directly in a browser, or
- Serve the folder so relative fetches (like `gifs.json`) work over `http://`
  instead of `file://`:

  ```powershell
  python -m http.server 5173
  ```

  then open `http://localhost:5173`.

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
- Players can keep the existing Classic, Trending, and Random sources or
  choose a compact GIF topic category or search for one. “New GIF” repeats
  the active source; topic searches use the same G-rated Worker path.

## Testing

Requires Node.js. Install dev dependencies once with `npm install`, then:

- `npm test` — Vitest tests for puzzle geometry, GIF selection, storage
  failure handling, and Worker request validation
- `npm run test:e2e` — Playwright smoke tests against a local static server:
  mobile layout, theme and topic search, difficulty controls, puzzle setup,
  and visible loading and error states

## Link previews

Sharing metadata lives in `index.html` so crawlers can read it without running
JavaScript. The current preview is
`https://jifsaw.com/assets/jifsaw-social-v1.png` (1200 × 630).

Edit `assets/jifsaw-social.svg`, then run
`node scripts/render-social-image.mjs v1` with the test dependencies and
Playwright Chromium installed to regenerate the current PNG. When publishing new
artwork, pass the next version (for example, `v2`) and update both image URLs in
`index.html` to that filename. Commit the SVG, new PNG and metadata together.

After publishing, check the deployed URL with LinkedIn Post Inspector to refresh
its cached preview. Local changes alone do not update existing LinkedIn cards.

## Stack

Vanilla HTML, CSS, and JavaScript. No framework, no bundler, no dependencies.

- `index.html` / `style.css` — layout and visual design
- `app.js` — UI wiring (difficulty slider, GIF source and topic picker, game flow)
- `puzzle.js` — piece cutting, rendering, drag/drop and snap-to-place
- `giphy.js` — live Giphy API requests through the configured Worker, topic search and curated static pool
- `confetti.js` — win-screen confetti

---

Built by [GTBR](https://gtbr.co.uk/)
