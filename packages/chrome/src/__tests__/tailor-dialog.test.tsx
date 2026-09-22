// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import { TailorDialog, tailorCounts } from '../dialogs/Tailor';
import { TAILOR_LOGO } from '../menus/strings';
import type { TailorLogoFinder } from '../dialogs/Tailor';
import type { LogoRow } from '../logo-model';
import type { EditorShellInput } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { TAILOR } from '../panels/assist-strings';
import { hideTooltip } from '../Tooltip';

// Tools > Tailor for a customer (docs/PRODUCT.md section 5): the live count over the deck's texts,
// the skip rows, Apply as one `deck.tailor` with the replacements and the skips, the disabled Use
// this logo on every slide row (not driven, never broken until the brand kit lands). The features
// round (docs/FEATURES.md 4.5): the Find the <To> logo slot over a finder, the stored mark named
// in the one `deck.tailor`, and the chooser's four raster types.

afterEach(() => {
  hideTooltip();
  cleanup();
});

const doc = workedDocument();

function host(dispatch: EditorShellInput['dispatch'], closeDialog = vi.fn()) {
  const input: EditorShellInput = {
    deckId: doc.deck.id,
    document: doc,
    slideId: 'content-rule',
    revision: 7,
    dispatch,
  };
  const state = { input, closeDialog } as unknown as EditorShellState;
  return { state, closeDialog };
}

const control = (id: string) => window.document.querySelector(`[data-control="${id}"]`);

describe('tailorCounts', () => {
  it('counts places and slides over every visible text and the notes, case insensitive', () => {
    expect(tailorCounts(doc, 'product')).toEqual({ places: 5, slides: 3 });
    expect(tailorCounts(doc, 'PRODUCT')).toEqual({ places: 5, slides: 3 });
    expect(tailorCounts(doc, '')).toEqual({ places: 0, slides: 0 });
  });
});

describe('TailorDialog', () => {
  it('shows the live count, ticks a slide, and Apply runs one deck.tailor then closes', async () => {
    const dispatch = vi.fn(() =>
      Promise.resolve({
        replacements: 5,
        slideIds: [],
        pictures: 0,
        skipped: ['content-rule'],
        revision: 8,
      }),
    );
    const { state, closeDialog } = host(dispatch);
    render(
      <EditorShellContext value={state}>
        <TailorDialog logoFinder={null} />
      </EditorShellContext>,
    );
    expect(control('dialog.tailor')).not.toBeNull();
    const apply = control('dialog.tailor.apply') as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.change(control('dialog.tailor.from') as HTMLInputElement, {
      target: { value: 'product' },
    });
    fireEvent.change(control('dialog.tailor.to') as HTMLInputElement, {
      target: { value: 'Globex' },
    });
    expect(control('dialog.tailor.count')?.textContent).toBe(TAILOR.count(5, 3));
    fireEvent.click(control('dialog.tailor.skip.content-rule') as HTMLInputElement);
    expect(apply.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(apply);
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith('deck.tailor', {
      replacements: [{ from: 'product', to: 'Globex' }],
      skip: ['content-rule'],
      baseRevision: 7,
    });
    expect(closeDialog).toHaveBeenCalledTimes(1);
  });

  it('draws Use this logo on every slide disabled and reports a refused write in the dialog', async () => {
    const dispatch = vi.fn(() =>
      Promise.reject(new Error('The slide changed while this was written; ask again')),
    );
    const { state, closeDialog } = host(dispatch);
    render(
      <EditorShellContext value={state}>
        <TailorDialog logoFinder={null} />
      </EditorShellContext>,
    );
    expect((control('dialog.tailor.logo.everySlide') as HTMLInputElement).disabled).toBe(true);
    /* no finder: no Find the logo button; the chooser lists the four raster types alone */
    fireEvent.click(control('dialog.tailor.logo.replaceAlt') as HTMLInputElement);
    expect(control('dialog.tailor.logo.find')).toBeNull();
    expect(control('dialog.tailor.logo.file')?.getAttribute('accept')).toBe(
      'image/png,image/jpeg,image/webp,image/gif',
    );
    fireEvent.click(control('dialog.tailor.skip.thesis') as HTMLInputElement);
    await act(async () => {
      fireEvent.click(control('dialog.tailor.apply') as HTMLButtonElement);
    });
    expect(control('dialog.tailor.error')?.textContent).toContain('ask again');
    expect(closeDialog).not.toHaveBeenCalled();
  });

  it('draws Find the <To> logo once the finder knows the name, stores the mark on a click and names it in the one deck.tailor', async () => {
    const FIGMA: LogoRow = {
      slug: 'figma',
      title: 'Figma',
      aliases: [],
      categories: [],
      variants: { default: '/icons/figma/default.svg' },
      license: 'CC0-1.0',
      collection: 'brands',
      readsOnPaper: true,
      readsOnInk: true,
    };
    const finder: TailorLogoFinder = {
      match: vi.fn((name: string) =>
        Promise.resolve(name.toLowerCase() === 'figma' ? FIGMA : null),
      ),
      store: vi.fn(() => Promise.resolve({ assetId: 'figma' })),
    };
    const dispatch = vi.fn(() =>
      Promise.resolve({ replacements: 5, slideIds: [], pictures: 1, skipped: [], revision: 8 }),
    );
    const { state, closeDialog } = host(dispatch);
    render(
      <EditorShellContext value={state}>
        <TailorDialog logoFinder={finder} />
      </EditorShellContext>,
    );
    fireEvent.change(control('dialog.tailor.from') as HTMLInputElement, {
      target: { value: 'product' },
    });
    fireEvent.change(control('dialog.tailor.to') as HTMLInputElement, {
      target: { value: 'Figma' },
    });
    expect(control('dialog.tailor.logo.find')).toBeNull();
    await waitFor(() => expect(control('dialog.tailor.logo.find')).not.toBeNull(), {
      timeout: 2000,
    });
    expect(finder.match).toHaveBeenCalledWith('Figma');
    const find = control('dialog.tailor.logo.find') as HTMLButtonElement;
    expect(find.textContent).toBe(TAILOR_LOGO.find('Figma'));
    expect(find.getAttribute('data-slug')).toBe('figma');
    /* the mark on paper and on ink beside the button */
    expect(control('dialog.tailor.logo.find.paper')?.getAttribute('data-variant')).toBe('default');
    expect(control('dialog.tailor.logo.find.ink')?.getAttribute('data-variant')).toBe('default');
    await act(async () => {
      fireEvent.click(find);
      await Promise.resolve();
    });
    expect(finder.store).toHaveBeenCalledWith(FIGMA);
    await waitFor(() =>
      expect(control('dialog.tailor.logo.stored')?.textContent).toBe(TAILOR_LOGO.found('Figma')),
    );
    /* the stored mark turned the swap on and Apply names it, one deck.tailor */
    expect((control('dialog.tailor.logo.replaceAlt') as HTMLInputElement).checked).toBe(true);
    await act(async () => {
      fireEvent.click(control('dialog.tailor.apply') as HTMLButtonElement);
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith('deck.tailor', {
      replacements: [{ from: 'product', to: 'Figma' }],
      logo: { assetId: 'figma', replaceAlt: 'product' },
      baseRevision: 7,
    });
    expect(closeDialog).toHaveBeenCalledTimes(1);
  });
});
