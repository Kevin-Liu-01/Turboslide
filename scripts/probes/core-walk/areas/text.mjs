// Text, the probe's rows (docs/FOCUS.md 2.3, 6.4 `text.*` with the driver `probe --core`): the
// placeholders and the caret keys on the title slide, the text box and its tail, the marks from
// the keyboard, the toolbar and the menus, the lists, the link, the Format menu rows, autofit,
// the clipboard, Find and replace, the right click menus and the layout runs. The present click
// on a link is core/present.spec.ts.

export const NAME = 'text';
export const IDS = [
  'text.title.single-click',
  'text.title.double-click',
  'text.title.type-escape',
  'text.selected.typing-replaces',
  'text.selected.enter-appends',
  'text.title.double-click-enters',
  'text.session.escape-twice',
  'text.textbox.drag-inside-moves',
  'text.context.inside-session',
  'text.caret.click-mid-word',
  'text.caret.home-end',
  'text.caret.shift-arrow-replace',
  'text.caret.shift-home-end',
  'text.caret.backspace-word',
  'text.caret.option-backspace',
  'text.caret.delete',
  'text.caret.cmd-a',
  'text.title.enter-commits',
  'text.subtitle.double-click-type',
  'text.subtitle.enter-new-line',
  'text.subtitle.shift-enter',
  'text.subtitle.arrows-backspace-join',
  'text.subtitle.escape-commits',
  'text.textbox.insert-click-type',
  'text.textbox.insert-drag',
  'text.textbox.burst-reliability',
  'text.toolbar.swaps-on-select',
  'text.fontsize.type-enter',
  'text.fontsize.plus-minus',
  'text.bold.toolbar',
  'text.bold.cmd-b-word',
  'text.italic.toolbar-word',
  'text.italic.cmd-i-word',
  'text.underline.cmd-u-word',
  'text.underline.toolbar',
  'text.strikethrough.cmd-shift-x',
  'text.strikethrough.menu',
  'text.color.swatch-on-word',
  'text.align.toolbar-and-key',
  'text.spacing.toolbar',
  'text.list.bulleted-toolbar',
  'text.list.numbered-toolbar',
  'text.list.bulleted-menu-preset',
  'text.indent.toolbar',
  'text.indent.keys',
  'text.link.cmd-k-enter',
  'text.clear-formatting',
  'text.format-menu.rows-enabled',
  'text.format-menu.size-increase',
  'text.format-menu.align-left',
  'text.format-menu.spacing-double',
  'text.format-menu.text-fitting',
  'text.autofit.title-wraps',
  'text.autofit.textbox-grow',
  'text.clipboard.within-box',
  'text.clipboard.between-boxes',
  'text.clipboard.paste-without-formatting',
  'text.find-replace.replace-all',
  'text.find-replace.shortcut',
  'text.persistence.reload',
  'text.list.numbered-menu-preset',
  'text.list.chords',
  'text.link.toolbar-button',
  'text.format-options.panel',
  'text.layout-runs.type',
  'text.context.text-block',
  'text.context.text-selection',
  'text.format-menu.size-decrease',
  'text.format-menu.spacing-single-1-15',
  'text.format-menu.align-indent-rows',
  'text.textbox.toolbar-button',
  'text.title.one-click-tail',
  'text.title.bold-menu',
  'text.title.bold-cmd-b',
  'text.title.align-menu',
  'text.title.size-menu',
  'text.title.format-options-marks',
  'text.title.apply-layout-after-format',
  'text.fontsize.type-one-undo',
  'text.format-options.field-one-undo',
  /* the product round (docs/PRODUCT.md 8.1) */
  'text.link.detect-url',
  'text.link.detect-email',
  'text.select.double-click-address',
  'text.select.shift-home-line',
  'text.link.popover-apply-remove',
  'text.format-options.padding-grid',
  'text.format-options.remembers-section',
  'text.autofit.shrink-on-overflow',
  'text.find-replace.count-while-typing',
];

const MARK_SEL = 'b, strong, i, em, u, s, [data-mark], a, span[style]';

