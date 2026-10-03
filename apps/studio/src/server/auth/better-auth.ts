// Sign in through better-auth 1.7.4 (gslides-parity SPEC-3 0.20, 7.3, 7.4; research 03 C2, C4,
// E, F, H): the library's handler is mounted at `/api/auth/$` (routes/api/auth.$.ts), the Kysely
// adapter runs over the identity database of db.ts, and the plugins are the magic link, the
// email OTP (both in one mail through mail/), the device authorization flow for `turboslide
// login`, and the TanStack Start cookie plugin last so cookies set inside server functions are
// written. GitHub and Google join when their two variables are set; Google asks for the account
// chooser alone, with no offline access and no consent prompt, since nothing calls a Google API
// after the sign in (docs/REALTIME.md 4.1). The base URL is dynamic: the request's Host when it
// is on the deployment's own list (`TURBOSLIDE_AUTH_HOSTS`, else the five defaults), the hosted
// fallback `TURBOSLIDE_PUBLIC_ORIGIN` otherwise, a refusal when neither. Passkeys wait:
// `@better-auth/passkey` is
// not in this checkout and the rpID cannot move once set (03 C1), so `signInMethods` reports them
// off with the sentence the dialog shows.
//
// The session hooks are where the anonymous principal joins the account (the alias table,
// alias.ts) and where the caller's other stores hear about a sign in or a deletion; they are
// injected so this module knows the library and nothing of the studio's stores. Nothing here
// prints a secret: the secret is `BETTER_AUTH_SECRET`, else a value derived from the identity
// cookie's secret, so a checkout needs no variable.
import { betterAuth } from 'better-auth';
import type { Auth, BetterAuthOptions } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { deviceAuthorization } from 'better-auth/plugins/device-authorization';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { magicLink } from 'better-auth/plugins/magic-link';
import { tanstackStartCookies } from 'better-auth/tanstack-start';

import { sha256Hex } from '@turboslide/identity/sha256';

import type { AuthDb } from './db.ts';
import { signInMail } from './mail/templates.ts';
import type { MailMode, Mailer } from './mail/mailer.ts';
import type { QuotaStore } from './quota.ts';
import type { SecondaryStorage } from './secondary-storage.ts';

export const BETTER_AUTH_SECRET_VARIABLE = 'BETTER_AUTH_SECRET';
export const GITHUB_ID_VARIABLE = 'GITHUB_CLIENT_ID';
export const GITHUB_SECRET_VARIABLE = 'GITHUB_CLIENT_SECRET';
export const GOOGLE_ID_VARIABLE = 'GOOGLE_CLIENT_ID';
export const GOOGLE_SECRET_VARIABLE = 'GOOGLE_CLIENT_SECRET';
/**
 * The hosts the library may name in a redirect URI or a magic link, comma separated
 * (better-auth's `baseURL.allowedHosts`, docs/REALTIME.md 4.1; wildcards as `trustedOrigins`
 * takes them). A Host header off the list is refused unless the hosted fallback
 * `TURBOSLIDE_PUBLIC_ORIGIN` is set, so a deployment never mints a redirect URI on a host it does
 * not own.
 */
export const AUTH_HOSTS_VARIABLE = 'TURBOSLIDE_AUTH_HOSTS';
export const PUBLIC_ORIGIN_VARIABLE = 'TURBOSLIDE_PUBLIC_ORIGIN';
export const DEFAULT_AUTH_HOSTS: readonly string[] = Object.freeze([
  'www.turboslide.com',
  'turboslide.com',
  'turboslide.vercel.app',
  'localhost:*',
  '127.0.0.1:*',
]);
/** The social sign in start and Google's callback: 10 per minute per address (REALTIME.md 4.1). */
export const SOCIAL_PER_MINUTE = 10;
/** Set to the production host once it is final; the passkey plugin is enabled with it (0.20). */
export const PASSKEY_RPID_VARIABLE = 'TURBOSLIDE_PASSKEY_RPID';

