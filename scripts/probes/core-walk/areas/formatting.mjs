// Formatting, the text and paragraph rows (docs/RETURN.md 2.11 to 2.13, section 5
// `formatting.*` with the driver `probe --core`): superscript and subscript by chord, by the
// Format menu and by the right click menu, capitalization, Justified by menu, chord and the
// toolbar, the paragraph spacing rows and the Custom spacing dialog, the 1.15 row's value,
// Highlight colour, Paint format by button and by chords, Clear formatting over the inline marks,
// Change theme from the Slide menu and the toolbar, the Import theme stub, and the persistence of
// the marks across the reload, the show and the viewer. Two text boxes are placed through the
// window API as setup (the text area's rows insert boxes through the product).

export const NAME = 'formatting';
export const IDS = [
  'formatting.superscript.chord',
  'formatting.subscript.chord',
  'formatting.superscript.menu-word',
  'formatting.subscript.menu-word',
  'formatting.italic.menu-word',
  'formatting.context.selection-rows',
  'formatting.capitalization.upper',
  'formatting.capitalization.lower',
  'formatting.capitalization.title',
  'formatting.align.justified-menu',
  'formatting.align.justified-chord',
  'formatting.align.toolbar-justify',
  'formatting.spacing.add-before-remove',
  'formatting.spacing.add-after',
  'formatting.spacing.custom-dialog',
  'formatting.spacing.1-15-value',
  'formatting.highlight.word',
  'formatting.paint-format.button',
  'formatting.paint-format.chords',
  'formatting.clear.inline-marks',
  'formatting.theme.panel-appearance',
  'formatting.theme.toolbar-button',
  'formatting.theme.import-hidden',
  'formatting.persistence',
  /* the product round (docs/PRODUCT.md 8.1) */
  'formatting.alt-text.write-undo',
  /* the features round, ship one (docs/FEATURES.md 3.1 item 4): the Tabular figures row */
  'formatting.numerals.tabular-row',
];

const A_TEXT = 'Alpha beta gamma delta';
const B_TEXT = 'Renewal terms for the quarter';
const MARK_SEL = 'sup, sub, em, i, strong, b, u, s, mark, span[style], [data-mark]';

