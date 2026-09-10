/*
  The standalone deck runtime: deck/parts/tail.html's script ported to typed,
  dependency-free TypeScript (SPEC 5.3: the static viewer and the Prototemplate
  /deck iframe run renderStandalone's one HTML file with this framework-free,
  feature-frozen port). No imports, no exports, erasable syntax only: the
  render package reads this file, strips the types with node:module
  (standalone/source.ts) and inlines the result as one classic <script> at
  the end of the built file.

  Markup contract. renderStandalone (@turboslide/render) emits the stage the render owns:
    #ts-stagewrap > .ts-sheet.sheet[data-theme] > .ts-stage.stage#stage holding .frame, the sprite,
    every .slide (data-slide="<id>", data-kind="<kind>"; data-title and data-section when the
    renderer writes them, else the title is the first heading and the whole deck is one section),
    .wordmark and .counter.
  The chrome (standalone/chrome.ts, baked in at CHROME_HTML by standalone/source.ts) is tail.html's:
    #viewer .viewer        the fixed grid; classes no-sb, sb-open, is-overview, is-book, is-present
    #sb .sb                the sidebar; #sb-count its count; #thumbs .thumbs.scroll the list
    #stagewrap .stagewrap  the stage box the runtime adopts the render's sheet into; #backdrop > img
    #grid .grid.scroll, #book .book.scroll > #book-in .book-in
    #bar-n, #bar-total, #progress, [data-act=prev|next|sb|theme|present|full|link|surfaces|help],
    [data-mode=slide|grid|book], #help .help, #toast .toast
  The runtime injects the chrome when the document has no #viewer, so a build that passes only the
  runtime still gets the whole viewer.

  Behavior kept from tail.html: the sidebar of live clones, the grid, the
  lazily built book with its IntersectionObserver at -42%, the fit math, the
  dual-key theme (gt-theme then gt-deck-theme, default dark, never
  prefers-color-scheme) with the storage and message bridges, the backdrop
  for full-picture slides, the dither canvases, the key table (SPEC 6.9),
  click halves and swipe, copy link, help and toast, and the hash contract:
  #NN is written (Prototemplate's DeckFrame mirrors it) and { type:
  'gt-deck-slide', n } is posted to the parent frame; #s/<slideId> is read as
  well (SPEC 5.3).
*/
(function bootStandalone(): void {
  type Mode = 'slide' | 'grid' | 'book';
  type Theme = 'light' | 'dark';

  function $(id: string): HTMLElement | null {
    return document.getElementById(id);
  }
  function need(id: string): HTMLElement {
    const el = $(id);
    if (!el) throw new Error(`turboslide standalone: missing #${id}`);
    return el;
  }

  /* the chrome markup, baked in by standalone/source.ts; injected when the document has none */
  const CHROME_HTML = '__TURBOSLIDE_STANDALONE_CHROME__';
  if (!$('viewer') && CHROME_HTML.indexOf('<') === 0) {
    document.body.insertAdjacentHTML('afterbegin', CHROME_HTML);
  }
  /* adopt the render's stage (#ts-stagewrap > .ts-sheet.sheet) into the chrome's stage box */
  const rendered = $('ts-stagewrap');
  const wrap = need('stagewrap');
  if (rendered && rendered !== wrap) {
    while (rendered.firstChild) wrap.appendChild(rendered.firstChild);
    rendered.remove();
  }
  const viewer = need('viewer');
  const sb = need('sb');
  const sheet =
    $('sheet') ?? wrap.querySelector<HTMLElement>('.ts-sheet.sheet, .sheet') ?? need('sheet');
  if (!sheet.id) sheet.id = 'sheet';
  const stage =
    $('stage') ?? sheet.querySelector<HTMLElement>('.ts-stage, .stage') ?? need('stage');
  const grid = need('grid');
  const book = need('book');
  const bookIn = need('book-in');
  const thumbsEl = need('thumbs');
  const slides = Array.prototype.slice.call(stage.querySelectorAll('.slide')) as HTMLElement[];
  const backImg = document.querySelector<HTMLImageElement>('#backdrop img');
  const counter = stage.querySelector<HTMLElement>('.counter') ?? $('counter');
  const barTitle = $('bar-title');
  const barSec = $('bar-sec');
  const barN = $('bar-n');
  const barTotal = $('bar-total');
  const progress = need('progress');
  const help = need('help');
  const toast = need('toast');
  const panel = $('panel');
  const filter = $('surf-filter') as HTMLInputElement | null;
  const surfCount = $('surf-count');

  let i = 0;
  let digits = '';
  let digitTimer = 0;
  let mode: Mode = 'slide';
  let reduced = false;
  try {
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    reduced = false;
  }

  /* the deck's title: the chrome's sidebar head, else the document title */
  const titleEl = $('sb-title');
  const deckTitle =
    (titleEl && titleEl.textContent) || document.title.replace(/,\s*\d+ of \d+$/, '') || 'Deck';
  /* the sections, derived from data-section on the slides: a change of name starts a section (SPEC 4.2:
     the manifest is the only place order lives); a build without the attribute is one section named for the deck */
  const SECTIONS: [number, string][] = [];
  slides.forEach((slide, k) => {
    const name = slide.getAttribute('data-section') || deckTitle;
    const last = SECTIONS[SECTIONS.length - 1];
    if (!last || last[1] !== name) SECTIONS.push([k + 1, name]);
  });
  function sectionOf(k: number): string {
    let name = SECTIONS.length ? SECTIONS[0]![1] : '';
    SECTIONS.forEach((s) => {
      if (s[0] <= k + 1) name = s[1];
    });
    return name;
  }
  function sectionRange(idx: number): [number, number] {
    const start = SECTIONS[idx]![0];
    const next = SECTIONS[idx + 1];
    return [start, next ? next[0] - 1 : slides.length];
  }
  function sectionStart(k: number): number {
    let idx = -1;
    SECTIONS.forEach((s, j) => {
      if (s[0] === k + 1) idx = j;
    });
    return idx;
  }

  function store(k: string, v: string): void {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode: the choice holds for the session only */
    }
  }
  function load(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  }
  function pad(n: number): string {
    return (n < 10 ? '0' : '') + n;
  }
  function titleOf(slide: HTMLElement, k: number): string {
    const given = slide.getAttribute('data-title');
    const el = slide.querySelector('h1, h2, .big');
    const t = given || (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : `Slide ${k + 1}`);
    return t.length > 72 ? `${t.slice(0, 69).replace(/\s+\S*$/, '')}...` : t;
  }
  function isDark(): boolean {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }
  let toastTimer = 0;
  function say(msg: string): void {
    toast.textContent = msg;
    toast.classList.add('is-on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-on'), 1400);
  }
  function narrow(): boolean {
    return window.innerWidth <= 900;
  }
  function panelOn(): boolean {
    return Boolean(panel && panel.classList.contains('is-on'));
  }

  /* the 8 by 8 Bayer screen, a permutation of 0..63 (SPEC 5.4; @turboslide/effects bayer8 is the same table) */
  const B4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  const Q = [0, 2, 3, 1];
  function bayer8(r: number, c: number): number {
    const rr = r % 8;
    const cc = c % 8;
    return B4[rr % 4]![cc % 4]! * 4 + Q[Math.floor(rr / 4) * 2 + Math.floor(cc / 4)]!;
  }
  function drawDither(canvas: HTMLCanvasElement): void {
    let W = Math.max(8, Math.round(canvas.clientWidth / 2));
    let H = Math.max(8, Math.round(canvas.clientHeight / 2));
    if (!canvas.clientWidth) {
      W = 505;
      H = 110;
    }
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dark = isDark();
    ctx.fillStyle = dark ? '#070707' : '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = dark ? '#f2f2f0' : '#070707';
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        if (bayer8(y, x) / 64 < 1 - x / W) ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  function drawAllDither(): void {
    document.querySelectorAll<HTMLCanvasElement>('canvas.dither').forEach((c) => {
      c.dataset.drawn = '';
    });
    const cur = slides[i];
    const c = cur ? cur.querySelector<HTMLCanvasElement>('canvas.dither') : null;
    if (c) {
      drawDither(c);
      c.dataset.drawn = '1';
    }
    thumbsEl.querySelectorAll<HTMLCanvasElement>('canvas.dither').forEach(drawDither);
    if (mode === 'book')
      bookIn.querySelectorAll<HTMLCanvasElement>('canvas.dither').forEach(drawDither);
  }

  /* a live copy of a slide, with its frame, for the slide list and the book */
  function cloneSlide(k: number): HTMLElement {
    const mini = document.createElement('div');
    mini.className = 'mini ts-sheet';
    mini.setAttribute('data-theme', isDark() ? 'dark' : 'light');
    const frame = stage.querySelector('.frame');
    if (frame) mini.appendChild(frame.cloneNode(true));
    const clone = slides[k]!.cloneNode(true) as HTMLElement;
    clone.classList.add('is-on');
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    mini.appendChild(clone);
    return mini;
  }

  /* the slide list */
  const thumbs: HTMLElement[] = [];
  function buildThumbs(): void {
    slides.forEach((slide, k) => {
      const idx = sectionStart(k);
      if (idx >= 0) {
        const lab = document.createElement('div');
        lab.className = 'sec-label';
        lab.textContent = SECTIONS[idx]![1];
        thumbsEl.appendChild(lab);
      }
      const t = document.createElement('div');
      t.className = 'thumb';
      t.dataset.k = String(k);
      t.setAttribute('role', 'button');
      t.tabIndex = 0;
      const n = document.createElement('div');
      n.className = 'n';
      n.textContent = pad(k + 1);
      const body = document.createElement('div');
      const f = document.createElement('div');
      f.className = 'thumb-frame';
      f.appendChild(cloneSlide(k));
      const tt = document.createElement('div');
      tt.className = 'thumb-title';
      tt.textContent = titleOf(slide, k);
      body.appendChild(f);
      body.appendChild(tt);
      t.appendChild(n);
      t.appendChild(body);
      t.addEventListener('click', () => go(k));
      t.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go(k);
        }
      });
      thumbsEl.appendChild(t);
      thumbs.push(t);
    });
    const sbCount = $('sb-count');
    if (sbCount) sbCount.textContent = `${slides.length} slides`;
    if (barTotal) barTotal.textContent = pad(slides.length);
    scaleThumbs();
  }
  function scaleThumbs(): void {
    thumbs.forEach((t) => {
      const f = t.querySelector<HTMLElement>('.thumb-frame');
      const w = f ? f.clientWidth : 0;
      const mini = f ? f.querySelector<HTMLElement>('.mini') : null;
      if (w && mini) mini.style.setProperty('--k', String((w - 2) / 1600));
    });
  }
  function go(k: number): void {
    if (mode === 'grid') setMode('slide');
    show(k);
    if (narrow()) setSidebar(false);
  }

  /* the book: a head, a contents list, then every slide as a page under its section */
  const pages: HTMLElement[] = [];
  let bookIO: IntersectionObserver | null = null;
  function buildBook(): void {
    const title = deckTitle;
    const head = document.createElement('div');
    head.className = 'book-head';
    head.innerHTML = '<div><h1></h1><p></p></div><div class="meta"></div>';
    head.querySelector('h1')!.textContent = title;
    const sectionsText = `${SECTIONS.length} ${SECTIONS.length === 1 ? 'section' : 'sections'}`;
    const slidesText = `${slides.length} ${slides.length === 1 ? 'slide' : 'slides'}`;
    head.querySelector('p')!.textContent =
      `${slidesText} in ${sectionsText}. Read it top to bottom, or click a page to open it as a slide.`;
    head.querySelector('.meta')!.innerHTML = `${sectionsText}<br>${slidesText}`;
    bookIn.appendChild(head);
    const toc = document.createElement('nav');
    toc.className = 'book-toc';
    toc.setAttribute('aria-label', 'Contents');
    SECTIONS.forEach((sec, idx) => {
      const r = sectionRange(idx);
      const a = document.createElement('a');
      a.href = `#${r[0]}`;
      const sp = document.createElement('span');
      sp.textContent = sec[1];
      const sm = document.createElement('small');
      sm.textContent = r[1] > r[0] ? `${pad(r[0])} to ${pad(r[1])}` : pad(r[0]);
      a.appendChild(sp);
      a.appendChild(sm);
      a.addEventListener('click', (e) => {
        e.preventDefault();
        show(r[0] - 1);
      });
      toc.appendChild(a);
    });
    bookIn.appendChild(toc);
    slides.forEach((slide, k) => {
      const idx = sectionStart(k);
      if (idx >= 0) {
        const r = sectionRange(idx);
        const sec = document.createElement('div');
        sec.className = 'book-sec';
        const sm = document.createElement('small');
        sm.innerHTML = `Section ${idx + 1}<br>${r[1] > r[0] ? `Slides ${pad(r[0])} to ${pad(r[1])}` : `Slide ${pad(r[0])}`}`;
        const h = document.createElement('h2');
        h.textContent = SECTIONS[idx]![1];
        sec.appendChild(sm);
        sec.appendChild(h);
        bookIn.appendChild(sec);
      }
      const p = document.createElement('article');
      p.className = 'page';
      p.dataset.k = String(k);
      const pn = document.createElement('div');
      pn.className = 'pn';
      const b = document.createElement('b');
      b.textContent = pad(k + 1);
      const t = document.createElement('span');
      t.textContent = titleOf(slide, k);
      pn.appendChild(b);
      pn.appendChild(t);
      const f = document.createElement('div');
      f.className = 'page-frame';
      f.appendChild(cloneSlide(k));
      f.addEventListener('click', (e) => {
        if ((e.target as Element).closest('a, button')) return;
        setMode('slide');
        show(k);
      });
      p.appendChild(pn);
      p.appendChild(f);
      bookIn.appendChild(p);
      pages.push(p);
    });
    if (typeof IntersectionObserver !== 'undefined') {
      bookIO = new IntersectionObserver(
        (entries) => {
          if (mode !== 'book') return;
          let best: IntersectionObserverEntry | null = null;
          for (const en of entries) {
            if (en.isIntersecting && (!best || en.intersectionRatio > best.intersectionRatio))
              best = en;
          }
          if (best) {
            const k = Number(best.target.getAttribute('data-k'));
            if (k !== i) show(k, { scroll: false });
          }
        },
        { root: book, rootMargin: '-42% 0px -42% 0px', threshold: [0, 0.25, 0.5, 1] },
      );
      pages.forEach((p) => bookIO!.observe(p));
    }
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(scaleBook).observe(bookIn);
  }
  function scaleBook(): void {
    const f = bookIn.querySelector<HTMLElement>('.page-frame');
    if (f && f.clientWidth) bookIn.style.setProperty('--k', String((f.clientWidth - 2) / 1600));
  }

  /* the sheet: the 1600 x 900 stage scaled to the space left over (SPEC 5.5) */
  function fit(): void {
    const presenting = viewer.classList.contains('is-present');
    const pad2 = presenting ? 0 : narrow() ? 12 : 28;
    const side = panel && panelOn() && !narrow() ? panel.offsetWidth : 0;
    const aw = wrap.clientWidth - side;
    const ah = wrap.clientHeight;
    const s = Math.max(0.05, Math.min((aw - pad2 * 2) / 1600, (ah - pad2 * 2) / 900));
    const W = Math.round(1600 * s);
    const H = Math.round(900 * s);
    sheet.style.width = `${W}px`;
    sheet.style.height = `${H}px`;
    sheet.style.left = `${Math.round((aw - W) / 2) - 1}px`;
    sheet.style.top = `${Math.round((ah - H) / 2) - 1}px`;
    stage.style.transform = `scale(${W / 1600})`;
  }
  function applyTheme(): void {
    const dark = isDark();
    const glyph = document.querySelector('[data-act="theme"] .theme-glyph');
    if (glyph) glyph.textContent = dark ? '◑' : '◐';
    /* the sheet's tokens follow the sheet's own attribute (SPEC 5.1), stamped on the stage and every clone */
    document.querySelectorAll<HTMLElement>('.ts-sheet').forEach((el) => {
      el.setAttribute('data-theme', dark ? 'dark' : 'light');
    });
    // The renderer writes only the twin that differs from src (render/blocks/context.ts), so the
    // missing twin is src; tail:223-225 did this for the light twin only.
    document
      .querySelectorAll<HTMLImageElement>('img[data-light], img[data-dark]')
      .forEach((img) => {
        if (!img.dataset.light) img.dataset.light = img.getAttribute('src') || '';
        if (!img.dataset.dark) img.dataset.dark = img.getAttribute('src') || '';
        const want = dark ? img.dataset.dark : img.dataset.light;
        if (want && img.getAttribute('src') !== want) img.setAttribute('src', want);
      });
    drawAllDither();
    syncBackdrop();
  }
  /* a full-picture slide fills the stage area: the backdrop takes the active slide's image in the current theme (slide mode only) */
  function syncBackdrop(): void {
    const cur = slides[i];
    const pic = cur ? cur.querySelector<HTMLImageElement>('.opener-img, .mood-img') : null;
    const on = Boolean(pic) && mode === 'slide';
    wrap.classList.toggle('is-picture', on);
    if (on && backImg && pic) {
      const src = pic.getAttribute('src');
      if (src && backImg.getAttribute('src') !== src) backImg.setAttribute('src', src);
    }
  }
  function show(n: number, opts?: { hash?: boolean; scroll?: boolean }): void {
    const o = opts || {};
    const k = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach((s, j) => s.classList.toggle('is-on', j === k));
    thumbs.forEach((t, j) => t.classList.toggle('is-active', j === k));
    pages.forEach((p, j) => p.classList.toggle('is-active', j === k));
    i = k;
    syncBackdrop();
    if (counter) counter.textContent = `${pad(k + 1)} / ${pad(slides.length)}`;
    if (barN) barN.textContent = pad(k + 1);
    const cur = slides[k];
    if (barTitle && cur) barTitle.textContent = titleOf(cur, k);
    if (barSec) barSec.textContent = sectionOf(k);
    progress.style.width = `${((k + 1) / slides.length) * 100}%`;
    const base = document.title.replace(/,\s*\d+ of \d+$/, '');
    document.title = `${base}, ${k + 1} of ${slides.length}`;
    if (o.hash !== false) {
      try {
        history.replaceState(null, '', `#${k + 1}`);
      } catch {
        /* a sandboxed document: the state still moves, the address does not */
      }
      /* inside the /deck frame the page around it mirrors the slide into its own address (Prototemplate DeckFrame.tsx) */
      if (window.parent !== window) {
        try {
          window.parent.postMessage({ type: 'gt-deck-slide', n: k + 1 }, location.origin);
        } catch {
          /* a detached frame: nothing to tell */
        }
      }
    }
    const c = cur ? cur.querySelector<HTMLCanvasElement>('canvas.dither') : null;
    if (c && !c.dataset.drawn) {
      drawDither(c);
      c.dataset.drawn = '1';
    }
    if (mode !== 'grid') {
      const t = thumbs[k];
      if (t) {
        try {
          t.scrollIntoView({ block: 'nearest' });
        } catch {
          /* an old engine without options */
        }
      }
    }
    if (mode === 'book' && o.scroll !== false) {
      const p = pages[k];
      if (p) {
        try {
          p.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
        } catch {
          p.scrollIntoView();
        }
      }
    }
  }
  /* #NN (the deck's number) or #s/<slideId> (the studio's stable form), SPEC 5.3 */
  function fromHash(): number {
    const raw = location.hash.replace('#', '');
    if (raw.indexOf('s/') === 0) {
      let id = raw.slice(2);
      try {
        id = decodeURIComponent(id);
      } catch {
        /* keep the raw id */
      }
      const at = slides.findIndex((s) => s.getAttribute('data-slide') === id);
      return at < 0 ? 0 : at;
    }
    const h = parseInt(raw, 10);
    return isNaN(h) ? 0 : h - 1;
  }

  function sidebarVisible(): boolean {
    return getComputedStyle(sb).display !== 'none';
  }
  function setSidebar(on: boolean): void {
    if (narrow()) {
      viewer.classList.remove('no-sb');
      viewer.classList.toggle('sb-open', on);
    } else {
      viewer.classList.remove('sb-open');
      viewer.classList.toggle('no-sb', !on);
      store('gt-deck-sb', on ? '1' : '0');
    }
    requestAnimationFrame(() => {
      fit();
      scaleThumbs();
    });
  }
  function setMode(m: Mode): void {
    if (m === mode) return;
    const prev = mode;
    mode = m;
    viewer.classList.toggle('is-overview', m === 'grid');
    viewer.classList.toggle('is-book', m === 'book');
    document.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) => {
      const on = b.dataset.mode === m;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (prev === 'grid') sb.appendChild(thumbsEl);
    if (m === 'grid') grid.appendChild(thumbsEl);
    syncBackdrop();
    if (m === 'book' && !pages.length) buildBook();
    grid.hidden = m !== 'grid';
    book.hidden = m !== 'book';
    sheet.hidden = m !== 'slide';
    store('gt-deck-mode', m);
    requestAnimationFrame(() => {
      fit();
      scaleThumbs();
      if (m === 'book') {
        scaleBook();
        drawAllDither();
        pages.forEach((p, k) => p.classList.toggle('is-active', k === i));
        if (i === 0) book.scrollTop = 0;
        else {
          const p = pages[i];
          if (p) {
            try {
              p.scrollIntoView({ block: 'start' });
            } catch {
              /* an old engine without options */
            }
          }
        }
      }
      const t = thumbs[i];
      if (t) {
        try {
          t.scrollIntoView({ block: 'nearest' });
        } catch {
          /* an old engine without options */
        }
      }
    });
  }
  function present(on?: boolean): void {
    const goingOn = on === undefined ? !viewer.classList.contains('is-present') : on;
    if (goingOn) {
      setMode('slide');
      togglePanel(false);
    }
    viewer.classList.toggle('is-present', goingOn);
    requestAnimationFrame(fit);
  }
  function fullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void document.documentElement.requestFullscreen();
  }
  document.addEventListener('fullscreenchange', () => present(Boolean(document.fullscreenElement)));
  function copyLink(): void {
    const url = location.href;
    try {
      navigator.clipboard.writeText(url).then(
        () => say(`Link to slide ${i + 1} copied`),
        () => say(url),
      );
    } catch {
      say(url);
    }
  }
  /* one theme for the site and the deck: gt-theme is the key the Prototemplate shell reads and writes, gt-deck-theme the
     deck's older one; the toggle writes both, and a toggle on the page around the frame arrives as a storage event.
     With neither key set the deck opens dark, as the site does; prefers-color-scheme is not consulted (SPEC 6.8) */
  function storedTheme(): Theme {
    const t = load('gt-theme');
    if (t === 'dark' || t === 'light') return t;
    const d = load('gt-deck-theme');
    if (d === 'dark' || d === 'light') return d;
    return 'dark';
  }
  function toggleTheme(): void {
    const next: Theme = isDark() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    store('gt-theme', next);
    store('gt-deck-theme', next);
    applyTheme();
  }
  window.addEventListener('storage', (e) => {
    if (e.key !== 'gt-theme' || (e.newValue !== 'dark' && e.newValue !== 'light')) return;
    document.documentElement.setAttribute('data-theme', e.newValue);
    applyTheme();
  });
  /* the page around the frame also posts { type: 'gt-theme', theme } on every toggle and once on load
     (Prototemplate ThemeButton.tsx, DeckFrame.tsx); it arrives where the storage event does not,
     in a private window, and lands the same way. Same origin only. */
  window.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as { type?: unknown; theme?: unknown } | null;
    if (
      !d ||
      d.type !== 'gt-theme' ||
      (d.theme !== 'dark' && d.theme !== 'light') ||
      e.origin !== location.origin
    )
      return;
    if (document.documentElement.getAttribute('data-theme') === d.theme) return;
    document.documentElement.setAttribute('data-theme', d.theme);
    store('gt-deck-theme', d.theme);
    applyTheme();
  });

  /* the surface index, when the build carries one */
  function togglePanel(on?: boolean): void {
    if (!panel) return;
    const goingOn = on === undefined ? !panelOn() : on;
    panel.classList.toggle('is-on', goingOn);
    panel.setAttribute('aria-hidden', goingOn ? 'false' : 'true');
    viewer.classList.toggle('has-panel', goingOn);
    document.querySelectorAll<HTMLElement>('[data-act="surfaces"]').forEach((b) => {
      b.classList.toggle('is-on', goingOn);
      b.setAttribute('aria-pressed', goingOn ? 'true' : 'false');
    });
    if (goingOn && !narrow() && filter) window.setTimeout(() => filter.focus(), 200);
    if (!goingOn && filter) filter.blur();
    requestAnimationFrame(fit);
  }
  function filterSurfaces(): void {
    if (!panel || !filter) return;
    const q = filter.value.trim().toLowerCase();
    let n = 0;
    panel.querySelectorAll<HTMLAnchorElement>('.surf').forEach((a) => {
      const hit =
        !q ||
        (a.textContent || '').toLowerCase().indexOf(q) >= 0 ||
        a.href.toLowerCase().indexOf(q) >= 0;
      a.hidden = !hit;
      if (hit) n += 1;
    });
    panel.querySelectorAll<HTMLElement>('.surf-group').forEach((g) => {
      g.hidden = !g.querySelector('.surf:not([hidden])');
    });
    if (surfCount) surfCount.textContent = `${n}${n === 1 ? ' surface' : ' surfaces'}`;
  }
  if (filter) filter.addEventListener('input', filterSurfaces);

  document.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-act], [data-mode]');
    if (!b) return;
    if (b.dataset.mode) {
      const m = b.dataset.mode as Mode;
      setMode(m === mode && m !== 'slide' ? 'slide' : m);
      return;
    }
    const act = b.dataset.act;
    if (act === 'prev') show(i - 1);
    else if (act === 'next') show(i + 1);
    else if (act === 'sb') setSidebar(!sidebarVisible());
    else if (act === 'theme') toggleTheme();
    else if (act === 'present') present(true);
    else if (act === 'full') fullscreen();
    else if (act === 'link') copyLink();
    else if (act === 'surfaces') togglePanel();
    else if (act === 'help') help.hidden = !help.hidden;
  });
  help.addEventListener('click', () => {
    help.hidden = true;
  });
  wrap.addEventListener('click', (e) => {
    if (mode !== 'slide') return;
    if ((e.target as Element).closest('a, button, input')) return;
    const r = sheet.getBoundingClientRect();
    show(i + (e.clientX > r.left + r.width / 2 ? 1 : -1));
  });

  /* the key table (SPEC 6.9; @turboslide/viewer keys.ts is the reference) */
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) {
      if (k === 'Escape') {
        e.preventDefault();
        togglePanel(false);
      }
      return;
    }
    if (k >= '0' && k <= '9' && k.length === 1) {
      digits += k;
      window.clearTimeout(digitTimer);
      digitTimer = window.setTimeout(() => {
        digits = '';
      }, 1500);
      say(`Slide ${digits}, press Enter`);
      return;
    }
    if (k === 'Enter' && digits) {
      const n = parseInt(digits, 10);
      digits = '';
      if (mode === 'grid') setMode('slide');
      show(n - 1);
      return;
    }
    if (
      k === 'ArrowRight' ||
      k === ' ' ||
      k === 'PageDown' ||
      k === 'j' ||
      k === 'l' ||
      (mode === 'book' && k === 'ArrowDown')
    ) {
      e.preventDefault();
      show(i + 1);
    } else if (
      k === 'ArrowLeft' ||
      k === 'PageUp' ||
      k === 'k' ||
      k === 'h' ||
      k === 'Backspace' ||
      (mode === 'book' && k === 'ArrowUp')
    ) {
      e.preventDefault();
      show(i - 1);
    } else if (k === 'Home') show(0);
    else if (k === 'End') show(slides.length - 1);
    else if (k === 'g') setMode(mode === 'grid' ? 'slide' : 'grid');
    else if (k === 'b') setMode(mode === 'book' ? 'slide' : 'book');
    else if (k === 'r') togglePanel();
    else if (k === '[' || k === 's') setSidebar(!sidebarVisible());
    else if (k === 'd') toggleTheme();
    else if (k === 'p') present();
    else if (k === 'f') fullscreen();
    else if (k === '?') help.hidden = !help.hidden;
    else if (k === 'Escape') {
      if (!help.hidden) help.hidden = true;
      else if (panelOn()) togglePanel(false);
      else if (mode !== 'slide') setMode('slide');
      else if (viewer.classList.contains('is-present') && !document.fullscreenElement)
        present(false);
      else if (narrow() && viewer.classList.contains('sb-open')) setSidebar(false);
    }
  });

  let tx: number | null = null;
  wrap.addEventListener(
    'touchstart',
    (e) => {
      if (mode === 'slide') tx = e.changedTouches[0]!.clientX;
    },
    { passive: true },
  );
  wrap.addEventListener(
    'touchend',
    (e) => {
      if (tx === null || mode !== 'slide') return;
      const dx = e.changedTouches[0]!.clientX - tx;
      tx = null;
      if (Math.abs(dx) > 40) show(i + (dx < 0 ? 1 : -1));
    },
    { passive: true },
  );

  window.addEventListener('resize', () => {
    fit();
    scaleThumbs();
  });
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      fit();
      scaleThumbs();
    }).observe(wrap);
  }
  window.addEventListener('hashchange', () => show(fromHash(), { hash: false }));

  document.documentElement.setAttribute('data-theme', storedTheme());
  buildThumbs();
  filterSurfaces();
  if (load('gt-deck-sb') === '0') setSidebar(false);
  applyTheme();
  fit();
  show(fromHash(), { hash: false });
  if (load('gt-deck-mode') === 'book') setMode('book');
  window.addEventListener('load', () => {
    fit();
    scaleThumbs();
    drawAllDither();
  });
})();
