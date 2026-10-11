import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Storage from '../../storage.js';

describe('Storage best-time tracking', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns null for a difficulty with no saved time', () => {
    expect(Storage.getBestTime('3x3')).toBeNull();
  });

  it('saves the first time for a difficulty as a new best', () => {
    const isNew = Storage.saveBestTimeIfBetter('3x3', 120);
    expect(isNew).toBe(true);
    expect(Storage.getBestTime('3x3')).toBe(120);
  });

  it('saves a faster time as a new best', () => {
    Storage.saveBestTimeIfBetter('3x3', 120);
    const isNew = Storage.saveBestTimeIfBetter('3x3', 90);
    expect(isNew).toBe(true);
    expect(Storage.getBestTime('3x3')).toBe(90);
  });

  it('does not overwrite a best time with a slower one', () => {
    Storage.saveBestTimeIfBetter('3x3', 90);
    const isNew = Storage.saveBestTimeIfBetter('3x3', 120);
    expect(isNew).toBe(false);
    expect(Storage.getBestTime('3x3')).toBe(90);
  });

  it('does not overwrite a best time with an equal one', () => {
    Storage.saveBestTimeIfBetter('3x3', 90);
    const isNew = Storage.saveBestTimeIfBetter('3x3', 90);
    expect(isNew).toBe(false);
  });

  it('keeps separate best times per difficulty', () => {
    Storage.saveBestTimeIfBetter('3x3', 60);
    Storage.saveBestTimeIfBetter('5x4', 300);
    expect(Storage.getBestTime('3x3')).toBe(60);
    expect(Storage.getBestTime('5x4')).toBe(300);
  });

  describe('when storage throws after startup (e.g. quota exceeded)', () => {
    let setItemSpy;
    let getItemSpy;

    afterEach(() => {
      setItemSpy?.mockRestore();
      getItemSpy?.mockRestore();
    });

    it('saveBestTimeIfBetter returns false instead of throwing', () => {
      setItemSpy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });
      expect(() => Storage.saveBestTimeIfBetter('3x3', 90)).not.toThrow();
      expect(Storage.saveBestTimeIfBetter('3x3', 90)).toBe(false);
    });

    it('getBestTime returns null instead of throwing', () => {
      getItemSpy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
        throw new DOMException('Storage disabled', 'SecurityError');
      });
      expect(() => Storage.getBestTime('3x3')).not.toThrow();
      expect(Storage.getBestTime('3x3')).toBeNull();
    });
  });
});

describe('Storage mute preference', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to unmuted when nothing is saved', () => {
    expect(Storage.getMuted()).toBe(false);
  });

  it('round-trips a saved mute preference', () => {
    Storage.setMuted(true);
    expect(Storage.getMuted()).toBe(true);
    Storage.setMuted(false);
    expect(Storage.getMuted()).toBe(false);
  });

  it('getMuted returns false instead of throwing when storage is unavailable', () => {
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage disabled', 'SecurityError');
    });
    expect(() => Storage.getMuted()).not.toThrow();
    expect(Storage.getMuted()).toBe(false);
    spy.mockRestore();
  });

  it('setMuted does not throw when storage is unavailable', () => {
    const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(() => Storage.setMuted(true)).not.toThrow();
    spy.mockRestore();
  });
});
