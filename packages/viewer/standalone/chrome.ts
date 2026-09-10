/**
 * The standalone deck's chrome (SPEC 5.3: the static viewer and the
 * Prototemplate /deck iframe run renderStandalone's one HTML file with the
 * framework-free tail.html port): the viewer CSS of deck/parts/head.html
 * lines 177 to 370 and the markup of deck/parts/tail.html lines 1 to 60,
 * without the surfaces panel (the index panel has no Turboslide equivalent
 * yet). Both are plain strings the runtime injects when the document has no
 * `#viewer` (standalone/source.ts bakes them into the runtime), so
 * renderStandalone needs nothing beyond `runtime: standaloneRuntimeSource()`.
 *
 * Tokens: the deck's chrome read the unprefixed tokens from :root (head:11-32,
 * 178-179). The theme's sheet.css now scopes them to .ts-sheet (SPEC 5.1),
 * so the same nine values are declared on :root here for the chrome alone;
 * the sheet keeps its own copy and its own data-theme, which the runtime
 * stamps alongside the document's. The line law holds as in the deck: the
 * sidebar's right edge, the toolbar's bottom edge, the frames on the
 * thumbnails and pages, the sheet's own ring.
 */

/* Heroicons 20 solid paths the toolbar draws (the same paths as packages/chrome/src/icons.tsx). */
const P = {
  sidebar:
    'M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Z',
  prev: 'M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z',
  next: 'M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z',
  slide:
    'M5.127 3.502 5.25 3.5h9.5c.041 0 .082 0 .123.002A2.251 2.251 0 0 0 12.75 2h-5.5a2.25 2.25 0 0 0-2.123 1.502ZM1 10.25A2.25 2.25 0 0 1 3.25 8h13.5A2.25 2.25 0 0 1 19 10.25v5.5A2.25 2.25 0 0 1 16.75 18H3.25A2.25 2.25 0 0 1 1 15.75v-5.5ZM3.25 6.5c-.04 0-.082 0-.123.002A2.25 2.25 0 0 1 5.25 5h9.5c.98 0 1.814.627 2.123 1.502a3.819 3.819 0 0 0-.123-.002H3.25Z',
  grid: 'M4.25 2A2.25 2.25 0 0 0 2 4.25v2.5A2.25 2.25 0 0 0 4.25 9h2.5A2.25 2.25 0 0 0 9 6.75v-2.5A2.25 2.25 0 0 0 6.75 2h-2.5Zm0 9A2.25 2.25 0 0 0 2 13.25v2.5A2.25 2.25 0 0 0 4.25 18h2.5A2.25 2.25 0 0 0 9 15.75v-2.5A2.25 2.25 0 0 0 6.75 11h-2.5Zm9-9A2.25 2.25 0 0 0 11 4.25v2.5A2.25 2.25 0 0 0 13.25 9h2.5A2.25 2.25 0 0 0 18 6.75v-2.5A2.25 2.25 0 0 0 15.75 2h-2.5Zm0 9A2.25 2.25 0 0 0 11 13.25v2.5A2.25 2.25 0 0 0 13.25 18h2.5A2.25 2.25 0 0 0 18 15.75v-2.5A2.25 2.25 0 0 0 15.75 11h-2.5Z',
  book: 'M10.75 16.82A7.462 7.462 0 0 1 15 15.5c.71 0 1.396.098 2.046.282A.75.75 0 0 0 18 15.06v-11a.75.75 0 0 0-.546-.721A9.006 9.006 0 0 0 15 3a8.963 8.963 0 0 0-4.25 1.065V16.82ZM9.25 4.065A8.963 8.963 0 0 0 5 3c-.85 0-1.673.118-2.454.339A.75.75 0 0 0 2 4.06v11a.75.75 0 0 0 .954.721A7.506 7.506 0 0 1 5 15.5c1.579 0 3.042.487 4.25 1.32V4.065Z',
  present:
    'M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z',
  full: 'm13.28 7.78 3.22-3.22v2.69a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.69l-3.22 3.22a.75.75 0 0 0 1.06 1.06ZM2 17.25v-4.5a.75.75 0 0 1 1.5 0v2.69l3.22-3.22a.75.75 0 0 1 1.06 1.06L4.56 16.5h2.69a.75.75 0 0 1 0 1.5h-4.5a.747.747 0 0 1-.75-.75ZM12.22 13.28l3.22 3.22h-2.69a.75.75 0 0 0 0 1.5h4.5a.747.747 0 0 0 .75-.75v-4.5a.75.75 0 0 0-1.5 0v2.69l-3.22-3.22a.75.75 0 1 0-1.06 1.06ZM3.5 4.56l3.22 3.22a.75.75 0 0 0 1.06-1.06L4.56 3.5h2.69a.75.75 0 0 0 0-1.5h-4.5a.75.75 0 0 0-.75.75v4.5a.75.75 0 0 0 1.5 0V4.56Z',
  link1:
    'M12.232 4.232a2.5 2.5 0 0 1 3.536 3.536l-1.225 1.224a.75.75 0 0 0 1.061 1.06l1.224-1.224a4 4 0 0 0-5.656-5.656l-3 3a4 4 0 0 0 .225 5.865.75.75 0 0 0 .977-1.138 2.5 2.5 0 0 1-.142-3.667l3-3Z',
  link2:
    'M11.603 7.963a.75.75 0 0 0-.977 1.138 2.5 2.5 0 0 1 .142 3.667l-3 3a2.5 2.5 0 0 1-3.536-3.536l1.225-1.224a.75.75 0 0 0-1.061-1.06l-1.224 1.224a4 4 0 1 0 5.656 5.656l3-3a4 4 0 0 0-.225-5.865Z',
  help: 'M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.94 6.94a.75.75 0 1 1-1.061-1.061 3 3 0 1 1 2.871 5.026v.345a.75.75 0 0 1-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 1 0 8.94 6.94ZM10 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
};

