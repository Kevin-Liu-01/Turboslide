// The polish round's text rows (docs/archive/rounds/POLISH.md 2.3, 2.6 item 70, 2.9 item 114, 5.1 `text.*` with
// the driver `probe --core`; B6 the drivers, B1 the fixes): Bold on a run from the tail and the
// menu, the tail's paragraph controls live in a session, Enter and Tab in a list, a size on a run
// and a typed value, the five mark rows on a selected box, a heading's list and indent, Enter in a
// heading session, the link chip on one click, the title that shrinks on overflow, the link
// popover anchored under the selection, the link detection setting, the tail's size field on a
// heading and the highlight's colour with the console. The text boxes are placed through the
// window API (the rows' `setup`); a title slide of the deck's own carries the heading rows. Every
// read is the DOM's marks, boxes and computed styles, the frame's ring or a pixel sample of the
// band, so the row reads what a screenshot shows.

export const NAME = 'polish-text';
export const IDS = [
  'text.bold.toolbar-marks-run',
  'text.paragraph.toolbar-live',
  'text.list.enter-tab-no-error',
  'text.size.run-and-typed-value',
  'text.marks.whole-block-from-menu',
  'text.tail.heading-takes-list-indent',
  'text.heading.enter-keeps-session',
  'text.link.chip-on-click',
  'text.title.shrink-on-overflow',
  'text.title.second-session-survives-reload',
  'text.link.popover-anchored',
  'text.link.detection-setting',
  'text.tail.size-reads-heading',
  'text.polish.highlight-console',
];

const LANE = 'B1';
const r1 = (n) => (typeof n === 'number' ? Math.round(n * 10) / 10 : n);
const MARK_SEL = 'b, strong, i, em, u, s, sup, sub, mark, a, span[style], [data-mark]';

