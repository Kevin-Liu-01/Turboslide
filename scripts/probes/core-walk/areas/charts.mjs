// Charts (docs/RETURN.md 2.5, section 5 `charts.*` with the driver `probe --core`): the four
// kinds from Insert > Chart, the selection and the chart tail, the resize, Chart type from the
// panel, the tail and the menu, the data grid (Add series, Add category, a cell edit), Edit data
// from the tail and the menu, the Legend and Number format lists, the right click menu, the light
// appearance, the show and the reload. The paste into the grid is core/documents.spec.ts and the
// two export rows core/export.spec.ts. Format > Chart type and Format > Edit data are
// `contextOnly` rows of the model (model.ts 1883, 1900), so the two menu rows are driven from the
// chart's right click menu, where the Format menu's rows live, and the observed column says so.

export const NAME = 'charts';
export const IDS = [
  'charts.insert.bar',
  'charts.insert.column',
  'charts.insert.line',
  'charts.insert.pie',
  'charts.select.tail',
  'charts.resize',
  'charts.type.panel-legible',
  'charts.type.toolbar',
  'charts.type.menu',
  'charts.data.add-series-category',
  'charts.data.edit-cell',
  'charts.data.toolbar-edit-data',
  'charts.data.menu-edit-data',
  'charts.legend.toolbar',
  'charts.number-format.toolbar',
  'charts.context',
  'charts.light-appearance',
  'charts.present',
  'charts.reload',
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function run(t) {
  const { page, BASE } = t;
  const S = await t
    .setup('a slide for the charts', 'slide.new through the window API', async () => {
      const id = await t.setupSlide(t.deck.tableSlide ?? t.deck.titleSlide, 'blank');
      t.deck.chartSlide = id;
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.chartSlide);
  await t.clickCard(S);
  await t.clearAll();
  await t.reachSetup('Insert > Chart', 'insert', 'insert.chart', 'insert.chart.bar');

  const block = async (id) => (await t.blockOf(S, id))?.block ?? null;
  const posOf = async (id) => (await t.blockOf(S, id))?.pos ?? null;
  /** The svg facts of a chart on the stage. */
  const svgFacts = (id) =>
    page.evaluate((blockId) => {
      const inner = document.querySelector(
        `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`,
      );
      const svg = inner?.tagName.toLowerCase() === 'svg' ? inner : inner?.querySelector('svg');
      if (!svg) return null;
      const box = (inner.closest('.free') ?? inner).getBoundingClientRect();
      const s = svg.getBoundingClientRect();
      const texts = [...svg.querySelectorAll('text')].map((e) => e.textContent?.trim() ?? '');
      const legend = svg.querySelector('.legend');
      const firstRect = svg.querySelector('.series rect, .series path');
      const axis = svg.querySelector('line.ink, line.hair');
      return {
        kind: svg.getAttribute('data-chart'),
        rects: svg.querySelectorAll('rect').length,
        seriesRects: svg.querySelectorAll('.series rect').length,
        lines: svg.querySelectorAll('line').length,
        paths: svg.querySelectorAll('path').length,
        seriesPaths: svg.querySelectorAll('path.series').length,
        slices: svg.querySelectorAll('.slices path').length,
        circles: svg.querySelectorAll('circle').length,
        texts: texts.length,
        textList: texts.slice(0, 12),
        legendTexts: legend ? legend.querySelectorAll('text').length : 0,
        legendBox: legend
          ? (() => {
              const r = legend.getBoundingClientRect();
              return { x: Math.round(r.x), y: Math.round(r.y) };
            })()
          : null,
        barWidths: [...svg.querySelectorAll('.series rect')].map((r) =>
          Number(r.getAttribute('width')),
        ),
        barHeights: [...svg.querySelectorAll('.series rect')].map((r) =>
          Number(r.getAttribute('height')),
        ),
        svg: { w: Math.round(s.width), h: Math.round(s.height) },
        box: { w: Math.round(box.width), h: Math.round(box.height) },
        fill: firstRect ? getComputedStyle(firstRect).fill : null,
        axisStroke: axis ? getComputedStyle(axis).stroke : null,
        textColor: svg.querySelector('text')
          ? getComputedStyle(svg.querySelector('text')).fill
          : null,
      };
    }, id);
  const undo = async () => {
    await t.press('Meta+z');
    await t.sleep(500);
    await t.settled();
  };
  const insertChart = async (kind) => {
    const before = await t.objectIds(S);
    await t.menuPath('insert', 'insert.chart', `insert.chart.${kind}`);
    const obj = await t.newObjectAfter(S, before);
    await t.settled();
    return obj;
  };
  /** Moves a block through the window API (a setup write) so the charts do not overlap. */
  const park = async (id, pos) => {
    await t.setBlock(S, id, '/pos', pos);
  };

  const charts = {};
  await t.step(
    'charts.insert.bar',
    'Insert > Chart > Bar',
    'a 960 by 540 chart with three categories and one series draws 4 rects, 6 axis lines, the tick, category and legend text',
    async () => {
      const obj = await insertChart('bar');
      charts.bar = obj?.id ?? null;
      const b = obj ? await block(obj.id) : null;
      const f = obj ? await svgFacts(obj.id) : null;
      return {
        ok:
          Boolean(obj) &&
          obj.type === 'chart' &&
          b?.kind === 'bar' &&
          t.near(obj.pos.w, 960, 2) &&
          t.near(obj.pos.h, 540, 2) &&
          b?.categories?.length === 3 &&
          b?.series?.length === 1 &&
          f?.rects === 4 &&
          f?.lines === 6 &&
          f?.texts >= 5 &&
          f?.legendTexts >= 1,
        observed: obj
          ? `${obj.type} ${obj.id} ${t.posStr(obj.pos)} kind ${b?.kind}, ${b?.categories?.length} categories, ${b?.series?.length} series; svg rects ${f?.rects}, lines ${f?.lines}, texts ${f?.texts} (${f?.textList.join(' | ')}), legend texts ${f?.legendTexts}`
          : 'nothing inserted within 20 s',
      };
    },
  );
  if (!charts.bar) throw new (await import('../toolkit.mjs')).SetupFailed('a bar chart to drive');
  const C = charts.bar;
  t.deck.chart = C;
  await park(C, { x: 60, y: 120, w: 720, h: 400 });

  for (const [kind, check, want] of [
    [
      'column',
      (f) => f.seriesRects === 3 && f.lines >= 4 && f.texts >= 5 && f.legendTexts >= 1,
      'its columns, axes, labels and legend',
    ],
    [
      'line',
      (f) =>
        f.seriesPaths >= 1 && f.circles >= 3 && f.lines >= 4 && f.texts >= 5 && f.legendTexts >= 1,
      'its path, three points, axes, labels and legend',
    ],
    ['pie', (f) => f.slices === 3 && f.legendTexts >= 1, 'three slices and the legend'],
  ]) {
    await t.step(
      `charts.insert.${kind}`,
      `Insert > Chart > ${kind[0].toUpperCase()}${kind.slice(1)}`,
      `draws ${want}`,
      async () => {
        const obj = await insertChart(kind);
        charts[kind] = obj?.id ?? null;
        const b = obj ? await block(obj.id) : null;
        const f = obj ? await svgFacts(obj.id) : null;
        if (obj) {
          const spot = {
            column: { x: 820, y: 120, w: 720, h: 360 },
            line: { x: 60, y: 560, w: 720, h: 300 },
            pie: { x: 820, y: 520, w: 720, h: 340 },
          }[kind];
          await park(obj.id, spot);
        }
        return {
          ok: Boolean(obj) && b?.kind === kind && f !== null && check(f),
          observed: obj
            ? `${obj.id} kind ${b?.kind}; svg data-chart ${f?.kind}; series rects ${f?.seriesRects}, series paths ${f?.seriesPaths}, circles ${f?.circles}, slices ${f?.slices}, lines ${f?.lines}, texts ${f?.texts}, legend texts ${f?.legendTexts}`
            : 'nothing inserted within 20 s',
        };
      },
    );
  }

  await t.step(
    'charts.select.tail',
    'one click on the bar chart',
    'chip Chart and eight handles; the tail reads Chart type, Legend, Number format, Edit data, Format options',
    async () => {
      await t.clearAll();
      const { facts } = await t.clickSelect(C);
      const tail = await page.evaluate(() =>
        [...document.querySelectorAll('.ts-toolbar [data-control^="toolbar."]')]
          .filter((e) => e.getClientRects().length > 0)
          .map((e) => e.getAttribute('data-control')),
      );
      const want = [
        'toolbar.chartType',
        'toolbar.legend',
        'toolbar.numberFormat',
        'toolbar.editData',
        'toolbar.formatOptions',
      ];
      const missing = want.filter((c) => !tail.includes(c));
      return {
        ok:
          facts.selected &&
          facts.resize === 8 &&
          facts.chip === 'Chart' &&
          !facts.editing &&
          missing.length === 0,
        observed: `${t.describeSelection(facts)}; tail ${tail.filter((c) => !/^toolbar\.(head|search|newSlide|undo|redo|print|paintFormat|zoom|tail|end|pointer|hideMenus)/.test(c)).join(', ')}; missing ${missing.join(', ') || 'none'}`,
      };
    },
  );

  await t.step(
    'charts.resize',
    'drag the se handle by 100,60; Undo',
    'the svg follows the box; Undo restores',
    async () => {
      await t.clearAll();
      await t.selectObject(C);
      const before = await posOf(C);
      const se = await t.findHandle(C, 'resize.se');
      if (!se) return { ok: false, observed: 'no se handle' };
      const k = await t.kOf();
      const from = t.center(await t.handleRect(se));
      await t.drag(from, { x: from.x + 100 * k, y: from.y + 60 * k });
      const after = await t
        .pollUntil(
          () => posOf(C),
          (p) => p && !same(p, before),
          8000,
        )
        .catch(() => posOf(C));
      await t.settled();
      const f = await svgFacts(C);
      const follows = f && Math.abs(f.svg.w - f.box.w) <= 2 && Math.abs(f.svg.h - f.box.h) <= 2;
      await undo();
      const back = await posOf(C);
      return {
        ok:
          t.near(after.w - before.w, 100, 8) &&
          t.near(after.h - before.h, 60, 8) &&
          follows &&
          same(back, before),
        observed: `${t.posStr(before)} -> ${t.posStr(after)}; svg ${f?.svg.w}x${f?.svg.h} in a box of ${f?.box.w}x${f?.box.h}; undo restored ${same(back, before)}`,
      };
    },
  );

  const openPanel = async () => {
    await t.clearAll();
    await t.selectObject(C);
    if (!(await t.visible('panel.formatOptions'))) {
      await t.tailControl('toolbar.formatOptions');
      await t.waitControl('panel.formatOptions', 8000);
    }
    await t.waitControl('formatOptions.chart', 8000);
  };
  const closePanel = async () => {
    if (await t.visible('panel.formatOptions.close'))
      await t.clickControl('panel.formatOptions.close');
    await t.sleep(200);
  };
  /** The segment labels of the Chart type control and whether each fits its segment. */
  const segments = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-control^="formatOptions.chart.type."]')].map((el) => {
        const label = el.querySelector('span, .pt-lb') ?? el;
        const r = label.getBoundingClientRect();
        return {
          id: el.getAttribute('data-control'),
          text: el.textContent?.trim() ?? '',
          segment: Math.round(el.getBoundingClientRect().width),
          label: Math.round(r.width),
          clipped: el.scrollWidth > el.clientWidth + 1 || label.scrollWidth > label.clientWidth + 1,
        };
      }),
    );
  const kindOf = async () => (await block(C))?.kind;
  const kindDrawn = async () => (await svgFacts(C))?.kind;

  await t.step(
    'charts.type.panel-legible',
    'Format options > Chart type: Column, then Pie, then Bar again',
    'each writes the kind and redraws; every segment label fits its segment',
    async () => {
      await openPanel();
      const segs = await segments();
      const clipped = segs.filter((s) => s.clipped || s.label > s.segment);
      const facts = [];
      let ok = clipped.length === 0 && segs.length === 4;
      for (const kind of ['column', 'pie', 'bar']) {
        await t.clickControl(`formatOptions.chart.type.${kind}`);
        const stored = await t.pollUntil(kindOf, (k) => k === kind, 8000).catch(kindOf);
        const drawn = await t.pollUntil(kindDrawn, (k) => k === kind, 8000).catch(kindDrawn);
        await t.settled();
        const f = await svgFacts(C);
        const redrawn = kind === 'pie' ? f?.slices === 3 : f?.seriesRects === 3;
        ok = ok && stored === kind && drawn === kind && redrawn;
        facts.push(
          `${kind}: stored ${stored}, drawn ${drawn}, marks ${kind === 'pie' ? `${f?.slices} slices` : `${f?.seriesRects} rects`}`,
        );
      }
      await closePanel();
      return {
        ok,
        observed: `segments ${segs.map((s) => `${s.text} ${s.label}/${s.segment}${s.clipped ? ' clipped' : ''}`).join(', ')}; ${facts.join('; ')}`,
      };
    },
  );

  /** Opens a tail list and picks the option whose id or label matches; answers what was picked. */
  const pickTailOption = async (control, test) => {
    const before = await page.evaluate(() =>
      [...document.querySelectorAll('[data-control]')].map((e) => e.getAttribute('data-control')),
    );
    await t.tailControl(control);
    await t.sleep(400);
    const options = await page.evaluate(
      (prior) =>
        [...document.querySelectorAll('[data-control]')]
          .filter((e) => e.getClientRects().length > 0)
          .map((e) => ({ id: e.getAttribute('data-control'), text: e.textContent?.trim() ?? '' }))
          .filter((o) => !prior.includes(o.id)),
      before,
    );
    const pick = options.find((o) => test(o.id, o.text));
    if (pick) await t.clickControl(pick.id);
    else await t.press('Escape');
    return { pick: pick?.id ?? null, options: options.map((o) => o.id) };
  };

  await t.step(
    'charts.type.toolbar',
    "the tail's Chart type list, Line; then Bar again",
    'the kind writes and redraws',
    async () => {
      await t.clearAll();
      await t.selectObject(C);
      const a = await pickTailOption(
        'toolbar.chartType',
        (id, text) => /\.line$/.test(id) || /^Line$/.test(text),
      );
      const stored = await t.pollUntil(kindOf, (k) => k === 'line', 8000).catch(kindOf);
      const drawn = await kindDrawn();
      const f = await svgFacts(C);
      await t.settled();
      await t.selectObject(C);
      const b = await pickTailOption(
        'toolbar.chartType',
        (id, text) => /\.bar$/.test(id) || /^Bar$/.test(text),
      );
      const back = await t.pollUntil(kindOf, (k) => k === 'bar', 8000).catch(kindOf);
      await t.settled();
      return {
        ok:
          a.pick !== null &&
          stored === 'line' &&
          drawn === 'line' &&
          f?.seriesPaths >= 1 &&
          back === 'bar',
        observed: `options ${a.options.join(', ')}; picked ${a.pick}: stored ${stored}, drawn ${drawn}, series paths ${f?.seriesPaths}; back to bar by ${b.pick}: ${back}`,
      };
    },
  );

  /** Right clicks the chart and walks a submenu row of its menu. */
  const contextSubmenu = async (parent, child) => {
    await t.clearAll();
    await t.selectObject(C);
    const b = await t.boxOf(C);
    const c = t.center(b.free);
    const opened = await t.rightClickAt(c.x, c.y);
    const rows = (await t.contextRows()).map((r) => r.id);
    if (!rows.includes(parent)) {
      await t.press('Escape');
      return { opened, rows, picked: false };
    }
    await t.hoverContextRow(parent, `[data-control="menu.${child}"]`);
    await t.clickRow(child);
    await t.sleep(300);
    return { opened, rows, picked: true };
  };

  await t.step(
    'charts.type.menu',
    "Format > Chart type > Line, then Bar (the row is contextOnly in model.ts: from the chart's right click menu); Cmd+Z each",
    'the kind writes and redraws each time; each Cmd+Z takes it back',
    async () => {
      const inBar = await t.menuRowPresent('format', 'format.chartType');
      const a = await contextSubmenu('format.chartType', 'format.chartType.line');
      const line = await t.pollUntil(kindOf, (k) => k === 'line', 8000).catch(kindOf);
      const lineDrawn = await kindDrawn();
      await t.settled();
      await undo();
      const undone1 = await kindOf();
      const b = await contextSubmenu('format.chartType', 'format.chartType.column');
      const column = await t.pollUntil(kindOf, (k) => k === 'column', 8000).catch(kindOf);
      await t.settled();
      await undo();
      const undone2 = await kindOf();
      return {
        ok:
          a.picked &&
          line === 'line' &&
          lineDrawn === 'line' &&
          undone1 === 'bar' &&
          b.picked &&
          column === 'column' &&
          undone2 === 'bar',
        observed: `Format menu carries Chart type ${inBar} (contextOnly in model.ts 1900); right click rows ${a.rows.join(', ')}; Line: ${line} (drawn ${lineDrawn}), Cmd+Z ${undone1}; Column: ${column}, Cmd+Z ${undone2}`,
      };
    },
  );

  await t.step(
    'charts.data.add-series-category',
    'Format options > Add series, Add category',
    'every series stays as long as the categories',
    async () => {
      await openPanel();
      const b0 = await block(C);
      await t.clickControl('formatOptions.chart.addSeries');
      const b1 = await t
        .pollUntil(
          () => block(C),
          (b) => b?.series?.length === b0.series.length + 1,
          8000,
        )
        .catch(() => block(C));
      await t.settled();
      await t.clickControl('formatOptions.chart.addCategory');
      const b2 = await t
        .pollUntil(
          () => block(C),
          (b) => b?.categories?.length === b0.categories.length + 1,
          8000,
        )
        .catch(() => block(C));
      await t.settled();
      const lengths = b2?.series?.map((s) => s.values.length) ?? [];
      await closePanel();
      return {
        ok:
          b1?.series?.length === b0.series.length + 1 &&
          b2?.categories?.length === b0.categories.length + 1 &&
          lengths.every((n) => n === b2.categories.length),
        observed: `series ${b0.series.length} -> ${b1?.series?.length}; categories ${b0.categories.length} -> ${b2?.categories?.length}; values per series ${lengths.join(',')}`,
      };
    },
  );

  await t.step(
    'charts.data.edit-cell',
    'Chart data with the grid in view: click a value, Enter, type 42, Enter; double click the next, type 7, Enter',
    'the values write and the bars redraw',
    async () => {
      await openPanel();
      await page.locator('[data-control="formatOptions.chart.grid"]').scrollIntoViewIfNeeded();
      await t.sleep(300);
      const f0 = await svgFacts(C);
      const b0 = await block(C);
      await t.clickControl('formatOptions.chart.cell.1.1');
      await t.sleep(200);
      await t.press('Enter');
      const input1 = await t.has('[data-control="formatOptions.chart.edit"]');
      await t.press('Meta+a');
      await t.typeHuman('42');
      await t.press('Enter');
      const b1 = await t
        .pollUntil(
          () => block(C),
          (b) => b?.series?.[0]?.values?.[0] === 42,
          8000,
        )
        .catch(() => block(C));
      await t.settled();
      const cell = await t.rectOf('[data-control="formatOptions.chart.cell.2.1"]');
      await t.dblclickAt(cell.x + cell.w / 2, cell.y + cell.h / 2);
      await t.sleep(200);
      const input2 = await t.has('[data-control="formatOptions.chart.edit"]');
      await t.press('Meta+a');
      await t.typeHuman('7');
      await t.press('Enter');
      const b2 = await t
        .pollUntil(
          () => block(C),
          (b) => b?.series?.[0]?.values?.[1] === 7,
          8000,
        )
        .catch(() => block(C));
      await t.settled();
      const f1 = await svgFacts(C);
      const redrawn = !same(f0?.barWidths, f1?.barWidths) || !same(f0?.barHeights, f1?.barHeights);
      await closePanel();
      return {
        ok:
          input1 &&
          b1?.series?.[0]?.values?.[0] === 42 &&
          input2 &&
          b2?.series?.[0]?.values?.[1] === 7 &&
          redrawn,
        observed: `values ${JSON.stringify(b0?.series?.[0]?.values)} -> ${JSON.stringify(b2?.series?.[0]?.values)}; Enter opened the input ${input1}, the double click ${input2}; bars ${JSON.stringify(f0?.barWidths)} -> ${JSON.stringify(f1?.barWidths)}`,
      };
    },
  );

  /** Whether the Format options panel shows the Chart data grid inside its own scroll box. */
  const gridInView = () =>
    page.evaluate(() => {
      const panel = document.querySelector('[data-control="panel.formatOptions"]');
      const grid = document.querySelector('[data-control="formatOptions.chart.grid"]');
      if (!panel || !grid) return { panel: panel !== null, grid: grid !== null, inView: false };
      const p = panel.getBoundingClientRect();
      const g = grid.getBoundingClientRect();
      return {
        panel: true,
        grid: true,
        inView: g.top >= p.top - 2 && g.top < p.bottom - 40,
        gridTop: Math.round(g.top),
        panelBottom: Math.round(p.bottom),
      };
    });

  await t.step(
    'charts.data.toolbar-edit-data',
    "the tail's Edit data",
    'Format options opens scrolled to Chart data with the grid in view',
    async () => {
      await closePanel();
      await t.clearAll();
      await t.selectObject(C);
      await t.tailControl('toolbar.editData');
      await t.waitControl('panel.formatOptions', 8000).catch(() => undefined);
      await t.sleep(600);
      const facts = await gridInView();
      await closePanel();
      return { ok: facts.panel && facts.grid && facts.inView, observed: JSON.stringify(facts) };
    },
  );

  await t.step(
    'charts.data.menu-edit-data',
    "Format > Edit data (contextOnly in model.ts: from the chart's right click menu)",
    'Format options opens scrolled to Chart data with the grid in view',
    async () => {
      await closePanel();
      const inBar = await t.menuRowPresent('format', 'format.editData');
      await t.clearAll();
      await t.selectObject(C);
      const b = await t.boxOf(C);
      const c = t.center(b.free);
      await t.rightClickAt(c.x, c.y);
      const rows = (await t.contextRows()).map((r) => r.id);
      let picked = false;
      if (rows.includes('format.editData')) {
        await t.clickContextRow('format.editData');
        picked = true;
      } else await t.press('Escape');
      await t.waitControl('panel.formatOptions', 8000).catch(() => undefined);
      await t.sleep(600);
      const facts = await gridInView();
      await closePanel();
      return {
        ok: picked && facts.panel && facts.grid && facts.inView,
        observed: `Format menu carries Edit data ${inBar} (contextOnly in model.ts 1883); right click row picked ${picked}; ${JSON.stringify(facts)}`,
      };
    },
  );

  await t.step(
    'charts.legend.toolbar',
    "the tail's Legend list, another position",
    'the legend moves and the svg redraws',
    async () => {
      await t.clearAll();
      await t.selectObject(C);
      const before = await svgFacts(C);
      const legend0 = (await block(C))?.legend ?? 'none';
      /* a position other than the stored one and other than right, where an unset legend
         already draws (the first run of this driver picked right after none and the legend did
         not move) */
      const { pick, options } = await pickTailOption(
        'toolbar.legend',
        (id, text) =>
          !new RegExp(`\\.${legend0}$`).test(id) && !/(none|right)$/i.test(id) && text !== '',
      );
      const after = await t
        .pollUntil(
          () => block(C),
          (b) => (b?.legend ?? 'none') !== legend0,
          8000,
        )
        .catch(() => block(C));
      await t.settled();
      const f = await svgFacts(C);
      const moved =
        Boolean(before?.legendBox && f?.legendBox) && !same(before.legendBox, f.legendBox);
      await undo();
      return {
        ok: pick !== null && (after?.legend ?? 'none') !== legend0 && moved,
        observed: `options ${options.join(', ')}; picked ${pick}; legend ${legend0} -> ${after?.legend ?? 'none'}; legend box ${JSON.stringify(before?.legendBox)} -> ${JSON.stringify(f?.legendBox)}`,
      };
    },
  );

  await t.step(
    'charts.number-format.toolbar',
    "the tail's Number format list, Percent",
    'the tick labels change',
    async () => {
      await t.clearAll();
      await t.selectObject(C);
      const before = await svgFacts(C);
      const { pick, options } = await pickTailOption(
        'toolbar.numberFormat',
        (id, text) => /percent$/i.test(id) || /^Percent/.test(text),
      );
      const after = await t
        .pollUntil(
          () => block(C),
          (b) => b?.numberFormat !== undefined,
          8000,
        )
        .catch(() => block(C));
      await t.settled();
      const f = await svgFacts(C);
      const changed = !same(before?.textList, f?.textList);
      await undo();
      return {
        ok: pick !== null && after?.numberFormat !== undefined && changed,
        observed: `options ${options.join(', ')}; picked ${pick}; numberFormat ${after?.numberFormat}; texts ${before?.textList.join('|')} -> ${f?.textList.join('|')}`,
      };
    },
  );

  await t.step(
    'charts.context',
    'right click the chart',
    'the rows list Edit data, Chart type and Format options',
    async () => {
      await t.clearAll();
      await t.selectObject(C);
      const b = await t.boxOf(C);
      const c = t.center(b.free);
      const opened = await t.rightClickAt(c.x, c.y);
      const rows = (await t.contextRows()).map((r) => r.id);
      await t.press('Escape');
      const want = ['format.editData', 'format.chartType', 'format.formatOptions'];
      const missing = want.filter((r) => !rows.includes(r));
      return {
        ok: opened && missing.length === 0,
        observed: `rows ${rows.join(', ')}; missing ${missing.join(', ') || 'none'}`,
      };
    },
  );

  /** The bars the bar chart draws: one rect per series and category. */
  const barsOf = async () => {
    const b = await block(C);
    return (b?.series?.length ?? 0) * (b?.categories?.length ?? 0);
  };
  const showFacts = (kind) =>
    page.evaluate((k) => {
      const show = document.querySelector('[data-control="present.show"]');
      const sheet =
        document.querySelector('.ts-stagewrap.is-present .pt-slide:not(.is-leaving)') ??
        document.querySelector('.pt-viewer.is-present .pt-slide:not(.is-leaving)');
      const svg =
        sheet?.querySelector(`svg[data-chart="${k}"]`) ?? sheet?.querySelector('svg.chart');
      return {
        show: show !== null,
        charts: sheet ? sheet.querySelectorAll('svg.chart, svg[data-chart]').length : 0,
        rects: svg ? svg.querySelectorAll('.series rect').length : 0,
        texts: svg ? svg.querySelectorAll('text').length : 0,
      };
    }, kind);
  const leaveShow = async () => {
    await t.press('Escape');
    await page
      .locator('[data-control="present.show"]')
      .waitFor({ state: 'detached', timeout: 8000 })
      .catch(() => undefined);
    await t.sleep(300);
  };

  await t.step(
    'charts.light-appearance',
    'Slide > Change theme, the light tile; read the bar chart; then Slideshow',
    'the bars, the axis lines and the text read on the light sheet; the show draws it the same',
    async () => {
      await t.clearAll();
      const got = await t.pickAppearance('light');
      await t.closeThemes();
      const ground = await t.sheetGround();
      const f = await svgFacts(C);
      const barContrast = t.contrastOf(f?.fill, ground);
      const axisContrast = t.contrastOf(f?.axisStroke, ground);
      const textContrast = t.contrastOf(f?.textColor, ground);
      const bars = await barsOf();
      await t.clickControl('present.open');
      await page.locator('[data-control="present.show"]').waitFor({ timeout: 8000 });
      await t.sleep(800);
      const show = await showFacts('bar');
      await leaveShow();
      const back = await t.pickAppearance('dark');
      await t.closeThemes();
      return {
        ok:
          (got.deck === 'light' || got.theme === 'light') &&
          barContrast !== null &&
          barContrast >= 1.5 &&
          axisContrast !== null &&
          axisContrast >= 1.3 &&
          textContrast !== null &&
          textContrast >= 3 &&
          show.show &&
          show.rects === bars &&
          show.texts >= 5,
        observed: `appearance ${JSON.stringify(got)}; ground ${ground}; bars ${f?.fill} (${barContrast}:1), axis ${f?.axisStroke} (${axisContrast}:1), text ${f?.textColor} (${textContrast}:1); show: ${show.charts} charts, bar rects ${show.rects}, texts ${show.texts}; back to ${JSON.stringify(back)}`,
      };
    },
  );

  await t.step(
    'charts.present',
    'Slideshow from the slide before, ArrowRight to the chart slide',
    'the show draws the bars and the axis text',
    async () => {
      const order = await t.slideOrder();
      const i = order.indexOf(S);
      const prev = order[Math.max(0, i - 1)];
      await t.clickCard(prev);
      await t.clearAll();
      await t.clickControl('present.open');
      await page.locator('[data-control="present.show"]').waitFor({ timeout: 8000 });
      await t.sleep(600);
      if (prev !== S) {
        await t.press('ArrowRight');
        await t.sleep(900);
      }
      const bars = await barsOf();
      const show = await t
        .pollUntil(
          () => showFacts('bar'),
          (f) => f.rects === bars,
          6000,
        )
        .catch(() => showFacts('bar'));
      await leaveShow();
      await t.clickCard(S);
      return {
        ok: show.show && show.rects === bars && bars > 0 && show.texts >= 5,
        observed: `from ${prev} then ArrowRight ${prev !== S}; charts on the sheet ${show.charts}; bar rects ${show.rects}; texts ${show.texts}`,
      };
    },
  );

  await t.step(
    'charts.reload',
    'reload /edit/<id>#s/<chart slide>',
    'every chart survives',
    async () => {
      const ids = Object.values(charts).filter(Boolean);
      const before = {};
      for (const id of ids) before[id] = JSON.stringify(await block(id));
      await t.reloadTo(`${BASE}/edit/${t.deck.id}#s/${S}`);
      await t.settled();
      const after = {};
      const drawn = {};
      for (const id of ids) {
        after[id] = await t
          .pollUntil(
            async () => JSON.stringify(await block(id)),
            (x) => x !== 'null',
            10_000,
          )
          .catch(async () => JSON.stringify(await block(id)));
        drawn[id] = (await svgFacts(id))?.kind ?? null;
      }
      const kept = ids.filter((id) => before[id] === after[id]);
      return {
        ok: ids.length === 4 && kept.length === ids.length && Object.values(drawn).every(Boolean),
        observed: `${ids.length} charts; the same after the reload ${kept.length}; drawn kinds ${JSON.stringify(drawn)}`,
      };
    },
  );
  await t.advancedBack('the charts rows');
}
