-- The count of the accounts statements outside the allowlist (HR-K2#3; docs/security.md section
-- 12). The Worker's /db routes refuse a statement whose skeleton is not in db-statements.json, or
-- run it under the hand switch TURBOSLIDE_DB_STATEMENTS=report; either way the Worker adds one to
-- this table's row for the statement: the first 12 hex characters of the SHA-256 of its text (the
-- digest the 403 answer and the log line carry), its kind and first table name, how many times it
-- was refused and run, and the first and last time in ms. Never the text and never a parameter.
-- At most 500 rows (db.ts UNLISTED_ROWS_MAX): past that, a known digest still counts and a new one
-- is in the log line alone. Read with GET /control/db-unlisted under the database bearer, or
-- `realtime-env.mjs db-unlisted [--env preview]`. Applied by `realtime-env.mjs worker-migrate`
-- before the push that reads it; a Worker before HR-K2#3 never reads the table.
CREATE TABLE IF NOT EXISTS ts_db_unlisted (
  digest TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  tbl TEXT,
  refused INTEGER NOT NULL DEFAULT 0,
  ran INTEGER NOT NULL DEFAULT 0,
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL
);
