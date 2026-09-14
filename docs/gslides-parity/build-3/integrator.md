# Integrator notes, round three, merge 1

The integrator of the Google Slides parity round three (`docs/gslides-parity/MILESTONES-3.md`,
"Integrator"), merge 1 on 2026-09-13 over `main` at `28cb63b` with the six builders' stage 1 files
in the shared working tree (`docs/gslides-parity/build-3/b1.md` to `b6.md`). Nothing is committed:
the ship step commits. Section numbers refer to `docs/gslides-parity/SPEC-3.md` unless prefixed
SPEC or SPEC-2. Every command ran from `/Users/kevinliu/repos/Turboslide` with Node 24.13.0 and
pnpm 11.15.1. No git write command ran; the untracked `.github/`, `docs/gslides-parity/research-4/`
and `design-4/` (another workflow's, still running) were not touched.

## 1. What merge 1 does

Merge 1 makes the shared checkout install, typecheck and test as one tree so stages 2 to 6 build
against real seams: the `package.json` files of `packages/realtime` and `packages/identity`, the
round three catalog entries and the one install, the subpath exports and dependencies the six
reports requested, the tsconfig references, the vitest project list, the Playwright server
environment, the ignore files, the AGENTS.md sections of the round (the dev server exception with
the port table, the account boundary, the seams as contracts), the type aliases B6 asked for at
merge 1, the two Heroicons B6 asked for, and the regenerated contracts. It records every request
of the six reports with where it went (section 4) and the deviations (section 5).

Merge 1b's content (B2's `redis` channel against the fake with the contention test, B3's `decide()`
with the matrix test) landed inside the builders' stage 1 and is installed by this merge. What
remains of merge 1b is the binding of `decide()` into B4's `authorize()` and the `Decision`
widening (section 4, B3 R4 and B4 R3); both are reassigned with the exact recipe because they fall
in B4's and B1's files and the access store loader they need is B2's day 5.

## 2. Files changed, and why

Integrator's own files (MILESTONES-3 "Owns"):

