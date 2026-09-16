import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, request as playwrightRequest, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

import { loadThemeBundle } from '@turboslide/render/theme-node';
import { renderStandalone } from '@turboslide/render/standalone';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { standaloneRuntimeSource } from '@turboslide/viewer/standalone/source';

// MILESTONES-5 B1 acceptance, motion.spec.ts (gslides-parity SPEC-5 16.2; check step 33), on a
// scratch copy of decks/fixture/motion under decks/e2e-motion and the 4:3 fixture: the motion
// actions through the HTTP transport (the six writes and the compile, one revision each), the
// Motion panel through its entry points and controls in the editor, the show on the audience
// surface (the clicks per slide against the schedule, the first click revealing paragraph one,
// the fly, the transition's class held, Left reversing a step, Auto-play advancing a step then a
// slide, reduced motion collapsing the durations), the presenter window's "Step 2 of 4" and its
// next preview one step ahead, the pen's stroke reaching the other window, the auto video and the
// click audio, the standalone file with autoplay and loop opened from disk, and the Editable text
// file's round five line. The dev server is the builder's (PLAYWRIGHT_BASE_URL); the deck is
// trashed and removed afterwards.

const ROOT = join(import.meta.dirname, '..', '..', '..');

/**
 * The standalone motion script as classic JavaScript (packages/viewer/standalone/motion-source.ts
 * does the same; it is read here directly until `@turboslide/viewer` exports
 * `./standalone/motion-source`, b1.md request to the integrator).
 */
function standaloneMotionSource(): string {
  const source = readFileSync(join(ROOT, 'packages', 'viewer', 'standalone', 'motion.ts'), 'utf8');
  return stripTypeScriptTypes(source, { mode: 'strip' });
}

const DECK = `e2e-motion-${Date.now().toString(36)}`;
const FIXTURE = join(ROOT, 'decks', 'fixture', 'motion');
const AGENT = 'agent:e2e-motion';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4321';

/**
 * The schedule snapshot's click counts per fixture slide (build-5/b1.md day 1). The media slide
 * stays out of the scratch deck: a builder's dev server runs on the tmp store, whose only media
 * write is `media.insert` with a file, so the auto video and the click audio are the file store's
 * row (recorded as not driven here; B2's media.spec.ts drives the playback).
 */
const CLICKS: Record<string, number> = {
  't-none': 1,
  't-dissolve': 1,
  't-fade': 0,
  't-slide-right': 0,
  't-slide-left': 1,
  't-flip': 1,
  't-cube': 1,
  't-gallery': 0,
  effects: 6,
  paragraphs: 4,
};
const ORDER = Object.keys(CLICKS);

async function post<T>(
  request: APIRequestContext,
  action: string,
  body: unknown,
  deck: string = DECK,
): Promise<T> {
  const response = await request.post(`/api/actions/${action}?deck=${deck}`, {
    data: body,
    headers: { 'x-turboslide-author': AGENT },
  });
  const text = await response.text();
  if (!response.ok()) throw new Error(`${action}: ${response.status()} ${text}`);
  return JSON.parse(text) as T;
}

async function revision(request: APIRequestContext): Promise<number> {
  return (await post<{ revision: number }>(request, 'deck.info', {})).revision;
}

/** The scratch deck on the server's store: the blank template, then the fixture's slides in order through slide.insert. */
async function seedDeck(): Promise<void> {
  const request = await playwrightRequest.newContext({ baseURL: BASE_URL });
  try {
    // the dispatcher resolves the query's deck first; a collection write names an existing one
    const created = await post<{ revision: number }>(
      request,
      'deck.create',
      { name: 'Motion fixture (e2e)', from: 'blank', id: DECK },
      'gt-brand',
    );
    let base = created.revision;
    let after: string | undefined = 'title';
    for (const id of ORDER) {
      const slide = JSON.parse(
        readFileSync(join(FIXTURE, 'slides', `${id}.json`), 'utf8'),
      ) as Slide;
      const out = await post<{ revision: number }>(request, 'slide.insert', {
        sectionId: 'deck',
        after,
        slide,
        baseRevision: base,
      });
      base = out.revision;
      after = id;
    }
    await post(request, 'slide.remove', { slideId: 'title', baseRevision: base });
  } finally {
    await request.dispose();
  }
}

