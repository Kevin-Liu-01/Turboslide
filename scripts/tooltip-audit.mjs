#!/usr/bin/env node
// The tooltip audit (Kevin, 2026-09-11: "have good tooltips in all control surfaces").
//
//   node scripts/tooltip-audit.mjs [--base <origin>] [--url <page>]... [--width 1440]
//                                  [--theme light|dark] [--edit] [--allow <selector>]...
//                                  [--freeform-url <edit url>] [--strict] [--json] [--report]
//
// Walks the built client, as served by a running studio (the default pages are the editor on
// the GT deck with editing on, the viewer and the deck list on http://localhost:4321), and lists
// every interactive element that carries no tooltip: an element is covered when it, or an
// ancestor, carries `data-tip` (the Tooltip primitive, packages/chrome/src/Tooltip.tsx); an
// element whose only tooltip is a native `title` is reported apart as title-only (the browser's
// plain title after its own delay, without the name, sentence and key plate) and fails the audit
// only under --strict; a Seg option, a menu item, an input, a select, a link and anything with a
// button or option role is interactive; `<option>` elements, the hidden native mirrors of the
// composite controls (.ts-native-mirror), the sheet's own content (.ts-sheet, .ts-stage) and
// elements under [aria-hidden="true"] are not. The audit opens the surfaces a first look does
// not show: the Insert and Export menus, the palette, a slide row's menu, and, with --edit, the
// inspector with a block selected. Against a server on this checkout (a localhost base) it also
// seeds a scratch deck with one freeform slide, decks/tooltip-audit, selects a positioned block
// there and walks the stage's handles and the arrange bar, then removes the deck; elsewhere pass
// --freeform-url <edit url of a freeform slide> or the surface is skipped and said so. Exit 0
// when every page is covered, 1 when an element is missing, 2 when a page could not be walked.
// Since the focus round (docs/FOCUS.md 3.1) the audit runs in two passes: the default view (Tools
// > Advanced tools off, the parked controls absent) and, with `--advanced`, the switch on (the
// page's `ts-editor-settings` seeded with `{ "advancedTools": true }` before the load), so every
// control a person can reach is hovered in one of the two passes; the expected set of each pass is
// what the page draws, since a parked control is hidden, never disabled.
// --report prints the results without failing; --json prints them as one JSON object. The
// verifier runs it against the server the check starts on 4321 (AGENTS.md dev server rules); a
// browser comes from @turboslide/headless/launch through playwright-core, never a second dev
// server.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchBrowser } from '../packages/headless/src/launch.ts';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const values = (name) => {
  const out = [];
  for (let i = 0; i < argv.length; i += 1)
    if (argv[i] === `--${name}` && argv[i + 1]) out.push(argv[i + 1]);
  return out;
};

const BASE = values('base')[0] ?? 'http://localhost:4321';
const urls = values('url');
// the default pages: the editor, the viewer, the files page and, since round four, the /home
// product page (gslides-parity SPEC-4 2.6, 6.2; build-4/b2.md R3). One page alone is `--url`.
const pages =
  urls.length > 0
    ? urls
    : [`${BASE}/edit/gt-brand`, `${BASE}/deck/gt-brand`, `${BASE}/decks`, `${BASE}/home`];
const width = Number(values('width')[0] ?? 1440);
const theme = values('theme')[0] ?? 'light';
const edit = flag('edit') || urls.length === 0;
const allow = values('allow');
const asJson = flag('json');
const report = flag('report');
const strict = flag('strict');
const freeformUrl = values('freeform-url')[0];
const advanced = flag('advanced');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** The scratch deck with the freeform slide, seeded from decks/fixture on a localhost base. */
const SCRATCH_DECK = 'tooltip-audit';
const FREEFORM_SLIDE = 'freeform';

