# Core gate matrix

Base http://localhost:4471, the Worker 127.0.0.1:8791, started 2026-10-02T15:28:22.941Z, 83 s. 3 rows judged: 0 passed, 3 failed, 0 not driven (0 of them manual, the checklist's: none), 0 no step, 0 local rows this run did not record (listed apart below, never counted as passed). Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): none judged. Cost rows over their ceiling in this run: none. Verdict failed; retries no specs run; exit 1. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): none; rows whose own controls a ship would keep parked: none; rows of an unparkable feature blocking the ship: people.versions-author-account, people.labels-disambiguated, share.dialog.grant-email-line.

| Row | Feature | Driver | Today | Result | Reason |
| --- | --- | --- | --- | --- | --- |
| `people.versions-author-account` | versions | e2e/accounts.spec.ts | not driven | failed | Error: a record by the anonymous id |
| `people.labels-disambiguated` | share | e2e/accounts.spec.ts | not driven | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m |
| `share.dialog.grant-email-line` | share | e2e/accounts.spec.ts | not driven | failed | Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoMatch[2m([22m[32mexpected[39m[2m)[22m |

## Not driven rows, by id and reason


## Failed rows, by id and reason

- `people.versions-author-account`: Error: a record by the anonymous id
- `people.labels-disambiguated`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoBeGreaterThan[2m([22m[32mexpected[39m[2m)[22m
- `share.dialog.grant-email-line`: Error: [2mexpect([22m[31mreceived[39m[2m).[22mtoMatch[2m([22m[32mexpected[39m[2m)[22m

## Tier rows this run did not judge (docs/CLOUDFLARE.md 2.3)

Listed apart with the reason "a do tier row; this run's tier is not named (no --tier)": judged by a run on their tier alone, never counted as passed and never a reason to park.

- `setup.worker.health`
- `setup.do.two-instances`
- `setup.free-plan.caps`
- `setup.do.memory`

