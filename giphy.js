// Thin wrapper around the Giphy API. Falls back to Giphy's public beta key
// (rate-limited, no signup) so the app works out of the box; a user-supplied
// key is preferred when saved.
const Giphy = (() => {
  const PUBLIC_BETA_KEY = 'dc6zaTOxFJmzC';
  const BASE = 'https://api.giphy.com/v1/gifs';

  function apiKey() {
    return localStorage.getItem('gifsaw_giphy_key') || PUBLIC_BETA_KEY;
  }

  function saveKey(key) {
    if (key && key.trim()) {
      localStorage.setItem('gifsaw_giphy_key', key.trim());
    } else {
      localStorage.removeItem('gifsaw_giphy_key');
    }
  }

  function usingOwnKey() {
    return !!localStorage.getItem('gifsaw_giphy_key');
  }

  async function request(path, params) {
    const url = new URL(`${BASE}/${path}`);
    url.searchParams.set('api_key', apiKey());
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || data.meta?.status >= 400) {
      if (data.meta?.msg === 'BANNED' || res.status === 403) {
        throw new Error("The shared demo key is currently blocked by Giphy. Add your own free key below (developers.giphy.com, instant approval) to search.");
      }
      if (res.status === 429) throw new Error('Giphy rate limit hit — try again shortly, or add your own free API key below.');
      throw new Error(`Giphy request failed (${res.status})`);
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
      thumb: images.fixed_width_small?.url || images.fixed_width?.url,
      mp4,
      still,
      width,
      height,
    };
  }

  async function search(query, limit = 12) {
    const items = await request('search', { q: query, limit, rating: 'g' });
    return items.map(toPuzzleGif).filter(g => g.mp4 || g.still);
  }

  async function random() {
    const item = await request('random', { rating: 'g' });
    return toPuzzleGif(item);
  }

  async function trending(limit = 12) {
    const items = await request('trending', { limit, rating: 'g' });
    return items.map(toPuzzleGif).filter(g => g.mp4 || g.still);
  }

  // "Classic" theme: no curated Giphy category fits, so we pick a random
  // well-known/evergreen search term and grab a random result from it.
  const CLASSIC_TERMS = [
    'mic drop', 'thumbs up', 'clapping', 'facepalm', 'eye roll', 'applause',
    'dance party', 'high five', 'mind blown', 'slow clap', 'fist bump', 'shrug',
  ];

  async function classicPick() {
    const term = CLASSIC_TERMS[Math.floor(Math.random() * CLASSIC_TERMS.length)];
    const gifs = await search(term, 25);
    if (!gifs.length) throw new Error('No classic GIFs found — try again.');
    return gifs[Math.floor(Math.random() * gifs.length)];
  }

  async function trendingPick() {
    const gifs = await trending(25);
    if (!gifs.length) throw new Error('No trending GIFs found — try again.');
    return gifs[Math.floor(Math.random() * gifs.length)];
  }

  return { search, random, trending, classicPick, trendingPick, saveKey, usingOwnKey };
})();
