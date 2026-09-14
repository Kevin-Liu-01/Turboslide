// The line law auditor, ported from Prototemplate/scripts/lint-lines.mjs for `turboslide lint
// --chrome` (SPEC 2.2 "The line law for chrome"; DESIGN.md "Line law for chrome"). This module
// holds the parts that run inside the document and the configuration; the browser driver is
// @turboslide/headless/shell and the command is apps/cli/src/commands/lint-chrome.ts.
//
// auditDocument reconstructs the drawn hairlines from computed CSS (borders, outlines,
// spread-only shadows, thin filled boxes, exposed-ground strips, absolutely positioned pseudo
// rules) and reports:
//   1. doubles: two parallel 1 to 2 px lines from different owners within 1..4 px, overlapping
//      most of their run, both visible;
//   2. junctions: two owners drawing the same seam (gap under 1 px), reported apart because the
//      fix is different (one owner keeps the line, the other drops its side);
//   3. border roles: every visible border in chrome draws --pt-hair, --pt-hair-soft or --pt-edge;
//      --pt-ink only on an element in an active state; outlines are rings in the three roles,
//      ink or paper;
//   4. missing seams (page mode only), self-stacks and invisible seams.
// The function is self-contained: Playwright serializes it, so it reads only its argument.
// A state that did not apply is an infrastructure failure, never a pass (lint-lines.mjs line 113).

export type ChromeRoles = 'hair' | 'soft' | 'edge' | 'ink' | 'paper' | 'titanium';

export type ChromeScope = {
  /** Selectors of the shell roots that make an element chrome. */
  roots: string;
  /** A class prefix that also marks chrome (pt-), or null. */
  prefix: string | null;
  /** Selectors of content roots: nothing inside them is chrome. */
  content: string;
  /** The custom properties to read per role, prefixed names first. */
  tokens: Record<ChromeRoles, string[]>;
  /** Elements whose ink border is a state, not a seam. */
  active: string;
  /**
   * The live collaboration surfaces of gslides-parity SPEC-3 4.9 and 16.5 (the flags, the
   * remote outlines, carets and pointers, the Following plate, the chip stripes and the halo
   * rings): they may carry the colours of `collabColors` and nothing else may (the integrator at
   * merge 2 for b6.md request 5).
   */
  collab?: string;
  /** The six hues and the two halo values, as `#rrggbb`. */
  collabColors?: string[];
  /**
   * The overlay's lint boxes (SPEC 2.2 junction table): 1px titanium for severity 1 and 2, ink
   * for 3, outside any active state; absent means no such element.
   */
  lint?: string;
};

export type AuditConfig = { ALLOW: string[]; chrome: ChromeScope | null };

export type LineSegment = {
  orient: 'h' | 'v';
  pos: number;
  from: number;
  to: number;
  owner: string;
  el: number;
};
export type DoubleHit = {
  orient: 'h' | 'v';
  at: number;
  gap: number;
  a: string;
  b: string;
  span: number;
};
export type ColorHit = {
  kind: 'border' | 'outline';
  owner: string;
  side: string;
  color: string;
  role: string;
  at: number;
};
export type MissingSeam = { kind: string; between: string; at: number };
export type SelfStack = { owner: string; side: string; at: number; len: number };
export type InvisibleSeam = { owner: string; at: number; fill: string };

export type AuditResult = {
  total: number;
  doubles: DoubleHit[];
  junctions: DoubleHit[];
  colors: ColorHit[];
  missing: MissingSeam[];
  selfStacks: SelfStack[];
  invisibles: InvisibleSeam[];
  roles: Record<string, number[] | null> | null;
};

/**
 * Class fragments whose parallel strokes are one deliberate device (lint-lines.mjs ALLOW, the
 * deck's list plus ts-select, SPEC 2.2): the sheet mat ring, the active thumbnail and page
 * frames, the grid tiles, the hover preview, and the selection ring.
 */
export const CHROME_ALLOW: readonly string[] = [
  'sheet',
  'thumb-frame',
  'page-frame',
  'pt-tile',
  'pt-preview',
  'ts-select',
  /* the filmstrip card's frame with the current card's 2 px ring outside it (gslides-parity SPEC 1.1, 4.1) */
  'ts-card-frame',
  /* the Themes panel's tile frame with the current appearance's ring outside it (SPEC 5.7) */
  'ts-themes-frame',
];

/**
 * The six collaborator hues of gslides-parity SPEC-3 4.9 (`@turboslide/identity/hues`) and the
 * two halo values; the only colours the live collaboration surfaces may draw beside the roles.
 */
export const COLLAB_COLORS: string[] = [
  '#2f5ce0',
  '#789000',
  '#0f6a6a',
  '#1d8fc8',
  '#148d51',
  '#5533ff',
  '#070707',
  '#ffffff',
];

