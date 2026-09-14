// Outgoing mail and where it goes (gslides-parity SPEC-3 7.3, 5.5, 11.4; research 03 C2, H;
// the account boundary of round three): `TURBOSLIDE_MAIL=capture` writes every mail to a store
// `admin.mail.list` reads (the identity database's ts_mail table when there is one, else a JSON
// lines file under `.turboslide/mail/`, else memory), which is how every preview and every test
// reads a sign in code; `resend` sends through Resend's SDK once `RESEND_API_KEY` and
// `TURBOSLIDE_MAIL_FROM` are set (the sending domain is Kevin's, SPEC-3 section 18; this round
// exercises the client against a fake); anything else drops the mail and says so once. The same
// answer goes back to the caller whichever mode runs, so a sign in form cannot tell whether an
// address exists or a mail left (03 C2).
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Kysely } from 'kysely';

import type { AuthDatabase } from '../schema.ts';

export const MAIL_VARIABLE = 'TURBOSLIDE_MAIL';
export const MAIL_FROM_VARIABLE = 'TURBOSLIDE_MAIL_FROM';
export const RESEND_KEY_VARIABLE = 'RESEND_API_KEY';

export type MailMode = 'capture' | 'resend' | 'off';

export type MailKind =
  'sign-in' | 'invitation' | 'request-access' | 'transfer' | 'digest' | 'account';

export const MAIL_KINDS: readonly MailKind[] = [
  'sign-in',
  'invitation',
  'request-access',
  'transfer',
  'digest',
  'account',
];

export type OutgoingMail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  kind: MailKind;
  /** List-Unsubscribe and its companion on a digest (SPEC-3 5.5); nothing else. */
  headers?: Record<string, string>;
};

export type CapturedMail = {
  id: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  kind: MailKind;
  headers: Record<string, string>;
  createdAt: string;
};

export type SendResult = { id: string; status: 'sent' | 'captured' | 'dropped' };

export type Env = Readonly<Record<string, string | undefined>>;

