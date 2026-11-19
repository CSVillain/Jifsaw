// Cloudflare Worker: thin proxy in front of the Giphy API.
//
// Holds the real Giphy key server-side (as the GIPHY_API_KEY secret) so it
// never ships to the browser. giphy.js in the main app calls this Worker's
// URL instead of api.giphy.com directly.
//
// Deploy steps: see scripts/refresh-gifs.md "Cloudflare Worker" section.

// Both the custom domain and the original GitHub Pages URL are allowed —
// GitHub keeps serving the old csvillain.github.io link even after a custom
// domain is set, so both need to keep working. A CORS response can only
// echo back ONE exact origin (not a list), so corsHeaders() checks the
// request's actual Origin header against this allowlist and echoes that
// back if it matches, rather than hardcoding a single value.
const ALLOWED_ORIGINS = new Set([
  'https://jifsaw.com',
  'https://csvillain.github.io',
]);
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs/';
const ALLOWED_PATHS = new Set(['search', 'trending', 'random']);

// Query params the app actually sends (see giphy.js) plus Giphy's own cap on
// `limit`. Anything else from the caller is dropped rather than forwarded.
const ALLOWED_PARAMS = new Set(['q', 'limit', 'offset']);
const MAX_LIMIT = 50;
const MAX_OFFSET = 200;
const MAX_QUERY_LENGTH = 50;

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function jsonResponse(request, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) });
    }

    if (request.method !== 'GET') {
      return jsonResponse(request, 405, { error: 'Method not allowed' });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+/, '');

    if (!ALLOWED_PATHS.has(path)) {
      return jsonResponse(request, 404, { error: 'Unknown endpoint' });
    }

    if (path === 'search') {
      const queries = url.searchParams.getAll('q');
      const query = (queries[0] || '').trim();
      if (queries.length !== 1 || !query || query.length > MAX_QUERY_LENGTH) {
        return jsonResponse(request, 400, { error: 'Search query must be 1–50 characters.' });
      }
    }

    // Best-effort, per-location abuse control in front of the shared Giphy
    // key's quota — see wrangler.toml for the binding and its limits as a
    // control (not an exact global quota: counters are eventually
    // consistent and scoped per Cloudflare location).
    if (env.GIPHY_RATE_LIMITER) {
      const key = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.GIPHY_RATE_LIMITER.limit({ key });
      if (!success) {
        return jsonResponse(request, 429, { error: 'Too many requests' });
      }
    }

    const giphyUrl = new URL(path, GIPHY_BASE);
    for (const [key, value] of url.searchParams) {
      if (!ALLOWED_PARAMS.has(key)) continue;
      if (key === 'q') {
        giphyUrl.searchParams.set(key, value.trim());
      } else if (key === 'limit') {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1) {
          return jsonResponse(request, 400, { error: 'Limit must be a positive integer.' });
        }
        giphyUrl.searchParams.set(key, String(Math.min(n, MAX_LIMIT)));
      } else if (key === 'offset') {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 0) {
          return jsonResponse(request, 400, { error: 'Offset must be a non-negative integer.' });
        }
        giphyUrl.searchParams.set(key, String(Math.min(n, MAX_OFFSET)));
      } else {
        giphyUrl.searchParams.set(key, value);
      }
    }
    giphyUrl.searchParams.set('rating', 'g');
    giphyUrl.searchParams.set('api_key', env.GIPHY_API_KEY);

    const giphyRes = await fetch(giphyUrl);
    const body = await giphyRes.text();

    return new Response(body, {
      status: giphyRes.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
    });
  },
};
