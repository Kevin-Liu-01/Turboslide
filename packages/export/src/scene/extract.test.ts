// The export's pages on the single-process serverless shell (docs/hosting-chromium.md section 3b):
// every hosted native export answered 502 because the 3x shot page for icons and marks was opened
// raw and closed its context, which kills chrome-headless-shell under --single-process. The guard
// lives in openSheetPage's close, so this test flags a real Chrome for Testing browser the way
// launchBrowser flags the serverless shell and runs one slide in native mode through
// extractScenes: the 1x, 2x and 3x contexts must all stay open on the flagged browser, and the
// same run on an unflagged browser must close them. Runs where the binary and the deck exist;
// TURBOSLIDE_SKIP_BROWSER_TESTS=1 skips it. One browser at a time (AGENTS.md).
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { Deck, Slide } from '@turboslide/schema/deck';
import { slideOrder } from '@turboslide/schema/deck';
import {
  isSingleProcessBrowser,
  launchBrowser,
  markSingleProcessBrowser,
  resolveExecutable,
} from '@turboslide/headless/launch';
import type { LaunchedBrowser } from '@turboslide/headless/launch';

import { extractScenes } from './extract.ts';
import type { ExtractResult } from './extract.ts';

const REPO = resolve(import.meta.dirname, '../../../..');
const DECK_DIR = join(REPO, 'decks/gt-brand');
const skip =
  process.env.TURBOSLIDE_SKIP_BROWSER_TESTS === '1' ||
  !existsSync(resolveExecutable().path) ||
  !existsSync(join(DECK_DIR, 'deck.json'));

/** Slide 08 (`audience`): text, a diagram and a ruled table with icons, so `auto` needs the 3x page. */
function loadSlide(): { deck: Deck; slides: Record<string, Slide>; id: string } {
  const deck = JSON.parse(readFileSync(join(DECK_DIR, 'deck.json'), 'utf8')) as Deck;
  const id = slideOrder(deck)[7] ?? '';
  const slide = JSON.parse(readFileSync(join(DECK_DIR, 'slides', `${id}.json`), 'utf8')) as Slide;
  return { deck, slides: { [id]: slide }, id };
}

describe.skipIf(skip)('extractScenes on a single-process browser', () => {
  let out = '';
  const { deck, slides, id } = loadSlide();

  beforeAll(async () => {
    out = await mkdtemp(join(tmpdir(), 'turboslide-extract-test-'));
  });

  afterAll(async () => {
    await rm(out, { recursive: true, force: true });
  });

  async function nativeSlide(launched: LaunchedBrowser, workDir: string): Promise<ExtractResult> {
    return extractScenes({
      deckDir: DECK_DIR,
      document: { deck, slides },
      themes: ['light'],
      mode: 'native',
      slideIds: [id],
      workDir,
      browser: launched,
    });
  }

  test('the slide is audience and native auto mode uses the 3x page', () => {
    expect(id).toBe('audience');
  });

  test('an unflagged browser closes the 1x, 2x and 3x contexts when the theme is done', async () => {
    const launched = await launchBrowser();
    try {
      expect(isSingleProcessBrowser(launched.browser)).toBe(false);
      const result = await nativeSlide(launched, join(out, 'regular'));
      expect(result.scenes).toHaveLength(1);
      expect(result.scenes[0]?.rasters.some((r) => r.scale === 3)).toBe(true);
      expect(launched.browser.contexts()).toHaveLength(0);
    } finally {
      await launched.close();
    }
  }, 120_000);

  test('a browser flagged single-process keeps every context open, the 3x one included', async () => {
    const launched = await launchBrowser();
    try {
      markSingleProcessBrowser(launched.browser);
      expect(isSingleProcessBrowser(launched.browser)).toBe(true);
      const result = await nativeSlide(launched, join(out, 'single'));
      expect(result.scenes).toHaveLength(1);
      expect(result.scenes[0]?.rasters.some((r) => r.scale === 3)).toBe(true);
      // one theme: the 1x measure page, the 2x and the 3x shot pages, none closed
      const scales = launched.browser
        .contexts()
        .map((context) => context.pages()[0]?.viewportSize()?.width ?? 0);
      expect(launched.browser.contexts()).toHaveLength(3);
      expect(scales).toEqual([1600, 1600, 1600]);
    } finally {
      // Chrome for Testing closes cleanly; only the serverless shell is killed by pid
      await launched.close();
    }
  }, 120_000);
});