function icon(d: string, evenodd = true): string {
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><path${evenodd ? ' fill-rule="evenodd" clip-rule="evenodd"' : ''} d="${d}"/></svg>`;
}

/** The viewer chrome CSS (head:177-370 without the surfaces panel), on the deck's unprefixed tokens declared for the chrome on :root. */
export const STANDALONE_CHROME_CSS = `
:root { color-scheme: light; --paper: #ffffff; --ink: #070707; --ink-2: #3a3d44; --titanium: #8a8f98; --hair: rgba(7, 7, 7, 0.18); --hair-soft: rgba(7, 7, 7, 0.09); --plate: rgba(7, 7, 7, 0.035); --cross: rgba(7, 7, 7, 0.38); --edge: rgba(7, 7, 7, 0.62); --thumb: rgba(7, 7, 7, 0.32); --display: 'Inter', 'Helvetica Neue', Arial, sans-serif; --text: 'Inter', 'Helvetica Neue', Arial, sans-serif; --bar-h: 52px; }
:root[data-theme="dark"] { color-scheme: dark; --paper: #070707; --ink: #f2f2f0; --ink-2: #b9bcc3; --titanium: #8a8f98; --hair: rgba(242, 242, 240, 0.22); --hair-soft: rgba(242, 242, 240, 0.1); --plate: rgba(242, 242, 240, 0.05); --cross: rgba(255, 255, 255, 0.34); --edge: rgba(242, 242, 240, 0.55); --thumb: rgba(242, 242, 240, 0.32); }
html, body { height: 100%; }
body { margin: 0; background: var(--paper); color: var(--ink); font-family: var(--text); font-optical-sizing: auto; overflow: hidden; -webkit-font-smoothing: antialiased; }
[hidden] { display: none !important; }
* { box-sizing: border-box; }

/* scroll regions: the thin scrollbar the Prototemplate shell uses (tokens.css .pt-scroll) */
.scroll { overflow-y: scroll; overflow-x: hidden; scrollbar-gutter: stable; scrollbar-width: auto; scrollbar-color: auto; }
.scroll::-webkit-scrollbar { width: 4px; height: 4px; }
.scroll::-webkit-scrollbar-track { background: transparent; border: 0; }
.scroll::-webkit-scrollbar-thumb { background: var(--thumb); background-clip: padding-box; border: 0; border-left: 1px solid transparent; border-right: 1px solid transparent; border-radius: 0; }
.scroll::-webkit-scrollbar-thumb:hover { background-color: var(--ink-2); border-width: 0; }
.scroll::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
@supports not selector(::-webkit-scrollbar) { .scroll { scrollbar-width: thin; scrollbar-color: var(--thumb) transparent; } }

.viewer { position: fixed; inset: 0; display: grid; grid-template-columns: 208px minmax(0, 1fr); grid-template-rows: 100%; background: var(--paper); }
.viewer.no-sb, .viewer.is-overview { grid-template-columns: 0 minmax(0, 1fr); }
.viewer.no-sb .sb, .viewer.is-overview .sb { display: none; }

/* sidebar: the slide list; its right edge is the seam with the stage (line law) */
.sb { grid-column: 1; grid-row: 1; display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--hair); background: var(--paper); }
.sb-head { height: var(--bar-h); flex: 0 0 var(--bar-h); display: flex; align-items: center; gap: 8px; padding: 0 12px; border-bottom: 1px solid var(--hair); }
.sb-head svg { width: 22px; height: 14px; color: var(--ink); flex: 0 0 auto; }
.sb-head b { font-family: var(--display); font-weight: 500; font-size: 13.5px; letter-spacing: -0.01em; white-space: nowrap; }
.sb-head span { margin-left: auto; font-size: 12px; color: var(--titanium); font-variant-numeric: tabular-nums; white-space: nowrap; }
.thumbs { flex: 1 1 auto; padding: 6px 8px 28px 8px; display: flex; flex-direction: column; gap: 10px; }
.sec-label { font-family: var(--display); font-weight: 500; font-size: 12px; letter-spacing: -0.005em; color: var(--titanium); padding: 14px 0 0 26px; }
.sec-label:first-child { padding-top: 8px; }
.thumb { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 6px; align-items: start; cursor: pointer; }
.thumb .n { font-family: var(--display); font-weight: 500; font-size: 12px; color: var(--titanium); padding-top: 3px; font-variant-numeric: tabular-nums; text-align: right; }
.thumb.is-active .n { color: var(--ink); }
.thumb-frame { position: relative; width: 100%; aspect-ratio: 16 / 9; border: 1px solid var(--edge); overflow: hidden; background: var(--paper); }
.thumb:hover .thumb-frame { border-color: var(--ink); }
.thumb.is-active .thumb-frame { border-color: var(--ink); outline: 1px solid var(--ink); outline-offset: 2px; }
/* a live clone: the 1600 by 900 stage scaled into its frame, itself a .ts-sheet so the sheet tokens resolve (SPEC 5.5) */
.mini { position: absolute; left: 0; top: 0; width: 1600px; height: 900px; transform-origin: 0 0; transform: scale(var(--k, 0.14)); pointer-events: none; }
.mini .slide { display: block; }
.thumb-title { font-size: 12px; line-height: 1.35; color: var(--ink-2); margin-top: 6px; }
.thumb.is-active .thumb-title { color: var(--ink); }

/* main column: toolbar, stage, progress; the toolbar's bottom edge is the seam with the stage */
.main { grid-column: 2; grid-row: 1; position: relative; display: grid; grid-template-rows: var(--bar-h) minmax(0, 1fr) 2px; min-width: 0; min-height: 0; background: var(--paper); }
.toolbar { grid-row: 1; height: var(--bar-h); display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 0 12px 0 10px; border-bottom: 1px solid var(--hair); min-width: 0; }
.bar-l, .bar-r { display: flex; align-items: center; gap: 4px; }
.toolbar .count { font-size: 13px; color: var(--titanium); font-variant-numeric: tabular-nums; padding: 0 4px; white-space: nowrap; }
.toolbar .count b { color: var(--ink); font-weight: 500; font-family: var(--display); font-size: 14px; }
.toolbar .sep { width: 1px; height: 22px; background: var(--hair); margin: 0 8px; }
.bar-brand { display: none; align-items: center; gap: 10px; padding: 0 6px; }
.bar-brand svg { width: 25px; height: 16px; color: var(--ink); }
.bar-brand b { font-family: var(--display); font-weight: 500; font-size: 14.5px; letter-spacing: -0.01em; white-space: nowrap; }
.viewer.no-sb .bar-brand, .viewer.is-overview .bar-brand { display: inline-flex; }
.ib { appearance: none; background: none; border: 1px solid transparent; color: var(--ink-2); font: 13px/1 var(--text); height: 32px; padding: 0 10px; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; white-space: nowrap; border-radius: 0; }
.ib svg { width: 16px; height: 16px; fill: currentColor; flex: 0 0 auto; }
.ib .theme-glyph { display: inline-block; width: 16px; font-size: 16px; line-height: 16px; text-align: center; font-weight: 400; }
.ib:hover { color: var(--ink); border-color: var(--hair); }
.ib:focus-visible { outline: 1px solid var(--ink); outline-offset: -1px; }
.ib.is-on { color: var(--ink); border-color: var(--ink); }
.ib.icon { width: 32px; padding: 0; justify-content: center; font-family: var(--display); font-weight: 500; font-size: 14px; }
.seg { display: inline-flex; border: 1px solid var(--hair); height: 32px; }
.seg .ib { height: 30px; border: 0; border-right: 1px solid var(--hair); padding: 0 12px; }
.seg .ib:last-child { border-right: 0; }
.seg .ib:hover { background: var(--plate); }
.seg .ib.is-on { background: var(--ink); color: var(--paper); }
.stagewrap { grid-row: 2; position: relative; overflow: hidden; min-height: 0; background: var(--plate); }
/* the picture device on the stagewrap (head:249-254): the backdrop is a sibling of the sheet here, so the theme's .ts-sheet .backdrop rules do not reach it */
.stagewrap > .backdrop { position: absolute; inset: 0; z-index: 0; display: none; pointer-events: none; background: var(--paper); }
.stagewrap > .backdrop img { display: block; width: 100%; height: 100%; object-fit: cover; }
.stagewrap.is-picture > .backdrop { display: block; }
.stagewrap.is-picture .ts-sheet.sheet { background: transparent; border-color: transparent; box-shadow: none; }
.stagewrap.is-picture .slide.is-on .opener-img, .stagewrap.is-picture .slide.is-on .mood-img { visibility: hidden; }
.progress { grid-row: 3; position: relative; background: var(--hair-soft); }
.progress i { position: absolute; left: 0; top: 0; height: 100%; width: 0; background: var(--ink); transition: width 160ms ease-out; }

/* grid: every slide at once */
.grid { position: absolute; inset: 0; background: var(--paper); z-index: 2; }
.grid .thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 26px 26px; align-content: start; padding: 22px 34px 56px; overflow: visible; }
.grid .sec-label { grid-column: 1 / -1; padding: 16px 0 0; margin-top: 10px; border-top: 1px solid var(--hair); font-size: 13.5px; color: var(--ink); }
.grid .sec-label:first-child { border-top: 0; margin-top: 0; padding-top: 4px; }
.grid .thumb { grid-template-columns: 26px minmax(0, 1fr); }

/* book: the deck read top to bottom */
.book { position: absolute; inset: 0; background: var(--paper); z-index: 2; }
.book-in { --k: 0.6; max-width: 1280px; margin: 0 auto; padding: 44px 56px 120px; display: flex; flex-direction: column; gap: 36px; }
.book-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 32px; align-items: end; padding-bottom: 26px; border-bottom: 1px solid var(--hair); }
.book-head h1 { font-family: var(--display); font-weight: 500; font-size: 44px; line-height: 1.04; letter-spacing: -0.025em; margin: 0; }
.book-head p { font-size: 15.5px; line-height: 1.5; color: var(--ink-2); max-width: 62ch; margin: 14px 0 0; }
.book-head .meta { font-size: 13px; color: var(--titanium); text-align: right; line-height: 1.5; white-space: nowrap; }
.book-toc { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0 28px; }
.book-toc a { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: baseline; padding: 9px 0; border-bottom: 1px solid var(--hair-soft); color: inherit; text-decoration: none; font-family: var(--display); font-weight: 500; font-size: 14px; letter-spacing: -0.01em; }
.book-toc a span { min-width: 0; line-height: 1.3; }
.book-toc a:hover span { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 4px; }
.book-toc small { font-family: var(--text); font-size: 12px; color: var(--titanium); font-variant-numeric: tabular-nums; }
.book-sec { display: grid; grid-template-columns: 128px minmax(0, 1fr); gap: 28px; align-items: end; padding-top: 30px; border-top: 1px solid var(--hair); margin-top: 12px; }
.book-sec small { font-size: 12.5px; line-height: 1.5; color: var(--titanium); font-variant-numeric: tabular-nums; }
.book-sec h2 { font-family: var(--display); font-weight: 500; font-size: 32px; line-height: 1.05; letter-spacing: -0.025em; margin: 0; }
.page { display: grid; grid-template-columns: 128px minmax(0, 1fr); gap: 28px; align-items: start; scroll-margin-top: 20px; }
.page .pn { padding-top: 2px; font-size: 12.5px; line-height: 1.45; color: var(--titanium); }
.page .pn b { display: block; font-family: var(--display); font-weight: 500; font-size: 24px; letter-spacing: -0.02em; line-height: 1; color: var(--ink); margin-bottom: 8px; font-variant-numeric: tabular-nums; }
.page .pn span { display: block; }
.page.is-active .pn { color: var(--ink-2); }
.page-frame { position: relative; width: 100%; aspect-ratio: 16 / 9; border: 1px solid var(--edge); background: var(--paper); overflow: hidden; cursor: pointer; }
.page:hover .page-frame { border-color: var(--ink); }
.page.is-active .page-frame { border-color: var(--ink); outline: 1px solid var(--ink); outline-offset: 2px; }

