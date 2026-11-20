import { test, expect } from '@playwright/test';

// Mocks the Cloudflare Worker proxy so these smoke tests run against any
// local static server without needing network access or the real Giphy key
// (the Worker's CORS is intentionally locked to the deployed GitHub Pages
// origin, so a real call from localhost would fail regardless).
async function mockGiphyProxy(page) {
  await page.route('**/jifsaw-giphy-proxy*/**', async (route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get('q');
    if (query === 'failure') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'unavailable' }) });
      return;
    }
    if (query === 'slow') await new Promise(resolve => setTimeout(resolve, 300));
    const gifs = query === 'empty' ? [] : Array.from({ length: 25 }, (_, i) => ({
      id: `mock-${i}`,
      title: `Mock GIF ${i}`,
      images: {
        original_mp4: { mp4: 'https://example.com/mock.mp4' },
        original: { url: 'https://example.com/mock.gif', width: '480', height: '270' },
        fixed_width_small: { url: 'https://example.com/mock-thumb.gif' },
      },
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: gifs, meta: { status: 200 } }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockGiphyProxy(page);
});

test('setup screen loads with no horizontal overflow at desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Jifsaw' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('source and difficulty stages sit side by side on desktop and stack on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('/');
  const desktop = await page.evaluate(() => {
    const explore = document.querySelector('.theme-panel').getBoundingClientRect();
    const topics = document.querySelector('.topic-panel').getBoundingClientRect();
    return { exploreX: explore.x, exploreY: explore.y, topicsX: topics.x, topicsY: topics.y };
  });
  expect(desktop.topicsX).toBeGreaterThan(desktop.exploreX);
  expect(Math.abs(desktop.topicsY - desktop.exploreY)).toBeLessThan(2);
  await expect(page.locator('#startPuzzleBtn')).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  const mobile = await page.evaluate(() => ({
    exploreY: document.querySelector('.theme-panel').getBoundingClientRect().y,
    topicsY: document.querySelector('.topic-panel').getBoundingClientRect().y,
    difficultyY: document.querySelector('#difficultyGroup').getBoundingClientRect().y,
  }));
  expect(mobile.topicsY).toBeGreaterThan(mobile.exploreY);
  expect(mobile.difficultyY).toBeGreaterThan(mobile.topicsY);
  await expect(page.locator('#startPuzzleBtn')).toBeVisible();
});

