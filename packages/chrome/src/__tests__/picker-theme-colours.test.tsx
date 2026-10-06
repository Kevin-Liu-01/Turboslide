// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { deckTokens } from '@turboslide/render/theme-css';
import type { BrandKit, StoredThemeId } from '@turboslide/schema/brand';
import { COLOR_TOKENS } from '@turboslide/schema/color';
import type { Appearance, DeckDocument } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';
import { themeRecord } from '@turboslide/theme/themes';
import { composite } from '@turboslide/theme/tokens';

import { BackgroundDialog, tokenHex } from '../dialogs/Background';
import { DEFAULT_SETTINGS, buildMenuContext } from '../editor-shell';
import type { EditorShellInput } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { ColorPlate } from '../pickers/ColorPlate';
import { hideTooltip } from '../Tooltip';

// The colour pickers paint the deck's theme under its kit (docs/DESIGN.md 7.5; the design round's
// verifier, pass 3, finding 2): on a Mint deck the colour plate's brand kit row read Background
// #ffffff, Text #070707 and Primary #2f5ce0 (General Translation's sheet), its token row and the
// Background dialog's swatches painted the chrome's tokens, and Paper then Add to Theme wrote
// #ffffff into the kit and turned every Mint slide white. Each swatch here is the colour the
// slide draws: the theme's value where the kit is silent, the kit's where it names one.

afterEach(() => {
  hideTooltip();
  cleanup();
});

function mintDocument(
  appearance: Appearance = 'light',
  brand?: BrandKit,
  theme: StoredThemeId = 'mint',
): DeckDocument {
  const base = workedDocument();
  return {
    ...base,
    deck: {
      ...base.deck,
      theme,
      defaults: { ...base.deck.defaults, appearance },
      ...(brand === undefined ? {} : { brand }),
    } as DeckDocument['deck'],
  };
}

function Host({ input: value, children }: { input: EditorShellInput; children: ReactNode }) {
  const state = {
    input: value,
    platform: 'mac',
    menuContext: buildMenuContext(value, DEFAULT_SETTINGS, 'mac'),
    settings: DEFAULT_SETTINGS,
    setSetting: vi.fn(),
    runItem: vi.fn(),
    runControl: vi.fn(),
    panel: null,
    openPanel: vi.fn(),
    panelSection: null,
    closePanel: vi.fn(),
    reopenPanel: vi.fn(),
    wordArtOpen: false,
    setWordArtOpen: vi.fn(),
    registerFilmstrip: vi.fn(),
    setGuideUnderPointer: vi.fn(),
    dialog: null,
    openDialog: vi.fn(),
    closeDialog: vi.fn(),
    layoutGrid: null,
    openLayoutGrid: vi.fn(),
    closeLayoutGrid: vi.fn(),
    pickLayout: vi.fn(),
    renderDynamicSubmenu: () => null,
    menuOpen: null,
    setMenuOpen: vi.fn(),
    compact: false,
    setCompact: vi.fn(),
    toolFinderOpen: false,
    setToolFinderOpen: vi.fn(),
    paletteOpen: false,
    setPaletteOpen: vi.fn(),
    say: vi.fn(),
    lastLayout: null,
    focusTitle: vi.fn(),
    registerTitleField: vi.fn(),
    commentCard: null,
    openCommentCard: vi.fn(),
    closeCommentCard: vi.fn(),
    stepComment: vi.fn(),
    diff: null,
  } as EditorShellState;
  return <EditorShellContext value={state}>{children}</EditorShellContext>;
}

function inputOf(document: DeckDocument, commit?: EditorShellInput['commit']): EditorShellInput {
  return {
    deckId: 'mint-deck',
    document,
    slideId: 'title',
    revision: 4,
    dispatch: vi.fn(() => Promise.resolve({ revision: 5 })),
    ...(commit === undefined ? {} : { commit }),
  };
}

/** A swatch's inline paint as `#rrggbb` (jsdom writes a hex background as rgb()). */
function paintOf(el: Element | null): string {
  const raw = (el as HTMLElement | null)?.style.background ?? '';
  const rgb = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(raw);
  if (rgb === null) return raw.toLowerCase();
  return `#${[rgb[1], rgb[2], rgb[3]].map((c) => Number(c).toString(16).padStart(2, '0')).join('')}`;
}

/** The colour a token paints on the slide: its value, an alpha of the ink over the paper. */
function painted(tokens: Readonly<Record<string, string>>, token: string): string {
  const value = tokens[token] ?? '';
  return value.startsWith('#') ? value : composite(value, tokens.paper ?? '#ffffff');
}

const SEMANTIC = new Set(['green', 'amber', 'red']);

function plateIn(document: DeckDocument) {
  const anchor = window.document.createElement('button');
  window.document.body.append(anchor);
  const view = render(
    <Host input={inputOf(document)}>
      <ColorPlate
        anchor={anchor}
        label="Text color"
        current={undefined}
        control="toolbar.textColor"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />
    </Host>,
  );
  return { anchor, view };
}