/* present: chrome hidden, the sheet fills the window */
.viewer.is-present { grid-template-columns: 0 minmax(0, 1fr); }
.viewer.is-present .sb { display: none; }
.viewer.is-present .main { grid-template-rows: 0 minmax(0, 1fr) 0; }
.viewer.is-present .toolbar, .viewer.is-present .progress { display: none; }
.viewer.is-present .stagewrap { background: var(--paper); }
.viewer.is-present .ts-sheet.sheet { border-color: transparent; box-shadow: none; }

.help { position: fixed; inset: 0; display: grid; place-items: center; background: rgba(7, 7, 7, 0.28); z-index: 20; }
.help-card { background: var(--paper); color: var(--ink); border: 1px solid var(--edge); padding: 26px 30px 22px; min-width: 400px; max-width: 92vw; }
.help-card h3 { font-family: var(--display); font-weight: 500; font-size: 18px; margin: 0 0 14px; }
.help-card table { border-collapse: collapse; font-size: 13.5px; width: 100%; }
.help-card td { padding: 6px 18px 6px 0; border-top: 1px solid var(--hair-soft); color: var(--ink-2); }
.help-card td:first-child { color: var(--ink); font-family: var(--display); font-weight: 500; white-space: nowrap; }
.help-card p { font-size: 12.5px; line-height: 1.5; color: var(--titanium); margin: 14px 0 0; }
.toast { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); background: var(--ink); color: var(--paper); font-size: 12.5px; padding: 7px 12px; opacity: 0; transition: opacity 160ms; pointer-events: none; z-index: 21; }
.toast.is-on { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .progress i, .toast { transition: none; } }

