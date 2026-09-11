# The judge loop

The procedure of SPEC 7.6, as the CLI and `scripts/judge-loop.mjs` run it (MILESTONES M4 item 4).
The evidence is produced by the CLI, the judgment is made by agents, the mechanical part is
applied by `turboslide fix`, and the gate reads the revision, so a claim about a deck is a claim
about revision N. Nothing in the loop needs a person; a person reads the same bundle.

## 1. Evidence: `turboslide judge bundle`

```
pnpm exec turboslide judge bundle --out .turboslide/judge --json
```

Renders every slide in both themes (or reuses the last `turboslide render` when it is at the
current revision and covers the selection; `--fresh` renders again), draws the two contact sheets
with the lint overlay and their cell maps, runs the grammar linter in both layers, and writes one
directory:

| File                                                  | What it is                                                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `render/render.json`, `render/<nn>-<id>-<theme>.png`  | `RenderRecord[]` with boxes, line counts, font sizes and weights, page errors, overflow, beside the PNGs |
| `sheet/sheet-<theme>.png`, `sheet/sheet-<theme>.json` | the contact sheets and the cell map from cell boxes to slide ids; a judge reads the map first            |
| `lint.json`                                           | `Finding[]` from the linter, `source: lint`, `fix` mutations where the rule is mechanical                |
| `lint-gate.json`                                      | the severity 3 findings split into `blocking` and `known` (from `known-findings.json`), the counts       |
| `document.json`, `outline.json`                       | the normalized document and the numbered outline (`selected` marks the slides in the bundle)             |
| `numbers.json`                                        | every numeral of every selected slide with the noun it precedes, for the accuracy judge                  |
| `lenses.json`, `lenses.md`                            | the six lenses with the `deck_review` prompt text per lens (`source: judge:<lens>`)                      |
| `bundle.json`                                         | the deck id, the revision, the slide ids, the counts and this file list                                  |

The same action is `deck_judge_bundle` over MCP (`turboslide mcp`); `slideIds` restricts the
bundle to a selection (`turboslide judge bundle 12-20 --out ...`).

## 2. The mechanical gate: `turboslide lint`

`lint.json` is the linter's judgment; severity 3 beyond `known-findings.json` blocks the ship step
with no agent involved (`turboslide lint all` exits 1). `lint-gate.json` in the bundle carries the
same split. Findings with `fix` are applied by `turboslide fix <ids> [--rule <id>]`; every rule
marked `fix` in the rule table (`docs/grammar.md`, `skills/turboslide-verify/references/verification.md`)
produces fix mutations, and the coverage test (`packages/agent/src/__tests__/coverage.test.ts`)
proves it on the linter's fixture deck.

## 3. Judges: one lens each

Six judges with stable names read the bundle, one lens each: `layout`, `visual-consistency`,
`copy`, `accuracy`, `completeness`, `art-direction`. The instructions are `lenses.md` (the same
text the `deck_review` MCP prompt returns). A judge reads `sheet/sheet-<theme>.json` first, then
the renders it needs, alongside `render/render.json` (structured metrics beat model vision),
`lint.json` (do not repeat a mechanical finding) and `numbers.json`. It returns `Finding[]` at
severity 2 and 3 only, each with `slideId`, `blockId` where one exists, `evidence` (the text or
the measurement, a pixel box where one exists), a `proposal` a fixer applies without judgment, and
`source: judge:<lens>`.

## 4. Skeptics: one slide each

A skeptic per slide with findings keeps or drops each judge finding (a finding it cannot verify
from the evidence is dropped) and sharpens what it keeps: a sharpened finding carries
`source: skeptic` and, where the change is one property, `fix` mutations (`block.set`,
`slide.set`). The accuracy refuter checks numerals against `numbers.json` and the sources the deck
names. The verdicts are written to `skeptics.json` beside the findings.

## 5. Fixers: one slide each, under a lease

Mechanical fixes go through `turboslide fix` in one write. Every other kept finding goes to a fixer
that takes `slide.lease` on the slide, applies the proposal through `slide.update` or `block.set`
at the `baseRevision` it read, releases the lease, and reports `verifiedBothThemes` and `residual`.
The harness runs fixers only with `--fix`; without it the fix plan is written and nothing changes.
After fixes the touched slides are re-rendered and re-linted.

