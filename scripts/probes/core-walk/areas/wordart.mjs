// Word art (docs/RETURN.md 2.7, section 5 `wordart.*` with the driver `probe --core`): the
// entry bar and Enter, the text edited in place with its outline kept, and the light
// appearance with the show. The PDF row is core/export.spec.ts. Insert > Word art is reached in
// the default view, or with Tools > Advanced tools on while the row is still parked.

export const NAME = 'wordart';
export const IDS = ['wordart.insert', 'wordart.edit', 'wordart.light-appearance'];

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
  await t.advancedBack('the word art rows');
}
