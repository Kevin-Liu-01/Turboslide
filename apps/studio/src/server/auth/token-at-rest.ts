// Session tokens at rest (CRIT-M5; docs/hardening/HARDENING.md HR-K2#5; docs/security.md section
// 12). The `session` table keeps `h1:` and the SHA-256 hex of each session token, never the token
// itself: the cookie (signed by better-auth) carries the token and the row carries its digest, so a
// read of the table through the database bearer, or an export of it, yields no token.
//
// The rewrite sits where every accounts statement passes on its way to a database: the D1 proxy
// client (d1-proxy-dialect.ts, which serves both better-auth's D1 facade and the app's Kysely
// dialect) and the local SQLite connection (sqlite-dialect.ts). Both compile with Kysely's SQLite
// compiler, so one reading of the text serves both. In a statement on `"session"`, every parameter
// bound to the `"token"` column is replaced by its digest: an insert's value for the column, a set
// item `"token" = ?`, a comparison `"token" = ?` and each item of `"token" in (?, ...)`. A value
// that already is a digest is passed as it is. The rows the statement answers carry the token back
// in place of its digest, so better-auth's cookie, its cookie cache and its refresh hold the token.
// A row read by another column (the sessions of a user) keeps its digest; better-auth's
// revoke-session passes that value back unchanged (`session.mjs` 405 to 407), and it is never
// digested a second time. Its revoke-other-sessions compares such a digest with the cookie's token
// (`session.mjs` 476) and would end the caller's own session too, so that route is off
// (better-auth.ts `disabledPaths`) and Sign out everywhere else ends the other sessions by id
// (actions.ts). A statement that compares the token column in any other way is refused with a
// TypeError, so a new library statement cannot compare a token against digests unnoticed.
//
// Sessions written before this rewrite hold a plain token. No cookie reaches them any more (each
// lookup digests the cookie's token), so every person signs in once after the deploy (HARDENING.md
// question 29), and the session table answers those rows to nobody: a read of the table drops a
// row whose token is not a digest, so the sessions list shows live sessions alone. They leave with
// their user's sign out everywhere or deletion, or with the one time delete of docs/security.md
// section 12.
import { sha256Hex } from '@turboslide/identity/sha256';

/** The prefix of a stored session token: version 1, SHA-256 hex. */
export const SEALED_TOKEN_PREFIX = 'h1:';
const SEALED = /^h1:[0-9a-f]{64}$/;

/** True for the stored form of a session token (`h1:` and 64 hex characters). */
export function isSealedToken(value: unknown): value is string {
  return typeof value === 'string' && SEALED.test(value);
}

/** The stored form of a session token; a value already in that form is returned unchanged. */
export function sealToken(token: string): string {
  return isSealedToken(token) ? token : `${SEALED_TOKEN_PREFIX}${sha256Hex(token)}`;
}

type Lexeme =
  | { kind: 'ident'; name: string }
  | { kind: 'param'; index: number }
  | { kind: 'word'; text: string }
  | { kind: 'punct'; text: string };

const OPERATORS = ['<>', '!=', '<=', '>=', '==', '||'];

