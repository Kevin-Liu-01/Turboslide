// The small inline runtime of the render surface (renderDeck) and the placeholder standalone
// runtime (renderStandalone), as strings the documents embed. Both are framework free. The
// standalone runtime is a placeholder until @turboslide/viewer lands its tail.html port
// (packages/viewer/standalone/runtime.ts, MILESTONES M1 item 12); renderStandalone takes the real
// runtime through its build argument.

/**
 * The deck's 8 by 8 Bayer screen and dither ramp (tail:100-114), as a script body. The block draws
 * nothing; the runtime draws every `canvas.dither` at half the CSS size per axis so a cell is one
 * canvas pixel, `bayer8(y, x) / 64 < 1 - x / W`, upscaled with `image-rendering: pixelated`
 * (SPEC 5.2, 5.4). Kept in sync with @turboslide/effects `bayer8` and `ditherRamp`.
 */
export const DITHER_SCRIPT = `
var B4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
var Q = [0, 2, 3, 1];
function bayer8(r, c) { r = r % 8; c = c % 8; return B4[r % 4][c % 4] * 4 + Q[Math.floor(r / 4) * 2 + Math.floor(c / 4)]; }
function drawDither(canvas, dark) {
  var W = Math.max(8, Math.round(canvas.clientWidth / 2)), H = Math.max(8, Math.round(canvas.clientHeight / 2));
  if (!canvas.clientWidth) { W = 505; H = 110; }
  canvas.width = W; canvas.height = H;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = dark ? '#070707' : '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = dark ? '#f2f2f0' : '#070707';
  for (var y = 0; y < H; y += 1) for (var x = 0; x < W; x += 1) { if (bayer8(y, x) / 64 < 1 - x / W) ctx.fillRect(x, y, 1, 1); }
}
function drawAllDither(root, dark) {
  Array.prototype.forEach.call(root.querySelectorAll('canvas.dither'), function (c) { drawDither(c, dark); });
}
`;

/**
 * The render surface runtime: shows the slide named by the hash (`#12`, `#s/<slideId>`, or a slide
 * link keyword `#next`, `#previous`, `#first`, `#last` resolved against the shown slide; the first
 * slide when none), swaps `img[data-light], img[data-dark]` to the sheet's theme, sets the counter
 * from the slide's `data-counter` (the deck's counter mode, gslides-parity SPEC 7.2.4), draws the dither
 * canvases and stamps `data-ts-ready="1"` on the root when done, which the headless driver waits
 * for instead of a fixed settle (SPEC 5.3).
 */
export const RENDER_SURFACE_SCRIPT = `(function () {
${DITHER_SCRIPT}
  var sheet = document.querySelector('.ts-sheet');
  var stage = document.querySelector('.ts-stage');
  var slides = Array.prototype.slice.call(stage.querySelectorAll('.slide'));
  var counter = stage.querySelector('.counter');
  var dark = sheet.getAttribute('data-theme') === 'dark';
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var current = 0;
  function keywordIndex(h) {
    if (h === 'next') return Math.min(slides.length - 1, current + 1);
    if (h === 'previous') return Math.max(0, current - 1);
    if (h === 'first') return 0;
    if (h === 'last') return slides.length - 1;
    return -1;
  }
  function fromHash() {
    var h = location.hash.replace(/^#/, '');
    if (h.indexOf('s/') === 0) { var id = decodeURIComponent(h.slice(2)); for (var k = 0; k < slides.length; k += 1) if (slides[k].getAttribute('data-slide') === id) return k; return 0; }
    var kw = keywordIndex(h); if (kw >= 0) return kw;
    var n = parseInt(h, 10); return isNaN(n) ? 0 : Math.max(0, Math.min(slides.length - 1, n - 1));
  }
  function counterFor(i) {
    var own = slides[i] ? slides[i].getAttribute('data-counter') : null;
    return own !== null ? own : pad(i + 1) + ' / ' + pad(slides.length);
  }
  function show() {
    var i = fromHash();
    current = i;
    document.documentElement.removeAttribute('data-ts-ready');
    slides.forEach(function (s, k) { s.classList.toggle('is-on', k === i); });
    if (counter) counter.textContent = counterFor(i);
    Array.prototype.forEach.call(stage.querySelectorAll('img[data-light], img[data-dark]'), function (img) {
      if (!img.getAttribute('data-light')) img.setAttribute('data-light', img.getAttribute('src'));
      if (!img.getAttribute('data-dark')) img.setAttribute('data-dark', img.getAttribute('src'));
      var want = dark ? img.getAttribute('data-dark') : img.getAttribute('data-light');
      if (want && img.getAttribute('src') !== want) img.setAttribute('src', want);
    });
    drawAllDither(slides[i], dark);
    requestAnimationFrame(function () { requestAnimationFrame(function () { document.documentElement.setAttribute('data-ts-ready', '1'); }); });
  }
  window.addEventListener('hashchange', show);
  show();
})();`;

