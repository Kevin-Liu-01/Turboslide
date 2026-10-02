# Core gate matrix

Base http://localhost:4471 (tier do) with B on http://localhost:4481, the Worker 127.0.0.1:8791, started 2026-10-02T15:27:53.540Z, 20 s. 4 rows judged: 2 passed, 0 failed, 2 not driven (2 of them manual, the checklist's: setup.free-plan.caps, setup.do.memory), 0 no step, 0 local rows this run did not record (listed apart below, never counted as passed). Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): none judged. Cost rows over their ceiling in this run: none. Verdict ok; retries 0 configured, 0 test(s) retried; exit 0. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): none; rows whose own controls a ship would keep parked: none; rows of an unparkable feature blocking the ship: none.

| Row | Feature | Driver | Today | Result | Reason |
| --- | --- | --- | --- | --- | --- |
| `setup.worker.health` | setup | core-gate | not driven | passed |  |
| `setup.do.two-instances` | setup | core/realtime.spec.ts | not driven | passed |  |
| `setup.free-plan.caps` | setup | core-gate | not driven | not driven | the dashboard's figures before and after the run were not given (--caps-before <json> and --caps-after <json>, each { readAt, doRequests, doRowsWritten, workerRequests }) |
| `setup.do.memory` | setup | core-gate | not driven | not driven | the verifier's hand reading was not given (--memory-reading <json> with result, reason and the dashboard's memory percentiles) |

## Not driven rows, by id and reason

- `setup.free-plan.caps`: the dashboard's figures before and after the run were not given (--caps-before <json> and --caps-after <json>, each { readAt, doRequests, doRowsWritten, workerRequests })
- `setup.do.memory`: the verifier's hand reading was not given (--memory-reading <json> with result, reason and the dashboard's memory percentiles)

## Failed rows, by id and reason


## The setup rows of the do tier (docs/CLOUDFLARE.md 2.3)

- `setup.worker.health`: passed; recorded GET /health on 127.0.0.1:8791 answered 200 in 28 ms: realtime "on", protocol 1, appOrigin "http://127.0.0.1:4471"; commit e6178bbbdb1d equal to the base's
- `setup.free-plan.caps`: not driven (the dashboard's figures before and after the run were not given (--caps-before <json> and --caps-after <json>, each { readAt, doRequests, doRowsWritten, workerRequests }))
- `setup.do.memory`: not driven (the verifier's hand reading was not given (--memory-reading <json> with result, reason and the dashboard's memory percentiles))