@media (max-width: 1180px) { .lb { display: none; } .seg .ib { padding: 0 9px; } .ib { gap: 0; } }
@media (max-width: 900px) {
  .viewer { grid-template-columns: 0 minmax(0, 1fr); }
  .viewer .sb { display: none; }
  .viewer.sb-open .sb { display: flex; position: absolute; left: 0; top: 0; bottom: 0; width: min(84vw, 300px); z-index: 10; }
  .toolbar { gap: 8px; padding: 0 8px; }
  .toolbar .hide-sm, .toolbar .sep, .bar-brand { display: none; }
  .book-in { padding: 24px 16px 80px; gap: 24px; }
  .book-head { grid-template-columns: 1fr; gap: 12px; }
  .book-head h1 { font-size: 32px; }
  .book-head .meta { text-align: left; }
  .book-toc { grid-template-columns: 1fr 1fr; }
  .book-sec, .page { grid-template-columns: 1fr; gap: 10px; }
  .page .pn { display: flex; gap: 10px; align-items: baseline; }
  .page .pn b { font-size: 16px; margin: 0; }
}
`;

/**
 * The chrome markup (tail.html lines 1 to 60 without the surfaces panel). The
 * runtime moves the render's stage (`#ts-stagewrap > .ts-sheet.sheet`) into
 * `#stagewrap`. The mark in the sidebar head and the toolbar brand is the
 * sprite's #gt-mark, which the stage carries.
 */
