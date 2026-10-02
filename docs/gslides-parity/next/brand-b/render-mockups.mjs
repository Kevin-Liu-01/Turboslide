// Brand direction B: the static mockups and their pictures (docs/gslides-parity/next/brand-b.md).
// Writes mockups/*.html from the templates below, with the product's own sheets linked by path
// (packages/fonts/src/inter.css, packages/chrome/src/tokens.css, packages/chrome/src/brand.css),
// the marks of build-marks.mjs inlined so they take currentColor, and the chrome's Heroicons
// copied from packages/chrome/src/icons.tsx into one sprite. Then renders every page with
// Playwright (playwright-core from the worktree's node_modules) to pictures/ at 1440 by 900 and
// 390 by 844 in both themes, plus the mark sheet and the icon PNGs.
//
//   node docs/gslides-parity/next/brand-b/build-marks.mjs
//   node docs/gslides-parity/next/brand-b/render-mockups.mjs
//
// A page reads ?theme=light|dark and stamps data-theme on the root before first paint, as the
// product's boot script does; the tokens' dark remap does the rest. No server is needed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from '/Users/kevinliu/repos/Turboslide-next/node_modules/playwright-core/index.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../../..');
const MOCK = join(HERE, 'mockups');
const PICS = join(HERE, 'pictures');
const MARKS = join(HERE, 'marks');
mkdirSync(MOCK, { recursive: true });
mkdirSync(PICS, { recursive: true });

/* ---------- the parts ---------- */

/** a mark file inline, its fixed label kept, sized by CSS */
const inlineMark = (file, cls) =>
  readFileSync(join(MARKS, file), 'utf8')
    .trim()
    .replace('<svg ', `<svg class="${cls}" `);
const WORDMARK = (cls = 'wm') => inlineMark('wordmark.svg', cls);
const MONOGRAM = (cls = 'mono') => inlineMark('monogram.svg', cls);

/** the chrome's Heroicons by name, read from icons.tsx (the only icon family in chrome) */
const ICONS_SRC = readFileSync(join(ROOT, 'packages/chrome/src/icons.tsx'), 'utf8');
function iconPaths(name) {
  const key = /^[a-z]+$/.test(name) ? name : `'${name}'`;
  let at = ICONS_SRC.indexOf(`\n  ${key}: [`);
  let end;
  if (at >= 0) {
    /* an entry on one line ends with '}],' on that line */
    const line = ICONS_SRC.indexOf('\n', at + 1);
    const oneLine = ICONS_SRC.slice(at, line).trimEnd().endsWith('}],');
    end = oneLine ? line : ICONS_SRC.indexOf('\n  ],', at);
  }
  else {
    const alias = new RegExp(`\\n  ${key}: ([A-Z0-9_]+),`).exec(ICONS_SRC);
    if (!alias) throw new Error(`no icon ${name}`);
    at = ICONS_SRC.indexOf(`const ${alias[1]}: readonly IconPath[] = [`);
    end = ICONS_SRC.indexOf('\n];', at);
  }
  const body = ICONS_SRC.slice(at, end);
  const out = [];
  for (const m of body.matchAll(/\{\s*d:\s*'([^']+)'([^}]*)\}/g)) out.push({ d: m[1], evenodd: /evenodd:\s*true/.test(m[2]) });
  if (!out.length) throw new Error(`no paths for ${name}`);
  return out;
}
const ICON_NAMES = [
  'search', 'plus', 'chevron-down', 'chevron-up', 'arrow-uturn-left', 'arrow-uturn-right', 'printer',
  'paint-brush', 'cursor-arrow', 'photo', 'square-2-stack', 'minus', 'chat-bubble-left', 'chat',
  'view-columns', 'play', 'lock-closed', 'ellipsis-vertical', 'ellipsis-horizontal', 'sun', 'moon',
  'squares-2x2', 'queue-list', 'document', 'close', 'external',
];
const SPRITE =
  '<svg width="0" height="0" style="position:absolute" aria-hidden="true">' +
  ICON_NAMES.map(
    (n) =>
      `<symbol id="i-${n}" viewBox="0 0 20 20">${iconPaths(n)
        .map((p) => `<path d="${p.d}"${p.evenodd ? ' fill-rule="evenodd" clip-rule="evenodd"' : ''}/>`)
        .join('')}</symbol>`,
  ).join('') +
  /* the text box glyph: the toolbar draws a T, which Heroicons does not have */
  '<symbol id="i-textbox" viewBox="0 0 20 20"><path d="M4 3.5h12V6h-4.75v10.5h-2.5V6H4z"/></symbol>' +
  '</svg>';
const ic = (n, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;

/** the GT mark of the theme sprite: GT template content only, never Turboslide chrome */
const SPRITE_TS = readFileSync(join(ROOT, 'packages/theme/src/sprite.ts'), 'utf8');
const GT_BODY = /'gt-mark': \{[^}]*body: '([^']+)'/.exec(SPRITE_TS)[1];
const GT_MARK = (cls) => `<svg class="${cls}" viewBox="-8 214 1213 771" fill="currentColor" aria-hidden="true">${GT_BODY}</svg>`;

/** Google's standard G (the brand mark class; Google's branding page requires it unchanged) */
const GOOGLE_G =
  '<svg class="g" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

