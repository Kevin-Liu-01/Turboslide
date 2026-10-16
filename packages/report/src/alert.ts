// The alert sender (hardening HR-O#3, RELIABILITY-14, CRIT-M10; docs/hardening/HARDENING.md 4.8):
// one mail to the person on call, sent straight to Resend's API with a key of its own. It reads
// three variables and no other: `TURBOSLIDE_ALERT_RESEND_KEY` (a key with sending access only),
// `TURBOSLIDE_ALERT_TO` (one address or several, separated by commas) and the optional
// `TURBOSLIDE_ALERT_FROM`. It never reads `TURBOSLIDE_MAIL` or the studio's mailer settings, so
// production's mail being off this round (question 17) does not silence an alert. Without the key
// or the address the caller writes the alert as a line at error and shows it on `/health`.
//
// The realtime Worker's scheduled check (apps/realtime-worker/src/watch.ts) is the one caller; it
// keeps the rule of one mail per incident. Browser and Worker safe: `fetch` alone.

export const ALERT_KEY_VARIABLE = 'TURBOSLIDE_ALERT_RESEND_KEY';
export const ALERT_TO_VARIABLE = 'TURBOSLIDE_ALERT_TO';
export const ALERT_FROM_VARIABLE = 'TURBOSLIDE_ALERT_FROM';

/** The three names the sender reads, and nothing else. */
export const ALERT_VARIABLES = [
  ALERT_KEY_VARIABLE,
  ALERT_TO_VARIABLE,
  ALERT_FROM_VARIABLE,
] as const;

/**
 * The sender when `TURBOSLIDE_ALERT_FROM` is unset: Resend's shared test address, which delivers
 * to the address of the Resend account that owns the key without a verified domain.
 */
export const DEFAULT_ALERT_FROM = 'Turboslide alerts <onboarding@resend.dev>';

/** Resend's send endpoint (https://resend.com/docs/api-reference/emails/send-email). */
export const RESEND_EMAILS_URL = 'https://api.resend.com/emails';

/** How long one send waits for Resend before it counts as failed. */
export const ALERT_SEND_MS = 10_000;

export type AlertEnv = Partial<Record<(typeof ALERT_VARIABLES)[number], string>>;

export type AlertChannel =
  | { configured: true; key: string; to: string[]; from: string }
  | { configured: false; missing: string[] };

const ADDRESS = /^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/;

/** The channel the three variables describe; `missing` names what is not set, never a value. */
export function alertChannel(env: AlertEnv): AlertChannel {
  const key = env[ALERT_KEY_VARIABLE]?.trim() ?? '';
  const to = (env[ALERT_TO_VARIABLE] ?? '')
    .split(',')
    .map((address) => address.trim())
    .filter((address) => ADDRESS.test(address));
  const from = env[ALERT_FROM_VARIABLE]?.trim() || DEFAULT_ALERT_FROM;
  const missing = [
    ...(key === '' ? [ALERT_KEY_VARIABLE] : []),
    ...(to.length === 0 ? [ALERT_TO_VARIABLE] : []),
  ];
  return missing.length === 0
    ? { configured: true, key, to, from }
    : { configured: false, missing };
}

export type AlertMail = { subject: string; text: string };

export type AlertSent =
  { ok: true; id: string | null } | { ok: false; status: number; reason: string };

/**
 * Sends one mail through Resend. Never throws: a refusal answers its status and Resend's error
 * name, a network failure or the deadline answers status 0. The key goes in the header alone and
 * no answer repeats it.
 */
export async function sendAlert(
  channel: Extract<AlertChannel, { configured: true }>,
  mail: AlertMail,
  fetchFn: typeof fetch = fetch,
): Promise<AlertSent> {
  try {
    const response = await fetchFn(RESEND_EMAILS_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${channel.key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: channel.from,
        to: channel.to,
        subject: mail.subject.slice(0, 200),
        text: mail.text,
      }),
      signal: AbortSignal.timeout(ALERT_SEND_MS),
    });
    const body = (await response.json().catch(() => null)) as {
      id?: unknown;
      name?: unknown;
    } | null;
    if (!response.ok)
      return {
        ok: false,
        status: response.status,
        reason: typeof body?.name === 'string' ? body.name.slice(0, 80) : 'refused',
      };
    return { ok: true, id: typeof body?.id === 'string' ? body.id : null };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      reason: error instanceof Error ? error.name.slice(0, 80) : 'failed',
    };
  }
}
