// Tiny localStorage wrapper for Jifsaw. Defensive about storage being
// unavailable (private browsing, disabled storage, etc.) — every call
// silently no-ops rather than throwing, since losing a best time is never
// worth breaking the game over.
const Storage = (() => {
  const PREFIX = 'jifsaw:bestTime:';
  const MUTE_KEY = 'jifsaw:muted';

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
    try {
      const raw = window.localStorage.getItem(PREFIX + difficultyValue);
      if (raw === null) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }

  // Saves `seconds` as the new best for `difficultyValue` if it's faster
  // than (or there is no) existing best. Returns true if a new record was
  // set, so callers can show a "new best!" moment.
  function saveBestTimeIfBetter(difficultyValue, seconds) {
    if (!canUseStorage) return false;
    const current = getBestTime(difficultyValue);
    if (current !== null && seconds >= current) return false;
    try {
      window.localStorage.setItem(PREFIX + difficultyValue, String(seconds));
      return true;
    } catch {
      return false;
    }
  }

  function getMuted() {
    if (!canUseStorage) return false;
    try {
      return window.localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function setMuted(muted) {
    if (!canUseStorage) return;
    try {
      window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // Losing the mute preference is never worth breaking the game over.
    }
  }

  return { getBestTime, saveBestTimeIfBetter, getMuted, setMuted };
})();

if (typeof module !== 'undefined') module.exports = Storage;
