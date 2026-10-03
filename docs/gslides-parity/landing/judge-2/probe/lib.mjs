import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire('/Users/kevinliu/repos/Turboslide-landing/package.json');
export const { chromium } = require('playwright-core');
export const CHROME =
  '/Users/kevinliu/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
export const ROOT = '/Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing';
export const OUT = '/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/judge2-landing/out';
export const url = (d) => `file://${ROOT}/direction-${d}/index.html`;
export const load = () => execSync("sysctl -n vm.loadavg | awk '{print $2}'").toString().trim();
export async function openPage({ d, width = 1440, height = 900, reduced = false, touch = false, theme = 'light' }) {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    colorScheme: theme,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    hasTouch: touch,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const requests = [];
  page.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) requests.push(r.url()); });
  await page.goto(url(d), { waitUntil: 'load' });
  return { browser, page, errors, requests };
}
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
