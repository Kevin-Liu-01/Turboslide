# docs

The documents of Turboslide. Start with the first table. `docs/readme/docs-index.test.mjs` checks that this index links every top-level document and folder under `docs/` and that every link resolves.

## Start here

| Document                                                      | What it is                                                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [../README.md](../README.md)                                  | What Turboslide is, how to start it, the CLI                                                       |
| [../AGENTS.md](../AGENTS.md)                                  | The rules for working in this repository                                                           |
| [NEXT.md](NEXT.md)                                            | The next program from 2026-10-02: the rounds for speed, cost, features, the brand and sign in      |
| [FOCUS.md](FOCUS.md)                                          | The rule, the core set, the parked set, the matrix and the ship gate (section 6.2)                 |
| [REALTIME.md](REALTIME.md) and [CLOUDFLARE.md](CLOUDFLARE.md) | The realtime round: the realtime channel, presence and Google sign in, with the move to Cloudflare |
| [hosting.md](hosting.md) and [security.md](security.md)       | How the studio is hosted, deployed, verified and protected                                         |
| [../scripts/hosting/README.md](../scripts/hosting/README.md)  | The hosting setup of the realtime round's Cloudflare phase                                         |
| [spec/SPEC.md](spec/SPEC.md)                                  | The base specification, cited in code as "SPEC n.n"                                                |
| [grammar.md](grammar.md)                                      | The generated grammar and agent contract, written by `pnpm generate:contracts`                     |
| [updates.md](updates.md)                                      | The release notes, one entry per ship                                                              |

## Reference by subsystem

| Document                                         | What it covers                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [freeform.md](freeform.md)                       | Freeform slides: positions, palettes and typography                                                                                                     |
| [pptx.md](pptx.md)                               | The PowerPoint export: what perfect means and the page raster policy                                                                                    |
| [deck-transfer.md](deck-transfer.md)             | The deck bundle: pack, unpack, push and pull                                                                                                            |
| [hosting-chromium.md](hosting-chromium.md)       | Renders and exports inside the Vercel function                                                                                                          |
| [native.md](native.md)                           | The Rust crate with its napi and wasm bindings                                                                                                          |
| [export-verification.md](export-verification.md) | The verify loop, the render worker and the calibration constants                                                                                        |
| [judge-loop.md](judge-loop.md)                   | The render, sheet, lint, judge and gate procedure                                                                                                       |
| [brand.md](brand.md)                             | The identity record: the mark, the lockup and the tokens                                                                                                |
| [performance.md](performance.md)                 | The speed record of round four                                                                                                                          |
| [HOSTING-MOVE.md](HOSTING-MOVE.md)               | The plan that moved hosting to the General Translation team's Vercel project; the redirect of `turboslide.vercel.app` waits on question 24 of `NEXT.md` |

## The closed rounds

These specifications are in `archive/rounds/` since the last push of Round 1 (`NEXT.md` 5.2 item 4). Each round's evidence is under `gslides-parity/<round>/`.

| Specification                             | Round                                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [RETURN.md](archive/rounds/RETURN.md)     | The return round: tables, shapes, charts, the formatting rows and the chrome rows back in the default view |
| [PRODUCT.md](archive/rounds/PRODUCT.md)   | The product round: the seller friction, the interface craft pass and the brand kit                         |
| [FEATURES.md](archive/rounds/FEATURES.md) | The features round: objects, fonts, logos and shaders, in two ships                                        |
| [SYNC.md](archive/rounds/SYNC.md)         | The sync and costs round: the write path and its order                                                     |
| [VECTOR.md](archive/rounds/VECTOR.md)     | The vector round: shapes drawn from their definitions and SVG pictures                                     |
| [OBJECTS.md](archive/rounds/OBJECTS.md)   | The objects round: the live gestures, tables, charts, diagrams, word art and lines                         |
| [POLISH.md](archive/rounds/POLISH.md)     | The polish round: the fixes of nine production audits and the home page                                    |
| [PEOPLE.md](archive/rounds/PEOPLE.md)     | The people round: identity, presence, authorship, avatars and accounts                                     |

## Records and folders

| Folder or file                                     | What it holds                                                                                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [gslides-parity/](gslides-parity/)                 | The evidence of every round, one folder per round, with the evidence policy in its `README.md`; the gate still reads its matrix and ship lists |
| [archive/status/](archive/status/)                 | The milestone and hosting status documents of 2026-09-10 to 2026-09-22 and their five early evidence folders                                   |
| [archive/gslides-parity/](archive/gslides-parity/) | The specifications, milestone plans, build status records and verification records of the parity rounds one to five                            |
| [archive/deviations.md](archive/deviations.md)     | The deviations list that `AGENTS.md` carried from M1 to round four                                                                             |
| [readme/](readme/)                                 | The README renderer of "What works today" with its pictures, and the tests of this index and of the evidence policy                            |
| [spec/](spec/)                                     | The base specification, the milestone plan and the three experiment reports of 2026-09-10; `spec/README.md` records their provenance           |

The parity rounds one to five are in `archive/gslides-parity/` (`SPEC.md` to `SPEC-5.md`, `MILESTONES*.md`, `BUILD-STATUS*.md`, `VERIFICATION*.md`), cited in code by name as "gslides-parity SPEC-n". Their evidence stays under `gslides-parity/`.

The specification and the milestone plan cite private material and are in a public repository provisionally; see `AGENTS.md`, "Where the specification lives".
