/* The mocks' printer: a picture or a lit sphere through the 8 by 8 Bayer screen at 2 px cells, in
   the page's ink on its paper (the dark areas print, so the dots are the same in both appearances
   and only the colours swap), as the landing prints the Blue Marble and the lighthouse. A research file, never served. */
(function () {
  const B = [
    0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28,
    52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39,
    13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
  ];
  const dark = document.documentElement.dataset.theme === 'dark';
  const inkOf = (el) => getComputedStyle(el).getPropertyValue('--pt-ink').trim();

  function paint(canvas, tone) {
    if (!canvas.clientWidth || !canvas.clientHeight) return;
    const cell = Number(canvas.dataset.cell || 2);
    const w = Math.max(1, Math.round(canvas.clientWidth / cell));
    const h = Math.max(1, Math.round(canvas.clientHeight / cell));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const out = ctx.createImageData(w, h);
    const hex = inkOf(canvas).replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let t = tone(x / w, y / h, x, y, w, h); // 0 dark .. 1 bright, or -1 for nothing
        if (t < 0) continue;
        const v = 1 - t; // the share of ink: the same dots in both appearances, the colours swap
        const th = (B[(y % 8) * 8 + (x % 8)] + 0.5) / 64;
        if (v > th) {
          const i = (y * w + x) * 4;
          out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b; out.data[i + 3] = 255;
        }
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  function sphere(canvas) {
    const cx = Number(canvas.dataset.cx || 0.5), cy = Number(canvas.dataset.cy || 0.5);
    const rad = Number(canvas.dataset.r || 0.42);
    paint(canvas, (u, v, x, y, w, h) => {
      const k = w / h;
      const dx = (u - cx) * k / (rad * k > 0 ? 1 : 1), dy = v - cy;
      const d = Math.sqrt(((u - cx) * w) ** 2 + ((v - cy) * h) ** 2) / (rad * h);
      if (d > 1) return -1;
      const z = Math.sqrt(1 - d * d);
      const nx = ((u - cx) * w) / (rad * h), ny = ((v - cy) * h) / (rad * h);
      const l = Math.max(0, -0.55 * nx - 0.5 * ny + 0.67 * z);
      return 0.08 + 0.9 * l;
    });
  }

  function raw(canvas) {
    // a picture that is already a 1 bit print (the Blue Marble twin): scaled by whole cells, never re-screened
    const img = new Image();
    img.onload = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const [sx, sy, sw, sh] = (canvas.dataset.crop || `0,0,${img.width},${img.height}`).split(',').map(Number);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h);
      const hex = inkOf(canvas).replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
      for (let i = 0; i < d.data.length; i += 4) {
        const l = (d.data[i] + d.data[i + 1] + d.data[i + 2]) / 765;
        if (l < 0.5) { d.data[i] = r; d.data[i + 1] = g; d.data[i + 2] = b; d.data[i + 3] = 255; }
        else d.data[i + 3] = 0;
      }
      ctx.putImageData(d, 0, 0);
    };
    img.src = canvas.dataset.src;
  }

  function picture(canvas) {
    const img = new Image();
    img.onload = () => {
      const cell = Number(canvas.dataset.cell || 2);
      const w = Math.max(1, Math.round(canvas.clientWidth / cell));
      const h = Math.max(1, Math.round(canvas.clientHeight / cell));
      if (!canvas.clientWidth || !canvas.clientHeight) return;
      const off = document.createElement('canvas');
      off.width = w; off.height = h;
      const o = off.getContext('2d');
      if (canvas.dataset.crop) {
        const [sx, sy, sw, sh] = canvas.dataset.crop.split(',').map(Number);
        o.fillStyle = '#fff';
        o.fillRect(0, 0, w, h);
        o.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      } else {
        const s = Math.max(w / img.width, h / img.height);
        const px = Number(canvas.dataset.px || 0.5), py = Number(canvas.dataset.py || 0.5);
        const dw = img.width * s, dh = img.height * s;
        o.drawImage(img, (w - dw) * px, (h - dh) * py, dw, dh);
      }
      const data = o.getImageData(0, 0, w, h).data;
      const gamma = Number(canvas.dataset.gamma || 1);
      const lift = Number(canvas.dataset.lift || 0);
      paint(canvas, (u, v, x, y) => {
        const i = (y * w + x) * 4;
        const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
        return Math.min(1, Math.pow(l, gamma) + lift);
      });
    };
    img.src = canvas.dataset.src;
  }

  function field(canvas) {
    // the opener field: a lit sphere off the right edge, fading to a sparse screen
    const cx = Number(canvas.dataset.cx || 0.9), cy = Number(canvas.dataset.cy || 1.0), rad = Number(canvas.dataset.r || 0.9);
    paint(canvas, (u, v, x, y, w, h) => {
      const d = Math.sqrt(((u - cx) * w) ** 2 + ((v - cy) * h) ** 2) / (rad * h);
      if (d > 1.35) return 1;
      if (d > 1) return 1 - 0.18 * (1.35 - d) / 0.35;
      const z = Math.sqrt(1 - d * d);
      const nx = ((u - cx) * w) / (rad * h), ny = ((v - cy) * h) / (rad * h);
      return 0.15 + 0.85 * Math.max(0, -0.6 * nx - 0.45 * ny + 0.66 * z);
    });
  }

  function run() {
    document.querySelectorAll('canvas[data-dither]').forEach((c) => {
      const kind = c.dataset.dither;
      if (kind === 'sphere') sphere(c);
      else if (kind === 'field') field(c);
      else if (kind === 'raw') raw(c);
      else picture(c);
    });
  }
  document.querySelectorAll('.term-body').forEach((e) => (e.scrollTop = e.scrollHeight));
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
})();
