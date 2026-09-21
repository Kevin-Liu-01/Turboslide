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
  'decks.name.follows-heading',
  'decks.file.open-list-search',
  'decks.file.import-slides-deck',
  'decks.file.details',
];

/**
 * The scratch deck's title, 32 characters, typed in two bursts by the first write (the return
 * round's `decks.name.follows-heading`: the deck used to take its name from the first burst that
 * landed, audit-chrome row 2, audit-surface row 5).
 */
const TITLE = 'Pipeline review: Acme Q3 2026 v2';

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
          /* the untouched draft shows no save words until the first edit (docs/PRODUCT.md section 2
             rank 30; the cell keeps its width): empty, or the phrase on a build before the rule */
          (words === '' || words === 'Not saved yet') &&
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
      /* the first eight characters, then the save and the address, then the rest: the two bursts
         of decks.name.follows-heading (RETURN.md 2.18), the row driven right after this one */
      await t.typeHuman(TITLE.slice(0, 8));
      await t.waitRevision(1, 30_000);
      await page.waitForURL(/\/edit\//, { timeout: 30_000 }).catch(() => undefined);
      await t
        .pollUntil(
          () => t.attr('[data-control="deck.saveState"]', 'data-state'),
          (x) => x === 'saved',
          20_000,
        )
        .catch(() => undefined);
      t.deck.firstBurstName = await t.textOf('deck.name');
      await t.typeHuman(TITLE.slice(8));
      await t.sleep(300);
      await t.press('Escape');
      const s = await t.settled();
      await watcher;
      const words = await t.pollUntil(t.saveWords, (w) => w === 'All changes saved', 10_000);
      const stored = JSON.stringify(await t.slideJson(t.deck.titleSlide)).includes(TITLE);
      if (await t.visible('dialog.namePrompt')) await t.dismissPrompts().catch(() => undefined);
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
    'decks.name.follows-heading',
    'after the first write in two bursts, read the title row, deck.info, Details and the Share dialog heading',
    'every one reads the whole 32 characters',
    async () => {
      await t.clearAll();
      const shownName = await t.textOf('deck.name');
      const info = await t.invoke('deck.info');
      await t.menuPath('file', 'file.details').catch(() => undefined);
      const details = await t
        .waitControl('dialog.details.title', 6000)
        .then(() => t.textOf('dialog.details.title'))
        .catch(() => null);
      if (await t.visible('dialog.details.done')) await t.clickControl('dialog.details.done');
      else await t.press('Escape');
      await t.waitGone('[data-control="dialog.details"]', 4000);
      await t.clickControl('share.open');
      await t.waitControl('dialog.share', 8000);
      const shareHeading = await page.evaluate(
        () =>
          document
            .querySelector(
              '[data-control="dialog.share"] .ts-dialog-title, [data-control="dialog.share"] h2',
            )
            ?.textContent?.trim() ?? null,
      );
      if (await t.visible('dialog.share.done')) await t.clickControl('dialog.share.done');
      else await t.press('Escape');
      /* the dialog leaves before the next row edits the heading: on the blob tier under enforce
         its close waited past 4 s once and the save words row found the heading covered by the
         dialog's rows (the third enforce preview's chrome walk, build/integrator.md section 8) */
      if (!(await t.waitGone('[data-control="dialog.share"]', 4000))) {
        await t.press('Escape');
        await t.waitGone('[data-control="dialog.share"]', 8000);
      }
      const heading = ((await t.runInfo(t.deck.head))?.text ?? '').replace(/\u00a0/g, ' ').trim();
      return {
        ok:
          heading === TITLE &&
          shownName === TITLE &&
          info.title === TITLE &&
          details === TITLE &&
          (shareHeading ?? '').includes(TITLE),
        observed: `heading "${heading}"; title row "${shownName}" (after the first burst "${t.deck.firstBurstName ?? 'unread'}"); deck.info "${info.title}"; Details "${details}"; Share heading "${shareHeading}"`,
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

  // ---- the return round's rows (docs/RETURN.md 2.17, section 5)
  await t.step(
    'decks.file.open-list-search',
    'File > Open; read the list; type in the search; clear it',
    "this studio's decks are listed newest first and the search filters them",
    async () => {
      const r = await t.reachRow('file', 'file.open');
      if (!r.present) return { ok: false, observed: 'File > Open is not reachable' };
      await t.menuPath('file', 'file.open');
      await t.waitControl('dialog.open', 8000);
      const rows = () =>
        page.evaluate(() =>
          [...document.querySelectorAll('[data-control^="dialog.open.deck."]')]
            .filter((e) => e.getClientRects().length > 0)
            .map((e) => e.getAttribute('data-control').replace('dialog.open.deck.', '')),
        );
      /* the blob tier's deck.list reads every manifest of the store, four at a time (blob-store.ts
         `list`): 66 decks answered in 4.5 to 5.5 s on the return round's enforce preview, and the
         dialog showed Loading for that long, so a bound of 8 s read 0 decks (the first preview
         drive; return/build/integrator.md). The row's words carry no bound; the list is waited for
         up to 30 s and the wait is on record in the observation */
      const t0 = Date.now();
      const listed = await t.pollUntil(rows, (l) => l.length > 0, 30_000).catch(rows);
      const listMs = Date.now() - t0;
      await t.clickControl('dialog.open.search');
      await t.typeHuman('zzqqxx nothing');
      await t.sleep(400);
      const filtered = await rows();
      await t.press('Meta+a');
      await t.press('Backspace');
      await t.sleep(400);
      const restored = await rows();
      await t.press('Escape');
      await t.waitGone('[data-control="dialog.open"]', 4000);
      if (await t.visible('dialog.open'))
        await t.clickControl('dialog.open.close').catch(() => t.press('Escape'));
      return {
        ok:
          listed.length > 0 &&
          listed[0] === t.deck.id &&
          filtered.length === 0 &&
          restored.length === listed.length,
        observed: `${r.switched ? 'with the switch on; ' : ''}${listed.length} decks listed after ${listMs} ms, first ${listed[0]}; filtered by nonsense ${filtered.length}; cleared ${restored.length}`,
      };
    },
  );
  await t.step(
    'decks.file.import-slides-deck',
    'a copy of this deck (a setup write); File > Import slides, pick the copy, All, Import slides',
    'the slides land after the current one; the copy is removed after',
    async () => {
      const r = await t.reachRow('file', 'file.importSlides');
      if (!r.present) return { ok: false, observed: 'File > Import slides is not reachable' };
      const s = await t.state();
      const copy = await t
        .invoke('deck.copy', {
          id: t.deck.id,
          name: `Import source ${t.deck.id.replace(/^untitled-/, '')}`,
          baseRevision: s.revision,
        })
        .catch((e) => ({ error: String(e) }));
      const copyId = copy?.deckId ?? copy?.id ?? copy?.deck?.id ?? null;
      if (!copyId)
        return {
          ok: false,
          observed: `the setup copy failed: ${copy?.error ?? JSON.stringify(copy)}`,
        };
      await t.clickCard(t.deck.titleSlide);
      const before = await t.slideOrder();
      /* everything after the copy runs inside one try, and the copy's trash and remove (with the
         imported slides' removal) in its finally: a picker that never offered the copy left it on
         the store in the verifier's runs (VERIFICATION.md R1-F4, `import-source-20260919-cd2a`
         and `-8ciz`; b7.md's fix round request to B4) */
      let offered = 0;
      let after = before;
      let landedAfterCurrent = false;
      let pickedMs = null;
      let gone = null;
      let fault = null;
      try {
        /* the picker's list is the store's `deck.list`; on the blob tier the copy made through
           this instance's window API lists at once on this instance and on another only once the
           folder listing of `decks/` shows it, up to a minute later (blob-store.ts `deckIds`, the
           note on `pull`). The bound follows that mechanism: the dialog is asked for the copy
           for 10 s, closed and opened again, to 65 s in all, and the time recorded; a copy the
           picker never offers fails the row with that reason. On the memory tier the copy is in
           the first list */
        const t0 = Date.now();
        for (;;) {
          await t.menuPath('file', 'file.importSlides');
          await t.waitControl('dialog.importSlides', 8000);
          const present = await t
            .waitControl(`dialog.importSlides.deck.${copyId}`, 10_000)
            .then(() => true)
            .catch(() => false);
          if (present) {
            pickedMs = Date.now() - t0;
            break;
          }
          if (Date.now() - t0 > 65_000) break;
          await t.press('Escape');
          await t.waitGone('[data-control="dialog.importSlides"]', 4000).catch(() => undefined);
          await t.sleep(3000);
        }
        if (pickedMs === null) {
          await t.press('Escape');
          await t.waitGone('[data-control="dialog.importSlides"]', 4000).catch(() => undefined);
        } else {
          await t.clickControl(`dialog.importSlides.deck.${copyId}`);
          await t.waitControl('dialog.importSlides.all', 8000);
          offered = await t.count('[data-control^="dialog.importSlides.slide."]');
          await t.clickControl('dialog.importSlides.all');
          await t.clickControl('dialog.importSlides.ok');
          after = await t
            .pollUntil(t.slideOrder, (o) => o.length === before.length + offered, 20_000)
            .catch(t.slideOrder);
          await t.settled();
          landedAfterCurrent = after.slice(1, 1 + offered).every((id) => !before.includes(id));
        }
      } catch (error) {
        fault = String(error).split('\n')[0];
      } finally {
        /* the imported slides leave again (setup writes), so the areas after this one meet the deck the decks area built */
        for (const id of after.filter((x) => !before.includes(x))) {
          const st = await t.state();
          await t
            .invoke('slide.remove', { baseRevision: st.revision, slideId: id })
            .catch(() => undefined);
          await t.settled().catch(() => undefined);
        }
        /* the copy is trashed and removed through the window API and its 404 read */
        try {
          await page.goto(`${BASE}/edit/${copyId}`, { waitUntil: 'domcontentloaded' });
          await t.editorReady();
          const info = await t.invoke('deck.info');
          await t
            .invoke('deck.trash', { id: copyId, baseRevision: info.revision })
            .catch(() => undefined);
          const again = await t.invoke('deck.info').catch(() => info);
          await t
            .invoke('deck.remove', { id: copyId, baseRevision: again.revision, confirm: true })
            .catch(() => undefined);
        } catch {
          /* the 404 read below says whether the copy is gone */
        } finally {
          await page.goto(`${BASE}/edit/${t.deck.id}`, { waitUntil: 'domcontentloaded' });
          await t.editorReady();
          await t.settled().catch(() => undefined);
          const until = Date.now() + 20_000;
          for (;;) {
            gone = (
              await page.request.get(`${BASE}/edit/${copyId}`, {
                headers: t.headers,
                maxRedirects: 0,
              })
            ).status();
            if (gone === 404 || Date.now() > until) break;
            await t.sleep(2000);
          }
        }
      }
      if (fault !== null)
        return {
          ok: false,
          observed: `${r.switched ? 'with the switch on; ' : ''}copy ${copyId} ${pickedMs === null ? 'not offered by the picker' : `offered after ${pickedMs} ms`}; the step stopped on ${fault}; the imports removed again; the copy answers ${gone}`,
        };
      if (pickedMs === null)
        return {
          ok: false,
          observed: `${r.switched ? 'with the switch on; ' : ''}copy ${copyId} was not offered by the Import slides picker within 65 s (the store's deck.list; on the blob tier the folder listing lags a fresh deck by up to a minute); the copy answers ${gone}`,
        };
      return {
        ok:
          offered === before.length &&
          after.length === before.length + offered &&
          landedAfterCurrent &&
          gone === 404,
        observed: `${r.switched ? 'with the switch on; ' : ''}copy ${copyId} offered ${offered} slides after ${pickedMs} ms; slides ${before.length} -> ${after.length}, landed after the current ${landedAfterCurrent}; the imports removed again; the copy answers ${gone}`,
      };
    },
  );
  await t.step(
    'decks.file.details',
    'File > Details; read the five rows; Done',
    'the name, slide count, sections, created and last edit read; Done closes',
    async () => {
      const r = await t.reachRow('file', 'file.details');
      if (!r.present) return { ok: false, observed: 'File > Details is not reachable' };
      await t.menuPath('file', 'file.details');
      await t.waitControl('dialog.details', 8000);
      const read = async (k) => t.textOf(`dialog.details.${k}`);
      const facts = {
        title: await read('title'),
        slides: await read('slides'),
        sections: await read('sections'),
        created: await read('created'),
        lastEdit: await read('lastEdit'),
      };
      const name = await t.textOf('deck.name');
      const order = await t.slideOrder();
      await t.clickControl('dialog.details.done');
      const closed = await t.waitGone('[data-control="dialog.details"]', 4000);
      return {
        ok:
          facts.title === name &&
          Number(facts.slides) === order.length &&
          Number(facts.sections) >= 1 &&
          Boolean(facts.created) &&
          Boolean(facts.lastEdit) &&
          closed,
        observed: `${r.switched ? 'with the switch on; ' : ''}${JSON.stringify(facts)}; name "${name}"; slides ${order.length}; Done closed ${closed}`,
      };
    },
  );
}
