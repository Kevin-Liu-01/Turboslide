// The fix round's alt text drive (VERIFICATION.md "Product round, pass 1" finding 15,
// formatting.alt-text.write-undo on the memory tier): a text box formatted the way the walk's
// box is (weight 700, size 32, colour red, a highlight), the description written in Format
// options > Alt text with Tab, then the Editable text export requested at once and again after
// the room's idle checkpoint (2 s). The `descr` of the light file is read both times, so the run
// tells a stale store read from a rendering fault. A plain box takes the same two exports.
import { inflateRawSync } from 'node:zlib';

import { launch, bind, sleep, BASE } from './lib.mjs';

const { browser, page } = await launch();
const t = bind(page, 'drive-fix-alt');

/** The central directory of a zip as a map of entry name to a reader (the toolkit's reader). */
function zipEntries(bytes) {
  const out = new Map();
  const eocd = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return out;
  const count = bytes.readUInt16LE(eocd + 10);
  let offset = bytes.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) break;
    const method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    out.set(name, (raw = false) => {
      const localName = bytes.readUInt16LE(local + 26);
      const localExtra = bytes.readUInt16LE(local + 28);
      const start = local + 30 + localName + localExtra;
      const data = bytes.subarray(start, start + compressed);
      const inflated = method === 8 ? inflateRawSync(data) : data;
      return raw ? inflated : inflated.toString('utf8');
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

/** The Editable text export in one request; answers the status, the time and whether the light file carries the descr. */
async function exportDescr(deckId, alt) {
  const t0 = Date.now();
  const res = await page.request.post(`${BASE}/api/export/${deckId}?sync=1`, {
    headers: { 'content-type': 'application/json' },
    data: { format: 'pptx', mode: 'native' },
    timeout: 240_000,
    maxRedirects: 0,
  });
  const ms = Date.now() - t0;
  if (res.status() !== 200) return { status: res.status(), ms, descr: null, shapes: null };
  let entries = zipEntries(await res.body());
  const inner =
    [...entries.keys()].find((n) => /\(light, editable\)\.pptx$/.test(n)) ??
    [...entries.keys()].find((n) => /\.pptx$/.test(n));
  if (inner !== undefined) entries = zipEntries(entries.get(inner)(true));
  const slides = [...entries.keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  const xml = slides.map((n) => entries.get(n)()).join('\n');
  const descr = new RegExp(`descr="${alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(xml);
  const shapes = [...xml.matchAll(/<p:cNvPr\b([^>]*)>/g)]
    .map((m) => m[1])
    .filter((a) => /name="ts:/.test(a));
  return {
    status: 200,
    ms,
    descr,
    shapes: shapes.length,
    named: shapes.filter((a) => /descr=/.test(a)).length,
  };
}

/** Writes the description through Format options > Alt text with Tab, polls the block's alt, and exports at once and after the idle checkpoint. */
async function writeAndExport(deckId, S, id, alt) {
  await t.clearAll();
  await t.selectObject(id);
  await t.clickControl('toolbar.formatOptions');
  await t.ctl('panel.formatOptions').first().waitFor({ timeout: 6000 });
  const sec = page.locator('[data-control="panel.formatOptions"] [data-section="altText"]');
  if (
    !(await sec
      .first()
      .isVisible()
      .catch(() => false))
  )
    return { ok: false, observed: 'no Alt text section in Format options' };
  if (await sec.evaluate((el) => el.classList.contains('is-closed')).catch(() => false))
    await sec.locator('.ts-panel-section-head').click();
  const field = page.locator('[data-control="formatOptions.altText.description"]').first();
  await field.scrollIntoViewIfNeeded().catch(() => undefined);
  await field.click();
  await t.press('Meta+a');
  await t.typeHuman(alt);
  await t.press('Tab');
  const tabAt = Date.now();
  const altOf = async () => (await t.blockOf(S, id))?.block?.alt ?? null;
  const written = await t.pollUntil(altOf, (v) => v === alt, 8000).catch(altOf);
  const writtenMs = Date.now() - tabAt;
  await t.settled();
  const first = await exportDescr(deckId, alt);
  const firstAt = Date.now() - tabAt;
  await sleep(3500);
  const second = await exportDescr(deckId, alt);
  const secondAt = Date.now() - tabAt;
  if (await t.visible('panel.formatOptions.close'))
    await t.clickControl('panel.formatOptions.close');
  return {
    ok: written === alt && first.descr === true && second.descr === true,
    observed: `alt after Tab ${JSON.stringify(written)} (${writtenMs} ms); export at once (${firstAt} ms after Tab, ${first.ms} ms): ${first.status}, descr ${first.descr}, ${first.named ?? 0} of ${first.shapes ?? 0} named shapes carry a descr; export after 3.5 s (${secondAt} ms after Tab): ${second.status}, descr ${second.descr}, ${second.named ?? 0} of ${second.shapes ?? 0}`,
  };
}

try {
  const deck = await t.newDeck();
  console.log('deck', deck.id);
  const S = await t.setupSlide(deck.titleSlide, 'blank');
  await t.gotoSlide(S);

  /* the walk's box: a text block formatted by the formatting rows before the alt row */
  await t.placeBlock(S, {
    id: 'fmt-a',
    type: 'text',
    text: 'Renewals cover three regions ==this year== and two products',
    pos: { x: 160, y: 160, w: 640, h: 120 },
  });
  const t0 = (await t.blockOf(S, 'fmt-a'))?.block?.typography ?? {};
  await t.setBlock(S, 'fmt-a', '/typography', { ...t0, weight: 700, size: 32 });
  await t.setBlock(S, 'fmt-a', '/color', 'red');
  await t.step(
    'formatting.alt-text.write-undo (the formatted box): the description with Tab, then the export at once and after the idle checkpoint',
    'both exports carry descr="A renewal chart"',
    () => writeAndExport(deck.id, S, 'fmt-a', 'A renewal chart'),
  );

  /* a plain box, the same two exports */
  await t.placeBlock(S, {
    id: 'plain',
    type: 'text',
    text: 'A plain box',
    pos: { x: 160, y: 420, w: 640, h: 120 },
  });
  await t.step(
    'the same on a plain text box',
    'both exports carry descr="A plain description"',
    () => writeAndExport(deck.id, S, 'plain', 'A plain description'),
  );
} finally {
  t.finish();
  await browser.close();
}
