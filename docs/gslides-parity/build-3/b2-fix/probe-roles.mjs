// Fixer probe for VERIFICATION-3 findings 3, 9 and 11: the link visitor's window API (viewer and
// commenter), the Sign in row with an auth database, Show collaborator pointers flipping.
import { chromium } from 'playwright-core';
const base = process.argv[2] ?? 'http://localhost:4331';
const browser = await chromium.launch();
const ready = async (p) => {
  await p.waitForFunction(
    () => {
      try {
        return Boolean(window.turboslide?.studio);
      } catch {
        return false;
      }
    },
    null,
    { timeout: 90_000 },
  );
  await p.waitForSelector('.pt-viewer[data-settled]', { timeout: 60_000 });
};
const inv = (p, id, input) =>
  p.evaluate(([i, v]) => window.turboslide.studio.invoke(i, v), [id, input]);
const st = (p) => p.evaluate(() => window.turboslide.studio.describe().state);
const owner = (p) => p.evaluate(() => window.turboslide.studio.describe().owner);
const tryInv = (p, id, input) =>
  inv(p, id, input).then(
    (v) => ({ ok: true, v }),
    (e) => ({ ok: false, e: String(e).slice(0, 140) }),
  );
const O = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const A = await O.newPage();
await A.goto(base + '/edit/gt-brand', { waitUntil: 'domcontentloaded' });
await ready(A);
const info = await inv(A, 'deck.info');
const copy = `fix-roles-${Date.now().toString(36)}`;
await inv(A, 'deck.copy', {
  id: 'gt-brand',
  name: 'Roles probe',
  newId: copy,
  baseRevision: info.revision,
});
await A.goto(`${base}/edit/${copy}`, { waitUntil: 'domcontentloaded' });
await ready(A);
let s = await st(A);
console.log(
  'owner page: role',
  s.access.role,
  'via',
  s.access.via,
  'record revision',
  s.access.revision,
  'generalAccess',
  JSON.stringify(s.access.generalAccess),
  'signInAvailable',
  s.account.signInAvailable,
  'comments',
  JSON.stringify(s.comments).slice(0, 80),
  'inbox',
  JSON.stringify(s.inbox).slice(0, 60),
);
// finding 9: the Sign in row in the own chip's menu
await A.click('[data-control="title.account.self"]').catch(async () => {
  const el = await A.$('[data-control^="title.account"]');
  console.log(
    'own chip control not found by title.account.self; controls:',
    (
      await A.$$eval('[data-control^="title.account"]', (els) =>
        els.map((e) => e.getAttribute('data-control')),
      )
    ).join(','),
  );
});
await A.waitForTimeout(400);
const signInRow = await A.$('[data-menu-item="title.account.signIn"]');
console.log('finding 9: Sign in row present:', signInRow !== null);
await A.keyboard.press('Escape');
// finding 11: Show collaborator pointers flips
const readChecked = async () => {
  await A.click('[data-control="menubar.view"]');
  await A.waitForSelector('[role="menu"][data-level="0"]');
  await A.hover('[data-menu-item="view.livePointers"]');
  await A.waitForTimeout(400);
  const v = await A.$eval('[data-menu-item="view.livePointers.collaborators"]', (el) =>
    el.getAttribute('aria-checked'),
  );
  return v;
};
const before = await readChecked();
await A.click('[role="menu"][data-level="1"] [data-menu-item="view.livePointers.collaborators"]');
await A.waitForTimeout(300);
await A.keyboard.press('Escape');
const after = await readChecked();
await A.keyboard.press('Escape');
s = await st(A);
console.log(
  `finding 11: collaborators pointers aria-checked ${before} -> ${after}; state.presence.pointersVisible ${s.presence.pointersVisible}; presence.list.pointersVisible ${(await inv(A, 'presence.list', {})).pointersVisible}`,
);
// finding 3: the viewer and the commenter links
const viewerLink = await inv(A, 'share.setGeneralAccess', {
  id: copy,
  mode: 'link',
  role: 'viewer',
  baseRevision: (await st(A)).access.revision,
});
await A.waitForTimeout(500);
const commenterLink = await inv(A, 'share.createLink', {
  id: copy,
  role: 'commenter',
  baseRevision: (await st(A)).access.revision,
});
console.log(
  'links minted:',
  typeof viewerLink.url,
  typeof commenterLink.url,
  'record revision now',
  (await st(A)).access.revision,
);
for (const [name, link] of [
  ['viewer', viewerLink.url],
  ['commenter', commenterLink.url],
]) {
  const C = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const P = await C.newPage();
  await P.goto(link, { waitUntil: 'domcontentloaded' });
  await P.waitForURL(/\/(deck|edit)\//, { timeout: 30_000 });
  await P.goto(`${base}/edit/${copy}`, { waitUntil: 'domcontentloaded' });
  await ready(P);
  const vs = await st(P);
  const list = await tryInv(P, 'slide.list', {});
  const get = await tryInv(P, 'deck.info', {});
  const add = await tryInv(P, 'comment.add', {
    anchor: { kind: 'slide', slideId: vs.slideId },
    body: { text: `hello from the ${name}`, mentions: [] },
  });
  const write = await tryInv(P, 'slide.update', {
    slideId: vs.slideId,
    baseRevision: vs.revision,
    mutations: [],
  });
  const editMode = await P.$eval('.pt-viewer', (v) => v.getAttribute('data-edit-mode')).catch(
    () => 'none',
  );
  console.log(
    `finding 3 ${name}: owner=${await owner(P)} edit-mode=${editMode} role=${vs.access?.role} via=${vs.access?.via} presence=${vs.presence ? 'yes' : 'no'} account=${vs.account ? vs.account.trust : 'no'} comments=${vs.comments ? 'yes' : 'no'} slide.list=${list.ok ? `${list.v.slides?.length ?? list.v.length} slides` : list.e} deck.info=${get.ok} comment.add=${add.ok ? 'ok thread ' + add.v.thread?.id : add.e} slide.update=${write.ok ? 'ok (unexpected)' : 'refused'}`,
  );
  if (name === 'commenter' && add.ok) {
    await A.waitForTimeout(1500);
    const os = await st(A);
    console.log(
      '  owner sees threads:',
      os.comments.threads.length,
      'marker count',
      await A.$$eval('[data-control="comment.marker"]', (els) => els.length),
      'filmstrip chip',
      await A.$eval(
        `[data-control="filmstrip.comments.${vs.slideId}"]`,
        (el) => el.textContent,
      ).catch(() => 'none'),
    );
  }
  await C.close();
}
const fin = await inv(A, 'deck.info');
await inv(A, 'deck.trash', { id: copy, baseRevision: fin.revision }).catch((e) =>
  console.log('trash failed', String(e).slice(0, 120)),
);
await browser.close();
