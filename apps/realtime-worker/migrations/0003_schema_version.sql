-- The identity schema's version row (AUTH-3; docs/hosting.md 13.8). The accounts routes refuse
-- every schema statement since AUTH-3, so a cold instance can no longer migrate through /db: a
-- database the migrations made must already carry the version the code expects, and then the
-- boot reads this row and sends no schema statement. The value equals AUTH_SCHEMA_VERSION in
-- apps/studio/src/server/auth/schema.ts (pinned by record-statements.test.ts). A change of the
-- identity schema is a new migration with its statements and this row's new value, applied with
-- `realtime-env.mjs worker-migrate [--env preview]` before the push that needs it. On a database
-- whose boot already wrote the row (production and the preview since 2026-10-01) this insert
-- changes nothing.
INSERT OR IGNORE INTO ts_schema (k, v) VALUES ('turboslide', 'better-auth 1.7.4; turboslide 2026-10-01.1');
