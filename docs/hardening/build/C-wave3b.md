# Lane C, wave 3b: build notes

Lane C of the hardening round (`docs/hardening/HARDENING.md` 4.11), wave 3b only: HR-C#16, HR-C#2, HR-C#3a, HR-N#2 (lane N's fuzz harness, given to this lane) and HR-W#5 (lane W's CI workflow, given to this lane). Built on `harden/wave3b` in `/Users/kevinliu/repos/Turboslide-harden4`, made from `origin/main` `f7e97039` (wave 1 complete). Nothing was pushed. Two of Kevin's answers bind this lane: no Rust port (fixes in TypeScript), and yes to the CI workflow scope. Question 9 is open, so HR-C#1 is not built.

Every timing below was read at a one minute load of 300 to 560 and is a record, never a verdict. Counts, bytes and exit codes are the evidence. No server was started: every finding of these pushes reproduces as a test, a scan or a build reading, and port 4864 was never used.

## The commits, in the lane's order

| Push          | Commit     | What it closes                                                                                    | Held for                                   |
| ------------- | ---------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| HR-C#16       | `23714e83` | CRIT-M20: the four docs paths that moved, and `docs/readme/missing-paths.test.mjs`                | nothing                                    |
| HR-C#2        | `f9628dec` | CLEANUP-17: the three NUL bytes, and `scripts/source-bytes.test.mjs`                              | nothing                                    |
| HR-C#2 (fix)  | `d48ec7da` | the NUL test's 5,000 ms default timed out at load 434; it has 120,000 ms                          | rides with HR-C#2                          |
| HR-C#3a       | `d9f08b05` | CLEANUP-9: knip 6.40.0 in the catalog, `knip.json`, check step 34 and `scripts/knip-allow.json`   | nothing; request 1 is read before it ships |
| HR-N#2        | `c85269d8` | RUST-5: the fuzz harness, and the five faults it found fixed in `logo-sanitize.ts`                | nothing                                    |
| HR-N#2 (fix)  | `bd2508fd` | five characters HR-N#2 wrote literally are written as escapes; nothing behaves differently        | rides with HR-N#2                          |
| HR-W#5 (prep) | `d7953d8b` | the CLI version stamp `banner.test.ts` has asked for since the 2026-10-08 entries (2026.1008.3)   | nothing                                    |
| HR-W#5        | `53bde4c7` | RUST-3's CI: `.github/workflows/check.yml`, `.github/dependabot.yml`, the import test's deck skip | nothing; its pin is read after the push    |

## HR-C#16 (`23714e83`)

Reproduction on `origin/main` `f7e97039`: the new test, run before the fixes, failed with exactly the four real missing paths of `research/cleanup.md` 3.3, named by their places: `docs/PRODUCT.md` (`decks/templates/blank/template.json:5`, `firewall/rules.json:2`, `firewall/rules.json:1217`), `docs/gslides-parity/SPEC-3.md` (`firewall/rules.json:2`), `docs/FEATURES.md` (`scripts/build-fonts.py:29`) and `docs/gslides-parity/realtime/build/guard.patch` (`scripts/hosting/README.md:49`). After the fixes: 4 of 4 passed, 107 distinct docs paths named on code lines.

The fixes point at today's paths: `docs/archive/rounds/PRODUCT.md`, `docs/archive/gslides-parity/SPEC-3.md`, `docs/archive/rounds/FEATURES.md`, and for the removed guard patch the commit that removed it (`6276ec07`). R22's firewall description grew past the test's 256 characters with the longer path, so its last clause now says the application rows count per instance, so the rule is the limit (235 characters); Kevin ruled out Upstash, which the old clause named. The blank template's description is the record's note; the template index row carries its own sentence, so no page text changes.