export async function run(t) {
  const { page, BASE } = t;
  const F = await t
    .setup('a slide for the formatting rows', 'slide.new through the window API', async () => {
      const id = await t.setupSlide(t.deck.layoutSlide ?? t.deck.titleSlide, 'blank');
      t.deck.formatSlide = id;
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.formatSlide);
  await t.clickCard(F);
  await t.clearAll();
  await t.setup(
    'two text boxes for the formatting rows',
    'block.insert through the window API',
    async () => {
      const a = await t.placeBlock(F, {
        id: 'fmt-a',
        type: 'text',
        text: A_TEXT,
        pos: { x: 160, y: 160, w: 640, h: 120 },
      });
      const b = await t.placeBlock(F, {
        id: 'fmt-b',
        type: 'text',
        text: B_TEXT,
        pos: { x: 160, y: 420, w: 640, h: 120 },
      });
      return { ok: Boolean(a && b), observed: `placed ${[a, b].filter(Boolean).length}` };
    },
  );
  const runA = (await t.runsOfBlock('fmt-a'))[0];
  const runB = (await t.runsOfBlock('fmt-b'))[0];
  if (!runA || !runB)
    throw new (await import('../toolkit.mjs')).SetupFailed('the runs of the two boxes');

  const block = async (id) => (await t.blockOf(F, id))?.block ?? null;
  const json = async (id) => JSON.stringify(await block(id));
  const text = async (run) => ((await t.runInfo(run))?.text ?? '').replace(/ /g, ' ').trim();
  const marksOf = (run) =>
    page.evaluate(
      ([r, sel]) => {
        const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
        if (!el) return [];
        return [...el.querySelectorAll(sel)].map((m) => ({
          tag: m.tagName.toLowerCase(),
          mark: m.getAttribute('data-mark'),
          text: (m.textContent ?? '').trim(),
          style: m.getAttribute('style') ?? '',
        }));
      },
      [run, MARK_SEL],
    );
  const wordMarked = (marks, word, test) => marks.some((m) => m.text === word && test(m));
  const isSup = (m) =>
    m.tag === 'sup' || m.mark === 'sup' || /vertical-align:\s*super/.test(m.style);
  const isSub = (m) => m.tag === 'sub' || m.mark === 'sub' || /vertical-align:\s*sub/.test(m.style);
  const isItalic = (m) =>
    m.tag === 'em' || m.tag === 'i' || m.mark === 'italic' || /italic/.test(m.style);
  const isBold = (m) =>
    m.tag === 'strong' ||
    m.tag === 'b' ||
    m.mark === 'bold' ||
    /font-weight:\s*(700|bold)/.test(m.style);
  const isHighlight = (m) =>
    m.tag === 'mark' || m.mark === 'highlight' || /background/.test(m.style);
  const undo = async () => {
    await t.press('Meta+z');
    await t.sleep(500);
    await t.settled();
  };
  /** Selects the nth word of a run inside its session (A1 rule 3). */
  const selectWord = async (run, index) => {
    await t.clearAll();
    await t.openRun(run);
    return t.selectWord(run, index);
  };
  /** The typography of a box from its stored block. */
  const typo = async (id) => (await block(id))?.typography ?? {};

  /** A word row: select a word, run the action, read the mark on that word alone, undo. */
  const wordRow = async (id, name, run, index, act, test) => {
    await t.step(id, name, 'the word alone carries the mark; Cmd+Z takes it back', async () => {
      const word = await selectWord(run, index);
      const before = await json('fmt-a');
      const editingBefore = await t.editing();
      await act();
      await t.settled();
      const marks = await t
        .pollUntil(
          () => marksOf(run),
          (m) => wordMarked(m, word, test),
          8000,
        )
        .catch(() => marksOf(run));
      const onWord = wordMarked(marks, word, test);
      const whole = marks.some((m) => test(m) && m.text.split(/\s+/).length > 1);
      const stillEditing = await t.editing();
      await t.press('Escape');
      await t.sleep(200);
      await undo();
      const after = await json('fmt-a');
      return {
        ok: onWord && !whole && after === before,
        observed: `word "${word}"; session before ${editingBefore}; marks ${marks.map((m) => `${m.tag}${m.mark ? `[${m.mark}]` : ''}:"${m.text}"`).join(', ') || 'none'}; on the word alone ${onWord && !whole}; session after ${stillEditing}; restored ${after === before}`,
      };
    });
  };
  await wordRow(
    'formatting.superscript.chord',
    'double click beta, Cmd+.',
    runA,
    1,
    () => t.press('Meta+.'),
    isSup,
  );
  await wordRow(
    'formatting.subscript.chord',
    'double click beta, Cmd+,',
    runA,
    1,
    () => t.press('Meta+,'),
    isSub,
  );
  await wordRow(
    'formatting.superscript.menu-word',
    'double click beta, Format > Text > Superscript',
    runA,
    1,
    () => t.menuPath('format', 'format.text', 'format.text.superscript'),
    isSup,
  );
  await wordRow(
    'formatting.subscript.menu-word',
    'double click beta, Format > Text > Subscript',
    runA,
    1,
    () => t.menuPath('format', 'format.text', 'format.text.subscript'),
    isSub,
  );
  await wordRow(
    'formatting.italic.menu-word',
    'double click beta, Format > Text > Italic',
    runA,
    1,
    () => t.menuPath('format', 'format.text', 'format.text.italic'),
    isItalic,
  );

  await t.step(
    'formatting.context.selection-rows',
    'double click gamma, right click it, read the rows, Superscript from the menu',
    'Superscript, Subscript and Capitalization are listed; Superscript marks the word alone',
    async () => {
      const word = await selectWord(runA, 2);
      const w = await t.wordRect(runA, 2);
      const before = await json('fmt-a');
      const opened = await t.rightClickAt(w.x + w.w / 2, w.y + w.h / 2);
      const rows = (await t.contextRows()).map((r) => r.id);
      const want = [
        'format.text.superscript',
        'format.text.subscript',
        'format.text.capitalization',
      ];
      const missing = want.filter((r) => !rows.includes(r));
      let marks = [];
      if (rows.includes('format.text.superscript')) {
        await t.clickContextRow('format.text.superscript');
        await t.settled();
        marks = await t
          .pollUntil(
            () => marksOf(runA),
            (m) => wordMarked(m, word, isSup),
            8000,
          )
          .catch(() => marksOf(runA));
      } else await t.press('Escape');
      const onWord =
        wordMarked(marks, word, isSup) && !marks.some((m) => isSup(m) && m.text !== word);
      await t.press('Escape');
      await undo();
      return {
        ok: opened && missing.length === 0 && onWord && (await json('fmt-a')) === before,
        observed: `word "${word}"; menu ${opened}; rows ${rows.join(', ')}; missing ${missing.join(', ') || 'none'}; superscript on the word alone ${onWord}`,
      };
    },
  );

  for (const [id, row, want, label] of [
    [
      'formatting.capitalization.upper',
      'format.text.capitalization.upper',
      A_TEXT.toUpperCase(),
      'UPPERCASE',
    ],
    [
      'formatting.capitalization.lower',
      'format.text.capitalization.lower',
      A_TEXT.toLowerCase(),
      'lowercase',
    ],
    [
      'formatting.capitalization.title',
      'format.text.capitalization.title',
      'Alpha Beta Gamma Delta',
      'Title Case',
    ],
  ]) {
    await t.step(
      id,
      `select the box, Format > Text > Capitalization > ${label}; Cmd+Z`,
      'the text is rewritten; Cmd+Z restores it',
      async () => {
        await t.clearAll();
        await t.selectObject('fmt-a');
        await t.menuPath('format', 'format.text', 'format.text.capitalization', row);
        await t.settled();
        const now = await t
          .pollUntil(
            () => text(runA),
            (x) => x === want,
            8000,
          )
          .catch(() => text(runA));
        const stored = (await block('fmt-a'))?.text;
        await undo();
        const back = await t
          .pollUntil(
            () => text(runA),
            (x) => x === A_TEXT,
            8000,
          )
          .catch(() => text(runA));
        return {
          ok: now === want && stored === want && back === A_TEXT,
          observed: `"${now}" (stored "${stored}"); after Cmd+Z "${back}"`,
        };
      },
    );
  }

  const alignRow = async (id, name, act) => {
    await t.step(id, name, 'typography.align is justify; Cmd+Z takes it back', async () => {
      await t.clearAll();
      await t.selectObject('fmt-b');
      const before = (await typo('fmt-b')).align ?? null;
      await act();
      await t.settled();
      const after = await t
        .pollUntil(
          async () => (await typo('fmt-b')).align ?? null,
          (a) => a === 'justify',
          8000,
        )
        .catch(async () => (await typo('fmt-b')).align ?? null);
      const drawn = await page.evaluate((r) => {
        const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
        return el ? getComputedStyle(el).textAlign : null;
      }, runB);
      await t.clearAll();
      await undo();
      const back = (await typo('fmt-b')).align ?? null;
      return {
        ok: after === 'justify' && drawn === 'justify' && back === before,
        observed: `align ${before} -> ${after} (drawn ${drawn}); after Cmd+Z ${back}`,
      };
    });
  };
  await alignRow(
    'formatting.align.justified-menu',
    'select the box, Format > Align & indent > Justified',
    () => t.menuPath('format', 'format.alignIndent', 'format.alignIndent.justified'),
  );
  await alignRow('formatting.align.justified-chord', 'select the box, Cmd+Shift+J', () =>
    t.press('Meta+Shift+j'),
  );
  await alignRow(
    'formatting.align.toolbar-justify',
    'select the box, the toolbar Align list, Justify',
    async () => {
      const before = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control]')].map((e) => e.getAttribute('data-control')),
      );
      await t.tailControl('toolbar.align');
      await t.sleep(400);
      const options = await page.evaluate(
        (prior) =>
          [...document.querySelectorAll('[data-control]')]
            .filter((e) => e.getClientRects().length > 0)
            .map((e) => ({ id: e.getAttribute('data-control'), text: e.textContent?.trim() ?? '' }))
            .filter((o) => !prior.includes(o.id)),
        before,
      );
      const pick = options.find((o) => /justif/i.test(o.id) || /^Justif/i.test(o.text));
      if (pick) await t.clickControl(pick.id);
      else {
        await t.press('Escape');
        throw new Error(
          `no Justify in the Align list (${options.map((o) => o.id).join(', ') || 'no options'})`,
        );
      }
    },
  );

  await t.step(
    'formatting.spacing.add-before-remove',
    'select the box, Format > Line & paragraph spacing > Add space before paragraph, read the row, click it again',
    'spaceBefore 8 is written, the row reads Remove space before paragraph, the second click clears it',
    async () => {
      await t.clearAll();
      await t.selectObject('fmt-b');
      await t.menuPath('format', 'format.spacing', 'format.spacing.addBefore');
      await t.settled();
      const after = await t
        .pollUntil(
          async () => (await typo('fmt-b')).spaceBefore ?? null,
          (x) => x !== null,
          8000,
        )
        .catch(async () => (await typo('fmt-b')).spaceBefore ?? null);
      await t.selectObject('fmt-b');
      await t.openMenu('format');
      await t.hoverRow('format.spacing', '[data-control="menu.format.spacing.addBefore"]');
      const label = await t.textOf('menu.format.spacing.addBefore');
      await t.clickRow('format.spacing.addBefore');
      await t.settled();
      const cleared = await t
        .pollUntil(
          async () => (await typo('fmt-b')).spaceBefore ?? null,
          (x) => x === null || x === 0,
          8000,
        )
        .catch(async () => (await typo('fmt-b')).spaceBefore ?? null);
      return {
        ok:
          after === 8 &&
          /Remove space before/.test(label ?? '') &&
          (cleared === null || cleared === 0),
        observed: `spaceBefore ${after}; the row read "${label}"; after the second click ${cleared}`,
      };
    },
  );

  await t.step(
    'formatting.spacing.add-after',
    'select the box, Format > Line & paragraph spacing > Add space after paragraph; Cmd+Z',
    'spaceAfter 8; Cmd+Z clears it',
    async () => {
      await t.clearAll();
      await t.selectObject('fmt-b');
      await t.menuPath('format', 'format.spacing', 'format.spacing.addAfter');
      await t.settled();
      const after = await t
        .pollUntil(
          async () => (await typo('fmt-b')).spaceAfter ?? null,
          (x) => x !== null,
          8000,
        )
        .catch(async () => (await typo('fmt-b')).spaceAfter ?? null);
      await t.clearAll();
      await undo();
      const back = (await typo('fmt-b')).spaceAfter ?? null;
      return {
        ok: after === 8 && back === null,
        observed: `spaceAfter ${after}; after Cmd+Z ${back}`,
      };
    },
  );

  await t.step(
    'formatting.spacing.custom-dialog',
    'select the box, Format > Line & paragraph spacing > Custom spacing; 1.3, 12, 6; Apply; Cmd+Z',
    'one write of the three fields; Cmd+Z takes it back as one step',
    async () => {
      await t.clearAll();
      await t.selectObject('fmt-b');
      const before = await typo('fmt-b');
      const rev0 = await t.stableRevision();
      await t.menuPath('format', 'format.spacing', 'format.spacing.custom');
      await t.waitControl('dialog.customSpacing', 8000);
      const fill = async (control, value) => {
        await t.clickControl(control);
        await t.press('Meta+a');
        await t.typeHuman(value);
      };
      await fill('dialog.customSpacing.line', '1.3');
      await fill('dialog.customSpacing.before', '12');
      await fill('dialog.customSpacing.after', '6');
      await t.clickControl('dialog.customSpacing.apply');
      await t.waitGone('[data-control="dialog.customSpacing"]', 6000);
      await t.settled();
      const after = await t
        .pollUntil(
          () => typo('fmt-b'),
          (x) => x.spaceBefore === 12,
          8000,
        )
        .catch(() => typo('fmt-b'));
      const rev1 = await t.stableRevision();
      await t.clearAll();
      await undo();
      const back = await typo('fmt-b');
      const restored =
        (back.leading ?? null) === (before.leading ?? null) &&
        (back.spaceBefore ?? null) === (before.spaceBefore ?? null) &&
        (back.spaceAfter ?? null) === (before.spaceAfter ?? null);
      return {
        ok:
          t.near(after.leading ?? 0, 1.3, 0.01) &&
          after.spaceBefore === 12 &&
          after.spaceAfter === 6 &&
          rev1 === rev0 + 1 &&
          restored,
        observed: `leading ${after.leading}, before ${after.spaceBefore}, after ${after.spaceAfter}; revision ${rev0} -> ${rev1}; one Cmd+Z restored ${restored} (${JSON.stringify(back)})`,
      };
    },
  );

  await t.step(
    'formatting.spacing.1-15-value',
    'select the box, Format > Line & paragraph spacing > 1.15',
    'typography.leading reads 1.15',
    async () => {
      await t.clearAll();
      await t.selectObject('fmt-b');
      await t.menuPath('format', 'format.spacing', 'format.spacing.1_15');
      await t.settled();
      const leading = await t
        .pollUntil(
          async () => (await typo('fmt-b')).leading ?? null,
          (x) => x !== null,
          8000,
        )
        .catch(async () => (await typo('fmt-b')).leading ?? null);
      await t.clearAll();
      await undo();
      return { ok: leading === 1.15, observed: `the row labelled 1.15 wrote leading ${leading}` };
    },
  );

  await t.step(
    'formatting.highlight.word',
    'double click delta, Highlight color, Amber; Cmd+Z',
    'the word alone is highlighted; Cmd+Z takes it back',
    async () => {
      const word = await selectWord(runA, 3);
      const before = await json('fmt-a');
      await t.tailControl('toolbar.highlightColor');
      await t.waitControl('toolbar.highlightColor.plate', 5000);
      const pick = (await t.has('[data-control="toolbar.highlightColor.amber"]'))
        ? 'toolbar.highlightColor.amber'
        : await page.evaluate(
            () =>
              [...document.querySelectorAll('[data-control^="toolbar.highlightColor."]')]
                .map((e) => e.getAttribute('data-control'))
                .find((c) => !/plate|none|hex$/.test(c)) ?? null,
          );
      if (pick) await t.clickControl(pick);
      await t.settled();
      const marks = await t
        .pollUntil(
          () => marksOf(runA),
          (m) => wordMarked(m, word, isHighlight),
          8000,
        )
        .catch(() => marksOf(runA));
      const onWord =
        wordMarked(marks, word, isHighlight) &&
        !marks.some((m) => isHighlight(m) && m.text !== word);
      await t.press('Escape');
      await undo();
      return {
        ok: pick !== null && onWord && (await json('fmt-a')) === before,
        observed: `word "${word}"; picked ${pick}; marks ${marks.map((m) => `${m.tag}:"${m.text}"`).join(', ') || 'none'}; on the word alone ${onWord}`,
      };
    },
  );

  /* Paint format: box A formatted by setup writes (weight 700, size 32, colour red), copied to B */
  await t.setup(
    'a formatted box for Paint format',
    'block.set through the window API',
    async () => {
      /* one write of the whole object: a box drawn by the tool carries no typography, so a
         nested pointer has nothing to write into (the first run's RangeError) */
      const t0 = (await block('fmt-a'))?.typography ?? {};
      await t.setBlock(F, 'fmt-a', '/typography', { ...t0, weight: 700, size: 32 });
      await t.setBlock(F, 'fmt-a', '/color', 'red');
      const b = await block('fmt-a');
      return {
        ok: b?.typography?.weight === 700 && b?.typography?.size === 32 && b?.color === 'red',
        observed: JSON.stringify({ typography: b?.typography, color: b?.color }),
      };
    },
  );
  const look = async (id) => {
    const b = await block(id);
    return {
      weight: b?.typography?.weight ?? null,
      size: b?.typography?.size ?? null,
      color: b?.color ?? null,
    };
  };
  await t.step(
    'formatting.paint-format.button',
    'select box A, Paint format, click box B; Cmd+Z',
    'weight, colour and size copy to B; Cmd+Z takes them back',
    async () => {
      await t.clearAll();
      await t.selectObject('fmt-a');
      const a = await look('fmt-a');
      const b0 = await look('fmt-b');
      await t.clickControl('toolbar.paintFormat');
      await t.sleep(300);
      const box = await t.boxOf('fmt-b');
      await t.clickAt(box.free.x + box.free.w / 2, box.free.y + box.free.h / 2);
      const b1 = await t
        .pollUntil(
          () => look('fmt-b'),
          (l) => l.weight === a.weight && l.size === a.size && l.color === a.color,
          8000,
        )
        .catch(() => look('fmt-b'));
      await t.settled();
      await t.clearAll();
      await undo();
      const b2 = await look('fmt-b');
      return {
        ok:
          b1.weight === a.weight &&
          b1.size === a.size &&
          b1.color === a.color &&
          JSON.stringify(b2) === JSON.stringify(b0),
        observed: `A ${JSON.stringify(a)}; B ${JSON.stringify(b0)} -> ${JSON.stringify(b1)} -> after Cmd+Z ${JSON.stringify(b2)}`,
      };
    },
  );
  await t.step(
    'formatting.paint-format.chords',
    'select box A, Cmd+Option+C; select box B, Cmd+Option+V',
    'the look copies to B',
    async () => {
      await t.clearAll();
      await t.selectObject('fmt-a');
      const a = await look('fmt-a');
      const b0 = await look('fmt-b');
      await t.press('Meta+Alt+c');
      await t.sleep(300);
      await t.clearAll();
      await t.selectObject('fmt-b');
      await t.press('Meta+Alt+v');
      const b1 = await t
        .pollUntil(
          () => look('fmt-b'),
          (l) => l.weight === a.weight && l.size === a.size && l.color === a.color,
          8000,
        )
        .catch(() => look('fmt-b'));
      await t.settled();
      await t.clearAll();
      if (JSON.stringify(b1) !== JSON.stringify(b0)) await undo();
      return {
        ok: b1.weight === a.weight && b1.size === a.size && b1.color === a.color,
        observed: `A ${JSON.stringify(a)}; B ${JSON.stringify(b0)} -> ${JSON.stringify(b1)}`,
      };
    },
  );

  await t.step(
    'formatting.clear.inline-marks',
    'an italic word and a bold word in box B; select the box; Clear formatting; Cmd+Z',
    'both marks are gone, no snackbar reads Nothing to clear; Cmd+Z restores them',
    async () => {
      let word1 = await selectWord(runB, 0);
      await t.press('Meta+i');
      await t.sleep(300);
      await t.press('Escape');
      await t.settled();
      let word2 = await selectWord(runB, 1);
      await t.press('Meta+b');
      await t.sleep(300);
      await t.press('Escape');
      await t.settled();
      const marks0 = await marksOf(runB);
      const both = wordMarked(marks0, word1, isItalic) && wordMarked(marks0, word2, isBold);
      const before = await json('fmt-b');
      await t.clearAll();
      await t.selectObject('fmt-b');
      await t.clickControl('toolbar.clearFormatting');
      await t.settled();
      const snack = await t.snackbarWithin(1500).catch(() => null);
      const marks1 = await t
        .pollUntil(
          () => marksOf(runB),
          (m) => !m.some((x) => isItalic(x) || isBold(x)),
          8000,
        )
        .catch(() => marksOf(runB));
      const gone = !marks1.some((m) => isItalic(m) || isBold(m));
      await t.clearAll();
      await undo();
      const marks2 = await marksOf(runB);
      const restored = wordMarked(marks2, word1, isItalic) && wordMarked(marks2, word2, isBold);
      return {
        ok: both && gone && !/Nothing to clear/.test(snack ?? '') && restored,
        observed: `marks before ${marks0.map((m) => `${m.tag}:"${m.text}"`).join(', ')} (both set ${both}); after Clear formatting ${marks1.map((m) => `${m.tag}:"${m.text}"`).join(', ') || 'none'}; snackbar ${snack ?? 'none'}; restored by Cmd+Z ${restored}; block before ${before.length} chars`,
      };
    },
  );

  await t.step(
    'formatting.theme.panel-appearance',
    'Slide > Change theme: the light tile, then the dark tile',
    'the sheet turns light then dark and the state carries the appearance',
    async () => {
      await t.clearAll();
      const light = await t.pickAppearance('light');
      const groundLight = await t.sheetGround();
      const dark = await t.pickAppearance('dark');
      const groundDark = await t.sheetGround();
      await t.closeThemes();
      const lum = (c) => {
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c ?? '');
        return m ? (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3 : null;
      };
      return {
        ok:
          (light.deck === 'light' || light.theme === 'light') &&
          (dark.deck === 'dark' || dark.theme === 'dark') &&
          lum(groundLight) > 180 &&
          lum(groundDark) < 80,
        observed: `light tile: ${JSON.stringify(light)}, ground ${groundLight}; dark tile: ${JSON.stringify(dark)}, ground ${groundDark}`,
      };
    },
  );
  await t.step(
    'formatting.theme.toolbar-button',
    'the toolbar Theme button, twice',
    'the Themes panel opens, then closes',
    async () => {
      await t.clearAll();
      const r = await t.reachRow('slide', 'slide.changeTheme');
      const visible = await t.visible('toolbar.theme');
      if (!visible)
        return {
          ok: false,
          observed: `no Theme button on the toolbar (Change theme reachable ${r.present})`,
        };
      await t.clickControl('toolbar.theme');
      const open = await t
        .pollUntil(
          () => t.visible('panel.themes'),
          (x) => x,
          5000,
        )
        .catch(() => false);
      await t.clickControl('toolbar.theme');
      await t.sleep(400);
      const closed = !(await t.visible('panel.themes'));
      if (!closed) await t.closeThemes();
      return {
        ok: open && closed,
        observed: `opened ${open}; closed on the second click ${closed}`,
      };
    },
  );
  await t.step(
    'formatting.theme.import-hidden',
    'open the Themes panel, look for Import theme',
    'no Import theme control is drawn',
    async () => {
      await t.clearAll();
      await t.menuPath('slide', 'slide.changeTheme');
      await t.waitControl('panel.themes', 8000);
      const count = await t.count('[data-control="themes.import"]');
      const visible = await t.has('[data-control="themes.import"]');
      await t.closeThemes();
      return {
        ok: count === 0 || !visible,
        observed: `themes.import in the DOM ${count}, visible ${visible}`,
      };
    },
  );

  await t.step(
    'formatting.persistence',
    'a superscript word, UPPERCASE, a highlighted word and a grouped pair; reload; the show; the viewer',
    'every one survives the three surfaces',
    async () => {
      /* the marks: superscript on beta, a highlight on delta (box A), UPPERCASE on box B, and two
         boxes grouped as setup (the group rows are the arrange area's) */
      await selectWord(runA, 1);
      await t.press('Meta+.');
      await t.sleep(300);
      await t.press('Escape');
      await t.settled();
      await selectWord(runA, 3);
      await t.tailControl('toolbar.highlightColor');
      await t.waitControl('toolbar.highlightColor.plate', 5000).catch(() => undefined);
      const pick = (await t.has('[data-control="toolbar.highlightColor.amber"]'))
        ? 'toolbar.highlightColor.amber'
        : await page.evaluate(
            () =>
              [...document.querySelectorAll('[data-control^="toolbar.highlightColor."]')]
                .map((e) => e.getAttribute('data-control'))
                .find((c) => !/plate|none|hex$/.test(c)) ?? null,
          );
      if (pick) await t.clickControl(pick);
      await t.settled();
      await t.clearAll();
      await t.selectObject('fmt-b');
      await t.menuPath(
        'format',
        'format.text',
        'format.text.capitalization',
        'format.text.capitalization.upper',
      );
      await t.settled();
      const c = await t.placeBlock(F, {
        id: 'fmt-c',
        type: 'text',
        text: 'Pair one',
        pos: { x: 900, y: 160, w: 300, h: 100 },
      });
      const d = await t.placeBlock(F, {
        id: 'fmt-d',
        type: 'text',
        text: 'Pair two',
        pos: { x: 900, y: 320, w: 300, h: 100 },
      });
      await t.clearAll();
      await t.selectObject('fmt-c');
      const boxD = await t.boxOf('fmt-d');
      await t.shiftClickAt(boxD.free.x + boxD.free.w / 2, boxD.free.y + boxD.free.h / 2);
      await t.press('Meta+Alt+g');
      await t.settled();
      const grouped = async () => {
        const objs = await t.objectsOf(F);
        const g = objs.find((o) => o.id === 'fmt-c')?.pos?.group;
        return g !== undefined && objs.find((o) => o.id === 'fmt-d')?.pos?.group === g;
      };
      const facts = async () => {
        const marks = await marksOf(runA);
        return {
          sup: marks.some((m) => isSup(m) && m.text === 'beta'),
          highlight: marks.some((m) => isHighlight(m) && m.text === 'delta'),
          upper: (await text(runB)) === B_TEXT.toUpperCase(),
          group: await grouped(),
        };
      };
      const before = await facts();
      await t.reloadTo(`${BASE}/edit/${t.deck.id}#s/${F}`);
      await t.settled();
      const afterReload = await facts();
      await t.clearAll();
      await t.clickControl('present.open');
      await page.locator('[data-control="present.show"]').waitFor({ timeout: 8000 });
      await t.sleep(800);
      const show = await page.evaluate(
        ([ra, rb, upper]) => {
          const sheet =
            document.querySelector('.ts-stagewrap.is-present .pt-slide:not(.is-leaving)') ??
            document.querySelector('.pt-viewer.is-present .pt-slide:not(.is-leaving)');
          const a = sheet?.querySelector(`[data-run="${ra}"]`);
          const b = sheet?.querySelector(`[data-run="${rb}"]`);
          return {
            sup: Boolean(a?.querySelector('sup, [data-mark="sup"]')),
            highlight: Boolean(
              a?.querySelector('mark, [data-mark="highlight"], span[style*="background"]'),
            ),
            upper: (b?.textContent ?? '').replace(/ /g, ' ').trim() === upper,
          };
        },
        [runA, runB, B_TEXT.toUpperCase()],
      );
      await t.press('Escape');
      await page
        .locator('[data-control="present.show"]')
        .waitFor({ state: 'detached', timeout: 8000 })
        .catch(() => undefined);
      await page.goto(`${BASE}/deck/${t.deck.id}#s/${F}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
      const viewer = await t
        .pollUntil(
          () =>
            page.evaluate(
              ([ra, rb, upper]) => {
                const a = document.querySelector(`.pt-viewer [data-run="${ra}"]`);
                const b = document.querySelector(`.pt-viewer [data-run="${rb}"]`);
                return {
                  found: a !== null,
                  sup: Boolean(a?.querySelector('sup, [data-mark="sup"]')),
                  highlight: Boolean(
                    a?.querySelector('mark, [data-mark="highlight"], span[style*="background"]'),
                  ),
                  upper: (b?.textContent ?? '').replace(/ /g, ' ').trim() === upper,
                };
              },
              [runA, runB, B_TEXT.toUpperCase()],
            ),
          (v) => v.found,
          8000,
        )
        .catch(() => ({ found: false }));
      await page.goto(`${BASE}/edit/${t.deck.id}#s/${F}`, { waitUntil: 'domcontentloaded' });
      await t.editorReady();
      await t.settled();
      const all = (f) => f.sup && f.highlight && f.upper;
      return {
        ok:
          Boolean(c && d) &&
          all(before) &&
          before.group &&
          all(afterReload) &&
          afterReload.group &&
          all(show) &&
          all(viewer),
        observed: `set ${JSON.stringify(before)}; after the reload ${JSON.stringify(afterReload)}; the show ${JSON.stringify(show)}; the viewer ${JSON.stringify(viewer)}`,
      };
    },
  );
  t.deck.formatBoxes = ['fmt-a', 'fmt-b'];
  await t.advancedBack('the formatting rows');
  await productRound(t);
  await featuresRound(t);
}

