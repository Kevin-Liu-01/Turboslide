// OAuth 2 for the live run (SPEC 8.3, 11): the installed-app flow of googleapis with the
// drive.file and presentations scopes. The client secrets JSON is the file
// TURBOSLIDE_GOOGLE_CREDENTIALS names (a Desktop OAuth client downloaded from the Google Cloud
// console, docs/google-slides.md); the token is cached at ~/.config/turboslide/token.json
// (XDG_CONFIG_HOME honored), mode 0600, never inside the repository. The first run prints a
// consent URL and listens on a loopback port for the redirect; later runs refresh silently.
//
// googleapis is loaded on demand through a non-literal specifier: the package is heavy (every
// Google API), it is needed only when a presentation is written, and the exporter, its dry run and
// the CLI must load on a machine that has neither the package installed yet nor any credentials.
// This is the one dynamic import in the package (AGENTS.md: dynamic imports only where necessary).
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { z } from 'zod';

import type {
  BatchUpdateData,
  PresentationData,
  SlidesClient,
  ThumbnailData,
  WriteControl,
} from './client.ts';

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/presentations',
] as const;

export const CREDENTIALS_ENV = 'TURBOSLIDE_GOOGLE_CREDENTIALS';

/** The client secrets file a Desktop (installed) or Web OAuth client downloads as. */
export const clientSecretsSchema = z.object({
  installed: z
    .object({
      client_id: z.string().min(1),
      client_secret: z.string().min(1),
      redirect_uris: z.array(z.string()).optional(),
    })
    .optional(),
  web: z
    .object({
      client_id: z.string().min(1),
      client_secret: z.string().min(1),
      redirect_uris: z.array(z.string()).optional(),
    })
    .optional(),
});

export type ClientSecrets = { clientId: string; clientSecret: string; kind: 'installed' | 'web' };

export const tokenSchema = z.object({
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
  expiry_date: z.number().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
  id_token: z.string().optional(),
});

export type OAuthTokens = z.infer<typeof tokenSchema>;

export function credentialsPath(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env[CREDENTIALS_ENV];
  return value && value.length > 0 ? resolve(value) : undefined;
}

export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  const base =
    env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.length > 0
      ? env.XDG_CONFIG_HOME
      : join(homedir(), '.config');
  return join(base, 'turboslide');
}

export function tokenPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(configDir(env), 'token.json');
}

export async function readClientSecrets(path: string): Promise<ClientSecrets> {
  const parsed = clientSecretsSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  const entry = parsed.installed ?? parsed.web;
  if (!entry)
    throw new Error(
      `${path} is not an OAuth client secrets file: expected an "installed" or "web" object (docs/google-slides.md)`,
    );
  return {
    clientId: entry.client_id,
    clientSecret: entry.client_secret,
    kind: parsed.installed ? 'installed' : 'web',
  };
}

/** True when the cached token can still be used or refreshed. */
export function tokenUsable(tokens: OAuthTokens, now: number = Date.now()): boolean {
  if (tokens.refresh_token) return true;
  return Boolean(tokens.access_token) && (tokens.expiry_date ?? 0) > now + 60_000;
}

// ---------------------------------------------------------------------------------------------
// The googleapis surface the exporter touches, as structural types

type OAuth2Client = {
  credentials: OAuthTokens;
  setCredentials: (tokens: OAuthTokens) => void;
  generateAuthUrl: (options: {
    access_type: 'offline';
    scope: readonly string[] | string[];
    prompt?: 'consent';
  }) => string;
  getToken: (code: string) => Promise<{ tokens: OAuthTokens }>;
  on: (event: 'tokens', listener: (tokens: OAuthTokens) => void) => void;
  getAccessToken: () => Promise<{ token?: string | null }>;
};

type GaxiosLike<T> = Promise<{ data: T }>;

