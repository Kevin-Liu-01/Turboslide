import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

import { extraHTTPHeaders, title } from './lib';

// Lane B2's row of Round 1 in core/chrome.spec.ts (docs/NEXT.md 4.1.3 item 11, 4.1.5): one button
// rule on every surface a seller meets. The spec file calls `chromePages()` once and spreads its
// ids into its coverage list, so the row lives in one module of the lane, the way B3b's
// chrome-round1.ts does. The editor is read on a `/new` draft, which writes nothing (SPEC 6.1), so
// the row makes no deck.

/** The words Title Case leaves in lower case inside a label (DECK-GRAMMAR 22: "Open the Example Deck"). */
const SMALL_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'for',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'with',
]);

/** The surfaces of the rule and their addresses. */
const SURFACES: ReadonlyArray<{ name: string; path: string; ready: string }> = [
  { name: 'editor', path: '/new', ready: '.pt-viewer:not(.ts-skeleton)[data-settled]' },
  { name: '/home', path: '/home', ready: 'main.ts-product[data-hydrated]' },
  { name: '/decks', path: '/decks', ready: '.ts-home-page[data-hydrated]' },
  { name: 'Not found', path: '/no-such-page-buttons-rule', ready: '[data-control="notfound"]' },
  {
    name: 'You need access',
    path: '/deck/no-such-deck-buttons-rule',
    ready: '[data-control="access.page"]',
  },
  /* an id the store refuses as a slug draws the refused page on every server; `..%2f` does on vite
     dev alone, since the node-server build resolves the dots before the route */
  { name: 'the refused page', path: '/edit/Not_A_Slug', ready: '[data-control="refused"]' },
];

export type ButtonFacts = {
  labels: { control: string; label: string }[];
  radii: { control: string; radius: string; slideshow: boolean; labelFirst: boolean }[];
  ptRadius: string;
};

/** Whether a label is in Title Case: every word capitalised except the small words inside it. */
export function isTitleCase(label: string): boolean {
  const words = label.split(/\s+/).filter(Boolean);
  return words.every((word, index) => {
    const bare = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    if (bare === '' || /^[0-9]/.test(bare)) return true;
    if (index > 0 && index < words.length - 1 && SMALL_WORDS.has(bare)) return true;
    return /^[A-Z]/.test(bare);
  });
}

async function buttonFacts(page: Page): Promise<ButtonFacts> {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
    };
    const controls = [
      ...document.querySelectorAll<HTMLElement>(
        'button, a.pt-ib, [role="button"], input[type="search"], input[type="text"], [role="combobox"]',
      ),
    ].filter(visible);
    const probe = document.createElement('div');
    probe.style.borderRadius = 'var(--pt-radius)';
    document.body.append(probe);
    const ptRadius = getComputedStyle(probe).borderTopLeftRadius;
    probe.remove();
    const labels: { control: string; label: string }[] = [];
    const radii: { control: string; radius: string; slideshow: boolean; labelFirst: boolean }[] =
      [];
    for (const el of controls) {
      const control =
        el.getAttribute('data-control') ??
        `${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0] ?? ''}`;
      const tag = el.tagName.toLowerCase();
      /* a control that shows a name is not a button label: the deck's name in the title row,
         a template's or a presentation's name on its card, the chosen row a dropdown's trigger
         shows (DECK-GRAMMAR 22 rules the words a button says, not the names of things) */
      const names = el.matches(
        '[data-control="deck.name"], [data-control^="home.template."], [data-control="home.blank"], [data-control^="home.title."], [data-control^="home.open."], [data-control^="templates.card."], .ts-slide-row, [role="combobox"]',
      );
      if (!names && (tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button')) {
        /* the label is the words the button shows, never an aria name of an icon button; a
           measure after the words (a step's length, "Restore 2.5 s") is a number, not a word */
        const label = (el.innerText ?? '')
          .replace(/\s+/g, ' ')
          .trim()
          .replace(/\s+\d+(?:\.\d+)?\s?(?:s|ms|px|%)$/, '');
        if (
          label !== '' &&
          /[A-Za-z]/.test(label) &&
          !el.closest('[role="menu"], [role="listbox"]')
        )
          labels.push({ control, label });
      }
      const cs = getComputedStyle(el);
      const slideshow = /slideshow/i.test(control);
      const first = el.firstElementChild;
      const firstText = [...el.childNodes].find(
        (node) =>
          (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '') ||
          node.nodeType === Node.ELEMENT_NODE,
      );
      const labelFirst =
        firstText !== undefined &&
        (firstText.nodeType === Node.TEXT_NODE ||
          (first !== null && first.tagName.toLowerCase() !== 'svg' && first === firstText));
      radii.push({ control, radius: cs.borderTopLeftRadius, slideshow, labelFirst });
    }
    return { labels, radii, ptRadius };
  });
}

/** Registers the row's test and returns its id for the spec's coverage list. */
export function chromePages(): string[] {
  test(title('chrome.buttons.one-rule'), async ({ browser }: { browser: Browser }) => {
    test.setTimeout(240_000);
    const failures: string[] = [];
    const notes: string[] = [];
    const context = await browser.newContext({
      extraHTTPHeaders,
      viewport: { width: 1440, height: 900 },
    });
    try {
      for (const surface of SURFACES) {
        const page = await context.newPage();
        try {
          await page.goto(surface.path);
          await page.locator(surface.ready).first().waitFor({ timeout: 90_000 });
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(800);
          const facts = await buttonFacts(page);
          const wrong = facts.labels.filter((l) => !isTitleCase(l.label));
          /* the design round's ladder (docs/DESIGN.md 3.1; DR-D2#2): a control is square, a
             button inside a 6 px plate takes the 4 px chip corner, every other button with a box
             the 6 px control corner (--pt-radius), Slideshow included; 8 px is a window's */
          const allowed = new Set(['0px', '4px', facts.ptRadius]);
          const corners = facts.radii.filter((r) =>
            r.slideshow
              ? r.radius !== facts.ptRadius && r.radius !== '0px'
              : !allowed.has(r.radius),
          );
          const slideshow = facts.radii.filter((r) => r.slideshow && r.radius === facts.ptRadius);
          const notFirst = slideshow.filter((r) => !r.labelFirst);
          notes.push(
            `${surface.name}: ${facts.labels.length} labels (${facts.labels.map((l) => l.label).join(', ')}); ${facts.radii.length} corners, the radius token ${facts.ptRadius}${wrong.length ? `; not Title Case: ${wrong.map((w) => `${w.control} "${w.label}"`).join(', ')}` : ''}${corners.length ? `; corners: ${corners.map((c) => `${c.control} ${c.radius}`).join(', ')}` : ''}`,
          );
          for (const w of wrong) failures.push(`${surface.name}: ${w.control} reads "${w.label}"`);
          for (const c of corners)
            failures.push(`${surface.name}: ${c.control} has a ${c.radius} corner`);
          for (const s of notFirst)
            failures.push(`${surface.name}: ${s.control} draws its glyph before its label`);
        } finally {
          await page.close();
        }
      }
    } finally {
      await context.close();
    }
    test.info().annotations.push({ type: 'buttons', description: notes.join(' | ') });
    expect(failures).toEqual([]);
  });
  return ['chrome.buttons.one-rule'];
}
