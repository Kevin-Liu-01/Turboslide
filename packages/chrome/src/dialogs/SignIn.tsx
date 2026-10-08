import { useState } from 'react';

import { peekHeldSignInError, takeHeldSignInError } from '../auth/auth-model';
import type { AuthMethods, AuthState } from '../auth/auth-model';
import type { AuthActions } from '../auth/AuthPlate';
import { AuthWindow } from '../auth/AuthWindow';
import { useEditorShell } from '../editor-shell-context';
import { useMountEffect } from '../lib/useMountEffect';

/**
 * The editor's sign in (docs/POLISH-2.md 4.3, C12, C13, C17): the auth plate in its window host
 * over the deck, so an unsaved draft and the live session stay. The shell's account hands it the
 * deployment's methods and the route's exchanges (EditorRoot.tsx: better-auth's routes with the
 * deck as the return address and /signin?next=<deck> as the error address); the window opens on
 * the methods, or on the error the deck's address carried (`?error=`, held by EditorRoot for the
 * one open that follows). No Cancel and no footer: the close glyph and Escape close it. The title
 * row's Sign In, the account menu's Sign in row, the name prompt's Sign In and More's Sign in
 * under 480 px open this one window (EditorShell.tsx draws it for the `signIn` dialog).
 */
export function SignInDialog() {
  const shell = useEditorShell();
  const account = shell.input.account;
  const methods: AuthMethods = {
    available: account?.signInAvailable === true,
    google: account?.googleAvailable === true && account.google !== undefined,
    github: account?.githubAvailable === true && account.github !== undefined,
    email: account?.requestCode !== undefined,
  };
  const actions: AuthActions = {
    social: (provider) =>
      Promise.resolve(provider === 'google' ? account?.google?.() : account?.github?.()),
    ...(account?.requestCode === undefined ? {} : { requestCode: account.requestCode }),
    ...(account?.verifyCode === undefined ? {} : { verifyCode: account.verifyCode }),
  };
  /* the held error is read on every render and spent once the window has mounted, so a render
     React discards does not spend it (on the node-server build of 2026-10-07 the window opened on
     the methods after the error had been taken: accounts.google-error-sentence) */
  const [initial] = useState<AuthState>(() => peekHeldSignInError() ?? { step: 'methods' });
  useMountEffect(() => {
    takeHeldSignInError();
  });
  return (
    <AuthWindow
      methods={methods}
      actions={actions}
      initial={initial}
      onClose={shell.closeDialog}
      onSignedIn={shell.closeDialog}
    />
  );
}
