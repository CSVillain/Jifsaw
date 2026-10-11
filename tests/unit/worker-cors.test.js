import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../worker/giphy-proxy.js';

// Regression coverage for the custom-domain CORS fix: the Worker must echo
// back the request's own Origin when it's on the allowlist (jifsaw.com or
// the original GitHub Pages URL), and must NOT allow an arbitrary origin to
// read the response — a CORS response can only name one exact origin, so
// getting this wrong either breaks a legitimate origin or opens the proxy
// (and the Giphy key budget behind it) up to any site on the internet.

function request(path, origin) {
  const headers = origin ? { Origin: origin } : {};
  return new Request(`https://example.workers.dev/${path}?rating=g`, { headers });
}

const fakeEnv = { GIPHY_API_KEY: 'test-key' };

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      status: 200,
      text: async () => JSON.stringify({ data: [], meta: { status: 200 } }),
    })
  );
});

describe('Worker CORS allowlist', () => {
  it('echoes back jifsaw.com when it is the request origin', async () => {
    const res = await worker.fetch(request('trending', 'https://jifsaw.com'), fakeEnv);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://jifsaw.com');
  });

  it('echoes back the original GitHub Pages origin too', async () => {
    const res = await worker.fetch(request('trending', 'https://csvillain.github.io'), fakeEnv);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://csvillain.github.io');
  });

  it('does not allow an arbitrary third-party origin', async () => {
    const res = await worker.fetch(request('trending', 'https://evil.example.com'), fakeEnv);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('');
  });

  it('sets Vary: Origin so caches never serve one origin a response meant for another', async () => {
    const res = await worker.fetch(request('trending', 'https://jifsaw.com'), fakeEnv);
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('still answers OPTIONS preflight with the matching origin', async () => {
    const req = new Request('https://example.workers.dev/trending', {
      method: 'OPTIONS',
      headers: { Origin: 'https://jifsaw.com' },
    });
    const res = await worker.fetch(req, fakeEnv);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://jifsaw.com');
  });
});

describe('Worker method and param handling', () => {
  it('rejects non-GET methods', async () => {
    const req = new Request('https://example.workers.dev/trending', {
      method: 'POST',
      headers: { Origin: 'https://jifsaw.com' },
    });
    const res = await worker.fetch(req, fakeEnv);
    expect(res.status).toBe(405);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('drops params outside the allowlist before calling Giphy', async () => {
    await worker.fetch(
      request('search?q=cats&evil=1&api_key=hijack', 'https://jifsaw.com'),
      fakeEnv
    );
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl.searchParams.get('evil')).toBeNull();
    // api_key is always set by the Worker itself from the secret, so the
    // caller-supplied value must never survive into the forwarded request.
    expect(calledUrl.searchParams.get('api_key')).toBe('test-key');
  });

  it('clamps an oversized limit instead of forwarding it as-is', async () => {
    await worker.fetch(request('search?q=cats&limit=99999', 'https://jifsaw.com'), fakeEnv);
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl.searchParams.get('limit')).toBe('50');
  });
});

describe('Worker rate limiting', () => {
  it('forwards the request when the rate limiter allows it', async () => {
    const env = {
      ...fakeEnv,
      GIPHY_RATE_LIMITER: { limit: vi.fn(() => Promise.resolve({ success: true })) },
    };
    const res = await worker.fetch(request('trending', 'https://jifsaw.com'), env);
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns 429 and never calls Giphy when the rate limiter blocks the request', async () => {
    const env = {
      ...fakeEnv,
      GIPHY_RATE_LIMITER: { limit: vi.fn(() => Promise.resolve({ success: false })) },
    };
    const res = await worker.fetch(request('trending', 'https://jifsaw.com'), env);
    expect(res.status).toBe(429);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('keys the rate limiter by the client IP', async () => {
    const limitSpy = vi.fn(() => Promise.resolve({ success: true }));
    const env = { ...fakeEnv, GIPHY_RATE_LIMITER: { limit: limitSpy } };
    const req = new Request('https://example.workers.dev/trending', {
      headers: { Origin: 'https://jifsaw.com', 'CF-Connecting-IP': '203.0.113.5' },
    });
    await worker.fetch(req, env);
    expect(limitSpy).toHaveBeenCalledWith({ key: '203.0.113.5' });
  });

  it('skips the rate-limit check when no binding is configured (local dev/test)', async () => {
    const res = await worker.fetch(request('trending', 'https://jifsaw.com'), fakeEnv);
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