export const AUTH_BASE_PATH = '/api/auth';
export const COOKIE_PREFIX = 'ts';
/** 7 days idle, refreshed daily, fresh for 10 minutes (SPEC-3 0.20, 7.4). */
export const SESSION_IDLE_S = 7 * 24 * 60 * 60;
export const SESSION_UPDATE_S = 24 * 60 * 60;
export const SESSION_FRESH_S = 10 * 60;
/** The magic link and the code live 300 s; three attempts per code (SPEC-3 7.3). */
export const SIGN_IN_EXPIRES_S = 300;
export const OTP_ATTEMPTS = 3;
/** The device flow: an 8 character code at /device, five attempts, 30 minutes (SPEC-3 7.7). */
export const DEVICE_CLIENT_ID = 'turboslide-cli';
export const DEVICE_USER_CODE_LENGTH = 8;
export const DEVICE_EXPIRES = '30m';
export const DEVICE_INTERVAL = '5s';
export const DEVICE_ATTEMPTS = 5;
/** The sign in dialog's greyed passkey row (SPEC-3 7.3). */
export const PASSKEYS_LATER = 'Passkeys arrive once the address is final';
/**
 * The sign in limits (research 03 Part H; report 10 F42): 3 mails per address per 10 minutes in
 * the application (the address hashed under the deployment's secret, never stored as typed), 10
 * per IP per hour in the library's limiter, 3 attempts per code. A checkout's test run may turn
 * the library's limiter off with TURBOSLIDE_AUTH_RATE_LIMIT=off; a hosted process ignores the
 * switch.
 */
export const MAILS_PER_ADDRESS = 3;
export const MAILS_PER_ADDRESS_WINDOW_MS = 10 * 60_000;
export const MAILS_PER_IP_PER_HOUR = 10;
export const AUTH_RATE_LIMIT_VARIABLE = 'TURBOSLIDE_AUTH_RATE_LIMIT';

export type Env = Readonly<Record<string, string | undefined>>;

export type SignInMethods = {
  /** Sign in exists at all: a database is configured (7.3). */
  available: boolean;
  /** the magic link and the code: a database and a mail sender (REALTIME.md 4.1, default 7.7) */
  email: boolean;
  passkeys: boolean;
  passkeysNotice: string | null;
  github: boolean;
  /** Continue with Google: the two Google variables and a database (REALTIME.md 4.1) */
  google: boolean;
};

/**
 * What the dialog offers on this deployment (7.3), from the environment, the database and the
 * mail mode alone. The email method needs a sender: with TURBOSLIDE_MAIL=off every mail is
 * dropped (docs/archive/rounds/PEOPLE.md 8.2 item 3), so the field is hidden rather than offered and Google may
 * be the only method (REALTIME.md 7.7).
 */
export function signInMethods(
  env: Env,
  databaseConfigured: boolean,
  mailMode: MailMode,
): SignInMethods {
  const github = isSet(env[GITHUB_ID_VARIABLE]) && isSet(env[GITHUB_SECRET_VARIABLE]);
  const google = isSet(env[GOOGLE_ID_VARIABLE]) && isSet(env[GOOGLE_SECRET_VARIABLE]);
  return {
    available: databaseConfigured,
    email: databaseConfigured && mailMode !== 'off',
    passkeys: false,
    passkeysNotice: databaseConfigured ? PASSKEYS_LATER : null,
    github: databaseConfigured && github,
    google: databaseConfigured && google,
  };
}

