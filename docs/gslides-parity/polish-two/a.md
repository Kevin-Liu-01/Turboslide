# Polish two, lane A: the auth UI

Lane A of `docs/POLISH-2.md` (section 4, rows of 6.4 and 6.6), in the worktree
`/Users/kevinliu/repos/Turboslide-polish2` on `polish2/round`. One section per push: the items, the
files, the rows with their readings and the one minute load beside them, the pictures (under
`docs/gslides-parity/polish-two/a/`, each opened and looked at), and the deviations. The servers are
the lane's: port 4743 with captured mail and 4744 with `TURBOSLIDE_MAIL=off`, both with the fake
Google pair, `TURBOSLIDE_STORE=tmp`, the memory realtime tier, `TURBOSLIDE_LOCAL_OPEN=1`, a sqlite
identity database under `apps/studio/.turboslide/`, the auth rate limit off and
`vite.no-watch.config.ts`. No timing in this file is a verdict: the one minute load was 145 to 565
through the lane's runs (other sessions' jobs).

## P2-A#1: Kevin's screenshot on today's dialog

Items (docs/POLISH-2.md 4.1, C20): the pages' Sign in dialog enters the document at `body` through
`createPortal`, out of `main.ts-product`, so `home.css`'s descendant rules no longer reach it (K1
the lead at the dialog's left edge, K2 the primary button's ink label on ink, K3 the landing's blue
focus ring); `accounts.css` 77 to 79 (the email step's 125 px minimum) leave, the reserved error row
is drawn on the code step alone and on the methods step only once it has a sentence (K4, the empty
band under the field); `.ts-sign-in-sent` reads `.ts-dialog-body .ts-sign-in-sent`, so the code
step's sentence keeps its margin over the field's label; the method buttons' focus ring is the
chrome's one rule, 1 px ink, inset (it was offset 2 px).

Files: `apps/studio/src/components/home/sign-in.tsx` (the portal), `packages/chrome/src/dialogs/
accounts.css`, `packages/chrome/src/dialogs/SignIn.tsx`, `packages/chrome/src/__tests__/
sign-in-methods.test.tsx` (the sizing tests: no minimum on either step, no reserved row on the
methods step, the row reserved on the code step), `apps/studio/e2e/core/auth-plate.ts` (new: the
reads of a sign in surface, `readSurface` and `surfaceFaults`), `apps/studio/e2e/core/
design-pages.ts` (`accounts.signin.one-dialog` reads the lead's and each control's inset, every
button's label against its own ground with an address typed, the ring of the control focused on
open and of the next one after Tab, and the gap under the last control), `apps/studio/e2e/core/
pages-r1f.ts` (`accounts.sign-in-fits`: no reserved error row on the methods step whatever the
methods), `docs/gslides-parity/focus/core-matrix.json` (the two rows restated with 6.6's P2-A#1
words).

Rows, on 4743 (the dev server with captured mail and the fake Google pair):

| Row | Reading | Load |
| --- | ------- | ---- |
| `accounts.sign-in-fits` | passed, 45 s, zero retries: 1440 the band under the last control 20 px (the body's padding), the dialog 400 by 244; 390 the band 20 px, 358 by 244; the controls `dialog.signIn.close`, `.email`, `.google`, `.cancel`, `.continue`, no `dialog.signIn.error` | 190 to 560 |
| `accounts.signin.one-dialog` | passed, 136 s, zero retries, on its second run: on /home, /decks and the editor in both appearances the lead 25 px from the card's outer edge (24 px inset and the 1 px frame), the rings of the field and of Continue with Google 1 px solid at -1 px, the labels with an address typed 20.1, 10.9 and 20.1 to 1 in light and 18.0, 10.6 and 18.0 to 1 in dark (Continue with Google, Cancel, Continue), 20 px under the last control, the card 8 px, the buttons 6 px, the body 139 over 139 (no scroll). The first run failed on the driver: it read the labels on open too, where Continue is disabled before an address is typed (3.25 to 1 light, 3.94 dark), which the row does not ask; the second run reads them with an address typed, as 6.6 words it, 400 ms after typing for the colour transition | 380 to 430 |

Gates: `tsc -b` exit 0 on the tree; `vitest run --project chrome`: the sign in tests pass (11 in
`sign-in-methods.test.tsx` and `sign-in-one-dialog.test.tsx`); the run's 13 other failures are
other lanes' files in progress or timeouts at a load over 400 (`theme-button.test.tsx`, lane N's
new file; `mark-agreement.test.ts`, lane F's `marks-render.ts`; `editor-shell-render`,
`inspector-sections`, `presence-slot`, 5 s timeouts); the brand lint in enforce mode 0 open
findings; `competitor.test.ts` 9 passed; prettier on the push's files clean.

Pictures (`a/`), Sign In pressed and an address typed, at 1440 and 390 in both appearances:
`a1-home-dialog-1440-light.jpg`, `a1-home-dialog-1440-dark.jpg` (the frame of Kevin's screenshot:
the lead inset, Continue labelled, the ink ring, Continue with Google directly under the field),
`a1-home-dialog-390-light.jpg`, `a1-home-dialog-390-dark.jpg`, `a1-decks-dialog-*` and
`a1-editor-dialog-*` (the same four each).

Deviations: the node-server build and the route ceilings were not read for this push alone (the
worktree is shared, so any build reads every lane's work in progress); the push adds one import of
`createPortal` from `react-dom`, which every page's chunk already carries, and the ceilings are read
on the A#2 build with `/signin`'s line. The editor's Cancel and footer stay until A#4 replaces the
dialog with the plate, as 4.1 orders.

## P2-A#2: the plate, /signin, the error addresses, the gallery

Items (docs/POLISH-2.md 4.2 to 4.6, C12, C14, C16, C18, C19): one auth plate in
`packages/chrome/src/auth/` (`auth-model.ts` the states, the events, the reasons of the library's
codes, `safeNext`, the per address mail count and the countdown; `auth-words.ts` every sentence of
4.5; `AuthPlate.tsx` the content of a state; `AuthPage.tsx` the page host with the mark, the column,
the foot row with the shared theme button and the picture region from 1024 px; `AuthWindow.tsx` the
window host, the chrome's Dialog with no action row; `auth.css` under `.ts-auth`, Google's fills as
custom properties), exported from `packages/chrome/package.json`; `/signin`
(`apps/studio/src/routes/signin.tsx`) rendered on the server with the methods and the session read
once, a signed in visitor sent to `next`, `?error=` drawn as its state with Try Again; every social
and magic link call names `errorCallbackURL: /signin?next=<return>` (the pages' calls in
`sign-in-auth.ts` and `sign-in-dialog.tsx`, the editor's in `EditorRoot.tsx`), and better-auth's
`onAPIError.errorURL` is `/signin`; the gallery `/dev/auth` (`dev.auth.tsx`); the `/signin` line of
`scripts/check-client-bundle.mjs` (600,000 B).

Rows (on 4743, Playwright with `TURBOSLIDE_ROWS_AHEAD=1`, the push's rows declared by id before the
commit enters them in the matrix; the commit's critical section then runs the core matrix tests):

| Row | Reading |
| --- | ------- |
| `accounts.plate.signin-page` | passed, 15 s: at 1440 and 390 in both appearances `/signin?next=/decks` answers 200 and draws `methods.google-email`; the column 464 px at 1440 and 350 at 390; 40 px from the mark to the heading; the heading 30 px; Google, the field and Continue 44 px tall, the column's width, at 6 px; from 1024 the twin of the shown appearance loaded, one twin request; at 390 no figure and no twin request; signed in by the mailed code, `/signin?next=/decks` lands on `/decks`; `/dev/auth` answers 200 on the checkout opened with `TURBOSLIDE_LOCAL_OPEN=1` |
| `accounts.provider-error-sentence` | passed, 6 s: `access_denied` `error.cancelled`, `state_mismatch` `error.expired`, `INVALID_TOKEN` `error.link`, `account_not_linked` `error.account`, `a_code_nobody_names` `error.other` with "Code: a_code_nobody_names", each with its sentence of 4.5; Try Again lands on `/signin?next=/decks` with no `error` |
| `accounts.google-button-guideline` | passed, 5 s: light the fill rgb(255, 255, 255), the edge 1 px rgb(116, 119, 117); dark rgb(19, 19, 20) and 1 px rgb(142, 145, 143); the G 18 by 18 in #EA4335, #4285F4, #FBBC05, #34A853; "Continue with Google" at 500, 20.14:1 light and 16.57:1 dark |
| `accounts.plate.cancel-comes-home` | passed, 91 s: from `/signin`: 200 `/signin`, 302 `/api/auth/callback/google`, 200 `/signin?next=%2Fdecks&error=access_denied`, "The sign in was cancelled at Google."; from the editor's dialog on a stored deck: 302 the callback, then 200 `/signin?next=%2Fedit%2F<deck>&error=access_denied`; no 403 on the way |
| `accounts.plate.states` | passed, 318 s: the 37 states of 4.4 the gallery draws (the account menu's two are the editor's, read by `accounts.menu.words` in A#4), the sign in states in both hosts and the device states on the page, at 1440 and 390 in both appearances, 148 readings with no fault: insets, labels at 4.5:1 or more enabled and disabled, no gap over 32 px, the window at most 24 px under its last box, the ring 1 px ink inset on the control focused on open and after Tab, the words' case and periods, the device code and the countdown in tabular figures, no word the guard matches. Its first two runs failed on the figures alone: the plate's `font` shorthand reset the numerals `.pt-num` sets (the second run was served the old sheet by a server that had not stopped); the sheet now sets the type by longhands and pins the codes' numerals over the window's field rule |

The one minute load was 108 to 160 through these runs. The first run of the three spec rows at
13:32Z also passed `accounts.provider-error-sentence` and `accounts.google-button-guideline`; its
`accounts.plate.signin-page` failed on the driver, whose wait for the return path matched the sign
in page's own `next` parameter; the driver now waits on the pathname.

Bytes, on the node-server build of the tree at 13:31Z (served on 4750; the build took 359 s at a
load of 139 to 233): `/signin` preloads five chunks, 1,541,704 B: its own are 17,505 B (`AuthPage`
15,663, `sign-in-auth` 1,251, the route 591, the entry 29) and the shared `vendor` chunk is
1,524,170 B. The vendor chunk holds zod, `fumadocs` and the docs' source on this tree (lane D's work
in progress), so every route's ceiling fails on the same build (`/decks` 1,577,115 of 600,000,
`/deck/gt-brand` 1,538,826 of 1,000,000, `/edit/gt-brand` 2,045,184 of 2,000,000); the `/signin`
line fails with them on the vendor chunk alone. Request A-R1 names it.

Gates: `tsc -b` exit 0; the chrome's auth tests (`auth-model.test.ts` 18, `sign-in-plate.test.tsx`
9) pass; `vitest run apps/studio/src/server/auth` passes with a 60 s test timeout (with the default
5 s, `actions.test.ts` and `authorize.test.ts` time out at a load of 285); the brand lint in enforce
mode 0 open findings (it found `text-transform: uppercase` on the device code, `css/no-eyebrow`,
and the push draws the code's letters as typed upper case instead); `competitor.test.ts` passes;
prettier clean.

Pictures (`a/`): every gallery state in the page host and the window host (the device states on the
page alone) at 1440 and 390 in both appearances, `a2-<state>-<host>-<width>-<appearance>.jpg`, 148
files, each looked at on contact sheets of 20 and 37; `/signin` at 1440, 1024, 768 and 390 in both
appearances, `a2-signin-<width>-<appearance>.jpg`; Cancel at Google's landing,
`a2-signin-cancelled-<width>-<appearance>.jpg`.

Deviations:

- The gallery's 404 rule reads `TURBOSLIDE_LOCAL_OPEN=1`, no `VERCEL` and a loopback host instead of
  `isHosted()`: `isHosted()` is true for the tmp store, which the round's own server recipe uses, so
  the gallery would answer 404 on every lane server.
- The mark is the 24 px drawing step of `TurboslideMark` (its steps are 16, 24 and 32 and over), not
  25 px.
- The plate draws no tooltips: every control names itself in words, and the page's chunk stays small.
- The quota sentence (the fourth mail to one address in 10 minutes) and the invalid address sentence
  are new words, written in 4.5's grammar: "That address had three messages in the last 10 minutes.
  Wait, then send another." and "That is not an email address. Check it and try again." The plate
  counts the mails it asked for each address in this browser (a hash of the address in
  `localStorage`, the visit's count where storage throws), because the server answers the fourth
  request exactly as the first and drops the mail.
- `accounts.google-button-guideline` reads `/signin` in this push; the editor's window joins it in
  A#4, where the window draws the plate.

## P2-A#3: /device on the plate, sign in first

Items (docs/POLISH-2.md 4.3, C15): `/device` draws the plate's page host
(`apps/studio/src/routes/device.tsx`; its 288 lines of inline styles and `DEVICE_WORDS` leave). The
loader reads the deployment's methods and the session's address once. An anonymous visitor sees
"Connect the command line" with the deployment's methods (Continue with Google on production, where
mail is off) and the return path back to the page and its code; signed in, the code in two inputs of
four (44 px, `data-num="code"`, a paste of eight characters into the first fills both), prefilled
from `user_code`, Approve and Deny, then the outcome ("It acts as <address>. You can close this
tab." or "You can close this tab."). The calls are unchanged: `GET /api/auth/device?user_code=` then
`POST /api/auth/device/approve` or `deny`; five tries per code, then "That code had five wrong tries".
The old device test of `accounts.spec.ts` (skipped on a tmp store) reads the plate's markup.

Row `accounts.device-flow`, on 4743 with captured mail and 4744 with `TURBOSLIDE_MAIL=off`, load 169
to 177: failed, on the terminal's two parts alone, both outside lane A's files:

- `turboslide login --to http://localhost:4743` exits 2 with "does not offer the device flow (403)":
  the studio's CSRF filter validates `/api/auth/*` (`server/headers.ts` `CSRF_ROUTE_PATTERNS`), and
  the CLI's `POST /api/auth/device/code` carries neither `Sec-Fetch-Site` nor `Origin`, so the
  TanStack CSRF middleware answers 403. Request A-R2.
- The token `POST /api/auth/device/token` grants after Approve is a better-auth session token; the
  CLI stores it as `kind: 'api-key'` and the agent surface refuses it as a bearer ("the bearer is not
  an API key of this deployment"), so `account me` with it exits 2. Request A-R3.

Everything on the page reads as the row says, the terminal's requests sent with a page's `Origin`
(the way the spec's older device test sends them): the address `/device?user_code=<code>` and a code
of eight characters; anonymous, `device.google`, `device.email` and `device.continue`; the mail's
`callbackURL` is the device page with its code and its `errorCallbackURL` is
`/signin?next=/device?user_code=<code>`; signed in by the mailed code, the page loads again at
`device.code` with the code in groups of 4 and 4, prefilled; Approve draws "It acts as <address>.
You can close this tab." and the terminal's poll is granted a token; a second code denied draws
"The terminal was not signed in" and the terminal's poll reads `access_denied`; on 4744 with mail
off the anonymous page offers `device.google` alone.

Gates: `tsc -b` exit 0; the brand lint in enforce mode 0 open findings; prettier clean.

Pictures (`a/`): `a3-device-anonymous-*`, `a3-device-signed-in-*` and `a3-device-mail-off-*` at 1440
and 390 in both appearances (12, looked at on one contact sheet).
