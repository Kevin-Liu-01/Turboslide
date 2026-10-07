import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

import { composite, contrastRatio, parseColor } from '@turboslide/theme/contrast';
import type { Rgba } from '@turboslide/theme/contrast';

import { competitorMentions } from '../../../../packages/lint/src/brand/competitor';
import { extraHTTPHeaders, isLocalBase, title } from './lib';
import { isCoreId } from './matrix';

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

// ---------------------------------------------------------------------------------------------
// The plate's reads (docs/POLISH-2.md 4.2, 4.4, 4.5, 6.4): one page evaluation answers what a
// person sees of a plate in either host, and `plateFaults` judges it.

/** One drawn box of a plate: a heading, a sentence, a control, a row. */
export type PlateBox = {
  kind: 'heading' | 'sentence' | 'button' | 'input' | 'row' | 'label';
  control: string;
  text: string;
  top: number;
  bottom: number;
  left: number;
  right: number;
  height: number;
  radius: string;
  numeric: string;
  disabled: boolean;
  color: string;
  grounds: string[];
  reserved: boolean;
};

export type PlateRead = {
  found: boolean;
  state: string;
  host: string;
  /** the column (page) or the window's card (window) */
  frame: { left: number; right: number; top: number; bottom: number; width: number };
  boxes: PlateBox[];
  focused: RingRead | null;
  ink: string;
  paper: string;
  /** the window's title */
  title: string;
};