function isSet(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

/** The hosts `baseURL.allowedHosts` accepts: `TURBOSLIDE_AUTH_HOSTS` split on commas, else the defaults. */
export function authHosts(env: Env): string[] {
  const listed = (env[AUTH_HOSTS_VARIABLE] ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter((host) => host !== '');
  return listed.length > 0 ? listed : [...DEFAULT_AUTH_HOSTS];
}

/**
 * The library's base URL per request (better-auth 1.7.4's dynamic config): the request's Host
 * when it is on the list, the public origin as the hosted fallback, else a refusal. A checkout
 * has no fallback, so a foreign Host is refused there too (better-auth.test.ts).
 */
export function authBaseURL(
  env: Env,
  hosted: boolean,
): { allowedHosts: string[]; fallback?: string } {
  const publicOrigin = env[PUBLIC_ORIGIN_VARIABLE];
  return {
    allowedHosts: authHosts(env),
    ...(hosted && isSet(publicOrigin) ? { fallback: publicOrigin.replace(/\/+$/, '') } : {}),
  };
}

/** `BETTER_AUTH_SECRET`, else a value derived from the identity cookie's secret. */
export function betterAuthSecret(env: Env, sessionSecret: string): string {
  const own = env[BETTER_AUTH_SECRET_VARIABLE];
  if (isSet(own)) return own;
  return sha256Hex(`turboslide better-auth secret:${sessionSecret}`);
}

export type SessionFacts = { id: string; userId: string; token: string };

export type AuthDeps = {
  db: AuthDb;
  env: Env;
  /** The identity cookie's secret, for the derived library secret. */
  sessionSecret: string;
  mailer: Mailer;
  /** The per address mail quota (F42); memory when the runtime has no database. */
  quotas: QuotaStore;
  /** Redis when the deployment has one; sessions and counters move there. */
  secondaryStorage?: SecondaryStorage;
  hosted: boolean;
  /** After a session is created: the alias link and the merges run here (identity.ts). */
  onSessionCreated?: (session: SessionFacts, request: Request | undefined) => Promise<void>;
  /** Before a user is deleted; throw to refuse (owned decks other people hold grants on, 7.4). */
  beforeUserDelete?: (userId: string) => Promise<void>;
  /** After a user is deleted: the avatar files, the aliases, the profile (7.4). */
  onUserDeleted?: (userId: string) => Promise<void>;
  log?: (line: string) => void;
};

function buildAuth(deps: AuthDeps): Auth {
  const log = deps.log ?? ((line: string) => console.error(line));
  // the magic link handler asks the OTP plugin for a code through the api the instance exposes,
  // which does not exist until betterAuth() returned: a late binding
  const api: { createOtp?: (email: string, headers?: Headers) => Promise<string> } = {};
  const sendSignIn = async (
    email: string,
    url: string | undefined,
    code: string,
  ): Promise<void> => {
    // 3 per address per 10 minutes, the address hashed under the secret (F42): past the cap the
    // caller's answer is unchanged and no mail leaves
    const addressKey = `signin:${sha256Hex(`${deps.sessionSecret}:${email.toLowerCase()}`).slice(0, 32)}`;
    const quota = await deps.quotas.take(
      addressKey,
      MAILS_PER_ADDRESS,
      MAILS_PER_ADDRESS_WINDOW_MS,
    );
    if (!quota.ok) {
      log('turboslide auth: sign in mail withheld, the address reached its window');
      return;
    }
    const content = signInMail({
      ...(url !== undefined ? { url } : {}),
      code,
      minutes: SIGN_IN_EXPIRES_S / 60,
    });
    try {
      await deps.mailer.send({ to: email, kind: 'sign-in', ...content });
    } catch (error) {
      // the caller's answer is the same whether or not a mail left (03 C2)
      log(
        `turboslide auth: sign in mail not sent: ${error instanceof Error ? error.name : 'error'}`,
      );
    }
  };
  const github =
    isSet(deps.env[GITHUB_ID_VARIABLE]) && isSet(deps.env[GITHUB_SECRET_VARIABLE])
      ? {
          github: {
            clientId: deps.env[GITHUB_ID_VARIABLE] ?? '',
            clientSecret: deps.env[GITHUB_SECRET_VARIABLE] ?? '',
          },
        }
      : {};
  const google =
    isSet(deps.env[GOOGLE_ID_VARIABLE]) && isSet(deps.env[GOOGLE_SECRET_VARIABLE])
      ? {
          google: {
            clientId: deps.env[GOOGLE_ID_VARIABLE] ?? '',
            clientSecret: deps.env[GOOGLE_SECRET_VARIABLE] ?? '',
            // the account chooser when the browser holds several Google accounts; no
            // `accessType: 'offline'` and no `consent`, since nothing calls a Google API later
            // (docs/REALTIME.md 4.1; design-google-login.md 2.4)
            prompt: 'select_account' as const,
          },
        }
      : {};
  const auth = betterAuth({
    appName: 'Turboslide',
    basePath: AUTH_BASE_PATH,
    // the request's Host when the deployment owns it, else the hosted fallback, else a refusal
    // (REALTIME.md 4.1): no boot warning and no redirect URI on a host Google would refuse
    baseURL: authBaseURL(deps.env, deps.hosted),
    secret: betterAuthSecret(deps.env, deps.sessionSecret),
    // on the `d1` kind the library takes the binding shaped facade over the proxy and runs its own
    // D1 dialect and index introspector (d1-proxy-dialect.ts: D1 refuses the generic SQLite index
    // read of getMigrations); on the other kinds the Kysely of db.ts with its type
    database:
      deps.db.kind === 'd1' && deps.db.d1 !== undefined
        ? (deps.db.d1 as unknown as NonNullable<BetterAuthOptions['database']>)
        : { db: deps.db.db, type: deps.db.kind === 'postgres' ? 'postgres' : 'sqlite' },
    ...(deps.secondaryStorage !== undefined ? { secondaryStorage: deps.secondaryStorage } : {}),
    // the origin of the request itself: the dev server's port varies per builder and the hosted
    // name is the deployment's own; a cross site page's Origin header never matches it
    trustedOrigins: (request) => {
      if (request === undefined) return [];
      try {
        return [new URL(request.url).origin];
      } catch {
        return [];
      }
    },
    session: {
      expiresIn: SESSION_IDLE_S,
      updateAge: SESSION_UPDATE_S,
      freshAge: SESSION_FRESH_S,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    advanced: {
      cookiePrefix: COOKIE_PREFIX,
      useSecureCookies: deps.hosted,
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
      // the library's own schema check introspects every table once per instance (two proxy
      // calls, a dozen statements); on the D1 engine the boot path runs the migrations itself and
      // the `ts_schema` row carries the version (identity.ts, docs/CLOUDFLARE.md 4.2), so the
      // check is off there and a cold instance makes one statement
      ...(deps.db.kind === 'd1' ? { database: { validateSchema: false } } : {}),
    },
    rateLimit: {
      enabled: !(deps.env[AUTH_RATE_LIMIT_VARIABLE] === 'off' && !deps.hosted),
      window: 60,
      max: 100,
      storage: deps.secondaryStorage !== undefined ? 'secondary-storage' : 'memory',
      customRules: {
        '/sign-in/magic-link': { window: 3600, max: MAILS_PER_IP_PER_HOUR },
        '/email-otp/send-verification-otp': { window: 3600, max: MAILS_PER_IP_PER_HOUR },
        '/sign-in/email-otp': { window: 600, max: 10 },
        '/magic-link/verify': { window: 600, max: 10 },
        '/device/code': { window: 60, max: 10 },
        '/device/token': { window: 60, max: 30 },
        '/device/approve': { window: 60, max: DEVICE_ATTEMPTS },
        '/device/deny': { window: 60, max: DEVICE_ATTEMPTS },
        '/sign-in/social': { window: 60, max: SOCIAL_PER_MINUTE },
        '/callback/google': { window: 60, max: SOCIAL_PER_MINUTE },
      },
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          await deps.beforeUserDelete?.(user.id);
        },
        afterDelete: async (user) => {
          await deps.onUserDeleted?.(user.id);
        },
      },
    },
    databaseHooks: {
      session: {
        create: {
          after: async (session, ctx) => {
            await deps.onSessionCreated?.(
              { id: session.id, userId: session.userId, token: session.token },
              ctx?.request,
            );
          },
        },
      },
    },
    socialProviders: { ...github, ...google },
    plugins: [
      magicLink({
        expiresIn: SIGN_IN_EXPIRES_S,
        storeToken: 'hashed',
        rateLimit: { window: 3600, max: MAILS_PER_IP_PER_HOUR },
        sendMagicLink: async ({ email, url }, ctx) => {
          let code = '';
          try {
            code = (await api.createOtp?.(email, ctx?.headers ?? ctx?.request?.headers)) ?? '';
          } catch (error) {
            log(
              `turboslide auth: code not created: ${error instanceof Error ? error.name : 'error'}`,
            );
          }
          await sendSignIn(email, url, code);
        },
      }),
      emailOTP({
        otpLength: 6,
        expiresIn: SIGN_IN_EXPIRES_S,
        allowedAttempts: OTP_ATTEMPTS,
        storeOTP: 'hashed',
        rateLimit: { window: 3600, max: MAILS_PER_IP_PER_HOUR },
        sendVerificationOTP: async ({ email, otp }) => {
          await sendSignIn(email, undefined, otp);
        },
      }),
      deviceAuthorization({
        expiresIn: DEVICE_EXPIRES,
        interval: DEVICE_INTERVAL,
        userCodeLength: DEVICE_USER_CODE_LENGTH,
        verificationUri: '/device',
        validateClient: (clientId) => clientId === DEVICE_CLIENT_ID,
      }),
      tanstackStartCookies(),
    ],
  });
  // the OTP plugin's server only endpoint answers the code it stored (email-otp/routes.mjs);
  // the base `Auth` type does not carry plugin endpoints, so the one call is typed here
  const withOtp = auth.api as unknown as {
    createVerificationOTP: (input: {
      body: { email: string; type: 'sign-in' };
      headers?: Headers;
    }) => Promise<string>;
  };
  // the request's headers ride along: under the dynamic base URL a direct api call with no source
  // and no fallback is refused (better-auth to-auth-endpoints.mjs resolveDynamicContext), and a
  // checkout has no fallback
  api.createOtp = (email, headers) =>
    withOtp.createVerificationOTP({
      body: { email, type: 'sign-in' },
      ...(headers !== undefined ? { headers } : {}),
    });
  // the concrete options type is not assignable to the default one (the plugins narrow `api`);
  // callers use the handler and the base api
  return auth as unknown as Auth;
}

/** The library instance with the base API; plugin endpoints are reached through `handler`. */
export type TurboslideAuth = Auth;

/** The configured library instance; `migrateBetterAuth` creates its tables. */
export function createAuth(deps: AuthDeps): TurboslideAuth {
  return buildAuth(deps);
}

/** Creates or extends the library's tables (user, session, account, verification, deviceCode). */
export async function migrateBetterAuth(auth: TurboslideAuth): Promise<void> {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
}

/** The session the request's cookie names, or null. */
export async function sessionOf(
  auth: TurboslideAuth,
  request: Request,
): Promise<{
  session: {
    id: string;
    userId: string;
    token: string;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
  user: { id: string; email: string; emailVerified: boolean; name: string; image?: string | null };
} | null> {
  const result = await auth.api.getSession({ headers: request.headers });
  if (result === null) return null;
  return {
    session: result.session,
    user: result.user,
  };
}

/** True when the session was created or refreshed within the fresh window (7.4). */
export function isFreshSession(
  session: { updatedAt: Date; createdAt: Date },
  now: Date = new Date(),
): boolean {
  const newest = Math.max(session.updatedAt.getTime(), session.createdAt.getTime());
  return now.getTime() - newest <= SESSION_FRESH_S * 1000;
}
