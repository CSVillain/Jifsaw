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

  await page.locator('#newBtn').click();
  await expect(page.locator('#setup')).not.toHaveClass(/hidden/);

  const leftoverPieces = await page.locator('.piece').count();
  expect(leftoverPieces).toBe(0);
});
