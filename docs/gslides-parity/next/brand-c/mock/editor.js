/* Brand direction C: the editor's default view with one slide open, drawn from the tree's own rows
   (tokens.css --pt-title-h 44, --pt-menu-h 28, --pt-tool-h 40, the 256 px filmstrip, --pt-notes-h 64)
   with the clutter audit's cuts applied: one status phrase, Assist as a word with no sparkle, no
   pointer toggle on the toolbar, no GT mark or wordmark on the customer's slide. */
(function () {
  const C = window.C;
  /* the Text box glyph is drawn from the thing itself (icons.tsx header: where Heroicons has no symbol) */
  const T_GLYPH = '<svg class="c-ic" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4h12v2.5h-4.75V16h-2.5V6.5H4z"/></svg>';
  const tool = function (inner, label, extra) {
    return '<button class="e-tool ' + (extra || '') + '" aria-label="' + label + '">' + inner + '</button>';
  };
  const drop = function (inner, label) {
    return '<span class="e-drop">' + tool(inner, label) + '<button class="e-tool is-arrow" aria-label="' + label + ' options">' + C.icon('chevron-down') + '</button></span>';
  };
  const sep = '<i class="e-sep"></i>';
  const SLIDE = { title: 'Q4 board update', sub: 'Prepared for the board meeting on 14 October 2026', counter: '01 / 01' };

  function wide() {
    const title =
      '<div class="e-title">' +
      '<a class="e-home" href="#" aria-label="Your presentations">' + C.mark(24) + '</a>' +
      '<span class="e-name">Q4 board update</span>' +
      '<button class="e-status">Last edit 2 minutes ago</button>' +
      '<span class="e-fill"></span>' +
      '<span class="e-chip">' + C.chip(7) + '</span>' +
      '<button class="e-text">Assist</button>' +
      tool(C.icon('chat'), 'Show all comments') +
      tool(C.icon('bars-3-bottom-right'), 'Show side panel') +
      '<span class="e-show"><button class="e-show-main">Slideshow' + C.icon('play') + '</button><button class="e-show-more" aria-label="Slideshow options">' + C.icon('chevron-down') + '</button></span>' +
      '<button class="c-btn is-small e-share">' + C.icon('lock-closed') + 'Share</button>' +
      '</div>';
    const menus =
      '<div class="e-menus">' + ['File', 'Edit', 'View', 'Insert', 'Format', 'Slide', 'Arrange', 'Tools', 'Help'].map(function (m) { return '<button>' + m + '</button>'; }).join('') + '</div>';
    const tools =
      '<div class="e-tools">' +
      tool(C.icon('search'), 'Search the menus') +
      drop(C.icon('plus'), 'New slide') +
      tool(C.icon('arrow-uturn-left'), 'Undo') + tool(C.icon('arrow-uturn-right'), 'Redo', 'is-off') + tool(C.icon('printer'), 'Print') + tool(C.icon('paint-brush'), 'Paint format') +
      '<button class="e-zoom">Fit' + C.icon('chevron-down') + '</button>' + sep +
      tool(C.icon('cursor-arrow'), 'Select', 'is-on') + tool(T_GLYPH, 'Text box') +
      drop(C.icon('photo'), 'Insert image') + drop(C.icon('square-2-stack'), 'Insert shape') + drop(C.icon('minus'), 'Insert line') +
      tool(C.icon('chat'), 'Insert comment') + sep +
      '<button class="e-text">Background</button><button class="e-text">Layout' + C.icon('chevron-down') + '</button><button class="e-text">Theme</button>' +
      '<span class="e-fill"></span>' + tool(C.icon('chevron-up'), 'Hide the menus') +
      '</div>';
    const body =
      '<div class="e-body">' +
      '<aside class="e-strip"><div class="e-card is-active"><span class="n">1</span><span class="frame">' + C.slide(Object.assign({ k: 208 / 1600 }, SLIDE)) + '</span></div></aside>' +
      '<main class="e-stage"><div class="e-canvas" id="canvas"></div><div class="e-notes"><span class="e-handle">' + C.icon('ellipsis-horizontal') + '</span><p>Click to add speaker notes</p></div></main>' +
      '</div>';
    return '<div class="e is-wide">' + title + menus + tools + body + '</div>';
  }

  function narrow() {
    const title =
      '<div class="e-title">' +
      '<a class="e-home" href="#" aria-label="Your presentations">' + C.mark(24) + '</a>' +
      '<span class="e-name">Q4 board update</span>' +
      '<span class="e-fill"></span>' +
      '<button class="c-btn is-small e-share">' + C.icon('lock-closed') + 'Share</button>' +
      '<span class="e-show"><button class="e-show-main is-glyph" aria-label="Slideshow">' + C.icon('play') + '</button></span>' +
      tool(C.icon('ellipsis-horizontal'), 'More: Assist, comments, side panel') +
      '</div>';
    const tools =
      '<div class="e-tools">' +
      '<button class="e-text e-menus-key">' + C.icon('bars-3') + 'Menus</button>' + sep +
      tool(C.icon('arrow-uturn-left'), 'Undo') + tool(C.icon('arrow-uturn-right'), 'Redo', 'is-off') + tool(C.icon('plus'), 'New slide') +
      tool(T_GLYPH, 'Text box') + tool(C.icon('photo'), 'Insert image') + tool(C.icon('square-2-stack'), 'Insert shape') + tool(C.icon('chat'), 'Insert comment') +
      '</div>';
    const body =
      '<main class="e-stage"><div class="e-canvas" id="canvas"></div>' +
      '<div class="e-strip"><div class="e-card is-active"><span class="n">1</span><span class="frame">' + C.slide(Object.assign({ k: 96 / 1600 }, SLIDE)) + '</span></div>' +
      '<button class="e-add" aria-label="New slide">' + C.icon('plus') + '</button></div>' +
      '<div class="e-notes"><p>Click to add speaker notes</p></div></main>';
    return '<div class="e is-narrow">' + title + tools + body + '</div>';
  }

  C.buildEditor = function (host) {
    const isNarrow = matchMedia('(max-width: 720px)').matches;
    host.innerHTML = isNarrow ? narrow() : wide();
    const canvas = host.querySelector('#canvas');
    const r = canvas.getBoundingClientRect();
    const pad = isNarrow ? 16 : 28;
    const k = Math.min((r.width - pad * 2) / 1600, isNarrow ? 10 : (r.height - pad * 2) / 900);
    canvas.innerHTML = '<span class="e-sheet">' + C.slide(Object.assign({ k: Math.floor(k * 1600) / 1600 }, SLIDE)) + '</span>';
  };
})();
