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
  const say = vi.fn();
  const state = { input, closeDialog, say } as unknown as EditorShellState;
  return { state, closeDialog, say };
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
    const { state, closeDialog, say } = host(dispatch);
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
    /* the result is said as the pass is sent and again once it is acknowledged (docs/POLISH.md
       2.9 item 116; the polish round's fix round): the same sentence with the dialog's counts */
    expect(say.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      TAILOR.result('Globex', 5, 3, 1),
      TAILOR.result('Globex', 5, 3, 1),
    ]);
  });

  it('says the result before the server acknowledges the pass (the blob tier: seconds), with Undo from the history', async () => {
    let settle: (value: unknown) => void = () => undefined;
    const dispatch = vi.fn(() => new Promise((resolve) => (settle = resolve)));
    const undo = vi.fn();
    const { state, closeDialog, say } = host(dispatch);
    (state.input as { history?: unknown }).history = {
      canUndo: true,
      canRedo: false,
      undo,
      redo: vi.fn(),
    };
    render(
      <EditorShellContext value={state}>
        <TailorDialog logoFinder={null} />
      </EditorShellContext>,
    );
    fireEvent.change(control('dialog.tailor.from') as HTMLInputElement, {
      target: { value: 'product' },
    });
    fireEvent.change(control('dialog.tailor.to') as HTMLInputElement, {
      target: { value: 'Globex' },
    });
    await act(async () => {
      fireEvent.click(control('dialog.tailor.apply') as HTMLButtonElement);
    });
    expect(closeDialog).toHaveBeenCalledTimes(1);
    expect(say).toHaveBeenCalledTimes(1);
    expect(say.mock.calls[0]?.[0]).toBe(TAILOR.result('Globex', 5, 3, 0));
    const action = say.mock.calls[0]?.[1] as { label: string; run: () => void };
    expect(action.label).toBe(TAILOR.undo);
    action.run();
    expect(undo).toHaveBeenCalledTimes(1);
    await act(async () => {
      settle({ replacements: 5, slideIds: [], pictures: 0, skipped: [], revision: 8 });
    });
    expect(say).toHaveBeenCalledTimes(2);
  });

  it('draws no dead Use this logo on every slide row, the reason under the buttons while Apply waits, and reports a refused write in the snackbar after the dialog closed (docs/POLISH.md 2.9 item 116)', async () => {
    const dispatch = vi.fn(() =>
      Promise.reject(new Error('The slide changed while this was written; ask again')),
    );
    const { state, closeDialog, say } = host(dispatch);
    render(
      <EditorShellContext value={state}>
        <TailorDialog logoFinder={null} />
      </EditorShellContext>,
    );
    expect(control('dialog.tailor.logo.everySlide')).toBeNull();
    expect(control('dialog.tailor.count')).toBeNull();
    expect(control('dialog.tailor.reason')?.textContent).toBe(TAILOR.nothing);
    /* no finder: no Find the logo button; the chooser lists the four raster types alone */
    fireEvent.click(control('dialog.tailor.logo.replaceAlt') as HTMLInputElement);
    expect(control('dialog.tailor.logo.find')).toBeNull();
    expect(control('dialog.tailor.logo.file')?.getAttribute('accept')).toBe(
      'image/png,image/jpeg,image/webp,image/gif',
    );
    fireEvent.click(control('dialog.tailor.skip.thesis') as HTMLInputElement);
    expect(control('dialog.tailor.reason')).toBeNull();
    await act(async () => {
      fireEvent.click(control('dialog.tailor.apply') as HTMLButtonElement);
    });
    expect(closeDialog).toHaveBeenCalledTimes(1);
    expect(say).toHaveBeenCalledWith('The slide changed while this was written; ask again');
    /* the refusal is the sentence left on screen, after the result said as the pass went out */
    expect(say.mock.calls.at(-1)?.[0]).toBe('The slide changed while this was written; ask again');
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
