/* Brand direction C mockups: the builders. Static pages for judging, drawn from the product's own
   glyphs and marks (data.js, generated from the tree) and its tokens (tokens.css, brand.css, with
   c-tokens.css on top). Nothing here is product code. */
(function () {
  const D = window.C_DATA;
  const C = {};

  C.icon = function (name, cls) {
    const paths = D.icons[name];
    if (!paths) throw new Error('no icon ' + name);
    const body = paths
      .map(function (p) {
        const t = p.translate ? ' transform="translate(' + p.translate[0] + ' ' + p.translate[1] + ')"' : '';
        if (p.stroke) {
          return '<path d="' + p.d + '" fill="none" stroke="currentColor" stroke-width="' + (p.width || 1.5) + '" stroke-linecap="round" stroke-linejoin="round"' + t + '/>';
        }
        return '<path d="' + p.d + '"' + (p.evenodd ? ' fill-rule="evenodd" clip-rule="evenodd"' : '') + t + '/>';
      })
      .join('');
    return '<svg class="c-ic ' + (cls || '') + '" viewBox="0 0 20 20" aria-hidden="true">' + body + '</svg>';
  };

  /* the mark: the solid path below 64 px, the cells of markBits(32) from 64 px (docs/brand.md 1) */
  C.mark = function (size) {
    if (size < 64) {
      return '<svg class="c-mark" viewBox="0 0 16 16" width="' + size + '" height="' + size + '" aria-hidden="true"><path fill-rule="evenodd" d="' + D.mark.solid + '"/></svg>';
    }
    const n = size >= 256 ? 64 : 32;
    const rects = n === 64 ? D.mark.cells64 : D.mark.cells32;
    return '<svg class="c-mark" viewBox="0 0 ' + n + ' ' + n + '" width="' + size + '" height="' + size + '" aria-hidden="true">' + rects + '</svg>';
  };

  C.word = function (height) {
    /* the word as the tree's outlines (wordmark-outlines.svg), set to a cap height */
    return '<svg class="c-mark" viewBox="64 0 289 66" height="' + height + '" width="' + Math.round((289 / 66) * height) + '" aria-hidden="true"><path transform="' + D.word.transform + '" d="' + D.word.d + '"/></svg>';
  };

  C.lockupSvg = function (height) {
    const w = Math.round((353 / 66) * height);
    return '<svg class="c-mark" viewBox="0 0 353 66" width="' + w + '" height="' + height + '" aria-hidden="true"><path transform="translate(0 3) scale(3)" fill-rule="evenodd" d="' + D.mark.solid + '"/><path transform="' + D.word.transform + '" d="' + D.word.d + '"/></svg>';
  };

  C.gtMark = function (w, h) {
    return '<svg viewBox="' + D.gtMark.viewBox + '" width="' + w + '" height="' + h + '" fill="currentColor" aria-hidden="true">' + D.gtMark.body + '</svg>';
  };

  /* round three's generated identity chip, a fixed pattern for the mock */
  C.chip = function (seed) {
    let s = seed || 7;
    let cells = '';
    for (let i = 0; i < 36; i += 1) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const x = i % 6;
      const mirror = x > 2 ? 5 - x : x;
      const bit = ((s >> 7) + mirror * 3 + Math.floor(i / 6)) % 3 === 0;
      cells += '<i class="' + (bit ? 'on' : '') + '"></i>';
    }
    return '<span class="c-chip" aria-label="You">' + cells + '</span>';
  };

  /* the Google G, the standard colour mark (developers.google.com/identity/branding-guidelines, read 2026-10-01) */
  C.googleG = function (size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  };

  /* a slide at scale k: the sheet theme's rails, rules and crosses, a title, the counter; no GT mark, no wordmark */
  C.slide = function (o) {
    const k = o.k;
    const w = 1600 * k;
    const h = 900 * k;
    let frame = '';
    frame += '<i class="r" style="left:56px;top:0;width:1px;height:900px"></i><i class="r" style="right:56px;top:0;width:1px;height:900px"></i>';
    frame += '<i class="r" style="left:0;top:56px;width:1600px;height:1px"></i><i class="r" style="left:0;bottom:56px;width:1600px;height:1px"></i>';
    frame += '<i class="x" style="left:51px;top:51px"></i><i class="x" style="right:51px;top:51px"></i><i class="x" style="left:51px;bottom:51px"></i><i class="x" style="right:51px;bottom:51px"></i>';
    if (o.gt) {
      return '<div class="c-sheet" style="width:' + w + 'px;height:' + h + 'px"><div class="c-sheet-in is-gt" style="transform:scale(' + k + ')"><div style="position:absolute;inset:0;display:grid;place-items:center;color:#f2f2f0">' + C.gtMark(330, 210) + '</div></div></div>';
    }
    return (
      '<div class="c-sheet" style="width:' + w + 'px;height:' + h + 'px"><div class="c-sheet-in" style="transform:scale(' + k + ')">' + frame +
      (o.title ? '<h1>' + o.title + '</h1>' : '') + (o.sub ? '<p class="sub">' + o.sub + '</p>' : '') +
      (o.counter ? '<span class="counter">' + o.counter + '</span>' : '') + '</div></div>'
    );
  };

  /* registration crosses wherever a seam meets a rail (slide 49: a 9 px cross with 1 px arms) */
  C.crosses = function () {
    const rails = document.querySelector('.c-rails');
    if (!rails) return;
    const r = rails.getBoundingClientRect();
    const xs = [r.left, r.right - 1];
    document.querySelectorAll('.c-seam').forEach(function (seam) {
      const s = seam.getBoundingClientRect();
      const y = s.top + window.scrollY;
      xs.forEach(function (x) {
        const c = document.createElement('i');
        c.className = 'c-cross';
        c.style.left = x - 4 + 'px';
        c.style.top = y - 4 + 'px';
        document.body.appendChild(c);
      });
    });
  };

  /* compact: the picture's plate folds into a 32 px paper key with the information glyph, the GT plate's
     FieldMoodPlate pattern drawn square; a tap opens the same title and credit */
  C.field = function (name, cls, credit, compact, extra) {
    let plate = '';
    if (credit && compact) {
      plate = '<button class="c-credit-key" aria-label="About this picture: ' + credit.title + '">' + C.icon('information-circle') + '</button>';
    } else if (credit) {
      plate = '<div class="c-credit"><b>' + credit.title + '</b><span>' + credit.credit + '</span></div>';
    }
    return (
      '<div class="c-field ' + cls + '">' +
      '<img class="is-light" src="assets/field-' + name + '-light.png" alt="">' +
      '<img class="is-dark" src="assets/field-' + name + '-dark.png" alt="">' +
      plate + (extra || '') +
      '</div>'
    );
  };

  C.themeGlyph = function () {
    const dark = document.documentElement.dataset.theme === 'dark';
    return '<button class="c-glyph" aria-label="' + (dark ? 'Switch to light' : 'Switch to dark') + '">' + (dark ? '◑' : '◐') + '</button>';
  };

  window.C = C;
})();
