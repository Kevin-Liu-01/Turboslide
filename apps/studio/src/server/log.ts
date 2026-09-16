import { createHmac, randomBytes } from 'node:crypto';

/**
 * The structured security log (gslides-parity SPEC-3 0.34, 8.11; report 04 8.11, report 10 6.1
 * to 6.3): one JSON line per security relevant event through `console.log`, so the runtime log
 * and a Drain both receive it. The line is `{ t, source, event, requestId, identity, ip, deckId,
 * action, revision, bytes, ms, status, reason }` plus the per surface fields of 10 6.1. Rules that
 * hold from the first line: an email address never enters a log, a token or a cookie value never
 * does, `process.env` is never printed, a link is named by its id and never its token, comment
 * bodies never appear, and the client address is written as an HMAC under a salt that rotates
 * daily and is discarded after 48 hours (`ipHash`), so the value is a same day correlation key and
 * nothing else once the salt is gone. The alert list and the retention table are data here so the
 * runbook (docs/security.md) and the verifier read one source. Server only: nothing under the
 * client bundle imports this module.
 */

/** The events of SPEC-3 8.11 and report 10 6.1, plus the authorization events of the shadow week (11.5 R3). */
export const SECURITY_EVENT_NAMES = [
  'authorize.deny',
  'authorize.error',
  'author.client',
  'write',
  'delete',
  'share.change',
  'share.link_create',
  'share.link_rotate',
  'share.link_revoke',
  'share.grant',
  'share.revoke',
  'share.key_rotate',
  'access.request',
  'access.grant',
  'access.deny',
  'signin.attempt',
  'signin.request',
  'signin.verify',
  'signin.fail',
  'export',
  'upload',
  'upload.token_issued',
  'upload.completed',
  'upload.rejected',
  'upload.swept',
  'avatar.upload',
  'avatar.reject',
  'http.401',
  'http.403',
  'http.429',
  'http.503',
  'csrf.refused',
  'origin.refused',
  'content_type.refused',
  'sanitizer.rewrite',
  'chromium.crash',
  'ssrf.refused',
  'stream.open',
  'stream.close',
  'stream.refused',
  'ops.admit',
  'ops.reject',
  'ops.budget',
  'presence.reject',
  'checkpoint.commit',
  'checkpoint.lock_wait',
  'checkpoint.stale_lock_broken',
  'redis.unavailable',
  'redis.budget',
  'comment.create',
  'comment.edit',
  'comment.delete',
  'comment.resolve',
  'chat.send',
  'chat.clear',
  'mention.email',
  'mention.suppressed',
  'notify.deliver',
  'notify.digest',
  'materialize.run',
  'name.rejected',
  'agent.presence',
  'flag.refused',
  'flag.changed',
  'retention.sweep',
  'csp.report',
  'config.missing',
  'config.degraded',
] as const;

export type SecurityEventName = (typeof SECURITY_EVENT_NAMES)[number];

export function isSecurityEventName(value: string): value is SecurityEventName {
  return (SECURITY_EVENT_NAMES as ReadonlyArray<string>).includes(value);
}

export type SecurityEvent = {
  event: SecurityEventName;
  requestId?: string;
  /** A principal id, `agent:<tokenId>` or a label; never an email. */
  identity?: string;
  /** The keyed hash of the client address (`ipHash`); never the address itself. */
  ip?: string;
  deckId?: string;
  action?: string;
  /** The capability an authorization decision was about (SPEC-3 6.2). */
  capability?: string;
  revision?: number;
  bytes?: number;
  ms?: number;
  status?: number;
  reason?: string;
  role?: string;
  via?: string;
  /** True when the event was logged and not enforced (TURBOSLIDE_AUTHORIZE=shadow). */
  shadow?: boolean;
  /** The transport the request arrived on. */
  transport?: 'window' | 'http' | 'mcp' | 'cli' | 'route';
  /** The per surface fields of report 10 6.1. */
  clientId?: string;
  seq?: number;
  opCount?: number;
  streamMs?: number;
  /** The share link's record id, never its token. */
  linkId?: string;
  threadId?: string;
  commentId?: string;
  mentionCount?: number;
  emailKind?: 'magic-link' | 'code' | 'mention' | 'invite' | 'request' | 'digest';
  /** A principal id, or the keyed hash of an address with no account. */
  recipient?: string;
  redisCmds?: number;
  blobOps?: number;
  uploadBytes?: number;
  sniffedType?: string;
  reencoded?: boolean;
  variantKey?: string;
  materialId?: string;
  /** The rule of SPEC-3 8.3 or the quota name a 429 fired on. */
  rule?: string;
  /** The kill switch that refused the request (SPEC-3 8.12). */
  killSwitch?: string;
  /** The retention class a sweep acted on (report 10 6.3). */
  retentionClass?: string;
  removed?: number;
};

