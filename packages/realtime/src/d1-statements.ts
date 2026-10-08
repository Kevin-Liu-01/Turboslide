// The statement allowlist of the accounts database routes (AUTH-3; docs/security.md section 12).
// The realtime Worker's `POST /db/query` and `POST /db/batch` run a statement only when its
// skeleton is one of the texts in apps/realtime-worker/src/db-statements.json, which
// apps/studio/src/server/auth/record-statements.test.ts records from the accounts code.
//
// A skeleton is the statement's own text with two parts folded: the column and value lists of an
// insert, and the set list of an update. The library writes only the fields a call carries (a
// Google profile with or without a picture, a token answer with or without a refresh token), so
// one call site sends several column lists. A list folds only when every item is a quoted column
// name bound to `?`, so a folded statement writes parameters and nothing else. Every other part
// must equal a recorded text exactly: the table, the where clause, the selected columns, the
// joins, the order, the limit, and a `returning` or `on conflict` tail. A statement that does not
// fold keeps its whole text and matches only itself.
//
// Browser and Worker safe: no Node import.

const IDENT = '"[A-Za-z_][A-Za-z0-9_]*"';
const INSERT = new RegExp(
  `^insert into (${IDENT}) \\((${IDENT}(?:, ${IDENT})*)\\) values \\((\\?(?:, \\?)*)\\)([\\s\\S]*)$`,
);
const UPDATE = new RegExp(
  `^update (${IDENT}) set (${IDENT} = \\?(?:, ${IDENT} = \\?)*) where ([\\s\\S]*)$`,
);

/** The markers that stand for the folded lists; a raw text that carries one never matches. */
export const FOLDED_COLUMNS = '{columns}';
export const FOLDED_VALUES = '{values}';
export const FOLDED_ASSIGNMENTS = '{assignments}';
const MARKERS = /\{(?:columns|values|assignments)\}/;

/**
 * The skeleton of one statement: an insert's lists and an update's set list folded to their
 * markers when they hold only quoted columns and `?`; otherwise the text itself. `null` when the
 * text carries a marker without folding, so no raw text can pose as a skeleton.
 */
export function statementSkeleton(sql: string): string | null {
  const insert = INSERT.exec(sql);
  if (insert !== null) {
    const [, table, columns, values, tail] = insert;
    if (columns!.split(', ').length === values!.split(', ').length && !MARKERS.test(tail!))
      return `insert into ${table} (${FOLDED_COLUMNS}) values (${FOLDED_VALUES})${tail}`;
    return null;
  }
  const update = UPDATE.exec(sql);
  if (update !== null) {
    const [, table, , where] = update;
    if (MARKERS.test(where!)) return null;
    return `update ${table} set ${FOLDED_ASSIGNMENTS} where ${where}`;
  }
  return MARKERS.test(sql) ? null : sql;
}

/** True when the statement's skeleton is in the allowlist. */
export function statementAllowed(sql: string, allowed: ReadonlySet<string>): boolean {
  const skeleton = statementSkeleton(sql);
  return skeleton !== null && allowed.has(skeleton);
}

/** The shape of apps/realtime-worker/src/db-statements.json. */
export type StatementList = {
  /** what the file is and how it is regenerated; never read by code */
  about: string;
  /** the skeletons, sorted */
  statements: string[];
};
