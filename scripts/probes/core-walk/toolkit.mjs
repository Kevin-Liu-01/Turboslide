// The toolkit of the core walk (docs/FOCUS.md 6.1; the drivers lane of the focus round). The walk
// probe in --core mode hands this module its page helpers and this module adds the three things
// 6.1 asks for: a `step()` that carries a matrix row id as its tag and writes it as `id` in the
// JSON row, a `setup()` whose failure turns every later tagged step of its section into a not
// driven row with the reason "setup failed: <step>", and the per row aggregation (a row with
// several checks passes only when every check passes). Nothing here judges the run; the runner
// (index.mjs) reads the aggregated results through `shipVerdict` over `probeRows()`.
//
// Every helper that drives the product is the probe's own, bound to the one page of the walk so
// an area module reads `t.press('Escape')` instead of `press(page, 'Escape')`. The extra helpers
// at the end (the context menu, the snackbar, the sheet points, the insert tools, the object
// selection, the window API setup writes) are shared by the area modules under ./areas/.

/** Thrown by `setup()` on a failed setup step; `section()` turns it into the not driven cascade. */
export class SetupFailed extends Error {
  constructor(stepName) {
    super(`setup failed: ${stepName}`);
    this.stepName = stepName;
  }
}

/** The probe helpers whose first argument is the page. */
const PAGE_FIRST = [
  'typeHuman',
  'press',
  'moveHuman',
  'drag',
  'clickAt',
  'dblclickAt',
  'invoke',
  'state',
  'editorReady',
  'settled',
  'waitRevision',
  'activeSlide',
  'gotoSlide',
  'slideJson',
  'objectsOf',
  'blockOf',
  'slideOrder',
  'kOf',
  'rectOf',
  'readout',
  'chip',
  'editing',
  'activeDesc',
  'staleWords',
  'runInfo',
  'wordRect',
  'selectionText',
  'wrapFactsOf',
  'caretFacts',
  'placementOf',
  'runs',
  'boxOf',
  'handleRect',
  'handleControls',
  'ctl',
  'openMenu',
  'hoverRow',
  'clickRow',
  'clickControl',
  'has',
  'closeMenus',
  'clearAll',
];

/**
 * Builds the toolkit over the probe's helpers (`lib`), the page and the run's report sink.
 * `report` is `{ rows, results, consoleErrors, shots }` owned by the runner.
 */