The test reads every tracked file outside `docs/` (code, config, JSON, Markdown, MDX, Python, shell, YAML), skips lines that are only a comment (HR-C#1 leaves comment citations as they are), resolves a path ending in `-` or `_` as a prefix, and lists the two paths absent by design with their reasons. A listed path that is named nowhere or exists again fails, so the list only shrinks.

Checks: `headers.test.ts` (the firewall rules' shape and lengths), `template-index.test.ts`, `templates.test.ts`: 53 passed. Prettier: clean.

## HR-C#2 (`f9628dec`, `d48ec7da`)

Reproduction: NUL bytes on `origin/main`: `digest.ts` 1, `MaterialMount.tsx` 1, `shared.test.ts` 2 (the GIF literal also held two 0x02 bytes). `git log -p -1 f7e97039 -- apps/studio/src/server/auth/digest.ts` printed "Binary files ... differ". After: 0 in each; the strings are the same at run time.

`scripts/source-bytes.test.mjs` reads the 5,574 tracked files of 21 source extensions and fails on any 0x00. In the full scripts project at load 434 it hit vitest's 5,000 ms default (5,660 ms), so `d48ec7da` gives it 120,000 ms. After: 2 of 2 passed at load 431. `digest.test.ts`, `shared.test.ts`, `material-mount-plan.test.ts`: 28 passed.

## HR-C#3a (`d9f08b05`)

knip 6.40.0 is in the catalog and the root's devDependencies. `pnpm install --lockfile-only` (175 s) wrote the lockfile, and it also moved three existing edges to newer versions already in the file: router-core's seroval 1.6.7 to 1.6.8 and router-generator's and router-plugin's zod 4.6.1 to 4.6.5. Those three lines were put back by hand, so the push moves no runtime package; `pnpm install --frozen-lockfile --lockfile-only` passed and left the file byte for byte. The other change outside knip's own 15 packages is tsdown's optional `oxc-resolver` peer (dev only, the CLI's build).

`knip.json` is the research config with four corrections of false findings: `packages/lint/src/brand/main.ts` and `packages/export/src/calibration/run.ts` are entries (scripts run by path), the system binaries the scripts call are ignored, `cloudflare:` imports in the Worker are not a package, and the root's `@turboslide/cli` is used through `pnpm exec turboslide`. With them the default findings fell from 3 files, 30 unlisted, 6 binaries and 3 devDependencies to 1, 19, 0 and 2.

Step 34 (`node scripts/check.mjs --knip`) writes each finding as `<type> <file> <name>`, fails on a finding `scripts/knip-allow.json` does not hold and on an entry knip no longer reports, and `--knip --prune` drops those entries without adding any. It calls `node_modules/.bin/knip`, never `pnpm exec` (see the incident below). The list held 764 findings: files 1, dependencies 11, devDependencies 2, unlisted 19, exports 591, types 133, duplicates 6, catalog 1.

Tested for real: with the full list, exit 0 ("764 finding(s), 764 in scripts/knip-allow.json, 0 new, 0 no longer reported"); with a probe file `packages/identity/src/knip-probe-c3a.ts`, the SectionIcon entry removed and a made-up entry added, exit 1 with two "new finding" lines and one "no longer reported" line; `--knip --prune` with only the made-up entry left, exit 0 and the list equal byte for byte to the committed one. The probe file was removed.

The new step makes `--list` print 34, so `packages/theme/brand/facts.json` (`build-brand.ts --facts`) and `apps/studio/src/components/home/facts-data.ts` (`build-home-assets.ts --facts`) carry 34 and the facts file's new sha256. The page does not print the count. `brand.test.ts`, `facts.test.ts`, `copy.test.ts`: 66 passed.

HR-N#2 shrank the list by five (below). On the working tree with every lane's commits and uncommitted edits so far, the step read 759 findings, 759 listed, 0 new, 0 gone at 02:19, at 03:07 with HR-W#5's files, and at 03:10 after HR-PC#3 (load 196).

## HR-N#2 (`c85269d8`)

`apps/studio/src/server/logo-sanitize.fuzz.test.ts` runs 20,000 cases a run: 8 recorded seeds of 2,500 over the 24 fixture marks and three hostile files. The mutations are elements off the list, attributes and their case, entities, CDATA, comments, prefixes, `url(` and `href` forms with CSS escapes, declarations and processing instructions, nesting of 1 to 20,000 levels, copied slices and byte noise. The oracle is written apart from the sanitizer's helpers: a case is refused with the sanitizer's two errors, or its output reads again with characters XML allows, listed elements and attributes, `#id` hrefs, CSS values that load nothing once their escapes are decoded, words only where words belong, and the same output from a second sanitize. A failure names its seed and index.

Reproduction: the harness against a scratch copy of `origin/main`'s sanitizer (load 351): 1,366 of 20,000 cases failed. 278 threw a RangeError from a reference past U+10FFFF; 175 threw a RangeError from the walk's recursion at 2,000 and 20,000 levels; 398 outputs held a character XML forbids, which no browser reads; 501 kept a `<style>` with `@\69mport`, an escaped `url(` or a quoted address in `image-set(`, `image(` or `-webkit-image-set(`; 42 kept a presentation or `style` attribute with an escaped `url(`. A case with two faults counts twice. The logo route reads any error as a broken file; the upload intake passes a RangeError on as an unexpected error. The renderer draws an svg picture through `<img>` (`headers.ts` 76 to 81), where a browser loads no outside resource, so the CSS gaps were not a live leak on the pages; they broke the module's own rule.

The fixes in `logo-sanitize.ts`: a reference or a character XML forbids is a broken file; an element deeper than 256 levels (libxml2's default limit) is a broken file; every CSS check reads the value with its escapes decoded, and a style refuses a quoted address in `image-set(`, `image(`, `cross-fade(` and `src(`. None was a confusion of the reader, so section 6.1's verdict stands and no `roxmltree` port follows. Three unit tests in `logo-sanitize.test.ts` pin the fixes by name.

HR-N#2 wrote literal characters in five places where it meant escapes (the class's space, U+D7FF, U+E000 and U+FFFD, the decoder's U+FFFD, and the harness's U+FFFD, U+FFFE and U+FEFF): the tool that carried the edit turned the escapes into characters. The expressions matched the same characters; `bd2508fd` writes them as escapes, and no added line of the two files holds a character outside ASCII.

After: 3 of 3 passed; 6,821 cases answered, 13,179 refused, 0 failed. CPU per sanitize call (`process.cpuUsage`, load 345 to 347): 50.4 us over the 20,000 cases, 21.0 us over the 24 unmutated fixtures (22,666 characters, 50 rounds each). `docs/native.md` keeps the reading. The harness imports `KEPT_ATTRIBUTES`, `KEPT_ELEMENTS`, `parseSvg`, `SvgElement` and `SvgNode`, so the knip step reported exactly those five as no longer reported, and the commit prunes them. `logo-sanitize.test.ts`, `logos.test.ts`, `logo-index-snapshot.test.ts` and the studio tests that sanitize an svg: 86 passed. `tsc -p apps/studio --noEmit` reported no error in these files.

## HR-W#5

`.github/workflows/check.yml` runs on every push to main and by hand: checkout (no credential kept), Node 24.13.0, pnpm at `packageManager` with the store cached, `pnpm install --frozen-lockfile` and the route tree (`tsr generate`, check step 2), then four checks that each run once the install passed, whatever an earlier one answered: the audit (step 28), `tsc -b` (step 4), the realtime Worker's tests and `pnpm test` (step 5). The browser tests skip (`TURBOSLIDE_SKIP_BROWSER`, `TURBOSLIDE_SKIP_BROWSER_TESTS`), as do the tests that read the Prototemplate checkout. The actions are pinned by commit: `actions/checkout` `3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1), `actions/setup-node` `820762786026740c76f36085b0efc47a31fe5020` (v7.0.0; v7.1.0 was four days old), `pnpm/action-setup` `ea17c68df8912ef543352723c149a84f56e3d413` (v6.1.0, the commit under its annotated tag). `permissions: contents: read`. No cargo step, as the task says. `.github/dependabot.yml` covers npm and github-actions weekly, a release offered once seven days old. The repository is public with Actions enabled and had no workflow (read with `gh api`; nothing changed).

The dry run, on a clean scratch worktree at `2b0f6196` installed offline from the store (44 s), with `CI=true`, the two skip variables and `TURBOSLIDE_PROTOTEMPLATE_DECK` pointing nowhere (load 280 to 335):

| Step                 | Exit | Reading                                                                                                                                           |
| -------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| the audit            |    0 | 0 advisories at high or above                                                                                                                     |
| `tsc -b`, first      |    2 | every route's `createFileRoute` typed as undefined: `routeTree.gen.ts` is ignored by git, so the workflow generates it                            |
| `tsc -b`, route tree |    0 | no error                                                                                                                                          |
| the Worker tests     |    0 | 10 files, 72 tests                                                                                                                                |
| `pnpm test`          |    1 | 570 of 586 files passed, 7 skipped, 9 failed with 14 tests                                                                                        |
| the 9 files, rerun   |      | 13 of the 14 are this machine's load: they pass with long bounds (`dither.test.ts` 6 of 6 once its own 30 s bound was raised in the scratch copy) |

The one real failure for CI was `packages/import/src/__tests__/import.test.ts` "maps an opener and drops its known style block", which read the Prototemplate deck's file and threw ENOENT without the checkout. It skips there now, like the file's other deck cases (after: 18 passed, 3 skipped; with the deck present the case runs and passes). `banner.test.ts` passed after HR-W#5 (prep). The job's pin, green on a push, is read after the ship step's push; a Linux runner differs from this machine in fonts and native binaries, which this dry run cannot show.

## The incident: an install in the shared worktree (2026-10-11 22:13 to 22:20 PDT)

With the lockfile already holding knip and `node_modules` not yet, `pnpm exec tsc --version` in the worktree ran pnpm 11's dependency check, which installs when the lockfile moved: it added knip's 16 packages and unlinked 3 (the tsdown, rolldown-plugin-dts and dts-resolver variants without the `oxc-resolver` peer). The first run stopped partway; a second one finished ("devDependencies: + knip 6.40.0"). No version of any other package changed, `pnpm-lock.yaml` stayed byte for byte, and `node_modules` now matches it. The rule says only a foundation lane installs; this was a side effect of `pnpm exec`, and it is why step 34 calls `node_modules/.bin/knip` directly. Any lane that changes the lockfile in a shared worktree should expect the same from `pnpm exec`, `pnpm test` and `pnpm run`.

## Readings outside the lane's files

- `node scripts/build-home-assets.ts --check` at 01:39: "menus.generated.ts differs from its sources". The file records the menu model's hash, and the menu sources were being edited by another lane at the time; none of this lane's files is a source of it.
- `tsc -p apps/studio --noEmit` at 02:05: two errors, `vite.config.ts` 133 and `vite.deploy.config.ts` 385 (a code splitting group's `tags` typed `string[]` where `'$initial'[]` is wanted), both in another lane's uncommitted edit.
- `scripts/hosting/realtime-env.test.mjs` once timed out at the 5,000 ms default in the full scripts project at load 434 and passed on the next run.
- The brand lint: 0 open findings, 1 stale acceptance (`ImportSlides.tsx`), not this lane's.

## Requests

1. The integrator, before HR-C#3a ships: run `node scripts/check.mjs --knip` on the integrated branch (wave 2, HR-K1#4b and wave 3a under it). A stale entry is removed with `--knip --prune`. New findings that wave 2 or 3a brought are the one case the list grows: empty `findings`, run the step, and write the "new finding" lines back sorted, recording it in the commit.
2. The integrator: HR-C#3a changes `pnpm-lock.yaml`, `pnpm-workspace.yaml` and the root `package.json`; HR-O#2a (number 70, an earlier owner of those files in 4.13) is not built yet, so it rebases onto them.
3. The orchestrator: the computed task says there is no crate, but `crates/turboslide-native` is tracked (18 files, 48 `#[test]` items per CLEANUP-3). HR-W#5 has no cargo step as the task says; the crate's tests stay outside any gate until HR-N#4 or HR-C#14 adds one.
4. Lane PC: the two `vite*.config.ts` type errors above.
5. Whoever writes a release entry in `docs/updates.md`: stamp `apps/cli/package.json` in the same push (`releaseVersion` in `banner.ts`); HR-W#5's `pnpm test` fails on a stale stamp.

## Not done

- HR-C#1: question 9 (the evidence repository) is unanswered.
- HR-W#5's pin, the job green on a push: it can only be read after a push. The local dry run above is the closest reading.

## Scratch

The scratch worktree of the CI dry run was removed at 03:08, after its readings. The copy of `origin/main`'s sanitizer for the reproduction, the knip outputs and the run logs stay in this session's scratchpad (`c-w3b/`), outside the repository.