export type SecurityLine = SecurityEvent & { t: string; source: 'turboslide' };

export type SecuritySink = (line: SecurityLine) => void;

const SINK = Symbol.for('turboslide.studio.securityLogSink');

function holder(): Record<symbol, SecuritySink | undefined> {
  return globalThis as unknown as Record<symbol, SecuritySink | undefined>;
}

/** The default sink: one JSON line on stdout, the shape a Drain parses. */
export const consoleSink: SecuritySink = (line) => {
  console.log(JSON.stringify(line));
};

/** Replaces the sink for the process; returns the previous one so a test can restore it. */
export function setSecurityLogSink(sink: SecuritySink | undefined): SecuritySink | undefined {
  const previous = holder()[SINK];
  holder()[SINK] = sink;
  return previous;
}

/** A field value that must never carry an address or a secret. */
function scrub(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  // an address is replaced by a marker, so a mistaken caller is visible in the log and harmless
  if (value.includes('@') && !value.startsWith('agent:')) return '[redacted]';
  return value;
}

/** Looks like a raw address (v4 or v6): the field wants `ipHash`, never the address. */
function looksLikeAddress(value: string): boolean {
  // the hashed form (`<yyyymmdd>:<16 hex>`) is left as it is
  if (/^\d{8}:[0-9a-f]{16}$/.test(value)) return false;
  return (
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value) || /^[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}$/i.test(value)
  );
}

/** Writes one line. Never throws: a logging failure must not fail the request it describes. */
export function logSecurityEvent(event: SecurityEvent, now: Date = new Date()): SecurityLine {
  const line: SecurityLine = {
    ...event,
    t: now.toISOString(),
    source: 'turboslide',
  };
  const identity = scrub(event.identity);
  if (identity !== undefined) line.identity = identity;
  const reason = scrub(event.reason);
  if (reason !== undefined) line.reason = reason;
  const recipient = scrub(event.recipient);
  if (recipient !== undefined) line.recipient = recipient;
  if (event.ip !== undefined && looksLikeAddress(event.ip)) line.ip = ipHash(event.ip, now);
  try {
    (holder()[SINK] ?? consoleSink)(line);
  } catch {
    // the sink is a Drain or the console; a failure there is not the request's failure
  }
  return line;
}

// ---------------------------------------------------------------------------------------------
// The client address as a keyed hash (SPEC-3 0.34, 8.11; report 10 6.2): HMAC-SHA256 under a
// salt that rotates daily and is discarded after 48 hours. While the salt exists the hash is
// pseudonymous data (linkable within the day, reversible only by whoever holds the salt and the
// address); once the salt is gone the value cannot be attributed to anyone.

/** How long a day's salt is kept after its day: 48 hours in total (report 10 6.3). */
export const IP_SALT_RETENTION_MS = 48 * 60 * 60 * 1000;

type SaltState = { salts: Map<string, Buffer> };

const SALTS = Symbol.for('turboslide.studio.ipSalts');

function saltState(): SaltState {
  const store = globalThis as unknown as Record<symbol, SaltState | undefined>;
  return (store[SALTS] ??= { salts: new Map() });
}

/** The UTC day of a time, the key a salt lives under. */
export function saltDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The salt of a day, minted on first use per instance. Instances do not share a salt, so two
 * instances hash one address differently on one day; the log is a per instance correlation key,
 * which is what the alerts of 8.11 need. Salts older than 48 hours are dropped on every call.
 */
export function ipSalt(now: Date = new Date()): Buffer {
  const state = saltState();
  const day = saltDay(now);
  for (const key of state.salts.keys()) {
    if (Date.parse(`${key}T00:00:00Z`) + IP_SALT_RETENTION_MS < now.getTime())
      state.salts.delete(key);
  }
  let salt = state.salts.get(day);
  if (salt === undefined) {
    salt = randomBytes(32);
    state.salts.set(day, salt);
  }
  return salt;
}

