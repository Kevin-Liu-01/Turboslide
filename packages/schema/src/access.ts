// The access record (gslides-parity SPEC-3 6.1, 6.2, 0.11, 0.12, 0.14; research-3 09 1.1, 2.1):
// one `access.json` per deck beside the document, owner, editor, commenter and viewer on one
// record, share links hashed at rest, the published token, grants by principal or email, the
// pending requests and the owner's switches. Not document data: nothing of it enters deck.json or
// a bundle. `decide()` (the pure matrix over a record and an auth context) is the identity
// package's; this module holds the types, the schemas, the synthesized legacy record and the
// capability table it reads.
import { z } from 'zod';
import { slugSchema } from './ids.ts';
import { principalIdSchema } from './comments.ts';

// ---------------------------------------------------------------------------------------------
// Roles, capabilities, scopes

/** The four roles, weakest first. */
export const ROLES = ['viewer', 'commenter', 'editor', 'owner'] as const;
export type Role = (typeof ROLES)[number];
export const roleSchema = z.enum(ROLES);

/** The roles a grant or a link may carry; the owner is the record's `owner` field. */
export const GRANT_ROLES = ['viewer', 'commenter', 'editor'] as const;
export type GrantRole = (typeof GRANT_ROLES)[number];
export const grantRoleSchema = z.enum(GRANT_ROLES);

/** The capabilities `authorize()` checks (SPEC-3 6.2). */
export const CAPABILITIES = [
  'read',
  'readSkipped',
  'readNotes',
  'readComments',
  'comment',
  'write',
  'history',
  'export',
  'exportNotes',
  'share',
  'settings',
  'rename',
  'copy',
  'trash',
  'restore',
  'remove',
  'publish',
  'transfer',
  'presence',
  'follow',
] as const;
export type Capability = (typeof CAPABILITIES)[number];
export const capabilitySchema = z.enum(CAPABILITIES);

/** The scopes of an agent API key (SPEC-3 0.23); a token's rights are its owner's role intersected with them. */
export const SCOPES = ['read', 'comment', 'write', 'export', 'share', 'admin'] as const;
export type Scope = (typeof SCOPES)[number];
export const scopeSchema = z.enum(SCOPES);

/** How a decision was reached. */
export const VIAS = ['owner', 'grant', 'link', 'open', 'publish', 'admin', 'agent'] as const;
export type Via = (typeof VIAS)[number];
export const viaSchema = z.enum(VIAS);

/**
 * The answer of `decide()` and `authorize()` (SPEC-3 6.2, 6.4): the 403 names the capability the
 * body carries (`{ error: 'forbidden', capability }`), the 410 is a revoked publish token
 * ("This presentation is no longer published"). The identity package's `decide()` answers this
 * shape (b3.md decision 10; integrator.md B3 R4).
 */
export type Decision =
  | { ok: true; role: Role; via: Via }
  | { ok: false; status: 401; code: 'unauthorized' }
  | { ok: false; status: 403; code: 'forbidden'; capability?: Capability }
  | { ok: false; status: 404; code: 'not_found' }
  | { ok: false; status: 410; code: 'gone' };

export const decisionSchema = z.union([
  z.strictObject({ ok: z.literal(true), role: roleSchema, via: viaSchema }),
  z.strictObject({ ok: z.literal(false), status: z.literal(401), code: z.literal('unauthorized') }),
  z.strictObject({
    ok: z.literal(false),
    status: z.literal(403),
    code: z.literal('forbidden'),
    capability: capabilitySchema.optional(),
  }),
  z.strictObject({ ok: z.literal(false), status: z.literal(404), code: z.literal('not_found') }),
  z.strictObject({ ok: z.literal(false), status: z.literal(410), code: z.literal('gone') }),
]) satisfies z.ZodType<Decision>;

// ---------------------------------------------------------------------------------------------
// The record

export const ACCESS_MODES = ['restricted', 'link', 'open'] as const;
export type AccessMode = (typeof ACCESS_MODES)[number];

export type GeneralAccess = { mode: AccessMode; role: GrantRole };

