// Vitest's jsdom pool doesn't always wire up window.localStorage out of the
// box (depends on jsdom/vitest version combo) — polyfill a minimal
// spec-compliant Storage so storage.js's real code path (not its
// unavailable-storage fallback) is what gets exercised in tests.
if (typeof window !== 'undefined' && !window.localStorage) {
  class MemoryStorage {
    #data = new Map();
    getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
    setItem(key, value) { this.#data.set(key, String(value)); }
    removeItem(key) { this.#data.delete(key); }
    clear() { this.#data.clear(); }
    key(index) { return [...this.#data.keys()][index] ?? null; }
    get length() { return this.#data.size; }
  }
  Object.defineProperty(window, 'localStorage', { value: new MemoryStorage(), configurable: true });
}
