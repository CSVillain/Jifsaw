(() => {
  const setupSection = document.getElementById('setup');
  const searchStatus = document.getElementById('searchStatus');
  const difficultyGroup = document.getElementById('difficultyGroup');
  const themeGroup = document.getElementById('themeGroup');
  const diffTrack = document.getElementById('diffTrack');
  const diffHandle = document.getElementById('diffHandle');
  const diffFill = document.getElementById('diffFill');
  const diffReadout = document.getElementById('diffReadout');
  const diffTickButtons = Array.from(document.querySelectorAll('.diff-tick-label'));
  const setReadout = (text) => { if (diffReadout) diffReadout.textContent = text; };

  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');

  const game = document.getElementById('game');
  const board = document.getElementById('board');
  const tray = document.getElementById('tray');
  const pieceCountEl = document.getElementById('pieceCount');
  const progressFill = document.getElementById('progressFill');
  const shuffleBtn = document.getElementById('shuffleBtn');
  const hintBtn = document.getElementById('hintBtn');
  const newBtn = document.getElementById('newBtn');
  const timerEl = document.getElementById('timer');
  const videoEl = document.getElementById('src');

  const winOverlay = document.getElementById('winOverlay');
  const confettiCanvas = document.getElementById('confettiCanvas');
  const winTimeEl = document.getElementById('winTime');
  const winDifficultyEl = document.getElementById('winDifficulty');
  const winVideo = document.getElementById('winVideo');
  const playAgainBtn = document.getElementById('playAgainBtn');
  const newThemeBtn = document.getElementById('newThemeBtn');

  const BOARD_W = 480;
  const DIFFICULTY_LABELS = { '3x3': 'Easy', '4x3': 'Medium', '5x4': 'Hard' };

  let currentGame = null;
  let timerInterval = null;
  let elapsedSec = 0;
  let stopConfetti = null;
  let lastGif = null;

  function setStatus(msg, isError = false) {
    searchStatus.textContent = msg;
    searchStatus.classList.toggle('error', isError);
  }

  // Difficulty slider: drag left→right to go from a calm, static Easy to a
  // shaking, fire-rimmed Hard. Colors interpolate across the same stops as
  // the track's gradient fill so the handle always matches the fill's edge.
  const DIFF_LEVELS = [
    { value: '3x3', pct: 0, label: 'Easy', pieces: 9 },
    { value: '4x3', pct: 50, label: 'Medium', pieces: 12 },
    { value: '5x4', pct: 100, label: 'Hard', pieces: 20 },
  ];
  const DIFF_COLOR_STOPS = [
    [0, [74, 222, 128]],
    [45, [251, 191, 36]],
    [75, [249, 115, 22]],
    [100, [239, 68, 68]],
  ];

  function diffColorForPct(pct) {
    for (let i = 0; i < DIFF_COLOR_STOPS.length - 1; i++) {
      const [p0, c0] = DIFF_COLOR_STOPS[i];
      const [p1, c1] = DIFF_COLOR_STOPS[i + 1];
      if (pct >= p0 && pct <= p1) {
        const t = (pct - p0) / (p1 - p0 || 1);
        const r = Math.round(c0[0] + (c1[0] - c0[0]) * t);
        const g = Math.round(c0[1] + (c1[1] - c0[1]) * t);
        const b = Math.round(c0[2] + (c1[2] - c0[2]) * t);
        return `rgb(${r},${g},${b})`;
      }
    }
    return 'rgb(239,68,68)';
  }

  function diffNearestIndex(pct) {
    let best = 0, bestDist = Infinity;
    DIFF_LEVELS.forEach((lv, i) => {
      const d = Math.abs(lv.pct - pct);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  }

  function diffApplyVisual(pct) {
    diffHandle.style.left = pct + '%';
    diffFill.style.clipPath = `inset(0 ${100 - pct}% 0 0 round 999px)`;
    diffHandle.style.borderColor = diffColorForPct(pct);
    const intensity = pct / 100;
    if (intensity < 0.04) {
      diffHandle.classList.remove('shaking');
    } else {
      diffHandle.classList.add('shaking');
      diffHandle.style.setProperty('--shake-amt', (2 + intensity * 6).toFixed(1) + 'px');
      diffHandle.style.setProperty('--shake-dur', (1.05 - intensity * 0.85).toFixed(2) + 's');
    }
    diffHandle.style.setProperty('--fire-opacity', intensity > 0.68 ? Math.min(1, (intensity - 0.68) / 0.32).toFixed(2) : '0');
  }

  function diffSetLevel(index) {
    const lv = DIFF_LEVELS[index];
    difficultyGroup.dataset.value = lv.value;
    diffTickButtons.forEach((b, i) => b.classList.toggle('active', i === index));
    diffHandle.setAttribute('aria-valuenow', String(index));
    diffHandle.setAttribute('aria-valuetext', `${lv.label}, ${lv.pieces} pieces`);
    setReadout(`${lv.label} · ${lv.pieces} pieces`);
    diffFill.classList.add('snapping');
    diffHandle.classList.add('snapping');
    diffApplyVisual(lv.pct);
  }

  function diffTrackPct(clientX) {
    const rect = diffTrack.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  }

  let diffDragging = false;
  function diffStartDrag(clientX) {
    diffDragging = true;
    diffHandle.classList.add('dragging');
    diffFill.classList.remove('snapping');
    diffHandle.classList.remove('snapping');
    diffApplyVisual(diffTrackPct(clientX));
  }
  diffHandle.addEventListener('pointerdown', (e) => {
    diffHandle.setPointerCapture(e.pointerId);
    diffStartDrag(e.clientX);
    e.preventDefault();
  });
  diffTrack.addEventListener('pointerdown', (e) => {
    if (e.target === diffHandle) return;
    diffStartDrag(e.clientX);
  });
  window.addEventListener('pointermove', (e) => {
    if (!diffDragging) return;
    diffApplyVisual(diffTrackPct(e.clientX));
  });
  window.addEventListener('pointerup', (e) => {
    if (!diffDragging) return;
    diffDragging = false;
    diffHandle.classList.remove('dragging');
    diffSetLevel(diffNearestIndex(diffTrackPct(e.clientX)));
  });
  diffHandle.addEventListener('keydown', (e) => {
    const current = DIFF_LEVELS.findIndex(l => l.value === difficultyGroup.dataset.value);
    let idx = current;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') idx = Math.min(DIFF_LEVELS.length - 1, current + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') idx = Math.max(0, current - 1);
    else if (e.key === 'Home') idx = 0;
    else if (e.key === 'End') idx = DIFF_LEVELS.length - 1;
    else return;
    e.preventDefault();
    diffSetLevel(idx);
  });
  diffTickButtons.forEach((btn, i) => btn.addEventListener('click', () => diffSetLevel(i)));

  diffSetLevel(0);

  const THEME_FETCHERS = {
    classic: () => Giphy.classicPick(),
    trending: () => Giphy.trendingPick(),
    random: () => Giphy.random(),
  };
  const THEME_LOADING_TEXT = {
    classic: 'Digging up a classic…',
    trending: "Grabbing what's hot…",
    random: 'Rolling the dice…',
  };

  // GIF-theme carousel: a card you swipe/arrow-key through to browse, and
  // tap to commit and start.
  const THEME_ORDER = ['classic', 'trending', 'random'];
  const themeStage = document.getElementById('themeStage');
  const themeFaces = Array.from(themeStage.querySelectorAll('.theme-face'));
  const themePrevBtn = document.getElementById('themePrev');
  const themeNextBtn = document.getElementById('themeNext');
  let themeIndex = 0;

  function themeShow(nextIndex, direction) {
    const wrapped = ((nextIndex % THEME_ORDER.length) + THEME_ORDER.length) % THEME_ORDER.length;
    if (wrapped === themeIndex) return;
    const outFace = themeFaces[themeIndex];
    const inFace = themeFaces[wrapped];
    outFace.classList.remove('is-active');
    outFace.classList.add(direction > 0 ? 'leaving-next' : 'leaving-prev');
    setTimeout(() => outFace.classList.remove('leaving-next', 'leaving-prev'), 500);
    inFace.classList.add('is-active');
    themeIndex = wrapped;
    themeStage.dataset.current = THEME_ORDER[themeIndex];
  }

  themePrevBtn.addEventListener('click', () => themeShow(themeIndex - 1, -1));
  themeNextBtn.addEventListener('click', () => themeShow(themeIndex + 1, 1));

  let themeDragStartX = null;
  let themeDragMoved = false;
  themeStage.addEventListener('pointerdown', (e) => {
    themeDragStartX = e.clientX;
    themeDragMoved = false;
    themeStage.setPointerCapture(e.pointerId);
  });
  themeStage.addEventListener('pointermove', (e) => {
    if (themeDragStartX === null) return;
    if (Math.abs(e.clientX - themeDragStartX) > 8) themeDragMoved = true;
  });
  themeStage.addEventListener('pointerup', (e) => {
    if (themeDragStartX === null) return;
    const delta = e.clientX - themeDragStartX;
    themeDragStartX = null;
    if (Math.abs(delta) > 50) {
      themeShow(themeIndex + (delta < 0 ? 1 : -1), delta < 0 ? 1 : -1);
    } else if (!themeDragMoved) {
      startFromTheme(THEME_ORDER[themeIndex]);
    }
  });
  themeStage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { themeShow(themeIndex + 1, 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { themeShow(themeIndex - 1, -1); e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === ' ') { startFromTheme(THEME_ORDER[themeIndex]); e.preventDefault(); }
  });
  themeStage.dataset.current = THEME_ORDER[themeIndex];

  async function startFromTheme(theme) {
    showLoading(THEME_LOADING_TEXT[theme] || 'Fetching a GIF…');
    setStatus('');
    try {
      const gif = await THEME_FETCHERS[theme]();
      lastGif = { gif, theme };
      await startPuzzle(gif);
    } catch (err) {
      setStatus(err.message, true);
    } finally {
      hideLoading();
    }
  }

  function showLoading(text) {
    loadingText.textContent = text;
    loadingOverlay.classList.remove('hidden');
  }
  function hideLoading() {
    loadingOverlay.classList.add('hidden');
  }

  function parseDifficulty() {
    const [cols, rows] = difficultyGroup.dataset.value.split('x').map(Number);
    return { rows, cols };
  }

  async function startPuzzle(gif) {
    setupSection.classList.add('hidden');
    winOverlay.classList.add('hidden');
    game.classList.remove('hidden');
    board.innerHTML = '';
    tray.innerHTML = '';

    const { rows, cols } = parseDifficulty();
    const boardH = Math.round(BOARD_W * (gif.height / gif.width));
    board.style.width = BOARD_W + 'px';
    board.style.height = boardH + 'px';

    if (currentGame) currentGame.destroy();
    stopTimer();

    let source = videoEl;
    if (gif.mp4) {
      videoEl.src = gif.mp4;
      videoEl.autoplay = true;
      await new Promise((resolve) => {
        videoEl.onloadeddata = resolve;
        videoEl.onerror = resolve;
        setTimeout(resolve, 4000);
      });
      videoEl.play().catch(() => {});
    } else {
      // Still-image fallback: draw once into an offscreen canvas-as-video-like source.
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        img.src = gif.still;
      });
      source = img;
    }

    const total = rows * cols;
    currentGame = new Puzzle.JigsawGame({
      board, tray, source,
      rows, cols,
      width: BOARD_W, height: boardH,
      onProgress: (solved) => {
        const placed = currentGame.solvedCount();
        pieceCountEl.textContent = `${placed}/${total} placed`;
        progressFill.style.width = `${(placed / total) * 100}%`;
        if (solved) onSolved(gif);
      },
    });
    pieceCountEl.textContent = `0/${total} placed`;
    progressFill.style.width = '0%';
    startTimer();
  }

  shuffleBtn.addEventListener('click', () => currentGame?.shuffle());
  hintBtn.addEventListener('click', () => {
    currentGame?.setHint(!currentGame.hintOn);
    hintBtn.classList.toggle('selected', !!currentGame?.hintOn);
  });
  newBtn.addEventListener('click', () => {
    if (currentGame) currentGame.destroy();
    currentGame = null;
    stopTimer();
    game.classList.add('hidden');
    setupSection.classList.remove('hidden');
    setStatus('');
  });

  function startTimer() {
    elapsedSec = 0;
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      elapsedSec++;
      updateTimerDisplay();
    }, 1000);
  }
  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  function updateTimerDisplay() {
    const m = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
    const s = String(elapsedSec % 60).padStart(2, '0');
    timerEl.textContent = `${m}:${s}`;
  }

  function onSolved(gif) {
    stopTimer();
    winTimeEl.textContent = timerEl.textContent;
    winDifficultyEl.textContent = DIFFICULTY_LABELS[difficultyGroup.dataset.value] || '';
    if (gif.mp4) {
      winVideo.src = gif.mp4;
      winVideo.play().catch(() => {});
    }
    winOverlay.classList.remove('hidden');
    if (stopConfetti) stopConfetti();
    stopConfetti = Confetti.launch(confettiCanvas, { duration: 3500 });
  }

  playAgainBtn.addEventListener('click', () => {
    winOverlay.classList.add('hidden');
    if (lastGif) startPuzzle(lastGif.gif);
  });
  newThemeBtn.addEventListener('click', () => {
    winOverlay.classList.add('hidden');
    if (lastGif) startFromTheme(lastGif.theme);
  });
})();
