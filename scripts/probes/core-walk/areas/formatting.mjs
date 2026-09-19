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
}
