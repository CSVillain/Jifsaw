// Procedural sound effects for Jifsaw. No audio files — every effect is a
// short synthesized tone via the Web Audio API, in keeping with the rest of
// the project shipping no binary assets. Mirrors the Confetti/Giphy IIFE
// pattern: a single global, no build step.
const Sound = (() => {
  let ctx = null;
  let muted = false;

  // Browsers block audio until a real user gesture resumes/creates the
  // AudioContext — call this from inside an existing click/pointerdown
  // handler, not at page load.
  function ensureContext() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(freq, startTime, duration, { type = 'sine', gain = 0.15, glideTo = null } = {}) {
    const c = ensureContext();
    if (!c || muted) return;
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, startTime + duration);
    amp.gain.setValueAtTime(0, startTime);
    amp.gain.linearRampToValueAtTime(gain, startTime + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(amp);
    amp.connect(c.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  // Short, low, slightly muted "clack" — a piece seating firmly on the board.
  function lock() {
    const c = ensureContext();
    if (!c || muted) return;
    const t = c.currentTime;
    tone(220, t, 0.08, { type: 'triangle', gain: 0.18, glideTo: 160 });
  }

  // Softer and a touch higher than lock, so players can tell the two apart.
  function join() {
    const c = ensureContext();
    if (!c || muted) return;
    const t = c.currentTime;
    tone(420, t, 0.07, { type: 'sine', gain: 0.12, glideTo: 520 });
  }

  // Short ascending four-note chime on solving the puzzle.
  function win() {
    const c = ensureContext();
    if (!c || muted) return;
    const t = c.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => tone(freq, t + i * 0.09, 0.22, { type: 'triangle', gain: 0.14 }));
  }

  function setMuted(value) {
    muted = value;
    // Don't eagerly create the AudioContext here — this runs at page load
    // (restoring the saved mute preference), long before any user gesture,
    // and browsers warn/refuse to start audio outside one. Each play
    // function already calls ensureContext() lazily when a sound is
    // actually about to fire, which by then is always inside a real
    // click/pointerdown handler.
  }

  function isMuted() {
    return muted;
  }

  return { lock, join, win, setMuted, isMuted };
})();

if (typeof module !== 'undefined') module.exports = Sound;
