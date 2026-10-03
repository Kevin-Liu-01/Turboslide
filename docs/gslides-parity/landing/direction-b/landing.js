/* Turboslide /home, direction B (demonstration). One deferred script, no library, no network.
   Parts: the facts, the appearance, the motion switch, one shared frame clock, the loop scheduler
   (a loop plays only while half its figure is visible and the tab is visible, one at a time, never
   under reduced motion, never after the visitor touched it), the Bayer field engine, then each
   demonstration: the agent stage, the gesture slide, two people, the show, the export comparison,
   the pattern, the chapter fields and the mark. */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  function $(s, el) {
    return (el || doc).querySelector(s);
  }
  function $$(s, el) {
    return Array.prototype.slice.call((el || doc).querySelectorAll(s));
  }
  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }
  function smooth(v) {
    v = clamp01(v);
    return v * v * (3 - 2 * v);
  }
  function arrive(v) {
    // expo.out
    v = clamp01(v);
    return v === 1 ? 1 : 1 - Math.pow(2, -10 * v);
  }
  function move(v) {
    // power2.inOut
    v = clamp01(v);
    return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2;
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /* ---------- the facts: functions of packages/theme/brand/facts.json (facts-data.ts) ---------- */

  var FACTS = { actions: 193, mcpTools: 169, httpPaths: 177, layouts: 22, materials: 17, shapePresets: 135, mismatch: 0.003 };
  $$('[data-fact]').forEach(function (el) {
    el.textContent = String(FACTS[el.getAttribute('data-fact')]);
  });

  /* ---------- the appearance ---------- */

  var darkQuery = matchMedia('(prefers-color-scheme: dark)');
  var themeListeners = [];
  function theme() {
    var t = root.getAttribute('data-theme');
    return t === 'light' || t === 'dark' ? t : darkQuery.matches ? 'dark' : 'light';
  }
  function syncThemeButtons() {
    var t = theme();
    $$('[data-theme-set]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-set') === t));
    });
  }
  function themeChanged() {
    syncThemeButtons();
    themeListeners.forEach(function (f) {
      f();
    });
  }
  $$('[data-theme-set]').forEach(function (b) {
    b.addEventListener('click', function () {
      root.setAttribute('data-theme', b.getAttribute('data-theme-set'));
      try {
        localStorage.setItem('gt-theme', b.getAttribute('data-theme-set'));
      } catch (e) {}
      themeChanged();
    });
  });
  darkQuery.addEventListener('change', function () {
    if (!root.hasAttribute('data-theme')) themeChanged();
  });
  syncThemeButtons();

  /* ---------- motion: reduced motion, Pause Motion, the tab's visibility ---------- */

  var reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = reducedQuery.matches;
  var paused = false;
  try {
    paused = sessionStorage.getItem('ts-motion') === 'paused';
  } catch (e) {}
  var pauseButton = $('#pause-motion');
  function syncPause() {
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseButton.textContent = paused ? 'Play Motion' : 'Pause Motion';
    pauseButton.hidden = reduced;
    root.classList.toggle('is-motion-paused', paused);
  }
  pauseButton.addEventListener('click', function () {
    paused = !paused;
    try {
      sessionStorage.setItem('ts-motion', paused ? 'paused' : 'on');
    } catch (e) {}
    syncPause();
    schedule();
  });
  reducedQuery.addEventListener('change', function () {
    reduced = reducedQuery.matches;
    syncPause();
    schedule();
    fields.forEach(function (f) {
      f.still();
    });
  });
  doc.addEventListener('visibilitychange', function () {
    schedule();
  });
  syncPause();
  var pausedStyle = doc.createElement('style');
  pausedStyle.textContent = '.is-motion-paused * { animation-play-state: paused !important; }';
  doc.head.appendChild(pausedStyle);

  function motionAllowed() {
    return !reduced && !paused && doc.visibilityState === 'visible';
  }

  /* ---------- one frame clock for everything that moves ---------- */

  var ticks = new Set();
  var rafId = 0;
  var lastNow = 0;
  var manualClock = false;
  function want(fn) {
    ticks.add(fn);
    if (!rafId && !manualClock) {
      lastNow = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  }
  function unwant(fn) {
    ticks.delete(fn);
  }
  function frame(now) {
    if (manualClock) {
      rafId = 0;
      return;
    }
    var dt = Math.min(64, now - lastNow);
    lastNow = now;
    Array.from(ticks).forEach(function (fn) {
      fn(dt, now);
    });
    rafId = ticks.size ? requestAnimationFrame(frame) : 0;
  }

  /* ---------- the loop scheduler ---------- */

  var loops = [];
  var loopObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        e.target.__loop.vis = e.isIntersecting ? e.intersectionRatio : 0;
      });
      schedule();
    },
    { threshold: [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1] },
  );
  function addLoop(el, loop) {
    loop.el = el;
    loop.vis = 0;
    loop.running = false;
    loop.stopped = false;
    loop.held = false;
    el.__loop = loop;
    loops.push(loop);
    loopObserver.observe(el);
    return loop;
  }
  function schedule() {
    var allowed = motionAllowed();
    var best = null;
    loops.forEach(function (l) {
      if (l.kind !== 'demo' || l.stopped || l.held || l.vis < 0.5) return;
      if (!best || l.vis > best.vis) best = l;
    });
    // at most two fields draw at once: the two most visible
    var liveFields = loops
      .filter(function (l) {
        return l.kind === 'field' && !l.held && l.vis > 0;
      })
      .sort(function (a, c) {
        return c.vis - a.vis;
      })
      .slice(0, 2);
    loops.forEach(function (l) {
      var on;
      if (l.kind === 'demo') on = allowed && l === best;
      else on = allowed && liveFields.indexOf(l) >= 0;
      if (on && !l.running) {
        l.running = true;
        l.play();
      } else if (!on && l.running) {
        l.running = false;
        l.pause();
      }
    });
  }
  function stopLoop(l) {
    l.stopped = true;
    if (l.running) {
      l.running = false;
      l.pause();
    }
    if (l.onStop) l.onStop();
  }

  /* A timeline of events on one clock: play, pause, seek. Events fire in order; a seek fires every
     event up to the time with instant = true, so the state is the same however it was reached. */
  function Seq(duration, reset) {
    this.dur = duration;
    this.resetFn = reset;
    this.ev = [];
    this.t = 0;
    this.i = 0;
    this.endAt = Infinity;
    this.loop = true;
  }
  Seq.prototype.at = function (t, fn) {
    this.ev.push({ t: t, fn: fn });
    return this;
  };
  Seq.prototype.sort = function () {
    this.ev.sort(function (a, b) {
      return a.t - b.t;
    });
  };
  Seq.prototype.reset = function () {
    this.t = 0;
    this.i = 0;
    this.resetFn();
  };
  Seq.prototype.fireTo = function (t, instant) {
    while (this.i < this.ev.length && this.ev[this.i].t <= t) {
      this.ev[this.i].fn(instant);
      this.i++;
    }
  };
  Seq.prototype.advance = function (dt) {
    this.t += dt;
    this.fireTo(this.t, false);
    if (this.t >= this.endAt) return false;
    if (this.t >= this.dur) {
      if (!this.loop) return false;
      this.reset();
    }
    return true;
  };
  Seq.prototype.seek = function (t) {
    this.reset();
    this.t = t;
    this.fireTo(t, true);
  };

  /* ---------- the Bayer field: one buffer pixel per cell, CSS draws the cells square ---------- */

  var B8 = [
    0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30,
    54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23,
    61, 29, 53, 21,
  ];
  var BT = new Float32Array(64);
  for (var b = 0; b < 64; b++) BT[b] = (B8[b] + 0.5) / 64;

  function hash(x, y) {
    var h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function vnoise(x, y) {
    var xi = Math.floor(x);
    var yi = Math.floor(y);
    var xf = x - xi;
    var yf = y - yi;
    var u = xf * xf * (3 - 2 * xf);
    var v = yf * yf * (3 - 2 * yf);
    var a = hash(xi, yi);
    var b2 = hash(xi + 1, yi);
    var c = hash(xi, yi + 1);
    var d = hash(xi + 1, yi + 1);
    return a + (b2 - a) * u + (c - a) * v + (a - b2 - c + d) * u * v;
  }
  function parseColor(str) {
    str = (str || '').trim();
    if (str.charAt(0) === '#') {
      var h = str.slice(1);
      if (h.length === 3) h = h.replace(/(.)/g, '$1$1');
      var n = parseInt(h.slice(0, 6), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    var m = str.match(/rgba?\(([^)]+)\)/);
    if (m) {
      var p = m[1].split(/[ ,/]+/).map(parseFloat);
      return [p[0], p[1], p[2]];
    }
    return [0, 0, 0];
  }

  var fields = [];
  /* opts: cell (css px per cell, or a function of the width), tone(u, v, t, x, y, field) in 0..1 of ink,
     colorsFrom (the element whose --s-ink and --s-paper it prints in; the canvas by default, which
     inherits them from its sheet), onResize, register (false for a one-off still) */
  function Field(canvas, opts) {
    this.opts = opts;
    this.t = 0;
    this.attach(canvas);
    if (opts.register !== false) fields.push(this);
  }
  Field.prototype.attach = function (canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.cols = 0;
    this.rows = 0;
    this.resize();
  };
  Field.prototype.resize = function () {
    var w = this.c.clientWidth;
    var h = this.c.clientHeight;
    if (!w || !h) return false;
    var cell = typeof this.opts.cell === 'function' ? this.opts.cell(w) : this.opts.cell;
    var cols = Math.max(1, Math.round(w / cell));
    var rows = Math.max(1, Math.round(h / cell));
    if (cols === this.cols && rows === this.rows) return false;
    this.cols = cols;
    this.rows = rows;
    this.c.width = cols;
    this.c.height = rows;
    this.img = this.ctx.createImageData(cols, rows);
    // one 32 bit write per cell, and the Bayer threshold of every cell, read once
    this.u32 = new Uint32Array(this.img.data.buffer);
    this.th = new Float32Array(cols * rows);
    this.toneBuf = new Float32Array(cols * rows);
    for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) this.th[y * cols + x] = BT[((y & 7) << 3) | (x & 7)];
    this.colors();
    if (this.opts.onResize) this.opts.onResize(this);
    return true;
  };
  Field.prototype.colors = function () {
    var cs = getComputedStyle(this.opts.colorsFrom || this.c);
    this.ink = parseColor(cs.getPropertyValue('--s-ink') || cs.getPropertyValue('--ink'));
    this.paper = parseColor(cs.getPropertyValue('--s-paper') || cs.getPropertyValue('--paper'));
    this.dark = theme() === 'dark';
    var pack = function (c) {
      return ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
    };
    this.ink32 = pack(this.ink);
    this.paper32 = pack(this.paper);
  };
  Field.prototype.draw = function (t) {
    if (!this.cols) {
      if (!this.resize()) return;
    }
    this.t = t;
    var cols = this.cols;
    var rows = this.rows;
    var out = this.u32;
    var th = this.th;
    var ink = this.ink32;
    var paper = this.paper32;
    var gain = this.gain === undefined ? 1 : this.gain;
    var buf = this.toneBuf;
    if (this.opts.fill) {
      // a field that fills its tone in one tight loop over typed arrays
      this.opts.fill(buf, t, this);
    } else {
      var tone = this.opts.tone;
      for (var y = 0; y < rows; y++) {
        var v = (y + 0.5) / rows;
        for (var x = 0; x < cols; x++) buf[y * cols + x] = tone((x + 0.5) / cols, v, t, x, y, this);
      }
    }
    for (var i = 0, n = buf.length; i < n; i++) out[i] = buf[i] * gain > th[i] ? ink : paper;
    this.ctx.putImageData(this.img, 0, 0);
  };
  /* the still a field shows under reduced motion, while paused and before it first runs */
  Field.prototype.still = function () {
    this.colors();
    this.draw(this.stillTime || 0);
  };

  themeListeners.push(function () {
    fields.forEach(function (f) {
      f.colors();
      f.draw(f.t);
    });
    $$('canvas[data-static]').forEach(drawStatic);
  });

  var resizeObserver = new ResizeObserver(function (entries) {
    entries.forEach(function (e) {
      var fn = e.target.__onResize;
      if (fn) fn();
    });
  });
  function onResize(el, fn) {
    el.__onResize = fn;
    resizeObserver.observe(el);
  }

  /* the tones: functions of the cell's place (u, v in 0..1 of the sheet) and the time */
  function openerRimAt(u, v) {
    var dx = u * 16 - 13.4;
    var dy = v * 9 - 11.6;
    var d = Math.sqrt(dx * dx + dy * dy) - 8.6;
    return d < 0 ? Math.exp(d * 1.6) : Math.exp(-d * 3);
  }
  function openerTone(u, v, t, still) {
    var ax = u * 16;
    var ay = v * 9;
    var dx = ax - 13.4;
    var dy = ay - 11.6;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var d = dist - 8.6;
    var k;
    var rim;
    if (d < 0) {
      var lit = clamp01((-dx * 0.62 - dy * 0.78) / 8.6);
      k = 0.06 + 0.78 * Math.exp(d * 0.85) * (0.3 + 0.7 * lit);
      rim = Math.exp(d * 1.6);
    } else {
      k = 0.3 * Math.exp(-d * 4.5);
      rim = Math.exp(-d * 3);
    }
    if (still) return k;
    var n = vnoise(ax * 1.4 + t * 0.00012, ay * 1.4 - t * 0.00005) - 0.5;
    return clamp01(k + n * 0.1 * rim);
  }
  function patternTone(u, v, t) {
    var ax = u * 16;
    var ay = v * 9;
    var s = t * 0.00042;
    var w = Math.sin(ax * 0.52 + Math.sin(ay * 0.66 + s * 1.3) * 1.9 + s) * 0.5 + 0.5;
    var w2 = Math.sin(ay * 0.86 - s * 0.8 + Math.cos(ax * 0.33 - s) * 1.3) * 0.5 + 0.5;
    return clamp01(0.06 + 0.86 * Math.pow(w * 0.6 + w2 * 0.4, 1.7));
  }

  /* ---------- a terminal: fixed line slots whose text changes ----------
     A log that appends elements moves every earlier line up, which the browser counts as a layout
     shift. Here the panel holds as many one-line slots as fit; the logical lines are cut at the
     panel's column count, as a terminal wraps, and written into the last slots. No box ever moves. */
  function Term(el) {
    this.el = el;
    this.lines = $$('li', el).map(function (li) {
      return { text: li.textContent, cls: li.className };
    });
    this.n = 0;
    this.build();
    var self = this;
    onResize(el, function () {
      self.build();
    });
  }
  Term.prototype.build = function () {
    var cs = getComputedStyle(this.el);
    var probe = doc.createElement('span');
    probe.textContent = '0000000000';
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
    this.el.appendChild(probe);
    var r = probe.getBoundingClientRect();
    probe.remove();
    var lh = parseFloat(cs.lineHeight) || r.height;
    var w = this.el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var h = this.el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (!w || !h) return;
    this.cols = Math.max(12, Math.floor(w / (r.width / 10)));
    var n = Math.max(1, Math.floor(h / lh));
    if (n !== this.n) {
      this.el.textContent = '';
      this.slots = [];
      for (var i = 0; i < n; i++) {
        var li = doc.createElement('li');
        this.el.appendChild(li);
        this.slots.push(li);
      }
      this.n = n;
    }
    this.paint();
  };
  Term.prototype.push = function (text, cls, extra) {
    var line = { text: text, cls: cls || '' };
    if (extra) Object.assign(line, extra);
    this.lines.push(line);
    if (this.lines.length > 80) this.lines.shift();
    this.paint();
    return line;
  };
  Term.prototype.paint = function () {
    if (!this.n) return;
    var rows = [];
    var cols = this.cols;
    for (var k = this.lines.length - 1; k >= 0 && rows.length < this.n; k--) {
      var l = this.lines[k];
      var t = l.text;
      var parts = [];
      if (!t.length) parts.push({ t: '', cls: l.cls, caret: l.caret });
      for (var i = 0; i < t.length; i += cols) parts.push({ t: t.slice(i, i + cols), cls: l.cls, caret: l.caret && i + cols >= t.length });
      rows = parts.concat(rows);
    }
    var visible = rows.slice(-this.n);
    var offset = this.n - visible.length;
    for (var s = 0; s < this.n; s++) {
      var row = s < offset ? null : visible[s - offset];
      var slot = this.slots[s];
      var key = row ? row.cls + '|' + row.t + '|' + (row.caret ? 1 : 0) : '';
      if (slot.__key === key) continue;
      slot.__key = key;
      slot.className = row ? row.cls : '';
      slot.textContent = row ? row.t : '';
      if (row && row.caret) {
        var c = doc.createElement('span');
        c.className = 'caret';
        slot.appendChild(c);
      }
    }
  };

  /* a band's setup runs when it comes within 800 px of the viewport, so the first load does only the hero */
  var nearObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting || !e.target.__near) return;
        var fns = e.target.__near;
        e.target.__near = null;
        nearObserver.unobserve(e.target);
        fns.forEach(function (fn) {
          fn();
        });
      });
    },
    { rootMargin: '800px 0px' },
  );
  function whenNear(el, fn) {
    if (!el.__near) {
      el.__near = [];
      nearObserver.observe(el);
    }
    el.__near.push(fn);
  }

  /* ---------- the example deck: one copy of every slide's first state ---------- */

  var deck = $('#deck');
  var PRISTINE = $$(':scope > .sheet', deck).map(function (s) {
    return s.outerHTML;
  });
  function fromHTML(html) {
    var t = doc.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function cellFor(w) {
    return Math.max(1, Math.round(w / 300));
  }
  /* a slide copied for a thumbnail, the show or the comparison: its opener field drawn once */
  function staticCopy(html) {
    var s = fromHTML(html);
    s.classList.remove('is-on', 'is-cut');
    s.removeAttribute('aria-label');
    return s;
  }
  /* copies are re-rendered often, so their fields are one-off stills: no registry, no observer */
  function drawStatic(c) {
    var f = new Field(c, { cell: cellFor, tone: openerTone, register: false });
    f.draw(0);
  }
  function paintStatics(scope) {
    $$('canvas[data-field="opener"]', scope).forEach(function (c) {
      c.setAttribute('data-static', '');
      drawStatic(c);
    });
  }

  /* ================================================================================================
     The agent stage (the hero): an agent types four commands and the deck changes under them.
     ================================================================================================ */

  var agentEl = $('#agent');
  var strip = $('#strip');
  var sel = $('.sel', deck);
  var snack = $('.snack', agentEl);
  var snackText = $('.snack-text', snack);
  var agentLog = $('#agent-term .term-log');
  var steps = $$('.step', agentEl);
  var cur = 0;
  var rev = 25;
  var history = [];
  var selTarget = null;

  /* the opener's tone without its drift, per cell, and a noise table the drift slides across */
  var openerBase = null;
  var openerRim = null;
  var openerNoise = null;
  function prepareOpener(f) {
    var n = f.cols * f.rows;
    openerBase = new Float32Array(n);
    openerRim = new Float32Array(n);
    openerNoise = new Float32Array((f.cols + 64) * f.rows);
    for (var y = 0; y < f.rows; y++) {
      for (var x = 0; x < f.cols; x++) {
        var i = y * f.cols + x;
        var u = (x + 0.5) / f.cols;
        var v = (y + 0.5) / f.rows;
        openerBase[i] = openerTone(u, v, 0, true);
        openerRim[i] = openerRimAt(u, v);
      }
      for (var x2 = 0; x2 < f.cols + 64; x2++) openerNoise[y * (f.cols + 64) + x2] = vnoise(((x2 + 0.5) / f.cols) * 16 * 1.4, ((y + 0.5) / f.rows) * 9 * 1.4) - 0.5;
    }
  }
  var openerField = new Field($('[data-field="opener"]', deck), {
    cell: function (w) {
      return Math.max(2, Math.round(w / 290));
    },
    onResize: prepareOpener,
    fill: function (buf, t, f) {
      if (!openerBase) {
        for (var y = 0; y < f.rows; y++) for (var x = 0; x < f.cols; x++) buf[y * f.cols + x] = openerTone((x + 0.5) / f.cols, (y + 0.5) / f.rows, t);
        return;
      }
      var shift = Math.floor(t / 400) % 64;
      var w = f.cols + 64;
      for (var y2 = 0; y2 < f.rows; y2++) {
        var row = y2 * f.cols;
        var nrow = y2 * w + shift;
        for (var x2 = 0; x2 < f.cols; x2++) {
          var i = row + x2;
          var v = openerBase[i] + openerNoise[nrow + x2] * 0.1 * openerRim[i];
          buf[i] = v < 0 ? 0 : v > 1 ? 1 : v;
        }
      }
    },
    tone: function (u, v, t, x, y, f) {
      if (!openerBase) return openerTone(u, v, t);
      var i = y * f.cols + x;
      // the drift: the noise slides one cell every 400 ms (under 3 percent of tone a beat)
      var shift = Math.floor(t / 400) % 64;
      return clamp01(openerBase[i] + openerNoise[y * (f.cols + 64) + x + shift] * 0.1 * openerRim[i]);
    },
  });
  openerField.gain = 0;
  onResize(deck, function () {
    if (openerField.resize()) openerField.draw(openerField.t);
    placeSel(selTarget, null);
  });

  function slides() {
    return $$(':scope > .sheet', deck);
  }
  function renderThumbs(enteringIndex) {
    strip.textContent = '';
    slides().forEach(function (s, i) {
      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'thumb' + (i === enteringIndex ? ' is-entering' : '');
      btn.setAttribute('aria-label', 'Slide ' + (i + 1));
      btn.setAttribute('aria-current', String(i === cur));
      var n = doc.createElement('span');
      n.className = 'n';
      n.textContent = String(i + 1);
      var copy = staticCopy(s.outerHTML);
      copy.setAttribute('aria-hidden', 'true');
      btn.appendChild(n);
      btn.appendChild(copy);
      btn.addEventListener('click', function () {
        show(i, true);
        placeSel(null);
      });
      strip.appendChild(btn);
    });
    paintStatics(strip);
  }
  function show(i, cut) {
    var all = slides();
    i = Math.max(0, Math.min(all.length - 1, i));
    all.forEach(function (s, j) {
      s.classList.toggle('is-on', j === i);
    });
    if (cut && !reduced) {
      all[i].classList.remove('is-cut');
      void all[i].offsetWidth;
      all[i].classList.add('is-cut');
    }
    cur = i;
    $$('.thumb', strip).forEach(function (t, j) {
      t.setAttribute('aria-current', String(j === i));
    });
  }
  function placeSel(target, label) {
    selTarget = target;
    if (!target) {
      sel.classList.remove('is-on');
      return;
    }
    if (label) $('.chip', sel).textContent = label;
    var d = deck.getBoundingClientRect();
    var r = target.getBoundingClientRect();
    if (!d.width) return;
    var pad = d.width * 0.006;
    sel.style.transform = 'translate(' + (r.left - d.left - pad) + 'px,' + (r.top - d.top - pad) + 'px)';
    sel.style.width = r.width + pad * 2 + 'px';
    sel.style.height = r.height + pad * 2 + 'px';
    sel.classList.add('is-on');
  }
  function restoreSlides(htmlList, index) {
    slides().forEach(function (s) {
      s.remove();
    });
    htmlList.forEach(function (h) {
      deck.insertBefore(fromHTML(h), sel);
    });
    var c = $('[data-field="opener"]', deck);
    if (c) {
      openerField.attach(c);
      openerField.draw(openerField.t);
    }
    show(index || 0, false);
    renderThumbs();
  }
  function snapshot() {
    history.push({ html: slides().map(function (s) { return s.outerHTML; }), cur: cur, rev: rev });
    if (history.length > 20) history.shift();
  }

  /* the writes the commands make */
  function addSlide(id, instant) {
    snapshot();
    var n = slides().length + 1;
    var s = fromHTML(
      '<div class="sheet" data-id="' +
        id +
        '" aria-label="Slide ' +
        n +
        '"><span class="x tl"></span><span class="x tr"></span><span class="x bl"></span><span class="x br"></span>' +
        '<div class="sl split-head"><p class="s-h2 s-ph" data-b="title">Click to add title</p>' +
        '<div class="split-body"><div class="s-box s-p s-ph">Click to add text</div><div class="s-box s-p s-ph">Click to add text</div></div></div>' +
        '<p class="s-foot">Prepared for Acme</p><p class="s-num">' +
        n +
        '</p></div>',
    );
    deck.insertBefore(s, sel);
    show(n - 1, !instant);
    renderThumbs(instant ? -1 : n - 1);
    var place = function () {
      placeSel($('[data-b="title"]', s), 'Title');
    };
    if (instant) place();
    else setTimeout(place, 200);
    rev += 1;
    return { ok: true, slide: id, layout: 'split', revision: rev };
  }
  function setTitle(id, text) {
    var s = $(':scope > .sheet[data-id="' + id + '"]', deck);
    if (!s) return null;
    snapshot();
    var t = $('[data-b="title"]', s) || $('.s-h2, .s-h1', s);
    t.textContent = text;
    t.classList.remove('s-ph');
    var i = slides().indexOf(s);
    if (i !== cur) show(i, false);
    renderThumbs();
    placeSel(t, 'Title');
    rev += 1;
    return { ok: true, slide: id, block: 'title', revision: rev };
  }
  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  function tailor(from, to, instant) {
    snapshot();
    var re = new RegExp((/^\w/.test(from) ? '\\b' : '') + escapeRe(from) + (/\w$/.test(from) ? '\\b' : ''), 'g');
    var places = 0;
    var touched = 0;
    slides().forEach(function (s) {
      var count = 0;
      var walker = doc.createTreeWalker(s, NodeFilter.SHOW_TEXT);
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(function (node) {
        var text = node.nodeValue;
        re.lastIndex = 0;
        if (!re.test(text)) return;
        re.lastIndex = 0;
        var frag = doc.createDocumentFragment();
        var last = 0;
        var m;
        while ((m = re.exec(text))) {
          frag.appendChild(doc.createTextNode(text.slice(last, m.index)));
          var mk = doc.createElement('mark');
          mk.className = 'tl' + (instant ? ' is-settled' : '');
          mk.textContent = to;
          frag.appendChild(mk);
          last = m.index + m[0].length;
          count++;
        }
        frag.appendChild(doc.createTextNode(text.slice(last)));
        node.parentNode.replaceChild(frag, node);
      });
      if (count) touched++;
      places += count;
    });
    show(0, !instant);
    renderThumbs();
    placeSel(null);
    if (!instant) {
      setTimeout(function () {
        $$('mark.tl', deck).forEach(function (m) {
          m.classList.add('is-settled');
        });
      }, 1300);
    }
    rev += 1;
    return { ok: true, places: places, slides: touched, revision: rev };
  }
  function restoreVersion(n) {
    snapshot();
    restoreSlides(PRISTINE, 0);
    placeSel(null);
    rev += 1;
    return { ok: true, restored: n, revision: rev };
  }
  function showSnack(text) {
    snackText.textContent = text;
    snack.classList.add('is-on');
  }
  function hideSnack() {
    snack.classList.remove('is-on');
  }
  $('.snack-undo', snack).addEventListener('click', function () {
    var h = history.pop();
    if (!h) return;
    stopLoop(agentLoop);
    restoreSlides(h.html, h.cur);
    rev = h.rev;
    placeSel(null);
    hideSnack();
  });

  /* the terminal */
  var agentTerm = new Term(agentLog);
  function line(text, cls) {
    return agentTerm.push(text, cls);
  }
  function json(o) {
    return JSON.stringify(o);
  }
  var typing = null;
  function typeTo(text, withCaret) {
    if (!typing) typing = line('$ ');
    typing.text = '$ ' + text;
    typing.caret = !!withCaret;
    agentTerm.paint();
  }
  function endTyping() {
    if (typing && typing.caret) {
      typing.caret = false;
      agentTerm.paint();
    }
    typing = null;
  }

  var CMDS = [
    {
      cmd: 'turboslide slide new --layout split --after next --json',
      run: function (i) {
        return addSlide('pricing', i);
      },
      after: function () {
        showSnack('An agent added slide 6');
      },
    },
    {
      cmd: 'turboslide block set pricing#title /text "Pricing for Acme" --json',
      run: function () {
        var r = setTitle('pricing', 'Pricing for Acme');
        return r;
      },
      after: function () {
        showSnack('An agent changed slide 6');
      },
    },
    {
      cmd: 'turboslide tailor --replace Acme=Globex --json',
      run: function (i) {
        return tailor('Acme', 'Globex', i);
      },
      after: function (r) {
        showSnack('Tailored for Globex: ' + r.places + ' places on ' + r.slides + ' slides');
      },
    },
    { cmd: 'turboslide version restore 25 --json', run: function () { return restoreVersion(25); } },
  ];
  var STEP_START = [0, 4200, 8400, 12800];
  var STEP_END = [4200, 8400, 12800, 17000];
  var CHAR = 24;

  function agentReset() {
    restoreSlides(PRISTINE, 0);
    rev = 25;
    history = [];
    hideSnack();
    placeSel(null);
    endTyping();
  }
  var agentSeq = new Seq(17000, agentReset);
  agentSeq.loop = true;
  CMDS.forEach(function (c, k) {
    var s0 = STEP_START[k];
    if (k > 0) agentSeq.at(s0 + 1, function () { hideSnack(); });
    agentSeq.at(s0 + 300, function (instant) {
      endTyping();
      typeTo('', !instant);
    });
    for (var j = 1; j <= c.cmd.length; j++) {
      (function (j) {
        agentSeq.at(s0 + 300 + CHAR * j, function (instant) {
          if (!instant || j === c.cmd.length) typeTo(c.cmd.slice(0, j), !instant && j < c.cmd.length);
        });
      })(j);
    }
    var done = s0 + 300 + CHAR * c.cmd.length + 300;
    agentSeq.at(done, function (instant) {
      typeTo(c.cmd, false);
      endTyping();
      var r = c.run(instant);
      line(json(r), 'out');
      if (c.after) c.after(r);
    });
  });
  agentSeq.sort();

  function syncSteps(t, manualIndex) {
    steps.forEach(function (b, k) {
      var active = manualIndex !== undefined ? k === manualIndex : t >= STEP_START[k] && t < STEP_END[k];
      if (b.__active !== active) {
        b.__active = active;
        b.setAttribute('aria-selected', String(active));
      }
      var rule = b.__rule || (b.__rule = $('.rule', b));
      var v = manualIndex !== undefined || reduced ? (active ? 1 : 0) : active ? Math.round(clamp01((t - STEP_START[k]) / (STEP_END[k] - STEP_START[k])) * 400) / 400 : 0;
      if (rule.__v !== v) {
        rule.__v = v;
        rule.style.transform = 'scaleX(' + v + ')';
      }
    });
  }

  var manualTick = null;
  function agentTick(dt) {
    var going = agentSeq.advance(dt);
    syncSteps(agentSeq.t);
    if (!going) {
      unwant(agentTick);
    }
  }
  var agentLoop = addLoop(agentEl, {
    kind: 'demo',
    play: function () {
      want(agentTick);
    },
    pause: function () {
      unwant(agentTick);
    },
    onStop: function () {
      unwant(agentTick);
      syncPauseLabel(agentEl, agentLoop);
    },
  });

  /* a step chosen by hand: the steps before it land at once, the step itself plays once */
  function runStep(k) {
    stopLoop(agentLoop);
    if (manualTick) unwant(manualTick);
    agentSeq.loop = false;
    agentSeq.seek(STEP_START[k]);
    syncSteps(0, k);
    var end = STEP_START[k] + 300 + CHAR * CMDS[k].cmd.length + 320;
    if (reduced) {
      agentSeq.fireTo(end, true);
      return;
    }
    agentSeq.endAt = end;
    manualTick = function (dt) {
      if (!agentSeq.advance(dt)) {
        unwant(manualTick);
        manualTick = null;
        agentSeq.endAt = Infinity;
      }
    };
    want(manualTick);
  }
  steps.forEach(function (b, k) {
    b.addEventListener('click', function () {
      runStep(k);
    });
  });

  /* the visitor's own command */
  var cmdInput = $('#cmd');
  cmdInput.addEventListener('focus', function () {
    stopLoop(agentLoop);
    if (manualTick) {
      unwant(manualTick);
      manualTick = null;
    }
    syncSteps(0, -1);
  });
  $('#agent-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var raw = cmdInput.value.trim();
    if (!raw) return;
    cmdInput.value = '';
    endTyping();
    line('$ ' + raw);
    runCommand(raw);
  });
  function unquote(s) {
    return (s || '').replace(/^["']|["']$/g, '');
  }
  function runCommand(raw) {
    var s = raw.replace(/^(pnpm exec |npx )?turboslide\s*/, '').replace(/\s+--json\b/, '').trim();
    var m;
    hideSnack();
    if (!s || /^(help|--help|-h)$/.test(s)) {
      line('This page runs four commands: slide new, block set, tailor and version restore.', 'out');
      return;
    }
    if ((m = s.match(/^slide new(?:\s+--layout\s+(\S+))?(?:\s+--after\s+\S+)?$/))) {
      var id = slides().some(function (x) { return x.getAttribute('data-id') === 'pricing'; }) ? 'slide-' + (slides().length + 1) : 'pricing';
      var r = addSlide(id, false);
      r.layout = m[1] || 'split';
      line(json(r), 'out');
      showSnack('An agent added slide ' + slides().length);
      return;
    }
    if ((m = s.match(/^block set\s+([\w-]+)#title\s+\/text\s+(".*"|'.*'|\S+)$/))) {
      var r2 = setTitle(m[1], unquote(m[2]));
      if (!r2) line('error: the deck has no slide "' + m[1] + '". Run slide new first.', 'err');
      else {
        line(json(r2), 'out');
        showSnack('An agent changed slide ' + (cur + 1));
      }
      return;
    }
    if ((m = s.match(/^tailor\s+--replace\s+("[^"]+"|'[^']+'|[^=\s]+)=("[^"]+"|'[^']+'|.+)$/))) {
      var from = unquote(m[1]);
      var to = unquote(m[2].trim());
      var r3 = tailor(from, to, false);
      line(json(r3), 'out');
      if (r3.places) showSnack('Tailored for ' + to + ': ' + r3.places + ' places on ' + r3.slides + ' slides');
      else {
        history.pop();
        line('No slide says "' + from + '".', 'err');
      }
      return;
    }
    if ((m = s.match(/^version restore(?:\s+(\d+))?$/))) {
      line(json(restoreVersion(m[1] ? Number(m[1]) : 25)), 'out');
      return;
    }
    line('error: this page runs slide new, block set, tailor and version restore. Type help for the list.', 'err');
  }

  /* Pause and Replay under a demonstration */
  function syncPauseLabel(el, loop) {
    var b = $('[data-ctl="pause"]', el.closest('section') || el);
    if (!b) return;
    b.textContent = loop.held && !loop.stopped ? 'Play' : 'Pause';
    b.disabled = loop.stopped || reduced;
  }
  function wireControls(scope, loop, seq, onReplay) {
    var pauseB = $('[data-ctl="pause"]', scope);
    var replayB = $('[data-ctl="replay"]', scope);
    if (pauseB)
      pauseB.addEventListener('click', function () {
        loop.held = !loop.held;
        syncPauseLabel(loop.el, loop);
        schedule();
      });
    if (replayB)
      replayB.addEventListener('click', function () {
        if (onReplay) onReplay();
        seq.loop = true;
        seq.endAt = Infinity;
        seq.reset();
        loop.stopped = false;
        loop.held = false;
        syncPauseLabel(loop.el, loop);
        if (reduced) {
          seq.fireTo(seq.dur - 1, true);
          return;
        }
        schedule();
      });
    syncPauseLabel(loop.el, loop);
  }
  wireControls(agentEl, agentLoop, agentSeq, function () {
    if (manualTick) {
      unwant(manualTick);
      manualTick = null;
    }
  });

  /* the opener's field raises its tone from 0 once the page has loaded, then drifts while in view */
  var openerLoop = addLoop($('.ed-stage', agentEl), {
    kind: 'field',
    play: function () {
      want(openerTick);
    },
    pause: function () {
      unwant(openerTick);
    },
  });
  openerLoop.held = true;
  var openerClock = 0;
  var openerAcc = 0;
  var openerEnter = 0;
  var openerStep = -1;
  function openerTick(dt) {
    openerClock += dt;
    openerAcc += dt;
    var entering = openerEnter < 500;
    if (entering) {
      openerEnter += dt;
      openerField.gain = smooth(openerEnter / 500);
    }
    // the drift moves one cell every 400 ms, so a frame between steps would draw the same cells
    var stepNow = Math.floor(openerClock / 400);
    if ((entering && openerAcc >= 33) || stepNow !== openerStep) {
      openerAcc = 0;
      openerStep = stepNow;
      openerField.draw(openerClock);
    }
  }

  renderThumbs();
  syncSteps(0, -1);
  agentLoop.held = true; // released with the opener's field once the page has loaded (afterLoad)

  /* ================================================================================================
     Everything on a slide moves: select, drag, resize and rotate; each gesture prints its action.
     ================================================================================================ */

  var workSheet = $('#work-sheet');
  var workLog = $('#work-term .term-log');
  var ring = $('.ring', workSheet);
  var ringChip = $('.chip', ring);
  var ringDeg = $('.deg', ring);
  var guideV = $('.guide.v', workSheet);
  var guideH = $('.guide.hz', workSheet);
  var ghost = $('.ghost', workSheet);
  var INITIAL = {
    title: { x: 137, y: 150, w: 690, h: 196, r: 0 },
    body: { x: 137, y: 430, w: 560, h: 110, r: 0 },
    picture: { x: 930, y: 150, w: 470, h: 470, r: 0 },
  };
  var objs = {};
  Object.keys(INITIAL).forEach(function (k) {
    objs[k] = Object.assign({}, INITIAL[k]);
  });
  var objEls = {};
  $$('.obj', workSheet).forEach(function (el) {
    objEls[el.getAttribute('data-obj')] = el;
  });
  var selected = null;
  var isCanvas = false;
  var workRev = 41;

  /* an object's place as a transform from the sheet's corner (a change of left or top would be a
     layout shift); sizes in percent of the sheet, so a resize of the window keeps them */
  var sheetK = 1;
  function measureSheet() {
    sheetK = workSheet.clientWidth / 1600 || sheetK;
  }
  function place(el, o) {
    el.style.width = o.w / 16 + '%';
    el.style.height = o.h / 9 + '%';
    el.style.transform = 'translate(' + o.x * sheetK + 'px,' + o.y * sheetK + 'px)' + (o.r ? ' rotate(' + o.r + 'deg)' : '');
  }
  function renderObj(k) {
    place(objEls[k], objs[k]);
    if (selected === k) place(ring, objs[k]);
  }
  function renderAll() {
    Object.keys(objs).forEach(renderObj);
  }
  function select(k) {
    selected = k;
    ring.hidden = !k;
    if (k) {
      ringChip.textContent = objEls[k].getAttribute('data-role');
      place(ring, objs[k]);
    }
  }
  var workTerm = new Term(workLog);
  var workLive = $('#work-live');
  function workLine(text, cls) {
    workTerm.lines = workTerm.lines.filter(function (l) {
      return l.cls.indexOf('is-wait') < 0;
    });
    workTerm.push(text, cls);
    if (!cls) workLive.textContent = text.replace(/^\$ /, '');
  }
  function workClear() {
    workTerm.lines = [{ text: 'Waiting for a gesture on the slide.', cls: 'out is-wait' }];
    workTerm.paint();
  }
  function round(n) {
    return Math.round(n);
  }
  function logWrite(k, kind) {
    if (!isCanvas) {
      isCanvas = true;
      workLine('$ turboslide slide to-canvas review');
      workRev++;
      workLine(json({ ok: true, slide: 'review', layout: 'freeform', revision: workRev }), 'out');
    }
    var o = objs[k];
    workRev++;
    if (kind === 'rotate') {
      workLine('$ turboslide block rotate review#' + k + ' --to ' + round(o.r));
    } else {
      workLine("$ turboslide block set review#" + k + " /pos '" + json({ x: round(o.x), y: round(o.y), w: round(o.w), h: round(o.h) }) + "'");
    }
    workLine(json({ ok: true, revision: workRev }), 'out');
  }
  measureSheet();
  renderAll();
  onResize(workSheet, function () {
    measureSheet();
    renderAll();
    renderGhost();
  });

  /* the visitor's gestures */
  var drag = null;
  function sheetScale() {
    return 1600 / workSheet.getBoundingClientRect().width;
  }
  function touchWork() {
    if (!workLoop.stopped) {
      stopLoop(workLoop);
      workReset(true);
    }
  }
  workSheet.addEventListener('pointerdown', function (e) {
    var h = e.target.closest('.h');
    var objEl = e.target.closest('.obj');
    if (!h && !objEl) {
      touchWork();
      select(null);
      return;
    }
    touchWork();
    e.preventDefault();
    var k = h ? selected : objEl.getAttribute('data-obj');
    if (!k) return;
    select(k);
    var o = objs[k];
    var rect = workSheet.getBoundingClientRect();
    drag = {
      k: k,
      mode: h ? h.getAttribute('data-h') : 'move',
      sx: e.clientX,
      sy: e.clientY,
      o0: Object.assign({}, o),
      rect: rect,
      changed: false,
      id: e.pointerId,
    };
    workSheet.setPointerCapture(e.pointerId);
    (objEl || objEls[k]).focus({ preventScroll: true });
  });
  workSheet.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var k = drag.k;
    var o = objs[k];
    var o0 = drag.o0;
    var s = 1600 / drag.rect.width;
    var dx = (e.clientX - drag.sx) * s;
    var dy = (e.clientY - drag.sy) * s;
    if (Math.abs(dx) + Math.abs(dy) > 1) drag.changed = true;
    var snapX = false;
    var snapY = false;
    if (drag.mode === 'move') {
      o.x = o0.x + dx;
      o.y = o0.y + dy;
      if (Math.abs(o.x + o.w / 2 - 800) < 12) {
        o.x = 800 - o.w / 2;
        snapX = true;
      }
      if (Math.abs(o.y + o.h / 2 - 450) < 12) {
        o.y = 450 - o.h / 2;
        snapY = true;
      }
    } else if (drag.mode === 'rot') {
      var cx = drag.rect.left + ((o0.x + o0.w / 2) / 1600) * drag.rect.width;
      var cy = drag.rect.top + ((o0.y + o0.h / 2) / 900) * drag.rect.height;
      var a = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
      if (a > 180) a -= 360;
      a = e.shiftKey ? Math.round(a / 15) * 15 : Math.round(a);
      o.r = a;
      ringDeg.hidden = false;
      ringDeg.textContent = a + '°';
    } else {
      var rad = (o0.r * Math.PI) / 180;
      var c = Math.cos(rad);
      var sn = Math.sin(rad);
      var lx = dx * c + dy * sn;
      var ly = -dx * sn + dy * c;
      var m = drag.mode;
      var sx = m.indexOf('e') >= 0 ? 1 : m.indexOf('w') >= 0 ? -1 : 0;
      var sy = m.indexOf('s') >= 0 ? 1 : m.indexOf('n') >= 0 ? -1 : 0;
      var w = Math.max(60, o0.w + sx * lx);
      var hgt = Math.max(40, o0.h + sy * ly);
      var ldx = (sx * (w - o0.w)) / 2;
      var ldy = (sy * (hgt - o0.h)) / 2;
      var cx0 = o0.x + o0.w / 2 + ldx * c - ldy * sn;
      var cy0 = o0.y + o0.h / 2 + ldx * sn + ldy * c;
      o.w = w;
      o.h = hgt;
      o.x = cx0 - w / 2;
      o.y = cy0 - hgt / 2;
    }
    guideV.classList.toggle('is-on', snapX);
    guideH.classList.toggle('is-on', snapY);
    renderObj(k);
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    guideV.classList.remove('is-on');
    guideH.classList.remove('is-on');
    ringDeg.hidden = true;
    if (drag.changed) logWrite(drag.k, drag.mode === 'rot' ? 'rotate' : 'pos');
    drag = null;
  }
  workSheet.addEventListener('pointerup', endDrag);
  workSheet.addEventListener('pointercancel', endDrag);

  /* the arrow keys move a selected object: 4 units, 40 with Shift; one action per burst */
  var keyTimer = 0;
  Object.keys(objEls).forEach(function (k) {
    objEls[k].addEventListener('focus', function () {
      touchWork();
      select(k);
    });
    objEls[k].addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 40 : 4;
      var o = objs[k];
      if (e.key === 'ArrowLeft') o.x -= step;
      else if (e.key === 'ArrowRight') o.x += step;
      else if (e.key === 'ArrowUp') o.y -= step;
      else if (e.key === 'ArrowDown') o.y += step;
      else if (e.key === 'Escape') {
        select(null);
        objEls[k].blur();
        return;
      } else return;
      e.preventDefault();
      renderObj(k);
      clearTimeout(keyTimer);
      keyTimer = setTimeout(function () {
        logWrite(k, 'pos');
      }, 400);
    });
  });

  /* Undo puts the layout back: every object moves home on the move curve */
  function animateHome(instant) {
    var from = {};
    Object.keys(objs).forEach(function (k) {
      from[k] = Object.assign({}, objs[k]);
    });
    if (instant || reduced) {
      Object.keys(objs).forEach(function (k) {
        objs[k] = Object.assign({}, INITIAL[k]);
      });
      renderAll();
      return;
    }
    var dist = 0;
    Object.keys(objs).forEach(function (k) {
      dist = Math.max(dist, Math.hypot(from[k].x - INITIAL[k].x, from[k].y - INITIAL[k].y) / sheetScale());
    });
    var dur = Math.max(300, Math.min(700, 300 + dist / 2));
    var t = 0;
    var tick = function (dt) {
      t += dt;
      var p = move(t / dur);
      Object.keys(objs).forEach(function (k) {
        ['x', 'y', 'w', 'h', 'r'].forEach(function (f) {
          objs[k][f] = lerp(from[k][f], INITIAL[k][f], p);
        });
      });
      renderAll();
      if (t >= dur) unwant(tick);
    };
    want(tick);
  }
  $('#work-undo').addEventListener('click', function () {
    touchWork();
    select(null);
    animateHome(false);
    isCanvas = false;
    workClear();
  });

  /* the gesture shown once the band is in view, until the visitor touches the slide */
  var tweens = [];
  function tween(target, key, from, to, start, dur, ease) {
    tweens.push({ target: target, key: key, from: from, to: to, start: start, dur: dur, ease: ease });
  }
  var ghostPos = { x: 1480, y: 820, o: 0 };
  function renderGhost() {
    ghost.style.transform = 'translate(' + ghostPos.x * sheetK + 'px,' + ghostPos.y * sheetK + 'px)';
    ghost.style.opacity = String(ghostPos.o);
  }
  function workReset(clearLog) {
    tweens = [];
    Object.keys(objs).forEach(function (k) {
      objs[k] = Object.assign({}, INITIAL[k]);
    });
    renderAll();
    select(null);
    guideV.classList.remove('is-on');
    ringDeg.hidden = true;
    ghostPos = { x: 1480, y: 820, o: 0 };
    renderGhost();
    isCanvas = false;
    if (clearLog) workClear();
  }
  /* the demonstration: the picture dragged to the slide's middle row (the guide shows), then the
     title turned by 8 degrees from its stem, then Undo; 7.6 s */
  var T = INITIAL.title;
  var P = INITIAL.picture;
  var PD = { x: 850, y: 450 - P.h / 2 };
  var STEM = { x: T.x + T.w / 2, y: T.y - 26 };
  var workSeq = new Seq(7600, function () {
    workReset(true);
  });
  workSeq
    .at(300, function () {
      tween(ghostPos, 'o', 0, 1, 300, 160, arrive);
      tween(ghostPos, 'x', 1480, P.x + P.w / 2, 300, 700, move);
      tween(ghostPos, 'y', 820, P.y + P.h / 2, 300, 700, move);
    })
    .at(1100, function () {
      select('picture');
    })
    .at(1300, function () {
      tween(objs.picture, 'x', P.x, PD.x, 1300, 800, move);
      tween(objs.picture, 'y', P.y, PD.y, 1300, 800, move);
      tween(ghostPos, 'x', P.x + P.w / 2, PD.x + P.w / 2, 1300, 800, move);
      tween(ghostPos, 'y', P.y + P.h / 2, PD.y + P.h / 2, 1300, 800, move);
    })
    .at(1950, function () {
      guideH.classList.add('is-on');
    })
    .at(2150, function () {
      logWrite('picture', 'pos');
    })
    .at(2450, function () {
      guideH.classList.remove('is-on');
    })
    .at(2800, function () {
      tween(ghostPos, 'x', PD.x + P.w / 2, T.x + T.w * 0.4, 2800, 600, move);
      tween(ghostPos, 'y', PD.y + P.h / 2, T.y + T.h / 2, 2800, 600, move);
    })
    .at(3450, function () {
      select('title');
    })
    .at(3700, function () {
      tween(ghostPos, 'x', T.x + T.w * 0.4, STEM.x, 3700, 450, move);
      tween(ghostPos, 'y', T.y + T.h / 2, STEM.y, 3700, 450, move);
    })
    .at(4250, function () {
      ringDeg.hidden = false;
      tween(objs.title, 'r', 0, 8, 4250, 600, move);
      tween(ghostPos, 'x', STEM.x, STEM.x + 42, 4250, 600, move);
      tween(ghostPos, 'y', STEM.y, STEM.y + 4, 4250, 600, move);
    })
    .at(4900, function () {
      ringDeg.hidden = true;
      logWrite('title', 'rotate');
    })
    .at(6000, function () {
      tween(ghostPos, 'o', 1, 0, 6000, 180, arrive);
      tween(objs.picture, 'x', PD.x, P.x, 6100, 560, move);
      tween(objs.picture, 'y', PD.y, P.y, 6100, 560, move);
      tween(objs.title, 'r', 8, 0, 6100, 560, move);
    })
    .at(6100, function () {
      select(null);
    })
    .at(6900, function () {
      workClear();
      isCanvas = false;
    });
  workSeq.sort();
  function workTick(dt) {
    workSeq.advance(dt);
    var t = workSeq.t;
    tweens.forEach(function (tw) {
      if (t < tw.start) return;
      var p = tw.ease(clamp01((t - tw.start) / tw.dur));
      tw.target[tw.key] = lerp(tw.from, tw.to, p);
    });
    tweens = tweens.filter(function (tw) {
      return t < tw.start + tw.dur + 50;
    });
    renderGhost();
    if (ringDeg && !ringDeg.hidden) ringDeg.textContent = Math.round(objs.title.r) + '°';
    renderAll();
  }
  var workLoop = addLoop(workSheet, {
    kind: 'demo',
    play: function () {
      want(workTick);
    },
    pause: function () {
      unwant(workTick);
    },
  });

  /* the Blue Marble in the picture block develops through its dither on first view */
  var earthTone = null;
  var earthField = null;
  var earthGain = 0;
  function loadScript(src, cb) {
    var s = doc.createElement('script');
    s.src = src;
    s.onload = cb;
    doc.head.appendChild(s);
  }
  function setupEarth() {
    var c = $('[data-field="earth"]', workSheet);
    earthField = new Field(c, {
      cell: function (w) {
        return Math.max(2, Math.round(w / 150));
      },
      colorsFrom: workSheet,
      onResize: function (f) {
        earthTone = sampleTone(earthImg, f.cols, f.rows);
      },
      tone: function (u, v, t, x, y, f) {
        if (!earthTone) return 0;
        var lum = earthTone[y * f.cols + x];
        var dx = u - 0.5;
        var dy = v - 0.5;
        var inside = dx * dx + dy * dy < 0.2 ? 1 : 0;
        return (f.dark ? lum : (1 - lum) * inside) * earthGain;
      },
    });
    earthTone = sampleTone(earthImg, earthField.cols, earthField.rows);
    onResize(c, function () {
      if (earthField.resize()) earthField.draw(0);
    });
    earthField.draw(0);
  }
  /* read the tone source at cell size, cropped square around the planet */
  function sampleTone(img, cols, rows) {
    if (!img || !cols) return null;
    var cv = doc.createElement('canvas');
    cv.width = cols;
    cv.height = rows;
    var cx = cv.getContext('2d');
    var side = img.naturalHeight * 0.96;
    var sx = img.naturalWidth * 0.2725 - side / 2;
    var sy = img.naturalHeight * 0.505 - side / 2;
    cx.drawImage(img, sx, sy, side, side, 0, 0, cols, rows);
    var d = cx.getImageData(0, 0, cols, rows).data;
    var out = new Float32Array(cols * rows);
    for (var i = 0; i < out.length; i++) out[i] = Math.pow(d[i * 4] / 255, 0.9);
    return out;
  }
  var earthImg = null;
  var earthObserver = new IntersectionObserver(
    function (entries) {
      if (!entries[0].isIntersecting) return;
      earthObserver.disconnect();
      loadScript('img/earth-tone.js', function () {
        earthImg = new Image();
        earthImg.onload = function () {
          setupEarth();
          developEarth();
        };
        earthImg.src = window.TS_TONE_EARTH;
      });
    },
    { rootMargin: '400px 0px' },
  );
  earthObserver.observe(workSheet);
  function developEarth() {
    if (reduced) {
      earthGain = 1;
      earthField.draw(0);
      return;
    }
    var start = null;
    var go = function () {
      var t = 0;
      var tick = function (dt) {
        if (paused) return;
        t += dt;
        earthGain = smooth(t / 2000);
        earthField.draw(0);
        if (t >= 2000) unwant(tick);
      };
      want(tick);
    };
    var io = new IntersectionObserver(
      function (entries) {
        if (entries[0].intersectionRatio >= 0.4 && !start) {
          start = true;
          io.disconnect();
          go();
        }
      },
      { threshold: [0, 0.4] },
    );
    io.observe(workSheet);
  }
  themeListeners.push(function () {
    if (earthField) earthField.draw(0);
  });

  /* ================================================================================================
     Two people on one slide: Sam's chip, outline, flag and caret on Maya's screen, and the reverse.
     ================================================================================================ */

  var peopleEl = $('#people');
  var screens = { maya: $('.screen[data-who="maya"]', peopleEl), sam: $('.screen[data-who="sam"]', peopleEl) };
  var NAMES = { maya: 'Maya', sam: 'Sam · guest' };
  var OTHER = { maya: 'sam', sam: 'maya' };
  var TEXT0 = { title: 'Globex onboarding plan', sub: '' };
  var text = { title: TEXT0.title, sub: '' };
  var shown = { maya: { title: TEXT0.title, sub: '' }, sam: { title: TEXT0.title, sub: '' } };

  // the presence outlines sit inside their text box, so they follow its height
  Object.keys(screens).forEach(function (who) {
    $$('.presence', screens[who]).forEach(function (p) {
      var box = $('.tbox[data-box="' + p.getAttribute('data-pres') + '"]', screens[who]);
      p.style.inset = '-0.6cqw -0.8cqw';
      box.appendChild(p);
    });
  });
  function para(who, box) {
    return $('.tbox[data-box="' + box + '"] [contenteditable]', screens[who]);
  }
  function pres(who, box) {
    return $('.presence[data-pres="' + box + '"]', screens[who]);
  }
  /* write a text box: placeholder when empty, the other person's ink caret at the end when they type */
  function paint(who, box, value, caretOf) {
    var p = para(who, box);
    if (doc.activeElement === p) return;
    p.textContent = '';
    if (!value && box === 'sub') {
      var ph = doc.createElement('span');
      ph.className = 'ph';
      ph.textContent = 'Click to add subtitle';
      p.appendChild(ph);
    } else p.appendChild(doc.createTextNode(value));
    if (caretOf) {
      var c = doc.createElement('span');
      c.className = 'pcaret' + (caretOf === who ? ' is-mine' : '');
      p.appendChild(c);
    }
    shown[who][box] = value;
  }
  function presence(who, box, of) {
    // on `who`'s screen, show `of`'s outline on `box` (of === who: the own selection in blue)
    ['title', 'sub'].forEach(function (b) {
      var p = pres(who, b);
      if (b !== box) return;
      if (!of) {
        p.classList.remove('is-on');
        return;
      }
      p.classList.toggle('is-mine', of === who);
      $('.flag', p).textContent = NAMES[of];
      $('.flag', p).hidden = of === who;
      p.classList.add('is-on');
    });
  }
  function clearPresence() {
    Object.keys(screens).forEach(function (w) {
      ['title', 'sub'].forEach(function (b) {
        pres(w, b).classList.remove('is-on');
      });
    });
  }
  function slideOn(who, n, cut) {
    var a = $('[data-sheet="' + who + '-1"]', screens[who]);
    var b2 = $('[data-sheet="' + who + '-2"]', screens[who]);
    a.hidden = n !== 1;
    b2.hidden = n !== 2;
    var s = n === 1 ? a : b2;
    if (cut && !reduced) {
      s.classList.remove('is-cut');
      void s.offsetWidth;
      s.classList.add('is-cut');
    }
  }
  var samChip = $('[data-chip="sam"]', screens.maya);
  var followPlate = $('.follow-plate', screens.maya);
  function peopleReset() {
    text.title = TEXT0.title;
    text.sub = '';
    ['maya', 'sam'].forEach(function (w) {
      paint(w, 'title', text.title);
      paint(w, 'sub', '');
      slideOn(w, 1, false);
    });
    clearPresence();
    samChip.classList.add('is-away');
    samChip.classList.remove('is-followed');
    followPlate.classList.remove('is-on');
  }
  /* a person's rhythm: uneven gaps of 70 to 240 ms, a longer one at a space (LoveFrom's measured typing) */
  function gaps(str, seed) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var r = hash(i + seed, seed * 7 + 3);
      out.push(str.charAt(i) === ' ' ? 300 + r * 160 : 70 + r * 170);
    }
    return out;
  }
  var peopleSeq = new Seq(14000, peopleReset);
  peopleSeq
    .at(1300, function () {
      samChip.classList.remove('is-away');
    })
    .at(2500, function () {
      presence('sam', 'sub', 'sam');
      presence('maya', 'sub', 'sam');
      paint('sam', 'sub', '', 'sam');
      paint('maya', 'sub', '', 'sam');
    });
  (function () {
    var s = 'Prepared for Globex';
    var g = gaps(s, 11);
    var t = 3200;
    for (var i = 1; i <= s.length; i++) {
      t += g[i - 1];
      (function (i, t) {
        peopleSeq.at(t, function () {
          text.sub = s.slice(0, i);
          paint('sam', 'sub', text.sub, 'sam');
        });
        peopleSeq.at(t + 140, function () {
          paint('maya', 'sub', s.slice(0, i), 'sam');
        });
      })(i, t);
    }
  })();
  peopleSeq.at(7400, function () {
    presence('sam', 'sub', null);
    presence('maya', 'sub', null);
    paint('sam', 'sub', text.sub);
    paint('maya', 'sub', text.sub);
    presence('maya', 'title', 'maya');
    presence('sam', 'title', 'maya');
    paint('maya', 'title', text.title, 'maya');
    paint('sam', 'title', text.title, 'maya');
  });
  (function () {
    var add = ' for Q3';
    var g = gaps(add, 5);
    var t = 7700;
    for (var i = 1; i <= add.length; i++) {
      t += g[i - 1];
      (function (i, t) {
        peopleSeq.at(t, function () {
          text.title = TEXT0.title + add.slice(0, i);
          paint('maya', 'title', text.title, 'maya');
        });
        peopleSeq.at(t + 140, function () {
          paint('sam', 'title', TEXT0.title + add.slice(0, i), 'maya');
        });
      })(i, t);
    }
  })();
  peopleSeq
    .at(9500, function () {
      presence('maya', 'title', null);
      presence('sam', 'title', null);
      paint('maya', 'title', text.title);
      paint('sam', 'title', text.title);
      samChip.classList.add('is-followed');
      followPlate.classList.add('is-on');
    })
    .at(10400, function (instant) {
      slideOn('sam', 2, !instant);
    })
    .at(10640, function (instant) {
      slideOn('maya', 2, !instant);
    })
    .at(12400, function () {
      samChip.classList.remove('is-followed');
      followPlate.classList.remove('is-on');
    })
    .at(13700, function (instant) {
      slideOn('sam', 1, !instant);
      slideOn('maya', 1, !instant);
    });
  peopleSeq.sort();
  function peopleTick(dt) {
    peopleSeq.advance(dt);
  }
  var peopleLoop = addLoop($('.pair', peopleEl), {
    kind: 'demo',
    play: function () {
      want(peopleTick);
    },
    pause: function () {
      unwant(peopleTick);
    },
    onStop: function () {
      syncPauseLabel(peopleEl, peopleLoop);
    },
  });
  wireControls(peopleEl, peopleLoop, peopleSeq);
  peopleReset();
  // the still under reduced motion: Sam's words on both screens, his outline and flag on Maya's
  if (reduced) peopleSeq.seek(7300);

  /* the visitor types as Maya or as Sam; the other screen follows with the flag and the caret */
  var mirrorTimer = 0;
  $$('.tbox [contenteditable]', peopleEl).forEach(function (p) {
    var who = p.closest('.screen').getAttribute('data-who');
    var box = p.closest('.tbox').getAttribute('data-box');
    p.addEventListener('focus', function () {
      stopLoop(peopleLoop);
      slideOn(who, 1, false);
      slideOn(OTHER[who], 1, false);
      followPlate.classList.remove('is-on');
      samChip.classList.remove('is-away', 'is-followed');
      clearPresence();
      $$('.pcaret', p).forEach(function (c) {
        c.remove();
      });
      if ($('.ph', p)) p.textContent = '';
      presence(who, box, who);
      presence(OTHER[who], box, who);
      paint(OTHER[who], box, p.textContent, who);
    });
    p.addEventListener('input', function () {
      var value = p.textContent;
      text[box] = value;
      clearTimeout(mirrorTimer);
      mirrorTimer = setTimeout(function () {
        paint(OTHER[who], box, value, who);
      }, 120);
    });
    p.addEventListener('blur', function () {
      presence(who, box, null);
      presence(OTHER[who], box, null);
      paint(OTHER[who], box, p.textContent);
      if (!p.textContent && box === 'sub') paint(who, 'sub', '');
    });
    p.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        p.blur();
      }
    });
  });

  /* ================================================================================================
     Present from the browser: the presenter console and the audience screen, slide 4 skipped.
     ================================================================================================ */

  var presentEl = $('#present');
  var presenter = $('.presenter', presentEl);
  var SHOW = [0, 1, 2, 4];
  var NOTES = [
    'Open with the date of the first release. Ask who on the Acme team owns the brand kit.',
    'Week 2 is where most questions come up. Leave time for the logo.',
    'Pause here. This is the sentence the sellers should repeat.',
    "Agree on Friday's call before you end the show.",
  ];
  var showAt = 0;
  var timerMs = 0;
  var timerOn = false;
  var nextRule = $('.next-btn .rule', presentEl);
  var slots = {
    current: $('[data-show="current"]', presentEl),
    next: $('[data-show="next"]', presentEl),
    audience: $('[data-show="audience"]', presentEl),
    notes: $('[data-show="notes"]', presentEl),
  };
  function fill(slot, idx, cut) {
    slot.textContent = '';
    if (idx === null) {
      var end = doc.createElement('div');
      end.className = 'sheet';
      end.innerHTML = '<div class="sl" style="display:grid;place-items:center"><p class="s-p s-muted">The end of the show</p></div>';
      slot.appendChild(end);
      return;
    }
    var s = staticCopy(PRISTINE[idx]);
    s.setAttribute('aria-hidden', 'true');
    if (cut && !reduced) s.classList.add('is-cut');
    slot.appendChild(s);
  }
  function renderShow(cut) {
    fill(slots.current, SHOW[showAt], cut);
    fill(slots.audience, SHOW[showAt], cut);
    fill(slots.next, showAt + 1 < SHOW.length ? SHOW[showAt + 1] : null, false);
    slots.notes.textContent = NOTES[showAt];
    $('.count', presentEl).textContent = 'Slide ' + (showAt + 1) + ' of ' + SHOW.length;
    paintStatics(presentEl);
  }
  function go(delta, wrap) {
    var n = showAt + delta;
    if (wrap) n = (n + SHOW.length) % SHOW.length;
    n = Math.max(0, Math.min(SHOW.length - 1, n));
    if (n === showAt) return;
    showAt = n;
    renderShow(true);
  }
  function touchShow() {
    startTimer();
    if (!presentLoop.stopped) {
      stopLoop(presentLoop);
      nextRule.style.transform = 'scaleX(0)';
    }
  }
  $('[data-p="next"]', presentEl).addEventListener('click', function () {
    touchShow();
    go(1);
  });
  $('[data-p="prev"]', presentEl).addEventListener('click', function () {
    touchShow();
    go(-1);
  });
  presenter.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') go(1);
    else if (k === 'ArrowLeft' || k === 'PageUp') go(-1);
    else if (k === 'Home') go(-showAt);
    else if (k === 'End') go(SHOW.length - 1 - showAt);
    else return;
    e.preventDefault();
    touchShow();
  });
  function fmt(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    s = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  /* the presenter's clock: a process, counted on a half second interval while the band is on screen,
     never on the frame clock (it must not keep the page drawing) */
  var timerEl = $('.timer', presentEl);
  var timerLast = 0;
  function startTimer() {
    if (timerOn) return;
    timerOn = true;
    timerLast = performance.now();
    setInterval(function () {
      var now = performance.now();
      var dt = now - timerLast;
      timerLast = now;
      if (paused || doc.visibilityState !== 'visible' || !(presentLoop.vis > 0)) return;
      timerMs += dt;
      var s = fmt(timerMs);
      if (timerEl.textContent !== s) timerEl.textContent = s;
    }, 500);
  }
  var advanceMs = 0;
  function presentTick(dt) {
    advanceMs += dt;
    nextRule.style.transform = 'scaleX(' + clamp01(advanceMs / 4000) + ')';
    if (advanceMs >= 4000) {
      advanceMs = 0;
      go(1, true);
    }
  }
  var presentLoop = addLoop($('.show', presentEl), {
    kind: 'demo',
    play: function () {
      startTimer();
      want(presentTick);
    },
    pause: function () {
      unwant(presentTick);
    },
  });
  whenNear(presentEl, function () {
    renderShow(false);
  });

  /* ================================================================================================
     Export compared pixel to pixel: the slide in the browser over the page of the exported file.
     ================================================================================================ */

  var compare = $('#compare');
  var live = $('.live', compare);
  whenNear(compare, function () {
    live.appendChild(staticCopy(PRISTINE[3]));
  });
  var handle = $('.handle', compare);
  var loupe = $('.loupe', compare);
  var loupeRead = $('.loupe-read', loupe);
  var cut = 50;
  function setCut(v) {
    cut = Math.max(0, Math.min(100, v));
    compare.style.setProperty('--cut', cut + '%');
    handle.setAttribute('aria-valuenow', String(Math.round(cut)));
    handle.setAttribute('aria-valuetext', Math.round(cut) + ' percent from the left');
  }
  var seamDrag = null;
  handle.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    e.stopPropagation();
    seamDrag = e.pointerId;
    handle.setPointerCapture(e.pointerId);
    handle.focus({ preventScroll: true });
  });
  handle.addEventListener('pointermove', function (e) {
    if (seamDrag !== e.pointerId) return;
    var r = compare.getBoundingClientRect();
    setCut(((e.clientX - r.left) / r.width) * 100);
  });
  handle.addEventListener('pointerup', function () {
    seamDrag = null;
  });
  handle.addEventListener('keydown', function (e) {
    var step = e.shiftKey ? 10 : 2;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setCut(cut - step);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setCut(cut + step);
    else if (e.key === 'Home') setCut(0);
    else if (e.key === 'End') setCut(100);
    else return;
    e.preventDefault();
  });
  // the seam sweeps in once from the right edge when the figure first comes into view
  var sweepObserver = new IntersectionObserver(
    function (entries) {
      if (entries[0].intersectionRatio < 0.5) return;
      sweepObserver.disconnect();
      if (!motionAllowed()) return;
      var t = 0;
      var tick = function (dt) {
        t += dt;
        setCut(lerp(96, 50, arrive(t / 900)));
        if (t >= 900) unwant(tick);
      };
      setCut(96);
      want(tick);
    },
    { threshold: [0, 0.5] },
  );
  sweepObserver.observe(compare);

  /* the loupe: 14 by 14 pixels of each raster at ten times, and the count of pixels that differ */
  var pages = null;
  var pagesReady = false;
  var pagesLoading = false;
  var loupeCanvases = $$('canvas', loupe);
  function ensurePages(cb) {
    if (pagesReady) return cb();
    if (pagesLoading) return;
    pagesLoading = true;
    loadScript('img/export-pages.js', function () {
      var src = window.TS_EXPORT_PAGES;
      var done = 0;
      pages = { light: new Image(), dark: new Image() };
      ['light', 'dark'].forEach(function (k) {
        pages[k].onload = function () {
          if (++done === 2) {
            pagesReady = true;
            cb();
          }
        };
        pages[k].src = src[k];
      });
    });
  }
  var lastPoint = null;
  function drawLoupe(clientX, clientY) {
    var r = compare.getBoundingClientRect();
    var px = clientX - r.left;
    var py = clientY - r.top;
    if (px < 0 || py < 0 || px > r.width || py > r.height) {
      loupe.classList.remove('is-on');
      return;
    }
    lastPoint = [clientX, clientY];
    var img = pages[theme()];
    var sx = Math.round((px / r.width) * 1600) - 7;
    var sy = Math.round((py / r.height) * 900) - 7;
    sx = Math.max(0, Math.min(1600 - 14, sx));
    sy = Math.max(0, Math.min(900 - 14, sy));
    var data = loupeCanvases.map(function (c) {
      var x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      x.clearRect(0, 0, 14, 14);
      x.drawImage(img, sx, sy, 14, 14, 0, 0, 14, 14);
      try {
        return x.getImageData(0, 0, 14, 14).data;
      } catch (err) {
        return null;
      }
    });
    if (data[0] && data[1]) {
      var diff = 0;
      for (var i = 0; i < data[0].length; i += 4) {
        if (Math.abs(data[0][i] - data[1][i]) > 25 || Math.abs(data[0][i + 1] - data[1][i + 1]) > 25 || Math.abs(data[0][i + 2] - data[1][i + 2]) > 25) diff++;
      }
      loupeRead.textContent = diff + ' of 196 pixels differ at x ' + (sx + 7) + ', y ' + (sy + 7) + '.';
    }
    var lw = loupe.offsetWidth || 320;
    var lh = loupe.offsetHeight || 190;
    var left = px + 24;
    if (left + lw > r.width - 8) left = px - lw - 24;
    var top = py - lh - 18;
    if (top < 8) top = Math.min(r.height - lh - 8, py + 24);
    loupe.style.left = Math.max(8, left) + 'px';
    loupe.style.top = Math.max(8, top) + 'px';
    loupe.classList.add('is-on');
  }
  compare.addEventListener('pointermove', function (e) {
    if (seamDrag !== null || e.target.closest('.handle')) {
      loupe.classList.remove('is-on');
      return;
    }
    if (e.pointerType === 'touch' && !e.buttons) return;
    var x = e.clientX;
    var y = e.clientY;
    if (pagesReady) drawLoupe(x, y);
    else
      ensurePages(function () {
        drawLoupe(x, y);
      });
  });
  compare.addEventListener('pointerdown', function (e) {
    if (e.target === handle) return;
    var x = e.clientX;
    var y = e.clientY;
    ensurePages(function () {
      drawLoupe(x, y);
    });
  });
  compare.addEventListener('pointerleave', function () {
    loupe.classList.remove('is-on');
  });
  compare.addEventListener('pointerup', function (e) {
    if (e.pointerType === 'touch') loupe.classList.remove('is-on');
  });
  themeListeners.push(function () {
    if (pagesReady && lastPoint && loupe.classList.contains('is-on')) drawLoupe(lastPoint[0], lastPoint[1]);
  });

  /* ================================================================================================
     The animated pattern: moving in the editor and the show; the still frame is what an export carries.
     ================================================================================================ */

  var patternSheet = $('#pattern-sheet');
  var patternField = new Field($('[data-field="pattern"]', patternSheet), {
    cell: function (w) {
      return Math.max(2, Math.round(w / 300));
    },
    tone: patternTone,
    colorsFrom: patternSheet,
  });
  patternField.stillTime = 0;
  whenNear(patternSheet, function () {
    patternField.draw(0);
  });
  onResize(patternSheet, function () {
    if (patternField.resize()) patternField.draw(patternField.t);
  });
  var patternMoving = true;
  var patternClock = 0;
  var patternAcc = 0;
  function patternTick(dt) {
    patternClock += dt;
    patternAcc += dt;
    if (patternAcc >= 41) {
      patternAcc = 0;
      patternField.draw(patternClock);
    }
  }
  var patternLoop = addLoop(patternSheet, {
    kind: 'field',
    play: function () {
      want(patternTick);
    },
    pause: function () {
      unwant(patternTick);
    },
  });
  $$('[data-pat]', $('#patterns')).forEach(function (b) {
    b.addEventListener('click', function () {
      patternMoving = b.getAttribute('data-pat') === 'moving';
      $$('[data-pat]', $('#patterns')).forEach(function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
      patternLoop.held = !patternMoving;
      if (!patternMoving) {
        patternClock = 0;
        patternField.draw(0);
      }
      schedule();
    });
  });

  /* ================================================================================================
     The chapter fields: a sparse field that gathers into the next chapter's glyph, holds, and thins.
     ================================================================================================ */

  /* a chapter's glyph at the strip's cell size: the crisp shape (ink) and a blurred copy (its halo,
     which the Bayer screen prints as a ring of lighter tone) */
  function glyphMap(name, cols, rows) {
    function render(blur) {
      var cv = doc.createElement('canvas');
      cv.width = cols;
      cv.height = rows;
      var g = cv.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, cols, rows);
      if (blur && 'filter' in g) g.filter = 'blur(' + blur + 'px)';
      g.fillStyle = '#000';
      g.strokeStyle = '#000';
      var H = Math.round(rows * 0.66);
      var cx = Math.round(cols / 2);
      var cy = Math.round(rows / 2);
      var lw = Math.max(1, Math.round(rows * 0.06));
      g.lineWidth = lw;
      function sq(x, y, s) {
        g.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
      }
      function box(x, y, w, h) {
        g.fillRect(x, y, w, lw);
        g.fillRect(x, y + h - lw, w, lw);
        g.fillRect(x, y, lw, h);
        g.fillRect(x + w - lw, y, lw, h);
      }
      var s = Math.max(3, Math.round(rows * 0.14));
      if (name === 'select') {
        var w = Math.round(H * 2.4);
        var h = Math.round(H * 0.72);
        var x0 = cx - Math.round(w / 2);
        var y0 = cy - Math.round(h / 2) + Math.round(H * 0.14);
        box(x0, y0, w, h);
        [[x0, y0], [x0 + w / 2, y0], [x0 + w, y0], [x0 + w, y0 + h / 2], [x0 + w, y0 + h], [x0 + w / 2, y0 + h], [x0, y0 + h], [x0, y0 + h / 2]].forEach(function (p) {
          sq(p[0], p[1], s);
        });
        g.fillRect(cx - Math.floor(lw / 2), y0 - Math.round(H * 0.3), lw, Math.round(H * 0.3));
        sq(cx, y0 - Math.round(H * 0.3), s);
        g.fillRect(x0, y0 - Math.round(H * 0.3), Math.round(H * 0.62), Math.round(H * 0.22));
      } else if (name === 'people') {
        [[-1, 0.95], [1, 0.62]].forEach(function (p, i) {
          var x = cx + p[0] * Math.round(H * 0.95) - (i ? 0 : Math.round(H * 0.55));
          g.fillRect(x, cy - Math.round(H / 2) + Math.round(H * 0.24), lw, Math.round(H * 0.76));
          g.fillRect(x, cy - Math.round(H / 2), Math.round(H * p[1]), Math.round(H * 0.26));
        });
      } else if (name === 'play') {
        g.beginPath();
        g.moveTo(cx - H * 0.36, cy - H / 2);
        g.lineTo(cx + H * 0.5, cy);
        g.lineTo(cx - H * 0.36, cy + H / 2);
        g.closePath();
        g.fill();
      } else if (name === 'pages') {
        var pw = Math.round(H * 1.5);
        var ph = Math.round(pw * 0.5625);
        var gap = Math.round(H * 0.55);
        [-1, 1].forEach(function (side) {
          var x = side < 0 ? cx - Math.round(gap / 2) - pw : cx + Math.round(gap / 2);
          var y = cy - Math.round(ph / 2);
          box(x, y, pw, ph);
          for (var r = 0; r < 3; r++) g.fillRect(x + Math.round(pw * 0.14), y + Math.round(ph * 0.28) + r * Math.round(ph * 0.2), Math.round(pw * (r === 0 ? 0.42 : 0.66)), lw);
        });
        g.fillRect(cx - Math.floor(lw / 2), cy - Math.round(H / 2), lw, H);
        sq(cx, cy, s);
      } else if (name === 'pattern') {
        var rad = H * 0.55;
        var grd = g.createRadialGradient(cx - rad * 0.4, cy - rad * 0.4, rad * 0.05, cx, cy, rad);
        grd.addColorStop(0, '#d0d0d0');
        grd.addColorStop(0.55, '#3a3a3a');
        grd.addColorStop(1, '#000');
        g.fillStyle = grd;
        g.beginPath();
        g.arc(cx, cy, rad, 0, Math.PI * 2);
        g.fill();
      } else if (name === 'rows') {
        var rw = Math.round(H * 3.4);
        var left = cx - Math.round(rw / 2);
        for (var k = 0; k < 4; k++) {
          var y = cy - Math.round(H / 2) + Math.round((k * H) / 3);
          g.fillRect(left, y, rw, lw);
          if (k < 3) {
            sq(left + s, y + Math.round(H / 6), s);
            g.fillRect(left + Math.round(H * 0.6), y + Math.round(H / 6) - Math.floor(lw / 2), Math.round(rw * (k === 1 ? 0.4 : 0.58)), lw);
          }
        }
      }
      var d = g.getImageData(0, 0, cols, rows).data;
      var out = new Float32Array(cols * rows);
      for (var i = 0; i < out.length; i++) out[i] = 1 - d[i * 4] / 255;
      return out;
    }
    return { ink: render(0), halo: render(Math.max(2, rows * 0.12)) };
  }
  var CYCLE = 12000;
  function gatherAt(t) {
    // gather 0 to 1.5 s on the tone curve, hold to 7 s, thin 7 to 8.5 s, rest to 12 s
    var p = t % CYCLE;
    if (p < 1500) return smooth(p / 1500);
    if (p < 7000) return 1;
    if (p < 8500) return 1 - smooth((p - 7000) / 1500);
    return 0;
  }
  var stripFields = [];
  $$('.field-strip canvas').forEach(function (c) {
    whenNear(c.parentElement, function () {
      setupStrip(c);
      schedule();
    });
  });
  function setupStrip(c) {
    var name = c.getAttribute('data-glyph');
    var state = { glyph: null, clock: 0, acc: 0, s: 1, name: name };
    var f = new Field(c, {
      cell: function () {
        return innerWidth <= 720 ? 3 : 4;
      },
      onResize: function (fl) {
        state.glyph = glyphMap(name, fl.cols, fl.rows);
      },
      tone: function (u, v, t, x, y, fl) {
        // the scattered state: a low wave of tone the Bayer screen prints as a regular lattice
        var wave = 0.055 + 0.085 * (0.5 + 0.5 * Math.sin(u * 10.5 - t * 0.00018 + Math.sin(v * 3 + u * 2) * 0.7));
        var edge = Math.min(1, Math.min(u, 1 - u) * 7);
        wave *= 0.3 + 0.7 * edge;
        if (!state.glyph) return wave;
        var i = y * fl.cols + x;
        var gathered = Math.max(state.glyph.ink[i], state.glyph.halo[i] * 0.42, wave * 0.3);
        return wave + (gathered - wave) * state.s;
      },
    });
    state.glyph = glyphMap(name, f.cols, f.rows);
    f.stillTime = 0;
    f.draw(0);
    onResize(c, function () {
      if (f.resize()) f.draw(f.t);
    });
    function tick(dt) {
      state.clock += dt;
      state.acc += dt;
      state.s = gatherAt(state.clock);
      if (state.acc >= 33) {
        state.acc = 0;
        f.draw(state.clock);
      }
    }
    var loop = addLoop(c.parentElement, {
      kind: 'field',
      play: function () {
        want(tick);
      },
      pause: function () {
        unwant(tick);
      },
    });
    // the first pose is set when the observer arms: scattered, so the first view gathers
    if (motionAllowed()) {
      state.s = 0;
      f.draw(0);
    }
    loop.f = f;
    stripFields.push({ state: state, f: f, loop: loop });
  }

  /* ================================================================================================
     The mark draws its seven bars once, in reading order, when the license band comes into view.
     ================================================================================================ */

  var bigMark = $('#big-mark');
  var bars = $$('path', bigMark);
  if (!reduced && 'animate' in Element.prototype) {
    bars.forEach(function (p) {
      p.style.transform = 'scaleX(0)';
    });
    var markObserver = new IntersectionObserver(
      function (entries) {
        if (entries[0].intersectionRatio < 0.5) return;
        markObserver.disconnect();
        bars.forEach(function (p, i) {
          p.style.transform = '';
          if (!motionAllowed()) return;
          p.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
            duration: 600,
            delay: i * 60,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'backwards',
          });
        });
      },
      { threshold: [0, 0.5] },
    );
    markObserver.observe(bigMark);
  }

  /* ---------- start: the first screen is still; the opener's field rises once the page has loaded ---------- */

  function afterLoad() {
    var go = function () {
      if (reduced) {
        openerField.gain = 1;
        openerField.draw(0);
        return;
      }
      openerLoop.held = false;
      agentLoop.held = false;
      syncPauseLabel(agentEl, agentLoop);
      schedule();
      if (!motionAllowed()) {
        openerField.gain = 1;
        openerField.draw(0);
      }
    };
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 1500 });
    else setTimeout(go, 300);
  }
  if (doc.readyState === 'complete') afterLoad();
  else addEventListener('load', afterLoad);
  if (reduced) {
    fields.forEach(function (f) {
      f.still();
    });
  }
  schedule();
  root.setAttribute('data-hydrated', '');

  /* The capture harness's handle (docs/gslides-parity/landing/direction-b.md, the pictures): a manual
     clock that advances every running tick by exact milliseconds, so a frame strip is labelled with
     timeline time. Nothing on the page calls it; production leaves it out. */
  window.__ts = {
    manual: function (on) {
      manualClock = on;
      if (!on && ticks.size && !rafId) {
        lastNow = performance.now();
        rafId = requestAnimationFrame(frame);
      }
    },
    step: function (ms) {
      var left = ms;
      while (left > 0) {
        var dt = Math.min(16, left);
        left -= dt;
        Array.from(ticks).forEach(function (fn) {
          fn(dt, 0);
        });
      }
    },
    seqs: { agent: agentSeq, people: peopleSeq, work: workSeq },
    loops: { agent: agentLoop, people: peopleLoop, work: workLoop, present: presentLoop, pattern: patternLoop, opener: openerLoop },
    restartOpener: function () {
      openerEnter = 0;
      openerClock = 0;
      openerStep = -1;
      openerField.gain = 0;
      openerField.draw(0);
    },
    restartEarth: function () {
      earthGain = 0;
      if (earthField) earthField.draw(0);
    },
    developEarth: function (p) {
      earthGain = smooth(p);
      if (earthField) earthField.draw(0);
    },
    earthReady: function () {
      return !!earthField && !!earthTone;
    },
    fieldLoops: function () {
      return loops.filter(function (l) {
        return l.kind === 'field';
      });
    },
    schedule: schedule,
    strips: stripFields,
    restartShow: function () {
      showAt = 0;
      advanceMs = 0;
      renderShow(false);
    },
    /* every band in the state it shows once the visitor has reached it, for the full page pictures */
    settle: function () {
      stripFields.forEach(function (s) {
        s.state.s = 1;
        s.state.clock = 3000;
        s.f.draw(3000);
      });
      earthGain = 1;
      if (earthField) earthField.draw(0);
    },
  };
})();