export function standaloneChromeHtml(title: string): string {
  const t = title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const mark = '<svg fill="currentColor" aria-hidden="true"><use href="#gt-mark"/></svg>';
  return (
    `<style>${STANDALONE_CHROME_CSS}</style>` +
    `<div class="viewer" id="viewer">` +
    `<aside class="sb" id="sb" aria-label="Slides"><div class="sb-head">${mark}<b id="sb-title">${t}</b><span id="sb-count"></span></div><div class="thumbs scroll" id="thumbs"></div></aside>` +
    `<section class="main" id="main">` +
    `<div class="toolbar" role="toolbar" aria-label="Deck controls">` +
    `<div class="bar-l">` +
    `<button type="button" class="ib icon" data-act="sb" title="Show or hide the slide list ([)" aria-label="Show or hide the slide list">${icon(P.sidebar)}</button>` +
    `<span class="bar-brand">${mark}<b>${t}</b></span>` +
    `<span class="sep"></span>` +
    `<button type="button" class="ib icon" data-act="prev" title="Previous slide (left arrow)" aria-label="Previous slide">${icon(P.prev)}</button>` +
    `<span class="count"><b id="bar-n">01</b><span class="of"> / </span><span id="bar-total"></span></span>` +
    `<button type="button" class="ib icon" data-act="next" title="Next slide (right arrow)" aria-label="Next slide">${icon(P.next)}</button>` +
    `</div>` +
    `<div class="bar-r">` +
    `<div class="seg" role="group" aria-label="View">` +
    `<button type="button" class="ib is-on" data-mode="slide" title="One slide at a time (Esc)" aria-pressed="true">${icon(P.slide, false)}<span class="lb">Slide</span></button>` +
    `<button type="button" class="ib" data-mode="grid" title="Every slide as a grid (G)" aria-pressed="false">${icon(P.grid)}<span class="lb">Grid</span></button>` +
    `<button type="button" class="ib" data-mode="book" title="Read the deck as a book (B)" aria-pressed="false">${icon(P.book, false)}<span class="lb">Book</span></button>` +
    `</div>` +
    `<span class="sep"></span>` +
    `<button type="button" class="ib icon" data-act="theme" title="Dark or light (D)" aria-label="Dark or light"><span class="theme-glyph" aria-hidden="true">◑</span></button>` +
    `<button type="button" class="ib icon hide-sm" data-act="present" title="Presentation mode, chrome hidden (P)" aria-label="Presentation mode">${icon(P.present, false)}</button>` +
    `<button type="button" class="ib icon" data-act="full" title="Fullscreen (F)" aria-label="Fullscreen">${icon(P.full, false)}</button>` +
    `<button type="button" class="ib icon hide-sm" data-act="link" title="Copy a link to this slide" aria-label="Copy a link to this slide"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="${P.link1}"/><path d="${P.link2}"/></svg></button>` +
    `<button type="button" class="ib icon" data-act="help" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">${icon(P.help)}</button>` +
    `</div></div>` +
    `<div class="stagewrap" id="stagewrap"><div class="backdrop" id="backdrop" aria-hidden="true"><img alt=""></div><div class="grid scroll" id="grid" hidden></div><div class="book scroll" id="book" hidden><div class="book-in" id="book-in"></div></div></div>` +
    `<div class="progress" aria-hidden="true"><i id="progress"></i></div>` +
    `</section></div>` +
    `<div class="help" id="help" hidden><div class="help-card" role="dialog" aria-label="Keyboard shortcuts"><h3>Keyboard shortcuts</h3><table>` +
    `<tr><td>Right, Space, J, L</td><td>Next slide</td></tr><tr><td>Left, K, H</td><td>Previous slide</td></tr><tr><td>Home, End</td><td>First and last slide</td></tr><tr><td>1 to 9, then Enter</td><td>Go to a slide number</td></tr><tr><td>G</td><td>Grid of every slide</td></tr><tr><td>B</td><td>Book view, the deck read top to bottom</td></tr><tr><td>[ or S</td><td>Show or hide the slide list</td></tr><tr><td>D</td><td>Dark or light</td></tr><tr><td>P</td><td>Presentation mode, chrome hidden</td></tr><tr><td>F</td><td>Fullscreen</td></tr><tr><td>?</td><td>Keyboard shortcuts</td></tr><tr><td>Esc</td><td>Back to the slide view, or close a panel</td></tr>` +
    `</table><p>Click the left or right half of a slide to move. In the book view, click a page to open it as a slide. The URL hash tracks the current slide.</p></div></div>` +
    `<div class="toast" id="toast"></div>`
  );
}