/** The Prototemplate shell's scope (lint-lines.mjs SHELL_CHROME). */
export const SHELL_CHROME: ChromeScope = {
  roots: '.pt-viewer, .pt-corner, .pt-corner-layer, .pt-help, .pt-toast, .pt-preview',
  prefix: 'pt-',
  content: '.stage, .sheet-flow .sheet > *, .pt-page-body, .pt-root, .gv-article, .ar-doc, iframe',
  tokens: {
    hair: ['--pt-hair', '--hair'],
    soft: ['--pt-hair-soft', '--hair-soft'],
    edge: ['--pt-edge', '--edge'],
    ink: ['--pt-ink', '--ink'],
    paper: ['--pt-paper', '--paper'],
    titanium: ['--pt-titanium', '--titanium'],
  },
  active:
    '.is-on, .is-active, .is-editing, .is-solid, [aria-pressed="true"], [aria-current], [aria-selected="true"], [aria-expanded="true"]',
};

/**
 * The Turboslide studio's scope: the ported shell roots plus the studio root, with the rendered
 * sheet (.ts-stage, .ts-sheet) as content, and the selection state (SPEC 2.2 junction table).
 */
export const TURBOSLIDE_CHROME: ChromeScope = {
  ...SHELL_CHROME,
  roots:
    '.pt-viewer, .pt-corner, .pt-corner-layer, .pt-help, .pt-toast, .pt-preview, .ts-studio, .ts-chrome, .ts-home-page, .ts-trash-page, .ts-menu, .ts-dialog, .ts-layout-plate',
  content: '.ts-stage, .ts-sheet, .stage, .sheet-flow .sheet > *, .pt-page-body, .pt-root, iframe',
  active: `${SHELL_CHROME.active}, .is-selected, [data-selected="true"], .ts-chip.is-self`,
  lint: '.ts-lint-box',
  collab:
    '.ts-flag, .ts-remote-outline, .ts-remote-caret, .ts-remote-pointer, .ts-following-plate, .ts-chip-stripe, .is-following, .has-halo',
  collabColors: COLLAB_COLORS,
};

/** The deck's own document inside the Prototemplate /deck iframe (lint-lines.mjs DECK_CHROME). */
export const DECK_CHROME: ChromeScope = {
  ...SHELL_CHROME,
  roots: 'body',
  prefix: null,
  content: '.stage, .mini, .slide',
};

export const SHELL_WIDTHS: readonly number[] = [1440, 1280, 390];
export const SHELL_THEMES: readonly ('light' | 'dark')[] = ['light', 'dark'];
/** The states the M1 acceptance drives on /deck/:deckId: the list toggled, the grid and the book. */
export const DEFAULT_STATES: readonly string[] = ['list', 'grid', 'book'];

export type ShellProbeState = {
  theme: string | null;
  kind: string;
  sb: string | null;
  overlay: boolean;
  panel: boolean;
  search: boolean;
  mode: string | null;
  grid: boolean;
  book: boolean;
  help: boolean;
  /** the editor's regions (SPEC 6.1, M3): the inspector column, a selected block, the drawer, the twin */
  inspector: boolean;
  selected: boolean;
  source: boolean;
  twin: boolean;
  /** the editor shell (gslides-parity SPEC 1.1): a bar or context menu open, the right panel open */
  menu: boolean;
  rpanel: string | null;
};

/**
 * What the document shows right now (lint-lines.mjs probeState), with the studio's own
 * data-mode attribute read first when present. Self-contained.
 */
export const probeState = (): ShellProbeState => {
  const shell = document.querySelector<HTMLElement>('.pt-viewer, .ts-studio');
  const deck = document.querySelector<HTMLElement>('.viewer');
  const modeAttr =
    shell?.dataset.mode ??
    document.querySelector<HTMLElement>('[data-ts-mode]')?.dataset.tsMode ??
    null;
  const segOn = document.querySelector(
    '.pt-toolbar .pt-seg .pt-ib.is-on, .pt-toolbar .pt-seg [aria-pressed="true"]',
  );
  const deckOn = document.querySelector<HTMLElement>('.toolbar [data-mode].is-on');
  const mode = deckOn
    ? (deckOn.dataset.mode ?? null)
    : modeAttr
      ? modeAttr.toLowerCase()
      : segOn
        ? segOn.textContent.trim().toLowerCase()
        : null;
  return {
    theme: document.documentElement.dataset.theme ?? null,
    kind: shell
      ? 'shell'
      : deck
        ? 'deck'
        : document.querySelector('.pt-corner')
          ? 'corner'
          : 'none',
    sb: shell
      ? (shell.dataset.sb ?? null)
      : deck
        ? deck.classList.contains('no-sb')
          ? '0'
          : '1'
        : null,
    overlay: Boolean(
      document.querySelector('.pt-sb.is-overlay, .viewer.sb-open, .ts-studio.is-list-overlay'),
    ),
    panel: Boolean(document.querySelector('.pt-panel.is-on, .panel-r.is-on, .ts-inspector.is-on')),
    search: Boolean(
      document.querySelector(
        '.pt-search-card[role="dialog"], [class*="pt-palette"], [data-pt-search], .ts-palette[role="dialog"]',
      ),
    ),
    mode,
    grid:
      mode === 'grid' || Boolean(document.querySelector('.pt-grid, .viewer.is-overview, .ts-grid')),
    book:
      mode === 'book' ||
      Boolean(
        document.querySelector(
          '.pt-book, .sheet-flow, .gv-flow, .viewer .book:not([hidden]), .ts-book',
        ),
      ),
    help: Boolean(document.querySelector('.pt-help, .help:not([hidden])')),
    inspector: Boolean(document.querySelector('.ts-inspector')),
    selected: Boolean(document.querySelector('.ts-overlay .ts-select')),
    source: Boolean(document.querySelector('.ts-drawer')),
    twin: Boolean(document.querySelector('.ts-twin')),
    menu: Boolean(document.querySelector('.ts-menu')),
    rpanel: document.querySelector<HTMLElement>('.pt-viewer[data-rpanel]')?.dataset.rpanel ?? null,
  };
};

