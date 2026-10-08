# Polish two, the integrator

Written by polish two's integrator from 17:12 to 19:30 PDT on 2026-10-07 in
`/Users/kevinliu/repos/Turboslide-polish2` on `polish2/round`. Read first: `docs/POLISH-2.md`, the
four lane notes (`f.md`, `n.md`, `a.md`, `d.md`) and `requests.md`, whose section "Integrator"
answers every request. Ports 4730 (captured mail) and 4740 (`TURBOSLIDE_MAIL=off`) served the
node-server builds of this file with the round's environment (a tmp store in a new overlay per
start, the memory tier, `TURBOSLIDE_LOCAL_OPEN=1`, a sqlite identity database, the auth rate limit
off, the fake Google pair, secrets made per start and never printed). Two scratch worktrees of the
session's scratchpad held the reorder and the group typechecks (`p2int/wt` with its own `pnpm
install --offline --frozen-lockfile`, `p2int/wt2` for the third reorder). Nothing was pushed or
deployed, no Vercel, Cloudflare, GitHub or Google setting changed, and production was not read.
Times are PDT; loads are one minute load averages, 82 to 582 from other sessions' jobs (never
stopped), so no timing here is a verdict. Bytes, counts, boxes and colours do not move with load.

## 1. The state at the start

- `polish2/round` stood at `12c03471` (P2-F#4b notes): 23 commits over `f2d48868`, the design
  round's whole tree. The checkout was clean, no git, build or e2e lock was held, and no lane
  process was running.
- `git fetch origin` read origin/main at `147b945f` (DR-D5 fix notes), an ancestor of `f2d48868`,
  and `design/round` at `f2d48868`. Neither carries a commit this branch lacks, so no rebase onto a
  newer base ran.

## 2. The requests and the integrator's commits

Every request has its answer in `requests.md`, section "Integrator". The changes, each a commit of
its own in the push of the lane it serves:

| Commit (in the final order) | Request | What changed |
| --- | --- | --- |
| `516fb670` P2-integrator (F) | P2-F-1 | `packages/lint/src/brand/run.ts` hands the generated HTML and SVG under `ALTERNATES_ROOTS` to `lintAlternatesText`; the summary counts them (`texts`) |
| `695f995a` P2-integrator (N) | P2-N-1, P2-N-3 | `<HomeNav />` with no props; `e2e/home-page.spec.ts` reads "Dark or light" and the drawn half disc |
| `bc582877` P2-integrator (A) | A-R2, A-R3, A-R4 | the CSRF filter lets a POST to exactly `/api/auth/device/code` and `/api/auth/device/token` through; `server/auth/device-grant.ts` turns the granted session into an API key named `turboslide login` (the code's scopes, never `admin`) and deletes the session; `roles.spec.ts` reads the access page's link; `accounts.device-flow` approves the CLI's own code too |
| `a3f46276` P2-integrator (A) | none (a gate) | `menus.generated.ts` records `menus/model.ts`'s hash after P2-A#4, so `build-home-assets.ts --check` is current |
| `0b146c36` P2-integrator (A) | none (a row) | the editor's sign in window reads the held `?error=` state on every render and spends it once mounted (`peekHeldSignInError`); `accounts.google-error-sentence` was red on the node-server build (section 6) |
| `f3b49f8a` P2-integrator (D) | P2-D-1, A-R1, P2-D-2, P2-N-2, A-R5 | `robots.txt` names the sitemap; the vendor group leaves out React DOM's server renderers; a `home-shared` group keeps the nine modules `/home`'s route shares with its live bands in one chunk |
| `eef92a5e` P2-integrator (D) | none (a gate) | the social card as chromium-1217 renders it today (section 5) |

P2-F-2 (the roster plate at 390 lists nobody for a person alone) is recorded and not changed:
`RosterMenu` draws the own row from `presence.self` alone while the own chip reads `meOf`; it is
older than the round and outside its files (section 9).

### 2.1 The shared chunk and /home's document (A-R1, P2-D-2, P2-N-2)

Attribution from hidden source maps (`TURBOSLIDE_CLIENT_SOURCEMAP=1`) of two node-server builds:
the design round's head in `p2int/wt` and this tree.

| Build | Shared chunk | React DOM in it | `/home` document | `/home` preloads |
| --- | --- | --- | --- | --- |
| `f2d48868` (the design round) | `index-*.js` 1,210,171 B | 207,805 B (the client) | 99,756 B | 4 |
| this tree before the fix | `vendor-*.js` 1,430,037 B | 412,759 B (the client and `server.edge`) | 100,588 B | 12 |
| this tree with no vendor group (a trial) | `index-*.js` 229,785 B, 51 chunks preloaded | | 106,482 B | 51 |
| this tree with the fix | `vendor-*.js` 1,221,252 B | 207,805 B | 99,784 B | 6 |

With the docs' lazy chunks in the graph Rolldown honours the vendor group (on the design round's
tree it did not, and the chunk was named `index`), and the group's test matched
`node_modules/react-dom/` whole, so fumadocs-core's on demand `import("react-dom/server.edge")`
(its page tree serializer) went into the chunk every route preloads. The test now leaves out the
server renderers; the renderer is a lazy chunk of 207,680 B that no route preloads. The same
chunking split `/home`'s shared modules (copy with the facts, assets, deck.generated,
design-copy, sprite.generated, people-timing, chrome.generated) into seven chunks; the
`home-shared` group keeps them in one. The schema (521 KB), zod (99 KB) and the menu model (67 KB)
were in the design round's shared chunk already; fumadocs and the docs' text are in no shared
chunk.

The largest chunk line of `check-client-bundle.mjs` stays asserted (the decision P2-D-2 asked
for): it reads the shared chunk at 1,221,252 B over 600,000 B, the class of the route ceilings that
have read over since before the design round. The diet of SPEC-4 3.12 (the schema and zod out of
the root graph) is the fix and is not this round's.

## 3. The reorder

One push per lane in the order F, N, A, D. Three runs of `git -c rerere.enabled=false rebase -i
f2d48868` in a scratch worktree, the todo written by `GIT_SEQUENCE_EDITOR`
(`scratchpad/p2int/seq-editor.mjs`) from an order file, each pick followed by an `exec` of
`after-pick.sh` (the matrix parses with unique ids, no conflict marker in the commit's files,
README.md's block current, regenerated and amended if not; it never had to be). The second and
third runs placed the integrator's later commits in A's and D's groups.

The stops were resolved by `resolve.mjs`, no file edited by hand:

| File | Picks | Resolution |
| --- | --- | --- |
| `docs/gslides-parity/focus/core-matrix.json` | P2-N#1, N#2, A#2, A#3, A#4, D#1, F#4b | the pick's own rows (added, changed, removed by id, against its old parent) applied to HEAD's matrix, each row's text from its side; no row changed on both sides |
| `docs/gslides-parity/polish-two/requests.md` | P2-N#1, A#2, A#3, A#4, D#6 | by `## ` section: the sections the pick added or changed, from its side; a section its old parent had and HEAD lacked arrives with its own lane's commit |
| `README.md` | none stopped | git merged the text; the block was current at every pick |