| File                                                                          | Change                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/realtime/package.json` (new)                                        | the exact content of b2.md R1 (name, description, the eleven `src` exports, the three `client/*` exports of day 4, `@turboslide/schema` and `@turboslide/store` `workspace:*`, `zod` `catalog:`)                                                                                                                                                                                         |
| `packages/identity/package.json` (new)                                        | the exact content of b3.md R1 (ten subpath exports, `@turboslide/effects` and `@turboslide/schema` `workspace:*`)                                                                                                                                                                                                                                                                        |
| `packages/schema/package.json`                                                | exports `./blocks/dither`, `./comments`, `./access`, `./transform` (B1 R1, B5 R3)                                                                                                                                                                                                                                                                                                        |
| `packages/store/package.json`                                                 | `zod: catalog:` (B2 R4)                                                                                                                                                                                                                                                                                                                                                                  |
| `packages/render/package.json`                                                | exports `./collab`, `./dither-key`, `./blocks/dither-attrs`, `./blocks/html-frame`, `./blocks/img-size` (B5 R1); dependencies `dompurify` and `jsdom`, dev `@types/jsdom`, for B4's `src/sanitize/html.ts` of day 5 (8.4)                                                                                                                                                                |
| `packages/materials/package.json`, `tsconfig.json`                            | `@turboslide/render` and its reference (B5 R2; downward, render depends on nothing in materials)                                                                                                                                                                                                                                                                                         |
| `packages/chrome/package.json`, `tsconfig.json`                               | `@turboslide/render` (B5 R1, `@turboslide/render/collab`) and `@turboslide/identity` (B6 R1, `MarkSpec`) with their references                                                                                                                                                                                                                                                           |
| `apps/studio/package.json`, `tsconfig.json`                                   | `@turboslide/identity` (B3 R2, B4 R4), `@turboslide/headless` (B4 R4), `@turboslide/realtime` (B2's `server/room.ts` of stage 3), `ioredis` (B2 R5), `better-auth`, `kysely`, `@simplewebauthn/server`, `@simplewebauthn/browser`, `resend` (B3 R8), `@upstash/ratelimit` with `@upstash/redis`, `pg` with `@types/pg` (8.3, 2.5), the three references, `vitest.config.ts` in `include` |
| `pnpm-workspace.yaml`                                                         | the catalog entries of section 3; `sharp` 0.35.0 to 0.35.4 (B4 R1, GHSA-rgj7-g3m4-5g8c); an `overrides` block removing `pptxgenjs>image-size` (B4 R1; section 5 item 1)                                                                                                                                                                                                                  |
| `pnpm-lock.yaml`                                                              | one `pnpm install`: 89 packages added, 12 removed; `pnpm install --frozen-lockfile` answers "Already up to date"                                                                                                                                                                                                                                                                         |
| `tsconfig.json`                                                               | references `packages/realtime` and `packages/identity` after `packages/store` (B2 R2, B3 R2)                                                                                                                                                                                                                                                                                             |
| `packages/realtime/tsconfig.json`, `vitest.config.ts`                         | the pre install shims removed (B2 R3): the `paths` block and the `resolve.alias` rows                                                                                                                                                                                                                                                                                                    |
| `vitest.config.ts`, `apps/studio/vitest.config.ts` (new)                      | `apps/studio` is a vitest project (`src/**/*.test.ts`; the e2e specs stay Playwright's) so root `pnpm test` runs B3's and B4's studio tests beside `root.test.ts`                                                                                                                                                                                                                        |
| `packages/effects/vitest.config.ts`, `packages/native/vitest.config.ts` (new) | the two packages had none, so `cd packages/effects && ../../node_modules/.bin/vitest run` (B5's acceptance row) walked up to the root config and failed at startup; each package now runs alone (their `tsconfig.json` `include` gains the file)                                                                                                                                         |
| `playwright.config.ts`                                                        | the root `webServer` runs with `TURBOSLIDE_REALTIME=memory`, `TURBOSLIDE_AUTH_DB=.turboslide/auth.sqlite`, `TURBOSLIDE_MAIL=capture` (16.1 step 26); a builder's `PLAYWRIGHT_BASE_URL` run is unchanged                                                                                                                                                                                  |
| `.gitignore`                                                                  | `decks/*/comments/` (2.2; B2 R6) with the note that `decks/fixture/gslides/comments/` stays tracked; the `.turboslide` line documented (`token`, `session-secret`, `principals`, `decks/<id>/.turboslide/access.json`)                                                                                                                                                                   |
| `.vercelignore`                                                               | `firewall` (the rules file is applied through the API, never uploaded with a preview)                                                                                                                                                                                                                                                                                                    |
| `AGENTS.md`                                                                   | the round three dev server exception with the port table and `TURBOSLIDE_DOWNLOAD_SECRET` (B4 R8), the `vite build` exception for B5's audit, the hosting tiers and the account boundary, the catalog and override rules, the per checkout token, the request file convention, the seams as contracts, the deviations                                                                    |
| `docs/gslides-parity/research-3/*`, `design-3/*`, `SPEC-3.md`                 | `prettier --write` (whitespace and table alignment only; 18 files) so check step 19 passes on this round's documents                                                                                                                                                                                                                                                                     |

Edits in builders' files, each the request of the file's owner or the smallest edit with a note:

| File                                                                                                                     | Change                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/chrome/src/menus/model.ts` (B6 R1)                                                                             | `MenuRole = Role \| 'none'` and `MenuCapability = Capability` from `@turboslide/schema/access` (type only imports, the model still loads under plain Node); `GS3_ACTION_IDS` closes with `as const satisfies readonly ActionId[]`; `MenuActionId = ActionId`; the comments updated. `MenuMode` stays local: `access.ts` has no mode type |
| `packages/chrome/src/editor-shell.ts` (B6 R1)                                                                            | `PictureDitherLike = PictureDither` (`@turboslide/schema/blocks`) and `MarkSpecLike = MarkSpec` (`@turboslide/identity/marks`), the names kept so B6's later files compile unchanged                                                                                                                                                     |
| `packages/chrome/src/EditorShell.tsx` (B6 R1)                                                                            | the two `as ActionId` casts and the unused import removed                                                                                                                                                                                                                                                                                |
| `packages/theme/assets/sprite.svg`, `sprite-ids.json`, `src/sprite.ts` (B6 R2)                                           | Heroicons 20 solid `bell` and `inbox` appended through `node packages/theme/scripts/add-icon.ts` (fetched read only from the heroicons repository); 70 symbols                                                                                                                                                                           |
| `packages/theme/src/sprite.test.ts`                                                                                      | the count pins 68 to 70 and 67 to 69, the title                                                                                                                                                                                                                                                                                          |
| `packages/schema/src/icons.ts` (B1's file; B6 R2)                                                                        | `'bell'`, `'inbox'` at the end of `ICON_NAMES` with a note; the sprite test requires the two lists to agree                                                                                                                                                                                                                              |
| `packages/schema/src/catalog.test.ts` (B1's file)                                                                        | the icon count pin 68 to 70 with the note                                                                                                                                                                                                                                                                                                |
| `packages/agent/generated/{mcp-tools,openapi}.json`, `docs/grammar.md`, `skills/turboslide-create/references/grammar.md` | `pnpm generate:contracts` after the icon names (the icon enum); a second run wrote nothing                                                                                                                                                                                                                                               |

## 3. Dependencies

Looked up on the registry on 2026-09-13 (`npm view`), pinned in the catalog:

| Package                   | Version        | Published  | Attached to                     | Why                                                                      |
| ------------------------- | -------------- | ---------- | ------------------------------- | ------------------------------------------------------------------------ |
| `better-auth`             | 1.7.4          | 2026-09-10 | `apps/studio`                   | 0.20, 7.3; B3 R8                                                         |
| `kysely`                  | 0.29.5         | 2026-08-10 | `apps/studio`                   | better-auth 1.7.4 depends on `^0.28.17 \|\| ^0.29.0`; B3 R8              |
| `ioredis`                 | 6.0.0          | 2026-07-31 | `apps/studio`                   | B2 R5 (the channel types the client structurally)                        |
| `dompurify`               | 3.4.15         | 2026-09-06 | `packages/render`               | 8.4 (ships its own types)                                                |
| `@types/jsdom`            | 30.0.0         |            | `packages/render` (dev)         | B4's `new JSDOM()` in `sanitize/html.ts`; `jsdom` 30.0.1 already pinned  |
| `@upstash/ratelimit`      | 2.0.8          | 2026-01-12 | `apps/studio`                   | 8.3 (implemented against a fake this round)                              |
| `@upstash/redis`          | 1.38.4         | 2026-09-04 | `apps/studio`                   | the peer of `@upstash/ratelimit`                                         |
| `@simplewebauthn/server`  | 14.0.1         | 2026-09-05 | `apps/studio`                   | B3 R8; 14.0.2 was published on the day of the install (section 5 item 2) |
| `@simplewebauthn/browser` | 14.0.0         | 2026-09-02 | `apps/studio`                   | B3 R8                                                                    |
| `resend`                  | 6.28.0         | 2026-09-11 | `apps/studio`                   | B3 R8 (against a fake this round; `TURBOSLIDE_MAIL=capture`)             |
| `pg`, `@types/pg`         | 8.23.0, 8.23.1 | 2026-08-08 | `apps/studio` (`@types/pg` dev) | Kysely's Postgres dialect behind `DATABASE_URL` (2.5)                    |
| `ulid`                    | 3.0.2          | 2025-11-30 | nobody yet                      | the comment ids (5.1); a builder names the consumer                      |
| `sharp`                   | 0.35.4         | 2026-08-26 | (catalog bump)                  | 11.5 R0, GHSA-rgj7-g3m4-5g8c; B4 R1                                      |

`pnpm audit --prod --audit-level=high` before the merge: 3 high (`image-size` <= 2.0.2 twice,
`sharp` < 0.35.4). After: "No known vulnerabilities found". No new dependency has an install
script, so `allowBuilds` is unchanged. No `minimumReleaseAgeExclude` entry was needed.

## 4. The requests of the six reports, and where each went

Done at merge 1 means in this tree now; reassigned means the named builder makes it in their own
file in stage 2 or later, with the reason; open for the integrator means a later merge.

### B1 (b1.md)

| Request                                                                           | Where it went                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 schema subpath exports                                                         | done                                                                                                                                                                                                                                                           |
| R2 `touchedSlides` for `text.splice` and `text.mark` (B2)                         | done by B2 in stage 1: a structural fallback counts every slide scoped op; B2 may name the two cases when the local mirrors become the schema's types                                                                                                          |
| R3 `expectedByMilestone` gains `GS3` (B4, `packages/agent/src/http/manifest.ts`)  | reassigned to B4 (day 3): today a GS3 action reads as expected on every instance because `indexOf` answers -1                                                                                                                                                  |
| R4 `actionForMutation` travels the two ops as `slide.update` (B6, `Gestures.tsx`) | reassigned to B6, after B2's `InlineText.tsx` typing path emits them (day 4)                                                                                                                                                                                   |
| R5, R6, R7 (information for B4, B5, B3)                                           | recorded; the `local:<name>` author form of a checkout is B3's day 2 confirmation (B3 R7 of the integrator: identity's `Trust` is `label \| guest \| verified \| agent`, the same four words as `TRUSTS`)                                                      |
| The acceptance line `git diff --exit-code` on the generated files                 | passes on a tree whose generated files are committed; on the working tree `packages/agent/src/generate/contracts.test.ts` (every committed contract equals a fresh generation) is the equivalent and passes; `pnpm generate:contracts` twice: 14 files current |

### B2 (b2.md)

| Request                                                                                            | Where it went                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 `packages/realtime/package.json`                                                                | done, verbatim (the `client/*` exports name the day 4 files)                                                                                                                                                                                                                                                                      |
| R2 root tsconfig reference                                                                         | done                                                                                                                                                                                                                                                                                                                              |
| R3 remove the pre install shims                                                                    | done; `tsc -b` and `vitest run` pass without them                                                                                                                                                                                                                                                                                 |
| R4 `zod` in `packages/store`                                                                       | done                                                                                                                                                                                                                                                                                                                              |
| R5 `ioredis` 6.0.0 in `apps/studio`                                                                | done; B3 R6 asked for the module and export names: the client is `new Redis(REDIS_URL)` from `ioredis` and the channel takes `ioredisCommands(client)` from `@turboslide/realtime/redis`; B3's `KvClient` adapter (`get`, `set(key, value, 'PX', ms)`, `del`) wraps the same client in `apps/studio/src/server/auth/principal.ts` |
| R6 AGENTS.md port table, `.gitignore`                                                              | done                                                                                                                                                                                                                                                                                                                              |
| To B4 (intake, shared, `actions.ts`) and B5 (`materials/actions.ts`): the `putAsset` wiring of 8.5 | reassigned as written: B4 for `deckDispatcher` passing `deckStore`, the intake, twins and `slide.import` writes through `putAsset` with digest names and `removeAsset` after the commit, the `overwrite: true` grep in `check.mjs`; B5 for `AssetActionDeps.store` as the `DeckStore` and the material capture writes             |
| To B1: the schema's `text.splice`, `text.mark`, `Author.principalId?`, `commentOpSchema`           | landed in B1's stage 1 exactly in the shapes named; B2 replaces the local mirrors in `channel.ts` and `protocol.ts` in stage 3                                                                                                                                                                                                    |
| To B3: `RosterIdentity`'s `trust` and `role`                                                       | identity's `Trust` (`@turboslide/identity/resolve`) and the schema's `Role` (`@turboslide/schema/access`) spell them as the channel does; B2 may import them                                                                                                                                                                      |

### B3 (b3.md)

| Request                                                        | Where it went                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1 `packages/identity/package.json`                            | done, verbatim; `packages/identity/node_modules/@turboslide/{effects,schema}` resolve (B3 adds the tsconfig references when the imports land)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| R2 `apps/studio` dependency and the two references             | done; `apps/studio/src/server/auth/**` typechecks in the studio program (`tsc -b` exit 0) and its 18 tests run under the studio vitest project                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| R3 `principalMiddleware()` first in `start.ts` (B4's file)     | reassigned to B4 (day 3) with B3's exact code; the boot probe of section 6 shows no `Set-Cookie` on `/new` today, as expected before it lands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| R4 the merge 1b binding and the type alignment                 | reassigned in three parts. B4: `bindAuthorize({ decide, loadRecord })` at server start with `decide` from `@turboslide/identity/access` and `loadRecord` answering `null` until B2's access store (day 5), then the local types of `authorize.ts` as `import type` from identity (the package is a dependency of `apps/studio` now); B4's two interim cells (`follow` for a token, `readComments` by `comment` alone) follow the tested matrix. B1: `Decision` and `decisionSchema` gain `capability?` on 403 and the 410 `gone` member. B3: identity's record types become imports from `@turboslide/schema/access` (`assetKey` optional to settle with B1) |
| R5 the three name refusal sentences in `menus/strings.ts` (B6) | two of the three are in `menus/strings.ts` verbatim ("That name is reserved", "That name is already in use in this presentation"); "Use 1 to 40 letters or digits in one script" is absent, so B6 adds it with the name prompt (day 3) or imports `NAME_REFUSALS` now that the chrome depends on identity                                                                                                                                                                                                                                                                                                                                                    |
| R6 the ioredis module and export (B2)                          | answered under B2 R5 above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| R7 `TURBOSLIDE_SESSION_SECRET` per environment                 | recorded for the ship step (Kevin or the integrator: `openssl rand -hex 32`, `vercel env add`, a different value per environment); until then the hosted cookie is sealed under the derived fallback with one warning                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| R8 the catalog entries                                         | done (section 3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### B4 (b4.md)

| Request                                                                                                                       | Where it went                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1 the R0 dependency bumps                                                                                                    | `sharp` 0.35.4 done; `image-size` removed from the graph by override, not bumped (section 5 item 1); `@sparticuz/chromium` and `playwright-core` not bumped (section 5 item 3); `pnpm audit --prod --audit-level=high` clean, so step 28 needs no `audit-allow.json` entry for these |
| R2 `requestHost` through `effectiveHost`, `0.0.0.0` out of `isLocalHost`, `refuseSpoofedLocalhost` in `requireAgentAuth` (B3) | reassigned to B3 (day 4, with the key resolver in `auth.ts`)                                                                                                                                                                                                                         |
| R3 the merge 1b binding                                                                                                       | reassigned to B4 as written under B3 R4                                                                                                                                                                                                                                              |
| R4 `@turboslide/headless` and `@turboslide/identity` in `apps/studio`                                                         | done; `actions.ts` can call `setIntakePolicy` from `@turboslide/headless/capture/shared`                                                                                                                                                                                             |
| R5 `sharp.block` in `packages/effects/src/io.ts` (B5)                                                                         | reassigned to B5                                                                                                                                                                                                                                                                     |
| R6 `allowPaths` and `hosted` on `AssetActionDeps` (B5)                                                                        | reassigned to B5                                                                                                                                                                                                                                                                     |
| R7 `mcp.ts` (B1)                                                                                                              | recorded; nothing to change                                                                                                                                                                                                                                                          |
| R8 AGENTS.md: `TURBOSLIDE_DOWNLOAD_SECRET` beside the port table                                                              | done; the `docs/hosting.md` row is B2's                                                                                                                                                                                                                                              |
| R9 `SERVER_SIDE_WINDOW_ACTIONS_GS3` as `as const satisfies readonly ActionId[]`                                               | left to B4's day 3 as offered                                                                                                                                                                                                                                                        |
| R10 apply `firewall/rules.json` in log mode through the API                                                                   | not at merge 1: the round's account boundary puts the WAF apply in the ship step, in log mode only, if the plan accepts it, with a refusal recorded; the rule ids go to B4 then                                                                                                      |

### B5 (b5.md)

| Request                                                    | Where it went                                                               |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| R1 the render exports; the chrome's direct dependency      | done (both)                                                                 |
| R2 `@turboslide/render` in `packages/materials`            | done                                                                        |
| R3 `./blocks/dither` export                                | done (B1 R1 asked too)                                                      |
| To B4: `htmlFrame` in `RenderOptions` at every call site   | reassigned to B4 (day 5, with the frame module)                             |
| To B6: draw against `COLLAB_CLASSES` and `COLLAB_GEOMETRY` | reassigned to B6 (`@turboslide/render/collab` resolves from the chrome now) |
| To B1: the variant key form                                | recorded; the two agree on the bare 64 hex sha256                           |

### B6 (b6.md)

| Request                                                       | Where it went                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 the merge 1 aliases                                        | done as far as the seams allow: `MenuRole`, `MenuCapability`, `MenuActionId`, `PictureDitherLike`, `MarkSpecLike`, the two casts; `MenuMode` stays local because `access.ts` carries no mode type (section 5 item 5); chrome suite 47 files, 426 tests green after the edit |
| R2 Heroicons `bell` and `inbox`                               | done in the sprite, `sprite-ids.json`, `src/sprite.ts` and `ICON_NAMES`; B6 adds the `IconName` entries in `packages/chrome/src/icons.tsx` and sets the icons on `title.inbox` and `tools.notificationSettings`                                                             |
| R3 the edit route passes the round three props (B2)           | reassigned to B2 (day 4)                                                                                                                                                                                                                                                    |
| R4 `resolvePrincipal` produces `IdentityView` (B3)            | reassigned to B3 (`ResolvedIdentity` already carries `principalId`, `label`, `trust` and the kind; the chrome's view adds `name?`, `email?`, `mark?`, `runId?`)                                                                                                             |
| R5 the `DITHER` words for the dither surfaces (B5)            | reassigned to B5                                                                                                                                                                                                                                                            |
| R6 the parity audit rows and the viewer role state (verifier) | recorded for the verifier                                                                                                                                                                                                                                                   |

## 5. Deviations and decisions, recorded for the verifier and Kevin

1. `image-size` is removed from pptxgenjs's dependency graph (`overrides: 'pptxgenjs>image-size': '-'`)
   instead of overridden to a fixed release: the registry's latest is 2.0.2, which the two
   advisories name as vulnerable with no patched release, and pptxgenjs 4.0.1's Node path requires
   the module name `sizeof`, which does not exist, so image-size is never loaded. The export suite
   (18 files, 132 tests, the browser tests included) is green without it. Drop the override when
   pptxgenjs stops declaring the dependency.
2. `@simplewebauthn/server` is pinned at 14.0.1 (2026-09-05), not 14.0.2 (published 2026-09-13,
   the day of the install): a release a few hours old is what a minimum release age policy holds
   back, and passkeys sit behind the domain gate anyway (0.20). B3 bumps it with a reason when the
   passkey plugin lands.
3. `@sparticuz/chromium` (147.0.2, latest 153.0.0) and `playwright-core` (1.62.1, latest 1.63.0)
   are not bumped: no advisory names them and a Chromium change moves the pixel gates
   (compare-to-shoot, canvas fidelity), so the bump is a fixer round decision taken together with
   the verifier's run, not a merge 1 catalog change.
4. `apps/studio` joins the vitest project list with its own config (SPEC-3 16.1 said step 5 gains
   the two packages "with no config change"): B3's and B4's studio tests would otherwise run only
   by hand, and a bare `vitest run` from `apps/studio` would have matched the Playwright specs.
   `packages/effects` and `packages/native` gain the same one file config so their acceptance rows
   run from their folders.
5. B6 R1 asked to alias `MenuMode` to "the mode type of `packages/schema/src/access.ts`"; the file
   has none (View > Mode is a chrome state, not an access fact), so `MenuMode` stays the chrome's.
6. `ulid` is in the catalog and attached to no package: B1's `comments.ts` pins `ULID_PATTERN` and
   the generator's home (B1's CLI store actions or B2's comments store) is not named yet.
7. The merge 1b binding is reassigned rather than made here: `bindAuthorize` lives in B4's
   `authorize.ts` and `root.ts`, and the loader it needs is B2's access store of day 5; the seams
   it binds are installed and typed against each other now.
8. `firewall/rules.json` is not applied at merge 1 (B4 R10): the account boundary puts the apply
   in the ship step, in log mode only.
9. This round's research, design and spec documents were formatted with prettier (whitespace and
   table alignment); no word changed. `build-3/b5.md` and `b6.md` fail `prettier --check` and are
   their owners' to format with their next append; `research-4/` and `design-4/` are the other
   workflow's and were not touched.
10. `packages/realtime/package.json` names three `client/*` exports whose files land on B2's day 4;
    an export pointing at a missing file is inert until imported.

## 6. Commands run and their results

| Command                                                                                                                                                                                                                            | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm view <package> version` and `time` for the fourteen packages of section 3                                                                                                                                                     | the versions and dates of section 3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `pnpm audit --prod --audit-level=high` before the install                                                                                                                                                                          | 3 high: `image-size` <= 2.0.2 (GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq, patched >= 2.0.3 which does not exist), `sharp` < 0.35.4 (GHSA-rgj7-g3m4-5g8c)                                                                                                                                                                                                                                                                                                                                                                                           |
| `pnpm install`                                                                                                                                                                                                                     | resolved 749, added 89, removed 12, 3.5 s; no ignored build script                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `pnpm install --frozen-lockfile`                                                                                                                                                                                                   | Already up to date                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `pnpm audit --prod --audit-level=high` after                                                                                                                                                                                       | No known vulnerabilities found                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `node_modules/.bin/tsc -b` after the install                                                                                                                                                                                       | exit 0 on the whole tree (the identity, realtime and headless references included); the errors the six reports named (`@turboslide/identity/*` TS2307, `edit.$deckId.tsx` TS2739) are gone                                                                                                                                                                                                                                                                                                                                                        |
| `pnpm generate:contracts`                                                                                                                                                                                                          | 14 files current on the tree B1 left; after the icon names 4 files rewritten (`mcp-tools.json`, `openapi.json`, `docs/grammar.md`, the create skill's grammar); a second run: 14 files current                                                                                                                                                                                                                                                                                                                                                    |
| `node_modules/.bin/vitest run` (root, the JSON reporter)                                                                                                                                                                           | 219 files, 2462 tests: 2458 passed, 3 skipped, 1 failed (`realtime` `redis.test.ts` contention worst wait 67.27 ms against 50 ms, under load average 9 to 15); per project: cli 14 files 85 (+1 skipped), render-worker 1/8, studio 7/50, agent 11/237, chrome 47/426, effects 6/55 (+1 skipped), export 18/132, fonts 2/8, headless 5/36 (+1 skipped), identity 9/70, import 1/21, lint 9/65, materials 2/13, mcp 5/36, native 1/6, realtime 8/61 (+1 failed), render 12/308, schema 23/466, store 8/102, theme 4/44, viewer 25/224, scripts 1/5 |
| `cd packages/realtime && ../../node_modules/.bin/vitest run` alone (twice)                                                                                                                                                         | 8 files, 62 tests passed (the contention test at 31.55 ms in B2's run, under 50 ms alone here)                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| After the chrome, schema and theme edits: `tsc -b`; chrome, schema, theme, agent, mcp, lint, studio, effects, native, cli suites alone                                                                                             | exit 0; chrome 47/426, schema 23/466, theme 4/44, agent 11/237, mcp 5/36, lint 9/65, studio 7/50, effects 6/55 (+1 skipped), native 1/6, cli 14/85 (+1 skipped), all passed                                                                                                                                                                                                                                                                                                                                                                       |
| `node --input-type=module -e "await import('./packages/chrome/src/menus/model.ts')"`                                                                                                                                               | the model loads under plain Node after the aliases: 64 GS3 ids, 35 exports, `visibleMenus` a function                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `node scripts/check.mjs --only 1,2`                                                                                                                                                                                                | all 2 selected steps passed in 1.3 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `node scripts/check.mjs --only 4,5,6`                                                                                                                                                                                              | step 4 ok; step 5 FAIL after 79.9 s on two timing budgets under a load average of 12 to 15 (the machine runs a screen recorder, several `top` processes and WindowServer at 30 percent): the realtime contention wait (67 ms) and `effects` `parity.test.ts` `mood-earth` at the 5,000 ms test timeout; the chain stops there                                                                                                                                                                                                                     |
| `node scripts/check.mjs --only 5,6` (rerun, load average 14.6)                                                                                                                                                                     | step 5 FAIL: 7 tests in 6 files, every one a 5,000 ms timeout or the contention wait (76.6 ms) or a stale `baseRevision` from a timed out sibling (cli `canvas.test.ts` twice, `freeform.test.ts`, `gslides.test.ts`, `mcp.test.ts`, effects `parity.test.ts`, realtime); each package passes alone afterwards (the row above). The class is VERIFICATION-2 section 14's "vitest budgets under load"; no test was weakened                                                                                                                        |
| `node scripts/check.mjs --only 6`                                                                                                                                                                                                  | ok: `pnpm build` 3 tasks successful; `check-client-bundle`: marker in 0 of 42 client files and 1 of 78 server files, node builtins in 0 of 30 client scripts; `apps/studio/dist/server` 7.2 MB, `dist/client` 3.8 MB (the studio bundle before the sanitizer, MILESTONES-3 Integrator item 3)                                                                                                                                                                                                                                                     |
| `node_modules/.bin/prettier --check .`                                                                                                                                                                                             | 55 files before; after formatting research-3, design-3 and SPEC-3 the remaining are `research-4/` (9) and `design-4/` (26), the other workflow's, and `build-3/b5.md`, `b6.md`; every source and config file passes                                                                                                                                                                                                                                                                                                                               |
| The boot probe: `TURBOSLIDE_STORE=tmp TURBOSLIDE_REALTIME=memory TURBOSLIDE_DOWNLOAD_SECRET=<fake> vite dev --port 4321` from `apps/studio`, then `node .turboslide/int2-boot-probe.mjs http://localhost:4321 /new /edit/gt-brand` | `/new` 200 after 2 s; `/new` studio ready and settled in 2,164 ms with 0 errors; `/edit/gt-brand` ready and settled in 1,008 ms with one console line (the TanStack devtools relay of the server's hosting log, not a page error); `/api/agent` 200; no `Set-Cookie` on `/new` (B3 R3 pending in `start.ts`); the server log's `Error: aborted` 500s are the probe's own closed connections (`curl -o /dev/null`, `page.close()`), none from a route; the server stopped, port 4321 free                                                          |

## 7. For stage 2 (days 2 to 6), in the order the plan names

- B1: `Decision`'s 403 `capability?` and 410 `gone` (B3 R4); the fallback face and the day 3 to 6
  items of b1.md; the `local:<name>` author form confirmed with B3.
- B2: the local mirrors of `channel.ts` and `protocol.ts` replaced by the schema's exports;
  `room.ts` over `ioredis` (`ioredisCommands`); the edit route's round three props (B6 R3); the
  `docs/hosting.md` environment table with `TURBOSLIDE_DOWNLOAD_SECRET` (B4 R8) and the turn on
  steps for Redis, Postgres, Resend and the private store under the account boundary.
- B3: `requestHost` and `requireAgentAuth` (B4 R2); the schema imports (R4); `principalMiddleware`
  waits on B4's `start.ts` edit (R3); `IdentityView` from `resolvePrincipal` (B6 R4).
- B4: `principalMiddleware()` first in `start.ts` (B3 R3); the binding and the type swap (B3 R4,
  B4 R3); `expectedByMilestone` gains `GS3` (B1 R3); the `putAsset` wiring of the intake (B2);
  `htmlFrame` at every render call site (B5); the sanitizer over `dompurify` and `jsdom` from
  `packages/render`; `SERVER_SIDE_WINDOW_ACTIONS_GS3` tightened (R9).
- B5: `sharp.block` in `effects/io.ts` (B4 R5); `allowPaths` and `hosted` on `AssetActionDeps`
  (B4 R6); `AssetActionDeps.store` as the `DeckStore` (B2); the `DITHER` words (B6 R5); the local
  dither types replaced by `@turboslide/schema/blocks/dither`.
- B6: the `IconName` entries for `bell` and `inbox` and the icons on the two rows (R2);
  `COLLAB_CLASSES` from `@turboslide/render/collab` (B5); `actionForMutation` for the two text ops
  after day 4 (B1 R4); the three name refusal sentences verbatim (B3 R5); `b6.md` formatted.
- Integrator: merge 1b is a check that the binding and the widening landed (B4, B1) with a
  `tsc -b` and the studio suite; `pnpm generate:contracts` after each action lands; the studio
  function bundle after the sanitizer against 7.2 MB; `TURBOSLIDE_SESSION_SECRET` and
  `TURBOSLIDE_DOWNLOAD_SECRET` on the preview at the first deployment.

## 8. Merge 2 (day 7, 2026-09-13): what it does

Merge 2 takes the six stage 2 deliveries as they stand in the shared checkout
(`build-3/b1.md` to `b6.md`, stage 2 sections) and makes them one tree: every request addressed
to the integrator is made in the integrator's files, every request a builder addressed to another
builder that was still open at the end of the stage is made as the smallest edit in that
builder's file with a note naming this merge, every new action resolves on the window, the HTTP
route and MCP, every menu effect binds, the contracts are current, `tsc -b` is clean, the check
chain runs, a preview carries the degraded tiers under the account boundary, and the documents of
the round (AGENTS.md, README.md, docs/README.md, the skills, BUILD-STATUS-3.md) say what shipped.
Nothing is committed: the ship step commits. No git write command ran; the untracked `.github/`,
`research-4/`, `design-4/`, `SPEC-4.md`, `MILESTONES-4.md` and `verification-4/` of the other
workflow were not touched.

Order: B1, B2, B3, B4, B5, B6, as MILESTONES-3 names it. The builders' files were already in the
tree, so the merge is the wiring between them rather than a sequence of copies; the order shows in
the dispatcher's registration order (section 10).

## 9. Files changed at merge 2, and why

Integrator's files:

- `apps/cli/package.json`: exports `./record-actions` and `./records/*` (B1, B2 R8); dependency
  `@turboslide/identity` (B1). `apps/cli/tsconfig.json` references `packages/identity`.
- `packages/mcp/package.json`: dependency `@turboslide/identity` (B1); `packages/mcp/tsconfig.json`
  references it.
- `packages/render/package.json`: exports `./dither-runtime` (B5), `./sanitize/html`,
  `./sanitize/css`, `./sanitize/frame`, `./sanitize/scope` (B1, B4 2.4.1).
- `packages/effects/package.json`: exports `./dither`, `./blue64`, `./dither-io` (B1, B5).
- `packages/agent/package.json`: export `./window/guard` (B4 2.4.1).
- `packages/store/package.json`: exports `./access-store`, `./comments-store`, `./inbox`,
  `./migrate` (B2 R7; `hosted.ts` keeps its re-exports, harmless).
- `packages/identity/package.json`: exports `./marks-render`, `./marks-png` (B3 R9).
- `packages/fonts/package.json`: export `./assets/InterVariable-Italic.woff2` (B5).
- `playwright.config.ts`: the server it starts carries `TURBOSLIDE_LOCAL_OPEN=1`,
  `TURBOSLIDE_AUTH_RATE_LIMIT=off` and obviously fake `TURBOSLIDE_SESSION_SECRET` and
  `TURBOSLIDE_DOWNLOAD_SECRET` values beside the three variables of step 26 (B3 R12, B4 2.7.9).
- `AGENTS.md` (the merge 2 contracts, deviations and the hosting facts), `README.md` (the feature
  tour section "Multiplayer, comments, sharing and accounts", the counts), `docs/README.md` (the
  rows for the round three documents and `docs/security.md`), `skills/*/SKILL.md` (the round three
  prose), `docs/gslides-parity/BUILD-STATUS-3.md`, this file.
- `pnpm install` ran once after the `package.json` edits: "Already up to date" (workspace links
  only; no new package).

The smallest edits in the builders' files, each with a note naming the merge:

- B1 `apps/cli/src/record-actions.ts`: `RecordDeps.access?: { load, save }` threaded into the
  access deps, so the studio's access store (with its etag) stands in for the deck folder's file.
- B1 `apps/cli/src/dispatch.ts`: `picture.materialize` is forwarded to a private dispatcher of
  `@turboslide/materials/actions` (B5's pipeline); the two background writes stay B1's (one write
  per call, the file, url and upload forms through `asset.add`).
- B1 `apps/cli/src/commands/dither.test.ts`: the write path assertion follows the bound pipeline
  (exit 0, files written, nothing missing on the second dry run) instead of the "until it is bound"
  exit 2; the dry run's missing list is `rotated#photo` alone because the committed fixture carries
  its variants now.