/** the blank template's title slide on the gt-ink-paper sheet, without the GT logo and wordmark */
function slide({ title = 'Click to add title', sub = 'Click to add subtitle', placeholder = true, cls = 'sheet' } = {}) {
  const tone = placeholder ? '#8a8f98' : '#070707';
  const cross = (x, y) => `<path d="M${x - 5.5} ${y}h11M${x} ${y - 5.5}v11"/>`;
  return `<svg class="${cls}" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <rect width="1600" height="900" fill="#ffffff"/>
  <g stroke="rgba(7,7,7,0.18)" stroke-width="1" vector-effect="non-scaling-stroke" fill="none">
    <path vector-effect="non-scaling-stroke" d="M56 0V900M1544 0V900M0 56H1600M0 844H1600"/>
  </g>
  <g stroke="rgba(7,7,7,0.38)" fill="none">${[cross(56, 56), cross(1544, 56), cross(56, 844), cross(1544, 844)].join('')}</g>
  <text x="137" y="512" font-family="Inter" font-weight="500" font-size="88" letter-spacing="-2.2" fill="${tone}" style="font-feature-settings:'cv11','ss01'">${title}</text>
  <text x="139" y="584" font-family="Inter" font-weight="400" font-size="26" fill="${tone}">${sub}</text>
  <text x="1508" y="878" font-family="Inter" font-size="13" letter-spacing="0.26" fill="#8a8f98" text-anchor="end" style="font-variant-numeric:tabular-nums">01 / 01</text>
</svg>`;
}

/* ---------- the page frame ---------- */

