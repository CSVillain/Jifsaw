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
