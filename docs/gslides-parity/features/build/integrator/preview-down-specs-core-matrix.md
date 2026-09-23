# Core gate matrix

Base https://turboslide-ccb5xs0g7-kl01s-projects.vercel.app, started 2026-09-22T20:49:06.300Z, 83 s. 7 rows judged: 4 passed, 2 failed, 1 not driven (0 of them manual, the checklist's: none), 0 no step. Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): none judged. Cost rows over their ceiling in this run: none. Verdict failed; retries 0 configured, 0 test(s) retried; exit 1. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): logos; rows whose own controls a ship would keep parked: logos.index.refresh-fixture (insert.logo); logos.cache.open-licence-only (insert.logo); rows of an unparkable feature blocking the ship: none.

| Row | Feature | Driver | Today | Result | Reason |
| --- | --- | --- | --- | --- | --- |
| `logos.picker.recents` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.route.mark-headers` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.index.refresh-dry-run` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.index.refresh-fixture` | logos | core/logos.spec.ts | not driven | not driven | not driven: the index reads down, not the ten mark fixture (TURBOSLIDE_LOGO_UPSTREAM=fixture on a preview); the unit tests apps/studio/src/server/logos.test.ts cover the 404 marking and the takedown (docs/FEATURES.md 7.3) |
| `logos.index.cached-offline` | logos | core/logos.spec.ts | not driven | passed |  |
| `logos.cache.open-licence-only` | logos | core/logos.spec.ts | not driven | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m |
| `logos.agent.search-insert` | logos | core/logos.spec.ts | not driven | failed | Error: tools/call |

## Not driven rows, by id and reason

- `logos.index.refresh-fixture`: not driven: the index reads down, not the ten mark fixture (TURBOSLIDE_LOGO_UPSTREAM=fixture on a preview); the unit tests apps/studio/src/server/logos.test.ts cover the 404 marking and the takedown (docs/FEATURES.md 7.3)

## Failed rows, by id and reason

- `logos.cache.open-licence-only`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBe[2m([22m[32mexpected[39m[2m) // Object.is equality[22m
- `logos.agent.search-insert`: Error: tools/call