## 6. The gate

`gate.json` names the revision and the verdict: `ship` when `turboslide lint all` is clean at
severity 3 beyond the baseline, `render` produced no page errors, `build` (when asked for with
`--build`) is under budget, and no judge or skeptic finding at severity 3 remains; `hold`
otherwise, with the failing checks listed. A claim about the deck quotes `gate.json`'s revision.

## The harness

```
node scripts/judge-loop.mjs --deck decks/gt-brand --bundle .turboslide/judge \
  --out .turboslide/judge/findings.json --gate .turboslide/judge/gate.json \
  [--lenses layout,copy] [--slides 12-20 | a,b,c] [--runner auto|sdk|cli|none] \
  [--model sonnet] [--max-slides 24] [--budget-usd 5] [--timeout-s 240] [--fix] [--build]
```

The harness reuses the bundle when `bundle.json` is at the deck's revision and writes a new one
otherwise. It runs judges through the Claude Agent SDK when `@anthropic-ai/claude-agent-sdk` is
installed (`--runner sdk`), or through the `claude` CLI in headless mode
(`claude -p --output-format json --json-schema ... --allowedTools Read --add-dir <bundle>`) when
the binary is on `PATH` (`--runner cli`); `--runner auto` (the default) picks the SDK, then the
CLI, then `none`. With `none` (or when neither is installed) the judges and skeptics are skipped and
`gate.json` says so under `judges`; the loop still writes `findings.json` from the linter and runs
the gate, so a machine without an agent runtime produces the same files. Every judge answer is
validated against the `Finding` schema (a slide id the deck has, severity 2 or 3, a proposal); an
answer that is not a JSON array of findings is logged and dropped, never invented. Costs are
bounded by `--budget-usd` per judge call and by `--max-slides` (the slides with the most lint
findings come first).

The runner is checked before the judges. A `claude` binary on `PATH` or an installed SDK is not
proof of a working runner: the CLI reports `401 API key is invalid` after about three minutes of
internal retries when the key it inherits is refused (a nested Claude Code session does this), and
a call can hang. So the loop first makes one preflight call that expects `{ "findings": [] }`.
When the preflight gets no answer (an authentication error, no answer within `--timeout-s`,
default 240 s, a non-zero exit, or output that is not JSON) the runner is dropped after that one
call: `--runner auto` logs the reason, continues as `none` and writes the reason into `gate.json`
under `judges` (and `runnerDropped`) and into `judge-log.json` under `dropped`; an explicit
`--runner cli` or `--runner sdk` writes `judge-log.json` and exits 1 with the message. An
authentication failure at any later call drops the runner the same way; any other failed call is
logged and dropped alone. On a machine without an authenticated runner (no SDK, `claude` not
logged in, or a session whose inherited `ANTHROPIC_API_KEY` the CLI refuses) the line to run is
the acceptance line with `--runner none`: it writes the same files in about 30 s instead of
waiting out the preflight. `--timeout-s` caps every call, the judges' included; raise it for
judges that read many renders.

Outputs: `findings.json` (`Finding[]` from lint, judges and skeptics, each with `slideId` and
`source`), `skeptics.json` (the verdicts per finding), `fixes.json` (the plan, applied or dry),
`judge-log.json` (every agent call with its name, duration, outcome and error, and `dropped` with
the reason when the runner was dropped), and `gate.json` (`runnerDetected` and `runnerDropped`
beside the checks). The acceptance line checks only that `gate.verdict` is a string and every
finding carries `slideId` and `source`.

## Reading the result

- `gate.json`: `verdict`, `revision`, `checks[]` (`lint`, `render`, `build`, `judges`), `counts`.
- `findings.json`: sort by `severity` then `slideId`; `source` says who found it; `fix` says
  `turboslide fix` or a `slide.update` closes it.
- The rounds' rule stands: look at both themes after every fix, and re-run the bundle at the new
  revision before claiming the deck ships.
