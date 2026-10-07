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