export async function run(t) {
  const { page, BASE } = t;
  const X = await t
    .setup(
      'a blank slide for the polish round text rows',
      'slide.new through the window API',
      async () => {
        const id = await t.setupSlide(null, 'blank');
        t.deck.polishTextSlide = id;
        return { ok: Boolean(id), observed: `slide ${id}` };
      },
    )
    .then(() => t.deck.polishTextSlide);
  await t.clickCard(X);
  await t.clearAll();

  const block = async (id, slide = X) => (await t.blockOf(slide, id))?.block ?? null;
  /** The marks inside a run's HTML: tag, mark name, text, href and the computed weight, size and background. */
  const marksOf = (run) =>
    page.evaluate(
      ([r, sel]) => {
        const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
        if (!el) return [];
        return [...el.querySelectorAll(sel)].map((m) => {
          const cs = getComputedStyle(m);
          return {
            tag: m.tagName.toLowerCase(),
            mark: m.getAttribute('data-mark'),
            text: (m.textContent ?? '').replace(/ /g, ' '),
            href: m.getAttribute('href') ?? m.getAttribute('data-href') ?? null,
            weight: cs.fontWeight,
            size: parseFloat(cs.fontSize),
            background: cs.backgroundColor,
          };
        });
      },
      [run, MARK_SEL],
    );
  /** The computed weight and size of a run's own text (outside any mark). */
  const runStyle = (run) =>
    page.evaluate((r) => {
      const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        weight: cs.fontWeight,
        size: parseFloat(cs.fontSize),
        text: (el.textContent ?? '').replace(/ /g, ' '),
      };
    }, run);
  /** A text box placed through the window API; its id and first run. */
  const placeText = async (id, text, pos, extra = {}) => {
    const obj = await t.placeBlock(X, { id, type: 'text', text, pos, ...extra });
    if (!obj) return null;
    const run = (await t.runsOfBlock(id))[0] ?? null;
    return { id, run };
  };
  const escapeOut = async () => {
    if (await t.editing()) {
      await t.press('Escape');
      await t.sleep(200);
    }
    await t.settled();
  };
  const menuRowsOf = async (menuId, parentRow, childSelector) => {
    await t.surfaceClear();
    await t.openMenu(menuId);
    await t.hoverRow(parentRow, childSelector);
    const rows = await t.menuRows(menuId);
    await t.press('Escape', 2);
    await t.sleep(150);
    return rows;
  };

  // ---- 2.3 item 12: toolbar and menu Bold mark the selected run
  const BOLD = 'pt-bold';
  await t.step(
    'text.bold.toolbar-marks-run',
    '"Acme" selected in a text box; the tail\'s Bold; Cmd+Z; Format > Text > Bold; then the box selected by one click and Bold',
    'the run carries the b mark at weight 700 and the rest of the box keeps 400; the menu the same; the box selected, Bold marks every run',
    async () => {
      const made = await placeText(BOLD, 'Acme renews in Q3', { x: 200, y: 160, w: 700, h: 80 });
      if (!made?.run) return { ok: false, observed: 'no text box' };
      const { run } = made;
      const boldOn = async (how) => {
        await t.clearAll();
        await t.openRun(run);
        const sel = await t.selectWord(run, 0);
        if (how === 'tail') await t.tailControl('toolbar.bold');
        else await t.menuPath('format', 'format.text', 'format.text.bold');
        await t.sleep(500);
        await t.settled();
        const marks = await marksOf(run);
        const mark = marks.find(
          (m) =>
            (m.tag === 'b' || m.tag === 'strong' || m.mark === 'b') && m.text.trim() === 'Acme',
        );
        const rest = await runStyle(run);
        const stored = (await block(BOLD))?.text ?? '';
        const wholeWeight = (await block(BOLD))?.typography?.weight ?? null;
        await escapeOut();
        await t.press('Meta+z');
        await t.settled();
        return {
          sel,
          marked: Boolean(mark),
          markWeight: mark?.weight ?? null,
          restWeight: rest?.weight ?? null,
          stored,
          wholeWeight,
          ok:
            Boolean(mark) &&
            Number(mark.weight) >= 700 &&
            Number(rest?.weight) < 700 &&
            /* the markup's bold is the `*` pair (schema text.ts), so the run reads `*Acme*`;
               the brace form stays for a mark written as an attribute (B1's R22a) */
            /\[Acme\]\{[^}]*b[^}]*\}|\*Acme\*/.test(stored) &&
            wholeWeight === null,
        };
      };
      const tail = await boldOn('tail');
      const menu = await boldOn('menu');
      /* the box selected by one click: Bold marks every run */
      await t.clearAll();
      await t.selectObject(BOLD);
      await t.tailControl('toolbar.bold');
      await t.settled();
      await t.sleep(400);
      const whole = await runStyle(run);
      const wholeMarks = await marksOf(run);
      const storedWhole = (await block(BOLD))?.text ?? '';
      const wholeBold =
        Number(whole?.weight) >= 700 ||
        (wholeMarks.length > 0 &&
          wholeMarks.every((m) => Number(m.weight) >= 700) &&
          wholeMarks
            .map((m) => m.text)
            .join('')
            .trim() === 'Acme renews in Q3') ||
        /^\[Acme renews in Q3\]\{[^}]*b[^}]*\}$|^\*Acme renews in Q3\*$/.test(storedWhole.trim());
      await t.press('Meta+z');
      await t.settled();
      const ok = tail.ok && menu.ok && wholeBold;
      return {
        ok,
        observed: `tail: selected "${tail.sel}", mark ${tail.marked} at ${tail.markWeight}, rest ${tail.restWeight}, stored "${tail.stored}"${tail.wholeWeight !== null ? ` (block weight ${tail.wholeWeight})` : ''}; menu: mark ${menu.marked} at ${menu.markWeight}, rest ${menu.restWeight}, stored "${menu.stored}"; whole box: weight ${whole?.weight}, stored "${storedWhole}" (bold ${wholeBold})${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.3 item 12, ${LANE})`}`,
      };
    },
  );

  // ---- 2.3 item 14: the toolbar's paragraph controls update the open session
  const PARA = 'pt-para';
  await t.step(
    'text.paragraph.toolbar-live',
    'a two line text box; a session open with the caret in line 1; Center from the tail, then Double, then Increase indent',
    "the paragraph's box moves within one frame while the caret stays; Double and Increase indent the same",
    async () => {
      const made = await placeText(PARA, 'First line here\nSecond line here', {
        x: 200,
        y: 280,
        w: 900,
        h: 120,
      });
      if (!made?.run) return { ok: false, observed: 'no text box' };
      const { run } = made;
      await t.clearAll();
      const on = await t.openRun(run);
      if (!on) return { ok: false, observed: 'no session opened' };
      await t.press('Home');
      /* the text nodes' own rects (B1's R22a): the run's contents range begins with the first
         `.para` block box, whose x is the box's left edge whatever the alignment, so Center could
         never move it; a text node's rect moves with the text */
      const paraBox = () =>
        page.evaluate((r) => {
          const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
          if (!el) return null;
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          const rects = [];
          let node;
          while ((node = walker.nextNode())) {
            if (!(node.textContent ?? '').trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const c of range.getClientRects()) if (c.width > 0) rects.push(c);
          }
          const first = rects[0] ?? el.getBoundingClientRect();
          const last = rects[rects.length - 1] ?? first;
          return {
            x: first.x,
            w: first.width,
            firstY: first.y,
            lastY: last.y,
            lines: new Set(rects.map((c) => Math.round(c.top))).size,
          };
        }, run);
      const caretIn = async () => (await t.editing()) && /\[run /.test(await t.activeDesc());
      const reads = [];
      let ok = true;
      const readAfter = async (label, fn, judge) => {
        const before = await paraBox();
        await fn();
        /* one frame of the browser (16 ms) and one more so the read is not the click's own frame */
        await page.evaluate(
          () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
        );
        const atFrame = await paraBox();
        const caret = await caretIn();
        await t.sleep(400);
        const later = await paraBox();
        const moved = before && atFrame ? judge(before, atFrame) : false;
        const movedLater = before && later ? judge(before, later) : false;
        ok = ok && moved && caret;
        reads.push(
          `${label}: moved within a frame ${moved} (after 400 ms ${movedLater}), caret kept ${caret}`,
        );
      };
      await readAfter(
        'Center',
        async () => {
          await t.clickControl('toolbar.align');
          await page
            .locator('#ts-menu-toolbar\\.align, [data-control="toolbar.align.plate"]')
            .first()
            .waitFor({ timeout: 6000 });
          await t.clickControl('menu.toolbar.align.format.alignIndent.center');
        },
        (a, b) => Math.abs(b.x - a.x) > 4,
      );
      /* Double, not 1.5: 1.5 is the sheet's own paragraph leading (`sheet.css` `.ts-sheet p {
         line-height: 1.5 }`), so its write lands and draws the same lines; Double moves the
         second line (B1's R22a) */
      await readAfter(
        'Double',
        async () => {
          await t.clickControl('toolbar.spacing');
          await page
            .locator('#ts-menu-toolbar\\.spacing, [data-control="toolbar.spacing.plate"]')
            .first()
            .waitFor({ timeout: 6000 });
          await t.clickControl('menu.toolbar.spacing.format.spacing.double');
        },
        (a, b) => Math.abs(b.lastY - b.firstY - (a.lastY - a.firstY)) > 2,
      );
      await readAfter(
        'Increase indent',
        () => t.tailControl('toolbar.increaseIndent'),
        (a, b) => Math.abs(b.x - a.x) > 4,
      );
      await escapeOut();
      return {
        ok,
        observed: `${reads.join('; ')}${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.3 item 14, ${LANE})`}`,
      };
    },
  );

  // ---- 2.3 item 15: Enter and Tab in a list add and nest an item
  const LIST = 'pt-list';
  await t.step(
    'text.list.enter-tab-no-error',
    'a text box reading One; Bulleted list from the tail; the session opened at the end; Enter, "Two", Tab, Enter, "Three"; Escape; Cmd+Z until the box is back',
    'three items with the second nested and no error element over the stage; Cmd+Z restores the box',
    async () => {
      const made = await placeText(LIST, 'One', { x: 200, y: 440, w: 700, h: 80 });
      if (!made?.run) return { ok: false, observed: 'no text box' };
      const startJson = JSON.stringify(await block(LIST));
      await t.clearAll();
      await t.selectObject(LIST);
      await t.tailControl('toolbar.bulletedList');
      await t.settled();
      const listed = await t
        .pollUntil(
          () => block(LIST),
          (b) =>
            b !== null && (b.type === 'list' || b.marker !== undefined || Array.isArray(b.items)),
          6000,
        )
        .then(() => true)
        .catch(() => false);
      const errorsBefore = t.consoleErrors.length;
      const runs = await t.runsOfBlock(LIST);
      const last = runs[runs.length - 1];
      if (!last) return { ok: false, observed: `listed ${listed}; no run on the list` };
      await t.openRun(last);
      await t.press('End');
      await t.press('Enter');
      await t.typeHuman('Two');
      await t.press('Tab');
      await t.press('Enter');
      await t.typeHuman('Three');
      await t.sleep(300);
      const errorEl = await page.evaluate(() => {
        const els = [
          ...document.querySelectorAll(
            '[role="alert"], .ts-error, .ts-stage-error, .ts-snackbar, .pt-toast',
          ),
        ];
        return (
          els
            .map((el) => (el.textContent ?? '').trim())
            .filter((s) => /splice|not a string|error/i.test(s))
            .join(' | ') || null
        );
      });
      await escapeOut();
      const b = await block(LIST);
      const items = Array.isArray(b?.items) ? b.items : [];
      const texts = items.map((it) =>
        typeof it === 'string' ? it : (it?.text ?? JSON.stringify(it)),
      );
      /* a list level is 1 to 9 with 1 the top (SPEC-2 0.58; `render/blocks/lists.ts` `levelOf`):
         one Tab writes level 2 and the top item carries no level (B1's R22a) */
      const nested =
        items[1] &&
        typeof items[1] === 'object' &&
        ((typeof items[1].level === 'number' && items[1].level >= 2) ||
          items[1].depth === 1 ||
          items[1].indent === 1 ||
          Array.isArray(items[1].items));
      const consoleErrors = t.consoleErrors
        .slice(errorsBefore)
        .filter((e) => /splice|not a string/i.test(e));
      let restored = false;
      for (let i = 0; i < 6 && !restored; i += 1) {
        await t.press('Meta+z');
        await t.sleep(500);
        await t.settled();
        const now = await block(LIST);
        restored =
          now !== null &&
          (JSON.stringify(now) === startJson ||
            (typeof now.text === 'string' && now.text.trim() === 'One'));
      }
      const ok =
        listed &&
        errorEl === null &&
        consoleErrors.length === 0 &&
        items.length >= 3 &&
        Boolean(nested) &&
        restored;
      return {
        ok,
        observed: `listed ${listed}; items ${JSON.stringify(texts)} (second nested ${Boolean(nested)}); error over the stage ${errorEl ? `"${errorEl}"` : 'none'}; console ${consoleErrors.length}; restored by Cmd+Z ${restored}${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.3 item 15, ${LANE})`}`,
      };
    },
  );

  // ---- 2.3 item 16: font size on a run, and a typed value honoured
  const SIZE = 'pt-size';
  await t.step(
    'text.size.run-and-typed-value',
    '"Acme" selected in a 20 px text box; 36 typed into the size field, Enter',
    "the run draws at 36 px and the box's other runs keep 20",
    async () => {
      const made = await placeText(
        SIZE,
        'Acme renews in Q3',
        { x: 200, y: 600, w: 900, h: 80 },
        { typography: { size: 20 } },
      );
      if (!made?.run) return { ok: false, observed: 'no text box' };
      const { run } = made;
      await t.clearAll();
      await t.openRun(run);
      const sel = await t.selectWord(run, 0);
      if (!(await t.visible('toolbar.fontSize.value')))
        return { ok: false, observed: 'no size field on the tail' };
      await t.clickControl('toolbar.fontSize.value');
      await t.press('Meta+a');
      await t.typeHuman('36');
      await t.press('Enter');
      await t.sleep(600);
      await t.settled();
      const marks = await marksOf(run);
      const acme = marks.find((m) => m.text.trim() === 'Acme');
      const rest = await runStyle(run);
      const stored = await block(SIZE);
      const snackbar = await t.snackbar();
      await escapeOut();
      const ok =
        Boolean(acme) &&
        t.near(acme.size, 36, 0.5) &&
        t.near(rest?.size ?? 0, 20, 0.5) &&
        (stored?.typography?.size ?? 20) === 20;
      await t.press('Meta+z');
      await t.settled();
      return {
        ok,
        observed: `selected "${sel}"; Acme drawn at ${acme?.size ?? 'no mark'} px, the run at ${rest?.size} px; block typography ${JSON.stringify(stored?.typography ?? null)}, text "${stored?.text}"; snackbar ${snackbar ? `"${snackbar}"` : 'none'}${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.3 item 16, ${LANE})`}`,
      };
    },
  );

  // ---- 2.3 item 17: the five text mark rows act on a selected box
  const MARKS = 'pt-marks';
  const SHAPE = 'pt-marks-shape';
  await t.step(
    'text.marks.whole-block-from-menu',
    'a text box selected by one click: Format > Text > Italic, Underline, Strikethrough, Superscript and Subscript; Cmd+I; a labelled rectangle the same; nothing selected, the rows read',
    'each row marks every run; Cmd+I presses Italic; the shape the same; with nothing selected the rows are disabled',
    async () => {
      const made = await placeText(MARKS, 'Every run of this box', {
        x: 200,
        y: 720,
        w: 900,
        h: 80,
      });
      if (!made?.run) return { ok: false, observed: 'no text box' };
      const shape = await t.placeBlock(X, {
        id: SHAPE,
        type: 'shape',
        shape: 'rectangle',
        fill: 'plate',
        stroke: 'ink',
        text: 'Label',
        pos: { x: 1150, y: 160, w: 300, h: 160 },
      });
      const facts = [];
      let ok = true;
      const wholeMarked = async (id, tag, mark) => {
        const run = (await t.runsOfBlock(id))[0];
        const marks = run ? await marksOf(run) : [];
        const style = run ? await runStyle(run) : null;
        const text = (style?.text ?? '').trim();
        const covered = marks
          .filter((m) => m.tag === tag || m.mark === mark)
          .map((m) => m.text.trim())
          .join(' ')
          .replace(/\s+/g, ' ');
        const stored = JSON.stringify((await block(id)) ?? {});
        return {
          whole: text.length > 0 && covered.replace(/\s+/g, ' ') === text.replace(/\s+/g, ' '),
          stored: new RegExp(`\\{[^}]*\\b${mark}\\b[^}]*\\}`).test(stored),
          text,
          covered,
        };
      };
      const rows = [
        ['format.text.italic', 'i', 'i'],
        ['format.text.underline', 'u', 'u'],
        ['format.text.strikethrough', 's', 's'],
        ['format.text.superscript', 'sup', 'sup'],
        ['format.text.subscript', 'sub', 'sub'],
      ];
      for (const [row, tag, mark] of rows) {
        await t.clearAll();
        await t.selectObject(MARKS);
        await t.menuPath('format', 'format.text', row);
        await t.settled();
        await t.sleep(300);
        const r = await wholeMarked(MARKS, tag, mark);
        const snack = await t.snackbar();
        const good = r.whole || r.stored;
        ok = ok && good;
        facts.push(
          `${row.replace('format.text.', '')}: whole ${r.whole} (stored mark ${r.stored})${snack ? ` snackbar "${snack}"` : ''}`,
        );
        await t.press('Meta+z');
        await t.settled();
      }
      /* Cmd+I on the selected box presses the tail's Italic */
      await t.clearAll();
      await t.selectObject(MARKS);
      await t.press('Meta+i');
      await t.settled();
      await t.sleep(300);
      const pressed = (await t.attr('[data-control="toolbar.italic"]', 'aria-pressed')) === 'true';
      const cmdI = await wholeMarked(MARKS, 'i', 'i');
      ok = ok && pressed && (cmdI.whole || cmdI.stored);
      facts.push(`Cmd+I: Italic pressed ${pressed}, whole ${cmdI.whole}`);
      await t.press('Meta+z');
      await t.settled();
      /* the labelled rectangle */
      if (shape) {
        await t.clearAll();
        await t.selectObject(SHAPE);
        await t.menuPath('format', 'format.text', 'format.text.italic');
        await t.settled();
        await t.sleep(300);
        const s = await wholeMarked(SHAPE, 'i', 'i');
        const snack = await t.snackbar();
        ok = ok && (s.whole || s.stored);
        facts.push(
          `shape label: whole ${s.whole} (stored ${s.stored})${snack ? ` snackbar "${snack}"` : ''}`,
        );
        await t.press('Meta+z');
        await t.settled();
      } else facts.push('no shape placed');
      /* nothing selected: the rows are disabled */
      await t.clearAll();
      const menuRows = await menuRowsOf(
        'format',
        'format.text',
        '[data-control="menu.format.text.italic"]',
      );
      const disabled = rows.map(([row]) => menuRows.find((r) => r.id === row)?.disabled ?? null);
      const allDisabled = disabled.every((d) => d === true);
      ok = ok && allDisabled;
      facts.push(`nothing selected: disabled ${disabled.join(', ')}`);
      return {
        ok,
        observed: `${facts.join('; ')}${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.3 item 17, ${LANE}; model.ts 1657 by request to the integrator)`}`,
      };
    },
  );

  // ---- the title slide for the heading rows
  const TS = await t
    .setup('a title slide for the heading rows', 'slide.new through the window API', async () => {
      const id = await t.setupSlide(null, 'title');
      t.deck.polishTitleSlide = id;
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.polishTitleSlide);
  await t.clickCard(TS);
  await page
    .waitForSelector(`.pt-viewer[data-active="${TS}"]`, { timeout: 5000 })
    .catch(() => undefined);
  await t.sleep(300);
  await t.clearAll();
  const runsNow = await t.runs();
  const HEAD = runsNow.find((r) => /heading/.test(r)) ?? runsNow[0];
  const LEAD = runsNow.find((r) => /lead/.test(r)) ?? runsNow.find((r) => r !== HEAD) ?? null;
  const HEAD_BLOCK = (await t.blockOfRun(HEAD)) ?? 'lead';
  const onTitleSlide = async () => {
    if ((await t.activeSlide()) !== TS) await t.clickCard(TS);
    await page
      .waitForSelector(`.pt-viewer[data-active="${TS}"]`, { timeout: 5000 })
      .catch(() => undefined);
    await t.sleep(300);
  };
  const clickTitle = async () => {
    await onTitleSlide();
    await t.clearAll();
    const info = await t.runInfo(HEAD);
    return t.clickSelect(HEAD_BLOCK, {
      x: info.rect.x + info.rect.w / 2,
      y: info.rect.y + info.rect.h / 2,
    });
  };
  const headingText = async () => ((await t.runInfo(HEAD))?.text ?? '').replace(/ /g, ' ');

  // ---- 2.3 item 18: a heading takes a list and an indent, and a disabled button says why
  await t.step(
    'text.tail.heading-takes-list-indent',
    'the title placeholder selected by one click; Bulleted list, Increase indent and Paint format from the tail; every disabled tail button read',
    "Bulleted list writes a list on the heading, Increase indent writes, Paint format arms; a button whose plan refuses reads aria-disabled with the plan's sentence",
    async () => {
      await clickTitle();
      const headJson = async () => JSON.stringify(await t.slideJson(TS));
      const before = await headJson();
      const facts = [];
      const disabledRead = await page.evaluate(() =>
        [...document.querySelectorAll('.ts-toolbar [data-control^="toolbar."]')]
          .filter(
            (el) => el.getClientRects().length > 0 && el.getAttribute('aria-disabled') === 'true',
          )
          .map((el) => ({
            control: el.getAttribute('data-control'),
            tip:
              el.getAttribute('data-tip-doc') ??
              el.getAttribute('data-tip') ??
              el.getAttribute('title') ??
              '',
          })),
      );
      const sentenced = disabledRead.every((d) => d.tip.length > 0);
      facts.push(
        `disabled tail buttons ${disabledRead.length}${disabledRead.length > 0 ? ` (${disabledRead.map((d) => `${d.control}: "${d.tip}"`).join('; ')})` : ''}`,
      );
      let ok = sentenced;
      const refused = [];
      const act = async (control, label, judge) => {
        await clickTitle();
        if (!(await t.visible(control)) && !(await t.visible('toolbar.more'))) {
          facts.push(`${label}: no ${control}`);
          ok = false;
          return;
        }
        const disabled = (await t.attr(`[data-control="${control}"]`, 'aria-disabled')) === 'true';
        await t.tailControl(control);
        await t.settled();
        await t.sleep(400);
        const snack = await t.snackbar();
        const after = await headJson();
        const good = judge(after);
        if (snack && /Select a/.test(snack)) refused.push(`${label}: "${snack}"`);
        ok = ok && good && !disabled;
        facts.push(
          `${label}: ${disabled ? 'disabled, ' : ''}${good ? 'written' : 'not written'}${snack ? ` snackbar "${snack}"` : ''}`,
        );
        await t.clearAll();
        if (good) {
          await t.press('Meta+z');
          await t.settled();
        }
      };
      await act(
        'toolbar.bulletedList',
        'Bulleted list',
        (j) => j !== before && /marker|"list"|items/.test(j),
      );
      await act(
        'toolbar.increaseIndent',
        'Increase indent',
        (j) => j !== before && /indent/.test(j),
      );
      await clickTitle();
      const paint = (await t.visible('toolbar.paintFormat')) ? 'toolbar.paintFormat' : null;
      if (paint) {
        await t.clickControl(paint);
        await t.sleep(400);
        const armed =
          (await t.attr(`[data-control="${paint}"]`, 'aria-pressed')) === 'true' ||
          (await page.evaluate(
            () =>
              document.querySelector(
                '.ts-toolbar [data-control="toolbar.paintFormat"].is-armed, .ts-toolbar [data-control="toolbar.paintFormat"].is-active',
              ) !== null,
          ));
        const snack = await t.snackbar();
        ok = ok && armed;
        facts.push(`Paint format: armed ${armed}${snack ? ` snackbar "${snack}"` : ''}`);
        await t.press('Escape');
      } else facts.push('no toolbar.paintFormat on the tail');
      if (refused.length > 0) ok = false;
      await t.clearAll();
      return {
        ok,
        observed: `${facts.join('; ')}${refused.length > 0 ? `; refused with a sentence from an enabled button: ${refused.join(', ')}` : ''}${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.3 item 18, ${LANE})`}`,
      };
    },
  );

  // ---- 2.3 item 19: Enter in a heading session keeps the session
  await t.step(
    'text.heading.enter-keeps-session',
    'a title typed; double click the title, End, Enter, "more"; Escape',
    'the session stays open with two lines and the first line is kept; no paragraph is replaced',
    async () => {
      await clickTitle();
      await t.typeHuman('Quarterly review');
      await t.sleep(200);
      await escapeOut();
      const first = await headingText();
      await t.clearAll();
      const on = await t.openRun(HEAD);
      await t.press('End');
      await t.press('Enter');
      await t.sleep(200);
      const stillOpen = await t.editing();
      await t.typeHuman('more');
      await t.sleep(200);
      const info = await t.runInfo(HEAD);
      const openAfter = await t.editing();
      await escapeOut();
      const after = await headingText();
      const ok =
        on &&
        stillOpen &&
        openAfter &&
        (info?.lines ?? 0) >= 2 &&
        after.includes('Quarterly review') &&
        after.includes('more') &&
        !/^more/.test(after.trim());
      return {
        ok,
        observed: `title "${first}"; session after Enter ${stillOpen}, after typing ${openAfter}; lines ${info?.lines}; text after "${after.replace(/\n/g, '\\n')}"${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.3 item 19, ${LANE}; A1 rule 2)`}`,
      };
    },
  );

  // ---- 2.3 item 22: the tail's size field reads the heading's size
  await t.step(
    'text.tail.size-reads-heading',
    'a title session open; the size field read; a subtitle session; the field read',
    "the tail's size field reads the heading's computed size (88 on a fresh title, 26 for the subtitle on this sheet)",
    async () => {
      /* item 22: the field reads the heading's computed size from the ladder. The sheet draws a
         fresh title at 88 and the title slide's lead at 26 (`sheet.css` `.ts-sheet .lead`), and a
         title the rows before this one wrapped has stepped down the ladder (item 21) and stays
         there, so the read is against the drawn size and not a constant (B1's R22a) */
      await onTitleSlide();
      await t.clearAll();
      const headFont = (await t.runInfo(HEAD))?.font ?? null;
      await t.openRun(HEAD);
      await t.sleep(300);
      const title = await t.valueOf('toolbar.fontSize.value');
      await escapeOut();
      let sub = null;
      let leadFont = null;
      if (LEAD) {
        await t.clearAll();
        leadFont = (await t.runInfo(LEAD))?.font ?? null;
        await t.openRun(LEAD);
        await t.sleep(300);
        sub = await t.valueOf('toolbar.fontSize.value');
        await escapeOut();
      }
      const reads = (field, font) =>
        font !== null && String(field ?? '') !== '' && Math.abs(Number(field) - font) <= 0.5;
      const ok = reads(title, headFont) && (LEAD === null || reads(sub, leadFont));
      return {
        ok,
        observed: `title field "${title}" (drawn ${headFont} px); subtitle field "${sub}" (drawn ${leadFont} px)${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.3 item 22, ${LANE})`}`,
      };
    },
  );

  // ---- 2.3 item 21: a long title shrinks to fit
  await t.step(
    'text.title.shrink-on-overflow',
    'the title selected and twelve words typed over it; Escape',
    "the drawn size steps down the ladder until the text fits and the ring's height stays the placeholder's",
    async () => {
      /* a title slide of its own: the shrink steps down the ladder and never back up
         (`text-fit.ts` `shrinkMutation`), and the heading rows before this one leave TS's title
         at 44 (item 19's two lines), so on TS the row read 44 to 44 while the mechanism held (the
         verifier's pass 2); the fresh placeholder draws at the sheet's 88 and the row reads the
         step from there. The slide is removed at the end so the deck reads as the rows after it
         expect */
      const own = await t.setupSlide(TS, 'title');
      if (!own) return { ok: false, observed: 'no title slide of its own' };
      await t.clickCard(own);
      await page
        .waitForSelector(`.pt-viewer[data-active="${own}"]`, { timeout: 5000 })
        .catch(() => undefined);
      await t.sleep(300);
      await t.clearAll();
      const ownRuns = await t.runs();
      const ownHead = ownRuns.find((r) => /heading/.test(r)) ?? ownRuns[0];
      const ownBlock = (await t.blockOfRun(ownHead)) ?? 'lead';
      const clickOwn = async () => {
        await t.clearAll();
        const at = await t.runInfo(ownHead);
        return t.clickSelect(ownBlock, {
          x: at.rect.x + at.rect.w / 2,
          y: at.rect.y + at.rect.h / 2,
        });
      };
      await clickOwn();
      const ringBefore = (await t.frameFacts(ownBlock))?.ring ?? null;
      const sizeBefore = (await t.runInfo(ownHead))?.font ?? null;
      await t.typeHuman('Twelve words that run on and on across the whole title placeholder now');
      await t.sleep(300);
      await escapeOut();
      await clickOwn();
      const ringAfter = (await t.frameFacts(ownBlock))?.ring ?? null;
      const info = await t.runInfo(ownHead);
      const sheet = await t.sheetRect();
      const k = sheet ? sheet.w / 1600 : 1;
      const inside = info && sheet ? info.rect.y + info.rect.h <= sheet.y + sheet.h + 1 : false;
      const shrank = sizeBefore !== null && info !== null && info.font < sizeBefore - 1;
      const ringKept = ringBefore && ringAfter ? Math.abs(ringAfter.h - ringBefore.h) <= 4 : false;
      const ok = shrank && ringKept && inside;
      await t.clearAll();
      const s = await t.state();
      await t.invoke('slide.remove', { baseRevision: s.revision, slideId: own });
      await t.pollUntil(t.slideOrder, (o) => !o.includes(own), 15_000).catch(() => undefined);
      await t.settled();
      await onTitleSlide();
      return {
        ok,
        observed: `font ${sizeBefore} -> ${info?.font} px over ${info?.lines} lines; ring height ${ringBefore ? r1(ringBefore.h) : '?'} -> ${ringAfter ? r1(ringAfter.h) : '?'} sheet px (kept ${ringKept}); text inside the sheet ${inside} (k ${r1(k)})${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.3 item 21, ${LANE})`}`,
      };
    },
  );

  // ---- the fix round (VERIFICATION.md "Polish round, pass 1" finding 1): a title that wrapped
  // keeps its last words, and a second session on it lands; both read from the document after a
  // reload, since the stage keeps the session's text until then and the walk's other title rows
  // read the DOM. The shrink's size write rides the last burst and converts the cover to a canvas
  // in the same write (controller.tsx convertThenCommit); the burst's field run must follow it to
  // the canvas block (convert-first.ts retargetFieldRuns) or the reducer refuses the whole write.
  await t.step(
    'text.title.second-session-survives-reload',
    'a title that wraps typed over the placeholder; Escape; the title opened again, End, more words; Escape; the page reloaded',
    "the document's heading holds both sessions' words after the reload, the stage draws them and no write was refused",
    async () => {
      await clickTitle();
      await t.typeHuman('Onboarding plan for Acme in ninety days');
      await t.sleep(300);
      await escapeOut();
      const snackFirst = await t.snackbar();
      await t.clearAll();
      const on = await t.openRun(HEAD);
      await t.press('End');
      await t.typeHuman(' and beyond');
      await t.sleep(300);
      await escapeOut();
      const snackSecond = await t.snackbar();
      const staged = await headingText();
      await t.reloadTo(`${BASE}/edit/${t.deck.id}#s/${TS}`);
      await t.settled();
      await onTitleSlide();
      const slide = await t.slideJson(TS);
      const headingId = slide?.grammar?.slots?.main?.[1] ?? 'heading';
      const stored =
        slide?.kind === 'title'
          ? (slide.heading ?? '')
          : ((slide?.slots?.main ?? []).find((b) => b.id === headingId)?.text ?? '');
      const drawn = await headingText();
      const refused = [snackFirst, snackSecond].some(
        (text) => text !== null && /refused|is not a string|No block/.test(text),
      );
      const ok =
        on &&
        stored.includes('in ninety days') &&
        stored.includes('and beyond') &&
        drawn.includes('and beyond') &&
        !refused;
      await t.clearAll();
      return {
        ok,
        observed: `staged "${staged}"; stored after reload "${stored}" (slide kind ${slide?.kind}); drawn "${drawn}"; snackbars ${JSON.stringify([snackFirst, snackSecond])}${ok ? '' : ' (VERIFICATION.md "Polish round, pass 1" finding 1; the integrator)'}`,
      };
    },
  );

  // ---- back on the blank slide: the link rows and the highlight
  await t.clickCard(X);
  await t.clearAll();
  const LINK = 'pt-link';
  await t.step(
    'text.link.chip-on-click',
    'a text box with a linked run, unselected; one click on the linked word',
    'the chip with the address, Open, Copy, Change and Remove draws within 300 ms and no session is open',
    async () => {
      const made = await placeText(LINK, 'See [our site](https://example.com/acme) now', {
        x: 200,
        y: 160,
        w: 900,
        h: 80,
      });
      if (!made?.run) return { ok: false, observed: 'no text box' };
      await t.clearAll();
      const w = await t.wordRect(made.run, 1);
      if (!w) return { ok: false, observed: 'no word rect for the linked word' };
      const c = { x: w.x + w.w / 2, y: w.y + w.h / 2 };
      await t.moveHuman({ x: c.x - 40, y: c.y - 25 }, c, 6);
      await page.mouse.click(c.x, c.y);
      await t.sleep(300);
      const chip = await page.evaluate(() => {
        const el = document.querySelector('.ts-link-chip, [data-control="chip.link"]');
        if (!el || el.getClientRects().length === 0) return null;
        const controls = [...el.querySelectorAll('[data-control]')].map((c) =>
          c.getAttribute('data-control'),
        );
        return { text: (el.textContent ?? '').trim().slice(0, 120), controls };
      });
      const editing = await t.editing();
      const has = (name) => Boolean(chip?.controls.some((c) => c.endsWith(`.${name}`)));
      const ok =
        chip !== null &&
        /example\.com/.test(chip.text) &&
        has('change') &&
        has('remove') &&
        has('open') &&
        has('copy') &&
        !editing;
      await t.clearAll();
      return {
        ok,
        observed: `chip ${chip ? `"${chip.text}" with ${chip.controls.join(', ')}` : 'none'}; session open ${editing}${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.3 item 20, ${LANE})`}`,
      };
    },
  );

  const POP = 'pt-popover';
  await t.step(
    'text.link.popover-anchored',
    'a text box selected by one click; Cmd+K',
    "the Link bar's top is within 8 px below the selection's ring and inside the viewport; the slides dropdown's label is whole",
    async () => {
      const made = await placeText(POP, 'Anchor the popover here', {
        x: 200,
        y: 300,
        w: 700,
        h: 80,
      });
      if (!made?.run) return { ok: false, observed: 'no text box' };
      await t.clearAll();
      await t.selectObject(POP);
      const ring = await t.boxOfSel(
        '.ts-overlay .ts-select.is-selected:not(.is-extra):not(.is-cells)',
      );
      await t.press('Meta+k');
      const field = page
        .locator('[data-control="popover.link.url"], [data-control="dialog.link.url"]')
        .first();
      const shown = await field
        .waitFor({ timeout: 6000 })
        .then(() => true)
        .catch(() => false);
      if (!shown) return { ok: false, observed: 'no Link bar after Cmd+K' };
      const bar =
        (await t.boxOfSel('[data-control="popover.link"]')) ??
        (await t.boxOfSel('.ts-link-pop, [role="dialog"]:has([data-control="dialog.link.url"])'));
      const size = page.viewportSize() ?? { width: 1440, height: 900 };
      const dropdown = await page.evaluate(() => {
        const el = document.querySelector(
          '[data-control="popover.link.slide"], [data-control="dialog.link.slide"]',
        );
        if (!el) return null;
        const r = el.getBoundingClientRect();
        /* the shared dropdown's trigger draws its words in one span that ends in an ellipsis when
           they do not fit (DROPDOWNS.md 3.2, 3.7): that span's widths say whether they are whole */
        const words = el.querySelector('.ts-dropdown-text') ?? el;
        return {
          w: r.width,
          scroll: words.scrollWidth,
          client: words.clientWidth,
          label: (words.textContent ?? '').trim(),
          overflow: getComputedStyle(words).textOverflow,
        };
      });
      const gap = bar && ring ? bar.y - (ring.y + ring.h) : null;
      const anchored = gap !== null && gap >= -1 && gap <= 8;
      const inside = bar
        ? bar.x >= 0 && bar.y >= 0 && bar.x + bar.w <= size.width && bar.y + bar.h <= size.height
        : false;
      const whole = dropdown ? dropdown.scroll <= dropdown.client + 1 : false;
      await t.press('Escape');
      await t.clearAll();
      const ok = anchored && inside && whole;
      return {
        ok,
        observed: `ring ${ring ? `${r1(ring.x)},${r1(ring.y)} ${r1(ring.w)}x${r1(ring.h)}` : 'none'}; bar ${bar ? `${r1(bar.x)},${r1(bar.y)} ${r1(bar.w)}x${r1(bar.h)}` : 'none'} (gap under the ring ${gap === null ? '?' : r1(gap)} px, inside the viewport ${inside}); dropdown ${dropdown ? `"${dropdown.label}" ${r1(dropdown.w)} px wide, scroll ${dropdown.scroll} in ${dropdown.client}` : 'none'}${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.6 item 70, B5's EditorShell.tsx by ${LANE}'s request)`}`,
      };
    },
  );

  await t.step(
    'text.link.detection-setting',
    'Tools > Preferences > Link detection off, "See www.example.com now" typed into an empty box; on, typed again into another',
    'off: no link mark; on: a link mark',
    async () => {
      /* Preferences holds one row, and a one row submenu is drawn as its row in the parent
         (model.ts `collapseSingles`, docs/archive/rounds/POLISH.md 2.6 item 74; the toggle keeps its own words),
         so Link detection sits in Tools itself with its id `tools.preferences.linkDetection`; the
         row is read where it is drawn, and the hover on a Preferences row that is not there (the
         30 s `boundingBox` wait of the verifier's pass 2) is taken only when the submenu is */
      const rowState = async () => {
        await t.surfaceClear();
        await t.openMenu('tools');
        const flat = await t.has('[data-control="menu.tools.preferences.linkDetection"]');
        if (!flat)
          await t.hoverRow(
            'tools.preferences',
            '[data-control="menu.tools.preferences.linkDetection"]',
          );
        const row =
          (await t.menuRows('tools')).find((r) => r.id === 'tools.preferences.linkDetection') ??
          null;
        await t.press('Escape', 2);
        await t.sleep(150);
        return { row, flat };
      };
      const setDetection = async (on) => {
        const { row, flat } = await rowState();
        if (!row) return null;
        const now = row.checked === 'true';
        if (now !== on) {
          if (flat) await t.menuPath('tools', 'tools.preferences.linkDetection');
          else await t.menuPath('tools', 'tools.preferences', 'tools.preferences.linkDetection');
        }
        await t.sleep(200);
        return (await rowState()).row?.checked === 'true';
      };
      const typeInto = async (id) => {
        const made = await placeText(id, '', { x: 200, y: 440, w: 900, h: 80 });
        if (!made?.run) return { marks: null, text: null };
        await t.clearAll();
        await t.selectObject(id);
        await t.typeHuman('See www.example.com now');
        await t.sleep(400);
        await escapeOut();
        const run = (await t.runsOfBlock(id))[0];
        const marks = run ? await marksOf(run) : [];
        const linked = marks.filter((m) => m.tag === 'a' || m.href || m.mark === 'link');
        const stored = (await block(id))?.text ?? '';
        await t.clearAll();
        await t.selectObject(id);
        await t.press('Delete');
        await t.settled();
        return { linked: linked.length, stored };
      };
      const off = await setDetection(false);
      if (off === null)
        return { ok: false, observed: 'no Tools > Preferences > Link detection row' };
      const offRead = await typeInto('pt-detect-off');
      const on = await setDetection(true);
      const onRead = await typeInto('pt-detect-on');
      const ok =
        off === false &&
        offRead.linked === 0 &&
        !/\]\(/.test(offRead.stored ?? '') &&
        on === true &&
        onRead.linked >= 1;
      return {
        ok,
        observed: `off (row checked ${off}): ${offRead.linked} link marks, stored "${offRead.stored}"; on (row checked ${on}): ${onRead.linked} link marks, stored "${onRead.stored}"${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.9 item 114, B5)`}`,
      };
    },
  );

  const HL = 'pt-highlight';
  await t.step(
    'text.polish.highlight-console',
    'a word selected in a text box, Highlight color > amber; the band sampled; the editor reloaded and its console read',
    "the band's sampled colour is the amber swatch's; an editor load logs no 404 and no 502",
    async () => {
      const made = await placeText(HL, 'Highlight delta here', { x: 200, y: 580, w: 900, h: 80 });
      if (!made?.run) return { ok: false, observed: 'no text box' };
      const { run } = made;
      await t.clearAll();
      await t.openRun(run);
      await t.selectWord(run, 1);
      await t.tailControl('toolbar.highlightColor');
      await t.waitControl('toolbar.highlightColor.plate', 5000);
      const amber = (await t.has('[data-control="toolbar.highlightColor.amber"]'))
        ? 'toolbar.highlightColor.amber'
        : null;
      if (!amber) {
        await t.press('Escape', 2);
        return { ok: false, observed: 'no amber swatch in the Highlight plate' };
      }
      const swatch = await t.styleOf(`[data-control="${amber}"]`, ['background-color']);
      await t.clickControl(amber);
      await t.settled();
      await t.sleep(400);
      const marks = await marksOf(run);
      const hl = marks.find(
        (m) => m.text.trim() === 'delta' && m.background && m.background !== 'rgba(0, 0, 0, 0)',
      );
      /* the pixels are read with the selection cleared: the browser's selection tint over the
         word blends the band (walk 1 read #adb1a4 over an amber band), so the sample is taken
         after Escape, on the drawn mark alone */
      await escapeOut();
      await t.sleep(300);
      const w = await t.wordRect(run, 1);
      const sample = w
        ? await t.sampleBox({ x: w.x, y: w.y, w: w.w, h: w.h }, { inset: 2, step: 2 })
        : null;
      const toRgb = (s) => {
        const m = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/.exec(s ?? '');
        return m ? [1, 2, 3].map((i) => Number(m[i])) : null;
      };
      const swatchRgb = toRgb(swatch?.['background-color']);
      const bandRgb = toRgb(hl?.background);
      const close = (a, b) => a && b && a.every((v, i) => Math.abs(v - b[i]) <= 24);
      const amberish = (rgb) => rgb && rgb[0] > 180 && rgb[1] > 120 && rgb[2] < 120;
      const bandOk = close(swatchRgb, bandRgb) || amberish(bandRgb);
      const sampleOk =
        sample &&
        sample.colors.some((c) =>
          amberish(
            toRgb(
              `rgb(${parseInt(c.hex.slice(1, 3), 16)}, ${parseInt(c.hex.slice(3, 5), 16)}, ${parseInt(c.hex.slice(5, 7), 16)})`,
            ),
          ),
        );
      /* the console on an editor load: the page reloaded and every error read */
      const before = t.consoleErrors.length;
      await t.reloadTo(`${BASE}/edit/${t.deck.id}#s/${X}`);
      await t.sleep(2500);
      const errors = t.consoleErrors.slice(before);
      const bad = errors.filter((e) => /\b(404|502)\b/.test(e));
      await t.clickCard(X);
      await t.clearAll();
      const ok = Boolean(bandOk && sampleOk) && bad.length === 0;
      return {
        ok,
        observed: `swatch ${swatch?.['background-color']}; band ${hl ? hl.background : 'no highlight mark'} (matches ${Boolean(bandOk)}); pixels ${sample ? sample.colors.map((c) => `${c.hex}×${c.count}`).join(', ') : 'unread'} (amber present ${Boolean(sampleOk)}); console after the reload ${errors.length} errors, ${bad.length} with 404 or 502${bad.length > 0 ? ` (${bad.slice(0, 3).join(' | ')})` : ''}${ok ? '' : ` (docs/archive/rounds/POLISH.md 2.3 item 23, ${LANE} and B5)`}`,
      };
    },
  );
}
