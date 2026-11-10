// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TemplateIndexEntry } from '@turboslide/schema/actions';
import { workedDocument } from '@turboslide/schema/fixtures';

import { SAVE_AS_TEMPLATE, SaveAsTemplateDialog } from '../dialogs/SaveAsTemplate';
import { buildMenuContext, DEFAULT_SETTINGS } from '../editor-shell';
import type { EditorShellInput } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { hideTooltip } from '../Tooltip';

// Replacing a saved template is the template manager's (the deployment admin; Kevin, 2026-11-09).
// The dialog reads `manage` from the `template.list` answer: the manager keeps the replace
// sentence and the Replace button, and for anyone else a name an organisation template carries
// reads "pick another name" with Save off, so the dialog never offers what the server refuses.

const doc = workedDocument();
const SAVED: TemplateIndexEntry = {
  id: 'sales-deck',
  name: 'Sales deck',
  category: 'work',
  slides: 12,
  theme: doc.deck.theme,
  organisation: true,
};

function shell(manage: boolean) {
  const dispatch = vi.fn((action: string) =>
    Promise.resolve(
      action === 'template.list'
        ? { templates: [SAVED], default: 'blank', manage }
        : { id: 'sales-deck', name: 'Sales deck', slides: 12 },
    ),
  );
  const input = {
    deckId: 'untitled-20261109-a1b2',
    document: doc,
    slideId: 'content-rule',
    revision: 412,
    dispatch,
  } as unknown as EditorShellInput;
  const state = {
    input,
    platform: 'mac',
    menuContext: buildMenuContext(input, DEFAULT_SETTINGS, 'mac'),
    settings: DEFAULT_SETTINGS,
    closeDialog: vi.fn(),
    say: vi.fn(),
  } as unknown as EditorShellState;
  return { dispatch, state };
}

async function open(manage: boolean, name: string) {
  const { dispatch, state } = shell(manage);
  const { container } = render(
    <EditorShellContext.Provider value={state}>
      <SaveAsTemplateDialog />
    </EditorShellContext.Provider>,
  );
  // the list answers, then the name is typed
  await act(async () => {
    await Promise.resolve();
  });
  const field = container.ownerDocument.querySelector<HTMLInputElement>(
    '[data-control="dialog.saveAsTemplate.name"]',
  );
  if (field === null) throw new Error('no name field');
  fireEvent.change(field, { target: { value: name } });
  const find = (control: string) =>
    container.ownerDocument.querySelector<HTMLElement>(`[data-control="${control}"]`);
  const save = find('dialog.saveAsTemplate.save') as HTMLButtonElement | null;
  if (save === null) throw new Error('no save button');
  return { dispatch, find, save };
}

const writes = (dispatch: ReturnType<typeof shell>['dispatch']) =>
  dispatch.mock.calls.map(([action]) => action).filter((action) => action !== 'template.list');

afterEach(() => {
  hideTooltip();
  cleanup();
});

describe('Save as template for a viewer who does not manage templates', () => {
  it('reads "pick another name" over a saved name, with Save off and nothing written', async () => {
    const { dispatch, find, save } = await open(false, 'Sales Deck');
    expect(find('dialog.saveAsTemplate.takenSentence')?.textContent).toBe(
      SAVE_AS_TEMPLATE.taken('Sales deck'),
    );
    expect(find('dialog.saveAsTemplate.replaceSentence')).toBeNull();
    expect(save.textContent).toContain(SAVE_AS_TEMPLATE.save);
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(writes(dispatch)).toEqual([]);
  });

  it('saves a name nobody carries as a new template', async () => {
    const { dispatch, find, save } = await open(false, 'Field notes');
    expect(find('dialog.saveAsTemplate.takenSentence')).toBeNull();
    expect(save.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(save);
      await Promise.resolve();
    });
    expect(writes(dispatch)).toEqual(['template.create']);
  });
});

describe('Save as template for the template manager', () => {
  it('keeps the replace sentence and replaces the saved template', async () => {
    const { dispatch, find, save } = await open(true, 'Sales Deck');
    expect(find('dialog.saveAsTemplate.replaceSentence')?.textContent).toContain(
      SAVE_AS_TEMPLATE.replace('Sales deck'),
    );
    expect(find('dialog.saveAsTemplate.takenSentence')).toBeNull();
    expect(save.textContent).toContain(SAVE_AS_TEMPLATE.replaceSave);
    await act(async () => {
      fireEvent.click(save);
      await Promise.resolve();
    });
    expect(writes(dispatch)).toEqual(['template.update']);
    expect(dispatch).toHaveBeenLastCalledWith(
      'template.update',
      expect.objectContaining({ id: 'sales-deck', baseRevision: 412 }),
    );
  });
});
