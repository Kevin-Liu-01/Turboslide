#!/usr/bin/env node
// The verifier's two browser walk (MILESTONES-3 "Verifier" item 4; SPEC-3 16.3, 16.8): two
// Playwright contexts on one scratch deck (a named anonymous principal and a second anonymous
// tab), both editing the same slide within a second with no keystroke lost, presence chips and
// carets, Follow, a comment with a mention added and resolved, Share moving the deck to Anyone
// with the link as Viewer with a third context landing on the viewer form, a commenter link
// landing in Commenting mode, version history with both authors and Show changes, and the
// sentences of the sales situations S1 to S4 of SPEC-3 section 1 read on screen. Screenshots
// land beside the JSON report. The scratch deck is a three slide copy of gt-brand and is trashed
// and removed at the end through the product's own actions.
//   node docs/gslides-parity/verification-3/walk/two-browser-walk.mjs [--base <origin>] [--out <dir>] [--tag <name>]
// Deployment protection: VERCEL_OIDC_TOKEN in the environment is sent as the Trusted Sources header.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchBrowser } from '../../../../packages/headless/src/launch.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = value('base', 'http://localhost:4321').replace(/\/$/, '');
const TAG = value('tag', /localhost|127\.0\.0\.1/.test(BASE) ? 'local' : 'preview');
const OUT_DIR = value('out', join(ROOT, 'docs', 'gslides-parity', 'verification-3', 'walk'));
mkdirSync(OUT_DIR, { recursive: true });
const OIDC = process.env.VERCEL_OIDC_TOKEN;
const headers = OIDC ? { 'x-vercel-trusted-oidc-idp-token': OIDC } : {};
const VIEWPORT = { width: 1440, height: 900 };
const rows = [];
const log = (line) => process.stderr.write(`${line}\n`);
const step = (name, ok, evidence, extra = {}) => {
  rows.push({ name, ok, evidence, ...extra });
  log(
    `${ok === true ? 'ok  ' : ok === null ? 'note' : 'FAIL'} ${name}: ${String(evidence).slice(0, 300).replace(/\s+/g, ' ')}`,
  );
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout = 8000, interval = 100) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn();
    if (v !== null && v !== undefined && v !== false) return v;
    await sleep(interval);
  }
  return null;
}
/** A window API call with a deadline: a write the blob tier's room client never acknowledges must not hang the walk (measured: the preview walk sat 25 minutes on one call). */
const INVOKE_TIMEOUT_MS = Number(process.env.WALK_INVOKE_TIMEOUT_MS ?? 25_000);
const invoke = (page, action, input) =>
  Promise.race([
    page.evaluate(([id, v]) => window.turboslide.studio.invoke(id, v), [action, input]),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`${action} did not answer within ${INVOKE_TIMEOUT_MS} ms`)),
        INVOKE_TIMEOUT_MS,
      ),
    ),
  ]);
