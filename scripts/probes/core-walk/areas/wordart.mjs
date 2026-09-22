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

  await t.step(
    'wordart.tail.fill-outline',
    'select the word art; read the tail; Border weight 2',
    'the tail lists Fill color, Border color, Border weight and Border dash; the weight writes the outline',
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
          'B3',
          `the word art's tail is the text tail with none of Fill color, Border color, Border weight, Border dash (P1, FEATURES.md 2.3 item 10); tail ${tail.filter((c) => !/^toolbar\.(head|search|newSlide|undo|redo|print|paintFormat|zoom|tail|end|pointer|hideMenus)/.test(c)).join(', ')}`,
        );
      const before = await block(W);
      let picked = null;
      if (tail.includes('toolbar.borderWeight')) {
        const options = [];
        await t.tailControl('toolbar.borderWeight');
        await t.sleep(400);
        const pick = await page.evaluate(
          () =>
            [
              ...document.querySelectorAll(
                '[data-control^="menu.toolbar.borderWeight."], [data-control^="toolbar.borderWeight."]',
              ),
            ]
              .filter((e) => e.getClientRects().length > 0)
              .map((e) => ({
                id: e.getAttribute('data-control'),
                text: e.textContent?.trim() ?? '',
              }))
              .find((o) => /(^|[.-])2(px)?$/.test(o.id) || /^2(\s*px)?$/.test(o.text)) ?? null,
        );
        if (pick) {
          await t.clickControl(pick.id);
          picked = pick.id;
        } else await t.press('Escape');
        void options;
      }
      await t.settled();
      const after = await t
        .pollUntil(
          () => block(W),
          (b) => b?.outline?.width === 2,
          6000,
        )
        .catch(() => block(W));
      const d = await drawn(W);
      if (after?.outline?.width === 2 && before?.outline?.width !== 2) {
        await t.clearAll();
        await t.press('Meta+z');
        await t.sleep(400);
        await t.settled();
      }
      return {
        ok:
          missing.length === 0 &&
          picked !== null &&
          after?.outline?.width === 2 &&
          /^2/.test(d?.stroke ?? ''),
        observed: `tail controls ${want.filter((c) => tail.includes(c)).join(', ') || 'none'}; missing ${missing.join(', ') || 'none'}; Border weight pick ${picked ?? 'none'}: outline ${JSON.stringify(before?.outline)} -> ${JSON.stringify(after?.outline)}, drawn stroke ${d?.stroke}`,
      };
    },
  );
  await t.advancedBack('the word art rows');
}
