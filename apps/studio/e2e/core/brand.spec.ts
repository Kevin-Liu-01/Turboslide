import { createHash } from 'node:crypto';
import { brotliDecompressSync } from 'node:zlib';

import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import {
  PRODUCTION_WRITE_SKIP,
  Scratch,
  addSlide,
  agentBearer,
  coverage,
  ctl,
  download,
  extraHTTPHeaders,
  isLocalBase,
  isProductionBase,
  headingRun,
  invoke,
  menuPath,
  newDeck,
  openEditor,
  ownerContext,
  placeBlock,
  pdfStreams,
  pngBytes,
  settled,
  state,
  teardownAll,
  title,
  waitEditor,
  sweepTemplateLeftovers,
  slideOrder,
  clickCard,
  zipEntries,
} from './lib';

// The brand kit and the templates, the spec rows (docs/archive/rounds/PRODUCT.md 4.1 to 4.3, 8.1 `templates.*`,
// `brand.logo.replace-every-slide` and `fonts.budget.no-load-before-ready` with the driver
// core/brand.spec.ts): the rows the walk probe cannot drive in one tab: the file chooser of the
// kit's Logo > Replace, the network (no catalog woff2 before the ready mark), the window API's
// refusal on a template, and the gallery page with Save as template, the same name replacing,
// Rename and Delete from the card menu and Use for new presentations with its restore. One
// context for the file; every deck it makes is torn down through the product, and a template it
// saves is deleted from the gallery's card menu at the end (a template is a deck under
// decks/templates and a listing line; nothing else removes it).
//
// The panel, the dialog and the page are B5a's and B5b's this round (PRODUCT.md 7.1). A row
// whose control is not on the build is skipped with the control's id, which the gate reads as not
// driven with that reason (8.1: "a row of a control that does not exist is not driven").
//
// The default template (VERIFICATION.md "Polish round, pass 1" finding 3): on 2026-09-28 a
// preview run without a bearer for its origin set the shared store's default to this file's
// template, the page path timed out on the blob tier and production's /new opened as "Brand spec
// deck" until a hand reset. So `templates.default.use-for-new` reads the store's default through
// the agent surface before its write and is not driven where the surface does not answer (no
// bearer off localhost; the open localhost surface answers without one); the default it found
// goes back through `template.setDefault` after the page's own restore, in the row and again in
// the teardown, and a read after each says whether it is. The row never writes what the run
// cannot put back.
//
// PLAYWRIGHT_BASE_URL=<origin> node_modules/.bin/playwright test apps/studio/e2e/core/brand.spec.ts

const scratch = new Scratch();
/** The base the run drives (playwright.config.ts's baseURL); the production guard reads it. */
const BASE = (process.env['PLAYWRIGHT_BASE_URL'] ?? '').replace(/\/$/, '');

let context: BrowserContext;
let page: Page;
let deck = '';
const STAMP = Date.now().toString(36);
/** The name every run of this file gives its template, before the run's stamp; the sweep at the end reads it. */
const TEMPLATE_PREFIX = 'Core spec template ';
const TEMPLATE_NAME = `${TEMPLATE_PREFIX}${STAMP}`;
/** The slug of the template this file saved, for its removal at the end. */
let savedSlug: string | null = null;
/** The store's default template id as this file found it before its write, to put back; null while this file set none or once it is back. */
let defaultToRestore: string | null = null;
/** The reason the default row is not driven where the agent surface cannot put the default back. */
const DEFAULT_NO_RESET_SKIP =
  'not driven: the row sets the default template of a store every deployment shares and puts it back through the agent surface, which did not answer; off localhost that needs a bearer for this origin (TURBOSLIDE_TOKEN or ~/.config/turboslide/hosts.json)';
const PRIMARY = '#0b3d91';

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  ({ context, page } = await ownerContext(browser));
  deck = await newDeck(page, scratch, 'Brand spec deck');
  await addSlide(page);
});
/**
 * One agent action through the surface, with the bearer off localhost (the open localhost
 * surface takes none): the status, the parsed body and the reason for anything but 200. A
 * deployment without a bearer for its origin answers status 0 and the reason, and sends nothing.
 */
