// Cloudflare Worker: thin proxy in front of the Giphy API.
//
// Holds the real Giphy key server-side (as the GIPHY_API_KEY secret) so it
// never ships to the browser. giphy.js in the main app calls this Worker's
// URL instead of api.giphy.com directly.
//
// Deploy steps: see scripts/refresh-gifs.md "Cloudflare Worker" section.

const ALLOWED_ORIGIN = 'https://csvillain.github.io';
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs/';
const ALLOWED_PATHS = new Set(['search', 'trending', 'random']);

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+/, '');

    if (!ALLOWED_PATHS.has(path)) {
      return new Response(JSON.stringify({ error: 'Unknown endpoint' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    const giphyUrl = new URL(path, GIPHY_BASE);
    url.searchParams.forEach((value, key) => giphyUrl.searchParams.set(key, value));
    giphyUrl.searchParams.set('api_key', env.GIPHY_API_KEY);

    const giphyRes = await fetch(giphyUrl);
    const body = await giphyRes.text();

    return new Response(body, {
      status: giphyRes.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  },
};
