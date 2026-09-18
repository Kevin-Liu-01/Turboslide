// Decks and the home surfaces, the probe's rows (docs/FOCUS.md 2.1, 6.4 `decks.*` with the
// driver `probe --core`): the draft on /new, the first write that creates the deck, the save
// words, every rename path of the title row, the tab title after a rename, the mark back to
// /decks and the reload with the slide hash. The list and trash surfaces are core/decks.spec.ts.
// `decks.editor.move-to-trash` is the finally block's row (index.mjs `cleanup`).

export const NAME = 'decks';
export const IDS = [
  'decks.new.draft',
  'decks.new.ground-paint',
  'decks.new.first-write',
  'decks.title.save-words',
  'decks.title.rename-enter',
  'decks.title.rename-escape',
  'decks.title.rename-blur',
  'decks.title.rename-empty',
  'decks.title.file-rename',
  'decks.title.tab-title-after-rename',
  'decks.title.mark-to-list',
  'decks.edit.reload-keeps-slide',
];

const TITLE = 'Pipeline review: Acme, Q3 2026';

/** Clicks the deck name in the title row and waits for its field; returns the field's value. */
async function openNameField(t) {
  const btn = t.page.locator('button[data-control="deck.name"]').first();
  const r = await btn.boundingBox();
  if (!r) throw new Error('no deck name button in the title row');
  await t.clickAt(r.x + r.width / 2, r.y + r.height / 2);
  await t.page.locator('input[data-control="deck.name"]').waitFor({ timeout: 6000 });
  await t.sleep(200);
  return t.page.locator('input[data-control="deck.name"]').inputValue();
}

/** Types a new name into the open field (select all first) at human speed. */
async function retype(t, name) {
  await t.press('Meta+a');
  await t.typeHuman(name);
  await t.sleep(200);
}

/** The deck's stored title through deck.info. */
async function storedTitle(t) {
  const info = await t.invoke('deck.info');
  return info.title ?? info.name ?? null;
}

/** The name the title row shows (the button's text, or the field's value while it is open). */
async function shownName(t) {
  return t.page.evaluate(() => {
    const input = document.querySelector('input[data-control="deck.name"]');
    if (input) return input.value;
    return document.querySelector('[data-control="deck.name"]')?.textContent?.trim() ?? null;
  });
}

