import { Dialog } from '../Dialog';
import type { AuthMethods, AuthState } from './auth-model';
import { AuthPlate, headingOf, useAuthState } from './AuthPlate';
import type { AuthActions } from './AuthPlate';

/**
 * The window host of the auth plate (docs/POLISH-2.md 4.2, 4.3): the editor's sign in, over the
 * deck, so an unsaved draft and the live session stay. The chrome's one Dialog at the 8 px window
 * corner, 400 px wide, its title the state's ("Sign in" on the methods), the close glyph and
 * Escape to close, and no action row and no Cancel (the Dialog draws no footer without actions,
 * Dialog.tsx; docs/NEXT.md 4.3.2 item 7). The plate is the body; the window is as tall as it.
 * The Dialog enters the dialog layer through `useLayer` in the editor's own tree, where no page
 * rule reaches it (the cause of Kevin's screenshot was a page's rules reaching a dialog drawn
 * inside the page's `main`).
 */
export type AuthWindowProps = {
  methods: AuthMethods;
  actions: AuthActions;
  /** the state it opens in: the methods, or an error the address carried (`?error=`) */
  initial?: AuthState;
  onClose: () => void;
  onSignedIn?: () => void;
  /** the root of the controls' ids; `dialog.signIn` in the editor */
  control?: string;
  /** the gallery's clock and its sent state's last mail */
  now?: () => number;
  sentAt?: number;
};

export function AuthWindow({
  methods,
  actions,
  initial = { step: 'methods' },
  onClose,
  onSignedIn,
  control = 'dialog.signIn',
  now,
  sentAt,
}: AuthWindowProps) {
  const [state, dispatch] = useAuthState(initial);
  return (
    <Dialog
      title={headingOf(state, 'sign-in', 'window')}
      onClose={onClose}
      width={400}
      control={control}
      className="ts-auth ts-auth-window"
    >
      <AuthPlate
        host="window"
        methods={methods}
        actions={actions}
        state={state}
        dispatch={dispatch}
        control={control}
        {...(onSignedIn === undefined ? {} : { onSignedIn })}
        {...(now === undefined ? {} : { now })}
        {...(sentAt === undefined ? {} : { sentAt })}
      />
    </Dialog>
  );
}