export async function run(t) {
  const { page, BASE } = t;
  const T = t.deck.titleSlide;
  await t.clickCard(T);
  /* the slides area's last row adds a slide whose write is acknowledged a moment later, and the
     product selects the new slide on the acknowledgement: on the cycle 2 merge gates the card
     click landed on the title slide and the stage moved to the new slide before the first title
     row (21 rows on the wrong slide, twice), so the writes settle and the slide is asserted again
     before the battery (the integrator, for b4) */
  await t.settled();
  /* the state names the active slide before the stage has drawn it (the stage animates in with
     `data-active`; the verification run of the merge read the state on the title slide while the
     stage still showed the slide before it, so the one click met no run): the stage's own mark
     is waited for */
  const onTitleSlide = async () => {
    if ((await t.activeSlide()) !== T) await t.clickCard(T);
    await page
      .waitForSelector(`.pt-viewer[data-active="${T}"]`, { timeout: 5000 })
      .catch(() => undefined);
    await t.sleep(400);
  };
  await onTitleSlide();
  await t.clearAll();
  const allRuns = await t.runs();
  const HEAD = allRuns.find((r) => /heading/.test(r)) ?? allRuns[0];
  const BODY = allRuns.find((r) => r !== HEAD) ?? null;
  /** A run's text with every no-break space read as a space (the DOM keeps NBSP at the run ends). */
  const text = async (run) => ((await t.runInfo(run))?.text ?? '').replace(/\u00a0/g, ' ');
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const stored = async (needle) => JSON.stringify(await t.slideJson(T)).includes(needle);
  /** The marks inside a run's HTML by tag or mark name. */
  const marksOf = (run) =>
    page.evaluate(
      ([r, sel]) => {
        const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
        if (!el) return [];
        return [...el.querySelectorAll(sel)].map((m) => ({
          tag: m.tagName.toLowerCase(),
          mark: m.getAttribute('data-mark'),
          text: m.textContent ?? '',
          style: m.getAttribute('style') ?? '',
          href: m.getAttribute('href') ?? m.getAttribute('data-href') ?? null,
        }));
      },
      [run, MARK_SEL],
    );
  const markedWord = (marks, word, test) => marks.some((m) => m.text.trim() === word && test(m));
  /**
   * The typography of a block, from the stored JSON: the `typography` fields the toolbar and the
   * Format menu write (size, align, leading, weight, indent) and the inline mark flags of a mark
   * that wraps the whole text (`[text]{i u s}` in the text markup; Bold on a block is
   * `typography.weight`). Read on the slide the block lives on.
   */
  const typo = async (blockId, slideId = T) => {
    const b = await t.blockOf(slideId, blockId);
    const blk = b?.block ?? {};
    const ty = blk.typography ?? {};
    const raw = typeof blk.text === 'string' ? blk.text : JSON.stringify(blk.items ?? '');
    const whole = /^\s*\[[^\]]*\]\{([^}]*)\}\s*$/.exec(raw);
    const flags = new Set(whole ? whole[1].split(/\s+/).filter(Boolean) : []);
    const weight = blk.weight ?? ty.weight ?? null;
    return {
      size: blk.size ?? ty.size ?? null,
      align: blk.align ?? ty.align ?? null,
      leading: blk.leading ?? ty.leading ?? null,
      weight,
      indent: blk.indent ?? ty.indent ?? null,
      bold: (weight !== null && Number(weight) >= 500) || flags.has('b'),
      italic: flags.has('i'),
      underline: flags.has('u'),
      strike: flags.has('s'),
      flags: [...flags],
      json: JSON.stringify(blk),
    };
  };
  const tailVisible = () => t.visible('toolbar.bold');

  // ---- the title placeholder and the caret keys, under the click model of AMENDMENTS.md A1:
  // one click selects the placeholder as an object (no caret), a double click opens the session
  // with the caret at the click, typing on the selected object replaces its text, Enter appends
  const TITLE = 'Quarterly review: Q3, 2026!';
  /** The title placeholder's block id on the stage (a slide field on a title slide). */
  const HEAD_BLOCK = (await t.blockOfRun(HEAD)) ?? 'lead';
  /** The one click of A1 rule 1 on the title, at the centre of its run; the facts read after. */
  const clickTitle = async () => {
    await onTitleSlide();
    const info = await t.runInfo(HEAD);
    return t.clickSelect(HEAD_BLOCK, {
      x: info.rect.x + info.rect.w / 2,
      y: info.rect.y + info.rect.h / 2,
    });
  };
  /** True when the facts read a selected object with no session and no caret (A1 rule 1). */
  const selectedNoCaret = (f) => f.selected && f.resize === 8 && f.ring && !f.editing && !f.caret;
  await t.step(
    'text.title.single-click',
    'one click at the centre of Click to add title',
    'the ring, the eight handles, the rotation handle and the chip; no caret, no session',
    async () => {
      await t.clearAll();
      const { facts } = await clickTitle();
      const ok = selectedNoCaret(facts) && facts.chip !== null;
      return { ok, observed: `${t.describeSelection(facts)}; block ${HEAD_BLOCK}` };
    },
  );
  await t.step(
    'text.title.double-click',
    'a double click on the title placeholder',
    'the session opens; the prompt stayed Click to add title before it',
    async () => {
      await t.clearAll();
      const prompt = await page.evaluate(
        (r) =>
          document
            .querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"] [data-prompt]`)
            ?.textContent?.trim() ?? null,
        HEAD,
      );
      const on = await t.openRun(HEAD);
      return {
        ok: on,
        observed: `editing ${on}; prompt before "${prompt ?? 'none'}"; focus ${await t.activeDesc()}`,
      };
    },
  );
  await t.step(
    'text.title.type-escape',
    'Cmd+A, type a sentence with spaces, punctuation and a number, Escape',
    'typed equals stored',
    async () => {
      if (!(await t.editing())) await t.openRun(HEAD);
      await t.press('Meta+a');
      await t.typeHuman(TITLE);
      await t.sleep(300);
      await t.press('Escape');
      await t.settled();
      const shown = await text(HEAD);
      const held = await t.pollUntil(
        () => stored(TITLE),
        (x) => x,
        8000,
      );
      return { ok: shown === TITLE && held, observed: `"${shown}"; stored ${held}` };
    },
  );
  await t.step(
    'text.selected.typing-replaces',
    'one click on the title (selected, no caret), then type a sentence',
    'the session opens with the whole text selected and the typed sentence replaces it',
    async () => {
      await t.clearAll();
      const { facts } = await clickTitle();
      const before = await text(HEAD);
      const REPLACED = 'Renewal review for Acme';
      await t.typeHuman(REPLACED);
      await t.sleep(400);
      const on = await t.editing();
      const now = await text(HEAD);
      await t.press('Escape');
      await t.settled();
      const held = await t.pollUntil(
        () => stored(REPLACED),
        (x) => x,
        8000,
      );
      // the title goes back to the sentence the caret rows expect, through the same rule
      await clickTitle();
      await t.typeHuman(TITLE);
      await t.sleep(300);
      await t.press('Escape');
      await t.settled();
      const restored = await text(HEAD);
      return {
        ok: selectedNoCaret(facts) && on && now === REPLACED && held && restored === TITLE,
        observed: `before the typing ${t.describeSelection(facts)}; "${before}" -> "${now}" (session ${on}); stored ${held}; restored "${restored}"`,
      };
    },
  );
  await t.step(
    'text.selected.enter-appends',
    'one click on the title (selected, no caret), Enter, then type',
    'the session opens with the caret at the end and the letters land at the end',
    async () => {
      await t.clearAll();
      const { facts } = await clickTitle();
      const before = await text(HEAD);
      await t.press('Enter');
      await t.sleep(300);
      const on = await t.editing();
      const caret = await t.caretFacts(HEAD);
      await t.typeHuman(' now');
      await t.sleep(400);
      const now = await text(HEAD);
      // the four letters leave again so the title reads as before
      await t.press('Backspace', 4);
      await t.sleep(300);
      await t.press('Escape');
      await t.settled();
      const restored = await text(HEAD);
      return {
        ok:
          selectedNoCaret(facts) &&
          on &&
          Boolean(caret?.inside && caret.atTextEnd) &&
          now === `${before} now` &&
          restored === before,
        observed: `before Enter ${t.describeSelection(facts)}; session ${on}; caret inside ${caret?.inside} at offset ${caret?.offset} of ${caret?.length} (at the end ${caret?.atTextEnd}); "${before}" -> "${now}"; restored ${restored === before}`,
      };
    },
  );
  await t.step(
    'text.title.double-click-enters',
    'one click on the title (selected, no caret), then a double click on its second word',
    'the session opens with the caret inside that word',
    async () => {
      await t.clearAll();
      const { facts } = await clickTitle();
      const w = await t.wordRect(HEAD, 1);
      if (!w) return { ok: false, observed: 'no second word in the title' };
      await t.dblclickAt(w.x + w.w / 2, w.y + w.h / 2);
      await t.sleep(250);
      const on = await t.editing();
      const caret = await t.caretFacts(HEAD);
      const sel = await t.selectionText();
      const now = await text(HEAD);
      const start = now.indexOf(w.word);
      const end = start + w.word.length;
      // a double click on a word selects it (A1 rule 3, Google's behaviour); the caret facts read
      // the selection's start, which sits inside or at the start of the word
      const inWord =
        Boolean(caret?.inside) && caret.offset >= start && caret.offset <= end && start >= 0;
      // the caret is collapsed to the word's end for the click mid word row
      await t.press('ArrowRight');
      return {
        ok: selectedNoCaret(facts) && on && inWord,
        observed: `before the double click ${t.describeSelection(facts)}; session ${on}; caret offset ${caret?.offset} inside "${w.word}" [${start}, ${end}] ${inWord}; selection "${sel}"`,
      };
    },
  );
  await t.step(
    'text.caret.click-mid-word',
    'inside the open session, click mid word and type',
    'the letters land there',
    async () => {
      if (!(await t.editing())) await t.openRun(HEAD);
      const w = await t.wordRect(HEAD, 2);
      await t.clickAt(w.x + w.w / 2, w.y + w.h / 2);
      await t.typeHuman('xx');
      await t.sleep(400);
      const now = await text(HEAD);
      const i = now.indexOf('xx');
      return { ok: i > 0 && i < now.length - 2 && (await t.editing()), observed: `"${now}"` };
    },
  );
  await t.step(
    'text.caret.home-end',
    'Home then type, End then type',
    'the text starts and ends with the typed words',
    async () => {
      await t.press('Home');
      await t.typeHuman('A ');
      await t.press('End');
      await t.typeHuman(' end');
      await t.sleep(400);
      const now = await text(HEAD);
      return { ok: now.startsWith('A ') && now.endsWith(' end'), observed: `"${now}"` };
    },
  );
  let sel3 = '';
  await t.step(
    'text.caret.shift-arrow-replace',
    'ArrowLeft four times, Shift+ArrowLeft three times, type Z',
    'three characters selected and replaced',
    async () => {
      await t.press('End');
      await t.press('ArrowLeft', 4);
      await page.keyboard.down('Shift');
      await t.press('ArrowLeft', 3);
      await page.keyboard.up('Shift');
      sel3 = await t.selectionText();
      const before = await text(HEAD);
      await t.typeHuman('Z');
      await t.sleep(400);
      const now = await text(HEAD);
      const at = before.lastIndexOf(sel3);
      const want = at >= 0 ? `${before.slice(0, at)}Z${before.slice(at + sel3.length)}` : null;
      return {
        ok: sel3.length === 3 && now === want,
        observed: `selected "${sel3}"; "${before}" -> "${now}"`,
      };
    },
  );
  await t.step(
    'text.caret.shift-home-end',
    'Shift+Home then Shift+End',
    'the selections reach the line ends',
    async () => {
      await t.press('End');
      await t.press('ArrowLeft', 3);
      await t.press('Shift+Home');
      const toStart = await t.selectionText();
      await t.press('ArrowRight');
      await t.press('Shift+End');
      const toEnd = await t.selectionText();
      const now = await text(HEAD);
      return {
        ok:
          toStart.length > 0 && now.startsWith(toStart) && toEnd.length > 0 && now.endsWith(toEnd),
        observed: `to start "${toStart}"; to end "${toEnd}"; text "${now}"`,
      };
    },
  );
  await t.step(
    'text.caret.backspace-word',
    'Backspace across a word',
    'the letters leave one by one',
    async () => {
      await t.press('End');
      const before = await text(HEAD);
      await t.press('Backspace', 3);
      await t.sleep(300);
      const now = await text(HEAD);
      return {
        ok: norm(now) === norm(before.slice(0, -3)) && now.length === before.length - 3,
        observed: `"${before}" -> "${now}"`,
      };
    },
  );
  await t.step(
    'text.caret.option-backspace',
    'Option+Backspace',
    'the word before the caret leaves',
    async () => {
      await t.press('End');
      await t.typeHuman(' tail');
      const before = await text(HEAD);
      await t.press('Alt+Backspace');
      await t.sleep(300);
      const now = await text(HEAD);
      return {
        ok: before.endsWith('tail') && !now.endsWith('tail') && now.length < before.length,
        observed: `"${before}" -> "${now}"`,
      };
    },
  );
  await t.step(
    'text.caret.delete',
    'Home then Delete',
    'the character after the caret leaves',
    async () => {
      await t.press('Home');
      const before = await text(HEAD);
      await t.press('Delete');
      await t.sleep(300);
      const now = await text(HEAD);
      return {
        ok: norm(now) === norm(before.slice(1)) && now.length === before.length - 1,
        observed: `"${before}" -> "${now}"`,
      };
    },
  );
  await t.step(
    'text.caret.cmd-a',
    'Cmd+A',
    'the whole run is selected and the session stays open',
    async () => {
      await t.press('Meta+a');
      const sel = await t.selectionText();
      const now = await text(HEAD);
      const on = await t.editing();
      await t.press('End');
      return {
        ok: on && sel.trim() === now.trim(),
        observed: `selected ${sel.length} of ${now.length}; editing ${on}`,
      };
    },
  );
  await t.step(
    'text.title.enter-commits',
    'Enter on the single line title',
    'the session ends and the text is kept',
    async () => {
      const before = await text(HEAD);
      await t.press('Enter');
      await t.sleep(500);
      const on = await t.editing();
      await t.settled();
      const now = await text(HEAD);
      // the product trims the run's edge whitespace on commit; the words are what is kept
      return {
        ok: !on && norm(now) === norm(before),
        observed: `editing ${on}; "${before}" -> "${now}"`,
      };
    },
  );

  await t.step(
    'text.session.escape-twice',
    'double click the title, Escape, Escape',
    'the first Escape returns to the selected title (handles, chip, no caret, the text kept); the second clears the selection',
    async () => {
      await t.clearAll();
      const before = await text(HEAD);
      const on = await t.openRun(HEAD);
      await t.press('Escape');
      await t.sleep(300);
      const first = await t.selectionFacts(HEAD_BLOCK);
      const kept = await text(HEAD);
      await t.press('Escape');
      await t.sleep(300);
      const second = await t.selectionFacts(HEAD_BLOCK);
      return {
        ok:
          on &&
          selectedNoCaret(first) &&
          kept === before &&
          !second.selected &&
          second.handles.length === 0,
        observed: `session ${on}; after one Escape ${t.describeSelection(first)}, text kept ${kept === before}; after two: handles ${second.handles.length}, chip ${second.chip === null ? 'none' : `"${second.chip}"`}`,
      };
    },
  );

  // ---- the subtitle
  if (BODY) {
    await t.step(
      'text.subtitle.double-click-type',
      'double click the subtitle placeholder and type a line',
      'the line is in the run',
      async () => {
        const on = await t.openRun(BODY);
        await t.typeHuman('Revenue grew 12 percent, costs held.');
        await t.sleep(400);
        const now = await text(BODY);
        return {
          ok: on && now === 'Revenue grew 12 percent, costs held.',
          observed: `editing ${on}; "${now}"`,
        };
      },
    );
    await t.step(
      'text.subtitle.enter-new-line',
      'Enter, then type',
      'a new line and the words on it',
      async () => {
        await t.press('Enter');
        const stillOn = await t.editing();
        await t.typeHuman('Second line');
        await t.sleep(400);
        const info = await t.runInfo(BODY);
        const html = await t.runHtml(BODY);
        const breaks = (html.match(/<br|<div|<p/g) ?? []).length;
        return {
          ok: stillOn && breaks >= 1 && info.text.includes('Second line') && info.lines >= 2,
          observed: `session ${stillOn}; breaks ${breaks}; lines ${info.lines}; "${info.text}"`,
        };
      },
    );
    await t.step(
      'text.subtitle.shift-enter',
      'Shift+Enter, then type',
      'a line break and the words after it',
      async () => {
        if (!(await t.editing())) {
          await t.openRun(BODY);
          await t.press('End');
        }
        await t.press('Shift+Enter');
        const stillOn = await t.editing();
        await t.typeHuman('Third line');
        await t.sleep(400);
        const info = await t.runInfo(BODY);
        return {
          ok: stillOn && info.text.includes('Third line') && info.lines >= 3,
          observed: `session ${stillOn}; lines ${info.lines}; "${info.text}"`,
        };
      },
    );
    await t.step(
      'text.subtitle.arrows-backspace-join',
      'ArrowUp, ArrowDown, then Home and Backspace on the last line',
      'the caret moves between lines and Backspace joins two lines',
      async () => {
        if (!(await t.editing())) await t.openRun(BODY);
        await t.press('End');
        const linesBefore = (await t.runInfo(BODY)).lines;
        await t.press('ArrowUp');
        const c1 = await t.caretFacts(BODY);
        await t.press('ArrowDown');
        const c2 = await t.caretFacts(BODY);
        await t.press('Home');
        await t.press('Backspace');
        await t.sleep(300);
        const info = await t.runInfo(BODY);
        return {
          ok:
            Boolean(c1?.inside && c2?.inside) &&
            (c1?.offset ?? 0) < (c2?.offset ?? 0) &&
            info.lines === linesBefore - 1,
          observed: `caret ${c1?.offset} then ${c2?.offset}; lines ${linesBefore} -> ${info.lines}; "${info.text}"`,
        };
      },
    );
    await t.step(
      'text.subtitle.escape-commits',
      'Escape',
      'the multiline subtitle is stored',
      async () => {
        await t.press('Escape');
        const s = await t.settled();
        const held = await t.pollUntil(
          () => stored('grew 12 percent'),
          (x) => x,
          8000,
        );
        return {
          ok: held && !(await t.editing()),
          observed: `revision ${s.revision}; stored ${held}`,
        };
      },
    );
  } else {
    for (const id of [
      'text.subtitle.double-click-type',
      'text.subtitle.enter-new-line',
      'text.subtitle.shift-enter',
      'text.subtitle.arrows-backspace-join',
      'text.subtitle.escape-commits',
    ])
      t.skipRow(id, 'the subtitle', 'a body run on the title slide', 'the title slide has one run');
  }

  // ---- text boxes on a slide of their own
  const X = await t
    .setup('a slide for the text boxes', 'slide.new through the window API', async () => {
      const id = await t.setupSlide(T, 'blank');
      t.deck.textSlide = id;
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.textSlide);
  await t.clickCard(X);
  await t.clearAll();
  let boxA = null;
  let boxB = null;
  await t.step(
    'text.textbox.insert-click-type',
    'Insert > Text box, one click on the sheet, type',
    'the text is stored',
    async () => {
      const r = await t.insertByTool(X, ['insert.textBox'], { x: 200, y: 200 }, null, {
        text: 'Onboarding plan for Acme',
      });
      await t.press('Escape');
      await t.settled();
      boxA = r.obj;
      const held = boxA
        ? await t.pollUntil(
            () => t.blockJson(X, boxA.id),
            (j) => j.includes('Onboarding'),
            8000,
          )
        : '';
      return {
        ok: Boolean(boxA) && held.includes('Onboarding'),
        observed: boxA
          ? `${boxA.type} ${boxA.id} at ${t.posStr(boxA.pos)}; stored ${held.includes('Onboarding')}`
          : `nothing inserted: ${r.error}`,
      };
    },
  );
  await t.step(
    'text.textbox.insert-drag',
    'Insert > Text box drawn by a drag',
    'the box lands at the drawn box',
    async () => {
      const r = await t.insertByTool(
        X,
        ['insert.textBox'],
        { x: 700, y: 500 },
        { x: 1100, y: 640 },
        { text: 'Drawn box' },
      );
      await t.press('Escape');
      await t.settled();
      boxB = r.obj;
      const p = boxB?.pos;
      return {
        ok: Boolean(p) && t.near(p.x, 700, 20) && t.near(p.y, 500, 20) && t.near(p.w, 400, 40),
        observed: boxB ? `${boxB.id} at ${t.posStr(p)}` : `nothing inserted: ${r.error}`,
      };
    },
  );
  await t.step(
    'text.textbox.drag-inside-moves',
    'one click on the text box (selected, no caret), then a pointer down inside its text and a move',
    'the box moves to the new place with its text unchanged and no session',
    async () => {
      await t.clearAll();
      if (!boxA) return { ok: false, observed: 'no text box' };
      const { facts } = await t.clickSelect(boxA.id);
      const textBefore = await t.blockJson(X, boxA.id);
      const moved = await t.dragInside(X, boxA.id, 120, 60);
      const after = await t.selectionFacts(boxA.id);
      const textAfter = await t.blockJson(X, boxA.id);
      const dx = moved.after && moved.before ? moved.after.x - moved.before.x : null;
      const dy = moved.after && moved.before ? moved.after.y - moved.before.y : null;
      const movedRight = dx !== null && t.near(dx, 120, 16) && t.near(dy, 60, 16);
      const sameText = (j) => (j.match(/"text":"[^"]*"/) ?? [''])[0];
      // the box goes home again through the product's undo
      await t.press('Meta+z');
      await t.pollUntil(
        async () => (await t.blockOf(X, boxA.id))?.pos ?? null,
        (p) => p && moved.before && p.x === moved.before.x && p.y === moved.before.y,
        6000,
      );
      await t.settled();
      return {
        ok:
          selectedNoCaret(facts) &&
          movedRight &&
          !moved.during.editing &&
          moved.during.selection === '' &&
          !after.editing &&
          after.selected &&
          sameText(textAfter) === sameText(textBefore),
        observed: `after the click ${t.describeSelection(facts)}; drag ${t.posStr(moved.before)} -> ${t.posStr(moved.after)} (dx ${dx}, dy ${dy}); during the drag session ${moved.during.editing}, text selected "${moved.during.selection}", readout ${moved.during.readout ?? 'none'}; after ${t.describeSelection(after)}; text unchanged ${sameText(textAfter) === sameText(textBefore)}`,
      };
    },
  );
  await t.step(
    'text.textbox.toolbar-button',
    'the toolbar Text box button, then a click on the sheet, type',
    'a box that takes typing',
    async () => {
      await t.clearAll();
      const before = await t.objectIds(X);
      await t.tailControl('toolbar.textBox');
      await t.sleep(300);
      const p = await t.sheetPoint(200, 700);
      await t.clickAt(p.x, p.y);
      const obj = await t.newObjectAfter(X, before);
      // the placed box opens its caret a moment after the object lands; else the run is opened
      const session = obj ? await t.pollUntil(t.editing, (on) => on, 2500) : false;
      if (obj && !session) {
        const run = (await t.runsOfBlock(obj.id))[0];
        if (run) await t.openRun(run);
      }
      if (obj && (await t.editing())) await t.typeHuman('Toolbar box');
      await t.press('Escape');
      await t.settled();
      const held = obj ? await t.blockJson(X, obj.id) : '';
      return {
        ok: Boolean(obj) && held.includes('Toolbar box'),
        observed: obj ? `${obj.id}; stored ${held.includes('Toolbar box')}` : 'no object',
      };
    },
  );
  await t.step(
    'text.textbox.burst-reliability',
    'insert three text boxes in a row and type into each',
    'no refused write, no doubled word',
    async () => {
      const words = ['Alpha', 'Beta', 'Gamma'];
      const ids = [];
      for (let i = 0; i < 3; i += 1) {
        const r = await t.insertByTool(X, ['insert.textBox'], { x: 1200, y: 120 + i * 130 }, null, {
          text: `${words[i]} ${words[i]}x`,
        });
        await t.press('Escape');
        if (r.obj) ids.push(r.obj.id);
      }
      await t.settled();
      const stale = await t.staleWords();
      const said = await t.snackbar();
      const texts = [];
      for (const id of ids) texts.push(await t.blockJson(X, id));
      const doubled = texts.some((j) => /(\b[A-Z][a-z]+)\s+\1\s+\1/.test(j));
      const each = words.every((w, i) => (texts[i] ?? '').includes(`${w} ${w}x`));
      return {
        ok:
          ids.length === 3 &&
          each &&
          !doubled &&
          stale === null &&
          !/not applied|retrying/i.test(said ?? ''),
        observed: `boxes ${ids.length}; each holds its words ${each}; doubled ${doubled}; stale ${stale ?? 'none'}; snackbar ${said ?? 'none'}`,
      };
    },
  );
  if (!boxA) throw new (await import('../toolkit.mjs')).SetupFailed('a text box to style');
  if (!boxB) {
    /* the Format menu rows run on a plain text box (box B); when the drawn box did not land, one
       is placed through the window API as a setup write, so those rows judge the menu and not
       the insert-drag miss (VERIFICATION.md pass 2 F-text-state, F-list-size) */
    await t.setup(
      'a plain text box for the Format menu rows',
      'block.insert through the window API (the drawn box did not land)',
      async () => {
        boxB = await t.placeBlock(X, {
          id: `text-b-${Date.now().toString(36)}`,
          type: 'text',
          text: 'Drawn box',
          pos: { x: 700, y: 500, w: 400, h: 140 },
        });
        return { ok: Boolean(boxB), observed: boxB ? boxB.id : 'no object within 20 s' };
      },
    );
  }

  await t.step(
    'text.toolbar.swaps-on-select',
    'select the text box',
    'the toolbar shows the text controls',
    async () => {
      await t.clearAll();
      const ctrls = await t.selectObject(boxA.id);
      const tail = await tailVisible();
      return {
        ok: Boolean(ctrls) && tail,
        observed: `handles ${ctrls?.length ?? 0}; text tail ${tail}; chip "${await t.chip()}"`,
      };
    },
  );
  await t.step(
    'text.fontsize.type-enter',
    'type a size in the field and press Enter',
    'the size applies as typed or the snackbar names the step taken',
    async () => {
      await t.clearAll();
      await t.selectObject(boxA.id);
      await t.clickControl('toolbar.fontSize.value');
      await t.press('Meta+a');
      await t.typeHuman('28');
      await t.press('Enter');
      const said = await t.snackbarWithin(3000);
      await t.settled();
      const size = await t.pollUntil(
        async () => (await typo(boxA.id, X)).size,
        (v) => v !== null,
        6000,
      );
      const field = await t.valueOf('toolbar.fontSize.value');
      await t.press('Escape');
      return {
        ok: Number(size) === 28 || (said !== null && /size/i.test(said) && Number(size) > 0),
        observed: `stored size ${size}; field "${field}"; snackbar ${said ?? 'none'}`,
      };
    },
  );
  await t.step(
    'text.fontsize.plus-minus',
    'the plus and the minus beside the size',
    'the size steps up and down',
    async () => {
      await t.selectObject(boxA.id);
      const s0 = Number((await typo(boxA.id, X)).size ?? 0);
      await t.clickControl('toolbar.fontSize.plus');
      await t.settled();
      const up = Number(
        (
          await t.pollUntil(
            () => typo(boxA.id, X),
            (x) => Number(x.size) > s0,
            6000,
          )
        ).size,
      );
      await t.clickControl('toolbar.fontSize.minus');
      await t.settled();
      const down = Number(
        (
          await t.pollUntil(
            () => typo(boxA.id, X),
            (x) => Number(x.size) < up,
            6000,
          )
        ).size,
      );
      return { ok: up > s0 && down < up, observed: `${s0} -> ${up} -> ${down}` };
    },
  );
  await t.step(
    'text.bold.toolbar',
    'Bold on the toolbar with the box selected, then again',
    'the block turns bold, then back',
    async () => {
      await t.clearAll();
      await t.selectObject(boxA.id);
      await t.tailControl('toolbar.bold');
      await t.settled();
      const on = await t.pollUntil(
        () => typo(boxA.id, X),
        (x) => x.bold,
        6000,
      );
      await t.selectObject(boxA.id);
      await t.tailControl('toolbar.bold');
      await t.settled();
      const off = await t.pollUntil(
        () => typo(boxA.id, X),
        (x) => !x.bold,
        6000,
      );
      return {
        ok: on.bold && !off.bold,
        observed: `bold on ${on.bold} (weight ${on.weight}, flags ${on.flags.join(' ') || 'none'}), off ${!off.bold}`,
      };
    },
  );
  const wordRow = async (id, name, key, tagTest, control) => {
    await t.step(id, name, 'the word alone carries the mark', async () => {
      await t.clearAll();
      const runsA = await t.runsOfBlock(boxA.id);
      const run = runsA[0];
      if (!run) return { ok: false, observed: 'no run in the box' };
      await t.openRun(run);
      const sel = await t.selectWord(run, 0);
      if (control) await t.clickControl(control);
      else await t.press(key);
      await t.sleep(500);
      const on = await t.editing();
      const marks = await marksOf(run);
      const hit = markedWord(marks, sel.trim(), tagTest);
      const whole = (await text(run)).trim();
      const wholeRun = marks.some((m) => m.text.trim() === whole && tagTest(m));
      await t.press('Escape');
      await t.settled();
      // take the mark off again with the same route, so the next row starts clean
      await t.openRun(run);
      await t.selectWord(run, 0);
      if (control) await t.clickControl(control);
      else await t.press(key);
      await t.press('Escape');
      await t.settled();
      return {
        ok: hit && !wholeRun && (control ? on : true),
        observed: `selected "${sel}"; marks ${JSON.stringify(marks.map((m) => `${m.tag}${m.mark ? `[${m.mark}]` : ''}:${m.text.trim()}`))}; session after ${on}`,
      };
    });
  };
  const isBold = (m) =>
    m.tag === 'b' ||
    m.tag === 'strong' ||
    m.mark === 'bold' ||
    /font-weight:\s*(bold|[67]00)/.test(m.style);
  const isItalic = (m) =>
    m.tag === 'i' || m.tag === 'em' || m.mark === 'italic' || /font-style:\s*italic/.test(m.style);
  const isUnderline = (m) => m.tag === 'u' || m.mark === 'underline' || /underline/.test(m.style);
  const isStrike = (m) =>
    m.tag === 's' ||
    m.tag === 'strike' ||
    m.mark === 'strikethrough' ||
    m.mark === 'strike' ||
    /line-through/.test(m.style);
  await wordRow('text.bold.cmd-b-word', 'double click a word, Cmd+B', 'Meta+b', isBold, null);
  await wordRow(
    'text.italic.toolbar-word',
    'double click a word, click Italic on the toolbar',
    null,
    isItalic,
    'toolbar.italic',
  );
  await wordRow('text.italic.cmd-i-word', 'double click a word, Cmd+I', 'Meta+i', isItalic, null);
  await wordRow(
    'text.underline.cmd-u-word',
    'double click a word, Cmd+U',
    'Meta+u',
    isUnderline,
    null,
  );
  await wordRow(
    'text.strikethrough.cmd-shift-x',
    'double click a word, Cmd+Shift+X',
    'Meta+Shift+x',
    isStrike,
    null,
  );
  await t.step(
    'text.underline.toolbar',
    'Underline on the toolbar with the box selected, then again',
    'the block is underlined, then not',
    async () => {
      await t.clearAll();
      await t.selectObject(boxA.id);
      await t.tailControl('toolbar.underline');
      await t.settled();
      const on = await t.pollUntil(
        () => typo(boxA.id, X),
        (x) => x.underline,
        6000,
      );
      await t.selectObject(boxA.id);
      await t.tailControl('toolbar.underline');
      await t.settled();
      const off = await t.pollUntil(
        () => typo(boxA.id, X),
        (x) => !x.underline,
        6000,
      );
      return {
        ok: on.underline && !off.underline,
        observed: `underline on ${on.underline} (flags ${on.flags.join(' ') || 'none'}), off ${!off.underline}`,
      };
    },
  );
  await t.step(
    'text.strikethrough.menu',
    'Format > Text > Strikethrough with the box selected, then again',
    'the block is struck through, then not',
    async () => {
      await t.clearAll();
      await t.selectObject(boxA.id);
      await t.menuPath('format', 'format.text', 'format.text.strikethrough');
      await t.settled();
      const on = await t.pollUntil(
        () => typo(boxA.id, X),
        (x) => x.strike,
        6000,
      );
      await t.selectObject(boxA.id);
      await t.menuPath('format', 'format.text', 'format.text.strikethrough');
      await t.settled();
      const off = await t.pollUntil(
        () => typo(boxA.id, X),
        (x) => !x.strike,
        6000,
      );
      return {
        ok: on.strike && !off.strike,
        observed: `strike on ${on.strike} (flags ${on.flags.join(' ') || 'none'}), off ${!off.strike}`,
      };
    },
  );
  await t.step(
    'text.color.swatch-on-word',
    'double click a word, open Text color, pick a swatch',
    'the word takes the colour',
    async () => {
      await t.clearAll();
      const run = (await t.runsOfBlock(boxA.id))[0];
      await t.openRun(run);
      const sel = await t.selectWord(run, 0);
      await t.clickControl('toolbar.textColor');
      await t.waitControl('toolbar.textColor.plate', 5000);
      await t.clickControl('toolbar.textColor.red');
      await t.sleep(500);
      await t.settled();
      const marks = await marksOf(run);
      const coloured = marks.filter((m) => /color/.test(m.style) || m.mark === 'color');
      const hit = coloured.some((m) => m.text.trim() === sel.trim());
      const json = await t.blockJson(X, boxA.id);
      await t.press('Escape');
      await t.clearAll();
      return {
        ok: hit && /red/.test(json),
        observed: `selected "${sel}"; coloured marks ${JSON.stringify(coloured.map((m) => m.text.trim()))}; stored red ${/red/.test(json)}`,
      };
    },
  );
  await t.step(
    'text.align.toolbar-and-key',
    'Align > Center on the toolbar, then Cmd+Shift+R',
    'centred, then right aligned',
    async () => {
      await t.clearAll();
      await t.selectObject(boxA.id);
      await t.clickControl('toolbar.align');
      await page
        .locator('#ts-menu-toolbar\\.align, [data-control="toolbar.align.plate"]')
        .first()
        .waitFor({ timeout: 5000 })
        .catch(() => undefined);
      await t.clickControl('menu.toolbar.align.format.alignIndent.center');
      await t.settled();
      const centre = await t.pollUntil(
        () => typo(boxA.id, X),
        (x) => x.align === 'center',
        6000,
      );
      await t.selectObject(boxA.id);
      await t.press('Meta+Shift+r');
      await t.settled();
      const right = await t.pollUntil(
        () => typo(boxA.id, X),
        (x) => x.align === 'right',
        6000,
      );
      return {
        ok: centre.align === 'center' && right.align === 'right',
        observed: `${centre.align} then ${right.align}`,
      };
    },
  );
  await t.step(
    'text.spacing.toolbar',
    'Line & paragraph spacing > 1.5 on the toolbar',
    'the leading is 1.5',
    async () => {
      await t.selectObject(boxA.id);
      await t.clickControl('toolbar.spacing');
      await page
        .locator('#ts-menu-toolbar\\.spacing')
        .first()
        .waitFor({ timeout: 5000 })
        .catch(() => undefined);
      await t.clickControl('menu.toolbar.spacing.format.spacing.1_5');
      await t.settled();
      const got = await t.pollUntil(
        () => typo(boxA.id, X),
        (x) => Number(x.leading) === 1.5,
        6000,
      );
      return { ok: Number(got.leading) === 1.5, observed: `leading ${got.leading}` };
    },
  );
  const listState = async (id) => {
    const j = await t.blockJson(X, id);
    const b = (await t.blockOf(X, id))?.block ?? {};
    return { type: b.type, marker: b.marker ?? b.list?.marker ?? null, json: j };
  };
  const isList = (s) => s.type === 'list' || s.marker !== null || /"marker"/.test(s.json);
  /** Takes a list conversion back through the product's undo, so the next row starts on a text box. */
  const unlist = async (id) => {
    await t.clearAll();
    for (let i = 0; i < 3 && isList(await listState(id)); i += 1) {
      await t.press('Meta+z');
      await t.sleep(600);
      await t.settled();
    }
  };
  await t.step(
    'text.list.bulleted-toolbar',
    'the toolbar Bulleted list button',
    'the box becomes a bulleted list',
    async () => {
      await t.clearAll();
      await t.selectObject(boxA.id);
      await t.clickControl('toolbar.bulletedList');
      await t.settled();
      const s = await t.pollUntil(() => listState(boxA.id), isList, 6000);
      const ok = isList(s) && /bullet/i.test(s.json);
      await unlist(boxA.id);
      return { ok, observed: `type ${s.type}; marker ${s.marker}` };
    },
  );
  await t.step(
    'text.list.numbered-toolbar',
    'the toolbar Numbered list button',
    'the box becomes a numbered list',
    async () => {
      await t.clearAll();
      await t.selectObject(boxA.id);
      await t.clickControl('toolbar.numberedList');
      await t.settled();
      const s = await t.pollUntil(() => listState(boxA.id), isList, 6000);
      const ok = isList(s) && /number/i.test(s.json);
      await unlist(boxA.id);
      return { ok, observed: `type ${s.type}; marker ${s.marker}` };
    },
  );
  const presetRow = async (id, family, rowId) => {
    await t.step(
      id,
      `Format > Bullets & numbering > ${family} list, pick a preset`,
      `the box becomes a ${family} list`,
      async () => {
        await t.clearAll();
        await t.selectObject(boxA.id);
        await t.openMenu('format');
        await t.hoverRow('format.bulletsNumbering', `[data-control="menu.${rowId}"]`);
        await t.hoverRow(
          rowId,
          `[data-control^="${rowId}."], [data-control$=".pick"], [data-control*=".pick."]`,
        );
        const pick = page
          .locator(`[data-control^="${rowId}.pick."], [data-control^="menu.${rowId}."]`)
          .first();
        const r = await pick.boundingBox();
        if (!r) {
          await t.closeMenus();
          return { ok: false, observed: 'the preset submenu showed no preset' };
        }
        const picked = await pick.getAttribute('data-control');
        await t.clickAt(r.x + r.width / 2, r.y + r.height / 2);
        await t.settled();
        const s = await t.pollUntil(() => listState(boxA.id), isList, 6000);
        const ok =
          isList(s) && new RegExp(family === 'bulleted' ? 'bullet' : 'number', 'i').test(s.json);
        await unlist(boxA.id);
        return { ok, observed: `picked ${picked}; type ${s.type}; marker ${s.marker}` };
      },
    );
  };
  await presetRow('text.list.bulleted-menu-preset', 'bulleted', 'format.bulletsNumbering.bulleted');
  await presetRow('text.list.numbered-menu-preset', 'numbered', 'format.bulletsNumbering.numbered');
  await t.step(
    'text.list.chords',
    'Cmd+Shift+8 then Cmd+Shift+7 on the selected box',
    'a bulleted list, then a numbered one',
    async () => {
      await t.clearAll();
      await t.selectObject(boxA.id);
      await t.press('Meta+Shift+8');
      await t.settled();
      const b = await t.pollUntil(() => listState(boxA.id), isList, 6000);
      await t.selectObject(boxA.id);
      await t.press('Meta+Shift+7');
      await t.settled();
      const n = await t.pollUntil(
        () => listState(boxA.id),
        (s) => /number/i.test(s.json),
        6000,
      );
      const ok = isList(b) && /bullet/i.test(b.json) && /number/i.test(n.json);
      // leave boxB a bulleted list for the indent rows
      await t.selectObject(boxA.id);
      await t.press('Meta+Shift+8');
      await t.settled();
      return {
        ok,
        observed: `after Cmd+Shift+8 marker ${b.marker}; after Cmd+Shift+7 marker ${n.marker}`,
      };
    },
  );
  await t.step(
    'text.indent.toolbar',
    'Increase indent then Decrease indent on the toolbar',
    'the indent steps in and back',
    async () => {
      await t.clearAll();
      await t.selectObject(boxA.id);
      const j0 = await t.blockJson(X, boxA.id);
      await t.tailControl('toolbar.increaseIndent');
      await t.settled();
      const j1 = await t.pollUntil(
        () => t.blockJson(X, boxA.id),
        (j) => j !== j0,
        6000,
      );
      await t.tailControl('toolbar.decreaseIndent');
      await t.settled();
      const j2 = await t.pollUntil(
        () => t.blockJson(X, boxA.id),
        (j) => j !== j1,
        6000,
      );
      return {
        ok: j1 !== j0 && j2 !== j1,
        observed: `changed on increase ${j1 !== j0}, on decrease ${j2 !== j1}; ${j1.match(/"(indent|level)":\s*\d+/)?.[0] ?? 'no indent field'}`,
      };
    },
  );
  await t.step(
    'text.indent.keys',
    'Cmd+] then Cmd+[ inside the list session',
    'the indent steps in and back',
    async () => {
      await t.clearAll();
      const run = (await t.runsOfBlock(boxA.id))[0];
      await t.openRun(run);
      await t.press('End');
      const j0 = await t.blockJson(X, boxA.id);
      await t.press('Meta+]');
      await t.sleep(400);
      await t.settled();
      const j1 = await t.pollUntil(
        () => t.blockJson(X, boxA.id),
        (j) => j !== j0,
        6000,
      );
      await t.press('Meta+[');
      await t.sleep(400);
      await t.settled();
      const j2 = await t.pollUntil(
        () => t.blockJson(X, boxA.id),
        (j) => j !== j1,
        6000,
      );
      await t.press('Escape');
      return {
        ok: j1 !== j0 && j2 !== j1,
        observed: `changed on Cmd+] ${j1 !== j0}, on Cmd+[ ${j2 !== j1}`,
      };
    },
  );
  const linkRow = async (id, name, useButton) => {
    await t.step(
      id,
      name,
      'the word carries the link and no URL text lands in the caption',
      async () => {
        // a throwaway box: a link that lands as text (the rank 2 defect) never corrupts the shared boxes
        const made = await t.insertByTool(X, ['insert.textBox'], { x: 1200, y: 700 }, null, {
          text: 'See the proposal online',
        });
        await t.press('Escape');
        await t.settled();
        const box = made.obj;
        if (!box) return { ok: false, observed: 'no throwaway box for the link row' };
        const run = (await t.runsOfBlock(box.id))[0];
        await t.openRun(run);
        const before = await text(run);
        const sel = await t.selectWord(run, 1);
        /* the link popover of the product round (docs/PRODUCT.md section 2 rank 19; build/b2.md R6):
           its URL field is popover.link.url; the older ids stay for a build before it */
        const field = page
          .locator(
            '[data-control="popover.link.url"], [data-control="run.link.href"], [data-control="dialog.link.url"]',
          )
          .first();
        if (useButton) await t.tailControl('toolbar.insertLink');
        else await t.press('Meta+k');
        await field.waitFor({ timeout: 6000 });
        const fieldControl = await field.getAttribute('data-control');
        await field.click();
        await t.typeHuman('https://example.com/acme');
        await t.press('Enter');
        await t.sleep(600);
        await t.settled();
        const after = await text(run);
        const marks = await marksOf(run);
        const linked = marks.find(
          (m) => (m.tag === 'a' || m.mark === 'link' || m.href) && m.text.trim() === sel.trim(),
        );
        const json = await t.blockJson(X, box.id);
        await t.press('Escape');
        await t.clearAll();
        // the throwaway box leaves the slide, whatever the link did to it
        await t.selectObject(box.id);
        await t.press('Delete');
        await t.settled();
        return {
          ok: Boolean(linked) && after === before && /example\.com\/acme/.test(json),
          observed: `field ${fieldControl}; selected "${sel}"; text "${before}" -> "${after}"; link mark ${linked ? `"${linked.text.trim()}" href ${linked.href}` : 'none'}; stored ${/example\.com\/acme/.test(json)}`,
        };
      },
    );
  };
  await linkRow('text.link.cmd-k-enter', 'double click a word, Cmd+K, type a URL, Enter', false);
  await linkRow(
    'text.link.toolbar-button',
    'double click a word, the toolbar Insert link button, type a URL, Enter',
    true,
  );
  t.deck.linkBox = boxA.id;
  await t.step(
    'text.clear-formatting',
    'Clear formatting on the toolbar and Cmd+\\',
    'the size, alignment, leading and weight clear',
    async () => {
      await t.clearAll();
      await t.selectObject(boxA.id);
      const before = await typo(boxA.id, X);
      await t.tailControl('toolbar.clearFormatting');
      await t.settled();
      const after = await t.pollUntil(
        () => typo(boxA.id, X),
        (x) => x.json !== before.json,
        6000,
      );
      const cleared = [after.size, after.align, after.leading, after.weight].every(
        (v) => v === null || v === undefined,
      );
      // set one thing back and clear it with the key
      await t.selectObject(boxA.id);
      await t.press('Meta+Shift+r');
      await t.settled();
      await t.selectObject(boxA.id);
      await t.press('Meta+\\');
      await t.settled();
      const key = await t.pollUntil(
        () => typo(boxA.id, X),
        (x) => x.align === null || x.align === undefined,
        6000,
      );
      return {
        ok: cleared && (key.align === null || key.align === undefined),
        observed: `before size ${before.size} align ${before.align} leading ${before.leading}; after toolbar size ${after.size} align ${after.align} leading ${after.leading} weight ${after.weight}; after Cmd+\\ align ${key.align}`,
      };
    },
  );
  /* the Format menu rows drive box B, a plain text box: on the list block box A has become by the
     list rows the align, spacing and indent writes land on the list's own fields and the walk's
     typography read answered null for them on both origins (VERIFICATION.md F7's tail); the
     audits drove these rows on plain placeholders (audit-text rows 47 to 52) */
  const F = boxB ?? boxA;
  await t.step(
    'text.format-menu.rows-enabled',
    'open Format > Text with the box selected',
    'the rows are enabled',
    async () => {
      await t.selectObject(F.id);
      await t.openMenu('format');
      await t.hoverRow('format.text', '[data-control="menu.format.text.bold"]');
      const rows = await t.menuRows('format');
      const textRows = rows.filter((r) =>
        /^format\.text\.(bold|italic|underline|strikethrough)$/.test(r.id),
      );
      await t.closeMenus();
      return {
        ok: textRows.length === 4 && textRows.every((r) => !r.disabled),
        observed: textRows.map((r) => `${r.id}${r.disabled ? ' (disabled)' : ''}`).join(', '),
      };
    },
  );
  await t.step(
    'text.format-menu.size-increase',
    'Format > Text > Size > Increase font size',
    'the size steps up',
    async () => {
      await t.selectObject(F.id);
      const s0 = Number((await typo(F.id, X)).size ?? 0);
      await t.menuPath('format', 'format.text', 'format.text.size', 'format.text.size.increase');
      await t.settled();
      const s1 = Number(
        (
          await t.pollUntil(
            () => typo(F.id, X),
            (x) => Number(x.size ?? 0) > s0,
            6000,
          )
        ).size,
      );
      return { ok: s1 > s0, observed: `${s0 || 'default'} -> ${s1}` };
    },
  );
  await t.step(
    'text.format-menu.size-decrease',
    'Format > Text > Size > Decrease font size',
    'the size steps down',
    async () => {
      await t.selectObject(F.id);
      const s0 = Number((await typo(F.id, X)).size ?? 0);
      await t.menuPath('format', 'format.text', 'format.text.size', 'format.text.size.decrease');
      await t.settled();
      const s1 = Number(
        (
          await t.pollUntil(
            () => typo(F.id, X),
            (x) => Number(x.size ?? 0) !== s0,
            6000,
          )
        ).size,
      );
      return { ok: s1 < s0 || (s0 === 0 && s1 > 0), observed: `${s0 || 'default'} -> ${s1}` };
    },
  );
  await t.step(
    'text.format-menu.align-left',
    'Format > Align & indent > Left',
    'the alignment is left',
    async () => {
      await t.selectObject(F.id);
      await t.press('Meta+Shift+r');
      await t.settled();
      await t.selectObject(F.id);
      await t.menuPath('format', 'format.alignIndent', 'format.alignIndent.left');
      await t.settled();
      /* `left` alone passes (b2 R12): a null read is the box unchanged after a Right, which is the
         Format menu's miss, and `align-indent-rows` reads the same rows the same way */
      const got = await t.pollUntil(
        () => typo(F.id, X),
        (x) => x.align === 'left',
        6000,
      );
      return { ok: got.align === 'left', observed: `align ${got.align}` };
    },
  );
  await t.step(
    'text.format-menu.align-indent-rows',
    'Format > Align & indent > Center, Right, Increase indent, Decrease indent',
    'each applies from the menu',
    async () => {
      await t.selectObject(F.id);
      await t.menuPath('format', 'format.alignIndent', 'format.alignIndent.center');
      await t.settled();
      const c = await t.pollUntil(
        () => typo(F.id, X),
        (x) => x.align === 'center',
        6000,
      );
      await t.selectObject(F.id);
      await t.menuPath('format', 'format.alignIndent', 'format.alignIndent.right');
      await t.settled();
      const r = await t.pollUntil(
        () => typo(F.id, X),
        (x) => x.align === 'right',
        6000,
      );
      await t.selectObject(F.id);
      const j0 = await t.blockJson(X, F.id);
      await t.menuPath('format', 'format.alignIndent', 'format.alignIndent.increaseIndent');
      await t.settled();
      const j1 = await t.pollUntil(
        () => t.blockJson(X, F.id),
        (j) => j !== j0,
        6000,
      );
      await t.selectObject(F.id);
      await t.menuPath('format', 'format.alignIndent', 'format.alignIndent.decreaseIndent');
      await t.settled();
      const j2 = await t.pollUntil(
        () => t.blockJson(X, F.id),
        (j) => j !== j1,
        6000,
      );
      return {
        ok: c.align === 'center' && r.align === 'right' && j1 !== j0 && j2 !== j1,
        observed: `center ${c.align}; right ${r.align}; indent in ${j1 !== j0}, out ${j2 !== j1}`,
      };
    },
  );
  await t.step(
    'text.format-menu.spacing-double',
    'Format > Line & paragraph spacing > Double',
    'the leading is 2',
    async () => {
      await t.selectObject(F.id);
      await t.menuPath('format', 'format.spacing', 'format.spacing.double');
      await t.settled();
      const got = await t.pollUntil(
        () => typo(F.id, X),
        (x) => Number(x.leading) === 2,
        6000,
      );
      return { ok: Number(got.leading) === 2, observed: `leading ${got.leading}` };
    },
  );
  await t.step(
    'text.format-menu.spacing-single-1-15',
    'Format > Line & paragraph spacing > Single, then 1.15',
    'the leading follows each',
    async () => {
      await t.selectObject(F.id);
      await t.menuPath('format', 'format.spacing', 'format.spacing.single');
      await t.settled();
      const one = await t.pollUntil(
        () => typo(F.id, X),
        (x) => Number(x.leading ?? 1) === 1,
        6000,
      );
      await t.selectObject(F.id);
      await t.menuPath('format', 'format.spacing', 'format.spacing.1_15');
      await t.settled();
      const some = await t.pollUntil(
        () => typo(F.id, X),
        (x) => [1.15, 1.2].includes(Number(x.leading)),
        6000,
      );
      return {
        ok: Number(one.leading ?? 1) === 1 && [1.15, 1.2].includes(Number(some.leading)),
        observed: `single ${one.leading ?? 'default'}; 1.15 ${some.leading}`,
      };
    },
  );
  await t.step(
    'text.format-menu.text-fitting',
    'Format > Text fitting with the text box selected',
    'Format options opens for the box',
    async () => {
      await t.clearAll();
      await t.selectObject(F.id);
      await t.menuPath('format', 'format.textFitting');
      await t.waitControl('panel.formatOptions', 6000);
      const open = await t.has('[data-control="panel.formatOptions"]');
      /* the section is waited for and judged (b1 R14): the row opens the panel at Text fitting,
         and a read right after the panel's control appeared raced the section's mount */
      const fitting = await page
        .locator('[data-control="panel.formatOptions"] [data-section="textFitting"]')
        .first()
        .waitFor({ timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      if (await t.visible('panel.formatOptions.close'))
        await t.clickControl('panel.formatOptions.close');
      else await t.press('Escape');
      return {
        ok: open && fitting,
        observed: `panel open ${open}; text fitting section ${fitting}`,
      };
    },
  );
  await t.step(
    'text.format-options.panel',
    'Format > Format options with the text box selected',
    'the panel opens with the block sections (Size and Position)',
    async () => {
      await t.clearAll();
      await t.selectObject(F.id);
      await t.menuPath('format', 'format.formatOptions');
      await t.waitControl('panel.formatOptions', 6000);
      const sections = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control="panel.formatOptions"] [data-section]')].map(
          (el) => el.getAttribute('data-section'),
        ),
      );
      const ok = sections.includes('size') && sections.includes('position');
      if (await t.visible('panel.formatOptions.close'))
        await t.clickControl('panel.formatOptions.close');
      else await t.press('Escape');
      return { ok, observed: `sections ${sections.join(', ')}` };
    },
  );

  // ---- autofit
  await t.step(
    'text.autofit.title-wraps',
    'type a long title into the title slide',
    'the title wraps inside the sheet without overlapping the subtitle',
    async () => {
      await t.clickCard(T);
      await t.clearAll();
      await t.openRun(HEAD);
      await t.press('End');
      await t.typeHuman(' and the renewal terms for every region we serve this year');
      await t.sleep(600);
      const facts = await t.wrapFactsOf(HEAD, BODY);
      await t.press('Escape');
      await t.settled();
      const sheet = await t.sheetRect();
      const box = await t.rectOf(`.ts-stagewrap.ts-editor .pt-slide [data-run="${HEAD}"]`);
      const inside =
        box && sheet
          ? box.x + box.w <= sheet.x + sheet.w + 1 && box.y + box.h <= sheet.y + sheet.h + 1
          : false;
      return {
        ok:
          Boolean(facts) && facts.lines >= 2 && facts.splits === 0 && facts.overlap === 0 && inside,
        observed: `lines ${facts?.lines}; split words ${facts?.splits}; overlap with the subtitle ${facts?.overlap} px²; inside the sheet ${inside}`,
      };
    },
  );
  await t.step(
    'text.autofit.textbox-grow',
    'type a paragraph that overflows the drawn text box at its width and size',
    'the box grows and no text overflows the frame',
    async () => {
      await t.clickCard(X);
      await t.clearAll();
      const run = (await t.runsOfBlock(boxB.id))[0];
      const pos0 = (await t.blockOf(X, boxB.id)).pos;
      const h0 = pos0.h;
      const before = await t.blockJson(X, boxB.id);
      /* the live need of the text against the box, in sheet px: the sheet is laid out at 1600 px
         and scaled by a transform, so `scrollHeight` and the computed font size are layout px
         (sheet px already) while a bounding rect is CSS px and is divided by the stage scale (the
         first run of this row read 173 of scrollHeight against a 122 CSS px frame that was 173
         sheet px, a mixed unit); the font size is the box's own (the Format menu rows before
         this one may have stepped it) */
      const live = () =>
        page.evaluate((id) => {
          const inner = document.querySelector(
            `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`,
          );
          const box = inner?.closest('.free') ?? inner;
          if (!inner || !box) return null;
          const sheet = document.querySelector(
            '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)',
          );
          const k = sheet ? sheet.getBoundingClientRect().width / 1600 : 0;
          const content = inner.scrollHeight;
          const frame = box.getBoundingClientRect().height;
          const font = parseFloat(getComputedStyle(inner).fontSize) || 0;
          return {
            content: k > 0 ? Math.round(content * k * 10) / 10 : null,
            frame: Math.round(frame * 10) / 10,
            contentSheet: Math.round(content),
            frameSheet: k > 0 ? Math.round(frame / k) : null,
            fontSheet: Math.round(font),
            overflow: getComputedStyle(inner).overflow,
          };
        }, boxB.id);
      /* the paragraph is typed a sentence at a time until the text needs more than the box was
         drawn with, by a line or so, whatever font size the box carries (cycle 2's one sentence
         wrapped to four lines at 18 px inside the 140 px box, so no grow was due and the row
         judged nothing: VERIFICATION.md C2-F10); five sentences cover a 16 px box */
      const SENTENCES = [
        ' This paragraph runs long enough to need several lines inside the box so that the frame must grow to hold every word of it without any overflow.',
        ' The renewal terms for every region are listed below the summary, with the dates, the owners and the open questions for each account in the order the team reviews them.',
        ' Each line of this text adds to the height the box needs, and the box is expected to follow the text as it is typed so that nothing shows outside the frame.',
        ' A fourth sentence makes the paragraph long enough for a small font size, where a line holds more words and fewer lines are needed to fill the same box.',
        ' The last sentence of this paragraph closes the row and leaves the box taller than it was drawn.',
      ];
      const MARGIN = 20;
      await t.openRun(run);
      await t.press('End');
      let typed = '';
      let sentences = 0;
      let need = await live();
      for (const sentence of SENTENCES) {
        await t.typeHuman(sentence);
        typed += sentence;
        sentences += 1;
        await t.sleep(300);
        need = await live();
        if (need && need.contentSheet !== null && need.contentSheet >= h0 + MARGIN) break;
      }
      const overflowDue = Boolean(need) && need.contentSheet !== null && need.contentSheet > h0 + 1;
      const needSheet = need?.contentSheet ?? null;
      await t.press('Escape');
      await t.settled();
      /* the last burst's grow travels with its splice; the document and the frame are given a
         moment to hold the whole text before the row reads them */
      const fits = (r) => Boolean(r) && r.frameSheet !== null && r.contentSheet <= r.frameSheet + 2;
      const after = await t.pollUntil(
        async () => ({ block: await t.blockOf(X, boxB.id), live: await live() }),
        (r) => Boolean(r.block) && r.block.pos.h > h0 && fits(r.live),
        10_000,
      );
      const h1 = after.block?.pos.h ?? null;
      const facts = after.live;
      const stored = await t.blockJson(X, boxB.id);
      const landed =
        stored.includes('frame must grow') && stored.length >= before.length + typed.length - 8;
      const grew = h1 !== null && h1 > h0;
      const holds = fits(facts);
      return {
        ok: landed && overflowDue && grew && holds,
        observed: `pos.h ${h0} -> ${h1}; ${sentences} sentence${sentences === 1 ? '' : 's'} (${typed.length} characters) typed at ${need?.fontSheet ?? '?'} sheet px into a ${pos0.w} by ${h0} box; the text needed ${needSheet} sheet px before Escape (overflow due ${overflowDue}); after: content ${facts?.contentSheet} sheet px (${facts?.content} css px) in a frame of ${facts?.frameSheet} sheet px (${facts?.frame} css px); text landed ${landed}`,
      };
    },
  );

  // ---- the clipboard
  await t.step(
    'text.clipboard.within-box',
    'double click a word, Cmd+C, End, space, Cmd+V',
    'the word is appended',
    async () => {
      await t.clearAll();
      const run = (await t.runsOfBlock(boxA.id))[0];
      await t.openRun(run);
      const word = await t.selectWord(run, 0);
      await t.press('Meta+c');
      await t.press('End');
      await t.typeHuman(' ');
      await t.press('Meta+v');
      await t.sleep(500);
      const now = await text(run);
      await t.press('Escape');
      await t.settled();
      return {
        ok: word.trim().length > 0 && now.trim().endsWith(word.trim()),
        observed: `copied "${word}"; "${now}"`,
      };
    },
  );
  await t.step(
    'text.clipboard.between-boxes',
    'Cmd+A, Cmd+C in one box, Cmd+V in another',
    'the text lands in the other box',
    async () => {
      await t.clearAll();
      const runA = (await t.runsOfBlock(boxA.id))[0];
      await t.openRun(runA);
      await t.press('Meta+a');
      const copied = await t.selectionText();
      await t.press('Meta+c');
      await t.press('Escape');
      await t.clearAll();
      const runB = (await t.runsOfBlock(boxB.id))[0];
      await t.openRun(runB);
      await t.press('End');
      await t.typeHuman(' ');
      await t.press('Meta+v');
      await t.sleep(600);
      const now = await text(runB);
      await t.press('Escape');
      await t.settled();
      return {
        ok: copied.trim().length > 0 && now.includes(copied.trim().slice(0, 12)),
        observed: `copied "${copied.slice(0, 40)}"; box B now "${now.slice(-60)}"`,
      };
    },
  );
  /* the row is manual under the orchestrator's ruling (3) (core-matrix.json `manual`, the step
     in docs/gslides-parity/focus/manual-checklist.md): headless Chromium does not synthesize
     Cmd+Shift+V as a paste (b2's smoke: twelve runs, the chord pasted nothing while Cmd+V right
     after pasted the same clipboard), so the walk records the row as not driven with the reason and
     never drives a synthetic paste event in its place, which would prove the handler and not the
     chord. The code below stays for a headed run (`--headed`), where the chord does reach the page. */
  if (!t.options?.headed) {
    t.skipRow(
      'text.clipboard.paste-without-formatting',
      'copy a bold word, Cmd+Shift+V into another box',
      'plain text lands without the mark',
      'manual: headless Chromium does not synthesize Cmd+Shift+V as a paste; the step is docs/gslides-parity/focus/manual-checklist.md',
    );
  } else
    await t.step(
      'text.clipboard.paste-without-formatting',
      'copy a bold word, Cmd+Shift+V into another box',
      'plain text lands without the mark',
      async () => {
        await t.clearAll();
        const runA = (await t.runsOfBlock(boxA.id))[0];
        await t.openRun(runA);
        const word = await t.selectWord(runA, 0);
        await t.press('Meta+b');
        await t.sleep(300);
        await t.selectWord(runA, 0);
        await t.press('Meta+c');
        await t.press('Escape');
        await t.clearAll();
        const runB = (await t.runsOfBlock(boxB.id))[0];
        await t.openRun(runB);
        await t.press('End');
        await t.typeHuman(' ');
        await t.press('Meta+Shift+v');
        await t.sleep(600);
        const now = await text(runB);
        const marks = await marksOf(runB);
        const boldPasted = marks.some((m) => isBold(m) && m.text.trim() === word.trim());
        await t.press('Escape');
        await t.settled();
        // take the bold off the source word again
        await t.openRun(runA);
        await t.selectWord(runA, 0);
        await t.press('Meta+b');
        await t.press('Escape');
        await t.settled();
        return {
          ok: now.trim().endsWith(word.trim()) && !boldPasted,
          observed: `word "${word}"; box B ends with it ${now.trim().endsWith(word.trim())}; pasted bold ${boldPasted}`,
        };
      },
    );

  // ---- find and replace
  await t.step(
    'text.find-replace.replace-all',
    'Edit > Find and replace, find, replace, Replace all',
    'the word changes across the deck',
    async () => {
      await t.clearAll();
      await t.menuPath('edit', 'edit.findReplace');
      await t.waitControl('dialog.findReplace.find', 6000);
      await t.clickControl('dialog.findReplace.find');
      await t.typeHuman('Onboarding');
      const result = await t.pollUntil(
        async () =>
          (await t.textOf('dialog.findReplace.count')) ??
          (await t.textOf('dialog.findReplace.result')) ??
          (await t.textOf('dialog.findReplace')),
        (r) => /[1-9]/.test(r ?? ''),
        6000,
      );
      await t.clickControl('dialog.findReplace.replace');
      await t.typeHuman('Kickoff');
      await t.clickControl('dialog.findReplace.replaceAll');
      await t.sleep(600);
      await t.settled();
      await t.press('Escape');
      const json = await t.blockJson(X, boxA.id);
      return {
        ok: /[1-9]/.test(result ?? '') && json.includes('Kickoff') && !json.includes('Onboarding'),
        observed: `result "${result}"; replaced ${json.includes('Kickoff')}`,
      };
    },
  );
  await t.step(
    'text.find-replace.shortcut',
    'Cmd+Shift+H, type a query, Escape',
    'the dialog opens, the query counts, Escape closes',
    async () => {
      await t.clearAll();
      await t.press('Meta+Shift+h');
      await t.waitControl('dialog.findReplace.find', 6000);
      await t.clickControl('dialog.findReplace.find');
      /* the dialog remembers the last query (the row before typed Onboarding): the field is
         cleared before the new one, as a person does */
      await t.press('Meta+a');
      await t.typeHuman('Kickoff');
      await t.press('Enter');
      const result = await t.pollUntil(
        async () =>
          (await t.textOf('dialog.findReplace.count')) ??
          (await t.textOf('dialog.findReplace.result')) ??
          (await t.textOf('dialog.findReplace')),
        (r) => /[1-9]/.test(r ?? ''),
        6000,
      );
      await t.press('Escape');
      const gone = await t.waitGone('[data-control="dialog.findReplace"]', 4000);
      return {
        ok: /[1-9]/.test(result ?? '') && gone,
        observed: `result "${result}"; closed ${gone}`,
      };
    },
  );

  // ---- the right click menus
  await t.step(
    'text.context.text-block',
    'right click the text box, read the rows, Duplicate from it',
    'the rows and a copy',
    async () => {
      await t.clearAll();
      await t.selectObject(boxA.id);
      const b = await t.boxOf(boxA.id);
      const c = t.center(b.free);
      await t.rightClickAt(c.x, c.y);
      const rows = (await t.contextRows()).map((r) => r.id);
      const want = [
        'edit.cut',
        'edit.copy',
        'edit.paste',
        'arrange.order',
        'arrange.centerOnPage',
        'arrange.align',
        'insert.link',
        'format.textFitting',
        'format.formatOptions',
        'insert.comment',
      ];
      const missing = want.filter((id) => !rows.includes(id));
      const beforeIds = await t.objectIds(X);
      if (rows.includes('edit.duplicate')) await t.clickContextRow('edit.duplicate');
      else await t.press('Escape');
      const copy = await t.newObjectAfter(X, beforeIds, 8000);
      await t.settled();
      // the copy leaves by its own id, whichever object the menu left selected (rank 34)
      if (copy) {
        await t.clearAll();
        await t.selectObject(copy.id);
        await t.press('Delete');
        await t.settled();
      }
      return {
        ok: missing.length === 0 && copy !== null,
        observed: `rows ${rows.join(', ')}; missing ${missing.join(', ') || 'none'}; duplicated ${copy !== null}`,
      };
    },
  );
  await t.step(
    'text.context.text-selection',
    'right click a selected word, read the rows, Italic from it',
    'the rows and the word alone italic',
    async () => {
      await t.clearAll();
      const run = (await t.runsOfBlock(boxA.id))[0];
      await t.openRun(run);
      const sel = await t.selectWord(run, 0);
      const w = await t.wordRect(run, 0);
      await t.rightClickAt(w.x + w.w / 2, w.y + w.h / 2);
      const rows = (await t.contextRows()).map((r) => r.id);
      const want = [
        'edit.cut',
        'edit.copy',
        'edit.paste',
        'format.text.italic',
        'format.text.underline',
        'format.text.strikethrough',
        'insert.link',
        'format.formatOptions',
      ];
      const missing = want.filter((id) => !rows.includes(id));
      if (rows.includes('format.text.italic')) await t.clickContextRow('format.text.italic');
      else await t.press('Escape');
      await t.sleep(500);
      const marks = await marksOf(run);
      const hit = markedWord(marks, sel.trim(), isItalic);
      await t.press('Escape');
      await t.settled();
      if (hit) {
        await t.openRun(run);
        await t.selectWord(run, 0);
        await t.press('Meta+i');
        await t.press('Escape');
        await t.settled();
      }
      return {
        ok: missing.length === 0 && hit,
        observed: `rows ${rows.join(', ')}; missing ${missing.join(', ') || 'none'}; italic on "${sel}" ${hit}`,
      };
    },
  );

  await t.step(
    'text.context.inside-session',
    'double click the text box, click to collapse the caret, right click at the caret',
    "the text box's object menu opens with the clipboard, arrange and Comment rows",
    async () => {
      await t.clearAll();
      const run = (await t.runsOfBlock(boxA.id))[0];
      await t.openRun(run);
      const w = await t.wordRect(run, 1);
      if (!w) return { ok: false, observed: 'no second word in the box' };
      // a plain click inside the session collapses the caret at the word
      await t.clickAt(w.x + w.w / 2, w.y + w.h / 2);
      const on = await t.editing();
      const collapsed = (await t.selectionText()) === '';
      const opened = await t.rightClickAt(w.x + w.w / 2, w.y + w.h / 2);
      const rows = (await t.contextRows()).map((r) => r.id);
      const want = ['edit.copy', 'edit.paste', 'arrange.order', 'insert.comment'];
      const missing = want.filter((id) => !rows.includes(id));
      const textMenu = rows.includes('format.text.italic') && !rows.includes('arrange.order');
      await t.press('Escape');
      await t.sleep(200);
      await t.clearAll();
      return {
        ok: on && collapsed && opened && missing.length === 0 && !textMenu,
        observed: `session ${on}; caret collapsed ${collapsed}; menu opened ${opened}; rows ${rows.join(', ') || 'none'}; missing ${missing.join(', ') || 'none'}; the text selection menu instead ${textMenu}`,
      };
    },
  );

  // ---- the layout runs
  await t.step(
    'text.layout-runs.type',
    'type into a table cell, a Ruled rows value, a Status board row name and the Big number; reload',
    'each reads back',
    async () => {
      const results = [];
      const L = t.deck.layoutSlide ?? (await t.setupSlide(X, 'split'));
      const typeInto = async (layout, index, value) => {
        await t.clickCard(L);
        await t.clearAll();
        const empty = await t.emptySheetPoint();
        await t.clickAt(empty.x, empty.y);
        await t.tailControl('toolbar.layout');
        await t.waitControl('layout.apply.plate', 8000);
        await t.pickLayout(`layout.apply.${layout}`);
        await t.pollUntil(
          async () => (await t.slideJson(L)).template,
          (l) => l === layout,
          15_000,
        );
        await t.settled();
        await t.sleep(400);
        const rs = await t.runs();
        const run = rs[Math.min(index, rs.length - 1)];
        if (!run) return { layout, ok: false, why: 'no run' };
        await t.openRun(run);
        await t.press('Meta+a');
        await t.typeHuman(value);
        await t.press('Escape');
        await t.settled();
        return { layout, run, value };
      };
      const typed = [];
      typed.push(await typeInto('table', 1, '42'));
      const tableJson = JSON.stringify(await t.slideJson(L));
      results.push(`table ${tableJson.includes('42')}`);
      typed.push(await typeInto('rows', 1, '1.2M'));
      typed.push(await typeInto('board', 1, 'Design'));
      typed.push(await typeInto('big-number', 0, '87'));
      await t.reloadTo(`${BASE}/edit/${t.deck.id}#s/${L}`);
      await t.settled();
      const after = JSON.stringify(await t.slideJson(L));
      const big = after.includes('87');
      results.push(
        `rows typed ${typed[1].value ? 'yes' : 'no'}`,
        `board typed ${typed[2].value ? 'yes' : 'no'}`,
        `big number after reload ${big}`,
      );
      // the earlier layouts' texts moved with each layout change: what survives is the last typed value
      return {
        ok: tableJson.includes('42') && typed.every((x) => x.value) && big,
        observed: results.join('; '),
      };
    },
  );

  // ---- persistence
  await t.step(
    'text.persistence.reload',
    'reload the text box slide and the title slide',
    'the title, subtitle, text box and list persist',
    async () => {
      // what the tab holds right before the load is what a reload has to bring back: the two
      // boxes and the title slide as stored, whatever the earlier rows managed to write (a row
      // that failed before this one leaves a different text, which is not this row's question)
      await t.clearAll();
      await t.settled();
      const before = {
        a: await t.blockJson(X, boxA.id),
        b: boxB ? await t.blockJson(X, boxB.id) : 'null',
        title: JSON.stringify(await t.slideJson(T)),
      };
      // a real load: the address changes by its hash alone, which the app handles in the same
      // document without a reload, so the page leaves the document first (toolkit reloadTo)
      await t.reloadTo(`${BASE}/edit/${t.deck.id}#s/${X}`);
      await t.settled();
      const after = {
        a: await t.blockJson(X, boxA.id),
        b: boxB ? await t.blockJson(X, boxB.id) : 'null',
        title: JSON.stringify(await t.slideJson(T)),
      };
      const same = (k) => before[k] === after[k];
      const facts = {
        kickoff: after.a.includes('Kickoff'),
        list: /marker|list/.test(after.a) || /marker|list/.test(after.b),
        title: after.title.includes('Quarterly'),
        subtitle: !BODY || after.title.includes('grew 12 percent'),
      };
      return {
        ok: before.a !== 'null' && same('a') && same('b') && same('title'),
        observed: `box A the same ${same('a')}; box B the same ${same('b')}; title slide the same ${same('title')}; after the load: Kickoff ${facts.kickoff}, a list ${facts.list}, the title ${facts.title}, the subtitle ${facts.subtitle}`,
      };
    },
  );

  // ---- the return round's rows (docs/RETURN.md 2.14 items 1 and 3, section 5): the cover title
  // takes the toolbar's tail and every text control on one click; a typed field is one undo step
  /** The cover title as drawn: weight, align and size of its run, and the stored typography where a block exists. */
  const titleFacts = async () => {
    await onTitleSlide();
    const drawn = await page.evaluate((r) => {
      const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { weight: cs.fontWeight, align: cs.textAlign, size: parseFloat(cs.fontSize) };
    }, HEAD);
    const slide = await t.slideJson(T);
    const blockId = (await t.blockOfRun(HEAD)) ?? HEAD_BLOCK;
    const stored = (await t.blockOf(T, blockId))?.block?.typography ?? slide.typography ?? null;
    return { drawn, stored, kind: slide.kind ?? slide.template ?? null, blockId };
  };
  /** The stored typography weight of the title's facts, a number or null where none is stored. */
  const storedWeight = (f) =>
    f?.stored?.weight === undefined || f?.stored?.weight === null ? null : Number(f.stored.weight);
  /** A format write on the title by one click: the action, the facts read, the snackbar, then Cmd+Z. */
  const titleRow = async (rowId, name, act, changed) => {
    await t.step(
      rowId,
      name,
      'the write lands on the title with no refusal; Cmd+Z takes it back',
      async () => {
        await t.clearAll();
        const before = await titleFacts();
        const { facts } = await clickTitle();
        const rev0 = await t.stableRevision();
        await act();
        await t.settled();
        const after = await t
          .pollUntil(titleFacts, (f) => changed(before, f), 8000)
          .catch(titleFacts);
        const rev1 = await t.stableRevision();
        const snack = await t.snackbar();
        await t.clearAll();
        await t.press('Meta+z');
        await t.sleep(500);
        await t.settled();
        const back = await titleFacts();
        const restored =
          JSON.stringify(back.drawn) === JSON.stringify(before.drawn) &&
          storedWeight(back) === storedWeight(before);
        return {
          ok:
            selectedNoCaret(facts) &&
            changed(before, after) &&
            rev1 > rev0 &&
            !/No block/.test(snack ?? '') &&
            restored,
          observed: `selected ${selectedNoCaret(facts)}; drawn ${JSON.stringify(before.drawn)} -> ${JSON.stringify(after.drawn)} (stored ${JSON.stringify(after.stored)}, slide kind ${before.kind} -> ${after.kind}); revision ${rev0} -> ${rev1}; snackbar ${snack ?? 'none'}; Cmd+Z restored ${restored}`,
        };
      },
    );
  };
  await t.step(
    'text.title.one-click-tail',
    'one click on the cover title',
    'the toolbar swaps to the text tail',
    async () => {
      await t.clearAll();
      const { facts } = await clickTitle();
      const tail = await t.pollUntil(tailVisible, (x) => x, 3000).catch(tailVisible);
      const controls = await page.evaluate(() =>
        [...document.querySelectorAll('.ts-toolbar [data-control^="toolbar."]')]
          .filter((e) => e.getClientRects().length > 0)
          .map((e) => e.getAttribute('data-control'))
          .filter((c) => /bold|fontSize$|align$|textColor/.test(c)),
      );
      return {
        ok: selectedNoCaret(facts) && tail,
        observed: `${t.describeSelection(facts)}; text tail ${tail} (${controls.join(', ') || 'none of bold, fontSize, align, textColor'})`,
      };
    },
  );
  /* the row's words (RETURN.md section 5): "weight 500 is stored and drawn". The theme draws the
     cover heading at 500 already (sheet.css h1; B2's return note, open item 1), so Bold on it moves
     no pixel: the write is judged on the stored typography (weight 500 landing where it was not)
     with the drawn weight at 500 or above, or on a drawn weight above the one before. */
  const bolder = (a, b) =>
    Number(b.drawn?.weight) >= 500 &&
    (Number(b.drawn?.weight) > Number(a.drawn?.weight) ||
      (storedWeight(b) === 500 && storedWeight(a) !== 500));
  await titleRow(
    'text.title.bold-menu',
    'click the cover title once, Format > Text > Bold',
    () => t.menuPath('format', 'format.text', 'format.text.bold'),
    bolder,
  );
  await titleRow(
    'text.title.bold-cmd-b',
    'click the cover title once, Cmd+B',
    () => t.press('Meta+b'),
    bolder,
  );
  await titleRow(
    'text.title.align-menu',
    'click the cover title once, Format > Align & indent > Center',
    () => t.menuPath('format', 'format.alignIndent', 'format.alignIndent.center'),
    (a, b) => b.drawn?.align === 'center' && a.drawn?.align !== 'center',
  );
  await titleRow(
    'text.title.size-menu',
    'click the cover title once, Format > Text > Size > Decrease font size',
    () => t.menuPath('format', 'format.text', 'format.text.size', 'format.text.size.decrease'),
    (a, b) => (b.drawn?.size ?? 0) < (a.drawn?.size ?? 0),
  );
  await titleRow(
    'text.title.format-options-marks',
    'click the cover title once, Format options, the B toggle',
    async () => {
      await t
        .tailControl('toolbar.formatOptions')
        .catch(() => t.menuPath('format', 'format.formatOptions'));
      await t.waitControl('panel.formatOptions', 8000);
      const bold = await page.evaluate(() => {
        const marks = document.querySelector('[data-control="formatOptions.text.marks"]');
        const btn = marks
          ? [...marks.querySelectorAll('button')].find((b) =>
              /^B$|bold/i.test((b.getAttribute('aria-label') ?? b.textContent ?? '').trim()),
            )
          : null;
        return (
          btn?.getAttribute('data-control') ??
          (btn ? (btn.setAttribute('data-control', 'b4.marks.bold'), 'b4.marks.bold') : null)
        );
      });
      if (!bold) throw new Error('no B toggle in the Format options Text section');
      await t.clickControl(bold);
      await t.sleep(300);
      if (await t.visible('panel.formatOptions.close'))
        await t.clickControl('panel.formatOptions.close');
    },
    bolder,
  );
  await t.step(
    'text.title.apply-layout-after-format',
    'bold the cover title by one click and Cmd+B, then toolbar Layout > the title layout again; Cmd+Z',
    "the slide keeps its heading and subtitle text and the placeholders return to the layout's positions; Cmd+Z restores the bold",
    async () => {
      await t.clearAll();
      const headText = await text(HEAD);
      const bodyText = BODY ? await text(BODY) : null;
      await clickTitle();
      await t.press('Meta+b');
      await t.settled();
      const bold = await titleFacts();
      const posBefore = await page.evaluate(
        (r) =>
          document
            .querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`)
            ?.getBoundingClientRect()
            .toJSON() ?? null,
        HEAD,
      );
      await t.clearAll();
      await t.clickControl('toolbar.layout');
      await t.waitControl('layout.apply.plate', 8000);
      await t.clickControl('layout.apply.title');
      await t.settled();
      await t.sleep(500);
      const headAfter = await text(HEAD);
      const bodyAfter = BODY ? await text(BODY) : null;
      const layout = (await t.slideJson(T)).template ?? (await t.slideJson(T)).layout?.name ?? null;
      const posAfter = await page.evaluate(
        (r) =>
          document
            .querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`)
            ?.getBoundingClientRect()
            .toJSON() ?? null,
        HEAD,
      );
      const snack = await t.snackbar();
      await t.press('Meta+z');
      await t.sleep(500);
      await t.settled();
      const afterUndo = await titleFacts();
      return {
        ok:
          bolder({ drawn: { weight: '400' } }, bold) &&
          headAfter === headText &&
          bodyAfter === bodyText &&
          Number(afterUndo.drawn?.weight) >= 500,
        observed: `bold weight ${bold.drawn?.weight}; heading "${headText}" -> "${headAfter}"; subtitle "${bodyText}" -> "${bodyAfter}"; layout after ${layout}; title box ${posBefore ? `${Math.round(posBefore.x)},${Math.round(posBefore.y)}` : '?'} -> ${posAfter ? `${Math.round(posAfter.x)},${Math.round(posAfter.y)}` : '?'}; snackbar ${snack ?? 'none'}; after Cmd+Z weight ${afterUndo.drawn?.weight}`,
      };
    },
  );
  await t.step(
    'text.fontsize.type-one-undo',
    'select box A, type 28 in the size field, Enter; one Cmd+Z',
    'the size applies; one Cmd+Z restores the previous size',
    async () => {
      await t.clickCard(X);
      await t.clearAll();
      await t.selectObject(boxA.id);
      const before = (await typo(boxA.id, X)).size;
      const rev0 = await t.stableRevision();
      await t.clickControl('toolbar.fontSize.value');
      await t.press('Meta+a');
      await t.typeHuman('28');
      await t.press('Enter');
      /* the snap sentence is read as it shows: the snackbar holds five seconds and the revision
         wait below can outlast it (the first drive read "none" after the wait while the sentence
         had shown; return/build/integrator.md) */
      const snackEarly = await t.snackbarWithin(3000).catch(() => null);
      await t.settled();
      const after = await t
        .pollUntil(
          async () => (await typo(boxA.id, X)).size,
          (s) => s !== before && s !== null,
          8000,
        )
        .catch(async () => (await typo(boxA.id, X)).size);
      const rev1 = await t.stableRevision();
      const snack = snackEarly ?? (await t.snackbar());
      await t.clearAll();
      await t.press('Meta+z');
      await t.sleep(500);
      await t.settled();
      const back = (await typo(boxA.id, X)).size;
      return {
        ok:
          after !== before &&
          (after === 28 || /step|snap/i.test(snack ?? '')) &&
          rev1 === rev0 + 1 &&
          back === before,
        observed: `size ${before} -> ${after} (snackbar ${snack ?? 'none'}); revision ${rev0} -> ${rev1}; one Cmd+Z -> ${back}`,
      };
    },
  );
  await t.step(
    'text.format-options.field-one-undo',
    'select box A, Format options, type 400 in Width, Enter; one Cmd+Z',
    'the width applies as one history entry; one Cmd+Z restores it',
    async () => {
      await t.clickCard(X);
      await t.clearAll();
      await t.selectObject(boxA.id);
      const before = (await t.blockOf(X, boxA.id))?.pos?.w ?? null;
      const rev0 = await t.stableRevision();
      await t.tailControl('toolbar.formatOptions');
      await t.waitControl('formatOptions.size.width', 8000);
      await t.clickControl('formatOptions.size.width');
      await t.press('Meta+a');
      await t.typeHuman('400');
      await t.press('Enter');
      await t.settled();
      const after = await t
        .pollUntil(
          async () => (await t.blockOf(X, boxA.id))?.pos?.w ?? null,
          (w) => w === 400,
          8000,
        )
        .catch(async () => (await t.blockOf(X, boxA.id))?.pos?.w ?? null);
      const rev1 = await t.stableRevision();
      if (await t.visible('panel.formatOptions.close'))
        await t.clickControl('panel.formatOptions.close');
      await t.clearAll();
      await t.press('Meta+z');
      await t.sleep(500);
      await t.settled();
      const back = (await t.blockOf(X, boxA.id))?.pos?.w ?? null;
      return {
        ok: after === 400 && rev1 === rev0 + 1 && back === before,
        observed: `width ${before} -> ${after}; revision ${rev0} -> ${rev1}; one Cmd+Z -> ${back}`,
      };
    },
  );
  t.deck.textBoxes = [boxA.id, boxB.id];
  await productRound(t);
}