export function createToolkit({ page, context, browser, BASE, headers, lib, report, options }) {
  const t = { page, context, browser, BASE, headers, options, consoleErrors: report.consoleErrors };
  for (const [name, fn] of Object.entries(lib)) {
    t[name] = PAGE_FIRST.includes(name) ? (...args) => fn(page, ...args) : fn;
  }
  const { sleep, rand } = lib;
  /**
   * A window API call bounded in time (VERIFICATION.md pass 2 F-stall, F-asset-add-intermittent):
   * `page.evaluate` has no timeout, and an `asset.add` that never answered on the enforce preview
   * held the walk for nine and a half minutes. A call that has not answered within `ms` throws,
   * so the step fails with the action's name and the walk goes on; the call itself keeps running
   * in the page and its late answer is not read.
   */
  t.INVOKE_TIMEOUT_MS = Number(process.env.TURBOSLIDE_WALK_INVOKE_TIMEOUT_MS) || 60_000;
  /** The section running (`{ name, ids, driven }`) and the step running, for the stall record. */
  let current = null;
  let activeStep = null;
  /**
   * The driver's own test of the stall cascade, never set in a run that counts:
   * `TURBOSLIDE_WALK_FAKE_STALL=<action>[@<area>]` makes the first matching window API call hang
   * to its bound, the way the enforce preview's ops route did (C2-F24), so the not driven cascade,
   * the fresh deck and the `decks.save.acknowledged` row can be driven on a dev server in minutes
   * (with `TURBOSLIDE_WALK_INVOKE_TIMEOUT_MS` shortening the bound). The run's JSON records it.
   */
  t.fakeStall = process.env.TURBOSLIDE_WALK_FAKE_STALL ?? null;
  let fakeStalled = false;
  /**
   * Every window API call of the walk that did not answer within its bound, in order: the
   * action, the bound, the time, the deck, the area and the step it served (VERIFICATION.md
   * C2-F24, the stall). The runner reads the list after each area to give the next area a fresh
   * deck, and at the end to judge `decks.save.acknowledged`, the product row the stall fails.
   */
  t.stalls = [];
  t.invoke = (action, input = {}, ms = t.INVOKE_TIMEOUT_MS) => {
    let timer;
    const late = new Promise((_, reject) => {
      timer = setTimeout(() => {
        t.stalls.push({
          action,
          ms,
          at: new Date().toISOString(),
          deck: t.deck?.id ?? null,
          area: current?.name ?? null,
          step: activeStep,
        });
        reject(new Error(`window API ${action} did not answer within ${ms / 1000} s`));
      }, ms);
    });
    const [fakeAction, fakeArea] = t.fakeStall?.split('@') ?? [];
    let call;
    if (
      !fakeStalled &&
      fakeAction !== undefined &&
      action === fakeAction &&
      (!fakeArea || current?.name === fakeArea)
    ) {
      fakeStalled = true;
      console.log(
        `       fake stall: ${action} in ${current?.name ?? 'no area'} hangs to its bound (TURBOSLIDE_WALK_FAKE_STALL)`,
      );
      call = new Promise(() => undefined);
    } else call = lib.invoke(page, action, input);
    return Promise.race([call, late]).finally(() => clearTimeout(timer));
  };

  // ---------------------------------------------------------------------------------------------
  // the table: tagged steps, setup steps, sections

  const record = (id, name, expected, observed, ok, ms) => {
    const row = {
      n: report.rows.length + 1,
      ...(id === null ? {} : { id }),
      step: name,
      expected,
      observed: String(observed),
      ok,
      ...(ms === undefined ? {} : { ms }),
    };
    report.rows.push(row);
    if (id !== null) {
      const entry = report.results.get(id) ?? { steps: [], failed: 0, notDriven: 0, passed: 0 };
      entry.steps.push(row.n);
      if (ok === true) entry.passed += 1;
      else if (ok === false) {
        entry.failed += 1;
        entry.reason ??= `${name}: ${row.observed}`;
      } else {
        entry.notDriven += 1;
        entry.reason ??= row.observed.replace(/^not driven: /, '');
      }
      report.results.set(id, entry);
      current?.driven.add(id);
    }
    const tag = ok === true ? 'ok  ' : ok === false ? 'FAIL' : 'n/d ';
    console.log(
      `${tag} ${String(row.n).padStart(3)} ${id === null ? '' : `[${id}] `}${name}\n       expected: ${expected}\n       observed: ${row.observed}`,
    );
    return row;
  };
  /**
   * A tagged step proves the matrix row `id` (null for a setup observation recorded without the
   * cascade). `fn` returns `{ ok, observed }`; ok null means the step could not be driven and
   * `observed` is the reason. An exception is a failed row, never the end of the walk.
   */
  t.step = async (id, name, expected, fn) => {
    if (id !== null && !report.isProbeId(id))
      throw new RangeError(`${name}: ${id} is not a probe --core row of the matrix`);
    const started = Date.now();
    activeStep = name;
    try {
      await t.dismissPrompts();
      const r = await fn();
      const observed =
        r.ok === null ? `not driven: ${r.observed ?? 'no reason given'}` : (r.observed ?? '');
      const row = record(id, name, expected, observed, r.ok, Date.now() - started);
      if (r.ok === false) await t.recover(row, false);
      return r;
    } catch (error) {
      const row = record(
        id,
        name,
        expected,
        `error: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
        false,
        Date.now() - started,
      );
      await t.recover(row, true);
      return { ok: false, observed: 'error', error };
    } finally {
      activeStep = null;
    }
  };
  /** Records a row from a reading the runner made outside a step (the stall row at the end). */
  t.recordRow = (id, name, expected, observed, ok) => record(id, name, expected, observed, ok);
  /**
   * After a failed step, the page is put back where the next row expects it (VERIFICATION.md
   * F7: a `menuPath` that timed out on a submenu left the Format menu open, no later step closed
   * it, and every row after it read an empty page). A menu or a right click menu the step left
   * open is closed with Escape; a step that threw also closes a dialog or a text session it
   * left open, since its own flow never reached the point where it would have. A judged failure
   * (`ok: false`) keeps its selection: the step closed what it opened and a later check of the
   * same row may still need the object. With `--shots` the failed state is captured first.
   */
  t.recover = async (row, threw) => {
    await t.shot(`${String(row.n).padStart(3, '0')}-${row.id ?? 'setup'}-failed`);
    const state = await t.surfaceClear({ dialogs: threw, session: threw });
    if (state.menus > 0 || state.dialogs > 0 || state.popovers > 0)
      console.log(
        `       recover: still open after the sweep: menus ${state.menus}, dialogs ${state.dialogs}, popovers ${state.popovers}`,
      );
    await t.recoverSave(row);
  };
  /**
   * The save state after a failed step (the cycle 2 walk of 22:01Z: five Format menu rows and
   * the layout runs failed in a row while the title row read "Couldn't save, retrying" and a
   * reject card "A change was not applied: /sections/0/slideIds/1: No slide file for blank-1"
   * stood over the stage; VERIFICATION.md pass 2's F-text-state read the same stretch). The save
   * words and the card's sentence are printed under the failed row; the card is dismissed; and
   * when the save is still stuck after 5 s the editor is loaded again at its address, so the rows
   * after the failed one judge their own interaction and not the refused write, which the ledger
   * then names as the mechanism of the failed row.
   */
  t.recoverSave = async (row) => {
    const read = () =>
      page
        .evaluate(() => {
          const words =
            document.querySelector('[data-control="deck.saveState"]')?.textContent?.trim() ?? null;
          const card = document.querySelector(
            '[data-control^="conflict."], .ts-conflict, .ts-reject-card',
          );
          const root =
            card?.closest('[role="dialog"], [role="alert"], .ts-conflict, .ts-chrome') ?? card;
          return { words, reject: root?.textContent?.trim().slice(0, 240) ?? null };
        })
        .catch(() => ({ words: null, reject: null }));
    let facts = await read();
    if (facts.reject === null && !/Couldn't save|retrying|Not saved/.test(facts.words ?? ''))
      return;
    console.log(
      `       recover: save words "${facts.words ?? 'none'}"; reject card ${facts.reject ? `"${facts.reject}"` : 'none'}`,
    );
    if (facts.reject !== null) {
      /* the card's Dismiss is `conflict.discard` (EditorRoot.tsx, `controller.dismissReject`) */
      const dismiss = page
        .locator('[data-control="conflict.discard"], button:has-text("Dismiss")')
        .first();
      if ((await dismiss.count()) > 0)
        await dismiss.click({ timeout: 2000 }).catch(() => undefined);
      await sleep(300);
    }
    const until = Date.now() + 5000;
    while (Date.now() < until && /Couldn't save|retrying/.test((await read()).words ?? ''))
      await sleep(500);
    facts = await read();
    if (/Couldn't save|retrying/.test(facts.words ?? '')) {
      const address = page.url();
      console.log(
        `       recover: the save is stuck ("${facts.words}"); loading ${address.replace(BASE, '')} again`,
      );
      await t.reloadTo(address).catch(() => undefined);
      await t.settled();
      row.observed = `${row.observed}; the save was stuck after this step ("${facts.words}"${facts.reject ? `, reject card "${facts.reject.slice(0, 120)}"` : ''}) and the editor was loaded again`;
    }
  };
  /**
   * The two prompts the product raises on its own over a long session, closed before a step so
   * they never take the step's keys or its drag: the anonymous principal's name prompt ("How
   * should others see you?", `dialog.namePrompt`; the cycle 2 walk of 21:38Z lost its paste and
   * its 200 percent readout drag to it) is closed by its X, and the recovered writes plate
   * ("N unsaved changes from this browser", `sync.persisted`, drawn after a reload with a pending
   * write) is applied, since the writes are this walk's own. Both are printed to the log.
   */
  t.dismissPrompts = async () => {
    const seen = await page
      .evaluate(() => {
        const visible = (sel) => {
          const el = document.querySelector(sel);
          return el !== null && el.getClientRects().length > 0;
        };
        return {
          namePrompt: visible('[data-control="dialog.namePrompt"]'),
          persisted: visible('[data-control="sync.persisted"]'),
        };
      })
      .catch(() => ({ namePrompt: false, persisted: false }));
    if (seen.namePrompt) {
      /* the dismissal must not move the stage: on the cycle 2 merge gate the prompt closed
         inside the first title row, the focused filmstrip card (the slide the slides area had
         just added) took the key and the title battery ran on that slide (21 rows), so the
         active slide is read before and put back after (the integrator, for b4) */
      const before = await t.activeSlide().catch(() => null);
      const close = page.locator('[data-control="dialog.namePrompt.close"]').first();
      if ((await close.count()) > 0) await close.click({ timeout: 2000 }).catch(() => undefined);
      else await t.press('Escape').catch(() => undefined);
      await sleep(200);
      console.log('       prompt: the name prompt was closed before the step');
      const after = await t.activeSlide().catch(() => null);
      if (before !== null && after !== before) {
        console.log(`       prompt: the stage moved to ${after}; back to ${before}`);
        await t.clickCard(before).catch(() => undefined);
        await sleep(200);
      }
    }
    if (seen.persisted) {
      const words = await t.textOf('sync.persisted');
      await page
        .locator('[data-control="sync.persisted.apply"]')
        .first()
        .click({ timeout: 2000 })
        .catch(() => undefined);
      await sleep(300);
      console.log(`       prompt: "${words}" was applied before the step`);
    }
    return seen;
  };
  /**
   * What the chrome has open over the stage: menubar menus and right click menus, modal dialogs,
   * pickers and popovers, the Format options panel, and whether a text session is live.
   */
  t.surfaceState = () =>
    page
      .evaluate(() => {
        const visible = (el) => el.getClientRects().length > 0;
        return {
          menus: [...document.querySelectorAll('[id^="ts-menu-"], .ts-context-menu')].filter(
            visible,
          ).length,
          dialogs: [...document.querySelectorAll('.ts-dialog-scrim [role="dialog"]')].filter(
            visible,
          ).length,
          popovers: [
            ...document.querySelectorAll(
              '.ts-picker, [data-control$=".plate"], .ts-popover, [data-control="run.link.href"]',
            ),
          ].filter(visible).length,
          panel: document.querySelector('[data-control="panel.formatOptions"]') !== null,
          editing: document.querySelector('.ts-stagewrap.ts-editor[data-editing]') !== null,
        };
      })
      .catch(() => ({ menus: 0, dialogs: 0, popovers: 0, panel: false, editing: false }));
  /**
   * Puts the chrome back to the bare stage the next row expects (VERIFICATION.md pass 2
   * F-text-state: fourteen text rows failed in a row after a submenu miss, their double clicks
   * and right clicks landing on what the failed row left open). Menus, pickers and popovers are
   * closed with Escape; a menu that survives three Escapes is closed by a click on the workspace
   * outside the sheet; a modal dialog is closed by its Done or close control when asked, since a
   * dialog whose focus fell to the body ignores Escape (b3 R19, b4 FR1); a text session is ended
   * with Escape when asked. Returns the state after the sweep.
   */
  t.surfaceClear = async ({ dialogs = false, session = false } = {}) => {
    let state = await t.surfaceState();
    for (let i = 0; i < 3 && (state.menus > 0 || state.popovers > 0); i += 1) {
      await t.press('Escape').catch(() => undefined);
      await sleep(150);
      state = await t.surfaceState();
    }
    if (state.menus > 0) {
      const stage = await t.rectOf('.ts-stagewrap');
      if (stage) await page.mouse.click(stage.x + 8, stage.y + stage.h - 8).catch(() => undefined);
      await sleep(200);
      state = await t.surfaceState();
    }
    if (dialogs && state.dialogs > 0) {
      for (let i = 0; i < 3 && state.dialogs > 0; i += 1) {
        const closer = page
          .locator(
            '.ts-dialog-scrim [role="dialog"] [data-control$=".done"], .ts-dialog-scrim [role="dialog"] [data-control$=".close"], .ts-dialog-scrim [role="dialog"] [data-control$=".cancel"]',
          )
          .last();
        if ((await closer.count()) > 0)
          await closer.click({ timeout: 2000 }).catch(() => undefined);
        else await t.press('Escape').catch(() => undefined);
        await sleep(200);
        state = await t.surfaceState();
      }
    }
    if (session && state.editing) {
      await t.press('Escape').catch(() => undefined);
      await sleep(150);
      state = await t.surfaceState();
    }
    return state;
  };
  /** A setup step: untagged; a failure ends the section and cascades (6.1). Returns fn's result. */
  t.setup = async (name, expected, fn) => {
    const r = await t.step(null, `setup: ${name}`, expected, fn);
    if (r.ok !== true) throw new SetupFailed(name);
    return r;
  };
  /** Records a row the walk could not drive, with the reason. */
  t.skipRow = (id, name, expected, why) => record(id, name, expected, `not driven: ${why}`, null);
  /**
   * Runs an area's steps; `ids` are the rows the area declares. A `SetupFailed` inside marks every
   * declared row not yet recorded as not driven with "setup failed: <step>"; another exception is
   * recorded as a failed untagged row and the remaining rows are not driven with its message.
   */
  t.section = async (name, ids, fn) => {
    current = { name, ids, driven: new Set() };
    console.log(`\n==== ${name} (${ids.length} rows)`);
    try {
      await fn();
    } catch (error) {
      const reason =
        error instanceof SetupFailed
          ? error.message
          : `the ${name} section stopped: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;
      if (!(error instanceof SetupFailed))
        record(
          null,
          `the ${name} section ran to completion`,
          'no exception outside a step',
          reason,
          false,
        );
      for (const id of ids)
        if (!current.driven.has(id))
          record(id, `${name}: ${id}`, 'driven', `not driven: ${reason}`, null);
    } finally {
      current = null;
    }
  };
  t.shot = async (name) => {
    if (!report.shots) return;
    await page.screenshot({ path: `${report.shots}/${name}.png` }).catch(() => undefined);
  };

  // ---------------------------------------------------------------------------------------------
  // reading the product

  /** The text of a control, or null. */
  t.textOf = (control) =>
    page.evaluate(
      (c) => document.querySelector(`[data-control="${c}"]`)?.textContent?.trim() ?? null,
      control,
    );
  /** The value of an input control, or null. */
  t.valueOf = (control) =>
    page.evaluate((c) => {
      const el = document.querySelector(`[data-control="${c}"]`);
      if (!el) return null;
      return 'value' in el ? String(el.value) : (el.textContent?.trim() ?? null);
    }, control);
  /** True while the control is in the DOM and visible. */
  t.visible = (control) => t.has(`[data-control="${control}"]`);
  t.waitControl = (control, timeout = 8000) =>
    page.locator(`[data-control="${control}"]`).first().waitFor({ timeout });
  t.waitGone = async (selector, timeout = 8000) => {
    await page
      .locator(selector)
      .first()
      .waitFor({ state: 'hidden', timeout })
      .catch(() => undefined);
    return !(await t.has(selector));
  };
  t.attr = (selector, name) =>
    page.evaluate(([s, n]) => document.querySelector(s)?.getAttribute(n) ?? null, [selector, name]);
  t.count = (selector) => page.locator(selector).count();
  t.docTitle = () => page.title();
  /**
   * A real reload of an editor address: the page leaves the document first (about:blank), so a
   * change of the hash alone is never a same document navigation the app handles without a load.
   */
  t.reloadTo = async (url) => {
    await page.goto('about:blank');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await t.editorReady();
  };
  /** The sheet footer's counter, "NN / NN", as `{ n, total }` or null. */
  t.counter = () =>
    page.evaluate(() => {
      const el = document.querySelector(
        '.ts-stagewrap .counter, [data-control="view.count"], .counter',
      );
      const text = el?.getAttribute('aria-label') ?? el?.textContent ?? '';
      const m = /(\d+)\s*(?:\/|of)\s*(\d+)/.exec(text);
      return m ? { n: Number(m[1]), total: Number(m[2]), text: text.trim() } : null;
    });
  t.saveWords = () => t.textOf('deck.saveState');
  t.deckName = async () =>
    (await t.invoke('deck.info')).title ?? (await t.invoke('deck.info')).name;
  t.url = () => page.url().replace(BASE, '');
  t.hash = () => page.evaluate(() => location.hash);
  /** The snackbar text (outside the overlay), or null. */
  t.snackbar = () =>
    page.evaluate(
      () =>
        [...document.querySelectorAll('[data-control="snackbar"], .ts-snackbar, .pt-toast')]
          .filter((el) => el.closest('.ts-overlay') === null && el.textContent?.trim())
          .map((el) => el.textContent?.trim() ?? '')
          .join(' | ') || null,
    );
  /** Polls the snackbar for up to `ms`; the first non empty text. */
  t.snackbarWithin = (ms = 4000) => t.pollUntil(t.snackbar, (s) => s !== null, ms, 150);
  /** The visible menu rows of a menu root selector, by row id. */
  t.rowsUnder = (rootSelector) =>
    page.evaluate(
      (root) =>
        [...document.querySelectorAll(`${root} [data-control^="menu."]`)]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => ({
            id: el.getAttribute('data-control').replace(/^menu\./, ''),
            label: el.textContent?.trim() ?? '',
            disabled: el.getAttribute('aria-disabled') === 'true',
            checked: el.getAttribute('aria-checked'),
          })),
      rootSelector,
    );
  /** The rows of an open menubar menu. */
  t.menuRows = (menuId) => t.rowsUnder(`#ts-menu-${menuId}`);
  /** The rows of the open right click menu. */
  t.contextRows = () => t.rowsUnder('.ts-context-menu');
  /** Right clicks at a point and waits for the context menu. */
  t.rightClickAt = async (x, y) => {
    await t.moveHuman({ x: x - 30, y: y - 20 }, { x, y }, 6);
    await sleep(rand(40, 90));
    await page.mouse.click(x, y, { button: 'right' });
    await page
      .locator('.ts-context-menu')
      .first()
      .waitFor({ timeout: 6000 })
      .catch(() => undefined);
    await sleep(rand(200, 350));
    return t.has('.ts-context-menu');
  };
  /** Clicks a row of the open right click menu. */
  t.clickContextRow = async (rowId) => {
    const row = page.locator(`.ts-context-menu [data-control="menu.${rowId}"]`).first();
    const r = await row.boundingBox();
    if (!r) throw new Error(`no context row ${rowId}`);
    await t.clickAt(r.x + r.width / 2, r.y + r.height / 2);
  };
  /** Hovers a row of the open right click menu so its submenu opens. */
  t.hoverContextRow = async (rowId, waitFor) => {
    const row = page.locator(`.ts-context-menu [data-control="menu.${rowId}"]`).first();
    const r = await row.boundingBox();
    if (!r) throw new Error(`no context row ${rowId}`);
    await t.moveHuman(
      { x: r.x - 20, y: r.y + r.height / 2 },
      { x: r.x + r.width / 2, y: r.y + r.height / 2 },
      6,
    );
    await sleep(rand(300, 450));
    if (waitFor) await page.locator(waitFor).first().waitFor({ timeout: 6000 });
  };
  /**
   * Opens a menubar menu, hovers the parents and clicks the last row; closes the menus after. A
   * submenu that has not opened 6 s after the hover is hovered once more from the row's own left
   * edge (a person moves the pointer again); the row fails when the second hover shows nothing.
   */
  t.menuPath = async (menuId, ...rowIds) => {
    await t.surfaceClear();
    await t.openMenu(menuId);
    for (let i = 0; i < rowIds.length - 1; i += 1) {
      const child = `[data-control="menu.${rowIds[i + 1]}"], [data-control="${rowIds[i + 1]}"]`;
      try {
        await t.hoverRow(rowIds[i], child);
      } catch (error) {
        if (!/Timeout/.test(String(error))) throw error;
        const r = await page.locator(`[data-control="menu.${rowIds[i]}"]`).first().boundingBox();
        if (!r) throw error;
        await t.moveHuman(
          { x: r.x + 6, y: r.y + r.height / 2 },
          { x: r.x + r.width / 2, y: r.y + r.height / 2 },
          6,
        );
        await sleep(rand(300, 450));
        try {
          await page.locator(child).first().waitFor({ timeout: 6000 });
        } catch (second) {
          /* a click on a submenu row opens it too (Menu.tsx `activate`): the third and last
             try a person makes when the hover shows nothing */
          await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
          await sleep(rand(300, 450));
          await page
            .locator(child)
            .first()
            .waitFor({ timeout: 4000 })
            .catch(() => {
              throw second;
            });
        }
      }
    }
    // the last element is a menu row, or a plate cell a dynamic submenu draws (the layout tiles
    // `layout.apply.<id>`, the preset cells) named by its own control
    const last = rowIds[rowIds.length - 1];
    if (await t.has(`[data-control="menu.${last}"]`)) await t.clickRow(last);
    else await t.clickControl(last);
    await sleep(rand(250, 400));
  };
  /** Clicks a toolbar tail control, through the More menu when the tail folded it away. */
  t.tailControl = async (control) => {
    if (await t.visible(control)) {
      await t.clickControl(control);
      return control;
    }
    await t.clickControl('toolbar.more');
    await page.locator('#ts-menu-toolbar-more').waitFor({ timeout: 5000 });
    await t.clickControl(`toolbar.more.${control}`);
    return `toolbar.more.${control}`;
  };

  // ---------------------------------------------------------------------------------------------
  // the sheet and the objects

  const SHEET = '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)';
  t.SHEET = SHEET;
  t.sheetRect = () => t.rectOf(SHEET);
  /** A sheet point (1600 by 900 sheet px) as a viewport point. */
  t.sheetPoint = async (sx, sy) => {
    const sheet = await t.sheetRect();
    if (!sheet) throw new Error('no sheet on the stage');
    const kk = sheet.w / 1600;
    return { x: sheet.x + sx * kk, y: sheet.y + sy * kk };
  };
  /** The first object of a slide that was not there before, or null after `timeout`. */
  t.newObjectAfter = async (slideId, before, timeout = 20_000) => {
    const objs = await t.pollUntil(
      () => t.objectsOf(slideId),
      (o) => o.some((x) => !before.includes(x.id)),
      timeout,
    );
    return objs.find((x) => !before.includes(x.id)) ?? null;
  };
  t.objectIds = async (slideId) => (await t.objectsOf(slideId)).map((o) => o.id);
  /**
   * Every block id of a slide, with or without a `pos` (b3 C2-R1): a paste onto a slide that is
   * not a canvas yet converts it in the same write, so the layout's placeholders gain a `pos` and
   * a count of positioned objects alone reads "0 -> 3" for one pasted copy; the block ids tell the
   * copy (the one new id) from the placeholders (their ids were there before).
   */
  t.allBlockIds = async (slideId) => {
    const slide = await t.slideJson(slideId);
    const ids = [];
    const walk = (node) => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (node && typeof node === 'object') {
        if (typeof node.id === 'string' && typeof node.type === 'string') ids.push(node.id);
        for (const v of Object.values(node)) walk(v);
      }
    };
    walk(slide);
    return [...new Set(ids)];
  };
  /**
   * The revision once it has stopped moving for a second (b3 C2-R4): two reads a second apart
   * agree, within `ms`, so a row that judges "no write" is not counting the previous row's write
   * landing over the channel.
   */
  t.stableRevision = async (ms = 10_000) => {
    const until = Date.now() + ms;
    let last = (await t.settled()).revision;
    while (Date.now() < until) {
      await sleep(1000);
      const now = (await t.state()).revision;
      if (now === last) return now;
      last = now;
    }
    return last;
  };
  /**
   * Arms a tool through the Insert menu rows given (the last row may be a plate cell), then clicks
   * the sheet at a sheet point, or drags between two. Never throws: `{ obj, error, route }`.
   */
  t.insertByTool = async (slideId, rows, at, dragTo = null, { text = 'Text' } = {}) => {
    const before = await t.objectIds(slideId);
    let route = 'menu';
    try {
      await t.openMenu('insert');
      for (let i = 0; i < rows.length - 1; i += 1) {
        const next = rows[i + 1];
        await t.hoverRow(rows[i], `[data-control="menu.${next}"], [data-control="${next}"]`);
      }
      const last = rows[rows.length - 1];
      if (await t.has(`[data-control="menu.${last}"]`)) await t.clickRow(last);
      else {
        await t.clickControl(last);
        route = 'plate';
      }
      await sleep(400);
      const p = await t.sheetPoint(at.x, at.y);
      if (dragTo) {
        const q = await t.sheetPoint(dragTo.x, dragTo.y);
        await t.drag(p, q);
      } else await t.clickAt(p.x, p.y);
      const obj = await t.newObjectAfter(slideId, before);
      await sleep(300);
      if (obj && obj.type === 'text' && text !== null && (await t.editing())) {
        await t.typeHuman(text);
        await sleep(300);
      }
      return { obj, error: obj ? null : 'no new object within 20 s', route };
    } catch (error) {
      await t.closeMenus().catch(() => undefined);
      return {
        obj: null,
        error: error instanceof Error ? error.message.split('\n')[0] : String(error),
        route,
      };
    }
  };
  /**
   * The facts of the selection overlay for an object, the reading A1 rule 1 asks for: the move
   * handle and the eight resize handles of the object, the rotation handle, the ring, the chip,
   * whether a text session is live and whether the focus sits in an editable (a caret).
   */
  t.selectionFacts = async (id) => {
    const ctrls = await t.handleControls();
    const dirs = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].filter((d) =>
      ctrls.includes(`handle.${id}.resize.${d}`),
    );
    const facts = await page.evaluate(() => {
      const a = document.activeElement;
      const editable =
        a instanceof HTMLElement &&
        (a.isContentEditable || a.getAttribute('contenteditable') === 'true');
      const sel = window.getSelection();
      const caretInRun =
        editable &&
        sel !== null &&
        sel.rangeCount > 0 &&
        a.contains(sel.getRangeAt(0).startContainer) &&
        a.closest('.ts-stagewrap.ts-editor .pt-slide') !== null;
      return {
        ring: document.querySelector('.ts-overlay .ts-select') !== null,
        chip: document.querySelector('.ts-overlay .ts-select-chip')?.textContent ?? null,
        editing: document.querySelector('.ts-stagewrap.ts-editor[data-editing]') !== null,
        caret: caretInRun,
      };
    });
    return {
      ...facts,
      move: ctrls.includes(`handle.${id}.move`),
      resize: dirs.length,
      rotate: ctrls.some((c) => c === `handle.${id}.rotate` || /\.rotate$/.test(c)),
      handles: ctrls,
      selected: ctrls.includes(`handle.${id}.move`),
    };
  };
  /** A short sentence of the selection facts for an observed column. */
  t.describeSelection = (f) =>
    `move handle ${f.move}; resize handles ${f.resize}; rotate ${f.rotate}; ring ${f.ring}; chip ${f.chip === null ? 'none' : `"${f.chip}"`}; session ${f.editing}; caret ${f.caret}`;
  /** The block id of a run on the stage (a placeholder's block or the text box's), or null. */
  t.blockOfRun = (run) =>
    page.evaluate((r) => {
      const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
      const block = el?.closest('[data-block]');
      return (
        block?.getAttribute('data-block') ??
        el?.getAttribute('data-block') ??
        el?.closest('.free')?.querySelector('[data-block]')?.getAttribute('data-block') ??
        null
      );
    }, run);
  /**
   * The one click of A1 rule 1 on an object, at the centre of its box (its text, for a text box or
   * a placeholder): the click alone, then the selection facts read 250 ms later. Nothing is
   * corrected here; the rows that assert the rule read `facts` and judge it.
   */
  t.clickSelect = async (id, point = null) => {
    let c = point;
    if (!c) {
      const b = await t.boxOf(id);
      if (!b) throw new Error(`no object ${id} on the stage`);
      c = b.inner.w > 4 && b.inner.h > 4 ? t.center(b.inner) : t.center(b.free);
    }
    await t.clickAt(c.x, c.y);
    await sleep(250);
    return { point: c, facts: await t.selectionFacts(id) };
  };
  /**
   * The drag of A1 rule 2: a pointer down at a point inside the object (its centre by default,
   * never the border or a handle), a move by `dx`, `dy` sheet px and the release, with the
   * existing move gesture's pace. Answers the object's stored position before and after and the
   * selection facts read at the far point.
   */
  t.dragInside = async (slideId, id, dx, dy, point = null) => {
    const before = (await t.blockOf(slideId, id))?.pos ?? null;
    let from = point;
    if (!from) {
      const b = await t.boxOf(id);
      if (!b) throw new Error(`no object ${id} on the stage`);
      from = b.inner.w > 4 && b.inner.h > 4 ? t.center(b.inner) : t.center(b.free);
    }
    const k = await t.kOf();
    const to = { x: from.x + dx * k, y: from.y + dy * k };
    const during = await t.drag(from, to, {
      steps: 16,
      during: async () => ({
        editing: await t.editing(),
        selection: await t.selectionText(),
        readout: await t.readout(),
      }),
    });
    await t.settled();
    const after = await t
      .pollUntil(
        async () => (await t.blockOf(slideId, id))?.pos ?? null,
        (p) => p && before && (p.x !== before.x || p.y !== before.y),
        6000,
      )
      .catch(() => null);
    return {
      before,
      after: after ?? (await t.blockOf(slideId, id))?.pos ?? null,
      during,
      from,
      to,
    };
  };
  /** Selects an object by clicking its drawing; returns the overlay's handle controls, or null. */
  t.selectObject = async (id) => {
    let b = await t.boxOf(id);
    if (!b) return null;
    let c = b.inner.w > 4 && b.inner.h > 4 ? t.center(b.inner) : t.center(b.free);
    await t.clickAt(c.x, c.y);
    let ctrls = await t.handleControls();
    const mine = () =>
      ctrls.includes(`handle.${id}.move`) || ctrls.some((x) => x.endsWith('.move'));
    if (!mine()) {
      c = t.center(b.free);
      await t.clickAt(c.x, c.y);
      ctrls = await t.handleControls();
    }
    if (!ctrls.includes(`handle.${id}.move`)) {
      await t.press('Escape');
      await sleep(200);
      ctrls = await t.handleControls();
    }
    if (!ctrls.includes(`handle.${id}.move`)) {
      b = await t.boxOf(id);
      if (!b) return null;
      c = { x: b.free.x + 4, y: b.free.y + 4 };
      await t.clickAt(c.x, c.y);
      await sleep(200);
      ctrls = await t.handleControls();
      if (!ctrls.includes(`handle.${id}.move`)) {
        await t.press('Escape');
        await sleep(200);
        ctrls = await t.handleControls();
      }
    }
    // a click that landed in the text opened a session: Escape ends it and keeps the block
    // selected, which is what a block level row (a chord, a tail button) needs
    if (mine() && (await t.editing())) {
      await t.press('Escape');
      await sleep(200);
      ctrls = await t.handleControls();
    }
    return mine() ? ctrls : null;
  };
  /** The overlay control of a handle: the object's own, else the one handle of that kind. */
  t.findHandle = async (id, suffix) => {
    const ctrls = await t.handleControls();
    return (
      ctrls.find((c) => c === `handle.${id}.${suffix}`) ??
      ctrls.find((c) => c.endsWith(`.${suffix}`)) ??
      null
    );
  };
  /** The eight resize directions the overlay shows for an object. */
  t.resizeDirs = async (id) => {
    const ctrls = await t.handleControls();
    return ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].filter((d) =>
      ctrls.includes(`handle.${id}.resize.${d}`),
    );
  };
  /** The frame edge strip of the selected object, a point a third of the way along the top edge. */
  t.frameGrip = async (id) => {
    const edge = await t.rectOf('.ts-overlay .ts-frame-edge[data-side="n"]');
    if (edge) return { x: edge.x + edge.w * 0.3, y: edge.y + edge.h / 2 };
    const h = await t.handleRect(await t.findHandle(id, 'move'));
    return h ? t.center(h) : null;
  };
  /** Shift clicks a point. */
  t.shiftClickAt = async (x, y) => {
    await t.moveHuman({ x: x - 40, y: y - 25 }, { x, y }, 6);
    await page.keyboard.down('Shift');
    await page.mouse.click(x, y);
    await page.keyboard.up('Shift');
    await sleep(rand(200, 320));
  };
  /** Cmd clicks a point. */
  t.metaClickAt = async (x, y) => {
    await t.moveHuman({ x: x - 40, y: y - 25 }, { x, y }, 6);
    await page.keyboard.down('Meta');
    await page.mouse.click(x, y);
    await page.keyboard.up('Meta');
    await sleep(rand(200, 320));
  };
  /** The viewport centre of a filmstrip card, scrolled into view first. */
  t.cardCenter = async (slideId) => {
    await page
      .locator(`[data-control="filmstrip.slide.${slideId}"]`)
      .first()
      .scrollIntoViewIfNeeded({ timeout: 4000 })
      .catch(() => undefined);
    await sleep(120);
    const r = await t.rectOf(`[data-control="filmstrip.slide.${slideId}"]`);
    return r ? t.center(r) : null;
  };
  /**
   * A viewport point on the bare sheet: the first of the candidate sheet points whose element is
   * the sheet itself or a descendant that is neither a block nor a run (a placeholder's box takes
   * a click as a text session, which is not the canvas focus the rows want).
   */
  t.emptySheetPoint = async () => {
    const candidates = [
      [1560, 870],
      [1560, 60],
      [40, 870],
      [40, 60],
      [800, 880],
      [1500, 450],
    ];
    for (const [sx, sy] of candidates) {
      const p = await t.sheetPoint(sx, sy);
      const bare = await page.evaluate(
        ([x, y]) => {
          const el = document.elementFromPoint(x, y);
          if (!el) return false;
          const sheet = el.closest('.pt-slide');
          if (!sheet) return false;
          return !el.closest('[data-block], [data-run], .free, .ts-overlay, [data-control]');
        },
        [p.x, p.y],
      );
      if (bare) return p;
    }
    return t.sheetPoint(1560, 870);
  };
  /**
   * Clicks a filmstrip card (a plain click) and checks the editor moved to that slide; a card
   * that shifted under the pointer while the filmstrip re-laid itself (the gate walk of 22:16Z:
   * the text area's click on the title card right after the slides area's New slide landed on
   * slide 4, and the whole title battery ran on a blank slide) is clicked again, twice at most.
   */
  t.clickCard = async (slideId) => {
    let c = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      c = await t.cardCenter(slideId);
      if (!c) throw new Error(`no filmstrip card ${slideId}`);
      await t.clickAt(c.x, c.y);
      const landed = await t.pollUntil(t.activeSlide, (id) => id === slideId, 3000);
      if (landed === slideId) return c;
      console.log(
        `       clickCard: the click landed on ${landed}, not ${slideId}; clicking again`,
      );
      await sleep(400);
    }
    return c;
  };
  /** The filmstrip's facts per card: id, selected, current, skipped, focused. */
  t.cards = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-control^="filmstrip.slide."]')].map((el) => ({
        id:
          el.getAttribute('data-id') ??
          el.getAttribute('data-control').replace('filmstrip.slide.', ''),
        selected: el.getAttribute('aria-selected') === 'true',
        current: el.getAttribute('aria-current') === 'true',
        skipped: el.hasAttribute('data-skip'),
        focused: document.activeElement === el || el.contains(document.activeElement),
        number: el.textContent?.match(/\d+/)?.[0] ?? null,
      })),
    );
  /** Drags a filmstrip card so it lands above (`above`) or below another card. */
  t.dragCard = async (fromId, toId, where = 'above') => {
    await t.cardCenter(toId);
    await t.cardCenter(fromId);
    const a = await t.rectOf(`[data-control="filmstrip.slide.${fromId}"]`);
    const b = await t.rectOf(`[data-control="filmstrip.slide.${toId}"]`);
    if (!a || !b) throw new Error('no filmstrip cards to drag');
    const from = t.center(a);
    const to = { x: b.x + b.w / 2, y: where === 'above' ? b.y + 6 : b.y + b.h - 6 };
    await t.moveHuman({ x: from.x - 30, y: from.y }, from, 6);
    await page.mouse.down();
    await sleep(150);
    await t.moveHuman(from, { x: from.x + 4, y: from.y - 10 }, 4);
    await t.moveHuman({ x: from.x + 4, y: from.y - 10 }, to, 16);
    await sleep(300);
    await page.mouse.up();
    await sleep(300);
  };

  // ---------------------------------------------------------------------------------------------
  // setup writes through the window API (never a driven step; the matrix's `setup` convention)

  /** Removes slides through the window API until `n` remain, keeping the first `n` of the order; a setup write. */
  t.trimTo = async (n, keep = []) => {
    let order = await t.slideOrder();
    while (order.length > n) {
      const victim = [...order].reverse().find((id) => !keep.includes(id));
      if (!victim) break;
      const s = await t.state();
      await t.invoke('slide.remove', { baseRevision: s.revision, slideId: victim });
      order = await t.pollUntil(t.slideOrder, (o) => !o.includes(victim), 15_000);
      await t.settled();
    }
    return order;
  };
  /** Adds a slide after the current one through the window API; returns its id. */
  t.setupSlide = async (after = null, layout = 'split') => {
    const before = await t.slideOrder();
    const s = await t.state();
    await t.invoke('slide.new', {
      baseRevision: s.revision,
      ...(after ? { after } : {}),
      layout,
    });
    const order = await t.pollUntil(t.slideOrder, (o) => o.length === before.length + 1, 20_000);
    const id = order.find((x) => !before.includes(x)) ?? null;
    await t.settled();
    return id;
  };
  /** Places a block on a slide through the window API; returns the object or null. */
  t.placeBlock = async (slideId, block, slot = 'main') => {
    const before = await t.objectIds(slideId);
    const s = await t.state();
    await t.invoke('block.insert', { baseRevision: s.revision, slideId, slot, block });
    const obj = await t.newObjectAfter(slideId, before);
    await t.settled();
    return obj;
  };
  /** Writes a block field through the window API (the inspector's write); one retry on a stale base. */
  t.setBlock = async (slideId, blockId, path, value) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const s = await t.state();
      try {
        await t.invoke('block.set', { baseRevision: s.revision, slideId, blockId, path, value });
        await t.waitRevision(s.revision + 1, 15_000);
        await t.settled();
        return;
      } catch (error) {
        if (attempt === 1 || !/stale|conflict|revision/i.test(String(error))) throw error;
        await t.settled();
      }
    }
  };
  /** A small two colour PNG drawn in the page, as a data URL. */
  t.pngDataUrl = (w = 96, h = 64, a = '#1b1b1b', b = '#e8e8e8') =>
    page.evaluate(
      ([pw, ph, ca, cb]) => {
        const c = document.createElement('canvas');
        c.width = pw;
        c.height = ph;
        const g = c.getContext('2d');
        g.fillStyle = ca;
        g.fillRect(0, 0, pw, ph);
        g.fillStyle = cb;
        g.fillRect(pw / 8, ph / 5, (pw * 3) / 4, (ph * 3) / 5);
        return c.toDataURL('image/png');
      },
      [w, h, a, b],
    );
  /** Places a picture through the window API (asset.add then block.insert), the dialog's own writes. */
  t.placePicture = async (slideId, pos, id = `shot-core-${Date.now().toString(36)}`) => {
    const png = await t.pngDataUrl(96, 64);
    const s = await t.state();
    /* the asset id is passed (b7's cycle 3 C3-R3): with a data URL and no id every picture is
       `assets/capture.png` and a second one with other bytes is refused */
    const asset = await t.invoke('asset.add', {
      id: `${id}-asset`,
      url: png,
      role: 'capture',
      alt: 'core walk picture',
      baseRevision: s.revision,
    });
    await t.settled();
    const s2 = await t.state();
    const before = await t.objectIds(slideId);
    await t.invoke('block.insert', {
      slideId,
      slot: 'main',
      block: { id, type: 'shot', asset: asset.id, pos },
      baseRevision: Math.max(s2.revision, asset.revision ?? 0),
    });
    const obj = await t.newObjectAfter(slideId, before, 20_000);
    await t.settled();
    return obj;
  };

  // ---------------------------------------------------------------------------------------------
  // the scratch deck: its ground paint and a fresh one after a stall

  /**
   * The paint of a fresh draft's stage (VERIFICATION.md C2-F26: one /new load of the enforce
   * preview drew a dithered texture over the whole stage at many times its scale, the sheet's
   * frame, guides and mark under it, and the title read "covered by html" to the first click).
   * Three readings, so the race is named when it recurs whatever element carries it: every
   * canvas of the document with its bitmap against its box (the ramp canvas `canvas.dither`
   * draws one cell per two layout px and the CSS scales the bitmap to the box, so a bitmap drawn
   * before the box had its size is stretched: `perCell` is the layout px one cell covers, 2 when
   * drawn right); every painted element (canvas, img, video, svg, an inline background) outside
   * the filmstrip whose box runs past the sheet's on any side by more than 5 percent while
   * covering more than half the stage (`covers`); and what `elementFromPoint` meets at the centre
   * of the first run and at the sheet's centre (`hit`, `sheetHit`), which has to be inside the
   * sheet.
   */
  t.groundPaintFacts = () =>
    page.evaluate(() => {
      const box = (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      };
      const stage = document.querySelector('.ts-stagewrap.ts-editor');
      const sheet = stage?.querySelector('.pt-slide:not(.is-leaving)') ?? null;
      const filmstrip = document.querySelector('.ts-filmstrip, aside.pt-sb');
      const stageRect = stage ? box(stage) : null;
      const sheetRect = sheet ? box(sheet) : null;
      const canvases = [...document.querySelectorAll('canvas')]
        .filter((c) => c.clientWidth > 0 && c.clientHeight > 0 && !filmstrip?.contains(c))
        .map((c) => ({
          cls: c.className || 'canvas',
          w: c.width,
          h: c.height,
          layoutW: c.clientWidth,
          layoutH: c.clientHeight,
          drawn: c.dataset.drawn ?? null,
          perCell: c.width > 0 ? Math.round((c.clientWidth / c.width) * 100) / 100 : null,
        }));
      const covers = [];
      if (stageRect && sheetRect) {
        const stageArea = stageRect.w * stageRect.h;
        const slack = { x: sheetRect.w * 0.05, y: sheetRect.h * 0.05 };
        for (const el of document.querySelectorAll(
          'canvas, img, video, svg, [style*="background"]',
        )) {
          if (filmstrip?.contains(el)) continue;
          const r = box(el);
          if (r.w === 0 || r.h === 0) continue;
          const ix = Math.max(
            0,
            Math.min(r.x + r.w, stageRect.x + stageRect.w) - Math.max(r.x, stageRect.x),
          );
          const iy = Math.max(
            0,
            Math.min(r.y + r.h, stageRect.y + stageRect.h) - Math.max(r.y, stageRect.y),
          );
          const past =
            r.x < sheetRect.x - slack.x ||
            r.y < sheetRect.y - slack.y ||
            r.x + r.w > sheetRect.x + sheetRect.w + slack.x ||
            r.y + r.h > sheetRect.y + sheetRect.h + slack.y;
          if (ix * iy > stageArea / 2 && past)
            covers.push({
              tag: el.tagName.toLowerCase(),
              cls: (typeof el.className === 'string' ? el.className : (el.className?.baseVal ?? ''))
                .split(' ')
                .filter(Boolean)
                .slice(0, 3)
                .join('.'),
              w: Math.round(r.w),
              h: Math.round(r.h),
              attrs: [...el.attributes]
                .filter((a) => /^data-/.test(a.name))
                .map((a) => `${a.name}=${a.value.slice(0, 24)}`)
                .slice(0, 4)
                .join(' '),
            });
        }
      }
      const hitAt = (x, y, within) => {
        const el = document.elementFromPoint(x, y);
        return {
          tag: el?.tagName.toLowerCase() ?? null,
          cls: typeof el?.className === 'string' ? el.className.split(' ')[0] || null : null,
          inside: el && within ? within.contains(el) || el.contains(within) : false,
        };
      };
      const run = sheet?.querySelector('[data-run]') ?? null;
      let hit = null;
      if (run) {
        const rr = run.getBoundingClientRect();
        hit = hitAt(rr.x + rr.width / 2, rr.y + rr.height / 2, run);
      }
      const sheetHit = sheetRect
        ? hitAt(sheetRect.x + sheetRect.w / 2, sheetRect.y + sheetRect.h * 0.8, sheet)
        : null;
      const round = (r) => (r ? { w: Math.round(r.w), h: Math.round(r.h) } : null);
      return { stage: round(stageRect), sheet: round(sheetRect), canvases, covers, hit, sheetHit };
    });
  /** The ground paint facts as one sentence for a row's observed column. */
  t.describeGroundPaint = (f) => {
    const where = (h, what) =>
      h
        ? `${h.tag ?? 'nothing'}${h.cls ? `.${h.cls}` : ''} (inside ${what} ${h.inside})`
        : `no ${what}`;
    return `${f.canvases.length} canvas(es)${
      f.canvases.length > 0
        ? `: ${f.canvases
            .map(
              (c) =>
                `${c.cls} ${c.w}x${c.h} bitmap in ${c.layoutW}x${c.layoutH} layout px (${c.perCell ?? 'no'} px per cell${c.drawn ? `, drawn ${c.drawn}` : ''})`,
            )
            .join('; ')}`
        : ''
    }; covers past the sheet ${
      f.covers.length > 0
        ? f.covers
            .map(
              (c) =>
                `${c.tag}${c.cls ? `.${c.cls}` : ''} ${c.w}x${c.h}${c.attrs ? ` ${c.attrs}` : ''}`,
            )
            .join(', ')
        : 'none'
    }; sheet ${f.sheet ? `${f.sheet.w}x${f.sheet.h}` : 'none'} in a stage of ${
      f.stage ? `${f.stage.w}x${f.stage.h}` : 'none'
    }; at the title centre ${where(f.hit, 'the run')}; at the sheet ${where(f.sheetHit, 'the sheet')}`;
  };
  /** True when a canvas is stretched past a factor 1.5 of its drawn scale (2 layout px per cell). */
  t.oversizedCanvases = (f) => f.canvases.filter((c) => c.perCell !== null && c.perCell > 3);
  /** The paint is right: no stretched canvas, nothing past the sheet, the pointer meets the run and the sheet. */
  t.groundPaintOk = (f) =>
    t.oversizedCanvases(f).length === 0 &&
    f.covers.length === 0 &&
    (f.hit?.inside ?? false) &&
    (f.sheetHit?.inside ?? false);

  /**
   * A fresh scratch deck for the areas after a stall (VERIFICATION.md C2-F24): the deck whose
   * writes stopped being acknowledged is retired (the finally block trashes and removes it and
   * reads its 404), /new is loaded, the title is typed through the product (the first write that
   * creates the deck) and one more slide is added the way the decks area left the first deck, so
   * the next area starts on a deck the server answers for instead of timing out its own setups
   * one after another. Recorded as a setup row (the cascade of the area that stalled is already
   * written); returns false when no deck could be made, which ends the walk.
   */
  t.freshDeck = async (why) => {
    const TITLE = 'Pipeline review: Acme, Q3 2026';
    const previous = t.deck.id || null;
    const r = await t.step(
      null,
      `setup: a fresh deck after the stall (${why})`,
      'a new deck from /new with its title written, at /edit, with a second slide',
      async () => {
        const stuck = await page
          .evaluate(() => {
            const words =
              document.querySelector('[data-control="deck.saveState"]')?.textContent?.trim() ??
              null;
            const s = window.turboslide?.studio?.describe?.().state;
            return {
              words,
              pending: s?.sync?.pending ?? s?.pending ?? null,
              revision: s?.revision ?? null,
              serverRevision: s?.serverRevision ?? null,
            };
          })
          .catch(() => ({ words: null, pending: null, revision: null, serverRevision: null }));
        if (previous) t.deck.retired.push(previous);
        const keep = new Set(['id', 'titleSlide', 'head', 'body', 'build', 'retired']);
        for (const key of Object.keys(t.deck)) if (!keep.has(key)) delete t.deck[key];
        await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
        await t.editorReady();
        const info = await t.invoke('deck.info');
        const s = await t.state();
        const allRuns = await t.runs();
        const head = allRuns.find((x) => /heading/.test(x)) ?? allRuns[0] ?? null;
        t.deck.id = info.id;
        t.deck.titleSlide = s.slideId;
        t.deck.head = head;
        t.deck.body = allRuns.find((x) => x !== head) ?? null;
        const paint = await t.groundPaintFacts();
        if (!head)
          return {
            ok: false,
            observed: `${info.id}: no run to type the title into; ${t.describeGroundPaint(paint)}`,
          };
        if (await t.visible('dialog.namePrompt'))
          await t.clickControl('dialog.namePrompt.close').catch(() => undefined);
        const on = await t.openRun(head);
        await t.typeHuman(TITLE);
        await t.sleep(300);
        await t.press('Escape');
        await t.waitRevision(1, 30_000);
        const s1 = await t.settled();
        await page.waitForURL(/\/edit\//, { timeout: 30_000 }).catch(() => undefined);
        if (await t.visible('dialog.namePrompt'))
          await t.clickControl('dialog.namePrompt.close').catch(() => undefined);
        const second = await t.setupSlide(t.deck.titleSlide);
        t.deck.secondSlide = second;
        await t.clickCard(t.deck.titleSlide);
        return {
          ok: on && /\/edit\//.test(page.url()) && s1.revision >= 1 && Boolean(second),
          observed: `retired ${previous ?? 'none'} (its title row read "${stuck.words ?? 'unknown'}", pending ${stuck.pending ?? 'unknown'}, revision ${stuck.revision ?? '?'} against the server's ${stuck.serverRevision ?? '?'}); ${info.id} at ${t.url()}, revision ${s1.revision}, second slide ${second ?? 'none'}; ${t.describeGroundPaint(paint)}`,
        };
      },
    );
    return r.ok === true;
  };

  // ---------------------------------------------------------------------------------------------
  // text runs

  /**
   * Double clicks the middle of a run and returns whether the session opened (the text battery
   * enters every session by double click, A1 rule 3). Something covering the run is swept once;
   * a run still covered throws with the cover's name.
   */
  t.openRun = async (run) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const info = await t.runInfo(run);
      if (!info) throw new Error(`no run ${run} on the stage`);
      const x = info.rect.x + info.rect.w / 2;
      const y = info.rect.y + info.rect.h / 2;
      const met = await t.coverAt(x, y);
      if (met.run !== run && !(await t.editing())) {
        if (attempt === 0) {
          await t.surfaceClear();
          continue;
        }
        throw new Error(`run ${run} is covered by ${met.cover ?? met.run}`);
      }
      await t.dblclickAt(x, y);
      return t.editing();
    }
    return false;
  };
  /**
   * What the pointer meets at a viewport point: the run it belongs to, else a short name of the
   * element covering it (a menu, a dialog scrim, a picker, the overlay), so a double click or a
   * right click that never reached the run fails by name (F-text-state read `"text"` as the
   * selected word: a Format menu row under the pointer).
   */
  t.coverAt = (x, y) =>
    page.evaluate(
      ([px, py]) => {
        const el = document.elementFromPoint(px, py);
        if (!el) return { run: null, cover: 'nothing' };
        const run = el.closest('[data-run]')?.getAttribute('data-run') ?? null;
        if (run) return { run, cover: null };
        const name =
          el.closest('[data-control]')?.getAttribute('data-control') ??
          el.closest('[id^="ts-menu-"]')?.id ??
          (el.closest('.ts-dialog-scrim') ? 'dialog scrim' : null) ??
          (el.closest('.ts-overlay') ? 'the overlay' : null) ??
          (el.closest('.ts-picker') ? 'a picker' : null) ??
          `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(' ')[0]}` : ''}`;
        return { run: null, cover: name };
      },
      [x, y],
    );
  /**
   * Double clicks the nth word of a run so it is selected (inside an open session, A1 rule 3);
   * returns the selection text. When something covers the word the chrome is swept once and
   * the double click retried; a word still covered throws with the cover's name.
   */
  t.selectWord = async (run, index) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const w = await t.wordRect(run, index);
      if (!w) throw new Error(`no word ${index} in ${run}`);
      const x = w.x + w.w / 2;
      const y = w.y + w.h / 2;
      const met = await t.coverAt(x, y);
      if (met.run !== run) {
        if (attempt === 0) {
          await t.surfaceClear();
          continue;
        }
        throw new Error(`word ${index} of ${run} is covered by ${met.cover ?? met.run}`);
      }
      await t.dblclickAt(x, y);
      await sleep(200);
      return t.selectionText();
    }
    return '';
  };
  /** The inner HTML of a run on the stage. */
  t.runHtml = (run) =>
    page.evaluate(
      (r) =>
        document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`)?.innerHTML ??
        '',
      run,
    );
  /** The runs of a block on the stage (the `data-run` ids inside its box). */
  t.runsOfBlock = (blockId) =>
    page.evaluate((id) => {
      const inner = document.querySelector(
        `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`,
      );
      const box = inner?.closest('.free') ?? inner;
      if (!box) return [];
      const own = box.matches('[data-run]') ? [box.getAttribute('data-run')] : [];
      return [
        ...own,
        ...[...box.querySelectorAll('[data-run]')].map((el) => el.getAttribute('data-run')),
      ];
    }, blockId);
  /** The stored JSON of a block, as a string, for a contains check. */
  t.blockJson = async (slideId, blockId) =>
    JSON.stringify((await t.blockOf(slideId, blockId))?.block ?? null);
  /** The computed style facts of the first element matching a selector. */
  t.styleOf = (selector, props) =>
    page.evaluate(
      ([s, list]) => {
        const el = document.querySelector(s);
        if (!el) return null;
        const cs = getComputedStyle(el);
        const out = {};
        for (const p of list) out[p] = cs.getPropertyValue(p);
        return out;
      },
      [selector, props],
    );

  return t;
}
