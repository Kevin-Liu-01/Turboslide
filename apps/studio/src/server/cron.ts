// The one cron credential (hardening O#1a, docs/hardening/HARDENING.md 4.8; CRIT-M7). A Vercel
// cron sends a GET with `Authorization: Bearer <CRON_SECRET>` and nothing else (the project
// variable Kevin sets beside the others; this file never prints it). Every route a cron calls
// decides its caller here: the logo refresh (logos.ts `refreshCredential`), the nightly backup
// (`/api/cron/backup`) and the monthly restore drill (`/api/cron/restore-drill`, O#1b). The secret
// is compared in constant time through `safeEqual` (SA#1); a project without the secret refuses
// its own cron.
import { bearerToken } from '@turboslide/agent/http/auth';
import { refuse } from '@turboslide/agent/http/errors';
import { safeEqual } from '@turboslide/identity/safe-equal';

export const CRON_SECRET_ENV = 'CRON_SECRET';

/** True when the request carries the project's cron secret as its bearer. */
export function cronCredential(
  request: Request,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const given = bearerToken(request);
  const secret = env[CRON_SECRET_ENV];
  return given !== undefined && secret !== undefined && secret !== '' && safeEqual(given, secret);
}

/** The 401 of a cron route called without the secret, or with another value. */
export function cronRefusal(what: string): Response {
  return refuse(401, 'unauthorized', `${what} takes the cron secret`);
}
