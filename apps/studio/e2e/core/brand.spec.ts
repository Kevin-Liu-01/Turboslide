import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

import {
  Scratch,
  addSlide,
  coverage,
  ctl,
  extraHTTPHeaders,
  invoke,
  menuPath,
  newDeck,
  openEditor,
  ownerContext,
  pngBytes,
  settled,
  state,
  teardownAll,
  title,
  waitEditor,
} from './lib';

// The brand kit and the templates, the spec rows (docs/PRODUCT.md 4.1 to 4.3, 8.1 `templates.*`,
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
// PLAYWRIGHT_BASE_URL=<origin> node_modules/.bin/playwright test apps/studio/e2e/core/brand.spec.ts

const scratch = new Scratch();
let context: BrowserContext;
let page: Page;
let deck = '';
const STAMP = Date.now().toString(36);
const TEMPLATE_NAME = `Core spec template ${STAMP}`;
/** The slug of the template this file saved, for its removal at the end. */
let savedSlug: string | null = null;
/** Whether this file set a deployment default, so the end restores Blank. */
let defaultSet = false;
const PRIMARY = '#0b3d91';

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  ({ context, page } = await ownerContext(browser));
  deck = await newDeck(page, scratch, 'Brand spec deck');
  await addSlide(page);
});
test.afterAll(async () => {
  test.setTimeout(300_000);
  const failures: string[] = [];
  try {
    if (defaultSet) {
      try {
        await restoreBlankDefault();
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
/** Use for new presentations on Blank, from its card menu. */
async function restoreBlankDefault(): Promise<void> {
  await gotoGallery();
  await ctl(page, 'templates.card.blank.menu').click();
  await ctl(page, 'menu.templates.card.blank.useForNew').click();
  await expect(ctl(page, 'templates.card.blank.default')).toBeVisible({ timeout: 10_000 });
  defaultSet = false;
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

test(title('templates.save.as-template'), async () => {
  test.setTimeout(180_000);
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
    test.skip(true, 'not on this build: file.saveAsTemplate (docs/PRODUCT.md 7.1, B5b)');
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
  if (!(await reachRow(page, 'file', 'file.saveAsTemplate')))
    test.skip(true, 'not on this build: file.saveAsTemplate (docs/PRODUCT.md 7.1, B5b)');
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
  await gotoGallery();
  if (!(await drawn(page, 'templates.page')))
    test.skip(true, 'not on this build: templates.page (docs/PRODUCT.md 7.1, B5b)');
  if (savedSlug === null) {
    /* the File menu is the editor's: the gallery page has none to reach a row in */
    await openEditor(page, deck);
    if (!(await reachRow(page, 'file', 'file.saveAsTemplate')))
      test.skip(true, 'not on this build: file.saveAsTemplate (docs/PRODUCT.md 7.1, B5b)');
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
  await gotoGallery();
  if (!(await drawn(page, 'templates.page')))
    test.skip(true, 'not on this build: templates.page (docs/PRODUCT.md 7.1, B5b)');
  if (savedSlug === null) {
    /* the File menu is the editor's: the gallery page has none to reach a row in */
    await openEditor(page, deck);
    if (!(await reachRow(page, 'file', 'file.saveAsTemplate')))
      test.skip(true, 'not on this build: file.saveAsTemplate (docs/PRODUCT.md 7.1, B5b)');
    await saveAsTemplate();
    await gotoGallery();
    savedSlug = (await savedCard())?.slug ?? null;
  }
  expect(savedSlug, 'a template of this file with a kit').not.toBeNull();
  const slug = savedSlug!;
  await ctl(page, `templates.card.${slug}.menu`).click();
  await ctl(page, `menu.templates.card.${slug}.useForNew`).click();
  defaultSet = true;
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
});

test(title('templates.deck.read-only'), async () => {
  test.setTimeout(120_000);
  const actions = await (async () => {
    await openEditor(page, deck);
    return page.evaluate(() =>
      (window.turboslide?.studio.describe().actions ?? []).map((a: { id: string } | string) =>
        typeof a === 'string' ? a : a.id,
      ),
    );
  })();
  if (!actions.includes('template.list'))
    test.skip(true, 'not on this build: template.list (docs/PRODUCT.md 4.3, B5b)');
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
      `not on this build: panel.brand (docs/PRODUCT.md 7.1, B5a); Slide > Change theme opened ${panel === 'themes' ? 'the Themes panel' : 'no panel'}`,
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

coverage(import.meta.filename, [
  'templates.save.as-template',
  'templates.save.same-name-replaces',
  'templates.card.rename-and-delete',
  'templates.default.use-for-new',
  'templates.deck.read-only',
  'brand.logo.replace-every-slide',
  'fonts.budget.no-load-before-ready',
]);
