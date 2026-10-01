import { describe, it, expect, beforeEach, vi } from 'vitest';
import Giphy from '../../giphy.js';

// Regression coverage for the "5 games in a row gave the same GIF" bug:
// Giphy's /trending and /search endpoints return an identical ordered list
// for the same query + offset, so always requesting offset=0 and picking
// "randomly" from that fixed list isn't actually random across plays.
// classicPick()/trendingPick() must vary the offset each call.

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

describe('Giphy.trendingPick', () => {
  let capturedUrls;

  beforeEach(() => {
    capturedUrls = [];
    global.fetch = vi.fn((url) => {
      capturedUrls.push(String(url));
      return Promise.resolve(fakeGiphyResponse());
    });
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
  beforeEach(() => {
    global.fetch = vi.fn(() => Promise.resolve(fakeGiphyResponse()));
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