/**
 * The product round's row (docs/PRODUCT.md section 5, RETURN.md question 6, 8.1): Alt text in
 * Format options returns to the default view; the description is written, undone and carried into
 * the Editable text PowerPoint's `descr`. The row carries `parks: ['format.altText']`, so a red
 * reading parks the section alone.
 */
async function productRound(t) {
  const { page } = t;
  const F = t.deck.formatSlide ?? t.deck.titleSlide;
  const A = (t.deck.formatBoxes ?? ['fmt-a'])[0];
  await t.clickCard(F);
  await t.clearAll();
  await t.step(
    'formatting.alt-text.write-undo',
    'Format options > Alt text: type a description, Tab; Cmd+Z; then the Editable text PowerPoint',
    "the block carries the description, Cmd+Z removes it, and the PowerPoint's descr carries it",
    async () => {
      await t.selectObject(A);
      await t.tailControl('toolbar.formatOptions');
      await t.waitControl('panel.formatOptions', 6000);
      let section = await t.has('[data-control="panel.formatOptions"] [data-section="altText"]');
      let switched = false;
      if (!section) {
        /* the section is behind the switch on this build (RETURN.md question 6) */
        if (await t.visible('panel.formatOptions.close'))
          await t.clickControl('panel.formatOptions.close');
        switched = await t.setAdvanced(true);
        if (switched) t.deck.advanced = true;
        await t.selectObject(A);
        await t.tailControl('toolbar.formatOptions');
        await t.waitControl('panel.formatOptions', 6000);
        section = await t.has('[data-control="panel.formatOptions"] [data-section="altText"]');
      }
      if (!section) {
        await t.advancedBack('Alt text');
        return {
          ok: false,
          observed: `no Alt text section in Format options (switch on ${switched})`,
        };
      }
      const sec = page.locator('[data-control="panel.formatOptions"] [data-section="altText"]');
      if (await sec.evaluate((el) => el.classList.contains('is-closed')).catch(() => false))
        await sec.locator('.ts-panel-section-head').click();
      const field = page.locator('[data-control="formatOptions.altText.description"]').first();
      await field.scrollIntoViewIfNeeded().catch(() => undefined);
      await field.click();
      await t.press('Meta+a');
      await t.typeHuman('A renewal chart');
      await t.press('Tab');
      const altOf = async () => (await t.blockOf(F, A))?.block?.alt ?? null;
      const written = await t.pollUntil(altOf, (v) => v === 'A renewal chart', 8000).catch(altOf);
      await t.settled();
      /* the PowerPoint's descr, from the export route in one request */
      const pptx = await t.exportPptx();
      let descr = null;
      if (pptx.bytes) {
        let entries = t.zipEntries(pptx.bytes);
        /* the export answers a bundle since the product round (docs/PRODUCT.md section 2 rank 7:
           the light and the dark Editable text files and the report zip); the light file is read */
        const inner =
          [...entries.keys()].find((n) => /\(light, editable\)\.pptx$/.test(n)) ??
          [...entries.keys()].find((n) => /\.pptx$/.test(n));
        if (inner !== undefined) entries = t.zipEntries(entries.get(inner)(true));
        descr = [...entries.keys()]
          .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
          .some((n) => /descr="A renewal chart"/.test(entries.get(n)()));
      }
      if (await t.visible('panel.formatOptions.close'))
        await t.clickControl('panel.formatOptions.close');
      await t.clearAll();
      await t.selectObject(A);
      await t.press('Meta+z');
      const undone = await t.pollUntil(altOf, (v) => v !== 'A renewal chart', 8000).catch(altOf);
      await t.settled();
      await t.advancedBack('Alt text');
      if (pptx.noBearer)
        return {
          ok: null,
          observed: `written ${written === 'A renewal chart'}, undone ${undone !== 'A renewal chart'}; the PowerPoint's descr was not read: no bearer for this origin (TURBOSLIDE_TOKEN or ~/.config/turboslide/hosts.json)`,
        };
      return {
        ok: written === 'A renewal chart' && undone !== 'A renewal chart' && descr === true,
        observed: `${switched ? 'with the switch on; ' : ''}alt after Tab ${JSON.stringify(written)}; after Cmd+Z ${JSON.stringify(undone)}; the Editable text export answered ${pptx.status}${pptx.bytes ? `, descr carried ${descr} in the light file of the bundle` : ''}`,
      };
    },
  );
}

