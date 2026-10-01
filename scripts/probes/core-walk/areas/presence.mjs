// The realtime round's presence area of the core walk (docs/REALTIME.md section 2, 5.1 R5; the
// area `presence` under the unparkable feature `realtime` with the driver `probe --core`): the one
// probe row that reads a second person's 16 px chip in the pixels of A's filmstrip card, not in
// the DOM alone. The people round's rows read the card marks from the DOM, which is why defect 3
// of audit-people.md passed every table: the marks were in the DOM at the card's top right with
// nothing painted at their place, the thumbnail's live clone (`position: absolute; z-index: 1`)
// painting over a span with no z-index (packages/chrome/src/Filmstrip.css `.ts-card-marks`,
// Thumb.css `.ts-thumb`). R3 lands the stacking fix; this area reads the pixels either way.
//
// The walk has one page and one context; the second person is a second browser context of the
// walk's browser (another anonymous principal, admitted by the editor link the window API mints
// through `share.setGeneralAccess`), opened for this area's one row and closed inside it the way
// its tab closes (a navigation to about:blank first, so the leave beacon lands). The pixel read is
// R3's (build/r3.md request 6): a 1x shot of the marks' box against the same shot with
// `.ts-card-marks { visibility: hidden }` injected, counting the pixels that differ; before the fix
// the two clips were equal, after it they differ over the chip's box.

export const NAME = 'presence';
export const IDS = ['realtime.card.chip-painted'];

/** The bound of the row: the chip in the pixels within 2 s of B's click (docs/REALTIME.md section 2). */
export const CHIP_BOUND_MS = 2000;
/** The fewest differing pixels that count as a painted 16 px chip (a 16 by 16 box is 256). */
export const CHIP_MIN_PIXELS = 24;

/** The `/s/<token>` path of a minted share link, whatever origin the answer wrote it with. */
export function shareLinkPath(url) {
  if (typeof url !== 'string' || url === '') return null;
  try {
    const u = new URL(url, 'http://turboslide.invalid');
    return u.pathname.startsWith('/s/') ? `${u.pathname}${u.search}` : null;
  } catch {
    return null;
  }
}

/** The pixels that differ between two decoded shots of one clip, with the first few named. */
export function differingPixels(a, b) {
  if (!a || !b) return { count: 0, first: [], size: null };
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  let count = 0;
  const first = [];
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const p = a.pixel(x, y);
      const q = b.pixel(x, y);
      if (p[0] !== q[0] || p[1] !== q[1] || p[2] !== q[2]) {
        count += 1;
        if (first.length < 3) first.push(`${x},${y}`);
      }
    }
  return { count, first, size: `${w}x${h}` };
}

