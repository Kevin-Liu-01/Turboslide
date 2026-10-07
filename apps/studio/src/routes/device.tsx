import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

import { AuthPage } from '@turboslide/chrome/auth/AuthPage';
import { AuthRefusal, cleanDeviceCode } from '@turboslide/chrome/auth/auth-model';

import { MoodFigure } from '../components/home/MoodFigure';
import { NO_SIGN_IN } from '../components/home/sign-in';
import type { SignInFacts } from '../components/home/sign-in';
import { methodsOf, pageActions } from '../components/home/sign-in-auth';
import { RouterLinkSlot } from './-link-slot';

// /device (gslides-parity SPEC-3 7.7; docs/POLISH-2.md 4.3, C15): the verification page of the
// device authorization flow `turboslide login` runs. The CLI asks /api/auth/device/code for a
// device code and an 8 character user code, prints the code and this address, and polls
// /api/auth/device/token; the person opens this page. On the auth plate's page host: an anonymous
// visitor signs in first through the deployment's methods (Continue with Google on production,
// where mail is off) with the return path back to this page and its code, then sees the code in
// two groups of four, prefilled from `user_code`, with Approve and Deny, then the outcome. The
// calls are unchanged: `GET /api/auth/device?user_code=` binds the code to the session, then
// `POST /api/auth/device/approve` or `deny` decides it. Five tries per code (RFC 8628 5.1; the
// library's limit holds the same number per minute on the approve route), then a new code.

/** The tries a code has before the page asks for a new one (better-auth.ts DEVICE_ATTEMPTS). */
export const DEVICE_ATTEMPTS = 5;

type DeviceSearch = { user_code?: string };

/** The deployment's methods and the address of the session, read once on the server. */
type DeviceFacts = SignInFacts & { address: string | null };

const readDeviceFacts = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DeviceFacts> => {
    try {
      const { accountSession, identityRuntime } = await import('../server/auth/identity');
      const runtime = identityRuntime();
      if (runtime.auth === null) return { ...NO_SIGN_IN, address: null };
      const session = await accountSession(runtime, getRequest());
      return {
        google: runtime.methods.google,
        github: runtime.methods.github,
        email: runtime.methods.email,
        signedIn: session !== null,
        address: session?.account.email ?? null,
      };
    } catch {
      return { ...NO_SIGN_IN, address: null };
    }
  },
);

export const Route = createFileRoute('/device')({
  validateSearch: (search: Record<string, unknown>): DeviceSearch =>
    typeof search.user_code === 'string' ? { user_code: cleanDeviceCode(search.user_code) } : {},
  loader: () => readDeviceFacts(),
  head: () => ({
    meta: [
      { title: 'Connect the command line, Turboslide' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: DevicePage,
});

/** The claim, then the decision; a refusal carries the library's `error` as its code. */
async function decideDevice(code: string, approve: boolean): Promise<void> {
  const refused = async (response: Response) => {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    return new AuthRefusal(response.status, body?.error ?? '', body?.error ?? 'refused');
  };
  /* the library binds the code to the verifying session first, then takes the decision; a code
     nobody asked for fails here and counts as a try */
  const claimed = await fetch(`/api/auth/device?user_code=${encodeURIComponent(code)}`, {
    credentials: 'same-origin',
  });
  if (!claimed.ok) throw await refused(claimed);
  const decided = await fetch(`/api/auth/device/${approve ? 'approve' : 'deny'}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ userCode: code }),
  });
  if (!decided.ok) throw await refused(decided);
}

function DevicePage() {
  const facts = Route.useLoaderData();
  const search = Route.useSearch();
  const code = search.user_code ?? '';
  const next = code === '' ? '/device' : `/device?user_code=${code}`;
  const methods = methodsOf(facts);
  return (
    <AuthPage
      purpose="device"
      control="device"
      methods={methods}
      actions={{ ...pageActions(methods, next), decideDevice }}
      initial={facts.signedIn ? { step: 'device' } : { step: 'methods' }}
      linkComponent={RouterLinkSlot}
      figure={<MoodFigure size="page" control="device.figure" />}
      deviceCode={code}
      deviceEmail={facts.address ?? ''}
      /* the code signed this browser in: the page loads again as the account, at the code step */
      onSignedIn={() => window.location.assign(next)}
    />
  );
}
