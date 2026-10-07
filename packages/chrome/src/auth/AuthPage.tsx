import type { ReactNode } from 'react';
import { useState } from 'react';

import type { LinkComponent } from '../editor-shell';
import { useMountEffect } from '../lib/useMountEffect';
import { ThemeButton } from '../ThemeButton';
import { TurboslideMark } from '../TurboslideMark';
import type { AuthMethods, AuthPurpose, AuthState } from './auth-model';
import { AuthPlate, useAuthState } from './AuthPlate';
import type { AuthActions } from './AuthPlate';

/**
 * The page host of the auth plate (docs/POLISH-2.md 4.2, C13, C18): /signin and /device, after
 * General Translation's plate frame on Turboslide's tokens. The mark at the head (a link to the
 * person's presentations), the plate in a column of min(464px, 100vw - 40px), the foot row with
 * the shared theme button 24 px over the bottom edge; from 1024 px the column stands in a left
 * region of min(584px, 56vw) and the picture region holds the caller's figure (the Blue Marble
 * twin with its credit on /signin and /device, MoodFigure.tsx; the chrome imports nothing from the
 * studio, so the figure is a prop). Under 1024 px the column alone, centred, and no picture. No
 * box around the column and no shadow. The page is rendered on the server with the state the
 * address names (`?error=`), so the first paint is the state.
 */
export type AuthPageProps = {
  purpose?: AuthPurpose;
  methods: AuthMethods;
  actions: AuthActions;
  initial?: AuthState;
  /** the root of the controls' ids: `page.signIn` on /signin, `device` on /device */
  control?: string;
  /** the picture region's content, drawn from 1024 px */
  figure?: ReactNode;
  /** the router's Link for the mark, so the way to /decks is same document */
  linkComponent?: LinkComponent;
  onSignedIn?: () => void;
  onTryAgain?: () => void;
  deviceCode?: string;
  deviceEmail?: string;
  now?: () => number;
  sentAt?: number;
};

export const AUTH_PAGE_HOME = { name: 'Turboslide', doc: 'Your presentations.' } as const;

export function AuthPage({
  purpose = 'sign-in',
  methods,
  actions,
  initial = { step: 'methods' },
  control = 'page.signIn',
  figure,
  linkComponent,
  onSignedIn,
  onTryAgain,
  deviceCode,
  deviceEmail,
  now,
  sentAt,
}: AuthPageProps) {
  const [state, dispatch] = useAuthState(initial);
  /* the page announces hydration, as /decks does: a click on the server's HTML before the
     handlers attach would submit the form as a document request */
  const [hydrated, setHydrated] = useState(false);
  useMountEffect(() => setHydrated(true));
  const mark = <TurboslideMark size={24} aria-hidden="true" />;
  const Link = linkComponent;
  return (
    <main
      className="ts-auth ts-auth-page"
      data-auth-host="page"
      data-control={control}
      data-hydrated={hydrated ? '' : undefined}
    >
      <div className="ts-auth-side">
        <div className="ts-auth-column">
          {Link === undefined ? (
            <a
              href="/decks"
              className="ts-auth-home"
              aria-label={AUTH_PAGE_HOME.name}
              data-control={`${control}.home`}
            >
              {mark}
            </a>
          ) : (
            <Link
              to="/decks"
              className="ts-auth-home"
              aria-label={AUTH_PAGE_HOME.name}
              data-control={`${control}.home`}
            >
              {mark}
            </Link>
          )}
          <AuthPlate
            host="page"
            purpose={purpose}
            methods={methods}
            actions={actions}
            state={state}
            dispatch={dispatch}
            control={control}
            {...(onSignedIn === undefined ? {} : { onSignedIn })}
            {...(onTryAgain === undefined ? {} : { onTryAgain })}
            {...(deviceCode === undefined ? {} : { deviceCode })}
            {...(deviceEmail === undefined ? {} : { deviceEmail })}
            {...(now === undefined ? {} : { now })}
            {...(sentAt === undefined ? {} : { sentAt })}
          />
        </div>
        <div className="ts-auth-foot">
          <ThemeButton label={false} className="ts-auth-theme" />
        </div>
      </div>
      {figure === undefined ? null : (
        <div className="ts-auth-figure" data-control={`${control}.figure`}>
          {figure}
        </div>
      )}
    </main>
  );
}