const control = (id: string) => window.document.querySelector(`[data-control="${id}"]`);

describe('the colour plate on a theme other than General Translation', () => {
  for (const appearance of ['light', 'dark'] as const) {
    it(`paints Mint's ${appearance} colours in the brand kit row and the token row`, () => {
      const mint = themeRecord('mint').tokens[appearance];
      const { anchor } = plateIn(mintDocument(appearance));
      expect(paintOf(control('toolbar.textColor.kit.background'))).toBe(mint.paper);
      expect(paintOf(control('toolbar.textColor.kit.text'))).toBe(mint.ink);
      expect(paintOf(control('toolbar.textColor.kit.caption'))).toBe(mint['ink-2']);
      expect(paintOf(control('toolbar.textColor.kit.hint'))).toBe(mint.titanium);
      expect(paintOf(control('toolbar.textColor.kit.primary'))).toBe(mint.blue);
      expect(paintOf(control('toolbar.textColor.kit.accent'))).toBe(mint.accent);
      /* the role's name and the hex the slide draws in its tooltip */
      expect(control('toolbar.textColor.kit.background')?.getAttribute('data-tip')).toBe(
        `Background ${mint.paper}`,
      );
      for (const token of COLOR_TOKENS) {
        if (SEMANTIC.has(token)) continue;
        expect(paintOf(control(`toolbar.textColor.${token}`)), token).toBe(painted(mint, token));
      }
      anchor.remove();
    });
  }

  it('paints the kit’s own value where the kit names one and the theme’s where it is silent', () => {
    const kit: BrandKit = { colors: { light: { primary: '#aa3366' } } };
    const { anchor } = plateIn(mintDocument('light', kit));
    const mint = themeRecord('mint').tokens.light;
    expect(paintOf(control('toolbar.textColor.kit.primary'))).toBe('#aa3366');
    /* Accent follows Primary until the kit sets it apart, as the sheet does */
    expect(paintOf(control('toolbar.textColor.kit.accent'))).toBe('#aa3366');
    expect(paintOf(control('toolbar.textColor.kit.background'))).toBe(mint.paper);
    expect(paintOf(control('toolbar.textColor.blue'))).toBe('#aa3366');
    anchor.remove();
  });

  it('still paints General Translation’s sheet on a General Translation deck', () => {
    const { anchor } = plateIn(mintDocument('light', undefined, 'general-translation'));
    expect(paintOf(control('toolbar.textColor.kit.background'))).toBe('#ffffff');
    expect(paintOf(control('toolbar.textColor.kit.text'))).toBe('#070707');
    expect(paintOf(control('toolbar.textColor.kit.primary'))).toBe('#2f5ce0');
    anchor.remove();
  });
});

describe('the Background dialog on a theme other than General Translation', () => {
  it('paints each swatch with the deck’s colour, and Paper then Add to Theme writes Mint’s paper', async () => {
    const commit = vi.fn<NonNullable<EditorShellInput['commit']>>(() => Promise.resolve({}));
    const document = mintDocument('light');
    render(
      <Host input={inputOf(document, commit)}>
        <BackgroundDialog />
      </Host>,
    );
    const mint = themeRecord('mint').tokens.light;
    for (const token of COLOR_TOKENS) {
      if (SEMANTIC.has(token)) continue;
      expect(paintOf(control(`dialog.background.color.${token}`)), token).toBe(
        painted(mint, token),
      );
    }
    fireEvent.click(control('dialog.background.color.paper') as HTMLElement);
    fireEvent.click(control('dialog.background.addToTheme') as HTMLElement);
    expect(commit).toHaveBeenCalledTimes(1);
    const [mutations, label] = commit.mock.calls[0] as [Mutation[], string];
    expect(label).toBe('Brand kit: Background');
    expect(JSON.stringify(mutations)).toContain(mint.paper);
    expect(JSON.stringify(mutations)).not.toContain('#ffffff');
  });

  it('answers a solid token’s hex on the deck’s slides and none for an alpha of the ink', () => {
    for (const appearance of ['light', 'dark'] as const) {
      const tokens = deckTokens({ theme: 'mint' }, appearance);
      const mint = themeRecord('mint').tokens[appearance];
      expect(tokenHex('paper', tokens)).toBe(mint.paper);
      expect(tokenHex('ink', tokens)).toBe(mint.ink);
      expect(tokenHex('blue', tokens)).toBe(mint.blue);
      expect(tokenHex('hair', tokens)).toBeNull();
      expect(tokenHex('green', tokens)).toBe('#12a37a');
      expect(tokenHex('#123456', tokens)).toBe('#123456');
    }
    const kit = deckTokens(
      { theme: 'swiss', brand: { colors: { dark: { background: '#202830' } } } },
      'dark',
    );
    expect(tokenHex('paper', kit)).toBe('#202830');
  });
});
