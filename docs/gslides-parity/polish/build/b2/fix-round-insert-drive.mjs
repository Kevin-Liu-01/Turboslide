// B2 fix round, finding 1: the walk's Insert > Table on a slide.new split slide with its title
// typed through the product. Reads every block of the slide (with and without a pos) before and
// after each insert, so the heading's conversion and the table's own box are told apart.
// TURBOSLIDE_BASE names the server; the deck is trashed and deleted forever in finally.
import {
  sleep, launch, press, clickAt, invoke, state, settled, objectsOf, slideJson, clearAll, clickCard,
  addSlide, newDeck, insertTable, teardown, typeHuman,
} from '../tables/lib.mjs';

const { browser, page, consoleErrors } = await launch({ width: 1440, height: 900 });
let deck = null;
const allBlocks = async (slideId) => {
  const slide = await slideJson(page, slideId);
  const out = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      if (typeof node.id === 'string' && typeof node.type === 'string')
        out.push({ id: node.id, type: node.type, pos: node.pos ?? null, text: typeof node.text === 'string' ? node.text : undefined });
      for (const v of Object.values(node)) walk(v);
    }
  };
  walk(slide);
  return { layout: slide.layout, ids: out };
};
const show = (label, b) => console.log(label, JSON.stringify(b));
try {
  deck = await newDeck(page, 'B2 fix repro: Acme, Q3 2026');
  console.log('deck', deck.id, deck.url);
  const S = await addSlide(page, deck.titleSlide, 'split');
  await clickCard(page, S);
  await page.waitForSelector(`.pt-viewer[data-active="${S}"]`, { timeout: 5000 }).catch(() => undefined);
  await sleep(300);
  /* the title typed the walk's way: one click on the heading's run selects the placeholder, a
     printable key starts the session over its text (A1 rule 4) */
  const head = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.ts-stagewrap.ts-editor .pt-slide [data-run]')];
    const h = els.find((e) => /heading/.test(e.getAttribute('data-run') ?? '')) ?? els[0];
    if (!h) return null;
    const r = h.getBoundingClientRect();
    return { run: h.getAttribute('data-run'), x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  console.log('head run', head?.run);
  await clickAt(page, head.x, head.y);
  await sleep(250);
  await typeHuman(page, 'Pipeline');
  await sleep(200);
  await press(page, 'Escape');
  await settled(page);
  await clearAll(page);
  show('before any insert', await allBlocks(S));
  for (const [c, r] of [[1, 1], [1, 2], [3, 3], [12, 4]]) {
    const before = await objectsOf(page, S);
    show(`${c}x${r} positioned before`, before.map((o) => ({ id: o.id, type: o.type, pos: o.pos })));
    const { obj, words, landed } = await insertTable(page, S, c, r);
    await settled(page);
    const after = await objectsOf(page, S);
    const fresh = after.filter((o) => !before.some((b) => b.id === o.id));
    console.log(`${c}x${r} size words "${words}"`);
    show(`${c}x${r} first fresh positioned object (the walk's newObjectAfter read)`, landed ? { id: landed.id, type: landed.type, pos: landed.pos } : null);
    show(`${c}x${r} every fresh positioned object`, fresh.map((o) => ({ id: o.id, type: o.type, pos: o.pos })));
    show(`${c}x${r} the table`, obj ? { id: obj.id, type: obj.type, pos: obj.pos, rows: obj.block.rows?.length, columns: obj.block.columns?.length } : null);
    show(`${c}x${r} slide after`, await allBlocks(S));
    /* the walk's undoOnce */
    await press(page, 'Escape');
    await sleep(250);
    await press(page, 'Meta+z');
    await sleep(500);
    await settled(page);
    show(`${c}x${r} slide after Cmd+Z`, await allBlocks(S));
    await clearAll(page);
  }
  console.log('console errors', consoleErrors.length, consoleErrors.slice(0, 4));
} catch (error) {
  console.log('fatal', String(error).split('\n').slice(0, 4).join(' | '));
} finally {
  if (deck?.id) console.log('teardown', JSON.stringify(await teardown(page, deck.id).catch((e) => ({ error: String(e) }))));
  await browser.close();
}