/**
 * Placeholder standalone runtime: the parts of tail.html a static file needs before the viewer
 * builder's port replaces it. Theme boot from `gt-theme` then `gt-deck-theme` (default dark, never
 * prefers-color-scheme, tail:305-312), the `#NN` hash contract and `#s/<slideId>`, the
 * `gt-deck-slide` post to a same-origin parent and the `gt-theme` message (tail:255-256, 324-334),
 * arrows, digits then Enter, `d` for the theme, the twin swap and the dither ramp.
 */
export const STANDALONE_RUNTIME_PLACEHOLDER = `(function () {
${DITHER_SCRIPT}
  var root = document.documentElement;
  var sheet = document.querySelector('.ts-sheet');
  var stage = document.querySelector('.ts-stage');
  var slides = Array.prototype.slice.call(stage.querySelectorAll('.slide'));
  var counter = stage.querySelector('.counter');
  var wrap = document.getElementById('ts-stagewrap');
  var i = 0, digits = '', digitTimer = null;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function storedTheme() { var t = load('gt-theme'); if (t === 'dark' || t === 'light') return t; t = load('gt-deck-theme'); if (t === 'dark' || t === 'light') return t; return 'dark'; }
  function isDark() { return root.getAttribute('data-theme') === 'dark'; }
  function applyTheme() {
    var dark = isDark();
    sheet.setAttribute('data-theme', dark ? 'dark' : 'light');
    Array.prototype.forEach.call(document.querySelectorAll('img[data-light], img[data-dark]'), function (img) {
      if (!img.getAttribute('data-light')) img.setAttribute('data-light', img.getAttribute('src'));
      if (!img.getAttribute('data-dark')) img.setAttribute('data-dark', img.getAttribute('src'));
      var want = dark ? img.getAttribute('data-dark') : img.getAttribute('data-light');
      if (want && img.getAttribute('src') !== want) img.setAttribute('src', want);
    });
    drawAllDither(stage, dark);
  }
  function setTheme(t, persist) { root.setAttribute('data-theme', t); if (persist) { store('gt-theme', t); store('gt-deck-theme', t); } applyTheme(); }
  /* the deck's page from the stage root's custom properties, read once at boot (gslides-parity SPEC-5 6.1); the GT sheet when the root carries none */
  var pageW = parseFloat(sheet.style.getPropertyValue('--ts-sheet-w')) || 1600;
  var pageH = parseFloat(sheet.style.getPropertyValue('--ts-sheet-h')) || 900;
  function fit() {
    if (!wrap) return;
    var pad2 = window.innerWidth <= 900 ? 12 : 28;
    var s = Math.max(0.05, Math.min((wrap.clientWidth - pad2 * 2) / pageW, (wrap.clientHeight - pad2 * 2) / pageH));
    var W = Math.round(pageW * s), H = Math.round(pageH * s);
    sheet.style.width = W + 'px'; sheet.style.height = H + 'px';
    sheet.style.left = Math.round((wrap.clientWidth - W) / 2) - 1 + 'px'; sheet.style.top = Math.round((wrap.clientHeight - H) / 2) - 1 + 'px';
    stage.style.transform = 'scale(' + (W / pageW) + ')';
  }
  function show(n, opts) {
    opts = opts || {};
    n = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach(function (s, k) { s.classList.toggle('is-on', k === n); });
    i = n;
    if (counter) { var own = slides[n] ? slides[n].getAttribute('data-counter') : null; counter.textContent = own !== null ? own : pad(n + 1) + ' / ' + pad(slides.length); }
    document.title = 'GT Brand deck, ' + (n + 1) + ' of ' + slides.length;
    if (opts.hash !== false) {
      try { history.replaceState(null, '', '#' + (n + 1)); } catch (e) {}
      if (window.parent !== window) { try { window.parent.postMessage({ type: 'gt-deck-slide', n: n + 1 }, location.origin); } catch (e) {} }
    }
    drawAllDither(slides[n], isDark());
  }
  function keywordIndex(h) {
    if (h === 'next') return Math.min(slides.length - 1, i + 1);
    if (h === 'previous') return Math.max(0, i - 1);
    if (h === 'first') return 0;
    if (h === 'last') return slides.length - 1;
    return -1;
  }
  function fromHash() {
    var h = location.hash.replace(/^#/, '');
    if (h.indexOf('s/') === 0) { var id = decodeURIComponent(h.slice(2)); for (var k = 0; k < slides.length; k += 1) if (slides[k].getAttribute('data-slide') === id) return k; return 0; }
    var kw = keywordIndex(h); if (kw >= 0) return kw;
    var n = parseInt(h, 10); return isNaN(n) ? 0 : n - 1;
  }
  function isKeyword(h) { return h === 'next' || h === 'previous' || h === 'first' || h === 'last'; }
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    if (k >= '0' && k <= '9') { digits += k; clearTimeout(digitTimer); digitTimer = setTimeout(function () { digits = ''; }, 1500); return; }
    if (k === 'Enter' && digits) { var n = parseInt(digits, 10); digits = ''; show(n - 1); return; }
    if (k === 'ArrowRight' || k === ' ' || k === 'PageDown' || k === 'j' || k === 'l') { e.preventDefault(); show(i + 1); }
    else if (k === 'ArrowLeft' || k === 'PageUp' || k === 'k' || k === 'h' || k === 'Backspace') { e.preventDefault(); show(i - 1); }
    else if (k === 'Home') show(0);
    else if (k === 'End') show(slides.length - 1);
    else if (k === 'd') setTheme(isDark() ? 'light' : 'dark', true);
  });
  if (wrap) wrap.addEventListener('click', function (e) { if (e.target.closest('a, button, input')) return; var r = sheet.getBoundingClientRect(); show(i + (e.clientX > r.left + r.width / 2 ? 1 : -1)); });
  window.addEventListener('storage', function (e) { if (e.key === 'gt-theme' && (e.newValue === 'dark' || e.newValue === 'light')) setTheme(e.newValue, false); });
  window.addEventListener('message', function (e) {
    var d = e && e.data;
    if (!d || d.type !== 'gt-theme' || (d.theme !== 'dark' && d.theme !== 'light') || e.origin !== location.origin) return;
    if (root.getAttribute('data-theme') !== d.theme) { root.setAttribute('data-theme', d.theme); store('gt-deck-theme', d.theme); applyTheme(); }
  });
  // a slide link (#s/<id>, #next, #previous, #first, #last; gslides-parity SPEC 7.2.7, 7.2.8):
  // a keyword resolves against the current slide and is rewritten to the numeric hash so the
  // same link fires again on the next click
  window.addEventListener('hashchange', function () { var h = location.hash.replace(/^#/, ''); show(fromHash(), { hash: isKeyword(h) }); });
  window.addEventListener('resize', fit);
  setTheme(storedTheme(), false);
  fit();
  show(fromHash(), { hash: false });
  window.addEventListener('load', function () { fit(); drawAllDither(stage, isDark()); });
})();`;

// The live dither overlay runtime (dither-runtime.ts, gslides-parity SPEC-3 10.3) is reachable
// through this subpath until the package's exports carry `./dither-runtime` (a request of
// build-3/b5.md); the module references the DOM lib itself, as measure-dom.ts does.
export * from './dither-runtime.ts';
