import { describe, it, expect, vi, beforeEach } from 'vitest';

function response(items) {
  return {
    ok: true,
    json: async () => ({
      data: items.map((id) => ({
        id,
        title: `GIF ${id}`,
        images: {
          original_mp4: { mp4: `https://example.com/${id}.mp4` },
          original: { url: `https://example.com/${id}.gif`, width: '480', height: '270' },
        },
      })),
      meta: { status: 200 },
    }),
  };
}

async function freshGiphy() {
  vi.resetModules();
  return (await import('../../giphy.js')).default;
}

describe('Giphy.searchPick', () => {
  let Giphy;
  let requests;

  beforeEach(async () => {
    requests = [];
    global.fetch = vi.fn((url) => {
      requests.push(new URL(String(url)));
      return Promise.resolve(response(['one', 'two', 'three']));
    });
    Giphy = await freshGiphy();
  });

  it('trims the topic and requests a bounded random batch', async () => {
    await Giphy.searchPick('  nature  ');
    expect(requests).toHaveLength(1);
    expect(requests[0].searchParams.get('q')).toBe('nature');
    expect(requests[0].searchParams.get('limit')).toBe('25');
    const offset = Number(requests[0].searchParams.get('offset'));
    expect(Number.isInteger(offset)).toBe(true);
    expect(offset).toBeGreaterThanOrEqual(0);
    expect(offset).toBeLessThanOrEqual(200);
  });

  it('rejects blank and overlong topics without making a request', async () => {
    await expect(Giphy.searchPick('  ')).rejects.toThrow('Enter a topic');
    await expect(Giphy.searchPick('x'.repeat(51))).rejects.toThrow('50 characters or fewer');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('reports a useful message when the topic has no GIFs', async () => {
    global.fetch = vi.fn(() => Promise.resolve(response([])));
    await expect(Giphy.searchPick('antarctica')).rejects.toThrow('No GIFs found for “antarctica”');
  });

  it('prefers unseen GIFs from the fetched batch', async () => {
    const picked = new Set();
    for (let i = 0; i < 3; i++) {
      const gif = await Giphy.searchPick('animals');
      expect(picked.has(gif.id)).toBe(false);
      picked.add(gif.id);
    }
    expect(picked.size).toBe(3);
  });

  it('exposes the compact curated category list', () => {
    expect(Giphy.CATEGORIES.map(({ label }) => label)).toEqual([
      'Animals', 'Anime', 'Gaming', 'Movies', 'Nature', 'Sports',
    ]);
  });
});