export type SlidesApi = {
  presentations: {
    create: (params: { requestBody: { title: string } }) => GaxiosLike<PresentationData>;
    get: (params: { presentationId: string; fields?: string }) => GaxiosLike<PresentationData>;
    batchUpdate: (params: {
      presentationId: string;
      requestBody: { requests: unknown[]; writeControl?: WriteControl };
    }) => GaxiosLike<BatchUpdateData>;
    pages: {
      getThumbnail: (params: {
        presentationId: string;
        pageObjectId: string;
        'thumbnailProperties.thumbnailSize': 'LARGE' | 'MEDIUM' | 'SMALL';
        'thumbnailProperties.mimeType': 'PNG';
      }) => GaxiosLike<ThumbnailData>;
    };
  };
};

type GoogleApisModule = {
  google: {
    auth: {
      OAuth2: new (clientId: string, clientSecret: string, redirectUri: string) => OAuth2Client;
    };
    slides: (options: { version: 'v1'; auth: OAuth2Client }) => SlidesApi;
  };
};

function isGoogleApisModule(value: unknown): value is GoogleApisModule {
  if (!value || typeof value !== 'object') return false;
  const google: unknown = (value as Record<string, unknown>).google;
  if (!google || typeof google !== 'object') return false;
  const auth: unknown = (google as Record<string, unknown>).auth;
  const slides: unknown = (google as Record<string, unknown>).slides;
  if (!auth || typeof auth !== 'object') return false;
  return (
    typeof (auth as Record<string, unknown>).OAuth2 === 'function' && typeof slides === 'function'
  );
}

/** Loads googleapis when a live run needs it (see the header). */
export async function loadGoogleApis(): Promise<GoogleApisModule> {
  const specifier = 'googleapis';
  let loaded: unknown;
  try {
    loaded = (await import(specifier)) as unknown;
  } catch (error) {
    throw new Error(
      `googleapis is not installed (${error instanceof Error ? error.message : String(error)}); run pnpm install at the workspace root (packages/export lists googleapis from the catalog)`,
    );
  }
  if (!isGoogleApisModule(loaded))
    throw new Error('googleapis loaded without google.auth.OAuth2 and google.slides');
  return loaded;
}

// ---------------------------------------------------------------------------------------------
// The consent flow

export type AuthorizeOptions = {
  env?: NodeJS.ProcessEnv;
  credentialsFile?: string;
  tokenFile?: string;
  log?: (line: string) => void;
  /** Called with the consent URL; defaults to printing it through `log`. */
  openUrl?: (url: string) => void | Promise<void>;
  /** How long to wait for the redirect, default ten minutes. */
  timeoutMs?: number;
  /** Test hook: the module instead of the real import. */
  googleapis?: GoogleApisModule;
};

export type Authorized = {
  client: SlidesClient;
  credentialsFile: string;
  tokenFile: string;
  /** True when a consent flow ran in this call. */
  consented: boolean;
};

export class MissingCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingCredentialsError';
  }
}

/** Runs the loopback redirect: a one-shot server on 127.0.0.1 that receives `?code=` and answers a page. */
async function receiveCode(
  redirectPort: number,
  onListening: (redirectUri: string) => Promise<void>,
  timeoutMs: number,
): Promise<string> {
  return new Promise<string>((resolveCode, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      response.setHeader('content-type', 'text/html; charset=utf-8');
      if (code) {
        response.end(
          '<!doctype html><title>Turboslide</title><p>Turboslide is authorized. You can close this tab.</p>',
        );
        server.close();
        resolveCode(code);
      } else {
        response.statusCode = 400;
        response.end(
          `<!doctype html><title>Turboslide</title><p>Authorization failed: ${error ?? 'no code'}.</p>`,
        );
        server.close();
        reject(new Error(`OAuth redirect without a code (${error ?? 'no error given'})`));
      }
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error(`no OAuth redirect arrived within ${Math.round(timeoutMs / 1000)} s`));
    }, timeoutMs);
    server.on('close', () => clearTimeout(timer));
    server.on('error', reject);
    server.listen(redirectPort, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      onListening(`http://127.0.0.1:${port}`).catch(reject);
    });
  });
}