async function surfacePost(
  action: string,
  input: unknown,
): Promise<{ status: number; body: Record<string, unknown> | null; reason: string }> {
  const bearer = agentBearer(BASE);
  if (bearer === null && !isLocalBase(BASE))
    return { status: 0, body: null, reason: 'no bearer for this origin' };
  try {
    const r = await fetch(new URL(`/api/actions/${action}`, BASE), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(bearer === null ? {} : { authorization: `Bearer ${bearer}` }),
        ...extraHTTPHeaders,
      },
      body: JSON.stringify(input),
    });
    const body = r.ok
      ? ((await r.json().catch(() => null)) as Record<string, unknown> | null)
      : null;
    return { status: r.status, body, reason: r.ok ? '' : `${action} answered ${r.status}` };
  } catch (error) {
    return {
      status: 0,
      body: null,
      reason: `${action}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
    };
  }
}
/** The store's default template id through `template.list` (the answer's `default`), or null with the reason. */
async function readDefaultThroughApi(): Promise<{ id: string | null; reason: string }> {
  const r = await surfacePost('template.list', {});
  if (r.status !== 200) return { id: null, reason: r.reason };
  const raw =
    r.body?.['default'] ?? (r.body?.['output'] as { default?: unknown } | undefined)?.default;
  return typeof raw === 'string' && raw !== ''
    ? { id: raw, reason: '' }
    : { id: null, reason: 'template.list answered without a default' };
}
/** `template.setDefault` through the surface; true when the answer reads the id. */
async function setDefaultThroughApi(id: string): Promise<boolean> {
  const r = await surfacePost('template.setDefault', { id });
  if (r.status !== 200) return false;
  const raw =
    r.body?.['default'] ?? (r.body?.['output'] as { default?: unknown } | undefined)?.default;
  return raw === id;
}
/**
 * The store's default back as this file found it, through the surface (the page's own restore,
 * the row's last step, goes before it): a read first, `template.setDefault` where the read
 * differs (the page path once more when the target is Blank and the surface refused), then a
 * read again. Answers null when the default reads as found and clears `defaultToRestore`; else
 * the sentence for the failures list, with `defaultToRestore` kept for the teardown's attempt.
 * The page path alone timed out on 2026-09-25 (hotfix.md 16) and on 2026-09-28 (the polish
 * round's pass 1, finding 3), each time leaving a test deck as production's default.
 */
async function putDefaultBack(): Promise<string | null> {
  if (defaultToRestore === null) return null;
  const target = defaultToRestore;
  let now = await readDefaultThroughApi();
  if (now.id !== target) {
    const set = await setDefaultThroughApi(target);
    if (!set && target === 'blank') await restoreBlankDefault().catch(() => undefined);
    now = await readDefaultThroughApi();
  }
  if (now.id === target) {
    defaultToRestore = null;
    return null;
  }
  return `the deployment default reads ${now.id ?? `unread (${now.reason})`}, not ${target}`;
}

test.afterAll(async () => {
  test.setTimeout(300_000);
  const failures: string[] = [];
  try {
    if (defaultToRestore !== null) {
      try {
        const left = await putDefaultBack();
        if (left !== null) failures.push(left);
      } catch (error) {
        failures.push(
          `the deployment default: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
        );
      }
    }
    if (savedSlug !== null) {
      try {
        await deleteTemplate(savedSlug);
      } catch (error) {
        failures.push(
          `the template ${savedSlug}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
        );
      }
    }
    /* the templates earlier runs of this file left on the shared store, cut between their save
       and their delete (VERIFICATION.md "Vector round, pass 1" finding 3): every card of this
       file's name older than the sweep's age, and this run's own whatever its age (the card menu
       step above finds no card on an instance whose index is behind the store), through the
       agent surface; best effort, one line */
    const swept = await sweepTemplateLeftovers(
      (process.env['PLAYWRIGHT_BASE_URL'] ?? '').replace(/\/$/, ''),
      TEMPLATE_PREFIX,
      { own: STAMP },
    );
    if (swept.removed.length > 0 || swept.reason !== null) {
      console.log(
        `brand.spec: leftover templates ${swept.removed.length > 0 ? `removed ${swept.removed.join(', ')}` : 'none removed'}${swept.reason === null ? '' : ` (${swept.reason})`}`,
      );
    }
    await teardownAll(page, scratch);
  } finally {
    await context.close();
  }
  expect(failures, 'the template and the default this file made are gone').toEqual([]);
});

/** Whether a control is drawn now. */
async function drawn(p: Page, control: string): Promise<boolean> {
  return ctl(p, control)
    .isVisible()
    .catch(() => false);
}
/** Turns Tools > Advanced tools on when a menubar row is absent; answers whether the row is there. */
async function reachRow(p: Page, menuId: string, ...rowIds: string[]): Promise<boolean> {
  const present = async () => {
    await ctl(p, `menubar.${menuId}`).click();
    await p.locator(`#ts-menu-${menuId}`).waitFor({ timeout: 8000 });
    for (let i = 0; i < rowIds.length - 1; i += 1) {
      const row = ctl(p, `menu.${rowIds[i]}`);
      if ((await row.count()) === 0) break;
      await row.hover();
      await p.waitForTimeout(350);
    }
    const there = await ctl(p, `menu.${rowIds[rowIds.length - 1]}`)
      .isVisible()
      .catch(() => false);
    await p.keyboard.press('Escape');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(150);
    return there;
  };
  if (await present()) return true;
  if ((await state(p)).settings?.['advancedTools'] !== true) {
    await menuPath(p, 'tools', 'tools.advancedTools');
    await p.waitForTimeout(300);
    const there = await present();
    /* the switch goes back when the row is not there either, so the file leaves it as found */
    if (!there) await menuPath(p, 'tools', 'tools.advancedTools').catch(() => undefined);
    return there;
  }
  return present();
}
/** The gallery page, hydrated. */
async function gotoGallery(p: Page = page): Promise<void> {
  await p.goto('/decks/templates');
  await p
    .waitForSelector(
      '[data-control="templates.page"][data-hydrated], [data-control="templates.page"]',
      {
        timeout: 30_000,
      },
    )
    .catch(() => undefined);
  await p.waitForTimeout(500);
}
/** The organisation cards on the gallery page, by slug, with their names. */
async function organisationCards(p: Page = page): Promise<{ slug: string; name: string }[]> {
  return p.evaluate(() => {
    const group = document.querySelector('[data-control="templates.group.organisation"]');
    return [...(group?.querySelectorAll('[data-control^="templates.card."]') ?? [])]
      .filter((el) => /^templates\.card\.[^.]+$/.test(el.getAttribute('data-control') ?? ''))
      .map((el) => ({
        slug: (el.getAttribute('data-control') ?? '').replace('templates.card.', ''),
        /* the card's name element: the card's text begins with its cover, a live clone of the
           slide, since the product round (decks.templates.tsx) */
        name:
          el.querySelector('[data-control$=".name"]')?.textContent?.trim() ??
          el.textContent?.trim().slice(0, 80) ??
          '',
      }));
  });
}
/** The template this file saved, on the gallery page, by its name. */
async function savedCard(): Promise<{ slug: string; name: string } | null> {
  const cards = await organisationCards();
  return (
    cards.find(
      (c) => c.name.includes(TEMPLATE_NAME) || c.name.includes(`${TEMPLATE_NAME} renamed`),
    ) ?? null
  );
}
/** Deletes a template from its card menu on the gallery page, through the product. */
/* the card menu's rows carry the chrome Menu's `menu.` prefix, as every menu row does
   (Menu.tsx `menu.${item.id}`; the trigger alone is `templates.card.<slug>.menu`) */
async function deleteTemplate(slug: string): Promise<void> {
  await gotoGallery();
  const card = ctl(page, `templates.card.${slug}`);
  if ((await card.count()) === 0) return;
  await ctl(page, `templates.card.${slug}.menu`).click();
  await ctl(page, `menu.templates.card.${slug}.delete`).click();
  const confirm = page
    .locator(
      '.ts-dialog-scrim [role="dialog"] button.is-solid, [data-control$=".confirm.ok"], [data-control="dialog.deleteTemplate.ok"]',
    )
    .first();
  await confirm.click({ timeout: 8000 });
  await expect(card).toHaveCount(0, { timeout: 20_000 });
  if (savedSlug === slug) savedSlug = null;
}
/** Use for new presentations on Blank, from its card menu (the page path; `putDefaultBack` reads whether it landed). */
async function restoreBlankDefault(): Promise<void> {
  await gotoGallery();
  await ctl(page, 'templates.card.blank.menu').click();
  await ctl(page, 'menu.templates.card.blank.useForNew').click();
  await expect(ctl(page, 'templates.card.blank.default')).toBeVisible({ timeout: 10_000 });
}
/** Saves the file's deck as a template with the file's name; answers the dialog's facts. */
async function saveAsTemplate(): Promise<{ replaceSentence: string | null }> {
  await openEditor(page, deck);
  await menuPath(page, 'file', 'file.saveAsTemplate');
  await ctl(page, 'dialog.saveAsTemplate').waitFor({ timeout: 8000 });
  const name = ctl(page, 'dialog.saveAsTemplate.name');
  await name.click();
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(TEMPLATE_NAME, { delay: 40 });
  const sentence = ctl(page, 'dialog.saveAsTemplate.sentence');
  if ((await sentence.count()) > 0) {
    await sentence.click();
    await page.keyboard.press('Meta+a');
    await page.keyboard.type('A deck the core spec saved as a template', { delay: 30 });
  }
  await page.waitForTimeout(400);
  const replaceSentence = await ctl(page, 'dialog.saveAsTemplate.replaceSentence')
    .textContent({ timeout: 1000 })
    .catch(() => null);
  await ctl(page, 'dialog.saveAsTemplate.save').click();
  await expect(ctl(page, 'dialog.saveAsTemplate')).toHaveCount(0, { timeout: 30_000 });
  return { replaceSentence };
}
/** The kit record of the open deck. */
async function record(p: Page): Promise<Record<string, unknown> | null> {
  const info = await invoke<{ brand?: Record<string, unknown> }>(p, 'deck.info');
  return info.brand ?? null;
}

/**
 * The GT glyph the editor draws for the current slide: `<use href="#gt-mark">` on the stage and in
 * the filmstrip's cards (the sprite's own `<symbol>` is no drawing), and a drawn `.wordmark`.
 */
async function gtMarksDrawn(
  p: Page,
): Promise<{ stage: number; filmstrip: number; wordmark: number }> {
  return p.evaluate(() => {
    const uses = (root: Element | null) =>
      root === null
        ? 0
        : [...root.querySelectorAll('use')].filter((use) => {
            const href = use.getAttribute('href') ?? use.getAttribute('xlink:href') ?? '';
            return href === '#gt-mark' && use.closest('symbol') === null;
          }).length;
    const stage = document.querySelector('.ts-stagewrap.ts-editor .ts-stage');
    const cards = [...document.querySelectorAll('[data-control^="filmstrip.slide."]')];
    const wordmarks = [...(stage?.querySelectorAll('.wordmark') ?? [])].filter(
      (el) => el.getClientRects().length > 0 && el.children.length > 0,
    );
    return {
      stage: uses(stage),
      filmstrip: cards.reduce((sum, card) => sum + uses(card), 0),
      wordmark: wordmarks.length,
    };
  });
}
/** The fill operators of a PDF's page streams: a drawn GT glyph is one more filled path per page. */
function pdfFills(bytes: Buffer): number {
  return (pdfStreams(bytes).match(/(?:^|\s)(?:f\*?|B\*?|b\*?)(?=\s|$)/gm) ?? []).length;
}
/** The GT glyph's objects in a PowerPoint: the master's wordmark and the title mark's picture. */
function pptxGtObjects(bytes: Buffer): string[] {
  const out: string[] = [];
  for (const [name, read] of zipEntries(bytes)) {
    if (!/^ppt\/(slides|slideMasters|slideLayouts)\/[^/]+\.xml$/.test(name)) continue;
    const xml = read();
    for (const m of xml.matchAll(/(?:name|descr)="([^"]*)"/g)) {
      const value = m[1] ?? '';
      if (/#wordmark|GT wordmark|^(?:word)?mark \(mark\)$/.test(value))
        out.push(`${name}: ${value}`);
    }
  }
  return out;
}
/** One file through File > Download > More formats > Download options with PDF or PowerPoint (native) picked. */
async function downloadAs(p: Page, kind: 'pdf' | 'pptx'): Promise<Buffer> {
  await menuPath(p, 'file', 'file.download', 'file.download.more', 'file.download.options');
  if (kind === 'pdf') {
    await ctl(p, 'dialog.download.type.pdf').click({ timeout: 8000 });
    await ctl(p, 'dialog.download.pdf').waitFor({ timeout: 8000 });
  } else {
    await ctl(p, 'dialog.download.pptx').waitFor({ timeout: 8000 });
    await ctl(p, 'dialog.download.mode.native').click({ force: true });
  }
  const file = await download(p, () => ctl(p, 'dialog.download.ok').click(), 120_000);
  for (let i = 0; i < 3; i += 1) {
    if ((await p.locator('.ts-dialog-scrim [role="dialog"]').count()) === 0) break;
    const done = p.locator(
      '[data-control="dialog.download.done"], [data-control="dialog.download.close"], [data-control="dialog.download.cancel"]',
    );
    if ((await done.count()) > 0)
      await done
        .first()
        .click({ timeout: 3000 })
        .catch(() => undefined);
    else await p.keyboard.press('Escape');
    await p.waitForTimeout(200);
  }
  return file.bytes;
}

/*
 * docs/NEXT.md 3.2 H6 (audit-brand-surfaces 27): the file's deck comes from /new, the Blank
 * template, with a second slide (beforeAll), and this row reads it before any row writes its kit.
 * The editor draws no GT glyph on either slide, on the stage or in the filmstrip, and no wordmark;
 * the PDF and the native PowerPoint carry none. The control proves the reads can see the glyph:
 * the kit's default logo (the GT mark) set for a moment adds filled paths to the PDF and the
 * wordmark and mark objects to the PowerPoint, and the record goes back to none.
 */
test(title('brand.template.blank-no-gt-mark'), async () => {
  test.setTimeout(480_000);
  await openEditor(page, deck);
  const kit = await record(page);
  const slides = await slideOrder(page);
  const drawn: { slide: string; stage: number; filmstrip: number; wordmark: number }[] = [];
  for (const slide of slides) {
    await clickCard(page, slide);
    await page.waitForTimeout(500);
    drawn.push({ slide, ...(await gtMarksDrawn(page)) });
  }
  const pdfNone = await downloadAs(page, 'pdf');
  const pptxNone = await downloadAs(page, 'pptx');
  /* the control: the GT mark as the kit's logo in both slots, read, then none again */
  const s1 = await settled(page);
  await invoke(page, 'brand.set', {
    path: '/mark',
    value: { kind: 'default' },
    baseRevision: s1.revision,
  });
  const s2 = await settled(page);
  await invoke(page, 'brand.set', {
    path: '/footer/logo',
    value: 'default',
    baseRevision: s2.revision,
  });
  await settled(page);
  await clickCard(page, slides[0]!);
  await page.waitForTimeout(500);
  const controlDrawn = await gtMarksDrawn(page);
  let pdfGt: Buffer | null = null;
  let pptxGt: Buffer | null = null;
  try {
    pdfGt = await downloadAs(page, 'pdf');
    pptxGt = await downloadAs(page, 'pptx');
  } finally {
    const s3 = await settled(page);
    await invoke(page, 'brand.set', {
      path: '/mark',
      value: { kind: 'none' },
      baseRevision: s3.revision,
    }).catch(() => undefined);
    const s4 = await settled(page);
    await invoke(page, 'brand.set', {
      path: '/footer/logo',
      value: 'none',
      baseRevision: s4.revision,
    }).catch(() => undefined);
    await settled(page);
  }
  const fills = { none: pdfFills(pdfNone), gt: pdfFills(pdfGt) };
  const objects = { none: pptxGtObjects(pptxNone), gt: pptxGtObjects(pptxGt) };
  test.info().annotations.push({
    type: 'blank',
    description: `record ${JSON.stringify(kit)}; the editor per slide ${drawn.map((d) => `${d.slide}: stage ${d.stage}, filmstrip ${d.filmstrip}, wordmark ${d.wordmark}`).join('; ')}; with the GT logo set the title slide drew stage ${controlDrawn.stage}; PDF fills ${fills.none} against ${fills.gt} with the GT logo; PowerPoint GT objects ${objects.none.length} (${objects.none.join(', ') || 'none'}) against ${objects.gt.length} (${objects.gt.slice(0, 4).join(', ')})`,
  });
  expect((kit?.['mark'] as { kind?: string } | undefined)?.kind, 'the record names no mark').toBe(
    'none',
  );
  for (const d of drawn) {
    expect(d.stage, `no GT glyph on the stage of ${d.slide}`).toBe(0);
    expect(d.filmstrip, `no GT glyph in the filmstrip with ${d.slide} open`).toBe(0);
    expect(d.wordmark, `no wordmark on ${d.slide}`).toBe(0);
  }
  expect(controlDrawn.stage, 'the control: the GT logo set draws the glyph').toBeGreaterThan(0);
  expect(fills.gt, 'the control: the GT logo adds filled paths to the PDF').toBeGreaterThan(
    fills.none,
  );
  expect(objects.gt.length, 'the control: the GT logo is in the PowerPoint').toBeGreaterThan(0);
  expect(objects.none, 'no GT wordmark or mark in the PowerPoint').toEqual([]);
});

/**
 * What the editor draws of the GT frame on the current slide: the rails (`.frame::before` and
 * `::after`), the rules and the crosses as drawn boxes on the stage and in the filmstrip's cards,
 * and the stage's counter words. A part is drawn when it computes a display other than none and
 * has a box.
 */
async function frameDrawnInEditor(p: Page): Promise<{
  stage: { rails: number; rules: number; crosses: number };
  cards: { rails: number; rules: number; crosses: number };
  counter: string;
}> {
  return p.evaluate(() => {
    const shown = (el: Element, pseudo?: string) => {
      const cs = getComputedStyle(el, pseudo);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (pseudo !== undefined) return cs.content !== 'none' && parseFloat(cs.width) > 0;
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    };
    const parts = (roots: Element[]) => {
      let rails = 0;
      let rules = 0;
      let crosses = 0;
      for (const root of roots)
        for (const frame of root.querySelectorAll('.frame')) {
          if (shown(frame, '::before')) rails += 1;
          if (shown(frame, '::after')) rails += 1;
          rules += [...frame.querySelectorAll('.rule')].filter((el) => shown(el)).length;
          crosses += [...frame.querySelectorAll('.cross')].filter((el) => shown(el)).length;
        }
      return { rails, rules, crosses };
    };
    const stage = document.querySelector('.ts-stagewrap.ts-editor .ts-stage');
    const cards = [...document.querySelectorAll('[data-control^="filmstrip.slide."]')];
    const counter = [...(stage?.querySelectorAll('.counter') ?? [])]
      .filter((el) => shown(el))
      .map((el) => el.textContent?.trim() ?? '')
      .join(' ')
      .trim();
    return { stage: parts(stage === null ? [] : [stage]), cards: parts(cards), counter };
  });
}
/** The PowerPoint's frame lines, crosses and counter runs: the masters' and every slide's objects. */
function pptxFrameObjects(bytes: Buffer): { frame: string[]; counter: string[] } {
  const frame: string[] = [];
  const counter: string[] = [];
  for (const [name, read] of zipEntries(bytes)) {
    if (!/^ppt\/(slides|slideMasters|slideLayouts)\/[^/]+\.xml$/.test(name)) continue;
    const xml = read();
    for (const m of xml.matchAll(/name="([^"]*)"/g)) {
      const value = m[1] ?? '';
      if (/(?:^|#|\/)(?:frame|cross)\/\d/.test(value)) frame.push(`${name}: ${value}`);
    }
    for (const m of xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)) {
      const text = (m[1] ?? '').trim();
      if (/^\d{2} \/ \d{2}$/.test(text)) counter.push(`${name}: ${text}`);
    }
  }
  return { frame, counter };
}
/** The text show operators of a PDF's page streams: a drawn counter is one more run per page. */
function pdfTextRuns(bytes: Buffer): number {
  return (pdfStreams(bytes).match(/(?:^|\s)(?:Tj|TJ)(?=\s|$)/gm) ?? []).length;
}

/*
 * docs/NEXT.md 4.1.3 item 23 (brand-judge-2 178): a deck from /new, the Blank template, with a
 * second slide, and its slide is plain: no rail, rule or cross of the GT frame and no counter on
 * the stage or in the filmstrip on either slide, and none in the PDF or the native PowerPoint.
 * The control proves the reads can see them: the kit's frame and counter turned on for a moment
 * draw them in the editor, add filled paths and text runs to the PDF and frame objects and
 * counter runs to the PowerPoint; the record goes back to off. The row makes its own deck in its
 * own context: its four downloads and the four of `brand.template.blank-no-gt-mark` would pass
 * an anonymous person's five exports a day (server/ratelimit.ts `exportsPerDay`) on one identity.
 */
test(title('brand.template.blank-plain'), async ({ browser }) => {
  test.setTimeout(480_000);
  const own = await ownerContext(browser);
  const ownScratch = new Scratch();
  try {
    await blankPlainRow(own.page, ownScratch);
  } finally {
    await teardownAll(own.page, ownScratch).catch(() => undefined);
    await own.context.close();
  }
});

async function blankPlainRow(page: Page, ownScratch: Scratch): Promise<void> {
  const deck = await newDeck(page, ownScratch, 'Blank plain deck');
  await addSlide(page);
  await openEditor(page, deck);
  const kit = await record(page);
  const slides = await slideOrder(page);
  const drawn: { slide: string; read: Awaited<ReturnType<typeof frameDrawnInEditor>> }[] = [];
  for (const slide of slides) {
    await clickCard(page, slide);
    await page.waitForTimeout(500);
    drawn.push({ slide, read: await frameDrawnInEditor(page) });
  }
  const pdfPlain = await downloadAs(page, 'pdf');
  const pptxPlain = await downloadAs(page, 'pptx');
  /* the control: the GT frame and the counter on, read, then off again */
  const s1 = await settled(page);
  await invoke(page, 'brand.set', {
    path: '/frame',
    value: { rails: true, rules: true, crosses: true },
    baseRevision: s1.revision,
  });
  const s2 = await settled(page);
  await invoke(page, 'brand.set', {
    path: '/counter',
    value: { show: true },
    baseRevision: s2.revision,
  });
  await settled(page);
  await clickCard(page, slides[1] ?? slides[0]!);
  await page.waitForTimeout(500);
  const controlDrawn = await frameDrawnInEditor(page);
  let pdfFramed: Buffer | null = null;
  let pptxFramed: Buffer | null = null;
  try {
    pdfFramed = await downloadAs(page, 'pdf');
    pptxFramed = await downloadAs(page, 'pptx');
  } finally {
    const s3 = await settled(page);
    await invoke(page, 'brand.set', {
      path: '/frame',
      value: { rails: false, rules: false, crosses: false },
      baseRevision: s3.revision,
    }).catch(() => undefined);
    const s4 = await settled(page);
    await invoke(page, 'brand.set', {
      path: '/counter',
      value: { show: false },
      baseRevision: s4.revision,
    }).catch(() => undefined);
    await settled(page);
  }
  const pdf = {
    fills: { plain: pdfFills(pdfPlain), framed: pdfFills(pdfFramed) },
    text: { plain: pdfTextRuns(pdfPlain), framed: pdfTextRuns(pdfFramed) },
  };
  const pptx = { plain: pptxFrameObjects(pptxPlain), framed: pptxFrameObjects(pptxFramed) };
  test.info().annotations.push({
    type: 'blank-plain',
    description: `record ${JSON.stringify(kit)}; the editor per slide ${drawn.map((d) => `${d.slide}: stage ${JSON.stringify(d.read.stage)}, cards ${JSON.stringify(d.read.cards)}, counter "${d.read.counter}"`).join('; ')}; with the frame and the counter on: stage ${JSON.stringify(controlDrawn.stage)}, counter "${controlDrawn.counter}"; PDF fills ${pdf.fills.plain} against ${pdf.fills.framed}, text runs ${pdf.text.plain} against ${pdf.text.framed}; PowerPoint frame objects ${pptx.plain.frame.length} against ${pptx.framed.frame.length} (${pptx.plain.frame.slice(0, 4).join(', ') || 'none'}), counter runs ${pptx.plain.counter.length} against ${pptx.framed.counter.length} (${pptx.plain.counter.slice(0, 2).join(', ') || 'none'})`,
  });
  expect(kit?.['frame'], 'the record turns the frame off').toEqual({
    rails: false,
    rules: false,
    crosses: false,
  });
  expect(kit?.['counter'], 'the record turns the counter off').toEqual({ show: false });
  for (const d of drawn) {
    expect(d.read.stage, `no rail, rule or cross on the stage of ${d.slide}`).toEqual({
      rails: 0,
      rules: 0,
      crosses: 0,
    });
    expect(d.read.cards, `no rail, rule or cross in the filmstrip with ${d.slide} open`).toEqual({
      rails: 0,
      rules: 0,
      crosses: 0,
    });
    expect(d.read.counter, `no counter on ${d.slide}`).toBe('');
  }
  expect(controlDrawn.stage.rails, 'the control: the rails draw').toBe(2);
  expect(controlDrawn.stage.crosses, 'the control: the crosses draw').toBe(4);
  expect(controlDrawn.counter, 'the control: the counter draws').toMatch(/\d+ \/ \d+/);
  expect(pdf.fills.framed, 'the control: the frame adds filled paths to the PDF').toBeGreaterThan(
    pdf.fills.plain,
  );
  expect(pdf.text.framed, 'the control: the counter adds text runs to the PDF').toBeGreaterThan(
    pdf.text.plain,
  );
  expect(pptx.framed.frame.length, 'the control: the frame is in the PowerPoint').toBeGreaterThan(
    0,
  );
  expect(
    pptx.framed.counter.length,
    'the control: the counter is in the PowerPoint',
  ).toBeGreaterThan(0);
  expect(pptx.plain.frame, 'no frame line or cross in the PowerPoint').toEqual([]);
  expect(pptx.plain.counter, 'no counter in the PowerPoint').toEqual([]);
}

test(title('templates.save.as-template'), async () => {
  test.setTimeout(180_000);
  if (isProductionBase(BASE)) test.skip(true, PRODUCTION_WRITE_SKIP);
  await openEditor(page, deck);
  /* the deck carries a kit, so the template's copy proves it travels */
  const actions = await page.evaluate(() =>
    (window.turboslide?.studio.describe().actions ?? []).map((a: { id: string } | string) =>
      typeof a === 'string' ? a : a.id,
    ),
  );
  /* the kit write is a setup: a window transport whose brand.set handler has not landed answers
     NotImplementedError (the third smoke of 2026-09-19), and the row then proves the template
     without the kit half and says so */
  let kitWritten = false;
  if (actions.includes('brand.set')) {
    const s = await settled(page);
    kitWritten = await invoke(page, 'brand.set', {
      path: '/colors/light/primary',
      value: PRIMARY,
      baseRevision: s.revision,
    })
      .then(() => true)
      .catch((error: unknown) => {
        test.info().annotations.push({
          type: 'kit',
          description: `brand.set on the window API: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
        });
        return false;
      });
    await settled(page);
  }
  if (!(await reachRow(page, 'file', 'file.saveAsTemplate')))
    test.skip(
      true,
      'not on this build: file.saveAsTemplate (docs/archive/rounds/PRODUCT.md 7.1, B5b)',
    );
  await saveAsTemplate();
  await gotoGallery();
  const card = await savedCard();
  expect(card, `the gallery lists ${TEMPLATE_NAME} under Your organisation`).not.toBeNull();
  savedSlug = card!.slug;
  /* the cover is the slide's live clone since the product round (decks.templates.tsx
     `.ts-gallery-cover`); a picture or the card thumb still counts */
  const cover = page.locator(
    `[data-control="templates.card.${card!.slug}"] img, [data-control="templates.card.${card!.slug}"] .ts-hm-card-thumb, [data-control="templates.card.${card!.slug}"] .ts-gallery-cover > *`,
  );
  await expect(cover.first(), 'the card shows its cover').toBeVisible({ timeout: 15_000 });
  /* a deck created from it carries the kit */
  await ctl(page, `templates.card.${card!.slug}`).click();
  await page.waitForURL(/\/edit\//, { timeout: 30_000 });
  const created = page.url().match(/\/edit\/([^/?#]+)/)?.[1] ?? '';
  scratch.add(created);
  await waitEditor(page);
  const kit = await record(page);
  test.info().annotations.push({ type: 'kit', description: JSON.stringify(kit) });
  if (kitWritten)
    expect(JSON.stringify(kit ?? {}), 'the created deck carries the kit').toContain(PRIMARY);
  else expect(created, 'a deck is created from the template').not.toBe('');
});

test(title('templates.save.same-name-replaces'), async () => {
  test.setTimeout(180_000);
  if (isProductionBase(BASE)) test.skip(true, PRODUCTION_WRITE_SKIP);
  if (!(await reachRow(page, 'file', 'file.saveAsTemplate')))
    test.skip(
      true,
      'not on this build: file.saveAsTemplate (docs/archive/rounds/PRODUCT.md 7.1, B5b)',
    );
  if (savedSlug === null) await saveAsTemplate();
  await gotoGallery();
  const before = await savedCard();
  savedSlug = before?.slug ?? savedSlug;
  const { replaceSentence } = await saveAsTemplate();
  expect(replaceSentence ?? '', 'the dialog reads the replace sentence').toMatch(
    /Replace the template/,
  );
  await gotoGallery();
  const cards = (await organisationCards()).filter((c) => c.name.includes(TEMPLATE_NAME));
  expect(cards.length, 'the gallery lists one card for the name').toBe(1);
  expect(cards[0]!.slug, 'the slug is unchanged').toBe(before!.slug);
});

test(title('templates.card.rename-and-delete'), async () => {
  test.setTimeout(180_000);
  if (isProductionBase(BASE)) test.skip(true, PRODUCTION_WRITE_SKIP);
  await gotoGallery();
  if (!(await drawn(page, 'templates.page')))
    test.skip(true, 'not on this build: templates.page (docs/archive/rounds/PRODUCT.md 7.1, B5b)');
  if (savedSlug === null) {
    /* the File menu is the editor's: the gallery page has none to reach a row in */
    await openEditor(page, deck);
    if (!(await reachRow(page, 'file', 'file.saveAsTemplate')))
      test.skip(
        true,
        'not on this build: file.saveAsTemplate (docs/archive/rounds/PRODUCT.md 7.1, B5b)',
      );
    await saveAsTemplate();
    await gotoGallery();
    savedSlug = (await savedCard())?.slug ?? null;
  }
  expect(savedSlug, 'a template of this file to rename').not.toBeNull();
  const slug = savedSlug!;
  await ctl(page, `templates.card.${slug}.menu`).click();
  await ctl(page, `menu.templates.card.${slug}.rename`).click();
  const field = page
    .locator(
      `[data-control="templates.card.${slug}.rename.field"], [data-control="dialog.renameTemplate.name"], .ts-dialog-scrim [role="dialog"] input`,
    )
    .first();
  await field.waitFor({ timeout: 8000 });
  await field.click();
  await page.keyboard.press('Meta+a');
  await page.keyboard.type(`${TEMPLATE_NAME} renamed`, { delay: 40 });
  await page.keyboard.press('Enter');
  await expect(ctl(page, `templates.card.${slug}`), 'the card reads the new name').toContainText(
    `${TEMPLATE_NAME} renamed`,
    { timeout: 15_000 },
  );
  await deleteTemplate(slug);
  /* the rows after save their own template: this one is gone */
  savedSlug = null;
  await gotoGallery();
  expect(await savedCard(), 'the gallery dropped the template').toBeNull();
  await page.goto('/decks');
  await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
  await expect(ctl(page, `home.template.${slug}`), 'the strip dropped it').toHaveCount(0);
});

test(title('templates.default.use-for-new'), async () => {
  test.setTimeout(240_000);
  if (isProductionBase(BASE)) test.skip(true, PRODUCTION_WRITE_SKIP);
  await gotoGallery();
  if (!(await drawn(page, 'templates.page')))
    test.skip(true, 'not on this build: templates.page (docs/archive/rounds/PRODUCT.md 7.1, B5b)');
  if (savedSlug === null) {
    /* the File menu is the editor's: the gallery page has none to reach a row in */
    await openEditor(page, deck);
    if (!(await reachRow(page, 'file', 'file.saveAsTemplate')))
      test.skip(
        true,
        'not on this build: file.saveAsTemplate (docs/archive/rounds/PRODUCT.md 7.1, B5b)',
      );
    await saveAsTemplate();
    await gotoGallery();
    savedSlug = (await savedCard())?.slug ?? null;
  }
  expect(savedSlug, 'a template of this file with a kit').not.toBeNull();
  const slug = savedSlug!;
  /* the store's default as found, read through the surface that puts it back: where the surface
     does not answer the row is not driven, never a write the run cannot undo (the polish round's
     pass 1, finding 3) */
  const found = await readDefaultThroughApi();
  if (found.id === null) {
    test.skip(true, `${DEFAULT_NO_RESET_SKIP}; ${found.reason}`);
    return;
  }
  test.info().annotations.push({ type: 'default', description: `before: ${found.id}` });
  defaultToRestore = found.id;
  await ctl(page, `templates.card.${slug}.menu`).click();
  await ctl(page, `menu.templates.card.${slug}.useForNew`).click();
  await expect(
    ctl(page, `templates.card.${slug}.default`),
    'the card is marked as used for new presentations',
  ).toBeVisible({ timeout: 10_000 });
  /* /new opens a deck carrying the kit */
  await page.goto('/new');
  await waitEditor(page);
  const fromNew = await record(page);
  const draftAppearance = (await state(page)).theme;
  /* the Blank card too */
  await page.goto('/decks');
  await page.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
  await ctl(page, 'home.blank').click();
  await page.waitForURL(/\/(new|edit)\//, { timeout: 30_000 }).catch(() => undefined);
  await waitEditor(page);
  const fromBlank = await record(page);
  const blankId = page.url().match(/\/edit\/([^/?#]+)/)?.[1];
  if (blankId) scratch.add(blankId);
  test.info().annotations.push({
    type: 'kits',
    description: `/new ${JSON.stringify(fromNew)} (${draftAppearance}); Blank ${JSON.stringify(fromBlank)}`,
  });
  expect(JSON.stringify(fromNew ?? {}), '/new carries the kit').toContain(PRIMARY);
  expect(JSON.stringify(fromBlank ?? {}), 'the Blank card carries the kit').toContain(PRIMARY);
  /* Use for new presentations on Blank restores today's draft */
  await restoreBlankDefault();
  await page.goto('/new');
  await waitEditor(page);
  const restored = await record(page);
  expect(JSON.stringify(restored ?? {}), "today's draft is back").not.toContain(PRIMARY);
  /* the store as found, through the surface, now rather than in the teardown: the read after
     the page's restore says whether Blank landed, and a default other than Blank goes back */
  const left = await putDefaultBack();
  expect(left, 'the default reads as this file found it').toBeNull();
});

test(title('templates.deck.read-only'), async () => {
  test.setTimeout(120_000);
  if (isProductionBase(BASE)) test.skip(true, PRODUCTION_WRITE_SKIP);
  const actions = await (async () => {
    await openEditor(page, deck);
    return page.evaluate(() =>
      (window.turboslide?.studio.describe().actions ?? []).map((a: { id: string } | string) =>
        typeof a === 'string' ? a : a.id,
      ),
    );
  })();
  if (!actions.includes('template.list'))
    test.skip(true, 'not on this build: template.list (docs/archive/rounds/PRODUCT.md 4.3, B5b)');
  /* the template's own editor address: a template is a deck under decks/templates */
  let opened = false;
  for (const address of ['/edit/templates/blank', '/edit/blank']) {
    const res = await page.goto(address);
    if (res && res.status() < 400) {
      await waitEditor(page).catch(() => undefined);
      if (await page.evaluate(() => Boolean(window.turboslide?.studio))) {
        opened = true;
        break;
      }
    }
  }
  if (!opened) test.skip(true, 'no editor address opens the Blank template on this build (B5b)');
  const s = await state(page);
  const refusal = await invoke(page, 'deck.set', {
    path: '/title',
    value: 'Not allowed',
    baseRevision: s.revision,
  })
    .then(() => null)
    .catch((error: unknown) => (error instanceof Error ? error.message : String(error)));
  expect(refusal ?? '', 'deck.set on a template is refused with the sentence').toMatch(
    /Templates are read only/,
  );
});

test(title('brand.logo.replace-every-slide'), async () => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  await menuPath(page, 'slide', 'slide.changeTheme');
  const panel = await Promise.race([
    ctl(page, 'panel.brand')
      .waitFor({ timeout: 8000 })
      .then(() => 'brand' as const),
    ctl(page, 'panel.themes')
      .waitFor({ timeout: 8000 })
      .then(() => 'themes' as const),
  ]).catch(() => 'none' as const);
  if (panel !== 'brand')
    test.skip(
      true,
      `not on this build: panel.brand (docs/archive/rounds/PRODUCT.md 7.1, B5a); Slide > Change theme opened ${panel === 'themes' ? 'the Themes panel' : 'no panel'}`,
    );
  const chooser = page.waitForEvent('filechooser', { timeout: 10_000 });
  await ctl(page, 'panel.brand.logo.replace').click();
  const fc = await chooser;
  await fc.setFiles({
    name: 'acme-logo.png',
    mimeType: 'image/png',
    buffer: await pngBytes(page, 132, 84),
  });
  const t0 = Date.now();
  const drawnLogo = () =>
    page.evaluate(() => {
      const stage = document.querySelector('.ts-stagewrap.ts-editor .ts-stage');
      const footer = stage?.querySelector('.wordmark img, [data-slot="footer-logo"] img');
      /* the picture mark is the img itself (render/slide.ts `<img class="mark mark-picture"
         data-slot="mark">`), the default mark an svg inside `.mark` */
      const mark = document.querySelector(
        '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) img.mark, .ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) .mark img, .ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) img[data-slot="mark"], .ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-slot="mark"] img',
      );
      const box = (el: Element | null) => (el ? el.getBoundingClientRect() : null);
      return { footer: Boolean(footer), mark: Boolean(mark), markBox: box(mark) };
    });
  const first = (await invoke<{ slides?: { id: string }[] } | { id: string }[]>(
    page,
    'slide.list',
    {},
  )) as unknown;
  void first;
  await expect
    .poll(async () => (await drawnLogo()).footer, {
      timeout: 5000,
      message: "every slide's footer draws the picture within 5 s",
    })
    .toBe(true);
  const ms = Date.now() - t0;
  const slides = await invoke<{ slides?: { id: string }[] }>(page, 'slide.list', {});
  const list = Array.isArray(slides) ? (slides as { id: string }[]) : (slides.slides ?? []);
  await ctl(page, `filmstrip.slide.${list[0]!.id}`).click();
  await page.waitForTimeout(500);
  const onTitle = await drawnLogo();
  expect(onTitle.mark, "the title slide's logo slot draws the picture").toBe(true);
  /* a new slide carries it */
  await addSlide(page);
  await page.waitForTimeout(400);
  expect((await drawnLogo()).footer, 'a new slide carries the footer logo').toBe(true);
  /* Position > Top right moves the title slide's logo */
  await ctl(page, `filmstrip.slide.${list[0]!.id}`).click();
  const before = (await drawnLogo()).markBox;
  const position = ctl(page, 'panel.brand.logo.position');
  const tag = await position.evaluate((el) => el.tagName.toLowerCase());
  if (tag === 'select') await position.selectOption({ label: 'Top right' });
  else {
    await position.click();
    await page
      .locator('[data-control^="panel.brand.logo.position."]', { hasText: 'Top right' })
      .first()
      .click();
  }
  await settled(page);
  await expect
    .poll(async () => (await drawnLogo()).markBox?.x ?? 0, { timeout: 8000 })
    .toBeGreaterThan((before?.x ?? 0) + 200);
  test.info().annotations.push({
    type: 'logo',
    description: `the footer drew the picture ${ms} ms after the chooser; the title logo moved from x ${Math.round(before?.x ?? 0)} to ${Math.round((await drawnLogo()).markBox?.x ?? 0)}`,
  });
  /* the default logo back, so the rows after read the deployment's kit */
  await ctl(page, 'panel.brand.logo.default')
    .click()
    .catch(() => undefined);
  await settled(page);
});

test(title('fonts.budget.no-load-before-ready'), async ({ browser }) => {
  test.setTimeout(120_000);
  /* a fresh context, so no face sits in the cache; the deck uses Inter alone. The owner's
     storage state rides along (the cookie, not the cache): under enforce a deck from /new is
     Anyone with the link, Editor over a minted link, so a fresh principal on the plain
     /edit/<id> address lands outside the editor (share.stranger-cannot-edit) */
  const fresh = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: 1440, height: 900 },
    storageState: await page.context().storageState(),
  });
  const p = await fresh.newPage();
  const woff = new Set<string>();
  let ready: number | null = null;
  const before: string[] = [];
  p.on('request', (req) => {
    const url = req.url();
    if (/\.woff2?(\?|$)/.test(url)) {
      woff.add(url);
      if (ready === null) before.push(url);
    }
  });
  try {
    await p.goto(`/edit/${deck}`);
    await waitEditor(p);
    ready = Date.now();
    await p.waitForTimeout(1500);
  } finally {
    await fresh.close();
  }
  const catalog = before.filter(
    (u) => /fonts\/assets\/(?!InterVariable)[^/]+\//.test(u) && !/inter/i.test(u),
  );
  test.info().annotations.push({
    type: 'fonts',
    description: `${before.length} woff2 request(s) before the ready mark (${before.map((u) => u.split('/').slice(-2).join('/')).join(', ') || 'none'}); ${woff.size} in all`,
  });
  expect(catalog, 'no catalog woff2 request before the ready mark').toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// the features round, ship one (docs/archive/rounds/FEATURES.md 3.1, 3.5, 7.1): the Inter 4.1 italic, the P1
// specimen rows and Recent group of the Font dropdown, and the italic preload on /edit alone

/** The sha256 of the Inter 4.1 italic (docs/archive/rounds/FEATURES.md 3.1 item 1; `INTER_ITALIC.sha256` in packages/fonts/src/inter.ts). */
const INTER_ITALIC_SHA256 = 'e564f652916db6c139570fefb9524a77c4d48f30c92928de9db19b6b5c7a262a';
const INTER_ITALIC_BYTES = 387_976;
const INTER_ITALIC_VERSION = 'Version 4.001;git-9221beed3';
const WOFF2_KNOWN_TAGS = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
];
function uintBase128(buf: Buffer, at: number): [number, number] {
  let value = 0;
  for (let i = 0; i < 5; i += 1) {
    const byte = buf[at + i]!;
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return [value, at + i + 1];
  }
  throw new Error('a UIntBase128 longer than five bytes');
}
/**
 * The version string (name id 5, the Windows platform) of a woff2 file: the header, the table
 * directory with its UIntBase128 lengths, the one brotli stream and the name table inside it.
 * Enough of the format for the row; a font that is not woff2 throws.
 */
function woff2Version(bytes: Buffer): string | null {
  if (bytes.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not a woff2 file');
  const numTables = bytes.readUInt16BE(12);
  const totalCompressedSize = bytes.readUInt32BE(20);
  let at = 48;
  const tables: { tag: string; length: number }[] = [];
  for (let i = 0; i < numTables; i += 1) {
    const flags = bytes[at]!;
    at += 1;
    let tag: string;
    if ((flags & 0x3f) === 63) {
      tag = bytes.toString('latin1', at, at + 4);
      at += 4;
    } else tag = WOFF2_KNOWN_TAGS[flags & 0x3f] ?? '????';
    let origLength: number;
    [origLength, at] = uintBase128(bytes, at);
    let length = origLength;
    const version = (flags >> 6) & 3;
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    if (transformed) [length, at] = uintBase128(bytes, at);
    tables.push({ tag, length });
  }
  const data = brotliDecompressSync(bytes.subarray(at, at + totalCompressedSize));
  let pos = 0;
  let name: Buffer | null = null;
  for (const table of tables) {
    if (table.tag === 'name') name = data.subarray(pos, pos + table.length);
    pos += table.length;
  }
  if (name === null) return null;
  const count = name.readUInt16BE(2);
  const stringOffset = name.readUInt16BE(4);
  for (let i = 0; i < count; i += 1) {
    const record = 6 + i * 12;
    const platform = name.readUInt16BE(record);
    const nameId = name.readUInt16BE(record + 6);
    const length = name.readUInt16BE(record + 8);
    const offset = name.readUInt16BE(record + 10);
    if (nameId === 5 && platform === 3)
      return Buffer.from(name.subarray(stringOffset + offset, stringOffset + offset + length))
        .swap16()
        .toString('utf16le');
  }
  return null;
}
/** The font preload links of a route's HTML, as hrefs. */
/** The font links of a page's HTML: the preloads and, since the console hotfix, the editor's italic prefetch. */
async function fontPreloads(path: string): Promise<string[]> {
  const res = await page.request.get(path, { headers: extraHTTPHeaders, maxRedirects: 5 });
  const html = await res.text();
  return [...html.matchAll(/<link\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => /rel=["']?pre(load|fetch)/.test(tag) && /as=["']?font/.test(tag))
    .map((tag) => /href=["']([^"']+)["']/.exec(tag)?.[1] ?? tag);
}

test(title('fonts.inter.italic-release'), async () => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const preloads = await fontPreloads(`/edit/${deck}`);
  const italic = preloads.find((href) => /Italic/i.test(href)) ?? null;
  test.info().annotations.push({ type: 'preloads', description: preloads.join(', ') || 'none' });
  expect(italic, 'the editor preloads the italic').not.toBeNull();
  const res = await page.request.get(italic!, { headers: extraHTTPHeaders, maxRedirects: 5 });
  expect(res.status()).toBe(200);
  const bytes = await res.body();
  const sha = createHash('sha256').update(bytes).digest('hex');
  const version = woff2Version(bytes);
  test.info().annotations.push({
    type: 'italic',
    description: `${bytes.length} bytes; sha256 ${sha.slice(0, 16)}…; name table "${version ?? 'unread'}"`,
  });
  expect(bytes.length, 'the 4.1 italic is 387,976 bytes').toBe(INTER_ITALIC_BYTES);
  expect(sha, 'the sha256 equals INTER_ITALIC.sha256').toBe(INTER_ITALIC_SHA256);
  expect(version, 'the name table reads the 4.1 version string').toBe(INTER_ITALIC_VERSION);
  /* Cmd+I on the title renders the italic face */
  const first = await page.evaluate(
    () => (window.turboslide!.studio.describe().state as { slideId: string }).slideId,
  );
  void first;
  const run = await headingRun(page);
  const el = page
    .locator(`.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving) [data-run="${run}"]`)
    .first();
  await el.dblclick();
  await page.waitForTimeout(200);
  await page.keyboard.press('Meta+a');
  await page.keyboard.press('Meta+i');
  await page.waitForTimeout(400);
  const facts = await page.evaluate((r) => {
    const root = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
    const mark = root?.querySelector('em, i, [data-mark="italic"], [data-mark="em"]') ?? root;
    const cs = mark ? getComputedStyle(mark) : null;
    return {
      style: cs?.fontStyle ?? null,
      family: cs?.fontFamily ?? null,
      loaded: [...document.fonts].some(
        (f) => /^"?Inter"?$/.test(f.family) && f.style === 'italic' && f.status === 'loaded',
      ),
      check: document.fonts.check('italic 700 24px Inter'),
    };
  }, run);
  await page.keyboard.press('Meta+i');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await settled(page);
  test.info().annotations.push({ type: 'italic drawn', description: JSON.stringify(facts) });
  expect(facts.style, 'the title draws italic').toBe('italic');
  expect(facts.loaded || facts.check, 'the italic Inter face is loaded').toBe(true);
});

/** The Font dropdown opened on the selected text box; answers the dropdown's state. */
async function openFontDropdown(
  p: Page,
  blockId: string,
): Promise<'live' | 'absent' | 'disabled' | 'closed'> {
  await p.keyboard.press('Escape');
  const el = p.locator(`.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`).first();
  await el.click();
  await p.waitForTimeout(200);
  if (
    await p.evaluate(() => document.querySelector('.ts-stagewrap.ts-editor[data-editing]') !== null)
  ) {
    await p.keyboard.press('Escape');
    await p.waitForTimeout(200);
  }
  let control = 'toolbar.font';
  if (
    !(await ctl(p, control)
      .isVisible()
      .catch(() => false))
  ) {
    if (
      await ctl(p, 'toolbar.more')
        .isVisible()
        .catch(() => false)
    ) {
      await ctl(p, 'toolbar.more').click();
      await p.waitForTimeout(300);
      control = 'toolbar.more.toolbar.font';
    }
  }
  if (
    !(await ctl(p, control)
      .isVisible()
      .catch(() => false))
  )
    return 'absent';
  const disabled = await ctl(p, control).evaluate(
    (e) => e.getAttribute('aria-disabled') === 'true' || e.hasAttribute('disabled'),
  );
  if (disabled) return 'disabled';
  await ctl(p, control).click();
  const shown = await ctl(p, 'toolbar.font.search')
    .waitFor({ timeout: 6000 })
    .then(() => true)
    .catch(() => false);
  if (shown)
    await p
      .locator('[data-control="toolbar.font.list"][data-rows]')
      .first()
      .waitFor({ timeout: 10_000 })
      .catch(() => undefined);
  return shown ? 'live' : 'closed';
}
const NOT_LIVE = (s: string) =>
  `not on this build: toolbar.font is ${s} (docs/archive/rounds/PRODUCT.md 4.2, B5a; docs/archive/rounds/FEATURES.md 3.5)`;

test(title('fonts.picker.specimen-rows'), async () => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const slideId = (await state(page)).slideId;
  await placeBlock(page, slideId, {
    id: 'specimen-box',
    type: 'text',
    text: 'Renewal terms',
    pos: { x: 160, y: 200, w: 800, h: 120 },
  });
  const woff: string[] = [];
  page.on('request', (req) => {
    if (/\.woff2?(\?|$)/.test(req.url())) woff.push(req.url());
  });
  const dropdown = await openFontDropdown(page, 'specimen-box');
  if (dropdown !== 'live') test.skip(true, NOT_LIVE(dropdown));
  const before = woff.length;
  /* the whole list scrolled */
  const list = page.locator('[data-control="toolbar.font.list"]').first();
  for (let i = 0; i < 12; i += 1) {
    await list.evaluate((el) => {
      el.scrollTop += 400;
    });
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(800);
  const facts = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-control^="toolbar.font.row."]')];
    /* a specimen draws the family name as a picture (an img, or an svg at least 60 px wide);
       a row's icon (a check mark, a chevron) is not one */
    const specimens = rows.filter((r) =>
      [...r.querySelectorAll('img, svg')].some((el) => {
        const w = el.getBoundingClientRect().width;
        return el.tagName.toLowerCase() === 'img'
          ? /specimen|\.svg/.test(el.getAttribute('src') ?? '') || w >= 60
          : w >= 60;
      }),
    ).length;
    return { rows: rows.length, specimens };
  });
  const scrolled = woff.length - before;
  test.info().annotations.push({
    type: 'specimens',
    description: `${facts.rows} rows, ${facts.specimens} with an SVG specimen; ${scrolled} woff2 request(s) while scrolling: ${
      woff
        .slice(before)
        .map((u) => u.split('/').slice(-2).join('/'))
        .join(', ') || 'none'
    }`,
  });
  if (facts.specimens === 0) {
    await page.keyboard.press('Escape');
    test.skip(
      true,
      'not on this build: the specimen rows of the Font dropdown (docs/archive/rounds/FEATURES.md 3.5, P1, B1 with B2)',
    );
  }
  expect(scrolled, 'scrolling the list loads no woff2').toBe(0);
  expect(facts.specimens, 'each row draws an SVG specimen').toBe(facts.rows);
  const pickAt = woff.length;
  await ctl(page, 'toolbar.font.row.lora').click();
  await settled(page);
  await expect
    .poll(() => woff.length, { timeout: 8000, message: 'the pick loads the face' })
    .toBeGreaterThan(pickAt);
});

test(title('fonts.picker.recent-group'), async ({ browser }) => {
  test.setTimeout(180_000);
  await openEditor(page, deck);
  const slideId = (await state(page)).slideId;
  await placeBlock(page, slideId, {
    id: 'recent-box',
    type: 'text',
    text: 'Recent faces',
    pos: { x: 160, y: 400, w: 800, h: 120 },
  });
  for (const id of ['roboto', 'lora']) {
    const dropdown = await openFontDropdown(page, 'recent-box');
    if (dropdown !== 'live') test.skip(true, NOT_LIVE(dropdown));
    if (
      !(await ctl(page, `toolbar.font.row.${id}`)
        .isVisible()
        .catch(() => false))
    ) {
      await ctl(page, 'toolbar.font.search').click();
      await page.keyboard.type(id.slice(0, 3), { delay: 60 });
      await page.waitForTimeout(400);
    }
    await ctl(page, `toolbar.font.row.${id}`).click();
    await settled(page);
  }
  const dropdown = await openFontDropdown(page, 'recent-box');
  expect(dropdown).toBe('live');
  const facts = await page.evaluate(() => {
    const groups = [...document.querySelectorAll('[data-control^="toolbar.font.group."]')].map(
      (g) => g.getAttribute('data-control')!.replace('toolbar.font.group.', ''),
    );
    const recent = document.querySelector('[data-control="toolbar.font.group.recent"]');
    const rows = [...(recent?.querySelectorAll('[data-control^="toolbar.font.row."]') ?? [])].map(
      (r) => r.getAttribute('data-control')!.replace('toolbar.font.row.', ''),
    );
    return {
      groups,
      rows,
      clear: document.querySelector('[data-control="toolbar.font.clearRecent"]') !== null,
    };
  });
  test.info().annotations.push({ type: 'recent', description: JSON.stringify(facts) });
  if (!facts.groups.includes('recent')) {
    await page.keyboard.press('Escape');
    test.skip(
      true,
      'not on this build: toolbar.font.group.recent (docs/archive/rounds/FEATURES.md 3.5, P1, B1)',
    );
  }
  expect(facts.rows.slice().sort(), 'Recent lists the two picks').toEqual(['lora', 'roboto']);
  expect(facts.groups.indexOf('recent'), 'Recent after Used').toBeGreaterThan(
    facts.groups.indexOf('used'),
  );
  expect(facts.clear, 'a Clear recent row').toBe(true);
  await ctl(page, 'toolbar.font.clearRecent').click();
  await page.waitForTimeout(300);
  const cleared = await page.evaluate(() =>
    document.querySelector(
      '[data-control="toolbar.font.group.recent"] [data-control^="toolbar.font.row."]',
    ),
  );
  await page.keyboard.press('Escape');
  expect(cleared, 'Clear recent empties the group').toBeNull();
  /* a new browser context: the cookie alone, no localStorage */
  const storage = await page.context().storageState();
  const fresh = await browser.newContext({
    extraHTTPHeaders,
    viewport: { width: 1440, height: 900 },
    storageState: { cookies: storage.cookies, origins: [] },
  });
  try {
    const p2 = await fresh.newPage();
    await openEditor(p2, deck);
    const d2 = await openFontDropdown(p2, 'recent-box');
    expect(d2).toBe('live');
    const rows2 = await p2.evaluate(
      () =>
        document.querySelectorAll(
          '[data-control="toolbar.font.group.recent"] [data-control^="toolbar.font.row."]',
        ).length,
    );
    await p2.keyboard.press('Escape');
    expect(rows2, 'a new browser context lists no recent').toBe(0);
  } finally {
    await fresh.close();
  }
});

test(title('fonts.preload.italic-on-edit-only'), async () => {
  test.setTimeout(120_000);
  await openEditor(page, deck);
  const decks = await fontPreloads('/decks');
  const edit = await fontPreloads(`/edit/${deck}`);
  test.info().annotations.push({
    type: 'preloads',
    description: `/decks: ${decks.join(', ') || 'none'}; /edit: ${edit.join(', ') || 'none'}`,
  });
  expect(decks.length, '/decks carries one font preload (the upright)').toBe(1);
  expect(decks[0] ?? '', 'the upright').not.toMatch(/Italic/i);
  /* the italic is a prefetch rather than a preload since the console hotfix of 2026-09-29: a
     preload drew the browser's unused-preload warning on every editor load whose deck drew no
     italic within seconds; the prefetch warms the cache without it */
  expect(edit.length, '/edit carries two: the upright preload and the italic prefetch').toBe(2);
  expect(edit.find((href) => /Italic/i.test(href)) ?? '', 'the italic is on /edit').toMatch(
    /Italic/i,
  );
});

// ---------------------------------------------------------------------------------------------
// the polish round (docs/archive/rounds/POLISH.md 2.5 item 49, 5.1 `brand.panel.words-match-sheet`): the Brand
// kit's words match the sheet.

test(title('brand.panel.words-match-sheet'), async () => {
  test.setTimeout(240_000);
  await openEditor(page, deck);
  await menuPath(page, 'slide', 'slide.changeTheme');
  const panel = await Promise.race([
    ctl(page, 'panel.brand')
      .waitFor({ timeout: 10_000 })
      .then(() => 'brand' as const),
    ctl(page, 'panel.themes')
      .waitFor({ timeout: 10_000 })
      .then(() => 'themes' as const),
  ]).catch(() => 'none' as const);
  if (panel !== 'brand')
    test.skip(
      true,
      `not on this build: panel.brand (docs/archive/rounds/PRODUCT.md 7.1); Slide > Change theme opened ${panel === 'themes' ? 'the Themes panel' : 'no panel'}`,
    );
  const notes: string[] = [];
  const failures: string[] = [];
  /* the footer text on the title slide and slide 2 */
  const s = await settled(page);
  await invoke(page, 'brand.set', {
    path: '/footer/text',
    value: 'Acme',
    baseRevision: s.revision,
  }).catch(() => undefined);
  await settled(page);
  const order = await slideOrder(page);
  const footerOn = async (id: string) => {
    await clickCard(page, id);
    await page.waitForTimeout(600);
    return page.evaluate((slideId) => {
      const stage = document.querySelector('.ts-stagewrap.ts-editor .ts-stage');
      const sheet = stage?.querySelector(`.pt-slide:not(.is-leaving)[data-slide-id="${slideId}"]`);
      const visible = (el: Element | null) =>
        el !== null &&
        el.getClientRects().length > 0 &&
        getComputedStyle(el).visibility !== 'hidden' &&
        getComputedStyle(el).opacity !== '0';
      const footers = [...(stage?.querySelectorAll('.ts-kit-footer') ?? [])].filter(visible);
      return (
        footers.some((el) => /Acme/.test(el.textContent ?? '')) ||
        /Acme/.test(sheet?.textContent ?? '')
      );
    }, id);
  };
  const onTitle = await footerOn(order[0]!);
  const onSecond = await footerOn(order[1]!);
  notes.push(`footer text on the title slide ${onTitle}, on slide 2 ${onSecond}`);
  if (!onTitle || !onSecond)
    failures.push(`the footer text draws on the title slide ${onTitle} and slide 2 ${onSecond}`);
  /* the position label names where the mark is drawn on the title slide */
  await clickCard(page, order[0]!);
  await page.waitForTimeout(400);
  const position = await page.evaluate(() => {
    const select = document.querySelector(
      '[data-control="panel.brand.logo.position"]',
    ) as HTMLSelectElement | null;
    const label = select ? (select.options[select.selectedIndex]?.text ?? select.value) : null;
    const stage = document.querySelector('.ts-stagewrap.ts-editor');
    const sheet = stage?.querySelector('.pt-slide:not(.is-leaving)');
    const mark = stage?.querySelector(
      '.pt-slide:not(.is-leaving) .mark, .pt-slide:not(.is-leaving) [data-block="mark"], .pt-slide:not(.is-leaving) .ts-kit-mark, .pt-slide:not(.is-leaving) .ts-mark',
    );
    const heading = stage?.querySelector(
      '.pt-slide:not(.is-leaving) h1, .pt-slide:not(.is-leaving) [data-run$="/heading"]',
    );
    if (!sheet || !mark) return { label, drawn: null };
    const sr = sheet.getBoundingClientRect();
    const mr = mark.getBoundingClientRect();
    const hr = heading?.getBoundingClientRect() ?? null;
    const vertical =
      mr.top + mr.height / 2 < sr.top + sr.height / 3
        ? 'top'
        : mr.top + mr.height / 2 > sr.top + (sr.height * 2) / 3
          ? 'bottom'
          : 'middle';
    const horizontal =
      mr.left + mr.width / 2 < sr.left + sr.width / 3
        ? 'left'
        : mr.left + mr.width / 2 > sr.left + (sr.width * 2) / 3
          ? 'right'
          : 'centre';
    return {
      label,
      drawn: `${vertical} ${horizontal}${hr && mr.bottom <= hr.top ? ' above the title' : ''}`,
    };
  });
  notes.push(
    `the position label "${position.label}" while the mark is drawn ${position.drawn ?? 'nowhere'}`,
  );
  if (position.label && position.drawn) {
    const l = position.label.toLowerCase();
    const d = position.drawn;
    const agrees =
      (/bottom/.test(l) && /^bottom/.test(d)) ||
      (/top|above/.test(l) && (/^top/.test(d) || /above the title/.test(d))) ||
      (/left/.test(l) && /left/.test(d) && !/bottom|top/.test(l));
    if (!agrees)
      failures.push(
        `the position label "${position.label}" names another place than the drawn ${d}`,
      );
  }
  /* the Dark tile leaves the chrome light and switches the Colors tab */
  const chromeBefore = await page.evaluate(() =>
    document.documentElement.getAttribute('data-theme'),
  );
  const dark = ctl(page, 'panel.brand.appearance.dark');
  let chromeAfter: string | null = null;
  let colorsTab: string | null = null;
  if ((await dark.count()) > 0) {
    await dark.click();
    await settled(page);
    await page.waitForTimeout(600);
    chromeAfter = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    colorsTab = await page.evaluate(() => {
      const pressed = document.querySelector(
        '[data-control^="panel.brand.color.appearance."][aria-pressed="true"], [data-control^="panel.brand.color.appearance."].is-active',
      );
      return (
        pressed?.getAttribute('data-control')?.replace('panel.brand.color.appearance.', '') ?? null
      );
    });
    await ctl(page, 'panel.brand.appearance.light')
      .click({ timeout: 3000 })
      .catch(() => undefined);
    await settled(page);
  } else notes.push('no Dark tile');
  notes.push(
    `the chrome ${chromeBefore} -> ${chromeAfter} after the Dark tile; the Colors tab reads ${colorsTab}`,
  );
  if (chromeAfter !== null && chromeAfter !== chromeBefore)
    failures.push(`the Dark tile turned the chrome ${chromeAfter}`);
  if (colorsTab !== null && colorsTab !== 'dark')
    failures.push(`the Colors tab stayed on ${colorsTab}`);
  /* Inter listed once in the font picker */
  const fontButton = page
    .locator('[data-control="panel.brand.font.display"], [data-control="panel.brand.font.text"]')
    .first();
  let inters: number | null = null;
  if ((await fontButton.count()) > 0) {
    await fontButton.click();
    await page.waitForTimeout(500);
    inters = await page.evaluate(
      () =>
        [
          ...document.querySelectorAll(
            '[role="listbox"] [role="option"], [role="menu"] [role="menuitem"], [role="menu"] [role="menuitemradio"], .ts-font-list li, [data-control^="toolbar.font."]',
          ),
        ].filter((el) => /^Inter$/.test((el.textContent ?? '').trim())).length,
    );
    await page.keyboard.press('Escape');
  }
  notes.push(`Inter listed ${inters ?? 'unread'} time(s)`);
  if (inters !== null && inters !== 1) failures.push(`the font picker lists Inter ${inters} times`);
  const s2 = await settled(page);
  await invoke(page, 'brand.reset', { path: '/footer/text', baseRevision: s2.revision }).catch(
    () => undefined,
  );
  test.info().annotations.push({ type: 'brand', description: notes.join('; ') });
  expect(failures).toEqual([]);
});

coverage(import.meta.filename, [
  /* docs/NEXT.md 3.2 H6 */
  'brand.template.blank-no-gt-mark',
  /* docs/NEXT.md 4.1.3 item 23 */
  'brand.template.blank-plain',
  'templates.save.as-template',
  'templates.save.same-name-replaces',
  'templates.card.rename-and-delete',
  'templates.default.use-for-new',
  'templates.deck.read-only',
  'brand.logo.replace-every-slide',
  'fonts.budget.no-load-before-ready',
  /* the features round, ship one (docs/archive/rounds/FEATURES.md 7.1) */
  'fonts.inter.italic-release',
  'fonts.picker.specimen-rows',
  'fonts.picker.recent-group',
  'fonts.preload.italic-on-edit-only',
  /* the polish round (docs/archive/rounds/POLISH.md 2.5 item 49) */
  'brand.panel.words-match-sheet',
]);