const UP = '../../../../..';
function page(title, css, body, { themed = [] } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<script>document.documentElement.dataset.theme = new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light';</script>
<link rel="stylesheet" href="${UP}/packages/fonts/src/inter.css">
<link rel="stylesheet" href="${UP}/packages/chrome/src/tokens.css">
<link rel="stylesheet" href="${UP}/packages/chrome/src/brand.css">
<style>
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; background: var(--pt-paper); color: var(--pt-ink); }
body { font-family: var(--pt-text); font-size: 13px; line-height: 1.4; -webkit-font-smoothing: antialiased; }
h1, h2, h3, .wm-text { font-feature-settings: 'cv11', 'ss01'; text-wrap: balance; }
.ic { width: 16px; height: 16px; fill: currentColor; flex: none; display: block; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 32px; padding: 0 12px; border: 1px solid var(--pt-hair); background: var(--pt-paper); color: var(--pt-ink); font: 500 13px/1 var(--pt-text); white-space: nowrap; }
.btn.solid { background: var(--pt-ink); color: var(--pt-paper); border-color: var(--pt-ink); }
.btn.quiet { border-color: transparent; background: transparent; }
.ib { width: 32px; height: 32px; display: inline-grid; place-items: center; border: 1px solid transparent; background: transparent; color: var(--pt-ink-2); padding: 0; }
/* the registration cross where a rule meets a rail: 9 px, 1 px arms (slide 49) */
.x { position: absolute; width: 9px; height: 9px; pointer-events: none; }
.x::before { content: ''; position: absolute; left: 4px; top: 0; width: 1px; height: 9px; background: var(--pt-cross); }
.x::after { content: ''; position: absolute; left: 0; top: 4px; width: 9px; height: 1px; background: var(--pt-cross); }
${css}
</style>
</head>
<body>
${SPRITE}
${body}
<script>
for (const img of document.querySelectorAll('img[data-light]')) img.src = img.dataset[document.documentElement.dataset.theme];
</script>
</body>
</html>
`;
}

/* ---------- the editor's default view ---------- */

const EDITOR_CSS = `
.ed { display: grid; grid-template-rows: 44px 28px 40px minmax(0, 1fr); height: 100vh; }
.title { display: flex; align-items: center; gap: 12px; padding: 0 12px 0 14px; min-width: 0; }
.title .home { color: var(--pt-ink); display: flex; align-items: center; height: 32px; }
.title .home .mono { height: 22px; width: auto; }
.title .name { font-size: 15px; font-weight: 500; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 96px; }
.title .sp { flex: 1; }
.title .right { display: flex; align-items: center; gap: 6px; }
.title .rule { width: 1px; height: 20px; background: var(--pt-hair); margin: 0 4px; }
.present { display: inline-flex; height: 32px; border-radius: 8px; overflow: hidden; background: var(--pt-ink); color: var(--pt-paper); font-weight: 500; }
.present .go { display: flex; align-items: center; gap: 8px; padding: 0 12px 0 14px; }
.present .go .ic { width: 12px; height: 12px; }
.present .more { width: 30px; display: grid; place-items: center; border-left: 1px solid var(--pt-hair-on-ink); }
.present .more .ic { width: 14px; height: 14px; }
.menus { display: flex; align-items: center; padding: 0 6px; }
.menus span { padding: 4px 8px; }
.menus .ib { width: 28px; height: 24px; display: none; }
.tools { display: flex; align-items: center; gap: 2px; padding: 0 8px; border-top: 1px solid var(--pt-hair); border-bottom: 1px solid var(--pt-hair); min-width: 0; overflow: hidden; }
.tools .ib { width: 28px; height: 28px; }
.tools .dd { display: inline-flex; align-items: center; color: var(--pt-ink-2); }
.tools .dd .ic + .ic { width: 12px; height: 12px; margin-left: -2px; margin-right: 2px; }
.tools .div { width: 1px; height: 20px; background: var(--pt-hair); margin: 0 6px; flex: none; }
.tools .word { display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 8px; color: var(--pt-ink); white-space: nowrap; }
.tools .word .ic { width: 12px; height: 12px; color: var(--pt-ink-2); }
.tools .sp { flex: 1; }
.tools .phone-tools { display: none; }
.body { display: grid; grid-template-columns: 256px minmax(0, 1fr); min-height: 0; }
.strip { border-right: 1px solid var(--pt-hair); padding: 14px 16px 0 10px; display: flex; flex-direction: column; gap: 14px; }
.card { display: grid; grid-template-columns: 22px 1fr; gap: 8px; align-items: start; }
.card .n { font-size: 12px; color: var(--pt-ink-2); text-align: right; font-variant-numeric: tabular-nums; padding-top: 2px; }
.card .th { display: block; outline: 2px solid var(--pt-ink); outline-offset: 0; }
.card .th .sheet { display: block; width: 100%; height: auto; }
.work { display: grid; grid-template-rows: minmax(0, 1fr) 64px; min-height: 0; }
.stage { background: var(--pt-plate); display: grid; place-items: center; min-height: 0; padding: 28px; }
.stage .sheet { display: block; width: min(100%, calc((100vh - 112px - 64px - 56px) * 16 / 9)); aspect-ratio: 16 / 9; height: auto; outline: 1px solid var(--pt-hair); }
.notes { border-top: 1px solid var(--pt-hair); padding: 14px 28px; color: var(--pt-titanium); }
@media (max-width: 600px) {
  .ed { grid-template-rows: 44px 32px 40px minmax(0, 1fr); }
  .title { gap: 8px; padding: 0 6px 0 12px; }
  .title .name { font-size: 14px; flex: 1; }
  .title .sp, .title .wide { display: none; }
  .present .go { padding: 0 10px; }
  .present .go span, .present .more { display: none; }
  .menus { overflow: hidden; }
  .menus .phone-hide { display: none; }
  .menus .ib { display: inline-grid; margin-left: auto; }
  .tools .wide { display: none; }
  .tools .phone-tools { display: inline-grid; }
  .body { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) auto; }
  .body .work { order: 1; }
  .strip { order: 2; border-right: 0; border-top: 1px solid var(--pt-hair); flex-direction: row; padding: 12px 16px; gap: 12px; }
  .card { grid-template-columns: 1fr; width: 112px; }
  .card .n { display: none; }
  .stage { padding: 16px; }
  .stage .sheet { width: 100%; }
  .work { grid-template-rows: minmax(0, 1fr) 56px; }
  .notes { padding: 14px 16px; }
}
`;
const editorBody = () => `
<div class="ed">
  <header class="title">
    <a class="home" title="Turboslide home">${MONOGRAM('mono')}</a>
    <span class="name">Untitled presentation</span>
    <span class="sp"></span>
    <span class="right">
      <button class="btn quiet wide">Assist</button>
      <button class="ib wide" title="Show all comments">${ic('chat')}</button>
      <button class="ib wide" title="Show side panel">${ic('view-columns')}</button>
      <span class="rule wide"></span>
      <span class="present" title="Slideshow"><span class="go"><span>Slideshow</span>${ic('play')}</span><span class="more">${ic('chevron-down')}</span></span>
      <button class="btn">${ic('lock-closed')}<span>Share</span></button>
      <button class="btn quiet wide">Sign In</button>
      <button class="ib phone" style="display:none" title="More">${ic('ellipsis-vertical')}</button>
    </span>
  </header>
  <nav class="menus"><span>File</span><span>Edit</span><span>View</span><span>Insert</span><span>Format</span><span class="phone-hide">Slide</span><span class="phone-hide">Arrange</span><span class="phone-hide">Tools</span><span class="phone-hide">Help</span><button class="ib" title="More menus">${ic('ellipsis-horizontal')}</button></nav>
  <div class="tools">
    <button class="ib wide" title="Search the menus">${ic('search')}</button>
    <span class="dd"><button class="ib" title="New slide">${ic('plus')}</button>${ic('chevron-down')}</span>
    <button class="ib" title="Undo">${ic('arrow-uturn-left')}</button>
    <button class="ib" title="Redo">${ic('arrow-uturn-right')}</button>
    <button class="ib wide" title="Print">${ic('printer')}</button>
    <button class="ib wide" title="Paint format">${ic('paint-brush')}</button>
    <span class="word wide">Fit${ic('chevron-down')}</span>
    <span class="div"></span>
    <button class="ib wide" title="Select">${ic('cursor-arrow')}</button>
    <button class="ib" title="Text box">${ic('textbox')}</button>
    <span class="dd"><button class="ib" title="Image">${ic('photo')}</button>${ic('chevron-down')}</span>
    <span class="dd"><button class="ib" title="Shape">${ic('square-2-stack')}</button>${ic('chevron-down')}</span>
    <span class="dd wide"><button class="ib" title="Line">${ic('minus')}</button>${ic('chevron-down')}</span>
    <button class="ib wide" title="Comment">${ic('chat-bubble-left')}</button>
    <span class="div wide"></span>
    <span class="word wide">Background</span>
    <span class="word wide">Layout${ic('chevron-down')}</span>
    <span class="word wide">Theme</span>
    <span class="sp"></span>
    <button class="ib wide" title="Hide the menus">${ic('chevron-up')}</button>
    <button class="ib phone-tools" title="More tools">${ic('ellipsis-horizontal')}</button>
  </div>
  <div class="body">
    <aside class="strip"><div class="card"><span class="n">1</span><span class="th">${slide()}</span></div></aside>
    <main class="work">
      <div class="stage">${slide()}</div>
      <div class="notes">Click to add speaker notes</div>
    </main>
  </div>