Checks before each move of the branch: the new head's tree equals the old head's but for the
matrix's row order (1,266 rows, the same by value; the round's 27 rows in push order: N's, A's,
D's, then F's three face rows); every commit keeps its message, author and author date and its
`git patch-id --stable` outside the three files above (inside them too after the second and third
runs); every commit's row delta (added, changed, removed) equals the original's. The moves ran
under the git lock with `git read-tree -m -u` and `git update-ref`, the checkout clean; the old
orders are kept as `polish2/round-prereorder` (`9aff28d5`), `-prereorder2` (`d29780d9`) and
`-prereorder3` (`4df41226`).

## 4. The groups

| Group | Commits, old (new) | Head | Rows from its matrix diff |
| --- | --- | --- | --- |
| F | `8ce30713` P2-spec, `5d939cf5` P2-F#1 (unchanged); `65af8378` (`58577c92`) P2-F#2, `c63d3fc6` (`a55a05af`) P2-F#3, `7a9dd41a` (`60859684`) P2-F#4a, `37b23624` (`516fb670`) the integrator | `516fb670` | restated `realtime.join.chip-within-1s`, `setup.do.two-instances` |
| N | `3f8ff6e2` (`4a0dc20c`) P2-N#1, `f92b81bc` (`dcb16fb4`) P2-N#2, `4bf8cc37` (`f824b10e`) P2-N#3, `0d97190e` (`b6c287d9`) notes, `9d0faa01` (`695f995a`) the integrator | `695f995a` | entered `home.nav.no-pause`, `home.nav.fits-320`, `home.nav.theme-first-paint`, `home.hero.side-fits-headline`; restated `home.motion.pause`, `home.nav.icons`, `home.motion.reduced`, `home.hero.type` |
| A | `c39fc745` (`ad0b5156`) P2-A#1, `6bb60368` (`5c56e920`) P2-A#2, `01a382e4` (`35a4b056`) P2-A#3, `d2aca415` (`98ed5ac7`) P2-A#4, `59a6a2fb` (`8f7eea4a`) P2-A#5, `2e8ee830` (`29e96d20`) A#4 fix, `95a18500` (`bc582877`), `b2ffa64d` (`a3f46276`), `4df41226` (`0b146c36`) the integrator | `0b146c36` | entered the twelve `accounts.*` rows of 6.4; restated `accounts.signin.one-dialog`, `accounts.sign-in-fits`, `accounts.google-error-sentence`, `decks.access.sign-in-link` |
| D | `e9145288` (`938ae469`) P2-D#1, `ce2d9edd` (`48ab7deb`) P2-D#2, `51719156` (`c9d9b69d`) P2-D#3, `3dc0dd3d` (`ed859400`) P2-D#4, `8f49c8d4` (`ce83ca5f`) P2-D#5, `4f04bb0e` (`6298fad7`) P2-D#6, `9aff28d5` (`f3b49f8a`) and `d29780d9` (`eef92a5e`) the integrator, `f86e342d` (`97dcaa40`) P2-F#4b, `12c03471` (`aec2d38a`) its notes, then this note | this note's commit | entered the eight `help.docs.*` rows and the three `chrome.font.*` rows; restated `help.documentation-link` |

