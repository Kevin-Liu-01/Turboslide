// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import { NamePromptDialog } from '../dialogs/NamePrompt';
import type { EditorShellInput } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { hideTooltip } from '../Tooltip';

// The name prompt's two lives (gslides-parity SPEC-3 7.2, 15; VERIFICATION-3 findings 8 and 36):
// fired by the route after a typing burst it is a floating card that takes no focus, has no scrim
// and ignores Esc, so the person keeps typing; opened on purpose from the own chip's Change name
// row it is the shell's dialog, with the scrim, focus inside and Esc closing it.

afterEach(() => {
  hideTooltip();
  cleanup();
});

const doc = workedDocument();

function host(closeDialog: () => void, onNamePrompt: (open: boolean) => void) {
  const input: EditorShellInput = {
    deckId: doc.deck.id,
    document: doc,
    slideId: 'content-rule',
    revision: 3,
    dispatch: vi.fn(() => Promise.resolve({ revision: 4 })),
    account: {
      principal: {
        principalId: 'anon_7e2f0000-0000-4000-8000-000000000000',
        label: 'Cotton 223',
        trust: 'label',
        kind: 'anonymous',
      },
      signedIn: false,
      signInAvailable: false,
      namePrompt: { open: true, prefilled: 'Cotton 223' },
      onNamePrompt,
      setName: vi.fn(() => Promise.resolve(undefined)),
    },
  };
  const state = { input, closeDialog } as unknown as EditorShellState;
  return ({ children }: { children: React.ReactNode }) => (
    <EditorShellContext value={state}>{children}</EditorShellContext>
  );
}

describe('NamePromptDialog', () => {
  it('floats after a typing burst: no scrim, no aria-modal, focus left alone, Esc ignored', () => {
    const closeDialog = vi.fn();
    const onNamePrompt = vi.fn();
    const Host = host(closeDialog, onNamePrompt);
    render(
      <Host>
        <button type="button" id="typing">
          The caret
        </button>
        <NamePromptDialog />
      </Host>,
    );
    document.getElementById('typing')!.focus();
    const dialog = screen.getByRole('dialog', { name: 'How should others see you?' });
    expect(dialog.getAttribute('aria-modal')).toBeNull();
    expect(dialog.closest('.ts-dialog-float')).not.toBeNull();
    expect(dialog.closest('.ts-dialog-scrim')).toBeNull();
    expect(document.activeElement?.id).toBe('typing');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(closeDialog).not.toHaveBeenCalled();
    expect(onNamePrompt).not.toHaveBeenCalled();
  });

  it('opened on purpose it is a dialog: the scrim, aria-modal, focus inside, Esc closes', () => {
    const closeDialog = vi.fn();
    const onNamePrompt = vi.fn();
    const Host = host(closeDialog, onNamePrompt);
    render(
      <Host>
        <button type="button" id="opener">
          Change name
        </button>
        <NamePromptDialog modal />
      </Host>,
    );
    const dialog = screen.getByRole('dialog', { name: 'How should others see you?' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.closest('.ts-dialog-scrim')).not.toBeNull();
    expect(dialog.closest('.ts-dialog-float')).toBeNull();
    expect(dialog.contains(document.activeElement)).toBe(true);
    const field = dialog.querySelector<HTMLInputElement>('[data-control="dialog.namePrompt.name"]');
    expect(field?.value).toBe('Cotton 223');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(closeDialog).toHaveBeenCalledTimes(1);
    expect(onNamePrompt).toHaveBeenCalledWith(false);
  });
});
