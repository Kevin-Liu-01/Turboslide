// The fix round's link drive (VERIFICATION.md "Product round, pass 1" finding 5): in a heading
// block, in the title slide's heading and in a body paragraph, type an address, Enter, a word
// (the whole text replaced by A1 rule 4 where Enter committed), then Cmd+K on the word and an
// address. Reads the stored text and the anchors the session draws after every step; the pass
// is the two agreeing and no raw link syntax in the stored text or on the sheet. Human speed.
import { launch, bind, sleep } from './lib.mjs';

const { browser, page, consoleErrors } = await launch();
const t = bind(page, 'drive-fix-links');
const errorsSince = (n) =>
  consoleErrors
    .slice(n)
    .filter((e) => !/CSP|Content Security|Fast Refresh|hmr|\[vite\]|\[Server\]/i.test(e));

/** The anchors inside a run on the sheet. */
const anchorsOf = (run) =>
  page.evaluate((r) => {
    const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
    if (!el) return null;
    return [...el.querySelectorAll('a')].map((a) => ({
      href: a.getAttribute('href'),
      text: a.textContent,
    }));
  }, run);
const textOf = async (run) => (await t.runInfo(run))?.text ?? null;
const popoverField = () => page.locator('[data-control="popover.link.url"]').first();

/** One sequence on a run whose stored text `stored()` reads back; `single` when Enter commits. */
async function sequence(label, run, stored, { single }) {
  const trace = [];
  const note = async (at) =>
    trace.push({
      at,
      editing: await t.editing(),
      anchors: await anchorsOf(run),
      text: await textOf(run),
      stored: await stored(),
    });
  await t.openRun(run);
  await t.press('Meta+a');
  await t.typeHuman('sales@acme.com');
  await sleep(400);
  await note('typed the address');
  await t.press('Enter');
  await sleep(700);
  await note('after Enter');
  if (!single) {
    /* a body paragraph: Enter broke the line; the word goes on the new line */
  }
  await t.typeHuman('Renewal');
  await sleep(900);
  await note('typed Renewal');
  /* the word selected inside the session: a double click on it */
  const point = await page.evaluate((r) => {
    const el = document.querySelector(`.ts-stagewrap.ts-editor .pt-slide [data-run="${r}"]`);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const i = node.nodeValue.indexOf('Renewal');
      if (i >= 0) {
        const range = document.createRange();
        range.setStart(node, i + 2);
        range.setEnd(node, i + 3);
        const b = range.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }
    }
    return null;
  }, run);
  if (!point)
    return { ok: false, observed: `no Renewal on the sheet; trace ${JSON.stringify(trace)}` };
  await t.dblclickAt(point.x, point.y);
  await sleep(300);
  const selected = await t.selectionText();
  await t.press('Meta+k');
  await popoverField()
    .waitFor({ timeout: 6000 })
    .catch(() => undefined);
  const fieldValue = await popoverField()
    .inputValue()
    .catch(() => null);
  await popoverField()
    .click()
    .catch(() => undefined);
  await t.typeHuman('acme.com/renewal');
  await t.press('Enter');
  await sleep(900);
  await note('after the Cmd+K link');
  await t.press('Escape');
  await sleep(600);
  await t.settled();
  await note('after Escape');
  const last = trace[trace.length - 1];
  const afterWord = trace[2];
  const afterLink = trace[3];
  const leak = (s) => /\]\(|\[Renewal|mailto:sales@acme\.com\)/.test(s ?? '');
  const ok =
    afterWord.stored !== null &&
    !leak(afterWord.text) &&
    /* the session and the document agree on the link after the replacement: both none, or both mailto */
    ((afterWord.anchors.length === 0 && !/\]\(/.test(afterWord.stored)) ||
      (afterWord.anchors.length === 1 && /\(mailto:sales@acme\.com\)/.test(afterWord.stored))) &&
    afterLink.anchors.some((a) => a.href === 'https://acme.com/renewal' && a.text === 'Renewal') &&
    /\[Renewal\]\(https:\/\/acme\.com\/renewal\)/.test(afterLink.stored ?? '') &&
    !/\)l\]\(|mailto:sales@acme\.com\)$/.test(afterLink.stored ?? '') &&
    !leak(last.text) &&
    /\[Renewal\]\(https:\/\/acme\.com\/renewal\)/.test(last.stored ?? '');
  return {
    ok,
    observed: `${label}: selected "${selected}"; Cmd+K field "${fieldValue}"; trace ${JSON.stringify(trace)}`,
  };
}

try {
  const deck = await t.newDeck();
  console.log('deck', deck.id);
  const S = await t.setupSlide(deck.titleSlide, 'blank');
  await t.gotoSlide(S);
  const errorsAt = consoleErrors.length;

  /* a heading block (the split layout's h/text of the finding) */
  await t.placeBlock(S, {
    id: 'hd',
    type: 'heading',
    level: 'h2',
    text: 'Title here',
    pos: { x: 160, y: 140, w: 900, h: 90, z: 5 },
  });
  const hdRun = (await t.runsOfBlock('hd'))[0];
  await t.step(
    'text.link.detect-email, text.link.popover-apply-remove (a heading block): address, Enter, a word, Cmd+K',
    'the stored text and the sheet agree after the word; the link apply writes [Renewal](https://acme.com/renewal) and nothing leaks',
    () =>
      sequence('heading block', hdRun, async () => (await t.blockOf(S, 'hd'))?.block.text ?? null, {
        single: true,
      }),
  );
  await t.shot('heading-block-after');
  await t.clearAll();

  /* a body paragraph: the control case (Enter breaks the line) */
  await t.placeBlock(S, {
    id: 'tb',
    type: 'text',
    text: 'Body here',
    pos: { x: 160, y: 320, w: 900, h: 120, z: 6 },
  });
  const tbRun = (await t.runsOfBlock('tb'))[0];
  await t.step(
    'the same keys in a body paragraph',
    'the address on one line, the linked word on the next, nothing leaks',
    async () => {
      const r = await sequence(
        'body paragraph',
        tbRun,
        async () => (await t.blockOf(S, 'tb'))?.block.text ?? null,
        { single: false },
      );
      const stored = (await t.blockOf(S, 'tb'))?.block.text ?? '';
      return {
        ok:
          /\[sales@acme\.com\]\(mailto:sales@acme\.com\)\n\[Renewal\]\(https:\/\/acme\.com\/renewal\)/.test(
            stored,
          ) && !/\)l\]\(/.test(stored),
        observed: `${r.observed}; final stored ${JSON.stringify(stored)}`,
      };
    },
  );
  await t.clearAll();

  /* the title slide's heading: a slide field (slide.set) */
  await t.gotoSlide(deck.titleSlide);
  await sleep(500);
  const headRun = (await t.runs()).find((x) => /heading/.test(x));
  await t.step(
    'the title slide heading (a slide field): address, Enter, a word, Cmd+K',
    'the stored heading and the sheet agree; the link apply writes the linked word and nothing leaks',
    () =>
      sequence(
        'title heading',
        headRun,
        async () => (await t.slideJson(deck.titleSlide))?.heading ?? null,
        { single: true },
      ),
  );
  await t.shot('title-heading-after');
  await t.clearAll();
  const errs = errorsSince(errorsAt);
  t.record(
    'console errors during the drive',
    'none',
    errs.length ? errs.join(' | ') : 'none',
    errs.length === 0,
  );
} finally {
  t.finish();
  await browser.close();
}