export async function readPlate(page: Page): Promise<PlateRead> {
  return page.evaluate(() => {
    const plate = document.querySelector<HTMLElement>('[data-auth-plate]');
    const none = { left: 0, right: 0, top: 0, bottom: 0, width: 0 };
    if (!plate)
      return {
        found: false,
        state: '',
        host: '',
        frame: none,
        boxes: [],
        focused: null,
        ink: '',
        paper: '',
        title: '',
      };
    const host = plate.classList.contains('is-window') ? 'window' : 'page';
    const frameEl =
      host === 'window'
        ? plate.closest<HTMLElement>('.ts-dialog')
        : plate.closest<HTMLElement>('.ts-auth-column');
    const fr = (frameEl ?? plate).getBoundingClientRect();
    const grounds = (el: Element): string[] => {
      const out: string[] = [];
      for (let node: Element | null = el; node !== null; node = node.parentElement)
        out.push(getComputedStyle(node).backgroundColor);
      return out;
    };
    const tokenOf = (name: string): string => {
      const probe = document.createElement('span');
      probe.style.color = `var(${name})`;
      plate.appendChild(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };
    const boxes: {
      kind: 'heading' | 'sentence' | 'button' | 'input' | 'row' | 'label';
      control: string;
      text: string;
      top: number;
      bottom: number;
      left: number;
      right: number;
      height: number;
      radius: string;
      numeric: string;
      disabled: boolean;
      color: string;
      grounds: string[];
      reserved: boolean;
    }[] = [];
    const scope = host === 'window' ? (plate.closest('.ts-dialog') ?? plate) : plate;
    const els = scope.querySelectorAll<HTMLElement>(
      'h1, h2.ts-dialog-title, .ts-auth-plate p, .ts-auth-plate button, .ts-auth-plate input, .ts-auth-or, .ts-auth-field-label',
    );
    for (const el of els) {
      if (el.getClientRects().length === 0) continue;
      const r = el.getBoundingClientRect();
      const tag = el.tagName;
      const kind =
        tag === 'H1' || tag === 'H2'
          ? 'heading'
          : tag === 'P'
            ? 'sentence'
            : tag === 'BUTTON'
              ? 'button'
              : tag === 'INPUT'
                ? 'input'
                : el.classList.contains('ts-auth-or')
                  ? 'row'
                  : 'label';
      const text = kind === 'input' ? '' : (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      const label = el.querySelector<HTMLElement>('.ts-auth-label') ?? el;
      const cs = getComputedStyle(el);
      boxes.push({
        kind,
        control: el.getAttribute('data-control') ?? '',
        text,
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        height: r.height,
        radius: cs.borderTopLeftRadius,
        numeric: cs.fontVariantNumeric,
        disabled: (el as HTMLButtonElement).disabled === true,
        color: getComputedStyle(label).color,
        grounds: grounds(label),
        reserved: el.hasAttribute('data-reserved'),
      });
    }
    const active = document.activeElement;
    const focused =
      active instanceof HTMLElement && scope.contains(active) && active !== scope
        ? {
            control: active.getAttribute('data-control') ?? active.tagName.toLowerCase(),
            width: getComputedStyle(active).outlineWidth,
            style: getComputedStyle(active).outlineStyle,
            color: getComputedStyle(active).outlineColor,
            offset: getComputedStyle(active).outlineOffset,
            grounds: grounds(active),
          }
        : null;
    return {
      found: true,
      state: plate.getAttribute('data-auth-plate') ?? '',
      host,
      frame: { left: fr.left, right: fr.right, top: fr.top, bottom: fr.bottom, width: fr.width },
      boxes,
      focused,
      ink: tokenOf('--pt-ink'),
      paper: tokenOf('--pt-paper'),
      title: document.querySelector('.ts-dialog-title')?.textContent ?? '',
    };
  });
}

/** Title Case as the brand writes a button: every word capitalised but the small words. */
export function titleCased(label: string): boolean {
  const small = new Set([
    'a',
    'an',
    'and',
    'as',
    'at',
    'by',
    'for',
    'in',
    'of',
    'on',
    'or',
    'the',
    'to',
    'with',
  ]);
  return label.split(' ').every((word, i) => (i > 0 && small.has(word)) || /^[A-Z0-9]/.test(word));
}

/** Sentence case as the brand writes a heading: the first word capitalised, the rest lower but names. */
export function sentenceCased(heading: string): boolean {
  const names = new Set(['Turboslide', 'Google', 'GitHub']);
  const words = heading.split(' ');
  return (
    /^[A-Z]/.test(words[0] ?? '') &&
    words.slice(1).every((word) => names.has(word) || word === word.toLowerCase())
  );
}

/** The countdown's own words, which the spec writes in sentence case on the disabled button. */
const COUNTDOWN = /^Send another in \d+:\d\d$/;

/**
 * The faults of a plate (accounts.plate.states, docs/POLISH-2.md 6.4): the inset, the labels
 * against their grounds, the gaps between content boxes, the window's foot, the ring, the words,
 * the tabular figures.
 */
export function plateFaults(read: PlateRead, where: string): string[] {
  const faults: string[] = [];
  if (!read.found) return [`${where}: no plate is drawn`];
  const inset = read.host === 'window' ? 24 : 0;
  const content = read.boxes.filter((b) => b.kind !== 'heading' || read.host === 'page');
  /* every block starts at the column's inset: a row's second control (Send Another beside Use
     Another Address, Deny beside Approve, the code's second group) stands beside the first */
  const firstOfRow = content.filter(
    (b) =>
      !content.some((o) => o !== b && o.left < b.left - 2 && o.top < b.bottom && b.top < o.bottom),
  );
  for (const b of firstOfRow)
    if (Math.abs(b.left - read.frame.left - inset) > 1.5)
      faults.push(
        `${where}: ${b.control || b.kind} "${b.text.slice(0, 24)}" starts ${Math.round(b.left - read.frame.left)} px in, not ${inset}`,
      );
  for (const b of read.boxes.filter((x) => x.kind === 'button' && x.text !== '')) {
    const ratio = labelContrast({
      control: b.control,
      tag: 'button',
      label: b.text,
      left: b.left,
      top: b.top,
      bottom: b.bottom,
      disabled: b.disabled,
      color: b.color,
      grounds: b.grounds,
    });
    if (ratio < 4.5)
      faults.push(
        `${where}: "${b.text}"${b.disabled ? ' (disabled)' : ''} reads ${ratio.toFixed(2)}:1`,
      );
    if (!COUNTDOWN.test(b.text) && !titleCased(b.text))
      faults.push(`${where}: the button "${b.text}" is not in Title Case`);
  }
  /* the vertical gaps between the plate's content boxes (the window's title counts as the first) */
  const spans = content
    .filter((b) => b.text !== '' || b.kind !== 'sentence' || b.reserved)
    .map((b) => [b.top, b.bottom] as const)
    .sort((a, b) => a[0] - b[0]);
  let reach = spans[0]?.[1] ?? 0;
  for (const [top, bottom] of spans.slice(1)) {
    if (top - reach > 32.5)
      faults.push(`${where}: ${Math.round(top - reach)} px between two boxes`);
    reach = Math.max(reach, bottom);
  }
  if (read.host === 'window') {
    const under = read.frame.bottom - reach;
    if (under > 25.5) faults.push(`${where}: ${Math.round(under)} px under the last box`);
  }
  if (read.focused !== null) {
    const fault = ringFault(read.focused, read.ink, read.paper);
    if (fault !== null) faults.push(`${where}: the focus ring ${fault}`);
  }
  for (const b of read.boxes) {
    if (b.kind === 'heading' && !sentenceCased(b.text))
      faults.push(`${where}: the heading "${b.text}" is not in sentence case`);
    if (
      b.kind === 'sentence' &&
      b.text !== '' &&
      !b.control.endsWith('.code-named') &&
      !/[.]$/.test(b.text)
    )
      faults.push(`${where}: the sentence "${b.text}" has no period`);
    if (/[–—]/.test(b.text)) faults.push(`${where}: a dash in "${b.text}"`);
    if ((b.control.includes('.code.') || COUNTDOWN.test(b.text)) && !/tabular-nums/.test(b.numeric))
      faults.push(`${where}: ${b.control || b.text} computes ${b.numeric}`);
  }
  return faults;
}

// ---------------------------------------------------------------------------------------------
// The spec rows of lane A (docs/POLISH-2.md 6.4), driven by core/share.spec.ts: the sign in page,
// its error sentences and Google's button. Each test opens its own contexts and closes them.

type Appearance = 'light' | 'dark';
const APPEARANCES: readonly Appearance[] = ['light', 'dark'];

/** A context at a size in an appearance, the stored choice set as the theme button stores it. */
export async function contextAt(
  browser: Browser,
  baseURL: string | undefined,
  width: number,
  appearance: Appearance,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    ...(baseURL === undefined ? {} : { baseURL }),
    extraHTTPHeaders,
    viewport: { width, height: width < 720 ? 844 : 900 },
    colorScheme: appearance,
  });
  await context.addInitScript((t) => {
    try {
      localStorage.setItem('gt-theme', t);
      localStorage.setItem('ts-chrome-appearance', t);
    } catch {
      /* a storage that refuses keeps the system's appearance, which is the same here */
    }
  }, appearance);
  const page = await context.newPage();
  return { context, page };
}

