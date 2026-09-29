// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeckDocument, Slide, TitleSlide } from '@turboslide/schema/deck';
import { workedDocument } from '@turboslide/schema/fixtures';

import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import type { EditorShellInput } from '../editor-shell';
import { FontField, resetFontFaceLinks } from '../FontPicker';
import { FONT_PICKER, usedFamilies } from '../font-picker-model';
import { DEFAULT_MENU_CONTEXT } from '../menus/model';
import { fontControl } from '../menus/toolbar-tails';
import { TIP_DELAY_MS, hideTooltip } from '../Tooltip';

// The toolbar's Font control on a fixed kind's field (the field fonts hotfix,
// docs/gslides-parity/features/build/field-fonts.md 2): enabled on the cover's heading and lead
// and on a statement's big line, the label reading the field's own family when set and the kit's
// face for the field's role otherwise, the tooltip the control's own sentence and never the kit
// sentence, a pick writing one slide.update carrying one slide.set of the field's record at the
// shallowest missing ancestor; disabled with the kit sentence on a picture kind's plate as before.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  hideTooltip();
  resetFontFaceLinks();
  cleanup();
  vi.useRealTimers();
});

const dispatch = vi.fn(() => Promise.resolve({}));

function documentWith(edit: (document: DeckDocument) => void = () => undefined): DeckDocument {
  const document = workedDocument();
  edit(document);
  return document;
}

function slideOfKind(document: DeckDocument, kind: Slide['kind']): Slide {
  const slide = Object.values(document.slides).find((each) => each.kind === kind);
  if (slide === undefined) throw new Error(`no ${kind} slide in the worked deck`);
  return slide;
}

function state(input: Partial<EditorShellInput> & { document: DeckDocument }): EditorShellState {
  return {
    input: {
      deckId: input.document.deck.id,
      revision: 7,
      dispatch,
      slideId: input.slideId ?? Object.keys(input.document.slides)[0] ?? '',
      ...input,
    },
    platform: 'mac',
    menuContext: DEFAULT_MENU_CONTEXT,
    settings: {},
    setSetting: () => undefined,
    runItem: () => undefined,
    runControl: () => undefined,
    panel: null,
    openPanel: () => undefined,
    panelSection: null,
    closePanel: () => undefined,
    wordArtOpen: false,
    setWordArtOpen: () => undefined,
    registerFilmstrip: () => undefined,
    setGuideUnderPointer: () => undefined,
    reopenPanel: () => undefined,
    dialog: null,
    openDialog: () => undefined,
    closeDialog: () => undefined,
    layoutGrid: null,
    openLayoutGrid: () => undefined,
    closeLayoutGrid: () => undefined,
    pickLayout: () => undefined,
    renderDynamicSubmenu: () => null,
    menuOpen: null,
    setMenuOpen: () => undefined,
    compact: false,
    setCompact: () => undefined,
    toolFinderOpen: false,
    setToolFinderOpen: () => undefined,
    paletteOpen: false,
    setPaletteOpen: () => undefined,
    say: () => undefined,
    lastLayout: null,
    focusTitle: () => undefined,
    registerTitleField: () => undefined,
    commentCard: null,
    openCommentCard: () => undefined,
    closeCommentCard: () => undefined,
    stepComment: () => undefined,
    diff: null,
  } as unknown as EditorShellState;
}

/** The Font control rendered for a selection on a slide, as ToolbarTail renders it for a field (no block). */
function field(document: DeckDocument, slideId: string, blockId: string): HTMLElement {
  render(
    <EditorShellContext value={state({ document, slideId, selection: { blockId } })}>
      <FontField control={fontControl(false)} block={undefined} />
    </EditorShellContext>,
  );
  const control = window.document.querySelector<HTMLElement>('[data-control="toolbar.font"]');
  if (control === null) throw new Error('no toolbar.font');
  return control;
}

/** The sentence the control's tooltip shows on hover (the layer ends it with a period). */
function tooltipDoc(control: HTMLElement): string | null {
  fireEvent.mouseEnter(control);
  act(() => {
    vi.advanceTimersByTime(TIP_DELAY_MS);
  });
  const doc = window.document.querySelector('[role="tooltip"] .pt-tip-doc');
  const text = doc?.textContent ?? null;
  fireEvent.mouseLeave(control);
  return text;
}

