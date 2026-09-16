// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';
import { FONT_IDS } from '@turboslide/schema/fonts';

import { MoreFontsDialog } from '../dialogs/MoreFonts';
import { FontFaces } from '../FontFaces';
import { FontList, FontPickerPlate, resetFontFaceLinks, resetFontRows } from '../FontPicker';
import type { FontRow } from '../font-picker-model';
import { FONT_PICKER } from '../font-picker-model';
import { hideTooltip } from '../Tooltip';

// The Font dropdown (gslides-parity SPEC-5-amendments A5 items 4 and 7; B7): the list holds one
// row per catalog face plus the theme face, every row draws its name in its own face and links
// the face's stylesheet when it shows, the arrows walk and Enter picks, the search narrows, More
// fonts opens Google's dialog form with the category filter and the licence line, and the sheet's
// FontFaces link exists only for a document that uses a catalog face.

const CATEGORY_OF = (id: string): FontRow['category'] =>
  /mono|code/.test(id)
    ? 'mono'
    : /bebas/.test(id)
      ? 'display'
      : /serif|lora|garamond|baskerville|merriweather|playfair/.test(id)
        ? 'serif'
        : 'sans';

/** Rows in the `font.list` shape for every id (the catalog's names are the studio test's concern). */
const rows: FontRow[] = FONT_IDS.map((id) => ({
  id,
  name: id
    .split('-')
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' '),
  category: CATEGORY_OF(id),
  weights: [400],
  italic: true,
  licence: 'OFL 1.1',
}));

afterEach(() => {
  hideTooltip();
  cleanup();
  resetFontFaceLinks();
  resetFontRows();
  for (const link of document.head.querySelectorAll('link[data-font-face]')) link.remove();
});

