// Diagrams (docs/RETURN.md 2.6, section 5 `diagrams.*` with the driver `probe --core`): the
// Diagram panel with its six types, the Steps stepper and the three styles, the Process diagram
// that lands as one group and moves as one, a label edited inside the group, the light
// appearance, the show and the reload. Insert > Diagram is reached in the default view, or with
// Tools > Advanced tools on while the row is still parked.

export const NAME = 'diagrams';
export const IDS = [
  'diagrams.panel',
  'diagrams.insert.group',
  'diagrams.select-move',
  'diagrams.edit-label',
  'diagrams.light-appearance',
  'diagrams.present',
  'diagrams.reload',
  /* the features round, ship one (docs/FEATURES.md 2.2 ranks 6 and 9): a double click opens a
     label, Tab moves between labels, a step is one shape with its label; driven by
     `featuresRound` below */
  'diagrams.label.double-click-opens',
  'diagrams.label.tab-next',
  'diagrams.step.one-object',
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function run(t) {
  const { page, BASE } = t;
  const S = await t
    .setup('a slide for the diagram', 'slide.new through the window API', async () => {
      const id = await t.setupSlide(t.deck.chartSlide ?? t.deck.titleSlide, 'blank');
      t.deck.diagramSlide = id;
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.diagramSlide);
  await t.clickCard(S);
  await t.clearAll();
  await t.reachSetup('Insert > Diagram', 'insert', 'insert.diagram');

  /** The diagram's members: every object of the slide carrying a group in its position. */
  const members = async () => (await t.objectsOf(S)).filter((o) => o.pos?.group !== undefined);
  /**
   * The diagram's shape: the boxes, the labels (a separate text member on the return round's
   * templates, the box's own text since docs/FEATURES.md 2.2 rank 9 made a step one object), the
   * lines and the groups. The rows accept either form and record which they met.
   */
  const isBox = (o) => o.type === 'shape' && o.block.shape !== 'line';
  const ownText = (o) => isBox(o) && typeof o.block.text === 'string' && o.block.text.length > 0;
  const describe = (list) => ({
    boxes: list.filter(isBox).length,
    labels: list.filter((o) => o.type === 'text').length + list.filter(ownText).length,
    separate: list.filter((o) => o.type === 'text').length,
    lines: list.filter((o) => o.type === 'shape' && o.block.shape === 'line').length,
    groups: [...new Set(list.map((o) => o.pos.group))],
  });
  const undo = async () => {
    await t.press('Meta+z');
    await t.sleep(500);
    await t.settled();
  };

  await t.step(
    'diagrams.panel',
    'Insert > Diagram; pick Process and one more step',
    'the panel lists six types, the Steps stepper and three styles with a live preview',
    async () => {
      await t.menuPath('insert', 'insert.diagram');
      await t.waitControl('panel.diagram', 8000);
      const types = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="insert.diagram.type."]')].map((e) =>
          e.getAttribute('data-control').replace('insert.diagram.type.', ''),
        ),
      );
      const styles = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="insert.diagram.style."]')].map((e) =>
          e.getAttribute('data-control').replace('insert.diagram.style.', ''),
        ),
      );
      await t.clickControl('insert.diagram.type.process');
      await t.sleep(300);
      const count0 = Number(await t.valueOf('insert.diagram.count'));
      const noun = await page.evaluate(
        () => document.getElementById('ts-diagram-count-label')?.textContent ?? null,
      );
      const previewBefore = await page.evaluate(
        () =>
          document.querySelector('[data-control="insert.diagram.preview"]')?.innerHTML.length ?? 0,
      );
      await t.clickControl('insert.diagram.count.more');
      await t.sleep(300);
      const count1 = Number(await t.valueOf('insert.diagram.count'));
      const previewAfter = await page.evaluate(
        () =>
          document.querySelector('[data-control="insert.diagram.preview"]')?.innerHTML.length ?? 0,
      );
      const preview = await t.visible('insert.diagram.preview');
      return {
        ok:
          types.length === 6 &&
          styles.length === 3 &&
          count1 === count0 + 1 &&
          preview &&
          previewAfter !== previewBefore,
        observed: `types ${types.join(', ')}; styles ${styles.join(', ')}; ${noun ?? 'count'} ${count0} -> ${count1}; preview drawn ${preview} (its markup changed ${previewAfter !== previewBefore})`,
      };
    },
  );

  await t.step(
    'diagrams.insert.group',
    'Insert in the panel',
    'a Process diagram of five rounded boxes, five labels and four lines lands as one group; the panel stays open',
    async () => {
      const before = await t.objectIds(S);
      await t.clickControl('insert.diagram.insert');
      const list = await t.pollUntil(members, (m) => m.length >= 9, 15_000).catch(members);
      await t.settled();
      const d = describe(list);
      const open = await t.visible('panel.diagram');
      const rounded = list.filter(
        (o) => o.type === 'shape' && /round/i.test(o.block.shape ?? ''),
      ).length;
      return {
        ok:
          d.boxes === 5 &&
          rounded === 5 &&
          d.labels === 5 &&
          d.lines === 4 &&
          d.groups.length === 1 &&
          open,
        observed: `${list.length} new objects (${before.length} before): ${d.boxes} boxes (${rounded} rounded), ${d.labels} labels (${d.separate} separate text blocks, ${d.labels - d.separate} the boxes' own text), ${d.lines} lines; groups ${d.groups.join(', ')}; panel open ${open}`,
      };
    },
  );
  if (await t.visible('panel.diagram.close')) await t.clickControl('panel.diagram.close');
  const list0 = await members();
  const box1 = list0.find((o) => o.type === 'shape' && o.block.shape !== 'line');
  if (!box1) throw new (await import('../toolkit.mjs')).SetupFailed('a diagram to drive');
  t.deck.diagram = list0.map((o) => o.id);
  /** The members the insert made (14 on the two object templates, 9 with a step as one object). */
  const TOTAL = list0.length;
  /** The block whose text is the first box's label: a separate text member, else the box itself. */
  const labelOwner =
    list0.find(
      (o) =>
        o.type === 'text' &&
        Math.abs(o.pos.x - box1.pos.x) < 4 &&
        Math.abs(o.pos.y - box1.pos.y) < 4,
    ) ??
    list0.find((o) => o.type === 'text') ??
    (ownText(box1) ? box1 : null);

  await t.step(
    'diagrams.select-move',
    'one click on a box, a drag from inside by 100,60, Undo',
    'chip Group; every object moves; Undo restores',
    async () => {
      await t.clearAll();
      const { facts } = await t.clickSelect(box1.id);
      const chip = facts.chip;
      const before = Object.fromEntries((await members()).map((o) => [o.id, o.pos]));
      const r = await t.dragInside(S, box1.id, 100, 60);
      await t.settled();
      const after = Object.fromEntries((await members()).map((o) => [o.id, o.pos]));
      const moved = Object.keys(before).filter(
        (id) =>
          after[id] &&
          t.near(after[id].x - before[id].x, 100, 8) &&
          t.near(after[id].y - before[id].y, 60, 8),
      );
      await undo();
      const back = Object.fromEntries((await members()).map((o) => [o.id, o.pos]));
      const restored = Object.keys(before).every((id) => same(before[id], back[id]));
      return {
        ok: chip === 'Group' && moved.length === Object.keys(before).length && restored,
        observed: `chip "${chip}"; ${t.describeSelection(facts)}; moved ${moved.length} of ${Object.keys(before).length} (box ${t.posStr(r.before)} -> ${t.posStr(r.after)}); undo restored ${restored}`,
      };
    },
  );

  await t.step(
    'diagrams.edit-label',
    'double click a diagram box (the member is selected), double click its label, type',
    'the label changes and the group stays one group',
    async () => {
      await t.clearAll();
      const label = labelOwner;
      if (!label)
        return {
          ok: false,
          observed: 'no label in the diagram (no text member and no text on the box)',
        };
      const b = await t.boxOf(box1.id);
      await t.dblclickAt(b.free.x + 6, b.free.y + 6);
      await t.sleep(300);
      const chipAfterBox = await t.chip();
      const run = (await t.runsOfBlock(label.id))[0];
      if (!run)
        return {
          ok: false,
          observed: `no run for the label ${label.id}; chip after the box "${chipAfterBox}"`,
        };
      const on = await t.openRun(run);
      const chipInSession = await t.chip();
      await t.press('End');
      await t.typeHuman(' plus');
      await t.sleep(200);
      await t.press('Escape');
      await t.settled();
      const text = await t
        .pollUntil(
          async () => (await t.blockOf(S, label.id))?.block?.text ?? null,
          (x) => typeof x === 'string' && x.endsWith(' plus'),
          8000,
        )
        .catch(async () => (await t.blockOf(S, label.id))?.block?.text ?? null);
      const d = describe(await members());
      return {
        ok:
          on &&
          typeof text === 'string' &&
          text.endsWith(' plus') &&
          d.groups.length === 1 &&
          d.boxes + d.separate + d.lines === TOTAL,
        observed: `double click on the box: chip "${chipAfterBox}"; label ${label.id === box1.id ? "the box's own text" : label.id}; session ${on} (chip "${chipInSession}"); text "${text}"; groups ${d.groups.join(', ')}, members ${d.boxes + d.separate + d.lines} of ${TOTAL}`,
      };
    },
  );

  const drawnFacts = () =>
    page.evaluate((ids) => {
      const sheet = document.querySelector('.ts-stagewrap.ts-editor .pt-slide:not(.is-leaving)');
      const ground = (() => {
        for (let node = sheet; node; node = node.parentElement) {
          const bg = getComputedStyle(node).backgroundColor;
          if (bg && bg !== 'transparent' && !/^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)$/.test(bg))
            return bg;
        }
        return null;
      })();
      const out = { ground, strokes: [], texts: [], lines: [] };
      for (const id of ids) {
        const el = sheet?.querySelector(`[data-block="${id}"]`);
        if (!el) continue;
        const svg = el.tagName.toLowerCase() === 'svg' ? el : el.querySelector('svg');
        const path = svg?.querySelector('path, rect, line');
        if (path) {
          const cs = getComputedStyle(path);
          (svg.getAttribute('data-shape') === 'line' ? out.lines : out.strokes).push(cs.stroke);
          /* a step's own label (docs/FEATURES.md 2.2 rank 9): the shape's text layer */
          const own = (el.closest('.free') ?? el).querySelector('.shape-text, [data-run]');
          if (own && (own.textContent ?? '').trim() !== '')
            out.texts.push(getComputedStyle(own).color);
        } else {
          const p = el.querySelector('p, .text, span') ?? el;
          out.texts.push(getComputedStyle(p).color);
        }
      }
      return out;
    }, t.deck.diagram);
  const showFacts = () =>
    page.evaluate((ids) => {
      const show = document.querySelector('[data-control="present.show"]');
      const sheet =
        document.querySelector('.ts-stagewrap.is-present .pt-slide:not(.is-leaving)') ??
        document.querySelector('.pt-viewer.is-present .pt-slide:not(.is-leaving)');
      const drawn = ids.filter(
        (id) => sheet?.querySelector(`[data-block="${id}"]`) !== null,
      ).length;
      /* the labels: a separate text member or the box's own text (docs/FEATURES.md 2.2 rank 9) */
      const labels = sheet
        ? ids.filter((id) => {
            const el = sheet.querySelector(`[data-block="${id}"]`);
            if (!el) return false;
            const svg = el.tagName.toLowerCase() === 'svg' ? el : el.querySelector('svg');
            if (svg?.getAttribute('data-shape') === 'line') return false;
            return ((el.closest('.free') ?? el).textContent ?? '').trim() !== '';
          }).length
        : 0;
      return {
        show: show !== null,
        drawn,
        labels,
        svgs: sheet ? sheet.querySelectorAll('svg').length : 0,
      };
    }, t.deck.diagram);
  const openShow = async () => {
    await t.clearAll();
    await t.clickControl('present.open');
    await page.locator('[data-control="present.show"]').waitFor({ timeout: 8000 });
    await t.sleep(800);
  };
  const leaveShow = async () => {
    await t.press('Escape');
    await page
      .locator('[data-control="present.show"]')
      .waitFor({ state: 'detached', timeout: 8000 })
      .catch(() => undefined);
    await t.sleep(300);
  };

  await t.step(
    'diagrams.light-appearance',
    'Slide > Change theme, the light tile; read the strokes, the lines and the labels; then Slideshow',
    'each reads on the light sheet; the show draws it the same',
    async () => {
      const got = await t.pickAppearance('light');
      await t.closeThemes();
      const f = await drawnFacts();
      const worst = (list) => Math.min(...list.map((c) => t.contrastOf(c, f.ground) ?? 0));
      const strokes = worst(f.strokes);
      const lines = worst(f.lines);
      const texts = worst(f.texts);
      await openShow();
      const show = await showFacts();
      await leaveShow();
      const back = await t.pickAppearance('dark');
      await t.closeThemes();
      return {
        ok:
          (got.deck === 'light' || got.theme === 'light') &&
          strokes >= 1.5 &&
          lines >= 1.5 &&
          texts >= 3 &&
          show.show &&
          show.drawn === TOTAL,
        observed: `appearance ${JSON.stringify(got)}; ground ${f.ground}; box strokes ${[...new Set(f.strokes)].join(',')} (${strokes}:1); lines ${[...new Set(f.lines)].join(',')} (${lines}:1); labels ${[...new Set(f.texts)].join(',')} (${texts}:1); show drew ${show.drawn} of ${TOTAL} (${show.labels} labels); back to ${JSON.stringify(back)}`,
      };
    },
  );

  await t.step(
    'diagrams.present',
    'Slideshow on the diagram slide',
    'the show draws the diagram with its marks and labels',
    async () => {
      await t.clickCard(S);
      await openShow();
      const show = await showFacts();
      await leaveShow();
      return {
        ok: show.show && show.drawn === TOTAL && show.labels === 5 && show.svgs >= 9,
        observed: `show ${show.show}; drawn ${show.drawn} of ${TOTAL}; labels with text ${show.labels}; svgs ${show.svgs}`,
      };
    },
  );

  await t.step(
    'diagrams.reload',
    'reload /edit/<id>#s/<diagram slide>',
    'the diagram survives as one group',
    async () => {
      const before = (await members()).map((o) => ({ id: o.id, pos: o.pos }));
      await t.reloadTo(`${BASE}/edit/${t.deck.id}#s/${S}`);
      await t.settled();
      const after = await t.pollUntil(members, (m) => m.length >= TOTAL, 10_000).catch(members);
      const d = describe(after);
      const kept = before.every((b) => same(b.pos, after.find((o) => o.id === b.id)?.pos));
      return {
        ok: after.length === TOTAL && d.groups.length === 1 && kept,
        observed: `${after.length} members after the reload; groups ${d.groups.join(', ')}; positions the same ${kept}`,
      };
    },
  );
  await featuresRound(t, S, { members, describe, list0, box1, undo });
  await t.advancedBack('the diagram rows');
}