- B1 `decks/fixture/gslides`: `turboslide picture materialize` wrote the two variants (four files
  under `assets/`, the `variants` records, revision 2); the untracked `versions/1.json` that write
  produced was removed as the fixture convention has no version log (the CLI's activity test pins
  it); the README rows say the variants are materialized.
- B2 `apps/studio/src/routes/edit.$deckId.tsx`: `pendingComponent: EditorSkeleton, pendingMs: 0`
  (B5 R6, SPEC-3 9.2 E1) and the `picture.dither` row in the page's `on()` table beside
  `block.crop` (B5 R6; the menu row `format.image.dither` toggles through it).
- B2 `apps/studio/src/server/room.ts` `requestIdentity`: a cookieless request the localhost rule
  admits is the checkout holder (`agent:localhost`), as the agent routes already decide (section
  11 item 4).
- B2 `apps/studio/src/server/access.ts` `shareWriteFor`: the share writes over `/api/share`
  dispatch through the deck dispatcher instead of answering 501 (B2 R8's other half).
- B2 `docs/hosting.md`: the rows `TURBOSLIDE_LOCAL_TOKEN`, `TURBOSLIDE_AUTH_RATE_LIMIT`,
  `TURBOSLIDE_PASSKEY_RPID`, `TURBOSLIDE_CSP`, `TURBOSLIDE_EGRESS`, `TURBOSLIDE_WEB_SECURITY`,
  `TURBOSLIDE_PUBLIC_STORE_HOST`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` and the
  sentence on `TURBOSLIDE_SESSION_SECRET` for every dev server (B3 R14f, B4 2.7.9).
- B4 `apps/studio/src/server/actions.ts`: the round three composition of the deck dispatcher
  (section 10); `deckDispatcher(deckId, { request? })`.
- B4 `apps/studio/src/start.ts`: `bindServerSeams()` once per server process (B2 R13, B3 R14a,
  B4 2.4.3e and 2.4.7).
- B4 `apps/studio/src/server/headers.ts` `csrfFilter`: a bearer on the three room routes and GET
  on `/device` and `/api/auth/magic-link/verify` pass (B2 R14, B3 R11); `headers.test.ts` pins the
  new rule.
- B4 `apps/studio/src/server/hosting-plugin.ts`: `layoutBlobClient(process.env)` (B2 R9).
- B4 `scripts/check.mjs` `SERVER_ENV`: `TURBOSLIDE_LOCAL_OPEN=1`, `TURBOSLIDE_AUTH_RATE_LIMIT=off`.
- B4 `apps/studio/src/server/tokens.test.ts`: the tamper flips the last digit (a fixed replacement
  matched the original one run in sixteen).
- B5 `packages/materials/src/actions.ts`: the `slide.toCanvas` call names `slideIds` (the action's
  input; found by the CLI's real dispatcher), and `picture.materialize` answers `missing` as what
  is still missing after the write.
- B5 `packages/materials/src/dither-actions.test.ts` and `packages/export/src/dither-export.test.ts`:
  the scratch copies drop the fixture's two dither slides and their variants (the tests build
  their own).
- B5 `packages/export/src/gslides-fixture.test.ts`: 29 slides, 28 pages, the two dither rows with
  their `dither:` residual lines (B1's request).
- B6 `packages/chrome/src/FormatOptions.tsx`: `case 'dither'` in the visibility and render
  switches (B5 R7; `DitherFormatSection` with the deck's assets).

## 10. The deck dispatcher after merge 2

`apps/studio/src/server/actions.ts` `deckDispatcher(deckId, { withView?, request? })` registers,
in this order (the later registration of an id wins):

1. the readers (`@turboslide/agent/http/readers`);
2. the CLI's store actions (`picture.dither`, `picture.materialize` as B1's Materializer seam,
   `version.diff` included) and the deck folder actions;
3. the hosted collection actions and `slide.import`;
4. B1's record actions over the studio's store (`RecordDeps.store` is the hosted store with the
   mirror folder as `dir`, the state folder is the repository's `.turboslide/`, the origin is the
   request's, the caller is the request's identity, the file and url forms of a background
   picture run the materials package through the lazily loaded asset dispatcher, the name rules
   are `@turboslide/identity/names`, the access record goes through `hostedAccessHooks`);
5. B2's stream path for the twelve comment ids (`commentCallerFor(request, deckId, id)` then
   `runCommentAction`; a denial becomes `ForbiddenError`, `GoneError` or `RangeError`) and B2's
   inbox for the three notification ids, when a request is in scope;
6. `admin.migrateStorage` (B2);
7. B3's account and admin ids with `requestIdentity(request)` as the facts, `setResponseHeader`
   for Forget this browser, when a request is in scope;
8. the materials package's `asset.add`, `asset.dither`, `asset.capture`, `material.capture`,
   `material.list` and `picture.materialize`, loaded on first call with `allowPaths: false`,
   `hosted`, `readUpload`, the dispatcher for the canvas conversion, and `deleteUpload` after an
   `asset.add { upload }`;
9. the worker actions and `admin.flag`; `view.goto` when a page is attached.

The caller (`callerFactsFor`): B3's `requestIdentity` mapped to the record functions' `Caller`
(the account's principal id, email and admin flag; an API key as `agent:<tokenId>`; the
anonymous cookie's id) and to the author the server derives; a cookieless request the localhost
rule admits is the checkout holder `agent:localhost` with `admin: true` (section 11 item 4);
without a request (a unit test) the caller is anonymous over the files.

## 11. The stage 2 requests, and where each went

B1 (b1.md stage 2): the four export map entries and the two dependencies are done (section 9);
`./record-actions` is exported and the studio calls `registerRecordActions` (section 10); the
`Materializer` seam stays in `store-actions.ts` and the CLI forwards `picture.materialize` to the
materials package instead, which carries the pipeline (section 12 item 2); B2's `withLock` export
is not made (the CLI's `records/lock.ts` keeps its copy of the protocol, recorded); `flags` on
every `text.splice` from the caret run, `shiftAnchors` inside `FileStore.write`, the schema's
comment functions in the hosted comment store and the room's channel behind
`DeckSource.subscribe` are B2's fixer round items (recorded in BUILD-STATUS-3); `resolveKey` on
the MCP route (B1 to B4) is a fixer round item (the route keeps the bearer rule of
`requireAgentAuth`, so an API key is accepted but its sessions are not bound to the key record);
`comment link` prints the `?comment=<threadId>` form (done by B1); B5's fixture count pins are
updated (section 9); B6's font stacks are B6's (recorded).

B2 (b2.md R7 to R20): R7, R8, R9 done (section 9); R10 waits on the private store (section 14);
R11 is B6's fixer round item (the round two `text-editing.spec.ts`); R12 done (section 10, with
the caller built from the request); R13 done (`bindServerSeams`); R14 done (the CSRF filter); R15
not made (B6 never confirmed the header; the twenty participant walk of `presence.spec.ts` skips
or fails on the memory channel, recorded); R16 to B1's fixer round (the CLI's `FileStore` does
not shift the anchors of a checkout's comments on a CLI write yet); R17 not made (the digest
queue is not wired, so no digest mail exists to unsubscribe from; `/api/notify/unsubscribe` stays
501, recorded); R18 answered (`redisCommands()` is what `bindServerSeams` adapts); R19 to B6 and
B2's fixer round (the route passes `presence`, `sync`, `access`, `account` and the reject card;
`save.changedSinceOpen`, `identities`, `activity`, `diffVersions` and the account sign in
callbacks are not passed yet); R20 was already fixed in B3's `identity.ts` (the state folder is
passed).

B3 (b3.md R9 to R16): R9 done; R10 waits on Kevin's domain; R11 done (GET on `/device` and the
magic link verify URL pass the CSRF filter; the `test.fail` marker in `accounts.spec.ts` now
fails as an unexpected pass and is B3's fixer round row); R12 half done (the two switches are in
the Playwright and check runner environments; the default of `localTokenRequired` is not
flipped, section 12 item 6); R13 done for the dispatcher (the twelve account and admin ids
answer on every transport with the request's identity; the author of `runDeckActionFn` stays
B4's `authorFor(ctx, body.author)`, which is the session's when there is one); R14a done in part
(`findShareLink` over the access store and `deckIndex` over the index are bound;
`bindInvitations`, `onLinkGrant`, `onLinked`, the session registry's `principalId`, the Redis
runtime, the digest queue and the `x-turboslide-forget` mirror clear are fixer round items for
B2); R15 to B1's fixer round (`turboslide login` runs the device flow already; `closeAgentSessions`
is not bound; `--avatar-png` is not wired); R16 to B6's fixer round (the chrome draws the mark
from its own cells until it imports `renderMarkSvg`).

B4 (b4.md 2.4 and 2.7): 2.4.1 done; 2.4.2 done by B5 during the stage; 2.4.3 to B2's fixer round
(the page nonce on the adapter, `htmlFrame` in the editor's live renders, the thumbnail grant,
`sanitizeHtmlBlock` on the write path and in the bundle importer, the flag and limiter binds in
the room routes; the access store binding is done from `start.ts`); 2.4.4 done in part
(`allowPaths`, `hosted`, `readUpload` and `dispatch` are passed, `deleteUpload` runs after an
`asset.add { upload }`; `maxBytes` per tier and `htmlFrame` in the render worker are fixer round
items); 2.4.5 to B1's fixer round (the lint fix rule calls the sanitizer already per b1.md; the
CLI's `build` does not pass `htmlFrame`); 2.4.7 done in part (the Upstash and Redis binds exist
in `bindServerSeams` and take effect when the variables are set; `TURBOSLIDE_PUBLIC_STORE_HOST` is
not set on the preview because the preview's environment is passed per deployment; the WAF
rules are not applied, section 14); 2.7.9 done (`docs/hosting.md`); 2.7.10 to B2's fixer round.

B5 (b5.md requests 1 to 9): 1 done; 2 done by B1 (the fallback face); 3 done in part (the CLI's
`picture materialize` runs the pipeline; `block.resetImage` does not add `dither: null` and the
standalone build's `inlineAssets` does not include the variants' twins yet: B1's fixer round); 4
done by B1 with the variants materialized at this merge; 5 done in part (the deps; the two
background ids stay the record actions', section 12 item 2; the `authorize.ts` import chain of
the client graph is fixed through `sessions.server.ts`, section 12 item 8); 6 done in part
(`pendingComponent`, the `picture.dither` row; `picture.materialize`, `slide.setBackgroundPicture`
and `slide.setBackgroundMaterial` were routed through `runDeckAction` already; `uploadingBytes`
and `PictureTarget.dither` are B2's fixer round items); 7 done for `FormatOptions.tsx`
(`PicturesPanel`'s object material section, `ViewerShell.initialPresent`, the `data-boot-*` rules
and the presenter's fixed boxes are B6's fixer round items); 8 to the verifier; 9 to B4's fixer
round (the two `eval` CSP reports from the dev server's dependency chunk).

B6 (b6.md requests 1 to 7): 1 to B2's fixer round (R19 above); 2 not made (R15 above); 3 done
(the `./marks-render` export; the swap is B6's); 4 resolved (the editor boots: B2 and B4 moved
the `node:` and `@tanstack/react-start/server` imports out of the client graph during the stage,
the boot probe of section 13 confirms it, and the production build passes after the sessions
split of section 12 item 8); 5 to B1's fixer round (the hue exception of `lint --chrome`); 6
nothing to do; 7 to the verifier.

## 12. Deviations and decisions at merge 2, recorded for the verifier and Kevin

1. The account boundary held: no Marketplace product, no private Blob store, no WAF rule
   applied, no sending domain. The preview runs on the blob channel, anonymous identity and
   captured mail; its environment (`TURBOSLIDE_MAIL=capture`, `TURBOSLIDE_AUTHORIZE=shadow`,
   `TURBOSLIDE_REALTIME=blob`, `TURBOSLIDE_SESSION_SECRET`, `TURBOSLIDE_DOWNLOAD_SECRET`) was
   passed per deployment with `vercel deploy -e`, the two secrets generated with `openssl rand`
   and never printed, so the project's stored environment (preview and production hold
   `TURBOSLIDE_TOKEN` and `BLOB_READ_WRITE_TOKEN` only) is unchanged. The private store of SPEC-3
   11.4 was not created: the migration has run on the fake only (B2's `migrate.test.ts`) and its
   dual read window on the preview store needs `TURBOSLIDE_BLOB_PRIVATE_TOKEN`, which only the
   store's creation yields; the decision is left to Kevin with the runbook of `docs/hosting.md`
   section 10 (the CLI command `vercel blob store add turboslide-private` and the token into the
   preview environment, then `turboslide admin migrate-storage plan`, `copy`, `verify`).
2. Two implementations of `picture.materialize`, `slide.setBackgroundPicture` and
   `slide.setBackgroundMaterial` landed (B1's in `store-actions.ts` and `record-actions.ts` with
   the `Materializer` seam and the `addAsset` hook, B5's in `@turboslide/materials/actions` with
   the pipeline and a `dispatch` for the canvas conversion). The merge keeps B5's
   `picture.materialize` (the only one that renders) and B1's two background writes (one write
   per call, which B1's CLI test pins as `revision + 1`, and the file, url and upload forms
   through `asset.add`) on the CLI and the studio alike; B5's background writes stay exported and
   unit tested. The `slide.toCanvas` call inside B5's `slideSetBackgroundPicture` named `slideId`
   where the action wants `slideIds`, and its `missing` answer kept the rows it had just
   rendered; both are fixed in B5's file.
3. The fixture deck carries the materialized variants of its two dither slides (revision 2, four
   files under `assets/`, the `variants` records with the metrics at scale 2): the export path
   writes the variants under the deck on the first export, so every run of the export tests and
   of check step 22 left four untracked files in the fixture; materializing them once through the
   CLI makes the committed fixture the state every export reads, `picture/plate-clear` measures
   the plate, and the two B5 tests that build their own dithered slides strip the fixture's from
   their scratch copies. The fixture keeps no version log (its convention; the CLI's activity test
   pins it), so the `versions/1.json` the write produced was removed.
4. A cookieless request the localhost rule admits is the checkout holder `agent:localhost` on
   both identity paths (B3's `requestIdentity` mapped in `actions.ts`, B2's in `room.ts`). Without
   this the identity middleware minted a fresh anonymous principal for every cookieless call, so
   on the merge 2 walk `share.setGeneralAccess` wrote a record owned by one caller and the next
   `share.get` from the same curl was a stranger (404). The agent routes already decided the
   localhost caller as the admin (`bootstrapAgentContext('localhost')`); the record and comment
   paths now agree. Hosted, nothing changes: the rule needs `agentAuth` to answer `localhost`.
5. `presence.list` and `sync.status` over HTTP and MCP answer from the CLI's file records under
   `.turboslide/`, not from the room's roster; the window transport answers from the room client.
   The room exposes no roster reader today; a fixer round item for B2.
6. `TURBOSLIDE_LOCAL_TOKEN=require` is not made the default (b3.md R12's second half): the two
   switches are in the Playwright and check runner environments, and the flip would have changed
   every builder's dev server rule and the verifier's walks at merge time. A fixer round decision
   for B3 with the verifier.
7. The CSRF exemptions (a bearer on the three room routes; GET on `/device` and on the magic
   link's verify URL) are narrower than B3's alternative of accepting `Sec-Fetch-Site: none`
   everywhere: only the two navigation pages and the bearer surface change.
8. The production build failed on the first preview deploy with the import protection rule
   (`@tanstack/react-start/server` reached from the client through `edit.$deckId.tsx` →
   `useStudioSession.ts` → `server/sessions.ts` → `server/room.ts` → `server/authorize.ts`); the
   dev server only warns, which is why the stage's servers ran. The server half of `sessions.ts`
   (`sessionDirectory`, `identityOfRequest`, `attachedPagesOf` and the `getRequest` import) moved
   to `apps/studio/src/server/sessions.server.ts`; the handlers are its only callers and the
   client transform drops them. `pnpm build` and `check-client-bundle` pass after it (the studio
   function bundle is 10.6 MB of `dist/server` against 7.2 MB at merge 1, the client 4.1 MB
   against 3.8 MB).
9. The `overwrite: true` grep of check step 6 (B4) names two record writers of B2 that are not
   asset writes: the comment sidecar's thread and author files and the migration's meta file; both
   files join the allowlist with the reason.
10. `share.emailCollaborators` answers 501 by design (round four); it is the one GS3 id that
    does not resolve, and the walk records it as such.
11. The vitest budgets under load (VERIFICATION-2 section 14) showed again on the tree runs: a
    5 s timeout of the CLI's canvas, gslides and freeform browser tests and of the schema's
    10,000 pair property test, and the realtime contention wait, each under a load average above
    ten with a build or a deploy beside; every file passes alone within budget. No test was
    weakened; the property test alone runs in 2.7 s.
12. The `tokens.test.ts` tamper (`token.slice(0, 31) + '0'`) matched the original token one run
    in sixteen; it flips the digit now. The `headers.test.ts` list of GET filtered routes drops
    `/device` and pins the new rule.

## 13. The walks of merge 2

The boot probe (`.turboslide/int2-boot-probe.mjs`, one Playwright page against a dev server on
4321 with `TURBOSLIDE_STORE=tmp TURBOSLIDE_REALTIME=memory TURBOSLIDE_LOCAL_OPEN=1
TURBOSLIDE_MAIL=capture TURBOSLIDE_AUTH_DB=.turboslide/auth-int2.sqlite` and fake secrets): `/new`
studio ready and settled in 8,318 ms cold (the dependency optimizer's first pass) with no page
error, `/edit/gt-brand` in 2,636 ms with no page error; the console lines counted as errors are
the TanStack devtools relay of the server's hosting log, as at merge 1. B6's boot blocker
(`node:fs` reached through `lease.ts` in the browser) is gone in the tree the builders left.

The action walk (`.turboslide/int2-actions-walk.mjs`, the 64 GS3 ids over `POST /api/actions` on
the same server as a cookieless localhost caller):

- 62 of 64 GS3 ids answer their contract on `GET /api/actions/<id>`; `deck.follow` is offered on
  the CLI alone (404 by design) and `account.forget` is offered on the window transport alone.
- Every id posted with its table example resolves: 22 answered 200, 5 answered 400 (the
  example's input against the deck: `presence.follow` and `presence.unfollow` need an attached
  page, `account.tokens.create` wants a signed in caller, `admin.mail.list` is the admin's,
  `slide.setBackgroundPicture` refuses gt-brand's dithered asset as a source), 14 answered 404
  (the example's thread id, revision, key or slide does not exist on gt-brand), 13 answered 409
  (a stale access record revision, as the record functions refuse), 1 answered 501
  (`share.emailCollaborators`, round four by design), and 9 destructive or account changing ids
  were walked with real inputs below. No id answered 500.
- The real walk: `comment.add` on the first slide, `comment.list`, `comment.reply`,
  `comment.resolve`, `comment.reopen`, `comment.get`, `notification.list`, `activity.list`,
  `share.get`, `share.setGeneralAccess` (link, viewer), `share.createLink`, `share.get`,
  `share.revokeLink`, `share.get`, `share.stop`, `share.get`, `deck.publish`, `deck.unpublish`,
  `presence.list`, `sync.status`, `account.me`, `admin.flag` (read), `picture.materialize`
  (dryRun) and `version.diff`: 22 of 24 steps 200 on the first pass after the identity rule of
  section 12 item 4 (before it, every share write after the first met a stranger's 404). The two
  misses were `comment.reopen` and `comment.get` answering 404 `no thread <id>` right after a
  `comment.resolve` on that thread; a probe of the same sequence (add, resolve, reopen, get)
  five times over answered 200 on every call in 15 to 18 ms, so the miss is intermittent (one of
  six sequences) and is recorded for B2's fixer round with the thread id in the walk log
  (`.turboslide/int2-dev-4321.log`).
- `comment.list` hides resolved threads by default (Google's behaviour); `comment.get` answers a
  resolved thread.

The CLI walk (`node apps/cli/e2e/share.mjs`): 19 of 19 steps pass on a temp copy of the fixture
deck before and after the fixture's variants were materialized (comment add, reply, resolve,
comments --for-me, share access, link, get, stop, deck publish, unpublish, block dither, picture
materialize --dry-run, slide background-picture --asset --dither at 2.2 s, presence list, sync
status, account me, notifications --unread, version diff, validate).

The preview (section 14): `node scripts/hosted-smoke.mjs --base <preview> --token-env
TURBOSLIDE_TOKEN` with `VERCEL_OIDC_TOKEN` from `vercel env pull` in the environment answered
18 of 19 rows on the second deployment (`turboslide-j5fgvlyz3`): every page route, the asset
twin, the bearer rule (401), every header on four routes with the report only CSP and the
`/embed` exception, the cross site `text/plain` POST 415, the unsigned thumbnail served and
logged in shadow mode, the CSP report endpoint 204, `deck.info` over the bearer (revision 31, 0
snapshots on the blob store); five rows skip with the flag they need (the `/s/` exchange, the
410 after unpublish, the private document 403, the twin URL, the restricted 404). The one
failure was the json asset attachment row: gt-brand's `liquid-metal-diamond.recipe.json` went
out inline with no policy, because the seed deck's twins are static files the CDN answers before
the asset route runs; the third deployment carries a Build Output route that stamps the
attachment headers on `.json` and `.svg` under `/decks/*/assets/` (section 9, B4's
`vite.deploy.config.ts`).

Two more edits landed while the chain ran, both the smallest in a builder's file with a note:

- B1 `packages/lint/src/chrome.ts`: the hue exception of SPEC-3 4.9 and 16.5 (b6.md request 5).
  `TURBOSLIDE_CHROME.active` gains `.ts-chip.is-self` (the own chip's ink ring is a state, not a
  seam), and a `collab` selector (`.ts-flag`, `.ts-remote-outline`, `.ts-remote-caret`,
  `.ts-remote-pointer`, `.ts-following-plate`, `.ts-chip-stripe`, `.is-following`, `.has-halo`)
  with `collabColors` (the six hues `#2f5ce0`, `#789000`, `#0f6a6a`, `#1d8fc8`, `#148d51`,
  `#5533ff` and the halo values `#070707`, `#ffffff`, exported as `COLLAB_COLORS`) lets those
  elements and their direct children draw those colours as a border or an outline and nothing
  else. Found by check step 18: `lint --chrome` on `/edit/gt-brand` reported the own chip's ink
  ring at every width and theme (24 audits with findings); the lint package's 71 tests pass.
- B4 `apps/studio/vite.deploy.config.ts`: a Build Output route (`vercel.config.routes`, placed
  before the platform's by the preset's `defu`) stamps `content-disposition: attachment`,
  `x-content-type-options: nosniff`, `content-security-policy: sandbox; default-src 'none'` and
  `cross-origin-resource-policy: same-site` on `/decks/*/assets/*.json|svg` with `continue`, so
  the seed deck's twins the CDN serves carry the asset route's rule (section 13).

## 14. The preview

Three deployments from the repository root with `vercel deploy --yes --archive=tgz` and the
environment of section 12 item 1 passed per deployment:

1. The first build failed on the import protection rule (section 12 item 8); no URL was served.
2. `https://turboslide-j5fgvlyz3-kl01s-projects.vercel.app`: built in 46 s; the smoke answered
   18 of 19 (the json attachment row failed on the CDN served seed twin).
3. `https://turboslide-igavfcg2x-kl01s-projects.vercel.app`: the Build Output route for the two
   non raster types; the smoke answered 19 of 19 with the refreshed development token (the first
   run against it answered 403 `TRUSTED_SOURCES_ENVIRONMENT_MISMATCH` on every row because the
   development OIDC token pulled twenty minutes earlier had expired; `vercel env pull` again and
   the rows passed; `vercel curl` reached the deployment throughout). This is the preview the
   verifier measures.

The preview runs the degraded tiers: the blob channel (`TURBOSLIDE_REALTIME=blob`), anonymous
identity with the name prompt (no `DATABASE_URL`, so the magic link and the code are disabled with
the row saying why), captured mail, `authorize()` in shadow mode, the public Blob store alone (no
private store, so the storage migration did not run hosted). Deployment protection stays on:
every probe carries `x-vercel-trusted-oidc-idp-token` from the linked project's development
token (`vercel env pull` into a gitignored file under `.turboslide/`, never printed), or goes
through `vercel curl`. The WAF rules were not applied (the account boundary; the ship step's
plan review).

## 15. Commands run at merge 2 and their results

Every command ran from the repository root unless a row says otherwise; the dev servers of this
merge ran on 4321 (the integrator's port) and the production preview on 4344, and every one was
stopped before the merge ended.

| Command                                                                                                                       | Result                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install` after the `package.json` edits                                                                                 | Already up to date (workspace links only)                                                                                                                                                                                                                            |
| `node_modules/.bin/tsc -b` (after every batch of edits)                                                                       | exit 0                                                                                                                                                                                                                                                               |
| `pnpm generate:contracts` twice                                                                                               | 14 files current, twice                                                                                                                                                                                                                                              |
| `cd apps/cli && vitest run`                                                                                                   | first run 3 failed of 124 in `dither.test.ts` (the materials registration changed the CLI's behaviour; section 12 item 2) and one 5 s timeout in `canvas.test.ts` under load; after the edits 20 files, 123 passed, 1 skipped in the tree run                        |
| `cd packages/materials && vitest run src/dither-actions.test.ts src/catalog.test.ts`                                          | 4 failed of 16 on the fixture's new slides and the `slideId` input, then 2 failed on the fixture's variants, then 16 passed                                                                                                                                          |
| `cd apps/studio && vitest run`                                                                                                | 2 failed of 156 (`headers.test.ts` pinning the old `/device` rule; the `tokens.test.ts` tamper matching the token), then 156 passed; 156 passed again after the sessions split                                                                                       |
| `cd packages/chrome && vitest run`                                                                                            | 52 files, 474 passed                                                                                                                                                                                                                                                 |
| `cd packages/export && vitest run src/gslides-fixture.test.ts`                                                                | 15 passed at 29 slides and 28 pages (76 s, then 54 s over the materialized fixture)                                                                                                                                                                                  |
| `cd packages/export && vitest run src/dither-export.test.ts`                                                                  | 3 failed of 4 on the duplicated play list ids, then 4 passed                                                                                                                                                                                                         |
| `cd packages/schema && vitest run src/transform.test.ts` alone                                                                | 24 passed in 3.2 s (the tree run timed the property test out at 5 s under load)                                                                                                                                                                                      |
| `cd packages/lint && vitest run`                                                                                              | 10 files, 71 passed (after the hue exception)                                                                                                                                                                                                                        |
| `cd packages/agent && vitest run src/__tests__/skills.test.ts`                                                                | 9 passed (the api skill at 50 lines after the fold)                                                                                                                                                                                                                  |
| `node apps/cli/bin/turboslide.mjs picture materialize --deck decks/fixture/gslides --author integrator --json`                | revision 2: 2 written (four files), 0 pruned, 0 missing; `validate` 29 slides, 0 errors, 0 warnings                                                                                                                                                                  |
| `node apps/cli/e2e/share.mjs` (before and after the fixture's variants)                                                       | 19 steps passed, twice                                                                                                                                                                                                                                               |
| the boot probe on 4321 (tmp store, memory channel)                                                                            | `/new` ready and settled in 8,318 ms cold, `/edit/gt-brand` in 2,636 ms, no page error                                                                                                                                                                               |
| `node .turboslide/int2-actions-walk.mjs http://localhost:4321` (three runs)                                                   | 62 of 64 contracts on GET; the example POSTs 22 × 200, 5 × 400, 14 × 404, 13 × 409, 1 × 501 (`share.emailCollaborators`), no 500; the real walk 11 of 19 before the identity rule, 22 of 24 after it (the two misses the intermittent `no thread` 404 of section 13) |
| `node scripts/check.mjs --only 1,2,4,5,6` (log a)                                                                             | 1, 2, 4 ok; 5 FAIL on `dither-export.test.ts` (3, the play list ids) and `dither-actions.test.ts` (2, the fixture's variant files) under a load average of 7 to 9                                                                                                    |
| `node scripts/check.mjs --only 5,6` (log b)                                                                                   | 5 FAIL on `comment.test.ts` (the fixture's version log), a 5 s timeout of `gslides.test.ts` and of the schema property test, load average 18 to 21                                                                                                                   |
| `node scripts/check.mjs --only 5` (log c)                                                                                     | 5 FAIL on `skills.test.ts` alone (the api skill at 57 lines)                                                                                                                                                                                                         |
| `node scripts/check.mjs --only 6` (log d)                                                                                     | `pnpm build` ok (the studio server 10.6 MB, the client 4.1 MB), `check-client-bundle` ok, `--greps` FAIL on three `overwrite: true` sites of B2's record writers; `--greps` ok after the allowlist                                                                   |
| `node scripts/check.mjs --only 5` (log e)                                                                                     | ok: 260 files, 2,801 passed, 3 skipped in 109.1 s                                                                                                                                                                                                                    |
| `node scripts/check.mjs --only 7,...,28` (log f)                                                                              | 7 to 17 ok (the import at 85 slides, 8 sections, 0 escapes; validate; 170 renders; compare-to-shoot; the sheets at 85 cells; lint; the build under 16 MB; `viewer.spec.ts` 33 s); 18 FAIL after 92 s on the own chip's ink ring (24 audits with findings)            |
| `node scripts/check.mjs --only 18` (log g)                                                                                    | ok in 115.9 s after the hue exception: 24 and 6 audits, 0 with findings                                                                                                                                                                                              |
| `node_modules/.bin/prettier --check .`                                                                                        | the only misses are the other workflow's untracked `research-4/`, `design-4/` and `verification-4/` files; step 19 fails on them alone                                                                                                                               |
| `vercel deploy --yes --archive=tgz -e ...` (three times)                                                                      | the first build failed on the import protection chain (section 12 item 8); `turboslide-j5fgvlyz3` built in 46 s; `turboslide-igavfcg2x` built with the attachment route                                                                                              |
| `node scripts/hosted-smoke.mjs --base <preview> --token-env TURBOSLIDE_TOKEN` with `VERCEL_OIDC_TOKEN` from `vercel env pull` | 18 of 19 on `j5fgvlyz3` (the json attachment row); 2 of 19 on `igavfcg2x` with the expired development token (403 `TRUSTED_SOURCES_ENVIRONMENT_MISMATCH` on every row), then 19 of 19 after `vercel env pull` again                                                  |
| `vercel curl <preview>/decks/gt-brand/assets/liquid-metal-diamond.recipe.json -D -`                                           | 200 with `content-disposition: attachment`, the sandbox CSP, `nosniff` and `same-site`                                                                                                                                                                               |

## 16. State at the orchestrator's cutoff

The orchestrator asked for the report while `node scripts/check.mjs --only 20,...,28` (log
`.turboslide/int2-check-h.log`) was on step 20, the parity audit, with the runner's dev server on
4321 and the production preview on 4344 answering. The chain stops its own server when it ends;
a watcher stops the 4344 preview and removes the pulled environment file the moment the chain's
process exits, so no server outlives the run. The results of steps 20 to 28 are in that log for
the verifier, who reruns any step that did not exit 0; BUILD-STATUS-3.md's table names them as
recorded here. Every other item of the merge 2 list is done and recorded in sections 8 to 15.

## 17. Fix round (day 9, 2026-09-13): the integrator's findings of VERIFICATION-3

The fixer round of MILESTONES-3 for the list the orchestrator handed the integrator (the
findings of VERIFICATION-3 section 11 numbered 4, 5, 7, 8, 12, 25, 26, 28 to 32 in the verifier's
numbering), on the shared checkout with the six builders' fixers working beside (B6 edited
`packages/viewer/src/Gestures.tsx` and B2 the stream route during this round; nothing of theirs
was touched). As the integrator, every edit below resolves a seam between two builders' files and
is the smallest edit with a note naming this round. No git write command ran; the other workflow's
untracked `.github/`, `research-4/`, `design-4/`, `verification-4/`, `SPEC-4.md` and
`MILESTONES-4.md` were not touched. The fixer's dev server ran on 4321 (the integrator's port)
with the check runner's environment (`TURBOSLIDE_REALTIME=memory`,
`TURBOSLIDE_AUTH_DB=.turboslide/auth.sqlite`, `TURBOSLIDE_MAIL=capture`,
`TURBOSLIDE_LOCAL_OPEN=1`, `TURBOSLIDE_AUTH_RATE_LIMIT=off`, `TURBOSLIDE_EXPORT_BATCH=3`, the file
store) and obviously fake session and download secrets, and a `vite preview` of `pnpm build` on
4344 for the layout shift audit; `.turboslide/e2e.lock` was taken before every Playwright run and
both servers were stopped before this report.

### 17.1 What changed, by finding

| Finding (verifier's number)                                                           | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Files                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7 (`tsc -b` fails in `vite.deploy.config.ts`)                                         | `version: 3` on the Build Output config object of the attachment route.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `apps/studio/vite.deploy.config.ts`                                                                                                                                                            |
| 4 (a new deck gets no access record; two synthesizers)                                | `recordNewDeck(deckId, ctx)` in `server/access.ts` writes SPEC-3 6.1's record (restricted, the creator its owner, `legacyAssetKey`, revision 0) with `ifMatch: null` through the cached access store, so the cache drops on the write; it runs at the draft's first save (`write.ts`, before the write's decision), on `deck.create` and `deck.copy` from the server functions (`decks.ts`) and from the dispatcher (`actions.ts` `registerHostedDeckActions` takes the caller's context; a cookieless localhost call is the checkout holder `usr_checkout`, a request with no identity writes none). `hostedAccessHooks.load` answers the legacy open record for a deck nobody claimed instead of null, so the record functions and `decide()` read one record on the studio (the CLI on a checkout keeps the folder holder's synthesis).                                                                                                                                           | `apps/studio/src/server/{access,decks,write,actions}.ts`, new `apps/studio/src/server/access-record.test.ts`                                                                                   |
| 5, 25 (the editor offline on the blob tier; presence 403)                             | The client id is 16 hex of nonce and 16 hex of an HMAC over the deck and the identity under the session secret (`mintClientId`); `clientBoundTo(room, clientId, identity)` takes the channel's binding when it exists and the id's own MAC when this instance holds none, then stores the binding, so the ops and presence routes admit the session's id on any function of the blob tier and refuse a foreign id everywhere. `admitOps` and the presence route use it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `apps/studio/src/server/room.ts`, `apps/studio/src/routes/api/decks.$deckId.presence.ts`, new `apps/studio/src/server/client-binding.test.ts`                                                  |
| 8, 31 (the one prompt blocks the menu bar; step 21)                                   | `Dialog` takes `modal={false}`: no scrim, no focus trap, no focus taken, Esc and Enter kept, the card at the bottom right above the status bar (`.ts-dialog-float`). The name prompt uses it, drops `autoFocus`, and `EditorShell` draws it beside the dialog slot (never as the shell's `dialog`, which gates the keys) while no real dialog is open. The route's `namePromptDue` logic is unchanged: the card still opens after the inline session ends.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `packages/chrome/src/Dialog.tsx`, `Dialog.css`, `dialogs/NamePrompt.tsx`, `EditorShell.tsx`, `__tests__/dialog.test.tsx`                                                                       |
| 12 (Forget this browser)                                                              | The own chip's row opens the `forgetBrowser` dialog (new in `DIALOG_IDS`): ACCOUNT.forgetConfirm as the lead, Cancel, one solid Forget this browser button (`dialog.forgetBrowser.confirm`). Forget, and the window API's `account.forget`, run the server action (the new principal and its cookie), clear the IndexedDB pending mirror and the `turboslide:` keys of localStorage together (`clearPendingMirror`) and reload the page as the new visitor, so the own chip, the page's principal and the cookie mirror change as one.                                                                                                                                                                                                                                                                                                                                                                                                                                               | `apps/studio/src/routes/edit.$deckId.tsx`, new `packages/chrome/src/dialogs/ForgetBrowser.tsx`, `editor-shell.ts`, `EditorShell.tsx`, `packages/realtime/client/pending-store.ts` and its test |
| 26 (layout shift, the integrator's part)                                              | The save words cell is as wide as the longest of the five phrases through a `::after` sizer (`data-longest`), and the offline phrase is the room client's `offline` alone, never `connected === false` (the server painted the long sentence and the clock moved 158 px when the stream connected). The boot attributes of `__root.tsx` paint the saved geometry before the shell's mount effect: `html[data-boot-sb='0']`, `[data-boot-mode='grid']` and `[data-boot-present='1']` close the column and hide the list until the settle, `[data-boot-density='outline']` sets the 208 px width. The audit script sends `x-vercel-trusted-oidc-idp-token` from `VERCEL_OIDC_TOKEN` and declares `.ts-panel` and `.ts-notes` for the panel state.                                                                                                                                                                                                                                      | `packages/chrome/src/TitleRow.tsx`, `TitleRow.css`, `ViewerShell.css`, `scripts/layout-shift-audit.mjs`                                                                                        |
| 28 (the captured sign in code is null)                                                | The specs read `TURBOSLIDE_AUTH_DB` from their environment with the runners' default `.turboslide/auth.sqlite`; both hard coded B3's `auth-b3.sqlite`, so the seed opened a database the runner's server never wrote.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `apps/studio/e2e/accounts.spec.ts`, `agent-http.spec.ts`                                                                                                                                       |
| 23, 29 to 32 (the state shapes, the dither budget, the upload status, presence row 2) | `describe().state.presence` carries `self`, `others[]` (the participants as `presence.list` answers them) beside `clientId`, `count` and `following`; `describe().state.access` carries the record's fields (`deckId`, `revision`, `owner`, `pendingOwner`, `generalAccess`, `links` and `publish` without their hashes, `grants`, `requests`, `settings`, `claimable`) beside `role`, `via`, `capabilities` and `mode`. `Thumb` asks for a capture and mounts its live clone only within two viewports of the row (an IntersectionObserver; at once where none exists), and the editor's `warmThumbnails` call answers at once and runs the job detached, so a fresh full copy no longer holds the browser's connections while its 170 captures render. The Show my pointer toggle reads `presence.pointerMine` from the snapshot's new `pointerOn`. The share spec's refusal rows read `TURBOSLIDE_AUTHORIZE` as the security spec does and assert the shadow admission otherwise. | `apps/studio/src/routes/edit.$deckId.tsx`, `packages/chrome/src/Thumb.tsx`, `apps/studio/src/server/{warm,thumbs}.ts`, `apps/studio/e2e/share.spec.ts`                                         |

### 17.2 Deviations and decisions of the fix round, recorded for the verifier and Kevin

1. The name prompt is a floating card, not a dialog over the scrim (SPEC-3 7.2 says "over the
   scrim"; 0.18 names the moment, not the form). The modal form took the caret and the menu bar
   from the person whose typing burst had just ended, which is the moment 7.2 fires it, and the
   round two suites met it as a 30 s timeout on every menu click (VERIFICATION-3 finding 8, step
   21). The card keeps the box, the words, the field, Continue and the Sign in link, opens after
   the inline session as before, takes no focus, and Esc closes it. Google shows an anonymous
   animal no prompt at all; the one prompt of S4 stays. Kevin decides whether the scrim comes back
   as a setting.
2. Forget this browser asks first. 7.4 names no confirmation, but `menus/strings.ts` carried
   ACCOUNT.forgetConfirm as a question and the verifier read its absence as a miss (finding 12);
   the own chip's row opens the `forgetBrowser` dialog with the sentence, and the window API's
   `account.forget` acts at once, the agent having asked. Both clear the mirrors and reload the
   page as the new visitor; the reload is the one way every mirror of the identity (the room
   client's binding, the cookie, the shell's principal) changes as one.
3. A deck the studio creates through the bootstrap bearer or the checkout's cookieless localhost
   call is owned by `usr_admin` or `usr_checkout` (the principal `decide()` derives for those
   contexts), so a verifier's probe that copies a deck through the bearer and then opens it in an
   anonymous browser meets a restricted record: admitted in shadow mode with the denial logged,
   404 in enforce mode until a link is minted. That is SPEC-3 6.1's rule applied to agents; the
   probes of `verification-3/preview/` should mint a viewer link or open the copy from the
   browser that made it.
4. The studio's record functions read the legacy open record for a deck nobody claimed
   (`hostedAccessHooks.load`), the same record `decide()` and the loader read, so `share.get` on
   gt-brand answers `owner: null, open: editor` and the Share dialog shows the legacy row with
   Claim. On a checkout's CLI the folder's holder stays the owner (09 1.6), unchanged.
5. `share.spec.ts` runs its refusal rows (the four 404 pages and the 403 write for a stranger)
   only under `TURBOSLIDE_AUTHORIZE=enforce`, as `security.spec.ts` already did; in shadow mode
   it asserts the admission and the restricted record. The check runner's server is shadow mode
   this round (R3), so the rows were unreachable as written.
6. The client id carries a MAC over the deck and the identity. Report 10 F26 asked for a server
   issued id bound to the session; the binding is still stored, and the MAC is what lets a
   second function instance of the blob tier recognise it. A stored binding to another identity
   always wins; an id with a wrong MAC is never admitted; the TTL of a stored binding is not
   carried by the MAC (an instance that never saw the binding admits the id for as long as the
   secret stands). Redis makes the binding shared and the MAC a second check.
7. `warmThumbnails` answers before its job runs. The editor never read the answer; a full deck's
   first warm held one of the browser's six connections to the dev server for the length of a
   170 capture job, and with the HMR socket, the three on demand captures and a session call the
   pool was full, so the room's presence and ops posts of the same page waited behind it
   (finding 32's mechanism, read from the presence spec's trace: a POST issued 100 ms after the
   stream connected had not left the browser 10 s later). The captures land through
   `/api/render` as they render, as before.
8. `Thumb` asks for a capture and mounts its live clone within two viewports of the row alone. A
   fresh 85 slide copy queued 85 captures and 85 clones on open; the visible rows are what the
   filmstrip needs first, and Google's filmstrip renders as it scrolls. The plate (the slide
   number) stands for a row further away until it scrolls near; jsdom has no observer, so the
   chrome tests see the old behaviour.
9. The route's comment and notification handlers schedule the sidecar and inbox re-reads after
   writes alone. Before, `refreshComments` and `refreshInbox` ran through the same handlers
   (`comment.list`, `notification.list`, `notification.settings` with an empty input) and each
   answer scheduled the next refresh 60 ms later: every open editor made the pair of reads about
   thirty times a second, and the `notification.settings` read, a mutating id in the action
   table, spent the deck's `writesPerMinutePerDeck` quota (120 for an anonymous principal) so
   that every write of the tab answered "Too many changes at once. Try again in a minute" within
   a minute of typing. Measured on the two browser walk (rows S1 and S3 failed on that sentence)
   and in the server log (1,766 `notification.settings` calls in one minute of the round two
   suites); the loop predates this round's fixes and is the likeliest cause of a part of the step
   21 failures the verifier attributed to the prompt.
10. The upload type mismatch row (finding 30) passes as written on the fixer's server (400 for an
    SVG body under a PNG grant, 413 over the declared size): not reproduced, so nothing moved.
    The security spec's cross site row and the presence spec's chip row met the same environment
    twice: another Playwright run shared `.turboslide/playwright` and the `decks/` folder during
    the batch (an `ENOENT` on a trace file in the log, `decks/e2e-security` gone under the run),
    which the lock protocol of AGENTS.md is meant to prevent; both rows pass alone.
11. Finding 30's sibling in the verifier's list, the dither budget, is remeasured in 17.3 on this
    machine under the load the other workflow left; the number is recorded as it is.
12. Docker's disk (finding 25 of the check chain, step 25) is Kevin's: 148 images at 99.3 GB with
    56.1 GB reclaimable and 4.8 GB of stopped containers at the time of this round
    (`docker system df`); nothing was pruned per the round's rule, and step 25 stays unrun until
    Kevin frees the disk or accepts a prune.

### 17.4 Requests and what stays open

- B2 (`edit.$deckId.tsx`, `packages/realtime`, the transform): the same box collision of S2
  (two people typing in one paragraph within a second: the second writer's letters do not
  converge; walk row S2, `realtime.spec.ts` row 2), the controller swap of View > Mode
  (VERIFICATION-3 finding 2), the `describe().state` `comments` and `inbox` keys and the
  `EditorShellInput.comments` wiring (finding 1), `signInAvailable` from `/api/auth/ok` (finding
  9). The presence spec's last row (the words B types in the heading arrive in A) waits on a
  `[data-run]` inside the `mood` slide's heading that the canvas does not draw; B6 and B2 read it
  together.
- B2 and B4: the six 500s beside 34 409s under five concurrent writers on the blob store (finding 19) and the per instance quotas on the degraded tier (finding 17) stand as recorded; Redis is
  Kevin's install (section 12 of VERIFICATION-3).
- B3: `/s/<token>` from curl on the preview (finding 18) stands as recorded; the browser exchange
  passes locally in the walk (S3 rows 23 to 26) and in `share.spec.ts`.
- B4 (`scripts/check.mjs`): step 20 still writes round two's `verification-2/parity-audit.json`
  (finding 20); step 21's list is unchanged.
- B5 and B6 (layout shift, finding 26, what this round did not close): the deck route's toolbar
  right group (`.pt-bar-r`, 0.002, the label tier the server cannot know), the outline density's
  tree rows re-laying inside the column (0.117, from 0.99), the home page's footer under the
  filter state and delayed fonts, the presenter's timer hour state, the print bar's 0.0002, the
  presenting variant's stage (0.047), and the `panel` and `inbox` driven states' frame budgets
  (entries in 16 to 18 frames against a budget of 1). Each is the owner's; the numbers are in
  `.turboslide/fix-layout-shift-{quick,deck}.json` of this run and in 17.3.
- B6: the Shift+Tab focus row (finding 13) now passes in `presence.spec.ts`; the tooltip
  primitives of the Dither and picture sections (findings 14 and 15) and the paragraph's shadow
  section (finding 16) are B5's; the crop handles (finding 27) B6's.
- Kevin: Docker's disk (step 25); the decisions of VERIFICATION-3 section 12 stand.

### 17.3 Commands run and their results

Every command ran from the repository root on 2026-09-13 (PDT) with Node 24.13.0 under a load
average between 6 and 26 from another workflow beside this one; the dev server on 4321 and the
`vite preview` on 4344 were the fixer's own and are stopped. The logs are under `.turboslide/fix-*`
(gitignored) on this machine.

| Command                                                                                                                                                           | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node_modules/.bin/tsc -b`                                                                                                                                        | exit 0 at the end of the round (check step 4). Two passes in between failed on other fixers' in progress edits (`packages/viewer/src/Gestures.tsx`, `apps/studio/src/server/actions.ts` `measureCanvas`), both gone by the last pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `cd apps/studio && vitest run`                                                                                                                                    | 22 files, 158 passed before the new tests; `client-binding.test.ts` (4) and `access-record.test.ts` (4) pass alone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `cd packages/chrome && vitest run`                                                                                                                                | 52 files, 475 passed, 1 failed (`inspector-sections` under load), which passes alone with its two siblings (3 files, 32 passed); `dialog`, `editor-shell`, `editor-shell-render` 3 files 61 passed after the Dialog change; `thumb-component`, `sidebar-filmstrip` 2 files 14 passed after the Thumb change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `cd packages/realtime && vitest run`                                                                                                                              | 10 files, 76 passed; `pending-store.test.ts` 7 passed with the two `clearPendingMirror` rows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `prettier --check` on every file this round touched                                                                                                               | clean after `prettier --write` on four of them                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `curl` probes on 4321: `deck.copy` through the localhost caller, then the record file, `share.get` on the copy and on gt-brand                                    | `decks/<copy>/.turboslide/access.json` written at once with `owner: usr_checkout`, `generalAccess: restricted`, revision 0; `share.get` on the copy answers that record; on gt-brand `owner: null, generalAccess: open editor, createdBy: legacy` (one record with the loader)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `curl` upload probe: a PNG grant, an SVG body under it, a 64 byte body under an 8 byte grant                                                                      | 400 "the bytes are not the picture type the upload declared", 413 "the body is over the declared size"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `playwright test accounts share presence security` (step 26, four of eight files; lock taken)                                                                     | 11 passed, 3 failed, 7 did not run in 1.5 min: `accounts.spec.ts` 7 of 7 (the captured code row and the chrome surfaces row included); `share.spec.ts` row 1 passed (the Share dialog opens on Restricted, Copy link holds no token), row 2 failed on the stranger's 404 in shadow mode (17.2 item 5, fixed in the spec since), rows 3 and 4 did not run; `presence.spec.ts` row 1 passed, row 2 failed on the chip (below); `security.spec.ts` 4 passed, the cross site row failed on a 404 of `slide.get` (the deck removed under the run by another Playwright process, 17.2 item 10) and passes alone in 1.1 s, the upload row passes (3.7 s), the enforce rows skipped                                                                                                                                                                                                                                        |
| `playwright test presence.spec.ts` six times while the cause was read                                                                                             | row 2 failed at the chip (0 in 5 s) with the presence POSTs never leaving the browser (the trace: six connections held, `warm` among them), then after the `Thumb` gating and the `warm` change reached the chip in 229 ms, the roster, the outline and the flag, the pointer toggle (after `pointerMine`), the Shift+Tab roster row and the announcements, and fails on the last row: `[data-run]` in the `mood` slide's heading never appears for B's click (17.4, B6 and B2); row 1 passed every time (the five slots at first paint, zero layout shift entries); row 3 did not run                                                                                                                                                                                                                                                                                                                             |
| `playwright test dither.spec.ts` (quiet, load average 6.3)                                                                                                        | 5 passed in 34.7 s; the budget over 200 slider events: p50 32.6 ms, p95 74.6 ms, max 146.5 ms, host p95 19.3 ms, 112 frames drawn (against 100 at the 95th percentile; the verifier read 107.4 under a load average near 11)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `playwright test` the 15 round two specs (step 21; lock taken)                                                                                                    | 33 passed, 22 failed, 11 did not run in 14.8 min (the verifier read 23, 30 and 13). No menu click waited on the prompt. The failures by file: `text-editing` 4 (the typing path emits `text.splice` where the spec expects `text.replace`; the paragraph and paste rows), `ten-tasks` 5 (task 2, 4 with `baseRevision 3 is stale`, 5, 6 and 10 with timeouts), `gslides-actions` 4 (`baseRevision 1 is stale`, `deck.guides` and `block.insert` counts), `deck-transfer` 2, `export-batch` 2 (28 pages where the spec pins 26: the fixture's two dither slides; the cancel answers 403 `forbidden, capability export`), `filmstrip` 2, `charts`, `tables` and `present` 1 each on `locator('.pt-viewer') resolved to 2 elements`, `canvas` 1 (4 expected, 0), `objects` 1 (the 44° readout), `landing` 1 (the robots meta carries a nonce the pattern does not allow), `text-styles` 1. Each is its owner's (17.4) |
| `node docs/gslides-parity/verification-3/walk/two-browser-walk.mjs --base http://localhost:4321 --out .turboslide/fix-walk` (three runs)                          | the first 18 ok and 13 fail on "Too many changes at once" from the refresh loop (17.2 item 9); the second 28 ok and 6 fail, two of them this round's own cleanup removing the walk's deck under it; the third, clean, 31 ok and 4 fail in 36 s: S2's same box collision (B2), the comment reaching B in 2,099 ms against the 2 s bar (the marker, the filmstrip chip and the inbox plate all show), version history with no version rows (B6 and B2), and the stranger after Stop sharing admitted in shadow mode by design. S3 passes end to end (the Share dialog on Restricted, Anyone with the link as Viewer, the `/s/` link, the prospect's `/deck` with no notes, `/edit` in Viewing with View only, the revoked link 404); S1's comment lands on B with the marker, the chip, the inbox line and the resolve seen in 65 ms; the commenter link lands in Commenting with Insert > Comment alone             |
| `pnpm build`, then `vite preview --port 4344` and `node scripts/layout-shift-audit.mjs --base http://localhost:4344 --quick`                                      | 3 tasks built; 10 cells: `new`, `trash` and the framed `embed` at zero; `edit` with no load entry (the clock slot's entry is gone) and two driven state frame budgets (`panel` 16 frames, `inbox` 17); `deck` and `embed` one entry of 0.0021 (`.pt-bar-r`); `decks` the filter state's footer; `present` the timer hour state; `print` 0.0002; `deckPresent` 0.047 and 0.018                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `node scripts/layout-shift-audit.mjs --base http://localhost:4344 --routes deck --widths 1440 --appearances light --no-network --no-states`                       | six cells: `listClosed` 0.0008 (from 0.22), `outline` 0.117 (from 0.99, the tree rows alone), `listClosedOutline` 0.0008, `gridSaved` 0.0027 (from 0.18), `hash` 0.0099 and 0.0021 (from 0.026), the plain cell 0.0021 (`.pt-bar-r` in every cell)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| the refresh loop probe (one editor page on gt-brand held 15 s after settling)                                                                                     | 9 server function calls until settled, 0 in the 15 s after; 0 `notification.settings` and 0 `comment.list` calls in the server log for the window (before the fix: 1,766 `notification.settings` calls in one minute of the round two suites and 5,740 refusals of `writesPerMinutePerDeck` on `notification.settings`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `docker system df`                                                                                                                                                | 148 images, 99.26 GB, 56.09 GB reclaimable; 13 containers, 4.78 GB reclaimable; nothing pruned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| the fixer's scratch decks (`fixer-probe-*`, `fixer-presence-*`, `fixer-full-*`, the walks' `verifier-walk-*`) removed through `deck.remove`; both servers stopped | `decks/` holds no fixer deck; 4321 and 4344 free                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