export async function run(t) {
  const { page, BASE } = t;

  await t.step(
    'decks.new.draft',
    'open /new',
    'revision 0, Not saved yet, the title placeholder prompts',
    async () => {
      await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
      await t.editorReady();
      t.deck.build = await page.evaluate(() => {
        const d = window.turboslide.studio.describe();
        return { version: d.version ?? d.build ?? null, keys: Object.keys(d.state ?? {}) };
      });
      const info = await t.invoke('deck.info');
      t.deck.id = info.id;
      const s = await t.state();
      const words = await t.saveWords();
      const prompts = await t.count(
        '.ts-stagewrap.ts-editor .pt-slide [data-run] [data-prompt], .ts-stagewrap.ts-editor .pt-slide [data-prompt]',
      );
      const allRuns = await t.runs();
      t.deck.head = allRuns.find((r) => /heading/.test(r)) ?? allRuns[0] ?? null;
      t.deck.body = allRuns.find((r) => r !== t.deck.head) ?? null;
      t.deck.titleSlide = s.slideId;
      // the anonymous name prompt is a floating card; close it so it never sits over the sheet
      if (await t.visible('dialog.namePrompt'))
        await t.clickControl('dialog.namePrompt.close').catch(() => undefined);
      return {
        ok:
          /^untitled-/.test(info.id) &&
          s.revision === 0 &&
          words === 'Not saved yet' &&
          prompts > 0 &&
          Boolean(t.deck.head),
        observed: `${info.id}; revision ${s.revision}; save words "${words}"; prompts ${prompts}; runs ${allRuns.join(',')}`,
      };
    },
  );
  if (!t.deck.id) throw new Error('no draft id');

  await t.step(
    'decks.new.ground-paint',
    'read the ground canvases and the pointer at the title, before the first write',
    'no canvas is stretched past its drawn scale, nothing painted runs past the sheet over the stage, and the pointer meets the title run and the sheet at their centres',
    async () => {
      /* VERIFICATION.md C2-F26: one /new load of the enforce preview drew the dither ramp over
         the stage at many times its scale and the title could not be clicked ("covered by html");
         the row reads the bitmaps against their boxes and what the pointer meets, so the race is
         named when it recurs instead of failing the first write on an actionability wait */
      const facts = await t.groundPaintFacts();
      const oversized = t.oversizedCanvases(facts);
      return {
        ok: t.groundPaintOk(facts),
        observed: `${oversized.length > 0 ? `stretched: ${oversized.map((c) => `${c.cls} at ${c.perCell} px per cell`).join(', ')}; ` : ''}${t.describeGroundPaint(facts)}`,
      };
    },
  );

  await t.step(
    'decks.new.first-write',
    'double click the title, type, Escape',
    'revision 1, the address moves to /edit/<id>, the save words read Saving then All changes saved',
    async () => {
      const on = await t.openRun(t.deck.head);
      const seen = new Set();
      const watcher = (async () => {
        const until = Date.now() + 25_000;
        while (Date.now() < until) {
          const w = await t.saveWords().catch(() => null);
          if (w) seen.add(w);
          if (w === 'All changes saved' && seen.has('Saving…')) break;
          await t.sleep(60);
        }
      })();
      await t.typeHuman(TITLE);
      await t.sleep(300);
      await t.press('Escape');
      await t.waitRevision(1, 30_000);
      const s = await t.settled();
      await watcher;
      const words = await t.pollUntil(t.saveWords, (w) => w === 'All changes saved', 10_000);
      const stored = JSON.stringify(await t.slideJson(t.deck.titleSlide)).includes(TITLE);
      if (await t.visible('dialog.namePrompt'))
        await t.clickControl('dialog.namePrompt.close').catch(() => undefined);
      return {
        ok:
          on &&
          /\/edit\//.test(page.url()) &&
          s.revision >= 1 &&
          words === 'All changes saved' &&
          stored,
        observed: `editing ${on}; ${t.url()}; revision ${s.revision}; words seen ${[...seen].join(' > ')}; final "${words}"; stored ${stored}`,
      };
    },
  );

  await t.step(
    'decks.title.save-words',
    'a second edit',
    'the save words turn to Saving and back to All changes saved',
    async () => {
      const seen = [];
      const on = await t.openRun(t.deck.head);
      await t.press('End');
      const watcher = (async () => {
        const until = Date.now() + 20_000;
        while (Date.now() < until) {
          const w = await t.saveWords().catch(() => null);
          if (w && seen[seen.length - 1] !== w) seen.push(w);
          if (w === 'All changes saved' && seen.includes('Saving…')) break;
          await t.sleep(50);
        }
      })();
      await t.typeHuman(' again');
      await t.press('Escape');
      await t.settled();
      await watcher;
      const words = await t.pollUntil(t.saveWords, (w) => w === 'All changes saved', 10_000);
      return {
        ok: on && seen.includes('Saving…') && words === 'All changes saved',
        observed: `words ${seen.join(' > ')}; final "${words}"`,
      };
    },
  );

  const NAME_1 = 'Acme renewal deck';
  await t.step(
    'decks.title.rename-enter',
    'click the deck name, type, Enter',
    'the name and deck.info title change',
    async () => {
      const before = await openNameField(t);
      await retype(t, NAME_1);
      await t.press('Enter');
      await t.settled();
      const stored = await t.pollUntil(
        () => storedTitle(t),
        (n) => n === NAME_1,
        10_000,
      );
      const shown = await shownName(t);
      return {
        ok: stored === NAME_1 && shown === NAME_1,
        observed: `"${before}" -> shown "${shown}", stored "${stored}"`,
      };
    },
  );

  await t.step(
    'decks.title.rename-escape',
    'click the deck name, type, Escape',
    'the name is restored',
    async () => {
      const before = await openNameField(t);
      await retype(t, 'Thrown away');
      await t.press('Escape');
      await t.sleep(600);
      const shown = await shownName(t);
      const stored = await storedTitle(t);
      return {
        ok: shown === before && stored === before,
        observed: `before "${before}"; shown "${shown}"; stored "${stored}"`,
      };
    },
  );

  const NAME_2 = 'Acme renewal deck v2';
  await t.step(
    'decks.title.rename-blur',
    'click the deck name, type, click the canvas',
    'the typed name is kept',
    async () => {
      await openNameField(t);
      await retype(t, NAME_2);
      const sheet = await t.sheetRect();
      await t.clickAt(sheet.x + sheet.w - 30, sheet.y + sheet.h - 30);
      await t.settled();
      const stored = await t.pollUntil(
        () => storedTitle(t),
        (n) => n === NAME_2,
        10_000,
      );
      await t.press('Escape');
      return {
        ok: stored === NAME_2 && (await shownName(t)) === NAME_2,
        observed: `stored "${stored}"; shown "${await shownName(t)}"`,
      };
    },
  );

  await t.step(
    'decks.title.rename-empty',
    'clear the deck name and press Enter',
    'the old name comes back',
    async () => {
      const before = await openNameField(t);
      await t.press('Meta+a');
      await t.press('Backspace');
      await t.sleep(200);
      await t.press('Enter');
      await t.sleep(800);
      await t.settled();
      const shown = await shownName(t);
      const stored = await storedTitle(t);
      return {
        ok: shown === before && stored === before,
        observed: `before "${before}"; shown "${shown}"; stored "${stored}"`,
      };
    },
  );

  await t.step(
    'decks.title.file-rename',
    'File > Rename',
    'the name field takes the focus',
    async () => {
      await t.menuPath('file', 'file.rename');
      await t.sleep(300);
      const focus = await t.activeDesc();
      const fieldOpen = await t.has('input[data-control="deck.name"]');
      await t.press('Escape');
      await t.sleep(300);
      return {
        ok: fieldOpen && /\[deck\.name\]/.test(focus),
        observed: `field open ${fieldOpen}; focus ${focus}`,
      };
    },
  );

  await t.step(
    'decks.title.tab-title-after-rename',
    'rename the deck and read document.title',
    'the browser tab title reads the new name without a reload',
    async () => {
      const NAME_3 = 'Acme renewal deck v3';
      await openNameField(t);
      await retype(t, NAME_3);
      await t.press('Enter');
      await t.settled();
      const title = await t.pollUntil(
        () => t.docTitle(),
        (x) => x.includes(NAME_3),
        5000,
      );
      return { ok: title.includes(NAME_3), observed: `document.title "${title}"` };
    },
  );

  await t.step(
    'decks.title.mark-to-list',
    'click the Turboslide mark',
    '/decks opens',
    async () => {
      await t.clickControl('title.home');
      await page.waitForURL(/\/decks(\?.*)?$/, { timeout: 15_000 });
      const where = t.url();
      await page
        .waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 })
        .catch(() => undefined);
      const listed = await t.pollUntil(
        () => t.has(`[data-control="home.card.${t.deck.id}"]`),
        (x) => x,
        15_000,
      );
      // back to the editor for the rest of the walk
      await page.goto(`${BASE}/edit/${t.deck.id}`, { waitUntil: 'domcontentloaded' });
      await t.editorReady();
      await t.settled();
      return { ok: /\/decks/.test(where), observed: `${where}; the deck's card listed ${listed}` };
    },
  );

  await t.step(
    'decks.edit.reload-keeps-slide',
    'reload /edit/<id>#s/<slide>',
    'the same slide is current after the reload',
    async () => {
      const second = await t.setupSlide(t.deck.titleSlide);
      if (!second) return { ok: false, observed: 'no second slide could be added for the row' };
      t.deck.secondSlide = second;
      await t.clickCard(second);
      const hash = await t.pollUntil(t.hash, (h) => h === `#s/${second}`, 5000);
      await t.reloadTo(`${BASE}/edit/${t.deck.id}#s/${second}`);
      const active = await t.pollUntil(t.activeSlide, (a) => a === second, 10_000);
      const hashAfter = await t.hash();
      return {
        ok: hash === `#s/${second}` && active === second,
        observed: `hash before reload ${hash}; active after ${active}; hash after ${hashAfter}`,
      };
    },
  );
}