/** The keyed hash of a client address for the log: 16 hex characters, prefixed with the day. */
export function ipHash(address: string, now: Date = new Date()): string {
  const digest = createHmac('sha256', ipSalt(now)).update(address).digest('hex').slice(0, 16);
  return `${saltDay(now).replace(/-/g, '')}:${digest}`;
}

/** Drops every salt (a test, or Forget everything). */
export function resetIpSalts(): void {
  saltState().salts.clear();
}

// ---------------------------------------------------------------------------------------------
// The alerts of SPEC-3 8.11 and report 10 6.1 as data, for docs/security.md and the Drain's rules.

export type AlertRule = {
  id: string;
  /** The event or events the rule counts. */
  events: readonly SecurityEventName[];
  /** The condition in words, for the runbook; the Drain's query language is the operator's. */
  condition: string;
  /** How urgently a person looks: `page` wakes someone, `notify` waits for the morning. */
  severity: 'page' | 'notify';
};

export const ALERTS: readonly AlertRule[] = [
  {
    id: 'rate-429',
    events: ['http.429'],
    condition: 'more than 100 in 5 minutes on one route',
    severity: 'notify',
  },
  {
    id: 'rate-403',
    events: ['http.403', 'authorize.deny'],
    condition: 'more than 50 refusals in 5 minutes on one deck, or 500 across the deployment',
    severity: 'notify',
  },
  {
    id: 'exports-hour',
    events: ['export'],
    condition: 'more than 200 exports in an hour',
    severity: 'notify',
  },
  {
    id: 'sanitizer-shared',
    events: ['sanitizer.rewrite'],
    condition: 'any rewrite on a deck shared beyond its owner',
    severity: 'page',
  },
  {
    id: 'chromium-crash',
    events: ['chromium.crash'],
    condition: 'any',
    severity: 'page',
  },
  {
    id: 'ssrf',
    events: ['ssrf.refused'],
    condition: 'any',
    severity: 'page',
  },
  {
    id: 'redis-unavailable',
    events: ['redis.unavailable'],
    condition: 'any',
    severity: 'page',
  },
  {
    id: 'redis-budget',
    events: ['redis.budget'],
    condition:
      'any identity above the soft budget of SPEC-3 8.3 (500,000 commands per day anonymous)',
    severity: 'notify',
  },
  {
    id: 'stream-opens',
    events: ['stream.open'],
    condition: 'more than 300 opens in a minute across the deployment',
    severity: 'notify',
  },
  {
    id: 'ops-reject-ratio',
    events: ['ops.reject', 'ops.admit'],
    condition: 'ops.reject above 5 percent of ops.admit on one deck over 5 minutes',
    severity: 'notify',
  },
  {
    id: 'mail-plan',
    events: ['mention.email', 'notify.deliver', 'notify.digest'],
    condition: 'above 60 percent of the Resend plan for the day',
    severity: 'notify',
  },
  {
    id: 'confusable-names',
    events: ['name.rejected'],
    condition: 'more than 10 rejections with reason confusable in an hour',
    severity: 'notify',
  },
  {
    id: 'key-rotate-failed',
    events: ['share.key_rotate'],
    condition: 'any with status 500',
    severity: 'page',
  },
  {
    id: 'upload-sniff-shared',
    events: ['upload.rejected'],
    condition: 'a sniff mismatch on a deck shared beyond its owner',
    severity: 'notify',
  },
  {
    id: 'config-missing',
    events: ['config.missing'],
    condition: 'any',
    severity: 'page',
  },
  {
    id: 'config-degraded',
    events: ['config.degraded'],
    condition:
      'the first line after a deploy; one line per instance start is the instance count, not an incident',
    severity: 'notify',
  },
];

// ---------------------------------------------------------------------------------------------
// Retention per class (SPEC-3 8.11; report 10 6.3) as data. The mechanisms live where the class
// lives: Redis TTLs in packages/realtime, the store's prune, the daily sweeps of root.ts and
// upload.ts, the Drain's own store. `retentionSweep` in upload.ts runs the sweeps this app owns.

