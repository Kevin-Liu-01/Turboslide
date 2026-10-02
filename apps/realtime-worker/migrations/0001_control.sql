-- The two control tables of the realtime Worker (docs/CLOUDFLARE.md 3.6.2), made by a wrangler
-- migration and never by the Worker, which runs no code at deploy: `rt_open` is a row per deck
-- with sockets or uncommitted entries (written at the first socket's open, deleted at the last
-- close's commit; `GET /control/open` lists it for the drain of 3.8), `rt_flags` holds the
-- runtime switches (`GET` and `POST /control/flags`; the `realtime` row is the kill switch the
-- router reads every 30 s). Applied with `pnpm exec wrangler d1 migrations apply
-- turboslide-accounts --remote` (production), `... turboslide-accounts-preview --remote --env
-- preview` (the preview) and `--local` for a checkout, wrapped by `realtime-env.mjs
-- worker-migrate`. A missing table or a missing `realtime` row reads as `unset`: the router
-- refuses upgrades with 4503 and `/health` answers `realtime: 'unset'`.
CREATE TABLE IF NOT EXISTS rt_open (deck_id TEXT PRIMARY KEY, opened_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rt_flags (k TEXT PRIMARY KEY, v TEXT NOT NULL);
INSERT OR IGNORE INTO rt_flags (k, v) VALUES ('realtime', 'on');