/**
 * The product round's rows (docs/PRODUCT.md section 2 ranks 9, 18 and 19, section 3.2, section 5,
 * 8.1): link detection on a space and on Enter, the double click on an address, Shift+Home on a
 * line, the link popover with Apply and Remove, the Format options padding grid and the remembered
 * section, Shrink text on overflow and Find and replace counting while typing. B2 owns the text
 * session, the popover and the panel; the rows read the marks, the stored block and the panel.
 */
async function productRound(t) {
  const { page } = t;
  const X = t.deck.textSlide ?? t.deck.titleSlide;
  const MARKS = 'b, strong, i, em, u, s, [data-mark], a, span[style]';
  const marksOf = (run) =>
    page.evaluate(
      ([r, sel]) => {
        const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
        if (!el) return [];
        return [...el.querySelectorAll(sel)].map((m) => ({
          tag: m.tagName.toLowerCase(),
          mark: m.getAttribute('data-mark'),
          text: m.textContent ?? '',
          href: m.getAttribute('href') ?? m.getAttribute('data-href') ?? null,
        }));
      },
      [run, MARKS],
    );
  const linkOf = (marks, host) =>
    marks.find(
      (m) => (m.tag === 'a' || m.mark === 'link' || m.href) && (m.href ?? '').includes(host),
    ) ?? null;
  const textOf = async (run) => ((await t.runInfo(run))?.text ?? '').replace(/ /g, ' ');
  await t.clickCard(X);
  await t.clearAll();
  const LINK = await t
    .setup('a text box for the link rows', 'block.insert through the window API', async () => {
      const obj = await t.placeBlock(X, {
        id: 'link-box',
        type: 'text',
        text: 'Visit the site for the terms',
        pos: { x: 160, y: 640, w: 1100, h: 100 },
      });
      return { ok: Boolean(obj), observed: obj ? obj.id : 'none' };
    })
    .then(() => 'link-box');
  const linkRun = async () => (await t.runsOfBlock(LINK))[0];

  await t.step(
    'text.link.detect-url',
    'type generaltranslation.com then a space at the end of the box; Cmd+Z',
    'the token is wrapped as a link to https://generaltranslation.com; one Cmd+Z removes the link and keeps the text',
    async () => {
      await t.clearAll();
      const run = await linkRun();
      await t.openRun(run);
      await t.press('End');
      await t.typeHuman(' generaltranslation.com');
      await t.typeHuman(' ');
      const marks = await t
        .pollUntil(
          () => marksOf(run),
          (m) => linkOf(m, 'generaltranslation.com') !== null,
          3000,
        )
        .catch(() => marksOf(run));
      const link = linkOf(marks, 'generaltranslation.com');
      const textAfter = await textOf(run);
      await t.press('Meta+z');
      await t.sleep(400);
      const marksUndone = await marksOf(run);
      const textUndone = await textOf(run);
      await t.press('Escape');
      await t.settled();
      return {
        ok:
          link !== null &&
          link.href === 'https://generaltranslation.com' &&
          linkOf(marksUndone, 'generaltranslation.com') === null &&
          textUndone.includes('generaltranslation.com'),
        observed: `text "${textAfter.trim()}"; link ${link ? `"${link.text.trim()}" -> ${link.href}` : 'none'}; after Cmd+Z link ${linkOf(marksUndone, 'generaltranslation.com') ? 'still there' : 'gone'}, text "${textUndone.trim()}"`,
      };
    },
  );
  await t.step(
    'text.link.detect-email',
    'type an email address then Enter',
    'the address is wrapped as a mailto: link',
    async () => {
      await t.clearAll();
      const run = await linkRun();
      await t.openRun(run);
      await t.press('End');
      await t.typeHuman(' kevin@generaltranslation.com');
      await t.press('Enter');
      const marks = await t
        .pollUntil(
          () => marksOf(run),
          (m) => m.some((x) => (x.href ?? '').startsWith('mailto:')),
          3000,
        )
        .catch(() => marksOf(run));
      const link = marks.find((x) => (x.href ?? '').startsWith('mailto:')) ?? null;
      /* the address and the line break leave with one Cmd+Z each, then Escape */
      await t.press('Meta+z');
      await t.press('Meta+z');
      await t.press('Escape');
      await t.settled();
      return {
        ok: link !== null && link.href === 'mailto:kevin@generaltranslation.com',
        observed: `link ${link ? `"${link.text.trim()}" -> ${link.href}` : 'none'}; marks ${marks.map((m) => `${m.tag}:${m.text.trim()}`).join(', ') || 'none'}`,
      };
    },
  );
  await t.step(
    'text.select.double-click-address',
    'double click generaltranslation.com in the box',
    'the whole address is selected',
    async () => {
      await t.clearAll();
      const run = await linkRun();
      const words = (await textOf(run)).trim().split(/\s+/);
      let at = words.findIndex((w) => w.includes('generaltranslation.com'));
      if (at < 0) {
        await t.openRun(run);
        await t.press('End');
        await t.typeHuman(' generaltranslation.com');
        await t.press('Escape');
        await t.settled();
        at = (await textOf(run))
          .trim()
          .split(/\s+/)
          .findIndex((w) => w.includes('generaltranslation.com'));
      }
      await t.openRun(run);
      const sel = await t.selectWord(run, at);
      await t.press('Escape');
      return {
        ok: sel.trim() === 'generaltranslation.com',
        observed: `word ${at}; selected "${sel}"`,
      };
    },
  );
  await t.step(
    'text.select.shift-home-line',
    'a three line paragraph in a narrow box; End; Shift+Home',
    'the third line alone is selected',
    async () => {
      await t.clearAll();
      const obj = await t.placeBlock(X, {
        id: 'line-box',
        type: 'text',
        text: 'The renewal covers the three regions and the two new products for the whole of next year',
        pos: { x: 1200, y: 120, w: 300, h: 160 },
      });
      if (!obj) return { ok: false, observed: 'the narrow box was not placed' };
      const run = (await t.runsOfBlock('line-box'))[0];
      const info = await t.runInfo(run);
      await t.openRun(run);
      /* End reaches the end of the visual line since the product round (docs/PRODUCT.md section 2
         rank 18), so the caret goes to the end of the text first (Cmd+Down on macOS) */
      await t.press('Meta+ArrowDown');
      await t.press('End');
      await t.press('Shift+Home');
      const sel = (await t.selectionText()).replace(/ /g, ' ').trim();
      const lastLine = await page.evaluate((r) => {
        const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
        if (!el) return null;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const chars = [];
        let node;
        while ((node = walker.nextNode())) {
          if (node.parentElement?.closest('[data-prompt]')) continue;
          const text = node.textContent ?? '';
          for (let i = 0; i < text.length; i += 1) {
            const range = document.createRange();
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            chars.push({ ch: text[i], top: Math.round(range.getBoundingClientRect().top) });
          }
        }
        const tops = [...new Set(chars.map((c) => c.top))].sort((a, b) => a - b);
        const last = tops[tops.length - 1];
        return {
          lines: tops.length,
          text: chars
            .filter((c) => c.top === last)
            .map((c) => c.ch)
            .join('')
            .trim(),
        };
      }, run);
      await t.press('Escape');
      const s = await t.settled();
      await t
        .invoke('block.remove', { baseRevision: s.revision, slideId: X, blockId: 'line-box' })
        .catch(() => undefined);
      await t.settled();
      return {
        ok: (lastLine?.lines ?? 0) >= 3 && sel.length > 0 && sel === lastLine?.text,
        observed: `${info?.lines ?? '?'} lines; Shift+Home selected "${sel}"; the last line reads "${lastLine?.text ?? '?'}"`,
      };
    },
  );
  await t.step(
    'text.link.popover-apply-remove',
    'select a word, Cmd+K; read the popover; type an address, Enter; click the linked word; Remove',
    'the popover has the Link label, the URL field, Slides in this presentation, Apply and Remove; Enter applies; the chip has Change and Remove; Remove takes the link off',
    async () => {
      await t.clearAll();
      const run = await linkRun();
      await t.openRun(run);
      const sel = await t.selectWord(run, 1);
      await t.press('Meta+k');
      const field = page
        .locator(
          '[data-control="popover.link.url"], [data-control="run.link.href"], [data-control="dialog.link.url"]',
        )
        .first();
      await field.waitFor({ timeout: 6000 }).catch(() => undefined);
      const facts = await page.evaluate(() => {
        const q = (c) => document.querySelector(`[data-control="${c}"]`);
        const popover = q('popover.link');
        return {
          popover: Boolean(popover),
          label: /Link/.test(popover?.textContent ?? ''),
          url: Boolean(q('popover.link.url')),
          slide: Boolean(q('popover.link.slide')),
          apply: Boolean(q('popover.link.apply')),
          remove: Boolean(q('popover.link.remove')),
          bare: Boolean(q('run.link.href')),
          selectedShown: (popover?.textContent ?? '').includes('the'),
        };
      });
      if (!facts.popover) {
        await t.press('Escape');
        await t.press('Escape');
        return {
          ok: false,
          observed: `no popover.link; the bare field run.link.href ${facts.bare ? 'opened alone (audit-seller 19)' : 'did not open either'}`,
        };
      }
      await field.click();
      await t.typeHuman('https://example.com/terms');
      await t.press('Enter');
      const marks = await t
        .pollUntil(
          () => marksOf(run),
          (m) => linkOf(m, 'example.com/terms') !== null,
          4000,
        )
        .catch(() => marksOf(run));
      const linked = linkOf(marks, 'example.com/terms');
      let chip = { change: false, remove: false };
      let removed = null;
      if (linked) {
        const word = await page.evaluate(
          ([r, text]) => {
            const el = document.querySelector(
              `.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"] a`,
            );
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text };
          },
          [run, sel],
        );
        if (word) {
          await t.clickAt(word.x, word.y);
          await t.sleep(400);
          chip = {
            change: await t.visible('chip.link.change'),
            remove: await t.visible('chip.link.remove'),
          };
          if (chip.remove) {
            await t.clickControl('chip.link.remove');
            removed = await t
              .pollUntil(
                () => marksOf(run),
                (m) => linkOf(m, 'example.com/terms') === null,
                4000,
              )
              .then(() => true)
              .catch(() => false);
          }
        }
      }
      await t.press('Escape');
      await t.clearAll();
      await t.settled();
      return {
        ok:
          facts.label &&
          facts.url &&
          facts.slide &&
          facts.apply &&
          facts.remove &&
          linked !== null &&
          chip.change &&
          chip.remove &&
          removed === true,
        observed: `popover ${JSON.stringify(facts)}; selected "${sel}"; link ${linked ? linked.href : 'none'}; chip Change ${chip.change}, Remove ${chip.remove}; removed ${removed}`,
      };
    },
  );

  const FIT = await t
    .setup('a text box for the fitting rows', 'block.insert through the window API', async () => {
      const obj = await t.placeBlock(X, {
        id: 'fit-box',
        type: 'text',
        text: 'Short',
        pos: { x: 1200, y: 320, w: 360, h: 90 },
      });
      return { ok: Boolean(obj), observed: obj ? obj.id : 'none' };
    })
    .then(() => 'fit-box');
  const closePanel = async () => {
    if (await t.visible('panel.formatOptions.close'))
      await t.clickControl('panel.formatOptions.close');
    await t.sleep(200);
  };
  const sectionsState = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-control="panel.formatOptions"] [data-section]')].map(
        (el) => ({
          id: el.getAttribute('data-section'),
          open: !el.classList.contains('is-closed'),
        }),
      ),
    );
  await t.step(
    'text.format-options.padding-grid',
    'select the box, Format > Text fitting; read the Padding fields',
    'one Padding head, Top, Bottom, Left, Right in two by two, the unit inside the field, labels at 12.5 px in ink-2',
    async () => {
      await t.clearAll();
      await t.selectObject(FIT);
      await t.menuPath('format', 'format.textFitting');
      await t.waitControl('panel.formatOptions', 6000);
      await page
        .locator('[data-control="panel.formatOptions"] [data-section="textFitting"]')
        .waitFor({ timeout: 6000 })
        .catch(() => undefined);
      const facts = await page.evaluate(() => {
        const section = document.querySelector(
          '[data-control="panel.formatOptions"] [data-section="textFitting"]',
        );
        const sides = ['top', 'bottom', 'left', 'right'];
        const fields = sides.map(
          (s) =>
            document.querySelector(`[data-control="formatOptions.padding.${s}"]`) ??
            document.querySelector(`[data-control="formatOptions.textFitting.padding.${s}"]`),
        );
        const rects = fields.map((f) => (f ? f.getBoundingClientRect() : null));
        const xs = [...new Set(rects.filter(Boolean).map((r) => Math.round(r.x / 8)))];
        const ys = [...new Set(rects.filter(Boolean).map((r) => Math.round(r.y / 8)))];
        const heads = [
          ...(section?.querySelectorAll('.ts-fo-field-label, .ts-panel-head, label') ?? []),
        ].map((el) => el.textContent?.trim() ?? '');
        const paddingHeads = heads.filter((h) => /^Padding$/.test(h)).length;
        const labels = [...(section?.querySelectorAll('.ts-fo-field-label') ?? [])].map((el) => {
          const cs = getComputedStyle(el);
          return { text: el.textContent?.trim(), size: parseFloat(cs.fontSize), color: cs.color };
        });
        const ink2 = (() => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--pt-ink-2)';
          document.body.appendChild(probe);
          const c = getComputedStyle(probe).color;
          probe.remove();
          return c;
        })();
        const unitInside = fields
          .filter(Boolean)
          .some(
            (f) =>
              /px/.test(f.parentElement?.textContent ?? '') || f.getAttribute('data-unit') !== null,
          );
        const newIds = sides.filter((s) =>
          document.querySelector(`[data-control="formatOptions.padding.${s}"]`),
        ).length;
        return {
          present: fields.filter(Boolean).length,
          newIds,
          grid: xs.length === 2 && ys.length === 2,
          paddingHeads,
          labels,
          ink2,
          unitInside,
        };
      });
      await closePanel();
      const labelsOk =
        facts.labels.length > 0 &&
        facts.labels.every((l) => Math.abs(l.size - 12.5) < 0.3 && l.color === facts.ink2);
      return {
        ok:
          facts.present === 4 &&
          facts.newIds === 4 &&
          facts.grid &&
          facts.paddingHeads === 1 &&
          facts.unitInside &&
          labelsOk,
        observed: `fields ${facts.present} (formatOptions.padding.* ${facts.newIds}); two by two ${facts.grid}; Padding heads ${facts.paddingHeads}; unit inside ${facts.unitInside}; labels ${facts.labels
          .map((l) => `"${l.text}" ${l.size}px ${l.color}`)
          .slice(0, 5)
          .join(', ')} (ink-2 ${facts.ink2})`,
      };
    },
  );
  await t.step(
    'text.format-options.remembers-section',
    'collapse Text fitting, close the panel, reopen from the toolbar; then Format > Text fitting',
    'Size & rotation is open and Text fitting stays collapsed; Format > Text fitting opens the panel with Text fitting alone',
    async () => {
      await t.clearAll();
      await t.selectObject(FIT);
      await t.menuPath('format', 'format.textFitting');
      await t.waitControl('panel.formatOptions', 6000);
      const head = page
        .locator(
          '[data-control="panel.formatOptions"] [data-section="textFitting"] .ts-panel-section-head',
        )
        .first();
      await head.waitFor({ timeout: 6000 });
      const open0 = await page.evaluate(
        () =>
          !document
            .querySelector('[data-control="panel.formatOptions"] [data-section="textFitting"]')
            ?.classList.contains('is-closed'),
      );
      if (open0) await head.click();
      await t.sleep(300);
      await closePanel();
      await t.selectObject(FIT);
      await t.tailControl('toolbar.formatOptions');
      await t.waitControl('panel.formatOptions', 6000);
      await t.sleep(400);
      const reopened = await sectionsState();
      await closePanel();
      await t.selectObject(FIT);
      await t.menuPath('format', 'format.textFitting');
      await t.waitControl('panel.formatOptions', 6000);
      await t.sleep(400);
      const fromMenu = await sectionsState();
      /* the section open again for the rows after */
      const closedHead = page
        .locator(
          '[data-control="panel.formatOptions"] [data-section="textFitting"].is-closed .ts-panel-section-head',
        )
        .first();
      if ((await closedHead.count()) > 0) await closedHead.click();
      await closePanel();
      const byId = (list, id) => list.find((s) => s.id === id)?.open ?? null;
      const fromMenuAlone =
        fromMenu.length > 0 && fromMenu.every((s) => (s.id === 'textFitting' ? s.open : !s.open));
      return {
        ok:
          byId(reopened, 'size') === true &&
          byId(reopened, 'textFitting') === false &&
          fromMenuAlone,
        observed: `reopened from the toolbar: ${reopened.map((s) => `${s.id} ${s.open ? 'open' : 'closed'}`).join(', ')}; Format > Text fitting: ${fromMenu.map((s) => `${s.id} ${s.open ? 'open' : 'closed'}`).join(', ')}`,
      };
    },
  );
  await t.step(
    'text.autofit.shrink-on-overflow',
    'set Shrink text on overflow, type 230 characters into the small box',
    'the size steps down the ladder until the text fits inside the box',
    async () => {
      await t.clearAll();
      await t.selectObject(FIT);
      await t.menuPath('format', 'format.textFitting');
      await t.waitControl('panel.formatOptions', 6000);
      const shrink = page
        .locator(
          '[data-control="formatOptions.textFitting.autofit.shrink"], [data-control="formatOptions.textFitting.autofit"] [role="radio"]:has-text("Shrink"), [data-control="formatOptions.textFitting.autofit"] button:has-text("Shrink")',
        )
        .first();
      if ((await shrink.count()) === 0) {
        await closePanel();
        return { ok: false, observed: 'no Shrink option in the Text fitting section' };
      }
      await shrink.click();
      await t.settled();
      /* the radio's write lands through the panel's dispatch after the click: read until it has */
      const modeOf = async () => (await t.blockOf(X, FIT))?.block?.autofit ?? null;
      const mode = await t.pollUntil(modeOf, (m) => m === 'shrink', 6000).catch(modeOf);
      await closePanel();
      const sizeOf = async () => (await t.blockOf(X, FIT))?.block?.typography?.size ?? null;
      const size0 = await sizeOf();
      const run = (await t.runsOfBlock(FIT))[0];
      await t.openRun(run);
      await t.press('Meta+a');
      const long =
        'The renewal covers the three regions, the two new products and the services team for the whole of next year, with a review each quarter and a fixed price for the first two years of the term. ';
      await t.typeHuman(long.slice(0, 230));
      await t.press('Escape');
      await t.settled();
      const live = await t
        .pollUntil(
          () =>
            page.evaluate((id) => {
              const inner = document.querySelector(
                `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`,
              );
              const box = inner?.closest('.free') ?? inner;
              if (!inner || !box) return null;
              const sheet = document.querySelector(
                '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)',
              );
              const k = sheet ? sheet.getBoundingClientRect().width / 1600 : 1;
              return {
                content: inner.scrollHeight,
                box: box.getBoundingClientRect().height / k,
                font: parseFloat(getComputedStyle(inner).fontSize),
              };
            }, FIT),
          (l) => l !== null && l.content <= l.box + 2,
          8000,
        )
        .catch(() =>
          page.evaluate((id) => {
            const inner = document.querySelector(
              `.ts-stagewrap.ts-editor .pt-slide [data-block="${id}"]`,
            );
            const box = inner?.closest('.free') ?? inner;
            if (!inner || !box) return null;
            const sheet = document.querySelector(
              '.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)',
            );
            const k = sheet ? sheet.getBoundingClientRect().width / 1600 : 1;
            return {
              content: inner.scrollHeight,
              box: box.getBoundingClientRect().height / k,
              font: parseFloat(getComputedStyle(inner).fontSize),
            };
          }, FIT),
        );
      const size1 = await sizeOf();
      const stepped =
        size1 !== null && (size0 === null || size1 < size0) && live !== null && live.font < 22;
      return {
        ok: mode === 'shrink' && stepped && live !== null && live.content <= live.box + 2,
        observed: `autofit ${mode}; size ${size0 ?? 'theme'} -> ${size1 ?? 'theme'}; drawn ${live ? `${live.font} px, content ${t.fmt(live.content)} in a ${t.fmt(live.box)} sheet px box` : 'not read'}`,
      };
    },
  );
  await t.step(
    'text.find-replace.count-while-typing',
    'two boxes naming Acme (setup writes); Edit > Find and replace; type Acme; Next',
    'the dialog reads 1 of 2 as the query is typed; Next reads 2 of 2',
    async () => {
      await t.clearAll();
      const a = await t.placeBlock(X, {
        id: 'count-a',
        type: 'text',
        text: 'Acme alpha',
        pos: { x: 160, y: 760, w: 400, h: 60 },
      });
      const b = await t.placeBlock(X, {
        id: 'count-b',
        type: 'text',
        text: 'Acme beta',
        pos: { x: 600, y: 760, w: 400, h: 60 },
      });
      if (!a || !b) return { ok: false, observed: 'the two Acme boxes were not placed' };
      await t.menuPath('edit', 'edit.findReplace');
      await t.waitControl('dialog.findReplace.find', 6000);
      await t.clickControl('dialog.findReplace.find');
      /* the dialog remembers the last query: cleared before this one */
      await t.press('Meta+a');
      await t.typeHuman('Acme');
      /* the count line of the product round is dialog.findReplace.count (build/b2.md 1.7); the older result line stays as the fallback */
      const result = async () =>
        (await t.textOf('dialog.findReplace.count').catch(() => null)) ??
        (await t.textOf('dialog.findReplace.result').catch(() => null));
      /* the deck holds the Acme of every row that ran before this one, so the count is read as
         1 of N while typing and 2 of the same N after Next (the two boxes make N at least 2) */
      const first = await t
        .pollUntil(result, (r) => /^1 of \d+$/.test((r ?? '').trim()), 3000)
        .catch(result);
      const total = Number(/1 of (\d+)/.exec(first ?? '')?.[1] ?? 0);
      await t.clickControl('dialog.findReplace.next');
      const second = await t
        .pollUntil(result, (r) => new RegExp(`^2 of ${total}$`).test((r ?? '').trim()), 3000)
        .catch(result);
      await t.press('Escape');
      await t.waitGone('[data-control="dialog.findReplace.find"]', 4000);
      const s = await t.settled();
      for (const id of ['count-a', 'count-b']) {
        const st = await t.state();
        await t
          .invoke('block.remove', { baseRevision: st.revision, slideId: X, blockId: id })
          .catch(() => undefined);
      }
      void s;
      await t.settled();
      return {
        ok:
          total >= 2 &&
          /^1 of \d+$/.test((first ?? '').trim()) &&
          (second ?? '').trim() === `2 of ${total}`,
        observed: `while typing "${first ?? 'none'}"; after Next "${second ?? 'none'}" (the deck holds ${total} Acme)`,
      };
    },
  );
  await t.clearAll();
}