/** A share link: the hash of its token, never the token (SPEC-3 0.15). */
export type ShareLink = {
  id: string;
  /** `sha256:<hex>` of the 22 base64url character token. */
  hash: string;
  role: GrantRole;
  createdAt: string;
  createdBy: string;
  revokedAt: string | null;
  expiresAt: string | null;
  label?: string;
  useCount?: number;
};

/** The published player's token (SPEC-3 6.4); null when unpublished. */
export type Publish = {
  hash: string;
  publishedAt: string;
  publishedBy: string;
  revokedAt: string | null;
};

/** A grant names a principal or an email, never both live at once (09 1.1). */
export type Grant = {
  principalId: string | null;
  email: string | null;
  role: GrantRole;
  invitedBy: string;
  invitedAt: string;
  acceptedAt: string | null;
  expiresAt: string | null;
  /** The inviter's message, kept until acceptance for the resend path. */
  message?: string;
};

export type AccessRequest = {
  id: string;
  principalId: string | null;
  email: string | null;
  role: GrantRole;
  message?: string;
  askedAt: string;
  respondedAt: string | null;
};

export type PendingOwner = {
  principalId: string | null;
  email: string | null;
  askedAt: string;
  askedBy: string;
};

/** The gear's five switches (SPEC-3 6.5, 0.11, 0.12). */
export type AccessSettings = {
  editorsCanShare: boolean;
  viewersCanDownload: boolean;
  viewersCanSeeComments: boolean;
  showNamesToLinkVisitors: boolean;
  allowHtmlBlocks: boolean;
};

export type AccessRecord = {
  schemaVersion: 1;
  deckId: string;
  /** A principal id, or null for an unowned deck (09 1.4). */
  owner: string | null;
  pendingOwner: PendingOwner | null;
  createdAt: string;
  createdBy: string;
  /** The 22 base64url character segment under `d/<id>/<assetKey>/` on the public store (10 5.2). */
  assetKey: string;
  generalAccess: GeneralAccess;
  links: ShareLink[];
  publish: Publish | null;
  grants: Grant[];
  requests: AccessRequest[];
  settings: AccessSettings;
  /** Counts writes to the record, for `baseRevision` and the 409 shape. */
  revision: number;
};

export const DEFAULT_ACCESS_SETTINGS: Readonly<AccessSettings> = {
  editorsCanShare: true,
  viewersCanDownload: true,
  viewersCanSeeComments: false,
  showNamesToLinkVisitors: false,
  allowHtmlBlocks: false,
};

/** A share token: 22 base64url characters, 132 bits (SPEC-3 0.15). */
export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;
/** The stored form of a token. */
export const TOKEN_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

