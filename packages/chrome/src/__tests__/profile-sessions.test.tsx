// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import { ProfileDialog } from '../dialogs/Profile';
import { DEFAULT_SETTINGS, buildMenuContext } from '../editor-shell';
import type { EditorAccount, EditorShellInput, SessionView } from '../editor-shell';
import { EditorShellContext } from '../editor-shell-context';
import type { EditorShellState } from '../editor-shell-context';
import { ACCOUNT } from '../menus/strings';
import { hideTooltip } from '../Tooltip';

// The Profile dialog's sessions list (HR-SA#7, AUTH-6): with other sessions, the list says how
// soon Sign out everywhere else reaches them, and the button's answer says it again. Every value
// here is a test value.

afterEach(() => {
  hideTooltip();
  cleanup();
});

const doc = workedDocument();

function session(id: string, current: boolean): SessionView {
  return {
    id,
    browser: 'Firefox',
    platform: 'macOS',
    createdAt: '2026-10-12T08:00:00.000Z',
    lastActiveAt: '2026-10-12T09:00:00.000Z',
    current,
  };
}

function renderProfile(account: Partial<EditorAccount>): { say: ReturnType<typeof vi.fn> } {
  const input: EditorShellInput = {
    deckId: doc.deck.id,
    document: doc,
    slideId: 'content-rule',
    revision: 3,
    dispatch: vi.fn(() => Promise.resolve({ revision: 4 })),
    account: {
      principal: {
        principalId: 'usr_7e2f00000000400080000000',
        label: 'Cotton 223',
        name: 'Maya Chen',
        trust: 'verified',
        kind: 'account',
        email: 'maya@example.test',
      },
      signedIn: true,
      signInAvailable: true,
      ...account,
    },
  };
  const say = vi.fn();
  const state = {
    input,
    platform: 'mac',
    menuContext: buildMenuContext(input, DEFAULT_SETTINGS, 'mac'),
    settings: DEFAULT_SETTINGS,
    setSetting: vi.fn(),
    closeDialog: vi.fn(),
    openDialog: vi.fn(),
    say,
    dialog: 'profile',
  } as unknown as EditorShellState;
  const Host = ({ children }: { children: ReactNode }) => (
    <EditorShellContext value={state}>{children}</EditorShellContext>
  );
  render(
    <Host>
      <ProfileDialog />
    </Host>,
  );
  return { say };
}

const q = (control: string) => document.querySelector<HTMLElement>(`[data-control="${control}"]`);

describe('the sessions list says how soon other devices sign out (HR-SA#7)', () => {
  it('names the minute under a list with other sessions, and the button says it again', async () => {
    const signOut = vi.fn(() => Promise.resolve({ signedOut: 1 }));
    const { say } = renderProfile({
      sessions: [session('one', true), session('two', false)],
      signOut,
    });
    expect(q('dialog.profile.signOutWithin')?.textContent).toBe(
      'Other devices are signed out within a minute',
    );
    await act(async () => {
      fireEvent.click(q('dialog.profile.signOutOthers')!);
    });
    expect(signOut).toHaveBeenCalledWith('all');
    await vi.waitFor(() => expect(say).toHaveBeenCalledWith(ACCOUNT.profile.signedOutWithinMinute));
  });

  it('says nothing about other devices when this browser is the only session', () => {
    renderProfile({ sessions: [session('one', true)] });
    expect(q('dialog.profile.signOutWithin')).toBeNull();
    expect(q('dialog.profile.signOutOthers')).toBeNull();
  });
});