async function removeDeck(): Promise<void> {
  const request = await playwrightRequest.newContext({ baseURL: BASE_URL });
  try {
    const base = await revision(request);
    const trashed = await post<{ revision: number }>(request, 'deck.trash', {
      id: DECK,
      baseRevision: base,
    });
    await post(request, 'deck.remove', { id: DECK, confirm: true, baseRevision: trashed.revision });
  } catch {
    // the deck was never made
  } finally {
    await request.dispose();
  }
}

async function openAudience(page: Page): Promise<void> {
  await page.goto(`/deck/${DECK}?present=1`);
  const viewer = page.locator('.pt-viewer:not(.ts-skeleton)');
  await expect(viewer).toHaveAttribute('data-settled', '');
  await expect(viewer).toHaveClass(/is-present/);
  await expect(page.locator('.ts-slideshow')).toBeAttached();
}

async function openEditor(page: Page): Promise<void> {
  await page.goto(`/edit/${DECK}?author=${AGENT}`);
  await page.waitForFunction(() => {
    try {
      return Boolean(window.turboslide?.studio);
    } catch {
      return false;
    }
  });
  await expect(page.locator('.pt-viewer')).toHaveAttribute('data-settled', '');
}

const show = (page: Page) => page.locator('.ts-slideshow');

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await seedDeck();
});

test.afterAll(async () => {
  await removeDeck();
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      // private mode
    }
  });
});

test('the six motion actions and the compile over the HTTP transport, one revision each', async ({
  request,
}) => {
  const before = await revision(request);
  const compiled = await post<{ slideId: string; steps: unknown[]; hiddenAtStart: string[] }>(
    request,
    'motion.compile',
    { slideId: 'effects' },
  );
  expect(compiled.slideId).toBe('effects');
  expect(compiled.steps.length).toBe(CLICKS.effects! + 1);
  expect(compiled.hiddenAtStart).toEqual(['b1', 'b3', 'b5', 'b6', 'b7', 'b8', 'b13']);
  // set Fade at 500 ms on slide 2 and Apply to all slides; slide.list carries it on every slide
  const applied = await post<{ slideIds: string[]; revision: number }>(
    request,
    'motion.setTransition',
    {
      slideId: 't-dissolve',
      kind: 'fade',
      durationMs: 500,
      applyToAll: true,
      baseRevision: before,
    },
  );
  expect(applied.slideIds).toHaveLength(ORDER.length);
  expect(applied.slideIds).toEqual(ORDER);
  expect(applied.revision).toBe(before + 1);
  const rows = await post<{ id: string }[]>(request, 'slide.list', {});
  expect(rows.map((row) => row.id)).toEqual(ORDER);
  for (const id of ORDER) {
    const { slide } = await post<{ slide: Slide }>(request, 'slide.get', { slideId: id });
    expect(slide.transition).toEqual({ kind: 'fade', durationMs: 500 });
  }
  // add Fade in on click to a text box, tick By paragraph on the three paragraph box, add Fly in
  // from left with After previous on a shape, reorder, remove one
  const added = await post<{ ids: string[]; revision: number }>(request, 'motion.add', {
    slideId: 'paragraphs',
    blockIds: ['h'],
    effect: 'fadeIn',
    baseRevision: applied.revision,
  });
  expect(added.ids).toEqual(['a4']);
  const ticked = await post<{ animation: { byParagraph?: true }; revision: number }>(
    request,
    'motion.update',
    {
      slideId: 'paragraphs',
      animationId: 'a4',
      byParagraph: false,
      baseRevision: added.revision,
    },
  );
  expect(ticked.animation.byParagraph).toBeUndefined();
  const flown = await post<{ ids: string[]; revision: number }>(request, 'motion.add', {
    slideId: 'effects',
    blockIds: ['b1'],
    effect: 'flyIn',
    direction: 'left',
    trigger: 'afterPrevious',
    baseRevision: ticked.revision,
  });
  expect(flown.ids).toEqual(['a16']);
  const reordered = await post<{ animations: { id: string }[]; revision: number }>(
    request,
    'motion.reorder',
    {
      slideId: 'paragraphs',
      order: ['a4', 'a0', 'a1', 'a2', 'a3'],
      baseRevision: flown.revision,
    },
  );
  expect(reordered.animations.map((row) => row.id)).toEqual(['a4', 'a0', 'a1', 'a2', 'a3']);
  const removed = await post<{ removed: string[]; revision: number }>(request, 'motion.remove', {
    slideId: 'paragraphs',
    animationId: 'a4',
    baseRevision: reordered.revision,
  });
  expect(removed.removed).toEqual(['a4']);
  // back to the fixture's rows for the show: the transition rows stay as the fixture had them
  const restored = await post<{ revision: number }>(request, 'motion.remove', {
    slideId: 'effects',
    animationId: 'a16',
    baseRevision: removed.revision,
  });
  let base = restored.revision;
  const fixture: Record<string, { kind: string; durationMs: number }> = {
    't-dissolve': { kind: 'dissolve', durationMs: 500 },
    't-fade': { kind: 'fade', durationMs: 500 },
    't-slide-right': { kind: 'slideRight', durationMs: 1000 },
    't-slide-left': { kind: 'slideLeft', durationMs: 1000 },
    't-flip': { kind: 'flip', durationMs: 2000 },
    't-cube': { kind: 'cube', durationMs: 999 },
    't-gallery': { kind: 'gallery', durationMs: 5000 },
  };
  for (const id of ORDER) {
    const value = fixture[id] ?? { kind: 'none', durationMs: 500 };
    const out = await post<{ revision: number }>(request, 'motion.setTransition', {
      slideId: id,
      ...value,
      baseRevision: base,
    });
    base = out.revision;
  }
  expect(await revision(request)).toBe(base);
});

