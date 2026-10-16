// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { THEME_CSS_STYLE_ID } from '@turboslide/render/theme-css';
import { deckAppearance } from '@turboslide/schema/deck';
import type { DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';

import { buildMenuContext, DEFAULT_SETTINGS } from '../editor-shell';
import type { EditorShellInput } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { ThemesPanel } from '../ThemesPanel';
import { hideTooltip } from '../Tooltip';

// The Brand kit panel's colour swatches (the Glyphfield port, wave 2 item 6; docs/DROPDOWNS.md
// question 1): each role's swatch is a button that opens the colour plate's free field where a
// native colour well stood. The field previews each draft on the sheet and on the swatch through
// the panel's transient stylesheet, Apply writes the role once as one history entry, and Escape
// closes it with no write and the preview gone. The panel is the editor's largest; its first
// render in a cold worker under load passes 5 s, so each block allows 15 s as
// editor-shell-render.test.tsx does.

afterEach(() => {
  hideTooltip();
  cleanup();
  document.getElementById(THEME_CSS_STYLE_ID)?.remove();
});

const doc = workedDocument();
/* the shell's notice line */
const say = vi.fn();

function Host({
  children,
  document: shown = doc,
}: {
  children: React.ReactNode;
  document?: DeckDocument;
}) {
  const input: EditorShellInput = {
    deckId: shown.deck.id,
    document: shown,
    slideId: Object.keys(shown.slides)[0] ?? '',
    revision: 7,
    dispatch: vi.fn(() => Promise.resolve({ revision: 8 })),
  };
  const state = {
    input,
    platform: 'mac',
    menuContext: buildMenuContext(input, DEFAULT_SETTINGS, 'mac'),
    settings: DEFAULT_SETTINGS,
    say,
  } as unknown as EditorShellState;
  return <EditorShellContext.Provider value={state}>{children}</EditorShellContext.Provider>;
}

function panel(shown: DeckDocument = doc) {
  const commit = vi.fn((_mutations: Mutation[], _label: string) => Promise.resolve());
  const view = render(
    <Host document={shown}>
      <ThemesPanel document={shown} commit={commit} onClose={() => undefined} />
    </Host>,
  );
  const swatch = view.container.querySelector<HTMLButtonElement>(
    '[data-control="panel.brand.color.primary.swatch"]',
  );
  if (swatch === null) throw new Error('no Primary swatch');
  return { ...view, commit, swatch };
}

const field = (id: string) =>
  document.querySelector<HTMLElement>(`[data-control="panel.brand.color.primary.field.${id}"]`);

describe('the Brand kit panel’s colour field', { timeout: 15_000 }, () => {
  it('draws a button per role and no native colour well', () => {
    const { container, swatch } = panel();
    expect(container.querySelectorAll('input[type="color"]')).toHaveLength(0);
    expect(swatch.tagName).toBe('BUTTON');
    expect(swatch.getAttribute('aria-label')).toBe('Primary');
    expect(container.querySelectorAll('[data-control$=".swatch"].ts-brand-swatch')).toHaveLength(6);
  });

  it('opens the field from the swatch, previews a draft and writes the role once on Apply', async () => {
    const { commit, swatch } = panel();
    const before = swatch.style.background;
    fireEvent.click(swatch);
    expect(swatch.getAttribute('aria-expanded')).toBe('true');
    const area = field('custom.area');
    expect(area).not.toBeNull();
    /* the field alone: no swatch of the plate, and its Hex field is apart from the row's */
    expect(document.querySelectorAll('.ts-color-plate .ts-color-swatch')).toHaveLength(0);
    expect(
      document.querySelectorAll('[data-control="panel.brand.color.primary.hex"]'),
    ).toHaveLength(1);
    expect(document.activeElement).toBe(area);
    const start = (field('hex') as HTMLInputElement).value;
    fireEvent.keyDown(area as HTMLElement, { key: 'ArrowDown', shiftKey: true });
    const draft = (field('hex') as HTMLInputElement).value;
    expect(draft).not.toBe(start);
    /* the preview: the swatch and the sheet's transient stylesheet draw the draft; no write yet */
    expect(swatch.style.background).not.toBe(before);
    expect(document.getElementById(THEME_CSS_STYLE_ID)?.textContent ?? '').toContain(draft);
    expect(commit).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(field('custom.apply') as HTMLElement);
    });
    expect(commit).toHaveBeenCalledTimes(1);
    const [mutations, label] = commit.mock.calls[0] ?? [[], ''];
    expect(label).toBe('Brand kit: Primary');
    expect(JSON.stringify(mutations)).toContain(draft);
    expect(field('custom.area')).toBeNull();
    expect(document.getElementById(THEME_CSS_STYLE_ID)).toBeNull();
  });

  it('closes on Escape with no write, the preview gone and the focus on the swatch', () => {
    const { commit, swatch } = panel();
    const before = swatch.style.background;
    fireEvent.click(swatch);
    const area = field('custom.area') as HTMLElement;
    fireEvent.keyDown(area, { key: 'ArrowLeft', shiftKey: true });
    expect(document.getElementById(THEME_CSS_STYLE_ID)).not.toBeNull();
    fireEvent.keyDown(area, { key: 'Escape' });
    expect(field('custom.area')).toBeNull();
    expect(commit).not.toHaveBeenCalled();
    expect(document.getElementById(THEME_CSS_STYLE_ID)).toBeNull();
    expect(swatch.style.background).toBe(before);
    expect(document.activeElement).toBe(swatch);
  });
});

