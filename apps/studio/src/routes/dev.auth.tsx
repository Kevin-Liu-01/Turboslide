import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { useRef, useState } from 'react';

import { AuthPage } from '@turboslide/chrome/auth/AuthPage';
import { AuthWindow } from '@turboslide/chrome/auth/AuthWindow';
import { AuthRefusal, errorState } from '@turboslide/chrome/auth/auth-model';
import type { AuthMethods, AuthPurpose, AuthState } from '@turboslide/chrome/auth/auth-model';
import type { AuthActions } from '@turboslide/chrome/auth/AuthPlate';
import { Select } from '@turboslide/chrome/Select';

import { MoodFigure } from '../components/home/MoodFigure';
import { RouterLinkSlot } from './-link-slot';

/**
 * The auth plate's gallery (docs/POLISH-2.md 4.6, C19): every state of 4.4 in the page host and
 * the window host, with stub methods per state and stub exchanges that resolve after 400 ms and
 * never call /api/auth (Prototemplate's plate gallery works the same way). A dropdown of every state
 * at the top left; `?chrome=0` hides it for pictures. Local only: the loader answers 404 unless
 * `TURBOSLIDE_LOCAL_OPEN=1`, the process is not on a deployment (no `VERCEL`) and the request
 * names a loopback host, so a deployment never draws it; never prerendered and nothing links to
 * it. The rows of `e2e/accounts.spec.ts` (`accounts.plate.states`) walk it. The device states
 * draw on the page alone: the window is the editor's sign in.
 */
type GallerySearch = { state?: string; host?: 'page' | 'window'; chrome?: '0' };

const ADDRESS = 'ada@example.com';
const GOOGLE: AuthMethods = { available: true, google: true, github: false, email: false };
const GOOGLE_EMAIL: AuthMethods = { available: true, google: true, github: false, email: true };
const ALL: AuthMethods = { available: true, google: true, github: true, email: true };
const EMAIL: AuthMethods = { available: true, google: false, github: false, email: true };
const NONE: AuthMethods = { available: false, google: false, github: false, email: false };

type GalleryState = {
  methods: AuthMethods;
  initial: AuthState;
  purpose?: AuthPurpose;
  /** the sent state counts down from the moment it opens */
  counting?: boolean;
  deviceCode?: string;
};

const sent = (problem?: 'code-wrong' | 'code-expired' | 'code-spent'): GalleryState => ({
  methods: GOOGLE_EMAIL,
  initial: { step: 'sent', email: ADDRESS, ...(problem === undefined ? {} : { problem }) },
  counting: problem === undefined,
});
const failed = (code: string): GalleryState => ({
  methods: GOOGLE,
  initial: errorState(code) ?? { step: 'methods' },
});
const device = (problem?: 'code-wrong' | 'spent' | 'expired'): GalleryState => ({
  methods: GOOGLE,
  purpose: 'device',
  initial: { step: 'device', ...(problem === undefined ? {} : { problem }) },
  deviceCode: 'WDJBMJHT',
});

/** Every state of docs/POLISH-2.md 4.4, by its id. */
export const GALLERY_STATES: Readonly<Record<string, GalleryState>> = {
  'methods.google': { methods: GOOGLE, initial: { step: 'methods' } },
  'methods.google-email': { methods: GOOGLE_EMAIL, initial: { step: 'methods' } },
  'methods.all': { methods: ALL, initial: { step: 'methods' } },
  'methods.email': { methods: EMAIL, initial: { step: 'methods' } },
  'methods.none': { methods: NONE, initial: { step: 'methods' } },
  'methods.leaving': { methods: GOOGLE, initial: { step: 'methods', leaving: 'google' } },
  'email.sent': sent(),
  'email.code-wrong': sent('code-wrong'),
  'email.code-expired': sent('code-expired'),
  'email.code-spent': sent('code-spent'),
  'error.cancelled': failed('access_denied'),
  'error.expired': failed('state_mismatch'),
  'error.link': failed('INVALID_TOKEN'),
  'error.account': failed('account_not_linked'),
  'error.other': failed('invalid_code'),
  'device.sign-in-first': {
    methods: GOOGLE_EMAIL,
    purpose: 'device',
    initial: { step: 'methods' },
  },
  'device.code': device(),
  'device.code-wrong': device('code-wrong'),
  'device.spent': device('spent'),
  'device.expired': device('expired'),
  'device.approved': {
    methods: GOOGLE,
    purpose: 'device',
    initial: { step: 'approved', email: ADDRESS },
  },
  'device.denied': { methods: GOOGLE, purpose: 'device', initial: { step: 'denied' } },
};