P2-F#4b sits in D's push because its rows read `/signin` and `/docs` (POLISH-2.md 7.0), so F's
push carries P2-F#4a's drivers inert (a row of `font-p2.ts` registers only when its id is in the
matrix). No group is docs only, and no group touches the Worker's paths.

## 5. The gates

| Gate | Reading | Load |
| --- | --- | --- |
| `tsc -b` at each group head (scratch worktree, routes generated by `tsr generate`) | F `516fb670` exit 0 (376 s); N `695f995a` exit 0 (145 s); A `0b146c36` exit 0 (134 s; `a3f46276` also exit 0, 339 s); D `aec2d38a` exit 0 (388 s) after `pnpm install --offline --frozen-lockfile` (the docs' dependencies); the notes commit on it changes docs alone | 96 to 129 |
| `tsc -b` in the checkout | exit 0 (18:03 to 18:04) on the tree before `0b146c36`, whose three files the A and D head runs read | 101 to 115 |
| `pnpm test` (`vitest run --testTimeout=60000`, 19:01 to 19:08) | 546 files: 5,691 passed, 2 failed, 6 skipped, 2 todo. The two are the standing pair of every pass: `packages/import` reads 93 slides in the read only Prototemplate deck where it pins 95, and `apps/cli` `banner.test.ts` reads the CLI's 2026.1001.3 against `docs/updates.md`'s 2026.1006.1 | 100 to 127 |
| `core-matrix.test.mjs`, `what-works.test.mjs`, `evidence-policy.test.mjs`, `docs-index.test.mjs`, `competitor.test.ts` | 5 files, 67 passed | 107 |
| `node docs/readme/what-works.mjs --check` | README.md is current | 107 |
| The brand lint, `main.ts --enforce` (the competitor guard and the widened `css/chrome-alternates` in it) | exit 0: 565 scripts, 121 stylesheets, 6 HTML and SVG files and 26 mood pictures read; 0 open, 22 accepted, 0 stale | 107 |
| `build-home-assets.ts --check` | 67 outputs current after `a3f46276` (before it: `menus.generated.ts` stale by its source hash from P2-A#4 on; the menus band draws no row that changed) | 127 |
| `build-brand.ts --check` | exit 0 after `eef92a5e`. Before it the card's pixel compare failed: P2-F#3's card differs from today's chromium-1217 render in 16,421 pixels inside the dithered picture; two renders of the head and one of P2-F#3's own tree agree with each other | 95 to 124 |
| `build-colors.ts --check`; `pnpm generate:contracts` then `git diff` | current; no diff (the docs' reference pages included) | 124 to 136 |
| `check-client-bundle.mjs --base` on the build of record | `/home`, `/decks`, `/edit/gt-brand` preload no docs module; `/home` 6 chunks; `/edit/gt-brand` 1,742,326 B under 2,000,000; over their lines, each on the shared chunk: the largest chunk 1,221,252 B, `/decks` 1,325,595, `/deck/gt-brand` 1,235,965, `/signin` 1,224,707, `/docs` 1,320,872 B; `apps/studio/dist/client` absent (the form names the non deploy output) | 93 |

## 6. Rows on the node-server builds (port 4730, 4740 with mail off)

Build 1: `NITRO_PRESET=node-server vite build -c vite.deploy.config.ts` of `9aff28d5`'s tree, 2 min
(17:58 to 18:00, load 84 to 107). Build 2 (the build of record): the tree of `4df41226`, 18:58 to
18:59. Both read `/home` at 99,784 B.

| Run | Rows | Result | Load |
| --- | --- | --- | --- |
| 1, build 1, `core-gate --only specs`, 18:03 to 18:30 | the 38 spec rows the round entered or restated, with the seven `home.budget.*` rows and the re-runs `home.hero.font-swap`, `home.hero.stage`, `decks.home.seller-lead` | 35 passed, 3 not driven, 0 failed, retries zero. Not driven: `home.budget.frame` and `home.budget.main-thread` ("not read: load 91.8"), `home.motion.pause` ("not read: load 96 (the functional checks passed)") | 82 to 582 |
| 2, build 1, `--only accounts` with `TURBOSLIDE_MAIL_OFF_BASE`, 18:49 to 18:56 | the eight local rows of 6.4 and 6.6 | 7 passed, 1 failed: `accounts.google-error-sentence` opened the window on `methods.google-email` (fixed in `0b146c36`) | 87 to 172 |
| 3, build 2, `--only accounts --rows accounts.google-error-sentence`, 19:00 | the failed row | passed | 95 |
| 4, build 2, `--only specs`, 19:01 to 19:05 | the sign in rows the fix touches and the byte rows: `accounts.signin.one-dialog`, `.sign-in-fits`, `.sign-in-everywhere`, `.dialog-in-brand`, `.google-button-guideline`, `.plate.signin-page`, `.provider-error-sentence`, `decks.access.sign-in-link`, the five byte and LCP budget rows, `home.motion.pause` | 13 passed, `home.motion.pause` not driven ("not read: load 126.2 (the functional checks passed)") | 93 to 126 |
| 5, build 2, `--only accounts`, 19:05 to 19:09 | the eight local rows | 8 passed | 108 to 126 |
| 6, build 2, `--only accounts --rows accounts.email-hidden-without-mail`, mail off on 4740 | the mail off read | passed (`dialog.signIn.google` alone) | 93 |
| 7, build 2, `--only probe --areas help` | `help.documentation-link` and the help area | 7 of 7 passed | 93 to 113 |

Readings of record: `chrome.font.official-inter` one font file, `InterVariable-latin.woff2`, the
record's bytes and sha256 on `/home`, `/decks`, `/new`, `/signin` and `/docs`;
`chrome.font.no-stylistic-sets` no alternate outside a slide on eight pages at 1440 and 390 in both
appearances; `home.budget.bytes-first` the document 99,784 B decoded and 16,827 B brotli, the route
chunk 40,771 B and `home-shared` 28,125 B decoded, the page CSS 18,607 B brotli;
`home.budget.live-module` 55,631 B decoded and 19,750 B gzip; `home.budget.shared` the shared
chunk 1,221,252 B reported against 600,000 and one font request of 113,752 B;
`help.docs.reference` "194 actions: 181 on the command line, 170 as MCP tools, 173 as HTTP
endpoints and 178 in the page."; `help.docs.twin` 35 pages; `help.docs.search` "theme": 12 hits,
Themes and brand kits first, one index request; `accounts.device-flow` `turboslide login` printed
`/device` and a code, the key granted and in the account's list, the CLI's own code approved,
`turboslide login` exit 0 and `account me` with the stored key `agent:tok_...`, a denied code read
`access_denied`, mail off drew `device.google` alone.

Not driven on these builds: `setup.do.two-instances` and the do tier clause of
`realtime.join.chip-within-1s` need the do tier and two origins (`wrangler dev` of the Worker);
P2-F#2's run 2 read one object id across both origins in every round (`f.md`), and the memory tier
reading here passed the chip clause with "no object on this tier".

## 7. Pictures

58 pictures under `integrator/`, each at 1440 by 900 or 390 by 844 in light and dark, taken on
build 1 (build 2 changes no drawn surface: the window's held error state, one hash string and the
social card), every one looked at on a contact sheet of its surface against POLISH-2.md: `home-top` (the bar with no pause control, the hero's
side spanning the headline), `home-foot` (Pause Motion closing the footer), `decks-bar` (Sign In a
link), `signin` and `signin-cancelled` (the page host, the Blue Marble from 1024 px, none at 390),
`device` (Connect the command line, sign in first), `access` (one sentence and Sign In),
`editor-signin` (the window: no Cancel, no footer, the 24 px inset; More, Sign in at 390), `docs`,
`docs-cli`, `docs-reference`, `docs-search` ("theme"), `docs-copy` (the Copy Page menu),
`docs-menu` (the sheet at 390) and `docs-miss` (the three closest pages). 3,516 KB in all, the
largest 121,070 B; the round folder holds 21.4 MB.

## 8. Dependencies between the pushes

- F's push carries P2-F#4a's drivers and no face row; the rows enter with P2-F#4b at the end of D's
  push, after `/signin` (A) and `/docs` (D) exist.
- `help.docs.links` reads red on its robots clause from P2-D#6 to `f3b49f8a`, both in D's push.
- `accounts.google-error-sentence` reads red on a build from P2-A#4 to `0b146c36`, both in A's push;
  `build-home-assets.ts --check` reads the menus file stale over the same span, `a3f46276` closes it.
- `build-brand.ts --check` reads the card's pixels different on today's renderer at the F, N and A
  heads (P2-F#3's card); `eef92a5e` in D's push makes it current. CI compares no card pixels.
- The vendor group takes effect only once the docs' plugin is in the graph (D's push), so at the F,
  N and A heads the shared chunk is the design round's `index-*.js` and `/home`'s document is near
  its 99,756 B (lane N read -42 B for its own three pushes); from D's push on `f3b49f8a` holds the
  document at 99,784 B. No head but the last was built.

## 9. Open, for the ship and for Kevin

1. `home.motion.pause` (feature `decks`, unparkable) is not driven at every load of this session
   (96 and 126): its functional checks passed and its timing clause waits for a load of 20 or less.
   `home.budget.frame` and `home.budget.main-thread` are measured rows not read for the same reason.
   The guard reads them on the preview.
2. Check step 31 stays red as it has since before the design round: the shared chunk over 600,000 B
   and `/decks`, `/deck/gt-brand`, `/signin` and `/docs` over their ceilings on it. No line was
   raised.
3. `setup.do.two-instances` was not driven on the do tier here (section 6).
4. The roster plate under 480 px for a person alone (P2-F-2): `RosterMenu` lists `presence.self`
   only; a follow up reads `meOf` for the own row or hides Collaborators when it would list nobody.
5. Seen on the pictures, not a row: a docs paragraph breaks the inline code `--deck <dir>` after its
   two hyphens at 1440 (`docs-cli-1440-*.jpg`); inline code that should not wrap needs
   `white-space: nowrap` in `docs.css` (lane D's file).
6. The standing pair of the unit suite (the Prototemplate deck's 93 slides, the CLI's version line).

## 10. Notes

- The servers on 4730 and 4740 and the scratch worktrees are stopped and removed when this note is
  committed; the run logs are under `.turboslide/int-gate-*` of the checkout (ignored by git) and
  the scripts, sheets and logs under `scratchpad/p2int/`.
- The round's unit test for the face (`inter-release.test.ts`) and the font build check ran in lane
  F's pushes; `pnpm test` above includes the former. `turboslide fonts build --check` was not run
  again: no font file, subset or record changed after P2-F#4a.