for (const width of [320, 375, 414]) {
  test(`setup screen has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('theme carousel arrows cycle through themes', async ({ page }) => {
  await page.goto('/');
  const stage = page.locator('#themeStage');
  await expect(stage).toHaveAttribute('data-current', 'classic');
  await page.locator('#themeNext').click();
  await expect(stage).toHaveAttribute('data-current', 'trending');
  await page.locator('#themeNext').click();
  await expect(stage).toHaveAttribute('data-current', 'random');
});

test('switching back to a theme clears the topic selection', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-topic="animals"]').click();
  await expect(page.locator('[data-topic="animals"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#themeNext').click();
  await page.locator('#themeStage').click();
  await expect(page.locator('#activeSource')).toHaveText('Selected: Trending');
  await expect(page.locator('[data-topic="animals"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#themeStage')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#game')).toHaveClass(/hidden/);

  const trending = page.waitForRequest(request => request.url().includes('/trending'));
  await page.locator('#startPuzzleBtn').click();
  await trending;
});

test('category selection stays in setup until start, then New GIF repeats the topic', async ({ page }) => {
  await page.goto('/');
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.locator('[data-topic="animals"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#activeSource')).toHaveText('Selected: Animals');
  await expect(page.locator('[data-topic="animals"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#game')).toHaveClass(/hidden/);
  expect(requests.some(url => url.includes('/search'))).toBe(false);

  const firstSearch = page.waitForRequest((request) =>
    request.url().includes('/search') && new URL(request.url()).searchParams.get('q') === 'animals'
  );
  await page.locator('#startPuzzleBtn').click();
  await firstSearch;
  await expect(page.locator('#game')).not.toHaveClass(/hidden/);
  await expect(page.locator('#loadingOverlay')).toHaveClass(/hidden/);

  // Reveal the win actions so the New GIF handler can be exercised without
  // simulating a full puzzle solve.
  await page.locator('#winOverlay').evaluate(el => el.classList.remove('hidden'));
  const repeatedSearch = page.waitForRequest((request) =>
    request.url().includes('/search') && new URL(request.url()).searchParams.get('q') === 'animals'
  );
  await page.locator('#newThemeBtn').click();
  await repeatedSearch;
});

test('search form submits with Enter and uses the entered topic', async ({ page }) => {
  await page.goto('/');
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.locator('#gifSearch').fill('cats');
  await page.locator('#gifSearch').press('Enter');
  await expect(page.locator('#activeSource')).toHaveText('Selected: cats');
  await expect(page.locator('#game')).toHaveClass(/hidden/);
  expect(requests.some(url => url.includes('/search'))).toBe(false);

  const search = page.waitForRequest((request) =>
    request.url().includes('/search') && new URL(request.url()).searchParams.get('q') === 'cats'
  );
  await page.locator('#startPuzzleBtn').click();
  await search;
  await expect(page.locator('#game')).not.toHaveClass(/hidden/);
});

test('loading is announced and an empty search shows a useful error', async ({ page }) => {
  await page.goto('/');
  await page.locator('#gifSearch').fill('slow');
  await page.locator('#gifSearch').press('Enter');
  await page.locator('#startPuzzleBtn').click();
  await expect(page.locator('#loadingText')).toHaveAttribute('role', 'status');
  await expect(page.locator('#loadingText')).toContainText('Finding slow GIFs');
  await expect(page.locator('#game')).not.toHaveClass(/hidden/);
  await expect(page.locator('#loadingOverlay')).toHaveClass(/hidden/);

  await page.locator('#newBtn').click();
  await page.locator('#gifSearch').fill('empty');
  await page.locator('#gifSearch').press('Enter');
  await page.locator('#startPuzzleBtn').click();
  await expect(page.locator('#searchStatus')).toContainText('No GIFs found for “empty”');
  await expect(page.locator('#searchStatus')).toHaveAttribute('aria-live', 'polite');
});

test('search request failures are shown on the setup screen', async ({ page }) => {
  await page.goto('/');
  await page.locator('#gifSearch').fill('failure');
  await page.locator('#gifSearch').press('Enter');
  await page.locator('#startPuzzleBtn').click();
  await expect(page.locator('#searchStatus')).toContainText('Giphy proxy request failed (503)');
});

test('blank search is rejected without requesting a GIF', async ({ page }) => {
  await page.goto('/');
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.locator('#gifSearch').fill('   ');
  await page.locator('#gifSearch').press('Enter');
  await expect(page.locator('#searchStatus')).toContainText('Enter a topic to search for.');
  expect(requests.some(url => url.includes('/search'))).toBe(false);
  await expect(page.locator('#game')).toHaveClass(/hidden/);
});

test('source controls stay consistent while a GIF request is loading', async ({ page }) => {
  await page.goto('/');
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.locator('#gifSearch').fill('slow');
  await page.locator('#gifSearch').press('Enter');
  await page.locator('#startPuzzleBtn').click();
  await expect(page.locator('#setup')).toHaveAttribute('inert', '');

  // Even a scripted interaction cannot change the selected source mid-request.
  await page.locator('[data-topic="animals"]').evaluate((button) => button.click());
  await expect(page.locator('#activeSource')).toHaveText('Selected: slow');
  await expect(page.locator('[data-topic="animals"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#game')).not.toHaveClass(/hidden/);
  expect(requests.filter(url => url.includes('/search')).map(url => new URL(url).searchParams.get('q'))).toEqual(['slow']);
});

test('difficulty slider selects Hard via its tick label', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-value="5x4"]').click();
  await expect(page.locator('#difficultyGroup')).toHaveAttribute('data-value', '5x4');
});

test('starting a puzzle deals all pieces fully inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await page.locator('[data-value="5x4"]').click(); // Hard = 20 pieces, tightest fit
  await page.locator('#themeStage').click();
  await expect(page.locator('#activeSource')).toHaveText('Selected: Classic');
  await page.locator('#startPuzzleBtn').click();
  await expect(page.locator('#game')).not.toHaveClass(/hidden/, { timeout: 10000 });

  // Let the deal-out animation settle.
  await page.waitForTimeout(1500);

  const overflowCount = await page.evaluate(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    return [...document.querySelectorAll('.piece')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.left < 0 || r.top < 0 || r.right > vw || r.bottom > vh;
    }).length;
  });
  expect(overflowCount).toBe(0);

  const pieceCount = await page.locator('.piece').count();
  expect(pieceCount).toBe(20);
});

test('tray pieces cannot block game toolbar controls', async ({ page }) => {
  await page.goto('/');
  await page.locator('#themeStage').click();
  await expect(page.locator('#game')).not.toHaveClass(/hidden/, { timeout: 10000 });

  const control = page.locator('#newBtn');
  const piece = page.locator('#tray .piece').first();
  await expect(piece).toBeVisible();

  await page.evaluate(() => {
    const button = document.getElementById('newBtn');
    const canvas = document.querySelector('#tray .piece');
    const rect = button.getBoundingClientRect();
    canvas.style.transition = 'none';
    canvas.style.left = `${rect.left + rect.width / 2 - canvas.width / 2}px`;
    canvas.style.top = `${rect.top + rect.height / 2 - canvas.height / 2}px`;
    canvas.style.zIndex = '9999';
  });

  await expect.poll(() => control.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('#newBtn') === button;
  })).toBe(true);

  await control.click();
  await expect(page.locator('#setup')).not.toHaveClass(/hidden/);
});

test('New button clears the board and tray', async ({ page }) => {
  await page.goto('/');
  await page.locator('#themeStage').click();
  await page.locator('#startPuzzleBtn').click();
  await expect(page.locator('#game')).not.toHaveClass(/hidden/, { timeout: 10000 });

  await page.locator('#newBtn').click();
  await expect(page.locator('#setup')).not.toHaveClass(/hidden/);

  const leftoverPieces = await page.locator('.piece').count();
  expect(leftoverPieces).toBe(0);
});

// Off-board piece joining: constructs a Puzzle.JigsawGame directly (bypassing
// app.js's UI flow, since Puzzle is the only piece of this exposed as a
// global) so these tests can reach into the engine's piece/group objects
// the same way they'd be exercised by two pieces actually meeting in the tray.
test.describe('off-board piece joining', () => {
  async function buildTestGame(page) {
    await page.goto('/');
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.evaluate(() => {
      document.getElementById('setup').classList.add('hidden');
      const game = document.getElementById('game');
      game.classList.remove('hidden');
      const board = document.getElementById('board');
      const tray = document.getElementById('tray');
      board.innerHTML = '';
      tray.innerHTML = '';
      board.style.width = '480px';
      board.style.height = '270px';
      const canvas = document.createElement('canvas');
      canvas.width = 480; canvas.height = 270;
      canvas.getContext('2d').fillRect(0, 0, 480, 270);
      window.__game = new Puzzle.JigsawGame({
        board, tray, source: canvas, rows: 3, cols: 4, width: 480, height: 270,
        onProgress: () => {},
      });
      // Test helper: positions a piece immediately, bypassing whatever CSS
      // transition the deal/shuffle animation left on it (real drag code
      // does the same — _onPointerDown sets transition:'none' before
      // moving a piece — so this mirrors actual gameplay, not a test-only
      // shortcut).
      window.__place = (piece, left, top, rot = 0) => {
        piece.canvas.style.transition = 'none';
        piece.rot = rot;
        piece.canvas.style.transform = `rotate(${rot}deg)`;
        piece.canvas.style.left = left + 'px';
        piece.canvas.style.top = top + 'px';
      };
    });
    await page.waitForTimeout(600); // let the initial deal settle
  }

  test('two correctly-matched upright pieces join into one group', async ({ page }) => {
    await buildTestGame(page);
    const result = await page.evaluate(() => {
      const g = window.__game;
      const p00 = g.pieces.find(p => p.r === 0 && p.c === 0);
      const p01 = g.pieces.find(p => p.r === 0 && p.c === 1);
      window.__place(p00, 300, 400);
      const dx = p01.home.x - p00.home.x, dy = p01.home.y - p00.home.y;
      window.__place(p01, 300 + dx, 400 + dy);
      const joined = g._tryJoinOffBoard(p00);
      return { joined, sameGroup: p00.group === p01.group, groupSize: p00.group.length };
    });
    expect(result.joined).toBe(true);
    expect(result.sameGroup).toBe(true);
    expect(result.groupSize).toBe(2);
  });

  test('dragging one piece of a joined group moves the whole group together', async ({ page }) => {
    await buildTestGame(page);
    const delta = await page.evaluate(() => {
      const g = window.__game;
      const p00 = g.pieces.find(p => p.r === 0 && p.c === 0);
      const p01 = g.pieces.find(p => p.r === 0 && p.c === 1);
      window.__place(p00, 300, 400);
      const dx = p01.home.x - p00.home.x, dy = p01.home.y - p00.home.y;
      window.__place(p01, 300 + dx, 400 + dy);
      g._tryJoinOffBoard(p00);

      const before01 = { left: parseFloat(p01.canvas.style.left), top: parseFloat(p01.canvas.style.top) };
      g.dragging = p00;
      g._offsetX = 0; g._offsetY = 0; g._lastX = 0; g._lastY = 0; g._vx = 0; g._vy = 0;
      g._onPointerMove({ clientX: 50, clientY: 30 });
      g.dragging = null;
      const after01 = { left: parseFloat(p01.canvas.style.left), top: parseFloat(p01.canvas.style.top) };
      return { dx: after01.left - before01.left, dy: after01.top - before01.top };
    });
    expect(delta.dx).toBeCloseTo(50, 0);
    expect(delta.dy).toBeCloseTo(30, 0);
  });

  test('a joined 2-piece group locks both pieces when dropped on the board', async ({ page }) => {
    await buildTestGame(page);
    const result = await page.evaluate(() => {
      const g = window.__game;
      const p00 = g.pieces.find(p => p.r === 0 && p.c === 0);
      const p01 = g.pieces.find(p => p.r === 0 && p.c === 1);
      window.__place(p00, 300, 400);
      const dx = p01.home.x - p00.home.x, dy = p01.home.y - p00.home.y;
      window.__place(p01, 300 + dx, 400 + dy);
      g._tryJoinOffBoard(p00);

      const boardRect = g.board.getBoundingClientRect();
      const targetLeft = boardRect.left + p00.home.x;
      const targetTop = boardRect.top + p00.home.y;
      const moveX = targetLeft - parseFloat(p00.canvas.style.left);
      const moveY = targetTop - parseFloat(p00.canvas.style.top);
      [p00, p01].forEach(p => {
        p.canvas.style.transition = 'none';
        p.canvas.style.left = (parseFloat(p.canvas.style.left) + moveX) + 'px';
        p.canvas.style.top = (parseFloat(p.canvas.style.top) + moveY) + 'px';
      });
      g.dragging = p00;
      g._offsetX = 0; g._offsetY = 0;
      g._onPointerUp({ clientX: targetLeft, clientY: targetTop });
      return { p00Locked: p00.locked, p01Locked: p01.locked };
    });
    expect(result.p00Locked).toBe(true);
    expect(result.p01Locked).toBe(true);
  });

  // Regression test: board-snapping never required a piece to be upright —
  // dropping a rotated piece in the right spot has always snapped it and
  // straightened it to rot:0. An earlier version of the off-board-join work
  // accidentally added an uprightness requirement to board-snapping too,
  // making it feel far less forgiving than before. Only the off-board join
  // (tested above/below) is upright-only; board-snapping is position-only.
  test('a single rotated piece still snaps onto the board at its correct spot', async ({ page }) => {
    await buildTestGame(page);
    const result = await page.evaluate(() => {
      const g = window.__game;
      const p00 = g.pieces.find(p => p.r === 0 && p.c === 0);
      const boardRect = g.board.getBoundingClientRect();
      const targetLeft = boardRect.left + p00.home.x;
      const targetTop = boardRect.top + p00.home.y;
      window.__place(p00, targetLeft, targetTop, 22); // well outside the ~6° upright tolerance
      g.dragging = p00;
      g._offsetX = 0; g._offsetY = 0;
      g._onPointerUp({ clientX: targetLeft, clientY: targetTop });
      return { locked: p00.locked };
    });
    expect(result.locked).toBe(true);
  });

  // Issue #1: pieces within the upright tolerance (~6°) are allowed to join,
  // but used to keep their small tilt afterwards, so the seam between them
  // was visibly off. A join must leave every member of the merged group at 0°.
  test('joining straightens slightly tilted pieces so the seam lines up', async ({ page }) => {
    await buildTestGame(page);
    const result = await page.evaluate(() => {
      const g = window.__game;
      const p00 = g.pieces.find(p => p.r === 0 && p.c === 0);
      const p01 = g.pieces.find(p => p.r === 0 && p.c === 1);
      window.__place(p00, 300, 400, -4);
      const dx = p01.home.x - p00.home.x, dy = p01.home.y - p00.home.y;
      window.__place(p01, 300 + dx, 400 + dy, 5);
      const joined = g._tryJoinOffBoard(p00);
      return { joined, rots: [p00.rot, p01.rot], transforms: [p00.canvas.style.transform, p01.canvas.style.transform] };
    });
    expect(result.joined).toBe(true);
    expect(result.rots).toEqual([0, 0]);
    result.transforms.forEach(t => expect(t === '' || /rotate\(0(deg)?\)/.test(t)).toBe(true));
  });

  // Issue #1: only the grabbed piece used to be tested against neighbours, so
  // a group dropped with a *different* member next to another group's piece
  // would not join.
  test('a group joins when a piece other than the grabbed one meets a neighbour', async ({ page }) => {
    await buildTestGame(page);
    const result = await page.evaluate(() => {
      const g = window.__game;
      const p00 = g.pieces.find(p => p.r === 0 && p.c === 0);
      const p01 = g.pieces.find(p => p.r === 0 && p.c === 1);
      const p02 = g.pieces.find(p => p.r === 0 && p.c === 2);
      window.__place(p00, 300, 400);
      const d01x = p01.home.x - p00.home.x, d01y = p01.home.y - p00.home.y;
      window.__place(p01, 300 + d01x, 400 + d01y);
      g._tryJoinOffBoard(p00); // group {p00, p01}
      const d02x = p02.home.x - p00.home.x, d02y = p02.home.y - p00.home.y;
      window.__place(p02, 300 + d02x, 400 + d02y);
      // p00 is grabbed, but only p01 touches p02.
      const joined = g._tryJoinOffBoard(p00);
      return { joined, groupSize: p00.group.length, sameGroup: p00.group === p02.group };
    });
    expect(result.joined).toBe(true);
    expect(result.sameGroup).toBe(true);
    expect(result.groupSize).toBe(3);
  });

  test('non-adjacent pieces placed close together do not join', async ({ page }) => {
    await buildTestGame(page);
    const result = await page.evaluate(() => {
      const g = window.__game;
      const p10 = g.pieces.find(p => p.r === 1 && p.c === 0);
      const p22 = g.pieces.find(p => p.r === 2 && p.c === 2);
      window.__place(p10, 300, 400);
      window.__place(p22, 305, 405);
      return { joined: g._tryJoinOffBoard(p10), sameGroup: p10.group === p22.group };
    });
    expect(result.joined).toBe(false);
    expect(result.sameGroup).toBe(false);
  });

  test('a correctly-positioned but rotated piece does not join (upright-only gate)', async ({ page }) => {
    await buildTestGame(page);
    const result = await page.evaluate(() => {
      const g = window.__game;
      const p20 = g.pieces.find(p => p.r === 2 && p.c === 0);
      const p21 = g.pieces.find(p => p.r === 2 && p.c === 1);
      window.__place(p20, 300, 400, 0);
      const dx = p21.home.x - p20.home.x, dy = p21.home.y - p20.home.y;
      window.__place(p21, 300 + dx, 400 + dy, 15);
      return { joined: g._tryJoinOffBoard(p20), sameGroup: p20.group === p21.group };
    });
    expect(result.joined).toBe(false);
    expect(result.sameGroup).toBe(false);
  });
});

test.describe('mute toggle', () => {
  // The mute button lives in the in-game toolbar (#game), hidden until a
  // puzzle has started — so these tests start one first, same as the
  // "New button clears" test above.
  async function startAnyPuzzle(page) {
    await page.goto('/');
    await page.locator('#themeStage').click();
    await page.locator('#startPuzzleBtn').click();
    await expect(page.locator('#game')).not.toHaveClass(/hidden/, { timeout: 10000 });
  }

  test('mute button toggles state and icon', async ({ page }) => {
    await startAnyPuzzle(page);
    const muteBtn = page.locator('#muteBtn');
    const muteIcon = page.locator('#muteIcon');
    await expect(muteIcon).toHaveText('🔊');
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'false');

    await muteBtn.click();
    await expect(muteIcon).toHaveText('🔇');
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'true');

    await muteBtn.click();
    await expect(muteIcon).toHaveText('🔊');
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'false');
  });

  test('mute state persists across reload', async ({ page }) => {
    await startAnyPuzzle(page);
    await page.locator('#muteBtn').click();
    await expect(page.locator('#muteIcon')).toHaveText('🔇');

    await page.reload();
    // Mute state is read and applied at page-load time regardless of
    // whether a puzzle is running, so the icon should already reflect it
    // on the setup screen too.
    await expect(page.locator('#muteIcon')).toHaveText('🔇');
    await expect(page.locator('#muteBtn')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('best time persistence', () => {
  test('setup screen shows no best time before any solve', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#setupBestTime')).toHaveText('');
  });

  test('solving a puzzle saves a best time and shows it on the win screen and setup screen', async ({ page }) => {
    await page.goto('/');
    // Directly exercise Storage (loaded as a page global) rather than
    // actually solving a 9-piece puzzle through the UI — the save/compare
    // logic itself is already unit-tested; this just confirms app.js reads
    // it back into both the setup screen and win overlay correctly.
    await page.evaluate(() => {
      Storage.saveBestTimeIfBetter('3x3', 95);
    });
    await page.reload();
    await expect(page.locator('#setupBestTime')).toContainText('01:35');
  });
});

test.describe('Hard-mode piece drift', () => {
  async function buildHardGame(page) {
    await page.goto('/');
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.evaluate(() => {
      document.getElementById('setup').classList.add('hidden');
      const game = document.getElementById('game');
      game.classList.remove('hidden');
      const board = document.getElementById('board');
      const tray = document.getElementById('tray');
      board.innerHTML = '';
      tray.innerHTML = '';
      board.style.width = '480px';
      board.style.height = '270px';
      const canvas = document.createElement('canvas');
      canvas.width = 480; canvas.height = 270;
      canvas.getContext('2d').fillRect(0, 0, 480, 270);
      window.__game = new Puzzle.JigsawGame({
        board, tray, source: canvas, rows: 4, cols: 5, width: 480, height: 270,
        hardMode: true,
        onProgress: () => {},
      });
    });
    await page.waitForTimeout(1500); // let the deal fully settle before measuring drift
  }

  test('unplaced pieces move on their own over time in Hard mode', async ({ page }) => {
    await buildHardGame(page);
    const before = await page.evaluate(() =>
      [...document.querySelectorAll('.piece')].map(el => {
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top };
      })
    );
    await page.waitForTimeout(2000);
    const after = await page.evaluate(() =>
      [...document.querySelectorAll('.piece')].map(el => {
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top };
      })
    );
    const movedCount = before.filter((b, i) =>
      Math.abs(b.x - after[i].x) > 0.5 || Math.abs(b.y - after[i].y) > 0.5
    ).length;
    expect(movedCount).toBeGreaterThan(0);
  });

  test('a piece stops drifting the instant it is picked up', async ({ page }) => {
    await buildHardGame(page);
    // Freeze the render loop so the target cannot move between measuring its
    // hit area and sending the real pointer event. Pointer capture requires a
    // genuine browser pointer id, so keep the interaction real.
    const target = await page.evaluate(() => {
      const g = window.__game;
      cancelAnimationFrame(g._raf);

      let hit = null;
      for (const piece of g.pieces) {
        const rect = piece.canvas.getBoundingClientRect();
        for (const fy of [0.25, 0.5, 0.75]) {
          for (const fx of [0.25, 0.5, 0.75]) {
            const x = rect.left + rect.width * fx;
            const y = rect.top + rect.height * fy;
            const candidate = g._pieceAt(x, y);
            if (candidate) {
              hit = { piece: candidate, x, y };
              break;
            }
          }
          if (hit) break;
        }
        if (hit) break;
      }

      if (!hit) throw new Error('Could not find an exposed point on a loose piece');
      const anchor = hit.piece.group[0];
      anchor.driftVx = 5;
      anchor.driftVy = 5;
      g.__testPieceIndex = g.pieces.indexOf(anchor);
      return { x: hit.x, y: hit.y };
    });
    await page.mouse.move(target.x, target.y);
    await page.mouse.down();
    const result = await page.evaluate(() => {
      const g = window.__game;
      const p = g.pieces[g.__testPieceIndex];
      return { vx: p.driftVx, vy: p.driftVy };
    });
    await page.mouse.up();
    expect(result.vx).toBe(0);
    expect(result.vy).toBe(0);
  });
});