/** The selector of what counts as a control surface. */
const INTERACTIVE =
  'button, a[href], input, select, textarea, summary, [role="button"], [role="option"], [role="menuitem"], [role="tab"], [role="switch"], [role="checkbox"], [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/** Where the audit does not look: the rendered sheet and its stage, the hidden mirrors, hidden trees. */
const EXCLUDED = '.ts-sheet, .ts-stage, .ts-native-mirror, [aria-hidden="true"], [hidden], option';

/**
 * Runs inside the page: every interactive element outside the excluded regions that does not
 * carry the tooltip primitive (or sit under an element that does), with enough of a description
 * to find it again: `missing` has no tooltip at all, `titleOnly` a native title and nothing more.
 */
const walk = ({ interactive, excluded, allow }) => {
  const missing = [];
  const titleOnly = [];
  const seen = new Set();
  for (const el of document.querySelectorAll(interactive)) {
    if (el.closest(excluded)) continue;
    if (el.closest('[data-tip]')) continue;
    if (allow.some((selector) => el.matches(selector) || el.closest(selector))) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const control = el.getAttribute('data-control');
    const label =
      el.getAttribute('aria-label') ??
      el.getAttribute('placeholder') ??
      el.textContent.replace(/\s+/g, ' ').trim().slice(0, 60);
    const key = `${el.tagName}|${control ?? ''}|${label}|${el.className}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const hit = {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      control,
      label,
      className: typeof el.className === 'string' ? el.className : '',
    };
    if (el.closest('[title]')) titleOnly.push(hit);
    else missing.push(hit);
  }
  return { missing, titleOnly };
};

/** The surfaces a page hides until asked: menus, the palette, a row menu, the inspector's block. */
async function openSurfaces(page, options) {
  const clickAll = async (selector) => {
    const handles = await page.$$(selector);
    for (const handle of handles) {
      try {
        await handle.click({ timeout: 1000 });
        await page.waitForTimeout(120);
      } catch {
        // a control that is not clickable at this width is not a finding
      }
    }
  };
  const results = [];
  const collect = async (name) => {
    const { missing, titleOnly } = await page.evaluate(walk, options);
    results.push({ surface: name, hits: missing, titleOnly });
  };
  await collect('page');
  /* a slide row's menu */
  if (await page.$('.pt-orow-more')) {
    await clickAll('.pt-orow-more >> nth=0');
    await collect('row menu');
    await page.keyboard.press('Escape');
  }
  /* the Insert menu */
  if (await page.$('[data-control="insert.open"]')) {
    await clickAll('[data-control="insert.open"]');
    await collect('insert menu');
    await page.keyboard.press('Escape');
  }
  /* the Export menu */
  if (await page.$('[data-control="export.open"]')) {
    await clickAll('[data-control="export.open"]');
    await collect('export menu');
    await page.keyboard.press('Escape');
  }
  /* the palette */
  if (await page.$('[data-control="palette.open"]')) {
    await clickAll('[data-control="palette.open"]');
    await collect('palette');
    await page.keyboard.press('Escape');
  }
  /* the inspector with a block selected: the first block row */
  if (await page.$('.ts-insp-block-row')) {
    await clickAll('.ts-insp-block-row >> nth=0');
    await page.waitForTimeout(200);
    await collect('inspector, block selected');
  }
  return results;
}

/**
 * The freeform stage: the page is the editor on a slide whose blocks carry `pos`; the window API
 * goes to it, the inspector's block list selects the first positioned block, and the walk sees
 * the move chip, the eight resize squares and the arrange bar (the controls the other pages
 * never show, and the ones that carried native titles before the editor depth fixes).
 */
async function freeformSurface(page, options, slideId) {
  const results = [];
  const collect = async (name) => {
    const { missing, titleOnly } = await page.evaluate(walk, options);
    results.push({ surface: name, hits: missing, titleOnly });
  };
  if (slideId) {
    await page.evaluate(
      (id) => window.turboslide?.studio?.invoke('view.goto', { slideId: id }),
      slideId,
    );
    await page
      .waitForFunction((id) => document.querySelector(`.pt-viewer[data-active="${id}"]`), slideId, {
        timeout: 15000,
      })
      .catch(() => {});
  }
  await page.waitForFunction(() => document.querySelector('.ts-overlay[data-freeform]'), null, {
    timeout: 15000,
  });
  const row = await page.$('.ts-insp-block-row');
  if (!row) throw new Error('the freeform slide lists no block in the inspector');
  await row.click({ timeout: 2000 });
  await page.waitForSelector('.ts-arrange', { timeout: 5000 });
  await collect('freeform stage, block selected');
  return results;
}

/**
 * The scratch deck: decks/fixture copied to decks/<SCRATCH_DECK> with one added slide of two
 * positioned paragraphs on the freeform layout, valid for the store as the overlay test's
 * fixture is (packages/chrome/src/__tests__/overlay-component.test.tsx).
 */
function seedScratchDeck() {
  const fixture = join(ROOT, 'decks', 'fixture');
  if (!existsSync(join(fixture, 'deck.json'))) return null;
  const dir = join(ROOT, 'decks', SCRATCH_DECK);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(join(fixture, 'slides'), join(dir, 'slides'), { recursive: true });
  const manifest = JSON.parse(readFileSync(join(fixture, 'deck.json'), 'utf8'));
  manifest.id = SCRATCH_DECK;
  manifest.sections[0].slideIds.push(FREEFORM_SLIDE);
  writeFileSync(join(dir, 'deck.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const placed = (id, pos) => ({ id, type: 'paragraph', text: `Block ${id}`, pos });
  const slide = {
    schemaVersion: 1,
    id: FREEFORM_SLIDE,
    kind: 'content',
    layout: { type: 'freeform' },
    slots: {
      main: [
        placed('a', { x: 200, y: 200, w: 400, h: 100, z: 0 }),
        placed('b', { x: 700, y: 300, w: 300, h: 80, z: 1 }),
      ],
    },
  };
  writeFileSync(
    join(dir, 'slides', `${FREEFORM_SLIDE}.json`),
    `${JSON.stringify(slide, null, 2)}\n`,
  );
  return dir;
}

function removeScratchDeck() {
  rmSync(join(ROOT, 'decks', SCRATCH_DECK), { recursive: true, force: true });
  rmSync(join(ROOT, '.turboslide', 'worker', 'cache', SCRATCH_DECK), {
    recursive: true,
    force: true,
  });
  rmSync(join(ROOT, '.turboslide', 'thumbs', SCRATCH_DECK), { recursive: true, force: true });
}

/** Loads a studio page and waits for the shell or the window API, as main() does. */
async function loadPage(page, target) {
  await page.addInitScript(
    ([value, on]) => {
      localStorage.setItem('gt-theme', value);
      /* the second pass of the focus round: Tools > Advanced tools on before the first paint */
      if (on) localStorage.setItem('ts-editor-settings', JSON.stringify({ advancedTools: true }));
    },
    [theme, advanced],
  );
  const response = await page.goto(target, { waitUntil: 'load', timeout: 60000 });
  if (!response || response.status() >= 400) {
    throw new Error(`status ${response?.status() ?? 'none'}`);
  }
  await page
    .waitForFunction(
      () =>
        Boolean(document.querySelector('.pt-viewer[data-settled]')) ||
        Boolean(window.turboslide?.studio) ||
        Boolean(document.querySelector('.ts-decks-page')) ||
        /* the /home product page and the files pages stamp data-hydrated on their main element */
        Boolean(document.querySelector('main[data-hydrated]')),
      null,
      { timeout: 60000 },
    )
    .catch(() => {});
  await page.waitForTimeout(1200);
}

async function main() {
  const launched = await launchBrowser({ probeRenderer: false });
  const context = await launched.browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const pagesOut = [];
  let missing = 0;
  let titleOnly = 0;
  let broken = 0;
  const options = { interactive: INTERACTIVE, excluded: EXCLUDED, allow };
  const count = (surfaces, key) => surfaces.reduce((sum, surface) => sum + surface[key].length, 0);
  try {
    for (const url of pages) {
      const target =
        edit && /\/edit\//.test(url) && !/[?&]edit=/.test(url)
          ? `${url}${url.includes('?') ? '&' : '?'}edit=1`
          : url;
      try {
        /* load, then the shell's settle or the window API: in thumbnail density the sidebar keeps
           fetching thumbnails, so the network never goes idle (measured 2026-09-11) */
        await loadPage(page, target);
        const surfaces = await openSurfaces(page, options);
        missing += count(surfaces, 'hits');
        titleOnly += count(surfaces, 'titleOnly');
        pagesOut.push({ url: target, surfaces });
      } catch (error) {
        broken += 1;
        pagesOut.push({
          url: target,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    /* the freeform stage: a given URL, else the scratch deck on a localhost base */
    const localBase = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE);
    let freeformTarget = freeformUrl ?? null;
    let seeded = null;
    if (freeformTarget === null && localBase && urls.length === 0) {
      seeded = seedScratchDeck();
      if (seeded !== null) freeformTarget = `${BASE}/edit/${SCRATCH_DECK}?edit=1`;
    }
    if (freeformTarget !== null) {
      try {
        await loadPage(page, freeformTarget);
        const surfaces = await freeformSurface(
          page,
          options,
          seeded !== null ? FREEFORM_SLIDE : null,
        );
        missing += count(surfaces, 'hits');
        titleOnly += count(surfaces, 'titleOnly');
        pagesOut.push({ url: freeformTarget, surfaces });
      } catch (error) {
        broken += 1;
        pagesOut.push({
          url: freeformTarget,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (seeded !== null) removeScratchDeck();
      }
    } else if (urls.length === 0) {
      pagesOut.push({
        url: `${BASE}/edit/<freeform>`,
        skipped:
          'freeform stage not walked: the base is not this checkout; pass --freeform-url <edit url of a freeform slide>',
      });
    }
  } finally {
    await context.close();
    await launched.browser.close();
  }

  if (asJson) {
    console.log(
      JSON.stringify({ width, theme, pages: pagesOut, missing, titleOnly, broken }, null, 2),
    );
  } else {
    const describe = (surface, hit) => {
      const where = hit.control
        ? `[data-control="${hit.control}"]`
        : hit.className
          ? `.${hit.className.split(' ')[0]}`
          : '';
      return `  ${surface.surface}: <${hit.tag}${hit.role ? ` role=${hit.role}` : ''}> ${where} ${JSON.stringify(hit.label)}`;
    };
    for (const entry of pagesOut) {
      if ('error' in entry) {
        console.log(`tooltip-audit: ${entry.url}: could not walk (${entry.error})`);
        continue;
      }
      if ('skipped' in entry) {
        console.log(`tooltip-audit: ${entry.url}: ${entry.skipped}`);
        continue;
      }
      const total = count(entry.surfaces, 'hits');
      const titles = count(entry.surfaces, 'titleOnly');
      console.log(
        `tooltip-audit: ${entry.url}: ${total} interactive element${total === 1 ? '' : 's'} without a tooltip, ${titles} with a native title only`,
      );
      for (const surface of entry.surfaces) {
        for (const hit of surface.hits) console.log(describe(surface, hit));
        for (const hit of surface.titleOnly) console.log(`${describe(surface, hit)} (title only)`);
      }
    }
    console.log(
      `tooltip-audit: ${missing} missing, ${titleOnly} title only${strict ? ' (strict: counted as missing)' : ''}, ${broken} page${broken === 1 ? '' : 's'} not walked`,
    );
  }
  if (broken > 0) process.exit(2);
  if ((missing > 0 || (strict && titleOnly > 0)) && !report) process.exit(1);
}

main().catch((error) => {
  console.error(`tooltip-audit: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(2);
});
