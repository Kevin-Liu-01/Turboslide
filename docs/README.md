# docs/

Reference documents for Turboslide. Generated files are written by `pnpm generate:contracts` and
committed; the acceptance chain fails when a committed copy is stale or untracked.

| File                     | Status         | Written by                                                                             |
| ------------------------ | -------------- | -------------------------------------------------------------------------------------- |
| `spec/SPEC.md`           | recovered      | the design session of 2026-09-10; see `spec/README.md` for the provenance              |
| `spec/MILESTONES.md`     | recovered      | the same session; the M1 acceptance list `scripts/check.mjs` runs                      |
| `spec/experiments/*.md`  | recovered      | the three experiment builders (TanStack, PPTX, Slides and render)                      |
| `grammar.md`             | generated (M1) | `@turboslide/agent`, from the block catalog and the rule table in `@turboslide/schema` |
| `M1-STATUS.md`           | M1             | the integrator: what shipped, the acceptance table with measured numbers, the baseline, open items |
| `export-verification.md` | M2             | the export builder: the manual PowerPoint checklist and the calibration constants      |
| `judge-loop.md`          | M4             | the agent builder: the render, sheet, lint, judge, skeptic, fix and gate procedure     |
| `publishing.md`          | M6             | the publishing builder                                                                 |

The specification and the milestone plan cite private material and are in a public repository
provisionally; see AGENTS.md, "Where the specification lives".
