# docs/gslides-parity

The evidence of every Turboslide round. Each round has one folder with its notes, its run ledgers and the drivers its agents wrote. No program reads a file here. The folder is out of every deployment and out of prettier.

## The pictures of the closed rounds

On 2026-10-02 lane B6 of Round 1 removed every picture (PNG, JPEG and one WebP), PDF and PowerPoint file from the folders of the rounds that closed before the evidence policy (`docs/NEXT.md` 5.2 item 1). That is 15,352 files and 1,578 MiB. The two PowerPoint files of `features/build/` carry the extension `.pptx.zip`. The history was not rewritten (`docs/NEXT.md` question 21), so each file is still in the history at `cc06189b` on `main`. A reader opens [the evidence folder at that commit](https://github.com/Kevin-Liu-01/Turboslide/tree/cc06189b/docs/gslides-parity) on GitHub, or reads one file with `git show cc06189b:<path>`. Each folder below names the commit in its own `README.md`.

| Folder            | Files removed |     MiB |
| ----------------- | ------------: | ------: |
| `polish/`         |         9,355 | 1,140.9 |
| `focus/`          |         2,266 |   184.0 |
| `objects/`        |         1,411 |    51.7 |
| `product/`        |           809 |    51.4 |
| `verification-3/` |           124 |    36.9 |
| `verification-4/` |            96 |    22.8 |
| `design-4/`       |           134 |    19.1 |
| `features/`       |           229 |    17.6 |
| `return/`         |           445 |    14.5 |
| `people/`         |           250 |    10.4 |
| `vector/`         |            58 |     9.8 |
| `build-4/`        |            54 |     6.2 |
| `verification-2/` |            25 |     5.9 |
| `sync/`           |            56 |     3.7 |
| `verification/`   |            40 |     3.3 |

The pictures of `realtime/`, `cloudflare/` and `next/` stay, because those rounds were still open on that day. The notes, ledgers and drivers of every folder stay.

The realtime round's verifier committed 515 more pictures (17.0 MiB) under `focus/verification/realtime-*/` on `main` after that day. They left the tree when Round 1 was replayed onto `main` on 2026-10-04, after that round closed. Each one is in the history at `4aa32718` on `main`, and `focus/README.md` names that commit.

## The policy from Round 1 on

These rules are `docs/NEXT.md` 5.3.

1. Notes, run JSON and gate ledgers are tracked under `docs/gslides-parity/<round>/`.
2. A picture is tracked only when a note links it. It is a viewport capture, never a full page, saved as palette PNG or WebP, and it is under 200,000 bytes. A round's tracked pictures stay under 25 MB.
3. Raw drives, traces and decks go to `.turboslide/<round>/`, which git ignores.
4. A second pass links the first pass's picture. It never copies it.
5. After a ship the integrator prunes the round's pictures that no note names.
6. Each pass writes one verification file. No matrix is copied into prose.
7. No folder holds more than 1,000 entries. A shared ledger folder takes one subfolder per round, for example `focus/verification/<round>/`.
8. A tool that a later round runs moves to `scripts/` at the ship. The evidence keeps one-off drivers.
9. The folder stays out of every deployment (`.vercelignore`, `.dockerignore`) and out of prettier (`.prettierignore`).
10. No new program opens a path under this folder. A reviewer refuses a new reader.

## The check

`docs/readme/evidence-policy.test.mjs` runs in the root vitest project `scripts`. It reads the tracked tree and fails on a picture of 200,000 bytes or more, on a round folder with 25 MB of pictures or more, on a folder with more than 1,000 entries, on any picture, PDF or PowerPoint file in a closed folder, and on a closed folder that lost pictures without its `README.md` line. The 33 pictures of `next/` that were over the size before the policy are listed in the test.
