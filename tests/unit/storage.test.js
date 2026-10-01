import { describe, it, expect, beforeEach } from 'vitest';
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
});