/**
 * The features round, ship one (docs/FEATURES.md 3.1 item 4; the row
 * `formatting.numerals.tabular-row`): the Tabular figures row of Format options > Text with its
 * sentence, writing `typography.numerals: 'tabular'`, enabled on a face with `tnum` and disabled
 * with its sentence on one without, and found by Search the menus under a seller's words. Three
 * text boxes are placed through the window API as setup (Inter, Bebas Neue, Playfair Display). The
 * row is B2's (inspector/typography.tsx); a build without the control reads not built with its id.
 */
async function featuresRound(t) {
  const { page } = t;
  const F = t.deck.formatSlide ?? t.deck.titleSlide;
  await t.clickCard(F);
  await t.clearAll();
  const boxes = { inter: 'num-inter', bebas: 'num-bebas', playfair: 'num-playfair' };
  await t.setup(
    'three text boxes for the Tabular figures row',
    'block.insert through the window API',
    async () => {
      const made = [];
      for (const [key, family] of [
        ['inter', undefined],
        ['bebas', 'bebas-neue'],
        ['playfair', 'playfair-display'],
      ]) {
        const obj = await t.placeBlock(F, {
          id: boxes[key],
          type: 'text',
          text: '1111 against 0000',
          ...(family ? { typography: { family } } : {}),
          pos: { x: 80, y: 640 + made.length * 80, w: 700, h: 64 },
        });
        made.push(obj?.id ?? 'none');
      }
      return { ok: made.every((m) => m !== 'none'), observed: made.join(', ') };
    },
  );
  const blockOf = async (id) => (await t.blockOf(F, id))?.block ?? null;
  const numericOf = (id) =>
    page.evaluate((blockId) => {
      const el = document.querySelector(
        `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`,
      );
      const run = el?.querySelector('[data-run]') ?? el;
      return run ? getComputedStyle(run).fontVariantNumeric : null;
    }, id);
  /** The Tabular figures row of the open panel: its control, its state and the words around it. */
  const rowFacts = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-control="formatOptions.typography.numerals"]');
      if (!el) return null;
      /* the row (inspector/typography.tsx): the label with its sentence under it
         (`formatOptions.typography.numerals.sentence`), the check with the tooltip's name and doc */
      const row =
        el.closest('.ts-ctl-typo-row, label, .ts-field, .ts-inspector-row, li, div') ?? el;
      const input = el.matches('input') ? el : (el.querySelector('input') ?? el);
      const sentence = document.querySelector(
        '[data-control="formatOptions.typography.numerals.sentence"]',
      );
      const tipHolder = el.closest('[data-tip]') ?? row.querySelector('[data-tip]') ?? el;
      return {
        disabled:
          input.hasAttribute('disabled') ||
          el.getAttribute('aria-disabled') === 'true' ||
          row.getAttribute('aria-disabled') === 'true',
        checked:
          input instanceof HTMLInputElement
            ? input.checked
            : el.getAttribute('aria-checked') === 'true' ||
              el.getAttribute('aria-pressed') === 'true',
        words: `${(sentence?.textContent ?? '').trim()} | ${(row.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)}`,
        tip: [...tipHolder.attributes]
          .filter((a) => a.name.startsWith('data-tip'))
          .map((a) => a.value)
          .join(' '),
      };
    });
  const openPanelOn = async (id) => {
    await t.clearAll();
    await t.selectObject(id);
    if (!(await t.visible('panel.formatOptions'))) {
      await t.tailControl('toolbar.formatOptions');
      await t.waitControl('panel.formatOptions', 8000);
    }
    await t.sleep(400);
    return rowFacts();
  };
  await t.step(
    'formatting.numerals.tabular-row',
    'Format options > Text on the Inter box; toggle Tabular figures; the Bebas Neue box; the Playfair Display box; Search the menus "line up numbers"',
    "the row carries its sentence and writes typography.numerals: 'tabular'; enabled on Bebas Neue, disabled with its sentence on Playfair Display; the finder lists it",
    async () => {
      const inter = await openPanelOn(boxes.inter);
      if (inter === null) {
        if (await t.visible('panel.formatOptions.close'))
          await t.clickControl('panel.formatOptions.close');
        return t.notBuilt(
          'formatOptions.typography.numerals',
          'B2',
          'no Tabular figures row under Format options > Text (FEATURES.md 3.1 item 4)',
        );
      }
      const sentence = /Every digit takes the same width, so numbers line up in a column/;
      const before = await blockOf(boxes.inter);
      const rev0 = (await t.state()).revision;
      await t.clickControl('formatOptions.typography.numerals');
      await t.settled();
      const written = await t
        .pollUntil(
          () => blockOf(boxes.inter),
          (b) => b?.typography?.numerals === 'tabular',
          6000,
        )
        .catch(() => blockOf(boxes.inter));
      const rev1 = (await t.state()).revision;
      const numeric = await numericOf(boxes.inter);
      const bebas = await openPanelOn(boxes.bebas);
      const playfair = await openPanelOn(boxes.playfair);
      if (await t.visible('panel.formatOptions.close'))
        await t.clickControl('panel.formatOptions.close');
      await t.clearAll();
      /* Search the menus under the seller's words */
      await t.menuPath('help', 'help.searchMenus');
      await t.waitControl('palette.query', 8000);
      await t.typeHuman('line up numbers');
      await t.sleep(600);
      const found = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="palette."]')]
          .filter(
            (e) => e.getClientRects().length > 0 && /Tabular figures/i.test(e.textContent ?? ''),
          )
          .map((e) => e.getAttribute('data-control')),
      );
      await t.press('Escape');
      await t.waitGone('[data-control="palette.query"]', 4000);
      if (written?.typography?.numerals === 'tabular') {
        await t.press('Meta+z');
        await t.sleep(400);
        await t.settled();
      }
      const ok =
        sentence.test(`${inter.words} ${inter.tip}`) &&
        !inter.disabled &&
        written?.typography?.numerals === 'tabular' &&
        /tabular-nums/.test(numeric ?? '') &&
        bebas !== null &&
        !bebas.disabled &&
        playfair !== null &&
        playfair.disabled &&
        /This face has no tabular figures/.test(`${playfair.words} ${playfair.tip}`) &&
        found.length > 0;
      return {
        ok,
        observed: `Inter row: "${inter.words}" (tip "${inter.tip}"), disabled ${inter.disabled}; numerals ${before?.typography?.numerals ?? 'absent'} -> ${written?.typography?.numerals ?? 'absent'} (revision ${rev0} -> ${rev1}), computed "${numeric}"; Bebas Neue row disabled ${bebas?.disabled ?? 'absent'}; Playfair Display row disabled ${playfair?.disabled ?? 'absent'} with "${playfair?.words ?? ''}"; the finder lists ${found.join(', ') || 'nothing'} for "line up numbers"`,
      };
    },
  );
}