export type RetentionClass = {
  id: string;
  retention: string;
  mechanism: string;
  /** The owner of the mechanism in the tree, for the runbook. */
  where: string;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** The numbers of report 10 6.3 the sweeps of this app read. */
export const RETENTION_MS = {
  uploads: DAY,
  exports: 7 * DAY,
  bundles: 7 * DAY,
  log: 30 * DAY,
  ipSalt: IP_SALT_RETENTION_MS,
  presence: 120_000,
  counters: HOUR,
  codes: 10 * 60_000,
} as const;

export const RETENTION: readonly RetentionClass[] = [
  {
    id: 'ops-stream',
    retention: '10,000 entries or 24 h, whichever is larger; 16 MB per deck',
    mechanism: 'XTRIM after each checkpoint',
    where: 'packages/realtime, apps/studio/src/server/checkpoint.ts',
  },
  { id: 'presence', retention: '120 s', mechanism: 'EXPIRE', where: 'packages/realtime' },
  {
    id: 'client-bindings',
    retention: '320 s bindings and stream counters, 2 s locks',
    mechanism: 'EXPIRE, PX',
    where: 'packages/realtime',
  },
  {
    id: 'rate-counters',
    retention: 'the window, at most 1 h',
    mechanism: 'the limiter TTL',
    where: 'apps/studio/src/server/ratelimit.ts',
  },
  {
    id: 'sessions',
    retention: '7 days idle for sign in sessions; the anonymous cookie Max-Age',
    mechanism: 'the session store',
    where: 'apps/studio/src/server/auth',
  },
  {
    id: 'codes',
    retention: '10 min codes and magic link tokens, 5 min verification rows',
    mechanism: 'TTL',
    where: 'apps/studio/src/server/auth',
  },
  {
    id: 'versions',
    retention: '30 days full, then named versions and one per day',
    mechanism: 'a scheduled thinning job under the checkpoint lock',
    where: 'packages/store',
  },
  {
    id: 'snapshots',
    retention: 'newest 50 records plus named versions',
    mechanism: 'the existing prune',
    where: 'packages/store',
  },
  {
    id: 'comments',
    retention: 'the life of the deck; a deleted comment keeps a tombstone and no body',
    mechanism: 'the thread document',
    where: 'packages/store/src/comments-store.ts',
  },
  {
    id: 'notifications',
    retention: '500 unread and 5,000 total per person, thinned to one per thread beyond 90 days',
    mechanism: 'the inbox appender',
    where: 'packages/store/src/inbox.ts',
  },
  {
    id: 'access-requests',
    retention: '30 days pending, then expired with one notice',
    mechanism: 'the access record',
    where: 'packages/store/src/access-store.ts',
  },
  {
    id: 'share-links',
    retention: 'until revoked, or the optional expiry',
    mechanism: 'the access record',
    where: 'packages/store/src/access-store.ts',
  },
  {
    id: 'uploads',
    retention: 'deleted on processing; swept after 24 h',
    mechanism: 'the daily sweep',
    where: 'apps/studio/src/server/upload.ts',
  },
  {
    id: 'exports-bundles',
    retention: '7 days',
    mechanism: 'the daily sweep',
    where: 'apps/studio/src/server/upload.ts, export-batch.ts (pruneOldJobs)',
  },
  {
    id: 'derived',
    retention:
      'twins, variants and frames the life of the deck; superseded files deleted after the record commits; thumbnails of revisions older than the newest kept revision deleted by the sweep',
    mechanism: 'del after commit, the sweep of root.ts',
    where: 'apps/studio/src/server/root.ts',
  },
  {
    id: 'avatars',
    retention: 'until replaced or the account is deleted',
    mechanism: 'del of the prefix',
    where: 'apps/studio/src/server/auth',
  },
  { id: 'log', retention: '30 days', mechanism: "the Drain's store", where: 'the Drain' },
  {
    id: 'ip-salt',
    retention: '48 h',
    mechanism: 'rotation (ipSalt)',
    where: 'apps/studio/src/server/log.ts',
  },
];

/**
 * A chat message admitted to a deck's room (gslides-parity SPEC-5 10, 0.46): logged as a comment
 * write is, with the principal, the deck, the text's length and the mention count, never the
 * text. `chat.clear` logs the count removed under `opCount`.
 */
export function logChatMessage(input: {
  identity?: string;
  deckId: string;
  length: number;
  mentions: number;
  transport?: SecurityEvent['transport'];
  requestId?: string;
}): SecurityLine {
  return logSecurityEvent({
    event: 'chat.send',
    ...(input.identity === undefined ? {} : { identity: input.identity }),
    deckId: input.deckId,
    action: 'chat.send',
    bytes: input.length,
    mentionCount: input.mentions,
    ...(input.transport === undefined ? {} : { transport: input.transport }),
    ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
  });
}