const isoTime = z.string();
const hash = z.string().regex(TOKEN_HASH_PATTERN, 'sha256:<hex>');
const recordId = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9_-]{6,64}$`), `${prefix}_<id>`);

export const generalAccessSchema = z.strictObject({
  mode: z.enum(ACCESS_MODES),
  role: grantRoleSchema,
}) satisfies z.ZodType<GeneralAccess>;

export const shareLinkSchema = z.strictObject({
  id: recordId('lnk'),
  hash,
  role: grantRoleSchema,
  createdAt: isoTime,
  createdBy: principalIdSchema,
  revokedAt: isoTime.nullable(),
  expiresAt: isoTime.nullable(),
  label: z.string().max(120).optional(),
  useCount: z.number().int().nonnegative().optional(),
}) satisfies z.ZodType<ShareLink>;

export const publishSchema = z.strictObject({
  hash,
  publishedAt: isoTime,
  publishedBy: principalIdSchema,
  revokedAt: isoTime.nullable(),
}) satisfies z.ZodType<Publish>;

export const grantSchema = z
  .strictObject({
    principalId: principalIdSchema.nullable(),
    email: z.email().nullable(),
    role: grantRoleSchema,
    invitedBy: principalIdSchema,
    invitedAt: isoTime,
    acceptedAt: isoTime.nullable(),
    expiresAt: isoTime.nullable(),
    message: z.string().max(600).optional(),
  })
  .refine(
    (grant) => (grant.principalId === null) !== (grant.email === null),
    'a grant names a principal or an email, never both and never neither',
  ) satisfies z.ZodType<Grant>;

export const accessRequestSchema = z.strictObject({
  id: recordId('req'),
  principalId: principalIdSchema.nullable(),
  email: z.email().nullable(),
  role: grantRoleSchema,
  message: z.string().max(600).optional(),
  askedAt: isoTime,
  respondedAt: isoTime.nullable(),
}) satisfies z.ZodType<AccessRequest>;

export const pendingOwnerSchema = z.strictObject({
  principalId: principalIdSchema.nullable(),
  email: z.email().nullable(),
  askedAt: isoTime,
  askedBy: principalIdSchema,
}) satisfies z.ZodType<PendingOwner>;

export const accessSettingsSchema = z.strictObject({
  editorsCanShare: z.boolean(),
  viewersCanDownload: z.boolean(),
  viewersCanSeeComments: z.boolean(),
  showNamesToLinkVisitors: z.boolean(),
  allowHtmlBlocks: z.boolean(),
}) satisfies z.ZodType<AccessSettings>;

export const accessRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  deckId: slugSchema,
  owner: principalIdSchema.nullable(),
  pendingOwner: pendingOwnerSchema.nullable(),
  createdAt: isoTime,
  createdBy: z.string().min(1),
  assetKey: z.string().regex(SHARE_TOKEN_PATTERN, '22 base64url characters'),
  generalAccess: generalAccessSchema,
  links: z.array(shareLinkSchema),
  publish: publishSchema.nullable(),
  grants: z.array(grantSchema),
  requests: z.array(accessRequestSchema),
  settings: accessSettingsSchema,
  revision: z.number().int().nonnegative(),
}) satisfies z.ZodType<AccessRecord>;

/** Who a share action names: a principal or an email. */
export type GrantWho = { principalId: string } | { email: string };
export const grantWhoSchema = z.union([
  z.strictObject({ principalId: principalIdSchema }),
  z.strictObject({ email: z.email() }),
]) satisfies z.ZodType<GrantWho>;

/**
 * The record a deck with no `access.json` gets in memory (SPEC-3 6.1, 0.14): unowned, open to
 * editing by address, today's behaviour, until someone claims it; `createdBy` names the synthesis.
 */
export function synthesizeLegacyRecord(deckId: string, now: string): AccessRecord {
  return {
    schemaVersion: 1,
    deckId,
    owner: null,
    pendingOwner: null,
    createdAt: now,
    createdBy: 'legacy',
    assetKey: legacyAssetKey(deckId),
    generalAccess: { mode: 'open', role: 'editor' },
    links: [],
    publish: null,
    grants: [],
    requests: [],
    settings: { ...DEFAULT_ACCESS_SETTINGS },
    revision: 0,
  };
}

/**
 * The public store segment of a deck written before the migration: the layout v2 migration gives
 * every deck a random key; until then the synthesized record's key is derived from the id so two
 * instances agree without a write. 22 base64url characters from the id's characters padded.
 */
export function legacyAssetKey(deckId: string): string {
  const base = deckId.replace(/[^A-Za-z0-9_-]/g, '-');
  return `${base}${'0'.repeat(22)}`.slice(0, 22);
}

/** The record of a new deck (SPEC-3 6.1): restricted to its creator. */
export function newDeckRecord(
  deckId: string,
  owner: string,
  assetKey: string,
  now: string,
): AccessRecord {
  return {
    schemaVersion: 1,
    deckId,
    owner,
    pendingOwner: null,
    createdAt: now,
    createdBy: owner,
    assetKey,
    generalAccess: { mode: 'restricted', role: 'viewer' },
    links: [],
    publish: null,
    grants: [],
    requests: [],
    settings: { ...DEFAULT_ACCESS_SETTINGS },
    revision: 0,
  };
}

// ---------------------------------------------------------------------------------------------
// The capability table (SPEC-3 6.2; 09 2.1), the data `decide()` reads

/**
 * The capabilities a role holds on a record with the given settings. The owner holds every one;
 * an editor writes, comments, reads comments, shares when `editorsCanShare`, reads history,
 * exports with notes, renames, trashes, restores, publishes; a commenter reads, comments, reads
 * comments, sees skipped slides, exports without notes when download is on; a viewer reads and
 * exports without notes when download is on and reads comments only under the switch. Follow is
 * on editors and owners only; Delete forever and transfer are the owner's. A link visitor holds
 * its link's role; an agent its owner's role intersected with its scopes (`scopedCapabilities`).
 */
export function capabilitiesForRole(role: Role, settings: AccessSettings): Set<Capability> {
  const out = new Set<Capability>(['read', 'presence']);
  if (role === 'viewer') {
    if (settings.viewersCanDownload) {
      out.add('export');
      out.add('copy');
    }
    if (settings.viewersCanSeeComments) out.add('readComments');
    return out;
  }
  out.add('readSkipped');
  out.add('comment');
  out.add('readComments');
  if (role === 'commenter') {
    if (settings.viewersCanDownload) {
      out.add('export');
      out.add('copy');
    }
    return out;
  }
  for (const capability of [
    'readNotes',
    'write',
    'history',
    'export',
    'exportNotes',
    'rename',
    'copy',
    'trash',
    'restore',
    'publish',
    'follow',
  ] as const) {
    out.add(capability);
  }
  if (role === 'editor') {
    if (settings.editorsCanShare) out.add('share');
    return out;
  }
  out.add('share');
  out.add('settings');
  out.add('remove');
  out.add('transfer');
  return out;
}

/** The capabilities an agent token's scopes allow, before the intersection with its owner's role (09 2.1). */
export const SCOPE_CAPABILITIES: Readonly<Record<Scope, ReadonlyArray<Capability>>> = {
  read: ['read', 'readSkipped', 'readNotes', 'readComments', 'history', 'presence'],
  comment: ['comment', 'readComments'],
  write: ['write', 'rename', 'trash', 'restore'],
  export: ['export', 'exportNotes', 'copy'],
  share: ['share', 'publish'],
  admin: ['settings', 'remove'],
};

/** An owner's capabilities cut to a token's scopes; transfer and follow never travel on a token. */
export function scopedCapabilities(
  ownerCapabilities: ReadonlySet<Capability>,
  scopes: ReadonlyArray<Scope>,
): Set<Capability> {
  const allowed = new Set<Capability>();
  for (const scope of scopes)
    for (const capability of SCOPE_CAPABILITIES[scope]) allowed.add(capability);
  const out = new Set<Capability>();
  for (const capability of ownerCapabilities) if (allowed.has(capability)) out.add(capability);
  return out;
}

/** The higher of two roles. */
export function maxRole(a: Role, b: Role): Role {
  return ROLES.indexOf(a) >= ROLES.indexOf(b) ? a : b;
}

/** True when a link is live now. */
export function linkIsLive(link: ShareLink, now: string): boolean {
  if (link.revokedAt !== null) return false;
  if (link.expiresAt !== null && link.expiresAt <= now) return false;
  return true;
}

/** True when a grant is live now. */
export function grantIsLive(grant: Grant, now: string): boolean {
  return grant.expiresAt === null || grant.expiresAt > now;
}

/**
 * The answer `share.requestAccess` always gives (SPEC-3 12, 6.8 rule: a refusal never says
 * whether another deck or account exists).
 */
export const REQUEST_ACCESS_ANSWER = 'If this presentation exists, its owner has been asked.';

/** The kill switches of SPEC-3 8.12 and their default when Redis is unreachable. */
export const FLAG_NAMES = [
  'realtime',
  'presence',
  'comments',
  'invites',
  'email',
  'exports',
  'uploads',
  'renderThumbs',
  'materialize',
  'htmlBlocks',
  'signup',
  'readOnly',
  /* the product round (docs/PRODUCT.md 6.3, 6.4): the assistant's kill switch */
  'assist',
] as const;
export type FlagName = (typeof FLAG_NAMES)[number];
export const flagNameSchema = z.enum(FLAG_NAMES);

/** The value a flag reads when Redis is unreachable (8.12): realtime off, every other on. */
export const FLAG_DEFAULTS: Readonly<Record<FlagName, boolean>> = {
  realtime: false,
  presence: true,
  comments: true,
  invites: true,
  email: true,
  exports: true,
  uploads: true,
  renderThumbs: true,
  materialize: true,
  htmlBlocks: true,
  signup: true,
  readOnly: true,
  assist: true,
};