/**
 * The features round, ship one (docs/FEATURES.md 2.2 ranks 6 and 9; the rows
 * `diagrams.label.double-click-opens`, `diagrams.label.tab-next` and `diagrams.step.one-object`):
 * a double click on a step opens its label at once, Tab moves between the labels of the group and
 * Enter on the group opens the first, and a process diagram of three steps is three shapes with
 * their labels and no separate text block. The first two rows drive the area's own diagram; the
 * third inserts a three step diagram through the panel. Clicks are counted the audit's way (a
 * double click is two).
 */
async function featuresRound(t, S, h) {
  const { page } = t;
  const LANE = 'B3';
  /** The step boxes of the area's diagram in their group order, with a label each (a member text or the shape's own). */
  const steps = async () => {
    const list = await h.members();
    const boxes = list.filter((o) => o.type === 'shape' && o.block.shape !== 'line');
    return boxes.map((box) => {
      const label = list.find(
        (o) =>
          o.type === 'text' &&
          o.pos &&
          Math.abs(o.pos.x - box.pos.x) < 4 &&
          Math.abs(o.pos.y - box.pos.y) < 4,
      );
      return { box, label: label ?? null };
    });
  };
  const textOf = async (step) => {
    const list = await h.members();
    const owner = list.find((o) => o.id === (step.label?.id ?? step.box.id));
    return owner?.block?.text ?? null;
  };
  /** The run of a step's label on the stage: the text member's, else the shape's own text layer. */
  const labelRun = async (step) => (await t.runsOfBlock(step.label?.id ?? step.box.id))[0] ?? null;
  const sessionRun = () =>
    page.evaluate(
      () => document.activeElement?.closest?.('[data-run]')?.getAttribute('data-run') ?? null,
    );

  await t.step(
    'diagrams.label.double-click-opens',
    'one click on a step (the group), a double click on the step, type; a double click on the next step, type',
    'the double click opens the label with the caret; two labels edited in 6 clicks or fewer',
    async () => {
      await t.clearAll();
      const list = await steps();
      if (list.length < 2) return { ok: false, observed: `${list.length} step(s) in the diagram` };
      const [s1, s2] = list;
      const before1 = await textOf(s1);
      const before2 = await textOf(s2);
      let clicks = 0;
      const b1 = await t.boxOf(s1.box.id);
      await t.clickAt(b1.free.x + b1.free.w / 2, b1.free.y + b1.free.h / 2);
      clicks += 1;
      const chip = await t.chip();
      await t.dblclickAt(b1.free.x + b1.free.w / 2, b1.free.y + b1.free.h / 2);
      clicks += 2;
      await t.sleep(300);
      const open1 = await t.editing();
      const run1 = await sessionRun();
      const caret1 = run1 ? await t.caretFacts(run1).catch(() => null) : null;
      if (open1) {
        await t.press('End');
        await t.typeHuman(' a');
        await t.sleep(200);
        await t.press('Escape');
        await t.settled();
      }
      const b2 = await t.boxOf(s2.box.id);
      await t.dblclickAt(b2.free.x + b2.free.w / 2, b2.free.y + b2.free.h / 2);
      clicks += 2;
      await t.sleep(300);
      let open2 = await t.editing();
      if (!open2) {
        /* the group left the selection after Escape: one more click and the double click, the audit's count */
        await t.clickAt(b2.free.x + b2.free.w / 2, b2.free.y + b2.free.h / 2);
        clicks += 1;
        await t.dblclickAt(b2.free.x + b2.free.w / 2, b2.free.y + b2.free.h / 2);
        clicks += 2;
        await t.sleep(300);
        open2 = await t.editing();
      }
      if (open2) {
        await t.press('End');
        await t.typeHuman(' b');
        await t.sleep(200);
        await t.press('Escape');
        await t.settled();
      }
      const after1 = await textOf(s1);
      const after2 = await textOf(s2);
      const changed1 = typeof after1 === 'string' && after1 === `${before1} a`;
      const changed2 = typeof after2 === 'string' && after2 === `${before2} b`;
      if (changed2) await h.undo();
      if (changed1) await h.undo();
      return {
        ok: open1 && caret1?.inside === true && changed1 && changed2 && clicks <= 6,
        observed: `chip after one click "${chip}"; the double click opened a session ${open1} (run ${run1 ?? 'none'}, caret inside ${caret1?.inside ?? 'unread'}); label 1 "${before1}" -> "${after1}"; label 2 "${before2}" -> "${after2}" (session ${open2}); ${clicks} clicks for two labels${open1 && clicks <= 6 ? '' : ` (FEATURES.md 2.2 rank 6, ${LANE})`}`,
      };
    },
  );

  await t.step(
    'diagrams.label.tab-next',
    'open the first label; Tab; Shift+Tab; Escape twice; one click on the group; Enter',
    'Tab opens the next label with its text selected, Shift+Tab goes back, Enter on the group opens the first label',
    async () => {
      await t.clearAll();
      const list = await steps();
      if (list.length < 2) return { ok: false, observed: `${list.length} step(s) in the diagram` };
      const [s1, s2] = list;
      const run1 = await labelRun(s1);
      const run2 = await labelRun(s2);
      const b1 = await t.boxOf(s1.box.id);
      await t.clickAt(b1.free.x + b1.free.w / 2, b1.free.y + b1.free.h / 2);
      await t.dblclickAt(b1.free.x + b1.free.w / 2, b1.free.y + b1.free.h / 2);
      await t.sleep(300);
      const open = await t.editing();
      await t.press('Tab');
      await t.sleep(400);
      const afterTab = {
        editing: await t.editing(),
        run: await sessionRun(),
        selection: await t.selectionText(),
      };
      const text2 = await textOf(s2);
      await t.press('Shift+Tab');
      await t.sleep(400);
      const afterBack = { editing: await t.editing(), run: await sessionRun() };
      await t.press('Escape');
      await t.sleep(200);
      await t.press('Escape');
      await t.sleep(200);
      await t.clearAll();
      await t.clickAt(b1.free.x + b1.free.w / 2, b1.free.y + b1.free.h / 2);
      await t.sleep(250);
      const chip = await t.chip();
      await t.press('Enter');
      await t.sleep(400);
      const afterEnter = { editing: await t.editing(), run: await sessionRun() };
      await t.press('Escape');
      await t.sleep(200);
      await t.clearAll();
      const tabOk =
        afterTab.editing &&
        afterTab.run === run2 &&
        afterTab.selection.trim() === (text2 ?? '').trim() &&
        afterTab.selection.trim() !== '';
      const backOk = afterBack.editing && afterBack.run === run1;
      const enterOk = afterEnter.editing && afterEnter.run === run1;
      return {
        ok: open && tabOk && backOk && enterOk,
        observed: `label 1 open ${open} (${run1}); Tab -> session ${afterTab.editing} in ${afterTab.run ?? 'none'} (wanted ${run2}) with "${afterTab.selection}" selected; Shift+Tab -> ${afterBack.run ?? 'none'}; chip after one click "${chip}"; Enter -> session ${afterEnter.editing} in ${afterEnter.run ?? 'none'}${tabOk ? '' : ` (FEATURES.md 2.2 rank 6, ${LANE})`}`,
      };
    },
  );

  await t.step(
    'diagrams.step.one-object',
    'Insert > Diagram, Process, three steps, Insert; double click a step; drag a step; Delete on a step',
    'three shape blocks with text and no separate text block; the label opens; the box and label move together with the connector; one Delete removes the step',
    async () => {
      await t.clearAll();
      const before = await t.objectIds(S);
      await t.menuPath('insert', 'insert.diagram');
      await t.waitControl('panel.diagram', 8000);
      await t.clickControl('insert.diagram.type.process');
      await t.sleep(300);
      for (let i = 0; i < 6; i += 1) {
        const n = Number(await t.valueOf('insert.diagram.count'));
        if (n === 3 || Number.isNaN(n)) break;
        await t.clickControl(n > 3 ? 'insert.diagram.count.less' : 'insert.diagram.count.more');
        await t.sleep(200);
      }
      const count = Number(await t.valueOf('insert.diagram.count'));
      await t.clickControl('insert.diagram.insert');
      const fresh = await t
        .pollUntil(
          async () => (await t.objectsOf(S)).filter((o) => !before.includes(o.id)),
          (m) => m.length >= 3,
          15_000,
        )
        .catch(async () => (await t.objectsOf(S)).filter((o) => !before.includes(o.id)));
      await t.settled();
      if (await t.visible('panel.diagram.close')) await t.clickControl('panel.diagram.close');
      const boxes = fresh.filter((o) => o.type === 'shape' && o.block.shape !== 'line');
      const labels = fresh.filter((o) => o.type === 'text');
      const lines = fresh.filter((o) => o.type === 'shape' && o.block.shape === 'line');
      const withText = boxes.filter(
        (o) => typeof o.block.text === 'string' && o.block.text.length > 0,
      ).length;
      const oneObject = boxes.length === 3 && labels.length === 0 && withText === 3;
      const facts = [
        `${fresh.length} new objects for ${count} steps: ${boxes.length} boxes (${withText} with their own text), ${labels.length} separate labels, ${lines.length} connectors`,
      ];
      if (boxes.length === 0) return { ok: false, observed: facts.join('; ') };
      const step = boxes[1] ?? boxes[0];
      /* the label: a double click on the step */
      await t.clearAll();
      const b = await t.boxOf(step.id);
      await t.clickAt(b.free.x + b.free.w / 2, b.free.y + b.free.h / 2);
      await t.dblclickAt(b.free.x + b.free.w / 2, b.free.y + b.free.h / 2);
      await t.sleep(300);
      const opened = await t.editing();
      const run = await sessionRun();
      const ownRun = run !== null && (await t.blockOfRun(run)) === step.id;
      await t.press('Escape');
      await t.sleep(200);
      facts.push(
        `double click: session ${opened} in ${run ?? 'no run'} (the step's own ${ownRun})`,
      );
      /* the drag: the step's box and its label move together and the connector follows */
      await t.clearAll();
      const linesBefore = Object.fromEntries(
        lines.map((l) => [l.id, JSON.stringify((({ x, y, w, h }) => ({ x, y, w, h }))(l.pos))]),
      );
      const labelBefore =
        labels.find(
          (l) => Math.abs(l.pos.x - step.pos.x) < 4 && Math.abs(l.pos.y - step.pos.y) < 4,
        ) ?? null;
      await t.clickAt(b.free.x + b.free.w / 2, b.free.y + b.free.h / 2);
      await t.sleep(200);
      await t.dblclickAt(b.free.x + 6, b.free.y + 6);
      await t.sleep(200);
      if (await t.editing()) await t.press('Escape');
      const r = await t.dragInside(S, step.id, 120, 60);
      await t.settled();
      const after = await t.objectsOf(S);
      const stepAfter = after.find((o) => o.id === step.id);
      const moved =
        stepAfter &&
        r.before &&
        t.near(stepAfter.pos.x - r.before.x, 120, 8) &&
        t.near(stepAfter.pos.y - r.before.y, 60, 8);
      const labelAfter = labelBefore ? after.find((o) => o.id === labelBefore.id) : null;
      const labelWith =
        labelBefore === null
          ? true
          : Boolean(
              labelAfter &&
              Math.abs(labelAfter.pos.x - stepAfter.pos.x) < 4 &&
              Math.abs(labelAfter.pos.y - stepAfter.pos.y) < 4,
            );
      const connectorsMoved = lines.filter((l) => {
        const now = after.find((o) => o.id === l.id);
        return (
          now &&
          JSON.stringify((({ x, y, w, h }) => ({ x, y, w, h }))(now.pos)) !== linesBefore[l.id]
        );
      }).length;
      const bound = lines.filter(
        (l) => l.block.connect?.start?.block === step.id || l.block.connect?.end?.block === step.id,
      ).length;
      facts.push(
        `drag: ${t.posStr(r.before)} -> ${t.posStr(stepAfter?.pos)} (by 120,60 ${moved}); the label moved with it ${labelWith}${labelBefore ? ` (${labelBefore.id})` : ' (the step carries its own text)'}; ${connectorsMoved} of ${lines.length} connectors moved (${bound} bound to the step)`,
      );
      if (moved) await h.undo();
      /* Delete on the step */
      await t.clearAll();
      const b2 = await t.boxOf(step.id);
      await t.clickAt(b2.free.x + b2.free.w / 2, b2.free.y + b2.free.h / 2);
      await t.sleep(200);
      await t.dblclickAt(b2.free.x + 6, b2.free.y + 6);
      await t.sleep(200);
      if (await t.editing()) await t.press('Escape');
      const rev0 = (await t.state()).revision;
      await t.press('Delete');
      await t.settled();
      const gone = await t
        .pollUntil(
          async () => !(await t.objectIds(S)).includes(step.id),
          (x) => x,
          6000,
        )
        .catch(() => false);
      const rev1 = (await t.state()).revision;
      const leftovers = (await t.objectsOf(S)).filter(
        (o) => o.type === 'text' && labelBefore && o.id === labelBefore.id,
      ).length;
      facts.push(
        `Delete: the step gone ${gone} in ${rev1 - rev0} revision(s); its label left behind ${leftovers}`,
      );
      if (gone) await h.undo();
      /* the fresh diagram removed so the rows after meet the area's own (a setup write) */
      const s = await t.settled();
      for (const o of fresh)
        await t
          .invoke('block.remove', {
            baseRevision: (await t.state()).revision,
            slideId: S,
            blockId: o.id,
          })
          .catch(() => undefined);
      void s;
      await t.settled();
      return {
        ok:
          oneObject &&
          opened &&
          ownRun &&
          moved &&
          labelWith &&
          /* the connector follows (FEATURES.md 2.2 rank 9): a diagram with connectors moves at least one with the step */
          (lines.length === 0 || connectorsMoved >= 1) &&
          gone &&
          leftovers === 0,
        observed: `${facts.join('; ')}${oneObject ? '' : ` (FEATURES.md 2.2 rank 9, ${LANE})`}`,
      };
    },
  );
}
