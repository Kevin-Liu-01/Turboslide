import type { Page } from '@playwright/test';

import { composite, contrastRatio, parseColor } from '@turboslide/theme/contrast';
import type { Rgba } from '@turboslide/theme/contrast';

// The reads of polish two's auth rows (docs/POLISH-2.md 4.1, 6.4 and 6.6): what a person sees on a
// sign in surface, which the design round's row never read (the lead's inset, a label against its
// own ground after typing, the focus ring, the gap under the last control). Each read runs in the
// page and answers raw facts (boxes, computed colours and the grounds under them); the contrast is
// computed here with the one WCAG function of @turboslide/theme/contrast.

/** One control of a sign in surface, as drawn. */
export type ControlRead = {
  control: string;
  tag: string;
  label: string;
  left: number;
  top: number;
  bottom: number;
  disabled: boolean;
  /** the label's computed colour */
  color: string;
  /** the backgrounds from the label's element outward to the root element */
  grounds: string[];
};

/** The ring of the focused element. */
export type RingRead = {
  control: string;
  width: string;
  style: string;
  color: string;
  offset: string;
  grounds: string[];
};

export type SurfaceRead = {
  found: boolean;
  /** the surface's own box */
  box: { left: number; top: number; right: number; bottom: number };
  /** the lead sentence's left edge, or null where none is drawn */
  leadLeft: number | null;
  controls: ControlRead[];
  /** every button with a label, for the contrast read (the controls and the action bar's) */
  buttons: ControlRead[];
  focused: RingRead | null;
  /** the top of the box under the last control (the action bar), or the surface's bottom */
  nextTop: number;
  /** the bottom of the last control or field */
  lastBottom: number;
  ink: string;
  paper: string;
};

/**
 * Reads one sign in surface: `root` is the surface (the dialog's card or the plate's column),
 * `lead` its lead sentence, `controls` the selector of its controls with a box (each starts at the
 * inset), `buttons` every button whose label is read against its ground (the controls when
 * absent), and `next` the box under the controls (the dialog's action bar), when it has one.
 */