</div>
<style>@media (max-width: 600px) { .title .phone { display: inline-grid !important; } }</style>
`;

/* ---------- /home, the first screen ---------- */

const HOME_CSS = `
.col { position: relative; width: min(1120px, 100% - 32px); margin: 0 auto; min-height: 100vh; }
.col::before, .col::after { content: ''; position: absolute; top: 0; bottom: 0; width: 1px; background: var(--pt-hair); }
.col::before { left: -1px; }
.col::after { right: -1px; }
.seam { position: relative; border-top: 1px solid var(--pt-hair); }
.seam .x { top: -5px; }
.seam .x.l { left: -5px; }
.seam .x.r { right: -5px; }
.nav { height: 58px; display: flex; align-items: center; gap: 8px; padding: 0 24px; }
.nav .home { color: var(--pt-ink); display: flex; }
.nav .home .mono { height: 22px; width: auto; }
.nav .sp { flex: 1; }
.nav a.link { color: var(--pt-ink); text-decoration: none; padding: 0 10px; font-size: 14px; }
.seg { display: inline-flex; border: 1px solid var(--pt-hair); border-radius: var(--pt-radius); overflow: hidden; height: 32px; margin: 0 8px; }
.seg span { display: grid; place-items: center; width: 34px; color: var(--pt-ink-2); }
.seg span + span { border-left: 1px solid var(--pt-hair); }
.seg span.on { color: var(--pt-ink); background: var(--pt-plate); }
.hero { padding: 64px 48px 48px; }
.hero .wm { display: block; width: 100%; height: auto; color: var(--pt-ink); }
.hero .row { display: grid; grid-template-columns: 7fr 5fr; gap: 56px; margin-top: 44px; align-items: end; }
.hero h1 { margin: 0; font-weight: 500; font-size: 3.7rem; line-height: 1.02; letter-spacing: -0.038em; }
.hero .lead { margin: 0 0 24px; font-size: 17px; line-height: 1.55; color: var(--pt-ink-2); }
.hero .ctas { display: flex; gap: 8px; flex-wrap: wrap; }
.hero .ctas .btn { height: 40px; padding: 0 16px; font-size: 14px; }
.shot { margin: 0; padding: 48px; }
.shot img { display: block; width: 100%; height: auto; border: 1px solid var(--pt-edge); }
@media (max-width: 760px) {
  .nav { padding: 0 16px; }
  .nav a.link, .nav .seg { display: none; }
  .hero { padding: 40px 16px 32px; }
  .hero .row { grid-template-columns: 1fr; gap: 20px; margin-top: 28px; }
  .hero h1 { font-size: 2.5rem; line-height: 1.05; }
  .hero .ctas .btn { flex: 1 1 100%; }
  .shot { padding: 24px 16px; }
}
`;
const homeBody = (w) => `
<div class="col">
  <nav class="nav">
    <a class="home" title="Turboslide">${MONOGRAM('mono')}</a>
    <span class="sp"></span>
    <a class="link">Documentation</a>
    <span class="seg" title="Appearance"><span class="${''}on">${ic('sun')}</span><span>${ic('moon')}</span></span>
    <button class="btn solid">New Presentation</button>
  </nav>
  <div class="seam"><i class="x l"></i><i class="x r"></i></div>
  <section class="hero">
    ${WORDMARK('wm')}
    <div class="row">
      <h1>Build the pitch, present it and send the link</h1>
      <div>
        <p class="lead">Turboslide is a slides editor in the browser. It has Google Slides' menus and shortcuts. No account is needed.</p>
        <div class="ctas"><button class="btn solid">New Presentation</button><button class="btn">Open the Example Deck</button></div>
      </div>
    </div>
  </section>
  <div class="seam"><i class="x l"></i><i class="x r"></i></div>
  <figure class="shot"><img alt="The Turboslide editor with a blank presentation open" data-light="../pictures/editor-1440-light.png" data-dark="../pictures/editor-1440-dark.png"></figure>
