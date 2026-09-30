# B7 extract: the home page lane on main ahead of the round

Branch `home/extract` in the worktree `/Users/kevinliu/repos/Turboslide-home`, cut from
`origin/main` at 8ceb6294 on 2026-09-29. The lane's commits from `polish/round` cherry-picked with
`-x`, then the seams the home page needs, taken as the exact content of `polish/round` so the
round's later merge is clean. Not pushed.

## What was brought

| Commit   | Source                | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5f1a4c04 | d7f6f21d (cherry)     | B7, the home page: `apps/studio/src/components/home/*`, `routes/home.tsx` and `home.css`, `e2e/home-page.spec.ts`, the `public/home/*` pictures, `brand-manifest.json`, `manifest.webmanifest`, `og/turboslide.png`, `packages/theme/brand/og-template.html` and `site.ts`, `scripts/build-brand.ts`, `scripts/build-home-assets.ts`, `build/b7.md` and `b7/*`                                                                                                                                                                                                                                                                            |
| 6fd117f7 | ba4562c8 (cherry)     | The home page's pictures captured on the merged tree: `shots.json`, `shots.ts` and eighteen pictures                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 0297ca5e | 14612488 and 5c40832d | `SectionIcon.tsx` reading the two new glyphs from the sprite; `packages/theme/src/sprite.ts`, `sprite.test.ts`, `brand.test.ts`, `assets/sprite.svg`, `assets/sprite-ids.json`; `packages/schema/src/icon-names.ts` (the sprite test compares the sprite against `ICON_NAMES`, and `SPRITE` is typed by `IconName`); the contracts regenerated for the two names (`docs/grammar.md`, `packages/agent/generated/mcp-tools.json` and `openapi.json`, `skills/turboslide-create/references/grammar.md`); `scripts/build-brand.ts` accepting a deployment run on either production origin; the trailing newline on `b7/after/copy-rules.json` |

Both cherry-picks applied without a conflict. Every file of the third commit is byte identical to
`polish/round`, except the regenerated contracts, which differ from `polish/round` only where the
round's other lanes changed the contracts too.

Not brought: the rest of the seams commit (menus, schema, chrome, viewer, CLI), and every other
lane.

## Commands and results

| Step                                                                                                                                                                                                                  | Result                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --prefer-offline`                                                                                                                                                                     | done                                                                                                                                                |
| `git cherry-pick -x d7f6f21d`, `git cherry-pick -x ba4562c8`                                                                                                                                                          | clean                                                                                                                                               |
| `pnpm generate:contracts`                                                                                                                                                                                             | four files change, all for `cursor-arrow-rays` and `arrow-down-tray` and the count 72                                                               |
| `pnpm exec tsc -b`                                                                                                                                                                                                    | first run 121 errors, all route typing from the missing `apps/studio/src/routeTree.gen.ts` of a fresh worktree; after `pnpm build` wrote it, exit 0 |
| `./node_modules/.bin/vitest run apps/studio/src/components/home packages/theme`                                                                                                                                       | 8 files, 107 tests passed                                                                                                                           |
| `node scripts/build-home-assets.ts --check`                                                                                                                                                                           | 12 files of 6 pictures match `shots.json` and `shots.ts`; `facts-data.ts` matches `facts.json`                                                      |
| `node scripts/build-brand.ts --check`                                                                                                                                                                                 | 31 files match (the outlines rebuild skipped for the missing venv; the committed file verified by bytes)                                            |
| `pnpm exec prettier --check <changed files>`                                                                                                                                                                          | clean, after taking `polish/round`'s `copy-rules.json` (the cherry-picked record lacked its trailing newline; the seams commit added it)            |
| `pnpm build`                                                                                                                                                                                                          | exit 0, 40 s                                                                                                                                        |
| `NITRO_PRESET=node-server pnpm --filter @turboslide/studio build:deploy`, then `node apps/studio/.output/server/index.mjs` on 4451 with the tmp store env of `scripts/check.mjs` (`NODE_SERVER_ENV` and `SERVER_ENV`) | /home answered 200                                                                                                                                  |
| `PLAYWRIGHT_BASE_URL=http://localhost:4451 pnpm exec playwright test apps/studio/e2e/home-page.spec.ts`                                                                                                               | 17 passed, 15.5 s                                                                                                                                   |
| `pnpm exec turboslide lint --chrome --url http://localhost:4451/home --widths 1440,1280,390 --themes light,dark --states ''`                                                                                          | 6 audits over 3 widths and 2 themes, 0 with findings                                                                                                |
| `node docs/gslides-parity/polish/build/b7/scripts/shoot-extract.mjs`                                                                                                                                                  | eight pictures in `b7/extract/`; page height 4898 at 1440, 4263 at 390                                                                              |

Nothing failed inside the lane's files, so nothing was changed beyond the seams. The server was
stopped after the run.

## The pictures

`docs/gslides-parity/polish/build/b7/extract/`: `light-1440-fold.png`, `light-1440-full.png`,
`dark-1440-fold.png`, `dark-1440-full.png`, `light-390-fold.png`, `light-390-full.png`,
`dark-390-fold.png`, `dark-390-full.png`. Shot from the node-server build at device scale 1.

Read against the brief (readable, far better spacing, minimal, the diagrams, icons and pictures
doing the work, plain technical English, no interruptions between a heading and its text):

- Seven sections at 1440, each one heading with its 20 px glyph, one lead, and one picture or
  diagram beside it; hairlines between sections; no boxes, no eyebrows, no animation.
- The hero's heading and lead sit over the editor picture; the two buttons are the only controls.
- The three diagrams (Present, Export, Agents) draw from the tokens and read in both appearances.
- At 390 the page is one column, the text before the picture in every section, the buttons full
  width.
- The copy is declarative sentences in sentence case; the only Title Case is the button labels.

Nothing found that is not that.