function rowOf(id: string): HTMLElement {
  const row = window.document.querySelector<HTMLElement>(`[data-control="toolbar.font.row.${id}"]`);
  if (row === null) throw new Error(`no ${id} row in the open dropdown`);
  return row;
}

describe('FontField on a fixed kind’s field', () => {
  it('is enabled on the cover’s heading and lead and a statement’s big line, with the control’s own sentence', () => {
    const document = documentWith();
    const title = slideOfKind(document, 'title');
    for (const id of ['heading', 'lead']) {
      const control = field(document, title.id, id);
      expect(control.getAttribute('aria-disabled')).toBeNull();
      expect(control.textContent?.trim()).toBe('Inter');
      expect(control.getAttribute('data-tip')).toBe(FONT_PICKER.control);
      expect(tooltipDoc(control)).toBe(`${FONT_PICKER.doc}.`);
      cleanup();
    }
    const statement = slideOfKind(document, 'statement');
    const big = field(document, statement.id, 'big');
    expect(big.getAttribute('aria-disabled')).toBeNull();
    expect(big.textContent?.trim()).toBe('Inter');
    expect(tooltipDoc(big)).toBe(`${FONT_PICKER.doc}.`);
  });

  it('reads the kit face for the role while the field has none, and the field’s own family once set', () => {
    const document = documentWith((each) => {
      each.deck.brand = { fonts: { display: 'fraunces', text: 'manrope' } };
    });
    const title = slideOfKind(document, 'title');
    expect(field(document, title.id, 'heading').textContent?.trim()).toBe('Fraunces');
    cleanup();
    expect(field(document, title.id, 'lead').textContent?.trim()).toBe('Manrope');
    cleanup();
    (document.slides[title.id] as TitleSlide).typography = { heading: { family: 'geist' } };
    const own = field(document, title.id, 'heading');
    expect(own.textContent?.trim()).toBe('Geist');
    expect(own.getAttribute('data-font')).toBe('geist');
    /* the catalog's order, the kit's faces and the field's own */
    expect(usedFamilies(document)).toEqual(['geist', 'manrope', 'fraunces']);
  });

  it('writes one slide.update carrying the field record at the shallowest missing ancestor, then the field alone', () => {
    dispatch.mockClear();
    const document = documentWith();
    const title = slideOfKind(document, 'title');
    fireEvent.click(field(document, title.id, 'heading'));
    fireEvent.click(rowOf('fraunces'));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith('slide.update', {
      slideId: title.id,
      baseRevision: 7,
      mutations: [
        {
          op: 'slide.set',
          slideId: title.id,
          path: '/typography',
          value: { heading: { family: 'fraunces' } },
        },
      ],
    });
    cleanup();
    dispatch.mockClear();
    (document.slides[title.id] as TitleSlide).typography = { heading: { family: 'fraunces' } };
    fireEvent.click(field(document, title.id, 'lead'));
    fireEvent.click(rowOf('manrope'));
    expect(dispatch).toHaveBeenCalledWith('slide.update', {
      slideId: title.id,
      baseRevision: 7,
      mutations: [
        {
          op: 'slide.set',
          slideId: title.id,
          path: '/typography/lead',
          value: { family: 'manrope' },
        },
      ],
    });
  });

  it('takes the face back to the kit’s with the theme row, removing the map when the field was its last key', () => {
    dispatch.mockClear();
    const document = documentWith((each) => {
      (slideOfKind(each, 'title') as TitleSlide).typography = { heading: { family: 'fraunces' } };
    });
    const title = slideOfKind(document, 'title');
    fireEvent.click(field(document, title.id, 'heading'));
    fireEvent.click(rowOf('inter'));
    expect(dispatch).toHaveBeenCalledWith('slide.update', {
      slideId: title.id,
      baseRevision: 7,
      mutations: [{ op: 'slide.set', slideId: title.id, path: '/typography' }],
    });
  });

  it('stays disabled with the kit sentence on a picture kind’s plate', () => {
    const document = documentWith();
    const opener = slideOfKind(document, 'opener');
    const control = field(document, opener.id, 'plate');
    expect(control.getAttribute('aria-disabled')).toBe('true');
    expect(tooltipDoc(control)).toBe(`${FONT_PICKER.fixedTextDoc}.`);
  });
});