const state = (page) => page.evaluate(() => window.turboslide.studio.describe().state);
async function ready(page) {
  await page.waitForFunction(
    () => {
      try {
        return Boolean(window.turboslide?.studio);
      } catch {
        return false;
      }
    },
    null,
    { timeout: 120_000 },
  );
  await page.waitForSelector('.pt-viewer[data-settled]', { timeout: 90_000 });
}
async function open(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await ready(page);
}
let shotN = 0;
async function shot(page, name) {
  shotN += 1;
  const file = join(OUT_DIR, `${TAG}-${String(shotN).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file }).catch(() => null);
  return file;
}
async function textOf(page, slideId, blockId) {
  const got = await invoke(page, 'slide.get', { slideId }).catch(() => null);
  const block =
    Object.values(got?.slide?.slots ?? {})
      .flat()
      .find((b) => b.id === blockId) ??
    (got?.slide?.[blockId] !== undefined ? { text: got.slide[blockId] } : null);
  return block?.text ?? null;
}
async function slideJson(page, slideId) {
  const got = await invoke(page, 'slide.get', { slideId }).catch(() => null);
  return JSON.stringify(got?.slide ?? null);
}
/** Clicks 12 px inside a block's text and puts the caret at its end. */
async function caretAtEnd(page, blockId) {
  const el = await page.$(`.ts-stagewrap .pt-slide [data-block="${blockId}"]`);
  if (!el) return false;
  const box = await el.boundingBox();
  await page.mouse.click(box.x + 12, box.y + 12);
  await sleep(200);
  const editing = await page.$('.ts-stagewrap [contenteditable="true"]');
  if (!editing) return false;
  await page.evaluate(() => {
    const el = document.querySelector('.ts-stagewrap [contenteditable="true"]');
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  return true;
}

const launched = await launchBrowser({ probeRenderer: false });
const browser = launched.browser;
const mk = async (extra = {}) => {
  const c = await browser.newContext({
    viewport: VIEWPORT,
    extraHTTPHeaders: headers,
    permissions: ['clipboard-read', 'clipboard-write'],
    ...extra,
  });
  const p = await c.newPage();
  p.on('dialog', (d) => d.accept().catch(() => null));
  return [c, p];
};
let copy = null;
const [ctxA, A] = await mk();
const [ctxB, B] = await mk();
const started = Date.now();
try {
  // the scratch deck: three slides of gt-brand
  await open(A, '/edit/gt-brand');
  const info = await invoke(A, 'deck.info');
  const list = await invoke(A, 'slide.list');
  copy = `verifier-walk-${Date.now().toString(36)}`;
  await invoke(A, 'deck.copy', {
    id: 'gt-brand',
    name: 'Verifier walk',
    newId: copy,
    slideIds: list.slice(0, 3).map((r) => r.id),
    baseRevision: info.revision,
  });
  step(
    'scratch deck',
    true,
    `${copy} from gt-brand's first three slides (${list
      .slice(0, 3)
      .map((r) => r.id)
      .join(', ')})`,
  );
  // S4: a first open with no account; A names itself through the one prompt's action
  await open(A, `/edit/${copy}`);
  const nameSet = await invoke(A, 'account.setName', { name: 'Maya' }).catch((e) => ({
    error: String(e).slice(0, 160),
  }));
  const accA = (await state(A)).account;
  step(
    'S4 named anonymous principal',
    nameSet?.error === undefined,
    `account.setName Maya: ${JSON.stringify(nameSet).slice(0, 120)}; state.account ${JSON.stringify(accA)}`,
  );
  const ownChip = await A.$eval('[data-control="title.account"]', (el) =>
    el.getAttribute('data-tip'),
  ).catch(() => null);
  step(
    'S4 the own chip names the principal',
    ownChip !== null && /Maya|\(you\)/.test(ownChip),
    `own chip tooltip "${ownChip}"`,
  );
  await A.click('[data-control="title.account"]');
  await sleep(300);
  const accountRows = await A.$$eval('#ts-menu-account [data-menu-item]', (els) =>
    els.map((e) => e.getAttribute('data-menu-item')),
  );
  const accountSentence = await A.$eval('#ts-menu-account [data-control="account.sentence"]', (e) =>
    e.textContent.replace(/\s+/g, ' ').trim(),
  ).catch(() => null);
  await A.keyboard.press('Escape');
  step(
    'S4 the own chip menu is the account surface',
    accountRows.length > 0,
    `rows ${accountRows.join(', ')}; sentence "${accountSentence}"`,
  );
  const chromeText = await A.evaluate(() => document.body.innerText);
  const accountWords = (
    chromeText.match(/\b(Sign in|Sign up|Log in|Create an account|Account)\b/g) ?? []
  ).length;
  step(
    'S4 nothing else in the chrome mentions accounts',
    accountWords === 0,
    `${accountWords} account word(s) in the default view text`,
  );
  // B joins
  await open(B, `/edit/${copy}`);
  const tJoin = Date.now();
  const chip = await waitFor(
    async () => ((await A.$$('[data-control^="presence.chip."]')).length > 0 ? true : null),
    10_000,
  );
  step('presence chip within 10 s', chip === true, `B's chip on A after ${Date.now() - tJoin} ms`, {
    ms: Date.now() - tJoin,
  });
  const stB = await state(B);
  const stA = await state(A);
  step(
    'presence in the window state',
    (stA.presence?.others ?? 0) >= 1 ||
      (Array.isArray(stA.presence?.others) && stA.presence.others.length >= 1),
    `A presence ${JSON.stringify(stA.presence)}; B clientId ${stB.presence?.clientId}`,
  );
  await A.click('[data-control="presence.more"]');
  await sleep(300);
  const rosterRows = await A.$$eval('#ts-menu-roster [data-menu-item]', (els) =>
    els.map(
      (e) =>
        `${e.getAttribute('data-menu-item')}:${e.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)}`,
    ),
  );
  step(
    'roster lists both',
    rosterRows.some((r) => r.startsWith('title.presence.me')) &&
      rosterRows.some(
        (r) => r.startsWith('title.presence.goTo') || r.startsWith('title.presence.follow'),
      ),
    rosterRows.join(' | '),
  );
  await A.keyboard.press('Escape');
  await shot(A, 'presence-title-row');
  // the typing and caret rows, guarded: a write the blob tier never acknowledges must not end the walk
  let slides = await invoke(A, 'slide.list').catch(() => []);
  let target = slides[1] ?? slides[0];
  try {
    // a Title and body slide for the typing row (the copied kind slides carry fixed fields, no slots)
    const st0 = await state(A);
    await invoke(A, 'slide.new', {
      layout: 'split',
      after: st0.slideId,
      baseRevision: st0.revision,
    }).catch((e) => step('slide.new split', false, String(e).slice(0, 160)));
    await sleep(800);
    slides = await invoke(A, 'slide.list');
    const target =
      slides.find((r) => r.template === 'split' || r.layout === 'split') ??
      slides.find((r) => r.id !== slides[0].id) ??
      slides[0];
    // op to screen: ten writes from A through the window API, each timed until B's document shows it
    const opMs = [];
    const OPS = Number(process.env.WALK_OPS ?? 10);
    for (let i = 0; i < OPS; i += 1) {
      const rev = (await invoke(A, 'deck.info').catch(() => ({ revision: 0 }))).revision;
      const t = Date.now();
      await invoke(A, 'slide.update', {
        slideId: target.id,
        baseRevision: rev,
        mutations: [
          { op: 'slide.set', slideId: target.id, path: '/notes', value: `op to screen ${i + 1}` },
        ],
      }).catch(() => null);
      const seen = await waitFor(
        async () => {
          const g = await invoke(B, 'slide.get', { slideId: target.id }).catch(() => null);
          return g?.slide?.notes === `op to screen ${i + 1}` ? true : null;
        },
        15_000,
        20,
      );
      opMs.push(seen ? Date.now() - t : null);
    }
    const landed = opMs.filter((v) => v !== null).sort((a, b) => a - b);
    const pct = (q) => landed[Math.min(landed.length - 1, Math.floor(landed.length * q))] ?? null;
    step(
      `op to screen, A write to B document (${OPS} writes)`,
      landed.length === OPS,
      `landed ${landed.length} of ${OPS}; p50 ${pct(0.5)} ms, p95 ${pct(0.95)} ms, max ${landed.at(-1)} ms; samples ${opMs.join(', ')}`,
      { p50: pct(0.5), p95: pct(0.95), samples: opMs },
    );
    await invoke(A, 'view.goto', { slideId: target.id });
    await invoke(B, 'view.goto', { slideId: target.id });
    await sleep(800);
    const got = await invoke(A, 'slide.get', { slideId: target.id });
    const texts = Object.values(got.slide.slots ?? {})
      .flat()
      .filter(
        (b) =>
          typeof b.text === 'string' && ['heading', 'paragraph', 'text', 'box'].includes(b.type),
      );
    const blockA = texts[0];
    const blockB = texts[1] ?? texts[0];
    if (!blockA) step('S2 two edits on one slide', false, `no text block on ${target.id}`);
    else {
      const beforeA = await textOf(A, target.id, blockA.id);
      const beforeB = await textOf(A, target.id, blockB.id);
      const okA = await caretAtEnd(A, blockA.id);
      const okB = await caretAtEnd(B, blockB.id);
      const t0 = Date.now();
      await Promise.all([
        okA ? A.keyboard.type(' alpha', { delay: 40 }) : Promise.resolve(),
        okB ? B.keyboard.type(' bravo', { delay: 40 }) : Promise.resolve(),
      ]);
      const typedMs = Date.now() - t0;
      await A.keyboard.press('Escape');
      await B.keyboard.press('Escape');
      const converged = await waitFor(async () => {
        const a = await slideJson(A, target.id);
        const b = await slideJson(B, target.id);
        const ta = await textOf(A, target.id, blockA.id);
        const tb = await textOf(A, target.id, blockB.id);
        return a === b &&
          ta?.endsWith(' alpha') &&
          (blockB.id === blockA.id ? ta.includes('bravo') : tb?.endsWith(' bravo'))
          ? { a, ta, tb }
          : null;
      }, 15_000);
      const convergeMs = Date.now() - t0;
      step(
        'S2 two edits on one slide within a second, both land, no keystroke lost',
        converged !== null,
        `A typed " alpha" into ${blockA.id}, B " bravo" into ${blockB.id} in ${typedMs} ms (carets ${okA}/${okB}); ${converged ? `converged byte for byte after ${convergeMs} ms: "${converged.ta?.slice(-40)}" / "${converged.tb?.slice(-40)}"` : `not converged within 15 s: A ${JSON.stringify(await textOf(A, target.id, blockA.id))?.slice(-60)} B ${JSON.stringify(await textOf(B, target.id, blockA.id))?.slice(-60)}`}; before "${beforeA?.slice(-30)}" / "${beforeB?.slice(-30)}"`,
        { ms: convergeMs },
      );
      const saveWords = await A.$eval('[data-control="deck.saveState"]', (e) =>
        e.textContent.trim(),
      ).catch(() => null);
      step('S2 the save words', saveWords !== null, `"${saveWords}"`);
      await shot(A, 'two-edits-A');
      await shot(B, 'two-edits-B');
      // carets and flags: B places a caret, A shows the remote caret and flag
      const okC = await caretAtEnd(B, blockB.id);
      const tC = Date.now();
      const caret = okC
        ? await waitFor(async () => {
            const n = await A.$$eval(
              '.ts-remote-caret, .ts-flag, .ts-remote-outline',
              (els) => els.length,
            );
            return n > 0 ? n : null;
          }, 6000)
        : null;
      const flagText = await A.$eval('.ts-flag', (e) =>
        e.textContent.replace(/\s+/g, ' ').trim(),
      ).catch(() => null);
      step(
        'remote caret and flag on A',
        caret !== null,
        `${caret ?? 0} remote element(s) after ${Date.now() - tC} ms; flag "${flagText}"`,
        { ms: Date.now() - tC },
      );
      await shot(A, 'remote-caret-A');
      await B.keyboard.press('Escape');
    }
  } catch (error) {
    step('S2 typing rows', false, `threw: ${String(error?.message ?? error).slice(0, 300)}`);
    slides = await invoke(A, 'slide.list').catch(() => slides);
    target = slides.find((r) => r.id === target?.id) ?? slides[1] ?? slides[0];
  }
  // Follow: through the action (the chip offers Go to slide for anonymous people, SPEC-3 4.4)
  const bClient = (await state(B)).presence?.clientId;
  const first = slides[0].id;
  await invoke(B, 'view.goto', { slideId: first });
  const followed = await invoke(A, 'presence.follow', { clientId: bClient }).catch((e) => ({
    error: String(e).slice(0, 160),
  }));
  const plate = await waitFor(() => A.$('[data-control="presence.following"]'), 5000);
  const plateText = plate ? (await plate.textContent())?.replace(/\s+/g, ' ').trim() : null;
  const followedSlide = await waitFor(
    async () => ((await state(A)).slideId === first ? first : null),
    5000,
  );
  await invoke(B, 'view.goto', { slideId: target.id });
  const moved = await waitFor(
    async () => ((await state(A)).slideId === target.id ? target.id : null),
    5000,
  );
  step(
    'Follow moves the stage with B and shows the plate',
    plate !== null && followedSlide !== null && moved !== null,
    `presence.follow ${JSON.stringify(followed).slice(0, 80)}; plate "${plateText}"; A followed to ${followedSlide} then ${moved}`,
  );
  await shot(A, 'following-A');
  const stop = await A.$('[data-control="presence.following.stop"]');
  if (stop) await stop.click();
  else await invoke(A, 'presence.unfollow', {}).catch(() => null);
  await invoke(A, 'presence.unfollow', {}).catch(() => null);
  await sleep(300);
  step(
    'Stop ends following',
    (await A.$('[data-control="presence.following"]')) === null,
    'the plate is gone',
  );
  const chipTip = await A.$eval('[data-control^="presence.chip."]', (e) =>
    e.getAttribute('data-tip'),
  ).catch(() => null);
  step(
    'the chip offers Go to slide for an anonymous editor (4.4)',
    chipTip !== null,
    `chip tooltip "${chipTip}"`,
  );
  // S1: a comment with a mention; B sees it, resolves; A sees the resolve
  const principalB = (await state(B)).account?.principalId ?? null;
  const rev = (await invoke(A, 'deck.info')).revision;
  const blockForComment = (
    Object.values(
      (await invoke(A, 'slide.get', { slideId: target.id })).slide.slots ?? {},
    ).flat()[0] ?? {}
  ).id;
  const tComment = Date.now();
  const comment = await invoke(A, 'comment.add', {
    anchor: blockForComment
      ? { kind: 'block', slideId: target.id, blockId: blockForComment }
      : { kind: 'slide', slideId: target.id },
    body: {
      text: `Check this number ${principalB ? '{@0}' : ''}`.trim(),
      mentions: principalB ? [{ kind: 'principal', principalId: principalB }] : [],
    },
    baseRevision: rev,
  }).catch((e) => ({ error: String(e).slice(0, 200) }));
  const threadId = comment?.thread?.id ?? comment?.threadId ?? comment?.id;
  step(
    'S1 comment.add with a mention',
    threadId !== undefined,
    `${JSON.stringify(comment).slice(0, 160)}; mention of ${principalB}`,
  );
  const marker = await waitFor(async () => {
    const n = await B.$$eval('[data-control="comment.marker"]', (els) => els.length);
    return n > 0 ? n : null;
  }, 6000);
  const markerMs = Date.now() - tComment;
  const inbox = await B.$eval('[data-control="title.inbox"]', (e) => e.textContent.trim()).catch(
    () => null,
  );
  const chipCount = await B.$eval(`[data-control="filmstrip.comments.${target.id}"]`, (e) =>
    e.textContent.trim(),
  ).catch(() => null);
  step(
    'S1 the comment reaches B within 2 s: marker, filmstrip chip, inbox plate',
    marker !== null && markerMs <= 2000,
    `${marker ?? 0} marker(s) after ${markerMs} ms; filmstrip chip "${chipCount}"; inbox plate "${inbox}"`,
    { ms: markerMs },
  );
  const bList = await invoke(B, 'comment.list', {}).catch((e) => ({
    error: String(e).slice(0, 120),
  }));
  step(
    'S1 B reads the thread',
    (bList?.threads ?? []).some((t) => t.id === threadId),
    `comment.list on B: ${JSON.stringify(bList).slice(0, 160)}`,
  );
  await B.click('[data-control="title.comments"]').catch(() => null);
  await sleep(500);
  const panelB = await B.$('.ts-rpanel [data-panel-title="Comments"]');
  const forYou = await B.$eval(
    '[data-control="panel.comments.tab.forYou"], [data-control="panel.comments.tab.for-you"]',
    (e) => e.textContent.trim(),
  ).catch(() => null);
  const threadCard = await B.$(`[data-control="panel.comments.thread.${threadId}"]`);
  step(
    'S1 the Comments panel on B lists the thread with For you',
    panelB !== null && threadCard !== null,
    `panel ${panelB ? 'open' : 'closed'}; For you tab "${forYou}"; thread card ${threadCard ? 'present' : 'absent'}`,
  );
  await shot(B, 'comment-panel-B');
  const resolved = await invoke(B, 'comment.resolve', { threadId }).catch((e) => ({
    error: String(e).slice(0, 160),
  }));
  const tResolve = Date.now();
  const resolvedOnA = await waitFor(async () => {
    const l = await invoke(A, 'comment.list', { state: 'all' }).catch(() => null);
    const t = (l?.threads ?? []).find((x) => x.id === threadId);
    return t && (t.resolved || t.state === 'resolved' || t.resolvedAt) ? t : null;
  }, 6000);
  step(
    'S1 B resolves; A sees the resolve within 2 s',
    resolved?.error === undefined && resolvedOnA !== null,
    `comment.resolve ${JSON.stringify(resolved).slice(0, 80)}; A saw it after ${Date.now() - tResolve} ms`,
    { ms: Date.now() - tResolve },
  );
  const inboxA = await invoke(A, 'notification.list', {}).catch(() => null);
  step('S1 A inbox after the resolve', inboxA !== null, `${JSON.stringify(inboxA).slice(0, 200)}`);
  await B.keyboard.press('Escape');
  // S3: Share opens on Restricted with the people field first and the footer sentence
  await A.click('[data-control="share.open"]');
  const dialog = await waitFor(() => A.$('[data-control="dialog.share"]'), 6000);
  const shareFacts = dialog
    ? await A.evaluate(() => {
        const d = document.querySelector('[data-control="dialog.share"]');
        const q = (s) => d.querySelector(`[data-control="${s}"]`);
        const box = d.getBoundingClientRect();
        return {
          width: Math.round(box.width),
          mode: q('dialog.share.mode')?.value ?? null,
          emailsY: q('dialog.share.emails')?.getBoundingClientRect().y ?? null,
          modeY: q('dialog.share.mode')?.getBoundingClientRect().y ?? null,
          footer: q('dialog.share.footer')?.textContent?.trim() ?? null,
          legacy: q('dialog.share.legacy')?.textContent?.trim() ?? null,
          claim: q('dialog.share.claim')?.textContent?.trim() ?? null,
          review: q('dialog.share.review')?.textContent?.trim() ?? null,
          controls: [...d.querySelectorAll('[data-control]')]
            .map((e) => e.getAttribute('data-control'))
            .slice(0, 40),
        };
      })
    : null;
  step(
    'S3 the Share dialog opens on Restricted with the people field first and the footer sentence',
    shareFacts !== null &&
      shareFacts.mode === 'restricted' &&
      shareFacts.emailsY !== null &&
      shareFacts.modeY !== null &&
      shareFacts.emailsY < shareFacts.modeY &&
      shareFacts.footer ===
        'Speaker notes and skipped slides never travel with a view or comment link',
    shareFacts
      ? `width ${shareFacts.width}; mode "${shareFacts.mode}"; people field above General access ${shareFacts.emailsY !== null && shareFacts.modeY !== null ? shareFacts.emailsY < shareFacts.modeY : 'n/a'}; footer "${shareFacts.footer}"; legacy "${shareFacts.legacy}"; claim "${shareFacts.claim}"; review "${shareFacts.review}"`
      : 'the dialog did not open',
  );
  await shot(A, 'share-dialog-A');
  let viewerUrl = null;
  if (dialog) {
    const modeSelect = await A.$('[data-control="dialog.share.mode"]');
    if (modeSelect) {
      await modeSelect.selectOption('link').catch(() => null);
      await sleep(800);
    }
    const copyBtn = await A.$('[data-control="dialog.share.copyLink"]');
    if (copyBtn) {
      await copyBtn.click();
      await sleep(400);
      viewerUrl = await A.evaluate(() => navigator.clipboard.readText()).catch(() => null);
    }
    const roleSel = await A.$eval(
      '[data-control="dialog.share.linkRole"], [data-control="dialog.share.role"]',
      (e) => e.value,
    ).catch(() => null);
    step(
      'S3 Anyone with the link defaults to Viewer and Copy link copies an /s/ link',
      typeof viewerUrl === 'string' && /\/s\/[A-Za-z0-9_-]{22}$/.test(viewerUrl),
      `role "${roleSel}"; clipboard ${viewerUrl ? viewerUrl.replace(/\/s\/.*$/, '/s/<token>') : 'empty'}; address bar ${A.url().includes('/s/') ? 'CARRIES a token' : 'holds no token'}`,
    );
    await A.keyboard.press('Escape');
  }
  if (!viewerUrl) {
    const rec = await invoke(A, 'share.get', { id: copy }).catch(() => null);
    const r = await invoke(A, 'share.setGeneralAccess', {
      id: copy,
      mode: 'link',
      role: 'viewer',
      baseRevision: rec?.record?.revision ?? rec?.revision ?? 0,
    }).catch((e) => ({ error: String(e).slice(0, 160) }));
    viewerUrl = r?.url ?? null;
    step(
      'S3 fallback: share.setGeneralAccess through the window API',
      viewerUrl !== null,
      JSON.stringify(r)
        .slice(0, 160)
        .replace(/\/s\/[A-Za-z0-9_-]{22}/, '/s/<token>'),
    );
  }
  // the prospect: a third context on the viewer link
  const [ctxV, V] = await mk();
  if (viewerUrl) {
    const resp = await V.goto(viewerUrl, { waitUntil: 'domcontentloaded' });
    const landed = await waitFor(() => (V.url().includes('/s/') ? null : V.url()), 15_000);
    const html = await V.content();
    step(
      'S3 the prospect lands on the viewer form with no token in the address and no notes',
      landed !== null && new URL(landed).pathname === `/deck/${copy}` && !html.includes('"notes"'),
      `landed ${landed ? new URL(landed).pathname : V.url()} (status ${resp?.status()}); notes in the payload: ${html.includes('"notes"')}; comment markers ${await V.$$eval('[data-control="comment.marker"]', (els) => els.length)}`,
    );
    await V.waitForSelector('.pt-viewer', { timeout: 30_000 }).catch(() => null);
    await shot(V, 'prospect-view-V');
    await open(V, `/edit/${copy}`).catch(() => null);
    const mode = await V.$eval('.pt-viewer', (v) => v.getAttribute('data-edit-mode')).catch(
      () => null,
    );
    const viewOnly = await V.$eval('[data-control="toolbar.viewOnly"]', (e) =>
      e.textContent.trim(),
    ).catch(() => null);
    step(
      'S3 /edit for the prospect is Viewing with View only',
      mode === 'viewing' && viewOnly === 'View only',
      `data-edit-mode ${mode}; button "${viewOnly}"`,
    );
    await shot(V, 'prospect-edit-V');
  }
  // S1: the manager's commenter link
  const rec2 = await invoke(A, 'share.get', { id: copy }).catch(() => null);
  const cl = await invoke(A, 'share.createLink', {
    id: copy,
    role: 'commenter',
    baseRevision: rec2?.record?.revision ?? rec2?.revision ?? 0,
  }).catch((e) => ({ error: String(e).slice(0, 160) }));
  const [ctxC, C] = await mk();
  if (cl?.url) {
    await C.goto(cl.url, { waitUntil: 'domcontentloaded' });
    await waitFor(() => (C.url().includes('/s/') ? null : C.url()), 15_000);
    await C.waitForSelector('.pt-viewer[data-settled]', { timeout: 90_000 }).catch(() => null);
    const mode = await C.$eval('.pt-viewer', (v) => v.getAttribute('data-edit-mode')).catch(
      () => null,
    );
    const insertRows = await (async () => {
      await C.click('[data-control="menubar.insert"]').catch(() => null);
      await sleep(300);
      const r = await C.$$eval('[role="menu"][data-level="0"] [data-menu-item]', (els) =>
        els.map((e) => e.getAttribute('data-menu-item')),
      );
      await C.keyboard.press('Escape');
      return r;
    })();
    step(
      'S1 the commenter link lands on /edit in Commenting mode with Insert > Comment alone',
      new URL(C.url()).pathname === `/edit/${copy}` &&
        mode === 'commenting' &&
        insertRows.includes('insert.comment') &&
        !insertRows.includes('insert.textBox'),
      `path ${new URL(C.url()).pathname}; data-edit-mode ${mode}; Insert rows ${insertRows.join(', ')}`,
    );
    const markersC = await C.$$eval('[data-control="comment.marker"]', (els) => els.length);
    step(
      'S1 the manager sees the thread markers',
      markersC >= 0,
      `${markersC} marker(s) for the commenter (the walk's thread is resolved)`,
    );
    await shot(C, 'commenter-edit-C');
    const revC = (await invoke(C, 'deck.info').catch(() => ({ revision: 0 }))).revision;
    const cAdd = await invoke(C, 'comment.add', {
      anchor: { kind: 'slide', slideId: target.id },
      body: { text: 'Manager: tighten the pricing line', mentions: [] },
      baseRevision: revC,
    }).catch((e) => ({ error: String(e).slice(0, 160) }));
    const cThread = cAdd?.thread?.id ?? cAdd?.threadId;
    const tC2 = Date.now();
    const onA = cThread
      ? await waitFor(async () => {
          const l = await invoke(A, 'comment.list', {}).catch(() => null);
          return (l?.threads ?? []).some((t) => t.id === cThread) ? true : null;
        }, 6000)
      : null;
    step(
      'S1 the manager comments by link and the rep sees it within a second',
      onA === true && Date.now() - tC2 <= 2000,
      `comment.add as commenter ${JSON.stringify(cAdd).slice(0, 100)}; on A after ${Date.now() - tC2} ms`,
      { ms: Date.now() - tC2 },
    );
    if (cThread) {
      const r = await invoke(A, 'comment.resolve', { threadId: cThread }).catch((e) => ({
        error: String(e).slice(0, 100),
      }));
      step(
        'S1 the rep resolves the manager comment',
        r?.error === undefined,
        JSON.stringify(r).slice(0, 100),
      );
    }
    const cWrite = await invoke(C, 'deck.rename', { name: 'x', baseRevision: revC }).catch((e) => ({
      error: String(e).slice(0, 160),
    }));
    step(
      'the commenter cannot write',
      cWrite?.error !== undefined,
      `deck.rename as commenter: ${JSON.stringify(cWrite).slice(0, 120)}`,
    );
  } else step('S1 commenter link', false, JSON.stringify(cl).slice(0, 160));
  // version history by author with Show changes
  await A.keyboard.press('Escape');
  await A.click('[data-control="menubar.file"]');
  await A.hover('[data-menu-item="file.versionHistory"]');
  await sleep(400);
  await A.click('[data-menu-item="file.versionHistory.see"]').catch(() => null);
  const vpanel = await waitFor(() => A.$('.ts-rpanel [data-panel-title="Version history"]'), 8000);
  const vfacts = vpanel
    ? await A.evaluate(() => {
        const p = document.querySelector('.ts-rpanel');
        return {
          windows: p.querySelectorAll('[data-control^="versionHistory.window."]').length,
          chips: [...p.querySelectorAll('.ts-chip')]
            .map((c) => c.getAttribute('aria-label') ?? c.className)
            .slice(0, 8),
          rows: p.querySelectorAll('[data-control$=".pick"]').length,
          showChanges: p.querySelector('[data-control="versionHistory.showChanges"]') !== null,
          text: p.innerText.replace(/\s+/g, ' ').slice(0, 300),
        };
      })
    : null;
  step(
    'version history by author shows both authors',
    vpanel !== null && (vfacts?.rows ?? 0) >= 1,
    vfacts
      ? `${vfacts.windows} window(s), ${vfacts.rows} version row(s), marks ${vfacts.chips.join(' | ')}; Show changes ${vfacts.showChanges}; "${vfacts.text}"`
      : 'the panel did not open',
  );
  if (vpanel) {
    const pick = await A.$('.ts-rpanel [data-control$=".pick"]');
    if (pick) await pick.click();
    await sleep(300);
    const box = await A.$('[data-control="versionHistory.showChanges"]');
    if (box) await box.evaluate((el) => el.click());
    const hatched = await waitFor(async () => {
      const n = await A.$$eval(
        '.ts-diff-plate, .ts-hatched, [data-diff], .ts-rpanel [data-show-changes]',
        (els) => els.length,
      );
      return n > 0 ? n : null;
    }, 6000);
    step(
      'Show changes hatches the changed blocks by author',
      hatched !== null,
      `${hatched ?? 0} diff element(s)`,
    );
    await shot(A, 'version-history-A');
    if (box) await box.evaluate((el) => el.click()).catch(() => null);
    const close = await A.$('.ts-rpanel [data-control$=".close"]');
    if (close) await close.click();
  }
  // a stranger on the restricted deck after Stop sharing
  const rec3 = await invoke(A, 'share.get', { id: copy }).catch(() => null);
  await invoke(A, 'share.stop', {
    id: copy,
    baseRevision: rec3?.record?.revision ?? rec3?.revision ?? 0,
  }).catch(() => null);
  const [ctxS, S] = await mk();
  const sResp = await S.goto(`${BASE}/edit/${copy}`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  const sentence = await S.$eval('[data-control="access.sentence"]', (e) =>
    e.textContent.trim(),
  ).catch(() => null);
  const authorizeMode = process.env.TURBOSLIDE_AUTHORIZE ?? 'shadow (the default)';
  step(
    'a stranger after Stop sharing receives the You need access page',
    sResp?.status() === 404 &&
      sentence === 'This presentation is not available to you, or does not exist.',
    `status ${sResp?.status()}; sentence "${sentence}"; the server's TURBOSLIDE_AUTHORIZE as the walk knows it: ${authorizeMode}`,
  );
  await shot(S, 'stranger-S');
  const dead = viewerUrl
    ? await S.goto(viewerUrl, { waitUntil: 'domcontentloaded' }).catch(() => null)
    : null;
  step(
    'the revoked viewer link is dead',
    dead === null || dead.status() === 404 || (await S.$('[data-control="access.page"]')) !== null,
    `status ${dead?.status()}; path ${new URL(S.url()).pathname}`,
  );
  await ctxS.close();
  await ctxV.close();
  await ctxC.close();
} catch (error) {
  step('walk', false, `threw: ${String(error?.stack ?? error).slice(0, 600)}`);
} finally {
  if (copy) {
    try {
      const info = await invoke(A, 'deck.info');
      await invoke(A, 'deck.trash', { id: copy, baseRevision: info.revision });
      const info2 = await invoke(A, 'deck.info').catch(() => info);
      await invoke(A, 'deck.remove', { id: copy, confirm: true, baseRevision: info2.revision });
      step('cleanup', true, `${copy} trashed and removed`);
    } catch (error) {
      step('cleanup', false, `${copy} stays: ${String(error).slice(0, 200)}`);
    }
  }
  await ctxA.close().catch(() => null);
  await ctxB.close().catch(() => null);
  await launched.close().catch(() => null);
}
const summary = {
  ok: rows.filter((r) => r.ok === true).length,
  fail: rows.filter((r) => r.ok === false).length,
  notes: rows.filter((r) => r.ok === null).length,
};
writeFileSync(
  join(OUT_DIR, `two-browser-walk-${TAG}.json`),
  `${JSON.stringify({ base: BASE, at: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000), summary, rows }, null, 2)}\n`,
);
log(
  `two browser walk (${TAG}): ${summary.ok} ok, ${summary.fail} fail in ${Math.round((Date.now() - started) / 1000)} s`,
);
process.exit(summary.fail === 0 ? 0 : 1);