describe('FontList', () => {
  it('lists one row per catalog face plus the theme face, each in its own face, and links the faces it shows (A5 item 7)', () => {
    const onPick = vi.fn();
    const { container } = render(
      <FontList rows={rows} used={['roboto']} picked={null} onPick={onPick} />,
    );
    const options = container.querySelectorAll('[role="option"]');
    // the theme row, the used group's Roboto, and every face of the catalog in its category
    expect(options).toHaveLength(1 + 1 + FONT_IDS.length);
    const list = container.querySelector('[data-control="font.list"]');
    expect(list?.getAttribute('data-rows')).toBe(String(FONT_IDS.length + 1));
    const roboto = container.querySelector('[data-control="font.pick.roboto"] .ts-font-name');
    expect(roboto?.getAttribute('style')).toMatch(/font-family: ['"]Roboto['"], sans-serif/);
    // jsdom has no IntersectionObserver: every shown row linked its face, Inter never
    const links = [...document.head.querySelectorAll('link[data-font-face]')].map((link) =>
      link.getAttribute('data-font-face'),
    );
    expect(links).toHaveLength(FONT_IDS.length - 1);
    expect(links).not.toContain('inter');
    expect(document.head.querySelector('link[data-font-face="roboto"]')?.getAttribute('href')).toBe(
      '/fonts/faces/current/roboto.css',
    );
    // a group title per section, Google's order
    const titles = [...container.querySelectorAll('.ts-picker-title')].map((el) => el.textContent);
    expect(titles).toEqual([
      FONT_PICKER.inThisPresentation,
      'Sans serif',
      'Serif',
      'Display',
      'Monospace',
    ]);
    for (const el of container.querySelectorAll('[title]')) expect(el).toBeNull();
  });

  it('walks with the arrows, picks on Enter and on a click, and shows the pick with a check', () => {
    const onPick = vi.fn();
    const { container } = render(
      <FontList rows={rows} used={[]} picked={'lora'} onPick={onPick} autoFocus />,
    );
    const list = container.querySelector('[data-control="font.list"]') as HTMLElement;
    expect(document.activeElement).toBe(list);
    expect(
      container.querySelector('[data-control="font.pick.lora"]')?.getAttribute('aria-selected'),
    ).toBe('true');
    expect(container.querySelector('[data-control="font.pick.lora"] svg')).not.toBeNull();
    // the active row starts at the pick; Home is the theme row; Enter picks it (null)
    fireEvent.keyDown(list, { key: 'Home' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onPick).toHaveBeenLastCalledWith(null);
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: ' ' });
    expect(onPick).toHaveBeenLastCalledWith(rows[0]!.id === 'inter' ? 'inter' : rows[0]!.id);
    fireEvent.click(container.querySelector('[data-control="font.pick.fira-code"]') as HTMLElement);
    expect(onPick).toHaveBeenLastCalledWith('fira-code');
  });

  it('narrows to the query and says when nothing matches', () => {
    const { container, rerender } = render(
      <FontList
        rows={rows}
        used={['roboto']}
        picked={null}
        onPick={() => undefined}
        query="mono"
      />,
    );
    const shown = [...container.querySelectorAll('[role="option"]')].map((el) =>
      el.getAttribute('data-font'),
    );
    expect(shown).toEqual(['roboto-mono', 'jetbrains-mono', 'ibm-plex-mono']);
    rerender(<FontList rows={rows} used={[]} picked={null} onPick={() => undefined} query="zzz" />);
    expect(container.querySelector('.ts-font-empty')?.textContent).toBe(FONT_PICKER.noMatch);
  });
});

describe('FontPickerPlate and MoreFontsDialog', () => {
  it('searches from the field, opens More fonts from the last row, and the dialog filters by category with the licence line', () => {
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    const onPick = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <FontPickerPlate
        anchor={anchor}
        rows={rows}
        used={['lora']}
        picked="lora"
        onPick={onPick}
        onClose={onClose}
        control="toolbar.font"
      />,
    );
    const search = container.querySelector(
      '[data-control="toolbar.font.search"]',
    ) as HTMLInputElement;
    expect(document.activeElement).toBe(search);
    fireEvent.change(search, { target: { value: 'garamond' } });
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(1);
    fireEvent.change(search, { target: { value: '' } });
    const more = container.querySelector('[data-control="toolbar.font.more"]') as HTMLElement;
    expect(more.textContent).toBe(FONT_PICKER.moreFonts);
    act(() => {
      fireEvent.click(more);
    });
    const dialog = document.querySelector('[data-control="dialog.moreFonts"]');
    expect(dialog).not.toBeNull();
    expect(
      document.querySelector('[data-control="dialog.moreFonts.list"]')?.getAttribute('data-rows'),
    ).toBe(String(FONT_IDS.length));
    expect(document.body.textContent).toContain('SIL Open Font License 1.1');
    const category = document.querySelector(
      '[data-control="dialog.moreFonts.category"]',
    ) as HTMLSelectElement;
    fireEvent.change(category, { target: { value: 'mono' } });
    expect(
      document.querySelector('[data-control="dialog.moreFonts.list"]')?.getAttribute('data-rows'),
    ).toBe('4');
    // the chosen column lists the presentation's families and the pick
    expect(
      [...document.querySelectorAll('[data-control="dialog.moreFonts.chosen"] li')].map((li) =>
        li.getAttribute('data-font'),
      ),
    ).toEqual(['lora']);
    fireEvent.click(
      document.querySelector('[data-control="dialog.moreFonts.pick.fira-code"]') as HTMLElement,
    );
    expect(
      [...document.querySelectorAll('[data-control="dialog.moreFonts.chosen"] li')].map((li) =>
        li.getAttribute('data-font'),
      ),
    ).toEqual(['lora', 'fira-code']);
    fireEvent.click(document.querySelector('[data-control="dialog.moreFonts.ok"]') as HTMLElement);
    expect(onPick).toHaveBeenCalledWith('fira-code');
    expect(onClose).toHaveBeenCalled();
    anchor.remove();
  });

  it('renders the dialog alone with every row and no native title', () => {
    render(
      <MoreFontsDialog
        rows={rows}
        used={[]}
        picked={null}
        onPick={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(document.querySelectorAll('[data-control^="dialog.moreFonts.pick."]')).toHaveLength(
      FONT_IDS.length,
    );
    for (const el of document.querySelectorAll('[title]')) expect(el).toBeNull();
  });
});

describe('FontFaces', () => {
  it('mounts no link for a document in the theme face and one link naming the used families', () => {
    const document_ = workedDocument();
    const { container, rerender } = render(<FontFaces document={document_} />);
    expect(container.querySelector('link')).toBeNull();
    const slideId = 'content-rule';
    const slide = document_.slides[slideId] as { slots: Record<string, unknown[]> };
    const withFamilies = {
      deck: document_.deck,
      slides: {
        ...document_.slides,
        [slideId]: {
          ...slide,
          slots: {
            ...slide.slots,
            left: [
              ...slide.slots.left!,
              { id: 'x1', type: 'paragraph', text: 'a', typography: { family: 'lora' } },
              { id: 'x2', type: 'paragraph', text: 'b', typography: { family: 'roboto' } },
            ],
          },
        },
      },
    };
    rerender(<FontFaces document={withFamilies as never} />);
    const link = container.querySelector('link[data-control="fonts.faces"]');
    expect(link?.getAttribute('href')).toBe('/fonts/faces/current/roboto+lora.css');
    expect(link?.getAttribute('rel')).toBe('stylesheet');
  });
});
