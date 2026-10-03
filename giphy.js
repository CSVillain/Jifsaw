// GIF source for Jifsaw. Two modes, switched by USE_LIVE_API below:
//
//  - STATIC (default): picks from gifs.json, a curated pool baked into the
//    repo ahead of time (see scripts/refresh-gifs.md). No API key ships to
//    the browser, no backend needed — works as-is on GitHub Pages.
//  - LIVE: calls Giphy's search/trending/random endpoints through a
//    server-side proxy you host (see scripts/refresh-gifs.md for the full
//    switch-over steps). Never point this at Giphy directly with an
//    embedded key — that ships the secret to every visitor's browser.
//
const Giphy = (() => {
  const USE_LIVE_API = true;

  // Only used when USE_LIVE_API is true. This must be YOUR OWN proxy
  // endpoint (Cloudflare Worker, Netlify Function, etc.) that holds the
  // real Giphy key server-side — never a direct api.giphy.com call with a
  // key in the URL. A Worker deploys to its own origin, so this is a full
  // URL, not a same-origin path. See scripts/refresh-gifs.md.
  const PROXY_BASE = 'https://jifsaw-giphy-proxy.cloudflare-spur038.workers.dev';

  const STATIC_POOL_URL = 'gifs.json';
  let staticPoolPromise = null;

  function loadStaticPool() {
    if (!staticPoolPromise) {
      staticPoolPromise = fetch(STATIC_POOL_URL)
        .then(res => {
          if (!res.ok) throw new Error(`Couldn't load gifs.json (${res.status})`);
          return res.json();
        })
        .catch(err => {
          staticPoolPromise = null; // allow retry on next call
          throw new Error(`GIF library failed to load: ${err.message}`);
        });
    }
    return staticPoolPromise;
  }

  function pickRandom(list) {
    if (!list || !list.length) throw new Error('No GIFs available in that category.');
    return list[Math.floor(Math.random() * list.length)];
  }

  // Tracks every GIF id shown so far this session (resets on page reload —
  // deliberately not persisted, so the pool of "fresh" picks never shrinks
  // permanently). Picking prefers a GIF not seen yet; if every candidate in
  // the current batch has already been shown (small pool, bad luck), it
  // falls back to picking from the full batch rather than ever failing.
  const shownIds = new Set();
  function pickUnseen(list) {
    if (!list || !list.length) throw new Error('No GIFs available in that category.');
    const unseen = list.filter(g => !shownIds.has(g.id));
    const pick = pickRandom(unseen.length ? unseen : list);
    shownIds.add(pick.id);
    return pick;
  }

  async function request(path, params) {
    const url = new URL(path, PROXY_BASE + '/');
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || data.meta?.status >= 400) {
      throw new Error(`Giphy proxy request failed (${res.status})`);
    }
    return data.data;
  }

  function toPuzzleGif(item) {
    const images = item.images;
    const mp4 = images.original_mp4?.mp4 || images.looping?.mp4 || null;
    const still = images.original?.url || images.downsized?.url;
    const width = Number(images.original?.width) || 480;
    const height = Number(images.original?.height) || 270;
    return {
      id: item.id,
      title: item.title || 'Untitled GIF',
      // Giphy's alt_text is a real human-written caption when present (not
      // always — roughly half of results have one), so it's only ever used
      // as an optional detail, never required.
      description: item.alt_text || '',
      url: item.url || null,
      thumb: images.fixed_width_small?.url || images.fixed_width?.url,
      mp4,
      still,
      width,
      height,
    };
  }

  const CLASSIC_TERMS = [
    'mic drop', 'thumbs up', 'clapping', 'facepalm', 'eye roll', 'applause',
    'dance party', 'high five', 'mind blown', 'slow clap', 'fist bump', 'shrug',
  ];

  async function search(query, limit = 12, offset = 0) {
    if (!USE_LIVE_API) throw new Error('Live search is disabled — using the static GIF pool (see giphy.js).');
    const items = await request('search', { q: query, limit, offset, rating: 'g' });
    return items.map(toPuzzleGif).filter(g => g.mp4 || g.still);
  }

  async function trending(limit = 12, offset = 0) {
    if (!USE_LIVE_API) throw new Error('Live trending is disabled — using the static GIF pool (see giphy.js).');
    const items = await request('trending', { limit, offset, rating: 'g' });
    return items.map(toPuzzleGif).filter(g => g.mp4 || g.still);
  }

  async function random() {
    if (USE_LIVE_API) {
      // /random returns a single GIF, not a batch to filter — if it happens
      // to repeat one already shown this session, ask once more rather than
      // accepting the repeat outright.
      let gif = toPuzzleGif(await request('random', { rating: 'g' }));
      if (shownIds.has(gif.id)) {
        gif = toPuzzleGif(await request('random', { rating: 'g' }));
      }
      shownIds.add(gif.id);
      return gif;
    }
    const pool = await loadStaticPool();
    return pickUnseen([...pool.trending, ...pool.classic]);
  }

  // Giphy's search/trending results are stable for a given query+offset (not
  // re-randomized per request), so always fetching from offset 0 would pick
  // "randomly" from the same handful of candidates every time. Jumping to a
  // random offset first draws from a much larger pool before picking.
  async function classicPick() {
    if (USE_LIVE_API) {
      const term = CLASSIC_TERMS[Math.floor(Math.random() * CLASSIC_TERMS.length)];
      const offset = Math.floor(Math.random() * 200);
      const gifs = await search(term, 25, offset);
      return pickUnseen(gifs);
    }
    const pool = await loadStaticPool();
    return pickUnseen(pool.classic);
  }

  async function trendingPick() {
    if (USE_LIVE_API) {
      const offset = Math.floor(Math.random() * 150);
      const gifs = await trending(25, offset);
      return pickUnseen(gifs);
    }
    const pool = await loadStaticPool();
    return pickUnseen(pool.trending);
  }

  return { search, random, trending, classicPick, trendingPick };
})();

// Inert in the browser (no bundler/module system is used there — this file
// loads as a plain <script>); picked up by the test suite under Node/Vitest.
if (typeof module !== 'undefined') module.exports = Giphy;
