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
  const describe = (list) => ({
    boxes: list.filter((o) => o.type === 'shape' && o.block.shape !== 'line').length,
    labels: list.filter((o) => o.type === 'text').length,
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
      const list = await t.pollUntil(members, (m) => m.length >= 14, 15_000).catch(members);
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
        observed: `${list.length} new objects (${before.length} before): ${d.boxes} boxes (${rounded} rounded), ${d.labels} labels, ${d.lines} lines; groups ${d.groups.join(', ')}; panel open ${open}`,
      };
    },
  );
  if (await t.visible('panel.diagram.close')) await t.clickControl('panel.diagram.close');
  const list0 = await members();
  const box1 = list0.find((o) => o.type === 'shape' && o.block.shape !== 'line');
  if (!box1) throw new (await import('../toolkit.mjs')).SetupFailed('a diagram to drive');
  t.deck.diagram = list0.map((o) => o.id);

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
      const label = list0.find((o) => o.type === 'text');
      if (!label) return { ok: false, observed: 'no label in the diagram' };
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
          d.boxes + d.labels + d.lines === 14,
        observed: `double click on the box: chip "${chipAfterBox}"; label session ${on} (chip "${chipInSession}"); text "${text}"; groups ${d.groups.join(', ')}, members ${d.boxes + d.labels + d.lines}`,
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
      const labels = sheet
        ? [...sheet.querySelectorAll('[data-block^="label-"]')]
            .map((e) => e.textContent?.trim())
            .filter(Boolean).length
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
          show.drawn === 14,
        observed: `appearance ${JSON.stringify(got)}; ground ${f.ground}; box strokes ${[...new Set(f.strokes)].join(',')} (${strokes}:1); lines ${[...new Set(f.lines)].join(',')} (${lines}:1); labels ${[...new Set(f.texts)].join(',')} (${texts}:1); show drew ${show.drawn} of 14 (${show.labels} labels); back to ${JSON.stringify(back)}`,
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
        ok: show.show && show.drawn === 14 && show.labels === 5 && show.svgs >= 9,
        observed: `show ${show.show}; drawn ${show.drawn} of 14; labels with text ${show.labels}; svgs ${show.svgs}`,
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
      const after = await t.pollUntil(members, (m) => m.length >= 14, 10_000).catch(members);
      const d = describe(after);
      const kept = before.every((b) => same(b.pos, after.find((o) => o.id === b.id)?.pos));
      return {
        ok: after.length === 14 && d.groups.length === 1 && kept,
        observed: `${after.length} members after the reload; groups ${d.groups.join(', ')}; positions the same ${kept}`,
      };
    },
  );
  await t.advancedBack('the diagram rows');
}
