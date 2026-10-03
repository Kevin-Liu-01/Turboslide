/* Direction A, quiet object: the behaviour of the /home prototype.

   One deck on one page. The hero and mood slides are edited as in the editor (select, move,
   resize, rotate, type, Undo); the filmstrip's slides are tailored for a customer and picked up
   and moved; an agent writes a slide through three commands; the visitor presents the page's own
   slides with their changes; Version history names the author of every change. The motion is the
   motion table at the head of a.css (M1 to M24); prefers-reduced-motion: reduce gets every end
   state at once. No library, no network. */
(function () {
  'use strict';

  const d = document;
  const html = d.documentElement;
  const q = (s, r) => (r || d).querySelector(s);
  const qa = (s, r) => Array.from((r || d).querySelectorAll(s));

  /* Counts from packages/theme/brand/facts.json (written 2026-09-29); the product reads them through
     HomeFacts and never types a digit of the tree into the copy. */
  const FACTS = { actions: 193, mcp: 169, http: 177, layouts: 22, shapes: 135, materials: 17, mismatch: 0.003 };

  const EASE = {
    arrive: 'cubic-bezier(0.16, 1, 0.3, 1)',
    soft: 'cubic-bezier(0.25, 1, 0.5, 1)',
    move: 'cubic-bezier(0.65, 0, 0.35, 1)',
  };

  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
  let reduce = reduceMQ.matches;
  reduceMQ.addEventListener('change', () => {
    reduce = reduceMQ.matches;
    if (reduce) {
      d.getAnimations().forEach((a) => a.finish());
      finishIntro();
      Dither.developAll();
    }
  });

  const bus = new EventTarget();
  const emit = (name) => bus.dispatchEvent(new Event(name));
  const on = (name, fn) => bus.addEventListener(name, fn);
  /* ?slow=10 runs the page's own timers ten times slower, for the frame strips (the capture slows the
     CSS and Web Animations by the same factor through the DevTools protocol); 1 everywhere else */
  const K = Math.max(1, Number(new URLSearchParams(location.search).get('slow')) || 1);
  const later = (ms, fn) => setTimeout(fn, ms * K);

  qa('[data-fact]').forEach((el) => {
    const k = el.dataset.fact;
    if (k in FACTS) el.textContent = String(FACTS[k]);
  });

  /* ---------------- appearance ---------------- */
  const darkMQ = matchMedia('(prefers-color-scheme: dark)');
  const themeNow = () => html.getAttribute('data-theme') || (darkMQ.matches ? 'dark' : 'light');
  function paintThemeButtons() {
    const t = themeNow();
    qa('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === t)));
  }
  qa('[data-theme-set]').forEach((b) =>
    b.addEventListener('click', () => {
      html.setAttribute('data-theme', b.dataset.themeSet);
      try { localStorage.setItem('gt-theme', b.dataset.themeSet); } catch (e) { /* storage off: the choice lasts this view */ }
      paintThemeButtons();
      emit('theme');
    })
  );
  darkMQ.addEventListener('change', () => { paintThemeButtons(); emit('theme'); });
  paintThemeButtons();

  /* ---------------- the deck: order, counters, notes ---------------- */
  const strip = q('[data-strip]');
  const agentsSheet = q('[data-deck="agents"]');
  function deckSheets() {
    const s = [q('[data-deck="hero"]'), q('[data-deck="mood"]')];
    qa('.card .sheet', strip).forEach((x) => s.push(x));
    if (agentsSheet.dataset.exists === 'true') s.push(agentsSheet);
    s.push(q('[data-deck="close"]'));
    return s;
  }
  const slideNumber = (sheet) => deckSheets().indexOf(sheet) + 1;
  function renumber() {
    const s = deckSheets();
    s.forEach((sheet, i) => {
      const c = q('.sheet-count', sheet);
      if (c) c.textContent = `${i + 1} / ${s.length}`;
    });
    const absent = q('[data-absent]');
    if (absent) absent.textContent = `The first command adds slide ${s.length}.`;
  }
  function notesOf(sheet) {
    const n = q('.notes', sheet);
    return (n ? n.textContent : sheet.dataset.notes || '').trim();
  }
  renumber();

  /* ---------------- Version history and Undo ---------------- */
  const historyEl = q('[data-history]');
  const clock = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  function logChange(who, what) {
    const empty = q('.history-empty', historyEl);
    if (empty) empty.remove();
    const li = d.createElement('li');
    const icon = who === 'You' ? 'i-user-circle' : 'i-command-line';
    li.innerHTML = `<svg class="ic" aria-hidden="true"><use href="#${icon}"/></svg><span class="who"></span><span class="what"></span><span class="when"></span>`;
    q('.who', li).textContent = who === 'You' ? 'You' : 'Agent';
    q('.what', li).textContent = what;
    q('.when', li).textContent = clock();
    historyEl.prepend(li);
    qa('li', historyEl).slice(6).forEach((x) => x.remove());
    if (!reduce) li.animate([{ transform: 'translateY(-8px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 200, easing: EASE.arrive });
  }

  const stacks = { hero: [], canvas: [], tailor: [] };
  let lastBand = 'hero';
  function pushUndo(band, entry) {
    stacks[band].push(entry);
    lastBand = band;
    refreshUndo(band);
  }
  function undo(band) {
    const e = stacks[band] && stacks[band].pop();
    if (e) e.undo();
    refreshUndo(band);
  }
  function refreshUndo(band) {
    qa(`[data-undo="${band}"]`).forEach((b) => { b.disabled = stacks[band].length === 0; });
    if (band === 'canvas') q('[data-layout-state]').textContent = stacks.canvas.length ? 'Canvas' : 'Mood';
  }
  qa('[data-undo]').forEach((b) => b.addEventListener('click', () => undo(b.dataset.undo)));
  const isTyping = (t) => !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  d.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
      if (isTyping(e.target)) return;
      e.preventDefault();
      undo(lastBand);
    }
  });

  /* ---------------- the editor's objects: select, move, resize, rotate, type ---------------- */
  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const DIRS = { nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0] };
  const SNAP_X = [137, 800, 1463];
  const SNAP_Y = [129, 450, 771];
  const editors = [];

  class SheetEditor {
    constructor(sheet, band) {
      this.sheet = sheet;
      this.band = band;
      this.stage = sheet.closest('.stage');
      this.objs = qa('.obj', sheet);
      this.cur = null;
      this.editing = null;
      this.drag = null;
      this.nudge = null;

      this.layer = d.createElement('div');
      this.layer.className = 'sel-layer';
      this.sel = d.createElement('div');
      this.sel.className = 'sel';
      this.sel.hidden = true;
      this.sel.innerHTML =
        '<span class="sel-ring"></span>' +
        HANDLES.map((h) => `<span class="sel-h" data-h="${h}"></span>`).join('') +
        '<span class="sel-stem"></span><span class="sel-knob" data-rot></span><span class="sel-chip"></span>';
      this.layer.appendChild(this.sel);
      this.stage.appendChild(this.layer);
      this.chip = q('.sel-chip', this.sel);
      this.gv = d.createElement('i');
      this.gv.className = 'guide guide-v';
      this.gh = d.createElement('i');
      this.gh.className = 'guide guide-h';
      sheet.append(this.gv, this.gh);

      sheet.addEventListener('pointerdown', (e) => this.down(e));
      sheet.addEventListener('pointermove', (e) => this.move(e));
      sheet.addEventListener('pointerup', (e) => this.up(e));
      sheet.addEventListener('pointercancel', () => this.cancel());
      this.sel.addEventListener('pointerdown', (e) => this.handleDown(e));
      this.sel.addEventListener('pointermove', (e) => this.handleMove(e));
      this.sel.addEventListener('pointerup', (e) => this.handleUp(e));
      this.sel.addEventListener('pointercancel', () => this.cancel());
      this.objs.forEach((o) => {
        o.addEventListener('focus', () => { if (this.cur !== o) this.select(o); });
        o.addEventListener('keydown', (e) => this.key(e, o));
        const t = q('[data-text]', o);
        if (t) {
          t.addEventListener('input', () => this.place());
          t.addEventListener('blur', () => { if (this.editing === o) this.endEdit(); });
        }
      });
      new ResizeObserver(() => this.place()).observe(sheet);
    }

    scale() { return this.sheet.clientWidth / 1600; }
    hasLayout() { return !!q('.sl', this.sheet); }
    isPinned() { return !this.hasLayout() || this.sheet.classList.contains('is-pinned'); }
    /* the first move, resize or turn: every object keeps its place and becomes a free object */
    pin() {
      if (this.isPinned()) return false;
      const sb = this.sheet.getBoundingClientRect();
      const s = (sb.width - 2) / 1600;
      const boxes = this.objs.map((o) => [o, o.getBoundingClientRect()]);
      boxes.forEach(([o, r]) => {
        this.set(o, { x: (r.left - sb.left - 1) / s, y: (r.top - sb.top - 1) / s, w: r.width / s, h: 0, r: 0 });
      });
      this.sheet.classList.add('is-pinned');
      return true;
    }
    unpin() {
      this.sheet.classList.remove('is-pinned');
      this.objs.forEach((o) => ['--x', '--y', '--w', '--h', '--r'].forEach((k) => o.style.removeProperty(k)));
      this.place();
    }
    num(o, k) {
      const v = o.style.getPropertyValue(k) || getComputedStyle(o).getPropertyValue(k);
      return parseFloat(v) || 0;
    }
    get(o) { return { x: this.num(o, '--x'), y: this.num(o, '--y'), w: this.num(o, '--w'), h: this.num(o, '--h'), r: this.num(o, '--r') }; }
    set(o, s) {
      const r2 = (n) => String(Math.round(n * 100) / 100);
      o.style.setProperty('--x', r2(s.x));
      o.style.setProperty('--y', r2(s.y));
      o.style.setProperty('--w', r2(s.w));
      if (s.h) o.style.setProperty('--h', r2(s.h));
      o.style.setProperty('--r', r2(s.r || 0));
    }
    heightU(o) { return o.offsetHeight / this.scale(); }
    unitsAt(e) {
      const b = this.sheet.getBoundingClientRect();
      const s = (b.width - 2) / 1600;
      return { x: (e.clientX - b.left - 1) / s, y: (e.clientY - b.top - 1) / s };
    }

    select(o) {
      editors.forEach((ed) => { if (ed !== this) ed.deselect(); });
      if (this.cur && this.cur !== o) {
        if (this.editing) this.endEdit();
        this.cur.classList.remove('is-selected');
      }
      this.cur = o;
      o.classList.add('is-selected');
      this.chip.textContent = o.dataset.role;
      this.sel.hidden = false;
      this.place();
    }
    deselect() {
      if (this.editing) this.endEdit();
      if (this.cur) this.cur.classList.remove('is-selected');
      this.cur = null;
      this.sel.hidden = true;
      this.guides(null, null);
    }
    place() {
      const o = this.cur;
      if (!o || this.sel.hidden) return;
      const st = this.sel.style;
      if (!this.isPinned()) {
        const sb = this.sheet.getBoundingClientRect();
        const ob = o.getBoundingClientRect();
        st.left = `${ob.left - sb.left}px`;
        st.top = `${ob.top - sb.top}px`;
        st.width = `${ob.width}px`;
        st.height = `${ob.height}px`;
        st.transform = 'none';
        return;
      }
      st.left = `${o.offsetLeft + 1}px`;
      st.top = `${o.offsetTop + 1}px`;
      st.width = `${o.offsetWidth}px`;
      st.height = `${o.offsetHeight}px`;
      st.transform = `rotate(${this.num(o, '--r')}deg)`;
    }
    guides(x, y) {
      const s = this.scale();
      this.gv.classList.toggle('is-on', x != null);
      this.gh.classList.toggle('is-on', y != null);
      if (x != null) this.gv.style.left = `${x * s}px`;
      if (y != null) this.gh.style.top = `${y * s}px`;
    }

    down(e) {
      if (e.button !== 0) return;
      const o = e.target.closest('.obj');
      if (!o || !this.sheet.contains(o)) {
        this.deselect();
        return;
      }
      if (this.editing === o) return; // the browser places the caret
      finishIntroIfHero(this.sheet);
      const was = this.cur === o;
      this.select(o);
      o.focus({ preventScroll: true });
      if (e.pointerType !== 'mouse' && !was) return; // a first touch selects; the page keeps its scroll
      e.preventDefault();
      this.drag = { mode: 'move', o, p0: this.unitsAt(e), s0: this.get(o), moved: false, was, id: e.pointerId, cx: e.clientX, cy: e.clientY };
      try { this.sheet.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
    }
    move(e) {
      const g = this.drag;
      if (!g || g.mode !== 'move' || e.pointerId !== g.id) return;
      if (!g.moved && Math.hypot(e.clientX - g.cx, e.clientY - g.cy) < 3) return;
      if (!g.moved && this.pin()) { g.pinned = true; g.s0 = this.get(g.o); }
      g.moved = true;
      const p = this.unitsAt(e);
      const s = { ...g.s0, x: g.s0.x + (p.x - g.p0.x), y: g.s0.y + (p.y - g.p0.y) };
      const H = this.heightU(g.o);
      const tol = 6 / this.scale();
      let gx = null;
      let gy = null;
      if (!e.altKey) {
        const xs = s.r ? [[s.x + s.w / 2, s.w / 2]] : [[s.x, 0], [s.x + s.w / 2, s.w / 2], [s.x + s.w, s.w]];
        let best = tol;
        xs.forEach(([v, off]) => SNAP_X.forEach((t) => { if (Math.abs(v - t) < best) { best = Math.abs(v - t); gx = t; s.x = t - off; } }));
        const ys = s.r ? [[s.y + H / 2, H / 2]] : [[s.y, 0], [s.y + H / 2, H / 2], [s.y + H, H]];
        best = tol;
        ys.forEach(([v, off]) => SNAP_Y.forEach((t) => { if (Math.abs(v - t) < best) { best = Math.abs(v - t); gy = t; s.y = t - off; } }));
      }
      this.set(g.o, s);
      this.guides(gx, gy);
      this.place();
    }
    up(e) {
      const g = this.drag;
      if (!g || g.mode !== 'move' || e.pointerId !== g.id) return;
      this.drag = null;
      this.guides(null, null);
      if (g.moved) this.commit(g.o, g.s0, 'Moved', g.pinned);
      else if (g.was) this.startEdit(g.o, e.clientX, e.clientY);
    }
    cancel() {
      if (this.drag && this.drag.moved) this.set(this.drag.o, this.drag.s0);
      this.drag = null;
      this.guides(null, null);
      this.place();
    }

    handleDown(e) {
      const o = this.cur;
      if (!o || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const h = e.target.dataset.h;
      const rot = e.target.hasAttribute('data-rot');
      if (!h && !rot) return;
      const pinned = this.pin();
      const s0 = this.get(o);
      const H0 = this.heightU(o);
      this.drag = { mode: rot ? 'rotate' : 'resize', h, o, s0, H0, p0: this.unitsAt(e), id: e.pointerId, moved: false, pinned };
      e.target.setPointerCapture(e.pointerId);
    }
    handleMove(e) {
      const g = this.drag;
      if (!g || e.pointerId !== g.id || g.mode === 'move') return;
      g.moved = true;
      const o = g.o;
      const s0 = g.s0;
      const p = this.unitsAt(e);
      const rad = (s0.r * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      if (g.mode === 'rotate') {
        const cx = s0.x + s0.w / 2;
        const cy = s0.y + g.H0 / 2;
        let a = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
        a = e.shiftKey ? Math.round(a / 15) * 15 : Math.round(a);
        if (a > 180) a -= 360;
        if (a <= -180) a += 360;
        this.set(o, { ...s0, r: a });
        this.chip.textContent = `${a}°`;
        this.place();
        return;
      }
      const [hx, hy] = DIRS[g.h];
      const dx = p.x - g.p0.x;
      const dy = p.y - g.p0.y;
      const lx = dx * cos + dy * sin; // the pointer's travel in the object's own axes
      const ly = -dx * sin + dy * cos;
      const isShape = !q('[data-text]', o);
      const w = hx ? Math.max(80, s0.w + hx * lx) : s0.w;
      let h = s0.h;
      if (hy) h = Math.max(isShape ? 40 : 0, (isShape ? s0.h : g.H0) + hy * ly);
      this.set(o, { ...s0, w, h: hy ? h : s0.h });
      const H1 = this.heightU(o);
      // keep the opposite side where it was, in the slide's coordinates
      const ax = (-hx * s0.w) / 2;
      const ay = (-hy * g.H0) / 2;
      const c0x = s0.x + s0.w / 2;
      const c0y = s0.y + g.H0 / 2;
      const Ax = c0x + ax * cos - ay * sin;
      const Ay = c0y + ax * sin + ay * cos;
      const bx = (-hx * w) / 2;
      const by = (-hy * H1) / 2;
      const c1x = Ax - (bx * cos - by * sin);
      const c1y = Ay - (bx * sin + by * cos);
      this.set(o, { ...s0, w, h: hy ? h : s0.h, x: c1x - w / 2, y: c1y - H1 / 2 });
      this.place();
    }
    handleUp(e) {
      const g = this.drag;
      if (!g || e.pointerId !== g.id || g.mode === 'move') return;
      this.drag = null;
      this.chip.textContent = g.o.dataset.role;
      if (g.moved) this.commit(g.o, g.s0, g.mode === 'rotate' ? 'Rotated' : 'Resized', g.pinned);
      else if (g.pinned) this.unpin();
    }

    key(e, o) {
      if (this.editing === o) {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.endEdit();
          o.focus({ preventScroll: true });
        }
        return;
      }
      finishIntroIfHero(this.sheet);
      const s = this.get(o);
      const step = e.shiftKey ? 40 : 4;
      let changed = null;
      if (e.key === 'Enter' && q('[data-text]', o)) {
        e.preventDefault();
        this.startEdit(o);
        return;
      }
      if (e.key === 'Escape') {
        this.deselect();
        o.blur();
        return;
      }
      if (e.key === 'ArrowLeft') changed = { ...s, x: s.x - step };
      if (e.key === 'ArrowRight') changed = { ...s, x: s.x + step };
      if (e.key === 'ArrowUp') changed = { ...s, y: s.y - step };
      if (e.key === 'ArrowDown') changed = { ...s, y: s.y + step };
      if (e.key === '[') changed = { ...s, r: s.r - 15 };
      if (e.key === ']') changed = { ...s, r: s.r + 15 };
      if (!changed) return;
      e.preventDefault();
      const pinnedNow = this.pin();
      if (pinnedNow) {
        const p = this.get(o);
        changed = { ...p, x: p.x + (changed.x - s.x), y: p.y + (changed.y - s.y), r: p.r + (changed.r - s.r) };
      }
      // consecutive nudges within 700 ms are one change, as one undo step
      const now = performance.now();
      const merging = this.nudge && this.nudge.o === o && now - this.nudge.t < 700;
      const before = merging ? this.nudge.s0 : pinnedNow ? this.get(o) : s;
      this.set(o, changed);
      this.place();
      if (merging) {
        this.nudge.t = now;
        return;
      }
      this.nudge = { o, s0: before, t: now };
      this.commit(o, before, e.key === '[' || e.key === ']' ? 'Rotated' : 'Moved', pinnedNow);
    }

    commit(o, before, verb, pinned) {
      const after = this.get(o);
      const sheet = this.sheet;
      const name = o.dataset.name;
      const band = this.band;
      pushUndo(band, { undo: () => { const ms = this.settle(o, before, after); if (pinned) later(ms + 30, () => this.unpin()); } });
      const n = slideNumber(sheet);
      logChange('You', verb === 'Rotated' ? `Rotated ${name} on slide ${n} to ${Math.round(after.r)}°` : `${verb} ${name} on slide ${n}`);
      emit('deck');
    }
    settle(o, to, from) {
      const s = this.scale();
      const dist = Math.hypot((to.x - from.x) * s, (to.y - from.y) * s);
      const ms = reduce ? 0 : Math.min(700, 300 + dist / 2);
      if (ms) {
        o.style.transition = `left ${ms}ms ${EASE.move}, top ${ms}ms ${EASE.move}, width ${ms}ms ${EASE.move}, min-height ${ms}ms ${EASE.move}, transform ${ms}ms ${EASE.move}`;
        later(ms + 20, () => { o.style.transition = ''; this.place(); });
      }
      if (!to.h) o.style.removeProperty('--h');
      this.set(o, to);
      this.select(o);
      if (ms) {
        const t0 = performance.now();
        const tick = () => { this.place(); if (performance.now() - t0 < ms * K) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      }
      emit('deck');
      return ms;
    }

    startEdit(o, x, y) {
      const t = q('[data-text]', o);
      if (!t) return;
      finishIntroIfHero(this.sheet);
      this.editing = o;
      this.before = t.innerHTML;
      o.classList.add('is-editing');
      this.sel.classList.add('is-editing');
      try { t.contentEditable = 'plaintext-only'; } catch (err) { t.contentEditable = 'true'; }
      if (t.contentEditable !== 'plaintext-only') t.contentEditable = 'true';
      t.focus({ preventScroll: true });
      const sel = getSelection();
      let range = null;
      if (x != null && d.caretRangeFromPoint) range = d.caretRangeFromPoint(x, y);
      if (!range || !t.contains(range.startContainer)) {
        range = d.createRange();
        range.selectNodeContents(t);
        range.collapse(false);
      }
      sel.removeAllRanges();
      sel.addRange(range);
      this.place();
      /* Chromium can scroll the page far away while revealing a caret at the end of a hand broken line
         (End, then typing); the page holds still while a box is being typed into */
      this.holdY = scrollY;
      this.holdKey = () => { this.holdY = scrollY; this.holdT = performance.now(); };
      this.holdScroll = () => { if (this.editing && performance.now() - (this.holdT || 0) < 400 && Math.abs(scrollY - this.holdY) > 2) scrollTo(0, this.holdY); };
      t.addEventListener('keydown', this.holdKey);
      addEventListener('scroll', this.holdScroll);
    }
    endEdit() {
      const o = this.editing;
      if (!o) return;
      const t = q('[data-text]', o);
      this.editing = null;
      t.removeEventListener('keydown', this.holdKey);
      removeEventListener('scroll', this.holdScroll);
      t.contentEditable = 'false';
      t.removeAttribute('contenteditable');
      o.classList.remove('is-editing');
      this.sel.classList.remove('is-editing');
      const before = this.before;
      if (t.innerHTML !== before) {
        if (!t.textContent.trim()) t.innerHTML = before;
        else {
          pushUndo(this.band, { undo: () => { t.innerHTML = before; this.place(); emit('deck'); } });
          logChange('You', `Edited ${o.dataset.name} on slide ${slideNumber(this.sheet)}`);
          emit('deck');
        }
      }
      this.place();
    }
  }

  const heroEditor = new SheetEditor(q('[data-deck="hero"]'), 'hero');
  const moodEditor = new SheetEditor(q('[data-deck="mood"]'), 'canvas');
  editors.push(heroEditor, moodEditor);
  d.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.stage')) editors.forEach((ed) => ed.deselect());
  });
  addEventListener('resize', () => editors.forEach((ed) => ed.place()));

  /* ---------------- M1 to M4: the hero builds its slide once ---------------- */
  const leadP = q('#hero-lead');
  const VARIANTS = [
    "It has Google Slides' menus and shortcuts. No account is needed.",
    `Agents edit it through the same ${FACTS.actions} actions as the menus.`,
    'It presents from the browser and downloads PDF and PowerPoint files.',
  ];
  /* a different sentence on each return, in order; at random after two days away; the first when storage fails */
  function pickVariant() {
    try {
      const now = Date.now();
      const raw = localStorage.getItem('ts-a-visit');
      let i = 0;
      if (raw) {
        const v = JSON.parse(raw);
        i = now - v.t > 2 * 864e5 ? Math.floor(Math.random() * VARIANTS.length) : (v.i + 1) % VARIANTS.length;
      }
      localStorage.setItem('ts-a-visit', JSON.stringify({ i, t: now }));
      return VARIANTS[i];
    } catch (e) {
      return VARIANTS[0];
    }
  }
  let introTimers = [];
  let introText = VARIANTS[0];
  let introDone = !html.classList.contains('hero-intro');
  function finishIntro() {
    if (introDone) return;
    introDone = true;
    introTimers.forEach(clearTimeout);
    introTimers = [];
    leadP.textContent = introText;
    leadP.classList.remove('caret-on', 'caret-blink');
    html.classList.remove('hero-intro', 'hero-typing');
    // the hairlines are drawn: drop their finished animations so nothing is held on the page
    qa('.band-hero .sheet-frame .r').forEach((r) => r.getAnimations().forEach((a) => a.cancel()));
    heroEditor.place();
  }
  function finishIntroIfHero(sheet) {
    if (sheet && sheet.dataset.deck === 'hero') finishIntro();
  }
  function drawRails(sheet, delay) {
    const lines = ['.r-t', '.r-l', '.r-r', '.r-b'].map((s) => q(s, sheet));
    lines.forEach((ln, i) => {
      const axis = i === 0 || i === 3 ? 'scaleX(0)' : 'scaleY(0)';
      ln.animate([{ transform: axis }, { transform: 'none' }], { duration: 600, delay: (delay || 0) + i * 60, easing: EASE.arrive, fill: 'both' });
    });
  }
  function heroIntro() {
    if (introDone) return;
    introText = pickVariant();
    const typed = q('.typed', leadP);
    const rest = q('.rest', leadP);
    const caret = (state) => {
      leadP.classList.toggle('caret-blink', state === 'blink');
      leadP.classList.toggle('caret-on', state === 'on');
    };
    rest.textContent = introText;
    html.classList.add('hero-typing');
    const sheet = q('[data-deck="hero"]');
    drawRails(sheet, 0);
    // M2: the caret arrives and blinks once
    introTimers.push(later(300, () => caret('blink')));
    // M3: the sentence is typed at a person's rhythm (a fixed seed: every visit types the same way)
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let t = 900;
    for (let i = 0; i < introText.length; i++) {
      const ch = introText[i];
      const prev = introText[i - 1];
      t += 34 + Math.round(rand() * 26) + (ch === ' ' ? 30 : 0) + (prev === '.' ? 280 : 0);
      const at = i;
      introTimers.push(later(t, () => {
        caret('on');
        typed.textContent = introText.slice(0, at + 1);
        rest.textContent = introText.slice(at + 1);
      }));
    }
    // M4: the caret holds on the last letter for 400 ms and leaves; the whole sequence ends inside 5 s
    introTimers.push(later(t + 400, finishIntro));
  }
  q('.band-hero').addEventListener('keydown', finishIntro, true);

  /* ---------------- M5: the mood picture develops through the 8 by 8 Bayer screen ---------------- */
  const Dither = (() => {
    const B8 = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21].map((v) => (v + 0.5) / 64);
    const TW = 640;
    const TH = 360;
    let tone = null;
    let ready = null;
    const state = new Map(); // canvas -> p
    function load() {
      if (ready) return ready;
      ready = new Promise((res) => {
        const img = new Image();
        img.onload = () => {
          const c = d.createElement('canvas');
          c.width = TW;
          c.height = TH;
          const x = c.getContext('2d', { willReadFrequently: true });
          x.drawImage(img, 0, 0);
          const px = x.getImageData(0, 0, TW, TH).data;
          tone = new Float32Array(TW * TH);
          for (let i = 0; i < tone.length; i++) tone[i] = px[i * 4] / 255;
          res();
        };
        img.onerror = () => res();
        img.src = window.TS_TONE_LIGHTHOUSE || '';
      });
      return ready;
    }
    function rgb(name) {
      const v = getComputedStyle(html).getPropertyValue(name).trim();
      const m = v.match(/^#([0-9a-f]{6})$/i);
      if (!m) return [7, 7, 7];
      const n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function size(cv, cols, rows) {
      if (!cols) {
        const w = cv.clientWidth || 1022;
        // the brand's 2 px cell; a phone with a dense screen prints 1 css px cells (two or three device pixels each)
        const cell = innerWidth <= 720 && devicePixelRatio >= 2 ? 1 : 2;
        cols = Math.max(1, Math.round(w / cell));
        rows = Math.max(1, Math.round((cols * 9) / 16));
      }
      if (cv.width !== cols) cv.width = cols;
      if (cv.height !== rows) cv.height = rows;
    }
    /* p: the share of the picture's tone raised so far (0 to 1); a cell is ink when tone x p passes its Bayer threshold */
    function draw(cv, p) {
      if (!tone) return;
      size(cv);
      const cols = cv.width;
      const rows = cv.height;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(cols, rows);
      const out = img.data;
      const ink = colours.ink;
      const paper = colours.paper;
      for (let j = 0; j < rows; j++) {
        const ty = Math.min(TH - 1, Math.floor(((j + 0.5) / rows) * TH)) * TW;
        const bj = (j & 7) * 8;
        for (let i = 0; i < cols; i++) {
          const T = tone[ty + Math.min(TW - 1, Math.floor(((i + 0.5) / cols) * TW))];
          const v = T * p; // the same cells in both appearances; only ink and paper trade places (the deck's twins)
          const lit = v > B8[bj + (i & 7)];
          const c = lit ? ink : paper;
          const k = (j * cols + i) * 4;
          out[k] = c[0];
          out[k + 1] = c[1];
          out[k + 2] = c[2];
          out[k + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      state.set(cv, p);
    }
    const colours = { ink: [7, 7, 7], paper: [255, 255, 255] };
    const readColours = () => { colours.ink = rgb('--ink'); colours.paper = rgb('--paper'); };
    readColours();
    on('theme', readColours);
    const smooth = (t) => t * t * (3 - 2 * t);
    function develop(cv) {
      load().then(() => {
        if (reduce) { draw(cv, 1); return; }
        const t0 = performance.now();
        const dur = 2400 * K;
        const frame = () => {
          const t = Math.min(1, (performance.now() - t0) / dur);
          draw(cv, smooth(t));
          if (t < 1) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    }
    function redraw() { state.forEach((p, cv) => { if (cv.isConnected) draw(cv, p); else state.delete(cv); }); }
    function developAll() { load().then(() => state.forEach((p, cv) => draw(cv, 1))); }
    return { load, draw, develop, redraw, developAll, state, size };
  })();
  const moodCv = q('.mood-cv');
  Dither.load().then(() => Dither.draw(moodCv, 0));
  on('theme', () => Dither.redraw());
  let resizeT = 0;
  addEventListener('resize', () => { clearTimeout(resizeT); resizeT = later(150, () => Dither.redraw()); });

  /* ---------------- in view, once ---------------- */
  function onceInView(el, ratio, fn) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting && en.intersectionRatio >= ratio) {
          io.disconnect();
          fn();
        }
      });
    }, { threshold: [ratio] });
    io.observe(el);
  }
  onceInView(q('[data-deck="mood"]'), 0.35, () => Dither.develop(moodCv));

  /* ---------------- Tailor for a customer (the product's words: packages/chrome/src/panels/assist-strings.ts TAILOR) ---------------- */
  const TAILOR = {
    count: (places, slides) =>
      places === 0 ? 'Not found in the text' : `${places} place${places === 1 ? '' : 's'} on ${slides} slide${slides === 1 ? '' : 's'}`,
  };
  const form = q('.tailor');
  const input = q('#tailor-to');
  const fromEl = q('[data-from]');
  const countEl = q('[data-count]');
  const snack = q('[data-snack]');
  const snackText = q('[data-snack-text]');
  let customer = 'Northwind';
  const custSpans = () => deckSheets().flatMap((s) => qa('.cust', s));
  function countNow() {
    const spans = custSpans();
    return TAILOR.count(spans.length, new Set(spans.map((s) => s.closest('.sheet'))).size);
  }
  function refreshCount() {
    countEl.textContent = countNow();
    fromEl.textContent = customer;
  }
  function setNames(name, animate) {
    const spans = custSpans();
    let i = 0;
    spans.forEach((s) => {
      if (s.closest('.notes') || !animate || reduce) {
        s.textContent = name;
        if (animate && !s.closest('.notes')) {
          s.classList.add('is-lit');
          later(900, () => s.classList.remove('is-lit'));
        }
        return;
      }
      const at = i++ * 55;
      later(at, () => {
        s.textContent = name;
        s.classList.add('is-lit');
        later(900, () => s.classList.remove('is-lit'));
      });
    });
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const to = input.value.trim().replace(/\s+/g, ' ');
    if (!to) {
      countEl.textContent = 'Type a customer name first';
      input.focus();
      return;
    }
    if (to === customer) return;
    const before = customer;
    const said = countNow();
    setNames(to, true);
    customer = to;
    input.value = '';
    refreshCount();
    snackText.textContent = `Tailored for ${to}: ${said}`;
    snack.classList.add('is-on');
    pushUndo('tailor', {
      undo: () => {
        setNames(before, false);
        customer = before;
        refreshCount();
        snackText.textContent = `Undid Tailor for ${to}`;
        emit('deck');
      },
    });
    logChange('You', `Tailored for ${to}: ${said}`);
    emit('deck');
  });
  on('deck', refreshCount);

  /* ---------------- the filmstrip: pick a slide up and move it (M11, M12) ---------------- */
  const cards = () => qa('.card', strip);
  function cardTitle(card) { return card.getAttribute('aria-label'); }
  function flipCards(mutate, ms) {
    const list = cards();
    const before = new Map(list.map((c) => [c, c.getBoundingClientRect()]));
    mutate();
    list.forEach((c) => {
      const a = before.get(c);
      const b = c.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (!reduce && (dx || dy)) c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: ms, easing: EASE.arrive });
    });
  }
  function placeCard(card, index, record) {
    const list = cards();
    const from = list.indexOf(card);
    if (index < 0 || index >= list.length || index === from) return;
    flipCards(() => {
      const ref = list.filter((c) => c !== card)[index] || null;
      strip.insertBefore(card, ref);
    }, 200);
    renumber();
    if (record) {
      pushUndo('tailor', { undo: () => placeCard(card, from, false) });
      logChange('You', `Moved "${cardTitle(card)}" to slide ${slideNumber(q('.sheet', card))}`);
    }
    emit('deck');
  }
  let lift = null;
  strip.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('.card');
    if (!card || e.button !== 0) return;
    const rects = cards().map((c) => c.getBoundingClientRect());
    lift = { card, id: e.pointerId, x0: e.clientX, y0: e.clientY, rects, from: cards().indexOf(card), on: false, touch: e.pointerType === 'touch', timer: 0 };
    if (lift.touch) lift.timer = later(350, () => { if (lift && !lift.on) startLift(); });
    else e.preventDefault();
  });
  function startLift() {
    lift.on = true;
    lift.card.classList.add('is-lifted');
    lift.card.focus({ preventScroll: true });
    lift.hole = d.createElement('span');
    lift.hole.className = 'card-hole';
    try { strip.setPointerCapture(lift.id); } catch (err) { /* capture is optional */ }
  }
  strip.addEventListener('pointermove', (e) => {
    if (!lift || e.pointerId !== lift.id) return;
    const dx = e.clientX - lift.x0;
    const dy = e.clientY - lift.y0;
    if (!lift.on) {
      if (lift.touch) { if (Math.hypot(dx, dy) > 8) { clearTimeout(lift.timer); lift = null; } return; }
      if (Math.hypot(dx, dy) < 4) return;
      startLift();
    }
    lift.card.style.transform = `translate(${dx}px, ${dy}px)`;
    const r0 = lift.rects[lift.from];
    const cx = r0.left + r0.width / 2 + dx;
    const cy = r0.top + r0.height / 2 + dy;
    let to = lift.from;
    let best = Infinity;
    lift.rects.forEach((r, i) => {
      const dd = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
      if (dd < best) { best = dd; to = i; }
    });
    lift.to = to;
    cards().forEach((c, i) => {
      if (c === lift.card) return;
      let j = i;
      if (lift.from < to && i > lift.from && i <= to) j = i - 1;
      if (lift.from > to && i < lift.from && i >= to) j = i + 1;
      const a = lift.rects[i];
      const b = lift.rects[j];
      c.classList.add('is-shifting');
      c.style.transform = j === i ? '' : `translate(${b.left - a.left}px, ${b.top - a.top}px)`;
    });
  });
  strip.addEventListener('touchmove', (e) => { if (lift && lift.on) e.preventDefault(); }, { passive: false });
  function dropLift(e) {
    if (!lift || (e && e.pointerId !== lift.id)) return;
    clearTimeout(lift.timer);
    const g = lift;
    lift = null;
    if (!g.on) return;
    const to = g.to == null ? g.from : g.to;
    const shown = g.card.getBoundingClientRect();
    cards().forEach((c) => { c.classList.remove('is-shifting'); c.style.transform = ''; });
    if (to !== g.from) {
      const ref = cards().filter((c) => c !== g.card)[to] || null;
      strip.insertBefore(g.card, ref);
    }
    const home = g.card.getBoundingClientRect();
    g.card.classList.remove('is-lifted');
    if (!reduce) g.card.animate([{ transform: `translate(${shown.left - home.left}px, ${shown.top - home.top}px)` }, { transform: 'none' }], { duration: 240, easing: EASE.arrive });
    if (to !== g.from) {
      renumber();
      const card = g.card;
      const from = g.from;
      pushUndo('tailor', { undo: () => placeCard(card, from, false) });
      logChange('You', `Moved "${cardTitle(card)}" to slide ${slideNumber(q('.sheet', card))}`);
      emit('deck');
    }
  }
  strip.addEventListener('pointerup', dropLift);
  strip.addEventListener('pointercancel', (e) => {
    if (lift && lift.on) dropLift(e);
    else if (lift) { clearTimeout(lift.timer); lift = null; }
  });
  strip.addEventListener('keydown', (e) => {
    const card = e.target.closest('.card');
    if (!card || !(e.ctrlKey || e.metaKey)) return;
    const i = cards().indexOf(card);
    const k = e.key;
    let to = null;
    if (k === 'ArrowLeft' || k === 'ArrowUp') to = i - 1;
    if (k === 'ArrowRight' || k === 'ArrowDown') to = i + 1;
    if (to == null) return;
    e.preventDefault();
    placeCard(card, to, true);
    card.focus({ preventScroll: true });
  });

  /* ---------------- Agents: three commands write slide 6 (M13 to M15) ---------------- */
  const panel = q('[data-panel]');
  const runBtn = q('[data-run]');
  const stepEl = q('[data-step]');
  const absent = q('[data-absent]');
  const flag = q('[data-flag]');
  const slot = (name) => q(`[data-slot="${name}"]`, agentsSheet);
  const ROWS = [['Monday', 'The brand kit'], ['Wednesday', 'The first deck'], ['Friday', 'The first show']];
  const STEPS = [
    {
      cmd: () => ['$ pnpm exec turboslide slide new --layout rows \\', '    --after week-one --id agents \\', '    --author agent:demo --json'],
      out: () => ['{', '  "ok": true,', '  "action": "slide.new",', `  "slide": { "id": "agents", "n": ${3 + cards().length}, "layout": "rows" },`, '  "author": "agent:demo"', '}'],
      label: () => `Added slide ${3 + cards().length} with the Ruled rows layout`,
      apply: () => {
        agentsSheet.dataset.exists = 'true';
        absent.hidden = true;
        renumber();
        if (!reduce) drawRails(agentsSheet, 0);
      },
    },
    {
      cmd: () => ['$ pnpm exec turboslide slide patch agents \\', `    --set "/slots/left/0/text=Week one at ${customer}" \\`, '    --set "/slots/left/1/text=One deck, made and shown in five days." \\', '    --author agent:demo --json'],
      out: () => ['{', '  "ok": true,', '  "action": "slide.update",', '  "slide": "agents",', '  "author": "agent:demo"', '}'],
      label: () => 'Wrote the title and the text on slide ' + slideNumber(agentsSheet),
      apply: () => {
        const t = slot('title');
        t.innerHTML = 'Week one at <span class="cust"></span>';
        q('.cust', t).textContent = customer;
        slot('body').textContent = 'One deck, made and shown in five days.';
        land([t, slot('body')], t);
      },
    },
    {
      cmd: () => ['$ pnpm exec turboslide slide patch agents \\', ...ROWS.map(([k, v], i) => `    --set '/slots/right/0/items/${i}={"key":"${k}","value":"${v}"}' \\`), '    --author agent:demo --json'],
      out: () => ['{', '  "ok": true,', '  "action": "slide.update",', '  "slide": "agents",', '  "author": "agent:demo"', '}'],
      label: () => 'Filled the three rows on slide ' + slideNumber(agentsSheet),
      apply: () => {
        const rows = qa('[data-slot="rows"] > div', agentsSheet);
        rows.forEach((r, i) => { q('b', r).textContent = ROWS[i][0]; q('span', r).textContent = ROWS[i][1]; });
        land(rows, rows[0]);
      },
    },
  ];
  let step = 0;
  let running = false;
  function land(els, near) {
    if (!reduce) els.forEach((el) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' }));
    const sb = agentsSheet.getBoundingClientRect();
    const nb = near.getBoundingClientRect();
    flag.style.left = `${nb.left - sb.left}px`;
    flag.style.top = `${nb.top - sb.top - flag.offsetHeight - 4}px`;
    flag.classList.add('is-on');
    later(1800, () => flag.classList.remove('is-on'));
  }
  function writePanel(lines, cls) {
    return lines.map((t) => {
      const s = d.createElement('span');
      s.className = `ln ${cls}`;
      s.textContent = t;
      panel.appendChild(s);
      return s;
    });
  }
  function resetAgents() {
    agentsSheet.dataset.exists = 'false';
    absent.hidden = false;
    slot('title').textContent = '';
    slot('body').textContent = '';
    qa('[data-slot="rows"] > div', agentsSheet).forEach((r) => { q('b', r).textContent = ''; q('span', r).textContent = ''; });
    renumber();
    emit('deck');
  }
  function runStep() {
    if (running) return;
    if (step >= STEPS.length) {
      resetAgents();
      step = 0;
    }
    running = true;
    runBtn.disabled = true;
    const st = STEPS[step];
    panel.textContent = '';
    writePanel(st.cmd(), 'cmd');
    const out = writePanel(st.out(), 'dim');
    out.forEach((ln, i) => {
      if (reduce) return;
      ln.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, delay: 200 + i * 55, easing: 'ease-out', fill: 'backwards' });
    });
    const landAt = reduce ? 0 : 200 + out.length * 55 + 500;
    later(landAt, () => {
      st.apply();
      logChange('Agent', st.label());
      step += 1;
      stepEl.textContent = step < STEPS.length ? `Step ${step + 1} of ${STEPS.length}` : 'The slide is written';
      runBtn.textContent = step < STEPS.length ? 'Run' : 'Run Again';
      runBtn.disabled = false;
      running = false;
      emit('deck');
    });
  }
  runBtn.addEventListener('click', runStep);
  panel.textContent = '';
  writePanel(['$ pnpm exec turboslide --version'], 'cmd');
  writePanel([
    ' ███████████  Turboslide 2026.1001.3',
    ' ▀▀▀▀▀███▀▀▀  https://www.turboslide.com',
    `▄▄▄▄▄ ███     ${FACTS.actions} actions, effects backend: wasm`,
    '▄▄▄▄ ▄▄▄',
    '     ███',
    '███ ███',
  ], 'banner');

  /* ---------------- Present: the page's own slides, with the visitor's changes (M17 to M21) ---------------- */
  const presentBand = q('[data-present]');
  const currentWrap = q('[data-present-current]');
  const thumbsEl = q('[data-thumbs]');
  const showEl = q('[data-show]');
  const showStage = q('[data-show-stage]');
  const showCount = q('[data-show-count]');
  const showNotes = q('[data-show-notes]');
  const showTime = q('[data-show-time]');
  const goBtn = q('[data-present-go]');
  let cur = 0;
  let showing = false;
  let tick = 0;
  let presentVisible = false;

  function cloneSheet(sheet) {
    const c = sheet.cloneNode(true);
    c.removeAttribute('data-editable');
    c.setAttribute('aria-hidden', 'true');
    c.style.visibility = 'visible';
    qa('[id]', c).forEach((x) => x.removeAttribute('id'));
    qa('[tabindex]', c).forEach((x) => x.removeAttribute('tabindex'));
    qa('[aria-label]', c).forEach((x) => x.removeAttribute('aria-label'));
    qa('.guide, .flag', c).forEach((x) => x.remove());
    qa('.caret-on, .caret-blink', c).forEach((x) => x.classList.remove('caret-on', 'caret-blink'));
    qa('.obj', c).forEach((o) => o.classList.remove('is-selected', 'is-editing'));
    qa('.is-lit', c).forEach((x) => x.classList.remove('is-lit'));
    qa('[contenteditable]', c).forEach((x) => x.removeAttribute('contenteditable'));
    qa('h1', c).forEach((h) => {
      const p = d.createElement('p');
      p.className = h.className;
      p.innerHTML = h.innerHTML;
      h.replaceWith(p);
    });
    qa('.sheet-frame .r', c).forEach((r) => { r.style.transform = 'none'; });
    qa('.rest', c).forEach((r) => { r.style.color = 'inherit'; r.style.animation = 'none'; });
    const src = q('canvas', sheet);
    const dst = q('canvas', c);
    if (src && dst) {
      const w = src.width > 2 ? src.width : 512;
      const h = src.height > 2 ? src.height : 288;
      dst.width = w;
      dst.height = h;
      if ((Dither.state.get(src) || 0) >= 1) dst.getContext('2d').drawImage(src, 0, 0);
      else Dither.load().then(() => { Dither.draw(dst, 1); Dither.state.delete(dst); });
    }
    return c;
  }
  function buildPreview() {
    const slides = deckSheets();
    cur = Math.min(cur, slides.length - 1);
    currentWrap.textContent = '';
    currentWrap.appendChild(cloneSheet(slides[cur]));
    thumbsEl.textContent = '';
    thumbsEl.style.gridTemplateColumns = innerWidth <= 720 ? '' : `repeat(${slides.length}, 1fr)`;
    slides.forEach((s, i) => {
      const li = d.createElement('li');
      li.className = i === cur ? 'is-current' : '';
      li.appendChild(cloneSheet(s));
      const b = d.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', `Show slide ${i + 1} first`);
      b.addEventListener('click', () => { cur = i; buildPreview(); });
      li.appendChild(b);
      thumbsEl.appendChild(li);
    });
  }
  new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      presentVisible = en.intersectionRatio >= 0.5;
      if (en.isIntersecting && !showing) buildPreview();
    });
  }, { threshold: [0, 0.5] }).observe(presentBand);
  on('deck', () => { if (presentVisible && !showing) buildPreview(); });
  on('theme', () => { if (!showing) buildPreview(); else renderShowSlide(); });

  function fitStage() {
    const bar = 72;
    const cs = getComputedStyle(showEl);
    const availW = showEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = showEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - bar - (innerWidth <= 720 ? 40 : 0);
    const w = Math.max(200, Math.min(availW, (availH * 16) / 9));
    showStage.style.width = `${Math.floor(w)}px`;
  }
  function renderShowSlide() {
    const slides = deckSheets();
    showStage.textContent = '';
    showStage.appendChild(cloneSheet(slides[cur]));
    showCount.textContent = `${cur + 1} / ${slides.length}`;
    showNotes.textContent = notesOf(slides[cur]) ? `Notes: ${notesOf(slides[cur])}` : '';
  }
  function flip(el, fromRect, ms) {
    const to = el.getBoundingClientRect();
    const s = fromRect.width / to.width;
    const dx = fromRect.left - to.left;
    const dy = fromRect.top - to.top;
    return el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})`, transformOrigin: '0 0' }, { transform: 'none', transformOrigin: '0 0' }], { duration: ms, easing: EASE.move });
  }
  function openShow() {
    if (showing) return;
    showing = true;
    const from = currentWrap.getBoundingClientRect();
    showEl.hidden = false;
    fitStage();
    renderShowSlide();
    currentWrap.style.visibility = 'hidden';
    if (!reduce) flip(showStage, from, 500);
    requestAnimationFrame(() => showEl.classList.add('is-dark'));
    showEl.focus({ preventScroll: true });
    const t0 = Date.now();
    const paint = () => {
      const s = Math.floor((Date.now() - t0) / 1000);
      showTime.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    paint();
    tick = setInterval(paint, 1000);
  }
  function go(n) {
    const total = deckSheets().length;
    const next = Math.max(0, Math.min(total - 1, n));
    if (next === cur) return;
    cur = next;
    renderShowSlide(); // M19: a cut, as Slideshow pages
  }
  function exitShow() {
    if (!showing) return;
    clearInterval(tick);
    buildPreview();
    const to = currentWrap.getBoundingClientRect();
    showEl.classList.remove('is-dark');
    const done = () => {
      showing = false;
      showEl.hidden = true;
      showStage.textContent = '';
      currentWrap.style.visibility = '';
      goBtn.focus({ preventScroll: true });
    };
    if (reduce) { done(); return; }
    const from = showStage.getBoundingClientRect();
    const s = to.width / from.width;
    const a = showStage.animate([{ transform: 'none', transformOrigin: '0 0' }, { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${s})`, transformOrigin: '0 0' }], { duration: 400, easing: EASE.move, fill: 'forwards' });
    a.onfinish = () => { a.cancel(); done(); };
  }
  goBtn.addEventListener('click', openShow);
  showStage.addEventListener('click', () => go(cur + 1));
  q('[data-show-next]').addEventListener('click', () => go(cur + 1));
  q('[data-show-prev]').addEventListener('click', () => go(cur - 1));
  q('[data-show-exit]').addEventListener('click', exitShow);
  showEl.addEventListener('keydown', (e) => {
    const k = e.key;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k) && !e.target.closest('button')) { e.preventDefault(); go(cur + 1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); go(cur - 1); }
    else if (k === 'Home') { e.preventDefault(); go(0); }
    else if (k === 'End') { e.preventDefault(); go(deckSheets().length - 1); }
    else if (k === 'Escape') { e.preventDefault(); exitShow(); }
  });
  d.addEventListener('keydown', (e) => {
    if (showing || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
    if ((e.key === 's' || e.key === 'S') && (presentVisible || presentBand.contains(d.activeElement))) {
      e.preventDefault();
      openShow();
    }
  });
  addEventListener('resize', () => { if (showing) fitStage(); });

  /* ---------------- M22: the closing slide's mark arrives once ---------------- */
  const markPaths = qa('[data-mark] path');
  const closeSheet = q('[data-deck="close"]');
  if (!reduce) {
    const r = closeSheet.getBoundingClientRect();
    if (r.top > innerHeight) {
      markPaths.forEach((p) => { p.style.opacity = '0'; });
      onceInView(closeSheet, 0.35, () => {
        markPaths
          .map((p) => [p, p.getBBox().x])
          .sort((a, b) => a[1] - b[1])
          .forEach(([p], i) => {
            p.style.opacity = '';
            if (reduce) return;
            p.animate([{ transform: 'translateX(-48px)' }, { transform: 'none' }], { duration: 600, delay: i * 70, easing: EASE.arrive, fill: 'backwards' });
            p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, delay: i * 70, easing: 'ease-out', fill: 'backwards' });
          });
      });
    }
  }

  /* ---------------- start ---------------- */
  refreshCount();
  const start = () => {
    heroEditor.place();
    if (introDone || new URLSearchParams(location.search).has('hold')) return; // ?hold: the capture starts it
    requestAnimationFrame(() => requestAnimationFrame(heroIntro));
  };
  const fontsReady = d.fonts && d.fonts.ready ? d.fonts.ready : Promise.resolve();
  if (d.readyState === 'complete') fontsReady.then(start);
  else addEventListener('load', () => fontsReady.then(start));

  // a hook for the frame strips: the prototype's state, read by the capture scripts
  window.__dirA = { heroIntro, finishIntro, heroEditor, moodEditor, Dither, openShow, exitShow, go, runStep, deckSheets };
})();