test('the Motion panel opens from its entry points and its controls write the actions', async ({
  page,
}) => {
  await openEditor(page);
  await page.evaluate(() =>
    window.turboslide!.studio.invoke('view.goto', { slideId: 'paragraphs' }),
  );
  // View > Motion
  await page.locator('[data-control="menubar.view"]').click();
  await page.locator('[data-menu-item="view.motion"]').click();
  const panel = page.locator('[data-control="panel.motion"]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.ts-panel-title')).toContainText('Motion');
  await expect(page.locator('[data-control="motion.transition.kind"]')).toHaveValue('none');
  await expect(page.locator('[data-control="motion.row.a1.toggle"]')).toContainText(
    'Fade in (On click)',
  );
  await panel.locator('[data-control="panel.motion.close"]').click();
  await expect(panel).toBeHidden();
  // Slide > Transition opens at the transition section; the toolbar button toggles it
  await page.locator('[data-control="menubar.slide"]').click();
  await page.locator('[data-menu-item="slide.transition"]').click();
  await expect(panel).toBeVisible();
  await page.locator('[data-control="toolbar.transition"]').click();
  await expect(panel).toBeHidden();
  await page.locator('[data-control="toolbar.transition"]').click();
  await expect(panel).toBeVisible();
  await expect(page.locator('[data-control="toolbar.transition"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // the kind writes the transition; the readout shows seconds
  await page.locator('[data-control="motion.transition.kind"]').selectOption('fade');
  await expect(page.locator('[data-control="motion.transition.duration.value"]')).toHaveText(
    '0.5 s',
  );
  const info = (await page.evaluate(() =>
    window.turboslide!.studio.invoke('slide.get', { slideId: 'paragraphs' }),
  )) as {
    slide: Slide;
  };
  expect(info.slide.transition).toEqual({ kind: 'fade', durationMs: 500 });
  // Alt+Down on the first row reorders
  await page.locator('[data-control="motion.row.a0.toggle"]').focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.locator('.ts-motion-row').first()).toHaveAttribute('data-animation', 'a1');
  // Insert > Animation with nothing selected: the panel opens and says what to do
  await page.locator('[data-control="menubar.insert"]').click();
  await page.locator('[data-menu-item="insert.animation"]').click();
  await expect(page.locator('[data-control="motion.add"]')).toHaveText(
    'Select an object to animate',
  );
  // Play reads Stop while the canvas plays, Esc returns to rest
  await page.locator('[data-control="motion.play"]').click();
  await expect(page.locator('[data-control="motion.play"]')).toContainText('Stop');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-control="motion.play"]')).toContainText('Play');
  // back to None so the show below reads the fixture
  await page.locator('[data-control="motion.transition.kind"]').selectOption('none');
  await page.locator('[data-control="motion.row.a1.toggle"]').focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.locator('.ts-motion-row').first()).toHaveAttribute('data-animation', 'a0');
});

