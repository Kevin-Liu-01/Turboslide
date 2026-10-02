// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LIQUID_METAL_DIAMOND, workedDocument } from '@turboslide/schema/fixtures';

import type { EditorDispatch } from '../dispatch';
import { DitherSection } from '../inspector/dither';
import type { PaletteContext } from '../palette-data';
import { buildPaletteEntries } from '../palette-data';
import { titleMoreItems } from '../TitleRow';

// The marks in the chrome (docs/NEXT.md 4.1.3 item 16; the rows chrome.ai.no-sparkle and
// chrome.mark.one-product-mark): no sparkle in the dither section's Recapture, the palette's
// rows, the More key's Assist row or the sources of the six sites, and no GtMark outside the GT
// deck's own drawing. The browser rows read the title row, Search the menus and Run an action
// (apps/studio/e2e/core/chrome-round1.ts); the dither section sits in the Inspector's Dither
// group of a two tone picture, which a /new deck does not hold, so it is read here.

afterEach(cleanup);

/** The head of the sparkles glyph's path (icons.tsx `sparkles`). */
const SPARKLES_D = 'M15.98 1.804a1 1 0 0 0-1.96 0';

/** A source file of the package, from the package's folder or the repository's root (vitest's cwd). */
const source = (name: string) => {
  const local = resolve(process.cwd(), 'src', name);
  return readFileSync(
    existsSync(local) ? local : resolve(process.cwd(), 'packages/chrome/src', name),
    'utf8',
  );
};

describe('no sparkle', () => {
  it('draws no sparkle in the dither section, whose Recapture reads as the word', () => {
    const dispatch = vi.fn<EditorDispatch>(async () => ({}));
    const { container } = render(
      <DitherSection asset={LIQUID_METAL_DIAMOND} revision={13} dispatch={dispatch} />,
    );
    const recapture = container.querySelector(
      `[data-control="asset.${LIQUID_METAL_DIAMOND.id}.recapture"]`,
    );
    expect(recapture?.textContent).toBe('Recapture');
    expect(recapture?.querySelector('svg')).toBeNull();
    const sparkles = [...container.querySelectorAll('path')].filter((p) =>
      (p.getAttribute('d') ?? '').startsWith(SPARKLES_D),
    );
    expect(sparkles).toHaveLength(0);
  });

  it('gives no palette row the sparkle glyph', () => {
    const document = workedDocument();
    const noop = () => undefined;
    const ctx: PaletteContext = {
      deck: document.deck,
      slides: document.slides,
      slideId: document.deck.sections[0]!.slideIds[0]!,
      revision: 1,
      versions: [],
      view: {
        mode: 'slide',
        theme: 'dark',
        present: false,
        edit: true,
        twin: false,
        lint: false,
        source: false,
      },
      toggles: { edit: noop, twin: noop, lint: noop, source: noop },
      apple: true,
    };
    for (const theme of ['light', 'dark'] as const) {
      const entries = buildPaletteEntries({
        ...ctx,
        view: { ...ctx.view, theme },
        advancedTools: true,
      });
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.filter((entry) => entry.icon === 'sparkles').map((e) => e.id)).toEqual([]);
    }
  });

  it('draws Assist in More without the model row’s glyph', () => {
    const assist = titleMoreItems(null).find((item) => item.id === 'title.assist');
    expect(assist?.icon).toBeUndefined();
  });

  it('names no sparkle at the six sites of audit-brand-surfaces rank 6', () => {
    for (const name of [
      'TitleRow.tsx',
      'Palette.tsx',
      'palette-data.ts',
      'ToolFinder.tsx',
      'inspector/dither.tsx',
      'inspector/asset.tsx',
      'inspector/sections.ts',
    ])
      expect(source(name), name).not.toMatch(/['"]sparkles['"]/);
  });
});

describe('one product mark', () => {
  it('draws the Turboslide mark in the view route’s sidebar head, the viewer toolbar and the filmstrip, never GtMark', () => {
    for (const name of ['Sidebar.tsx', 'Toolbar.tsx', 'Filmstrip.tsx']) {
      const text = source(name);
      expect(text, name).not.toMatch(/GtMark/);
      expect(text, name).toMatch(/<TurboslideMark size=\{16\}/);
    }
  });
});
