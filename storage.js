// Tiny localStorage wrapper for Jifsaw. Defensive about storage being
// unavailable (private browsing, disabled storage, etc.) — every call
// silently no-ops rather than throwing, since losing a best time is never
// worth breaking the game over.
const Storage = (() => {
  const PREFIX = 'jifsaw:bestTime:';

  function available() {
    try {
      const k = '__jifsaw_test__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }

  const canUseStorage = available();

  function getBestTime(difficultyValue) {
    if (!canUseStorage) return null;
    const raw = window.localStorage.getItem(PREFIX + difficultyValue);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  // Saves `seconds` as the new best for `difficultyValue` if it's faster
  // than (or there is no) existing best. Returns true if a new record was
  // set, so callers can show a "new best!" moment.
  function saveBestTimeIfBetter(difficultyValue, seconds) {
    if (!canUseStorage) return false;
    const current = getBestTime(difficultyValue);
    if (current !== null && seconds >= current) return false;
    window.localStorage.setItem(PREFIX + difficultyValue, String(seconds));
    return true;
  }

  return { getBestTime, saveBestTimeIfBetter };
})();

if (typeof module !== 'undefined') module.exports = Storage;
