import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (process.argv.length !== 3 || !/^v[1-9]\d*$/.test(version ?? '')) {
  console.error('Usage: node scripts/render-social-image.mjs <version, e.g. v1>');
  process.exit(1);
}

const source = new URL('../assets/jifsaw-social.svg', import.meta.url);
const output = new URL(`../assets/jifsaw-social-${version}.png`, import.meta.url);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(source.href);
  await page.screenshot({ path: fileURLToPath(output) });
} finally {
  await browser.close();
}