export async function run(t) {
  const { page, browser, BASE, headers } = t;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let other = null;
  let B = null;

  /* the second person's tab closes the way a tab closes: about:blank first (pagehide, the leave
     beacon), then the context (core/share.spec.ts closeSecond) */
  const closeB = async () => {
    try {
      if (B && !B.isClosed()) {
        B.once('dialog', (dialog) => void dialog.accept().catch(() => undefined));
        await B.goto('about:blank', { timeout: 10_000 }).catch(() => undefined);
      }
    } finally {
      await other?.close().catch(() => undefined);
      other = null;
      B = null;
    }
  };

  try {
    await t.clickCard(t.deck.titleSlide);
    await t.clearAll();

    /* a second slide for B to stand on: the walk's areas before this one made slides when the
       whole walk runs; a narrowed run (--only decks,presence) makes one here as a setup write */
    let second = null;
    await t.setup(
      'a second slide and the editor link',
      'slide.new, share.setGeneralAccess link editor',
      async () => {
        let order = await t.slideOrder();
        if (order.length < 2) {
          const s = await t.state();
          await t.invoke('slide.new', {
            layout: 'split',
            after: order[0],
            baseRevision: s.revision,
          });
          await t.settled();
          order = await t.slideOrder();
        }
        second = order.find((id) => id !== t.deck.titleSlide) ?? order[1] ?? null;
        const got = await t.invoke('share.get', { id: t.deck.id });
        const set = await t.invoke('share.setGeneralAccess', {
          id: t.deck.id,
          mode: 'link',
          role: 'editor',
          baseRevision: got.record?.revision ?? got.revision,
        });
        const link = shareLinkPath(set.url);
        t.deck.presenceLink = link;
        return {
          ok: second !== null && link !== null,
          observed: `slides ${order.length}, slide 2 ${second ?? 'none'}; the editor link ${link === null ? 'was not minted (share.setGeneralAccess answered no /s/ URL)' : 'minted'}`,
        };
      },
    );

    await t.setup(
      'B, a second browser, on the deck',
      'the link lands on /edit/<id> and the stream connects',
      async () => {
        other = await browser.newContext({
          viewport: { width: 1440, height: 900 },
          deviceScaleFactor: 1,
          extraHTTPHeaders: headers,
          acceptDownloads: false,
        });
        B = await other.newPage();
        const t0 = Date.now();
        await B.goto(`${BASE}${t.deck.presenceLink}`, { waitUntil: 'domcontentloaded' });
        await B.waitForURL(new RegExp(`/edit/${t.deck.id}`), { timeout: 30_000 });
        await B.waitForFunction(
          () => Boolean(window.turboslide && window.turboslide.studio),
          null,
          {
            timeout: 90_000,
          },
        );
        await B.locator('.pt-viewer:not(.ts-skeleton)[data-settled]')
          .first()
          .waitFor({ timeout: 60_000 });
        const until = Date.now() + 45_000;
        let connected = false;
        while (Date.now() < until) {
          const s = await B.evaluate(() => window.turboslide.studio.describe().state).catch(
            () => null,
          );
          if (s?.sync?.connected === true) {
            connected = true;
            break;
          }
          await sleep(200);
        }
        for (const control of ['dialog.namePrompt.close', 'dialog.namePrompt.skip']) {
          const el = B.locator(`[data-control="${control}"]`).first();
          if (await el.isVisible().catch(() => false))
            await el.click({ timeout: 2000 }).catch(() => undefined);
        }
        const edits = await B.locator('.pt-viewer:not(.ts-skeleton)')
          .first()
          .getAttribute('data-edit-mode')
          .catch(() => null);
        return {
          ok: connected,
          observed: `B ready ${Date.now() - t0} ms after its navigation; connected ${connected}; data-edit-mode ${edits}`,
        };
      },
    );

    await t.step(
      'realtime.card.chip-painted',
      "B clicks card 2; A's card 2 shows B's 16 px chip in the pixels at the card's top right",
      `.ts-card-marks on card 2 within ${CHIP_BOUND_MS} ms and the pixels under it differ from the same clip with the marks hidden (${CHIP_MIN_PIXELS} or more)`,
      async () => {
        const cardSel = `[data-control="filmstrip.slide.${second}"]`;
        const marksSel = `${cardSel} .ts-card-marks[data-count]`;
        /* the roster: B's row in A's state first, so a chip absent from the card is the card's
           fault and not the join's (the join is realtime.join.chip-within-1s, the spec's) */
        const bClient = await B.evaluate(
          () => window.turboslide.studio.describe().state.presence?.clientId ?? null,
        );
        const inRoster = await t
          .pollUntil(
            async () => (await t.state()).presence?.others ?? [],
            (others) => others.some((o) => o.clientId === bClient),
            /* a quarter of the row's expiry (protocol.ts PRESENCE_EXPIRY_MS 120 s); the join's
               own bound is the spec's row */
            30_000,
          )
          .then(() => true)
          .catch(() => false);
        const t0 = Date.now();
        await B.locator(`[data-control="filmstrip.slide.${second}"]`).first().click();
        let domMs = null;
        const until = t0 + 10_000;
        while (Date.now() < until) {
          if (await t.has(marksSel)) {
            domMs = Date.now() - t0;
            break;
          }
          await sleep(50);
        }
        if (domMs === null)
          return {
            ok: false,
            observed: `B (${bClient ?? 'no client id'}) in A's roster ${inRoster}; no .ts-card-marks on card 2 within 10 s of B's click`,
          };
        /* the pixel read: the marks' box, one shot of it, the same clip with the marks hidden */
        const box = await t.boxOfSel(marksSel);
        if (!box || box.w === 0 || box.h === 0)
          return { ok: false, observed: `the marks have no box (${JSON.stringify(box)})` };
        const clip = {
          x: Math.max(0, Math.floor(box.x - 2)),
          y: Math.max(0, Math.floor(box.y - 2)),
          width: Math.ceil(box.w + 4),
          height: Math.ceil(box.h + 4),
        };
        const drawn = await t.shotPixels(clip);
        const pixelMs = Date.now() - t0;
        const style = await page.addStyleTag({
          content: '.ts-card-marks { visibility: hidden !important; }',
        });
        await sleep(120);
        const hidden = await t.shotPixels(clip);
        await style.evaluate((el) => el.remove()).catch(() => undefined);
        await sleep(60);
        const diff = differingPixels(drawn, hidden);
        const count = await t.attr(marksSel.replace('[data-count]', ''), 'data-count');
        const painted = diff.count >= CHIP_MIN_PIXELS;
        const within = domMs <= CHIP_BOUND_MS;
        await t.shot('realtime-card-chip-a');
        return {
          ok: painted && within,
          observed: `B in A's roster ${inRoster}; .ts-card-marks (data-count ${count}) on card 2 in the DOM ${domMs} ms after B's click (bound ${CHIP_BOUND_MS}); the pixel read at ${pixelMs} ms over ${diff.size}: ${diff.count} pixel(s) differ with the marks hidden${diff.first.length > 0 ? ` (first at ${diff.first.join('; ')})` : ''}; ${painted ? 'painted' : `not painted (fewer than ${CHIP_MIN_PIXELS} differ: the thumbnail's clone paints over the marks, audit-people.md defect 3)`}`,
        };
      },
    );
  } finally {
    await closeB();
    await t.clickCard(t.deck.titleSlide).catch(() => undefined);
  }
}