</div>
<script>if (document.documentElement.dataset.theme === 'dark') { const s = document.querySelectorAll('.seg span'); s[0].classList.remove('on'); s[1].classList.add('on'); }</script>
`;

/* ---------- /decks ---------- */

/* sample rows for the mockup: the deck name, the first slide's title, the date, the owner */
const DECKS = [
  ['Q4 pipeline review', 'Pipeline', 'Opened today at 6:38 PM', 'You'],
  ['Renewal proposal for the Acme account', 'Renewal', 'Opened today at 2:10 PM', 'You'],
  ['Onboarding for new sellers', 'Onboarding', 'Opened yesterday', 'Shared with you'],
  ['Pricing update for October', 'Pricing', 'Opened Sep 29', 'You'],
  ['Untitled presentation', '', 'Opened Sep 26', 'You'],
  ['Quarterly business review template', 'Review', 'Opened Sep 22', 'Shared with you'],
];
const DECKS_CSS = `
.col { position: relative; width: min(1120px, 100% - 32px); margin: 0 auto; min-height: 100vh; }
.col::before, .col::after { content: ''; position: absolute; top: 0; bottom: 0; width: 1px; background: var(--pt-hair); }
.col::before { left: -1px; }
.col::after { right: -1px; }
.seam { position: relative; border-top: 1px solid var(--pt-hair); }
.seam .x { top: -5px; }
.seam .x.l { left: -5px; }
.seam .x.r { right: -5px; }
.bar { height: 58px; display: grid; grid-template-columns: 240px minmax(0, 1fr) 240px; align-items: center; gap: 24px; padding: 0 24px; }
.bar .home { color: var(--pt-ink); display: flex; }
.bar .wm { height: 18px; width: auto; }
.bar .mono { height: 22px; width: auto; display: none; }
.search { display: flex; align-items: center; gap: 10px; height: 34px; padding: 0 8px 0 12px; border: 1px solid var(--pt-hair); border-radius: var(--pt-radius); color: var(--pt-titanium); max-width: 560px; width: 100%; justify-self: center; }
.search .ic { color: var(--pt-ink-2); }
.search .t { flex: 1; font-size: 14px; }
.search kbd { font: 500 11px/1 var(--pt-text); color: var(--pt-titanium); background: var(--pt-hair-soft); border-radius: 4px; padding: 4px 6px; }
.bar .end { justify-self: end; display: flex; gap: 8px; }
section { padding: 32px 24px 36px; }
.head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
h2 { margin: 0; font-size: 1.375rem; line-height: 1.3; font-weight: 500; letter-spacing: -0.01em; }
.head a { color: var(--pt-ink); font-size: 14px; text-decoration: underline; text-decoration-color: var(--pt-hair); text-underline-offset: 5px; }
.tpl { display: grid; grid-template-columns: repeat(4, 192px); gap: 24px; }
.tile { display: grid; gap: 10px; font-size: 14px; }
.tile .pic { aspect-ratio: 16 / 9; border: 1px solid var(--pt-edge); display: grid; place-items: center; background: var(--pt-paper); color: var(--pt-ink); }
.tile .pic .ic { width: 24px; height: 24px; }
.tile .pic.ink { background: #070707; color: #f2f2f0; }
.tile .pic.ink svg { width: 64px; height: auto; }
.tools { display: flex; align-items: center; gap: 8px; }
.select { display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 10px 0 12px; border: 1px solid var(--pt-field); }
.select .ic { width: 12px; height: 12px; color: var(--pt-ink-2); }
.seg { display: inline-flex; border: 1px solid var(--pt-hair); border-radius: var(--pt-radius); overflow: hidden; height: 32px; }
.seg span { display: grid; place-items: center; width: 34px; color: var(--pt-ink-2); }
.seg span + span { border-left: 1px solid var(--pt-hair); }
.seg span.on { color: var(--pt-ink); background: var(--pt-plate); }
.rows { border-top: 1px solid var(--pt-hair); }
.row { display: grid; grid-template-columns: 96px minmax(0, 1fr) 200px 160px 32px; gap: 20px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--pt-hair-soft); }
.rows .row:last-child { border-bottom-color: var(--pt-hair); }
.row .th { display: block; width: 96px; aspect-ratio: 16 / 9; border: 1px solid var(--pt-edge); background: #fff; overflow: hidden; }
.row .th svg { display: block; width: 100%; height: 100%; }
.row .t { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row .m { color: var(--pt-ink-2); }
.row .o { color: var(--pt-ink-2); }
.cols { display: grid; grid-template-columns: 96px minmax(0, 1fr) 200px 160px 32px; gap: 20px; padding: 0 0 8px; color: var(--pt-titanium); font-size: 12px; }
@media (max-width: 760px) {
  .bar { grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; padding: 0 12px 0 16px; }
  .bar .wm { display: none; }
  .bar .mono { display: block; }
  .search kbd { display: none; }
  .search .t { font-size: 13px; }
  section { padding: 24px 16px 28px; }
  h2 { font-size: 1.125rem; white-space: nowrap; }
  .head { flex-wrap: wrap; row-gap: 6px; }
  .head a { white-space: nowrap; }
  .cols { display: none !important; }
  .tpl { grid-template-columns: 1fr 1fr; gap: 12px; }
  .head .tools .select { display: none; }
  .row, .cols { grid-template-columns: 64px minmax(0, 1fr) 32px; gap: 12px; }
  .row .th { width: 64px; }
  .row .o, .cols .o, .cols .m { display: none; }
  .row .m { grid-column: 2; grid-row: 2; font-size: 12px; margin-top: -10px; }
  .row .t { grid-column: 2; grid-row: 1; }
  .row .th { grid-row: 1 / span 2; }
  .row .ib { grid-column: 3; grid-row: 1 / span 2; }
}
`;
const thumb = (title, i) => {
  const ink = i === 1 || i === 3;
  const fg = ink ? '#f2f2f0' : '#070707';
  return `<svg viewBox="0 0 160 90" aria-hidden="true"><rect width="160" height="90" fill="${ink ? '#070707' : '#ffffff'}"/><path d="M6 0V90M154 0V90M0 6H160M0 84H160" stroke="${ink ? 'rgba(242,242,240,.22)' : 'rgba(7,7,7,.18)'}" stroke-width=".6" fill="none"/>${title ? `<text x="14" y="52" font-family="Inter" font-weight="500" font-size="14" fill="${fg}" letter-spacing="-0.3">${title}</text><rect x="14" y="59" width="${48 + (i % 3) * 14}" height="2.4" fill="${ink ? 'rgba(242,242,240,.45)' : 'rgba(7,7,7,.35)'}"/>` : ''}</svg>`;
};
const decksBody = () => `
<div class="col">
  <header class="bar">
    <a class="home" title="About Turboslide">${WORDMARK('wm')}${MONOGRAM('mono')}</a>
    <div class="search">${ic('search')}<span class="t">Search presentations</span><kbd>⌘K</kbd></div>
    <div class="end"><button class="btn">Sign In</button></div>
  </header>
  <div class="seam"><i class="x l"></i><i class="x r"></i></div>
  <section>
    <div class="head"><h2>Start a new presentation</h2><a>Template gallery</a></div>
    <div class="tpl">
      <div class="tile"><span class="pic">${ic('plus')}</span><span>Blank presentation</span></div>
      <div class="tile"><span class="pic ink">${GT_MARK('gt')}</span><span>GT brand deck</span></div>
    </div>
  </section>
  <div class="seam"><i class="x l"></i><i class="x r"></i></div>
  <section>
    <div class="head"><h2>Your presentations</h2><span class="tools"><span class="select">Last opened by me${ic('chevron-down')}</span><span class="seg" title="View"><span class="on">${ic('queue-list')}</span><span>${ic('squares-2x2')}</span></span></span></div>
    <div class="cols"><span></span><span>Name</span><span class="m">Last opened</span><span class="o">Owner</span><span></span></div>
    <div class="rows">
      ${DECKS.map(([t, first, m, o], i) => `<div class="row"><span class="th">${thumb(first, i)}</span><span class="t">${t}</span><span class="m">${m}</span><span class="o">${o}</span><button class="ib" title="More">${ic('ellipsis-vertical')}</button></div>`).join('\n      ')}
    </div>
  </section>
</div>
`;

/* ---------- the Sign in dialog, over the editor ---------- */

const SIGNIN_CSS = `
.back { position: fixed; inset: 0; }
.back img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top left; }
.scrim { position: fixed; inset: 0; background: var(--pt-scrim); }
.dlg { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 400px; background: var(--pt-paper); border: 1px solid var(--pt-edge); }
.dlg .in { padding: 24px 24px 8px; }
.dlg .mono { height: 22px; width: auto; color: var(--pt-ink); display: block; }
.dlg h2 { margin: 20px 0 8px; font-size: 20px; line-height: 1.25; font-weight: 500; letter-spacing: -0.01em; }
.dlg p { margin: 0 0 20px; font-size: 14px; line-height: 1.5; color: var(--pt-ink-2); }
/* Google's light theme in both appearances: the page requires the standard G on a white ground
   (developers.google.com/identity/branding-guidelines, read 2026-10-02T02:53Z) */
.gbtn { display: flex; align-items: center; gap: 10px; width: 100%; height: 40px; padding: 0 12px; background: #ffffff; border: 1px solid #747775; color: #1f1f1f; font: 500 14px/1 var(--pt-text); }
.gbtn .g { width: 18px; height: 18px; flex: none; }
.gbtn span { flex: 1; text-align: center; margin-right: 28px; }
.dlg .note { margin: 12px 0 0; font-size: 13px; color: var(--pt-titanium); }
.dlg .err { height: 20px; margin: 4px 0 0; font-size: 13px; }
.dlg .foot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--pt-hair-soft); }
@media (max-width: 600px) {
  .dlg { width: calc(100% - 32px); }
  .dlg .in { padding: 20px 20px 4px; }
}
`;
const signinBody = (w) => `
<div class="back"><img alt="" data-light="../pictures/editor-${w}-light.png" data-dark="../pictures/editor-${w}-dark.png"></div>
<div class="scrim"></div>
<div class="dlg" role="dialog" aria-label="Sign in">
  <div class="in">
    ${MONOGRAM('mono')}
    <h2>Sign in</h2>
    <p>Sign in to keep your presentations under your name and to open them on any device.</p>
    <button class="gbtn">${GOOGLE_G}<span>Continue with Google</span></button>
    <p class="note">Turboslide uses the name and the address of your Google account. It reads nothing else from Google after you sign in.</p>
    <p class="err" role="alert"></p>
  </div>
  <div class="foot"><button class="btn">Cancel</button></div>
