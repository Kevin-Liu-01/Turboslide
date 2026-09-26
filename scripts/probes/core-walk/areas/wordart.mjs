// Word art (docs/RETURN.md 2.7, section 5 `wordart.*` with the driver `probe --core`): the
// entry bar and Enter, the text edited in place with its outline kept, and the light
// appearance with the show. The PDF row is core/export.spec.ts. Insert > Word art is reached in
// the default view, or with Tools > Advanced tools on while the row is still parked.

export const NAME = 'wordart';
export const IDS = [
  'wordart.insert',
  'wordart.edit',
  'wordart.light-appearance',
  /* the features round, ship one (docs/FEATURES.md 2.3 items 8 and 10, P1): the letters scale
     with the box and the tail carries Fill color and the outline controls */
  'wordart.resize.scales-letters',
  'wordart.tail.fill-outline',
];

export async function run(t) {
  const { page } = t;
  const S = await t
    .setup('a slide for the word art', 'slide.new through the window API', async () => {
      const id = await t.setupSlide(t.deck.diagramSlide ?? t.deck.titleSlide, 'blank');
      t.deck.wordArtSlide = id;
      return { ok: Boolean(id), observed: `slide ${id}` };
    })
    .then(() => t.deck.wordArtSlide);
  await t.clickCard(S);
  await t.clearAll();
  await t.reachSetup('Insert > Word art', 'insert', 'insert.wordArt');

  const block = async (id) => (await t.blockOf(S, id))?.block ?? null;
  /** The drawn text's font, weight, stroke and colour. */
  const drawn = (id) =>
    page.evaluate((blockId) => {
      const el = document.querySelector(
        `.ts-stagewrap.ts-editor .pt-slide [data-block="${blockId}"]`,
      );
      if (!el) return null;
      const text = el.matches('p, h1, h2, .text')
        ? el
        : (el.querySelector('p, h1, h2, [data-run]') ?? el);
      const cs = getComputedStyle(text);
      return {
        fontSize: parseFloat(cs.fontSize),
        weight: cs.fontWeight,
        align: cs.textAlign,
        stroke: cs.webkitTextStrokeWidth,
        strokeColor: cs.webkitTextStrokeColor,
        color: cs.color,
        text: text.textContent?.trim() ?? '',
      };
    }, id);

  let W = null;
  await t.step(
    'wordart.insert',
    'Insert > Word art, type Big words, Enter',
    'an 88 px, weight 500, centred text block with a 1.5 px ink outline',
    async () => {
      const before = await t.objectIds(S);
      await t.menuPath('insert', 'insert.wordArt');
      await t.waitControl('wordArt.bar', 8000);
      const placeholder = await t.attr('[data-control="wordArt.text"]', 'placeholder');
      await t.clickControl('wordArt.text');
      await t.typeHuman('Big words');
      await t.press('Enter');
      const obj = await t.newObjectAfter(S, before);
      await t.settled();
      W = obj?.id ?? null;
      const b = W ? await block(W) : null;
      const d = W ? await drawn(W) : null;
      return {
        ok:
          Boolean(obj) &&
          obj.type === 'text' &&
          b?.text === 'Big words' &&
          b?.typography?.size === 88 &&
          b?.typography?.weight === 500 &&
          b?.typography?.align === 'center' &&
          b?.outline?.color === 'ink' &&
          b?.outline?.width === 1.5 &&
          d !== null &&
          t.near(d.fontSize, 88, 1) &&
          String(d.weight) === '500' &&
          /1\.5/.test(d.stroke ?? ''),
        observed: obj
          ? `placeholder "${placeholder}"; ${obj.type} ${obj.id} ${t.posStr(obj.pos)}; typography ${JSON.stringify(b?.typography)} outline ${JSON.stringify(b?.outline)}; drawn font ${d?.fontSize}px weight ${d?.weight} align ${d?.align} text stroke ${d?.stroke} ${d?.strokeColor}`
          : `placeholder "${placeholder}"; nothing inserted within 20 s`,
      };
    },
  );
  if (!W) throw new (await import('../toolkit.mjs')).SetupFailed('a word art to drive');
  t.deck.wordArt = W;

  await t.step(
    'wordart.edit',
    'double click the word art, End, type, Escape',
    'the text changes and the outline stays',
    async () => {
      await t.clearAll();
      const run = (await t.runsOfBlock(W))[0];
      if (!run) return { ok: false, observed: 'no run on the word art' };
      const on = await t.openRun(run);
      await t.press('End');
      await t.typeHuman(' now');
      await t.sleep(200);
      await t.press('Escape');
      await t.settled();
      const b = await t
        .pollUntil(
          () => block(W),
          (x) => x?.text === 'Big words now',
          8000,
        )
        .catch(() => block(W));
      const d = await drawn(W);
      return {
        ok:
          on &&
          b?.text === 'Big words now' &&
          b?.outline?.width === 1.5 &&
          /1\.5/.test(d?.stroke ?? '') &&
          t.near(d?.fontSize ?? 0, 88, 1),
        observed: `session ${on}; text "${b?.text}"; outline ${JSON.stringify(b?.outline)}; drawn stroke ${d?.stroke}, font ${d?.fontSize}px`,
      };
    },
  );

  await t.step(
    'wordart.light-appearance',
    'Slide > Change theme, the light tile; read the text and its outline; then Slideshow',
    'the text and its outline read on the light sheet; the show draws it the same',
    async () => {
      await t.clearAll();
      const got = await t.pickAppearance('light');
      await t.closeThemes();
      const ground = await t.sheetGround();
      const d = await drawn(W);
      const textContrast = t.contrastOf(d?.color, ground);
      const strokeContrast = t.contrastOf(d?.strokeColor, ground);
      await t.clickControl('present.open');
      await page.locator('[data-control="present.show"]').waitFor({ timeout: 8000 });
      await t.sleep(800);
      const show = await page.evaluate((id) => {
        const sheet =
          document.querySelector('.ts-stagewrap.is-present .pt-slide:not(.is-leaving)') ??
          document.querySelector('.pt-viewer.is-present .pt-slide:not(.is-leaving)');
        const el = sheet?.querySelector(`[data-block="${id}"]`);
        const text = el?.matches('p, h1, h2, .text')
          ? el
          : (el?.querySelector('p, h1, h2, [data-run]') ?? el);
        const cs = text ? getComputedStyle(text) : null;
        return {
          drawn: el !== null,
          text: text?.textContent?.trim() ?? '',
          fontSize: cs ? parseFloat(cs.fontSize) : null,
          stroke: cs?.webkitTextStrokeWidth ?? null,
        };
      }, W);
      await t.press('Escape');
      await page
        .locator('[data-control="present.show"]')
        .waitFor({ state: 'detached', timeout: 8000 })
        .catch(() => undefined);
      const back = await t.pickAppearance('dark');
      await t.closeThemes();
      return {
        ok:
          (got.deck === 'light' || got.theme === 'light') &&
          textContrast !== null &&
          textContrast >= 3 &&
          strokeContrast !== null &&
          strokeContrast >= 3 &&
          show.drawn &&
          show.text === 'Big words now' &&
          /1\.5/.test(show.stroke ?? ''),
        observed: `appearance ${JSON.stringify(got)}; ground ${ground}; text ${d?.color} (${textContrast}:1), outline ${d?.strokeColor} ${d?.stroke} (${strokeContrast}:1); show: drawn ${show.drawn}, "${show.text}", stroke ${show.stroke}; back to ${JSON.stringify(back)}`,
      };
    },
  );
  /* the features round, ship one (docs/FEATURES.md 2.3 items 8 and 10, both P1 of B3): a se
     handle drag from the 800 by 120 box to about 1027 by 205 scales the letters with the box, and
     the tail lists Fill color and the outline controls; a control not on the build reads not built */
  await t.step(
    'wordart.resize.scales-letters',
    'select the word art; drag the se handle from 800 by 120 to 1027 by 205; Cmd+Z',
    'typography.size follows the box to about 150 and the drawn font with it; the readout shows the size; one Cmd+Z restores',
    async () => {
      await t.clearAll();
      const before = await block(W);
      const pos0 = (await t.blockOf(S, W))?.pos ?? null;
      if (pos0 && !(t.near(pos0.w, 800, 2) && t.near(pos0.h, 120, 2)))
        await t.setBlock(S, W, '/pos', { ...pos0, w: 800, h: 120 });
      await t.clearAll();
      await t.selectObject(W);
      const start = (await t.blockOf(S, W))?.pos ?? null;
      const se = await t.findHandle(W, 'resize.se');
      if (!se) return { ok: false, observed: 'no se handle on the word art' };
      const k = await t.kOf();
      const from = t.center(await t.handleRect(se));
      const during = await t.drag(
        from,
        { x: from.x + 227 * k, y: from.y + 85 * k },
        { steps: 14, during: async () => ({ readout: await t.readout() }) },
      );
      await t.settled();
      const after = await block(W);
      const pos1 = (await t.blockOf(S, W))?.pos ?? null;
      const d = await drawn(W);
      const rev0 = (await t.state()).revision;
      await t.clearAll();
      await t.press('Meta+z');
      await t.sleep(500);
      await t.settled();
      const back = await block(W);
      const pos2 = (await t.blockOf(S, W))?.pos ?? null;
      const rev1 = (await t.state()).revision;
      const sizeOk =
        typeof after?.typography?.size === 'number' && t.near(after.typography.size, 150, 12);
      const drawnOk = d !== null && t.near(d.fontSize, after?.typography?.size ?? 0, 2);
      const readoutOk = /1[3-6]\d/.test(during?.readout ?? '');
      const restored =
        back?.typography?.size === before?.typography?.size &&
        pos2 &&
        start &&
        t.near(pos2.w, start.w, 1) &&
        t.near(pos2.h, start.h, 1);
      return {
        ok: sizeOk && drawnOk && readoutOk && restored,
        observed: `${t.posStr(start)} -> ${t.posStr(pos1)}; typography.size ${before?.typography?.size} -> ${after?.typography?.size}, drawn ${d?.fontSize} px; readout during "${during?.readout ?? 'none'}"; Cmd+Z (revision ${rev0} -> ${rev1}): size ${back?.typography?.size}, box ${t.posStr(pos2)}${sizeOk ? '' : ' (FEATURES.md 2.3 item 8, B3, P1)'}`,
      };
    },
  );

  /* the objects round (docs/OBJECTS.md 4.2 item 4, ship one P1 item 10): the four shape
     controls before the text controls, each written and drawn on the letters; a tail without
     them reads not built with the parked id */
  await t.step(
    'wordart.tail.fill-outline',
    'select the word art; read the tail; Border weight 2, Border dash, Border color, Fill color, each read on the block and the letters and taken back with Cmd+Z',
    'the tail lists Fill color, Border color, Border weight and Border dash before the text controls; each pick writes its field and the letters draw it',
    async () => {
      await t.clearAll();
      await t.selectObject(W);
      const tail = await page.evaluate(() =>
        [...document.querySelectorAll('.ts-toolbar [data-control^="toolbar."]')]
          .filter((e) => e.getClientRects().length > 0)
          .map((e) => e.getAttribute('data-control')),
      );
      const want = [
        'toolbar.fillColor',
        'toolbar.borderColor',
        'toolbar.borderWeight',
        'toolbar.borderDash',
      ];
      const missing = want.filter((c) => !tail.includes(c));
      if (missing.length === want.length)
        return t.notBuilt(
          'toolbar.wordart.outline',
          'B5',
          `the word art's tail is the text tail with none of Fill color, Border color, Border weight, Border dash (docs/OBJECTS.md 4.2 item 4); tail ${tail.filter((c) => !/^toolbar\.(head|search|newSlide|undo|redo|print|paintFormat|zoom|tail|end|pointer|hideMenus)/.test(c)).join(', ')}`,
        );
      /* the four controls sit before the text controls (the font, the size, the marks) */
      const firstText = tail.findIndex((c) =>
        /^toolbar\.(font|fontSize|bold|italic|underline|textColor)$/.test(c),
      );
      const lastShape = Math.max(...want.map((c) => tail.indexOf(c)));
      const before = firstText < 0 || lastShape < firstText;
      /** Opens a tail control and picks the first new option the test accepts; the pick's id. */
      const pick = async (control, test) => {
        if (!tail.includes(control)) return { pick: null, options: [] };
        /* a control drawn aria-disabled says why in its tooltip and is read, never opened: Border
           dash while the text schema takes no dash (build/b5.md R6, R10; docs/OBJECTS.md section 7) */
        const refused = await page.evaluate(
          (c) =>
            document.querySelector(`[data-control="${c}"]`)?.getAttribute('aria-disabled') ===
            'true',
          control,
        );
        if (refused) {
          const sentence = await t.hoverControl(control);
          await t.sleep(200);
          return { pick: null, disabled: true, sentence: sentence ?? null, options: [] };
        }
        const prior = await page.evaluate(() =>
          [...document.querySelectorAll('[data-control]')].map((e) =>
            e.getAttribute('data-control'),
          ),
        );
        await t.tailControl(control);
        await t.sleep(400);
        const options = await page.evaluate(
          (seen) =>
            [...document.querySelectorAll('[data-control]')]
              .filter((e) => e.getClientRects().length > 0)
              .map((e) => ({
                id: e.getAttribute('data-control'),
                text: e.textContent?.trim() ?? '',
              }))
              .filter((o) => !seen.includes(o.id)),
          prior,
        );
        const found = options.find((o) => test(o.id, o.text)) ?? null;
        if (found) await t.clickControl(found.id);
        else if (options.length > 0) {
          /* Escape closes the plate; a second Escape would clear the selection (A1 rule 4), so the
             word art is selected again before the next control is read (build/b5.md R10) */
          await t.press('Escape');
          await t.sleep(200);
          await t.selectObject(W);
        }
        await t.settled();
        await t.sleep(300);
        return { pick: found?.id ?? null, options: options.map((o) => o.id) };
      };
      const undo = async () => {
        await t.clearAll();
        await t.press('Meta+z');
        await t.sleep(400);
        await t.settled();
        await t.selectObject(W);
      };
      const b0 = await block(W);
      const d0 = await drawn(W);
      const results = [];
      /* Border weight 2 */
      const weight = await pick(
        'toolbar.borderWeight',
        (id, text) => /(^|[.-])2(px)?$/.test(id) || /^2(\s*px)?$/.test(text),
      );
      const b1 = await block(W);
      const d1 = await drawn(W);
      results.push({
        name: 'Border weight',
        pick: weight.pick,
        wrote: b1?.outline?.width === 2 && b0?.outline?.width !== 2,
        drawn: /^2/.test(d1?.stroke ?? ''),
        value: JSON.stringify(b1?.outline),
      });
      if (results[0].wrote) await undo();
      /* Border dash: any dash but the solid one */
      const dash = await pick(
        'toolbar.borderDash',
        (id) => /dash|dot/i.test(id) && !/solid|none|plate|menu/i.test(id),
      );
      const b2 = await block(W);
      results.push({
        name: 'Border dash',
        pick: dash.pick,
        wrote: typeof b2?.outline?.dash === 'string' && b2.outline.dash !== b0?.outline?.dash,
        drawn: null,
        value: JSON.stringify(b2?.outline),
        disabled: dash.disabled === true,
        sentence: dash.sentence ?? null,
      });
      if (results[1].wrote) await undo();
      /* Border color: a token that is not the current one */
      const border = await pick(
        'toolbar.borderColor',
        (id) =>
          /^toolbar\.borderColor\.[a-z]+$/.test(id) && !/plate|none|hex|menu|kit|ink$/.test(id),
      );
      const b3 = await block(W);
      const d3 = await drawn(W);
      results.push({
        name: 'Border color',
        pick: border.pick,
        wrote: typeof b3?.outline?.color === 'string' && b3.outline.color !== b0?.outline?.color,
        drawn: d3?.strokeColor !== d0?.strokeColor,
        value: JSON.stringify(b3?.outline),
      });
      if (results[2].wrote) await undo();
      /* Fill color: the letters' colour */
      const fill = await pick(
        'toolbar.fillColor',
        (id) => /^toolbar\.fillColor\.[a-z]+$/.test(id) && !/plate|none|hex|menu|kit/.test(id),
      );
      const b4 = await block(W);
      const d4 = await drawn(W);
      results.push({
        name: 'Fill color',
        pick: fill.pick,
        wrote: typeof b4?.color === 'string' && b4.color !== b0?.color,
        drawn: d4?.color !== d0?.color,
        value: JSON.stringify(b4?.color),
      });
      if (results[3].wrote) await undo();
      const ok =
        missing.length === 0 &&
        before &&
        results.every(
          (r) =>
            (r.pick !== null && r.wrote && r.drawn !== false) ||
            (r.disabled === true && typeof r.sentence === 'string' && r.sentence.length > 0),
        );
      return {
        ok,
        observed: `tail controls ${want.filter((c) => tail.includes(c)).join(', ') || 'none'}; missing ${missing.join(', ') || 'none'}; before the text controls ${before}; ${results.map((r) => (r.disabled ? `${r.name}: disabled, "${r.sentence ?? ''}"` : `${r.name}: pick ${r.pick ?? 'none'}, wrote ${r.wrote} (${r.value})${r.drawn === null ? '' : `, drawn ${r.drawn}`}`)).join('; ')}${ok ? '' : ' (docs/OBJECTS.md 4.2 item 4, B5)'}`,
      };
    },
  );
  await t.advancedBack('the word art rows');
}
