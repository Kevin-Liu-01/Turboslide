-- The daily counts of the reports (HR-O#2c, RELIABILITY-14; docs/hardening/HARDENING.md 4.8): one
-- row per UTC day, kind ('error', 'rejection' and 'route' from the browser's reporter, 'csp' from
-- the CSP report route), route and key, with how many lines the studio accepted. The studio writes
-- it through POST /db/query with the two statements of db-statements.json (the count, which adds a
-- new row only while the day holds fewer than 500, and the prune of the days past 30); the route
-- is scrubbed and the key is a scrubbed message or a CSP directive with a host, so no address,
-- token or deck text is stored. The spec named this file 0005; HR-SA#3's 0005_limits.sql took
-- the number. Applied by `realtime-env.mjs worker-migrate` before the push that writes it; a
-- build before HR-O#2c never reads the table.
CREATE TABLE IF NOT EXISTS ts_reports (
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  route TEXT NOT NULL,
  key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, route, key)
);