</div>
`;

/* ---------- the mark sheet ---------- */

const SHEET_CSS = `
body { padding: 0; }
.s { padding: 56px 80px; border-bottom: 1px solid var(--pt-hair); }
h2 { margin: 0 0 8px; font-size: 22px; font-weight: 500; letter-spacing: -0.01em; }
p { margin: 0 0 24px; max-width: 760px; font-size: 15px; line-height: 1.5; color: var(--pt-ink-2); }
.big { display: block; width: 100%; height: auto; color: var(--pt-ink); }
.sizes { display: flex; align-items: flex-end; gap: 48px; flex-wrap: wrap; }
.sizes figure { margin: 0; display: grid; gap: 10px; justify-items: start; }
.sizes figcaption { font-size: 13px; color: var(--pt-titanium); border-top: 1px solid var(--pt-hair); padding-top: 8px; min-width: 64px; }
.sizes svg { color: var(--pt-ink); display: block; }
.px { image-rendering: pixelated; display: block; }
.grounds { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
.ground { padding: 40px; display: grid; gap: 28px; }
.ground.paper { background: #ffffff; color: #070707; }
.ground.ink { background: #070707; color: #f2f2f0; }
.ground svg { display: block; height: auto; }
.ground .sizes svg { color: inherit; }
.tabs { display: grid; gap: 16px; }
.strip { display: flex; align-items: flex-end; gap: 0; padding: 8px 8px 0; }
.strip.light { background: #dee1e6; }
.strip.dark { background: #202124; }
.tab { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; width: 240px; font-size: 12px; }
.strip.light .tab { color: #3c4043; }
.strip.dark .tab { color: #bdc1c6; }
.strip.light .tab.on { background: #ffffff; color: #202124; }
.strip.dark .tab.on { background: #35363a; color: #e8eaed; }
.tab .fav { width: 16px; height: 16px; flex: none; background: #9aa0a6; }
.tab img { width: 16px; height: 16px; display: block; }
.panel { background: #101010; color: rgba(255, 255, 255, 0.87); padding: 20px 24px; font: 13px/1.25 var(--pt-mono); white-space: pre; display: inline-block; border: 1px solid transparent; }
:root[data-theme='dark'] .panel { border-color: var(--pt-hair); }
.dia { width: 100%; height: auto; display: block; overflow: visible; }
.dia .g { stroke: var(--pt-hair); stroke-width: 1; fill: none; }
.dia .c { fill: var(--pt-plate); }
.dia text { font: 18px var(--pt-text); fill: var(--pt-ink-2); }
`;
function sheetBody() {
  const geo = JSON.parse(readFileSync(join(MARKS, 'geometry.json'), 'utf8'));
  const wb = geo.wordmarkBox;
  const [minX, minY, maxX, maxY] = [wb.minX, wb.minY, wb.maxX, wb.maxY].map(Number);
  const word = readFileSync(join(MARKS, 'wordmark.svg'), 'utf8');
  const d = /<path d="([^"]+)"/.exec(word)[1];
  const cut = geo.cut.map(Number);
  const W = maxX - minX;
  const pad = 40;
  const guide = (y, label) => `<path class="g" d="M${minX - pad} ${y}H${maxX + 12}"/><text x="${maxX + 28}" y="${y + 6}">${label}</text>`;
  const dia = `<svg class="dia" viewBox="${minX - pad} ${minY - 20} ${W + pad + 230} ${maxY - minY + 40}" aria-label="The construction of the wordmark">
    <rect class="c" x="${minX - pad}" y="${cut[0]}" width="${W + pad + 12}" height="${cut[1] - cut[0]}"/>
    ${guide(40, 'Cap height, 120 units')}${guide(70, 'x-height')}${guide(160, 'Baseline')}
    <text x="${maxX + 28}" y="${(cut[0] + cut[1]) / 2 + 6}">Cut, 8 units</text>
    <path d="${d}" fill="currentColor" style="color:var(--pt-ink)"/>
  </svg>`;
  const banner = readFileSync(join(MARKS, 'banner.txt'), 'utf8').trimEnd().split('\n');
  const text = ['Turboslide <version>', 'https://www.turboslide.com', '<n> actions, effects backend: <selected>', 'checkout <path>', '', ''];
  const bannerText = banner.map((l, i) => `${l.padEnd(14)}${text[i] ?? ''}`).join('\n');
  const fav = (scheme) => `../marks/favicon-16${scheme === 'dark' ? '-dark' : ''}.png`;
  const tabs = (scheme) => `<div class="strip ${scheme}">
      <span class="tab on"><img src="${fav(scheme)}" alt="">Untitled presentation - Turboslide</span>
      <span class="tab"><span class="fav"></span>Inbox</span>
      <span class="tab"><span class="fav"></span>Pull requests</span>
      <span class="tab"><span class="fav"></span>Google Slides</span>
    </div>`;
  return `
<section class="s">
  <h2>The wordmark</h2>
  <p>Inter at weight 800, widened through its counters so every stem keeps Inter's width, slanted 12 degrees, cut once for 8 units with the cut's lower edge on the top of the e's bar, and led by three bars into the T. One path in currentColor with no font, no mask and no id.</p>
  ${WORDMARK('big')}
</section>
<section class="s">
  <h2>Construction</h2>
  <p>The units are the GT bar monogram's: a cap of 120 units from y 40 to the baseline at y 160. The plate band is the cut. The middle bar is 36 units centred on the cut, so the cut leaves two lines of 14 units, as it does in the GT monogram.</p>
  ${dia}
</section>
<section class="s grounds" style="padding:0">
  <div class="ground paper">${WORDMARK('').replace('<svg class=""', '<svg style="width:560px"')}<div class="sizes">${[96, 48, 24, 16].map((h) => MONOGRAM('').replace('<svg class=""', `<svg style="height:${h}px;width:auto"`)).join('')}</div></div>
  <div class="ground ink">${WORDMARK('').replace('<svg class=""', '<svg style="width:560px"')}<div class="sizes">${[96, 48, 24, 16].map((h) => MONOGRAM('').replace('<svg class=""', `<svg style="height:${h}px;width:auto"`)).join('')}</div></div>
</section>
<section class="s">
  <h2>The monogram by size</h2>
  <p>The square form moves the bars under the T's left arm so the mark fits a tile. Below 24 px the tab icon is the pixel drawing of the 16 px file, and the terminal prints the same pixels as half blocks.</p>
  <div class="sizes">
    <figure><img class="px" src="../marks/favicon-16.png" width="16" height="16" alt=""><figcaption>16 px tab</figcaption></figure>
    <figure><img class="px" src="../marks/favicon-16.png" width="128" height="128" alt=""><figcaption>16 px at 8x</figcaption></figure>
    <figure><img class="px" src="../marks/favicon-16-dark.png" width="128" height="128" alt=""><figcaption>16 px at 8x, dark scheme</figcaption></figure>
    <figure><img src="../marks/favicon-32.png" width="32" height="32" alt=""><figcaption>32 px</figcaption></figure>
    <figure><img class="px" src="../marks/favicon-32.png" width="128" height="128" alt=""><figcaption>32 px at 4x</figcaption></figure>
    <figure><img src="../marks/favicon-32-dark.png" width="32" height="32" alt=""><figcaption>32 px, dark scheme</figcaption></figure>
    <figure><img src="../marks/apple-touch-icon.png" width="180" height="180" alt="" style="border:1px solid var(--pt-hair)"><figcaption>180 px touch icon</figcaption></figure>
  </div>
</section>
<section class="s">
  <h2>Tab strips</h2>
  <p>The 16 px file in Chrome's light and dark tab strips at 1x, beside three neutral tabs.</p>
  <div class="tabs">${tabs('light')}${tabs('dark')}</div>
</section>
<section class="s">
  <h2>The CLI banner</h2>
  <p>turboslide --version prints the 16 px drawing as half block characters beside the four facts it prints today. The glyph is six lines tall, so the banner gains two lines.</p>
  <div class="panel">${bannerText.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>
</section>`;
}

/* ---------- write and shoot ---------- */

const pages = {
  editor: (w) => page('Editor', EDITOR_CSS, editorBody(w)),
  home: (w) => page('Home', HOME_CSS, homeBody(w)),
  decks: (w) => page('Decks', DECKS_CSS, decksBody(w)),
  signin: (w) => page('Sign in', SIGNIN_CSS, signinBody(w)),
};
const VIEWPORTS = [
  [1440, 900],
  [390, 844],
];
for (const [name, fn] of Object.entries(pages))
  for (const [w] of VIEWPORTS) writeFileSync(join(MOCK, `${name}-${w}.html`), fn(w));
writeFileSync(join(MOCK, 'marks.html'), page('Marks', SHEET_CSS, sheetBody()));

const browser = await chromium.launch();
async function shoot(file, out, width, height, theme, { full = false, scheme } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: scheme ?? theme });
  const p = await ctx.newPage();
  await p.goto(pathToFileURL(file).href + `?theme=${theme}`);
  await p.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => (i.onload = i.onerror = r)))));
  });
  await p.screenshot({ path: out, fullPage: full });
  await ctx.close();
  console.log(out.replace(HERE + '/', ''));
}

/* the icon PNGs, rendered from the SVG files: the tab icon in both schemes, the 32 px tile, the touch icon */
for (const [src, out, size, scheme] of [
  ['favicon-16.svg', 'favicon-16.png', 16, 'light'],
  ['favicon-16.svg', 'favicon-16-dark.png', 16, 'dark'],
  ['icon-tile.svg', 'favicon-32.png', 32, 'light'],
  ['icon-tile.svg', 'favicon-32-dark.png', 32, 'dark'],
  ['app-icon.svg', 'apple-touch-icon.png', 180, 'light'],
]) {
  const ctx = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1, colorScheme: scheme });
  const p = await ctx.newPage();
  await p.goto(pathToFileURL(join(MARKS, src)).href);
  await p.screenshot({ path: join(MARKS, out), omitBackground: true });
  await ctx.close();
  console.log(`marks/${out}`);
}

/* the editor first: /home and the dialog draw its pictures */
const order = ['editor', 'home', 'decks', 'signin'];
for (const name of order)
  for (const [w, h] of VIEWPORTS)
    for (const theme of ['light', 'dark'])
      await shoot(join(MOCK, `${name}-${w}.html`), join(PICS, `${name}-${w}-${theme}.png`), w, h, theme);
for (const theme of ['light', 'dark'])
  await shoot(join(MOCK, 'marks.html'), join(PICS, `marks-${theme}.png`), 1440, 900, theme, { full: true });
await browser.close();
