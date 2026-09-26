(() => {
  const setupSection = document.getElementById('setup');
  const searchStatus = document.getElementById('searchStatus');
  const difficultyGroup = document.getElementById('difficultyGroup');
  const themeGroup = document.getElementById('themeGroup');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const saveKeyBtn = document.getElementById('saveKeyBtn');
  const keyStatus = document.getElementById('keyStatus');

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

  difficultyGroup.querySelectorAll('.choice').forEach(btn => {
    btn.addEventListener('click', () => {
      difficultyGroup.querySelectorAll('.choice').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      difficultyGroup.dataset.value = btn.dataset.value;
    });
  });

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

  themeGroup.querySelectorAll('.choice').forEach(btn => {
    btn.addEventListener('click', () => startFromTheme(btn.dataset.value));
  });

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

  function updateKeyStatus() {
    keyStatus.textContent = Giphy.usingOwnKey() ? '✓ using your key' : '';
  }

  saveKeyBtn.addEventListener('click', () => {
    Giphy.saveKey(apiKeyInput.value);
    updateKeyStatus();
    apiKeyInput.value = '';
    setStatus('Key saved.');
  });

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

  updateKeyStatus();
})();