// The kit check at the panel's foot (kit-check.ts): a deck whose kit Text is under 4.5:1 lists the
// finding with Fix, and Fix is one kit write of the fixed colour; a kit with nothing to fix says
// what was measured.
describe('the Brand kit panel’s check', { timeout: 15_000 }, () => {
  it('says what it measured when nothing is under its ratio', () => {
    const { container } = panel();
    expect(container.querySelector('[data-control="panel.brand.check"]')?.textContent).toBe(
      'Text reaches 4.5:1 and every other color 3:1 on Background in both appearances',
    );
  });

  it('lists a Text under 4.5:1 with Fix, and Fix writes the fixed colour once', async () => {
    const appearance = deckAppearance(doc.deck);
    const shown: DeckDocument = {
      ...doc,
      deck: {
        ...doc.deck,
        brand: {
          ...doc.deck.brand,
          colors: { [appearance]: { text: appearance === 'light' ? '#9aa3b5' : '#3a3f4a' } },
        },
      },
    };
    const { container, commit } = panel(shown);
    const row = container.querySelector(
      `[data-control="panel.brand.check.contrast.${appearance}.text"]`,
    );
    expect(row?.textContent).toMatch(
      /^Text on Background measures [\d.]+:1 on (light|dark) slides; it needs 4\.5:1Fix$/,
    );
    const fix = row?.querySelector<HTMLButtonElement>('button');
    expect(fix?.getAttribute('data-control')).toBe(
      `panel.brand.check.contrast.${appearance}.text.fix`,
    );
    await act(async () => {
      fix?.click();
    });
    expect(commit).toHaveBeenCalledTimes(1);
    const [mutations, label] = commit.mock.calls[0] ?? [[], ''];
    expect(label).toBe('Brand kit: Text');
    expect(mutations).toEqual([
      {
        op: 'deck.set',
        path: `/brand/colors/${appearance}/text`,
        value: expect.stringMatching(/^#[0-9a-f]{6}$/),
      },
    ]);
  });
});

// Import Kit at the panel's foot (kit-import.ts): a Glyphfield token file is one kit write with the
// label "Brand kit: Import", and a file that holds no colour role is refused with no write.
describe('the Brand kit panel’s Import Kit', { timeout: 15_000 }, () => {
  const tokens = {
    color: { ink: { $value: '#14161a' }, paper: { $value: '#fbfaf7' } },
    semantic: {
      light: {
        background: { $value: '{color.paper}' },
        foreground: { $value: '{color.ink}' },
        border: { $value: '{color.ink}' },
      },
    },
  };
  const choose = async (input: HTMLInputElement, text: string) => {
    const file = new File([text], 'acme-kit.json', { type: 'application/json' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  };

  it('writes the kit’s colours from a token file in one change', async () => {
    const { container, commit } = panel();
    const input = container.querySelector<HTMLInputElement>(
      '[data-control="panel.brand.import.file"]',
    );
    expect(input?.accept).toBe('.zip,.json,application/zip,application/json');
    if (input === null) throw new Error('no file field');
    await choose(input, JSON.stringify(tokens));
    expect(commit).toHaveBeenCalledTimes(1);
    const [mutations, label] = commit.mock.calls[0] ?? [[], ''];
    expect(label).toBe('Brand kit: Import');
    expect(JSON.stringify(mutations)).toContain('#fbfaf7');
    expect(JSON.stringify(mutations)).toContain('#14161a');
    expect(say.mock.calls.at(-1)?.[0]).toBe(
      '2 colors from acme-kit.json are in the kit; its role border has no place in it',
    );
  });

  it('names one colour in the singular and two refused roles in the plural', async () => {
    const { container } = panel();
    const input = container.querySelector<HTMLInputElement>(
      '[data-control="panel.brand.import.file"]',
    );
    if (input === null) throw new Error('no file field');
    const light = { background: { $value: '{color.paper}' }, border: {}, focus: {} };
    await choose(input, JSON.stringify({ color: tokens.color, semantic: { light } }));
    expect(say.mock.calls.at(-1)?.[0]).toBe(
      '1 color from acme-kit.json is in the kit; its roles border and focus have no place in it',
    );
  });

  it('writes nothing for a file with no colour role', async () => {
    const { container, commit } = panel();
    const input = container.querySelector<HTMLInputElement>(
      '[data-control="panel.brand.import.file"]',
    );
    if (input === null) throw new Error('no file field');
    await choose(input, JSON.stringify({ color: tokens.color }));
    expect(commit).not.toHaveBeenCalled();
  });
});
