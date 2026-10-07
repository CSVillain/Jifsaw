# GIF pool: refreshing and switching to live search

Jifsaw ships in **static mode**: `gifs.json` is a curated pool of GIFs
(trending + a set of "classic" reaction terms) fetched once from Giphy and
baked into the repo. No API key is shipped to the browser, no backend is
required, and it works as-is on GitHub Pages or any static host.

This doc covers the two things you'll eventually want to do: refresh the
pool with newer content, and (optionally) switch to live search.

## Refreshing the static pool

The pool goes stale over time (it's a snapshot, not live trending). To
regenerate it:

1. Get a free Giphy API key at [developers.giphy.com](https://developers.giphy.com)
   if you don't already have one.
2. Run the build script **locally** — never commit the key, never put it in
   a file that gets pushed:

   ```powershell
   $env:GIPHY_BUILD_KEY = "your-key-here"
   pwsh scripts/build_gifs.ps1
   ```

   This overwrites `gifs.json` in the repo root with a fresh pool (50
   trending + ~70 classic-term results).
3. Review the diff, commit `gifs.json`, and push/deploy as normal.
4. Optional: `Remove-Item Env:\GIPHY_BUILD_KEY` when done, or just close the
   terminal — it's only ever in your local shell's environment, never on disk.

You can re-run this on whatever cadence makes sense (monthly, before a demo,
whenever the pool feels stale). Nothing about the live site changes when you
do this — it's just swapping which static file ships.

## Switching to live search (optional, more involved)

If you want true live search/trending/random instead of a fixed pool, the
key must never be embedded in the shipped JS or called directly from the
browser as `api.giphy.com?api_key=...` — that exposes it to every visitor.
Instead, put a thin server-side proxy in front of Giphy. Two options below;
pick one.

### Option A: Cloudflare Worker (recommended — keeps GitHub Pages as-is)

The site stays exactly where it is; you add one small, free Worker purely
for the proxy endpoint. The Worker source is already in this repo at
[`worker/giphy-proxy.js`](../worker/giphy-proxy.js).

1. **Get a free Giphy API key** at [developers.giphy.com](https://developers.giphy.com)
   if you don't already have one.
2. **Create a Cloudflare account** (free tier) at [dash.cloudflare.com](https://dash.cloudflare.com)
   if you don't have one, then go to **Workers & Pages → Create → Create Worker**.
3. **Name it** (e.g. `jifsaw-giphy-proxy`) and deploy the default placeholder —
   you'll replace the code next.
4. **Paste in the proxy code**: open the new Worker → **Edit code**, replace
   everything with the contents of this repo's `worker/giphy-proxy.js`, then
   **Deploy**.
5. **Set the key as a secret** (never in the source): Worker → **Settings →
   Variables and Secrets → Add → Secret**, name it `GIPHY_API_KEY`, paste
   your key, **Save and deploy**.
6. **Copy the Worker's URL** — shown on the Worker's overview page, looks like
   `https://jifsaw-giphy-proxy.<your-subdomain>.workers.dev`.
7. **Point the app at it.** In `giphy.js`:
   - Set `PROXY_BASE` to that exact URL (replacing the `YOUR-SUBDOMAIN`
     placeholder already there)
   - Set `USE_LIVE_API = true`
8. If the site is ever reachable from an origin not already listed, add it
   to `ALLOWED_ORIGINS` at the top of `worker/giphy-proxy.js` and push to
   `main` — the CORS check only allows requests from an origin in that set
   (currently `jifsaw.com` and the original `csvillain.github.io` link, both
   kept working since GitHub still serves the old URL after a custom domain
   is set).

**After this one-time setup, deploys are automatic.** The Worker is
connected to this GitHub repo via Cloudflare's Workers Builds — every push
to `main` re-runs `npx wrangler deploy` and the Worker picks up whatever's
in `worker/giphy-proxy.js`. You don't need to open the Cloudflare dashboard
again to ship a Worker change; editing the file and pushing is enough.
`wrangler.toml` at the repo root is what makes this work — it tells
wrangler to deploy only `worker/giphy-proxy.js` as a script Worker, not the
whole repository as a static-assets bundle (which fails: `node_modules`
alone is well over the 25 MiB per-asset limit). If you ever see a Worker
build fail with "Asset too large", check that `wrangler.toml` is still
present and correctly points `main` at the worker script.

### Option B: Netlify Functions (if you move hosting to Netlify)

Netlify serves the static site *and* a function from one deploy connected to
this GitHub repo — simpler if you're open to moving off GitHub Pages.

1. Get a free Giphy API key as above.
2. Write the proxy as a Netlify Function, e.g. `netlify/functions/giphy.js`:

   ```js
   export default async (req) => {
     const url = new URL(req.url);
     const giphyPath = url.pathname.replace('/api/giphy/', '');
     const giphyUrl = new URL(`https://api.giphy.com/v1/gifs/${giphyPath}`);
     url.searchParams.forEach((v, k) => giphyUrl.searchParams.set(k, v));
     giphyUrl.searchParams.set('api_key', process.env.GIPHY_API_KEY);
     const res = await fetch(giphyUrl);
     return new Response(res.body, { status: res.status, headers: { 'content-type': 'application/json' } });
   };
   ```

3. Set `GIPHY_API_KEY` as an environment variable in Netlify's dashboard
   (Site settings → Environment variables).
4. In `giphy.js`, set `PROXY_BASE = '/api/giphy'` (same-origin, since
   Netlify serves both the site and the function) and `USE_LIVE_API = true`.

### Either way

**Verify** no key ever appears in a browser request — check the Network tab;
every outgoing request from the page should hit *your* proxy's domain, not
`api.giphy.com` directly.

Static mode and live mode aren't mutually exclusive long-term — you could
keep static mode as the always-working fallback and only flip to live mode
if you set up and trust the proxy.