/** The words a person reads on the page that the competitor guard would refuse. */
export async function guardWords(page: Page): Promise<string[]> {
  const text = await page.evaluate(() => document.body.innerText);
  return competitorMentions(text);
}

/** The identity seed's newest sign in code for an address, where the spec knows the database. */
export function mailedCode(email: string): string | null {
  const db = process.env.TURBOSLIDE_AUTH_DB;
  if (db === undefined || db === '') return null;
  const root = join(import.meta.dirname, '..', '..', '..', '..');
  const path = db.startsWith('/') ? db : join(root, db);
  try {
    const out = execFileSync(
      'node',
      [join(import.meta.dirname, '..', 'identity-seed.mts'), 'mail', path, email],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const answer = JSON.parse(out.trim().split('\n').pop() ?? '{}') as { code?: string | null };
    return answer.code ?? null;
  } catch {
    return null;
  }
}

/** The facts of the sign in page a row reads beyond the plate. */
type PageFacts = {
  status: number;
  mark: { href: string | null; bottom: number } | null;
  heading: { top: number; size: string; text: string } | null;
  theme: boolean;
  foot: string | null;
  figure: {
    shown: boolean;
    credit: string;
    twins: { theme: string; loaded: boolean; shown: boolean }[];
  };
  google: { index: number; count: number };
};

async function signInPageFacts(page: Page): Promise<Omit<PageFacts, 'status'>> {
  return page.evaluate(() => {
    const mark = document.querySelector<HTMLAnchorElement>('.ts-auth-home');
    const h1 = document.querySelector<HTMLElement>('.ts-auth-heading');
    const figure = document.querySelector<HTMLElement>('[data-control="page.signIn.figure"]');
    const controls = [...document.querySelectorAll('.ts-auth-plate button, .ts-auth-plate input')];
    const google = controls.findIndex(
      (el) => el.getAttribute('data-control') === 'page.signIn.google',
    );
    return {
      mark: mark
        ? { href: mark.getAttribute('href'), bottom: mark.getBoundingClientRect().bottom }
        : null,
      heading: h1
        ? {
            top: h1.getBoundingClientRect().top,
            size: getComputedStyle(h1).fontSize,
            text: (h1.textContent ?? '').trim(),
          }
        : null,
      theme: document.querySelector('.ts-auth-foot [data-control="view.theme"]') !== null,
      foot: document.querySelector('.ts-auth-foot-line')?.textContent ?? null,
      figure: {
        shown: figure !== null && figure.getClientRects().length > 0,
        credit: figure?.querySelector('.ts-mood-credit')?.textContent ?? '',
        twins: [...(figure?.querySelectorAll<HTMLImageElement>('img') ?? [])].map((img) => ({
          theme: img.getAttribute('data-theme-twin') ?? '',
          loaded: img.complete && img.naturalWidth > 0,
          shown: img.getClientRects().length > 0,
        })),
      },
      google: { index: google, count: controls.length },
    };
  });
}

/** The lane's spec rows; returns their ids for share.spec.ts's coverage list. */
export function authPlateRows(): string[] {
  const declared: string[] = [];
  /* a lane reads its rows before the push enters them in the matrix (the matrix changes only in
     the push's commit, docs/POLISH-2.md 7.0): TURBOSLIDE_ROWS_AHEAD=1 declares them by id */
  const ahead = process.env.TURBOSLIDE_ROWS_AHEAD === '1';
  const row = (id: string, body: Parameters<typeof test>[2]) => {
    if (isCoreId(id)) {
      declared.push(id);
      test(title(id), body);
    } else if (ahead) test(`${id}: ahead of the matrix`, body);
  };

  row('accounts.plate.signin-page', async ({ browser, baseURL }) => {
    test.setTimeout(900_000);
    const readings: string[] = [];
    const failures: string[] = [];
    for (const appearance of APPEARANCES)
      for (const width of [1440, 390]) {
        const where = `${appearance} ${width}`;
        const { context, page } = await contextAt(browser, baseURL, width, appearance);
        const twinRequests: string[] = [];
        page.on('request', (request) => {
          if (/\/brand\/mood-earth-(light|dark)\.jpg/.test(request.url()))
            twinRequests.push(request.url());
        });
        try {
          const response = await page.goto('/signin?next=/decks', { timeout: 240_000 });
          const status = response?.status() ?? 0;
          if (status !== 200) failures.push(`${where}: /signin answered ${status}`);
          await page.locator('[data-auth-plate]').waitFor({ timeout: 120_000 });
          await page.waitForLoadState('load');
          if (width >= 1024)
            await page
              .waitForFunction(
                () =>
                  [
                    ...document.querySelectorAll<HTMLImageElement>(
                      '[data-control="page.signIn.figure"] img',
                    ),
                  ].some(
                    (img) =>
                      img.getClientRects().length > 0 && img.complete && img.naturalWidth > 0,
                  ),
                undefined,
                { timeout: 60_000 },
              )
              .catch(() => undefined);
          const read = await readPlate(page);
          const facts = await signInPageFacts(page);
          const column = read.frame.width;
          const want = Math.min(464, width - 40);
          readings.push(
            `${where}: ${read.state}, column ${Math.round(column)}, mark to heading ${facts.mark && facts.heading ? Math.round(facts.heading.top - facts.mark.bottom) : 'none'}, heading ${facts.heading?.size}, controls ${read.boxes
              .filter((b) => b.kind === 'button' || b.kind === 'input')
              .map(
                (b) =>
                  `${b.control.split('.').pop()} ${Math.round(b.height)}x${Math.round(b.right - b.left)} ${b.radius}`,
              )
              .join(', ')}; figure ${facts.figure.shown ? 'shown' : 'none'} ${facts.figure.twins
              .filter((t) => t.shown)
              .map((t) => `${t.theme}${t.loaded ? ' loaded' : ''}`)
              .join(' ')}; twin requests ${twinRequests.length}`,
          );
          if (Math.abs(column - want) > 1)
            failures.push(`${where}: the column is ${column} px, not ${want}`);
          if (facts.mark === null || facts.mark.href !== '/decks')
            failures.push(
              `${where}: the mark is not a link to /decks (${facts.mark?.href ?? 'none'})`,
            );
          if (facts.heading === null || facts.heading.text !== 'Sign in to Turboslide')
            failures.push(`${where}: the heading reads "${facts.heading?.text ?? ''}"`);
          if (facts.heading?.size !== '30px')
            failures.push(`${where}: the heading is ${facts.heading?.size}`);
          if (
            facts.mark &&
            facts.heading &&
            Math.abs(facts.heading.top - facts.mark.bottom - 40) > 1
          )
            failures.push(
              `${where}: ${Math.round(facts.heading.top - facts.mark.bottom)} px from the mark to the heading`,
            );
          if (
            !read.boxes.some((b) => b.kind === 'sentence' && /move to your account\./.test(b.text))
          )
            failures.push(`${where}: no lede`);
          for (const b of read.boxes.filter((x) => x.kind === 'button' || x.kind === 'input')) {
            if (Math.abs(b.height - 44) > 0.5)
              failures.push(`${where}: ${b.control} is ${b.height} px tall`);
            if (Math.abs(b.right - b.left - column) > 1)
              failures.push(`${where}: ${b.control} is not the column's width`);
            if (b.radius !== '6px') failures.push(`${where}: ${b.control} computes ${b.radius}`);
          }
          if (facts.google.index > 0)
            failures.push(`${where}: Continue with Google is not the first control`);
          if (facts.google.index === 0 && facts.foot === null)
            failures.push(`${where}: no foot sentence under Google`);
          if (!facts.theme) failures.push(`${where}: no theme button on the foot row`);
          if (width >= 1024) {
            const shown = facts.figure.twins.filter((t) => t.shown);
            if (
              !facts.figure.shown ||
              shown.length !== 1 ||
              shown[0]?.theme !== appearance ||
              !shown[0]?.loaded
            )
              failures.push(
                `${where}: the ${appearance} twin is not shown loaded (${JSON.stringify(facts.figure.twins)})`,
              );
            if (!/NASA/.test(facts.figure.credit))
              failures.push(`${where}: no credit under the picture`);
            if (twinRequests.some((u) => !u.includes(`mood-earth-${appearance}`)))
              failures.push(`${where}: the other appearance's twin was requested`);
          } else {
            if (facts.figure.shown) failures.push(`${where}: a picture under 1024 px`);
            if (twinRequests.length > 0) failures.push(`${where}: a twin requested under 1024 px`);
          }
          for (const word of await guardWords(page))
            failures.push(`${where}: the guard's word "${word}"`);
        } finally {
          await context.close();
        }
      }
    /* a signed in visitor is sent to next: signed in by the mailed code where the base captures mail */
    {
      const { context, page } = await contextAt(browser, baseURL, 1440, 'light');
      try {
        await page.goto('/signin?next=/decks/templates', { timeout: 240_000 });
        await page.locator('.ts-auth-page[data-hydrated]').waitFor({ timeout: 120_000 });
        const email = `plate-${Date.now()}@example.test`;
        const field = page.locator('[data-control="page.signIn.email"]');
        const code =
          (await field.count()) > 0 && isLocalBase(baseURL ?? '')
            ? await (async () => {
                await field.fill(email);
                await page.locator('[data-control="page.signIn.continue"]').click();
                await page
                  .locator('[data-control="page.signIn.code"]')
                  .waitFor({ timeout: 60_000 });
                return mailedCode(email);
              })()
            : null;
        if (code === null) {
          readings.push('redirect: not read on this base (no captured mail to sign in with)');
        } else {
          await page.locator('[data-control="page.signIn.code"]').fill(code);
          await page.locator('[data-control="page.signIn.verify"]').click();
          /* the address's pathname: the sign in page's own search names the return path too */
          await page.waitForURL((url) => url.pathname === '/decks/templates', { timeout: 120_000 });
          const response = await page.goto('/signin?next=/decks', { timeout: 240_000 });
          await page.waitForURL((url) => url.pathname !== '/signin', { timeout: 120_000 });
          readings.push(
            `redirect: signed in by the mailed code, /signin?next=/decks answered ${response?.status()} and landed on ${new URL(page.url()).pathname}`,
          );
          if (new URL(page.url()).pathname !== '/decks')
            failures.push('a signed in visitor was not sent to next');
        }
      } finally {
        await context.close();
      }
    }
    /* the gallery: 404 on a deployment; on a checkout opened on purpose it draws */
    {
      const { context, page } = await contextAt(browser, baseURL, 1440, 'light');
      try {
        const response = await page.goto('/dev/auth?chrome=0', { timeout: 240_000 });
        const status = response?.status() ?? 0;
        readings.push(`/dev/auth answered ${status}`);
        if (!isLocalBase(baseURL ?? '') && status !== 404)
          failures.push(`/dev/auth answered ${status} on a deployment`);
      } finally {
        await context.close();
      }
    }
    test.info().annotations.push({ type: 'sign in page', description: readings.join(' | ') });
    expect(failures, readings.join(' | ')).toEqual([]);
  });

  row('accounts.provider-error-sentence', async ({ browser, baseURL }) => {
    test.setTimeout(600_000);
    const cases = [
      ['access_denied', 'cancelled'],
      ['state_mismatch', 'expired'],
      ['INVALID_TOKEN', 'link'],
      ['account_not_linked', 'account'],
      ['a_code_nobody_names', 'other'],
    ] as const;
    const SENTENCES: Record<string, string> = {
      cancelled: 'The sign in was cancelled at Google.',
      expired: 'The sign in started in another tab or took too long. Start again from this page.',
      link: 'That link was used or has expired. Ask for a new one.',
      account: 'That Google account cannot be joined to the account signed in here.',
      other: 'The sign in did not complete.',
    };
    const readings: string[] = [];
    const failures: string[] = [];
    const { context, page } = await contextAt(browser, baseURL, 1440, 'light');
    try {
      for (const [code, reason] of cases) {
        const response = await page.goto(`/signin?next=/decks&error=${encodeURIComponent(code)}`, {
          timeout: 240_000,
        });
        await page.locator('.ts-auth-page[data-hydrated]').waitFor({ timeout: 120_000 });
        const facts = await page.evaluate(() => ({
          state: document.querySelector('[data-auth-plate]')?.getAttribute('data-auth-plate') ?? '',
          heading: document.querySelector('.ts-auth-heading')?.textContent ?? '',
          reason: document.querySelector('[data-control="page.signIn.reason"]')?.textContent ?? '',
          named:
            document.querySelector('[data-control="page.signIn.code-named"]')?.textContent ?? null,
          retry: document.querySelector('[data-control="page.signIn.retry"]')?.textContent ?? null,
        }));
        readings.push(
          `${code}: ${response?.status()} ${facts.state} "${facts.reason}"${facts.named === null ? '' : ` (${facts.named})`}`,
        );
        if (facts.state !== `error.${reason}`)
          failures.push(`${code}: the state is ${facts.state}`);
        if (facts.heading !== 'Sign in did not complete')
          failures.push(`${code}: the heading reads "${facts.heading}"`);
        if (facts.reason !== SENTENCES[reason])
          failures.push(`${code}: the sentence reads "${facts.reason}"`);
        if (reason === 'other' && facts.named !== `Code: ${code}`)
          failures.push(`${code}: the code is not named (${facts.named})`);
        if (reason !== 'other' && facts.named !== null)
          failures.push(`${code}: a code named under a known reason`);
        if (facts.retry !== 'Try Again') failures.push(`${code}: no Try Again`);
        /* Try Again: back to the methods with the same next, the error gone from the address */
        await expect
          .poll(
            async () => {
              await page
                .locator('[data-control="page.signIn.retry"]')
                .click({ timeout: 5_000 })
                .catch(() => undefined);
              return page.evaluate(
                () =>
                  document.querySelector('[data-auth-plate]')?.getAttribute('data-auth-plate') ??
                  '',
              );
            },
            { timeout: 60_000 },
          )
          .toMatch(/^methods\./);
        await expect.poll(() => page.url(), { timeout: 20_000 }).not.toContain('error=');
        const url = new URL(page.url());
        if (url.pathname !== '/signin' || url.searchParams.get('next') !== '/decks')
          failures.push(`${code}: Try Again landed on ${url.pathname}${url.search}`);
      }
    } finally {
      await context.close();
    }
    test.info().annotations.push({ type: 'error sentences', description: readings.join(' | ') });
    expect(failures, readings.join(' | ')).toEqual([]);
  });

  row('accounts.google-button-guideline', async ({ browser, baseURL }) => {
    test.setTimeout(600_000);
    const readings: string[] = [];
    const failures: string[] = [];
    const WANT = {
      light: { fill: 'rgb(255, 255, 255)', edge: 'rgb(116, 119, 117)' },
      dark: { fill: 'rgb(19, 19, 20)', edge: 'rgb(142, 145, 143)' },
    } as const;
    const G_FILLS = ['#EA4335', '#4285F4', '#FBBC05', '#34A853'];
    let drawn = false;
    for (const appearance of APPEARANCES) {
      const { context, page } = await contextAt(browser, baseURL, 1440, appearance);
      try {
        await page.goto('/signin?next=/decks', { timeout: 240_000 });
        await page.locator('[data-auth-plate]').waitFor({ timeout: 120_000 });
        const google = page.locator('[data-control="page.signIn.google"]');
        if ((await google.count()) === 0) continue;
        drawn = true;
        const facts = await google.evaluate((el) => {
          const cs = getComputedStyle(el);
          const label = el.querySelector<HTMLElement>('.ts-auth-label');
          const svg = el.querySelector('svg');
          const grounds: string[] = [];
          for (let node: Element | null = label; node !== null; node = node.parentElement)
            grounds.push(getComputedStyle(node).backgroundColor);
          return {
            fill: cs.backgroundColor,
            edge: cs.borderTopColor,
            edgeWidth: cs.borderTopWidth,
            mark: svg
              ? { w: svg.getBoundingClientRect().width, h: svg.getBoundingClientRect().height }
              : null,
            fills: [...(svg?.querySelectorAll('path') ?? [])].map((p) =>
              (p.getAttribute('fill') ?? '').toUpperCase(),
            ),
            text: (label?.textContent ?? '').trim(),
            weight: label ? getComputedStyle(label).fontWeight : '',
            family: label ? getComputedStyle(label).fontFamily : '',
            color: label ? getComputedStyle(label).color : '',
            grounds,
          };
        });
        const ratio = labelContrast({
          control: 'page.signIn.google',
          tag: 'button',
          label: facts.text,
          left: 0,
          top: 0,
          bottom: 0,
          disabled: false,
          color: facts.color,
          grounds: facts.grounds,
        });
        readings.push(
          `${appearance}: fill ${facts.fill}, edge ${facts.edgeWidth} ${facts.edge}, mark ${facts.mark?.w}x${facts.mark?.h} ${facts.fills.join(' ')}, "${facts.text}" ${facts.weight} ${ratio.toFixed(2)}:1`,
        );
        if (facts.fill !== WANT[appearance].fill)
          failures.push(`${appearance}: the fill is ${facts.fill}`);
        if (facts.edge !== WANT[appearance].edge || facts.edgeWidth !== '1px')
          failures.push(`${appearance}: the edge is ${facts.edgeWidth} ${facts.edge}`);
        if (
          facts.mark === null ||
          Math.round(facts.mark.w) !== 18 ||
          Math.round(facts.mark.h) !== 18
        )
          failures.push(`${appearance}: the G is ${facts.mark?.w}x${facts.mark?.h}`);
        if (G_FILLS.some((fill) => !facts.fills.includes(fill)))
          failures.push(`${appearance}: the G is not the four colour mark`);
        if (facts.text !== 'Continue with Google')
          failures.push(`${appearance}: the label reads "${facts.text}"`);
        if (facts.weight !== '500' || !/Inter/.test(facts.family))
          failures.push(`${appearance}: the label is ${facts.weight} ${facts.family}`);
        if (ratio < 4.5) failures.push(`${appearance}: the label reads ${ratio.toFixed(2)}:1`);
      } finally {
        await context.close();
      }
    }
    test.skip(
      !drawn,
      'not driven: this server offers no Google client, so no Continue with Google is drawn',
    );
    test
      .info()
      .annotations.push({ type: 'Continue with Google', description: readings.join(' | ') });
    expect(failures, readings.join(' | ')).toEqual([]);
  });

  return declared;
}
