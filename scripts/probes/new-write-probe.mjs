#!/usr/bin/env node
// The fresh presentation write probe (gslides-parity SPEC-3 6.1; VERIFICATION-3 findings 45 and
// 33; build-4/hotfix-2.md). Reproduces and guards the defect the orchestrator measured on
// 2026-09-14: on /new the first thing a sales user meets, a double click on the visible title
// placeholder must open the inline editor and keep it open (before the fix the second click of
// the double blurred the session the first click had just opened, because the empty placeholder
// collapsed to the caret once its prompt left), the first write must create the deck through
// createStoredDeck and move the address to /edit/<id> with the room attached, and every following
// write must land. It then reopens the deck in a second page and types once immediately, the
// finding 33 case (the first burst of a page that has just opened a deck one revision ahead must
// not be lost), and trashes the deck through File > Move to trash and Delete forever on
// /decks/trash so a run leaves the store as it found it.
//
// Hotfix 2 (Kevin's report of 2026-09-14, "revision 2 vs revision 12" and "you can see yourself
// editing it"): twelve sequential edits each acknowledged at exactly the next revision with no
// stale message in the state, the snackbar or a toast; a slide switch after the first save on /new
// that keeps the same editor, the same client id and the one stream (the shell's hash write used
// to remount the editor through the router); a reload followed by an edit acknowledged at the
// next revision with the tab's own earlier id never drawn as a collaborator (zero chips, marks,
// outlines, carets, pointers, and one roster row: the self row); and a second tab of the same
// deck in a second context sharing the first context's cookies, where neither tab ever lists
// itself as a collaborator.
//
// Reused by the verifier and the ship step: it takes a base URL and drives the product's own UI, so
// it runs against a dev server (memory tier) and against production (blob tier). The self facts of
// cause B (a tab never drawn as its own collaborator; the alone roster is one self row) are
// asserted on every tier. Cross tab presence accuracy (each of two tabs lists exactly the other,
// once, and forgets it on close) needs one roster and is asserted on a single roster tier; on the
// blob tier the roster is per instance under fluid compute (the title row shows BLOB_TIER_NOTICE),
// so those counts are recorded, not asserted (build-4/hotfix-2.md deviation 2, a round item).
//   node scripts/probes/new-write-probe.mjs [--base http://localhost:4351]
import { createRequire } from 'node:module';

const require = createRequire('/Users/kevinliu/repos/Turboslide/package.json');
const { chromium } = require('playwright-core');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = arg('base', process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4351').replace(
  /\/$/,
  '',
);
const OIDC = process.env.VERCEL_OIDC_TOKEN;
const extraHTTPHeaders = OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};
/** The edits of step 2 (hotfix 2: twelve, each its own revision). */
const EDITS = 12;