function isSet(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

/** The mode for this process, from the environment alone; never a key in the reason. */
export function selectMail(env: Env = process.env): { mode: MailMode; reason: string } {
  const forced = env[MAIL_VARIABLE]?.trim().toLowerCase();
  if (forced === 'capture') return { mode: 'capture', reason: `${MAIL_VARIABLE}=capture` };
  if (forced === 'off') return { mode: 'off', reason: `${MAIL_VARIABLE}=off` };
  if (isSet(env[RESEND_KEY_VARIABLE]) && isSet(env[MAIL_FROM_VARIABLE]))
    return { mode: 'resend', reason: `${RESEND_KEY_VARIABLE} and ${MAIL_FROM_VARIABLE} are set` };
  if (isSet(env[RESEND_KEY_VARIABLE]))
    return { mode: 'off', reason: `${RESEND_KEY_VARIABLE} is set without ${MAIL_FROM_VARIABLE}` };
  return { mode: 'off', reason: `${MAIL_VARIABLE} is not capture and no Resend key is set` };
}

const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isMailAddress(value: string): boolean {
  return value.length <= 254 && ADDRESS.test(value);
}

export type ListMailOptions = { since?: string; limit?: number };

export type CaptureStore = {
  append: (mail: CapturedMail) => Promise<void>;
  /** Newest first; `since` an ISO stamp; `limit` at most 500. */
  list: (options?: ListMailOptions) => Promise<CapturedMail[]>;
};

function newest(mails: CapturedMail[], options: ListMailOptions): CapturedMail[] {
  const since = options.since;
  const limit = Math.min(500, Math.max(1, options.limit ?? 100));
  // reversed before the stable sort, so two mails with one stamp list the later one first
  return [...mails]
    .reverse()
    .filter((mail) => since === undefined || mail.createdAt > since)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function memoryCaptureStore(): CaptureStore & { mails: CapturedMail[] } {
  const mails: CapturedMail[] = [];
  return {
    mails,
    append: (mail) => {
      mails.push(mail);
      return Promise.resolve();
    },
    list: (options = {}) => Promise.resolve(newest(mails, options)),
  };
}

export const MAIL_DIR = 'mail';
export const OUTBOX_FILE = 'outbox.jsonl';

/** One JSON line per mail under `<stateDir>/mail/outbox.jsonl`; the file is read on every list. */
export function fileCaptureStore(stateDir: string): CaptureStore {
  const dir = join(stateDir, MAIL_DIR);
  const path = join(dir, OUTBOX_FILE);
  const read = (): CapturedMail[] => {
    if (!existsSync(path)) return [];
    const out: CapturedMail[] = [];
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (line.trim() === '') continue;
      try {
        out.push(JSON.parse(line) as CapturedMail);
      } catch {
        // a torn line from a crash mid write is skipped
      }
    }
    return out;
  };
  return {
    append: (mail) => {
      mkdirSync(dir, { recursive: true });
      appendFileSync(path, `${JSON.stringify(mail)}\n`, { mode: 0o600 });
      return Promise.resolve();
    },
    list: (options = {}) => Promise.resolve(newest(read(), options)),
  };
}

/** The ts_mail table: shared by every instance that shares the database. */
export function dbCaptureStore(db: Kysely<AuthDatabase>): CaptureStore {
  return {
    async append(mail) {
      await db
        .insertInto('ts_mail')
        .values({
          id: mail.id,
          kind: mail.kind,
          toAddress: mail.to,
          subject: mail.subject,
          text: mail.text,
          html: mail.html ?? null,
          headers: JSON.stringify(mail.headers),
          createdAt: mail.createdAt,
        })
        .execute();
    },
    async list(options = {}) {
      const limit = Math.min(500, Math.max(1, options.limit ?? 100));
      let query = db.selectFrom('ts_mail').selectAll().orderBy('createdAt', 'desc').limit(limit);
      if (options.since !== undefined) query = query.where('createdAt', '>', options.since);
      const rows = await query.execute();
      return rows.map((row) => ({
        id: row.id,
        kind: row.kind as MailKind,
        to: row.toAddress,
        subject: row.subject,
        text: row.text,
        ...(row.html !== null ? { html: row.html } : {}),
        headers: JSON.parse(row.headers) as Record<string, string>,
        createdAt: row.createdAt,
      }));
    },
  };
}

export type Mailer = {
  mode: MailMode;
  send: (mail: OutgoingMail) => Promise<SendResult>;
  /** The captured mail, newest first; empty in every other mode. */
  list: (options?: ListMailOptions) => Promise<CapturedMail[]>;
};

function checkMail(mail: OutgoingMail): void {
  if (!isMailAddress(mail.to)) throw new TypeError('the recipient must be an email address');
  if (mail.subject.trim() === '') throw new TypeError('the subject must not be empty');
  if (mail.text.trim() === '') throw new TypeError('the text body must not be empty');
  if (!MAIL_KINDS.includes(mail.kind)) throw new TypeError(`unknown mail kind ${mail.kind}`);
}

export function captureMailer(store: CaptureStore, now: () => Date = () => new Date()): Mailer {
  return {
    mode: 'capture',
    async send(mail) {
      checkMail(mail);
      const captured: CapturedMail = {
        id: crypto.randomUUID(),
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        ...(mail.html !== undefined ? { html: mail.html } : {}),
        kind: mail.kind,
        headers: { ...(mail.headers ?? {}) },
        createdAt: now().toISOString(),
      };
      await store.append(captured);
      return { id: captured.id, status: 'captured' };
    },
    list: (options) => store.list(options),
  };
}

/** The part of Resend's SDK the mailer calls (`new Resend(key).emails.send`). */
export type ResendLike = {
  emails: {
    send: (input: {
      from: string;
      to: string;
      subject: string;
      text: string;
      html?: string;
      headers?: Record<string, string>;
    }) => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
  };
};

export function resendMailer(client: ResendLike, from: string): Mailer {
  return {
    mode: 'resend',
    async send(mail) {
      checkMail(mail);
      const result = await client.emails.send({
        from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        ...(mail.html !== undefined ? { html: mail.html } : {}),
        ...(mail.headers !== undefined ? { headers: mail.headers } : {}),
      });
      if (result.error !== null || result.data === null)
        throw new Error(`mail not sent: ${result.error?.message ?? 'no id returned'}`);
      return { id: result.data.id, status: 'sent' };
    },
    list: () => Promise.resolve([]),
  };
}

/** Drops every mail and says so once; the sender's answer to the caller is unchanged. */
export function offMailer(warn: (line: string) => void = (line) => console.warn(line)): Mailer {
  let warned = false;
  return {
    mode: 'off',
    send(mail) {
      checkMail(mail);
      if (!warned) {
        warned = true;
        warn(
          `turboslide mail: no mail service on this deployment; a ${mail.kind} mail was dropped (set ${MAIL_VARIABLE}=capture, or ${RESEND_KEY_VARIABLE} and ${MAIL_FROM_VARIABLE})`,
        );
      }
      return Promise.resolve({ id: crypto.randomUUID(), status: 'dropped' });
    },
    list: () => Promise.resolve([]),
  };
}

export type MailerDeps = {
  /** Where captured mail goes: the database table when there is a database, else the file. */
  store: CaptureStore;
  /** Builds the Resend client from the key; injected so tests never construct the SDK. */
  resend?: (apiKey: string) => ResendLike;
  warn?: (line: string) => void;
};

export function selectMailer(env: Env, deps: MailerDeps): Mailer {
  const { mode } = selectMail(env);
  if (mode === 'capture') return captureMailer(deps.store);
  if (mode === 'resend' && deps.resend !== undefined)
    return resendMailer(deps.resend(env[RESEND_KEY_VARIABLE] ?? ''), env[MAIL_FROM_VARIABLE] ?? '');
  return offMailer(deps.warn);
}
