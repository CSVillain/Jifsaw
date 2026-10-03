import { test, expect } from '@playwright/test';

// Mocks the Cloudflare Worker proxy so these smoke tests run against any
// local static server without needing network access or the real Giphy key
// (the Worker's CORS is intentionally locked to the deployed GitHub Pages
// origin, so a real call from localhost would fail regardless).
async function mockGiphyProxy(page) {
  await page.route('**/jifsaw-giphy-proxy*/**', (route) => {
    const gifs = Array.from({ length: 25 }, (_, i) => ({
      id: `mock-${i}`,
      title: `Mock GIF ${i}`,
      images: {
        original_mp4: { mp4: 'https://example.com/mock.mp4' },
        original: { url: 'https://example.com/mock.gif', width: '480', height: '270' },
        fixed_width_small: { url: 'https://example.com/mock-thumb.gif' },
      },
    }));
    route.fulfill({
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

test('New button clears the board and tray', async ({ page }) => {
  await page.goto('/');
  await page.locator('#themeStage').click();
  await expect(page.locator('#game')).not.toHaveClass(/hidden/, { timeout: 10000 });

  // Pieces scatter across the whole viewport and can legitimately land on
  // top of the toolbar (confirmed live: ~2 of 9 pieces overlap the New
  // button at rest, not just mid-animation) — a real pre-existing UX quirk,
  // not a test timing issue, so waiting longer doesn't help, and
  // click({force:true}) is wrong here too: it dispatches at the button's
  // coordinates but hits whatever's visually on top (a piece canvas), not
  // the button underneath — the click never reaches newBtn's handler at
  // all. What this test actually checks is "does clicking New clear the
  // board", not "is the button visually unobstructed", so click the
  // element directly rather than simulating a pointer at its location.
  await page.locator('#newBtn').dispatchEvent('click');
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