async function saveTokens(path: string, tokens: OAuthTokens): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(tokenSchema.parse(tokens), null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

/** Authorizes against the cached token or the consent flow and returns a SlidesClient. */
export async function authorize(options: AuthorizeOptions = {}): Promise<Authorized> {
  const env = options.env ?? process.env;
  const log = options.log ?? (() => {});
  const credentialsFile = options.credentialsFile ?? credentialsPath(env);
  if (!credentialsFile)
    throw new MissingCredentialsError(
      `${CREDENTIALS_ENV} is not set; point it at the OAuth client secrets JSON (docs/google-slides.md) or pass --dry-run`,
    );
  if (!existsSync(credentialsFile))
    throw new MissingCredentialsError(
      `${CREDENTIALS_ENV} names ${credentialsFile}, which does not exist`,
    );
  const secrets = await readClientSecrets(credentialsFile);
  const tokenFile = options.tokenFile ?? tokenPath(env);
  const api = options.googleapis ?? (await loadGoogleApis());
  let consented = false;
  let redirectUri = 'http://127.0.0.1';
  let oauth = new api.google.auth.OAuth2(secrets.clientId, secrets.clientSecret, redirectUri);

  let cached: OAuthTokens | undefined;
  if (existsSync(tokenFile)) {
    try {
      cached = tokenSchema.parse(JSON.parse(await readFile(tokenFile, 'utf8')));
    } catch {
      log(`auth: ${tokenFile} is unreadable; running the consent flow again`);
    }
  }
  if (cached && tokenUsable(cached)) {
    oauth.setCredentials(cached);
  } else {
    const timeoutMs = options.timeoutMs ?? 600_000;
    const code = await receiveCode(
      0,
      async (uri) => {
        redirectUri = uri;
        oauth = new api.google.auth.OAuth2(secrets.clientId, secrets.clientSecret, redirectUri);
        const url = oauth.generateAuthUrl({
          access_type: 'offline',
          scope: [...SCOPES],
          prompt: 'consent',
        });
        if (options.openUrl) await options.openUrl(url);
        else
          log(
            `auth: open this URL in a browser signed in to the Google account that should own the presentations:\n${url}`,
          );
      },
      timeoutMs,
    );
    const { tokens } = await oauth.getToken(code);
    oauth.setCredentials(tokens);
    await saveTokens(tokenFile, tokens);
    consented = true;
    log(`auth: token cached at ${tokenFile}`);
  }
  oauth.on('tokens', (tokens) => {
    const merged: OAuthTokens = { ...(cached ?? {}), ...oauth.credentials, ...tokens };
    if (!merged.refresh_token && cached?.refresh_token) merged.refresh_token = cached.refresh_token;
    cached = merged;
    saveTokens(tokenFile, merged).catch((error: unknown) =>
      log(
        `auth: could not cache the refreshed token: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  });
  const slides = api.google.slides({ version: 'v1', auth: oauth });
  return {
    client: slidesClientOver(slides, oauth),
    credentialsFile,
    tokenFile,
    consented,
  };
}

/** The exporter's client over the googleapis Slides surface. */
export function slidesClientOver(slides: SlidesApi, oauth: OAuth2Client): SlidesClient {
  return {
    async create(title) {
      return (await slides.presentations.create({ requestBody: { title } })).data;
    },
    async get(presentationId, fields) {
      return (
        await slides.presentations.get(fields ? { presentationId, fields } : { presentationId })
      ).data;
    },
    async batchUpdate(presentationId, requests, writeControl) {
      const requestBody: { requests: unknown[]; writeControl?: WriteControl } = {
        requests: [...requests],
      };
      if (writeControl) requestBody.writeControl = writeControl;
      return (await slides.presentations.batchUpdate({ presentationId, requestBody })).data;
    },
    async getThumbnail(presentationId, pageObjectId) {
      return (
        await slides.presentations.pages.getThumbnail({
          presentationId,
          pageObjectId,
          'thumbnailProperties.thumbnailSize': 'LARGE',
          'thumbnailProperties.mimeType': 'PNG',
        })
      ).data;
    },
    async fetchBytes(url) {
      // thumbnail content URLs are short-lived and unauthenticated; the token is sent in case the
      // account's sharing settings require it
      const { token } = await oauth.getAccessToken();
      const response = await fetch(
        url,
        token ? { headers: { authorization: `Bearer ${token}` } } : undefined,
      );
      if (!response.ok)
        throw Object.assign(new Error(`thumbnail fetch answered ${response.status}`), {
          status: response.status,
        });
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}
