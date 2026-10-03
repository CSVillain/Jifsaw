import { describe, it, expect, beforeEach, vi } from 'vitest';

// Regression coverage for the "5 games in a row gave the same GIF" bug:
// Giphy's /trending and /search endpoints return an identical ordered list
// for the same query + offset, so always requesting offset=0 and picking
// "randomly" from that fixed list isn't actually random across plays.
// classicPick()/trendingPick() must vary the offset each call.
//
// Giphy tracks shown ids in module-level state (deliberately — it's meant
// to remember what's been shown for the lifetime of the page). That means
// each test here needs its OWN fresh module instance, or state leaks
// between tests in this file — vi.resetModules() + a dynamic import per
// test gives every test a clean Giphy with an empty shownIds set.

function fakeGiphyResponse(count = 25) {
  return {
    ok: true,
    json: async () => ({
      data: Array.from({ length: count }, (_, i) => ({
        id: `gif-${i}`,
        title: `GIF ${i}`,
        images: {
          original_mp4: { mp4: `https://example.com/${i}.mp4` },
          original: { url: `https://example.com/${i}.gif`, width: '480', height: '270' },
          fixed_width_small: { url: `https://example.com/${i}-thumb.gif` },
        },
      })),
      meta: { status: 200 },
    }),
  };
}

async function freshGiphy() {
  vi.resetModules();
  const mod = await import('../../giphy.js');
  return mod.default;
}

describe('Giphy.trendingPick', () => {
  let capturedUrls;
  let Giphy;

  beforeEach(async () => {
    capturedUrls = [];
    global.fetch = vi.fn((url) => {
      capturedUrls.push(String(url));
      return Promise.resolve(fakeGiphyResponse());
    });
    Giphy = await freshGiphy();
  });

  it('requests a non-zero, varying offset across repeated calls', async () => {
    for (let i = 0; i < 8; i++) {
      await Giphy.trendingPick();
    }
    const offsets = capturedUrls.map(u => new URL(u).searchParams.get('offset'));
    expect(offsets).toHaveLength(8);
    // Not every call should land on the same offset (the bug this guards against).
    const distinct = new Set(offsets);
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('never omits the offset param (always explicit, even when 0)', async () => {
    await Giphy.trendingPick();
    const offset = new URL(capturedUrls[0]).searchParams.get('offset');
    expect(offset).not.toBeNull();
  });
});

describe('Giphy.classicPick', () => {
  let Giphy;

  beforeEach(async () => {
    global.fetch = vi.fn(() => Promise.resolve(fakeGiphyResponse()));
    Giphy = await freshGiphy();
  });

  it('varies both the search term and the offset across repeated calls', async () => {
    const calls = [];
    global.fetch = vi.fn((url) => {
      calls.push(String(url));
      return Promise.resolve(fakeGiphyResponse());
    });
    for (let i = 0; i < 10; i++) {
      await Giphy.classicPick();
    }
    const offsets = calls.map(u => new URL(u).searchParams.get('offset'));
    const terms = calls.map(u => new URL(u).searchParams.get('q'));
    expect(new Set(offsets).size).toBeGreaterThan(1);
    expect(new Set(terms).size).toBeGreaterThan(1);
  });
});

// Regression coverage for "the same GIF keeps showing up": varying the
// offset (above) makes a repeat less likely, but doesn't prevent one — two
// picks can still land on the same id by chance. Giphy tracks every id
// shown this session and prefers an unseen one.
describe('no-repeat picking', () => {
  let Giphy;

  beforeEach(async () => {
    global.fetch = vi.fn(() => Promise.resolve(fakeGiphyResponse()));
    Giphy = await freshGiphy();
  });

  it('does not repeat a GIF while unseen ones are still available in the batch', async () => {
    // The mock always returns the same 25 ids (gif-0..gif-24) regardless of
    // offset, so with a 25-item pool the first 25 picks must all be
    // distinct — if they weren't, pickUnseen isn't excluding shown ids.
    const seen = new Set();
    for (let i = 0; i < 25; i++) {
      const gif = await Giphy.trendingPick();
      expect(seen.has(gif.id)).toBe(false);
      seen.add(gif.id);
    }
  });

  it('falls back to repeating rather than throwing once the pool is exhausted', async () => {
    for (let i = 0; i < 25; i++) await Giphy.trendingPick();
    // 26th pick: every id in this fixed mock pool has now been shown.
    await expect(Giphy.trendingPick()).resolves.toMatchObject({ id: expect.any(String) });
  });
});
