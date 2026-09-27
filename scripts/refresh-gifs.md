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
Instead, put a thin server-side proxy in front of Giphy:

1. **Pick a proxy host.** Easiest options, both free tier:
   - **Netlify Functions** — if you move hosting to Netlify (it serves the
     static site *and* functions from one deploy, connected to this GitHub
     repo).
   - **Cloudflare Worker** — keeps the static site on GitHub Pages, adds a
     separate free Worker just for the proxy endpoint.

2. **Write the proxy.** It takes the incoming request, adds the real key
   server-side (from an encrypted environment variable in Netlify/Cloudflare
   settings, never in the repo), forwards to Giphy, and returns the JSON.
   Example (Netlify Function, `netlify/functions/giphy.js`):
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
   Set `GIPHY_API_KEY` as an environment variable in the host's dashboard
   (Netlify: Site settings → Environment variables; Cloudflare: Worker →
   Settings → Variables → encrypt it).

3. **Point the app at it.** In `giphy.js`:
   - Set `USE_LIVE_API = true`
   - Set `PROXY_BASE` to your proxy's path (e.g. `/api/giphy` if using
     Netlify's redirect rules to map that path to the function, or the full
     Worker URL if using Cloudflare)

4. **Verify** no key ever appears in a browser request — check the Network
   tab; every outgoing request from the page should hit *your* domain, not
   `api.giphy.com` directly.

Static mode and live mode aren't mutually exclusive long-term — you could
keep static mode as the always-working fallback and only flip to live mode
if you set up and trust the proxy.
