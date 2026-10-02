# Core gate matrix

Base http://localhost:4471 (tier do) with B on http://localhost:4481, the Worker 127.0.0.1:8791, started 2026-10-02T15:04:08.760Z, 1425 s. 16 rows judged: 16 passed, 0 failed, 0 not driven (0 of them manual, the checklist's: none), 0 no step, 0 local rows this run did not record (listed apart below, never counted as passed). Measurement rows (PRODUCT.md 8.2, recorded and never holding the ship; the cost rows of SYNC.md 6.1 among them, which hold it over their ceiling on the preview): none judged. Cost rows over their ceiling in this run: none. Verdict ok; retries 0 configured, 0 test(s) retried; exit 0. A not driven row is never counted as passed. Features a ship on this run would park (rule 4 of section 1; RETURN.md rule 2): none; rows whose own controls a ship would keep parked: none; rows of an unparkable feature blocking the ship: none.

| Row | Feature | Driver | Today | Result | Reason |
| --- | --- | --- | --- | --- | --- |
| `realtime.keystroke.within-300ms` | realtime | core/realtime.spec.ts | broken | passed |  |
| `realtime.caret.within-300ms` | realtime | core/realtime.spec.ts | broken | passed |  |
| `realtime.caret.offset-after-merge` | realtime | core/realtime.spec.ts | broken | passed |  |
| `realtime.selection.outline-within-300ms` | realtime | core/realtime.spec.ts | broken | passed |  |
| `realtime.block.drag-live` | realtime | core/realtime.spec.ts | broken | passed |  |
| `realtime.title.two-typers` | realtime | core/realtime.spec.ts | broken | passed |  |
| `realtime.join.chip-within-1s` | realtime | core/realtime.spec.ts | broken | passed |  |
| `realtime.follow.for-everyone` | realtime | core/realtime.spec.ts | not driven | passed |  |
| `realtime.agent.write-announced` | realtime | e2e/agent-http.spec.ts | broken | passed |  |
| `realtime.share-link.every-instance` | realtime | core/share.spec.ts | flaky | passed |  |
| `realtime.reload.loses-nothing` | realtime | core/realtime.spec.ts | works | passed |  |
| `realtime.reconnect.loses-nothing` | realtime | core/realtime.spec.ts | works | passed |  |
| `realtime.pointer.second-browser` | realtime | core/realtime.spec.ts | not driven | passed |  |
| `realtime.caret.dims-and-leaves` | realtime | core/realtime.spec.ts | broken | passed |  |
| `realtime.card.chip-painted` | realtime | probe --core | broken | passed |  |
| `realtime.departed-guest.name-stable` | realtime | core/share.spec.ts | flaky | passed |  |

## Not driven rows, by id and reason


## Failed rows, by id and reason