test('the show plays the steps per slide against the schedule, reverses with Left, and holds the transition class', async ({
  page,
}) => {
  await openAudience(page);
  const surface = show(page);
  const body = page.locator('body');
  await expect(surface).toHaveAttribute('data-slide-id', 't-none');
  await expect(surface).toHaveAttribute('data-steps', '1');
  // the clicks per slide equal the schedule snapshot
  for (const id of ORDER) {
    await expect(surface).toHaveAttribute('data-slide-id', id);
    await expect(surface).toHaveAttribute('data-steps', String(CLICKS[id]));
    for (let k = 0; k < CLICKS[id]!; k += 1) {
      await body.press('ArrowRight');
      await expect(surface).toHaveAttribute('data-step', String(k + 1));
    }
    if (id !== ORDER[ORDER.length - 1]) await body.press('ArrowRight');
  }
  // the last slide, the last step: another Right stays
  await body.press('ArrowRight');
  await expect(surface).toHaveAttribute('data-slide-id', 'paragraphs');
  await expect(surface).toHaveAttribute('data-step', '4');
  // the paragraphs slide: the first click reveals paragraph one, the others stay hidden
  await page.evaluate(() =>
    window.turboslide!.studio.invoke('view.goto', { slideId: 'paragraphs' }),
  );
  await expect(surface).toHaveAttribute('data-slide-id', 'paragraphs');
  const paras = page.locator(
    '.ts-stagewrap.is-present [data-slide="paragraphs"] [data-block="para"] [data-para]',
  );
  await expect(paras).toHaveCount(3);
  await expect(paras.nth(0)).toHaveClass(/is-hidden/);
  await body.press('ArrowRight');
  await expect(surface).toHaveAttribute('data-step', '1');
  await expect(paras.nth(0)).not.toHaveClass(/is-hidden/);
  await expect(paras.nth(1)).toHaveClass(/is-hidden/);
  await expect(paras.nth(2)).toHaveClass(/is-hidden/);
  // Left reverses one step
  await body.press('ArrowLeft');
  await expect(surface).toHaveAttribute('data-step', '0');
  await expect(paras.nth(0)).toHaveClass(/is-hidden/);
  // the third click plays the list chain behind the third paragraph; the fourth hides the list
  for (let k = 0; k < 4; k += 1) await body.press('ArrowRight');
  await expect(surface).toHaveAttribute('data-step', '4');
  await expect(
    page.locator('.ts-stagewrap.is-present [data-slide="paragraphs"] [data-block="list"]'),
  ).toHaveClass(/is-hidden/);
  // going back from step 0 of a slide lands on the previous slide's last step
  await page.evaluate(() =>
    window.turboslide!.studio.invoke('view.goto', { slideId: 'paragraphs', step: 0 }),
  );
  await expect(surface).toHaveAttribute('data-step', '0');
  await body.press('ArrowLeft');
  await expect(surface).toHaveAttribute('data-slide-id', 'effects');
  await expect(surface).toHaveAttribute('data-step', '6');
  // a transition: Cube into t-cube holds is-entering on the incoming root for its duration (999 ms)
  await page.evaluate(() => window.turboslide!.studio.invoke('view.goto', { slideId: 't-flip' }));
  await expect(surface).toHaveAttribute('data-slide-id', 't-flip');
  await body.press('ArrowRight');
  await body.press('ArrowRight');
  await expect(surface).toHaveAttribute('data-slide-id', 't-cube');
  const stage = page.locator('.ts-stagewrap.is-present .ts-stage');
  await expect(stage).toHaveAttribute('data-transition', 't-cube');
  await expect(page.locator('.ts-stagewrap.is-present [data-slide="t-cube"]')).toHaveClass(
    /is-entering/,
  );
  await expect(stage).not.toHaveAttribute('data-transition', 't-cube', { timeout: 3000 });
  // Home lands on step 0 of the first slide
  await body.press('Home');
  await expect(surface).toHaveAttribute('data-slide-id', 't-none');
  await expect(surface).toHaveAttribute('data-step', '0');
});

test('Auto-play advances a step then a slide; a key pauses it; the pen draws and Esc clears', async ({
  page,
}) => {
  await openAudience(page);
  const surface = show(page);
  const body = page.locator('body');
  await page.locator('[data-control="present.options"]').click();
  const menu = page.getByRole('menu', { name: 'Options' });
  await menu.locator('[data-menu-item="present.options.autoPlay"]').hover();
  await page.locator('[data-menu-item="present.options.autoPlay.1000"]').click();
  await expect(surface).toHaveAttribute('data-autoplay', '1000');
  await expect(surface).toHaveAttribute('data-step', '1', { timeout: 3000 });
  await expect(surface).toHaveAttribute('data-slide-id', 't-dissolve', { timeout: 3000 });
  await body.press('ArrowLeft');
  await expect(surface).not.toHaveAttribute('data-autoplay', '1000');
  // the pen
  await body.press('p');
  await expect(surface).toHaveAttribute('data-pen', 'true');
  const pen = page.locator('[data-control="present.penLayer"]');
  await expect(pen).toBeVisible();
  const box = await page.locator('.ts-stagewrap.is-present .sheet').boundingBox();
  if (box === null) throw new Error('no sheet');
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4, { steps: 8 });
  await page.mouse.up();
  await expect(pen).toHaveAttribute('data-strokes', '1');
  await body.press('Escape');
  await expect(surface).not.toHaveAttribute('data-pen', 'true');
  await expect(page.locator('.pt-viewer')).toHaveClass(/is-present/);
});