/** Whether this process may draw the gallery: a checkout opened on purpose, on a loopback host. */
const galleryOpen = createServerFn({ method: 'GET' }).handler(async (): Promise<boolean> => {
  if (process.env.TURBOSLIDE_LOCAL_OPEN !== '1') return false;
  if (process.env.VERCEL !== undefined && process.env.VERCEL !== '') return false;
  try {
    const host = new URL(getRequest().url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
});

export const Route = createFileRoute('/dev/auth')({
  validateSearch: (search: Record<string, unknown>): GallerySearch => ({
    ...(typeof search.state === 'string' ? { state: search.state } : {}),
    ...(search.host === 'window' ? { host: 'window' as const } : {}),
    ...(search.chrome === '0' || search.chrome === 0 ? { chrome: '0' as const } : {}),
  }),
  loader: async () => {
    if (!(await galleryOpen())) throw notFound();
    return null;
  },
  head: () => ({ meta: [{ title: 'Sign in states' }, { name: 'robots', content: 'noindex' }] }),
  component: Gallery,
});

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** The stub exchanges: 400 ms each, no request; a code of 000000 or a device code of WRONGONE refuses. */
const STUBS: AuthActions = {
  social: () => wait(400),
  requestCode: () => wait(400),
  verifyCode: async (_email, code) => {
    await wait(400);
    if (code === '000000') throw new AuthRefusal(400, 'INVALID_OTP', 'Invalid OTP');
  },
  decideDevice: async (code) => {
    await wait(400);
    if (code === 'WRONGONE') throw new AuthRefusal(400, 'invalid_request', 'Invalid code');
  },
};

function Gallery() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const id =
    search.state !== undefined && search.state in GALLERY_STATES ? search.state : 'methods.google';
  const entry = GALLERY_STATES[id] ?? GALLERY_STATES['methods.google']!;
  const purpose = entry.purpose ?? 'sign-in';
  const host = purpose === 'device' ? 'page' : (search.host ?? 'page');
  /* the sent state's countdown starts when the state is drawn */
  const opened = useRef(Date.now());
  const [closed, setClosed] = useState(false);
  const key = `${id}:${host}`;
  const select =
    search.chrome === '0' ? null : (
      <label className="ts-auth-gallery-pick" data-control="gallery.pick">
        <Select
          value={key}
          options={Object.keys(GALLERY_STATES).flatMap((state) =>
            (GALLERY_STATES[state]?.purpose === 'device' ? ['page'] : ['page', 'window']).map(
              (at) => ({ value: `${state}:${at}`, label: `${state} in the ${at}` }),
            ),
          )}
          label="State"
          control="gallery.pick.state"
          onChange={(picked) => {
            const [state, at] = picked.split(':');
            setClosed(false);
            void navigate({
              to: '/dev/auth',
              search: { state, ...(at === 'window' ? { host: 'window' as const } : {}) },
            });
          }}
        />
      </label>
    );
  const common = {
    methods: entry.methods,
    actions: STUBS,
    initial: entry.initial,
    ...(entry.counting === true ? { sentAt: opened.current } : {}),
  };
  return (
    <div className="ts-auth-gallery" data-gallery-state={id} data-gallery-host={host}>
      {select}
      {host === 'page' ? (
        <AuthPage
          key={key}
          {...common}
          purpose={purpose}
          control={purpose === 'device' ? 'device' : 'page.signIn'}
          linkComponent={RouterLinkSlot}
          figure={<MoodFigure size="page" control="signin.figure" />}
          {...(entry.deviceCode === undefined ? {} : { deviceCode: entry.deviceCode })}
          deviceEmail={ADDRESS}
        />
      ) : closed ? null : (
        <AuthWindow key={key} {...common} control="dialog.signIn" onClose={() => setClosed(true)} />
      )}
    </div>
  );
}