/** The statement's lexemes: quoted names, `?` parameters with their order, words and punctuation. */
function lex(sql: string): Lexeme[] {
  const out: Lexeme[] = [];
  let params = 0;
  let i = 0;
  while (i < sql.length) {
    const c = sql[i]!;
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === '"' || c === '`' || c === "'") {
      let j = i + 1;
      let text = '';
      while (j < sql.length) {
        if (sql[j] === c) {
          if (sql[j + 1] === c) {
            text += c;
            j += 2;
            continue;
          }
          break;
        }
        text += sql[j];
        j += 1;
      }
      out.push(c === "'" ? { kind: 'word', text: `'${text}'` } : { kind: 'ident', name: text });
      i = j + 1;
      continue;
    }
    if (c === '?') {
      out.push({ kind: 'param', index: params });
      params += 1;
      i += 1;
      continue;
    }
    const pair = sql.slice(i, i + 2);
    if (OPERATORS.includes(pair)) {
      out.push({ kind: 'punct', text: pair });
      i += 2;
      continue;
    }
    if (/[A-Za-z0-9_$]/.test(c)) {
      let j = i;
      while (j < sql.length && /[A-Za-z0-9_$]/.test(sql[j]!)) j += 1;
      out.push({ kind: 'word', text: sql.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    out.push({ kind: 'punct', text: c });
    i += 1;
  }
  return out;
}

const TABLE = 'session';
const COLUMN = 'token';

const isIdent = (l: Lexeme | undefined, name: string): boolean =>
  l?.kind === 'ident' && l.name === name;
const isWord = (l: Lexeme | undefined, text: string): boolean =>
  l?.kind === 'word' && l.text === text;
const isPunct = (l: Lexeme | undefined, text: string): boolean =>
  l?.kind === 'punct' && l.text === text;

/** True when the statement reads or writes the session table. */
function onSessionTable(lexemes: Lexeme[]): boolean {
  for (let i = 1; i < lexemes.length; i += 1)
    if (
      isIdent(lexemes[i], TABLE) &&
      (isWord(lexemes[i - 1], 'into') ||
        isWord(lexemes[i - 1], 'update') ||
        isWord(lexemes[i - 1], 'from') ||
        isWord(lexemes[i - 1], 'join'))
    )
      return true;
  return false;
}

/** The parameter orders an insert into the session table binds to the token column. */
function insertTokenParams(lexemes: Lexeme[]): number[] {
  if (!isWord(lexemes[0], 'insert')) return [];
  const table = lexemes.findIndex((l) => isIdent(l, TABLE));
  if (table < 0 || !isPunct(lexemes[table + 1], '(')) return [];
  const columns: string[] = [];
  let i = table + 2;
  for (; i < lexemes.length && !isPunct(lexemes[i], ')'); i += 1) {
    const l = lexemes[i]!;
    if (l.kind === 'ident') columns.push(l.name);
  }
  const column = columns.indexOf(COLUMN);
  if (column < 0 || !isWord(lexemes[i + 1], 'values')) return [];
  const found: number[] = [];
  i += 2;
  // each tuple of the values list: the item at the token column's place
  while (isPunct(lexemes[i], '(')) {
    let item = 0;
    let depth = 0;
    let j = i + 1;
    for (; j < lexemes.length; j += 1) {
      const l = lexemes[j]!;
      if (isPunct(l, '(')) depth += 1;
      else if (isPunct(l, ')')) {
        if (depth === 0) break;
        depth -= 1;
      } else if (depth === 0 && isPunct(l, ',')) item += 1;
      else if (depth === 0 && item === column && l.kind === 'param') found.push(l.index);
    }
    i = j + 1;
    if (!isPunct(lexemes[i], ',')) break;
    i += 1;
  }
  return found;
}

const REFUSED_COMPARISONS = new Set(['<>', '!=', '<', '>', '<=', '>=', '==']);
const REFUSED_WORDS = new Set(['like', 'glob', 'not', 'is', 'between', 'match', 'regexp']);

/** The parameter orders a `"token" = ?`, a `"token" in (?, ...)` or a set item binds. */
function comparedTokenParams(lexemes: Lexeme[], sql: string): number[] {
  const found: number[] = [];
  for (let i = 0; i < lexemes.length; i += 1) {
    if (!isIdent(lexemes[i], COLUMN)) continue;
    // a qualified name of another table is not the session's column
    if (isPunct(lexemes[i - 1], '.') && !isIdent(lexemes[i - 2], TABLE)) continue;
    const next = lexemes[i + 1];
    if (isPunct(next, '=')) {
      const value = lexemes[i + 2];
      if (value?.kind === 'param') found.push(value.index);
      continue;
    }
    if (isWord(next, 'in') && isPunct(lexemes[i + 2], '(')) {
      for (let j = i + 3; j < lexemes.length && !isPunct(lexemes[j], ')'); j += 1) {
        const l = lexemes[j]!;
        if (l.kind === 'param') found.push(l.index);
      }
      continue;
    }
    if (
      (next?.kind === 'punct' && REFUSED_COMPARISONS.has(next.text)) ||
      (next?.kind === 'word' && REFUSED_WORDS.has(next.text))
    )
      throw new TypeError(
        `a statement on the session table compares its token column in a form the token rewrite does not know (token-at-rest.ts): ${sql.slice(0, 120)}`,
      );
  }
  return found;
}

/** A statement's parameters with every session token sealed, and what its rows need on the way back. */
export type SealedStatement<P> = {
  params: (P | string)[];
  /** The statement reads or writes the session table, so its rows are opened (`openSessionRows`). */
  session: boolean;
  /** The digest each plain token of the statement was replaced by, mapped back to the token. */
  opened: ReadonlyMap<string, string>;
};

const NOTHING: ReadonlyMap<string, string> = new Map();

/**
 * The parameters of one statement with the session tokens it binds sealed (the header's rule).
 * A statement that does not name the session table comes back with the same array.
 */
export function sealSessionStatement<P>(sql: string, params: readonly P[]): SealedStatement<P> {
  const unchanged = { params: params as P[], session: false, opened: NOTHING };
  if (!sql.includes(`"${TABLE}"`)) return unchanged;
  const lexemes = lex(sql);
  if (!onSessionTable(lexemes)) return unchanged;
  const indexes = new Set([...insertTokenParams(lexemes), ...comparedTokenParams(lexemes, sql)]);
  const opened = new Map<string, string>();
  const next: (P | string)[] = [...params];
  for (const index of indexes) {
    const value = params[index];
    if (typeof value !== 'string') continue;
    const sealed = sealToken(value);
    next[index] = sealed;
    if (sealed !== value) opened.set(sealed, value);
  }
  return { params: next, session: true, opened };
}

/**
 * The rows of a statement on the session table as the caller reads them: a row whose token is not
 * a digest (a session from before the rewrite, which no cookie reaches) is dropped, and each digest
 * the statement sealed is put back as the token the caller sent. Other statements' rows pass.
 */
export function openSessionRows<R>(
  rows: readonly R[],
  statement: Pick<SealedStatement<unknown>, 'session' | 'opened'>,
): R[] {
  if (!statement.session) return rows as R[];
  const out: R[] = [];
  for (const row of rows) {
    const token =
      typeof row === 'object' && row !== null ? (row as { token?: unknown }).token : undefined;
    if (typeof token !== 'string') out.push(row);
    else if (!isSealedToken(token)) continue;
    else {
      const plain = statement.opened.get(token);
      out.push(plain === undefined ? row : { ...row, token: plain });
    }
  }
  return out;
}