test('the presenter window reads Step k of n, previews one step ahead and receives the pen’s stroke', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const audience = await context.newPage();
  await openAudience(audience);
  await audience.evaluate(() =>
    window.turboslide!.studio.invoke('view.goto', { slideId: 'effects' }),
  );
  const console_ = await context.newPage();
  await console_.goto(`/present/${DECK}`);
  const presenter = console_.locator('[data-control="presenter"]');
  await expect(presenter).toBeVisible();
  await expect(console_.locator('[data-control="presenter.connection"]')).toHaveAttribute(
    'data-connected',
    'true',
  );
  await expect(presenter).toHaveAttribute('data-steps', '6');
  await expect(console_.locator('[data-control="presenter.step"]')).toHaveText('Step 0 of 6');
  // the next preview is the current slide one step ahead
  const previews = console_.locator('.ts-presenter-preview .ts-presenter-frame');
  await expect(previews.nth(1)).toHaveAttribute('data-slide-id', 'effects');
  await expect(previews.nth(1)).toHaveAttribute('data-step', '1');
  // Next in the console advances a step in the audience
  await console_.locator('[data-control="presenter.next"]').click();
  await console_.locator('[data-control="presenter.next"]').click();
  await expect(show(audience)).toHaveAttribute('data-step', '2');
  await expect(console_.locator('[data-control="presenter.step"]')).toHaveText('Step 2 of 6');
  await expect(previews.nth(1)).toHaveAttribute('data-step', '3');
  // the audience's own click reaches the console
  await audience.locator('body').press('ArrowRight');
  await expect(console_.locator('[data-control="presenter.step"]')).toHaveText('Step 3 of 6');
  // after the last step the preview is the next slide at rest
  for (let k = 0; k < 3; k += 1) await audience.locator('body').press('ArrowRight');
  await expect(console_.locator('[data-control="presenter.step"]')).toHaveText('Step 6 of 6');
  await expect(previews.nth(1)).toHaveAttribute('data-slide-id', 'paragraphs');
  // view.goto with a step from the console lands the audience on that step
  await console_.evaluate(() =>
    window.turboslide!.studio.invoke('view.goto', { slideId: 'paragraphs', step: 2 }),
  );
  await expect(show(audience)).toHaveAttribute('data-slide-id', 'paragraphs');
  await expect(show(audience)).toHaveAttribute('data-step', '2');
  // the pen's stroke reaches the console
  await audience.locator('body').press('p');
  const box = await audience.locator('.ts-stagewrap.is-present .sheet').boundingBox();
  if (box === null) throw new Error('no sheet');
  await audience.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await audience.mouse.down();
  await audience.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.3, { steps: 6 });
  await audience.mouse.up();
  await expect(console_.locator('[data-control="present.penLayer"]')).toHaveAttribute(
    'data-strokes',
    '1',
  );
  await context.close();
});

test('reduced motion collapses the durations to zero and keeps the steps', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await openAudience(page);
  await page.evaluate(() => window.turboslide!.studio.invoke('view.goto', { slideId: 't-flip' }));
  const surface = show(page);
  await expect(surface).toHaveAttribute('data-slide-id', 't-flip');
  await page.locator('body').press('ArrowRight');
  await page.locator('body').press('ArrowRight');
  await expect(surface).toHaveAttribute('data-slide-id', 't-cube');
  // no transition attribute under reduced motion, the entry state applied at once
  await expect(page.locator('.ts-stagewrap.is-present .ts-stage')).not.toHaveAttribute(
    'data-transition',
    't-cube',
  );
  await expect(surface).toHaveAttribute('data-steps', '1');
  await expect(
    page.locator('.ts-stagewrap.is-present [data-slide="t-cube"] [data-block="obj"]'),
  ).toHaveClass(/is-hidden/);
  await page.locator('body').press('ArrowRight');
  await expect(
    page.locator('.ts-stagewrap.is-present [data-slide="t-cube"] [data-block="obj"]'),
  ).not.toHaveClass(/is-hidden|is-entering/);
  await context.close();
});