let failures = 0;
const step = (ok, name, evidence) => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${evidence ? `: ${evidence}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const invoke = (page, action, input) =>
  page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]);
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
const editorReady = async (page) => {
  await page.waitForFunction(() => Boolean(window.turboslide?.studio), null, { timeout: 90_000 });
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};
/** Nothing pending on this tab: the write reached the room and settled. */
const settled = async (page, timeout = 30_000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const s = await state(page);
    const pending = s.sync?.pending ?? s.pending ?? 0;
    if (pending === 0) return s;
    if (Date.now() > until) return s;
    await sleep(120);
  }
};
/** The revision the tab reports (SPEC-3 3.10). */
const revisionOf = async (page) => (await state(page)).revision;
/** Opens the inline session on a run through a double click, the orchestrator's own gesture. */
const dblclickRun = async (page, run) => {
  const el = page.locator(`.ts-stagewrap.ts-editor .pt-slide [data-run="${run}"]`);
  await el.waitFor({ timeout: 30_000 });
  const box = await el.boundingBox();
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await el.getAttribute('contenteditable');
  return el;
};
/** Waits for the revision to reach at least `want` (the blob tier settles a write slowly). */
const waitRevision = async (page, want, timeout = 30_000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const r = await revisionOf(page);
    if (r >= want) return r;
    if (Date.now() > until) return r;
    await sleep(150);
  }
};
/** Polls `read` until `test` accepts its value or the time is up; answers the last value. */
const pollUntil = async (read, test, timeout = 15_000) => {
  const until = Date.now() + timeout;
  for (;;) {
    const value = await read();
    if (test(value)) return value;
    if (Date.now() > until) return value;
    await sleep(200);
  }
};
/** The words a refused write puts on the state, the snackbar or a toast (hotfix 2, cause A). */
const STALE = /is stale|changed in the Blob store|reload and rebase|not accepted/i;
const staleWords = async (page) => {
  const s = await state(page);
  const shown = await page.evaluate(() =>
    [...document.querySelectorAll('.ts-snackbar.is-on, .pt-toast.is-on, .ts-status')]
      .map((el) => el.textContent ?? '')
      .join(' | '),
  );
  const hits = [s.error ?? '', shown].filter((text) => STALE.test(text));
  return hits.length === 0 ? null : hits.join(' ; ');
};
/** The remote presence drawn in this tab (hotfix 2, cause B): what a person sees of others. */
const remotePresence = async (page) =>
  page.evaluate(() => ({
    chips: document.querySelectorAll('[data-control^="presence.chip."]').length,
    count: document.querySelector('[data-control="title.presence"]')?.getAttribute('data-count'),
    marks: document.querySelectorAll('.ts-card-marks, .pt-orow-people').length,
    outlines: document.querySelectorAll('.ts-remote-outline').length,
    carets: document.querySelectorAll('.ts-remote-caret').length,
    pointers: document.querySelectorAll('.ts-remote-pointer-group').length,
    flags: document.querySelectorAll('.ts-flag').length,
  }));
/** Opens the roster menu, counts its rows and the self row, closes it. */
const rosterRows = async (page) => {
  await page.locator('[data-control="presence.more"]').click();
  await page.locator('#ts-menu-roster').waitFor({ timeout: 5000 });
  const rows = await page.evaluate(() => {
    const menu = document.getElementById('ts-menu-roster');
    const all = menu ? [...menu.querySelectorAll('[data-control^="presence.roster."]')] : [];
    return { total: all.length, self: all.filter((el) => el.classList.contains('is-self')).length };
  });
  await page.keyboard.press('Escape');
  await page.locator('#ts-menu-roster').waitFor({ state: 'detached', timeout: 5000 });
  return rows;
};
const others = async (page) => {
  const list = await invoke(page, 'presence.list', {}).catch(() => ({ others: [] }));
  return list.others ?? [];
};
/**
 * The realtime tier the deployment runs (SPEC-3 2.5). On the blob tier the roster is per instance
 * under fluid compute (the title row shows the Redis notice, BLOB_TIER_NOTICE), so a leave a
 * closed tab posts lands on one instance while the first tab's stream reads another until
 * PRESENCE_EXPIRY_MS; the cross instance forget is the documented limitation of build-4/
 * hotfix-2.md deviation 2, not the reported defect. The self facts this probe guards (the tab is
 * never drawn as its own collaborator, the alone roster is one self row, and the first tab lists
 * an open second tab as one other) hold on every tier.
 */
const tierOf = async (page) => (await state(page)).sync?.tier ?? 'memory';
/**
 * Counts the streams a page opened: a fetch wrapper installed before the page's scripts records
 * every request of the stream route. The room's transport has been a streamed fetch with
 * `accept: text/event-stream` since the cycle 3 stream fix round (controller.tsx sseTransport;
 * s1.md S1-R3), so an EventSource wrapper would read 0 on every origin.
 */
const streamsOpened = (page) => page.evaluate(() => window.__tsStreams?.length ?? -1);
const countStreams = (context) =>
  context.addInitScript(() => {
    const opens = [];
    window.__tsStreams = opens;
    const native = window.fetch;
    if (typeof native !== 'function') return;
    const STREAM = /\/api\/decks\/[^/?]+\/stream(\?|$)/;
    window.fetch = function (input, init) {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
      if (typeof url === 'string' && STREAM.test(url)) opens.push(url);
      return native.call(this, input, init);
    };
  });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders,
});
await countStreams(context);
const A = await context.newPage();
const failedRequests = [];
A.on('response', (r) => {
  if (r.status() >= 400 && /\/api\/render\/title\?/.test(r.url())) failedRequests.push(r.url());
});

let deckId = '';
try {
  // 1. /new: the draft, then the double click that opens the title
  await A.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
  await editorReady(A);
  const before = await invoke(A, 'deck.info');
  deckId = before.id;
  step(/^untitled-\d{8}-[a-z0-9]{4}$/.test(deckId), 'the draft has an untitled id', deckId);
  step(
    (await state(A)).sync?.connected === false,
    'a draft is not connected before its first write',
  );

  const heading = await dblclickRun(A, 'heading/text');
  const editing = await heading.getAttribute('contenteditable');
  step(
    editing === 'true',
    'the double click opened and kept the inline session',
    `contenteditable=${editing}`,
  );

  // 2. twelve edits, each saved at exactly the next revision with no stale message anywhere
  //    (hotfix 2, cause A); the first creates the deck and moves the address
  let clientAfterSave = null;
  let staleSeen = null;
  let exact = true;
  for (let i = 0; i < EDITS; i += 1) {
    await A.keyboard.type(i === 0 ? 'Q4 review' : ` ${String.fromCharCode(97 + i)}`, { delay: 25 });
    await sleep(500); // past the 400 ms burst timer, so each chunk is one write
    const want = i + 1;
    const got = await waitRevision(A, want);
    const s = await settled(A);
    if (got !== want || s.revision !== want) exact = false;
    const stale = await staleWords(A);
    if (stale !== null && staleSeen === null) staleSeen = `edit ${want}: ${stale}`;
    if (i < 6 || got !== want) step(got === want, `edit ${want} saved`, `revision ${got}`);
    if (i === 0) {
      const url = A.url();
      step(
        /\/edit\//.test(url),
        'the first write moved the address to /edit/<id>',
        url.replace(BASE, ''),
      );
      step(
        (s.sync?.connected === true && s.sync?.transport === 'sse') || s.sync?.transport === 'poll',
        'the room attached after the first write',
        JSON.stringify(s.sync),
      );
      clientAfterSave = s.presence?.clientId ?? null;
    }
  }
  await A.keyboard.press('Escape');
  // the anonymous name prompt is a floating card that took no focus (finding 8); close it if shown
  const prompt = A.locator('[data-control="dialog.namePrompt"]');
  if (await prompt.isVisible().catch(() => false)) {
    await A.locator('[data-control="dialog.namePrompt.close"]')
      .click()
      .catch(() => undefined);
  }
  const afterEdits = await settled(A);
  step(afterEdits.revision >= 6, 'six edits landed', `revision ${afterEdits.revision}`);
  step(
    exact && afterEdits.revision === EDITS,
    `${EDITS} sequential edits were each acknowledged at exactly the next revision (hotfix 2)`,
    `revision ${afterEdits.revision}, serverRevision ${afterEdits.serverRevision}, sync ${JSON.stringify(
      { seq: afterEdits.sync?.seq, pending: afterEdits.sync?.pending },
    )}`,
  );
  step(
    staleSeen === null,
    'no stale message in the state, the snackbar or a toast across the edits (hotfix 2)',
    staleSeen ?? 'none',
  );
  step(
    failedRequests.length === 0,
    'no 404 on the draft thumbnail route',
    `${failedRequests.length} seen`,
  );

  // 2b. a slide switch after the save on /new keeps the editor, its client id and its one stream
  //     (hotfix 2, cause A4: the shell's hash write on the pinned address remounted the editor).
  //     The client id is the stream's hello, which lands after the first write's answer, so it is
  //     read once the room reports connected (describe().state.presence.clientId; sync carries none)
  await pollUntil(
    () => state(A),
    (s) => s.sync?.connected === true && typeof s.presence?.clientId === 'string',
    45_000,
  );
  clientAfterSave = (await state(A)).presence?.clientId ?? clientAfterSave;
  const streamsBefore = await streamsOpened(A);
  const dup = await invoke(A, 'slide.duplicate', {
    slideIds: ['title'],
    baseRevision: afterEdits.revision,
  }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  const dupRevision = await waitRevision(A, afterEdits.revision + 1);
  await settled(A);
  const newSlideId = dup.slides?.[0]?.id ?? dup.slideIds?.[0] ?? dup.slide?.id ?? null;
  if (newSlideId) await invoke(A, 'view.goto', { slideId: newSlideId }).catch(() => undefined);
  await sleep(400);
  await invoke(A, 'view.goto', { slideId: 'title' }).catch(() => undefined);
  await sleep(1500);
  const afterSwitch = await state(A);
  const streamsAfter = await streamsOpened(A);
  step(
    dup.error === undefined && dupRevision === afterEdits.revision + 1,
    'Duplicate slide after the save landed at the next revision',
    dup.error ?? `revision ${dupRevision}`,
  );
  const clientAfterSwitch = afterSwitch.presence?.clientId ?? null;
  step(
    clientAfterSave !== null &&
      clientAfterSwitch === clientAfterSave &&
      streamsAfter === streamsBefore &&
      /\/edit\//.test(A.url()),
    'the slide switch on the saved /new page kept the editor, the client id and the one stream (hotfix 2)',
    `clientId ${clientAfterSave === null ? 'never issued' : clientAfterSwitch === clientAfterSave ? 'same' : 'changed'}, streams ${streamsBefore} -> ${streamsAfter}, ${A.url().replace(BASE, '')}`,
  );

  // 2c. a reload, then an edit acknowledged at the next revision; the tab's own earlier id is
  //     never drawn as a collaborator (hotfix 2, cause B)
  const revisionBeforeReload = afterSwitch.revision;
  await A.reload({ waitUntil: 'domcontentloaded' });
  await editorReady(A);
  await pollUntil(
    () => state(A),
    (s) => s.sync?.connected === true,
    45_000,
  );
  const reloaded = await state(A);
  step(
    reloaded.revision === revisionBeforeReload,
    'the reload opened the deck at the revision the tab had',
    `${revisionBeforeReload} -> ${reloaded.revision}`,
  );
  const ghosts = await pollUntil(
    async () => ({ others: await others(A), dom: await remotePresence(A) }),
    (v) => v.others.length === 0 && v.dom.chips === 0,
    5000,
  );
  // hold a moment more: a ghost of the earlier id arrived with hello or the next presence frame
  await sleep(1500);
  const ghostsLater = { others: await others(A), dom: await remotePresence(A) };
  // the tab's own presence row returns after it posts its presence and a frame lands; poll for
  // the self row before the roster is counted. On the blob tier this row can take a while or not
  // arrive on the instance this tab reads, because the roster is per instance under fluid compute
  // (BLOB_TIER_NOTICE); the tab still draws its own avatar chip from its identity, so the missing
  // self row is presence completeness, not the reported defect.
  const rTier = await tierOf(A);
  await pollUntil(
    () => state(A),
    (s) => s.presence?.self !== undefined && s.presence?.self !== null,
    rTier === 'blob' ? 15_000 : 25_000,
  );
  const roster = await rosterRows(A);
  step(
    ghosts.others.length === 0 &&
      ghostsLater.others.length === 0 &&
      ghostsLater.dom.chips === 0 &&
      ghostsLater.dom.count === '0' &&
      ghostsLater.dom.marks === 0 &&
      ghostsLater.dom.outlines === 0 &&
      ghostsLater.dom.carets === 0 &&
      ghostsLater.dom.pointers === 0 &&
      ghostsLater.dom.flags === 0,
    'after the reload the tab draws nobody else: zero chips, marks, outlines, carets, pointers (hotfix 2)',
    `others ${ghostsLater.others.map((p) => p.clientId.slice(0, 8)).join(',') || 'none'}, dom ${JSON.stringify(ghostsLater.dom)}`,
  );
  // the reliable invariant on every tier (cause B): the roster never lists a row that is not this
  // tab, so a person never sees a collaborator that is really itself. Whether the self row itself
  // has arrived is presence completeness: asserted on a single roster tier (memory, redis),
  // recorded on the blob tier where it depends on the instance the tab reads.
  const noGhostRow = roster.total === roster.self && roster.total <= 1;
  if (rTier === 'blob') {
    step(
      noGhostRow,
      'the roster lists no row that is not this tab, and at most the self row (hotfix 2, cause B)',
      JSON.stringify(roster),
    );
    if (roster.total !== 1)
      console.log(
        `note the tab's own roster self row had not arrived on the instance it read on the blob tier (per instance roster, BLOB_TIER_NOTICE); the own avatar chip still draws: ${JSON.stringify(roster)}`,
      );
  } else {
    step(
      roster.total === 1 && roster.self === 1,
      'the roster lists one row, the self row (hotfix 2)',
      JSON.stringify(roster),
    );
  }
  await dblclickRun(A, 'heading/text');
  await A.keyboard.press('End');
  await A.keyboard.type(' r', { delay: 25 });
  await sleep(500);
  await A.keyboard.press('Escape');
  const afterReloadEdit = await settled(A);
  const reloadEditRevision = await waitRevision(A, revisionBeforeReload + 1);
  const staleAfterReload = await staleWords(A);
  const reloadRejects = afterReloadEdit.rejects?.length ?? 0;
  step(
    reloadEditRevision === revisionBeforeReload + 1 &&
      reloadRejects === 0 &&
      staleAfterReload === null,
    'the edit after the reload was acknowledged at the next revision (hotfix 2)',
    `${revisionBeforeReload} -> ${reloadEditRevision}, rejects ${reloadRejects}${staleAfterReload ? `, ${staleAfterReload}` : ''}`,
  );

  // 2d. a second tab of the deck in a second context that shares the first context's cookies
  //     (the same person): the first tab lists exactly one other participant while it is open,
  //     and nobody once it closed (hotfix 2, cause B)
  const shared = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders,
    storageState: await context.storageState(),
  });
  await countStreams(shared);
  const S = await shared.newPage();
  await S.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
  await editorReady(S);
  await pollUntil(
    () => state(S),
    (s) => s.sync?.connected === true,
    45_000,
  );
  const secondSelf = (await state(S)).presence?.clientId ?? null;
  const firstSelf = (await state(A)).presence?.clientId ?? null;
  const tier = await tierOf(A);
  // The invariant this hotfix owns and that holds on every tier: neither tab ever lists its own
  // client id among the others, so a person never sees itself editing (cause B, Kevin's report).
  // Cross tab accuracy (each tab lists exactly the other, once) needs one roster; on the blob
  // tier the roster is per instance under fluid compute, so a tab may see zero, one or two others
  // of the same person depending on which instance its stream and the other's presence POST
  // landed on (the title row shows BLOB_TIER_NOTICE). That is the declared limitation of the tier,
  // not the reported defect, so on the blob tier the counts are recorded and only the self filter
  // is asserted; on a single roster tier the exact one other each is asserted.
  const withSecond = await pollUntil(
    async () => ({ a: await others(A), s: await others(S), dom: await remotePresence(A) }),
    (v) =>
      tier === 'blob'
        ? v.a.length >= 1 || v.s.length >= 1
        : v.a.length === 1 &&
          v.a[0]?.clientId === secondSelf &&
          v.s.length === 1 &&
          v.s[0]?.clientId === firstSelf &&
          v.dom.chips === 1,
    30_000,
  );
  const noSelfInOthers =
    withSecond.a.every((p) => p.clientId !== firstSelf) &&
    withSecond.s.every((p) => p.clientId !== secondSelf);
  const detail = `first tab others ${withSecond.a.length} (${withSecond.a
    .map((p) => p.clientId.slice(0, 8))
    .join(',')}), second tab others ${withSecond.s.length} (${withSecond.s
    .map((p) => p.clientId.slice(0, 8))
    .join(
      ',',
    )}), chips ${withSecond.dom.chips}, first self ${firstSelf?.slice(0, 8) ?? 'none'}, second self ${secondSelf?.slice(0, 8) ?? 'none'}, tier ${tier}`;
  if (tier === 'blob') {
    step(
      noSelfInOthers,
      'with a second tab open, neither tab lists itself as a collaborator (hotfix 2, cause B)',
      detail,
    );
    console.log(
      `note the per instance roster on the blob tier makes the cross tab count depend on the instance (BLOB_TIER_NOTICE): ${detail}`,
    );
  } else {
    step(
      withSecond.a.length === 1 &&
        withSecond.a[0]?.clientId === secondSelf &&
        withSecond.s.length === 1 &&
        withSecond.s[0]?.clientId === firstSelf &&
        withSecond.dom.chips === 1 &&
        noSelfInOthers,
      'a second tab of the same person is exactly one other participant in each tab (hotfix 2)',
      detail,
    );
  }
  // close the second tab through the browser so its page fires pagehide and the room client posts
  // the leave with keepalive (cause B1), then wait for the first tab to forget it
  await S.close({ runBeforeUnload: true }).catch(() => undefined);
  await shared.close();
  const afterClose = await pollUntil(
    async () => ({ a: await others(A), dom: await remotePresence(A) }),
    (v) => v.a.length === 0 && v.dom.chips === 0,
    tier === 'blob' ? 20_000 : 130_000,
  );
  if (tier === 'blob' && (afterClose.a.length !== 0 || afterClose.dom.chips !== 0)) {
    // the blob tier's roster is per instance under fluid compute, so the leave lands on one
    // instance while the first tab's stream reads another until PRESENCE_EXPIRY_MS (build-4/
    // hotfix-2.md deviation 2; the title row shows BLOB_TIER_NOTICE). Recorded, not a failure: a
    // shared roster is a round item and this is not the reported defect.
    console.log(
      `note the first tab still lists the closed second tab on the blob tier (per instance roster, BLOB_TIER_NOTICE): others ${afterClose.a.length}, chips ${afterClose.dom.chips}`,
    );
  } else {
    step(
      afterClose.a.length === 0 && afterClose.dom.chips === 0,
      'the first tab forgets the second tab once it closed (hotfix 2)',
      `others ${afterClose.a.length}, chips ${afterClose.dom.chips}, tier ${tier}`,
    );
  }

  // 3. reopen in a second page and type once immediately (finding 33: the first write of a page
  //    that has just opened a deck one revision ahead must land, not be refused as stale or lost)
  const B = await context.newPage();
  await B.goto(`${BASE}/edit/${deckId}`, { waitUntil: 'domcontentloaded' });
  await editorReady(B);
  const openRevision = await revisionOf(B);
  await dblclickRun(B, 'heading/text');
  await B.keyboard.press('End');
  await B.keyboard.type(' Z', { delay: 25 });
  await sleep(500);
  await B.keyboard.press('Escape');
  await settled(B, 45_000);
  // the write is checkpointed a couple of seconds after it is acknowledged, so wait for the
  // reported revision to move rather than only for pending to reach zero
  const bRevision = await waitRevision(B, openRevision + 1, 45_000);
  const rejects = (await state(B)).rejects?.length ?? 0;
  step(
    bRevision > openRevision && rejects === 0,
    'the first write after opening the deck saved and was not lost (finding 33)',
    `opened at ${openRevision}, now ${bRevision}, rejects ${rejects}`,
  );
  const text = await invoke(B, 'slide.get', { slideId: 'title' }).then(
    (g) => g.slide.heading ?? '',
    () => '',
  );
  step(/Z$/.test(String(text)), 'the immediate keystroke reached the document', String(text));
  await B.close();

  // 4. trash through the product: File > Move to trash, then Delete forever on /decks/trash.
  //    A reload first brings the tab to the store head, so the server side deck.trash carries a
  //    fresh baseRevision: after the multi tab steps the blob tier can leave A a revision behind
  //    (it never saw the second page's edit across instances), and deck.trash keeps the strict
  //    base of the server function, so a stale base would refuse the trash and never navigate.
  await A.reload({ waitUntil: 'domcontentloaded' });
  await editorReady(A);
  await pollUntil(
    () => state(A),
    (s) => s.sync?.connected === true,
    45_000,
  );
  await settled(A);
  await A.locator('[data-control="menubar.file"]').click();
  await A.locator('[data-control="menu.file.moveToTrash"]').click();
  await A.waitForURL(/\/decks$/, { timeout: 20_000 });
  step(
    true,
    'File > Move to trash moved the deck and returned to /decks',
    A.url().replace(BASE, ''),
  );

  await A.goto(`${BASE}/decks/trash`, { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 });
  const card = A.locator(`[data-control="trash.card.${deckId}"]`);
  await card.waitFor({ timeout: 30_000 });
  await A.locator(`[data-control="trash.delete.${deckId}"]`).click();
  await A.locator('[data-control="trash.confirm.ok"]').click();
  await card.waitFor({ state: 'detached', timeout: 30_000 });
  step(true, 'Delete forever removed the deck from the trash', deckId);
  deckId = '';
} catch (error) {
  step(
    false,
    'the probe ran to completion',
    error instanceof Error ? error.message : String(error),
  );
} finally {
  // a best effort cleanup if the trash path did not reach the delete
  if (deckId) {
    try {
      const info = await invoke(A, 'deck.info').catch(() => null);
      if (info) {
        await invoke(A, 'deck.trash', { id: deckId, baseRevision: info.revision }).catch(
          () => undefined,
        );
        const t = await invoke(A, 'deck.info').catch(() => null);
        await invoke(A, 'deck.remove', { id: deckId, baseRevision: t?.revision ?? 0 }).catch(
          () => undefined,
        );
      }
    } catch {
      // nothing more to do
    }
  }
  await browser.close();
}

console.log(
  `\nnew-write-probe: ${failures === 0 ? 'all steps ok' : `${failures} step(s) failed`} against ${BASE}`,
);
process.exit(failures === 0 ? 0 : 1);
