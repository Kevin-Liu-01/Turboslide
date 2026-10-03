/* Turboslide /home, direction C: the playground. A prototype for
   docs/gslides-parity/landing/direction-c.md, not product code.

   One deck runs the whole page. The hero edits it, the menus edit it, the agent's command line
   edits it, Present plays it, Export prints it and Version history lists every change with its
   author. Nothing leaves the tab and nothing is saved.

   What is the product's, by value: the Bayer permutation (packages/effects/src/bayer.ts), the
   tokens (packages/chrome/src/tokens.css), the selection grammar (Overlay.css), the menu labels
   and shortcuts (packages/chrome/src/menus/model.ts), the Tailor words
   (packages/chrome/src/panels/assist-strings.ts), the CLI forms, MCP tool names and HTTP paths
   (packages/agent/generated), the shape of `slide get` (recorded from the CLI on 2026-10-02).
   What is staged: the renderer (a port of the deck grammar for five slide kinds), the JSON of
   the write commands, the seeded versions. Every duration is in the motion table at the head of
   landing.css. */
(() => {
  'use strict';

  // the budget's marks: script start, the hero drawn, each instrument mounted (direction-c.md)
  performance.mark('ts:start');

  const D = document;
  const W = window;
  const $ = (s, r = D) => r.querySelector(s);
  const $$ = (s, r = D) => Array.from(r.querySelectorAll(s));
  const RM = W.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => RM.matches;
  const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (t) => t * t * (3 - 2 * t);
  const raf = (f) => W.requestAnimationFrame(f);

  function h(tag, props, ...kids) {
    const el = tag === 'svg' || tag === 'path' || tag === 'use' ? D.createElementNS('http://www.w3.org/2000/svg', tag) : D.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.setAttribute('class', v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'style') el.setAttribute('style', v);
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'text') el.textContent = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : D.createTextNode(String(kid)));
    return el;
  }

  const icon = (id) => {
    const s = h('svg', { 'aria-hidden': 'true', class: 'ic' });
    const u = h('use');
    u.setAttribute('href', '#' + id);
    s.append(u);
    return s;
  };

  const MARK24 = 'M5.91 4L23.77 4L22.92 8L5.06 8ZM12.57 4L17.11 4L15.62 11L11.08 11ZM10.87 12L15.4 12L13.7 20L9.17 20ZM2.97 4L6.17 4L5.32 8L2.12 8ZM1.38 9L9.91 9L9.48 11L0.95 11ZM0.74 12L9.27 12L8.85 14L0.31 14ZM2.55 16L8.42 16L7.57 20L1.7 20Z';
  const MARK = 'M13.5 40L147.5 40L141.1 70L7.1 70ZM63.5 40L97.5 40L85.6 96L51.6 96ZM49.9 104L83.9 104L72 160L38 160ZM-8.5 40L15.5 40L9.1 70L-14.9 70ZM-21.4 82L42.6 82L39.6 96L-24.4 96ZM-26.1 104L37.9 104L34.9 118L-29.1 118ZM-11.6 130L32.4 130L26 160L-18 160Z';

  // -------------------------------------------------------------------------------------------
  // Keys: the menus print Google's forms, symbols on a Mac and words elsewhere (menus/keys.ts)

  const SYM = { Cmd: '⌘', Shift: '⇧', Option: '⌥', Ctrl: '⌃', Enter: '↵', Up: '↑', Down: '↓', Left: '←', Right: '→', Plus: '+', Minus: '−' };
  function keyText(k) {
    if (!k) return '';
    if (MAC) return k.mac.split(' or ')[0].split('+').map((p) => SYM[p] || p).join('');
    const win = k.win || k.mac.replace(/Cmd/g, 'Ctrl').replace(/Option/g, 'Alt');
    return win.split(' or ')[0];
  }
  const K = (mac, win) => ({ mac, win });

  // -------------------------------------------------------------------------------------------
  // The appearance: Light and Dark write gt-theme, the key the product's boot script reads

  function setTheme(t) {
    const root = D.documentElement;
    root.classList.add('no-tx');
    root.setAttribute('data-theme', t);
    try {
      localStorage.setItem('gt-theme', t);
    } catch (e) {
      /* storage can be off; the choice holds for this page */
    }
    $$('[data-theme-option]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeOption === t)));
    void root.offsetWidth;
    repaintFields(true);
    raf(() => raf(() => root.classList.remove('no-tx')));
  }

  // -------------------------------------------------------------------------------------------
  // The dither field: the product's 8 by 8 Bayer permutation (packages/effects/src/bayer.ts),
  // one buffer pixel per 2 px cell, upscaled by CSS with image-rendering: pixelated

  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const BQ = [0, 2, 3, 1];
  const TH = new Float32Array(64);
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const m = B4[(r % 4) * 4 + (c % 4)] * 4 + BQ[(r >> 2) * 2 + (c >> 2)];
      TH[r * 8 + c] = (m + 0.5) / 64;
    }
  }

  const toneImg = {};
  const toneWait = {};
  function loadTone(name) {
    if (toneWait[name]) return toneWait[name];
    toneWait[name] = new Promise((res) => {
      const src = W.TS_TONES && W.TS_TONES[name];
      if (!src) return res(null);
      const img = new Image();
      img.onload = () => {
        toneImg[name] = img;
        res(img);
      };
      img.onerror = () => res(null);
      img.src = src;
    });
    return toneWait[name];
  }

  const toneCache = new Map();
  function toneFor(name, cols, rows) {
    const img = toneImg[name];
    if (!img) return null;
    const key = name + '|' + cols + '|' + rows;
    let t = toneCache.get(key);
    if (t) return t;
    const c = D.createElement('canvas');
    c.width = cols;
    c.height = rows;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, cols, rows);
    const d = x.getImageData(0, 0, cols, rows).data;
    t = new Float32Array(cols * rows);
    for (let i = 0; i < t.length; i += 1) t[i] = d[i * 4] / 255;
    toneCache.set(key, t);
    return t;
  }

  function parseColor(s) {
    s = (s || '').trim();
    let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      let hx = m[1];
      if (hx.length === 3) hx = hx.replace(/(.)/g, '$1$1');
      const n = parseInt(hx, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    m = s.match(/rgba?\(([^)]+)\)/);
    if (m) return m[1].split(/[ ,/]+/).filter(Boolean).slice(0, 3).map((v) => Math.round(parseFloat(v)));
    return [7, 7, 7];
  }

  const fieldHosts = new Set();
  function paintField(host, force) {
    const cv = host._cv;
    const name = host._pic;
    if (!cv || !name) return;
    const w = host.clientWidth;
    const hh = host.clientHeight;
    if (!w || !hh) return;
    // whole 2 px cells: the canvas never scales by a fraction, so no row doubles or drops
    const cols = Math.floor(w / 2);
    const rows = Math.floor(hh / 2);
    const tone = toneFor(name, cols, rows);
    if (!tone) {
      loadTone(name).then(() => paintField(host, true));
      return;
    }
    const ink = parseColor(getComputedStyle(host).getPropertyValue('--k-ink'));
    const p = host._p == null ? 1 : host._p;
    const key = name + '|' + cols + '|' + rows + '|' + ink.join(',') + '|' + p.toFixed(3);
    if (!force && cv._key === key) return;
    cv._key = key;
    if (cv.width !== cols) cv.width = cols;
    if (cv.height !== rows) cv.height = rows;
    cv.style.width = cols * 2 + 'px';
    cv.style.height = rows * 2 + 'px';
    const ctx = cv.getContext('2d');
    if (!cv._img || cv._img.width !== cols || cv._img.height !== rows) cv._img = ctx.createImageData(cols, rows);
    const d = cv._img.data;
    const r = ink[0];
    const g = ink[1];
    const b = ink[2];
    let i = 0;
    for (let y = 0; y < rows; y += 1) {
      const ty = (y & 7) * 8;
      for (let x = 0; x < cols; x += 1, i += 1) {
        const k = i * 4;
        if (tone[i] * p > TH[ty + (x & 7)]) {
          d[k] = r;
          d[k + 1] = g;
          d[k + 2] = b;
          d[k + 3] = 255;
        } else d[k + 3] = 0;
      }
    }
    ctx.putImageData(cv._img, 0, 0);
  }

  function repaintFields(force) {
    for (const host of Array.from(fieldHosts)) {
      if (host.isConnected) paintField(host, force);
      else fieldHosts.delete(host);
    }
  }

  // the ink follows the kit's 500 ms tone mix: every frame of the transition the visible fields
  // read the host's animated --k-ink and repaint when it moved
  let inkFollow = 0;
  function followInk() {
    const until = performance.now() + (reduced() ? 0 : 560);
    const myRun = ++inkFollow;
    const step = () => {
      if (myRun !== inkFollow) return;
      for (const host of fieldHosts) if (host.isConnected && host._vis) paintField(host);
      if (performance.now() < until) raf(step);
      else repaintFields();
    };
    raf(step);
  }

  const visIO = new IntersectionObserver((entries) => {
    for (const e of entries) e.target._vis = e.isIntersecting;
  });

  const sizeRO = new ResizeObserver((entries) => {
    for (const e of entries) {
      const host = e.target;
      if (host._cv) paintField(host);
      if (host._editor) host._editor.drawOverlay();
    }
  });

  // -------------------------------------------------------------------------------------------
  // Brand kits: a record on the deck, six colour roles in the product; the page shows three
  // kits and a Background field. The custom properties are registered as colours so a change
  // of kit mixes on one 500 ms curve, ground, words and field together.

  const KIT_PROPS = ['--k-paper', '--k-ink', '--k-ink-2', '--k-titanium', '--k-hair', '--k-cross'];
  if (W.CSS && CSS.registerProperty) {
    for (const p of KIT_PROPS) {
      try {
        CSS.registerProperty({ name: p, syntax: '<color>', inherits: true, initialValue: '#000000' });
      } catch (e) {
        /* already registered */
      }
    }
  }

  function deriveKit(paper) {
    const [r, g, b] = parseColor(paper);
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const dark = lum < 0.5;
    const ink = dark ? '#f4f1ea' : '#141210';
    const base = dark ? '244,241,234' : '20,18,16';
    return {
      '--k-paper': paper,
      '--k-ink': ink,
      '--k-ink-2': `rgba(${base},0.78)`,
      '--k-titanium': `rgba(${base},0.6)`,
      '--k-hair': `rgba(${base},0.2)`,
      '--k-cross': `rgba(${base},0.4)`,
    };
  }

  const KITS = {
    gt: { name: 'GT', vars: null },
    kestrel: {
      name: 'Kestrel',
      vars: {
        '--k-paper': '#f3efe6',
        '--k-ink': '#1f1b16',
        '--k-ink-2': '#4d463c',
        '--k-titanium': '#6e665a',
        '--k-hair': 'rgba(31,27,22,0.2)',
        '--k-cross': 'rgba(31,27,22,0.4)',
      },
    },
    globex: {
      name: 'Globex',
      vars: {
        '--k-paper': '#0b1d3a',
        '--k-ink': '#f4f1ea',
        '--k-ink-2': '#c9cbd3',
        '--k-titanium': '#8d97ab',
        '--k-hair': 'rgba(244,241,234,0.22)',
        '--k-cross': 'rgba(244,241,234,0.38)',
      },
    },
  };

  function kitVars(deck, slide) {
    if (slide && slide.bg) return deriveKit(slide.bg);
    if (deck.bg) return deriveKit(deck.bg);
    return (KITS[deck.kit] || KITS.gt).vars;
  }

  function applyKit(host, vars) {
    for (const p of KIT_PROPS) {
      if (vars) host.style.setProperty(p, vars[p]);
      else host.style.removeProperty(p);
    }
  }

  const validHex = (s) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test((s || '').trim());

  // -------------------------------------------------------------------------------------------
  // The deck and its seeded history

  const YOU = { kind: 'you', name: 'You' };
  const MAYA = { kind: 'person', name: 'Maya Chen', initials: 'MC' };
  const SAM = { kind: 'person', name: 'Sam Ortiz', initials: 'SO' };
  const ASSISTANT = { kind: 'agent', name: 'Assistant', via: 'accepted by Sam Ortiz' };
  const pitchAgent = (via) => ({ kind: 'agent', name: 'Pitch agent', via });

  const SEED = {
    name: 'Pitch for Kestrel',
    kit: 'gt',
    bg: null,
    slides: [
      {
        id: 'title',
        layout: 'cover',
        picture: 'earth',
        canvas: false,
        notes: 'Open on the claim. Then show them the editor.',
        blocks: [
          { id: 'h', type: 'h1', text: 'Build the pitch, present it and send the link' },
          { id: 'p1', type: 'p', text: 'This slide runs in the page. Nothing you change here is saved.' },
          { id: 'credit', type: 'credit', text: 'Image: NASA, Reto Stöckli, 2007, public domain' },
        ],
      },
      {
        id: 'plan',
        layout: 'content',
        canvas: false,
        notes: 'Three weeks. Name the owner of each one.',
        blocks: [
          { id: 'h', type: 'h2', text: 'The plan for Kestrel' },
          {
            id: 'rows',
            type: 'rows',
            rows: [
              ['Week 1', "Kestrel's sellers get this deck with their own name on it."],
              ['Week 2', "Kestrel's agents connect over MCP and draft the first slides."],
              ['Week 3', 'The team presents from the browser and sends the PDF.'],
            ],
          },
        ],
      },
      {
        id: 'numbers',
        layout: 'numbers',
        canvas: false,
        notes: 'The figure is the action table of the product, counted at build.',
        blocks: [
          { id: 'fig', type: 'big', text: '193' },
          { id: 'h', type: 'h2', text: 'Actions for Kestrel and its agents' },
          { id: 'p1', type: 'lead', text: 'The CLI, MCP and HTTP reach the same table as the menus.' },
        ],
      },
      {
        id: 'mood',
        layout: 'mood',
        picture: 'lighthouse',
        canvas: false,
        notes: 'A pause before the close.',
        blocks: [
          { id: 'h', type: 'h2', text: 'Louisbourg lighthouse' },
          { id: 'p1', type: 'p', text: 'Built to be read at a distance in any weather.' },
          { id: 'credit', type: 'credit', text: 'Photograph: Ken Heaton, CC BY-SA 4.0' },
        ],
      },
      {
        id: 'closing',
        layout: 'closing',
        canvas: false,
        notes: 'Thank them and send the link.',
        blocks: [
          { id: 'mark', type: 'mark' },
          { id: 'h', type: 'h2', text: 'Made in Turboslide' },
          { id: 'p1', type: 'lead', text: 'Set in Inter.' },
        ],
      },
    ],
  };

  function seedVersions() {
    const now = Date.now();
    const v5 = clone(SEED);
    const v4 = clone(v5);
    v4.slides.forEach((s) => (s.notes = ''));
    const v3 = clone(v4);
    v3.slides = v3.slides.filter((s) => s.id !== 'numbers');
    const v2 = clone(v3);
    const t2 = v2.slides[0];
    t2.blocks = t2.blocks.filter((b) => b.id !== 'p1');
    t2.blocks[0].text = 'Pitch for Kestrel';
    const v1 = clone(v2);
    v1.slides[0].picture = null;
    v1.slides[0].blocks = v1.slides[0].blocks.filter((b) => b.id !== 'credit');
    v1.slides = v1.slides.filter((s) => s.id !== 'mood');
    const at = (min) => now + min * 60000;
    return [
      { at: at(-185), author: MAYA, label: 'Made the presentation', detail: 'From the GT theme, with the plan and the closing slide', slideId: 'title', deck: v1 },
      { at: at(-161), author: pitchAgent('MCP'), label: 'Inserted two pictures', detail: 'The Blue Marble on slide 1 and the lighthouse on slide 4', slideId: 'title', deck: v2 },
      { at: at(-72), author: SAM, label: 'Wrote the title', detail: 'Slide 1', slideId: 'title', deck: v3 },
      { at: at(-26), author: ASSISTANT, label: 'Added the numbers slide', detail: 'Slide 3', slideId: 'numbers', deck: v4 },
      { at: at(-9), author: MAYA, label: 'Wrote the speaker notes', detail: 'Slides 1 to 5', slideId: 'numbers', deck: v5 },
    ];
  }

  const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
  const timeOf = (t) => TIME.format(new Date(t));

  // -------------------------------------------------------------------------------------------
  // The store: one deck, an undo stack of snapshots, the versions with their authors

  const store = {
    deck: clone(SEED),
    versions: seedVersions(),
    undoStack: [],
    redoStack: [],
    subs: new Set(),
    on(fn) {
      this.subs.add(fn);
    },
    emit(e) {
      queue(e);
    },
    slide(id) {
      return this.deck.slides.find((s) => s.id === id);
    },
    commit(label, author, fn, x = {}) {
      const last = this.undoStack[this.undoStack.length - 1];
      const coalesce = x.coalesce && last && last.coalesce === x.coalesce && Date.now() - last.v.at < 1200;
      const before = coalesce ? last.before : x.before || clone(this.deck);
      // a writer mutates the deck in place, or returns a whole new deck (Restore does)
      const r = fn(this.deck);
      if (r && Array.isArray(r.slides)) this.deck = r;
      if (coalesce) {
        last.v.at = Date.now();
        last.v.deck = clone(this.deck);
        this.emit({ kind: 'commit', v: last.v, source: x.source });
        return last.v;
      }
      const v = { at: Date.now(), author, label, detail: x.detail || '', slideId: x.slideId || 'title', deck: clone(this.deck), mine: true };
      this.versions.push(v);
      this.undoStack.push({ before, v, coalesce: x.coalesce || null });
      this.redoStack.length = 0;
      this.emit({ kind: 'commit', v, source: x.source });
      return v;
    },
    preview(fn, source) {
      fn(this.deck);
      this.emit({ kind: 'preview', source });
    },
    replace(deck, source) {
      this.deck = deck;
      this.emit({ kind: 'preview', source });
    },
    undo() {
      const e = this.undoStack.pop();
      if (!e) return null;
      const after = clone(this.deck);
      this.deck = e.before;
      const i = this.versions.lastIndexOf(e.v);
      if (i >= 0) this.versions.splice(i, 1);
      this.redoStack.push({ after, v: e.v });
      this.emit({ kind: 'undo', v: e.v });
      return e.v;
    },
    redo() {
      const e = this.redoStack.pop();
      if (!e) return null;
      const before = clone(this.deck);
      this.deck = e.after;
      this.versions.push(e.v);
      this.undoStack.push({ before, v: e.v });
      this.emit({ kind: 'redo', v: e.v });
      return e.v;
    },
    reset() {
      this.deck = clone(SEED);
      this.versions = seedVersions();
      this.undoStack.length = 0;
      this.redoStack.length = 0;
      this.emit({ kind: 'reset' });
    },
    nameVersion(note) {
      const v = { at: Date.now(), author: YOU, label: note, detail: 'A named version', slideId: 'title', deck: clone(this.deck), mine: true, named: true };
      this.versions.push(v);
      this.emit({ kind: 'named', v });
    },
  };

  // the views update once per frame; a preview from a view skips that view, so a caret survives
  let pending = [];
  function queue(e) {
    if (!pending.length) raf(flush);
    pending.push(e);
  }
  function flush() {
    const evs = pending;
    pending = [];
    for (const fn of store.subs) fn(evs);
  }

  const slideIndex = (deck, id) => deck.slides.findIndex((s) => s.id === id);
  const findBlock = (slide, id) => slide && slide.blocks.find((b) => b.id === id);
  const isText = (b) => b && ['h1', 'h2', 'p', 'lead', 'credit', 'big', 'textbox'].includes(b.type);

  function roleName(b) {
    if (!b) return 'Object';
    return (
      {
        h1: 'Title',
        h2: 'Title',
        p: 'Text',
        lead: 'Text',
        credit: 'Credit',
        big: 'Figure',
        textbox: 'Text box',
        rows: 'Rows',
        table: 'Table',
        shape: 'Shape',
        mark: 'Logo',
      }[b.type] || 'Object'
    );
  }

  function slideTitle(s) {
    const b = s.blocks.find((x) => x.type === 'h1' || x.type === 'h2');
    return b ? b.text : 'Slide';
  }

  // -------------------------------------------------------------------------------------------
  // The renderer: the GT deck's sheet in units of the slide's own width (landing.css .sl)

  const U = (n) => `calc(${n} * var(--u))`;

  function frameEl() {
    return h('div', { class: 'sl-frame', 'aria-hidden': 'true' }, h('b', { class: 't' }), h('b', { class: 'b' }), h('i', { class: 'tl' }), h('i', { class: 'tr' }), h('i', { class: 'bl' }), h('i', { class: 'br' }));
  }

  function markEl(cls, viewBox, d) {
    const s = h('svg', { class: cls, viewBox, 'aria-hidden': 'true' });
    s.append(h('path', { d }));
    return s;
  }

  function blockEl(b, slide, o, abs, mt) {
    const heading = o.h1 && slide.id === 'title' && b.id === 'h';
    const tag = heading ? 'h1' : 'div';
    const cls = ['sl-b'];
    if (isText(b)) cls.push('t-' + (b.type === 'textbox' ? 'p' : b.type));
    if (b.type === 'rows') cls.push('sl-rows');
    if (b.type === 'table') cls.push('sl-table');
    if (b.type === 'shape') cls.push('sl-shape', b.shape === 'oval' ? 'oval' : 'rect');
    if (b.bold) cls.push('is-bold');
    if (b.under) cls.push('is-under');
    if (b.align === 'center') cls.push('a-center');
    if (b.align === 'right') cls.push('a-right');
    if (abs) cls.push('abs');
    if (o.sel === b.id) cls.push('is-sel');
    const el = h(tag, { class: cls.join(' '), 'data-id': b.id });
    if (isText(b)) el.textContent = b.text;
    if (b.type === 'rows') for (const [k, v] of b.rows) el.append(h('div', null, h('b', null, k), h('span', null, v)));
    if (b.type === 'table') {
      el.style.gridTemplateColumns = `repeat(${b.cols}, 1fr)`;
      for (const c of b.cells) el.append(h('span', null, c));
    }
    if (b.type === 'mark') {
      const s = markEl('sl-closing-mark', '-33.1 36 184.6 128', MARK);
      s.style.width = U(138);
      s.style.height = U(96);
      s.style.display = 'block';
      el.append(s);
    }
    if (abs) {
      el.style.left = U(b.x);
      el.style.top = U(b.y);
      el.style.width = U(b.w);
      if (b.h) el.style.minHeight = U(b.h);
      if (b.rot) el.style.transform = `rotate(${b.rot}deg)`;
    } else if (mt) el.style.marginTop = U(mt);
    if (o.interactive) {
      el.tabIndex = 0;
      el.setAttribute('aria-label', roleName(b) + (isText(b) ? ': ' + b.text : ''));
    }
    return el;
  }

  const MT = { cover: { p: 18, credit: 14 }, mood: { p: 12, credit: 12 } };

  function layoutInto(c, slide, o) {
    const flow = slide.blocks.filter((b) => !b.free);
    const free = slide.blocks.filter((b) => b.free);
    if (slide.layout === 'cover' || slide.layout === 'mood') {
      const plate = h('div', { class: 'sl-plate flow' + (slide.layout === 'mood' ? ' narrow' : '') });
      flow.forEach((b, i) => plate.append(blockEl(b, slide, o, false, i ? MT[slide.layout][b.type] || 12 : 0)));
      c.append(plate);
    } else {
      const box = h('div', { class: 'sl-flow is-' + slide.layout });
      const gaps = { content: { rows: 40, table: 40 }, numbers: { h2: 28, lead: 16 }, closing: { h2: 44, lead: 12 }, split: { p: 32, textbox: 32 } }[slide.layout] || {};
      flow.forEach((b, i) => box.append(blockEl(b, slide, o, false, i ? gaps[b.type] || 16 : 0)));
      c.append(box);
    }
    for (const b of free) c.append(blockEl(b, slide, o, true));
  }

  function renderSlide(host, slide, deck, o = {}) {
    host.classList.toggle('sl-thumb', !!o.thumb);
    // a view that turns to another slide cuts; only a kit change on the same slide mixes
    if (host._sid !== slide.id) {
      host.classList.add('no-mix');
      raf(() => raf(() => host.classList.remove('no-mix')));
      host._sid = slide.id;
    }
    applyKit(host, kitVars(deck, slide));
    const kids = [];
    if (slide.picture) {
      if (!host._cv) host._cv = h('canvas', { class: 'sl-field', 'aria-hidden': 'true' });
      kids.push(host._cv);
      fieldHosts.add(host);
      if (!host._watched && !o.thumb) {
        visIO.observe(host);
        sizeRO.observe(host);
        host._watched = true;
      }
    }
    host._pic = slide.picture || null;
    kids.push(frameEl());
    const c = h('div', { class: 'sl-c' });
    if (slide.canvas) {
      if (slide.plate) c.append(h('div', { class: 'sl-plate', style: { left: U(slide.plate.x), top: U(slide.plate.y), width: U(slide.plate.w), height: U(slide.plate.h) } }));
      for (const b of slide.blocks) c.append(blockEl(b, slide, o, true));
    } else layoutInto(c, slide, o);
    kids.push(c);
    kids.push(markEl('sl-mark', '0 4 24 16', MARK24));
    kids.push(h('span', { class: 'sl-count', 'aria-hidden': 'true' }, String(o.n || slideIndex(deck, slide.id) + 1)));
    if (o.thumb && slide.skip) {
      const sk = h('div', { class: 'sl-skip', 'aria-hidden': 'true' });
      sk.append(icon('i-eye-slash'));
      kids.push(sk);
    }
    host.replaceChildren(...kids);
    if (slide.picture) paintField(host);
  }

  function slideText(slide) {
    const out = [];
    for (const b of slide.blocks) {
      if (isText(b)) out.push(b.text);
      if (b.type === 'rows') for (const [k, v] of b.rows) out.push(k + '. ' + v);
      if (b.type === 'table') out.push(b.cells.filter(Boolean).join(', '));
    }
    return out.join('\n');
  }

  // -------------------------------------------------------------------------------------------
  // The editor: select, drag, resize, rotate and type, in the product's selection grammar.
  // The first move of a layout slide measures every block and turns the slide into a canvas;
  // the commit carries the snapshot from before, so one Undo puts the layout back.

  const CONTENT = { left: 137, right: 1463, top: 129, bottom: 771 };
  const HANDLES = [
    ['nw', -1, -1],
    ['n', 0, -1],
    ['ne', 1, -1],
    ['e', 1, 0],
    ['se', 1, 1],
    ['s', 0, 1],
    ['sw', -1, 1],
    ['w', -1, 0],
  ];
  const CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

  let activeEditor = null;

  class Editor {
    constructor(opts) {
      Object.assign(this, opts);
      this.sel = null;
      this.draft = null;
      this.editing = null;
      this.guides = null;
      this.host._editor = this;
      sizeRO.observe(this.host);
      this.host.addEventListener('pointerdown', (e) => this.down(e));
      this.host.addEventListener('dblclick', (e) => this.dbl(e));
      this.host.addEventListener('keydown', (e) => this.key(e));
      this.host.addEventListener('focusin', (e) => {
        const el = e.target.closest && e.target.closest('.sl-b[data-id]');
        if (el && !this.editing && this.sel !== el.dataset.id) this.select(el.dataset.id, true);
      });
    }

    get slideStore() {
      return store.slide(this.slideId());
    }

    get slide() {
      return this.draft || this.slideStore;
    }

    get u() {
      return this.host.clientWidth / 1600;
    }

    render() {
      if (this.editing) return;
      const s = this.slide;
      if (!s) {
        this.host.replaceChildren();
        return;
      }
      if (this.sel && !findBlock(s, this.sel)) this.sel = null;
      // a re-render replaces the blocks; the keyboard keeps its place on the same object
      const a = D.activeElement;
      const fid = a && this.host.contains(a) && a.dataset ? a.dataset.id : null;
      renderSlide(this.host, s, store.deck, { h1: this.h1, interactive: true, sel: this.sel });
      if (fid) {
        const el = this.el(fid);
        if (el) el.focus({ preventScroll: true });
      }
      this.drawOverlay();
    }

    el(id) {
      return this.host.querySelector(`.sl-b[data-id="${id}"]`);
    }

    box(id) {
      const s = this.slide;
      const b = findBlock(s, id);
      const el = this.el(id);
      if (!b || !el) return null;
      const u = this.u;
      if (s.canvas) {
        const hh = Math.max(b.h || 0, el.offsetHeight / u);
        return { x: b.x, y: b.y, w: b.w, h: hh, rot: b.rot || 0 };
      }
      const hr = this.host.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { x: (r.left - hr.left) / u, y: (r.top - hr.top) / u, w: r.width / u, h: r.height / u, rot: 0 };
    }

    select(id, fromFocus) {
      if (activeEditor && activeEditor !== this) activeEditor.deselect();
      activeEditor = this;
      this.sel = id;
      $$('.sl-b.is-sel', this.host).forEach((x) => x.classList.remove('is-sel'));
      const el = this.el(id);
      if (el) el.classList.add('is-sel');
      if (el && !fromFocus && D.activeElement !== el) el.focus({ preventScroll: true });
      this.drawOverlay();
      if (this.onSelect) this.onSelect(id);
      if (this.hintOnSelect && !this.hinted) {
        this.hinted = true;
        this.say('Drag to move it. The squares resize it and the circle turns it. Double click to type.');
      }
    }

    deselect() {
      if (this.editing) this.finishEdit();
      this.sel = null;
      $$('.sl-b.is-sel', this.host).forEach((x) => x.classList.remove('is-sel'));
      this.drawOverlay();
      if (this.read) this.read.textContent = '';
    }

    say(text, undoable) {
      if (!this.status) return;
      const msg = this.status.querySelector('.msg');
      msg.classList.remove('is-new');
      void msg.offsetWidth;
      msg.replaceChildren(text);
      if (undoable) msg.append(h('button', { type: 'button', onclick: () => doUndo(this) }, 'Undo'));
      msg.classList.add('is-new');
    }

    drawOverlay() {
      let ov = this.host.querySelector(':scope > .ov');
      if (!ov) {
        ov = h('div', { class: 'ov', 'aria-hidden': 'true' });
        this.host.append(ov);
      }
      ov.replaceChildren();
      const u = this.u;
      if (this.guides) {
        if (this.guides.v != null) ov.append(h('div', { class: 'ov-guide v', style: { left: this.guides.v * u + 'px' } }));
        if (this.guides.h != null) ov.append(h('div', { class: 'ov-guide h', style: { top: this.guides.h * u + 'px' } }));
      }
      if (!this.sel) {
        if (this.read) this.read.textContent = '';
        return;
      }
      const b = findBlock(this.slide, this.sel);
      const bx = this.box(this.sel);
      if (!b || !bx) return;
      const turn = h('div', {
        class: 'ov-turn',
        style: { left: bx.x * u + 'px', top: bx.y * u + 'px', width: bx.w * u + 'px', height: bx.h * u + 'px', transform: bx.rot ? `rotate(${bx.rot}deg)` : '' },
      });
      turn.append(h('div', { class: 'ov-ring' }));
      turn.append(h('div', { class: 'ov-chip' }, roleName(b)));
      if (!this.editing) {
        for (const [name, hx, hy] of HANDLES) {
          turn.append(
            h('div', {
              class: 'ov-h' + (this.active === name ? ' is-active' : ''),
              'data-h': name,
              style: { left: ((hx + 1) / 2) * 100 + '%', top: ((hy + 1) / 2) * 100 + '%', cursor: CURSORS[name] },
            }),
          );
        }
        turn.append(h('div', { class: 'ov-rot' + (this.active === 'rot' ? ' is-active' : ''), 'data-h': 'rot' }));
      }
      ov.append(turn);
      if (this.active === 'rot') {
        ov.append(h('div', { class: 'ov-readout', style: { left: (bx.x + bx.w / 2) * u + 18 + 'px', top: bx.y * u - 44 + 'px' } }, Math.round(norm(bx.rot)) + '°'));
      }
      if (this.read) this.read.textContent = `${roleName(b)} · x ${Math.round(bx.x)} · y ${Math.round(bx.y)} · ${Math.round(norm(bx.rot))}°`;
    }

    // the first move: measure the layout and hold a canvas draft of the slide
    begin() {
      this.before = clone(store.deck);
      const draft = clone(this.slideStore);
      this.converted = false;
      if (!draft.canvas) {
        const hr = this.host.getBoundingClientRect();
        const u = this.u;
        for (const b of draft.blocks) {
          const el = this.el(b.id);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          b.x = (r.left - hr.left) / u;
          b.y = (r.top - hr.top) / u;
          b.w = r.width / u;
          b.h = r.height / u;
          b.rot = 0;
        }
        const pl = this.host.querySelector('.sl-plate');
        if (pl) {
          const r = pl.getBoundingClientRect();
          draft.plate = { x: (r.left - hr.left) / u, y: (r.top - hr.top) / u, w: r.width / u, h: r.height / u };
        }
        draft.canvas = true;
        this.converted = true;
      }
      this.draft = draft;
      const a = D.activeElement;
      const fid = a && this.host.contains(a) && a.dataset ? a.dataset.id : null;
      renderSlide(this.host, draft, store.deck, { h1: this.h1, interactive: true, sel: this.sel });
      if (fid && this.el(fid)) this.el(fid).focus({ preventScroll: true });
    }

    commitDraft(label) {
      const draft = this.draft;
      this.draft = null;
      this.guides = null;
      this.active = null;
      const n = slideIndex(store.deck, draft.id) + 1;
      store.commit(
        label,
        YOU,
        (d) => {
          d.slides[slideIndex(d, draft.id)] = draft;
        },
        { before: this.before, slideId: draft.id, detail: 'Slide ' + n + (this.converted ? ', now a canvas' : ''), source: this.name },
      );
      if (this.converted) this.say('The slide is a canvas now. Undo puts the layout back.', true);
      else this.say(label + '.', true);
      // the commit renders every view next frame; this one renders now so the handles stay put
      this.render();
    }

    down(e) {
      if (e.button !== 0) return;
      const handle = e.target.closest('[data-h]');
      const blockEl = e.target.closest('.sl-b[data-id]');
      if (this.editing && blockEl && blockEl.dataset.id === this.editing) return;
      if (this.editing) this.finishEdit();
      if (handle && this.sel) return this.startHandle(e, handle.dataset.h);
      if (!blockEl) {
        this.deselect();
        return;
      }
      const id = blockEl.dataset.id;
      if (this.sel !== id) this.select(id);
      if (e.pointerType === 'touch' && this.touchArmed !== id) {
        // the first touch selects; the next touch drags, so a swipe over the slide still scrolls
        this.touchArmed = id;
        return;
      }
      e.preventDefault();
      const start = { x: e.clientX, y: e.clientY };
      let moving = false;
      let b0;
      const move = (ev) => {
        const dx = (ev.clientX - start.x) / this.u;
        const dy = (ev.clientY - start.y) / this.u;
        if (!moving) {
          if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 3) return;
          moving = true;
          this.begin();
          b0 = clone(findBlock(this.draft, id));
          if (!b0.h) b0.h = this.el(id).offsetHeight / this.u;
        }
        const b = findBlock(this.draft, id);
        let x = b0.x + dx;
        let y = b0.y + dy;
        const thr = 6 / this.u;
        const g = {};
        const cx = x + b0.w / 2;
        const cy = y + b0.h / 2;
        if (!ev.altKey) {
          if (Math.abs(cx - 800) < thr) {
            x = 800 - b0.w / 2;
            g.v = 800;
          } else if (Math.abs(x - CONTENT.left) < thr) {
            x = CONTENT.left;
            g.v = CONTENT.left;
          } else if (Math.abs(x + b0.w - CONTENT.right) < thr) {
            x = CONTENT.right - b0.w;
            g.v = CONTENT.right;
          }
          if (Math.abs(cy - 450) < thr) {
            y = 450 - b0.h / 2;
            g.h = 450;
          } else if (Math.abs(y - CONTENT.top) < thr) {
            y = CONTENT.top;
            g.h = CONTENT.top;
          } else if (Math.abs(y + b0.h - CONTENT.bottom) < thr) {
            y = CONTENT.bottom - b0.h;
            g.h = CONTENT.bottom;
          }
        }
        b.x = clamp(x, -b0.w / 2, 1600 - b0.w / 2);
        b.y = clamp(y, -b0.h / 2, 900 - b0.h / 2);
        this.guides = g.v != null || g.h != null ? g : null;
        const el = this.el(id);
        el.style.left = U(b.x);
        el.style.top = U(b.y);
        this.drawOverlay();
      };
      const up = () => {
        W.removeEventListener('pointermove', move);
        W.removeEventListener('pointerup', up);
        W.removeEventListener('pointercancel', up);
        if (moving) this.commitDraft('Moved the ' + roleName(findBlock(this.draft, id)).toLowerCase());
      };
      W.addEventListener('pointermove', move);
      W.addEventListener('pointerup', up);
      W.addEventListener('pointercancel', up);
    }

    startHandle(e, name) {
      e.preventDefault();
      e.stopPropagation();
      const id = this.sel;
      this.begin();
      const b = findBlock(this.draft, id);
      if (!b.h) b.h = this.el(id).offsetHeight / this.u;
      const b0 = clone(b);
      const hr = this.host.getBoundingClientRect();
      const toSheet = (ev) => ({ x: (ev.clientX - hr.left) / this.u, y: (ev.clientY - hr.top) / this.u });
      const p0 = toSheet(e);
      const cx0 = b0.x + b0.w / 2;
      const cy0 = b0.y + b0.h / 2;
      this.active = name;
      const spec = HANDLES.find((x) => x[0] === name);
      const move = (ev) => {
        const p = toSheet(ev);
        if (name === 'rot') {
          let a = (Math.atan2(p.y - cy0, p.x - cx0) * 180) / Math.PI + 90;
          if (ev.shiftKey) a = Math.round(a / 15) * 15;
          b.rot = Math.round(norm(a) * 10) / 10;
        } else {
          const r = ((b0.rot || 0) * Math.PI) / 180;
          const dX = p.x - p0.x;
          const dY = p.y - p0.y;
          const lx = dX * Math.cos(r) + dY * Math.sin(r);
          const ly = -dX * Math.sin(r) + dY * Math.cos(r);
          const hx = spec[1];
          const hy = spec[2];
          const w = Math.max(80, b0.w + hx * lx);
          const hh = Math.max(24, b0.h + hy * ly);
          const sx = (hx * (w - b0.w)) / 2;
          const sy = (hy * (hh - b0.h)) / 2;
          const cx = cx0 + sx * Math.cos(r) - sy * Math.sin(r);
          const cy = cy0 + sx * Math.sin(r) + sy * Math.cos(r);
          b.w = w;
          b.h = hh;
          b.x = cx - w / 2;
          b.y = cy - hh / 2;
        }
        const el = this.el(id);
        el.style.left = U(b.x);
        el.style.top = U(b.y);
        el.style.width = U(b.w);
        el.style.minHeight = U(b.h);
        el.style.transform = b.rot ? `rotate(${b.rot}deg)` : '';
        this.drawOverlay();
      };
      const up = () => {
        W.removeEventListener('pointermove', move);
        W.removeEventListener('pointerup', up);
        W.removeEventListener('pointercancel', up);
        const word = roleName(b).toLowerCase();
        this.commitDraft((name === 'rot' ? 'Rotated the ' : 'Resized the ') + word);
      };
      W.addEventListener('pointermove', move);
      W.addEventListener('pointerup', up);
      W.addEventListener('pointercancel', up);
      this.drawOverlay();
    }

    dbl(e) {
      const el = e.target.closest('.sl-b[data-id]');
      if (!el) return;
      this.startEdit(el.dataset.id, e);
    }

    startEdit(id, e) {
      const b = findBlock(this.slideStore, id);
      if (!isText(b)) return;
      if (this.sel !== id) this.select(id);
      const el = this.el(id);
      this.editing = id;
      this.editBefore = clone(store.deck);
      this.editText = b.text;
      try {
        el.contentEditable = 'plaintext-only';
      } catch (err) {
        el.contentEditable = 'true';
      }
      if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
      el.classList.add('is-editing');
      el.focus({ preventScroll: true });
      const sel = W.getSelection();
      let range = null;
      if (e && D.caretRangeFromPoint) range = D.caretRangeFromPoint(e.clientX, e.clientY);
      if (!range) {
        range = D.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
      }
      sel.removeAllRanges();
      sel.addRange(range);
      this.onInput = () => {
        const text = el.innerText.replace(/\n+$/, '');
        store.preview((d) => {
          const bb = findBlock(d.slides[slideIndex(d, this.slideId())], id);
          if (bb) bb.text = text;
        }, this.name);
        this.drawOverlay();
      };
      this.onEditKey = (ev) => {
        if (ev.key === 'Escape' || (ev.key === 'Enter' && !ev.shiftKey && b.type !== 'textbox')) {
          ev.preventDefault();
          ev.stopPropagation();
          this.finishEdit(true);
        }
      };
      this.onBlur = () => this.finishEdit();
      el.addEventListener('input', this.onInput);
      el.addEventListener('keydown', this.onEditKey);
      el.addEventListener('blur', this.onBlur);
      this.drawOverlay();
      this.say('Typing. Enter or Escape finishes.');
    }

    finishEdit(keepFocus) {
      const id = this.editing;
      if (!id) return;
      const el = this.el(id);
      this.editing = null;
      if (el) {
        el.removeEventListener('input', this.onInput);
        el.removeEventListener('keydown', this.onEditKey);
        el.removeEventListener('blur', this.onBlur);
        el.contentEditable = 'false';
        el.classList.remove('is-editing');
      }
      const s = this.slideStore;
      const b = findBlock(s, id);
      let text = el ? el.innerText.replace(/\n+$/, '').trim() : b.text;
      if (!text) text = this.editText;
      if (text !== this.editText) {
        const word = roleName(b).toLowerCase();
        store.commit(
          'Typed in the ' + word,
          YOU,
          (d) => {
            findBlock(d.slides[slideIndex(d, s.id)], id).text = text;
          },
          { before: this.editBefore, slideId: s.id, detail: 'Slide ' + (slideIndex(store.deck, s.id) + 1), source: this.name },
        );
        this.say(this.typedSentence || 'The words changed in every view of this deck on the page.', true);
      } else {
        store.preview((d) => {
          findBlock(d.slides[slideIndex(d, s.id)], id).text = text;
        }, null);
      }
      this.render();
      if (keepFocus) {
        const nel = this.el(id);
        if (nel) nel.focus({ preventScroll: true });
      }
    }

    key(e) {
      if (this.editing) return;
      const el = e.target.closest && e.target.closest('.sl-b[data-id]');
      if (!el) return;
      const id = el.dataset.id;
      if (e.key === 'Enter') {
        e.preventDefault();
        this.startEdit(id);
        return;
      }
      if (e.key === 'Escape') {
        this.deselect();
        el.blur();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.onDelete) {
        e.preventDefault();
        this.onDelete(id);
        return;
      }
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (!arrows[e.key] || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      const [ax, ay] = arrows[e.key];
      const s = this.slideStore;
      const b = findBlock(s, id);
      this.before = clone(store.deck);
      if (e.altKey && ax) {
        const was = s.canvas;
        this.begin();
        const bb = findBlock(this.draft, id);
        bb.rot = norm((bb.rot || 0) + ax * 15);
        const draft = this.lastDraftFrom(bb, id);
        store.commit('Rotated the ' + roleName(b).toLowerCase(), YOU, (d) => (d.slides[slideIndex(d, s.id)] = draft), { before: this.before, slideId: s.id, coalesce: 'rot:' + s.id + id, source: this.name });
        if (!was) this.say('The slide is a canvas now. Undo puts the layout back.', true);
        return;
      }
      const step = e.shiftKey ? 40 : 8;
      const was = s.canvas;
      this.begin();
      const bb = findBlock(this.draft, id);
      bb.x += ax * step;
      bb.y += ay * step;
      const draft = this.lastDraftFrom(bb, id);
      store.commit('Moved the ' + roleName(b).toLowerCase(), YOU, (d) => (d.slides[slideIndex(d, s.id)] = draft), { before: this.before, slideId: s.id, coalesce: 'nudge:' + s.id + id, source: this.name });
      if (!was) this.say('The slide is a canvas now. Undo puts the layout back.', true);
      this.render();
      const nel = this.el(id);
      if (nel) nel.focus({ preventScroll: true });
    }

    lastDraftFrom() {
      const d = this.draft || clone(this.slideStore);
      this.draft = null;
      return d;
    }
  }

  function norm(a) {
    let x = a % 360;
    if (x < 0) x += 360;
    return x;
  }

  function doUndo(ed) {
    const v = store.undo();
    if (ed) ed.say(v ? 'Undone: ' + v.label.toLowerCase() + '.' : 'Nothing to undo.');
    return v;
  }

  function doRedo(ed) {
    const v = store.redo();
    if (ed) ed.say(v ? 'Redone: ' + v.label.toLowerCase() + '.' : 'Nothing to redo.');
    return v;
  }

  const isField = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  const modKey = (e) => (MAC ? e.metaKey : e.ctrlKey);

  // -------------------------------------------------------------------------------------------
  // The hero

  const views = [];
  const heroHost = $('#hero-sl');
  const hero = new Editor({
    host: heroHost,
    name: 'hero',
    h1: true,
    slideId: () => 'title',
    status: $('#hero-status'),
    read: $('#hero-status .read'),
    hintOnSelect: true,
    typedSentence: 'The heading changed here and in every instrument below. They all show this deck.',
  });
  heroHost._p = reduced() ? 1 : 0;
  views.push({ id: 'hero', mounted: true, update: () => hero.render() });

  function syncKitButtons() {
    const deck = store.deck;
    $$('.kit [data-kit]').forEach((b) => b.setAttribute('aria-pressed', String(!deck.bg && deck.kit === b.dataset.kit)));
    const hex = $('#hex');
    if (D.activeElement !== hex) hex.value = deck.bg || '';
  }
  views.push({ id: 'kit', mounted: true, update: syncKitButtons });

  function chooseKit(kit) {
    if (store.deck.kit === kit && !store.deck.bg) return;
    store.commit('Chose the ' + KITS[kit].name + ' kit', YOU, (d) => {
      d.kit = kit;
      d.bg = null;
    }, { detail: 'Every slide', slideId: 'title' });
    hero.say(`The ${KITS[kit].name} kit set the colours of all ${store.deck.slides.length} slides.`, true);
    followInk();
  }

  $$('.kit [data-kit]').forEach((b) => b.addEventListener('click', () => chooseKit(b.dataset.kit)));

  const hexIn = $('#hex');
  let hexBefore = null;
  hexIn.addEventListener('focus', () => {
    hexBefore = clone(store.deck);
  });
  hexIn.addEventListener('input', () => {
    let v = hexIn.value.trim();
    if (v && v[0] !== '#') v = '#' + v;
    if (validHex(v)) {
      store.preview((d) => (d.bg = v.toLowerCase()), 'hex');
      followInk();
    }
  });
  hexIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      let v = hexIn.value.trim();
      if (v && v[0] !== '#') v = '#' + v;
      if (!validHex(v)) {
        hero.say('Type a colour as # and six hex digits, such as #0b1d3a.');
        return;
      }
      v = v.toLowerCase();
      store.commit('Set the background to ' + v, YOU, (d) => (d.bg = v), { before: hexBefore || undefined, detail: 'Every slide', slideId: 'title' });
      hexBefore = clone(store.deck);
      hero.say(`The background of every slide is ${v} now.`, true);
      followInk();
    } else if (e.key === 'Escape') {
      if (hexBefore) store.replace(hexBefore, null);
      hexIn.blur();
    }
  });
  hexIn.addEventListener('blur', () => {
    // a preview that was never entered goes back, as the product's field does
    if (hexBefore && JSON.stringify(hexBefore) !== JSON.stringify(store.deck) && !store.undoStack.some((x) => x.v.deck && JSON.stringify(x.v.deck) === JSON.stringify(store.deck))) {
      store.replace(hexBefore, null);
      followInk();
    }
    hexBefore = null;
  });

  $$('[data-act="undo"]').forEach((b) => b.addEventListener('click', () => doUndo(hero)));
  $$('[data-act="redo"]').forEach((b) => b.addEventListener('click', () => doRedo(hero)));
  $$('[data-act="reset"]').forEach((b) =>
    b.addEventListener('click', () => {
      store.reset();
      hero.deselect();
      hero.say('The deck is back where it started.');
      followInk();
    }),
  );
  function syncUndoButtons() {
    $$('[data-act="undo"]').forEach((b) => (b.disabled = !store.undoStack.length));
    $$('[data-act="redo"]').forEach((b) => (b.disabled = !store.redoStack.length));
  }
  views.push({ id: 'undo', mounted: true, update: syncUndoButtons });

  $('#play').addEventListener('keydown', (e) => {
    if (isField(e.target) || !modKey(e)) return;
    const k = e.key.toLowerCase();
    if (k === 'z') {
      e.preventDefault();
      if (e.shiftKey) doRedo(hero);
      else doUndo(hero);
    } else if (k === 'y') {
      e.preventDefault();
      doRedo(hero);
    }
  });

  D.addEventListener('pointerdown', (e) => {
    if (activeEditor && !activeEditor.host.contains(e.target) && !e.target.closest('.plate, .dialog, .menubar, .tools')) activeEditor.deselect();
  });

  // the phone opens the hero on the plate: the slide keeps its reading size and runs past the rail
  function openOnPlate() {
    const sc = $('#hero-scroll');
    if (sc.scrollWidth > sc.clientWidth + 4) sc.scrollLeft = sc.scrollWidth - sc.clientWidth;

  }

  // the field develops once after load: tone rises from 0 and cells switch in Bayer order
  function develop() {
    if (reduced()) {
      heroHost._p = 1;
      paintField(heroHost, true);
      return;
    }
    const dur = 1500;
    const t0 = performance.now();
    const step = (t) => {
      const k = clamp((t - t0) / dur, 0, 1);
      heroHost._p = smooth(k);
      paintField(heroHost, true);
      if (k < 1) raf(step);
    };
    raf(step);
  }

  // -------------------------------------------------------------------------------------------
  // Instrument 1: the editor in miniature with Google's menus

  // each instrument opens on its own slide of the one deck: the menus on the plan
  const mini = { cur: 'plan', grid: false, notes: false, strip: true };
  const miniRoot = $('#mini');
  const miniHost = $('#mini-sl');
  const miniStatus = $('#mini-status');
  let miniEd = null;

  function miniSay(text, undoable) {
    if (miniEd) miniEd.say(text, undoable);
  }

  const NOTES = {
    new: 'New opens a blank presentation at /new. No account is needed.',
    open: 'Open lists your presentations.',
    import: 'Import slides copies slides from another Turboslide presentation.',
    copy: 'Make a copy writes a new presentation with the same slides.',
    share: 'Share opens the Share dialog. People and links sit in ruled rows.',
    email: 'Email this file sends the presentation from the editor.',
    pptx: 'The editor writes a PowerPoint file that matches the screen. Open the Example Deck to try it.',
    trash: 'Move to trash is off on this page.',
    details: 'Details shows the facts of the presentation.',
    paste: 'Paste puts the last cut or copied object on this slide.',
    selectAll: 'Select all selects every object on the slide in the editor.',
    zoom: 'Zoom changes the size of the stage in the editor.',
    ruler: 'Show ruler draws the ruler above the stage in the editor.',
    guides: 'Guides adds lines that objects snap to. This page snaps to the centre and the margins.',
    snap: 'Snap to sets what a dragged object snaps to.',
    comments: 'Comments opens the threads of the slide.',
    image: 'Image opens the picture picker. A picture can take the dither treatment.',
    chart: 'Chart inserts a chart whose numbers you edit on the slide.',
    diagram: 'Diagram opens the diagram panel.',
    wordArt: 'Word art inserts a line of display type.',
    line: 'Line draws a line or an arrow.',
    special: 'Special characters opens the character picker.',
    link: 'Link adds a link to the selected text.',
    comment: 'Comment starts a thread on the selected object.',
    spacing: 'Line and paragraph spacing sets the space in and between paragraphs.',
    bullets: 'Bullets and numbering makes the paragraphs a list.',
    formatOptions: 'Format options opens the panel of size, position and text fitting.',
    applyLayout: 'Apply layout gives the slide one of the 22 layouts.',
    group: 'Group needs two objects. The editor selects several with Shift.',
    prefs: 'Preferences holds the browser settings the editor uses.',
    a11y: 'Accessibility settings holds the screen reader options.',
    help: 'Help opens the help dialog with the product facts.',
    noMedia: 'Audio and video are not in Turboslide yet.',
    still: 'Transitions are not in Turboslide yet. Slides change with no animation.',
  };

  const MENU = [
    ['File', [
      ['New', { sub: [['Presentation', { note: 'new' }]] }],
      ['Open', { key: K('Cmd+O'), note: 'open' }],
      ['Import slides', { note: 'import' }],
      ['Make a copy', { note: 'copy' }],
      '-',
      ['Share', { note: 'share' }],
      ['Email', { sub: [['Email this file', { note: 'email' }]] }],
      ['Download', { sub: [['PDF document (.pdf)', { act: 'print' }], ['Microsoft PowerPoint (.pptx)', { note: 'pptx' }], ['Plain text (.txt)', { act: 'txt' }]] }],
      '-',
      ['Rename', { act: 'rename' }],
      ['Move to trash', { note: 'trash' }],
      '-',
      ['Version history', { sub: [['Name current version', { act: 'nameVersion' }], ['See version history', { key: K('Cmd+Option+Shift+H', 'Ctrl+Alt+Shift+H'), act: 'seeVersions' }]] }],
      ['Details', { note: 'details' }],
      '-',
      ['Print', { key: K('Cmd+P', 'Ctrl+P'), act: 'print' }],
    ]],
    ['Edit', [
      ['Undo', { key: K('Cmd+Z'), act: 'undo' }],
      ['Redo', { key: K('Cmd+Y or Cmd+Shift+Z', 'Ctrl+Y'), act: 'redo' }],
      '-',
      ['Cut', { key: K('Cmd+X'), act: 'cut' }],
      ['Copy', { key: K('Cmd+C'), act: 'copy' }],
      ['Paste', { key: K('Cmd+V'), act: 'paste' }],
      ['Delete', { key: K('Delete', 'Delete'), act: 'delete' }],
      '-',
      ['Duplicate', { key: K('Cmd+D'), act: 'duplicate' }],
      ['Select all', { key: K('Cmd+A'), note: 'selectAll' }],
      '-',
      ['Find and replace', { key: K('Cmd+Shift+H', 'Ctrl+H'), act: 'find' }],
    ]],
    ['View', [
      ['Slideshow', { key: K('Cmd+Enter', 'Ctrl+F5'), act: 'slideshow' }],
      '-',
      ['Grid view', { act: 'grid', check: () => mini.grid }],
      ['Zoom', { note: 'zoom' }],
      ['Show ruler', { note: 'ruler' }],
      ['Guides', { note: 'guides' }],
      ['Snap to', { note: 'snap' }],
      '-',
      ['Comments', { note: 'comments' }],
      ['Show speaker notes', { act: 'notes', check: () => mini.notes }],
      ['Show filmstrip', { act: 'strip', check: () => mini.strip }],
      ['Full screen', { act: 'fullscreen' }],
    ]],
    ['Insert', [
      ['Image', { note: 'image' }],
      ['Text box', { act: 'textbox' }],
      ['Audio', { disabled: 'noMedia' }],
      ['Video', { disabled: 'noMedia' }],
      ['Shape', { sub: [['Rectangle', { act: 'rect' }], ['Oval', { act: 'oval' }]] }],
      ['Table', { act: 'table' }],
      ['Chart', { note: 'chart' }],
      ['Diagram', { note: 'diagram' }],
      ['Word art', { note: 'wordArt' }],
      ['Line', { note: 'line' }],
      '-',
      ['Special characters', { note: 'special' }],
      ['Link', { key: K('Cmd+K'), note: 'link' }],
      ['Comment', { key: K('Cmd+Option+M', 'Ctrl+Alt+M'), note: 'comment' }],
      '-',
      ['New slide', { key: K('Ctrl+M', 'Ctrl+M'), act: 'newSlide' }],
    ]],
    ['Format', [
      ['Text', { sub: [['Bold', { key: K('Cmd+B'), act: 'bold' }], ['Underline', { key: K('Cmd+U'), act: 'under' }]] }],
      ['Align & indent', { sub: [['Left', { key: K('Cmd+Shift+L'), act: 'alignLeft' }], ['Center', { key: K('Cmd+Shift+E'), act: 'alignCenter' }], ['Right', { key: K('Cmd+Shift+R'), act: 'alignRight' }]] }],
      ['Line & paragraph spacing', { note: 'spacing' }],
      ['Bullets & numbering', { note: 'bullets' }],
      '-',
      ['Format options', { note: 'formatOptions' }],
      ['Clear formatting', { key: K('Cmd+\\', 'Ctrl+\\'), act: 'clear' }],
    ]],
    ['Slide', [
      ['New slide', { key: K('Ctrl+M', 'Ctrl+M'), act: 'newSlide' }],
      ['Duplicate slide', { act: 'dupSlide' }],
      ['Delete slide', { act: 'delSlide' }],
      ['Skip slide', { act: 'skip', alt: () => (curSlide() && curSlide().skip ? 'Unskip slide' : null) }],
      ['Move slide', { sub: [['Slide up', { key: K('Cmd+Up', 'Ctrl+Up'), act: 'slideUp' }], ['Slide down', { key: K('Cmd+Down', 'Ctrl+Down'), act: 'slideDown' }]] }],
      '-',
      ['Change background', { act: 'background' }],
      ['Apply layout', { note: 'applyLayout' }],
      ['Transition', { disabled: 'still' }],
      '-',
      ['Change theme', { act: 'theme' }],
    ]],
    ['Arrange', [
      ['Order', { sub: [['Bring to front', { key: K('Cmd+Shift+Up', 'Ctrl+Shift+Up'), act: 'front' }], ['Send to back', { key: K('Cmd+Shift+Down', 'Ctrl+Shift+Down'), act: 'back' }]] }],
      ['Align', { sub: [['Left', { act: 'aLeft' }], ['Center', { act: 'aCenter' }], ['Right', { act: 'aRight' }], ['Top', { act: 'aTop' }], ['Middle', { act: 'aMiddle' }], ['Bottom', { act: 'aBottom' }]] }],
      ['Center on page', { sub: [['Horizontally', { act: 'aCenter' }], ['Vertically', { act: 'aMiddle' }]] }],
      ['Rotate', { sub: [['Rotate clockwise 90°', { act: 'rotCw' }], ['Rotate counter-clockwise 90°', { act: 'rotCcw' }]] }],
      '-',
      ['Group', { key: K('Cmd+Option+G', 'Ctrl+Alt+G'), note: 'group' }],
    ]],
    ['Tools', [
      ['Preferences', { note: 'prefs' }],
      ['Accessibility settings', { note: 'a11y' }],
      '-',
      ['Tailor for a customer', { act: 'tailor' }],
    ]],
    ['Help', [
      ['Search the menus', { key: K('Option+/', 'Alt+/'), act: 'search' }],
      ['Help', { note: 'help' }],
      '-',
      ['Keyboard shortcuts', { key: K('Cmd+/', 'Ctrl+/'), act: 'shortcuts' }],
    ]],
  ];

  const curSlide = () => store.slide(mini.cur) || store.deck.slides[0];
  const selBlock = () => (miniEd && miniEd.sel ? findBlock(curSlide(), miniEd.sel) : null);
  let clipboard = null;

  function needSel(fn, what) {
    const b = selBlock();
    if (!b) {
      miniSay('Select an object on the slide first, then choose ' + what + '.');
      return;
    }
    fn(b);
  }

  // a write to the current slide that measures a layout slide first, so a positioned change
  // turns it into a canvas the way a drag does
  function editSlide(label, mut, opts = {}) {
    const s = curSlide();
    const before = clone(store.deck);
    let draft = clone(s);
    let converted = false;
    if (opts.canvas && !draft.canvas && miniEd) {
      miniEd.begin();
      draft = miniEd.draft;
      miniEd.draft = null;
      converted = true;
    }
    mut(draft);
    store.commit(label, YOU, (d) => (d.slides[slideIndex(d, s.id)] = draft), { before, slideId: s.id, detail: 'Slide ' + (slideIndex(store.deck, s.id) + 1), source: 'mini-act' });
    return converted;
  }

  function addBlock(block, label) {
    const id = block.type + '-' + Math.random().toString(36).slice(2, 6);
    editSlide(label, (s) => s.blocks.push(Object.assign({ id, free: true, rot: 0 }, block)));
    if (miniEd) {
      miniEd.sel = id;
      raf(() => raf(() => miniEd.select(id)));
    }
    return id;
  }

  const ACTS = {
    print: () => printDeck(),
    txt: () => downloadText(),
    rename: () => renameDialog(),
    nameVersion: () => nameVersionDialog(),
    seeVersions: () => {
      $('#versions').scrollIntoView({ block: 'start' });
      $('#ver-range').focus({ preventScroll: true });
    },
    undo: () => doUndo(miniEd),
    redo: () => doRedo(miniEd),
    cut: () =>
      needSel((b) => {
        clipboard = Object.assign(clone(b), miniEd.box(b.id));
        if (b.id === 'h' && mini.cur === 'title') return miniSay('The title of slide 1 is the heading of this page, so it stays. Copy works.');
        editSlide('Cut the ' + roleName(b).toLowerCase(), (s) => (s.blocks = s.blocks.filter((x) => x.id !== b.id)));
        miniSay('Cut. Paste puts it back on any slide.', true);
      }, 'Cut'),
    copy: () => needSel((b) => ((clipboard = Object.assign(clone(b), miniEd.box(b.id))), miniSay('Copied the ' + roleName(b).toLowerCase() + '.')), 'Copy'),
    paste: () => {
      if (!clipboard) return miniSay(NOTES.paste + ' Nothing is copied yet.');
      const c = clone(clipboard);
      const id = c.type + '-' + Math.random().toString(36).slice(2, 6);
      editSlide('Pasted the ' + roleName(c).toLowerCase(), (s) => {
        s.blocks.push(Object.assign(c, { id, free: !s.canvas, x: (c.x == null ? 560 : c.x) + 24, y: (c.y == null ? 330 : c.y) + 24, w: c.w || 480, rot: c.rot || 0 }));
      });
      miniSay('Pasted.', true);
    },
    delete: () =>
      needSel((b) => {
        if (b.id === 'h' && mini.cur === 'title') return miniSay('The title of slide 1 is the heading of this page, so it stays.');
        editSlide('Deleted the ' + roleName(b).toLowerCase(), (s) => (s.blocks = s.blocks.filter((x) => x.id !== b.id)));
        miniSay('Deleted.', true);
      }, 'Delete'),
    duplicate: () =>
      needSel((b) => {
        const id = b.type + '-' + Math.random().toString(36).slice(2, 6);
        editSlide('Duplicated the ' + roleName(b).toLowerCase(), (s) => {
          const src = findBlock(s, b.id);
          const c = clone(src);
          c.id = id;
          c.x = src.x + 24;
          c.y = src.y + 24;
          if (!s.canvas) c.free = true;
          if (c.type === 'h1') c.type = 'h2';
          s.blocks.push(c);
        }, { canvas: true });
        miniSay('Duplicated. The copy sits 24 px down and to the right.', true);
      }, 'Duplicate'),
    find: () => findDialog(false),
    slideshow: () => startShowFrom(mini.cur),
    grid: () => {
      mini.grid = !mini.grid;
      miniRoot.classList.toggle('show-grid', mini.grid);
      renderMini();
      miniSay(mini.grid ? 'Grid view shows every slide. Choose one to edit it.' : 'Back to the slide.');
    },
    notes: () => {
      mini.notes = !mini.notes;
      miniRoot.classList.toggle('show-notes', mini.notes);
      miniSay(mini.notes ? 'Speaker notes sit under the slide. Presenter view shows them.' : 'Speaker notes are hidden.');
    },
    strip: () => {
      mini.strip = !mini.strip;
      $('#mini-body').classList.toggle('no-strip', !mini.strip);
      miniSay(mini.strip ? 'The filmstrip is back.' : 'The filmstrip is hidden.');
    },
    fullscreen: () => {
      if (miniRoot.requestFullscreen) miniRoot.requestFullscreen().catch(() => miniSay('This browser kept the page out of full screen.'));
    },
    textbox: () => {
      const id = addBlock({ type: 'textbox', text: 'Text', x: 600, y: 380, w: 400 }, 'Inserted a text box');
      miniSay('Inserted a text box. Double click it to type.', true);
      return id;
    },
    rect: () => (addBlock({ type: 'shape', shape: 'rect', x: 640, y: 300, w: 320, h: 200 }, 'Inserted a rectangle'), miniSay('Inserted a rectangle in ink.', true)),
    oval: () => (addBlock({ type: 'shape', shape: 'oval', x: 680, y: 290, w: 240, h: 240 }, 'Inserted an oval'), miniSay('Inserted an oval in ink.', true)),
    table: () =>
      (addBlock({ type: 'table', cols: 3, cells: ['Plan', 'Owner', 'Date', 'Pilot', 'Maya', 'Week 1', 'Rollout', 'Sam', 'Week 3'], x: 400, y: 340, w: 800 }, 'Inserted a table'),
      miniSay('Inserted a table of ruled rows.', true)),
    newSlide: () => {
      const id = 'slide-' + Math.random().toString(36).slice(2, 6);
      const at = slideIndex(store.deck, mini.cur) + 1;
      store.commit('Added a slide', YOU, (d) => {
        d.slides.splice(at, 0, { id, layout: 'split', canvas: false, notes: '', blocks: [{ id: 'h', type: 'h2', text: 'New slide' }, { id: 'p1', type: 'textbox', text: 'Body text' }] });
      }, { slideId: id, detail: 'Slide ' + (at + 1) });
      mini.cur = id;
      miniSay('Added slide ' + (at + 1) + '. Present plays it too.', true);
    },
    bold: () => needSel((b) => (isText(b) ? (editSlide((b.bold ? 'Unbolded' : 'Bolded') + ' the ' + roleName(b).toLowerCase(), (s) => (findBlock(s, b.id).bold = !b.bold)), miniSay('Bold is weight 500, the heaviest the brand uses.', true)) : miniSay('Bold works on text.')), 'Bold'),
    under: () => needSel((b) => (isText(b) ? (editSlide('Underlined the ' + roleName(b).toLowerCase(), (s) => (findBlock(s, b.id).under = !b.under)), miniSay('Underline changed.', true)) : miniSay('Underline works on text.')), 'Underline'),
    alignLeft: () => needSel((b) => (editSlide('Aligned the ' + roleName(b).toLowerCase() + ' left', (s) => (findBlock(s, b.id).align = 'left')), miniSay('Aligned left.', true)), 'Left'),
    alignCenter: () => needSel((b) => (editSlide('Centred the ' + roleName(b).toLowerCase(), (s) => (findBlock(s, b.id).align = 'center')), miniSay('Centred.', true)), 'Center'),
    alignRight: () => needSel((b) => (editSlide('Aligned the ' + roleName(b).toLowerCase() + ' right', (s) => (findBlock(s, b.id).align = 'right')), miniSay('Aligned right.', true)), 'Right'),
    clear: () => needSel((b) => (editSlide('Cleared the formatting', (s) => Object.assign(findBlock(s, b.id), { bold: false, under: false, align: null })), miniSay('Cleared the formatting.', true)), 'Clear formatting'),
    dupSlide: () => {
      const s = curSlide();
      const id = 'slide-' + Math.random().toString(36).slice(2, 6);
      const at = slideIndex(store.deck, s.id) + 1;
      store.commit('Duplicated slide ' + at, YOU, (d) => {
        const c = clone(d.slides[at - 1]);
        c.id = id;
        c.blocks.forEach((b) => b.type === 'h1' && (b.type = 'h2'));
        d.slides.splice(at, 0, c);
      }, { slideId: id, detail: 'Slide ' + (at + 1) });
      mini.cur = id;
      miniSay('Duplicated slide ' + at + '.', true);
    },
    delSlide: () => {
      const s = curSlide();
      if (s.id === 'title') return miniSay('Slide 1 holds the heading of this page, so it stays. Choose another slide.');
      if (store.deck.slides.length < 2) return;
      const at = slideIndex(store.deck, s.id);
      store.commit('Deleted slide ' + (at + 1), YOU, (d) => d.slides.splice(at, 1), { slideId: 'title', detail: slideTitle(s) });
      mini.cur = store.deck.slides[Math.max(0, at - 1)].id;
      miniSay('Deleted slide ' + (at + 1) + '.', true);
    },
    skip: () => {
      const s = curSlide();
      const was = !!s.skip;
      const n = slideIndex(store.deck, s.id) + 1;
      store.commit((was ? 'Unskipped slide ' : 'Skipped slide ') + n, YOU, (d) => (d.slides[n - 1].skip = !was), { slideId: s.id, detail: slideTitle(s) });
      miniSay(was ? `Slide ${n} is back in the show.` : `Slide ${n} leaves the show. It stays in the deck.`, true);
    },
    slideUp: () => moveSlide(-1),
    slideDown: () => moveSlide(1),
    background: () => {
      const s = curSlide();
      const cycle = [null, '#0b1d3a', '#f3efe6', '#070707'];
      const next = cycle[(cycle.indexOf(s.bg || null) + 1) % cycle.length];
      const n = slideIndex(store.deck, s.id) + 1;
      store.commit(next ? `Set slide ${n}'s background to ${next}` : `Cleared slide ${n}'s background`, YOU, (d) => (d.slides[n - 1].bg = next), { slideId: s.id, detail: 'Slide ' + n });
      miniSay(next ? `Slide ${n}'s background is ${next}. Change theme sets every slide.` : `Slide ${n} takes the kit's background again.`, true);
      followInk();
    },
    theme: () => {
      const order = ['gt', 'kestrel', 'globex'];
      const next = order[(order.indexOf(store.deck.kit) + 1) % order.length];
      chooseKit(next);
      miniSay(`The ${KITS[next].name} kit set the colours of every slide.`, true);
    },
    front: () => needSel((b) => (editSlide('Brought the ' + roleName(b).toLowerCase() + ' to the front', (s) => (s.blocks = s.blocks.filter((x) => x.id !== b.id).concat(findBlock(s, b.id))), { canvas: true }), miniSay('Brought to the front.', true)), 'Bring to front'),
    back: () => needSel((b) => (editSlide('Sent the ' + roleName(b).toLowerCase() + ' to the back', (s) => (s.blocks = [findBlock(s, b.id)].concat(s.blocks.filter((x) => x.id !== b.id))), { canvas: true }), miniSay('Sent to the back.', true)), 'Send to back'),
    aLeft: () => alignTo('left'),
    aCenter: () => alignTo('center'),
    aRight: () => alignTo('right'),
    aTop: () => alignTo('top'),
    aMiddle: () => alignTo('middle'),
    aBottom: () => alignTo('bottom'),
    rotCw: () => needSel((b) => (editSlide('Rotated the ' + roleName(b).toLowerCase(), (s) => (findBlock(s, b.id).rot = norm((findBlock(s, b.id).rot || 0) + 90)), { canvas: true }), miniSay('Rotated 90 degrees clockwise.', true)), 'Rotate'),
    rotCcw: () => needSel((b) => (editSlide('Rotated the ' + roleName(b).toLowerCase(), (s) => (findBlock(s, b.id).rot = norm((findBlock(s, b.id).rot || 0) - 90)), { canvas: true }), miniSay('Rotated 90 degrees counter-clockwise.', true)), 'Rotate'),
    tailor: () => tailorDialog(),
    search: () => searchDialog(),
    shortcuts: () =>
      miniSay(`These work in this editor: ${keyText(K('Cmd+Z'))} undo, ${keyText(K('Cmd+Shift+Z', 'Ctrl+Y'))} redo, ${keyText(K('Cmd+D'))} duplicate, ${keyText(K('Ctrl+M', 'Ctrl+M'))} new slide, ${keyText(K('Cmd+B'))} bold, ${keyText(K('Option+/', 'Alt+/'))} search the menus.`),
  };

  function moveSlide(dir) {
    const s = curSlide();
    const i = slideIndex(store.deck, s.id);
    const j = i + dir;
    if (j < 0 || j >= store.deck.slides.length) return miniSay('The slide is already at the ' + (dir < 0 ? 'top.' : 'bottom.'));
    store.commit(`Moved slide ${i + 1} ${dir < 0 ? 'up' : 'down'}`, YOU, (d) => {
      const [x] = d.slides.splice(i, 1);
      d.slides.splice(j, 0, x);
    }, { slideId: s.id, detail: slideTitle(s) });
    miniSay(`Slide ${i + 1} is slide ${j + 1} now.`, true);
  }

  function alignTo(where) {
    needSel((b) => {
      editSlide('Aligned the ' + roleName(b).toLowerCase(), (s) => {
        const x = findBlock(s, b.id);
        const hh = x.h || 60;
        if (where === 'left') x.x = CONTENT.left;
        if (where === 'center') x.x = 800 - x.w / 2;
        if (where === 'right') x.x = CONTENT.right - x.w;
        if (where === 'top') x.y = CONTENT.top;
        if (where === 'middle') x.y = 450 - hh / 2;
        if (where === 'bottom') x.y = CONTENT.bottom - hh;
      }, { canvas: true });
      miniSay('Aligned to the slide.', true);
    }, 'Align');
  }

  // ---- the menu bar
  const bar = $('#menubar');
  const menuKey = $('#menus-key');
  let openState = null;
  const narrow = () => W.matchMedia('(max-width: 720px)').matches;

  MENU.forEach(([label], i) => {
    const t = h('button', { type: 'button', class: 'mt', role: 'menuitem', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'data-i': i, tabindex: i ? '-1' : '0' }, label);
    t.addEventListener('click', () => (openState && openState.i === i ? closeMenus(true) : openMenu(i)));
    t.addEventListener('pointerenter', () => {
      if (openState && openState.i !== i && !narrow()) openMenu(i);
    });
    t.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu(i, true);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + MENU.length) % MENU.length;
        titles()[n].focus();
        if (openState) openMenu(n);
      }
    });
    bar.append(t);
  });
  const titles = () => $$('.mt', bar);

  menuKey.addEventListener('click', () => {
    if (openState) return closeMenus(true);
    // the phone: one Menus key opens the nine menus as a list (B3b#14's phone editor)
    const items = MENU.map(([label], i) => [label, { sub: true, open: i }]);
    showPlate(items, { left: 8, top: bar.offsetTop + bar.offsetHeight }, 0, true, -1);
    menuKey.setAttribute('aria-expanded', 'true');
  });

  function closeMenus(focusTitle) {
    if (!openState) return;
    const i = openState.i;
    $$('.plate', miniRoot).forEach((p) => p.remove());
    titles().forEach((t) => t.setAttribute('aria-expanded', 'false'));
    menuKey.setAttribute('aria-expanded', 'false');
    openState = null;
    if (focusTitle) (narrow() ? menuKey : titles()[i] || menuKey).focus();
  }

  function openMenu(i, focusFirst) {
    $$('.plate', miniRoot).forEach((p) => p.remove());
    titles().forEach((t, j) => t.setAttribute('aria-expanded', String(i === j)));
    const t = titles()[i];
    const mr = miniRoot.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    showPlate(MENU[i][1], { left: tr.left - mr.left, top: tr.bottom - mr.top + 1 }, 0, focusFirst, i);
  }

  function showPlate(items, pos, depth, focusFirst, i) {
    $$('.plate', miniRoot).forEach((p) => +p.dataset.depth >= depth && p.remove());
    const plate = h('div', { class: 'plate', role: 'menu', 'data-depth': depth });
    plate.style.left = pos.left + 'px';
    plate.style.top = pos.top + 'px';
    if (narrow() && depth > 0) {
      plate.append(h('button', { type: 'button', role: 'menuitem', onclick: () => (closeMenus(), menuKey.click()) }, h('span', null, '‹ Menus'), h('span', { class: 'k' }), h('span')));
      plate.append(h('div', { role: 'separator' }));
    }
    for (const it of items) {
      if (it === '-') {
        plate.append(h('div', { role: 'separator' }));
        continue;
      }
      const [label, o] = it;
      const shown = (o.alt && o.alt()) || label;
      const row = h('button', { type: 'button', role: o.check ? 'menuitemcheckbox' : 'menuitem' });
      row.setAttribute('role', 'menuitem');
      if (o.check) row.setAttribute('aria-checked', String(!!o.check()));
      if (o.disabled) {
        row.setAttribute('aria-disabled', 'true');
        row.title = NOTES[o.disabled];
      }
      const keyCell = h('span', { class: 'k' }, o.key ? keyText(o.key) : o.check && o.check() ? '✓' : '');
      const chev = o.sub ? icon('i-chevron-right') : h('span');
      row.append(h('span', null, shown), keyCell, chev);
      if (o.sub) row.setAttribute('aria-haspopup', 'menu');
      const openSub = (focus) => {
        if (o.open != null) {
          const r = plate.getBoundingClientRect();
          const mr = miniRoot.getBoundingClientRect();
          closeMenus();
          openState = { i: o.open };
          showPlate(MENU[o.open][1], { left: 8, top: r.top - mr.top }, 1, true, o.open);
          return;
        }
        $$('.plate [aria-expanded="true"]', plate).forEach((x) => x.setAttribute('aria-expanded', 'false'));
        row.setAttribute('aria-expanded', 'true');
        const rr = row.getBoundingClientRect();
        const mr = miniRoot.getBoundingClientRect();
        const left = narrow() ? 8 : rr.right - mr.left - 2;
        const top = narrow() ? rr.bottom - mr.top : rr.top - mr.top - 7;
        showPlate(o.sub, { left, top }, depth + 1, focus, i);
      };
      row.addEventListener('pointerenter', () => {
        if (!narrow()) {
          if (o.sub && o.open == null) openSub(false);
          else $$('.plate', miniRoot).forEach((p) => +p.dataset.depth > depth && p.remove());
        }
        row.focus({ preventScroll: true });
      });
      row.addEventListener('click', () => {
        if (o.sub) return openSub(true);
        activate(label, o);
      });
      row.addEventListener('keydown', (e) => {
        const rowsOf = () => $$('[role="menuitem"]', plate);
        const all = rowsOf();
        const k = all.indexOf(row);
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          all[(k + 1) % all.length].focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          all[(k - 1 + all.length) % all.length].focus();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          if (o.sub) openSub(true);
          else if (i >= 0 && !narrow()) openMenu((i + 1) % MENU.length, true);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          if (depth > 0 && !narrow()) {
            plate.remove();
            const parent = $(`.plate[data-depth="${depth - 1}"] [aria-expanded="true"]`, miniRoot);
            if (parent) parent.focus();
          } else if (i >= 0 && !narrow()) {
            const n = (i - 1 + MENU.length) % MENU.length;
            openMenu(n, true);
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeMenus(true);
        } else if (e.key === 'Tab') closeMenus();
        else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          row.click();
        }
      });
      plate.append(row);
    }
    miniRoot.append(plate);
    // keep a plate inside the editor frame
    const mr = miniRoot.getBoundingClientRect();
    const pr = plate.getBoundingClientRect();
    if (!narrow() && pr.right > mr.right - 4) plate.style.left = Math.max(4, pos.left - (pr.right - mr.right) - 8) + 'px';
    openState = openState && depth > 0 ? openState : { i };
    if (focusFirst) {
      const first = $('[role="menuitem"]', plate);
      if (first) first.focus({ preventScroll: true });
    }
    return plate;
  }

  function activate(label, o) {
    closeMenus();
    if (o.disabled) return miniSay(NOTES[o.disabled]);
    if (o.act && ACTS[o.act]) return ACTS[o.act]();
    if (o.note) return miniSay(NOTES[o.note]);
  }

  D.addEventListener('pointerdown', (e) => {
    if (openState && !e.target.closest('.plate, .menubar')) closeMenus();
  });

  // ---- dialogs (Tailor, Find and replace, Search the menus, Rename, Name current version)
  function dialog(title, lead, body, buttons) {
    $$('.dialog', miniRoot).forEach((d) => d.remove());
    const box = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'false', 'aria-label': title });
    box.append(h('h3', null, title));
    if (lead) box.append(h('p', { class: 'd' }, lead));
    box.append(...body);
    const row = h('div', { class: 'row' });
    for (const [text, fn, solid] of buttons) row.append(h('button', { type: 'button', class: 'btn sm' + (solid ? ' solid' : ''), onclick: fn }, text));
    box.append(row);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        box.remove();
        miniRoot.focus();
      }
    });
    miniRoot.append(box);
    const f = $('input', box);
    if (f) {
      f.focus();
      f.select();
    }
    return box;
  }

  function countPlaces(find) {
    let places = 0;
    const slides = new Set();
    if (!find) return { places, slides: 0 };
    const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    for (const s of store.deck.slides) {
      const texts = [slideText(s), s.notes || ''];
      for (const t of texts) {
        const n = (t.match(re) || []).length;
        if (n) {
          places += n;
          slides.add(s.id);
        }
      }
    }
    return { places, slides: slides.size };
  }

  // the TAILOR words of packages/chrome/src/panels/assist-strings.ts
  const tailorCount = (places, slides) => (places === 0 ? 'Not found in the text' : `${places} place${places === 1 ? '' : 's'} on ${slides} slide${slides === 1 ? '' : 's'}`);

  function replaceAll(d, find, to) {
    const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const changed = [];
    for (const s of d.slides) {
      let hit = false;
      for (const b of s.blocks) {
        if (isText(b) && re.test(b.text)) {
          b.text = b.text.replace(re, to);
          hit = true;
        }
        re.lastIndex = 0;
        if (b.type === 'rows')
          b.rows = b.rows.map(([k, v]) => {
            const nk = k.replace(re, to);
            const nv = v.replace(re, to);
            if (nk !== k || nv !== v) hit = true;
            return [nk, nv];
          });
        if (b.type === 'table') b.cells = b.cells.map((c) => c.replace(re, to));
      }
      if (s.notes && re.test(s.notes)) {
        s.notes = s.notes.replace(re, to);
        hit = true;
      }
      re.lastIndex = 0;
      if (hit) changed.push(s.id);
    }
    return changed;
  }

  function tailorDialog() {
    const from = h('input', { type: 'text', value: 'Kestrel', 'aria-label': 'Replace' });
    const to = h('input', { type: 'text', value: 'Globex', 'aria-label': 'With' });
    const count = h('p', { class: 'count', 'aria-live': 'polite' });
    const upd = () => {
      const c = countPlaces(from.value.trim());
      count.textContent = tailorCount(c.places, c.slides);
    };
    from.addEventListener('input', upd);
    upd();
    const apply = () => {
      const f = from.value.trim();
      const t = to.value.trim();
      const c = countPlaces(f);
      if (!f || !t || !c.places) {
        count.textContent = 'Type a customer name first';
        return;
      }
      box.remove();
      store.commit('Tailored the deck for ' + t, YOU, (d) => void replaceAll(d, f, t), { detail: tailorCount(c.places, c.slides), slideId: 'plan' });
      miniSay(`Tailored for ${t}: ${tailorCount(c.places, c.slides)}`, true);
    };
    const box = dialog(
      'Tailor for a customer',
      'Rename the customer, swap the pictures named after the old one and skip the slides they should not see, as one change',
      [h('label', null, 'Replace', from), h('label', null, 'With', to), count],
      [['Cancel', () => box.remove()], ['Apply', apply, true]],
    );
    to.addEventListener('keydown', (e) => e.key === 'Enter' && apply());
  }

  function findDialog() {
    const from = h('input', { type: 'text', value: '', 'aria-label': 'Find' });
    const to = h('input', { type: 'text', value: '', 'aria-label': 'Replace with' });
    const count = h('p', { class: 'count', 'aria-live': 'polite' }, 'Type the words to find');
    from.addEventListener('input', () => {
      const c = countPlaces(from.value);
      count.textContent = from.value ? tailorCount(c.places, c.slides) : 'Type the words to find';
    });
    const apply = () => {
      const f = from.value;
      const c = countPlaces(f);
      if (!f || !c.places) return;
      box.remove();
      store.commit(`Replaced ${f} with ${to.value || 'nothing'}`, YOU, (d) => void replaceAll(d, f, to.value), { detail: tailorCount(c.places, c.slides), slideId: mini.cur });
      miniSay(`Replaced ${tailorCount(c.places, c.slides)}.`, true);
    };
    const box = dialog('Find and replace', null, [h('label', null, 'Find', from), h('label', null, 'Replace with', to), count], [['Close', () => box.remove()], ['Replace All', apply, true]]);
  }

  function flatMenu() {
    const out = [];
    const walk = (items, path) => {
      for (const it of items) {
        if (it === '-') continue;
        const [label, o] = it;
        if (o.sub) walk(o.sub, path.concat(label));
        else out.push({ label, path: path.concat(label).join(' > '), o });
      }
    };
    MENU.forEach(([m, items]) => walk(items, [m]));
    return out;
  }

  function searchDialog() {
    const q = h('input', { type: 'text', placeholder: 'Search the menus', 'aria-label': 'Search the menus' });
    const list = h('div', { class: 'finder', role: 'listbox' });
    const all = flatMenu();
    const draw = () => {
      const s = q.value.trim().toLowerCase();
      const hits = all.filter((x) => !s || x.path.toLowerCase().includes(s)).slice(0, 8);
      list.replaceChildren(
        ...hits.map((x) =>
          h('button', { type: 'button', role: 'option', onclick: () => (box.remove(), activate(x.label, x.o)) }, h('span', null, x.path), h('span', null, x.o.key ? keyText(x.o.key) : '')),
        ),
      );
    };
    q.addEventListener('input', draw);
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const f = $('button', list);
        if (f) f.click();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const f = $('button', list);
        if (f) f.focus();
      }
    });
    list.addEventListener('keydown', (e) => {
      const bs = $$('button', list);
      const k = bs.indexOf(D.activeElement);
      if (e.key === 'ArrowDown') (e.preventDefault(), bs[Math.min(bs.length - 1, k + 1)].focus());
      if (e.key === 'ArrowUp') (e.preventDefault(), k <= 0 ? q.focus() : bs[k - 1].focus());
    });
    draw();
    const box = dialog('Search the menus', 'Every row of the nine menus, by name.', [q, list], [['Close', () => box.remove()]]);
  }

  function renameDialog() {
    const name = h('input', { type: 'text', value: store.deck.name, 'aria-label': 'Name' });
    const apply = () => {
      const v = name.value.trim();
      box.remove();
      if (!v || v === store.deck.name) return;
      store.commit('Renamed the presentation', YOU, (d) => (d.name = v), { detail: v, slideId: mini.cur });
      miniSay(`The presentation is ${v} now.`, true);
    };
    const box = dialog('Rename', null, [h('label', null, 'Name', name)], [['Cancel', () => box.remove()], ['Rename', apply, true]]);
    name.addEventListener('keydown', (e) => e.key === 'Enter' && apply());
  }

  function nameVersionDialog() {
    const note = h('input', { type: 'text', value: 'Ready for Kestrel', 'aria-label': 'Version note' });
    const apply = () => {
      const v = note.value.trim();
      box.remove();
      if (!v) return;
      store.nameVersion(v);
      miniSay(`Saved the version ${v}. Version history lists it below.`);
    };
    const box = dialog('Name current version', 'A named version stands alone in Version history.', [h('label', null, 'Name', note)], [['Cancel', () => box.remove()], ['Save', apply, true]]);
    note.addEventListener('keydown', (e) => e.key === 'Enter' && apply());
  }

  // ---- the editor's own shortcuts, while the focus is inside it
  miniRoot.addEventListener('keydown', (e) => {
    if (isField(e.target) || e.target.closest('.plate, .dialog')) return;
    const k = e.key.toLowerCase();
    const run = (a) => {
      e.preventDefault();
      ACTS[a]();
    };
    if (e.altKey && e.code === 'Slash') return run('search');
    if (e.ctrlKey && !e.metaKey && k === 'm') return run('newSlide');
    if (!modKey(e)) return;
    if (k === 'z') return run(e.shiftKey ? 'redo' : 'undo');
    if (k === 'y') return run('redo');
    if (k === 'd') return run('duplicate');
    if (k === 'b') return run('bold');
    if (k === 'u') return run('under');
    if (k === 'x') return run('cut');
    if (k === 'c' && miniEd && miniEd.sel) return run('copy');
    if (k === 'v' && clipboard) return run('paste');
    if (k === 'enter') return run('slideshow');
    if (k === '/') return run('shortcuts');
    if (e.shiftKey && k === 'h') return run('find');
    if (e.shiftKey && k === 'l') return run('alignLeft');
    if (e.shiftKey && k === 'e') return run('alignCenter');
    if (e.shiftKey && k === 'r') return run('alignRight');
    if (k === 'arrowup' && !miniEd.sel) return run('slideUp');
    if (k === 'arrowdown' && !miniEd.sel) return run('slideDown');
  });

  $('[data-mini="search"]').addEventListener('click', () => ACTS.search());
  $('[data-mini="slideshow"]').addEventListener('click', () => ACTS.slideshow());

  const notesBox = $('#notes');
  let notesBefore = null;
  notesBox.addEventListener('focus', () => (notesBefore = clone(store.deck)));
  notesBox.addEventListener('input', () => {
    const v = notesBox.value;
    store.preview((d) => (d.slides[slideIndex(d, mini.cur)].notes = v), 'notes');
  });
  notesBox.addEventListener('change', () => {
    const n = slideIndex(store.deck, mini.cur) + 1;
    store.commit('Wrote the speaker notes', YOU, () => {}, { before: notesBefore, slideId: mini.cur, detail: 'Slide ' + n });
    notesBefore = clone(store.deck);
    miniSay(`Presenter view shows the new notes on slide ${n}.`, true);
  });

  function thumb(s, i, onPick, current) {
    const host = h('div', { class: 'sl', 'aria-hidden': 'true' });
    const btn = h('button', { type: 'button', 'aria-label': `Slide ${i + 1}: ${slideTitle(s)}${s.skip ? ', skipped' : ''}`, 'aria-current': String(current) }, h('span', null, String(i + 1)), host);
    btn.addEventListener('click', () => onPick(s.id));
    return [btn, host];
  }

  function renderMini() {
    const deck = store.deck;
    if (!store.slide(mini.cur)) mini.cur = deck.slides[0].id;
    $('#deck-name').textContent = deck.name;
    $('#deck-meta').textContent = deck.slides.length + ' slides';
    const strip = $('#strip');
    const focused = $$('button', strip).indexOf(D.activeElement);
    const pick = (id) => {
      mini.cur = id;
      if (mini.grid) {
        mini.grid = false;
        miniRoot.classList.remove('show-grid');
      }
      miniEd.sel = null;
      renderMini();
    };
    const hosts = [];
    strip.replaceChildren(
      ...deck.slides.map((s, i) => {
        const [btn, host] = thumb(s, i, pick, s.id === mini.cur);
        hosts.push([host, s, i]);
        return btn;
      }),
    );
    if (mini.grid) {
      const grid = $('#mini-grid');
      grid.replaceChildren(
        ...deck.slides.map((s, i) => {
          const [btn, host] = thumb(s, i, pick, s.id === mini.cur);
          hosts.push([host, s, i]);
          return btn;
        }),
      );
    }
    for (const [host, s, i] of hosts) renderSlide(host, s, deck, { thumb: true, n: i + 1 });
    if (focused >= 0) {
      const b = $$('button', strip)[Math.min(focused, deck.slides.length - 1)];
      if (b) b.focus({ preventScroll: true });
    }
    miniEd.render();
    if (D.activeElement !== notesBox) notesBox.value = curSlide().notes || '';
  }

  views.push({
    id: 'mini',
    el: miniRoot,
    mount() {
      miniEd = new Editor({ host: miniHost, name: 'mini', slideId: () => mini.cur, status: miniStatus, read: $('.read', miniStatus), onDelete: () => ACTS.delete() });
    },
    update: renderMini,
  });

  // -------------------------------------------------------------------------------------------
  // Instrument 2: present

  const show = { on: false, idx: 0, t0: 0, timer: 0, ended: false };
  const audience = $('#audience');
  const audHost = $('#aud-sl');
  const nextHost = $('#next-sl');

  const showOrder = () => store.deck.slides.filter((s) => !s.skip);

  function renderShow() {
    const order = showOrder();
    const all = store.deck.slides;
    if (!order.length) return;
    show.idx = clamp(show.idx, 0, order.length - 1);
    const s = order[show.idx];
    if (show.ended) {
      audHost.replaceChildren(h('div', { style: 'position:absolute;inset:0;display:grid;place-items:center;background:#000;color:#8a8f98;font-size:15px' }, 'The end of the show. Escape closes it.'));
      applyKit(audHost, { '--k-paper': '#000000', '--k-ink': '#8a8f98', '--k-ink-2': '#8a8f98', '--k-titanium': '#8a8f98', '--k-hair': 'rgba(0,0,0,0)', '--k-cross': 'rgba(0,0,0,0)' });
      audHost._pic = null;
    } else renderSlide(audHost, s, store.deck, { n: all.indexOf(s) + 1 });
    const nx = order[show.idx + 1];
    if (nx) renderSlide(nextHost, nx, store.deck, { thumb: true, n: all.indexOf(nx) + 1 });
    else {
      nextHost.replaceChildren(h('div', { style: 'position:absolute;inset:0;display:grid;place-items:center;font-size:13px;color:var(--pt-titanium)' }, 'The end of the show'));
      nextHost._pic = null;
      applyKit(nextHost, null);
    }
    $('#present-notes').textContent = s.notes || 'No notes on this slide.';
    const skipped = all.length - order.length;
    $('#present-of').textContent = `Slide ${show.idx + 1} of ${order.length}` + (skipped ? `, ${skipped} skipped` : '');
    $('#present-go').innerHTML = '';
    $('#present-go').append(icon(show.on ? 'i-pause-circle' : 'i-play'), show.on ? 'End Show' : 'Present');
  }

  function tick() {
    const s = Math.floor((Date.now() - show.t0) / 1000);
    $('#timer').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function startShow(fromId) {
    const order = showOrder();
    const k = order.findIndex((s) => s.id === fromId);
    show.idx = k >= 0 ? k : 0;
    show.on = true;
    show.ended = false;
    show.t0 = Date.now();
    clearInterval(show.timer);
    show.timer = setInterval(tick, 1000);
    tick();
    renderShow();
    audience.focus({ preventScroll: true });
  }

  function endShow() {
    show.on = false;
    show.ended = false;
    clearInterval(show.timer);
    if (D.fullscreenElement === audience) D.exitFullscreen().catch(() => {});
    renderShow();
  }

  function startShowFrom(id) {
    const band = $('#present');
    band.scrollIntoView({ block: 'start' });
    mountNow('present');
    startShow(id);
  }

  function go(d) {
    if (!show.on) startShow(showOrder()[show.idx] && showOrder()[show.idx].id);
    const order = showOrder();
    if (show.ended) {
      if (d < 0) show.ended = false;
      renderShow();
      return;
    }
    if (show.idx + d >= order.length) show.ended = true;
    else show.idx = clamp(show.idx + d, 0, order.length - 1);
    renderShow();
  }

  views.push({
    id: 'present',
    el: $('[data-mount="present"]'),
    mount() {
      // the presenter's current slide is the one on its screen; View > Slideshow starts from the editor's
      const shown = () => (showOrder()[show.idx] || {}).id;
      $('#present-go').addEventListener('click', () => (show.on ? endShow() : startShow(shown())));
      $('#present-full').addEventListener('click', () => {
        if (!show.on) startShow(shown());
        if (audience.requestFullscreen) audience.requestFullscreen().catch(() => {});
      });
      $('#present-prev').addEventListener('click', () => go(-1));
      $('#present-next').addEventListener('click', () => go(1));
      audience.addEventListener('click', () => (show.on ? go(1) : startShow(shown())));
      audience.addEventListener('keydown', (e) => {
        const next = ['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter', 'n'];
        const prev = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'];
        if (next.includes(e.key)) (e.preventDefault(), go(1));
        else if (prev.includes(e.key)) (e.preventDefault(), go(-1));
        else if (e.key === 'Home') (e.preventDefault(), (show.idx = 0), (show.ended = false), renderShow());
        else if (e.key === 'End') (e.preventDefault(), (show.idx = showOrder().length - 1), (show.ended = false), renderShow());
        else if (e.key === 'Escape' && show.on) (e.preventDefault(), endShow());
      });
      D.addEventListener('fullscreenchange', () => {
        raf(() => {
          paintField(audHost, true);
        });
      });
    },
    update: renderShow,
  });

  // -------------------------------------------------------------------------------------------
  // Instrument 3: export, one slide drawn two ways under a seam

  const seamx = $('#seamx');
  const seamHandle = $('#seam-handle');
  let cut = 50;

  function setCut(v, hint) {
    cut = clamp(v, 0, 100);
    seamx.style.setProperty('--cut', cut + '%');
    seamHandle.setAttribute('aria-valuenow', String(Math.round(cut)));
    seamHandle.setAttribute('aria-valuetext', `${Math.round(cut)} percent picture pages, ${Math.round(100 - cut)} percent editable text`);
    if (!hint) seamx.classList.remove('is-hint');
  }

  // the seam sits over the lighthouse: the picture fills the sheet and the words sit on the plate
  // at the right, so each side of the seam has something to show; slide 1 when it is gone
  const exportSlide = () => store.slide('mood') || store.slide('title') || store.deck.slides[0];
  function renderExport() {
    const s = exportSlide();
    const n = slideIndex(store.deck, s.id) + 1;
    renderSlide($('#exp-a'), s, store.deck, { n });
    renderSlide($('#exp-b'), s, store.deck, { n });
    raf(drawAnno);
  }

  function drawAnno() {
    const anno = $('#anno');
    const host = $('#exp-b');
    const hr = host.getBoundingClientRect();
    const ga = h('div', { style: { position: 'absolute', inset: '0', clipPath: 'inset(0 calc(100% - var(--cut)) 0 0)' } });
    const gb = h('div', { style: { position: 'absolute', inset: '0', clipPath: 'inset(0 0 0 var(--cut))' } });
    ga.append(h('div', { class: 'box', style: { inset: '0' } }, h('span', { class: 'tag in' }, 'One picture, 1600 by 900')));
    if (exportSlide().picture) gb.append(h('div', { class: 'box', style: { left: '0', top: '0', right: '0', bottom: '0', borderStyle: 'solid', opacity: '0.55' } }, h('span', { class: 'tag in', style: { top: 'auto', bottom: '4px', left: 'auto', right: '4px' } }, 'Picture')));
    $$('.sl-b[data-id]', host).forEach((el, k) => {
      const r = el.getBoundingClientRect();
      gb.append(
        h('div', { class: 'box', style: { left: r.left - hr.left + 'px', top: r.top - hr.top + 'px', width: r.width + 'px', height: r.height + 'px' } }, k ? null : h('span', { class: 'tag' }, 'Text box')),
      );
    });
    anno.replaceChildren(ga, gb);
  }

  views.push({
    id: 'export',
    el: $('[data-mount="export"]'),
    mount() {
      setCut(50);
      const at = (e) => {
        const r = seamx.getBoundingClientRect();
        setCut(((e.clientX - r.left) / r.width) * 100);
      };
      seamx.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch' && e.target !== seamHandle) return;
        e.preventDefault();
        seamHandle.classList.add('is-active');
        seamHandle.focus({ preventScroll: true });
        at(e);
        const move = (ev) => at(ev);
        const up = () => {
          seamHandle.classList.remove('is-active');
          W.removeEventListener('pointermove', move);
          W.removeEventListener('pointerup', up);
        };
        W.addEventListener('pointermove', move);
        W.addEventListener('pointerup', up);
      });
      seamHandle.addEventListener('keydown', (e) => {
        const m = { ArrowLeft: -2, ArrowDown: -2, ArrowRight: 2, ArrowUp: 2, PageDown: -10, PageUp: 10 };
        if (m[e.key] != null) (e.preventDefault(), setCut(cut + m[e.key]));
        if (e.key === 'Home') (e.preventDefault(), setCut(0));
        if (e.key === 'End') (e.preventDefault(), setCut(100));
      });
      W.addEventListener('resize', () => raf(drawAnno));
    },
    update: renderExport,
    enter() {
      if (reduced()) return;
      setCut(82, true);
      void seamx.offsetWidth;
      seamx.classList.add('is-hint');
      raf(() => setCut(50, true));
      setTimeout(() => seamx.classList.remove('is-hint'), 700);
    },
  });

  $$('[data-act="print"]').forEach((b) => b.addEventListener('click', () => printDeck()));

  function buildPrintDeck() {
    const box = $('#print-deck');
    box.classList.add('prep');
    box.replaceChildren();
    const all = store.deck.slides;
    for (const s of all.filter((x) => !x.skip)) {
      const host = h('div', { class: 'sl' });
      box.append(host);
      host._p = 1;
      renderSlide(host, s, store.deck, { n: all.indexOf(s) + 1 });
    }
    // fields paint from the hosts' size, which needs a layout
    void box.offsetWidth;
    for (const host of $$('.sl', box)) paintField(host, true);
  }

  function printDeck() {
    buildPrintDeck();
    W.print();
  }
  W.addEventListener('beforeprint', () => {
    if (!$('#print-deck').childElementCount) buildPrintDeck();
  });
  W.addEventListener('afterprint', () => {
    const box = $('#print-deck');
    box.replaceChildren();
    box.classList.remove('prep');
    for (const host of Array.from(fieldHosts)) if (!host.isConnected) fieldHosts.delete(host);
  });

  function downloadText() {
    const all = store.deck.slides;
    const text = all.map((s, i) => `Slide ${i + 1}${s.skip ? ' (skipped)' : ''}\n${slideText(s)}${s.notes ? '\nNotes: ' + s.notes : ''}`).join('\n\n');
    const url = URL.createObjectURL(new Blob([store.deck.name + '\n\n' + text + '\n'], { type: 'text/plain' }));
    const a = h('a', { href: url, download: store.deck.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.txt' });
    D.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    miniSay('Downloaded the words of every slide as a text file.');
  }

  // -------------------------------------------------------------------------------------------
  // Instrument 4: the agent's command line

  const term = { tr: 'cli', hist: [], hi: -1, slide: 'title', ring: null, last: null };
  const out = $('#term-out');
  const tin = $('#term-input');
  const agentHost = $('#agent-sl');
  const agentWrap = $('#agent-wrap');

  const EXAMPLES = [
    ['slide get title', 'Reads slide 1 as JSON'],
    ['tailor --replace "Kestrel=Globex"', 'Renames the customer on every slide'],
    ['block rotate title#h --to 8', 'Turns the title by 8 degrees'],
    ['slide background title --color "#0b1d3a"', 'Sets the background of slide 1'],
    ['block set title#h /text "Present it and send the link"', 'Writes the title'],
    ['slide skip mood', 'Leaves the lighthouse out of the show'],
    ['version list', 'Lists the versions with their authors'],
  ];

  // `turboslide --version`, recorded from the CLI on 2026-10-02 (product/cli-version.txt), the
  // checkout line left out
  const BANNER = [
    ' ███████████  Turboslide 2026.1001.3',
    ' ▀▀▀▀▀███▀▀▀  https://www.turboslide.com',
    '▄▄▄▄▄ ███     193 actions, effects backend: wasm',
    '▄▄▄▄ ▄▄▄',
    '     ███',
    '███ ███',
  ].join('\n');

  function tokens(line) {
    const out2 = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let m;
    while ((m = re.exec(line))) out2.push(m[1] ?? m[2] ?? m[3]);
    return out2;
  }

  function print(text, cls) {
    const pre = h('pre', { class: (cls || '') + (reduced() ? '' : ' new') }, text);
    out.append(pre);
    out.scrollTop = out.scrollHeight;
    return pre;
  }

  function echo(c) {
    const via = term.tr;
    if (via === 'cli') return print('$ turboslide ' + c.line, 'cmd');
    if (!c.tool) return print('$ turboslide ' + c.line + '\n' + (via === 'mcp' ? '# no MCP tool on this page for this command' : '# no HTTP path on this page for this command'), 'cmd');
    if (via === 'mcp') return print(JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: c.tool, arguments: c.args } }, null, 2), 'cmd');
    return print(`POST /api/actions/${c.path}\ncontent-type: application/json\n\n${JSON.stringify(c.args, null, 2)}`, 'cmd');
  }

  function parse(line) {
    let t = tokens(line.trim());
    if (t[0] === 'pnpm' && t[1] === 'exec') t = t.slice(2);
    if (t[0] === 'turboslide') t = t.slice(1);
    const opt = (name) => {
      const i = t.indexOf(name);
      return i >= 0 ? t[i + 1] : undefined;
    };
    const flag = (name) => t.includes(name);
    const ref = (s) => {
      const [sl, bl] = (s || '').split('#');
      return { sl, bl };
    };
    const [a, b] = t;
    const shown = t.join(' ');
    if (!a) return null;
    if (a === 'help' || a === '--help') return { line: shown, run: cmdHelp };
    if (a === '--version' || a === 'version' && !b) return { line: shown, run: () => print(BANNER) };
    if (a === 'clear') return { line: shown, run: () => out.replaceChildren(), quiet: true };
    if (a === 'slide' && b === 'get') {
      const id = t[2] || 'title';
      return { line: shown, tool: 'deck_get_slide', path: 'slide.get', args: { slideId: id }, run: () => cmdGet(id) };
    }
    if ((a === 'slides' || (a === 'slide' && b === 'list'))) return { line: shown, run: cmdSlides };
    if (a === 'text' && b === 'replace') {
      const [f, r] = [t[2], t[3]];
      return { line: shown, tool: 'deck_replace_text', path: 'text.replaceAll', args: { find: f, replace: r }, run: () => cmdReplace(f, r, 'text.replaceAll') };
    }
    if (a === 'tailor') {
      const rep = opt('--replace') || '';
      const [f, r] = rep.split('=');
      return { line: shown, tool: 'deck_tailor', path: 'deck.tailor', args: { replacements: [{ from: f, to: r }] }, run: () => cmdReplace(f, r, 'deck.tailor') };
    }
    if (a === 'block' && b === 'rotate') {
      const { sl, bl } = ref(t[2]);
      const to = opt('--to');
      const by = opt('--by');
      return { line: shown, tool: 'deck_rotate_block', path: 'block.rotate', args: { slideId: sl, blockIds: [bl], ...(to != null ? { to: +to } : { by: +by }) }, run: () => cmdRotate(sl, bl, to, by) };
    }
    if (a === 'block' && b === 'set') {
      const { sl, bl } = ref(t[2]);
      const path = t[3];
      const value = t.slice(4).join(' ');
      return { line: shown, tool: 'deck_update_block', path: 'block.set', args: { slideId: sl, blockId: bl, path, value }, run: () => cmdSet(sl, bl, path, value) };
    }
    if (a === 'slide' && b === 'background') {
      const ids = (t[2] || '').split(',');
      const color = opt('--color');
      return { line: shown, tool: 'deck_set_slide_background', path: 'slide.setBackground', args: { slideIds: ids, background: color }, run: () => cmdBackground(ids, color) };
    }
    if (a === 'slide' && b === 'skip') {
      const ids = (t[2] || '').split(',');
      const off = flag('--off');
      return { line: shown, tool: 'deck_skip_slide', path: 'slide.skip', args: { slideIds: ids, skip: !off }, run: () => cmdSkip(ids, !off) };
    }
    if (a === 'slide' && b === 'new') {
      const layout = opt('--layout') || 'split';
      const after = opt('--after') || term.slide;
      return { line: shown, tool: 'deck_new_slide', path: 'slide.new', args: { layout, after }, run: () => cmdNew(layout, after) };
    }
    if (a === 'version' && b === 'list') return { line: shown, tool: 'deck_version_list', path: 'version.list', args: {}, run: cmdVersions };
    if (a === 'version' && b === 'restore') {
      const n = +t[2];
      return { line: shown, tool: 'deck_version_restore', path: 'version.restore', args: { n }, run: () => cmdRestore(n) };
    }
    return { line: shown, run: () => print(`turboslide: this page does not run "${shown}". Type help for the eleven it runs.`, 'err') };
  }

  function cmdHelp() {
    print(
      [
        'This page runs eleven of the 193 actions against the deck above:',
        '  slide get <slideId>                     slides',
        '  text replace <find> <replace>           tailor --replace <from>=<to>',
        '  block rotate <slideId>#<blockId> --to <degrees>',
        '  block set <slideId>#<blockId> /text <value>',
        '  slide background <slideIds> --color <hex>',
        '  slide skip <slideIds> [--off]           slide new --layout split --after <slideId>',
        '  version list                            version restore <n>',
        'Slide ids: ' + store.deck.slides.map((s) => s.id).join(', ') + '. Up recalls a command.',
      ].join('\n'),
      'dim',
    );
  }

  const agentAuthor = () => pitchAgent(term.tr === 'cli' ? 'CLI' : term.tr === 'mcp' ? 'MCP' : 'HTTP');

  function cmdGet(id) {
    const s = store.slide(id);
    if (!s) return print(`turboslide: no slide "${id}". The slides are ${store.deck.slides.map((x) => x.id).join(', ')}.`, 'err');
    const view = clone(s);
    delete view.canvas;
    if (!view.plate) delete view.plate;
    print(JSON.stringify({ slide: { schemaVersion: 1, ...view }, n: slideIndex(store.deck, id) + 1 }, null, 2));
    showAgentSlide(id, 'h');
  }

  function cmdSlides() {
    print(JSON.stringify(store.deck.slides.map((s, i) => ({ id: s.id, n: i + 1, title: slideTitle(s), kind: s.layout, skip: !!s.skip })), null, 2));
  }

  function write(label, fn, info, focus) {
    store.commit(label, agentAuthor(), fn, { detail: info.detail, slideId: focus[0] });
    print(JSON.stringify(Object.assign({ ok: true, author: 'agent:pitch-agent' }, info.result), null, 2));
    term.last = label;
    $('#agent-last').textContent = label + (info.detail ? '. ' + info.detail + '.' : '.');
    $('#agent-author').textContent = `Pitch agent, through ${term.tr === 'cli' ? 'the CLI' : term.tr === 'mcp' ? 'MCP' : 'HTTP'}.`;
    // the commit renders the view next frame; the ring travels from where it stood
    term.slide = focus[0];
    term.focus = focus[1];
  }

  function cmdReplace(f, r, action) {
    if (!f || r == null) return print('turboslide: say what to find and what replaces it.', 'err');
    const c = countPlaces(f);
    if (!c.places) return print(JSON.stringify({ ok: true, action, places: 0, note: 'Not found in the text' }, null, 2));
    let changed = [];
    write(action === 'deck.tailor' ? 'Tailored the deck for ' + r : `Replaced ${f} with ${r}`, (d) => void (changed = replaceAll(d, f, r)), { detail: tailorCount(c.places, c.slides), result: { action, places: c.places, slides: c.slides } }, [
      store.deck.slides.find((s) => slideText(s).toLowerCase().includes(f.toLowerCase()))?.id || 'plan',
      'h',
    ]);
    void changed;
  }

  function cmdRotate(sl, bl, to, by) {
    const s = store.slide(sl);
    const b = findBlock(s, bl);
    if (!b) return print(`turboslide: no block "${sl}#${bl}".`, 'err');
    const deg = to != null ? norm(+to) : norm((b.rot || 0) + +(by || 0));
    if (Number.isNaN(deg)) return print('turboslide: --to takes degrees.', 'err');
    // a rotation on a layout slide measures it into a canvas first, as the editor does
    const draft = canvasDraft(sl);
    findBlock(draft, bl).rot = deg;
    write('Rotated the ' + roleName(b).toLowerCase(), (d) => (d.slides[slideIndex(d, sl)] = draft), { detail: `Slide ${slideIndex(store.deck, sl) + 1}, ${deg} degrees`, result: { action: 'block.rotate', slideId: sl, blockIds: [bl], to: deg } }, [sl, bl]);
  }

  function cmdSet(sl, bl, path, value) {
    const s = store.slide(sl);
    const b = findBlock(s, bl);
    if (!b) return print(`turboslide: no block "${sl}#${bl}".`, 'err');
    if (path !== '/text' || !isText(b)) return print('turboslide: this page sets /text on a text block.', 'err');
    write('Wrote the ' + roleName(b).toLowerCase(), (d) => (findBlock(d.slides[slideIndex(d, sl)], bl).text = value), { detail: 'Slide ' + (slideIndex(store.deck, sl) + 1), result: { action: 'block.set', slideId: sl, blockId: bl, path } }, [sl, bl]);
  }

  function cmdBackground(ids, color) {
    if (color && !validHex(color)) return print('turboslide: --color takes a hex colour such as #0b1d3a.', 'err');
    const bad = ids.filter((id) => !store.slide(id));
    if (bad.length) return print(`turboslide: no slide "${bad[0]}".`, 'err');
    write(color ? 'Set the background to ' + color : 'Cleared the background', (d) => ids.forEach((id) => (d.slides[slideIndex(d, id)].bg = color || null)), { detail: ids.map((id) => 'Slide ' + (slideIndex(store.deck, id) + 1)).join(', '), result: { action: 'slide.setBackground', slideIds: ids, background: color || null } }, [ids[0], null]);
    followInk();
  }

  function cmdSkip(ids, on) {
    const bad = ids.filter((id) => !store.slide(id));
    if (bad.length) return print(`turboslide: no slide "${bad[0]}".`, 'err');
    write((on ? 'Skipped ' : 'Unskipped ') + ids.map((id) => 'slide ' + (slideIndex(store.deck, id) + 1)).join(' and '), (d) => ids.forEach((id) => (d.slides[slideIndex(d, id)].skip = on)), { detail: on ? 'It leaves the show and stays in the deck' : 'It is back in the show', result: { action: 'slide.skip', slideIds: ids, skip: on } }, [ids[0], null]);
  }

  function cmdNew(layout, after) {
    const at = slideIndex(store.deck, after);
    if (at < 0) return print(`turboslide: no slide "${after}".`, 'err');
    const id = 'slide-' + Math.random().toString(36).slice(2, 6);
    write('Added a slide', (d) => d.slides.splice(at + 1, 0, { id, layout: 'split', canvas: false, notes: '', blocks: [{ id: 'h', type: 'h2', text: 'New slide' }, { id: 'p1', type: 'textbox', text: 'Body text' }] }), { detail: 'Slide ' + (at + 2) + ', layout ' + layout, result: { action: 'slide.new', id, layout, after } }, [id, 'h']);
  }

  function cmdVersions() {
    const vs = store.versions.map((v, i) => ({ n: i + 1, at: timeOf(v.at), author: v.author.kind === 'agent' ? 'agent: ' + v.author.name : v.author.name, label: v.label }));
    print(JSON.stringify(vs, null, 2));
  }

  function cmdRestore(n) {
    const v = store.versions[n - 1];
    if (!v) return print(`turboslide: no version ${n}. Version list shows ${store.versions.length}.`, 'err');
    write(`Restored the ${timeOf(v.at)} version`, () => clone(v.deck), { detail: v.label, result: { action: 'version.restore', n } }, [v.slideId, null]);
  }

  function canvasDraft(sl) {
    const s = clone(store.slide(sl));
    if (s.canvas) return s;
    // measure the layout as drawn in the agent's view when it shows this slide, else in the hero
    const host = term.slide === sl ? agentHost : sl === 'title' ? heroHost : null;
    if (!host) return s;
    const hr = host.getBoundingClientRect();
    const u = host.clientWidth / 1600;
    for (const b of s.blocks) {
      const el = host.querySelector(`.sl-b[data-id="${b.id}"]`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      Object.assign(b, { x: (r.left - hr.left) / u, y: (r.top - hr.top) / u, w: r.width / u, h: r.height / u, rot: 0 });
    }
    const pl = host.querySelector('.sl-plate');
    if (pl) {
      const r = pl.getBoundingClientRect();
      s.plate = { x: (r.left - hr.left) / u, y: (r.top - hr.top) / u, w: r.width / u, h: r.height / u };
    }
    s.canvas = true;
    return s;
  }

  // the agent's ring travels to what changed: 300 ms plus half a millisecond per pixel, 300 to
  // 700 ms, on the move curve; the chip names the agent
  function showAgentSlide(id, blockId) {
    term.slide = id;
    term.focus = blockId;
    renderAgent();
  }

  function renderAgent() {
    const s = store.slide(term.slide) || store.deck.slides[0];
    term.slide = s.id;
    renderSlide(agentHost, s, store.deck, {});
    raf(placeRing);
  }

  function placeRing() {
    const wr = agentWrap.getBoundingClientRect();
    const hr = agentHost.getBoundingClientRect();
    let target;
    const el = term.focus && agentHost.querySelector(`.sl-b[data-id="${term.focus}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      target = { x: r.left - wr.left, y: r.top - wr.top, w: r.width, h: r.height };
    } else target = { x: hr.left - wr.left, y: hr.top - wr.top, w: hr.width, h: hr.height };
    let ring = term.ring;
    if (!ring || !ring.isConnected) {
      ring = term.ring = h('div', { class: 'agent-ring', 'aria-hidden': 'true' }, h('span', { class: 'ov-chip' }, 'Pitch agent'));
      agentWrap.append(ring);
      if (!term.last) ring.style.opacity = '0';
    }
    const from = ring._at;
    Object.assign(ring.style, { left: target.x + 'px', top: target.y + 'px', width: target.w + 'px', height: target.h + 'px' });
    if (term.last) ring.style.opacity = '1';
    const moved = from && Math.abs(from.x - target.x) + Math.abs(from.y - target.y) + Math.abs(from.w - target.w) + Math.abs(from.h - target.h) > 2;
    if (moved && !reduced()) {
      for (const a of ring.getAnimations()) a.cancel();
      const d = Math.hypot(target.x - from.x, target.y - from.y);
      const dur = clamp(300 + d / 2, 300, 700);
      ring.animate(
        [
          { left: from.x + 'px', top: from.y + 'px', width: from.w + 'px', height: from.h + 'px' },
          { left: target.x + 'px', top: target.y + 'px', width: target.w + 'px', height: target.h + 'px' },
        ],
        { duration: dur, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' },
      );
    }
    ring._at = target;
  }

  function runLine(line) {
    const c = parse(line);
    if (!c) return;
    term.hist.push(c.line);
    term.hi = term.hist.length;
    if (!c.quiet) echo(c);
    c.run();
  }

  views.push({
    id: 'agents',
    el: $('[data-mount="agents"]'),
    mount() {
      $('#term-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = tin.value;
        tin.value = '';
        runLine(v);
      });
      tin.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp' && term.hist.length) {
          e.preventDefault();
          term.hi = Math.max(0, term.hi - 1);
          tin.value = term.hist[term.hi];
        } else if (e.key === 'ArrowDown' && term.hist.length) {
          e.preventDefault();
          term.hi = Math.min(term.hist.length, term.hi + 1);
          tin.value = term.hist[term.hi] || '';
        } else if (e.key === 'Tab' && tin.value) {
          const m = EXAMPLES.find(([c]) => c.startsWith(tin.value.replace(/^turboslide\s+/, '')));
          if (m) {
            e.preventDefault();
            tin.value = m[0];
          }
        }
      });
      $('#term-ex').replaceChildren(
        ...EXAMPLES.map(([c, what]) => h('button', { type: 'button', onclick: () => runLine(c) }, h('span', null, '$ turboslide ' + c), h('span', null, what))),
      );
      $$('.term-head [data-tr]').forEach((b) =>
        b.addEventListener('click', () => {
          term.tr = b.dataset.tr;
          $$('.term-head [data-tr]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
          print(`# the next commands go through ${term.tr === 'cli' ? 'the CLI' : term.tr === 'mcp' ? 'MCP, as tools/call requests' : 'HTTP, as POST requests'}`, 'dim');
        }),
      );
      print('# The deck on this page answers these commands. Type help to list them.', 'dim');
      W.addEventListener('resize', () => raf(placeRing));
    },
    update: renderAgent,
  });

  // -------------------------------------------------------------------------------------------
  // Instrument 5: version history

  const ver = { idx: null, follow: true, play: 0 };
  const range = $('#ver-range');

  function authorChip(a) {
    if (a.kind === 'you') return h('span', { class: 'who you', title: 'You' }, 'You');
    if (a.kind === 'agent') {
      const c = h('span', { class: 'who', title: a.name + ', an agent' });
      c.append(icon('i-command-line'));
      return c;
    }
    return h('span', { class: 'who', title: a.name }, a.initials);
  }

  const authorLine = (a) => (a.kind === 'agent' ? `${a.name}, an agent${a.via ? ', ' + (a.via.startsWith('accepted') ? a.via : 'through ' + (a.via === 'CLI' ? 'the CLI' : a.via)) : ''}` : a.name);

  function renderVersions() {
    const vs = store.versions;
    const last = vs.length - 1;
    if (ver.follow || ver.idx == null || ver.idx > last) ver.idx = last;
    range.max = String(last);
    range.value = String(ver.idx);
    const v = vs[ver.idx];
    const s = v.deck.slides.find((x) => x.id === v.slideId) || v.deck.slides[0];
    const host = $('#ver-sl');
    host._p = 1;
    renderSlide(host, s, v.deck, { n: v.deck.slides.indexOf(s) + 1 });
    const cap = $('#ver-cap');
    cap.replaceChildren(`Slide ${v.deck.slides.indexOf(s) + 1} at ${timeOf(v.at)}, by ${authorLine(v.author)}.`);
    if (ver.flash) {
      cap.append(' ' + ver.flash, h('button', { type: 'button', class: 'undo-link', onclick: () => ((ver.flash = null), (ver.follow = true), doUndo(null)) }, 'Undo'));
    }
    $('#ver-restore').disabled = ver.idx === last;
    range.setAttribute('aria-valuetext', `${v.label}, ${timeOf(v.at)}, ${authorLine(v.author)}`);
    const ticks = $('#ver-ticks');
    ticks.replaceChildren(...vs.map((x, i) => h('i', { class: x.mine ? 'you' : '', style: { left: (last ? (i / last) * 100 : 0) + '%' } })));
    // the ticks and the Play line sit under the slider's own track, the thumb's half width in
    const prog = $('#ver-prog').parentElement;
    for (const el of [ticks, prog]) {
      el.style.marginLeft = range.offsetLeft + 6 + 'px';
      el.style.width = Math.max(0, range.offsetWidth - 12) + 'px';
    }
    const list = $('#vlist');
    const fresh = new Set(list._seen || []);
    list.replaceChildren(
      ...vs
        .map((x, i) => {
          const b = h(
            'button',
            { type: 'button', 'aria-current': String(i === ver.idx), class: fresh.size && !fresh.has(x) ? 'new' : '' },
            authorChip(x.author),
            h('span', { class: 'what' }, h('b', null, x.label), h('span', null, authorLine(x.author) + (x.detail ? '. ' + x.detail : ''))),
            h('span', { class: 'when' }, i === last ? 'Current' : timeOf(x.at)),
          );
          b.addEventListener('click', () => {
            stopPlay();
            ver.idx = i;
            ver.follow = i === last;
            renderVersions();
          });
          return b;
        })
        .reverse(),
    );
    list._seen = vs.slice();
  }

  function stopPlay() {
    if (!ver.play) return;
    clearInterval(ver.play);
    ver.play = 0;
    $('#ver-prog').style.width = '0';
    $('#ver-play').replaceChildren(icon('i-play'), 'Play');
  }

  views.push({
    id: 'versions',
    el: $('[data-mount="versions"]'),
    mount() {
      range.addEventListener('input', () => {
        stopPlay();
        ver.flash = null;
        ver.idx = +range.value;
        ver.follow = ver.idx === store.versions.length - 1;
        renderVersions();
      });
      $('#ver-restore').addEventListener('click', () => {
        const v = store.versions[ver.idx];
        stopPlay();
        ver.follow = true;
        store.commit(`Restored the ${timeOf(v.at)} version`, YOU, () => clone(v.deck), { detail: v.label, slideId: v.slideId });
        ver.flash = `Restored the ${timeOf(v.at)} version.`;
        followInk();
      });
      $('#ver-play').addEventListener('click', () => {
        if (ver.play) return stopPlay();
        const last = store.versions.length - 1;
        ver.idx = 0;
        ver.follow = false;
        renderVersions();
        $('#ver-play').replaceChildren(icon('i-pause-circle'), 'Stop');
        const step = 900;
        const prog = $('#ver-prog');
        ver.play = setInterval(() => {
          ver.idx += 1;
          prog.style.width = (ver.idx / last) * 100 + '%';
          if (ver.idx >= last) {
            ver.follow = true;
            renderVersions();
            stopPlay();
            return;
          }
          renderVersions();
        }, step);
      });
    },
    update: renderVersions,
  });

  // -------------------------------------------------------------------------------------------
  // Mounting: the hero now; each instrument when its band is within 800 px of the viewport

  function mountNow(id) {
    const v = views.find((x) => x.id === id);
    if (!v || v.mounted) return;
    v.mounted = true;
    const t = performance.now();
    if (v.mount) v.mount();
    v.update();
    performance.measure('ts:mount:' + id, { start: t, end: performance.now() });
  }

  const mountIO = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const v = views.find((x) => x.el === e.target);
        if (v) mountNow(v.id);
        mountIO.unobserve(e.target);
      }
    },
    { rootMargin: '800px 0px' },
  );
  for (const v of views) if (v.el && !v.mounted) mountIO.observe(v.el);

  store.on((evs) => {
    const skip = new Set(evs.filter((e) => e.kind === 'preview' && e.source).map((e) => e.source));
    const editing = [hero, miniEd].filter(Boolean).filter((ed) => ed.editing).map((ed) => ed.name);
    for (const v of views) {
      if (!v.mounted) continue;
      if ((skip.has(v.id) && evs.every((e) => e.kind === 'preview')) || editing.includes(v.id)) continue;
      v.update(evs);
    }
  });

  // -------------------------------------------------------------------------------------------
  // Bands enter once: the seam draws out of its cross, the heading rises through its clip, the
  // rows and the instrument rise 16 px in reading order. Armed only below the fold and only when
  // motion is allowed, so the markup is the final frame for everyone else.

  const bands = $$('[data-band]');
  const bandIO = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const band = e.target;
        bandIO.unobserve(band);
        band.classList.add('in');
        const seam = band.previousElementSibling;
        if (seam && seam.classList.contains('armed')) seam.classList.add('in');
        const mountEl = $('[data-mount]', band);
        const v = mountEl && views.find((x) => x.el === mountEl);
        if (v && v.enter) setTimeout(() => v.enter(), reduced() ? 0 : 1100);
        if (band.id === 'license') sting();
      }
    },
    { threshold: 0.2 },
  );

  function armBands() {
    const vh = W.innerHeight;
    for (const band of bands) {
      const top = band.getBoundingClientRect().top;
      if (!reduced() && top > vh * 0.9) {
        band.classList.add('armed');
        const seam = band.previousElementSibling;
        if (seam && seam.classList.contains('seam')) seam.classList.add('armed');
      }
      bandIO.observe(band);
    }
  }

  function sting() {
    const paths = $$('#sting path');
    if (reduced() || !$('#license').classList.contains('armed')) return;
    paths.forEach((p, i) =>
      p.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 600, delay: 300 + i * 70, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' }),
    );
  }

  // -------------------------------------------------------------------------------------------
  // Start

  $$('[data-theme-option]').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeOption)));
  W.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    let stored = null;
    try {
      stored = localStorage.getItem('gt-theme');
    } catch (err) {
      stored = null;
    }
    if (!stored) setTheme(e.matches ? 'dark' : 'light');
  });
  RM.addEventListener('change', () => {
    heroHost._p = 1;
    repaintFields(true);
  });

  // the colour roles register with transitions held off for two frames, so nothing mixes at load
  D.documentElement.classList.add('no-tx');
  raf(() => raf(() => D.documentElement.classList.remove('no-tx')));
  loadTone('earth');
  loadTone('lighthouse');
  hero.render();
  performance.measure('ts:hero', 'ts:start');
  syncKitButtons();
  syncUndoButtons();
  openOnPlate();
  armBands();
  D.documentElement.setAttribute('data-ready', '');

  const startDevelop = () => {
    const go2 = () => loadTone('earth').then(develop);
    if (W.requestIdleCallback) W.requestIdleCallback(go2, { timeout: 1500 });
    else setTimeout(go2, 200);
  };
  if (D.readyState === 'complete') startDevelop();
  else W.addEventListener('load', startDevelop, { once: true });

  // a hook for the screenshot harness: mount every instrument at once
  W.__playground = {
    mountAll: () => views.forEach((v) => mountNow(v.id)),
    develop: (p) => {
      heroHost._p = p;
      paintField(heroHost, true);
    },
    paintAll: () => repaintFields(true),
    revealAll: () => {
      bands.forEach((b) => b.classList.add('in'));
      $$('.seam.armed').forEach((s) => s.classList.add('in'));
    },
    store,
    hero,
    miniEd: () => miniEd,
    runLine,
    ACTS,
    mini,
    show,
    setCut,
    startShow,
    go,
    ver: () => ver,
    renderVersions,
    openMenu,
    chooseKit,
  };
})();