test.skip('the auto video plays on entry and the click audio waits for the click after the steps', () => {
  // not driven on a builder's dev server: the tmp store holds no media file for the scratch deck
  // (the fixture's bars-1s.webm and tone-1s.wav reach a deck through media.insert with a file,
  // which the tmp tier refuses); the row runs on the file store with decks/fixture/motion itself
  // and B2's media.spec.ts drives the playback rules (gslides-parity SPEC-5 16.2)
});

test('the standalone file plays the steps on the autoplay timer, restarts after the last slide, and the GT deck carries no motion', async ({
  page,
}) => {
  const bundle = loadThemeBundle();
  const load = (dir: string): { deck: Deck; slides: Slide[] } => {
    const deck = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as Deck;
    const slides = (deck.sections.flatMap((s) => s.slideIds) as string[]).map(
      (id) => JSON.parse(readFileSync(join(dir, 'slides', `${id}.json`), 'utf8')) as Slide,
    );
    return { deck, slides };
  };
  const motion = load(FIXTURE);
  const dir = mkdtempSync(join(tmpdir(), 'turboslide-motion-e2e-'));
  const runtime = standaloneRuntimeSource(motion.deck.title);
  const built = renderStandalone(motion.deck, motion.slides, {
    bundle,
    assetUris: {},
    runtime,
    motionScript: standaloneMotionSource(),
    autoplay: { intervalMs: 300, loop: true },
    media: 'poster',
  });
  const file = join(dir, 'motion.html');
  writeFileSync(file, built.html);
  await page.goto(`file://${file}`);
  await expect(page.locator('#stage')).toHaveAttribute('data-autoplay', '300');
  await page.waitForFunction(() =>
    Boolean((window as unknown as { __tsMotion?: unknown }).__tsMotion),
  );
  // the first slide's one click step plays on the timer, then the slide changes
  const first = page.locator('#stage .slide[data-slide="t-none"]');
  await expect(first).toHaveAttribute('data-step', '1', { timeout: 3000 });
  await expect(page.locator('#stage .slide.is-on')).toHaveAttribute('data-slide', 't-dissolve', {
    timeout: 3000,
  });
  // the show restarts after the last slide (the fixture has fifteen clicks over eleven slides)
  await expect(page.locator('#stage .slide.is-on')).toHaveAttribute('data-slide', 'media', {
    timeout: 20000,
  });
  await expect(page.locator('#stage .slide.is-on')).toHaveAttribute('data-slide', 't-none', {
    timeout: 5000,
  });
  // a key pauses the timer
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#stage')).not.toHaveAttribute('data-autoplay-running', '1');
  // the GT deck's file carries none of it
  const gt = load(join(ROOT, 'decks', 'gt-brand'));
  const still = renderStandalone(gt.deck, gt.slides, {
    bundle,
    assetUris: {},
    runtime,
    motionScript: standaloneMotionSource(),
  });
  // the still file carries neither motion element nor the motion script (the runtime's hook
  // names window.__tsMotion and finds nothing there)
  expect(still.html).not.toContain('id="ts-motion"');
  expect(still.html).not.toContain('bootMotion');
  const stillFile = join(dir, 'still.html');
  writeFileSync(stillFile, still.html);
  await page.goto(`file://${stillFile}`);
  await expect(page.locator('#stage .slide.is-on')).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { __tsMotion?: unknown }).__tsMotion === undefined,
    ),
  ).toBe(true);
  rmSync(dir, { recursive: true, force: true });
});

test('the Editable text file of the fixture carries one transition per slide and the effect nodes; the Perfect export reads perfect', async ({
  request,
}) => {
  const native = await post<{
    passed: boolean;
    residual: string[];
    motion?: { transitions: number; animations: number };
  }>(request, 'export.run', {
    format: 'pptx',
    mode: 'native',
    theme: ['light'],
    verify: false,
  });
  expect(native.passed).toBe(true);
  expect(native.residual.some((line) => line.startsWith('motion: 7 transition(s) and'))).toBe(true);
  const flatten = await post<{ perfect: boolean; motion?: unknown }>(request, 'export.run', {
    format: 'pptx',
    mode: 'flatten',
    theme: ['light'],
    verify: false,
  });
  expect(flatten.perfect).toBe(true);
  expect(flatten.motion).toBeUndefined();
});