/** The audit, run inside the document. Self-contained: it reads nothing but its argument. */
export const auditDocument = (cfg: AuditConfig): AuditResult => {
  const ALLOW = cfg.ALLOW;
  const chrome = cfg.chrome;
  const segs: LineSegment[] = [];
  const els: Element[] = [];
  const chromeOf: boolean[] = [];
  const selfStacks: SelfStack[] = [];
  const invisibles: InvisibleSeam[] = [];
  const colors: ColorHit[] = [];
  type Rect = {
    top: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
    height: number;
  };
  const label = (el: Element): string =>
    (typeof el.className === 'string' && el.className.trim() ? el.className.trim() : el.tagName)
      .split(/\s+/)
      .slice(0, 2)
      .join('.');
  const visible = (color: string): boolean => {
    const m = /rgba?\(([^)]+)\)/.exec(color);
    if (!m) return color !== 'transparent';
    const parts = (m[1] ?? '').split(',').map(parseFloat);
    return (parts[3] ?? 1) > 0.05;
  };
  const alphaOf = (color: string): number => {
    const m = /rgba?\(([^)]+)\)/.exec(color);
    if (!m) return color === 'transparent' ? 0 : 1;
    return (m[1] ?? '').split(',').map(parseFloat)[3] ?? 1;
  };

  const isChrome = (el: Element): boolean => {
    if (!chrome) return false;
    if (el.closest(chrome.content)) return false;
    if (el.closest(chrome.roots)) return true;
    return Boolean(
      chrome.prefix &&
      typeof el.className === 'string' &&
      new RegExp(`(^|\\s)${chrome.prefix}`).test(el.className),
    );
  };
  const rgba = (str: string | null | undefined): number[] | null => {
    if (!str) return null;
    const s = str.trim().toLowerCase();
    if (s === 'transparent') return [0, 0, 0, 0];
    let m = /^rgba?\(([^)]+)\)$/.exec(s);
    if (m) {
      const p = (m[1] ?? '')
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(parseFloat);
      return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
    }
    m = /^#([0-9a-f]{3,8})$/.exec(s);
    if (m) {
      let h = m[1] ?? '';
      if (h.length === 3 || h.length === 4)
        h = h
          .split('')
          .map((c) => c + c)
          .join('');
      const n = parseInt(h.slice(0, 6), 16);
      const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
    }
    return null;
  };
  const sameColor = (a: number[] | null, b: number[] | null): boolean =>
    Boolean(a && b) &&
    Math.abs((a?.[0] ?? 0) - (b?.[0] ?? 0)) <= 2 &&
    Math.abs((a?.[1] ?? 0) - (b?.[1] ?? 0)) <= 2 &&
    Math.abs((a?.[2] ?? 0) - (b?.[2] ?? 0)) <= 2 &&
    Math.abs((a?.[3] ?? 1) - (b?.[3] ?? 1)) <= 0.02;
  const readToken = (names: string[]): number[] | null => {
    const root = getComputedStyle(document.documentElement);
    for (const name of names) {
      const v = root.getPropertyValue(name).trim();
      if (v) return rgba(v);
    }
    // the studio scopes the sheet tokens under .ts-sheet and the chrome tokens on the root
    const shell = document.querySelector('.pt-viewer, .ts-studio');
    if (shell) {
      const cs = getComputedStyle(shell);
      for (const name of names) {
        const v = cs.getPropertyValue(name).trim();
        if (v) return rgba(v);
      }
    }
    return null;
  };
  const ROLES: Record<string, number[] | null> | null = chrome
    ? Object.fromEntries(
        Object.entries(chrome.tokens).map(([role, names]) => [role, readToken(names)]),
      )
    : null;
  const roleOf = (color: string): string | null => {
    const c = rgba(color);
    if (!ROLES) return null;
    for (const [role, value] of Object.entries(ROLES)) if (sameColor(c, value)) return role;
    return null;
  };
  const activeNear = (el: Element): boolean => {
    if (!chrome) return false;
    for (let n: Element | null = el, d = 0; n && d < 3; n = n.parentElement, d += 1) {
      if (n.matches(chrome.active)) return true;
      if (n.matches(':focus-within')) return true;
    }
    return false;
  };
  /* a live collaboration surface drawing one of the six hues or a halo value (SPEC-3 4.9, 16.5) */
  const channels = (color: string): number[] | null => {
    const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
    if (hex) {
      const n = parseInt(hex[1] ?? '0', 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const fn = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(color.trim());
    return fn ? [Number(fn[1]), Number(fn[2]), Number(fn[3])] : null;
  };
  const collabColor = (el: Element, color: string): boolean => {
    if (!chrome || !chrome.collab || !chrome.collabColors) return false;
    if (!el.matches(chrome.collab) && !(el.parentElement?.matches(chrome.collab) ?? false))
      return false;
    const c = channels(color);
    if (!c) return false;
    return chrome.collabColors.some((hex) => {
      const h = channels(hex);
      return h !== null && h[0] === c[0] && h[1] === c[1] && h[2] === c[2];
    });
  };
  const SEAM_ROLES = ['hair', 'soft', 'edge'];
  const RING_ROLES = ['hair', 'soft', 'edge', 'ink', 'paper'];
  const SIDES = ['Top', 'Bottom', 'Left', 'Right'] as const;
  const prop = (cs: CSSStyleDeclaration, name: string): string => cs.getPropertyValue(name);
  const checkColors = (
    rect: Rect,
    cs: CSSStyleDeclaration,
    owner: string,
    el: Element | null,
    isPseudo: boolean,
  ): void => {
    if (!chrome || !el || !isChrome(el)) return;
    for (const side of SIDES) {
      const w = parseFloat(prop(cs, `border-${side.toLowerCase()}-width`));
      const color = prop(cs, `border-${side.toLowerCase()}-color`);
      if (!(w >= 1) || !visible(color)) continue;
      const role = roleOf(color);
      if (role && SEAM_ROLES.includes(role)) continue;
      if (role === 'ink' && activeNear(el)) continue;
      if (collabColor(el, color)) continue;
      /* a lint box is titanium (severity 1 and 2) or ink (3) by the junction table, not a seam */
      if ((role === 'titanium' || role === 'ink') && chrome.lint && el.matches(chrome.lint))
        continue;
      colors.push({
        kind: 'border',
        owner: isPseudo ? `pseudo:${owner}` : owner,
        side: side.toLowerCase(),
        color,
        role: role ?? 'none',
        at: Math.round(
          side === 'Top'
            ? rect.top
            : side === 'Bottom'
              ? rect.bottom
              : side === 'Left'
                ? rect.left
                : rect.right,
        ),
      });
    }
    const ow = parseFloat(cs.outlineWidth);
    if (cs.outlineStyle !== 'none' && ow >= 1 && visible(cs.outlineColor)) {
      const role = roleOf(cs.outlineColor);
      if ((!role || !RING_ROLES.includes(role)) && !collabColor(el, cs.outlineColor))
        colors.push({
          kind: 'outline',
          owner,
          side: 'ring',
          color: cs.outlineColor,
          role: role ?? 'none',
          at: Math.round(rect.top),
        });
    }
  };
  const radii = (cs: CSSStyleDeclaration) => ({
    tl: parseFloat(cs.borderTopLeftRadius) || 0,
    tr: parseFloat(cs.borderTopRightRadius) || 0,
    bl: parseFloat(cs.borderBottomLeftRadius) || 0,
    br: parseFloat(cs.borderBottomRightRadius) || 0,
  });
  const pushBorders = (
    rect: Rect,
    cs: CSSStyleDeclaration,
    owner: string,
    elIdx: number,
    edges?: Record<string, boolean>,
  ): void => {
    const rd = radii(cs);
    const sides: [string, 'h' | 'v', number, number, number][] = [
      ['Top', 'h', rect.top, rect.left + rd.tl, rect.right - rd.tr],
      ['Bottom', 'h', rect.bottom, rect.left + rd.bl, rect.right - rd.br],
      ['Left', 'v', rect.left, rect.top + rd.tl, rect.bottom - rd.bl],
      ['Right', 'v', rect.right, rect.top + rd.tr, rect.bottom - rd.br],
    ];
    for (const [side, orient, pos, from, to] of sides) {
      if (edges && edges[side.toLowerCase()] === false) continue;
      const w = parseFloat(prop(cs, `border-${side.toLowerCase()}-width`));
      if (
        w >= 1 &&
        w <= 2.5 &&
        visible(prop(cs, `border-${side.toLowerCase()}-color`)) &&
        to - from > 24
      )
        segs.push({ orient, pos: Math.round(pos * 2) / 2, from, to, owner, el: elIdx });
    }
    const ow = parseFloat(cs.outlineWidth);
    if (cs.outlineStyle !== 'none' && ow >= 1 && ow <= 2.5 && visible(cs.outlineColor)) {
      const off = (parseFloat(cs.outlineOffset) || 0) + ow / 2;
      if (rect.width > 24) {
        segs.push({
          orient: 'h',
          pos: Math.round((rect.top - off) * 2) / 2,
          from: rect.left,
          to: rect.right,
          owner: `outline:${owner}`,
          el: elIdx,
        });
        segs.push({
          orient: 'h',
          pos: Math.round((rect.bottom + off) * 2) / 2,
          from: rect.left,
          to: rect.right,
          owner: `outline:${owner}`,
          el: elIdx,
        });
      }
      if (rect.height > 24) {
        segs.push({
          orient: 'v',
          pos: Math.round((rect.left - off) * 2) / 2,
          from: rect.top,
          to: rect.bottom,
          owner: `outline:${owner}`,
          el: elIdx,
        });
        segs.push({
          orient: 'v',
          pos: Math.round((rect.right + off) * 2) / 2,
          from: rect.top,
          to: rect.bottom,
          owner: `outline:${owner}`,
          el: elIdx,
        });
      }
    }
    if (cs.boxShadow && cs.boxShadow !== 'none') {
      for (const shadow of cs.boxShadow.split(/\),\s*/)) {
        const m = /(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px\s+([\d.]+)px/.exec(shadow);
        if (!m) continue;
        const sx = Number(m[1]);
        const sy = Number(m[2]);
        const blur = Number(m[3]);
        const spread = Number(m[4]);
        if (sx !== 0 || sy !== 0 || blur > 1.5 || spread < 1 || spread > 2.5) continue;
        const p = spread / 2;
        if (rect.width > 24) {
          segs.push({
            orient: 'h',
            pos: Math.round((rect.top - p) * 2) / 2,
            from: rect.left,
            to: rect.right,
            owner: `shadow:${owner}`,
            el: elIdx,
          });
          segs.push({
            orient: 'h',
            pos: Math.round((rect.bottom + p) * 2) / 2,
            from: rect.left,
            to: rect.right,
            owner: `shadow:${owner}`,
            el: elIdx,
          });
        }
        if (rect.height > 24) {
          segs.push({
            orient: 'v',
            pos: Math.round((rect.left - p) * 2) / 2,
            from: rect.top,
            to: rect.bottom,
            owner: `shadow:${owner}`,
            el: elIdx,
          });
          segs.push({
            orient: 'v',
            pos: Math.round((rect.right + p) * 2) / 2,
            from: rect.top,
            to: rect.bottom,
            owner: `shadow:${owner}`,
            el: elIdx,
          });
        }
      }
    }
  };
  const skipMemo = new Map<Element, boolean>();
  const inSkipped = (el: Element): boolean => {
    for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
      let v = skipMemo.get(n);
      if (v === undefined) {
        const cs = getComputedStyle(n);
        const mask = prop(cs, 'mask-image') || prop(cs, '-webkit-mask-image');
        v = cs.transform.startsWith('matrix3d') || (Boolean(mask) && mask !== 'none');
        skipMemo.set(n, v);
      }
      if (v) return true;
    }
    return false;
  };
  document.querySelectorAll('body *').forEach((el) => {
    if (el.closest('svg') || el.closest('canvas')) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 && rect.height < 4) return;
    const owner = label(el);
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    if (parseFloat(cs.opacity) <= 0.05) return;
    if (inSkipped(el)) return;
    const elIdx = els.push(el) - 1;
    const inChrome = isChrome(el);
    chromeOf[elIdx] = inChrome;
    let crect: Rect = rect;
    let edges: Record<string, boolean> = { top: true, bottom: true, left: true, right: true };
    {
      let clipAnc = el.parentElement;
      while (clipAnc && getComputedStyle(clipAnc).overflow.includes('visible'))
        clipAnc = clipAnc.parentElement;
      if (clipAnc) {
        const cr = clipAnc.getBoundingClientRect();
        edges = {
          top: rect.top >= cr.top - 0.5,
          bottom: rect.bottom <= cr.bottom + 0.5,
          left: rect.left >= cr.left - 0.5,
          right: rect.right <= cr.right + 0.5,
        };
        const top = Math.max(rect.top, cr.top);
        const bottom = Math.min(rect.bottom, cr.bottom);
        const left = Math.max(rect.left, cr.left);
        const right = Math.min(rect.right, cr.right);
        if (right - left < 1 || bottom - top < 1) return;
        crect = { top, bottom, left, right, width: right - left, height: bottom - top };
      }
    }
    pushBorders(crect, cs, owner, elIdx, edges);
    checkColors(crect, cs, owner, el, false);
    if (visible(cs.backgroundColor)) {
      const tw = crect.right - crect.left;
      const th = crect.bottom - crect.top;
      if (th > 0 && th <= 2.5 && tw > 24)
        segs.push({
          orient: 'h',
          pos: Math.round((crect.top + th / 2) * 2) / 2,
          from: crect.left,
          to: crect.right,
          owner,
          el: elIdx,
        });
      if (tw > 0 && tw <= 2.5 && th > 24)
        segs.push({
          orient: 'v',
          pos: Math.round((crect.left + tw / 2) * 2) / 2,
          from: crect.top,
          to: crect.bottom,
          owner,
          el: elIdx,
        });
    }
    if (visible(cs.backgroundColor) && rect.width > 24 && rect.height > 24) {
      const bgA2 = alphaOf(cs.backgroundColor);
      const deviceOwner = ALLOW.some((frag) => owner.includes(frag));
      if (bgA2 >= 0.95 && (!chrome || inChrome) && !deviceOwner) {
        const own = cs.backgroundColor.match(/\d+/g)?.map(Number) ?? [];
        const rootBg =
          getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.map(Number) ?? [];
        const hasStrip = SIDES.some((side) => {
          const p = parseFloat(prop(cs, `padding-${side.toLowerCase()}`));
          const bw = parseFloat(prop(cs, `border-${side.toLowerCase()}-width`)) || 0;
          return p >= 1 && p <= 2.5 && bw < 1;
        });
        if (
          hasStrip &&
          own.length >= 3 &&
          rootBg.length >= 3 &&
          Math.abs((own[0] ?? 0) - (rootBg[0] ?? 0)) +
            Math.abs((own[1] ?? 0) - (rootBg[1] ?? 0)) +
            Math.abs((own[2] ?? 0) - (rootBg[2] ?? 0)) <
            45
        ) {
          invisibles.push({ owner, at: Math.round(rect.bottom), fill: cs.backgroundColor });
        }
      }
      const pads: [string, 'h' | 'v', (p: number) => number, number, number][] = [
        ['Top', 'h', (p) => rect.top + p / 2, rect.left, rect.right],
        ['Bottom', 'h', (p) => rect.bottom - p / 2, rect.left, rect.right],
        ['Left', 'v', (p) => rect.left + p / 2, rect.top, rect.bottom],
        ['Right', 'v', (p) => rect.right - p / 2, rect.top, rect.bottom],
      ];
      for (const [side, orient, at, from, to] of pads) {
        const p = parseFloat(prop(cs, `padding-${side.toLowerCase()}`));
        const bw = parseFloat(prop(cs, `border-${side.toLowerCase()}-width`)) || 0;
        if (p >= 1 && p <= 2.5 && bw < 1 && to - from > 24)
          segs.push({
            orient,
            pos: Math.round(at(p) * 2) / 2,
            from,
            to,
            owner: `ground:${owner}`,
            el: elIdx,
          });
      }
      if ((!chrome || inChrome) && !deviceOwner) {
        for (const side of SIDES) {
          const bw = parseFloat(prop(cs, `border-${side.toLowerCase()}-width`));
          const bc = prop(cs, `border-${side.toLowerCase()}-color`);
          const bgA = alphaOf(cs.backgroundColor);
          if (
            bw >= 1 &&
            visible(bc) &&
            alphaOf(bc) < 0.95 &&
            bgA >= 0.12 &&
            bgA < 0.95 &&
            cs.backgroundClip !== 'padding-box' &&
            cs.backgroundClip !== 'content-box'
          ) {
            selfStacks.push({
              owner,
              side: side.toLowerCase(),
              at: Math.round(
                side === 'Top'
                  ? rect.top
                  : side === 'Bottom'
                    ? rect.bottom
                    : side === 'Left'
                      ? rect.left
                      : rect.right,
              ),
              len: Math.round(side === 'Top' || side === 'Bottom' ? rect.width : rect.height),
            });
          }
        }
      }
    }
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo);
      if (ps.content === 'none' || ps.position !== 'absolute') continue;
      if (parseFloat(ps.opacity) <= 0.05) continue;
      const t = parseFloat(ps.top);
      const l = parseFloat(ps.left);
      const r0 = parseFloat(ps.right);
      const b0 = parseFloat(ps.bottom);
      const w = parseFloat(ps.width);
      const h = parseFloat(ps.height);
      let left = Number.isFinite(l) ? rect.left + l : NaN;
      let top = Number.isFinite(t) ? rect.top + t : NaN;
      let width = Number.isFinite(w)
        ? w
        : Number.isFinite(l) && Number.isFinite(r0)
          ? rect.width - l - r0
          : NaN;
      let height = Number.isFinite(h)
        ? h
        : Number.isFinite(t) && Number.isFinite(b0)
          ? rect.height - t - b0
          : NaN;
      if (!Number.isFinite(left) && Number.isFinite(r0) && Number.isFinite(width))
        left = rect.right - r0 - width;
      if (!Number.isFinite(top) && Number.isFinite(b0) && Number.isFinite(height))
        top = rect.bottom - b0 - height;
      if (![left, top, width, height].every(Number.isFinite)) continue;
      const tf = ps.transform;
      if (tf && tf !== 'none') {
        try {
          const m = new DOMMatrix(tf);
          left += m.e;
          top += m.f;
        } catch {
          // an unparsable transform leaves the pseudo where it is
        }
      }
      let clipEl = el.parentElement;
      while (clipEl && getComputedStyle(clipEl).overflow.includes('visible'))
        clipEl = clipEl.parentElement;
      if (clipEl) {
        const cr = clipEl.getBoundingClientRect();
        const cl = Math.max(left, cr.left);
        const ct = Math.max(top, cr.top);
        const crr = Math.min(left + width, cr.right);
        const cb = Math.min(top + height, cr.bottom);
        left = cl;
        top = ct;
        width = Math.max(0, crr - cl);
        height = Math.max(0, cb - ct);
        if (width < 1 || height < 1) continue;
      }
      const prect: Rect = { top, bottom: top + height, left, right: left + width, width, height };
      const hostIdx = els.push(el) - 1;
      chromeOf[hostIdx] = inChrome;
      pushBorders(prect, ps, `${pseudo}${label(el)}`, hostIdx);
      checkColors(prect, ps, `${pseudo}${label(el)}`, el, true);
      if (visible(ps.backgroundColor)) {
        if (height <= 2.5 && width > 24)
          segs.push({
            orient: 'h',
            pos: Math.round((top + height / 2) * 2) / 2,
            from: left,
            to: left + width,
            owner: `${pseudo}${label(el)}`,
            el: hostIdx,
          });
        if (width <= 2.5 && height > 24)
          segs.push({
            orient: 'v',
            pos: Math.round((left + width / 2) * 2) / 2,
            from: top,
            to: top + height,
            owner: `${pseudo}${label(el)}`,
            el: hostIdx,
          });
      }
    }
  });

  const allowed = (owner: string): boolean => ALLOW.some((frag) => owner.includes(frag));
  const opaqueBg = (node: Element): boolean => {
    const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(node).backgroundColor);
    if (!m) return false;
    const parts = (m[1] ?? '').split(',').map(parseFloat);
    return (parts[3] ?? 1) >= 0.98;
  };
  const coveredCoincidence = (a: LineSegment, b: LineSegment): boolean => {
    const A = els[a.el];
    const B = els[b.el];
    if (!A || !B || A === B) return false;
    let inner: Element | null = null;
    let outer: Element | null = null;
    if (A.contains(B)) {
      outer = A;
      inner = B;
    } else if (B.contains(A)) {
      outer = B;
      inner = A;
    }
    if (!outer) return false;
    const pos = a.pos;
    const from = Math.max(a.from, b.from);
    const to = Math.min(a.to, b.to);
    for (let n: Element | null = inner; n && n !== outer; n = n.parentElement) {
      if (!opaqueBg(n)) continue;
      const r = n.getBoundingClientRect();
      const hit =
        a.orient === 'h'
          ? r.top <= pos + 1 && r.bottom >= pos - 1 && r.left <= from + 1 && r.right >= to - 1
          : r.left <= pos + 1 && r.right >= pos - 1 && r.top <= from + 1 && r.bottom >= to - 1;
      if (hit) return true;
    }
    return false;
  };
  const strokeVisibleAt = (s: LineSegment, x: number, y: number): boolean => {
    const E = els[s.el];
    if (!E) return true;
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return true;
    for (const node of document.elementsFromPoint(x, y)) {
      if (node === E || E.contains(node) || node.contains(E)) return true;
      if (opaqueBg(node)) return false;
    }
    return true;
  };
  const bothVisible = (a: LineSegment, b: LineSegment): boolean => {
    const from = Math.max(a.from, b.from);
    const to = Math.min(a.to, b.to);
    const pos = (a.pos + b.pos) / 2;
    let seen = 0;
    for (const t of [0.25, 0.5, 0.75]) {
      const along = from + (to - from) * t;
      const [x, y] = a.orient === 'h' ? [along, pos] : [pos, along];
      if (strokeVisibleAt(a, x, y) && strokeVisibleAt(b, x, y)) seen += 1;
    }
    return seen >= 2;
  };

  const doubles: DoubleHit[] = [];
  const junctions: DoubleHit[] = [];
  const seen = new Set<string>();
  for (const orient of ['h', 'v'] as const) {
    const pool = segs.filter((s) => s.orient === orient && !allowed(s.owner));
    pool.sort((a, b) => a.pos - b.pos);
    for (let i = 0; i < pool.length; i += 1) {
      for (
        let j = i + 1;
        j < pool.length && (pool[j]?.pos ?? 0) - (pool[i]?.pos ?? 0) <= 4;
        j += 1
      ) {
        const a = pool[i];
        const b = pool[j];
        if (!a || !b) continue;
        const gap = b.pos - a.pos;
        if (a.owner === b.owner) continue;
        if (chrome && !chromeOf[a.el] && !chromeOf[b.el]) continue;
        const overlap = Math.min(a.to, b.to) - Math.max(a.from, b.from);
        const shorter = Math.min(a.to - a.from, b.to - b.from);
        if (overlap < shorter * 0.75 || overlap < 80) continue;
        if (gap < 1 && coveredCoincidence(a, b)) continue;
        if (!bothVisible(a, b)) continue;
        const key = `${orient}:${Math.round(a.pos)}:${a.owner}|${b.owner}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const hit: DoubleHit = {
          orient,
          at: Math.round(a.pos),
          gap: Number(gap.toFixed(1)),
          a: a.owner,
          b: b.owner,
          span: Math.round(overlap),
        };
        (gap < 1 ? junctions : doubles).push(hit);
      }
    }
  }

  const missing: MissingSeam[] = [];
  if (!chrome) {
    const needSeam = (el: Element, next: Element, kind: string): void => {
      const r = el.getBoundingClientRect();
      if (r.height < 8 || r.width < 200) return;
      const hit = segs.some(
        (s) =>
          s.orient === 'h' &&
          Math.abs(s.pos - r.bottom) <= 3 &&
          s.to - s.from >= Math.min(r.width, 1100) * 0.5,
      );
      if (!hit)
        missing.push({
          kind,
          between: `${el.id || label(el)} -> ${next.id || label(next)}`,
          at: Math.round(r.bottom),
        });
    };
    const sections = [
      ...document.querySelectorAll('.tc-rail > section, [class*="-root"] > section'),
    ];
    sections.sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top);
    for (let i = 0; i + 1 < sections.length; i += 1) {
      const a = sections[i];
      const b = sections[i + 1];
      if (a && b) needSeam(a, b, 'section');
    }
    const BLOCKS = '.tc-row, .tc-hatch, .tc-band, .tc-delivery-band';
    for (const block of document.querySelectorAll(BLOCKS)) {
      const next = block.nextElementSibling;
      if (next && next.matches(BLOCKS)) needSeam(block, next, 'row');
    }
  }

  const colorKeys = new Set<string>();
  const colorHits = colors.filter((c) => {
    const key = `${c.kind}:${c.owner}:${c.side}:${c.color}`;
    if (colorKeys.has(key)) return false;
    colorKeys.add(key);
    return true;
  });

  return {
    total: segs.length,
    doubles: doubles.slice(0, 40),
    junctions: junctions.slice(0, 40),
    colors: colorHits.slice(0, 40),
    missing,
    selfStacks: selfStacks.slice(0, 24),
    invisibles: invisibles.slice(0, 12),
    roles: ROLES,
  };
};

/** True when an audit carries anything that fails the run (lint-lines.mjs `failing`). */
export function failingAudit(audit: AuditResult): boolean {
  const structuralStacks = audit.selfStacks.filter((s) => s.len >= 120);
  return Boolean(
    audit.doubles.length ||
    audit.junctions.length ||
    audit.colors.length ||
    audit.missing.length ||
    structuralStacks.length ||
    audit.invisibles.length,
  );
}

/** The human lines for one failing audit, as lint-lines.mjs prints them. */
export function formatAudit(audit: AuditResult): string[] {
  const lines: string[] = [];
  for (const d of audit.junctions)
    lines.push(`  junction ${d.orient}@${d.at} gap ${d.gap}: ${d.a} | ${d.b} (${d.span}px)`);
  for (const d of audit.doubles)
    lines.push(`  double ${d.orient}@${d.at} gap ${d.gap}: ${d.a} | ${d.b} (${d.span}px)`);
  for (const c of audit.colors)
    lines.push(`  color ${c.kind} ${c.side} of ${c.owner} @${c.at}: ${c.color} (${c.role})`);
  for (const s of audit.selfStacks.filter((x) => x.len >= 120))
    lines.push(`  self-stack ${s.side} of ${s.owner} @${s.at} (${s.len}px)`);
  for (const s of audit.invisibles) lines.push(`  invisible seam ${s.owner} @${s.at} on ${s.fill}`);
  for (const m of audit.missing) lines.push(`  missing ${m.kind} seam ${m.between} @${m.at}`);
  return lines;
}