export async function readSurface(
  page: Page,
  sel: { root: string; lead: string; controls: string; buttons?: string; next?: string },
): Promise<SurfaceRead> {
  return page.evaluate((s) => {
    const root = document.querySelector<HTMLElement>(s.root);
    const empty = { left: 0, top: 0, right: 0, bottom: 0 };
    const tokenOf = (name: string, at: Element): string => {
      const probe = document.createElement('span');
      probe.style.color = `var(${name})`;
      at.appendChild(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };
    if (!root)
      return {
        found: false,
        box: empty,
        leadLeft: null,
        controls: [],
        buttons: [],
        focused: null,
        nextTop: 0,
        lastBottom: 0,
        ink: '',
        paper: '',
      };
    const grounds = (el: Element): string[] => {
      const out: string[] = [];
      for (let node: Element | null = el; node !== null; node = node.parentElement)
        out.push(getComputedStyle(node).backgroundColor);
      return out;
    };
    const drawn = (el: Element) => el.getClientRects().length > 0;
    const rect = root.getBoundingClientRect();
    const lead = root.querySelector(s.lead);
    const readOne = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      /* the element that draws the words: a button's label span, else the control itself */
      const text =
        el.querySelector<HTMLElement>('.pt-lb, .ts-auth-label, span:not([aria-hidden])') ?? el;
      return {
        control: el.getAttribute('data-control') ?? el.tagName.toLowerCase(),
        tag: el.tagName.toLowerCase(),
        label: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
        left: r.left,
        top: r.top,
        bottom: r.bottom,
        disabled: (el as HTMLButtonElement).disabled === true,
        color: getComputedStyle(text).color,
        grounds: grounds(text),
      };
    };
    const read = [...root.querySelectorAll<HTMLElement>(s.controls)].filter(drawn).map(readOne);
    const buttons = [...root.querySelectorAll<HTMLElement>(s.buttons ?? s.controls)]
      .filter((el) => drawn(el) && el.tagName === 'BUTTON')
      .map(readOne);
    const active = document.activeElement;
    const focused =
      active instanceof HTMLElement && root.contains(active)
        ? {
            control: active.getAttribute('data-control') ?? active.tagName.toLowerCase(),
            width: getComputedStyle(active).outlineWidth,
            style: getComputedStyle(active).outlineStyle,
            color: getComputedStyle(active).outlineColor,
            offset: getComputedStyle(active).outlineOffset,
            grounds: grounds(active),
          }
        : null;
    const next = s.next === undefined ? null : root.querySelector(s.next);
    const lastBottom = Math.max(0, ...read.map((c) => c.bottom));
    return {
      found: true,
      box: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      leadLeft: lead && drawn(lead) ? lead.getBoundingClientRect().left : null,
      controls: read,
      buttons,
      focused,
      nextTop: next && drawn(next) ? next.getBoundingClientRect().top : rect.bottom,
      lastBottom,
      ink: tokenOf('--pt-ink', root),
      paper: tokenOf('--pt-paper', root),
    };
  }, sel);
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

/** The opaque ground a label sits on: its backgrounds composited from the outermost inward. */
export function groundOf(grounds: readonly string[], base: Rgba = WHITE): Rgba {
  let ground = base;
  for (const css of [...grounds].reverse()) {
    const c = parseColor(css);
    if (c === null || c.a === 0) continue;
    ground = c.a >= 1 ? c : composite(c, ground);
  }
  return ground;
}

/** The WCAG ratio of a control's label on its own ground. */
export function labelContrast(control: ControlRead, base?: Rgba): number {
  const ground = groundOf(control.grounds, base);
  const color = parseColor(control.color);
  if (color === null) return 0;
  return contrastRatio(color.a < 1 ? composite(color, ground) : color, ground);
}

const same = (a: string, b: string): boolean => {
  const x = parseColor(a);
  const y = parseColor(b);
  return (
    x !== null &&
    y !== null &&
    Math.abs(x.r - y.r) < 1.5 &&
    Math.abs(x.g - y.g) < 1.5 &&
    Math.abs(x.b - y.b) < 1.5 &&
    Math.abs(x.a - y.a) < 0.02
  );
};

/**
 * Why a focus ring is not the chrome's one rule (1 px, solid, inset, in ink; on a control drawn in
 * ink the ring inverts to paper so it is not ink on ink), or null when it is.
 */
export function ringFault(ring: RingRead, ink: string, paper: string): string | null {
  const offset = parseFloat(ring.offset);
  const ground = groundOf(ring.grounds);
  const onInk = same(`rgb(${ground.r}, ${ground.g}, ${ground.b})`, ink);
  const colourOk = same(ring.color, ink) || (onInk && same(ring.color, paper));
  if (ring.style !== 'solid' || ring.width !== '1px' || !(offset <= -1) || !colourOk)
    return `${ring.control}: ${ring.width} ${ring.style} ${ring.color} offset ${ring.offset} (ink ${ink})`;
  return null;
}

/**
 * The faults of a surface against the window's rules: the inset, the labels (unless `labels` is
 * false), the ring, the gap.
 */
export function surfaceFaults(
  read: SurfaceRead,
  opts: { inset: number; maxGap: number; where: string; labels?: boolean },
): string[] {
  const faults: string[] = [];
  const { where } = opts;
  if (!read.found) return [`${where}: the surface is not drawn`];
  if (read.leadLeft !== null && Math.abs(read.leadLeft - read.box.left - opts.inset) > 1.5)
    faults.push(
      `${where}: the lead starts ${Math.round(read.leadLeft - read.box.left)} px in, not ${opts.inset}`,
    );
  for (const c of read.controls)
    if (Math.abs(c.left - read.box.left - opts.inset) > 1.5)
      faults.push(
        `${where}: ${c.control} starts ${Math.round(c.left - read.box.left)} px in, not ${opts.inset}`,
      );
  for (const c of opts.labels === false ? [] : read.buttons) {
    if (c.label !== '') {
      const ratio = labelContrast(c);
      if (ratio < 4.5)
        faults.push(
          `${where}: "${c.label}"${c.disabled ? ' (disabled)' : ''} reads ${ratio.toFixed(2)}:1 on its ground`,
        );
    }
  }
  if (read.focused !== null) {
    const fault = ringFault(read.focused, read.ink, read.paper);
    if (fault !== null) faults.push(`${where}: the focus ring ${fault}`);
  }
  const gap = Math.round(read.nextTop - read.lastBottom);
  if (read.controls.length > 0 && gap > opts.maxGap)
    faults.push(`${where}: ${gap} px between the last control and the box under it`);
  return faults;
}
