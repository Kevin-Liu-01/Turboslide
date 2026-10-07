# Polish two: the auth UI research

Kevin's asks of 2026-10-07: "ALSO COMPLETELY FIX AND REDO AUTH UI", with a screenshot of the Sign in
dialog on the design branch's local preview. This file lists every auth surface, reproduces each
defect of the screenshot with its cause, reads General Translation's auth plate, and proposes one
auth plate for every surface. Nothing here is committed code; the pictures are under
`research-auth/`.

How it was read: the worktree `/Users/kevinliu/repos/Turboslide-polish2` on `polish2/round` at
`f2d48868` (the design round's whole tree), one dev server on port 4711 in three modes, each driven
with Playwright at 1440 and 390 px in the light and dark appearances:

| Mode    | Environment                                                            | What it stands for                                         |
| ------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| capture | `TURBOSLIDE_MAIL=capture`, the fake Google pair                        | a checkout with every method                               |
| off     | `TURBOSLIDE_MAIL=off`, the fake Google pair                            | production (no mail sender, Google is the one method)      |
| nogoogle| `TURBOSLIDE_MAIL=capture`, no `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` | Kevin's preview of the screenshot                      |

The rest of the task's server environment was as written (tmp store, memory realtime,
`TURBOSLIDE_LOCAL_OPEN=1`, a sqlite auth database, the auth rate limit off). The fake Google pair
never reached Google: the browser's request to `accounts.google.com` was answered by a stub page,
and Google's Cancel was replayed as a cross site navigation to the callback with the state the
server minted. The one minute load average was 96 to 203 during the drive (other sessions' jobs);
no reading below is a timing. Production was read only: three GET requests and one page load with
no submit, at about 18:15Z to 18:25Z.

## 1. Kevin's screenshot, reproduced

Picture `research-auth/01-kevin-repro-nogoogle-dark-2x.jpg` (dark) and
`research-auth/02-kevin-repro-nogoogle-light-2x.jpg` (light) are the nogoogle mode at device scale
2, `/home`, Sign In pressed, an address typed. They match the screenshot: the sentence at the
dialog's left edge, the Email field with a blue ring, an empty band under it, Cancel and a primary
button with no label. Every one of the first three defects exists only on `/home`;
`research-auth/05-decks-dialog-capture-1440-light.jpg` shows the same component on `/decks`
with the sentence inset and the ink ring.

The cause the three share: `SignInButton` renders the dialog next to itself
(`apps/studio/src/components/home/sign-in.tsx` 110 to 125), and on `/home` the button sits in
`span.ts-product-nav-signin` inside `main.ts-product` (`HomeNav.tsx` 119 to 121). The dialog's
layer enters the browser's top layer through `popover="manual"` (`packages/chrome/src/Dialog.tsx`
169 to 174), which moves its box but keeps its place in the document, so every descendant rule of
`home.css` applies to it. The measured parent chain of the card is
`DIV.ts-dialog-scrim.ts-chrome < SPAN.ts-product-nav-signin < DIV.ts-col.ts-product-nav-row <
HEADER.ts-product-nav < MAIN.ts-product`.

| #   | Defect in the screenshot | Measured on port 4711 | Cause (file and line) |
| --- | ------------------------ | --------------------- | --------------------- |
| K1  | The sentence "The presentations you made in this browser move to your account." starts at the dialog's left edge | `.ts-dialog-lead` computes `margin: 0px` at x = 1 px on `/home`; `6px 24px 0px` at x = 25 px on `/decks` | `apps/studio/src/routes/home.css` 30 to 32, `.ts-product p { margin: 0 }` (specificity 0,1,1), beats `packages/chrome/src/Dialog.css` 109 to 112, `.ts-dialog-lead { margin: 6px 24px 0 }` (0,1,0). The lead is drawn only by the pages (`sign-in-dialog.tsx` 41, `sign-in-words.ts` 5); the editor's dialog has none. |
| K2  | The primary button is white with no label (dark), black with no label (light) | The same with Google drawn (`research-auth/03-home-dialog-typed-google-dark-2x.jpg`). With an address typed, `page.signIn.continue` computes `color rgb(242,242,240)` on `rgb(242,242,240)` in dark and `rgb(7,7,7)` on `rgb(7,7,7)` in light, and 14 px type | `home.css` 372 to 375, `.ts-product-nav-signin .pt-ib { font-size: 14px; color: var(--pt-ink) }` (0,2,0), matches the dialog's Cancel and Continue and comes after `packages/chrome/src/tokens.css` 548 to 552, `.pt-ib.is-solid { color: var(--pt-paper) }` (0,2,0), so ink is drawn on ink. Before an address is typed the button is disabled and `.pt-ib.is-solid:disabled` (0,3,0, tokens.css 483 to 488) wins, which is why the label shows until the person types. |
| K3  | A blue ring on the Email field | `outline: rgb(47,92,224) solid 2px`, offset 2 px | `home.css` 60 to 68, the landing's focus rule `.ts-product :is(a, button, input, [tabindex]):focus-visible` (2 px selection blue), beats the dialog's one focus rule `Dialog.css` 197 to 202 (1 px ink, inset). The editor's dialog draws the ink ring (`research-auth/06-editor-dialog-capture-1440-light.jpg`). |
| K4  | An empty band of about 200 px under the field | 124 CSS px from the field's bottom (y 156) to the footer's top (y 280), 248 px at device scale 2 | `packages/chrome/src/dialogs/accounts.css` 77 to 79 gives the email step the code step's height (`min-height: 125px`, the field is 56 px of it: 69 px empty), then the body's 14 px gap, the reserved 20 px error row and its 4 px margin (`SignIn.tsx` 133 and 354 to 358; `accounts.css` 10 to 20), then the body's 20 px bottom padding (`Dialog.css` 114 to 121). With Google drawn the band is about 75 px (`research-auth/04-home-dialog-capture-1440-light.jpg`). |
| K5  | No Continue with Google | The nogoogle mode draws the field alone | Correct for that preview: `signInMethods` (`apps/studio/src/server/auth/better-auth.ts` 111 to 126) needs both Google variables. The cost is that a checkout without the fake pair hides the one method production offers, so the preview Kevin judged had no Google at all. |
| K6  | Cancel and the confirming button in a ruled footer far from the field | the footer starts 124 px under the field | `Dialog.tsx` 358 to 379 draws every dialog's actions in the ruled footer; the sign in dialog adds Cancel (`SignIn.tsx` 224). NEXT.md 4.3.2 item 7 already asks for no Cancel (Escape and the close glyph close it). |

Why the rows did not see it. `accounts.signin.one-dialog` (`apps/studio/e2e/core/design-pages.ts`
1062 to 1135) reads the card's class, the 8 px and 6 px corners, Title Case, the body's scroll and
Google's mark. It never reads the lead's inset, a label's colour against its own ground after
typing, the focus ring, or the distance between the last control and the footer. All four defects
pass it.

When production sees it. `origin/main` (19bd3de7) still sends a one method deployment's Sign In
straight to Google (`git show origin/main:apps/studio/src/components/home/sign-in.tsx` 27). The D5
push `147b945f`, which carries `9cbffa7b` ("one Sign in dialog on every surface"), is in the guard
now; once it lands, `/home`'s Sign In opens this dialog on production. With mail off there is no
Continue and K2 cannot occur. K1 occurs (`research-auth/08-home-dialog-mailoff-1440-light.jpg`),
and the footer holds Cancel alone.

## 2. Every auth surface

Routes and files are on `polish2/round`. "off" and "capture" are the two mail modes; every surface
was drawn at 1440 and 390 in both appearances unless the row says otherwise.

| #   | Surface | Route and entry | Files | Methods by mode | Defects found |
| --- | ------- | --------------- | ----- | --------------- | ------------- |
| S1  | The editor's Sign in dialog | `/edit/<deck>`, `/new`: the title row's Sign In (`packages/chrome/src/TitleRow.tsx` 492 to 510), the account menu's Sign in row (`menus/model.ts` 924 to 929), the name prompt's Sign In (`dialogs/NamePrompt.tsx` 154 and 243); under 480 px More > Sign in (`TitleRow.tsx` 527 to 541) | `packages/chrome/src/dialogs/SignIn.tsx` 364 to 381, `dialogs/accounts.css` 71 to 168, `apps/studio/src/editor/EditorRoot.tsx` 1013 to 1066 | capture: the field over Google, Continue in the footer; off: Google alone, drawn ink with the G on a paper disc, Cancel alone in the footer (`research-auth/09-editor-dialog-mailoff-1440-dark.jpg`) | K4, K6; the email field takes the focus before Google, the method production does not offer (`SignIn.tsx` 230 to 252 before 253) |
| S2  | The pages' Sign in dialog | `/home` nav (`HomeNav.tsx` 119 to 121), `/decks` bar (`routes/decks.index.tsx` 878) | `components/home/sign-in.tsx`, `sign-in-dialog.tsx`, `sign-in-auth.ts`, `sign-in-words.ts` | as S1, plus the lead | K1 to K6 on `/home`; K4 and K6 on `/decks`; at 390 the window is a 358 px box over the hero (`research-auth/07-home-dialog-capture-390-dark.jpg`) |
| S3  | A sign in page | `/signin`, `/login`, `/sign-in`, `/auth` | none | | 404 on port 4711 and on production; nothing can link to "sign in, then come back here" |
| S4  | The email method's second step and the mail | the dialog's Continue | `SignIn.tsx` 315 to 352, `server/auth/mail/templates.ts` 49 to 73 | capture only | The sentence sits flush on the field's label: `.ts-dialog-body p { margin: 0 }` (`Dialog.css` 123 to 126, 0,1,1) beats `.ts-sign-in-sent { margin: 0 0 8px }` (`accounts.css` 165 to 168, 0,1,0); the sentence has no period; "request a new one" names a control that does not exist; the address is not named; Back is a text button indented by its padding; the band again (`research-auth/10-code-step-1440-light.jpg`). The mail's subject carries the code ("Your Turboslide sign in code is <code>"), which a lock screen shows (NEXT.md 4.3.2 item 8). |
| S5  | The magic link's landing | `/api/auth/magic-link/verify?token=…&callbackURL=<page>` | better-auth's magic link plugin | capture | A bad or used link lands on the page with `?error=INVALID_TOKEN`. `/decks` and `/home` say nothing and keep the parameter (`research-auth/15-decks-error-invalid-token-silent-1440-light.jpg`); only the editor reads `?error=` (`EditorRoot.tsx` 678 to 699). |
| S6  | The social callback's errors | Google answers `/api/auth/callback/google?error=access_denied&state=…` when the person presses Cancel | `better-auth.ts` 244 to 363 (no `onAPIError.errorURL`), `sign-in-auth.ts` 23 to 28 and `EditorRoot.tsx` 1018 to 1025 (no `errorCallbackURL`), `server/headers.ts` 398 and 448 to 452 | both | Every callback error goes to better-auth's default `/api/auth/error?error=<code>` (better-auth `api/routes/callback.mjs` 37 and 80 to 86). The browser arrives there from Google, so `Sec-Fetch-Site` is `cross-site`; `/api/auth` is a CSRF route and `/api/auth/error` is not in `NAVIGATION_GET_PATTERNS`, so the answer is `403 {"error":"forbidden"}` (`research-auth/13-cancel-at-google-403-1440-light.jpg`; responses: 200 `sign-in/social`, 302 `callback/google`, 403 `error`). Production answers the same: `GET https://www.turboslide.com/api/auth/error?error=access_denied` with `Sec-Fetch-Site: cross-site` is 403 `{"error":"forbidden"}`. The editor's `?error=` sentence (row `accounts.google-error-sentence`) is therefore reached only by typing the parameter. |
| S7  | The CLI device page | `/device?user_code=…`; `turboslide login` prints "Open <url> and enter the code <code>" (`apps/cli/src/commands/login.ts` 79 to 80) | `apps/studio/src/routes/device.tsx` (inline styles, 288 lines) | email only, in both modes | An anonymous person gets an email form and no Google (`device.tsx` 173 to 204). With mail off, Continue answers 200 and the page says a message is on its way while the server logs "a sign-in mail was dropped" (`research-auth/12-device-mailoff-dead-end-1440-light.jpg`). Production shows the same email-only form (read without submitting), so `turboslide login` cannot complete there for a person whose browser is not signed in. No mark, a 320 px box with a 150 px empty band (`research-auth/11-device-email-step-1440-dark.jpg`), "Sign In the Device" as the approve label. |
| S8  | The account menu and the identity chip | the own chip `title.account` (`presence/PresenceSlot.tsx` 214 to 240) | `presence/AccountMenu.tsx`, `menus/model.ts` 913 to 947 | | Rows read right (`research-auth/25-account-menu-anonymous-1440-light.jpg`, `research-auth/16-account-menu-signed-in-1440-light.jpg`). "Sessions" opens the Profile dialog (`editor-shell.ts` 1095 to 1096). On a phone a signed in person's More menu has no account row; Sign out is three taps away (More, Collaborators, the own row) (`research-auth/19-phone-more-menu-signed-in-390-dark.jpg`). |
| S9  | Sign out | the menu's Sign out row | `EditorRoot.tsx` 1067 to 1097 | | Works: the page reloads anonymous with Sign In back in the title row. |
| S10 | Change name | the menu row; the floating name prompt | `dialogs/NamePrompt.tsx` | | Offers "Sign In" to a signed in person (`NamePrompt.tsx` 154 and 243 test `signInAvailable` alone) (`research-auth/17-name-prompt-offers-sign-in-when-signed-in-1440-light.jpg`). |
| S11 | Forget this browser | the menu row | `dialogs/ForgetBrowser.tsx` 34 to 50 | | The confirming button reads "Forget this browser" in sentence case, against the Title Case rule for buttons; the lead repeats the title as a question and has no period (`research-auth/26-forget-confirm-1440-light.jpg`). |
| S12 | Profile (the Sessions row) | the menu's Sessions row | `dialogs/Profile.tsx` | | The session list is empty for a signed in session and the trust line reads "You are known by a label" (`Profile.tsx` 41 to 48; the server resolves an account as verified, `packages/identity/src/resolve.ts` 143, so the editor's own principal reached Profile with another trust; not traced further) (`research-auth/18-sessions-row-opens-profile-1440-light.jpg`). Lane A1 of NEXT.md 4.3 owns the wiring. |
| S13 | You need access | `/edit/<deck>` refused | `routes/-access-page.tsx` 94 to 112 | | "If you were invited by email, sign in with that address from your presentations, then open this address again." The person has to leave, sign in on `/decks`, and come back by hand, because no page signs in and returns (`research-auth/14-access-page-detour-1440-light.jpg`). |
| S14 | No database | any deployment without an auth database | `SignIn.tsx` 125 to 129 | code read only | "Sign in is not available on this deployment" in the error row with a disabled field. |

### 2.1 Every sentence they say today

The words live in four places: `packages/chrome/src/menus/strings.ts` 222 to 300 (`ACCOUNT`),
`apps/studio/src/components/home/sign-in-words.ts`, `apps/studio/src/routes/device.tsx` 21 to 31
(`DEVICE_WORDS`) and `-access-page.tsx` 97 to 110, plus the mail in `templates.ts` 49 to 73.

| Where | Words | Problem |
| ----- | ----- | ------- |
| Dialog title | "Sign in" | |
| Page lead | "The presentations you made in this browser move to your account." | drawn on the pages only |
| Methods | "Email", "Continue", "Continue with Google", "Continue with GitHub", "Use a Passkey" (never drawn) | |
| Dialog footer | "Cancel" | NEXT.md 4.3.2 item 7 drops it |
| Code step | "If that address can sign in, a message with a link and a six digit code is on its way", "Six digit code", "Back", "Verify" | no period; the address is not named |
| Wrong code | "That code did not match. Try again or request a new one" | no period; no control requests a new one |
| Standing | "Sign in is not available on this deployment", "No sign in method is configured on this deployment" | no period |
| Exchange refusals | "Sign in did not complete (403)." on the pages, the library's own message or "Sign in did not complete (403)" in the editor | a status number in place of a reason |
| Social error | "Sign in did not complete (access denied). Try again or use another method" | the library's code lowercased; no period; unreachable (S6) |
| Page button | "Sign In", tooltip "Sign in to keep your presentations across browsers and devices." | |
| Account menu | "Account", "Signed in as <address>", "Not signed in", "Change name", "Change avatar", "Sign in", "Sign out", "Forget this browser", "Sessions" | "Sessions" opens "Profile" |
| Name prompt | "How should others see you?", "Your name", "Continue", "Sign In" | Sign In shown when signed in |
| Forget | title "Forget this browser", lead "Forget this browser? Your name, avatar and unsaved changes here are cleared; earlier edits keep the old name", buttons "Cancel", "Forget this browser" | the button is not Title Case; no period |
| Profile | "Profile", "You are known by a label", "Sessions", "API keys", "A key is shown once; copy it now", "No keys yet", "Delete account", "Done" | |
| Device | "Sign in a device", "Checking your session.", "Code from the terminal", "Sign In the Device", "Deny", "The device is signed in. You can close this tab.", "The device was denied. You can close this tab.", "That code did not match. Check the terminal and try again", "Too many attempts. Ask the terminal for a new code", "Sign in first, then confirm the code" | two sentences without a period; "Sign In the Device" |
| Access page | see S13 | a two page detour |
| Mail | subject "Your Turboslide sign in code is <code>"; body: the link sentence, the link, "Code: <code>", "The link and the code work once and expire in 5 minutes.", "If you did not ask to sign in, ignore this message." | the code in the subject; no wordmark (NEXT.md 4.3.2 item 8) |
| Callback error | `{"error":"forbidden"}` | S6 |

No auth word names a slides product of another company; "Continue with Google" is the provider's
label and stays (`packages/lint/src/brand/competitor.ts`).

## 3. General Translation's auth plate, read

Read from `/Users/kevinliu/gt/gt-cloud` at `origin/main` (277384080) with `git show`, no checkout,
and from the live pages at `https://dash.generaltranslation.com` (pictures 20 to 24).

- One frame for every auth and onboarding page: `apps/dashboard/src/components/frame/PlateFrame.tsx`
  (the field, the plate column with the mark and the content, then the foot row), `PlateRoot.tsx`
  (`.plate-root` and the field behind it), `PlateFoot.tsx` (the language selector, the copyright or
  Sign out, the theme flip).
- The geometry is CSS variables on `.plate-root` (`apps/dashboard/src/app/brand-tokens.css` 188 to
  221): `--plate-edge` 584 px (56vw from 1200 px), the column `min(464px, 100vw - 48px)`
  (`clamp(464px, 31vw, 640px)` from 1200 px), centred inside the edge; 40 px from the mark to the
  heading, 48 px column padding, 24 px under the foot; tighter under 880 px tall. Under 768 px the
  column alone with 20 px gutters and no field.
- The head: the mark, 25 by 16 px, a link to the website. The heading `typo-page-heading` 30 px,
  1.08 line, weight 500, tracking -0.025em. The lede 15 px, 1.55 line, `--ink-2`, at most 58ch.
- The controls: 44 px tall, the full column width. The email field and a solid Continue directly
  under it; a hairline "or" row; outline provider buttons with the provider's mark and words aligned
  left (`justify-start`), transparent ground. "No fills anywhere but inputs and primary buttons"
  (memory `signin-field-transition`, brand-tokens.css comments). No shadow on a plate page
  (brand-tokens.css 125 to 133). Errors in one line under the control that caused them.
- The states are pages: `/signin` (heading "What's your email?", lede "We'll sign you in or create
  an account."), `/auth/verify-request` ("Check your email", one lede, a footnote with "Try again"
  as a link), `/auth/error` ("Something went wrong", one lede, "Back to Sign In" solid),
  `/signin/device` (an anonymous visitor is sent to `/signin` with the return address; the code in
  eight slots split four and four; then "Connect <client>" with the code row, the permissions,
  Deny and Approve; the outcome with a status glyph). `AuthFrame.tsx` is the heading, lede,
  content and footnote stack every state uses.
- Errors come home: every social and SSO call passes `errorCallbackURL: '/signin'`
  (`components/signin/sign-in-form.tsx` 57 to 60, 204, 359 and 377), and `getSignInErrorState.ts`
  turns `?error=` into one sentence on the sign in page.
- The right side: on the sign in pages the dithered globe; on onboarding the deck's mood pictures
  with their plate (`FieldMoodPlate.tsx`). Prototemplate ports all of it as a gallery with a state
  console (`/Users/kevinliu/repos/Prototemplate/src/components/plate/`, the states `signin`,
  `verify-request`, `auth-error`, `oauth-signin`, `consent-*`, `device-code`, `device-invalid`,
  `device-expired`, `device-processed`, `device-approval`, `device-blocked`, `cli-*` in
  `gallery/devStates.ts`).

Pictures: `research-auth/20-gt-signin-plate-1440-light.jpg`, `21-gt-signin-plate-1440-dark.jpg`,
`22-gt-signin-plate-390-light.jpg`, `23-gt-verify-request-1440-light.jpg`,
`24-gt-auth-error-1440-light.jpg`.

What Turboslide takes and what it leaves. It takes the frame (one column, the mark at the head, a
30 px heading, 44 px controls, the provider rows, the foot row, the picture region on the right),
the states as named screens, `errorCallbackURL` on every call, and the device page that signs in
first through the one sign in page. It leaves the language selector (Turboslide is English only),
the SSO row, the Turnstile, the globe engines, and the heading's `cv11` and `ss01` (Turboslide's
chrome draws Inter without the alternates, DESIGN.md 4.2 and the lint `css/chrome-alternates`).

The deck's plates and question 5. `docs/NEXT.md` question 5 defaults the mood pictures to "the Sign
in plate (Kevin's auth plate rule), the card, Not found and the empty /decks state", and
`docs/brand.md` 270 already says the Sign in plate carries one. Today it carries none. The product
ships one licensed picture, the Blue Marble (`apps/studio/public/brand/mood-earth-{light,dark}.jpg`,
179,587 and 179,545 B, public domain), drawn by `components/home/MoodFigure.tsx` with its credit on
Not found and the empty `/decks` state.

## 4. The redo: one auth plate

### 4.1 The component

One folder in the chrome, so the editor and the pages draw the same code:

| File | Holds |
| ---- | ----- |
| `packages/chrome/src/auth/auth-model.ts` | Framework free. The state union (section 4.3), `nextState(state, event)`, the reason map from library codes to states, `safeNext(path)` (a same origin path that starts with one `/`, no `//`, no `\`, no scheme). Vitest. |
| `packages/chrome/src/auth/auth-words.ts` | Every sentence of section 4.5, replacing `ACCOUNT.signInDialog`, `SIGN_IN_WORDS` and `DEVICE_WORDS`. |
| `packages/chrome/src/auth/AuthPlate.tsx` | The content of a state: heading, lede, the controls, one error line under the control that caused it, the foot sentence. No layout of its own beyond the column. |
| `packages/chrome/src/auth/AuthPage.tsx` | The full page host: the mark at the head (`AppBarBrand`'s mark, a link to `/decks`), the column, the picture region from 1024 px, the foot row (the shared `ThemeButton` and the picture's credit). |
| `packages/chrome/src/auth/AuthWindow.tsx` | The window host: the chrome's 8 px window with the title and the close glyph, the plate inside, rendered with `createPortal` into `document.body` so no page's descendant rule reaches it (the cause of K1 to K3). No footer row, no Cancel. |
| `packages/chrome/src/auth/auth.css` | One stylesheet under the `.ts-auth` root class, tokens only. |

Geometry, from General Translation's plate on Turboslide's tokens:

- Page host: the column `min(464px, 100vw - 40px)`, its left edge at
  `max(24px, (min(584px, 56vw) - column) / 2)`; the picture region to the right of 584 px (56vw
  from 1200 px). The mark 25 px wide, 40 px over the heading; the heading 30 px, line 1.08, weight
  500, tracking -0.025em, no alternates; the lede 15 px, line 1.55, `--pt-ink-2`; controls 44 px,
  the column's width, the 6 px control corner; outline provider rows with the mark and the words
  aligned left; the solid Continue directly under the field; one hairline "or" row between the
  provider rows and the email rows; the foot row 24 px over the bottom. Under 768 px the column
  alone with 20 px gutters and no picture.
- Window host: `min(400px, 100vw - 32px)` wide, the 8 px window corner, 24 px padding, the title in
  the window's head at 18 px, the lede 13 px, controls 40 px, the height of the content, no reserved
  row in a state that cannot show an answer, the error line drawn in the states that can (the code
  entry, the device code) and reserved there only.
- Both: the focus ring is the chrome's one rule (1 px ink, inset). No shadow. The control corner 6
  px, the window 8 px (DESIGN.md 3.1).

### 4.2 Where each surface goes

| Surface | After the redo |
| ------- | -------------- |
| `/signin?next=<path>&error=<code>` (new route, `apps/studio/src/routes/signin.tsx`) | `AuthPage`. A signed in visitor is sent to `next` (or `/decks`). `error` draws the error state with Try Again, which returns to the methods with the same `next`. |
| `/home` and `/decks` Sign In | A link to `/signin?next=<this page>` (question Q1 has the other choice: `AuthWindow` over the page). The lazy dialog chunk and `sign-in-dialog.tsx` leave the two pages. |
| The editor's Sign In, the account menu's Sign in row, the name prompt's Sign In | `AuthWindow` over the deck, so the unsaved draft and the live session stay. The social `callbackURL` stays the deck address. |
| The email method | In `AuthPage` and `AuthWindow` when mail is on: the field and Continue under the provider rows, then the `email.sent` state with the address named and the code entry. |
| The social and magic link errors | `errorCallbackURL: /signin?next=<return address>` on `sign-in/social` and `sign-in/magic-link`, and `onAPIError.errorURL: '/signin'` in `better-auth.ts` for the errors that have no state to read (`state_not_found`, `invalid_callback_request`). `/api/auth/error` is no longer a destination, and the CSRF filter stays as it is. |
| `/device` | `AuthPage`. Anonymous: the `device.sign-in-first` state with the deployment's methods and `next=/device?user_code=<code>`, so production's Google completes it. Signed in: the eight character code in two groups of four, prefilled from `user_code`, Approve and Deny, the outcomes. The calls stay `GET /api/auth/device?user_code=` then `POST /api/auth/device/approve` or `deny`. |
| You need access | One sentence and a Sign In button to `/signin?next=/edit/<deck>`, replacing the detour of S13. |
| The account menu | Unchanged menu, three fixes: the Sessions row reads "Profile" (or opens a Sessions dialog once lane A1 wires it), the name prompt hides Sign In for a signed in person, and More under 480 px gains Change name and Sign out for a signed in person. |
| Forget this browser | The button "Forget This Browser"; the lead "Your name, avatar and unsaved changes in this browser are cleared. Earlier edits keep the old name." |
| The mail | Subject "Sign in to Turboslide" (the code leaves the subject), the body unchanged in substance, the wordmark at the head (NEXT.md 4.3.2 item 8, lane A3). |

### 4.3 The states

Each is one entry in the model and one gallery state. "Answer" marks the states that reserve the
error line.

| Id | Heading (page host) | What it shows |
| -- | ------------------- | ------------- |
| `methods.google` | Sign in to Turboslide | Continue with Google alone (production) |
| `methods.google-email` | Sign in to Turboslide | Continue with Google, the "or" row, Email and Continue |
| `methods.email` | Sign in to Turboslide | Email and Continue (a deployment without a Google client) |
| `methods.none` | Sign in to Turboslide | "Sign in is not available on this deployment." and no control |
| `methods.leaving` | Sign in to Turboslide | Continue with Google busy while the browser leaves |
| `email.sent` (answer) | Check your email | the address named, the six digit field, Verify, Use Another Address, Send Another with its countdown |
| `email.code-wrong`, `email.code-expired`, `email.code-spent` (answer) | Check your email | the line under the field for each |
| `error.cancelled` | Sign in did not complete | `access_denied` |
| `error.expired` | Sign in did not complete | `state_not_found`, `state_mismatch`, `invalid_callback_request` |
| `error.link` | Sign in did not complete | `INVALID_TOKEN`, `EXPIRED_TOKEN`, `ATTEMPTS_EXCEEDED` |
| `error.account` | Sign in did not complete | `account_not_linked`, `unable_to_link_account`, `email_not_found`, `email_doesn't_match` |
| `error.other` | Sign in did not complete | any other code, named in small type |
| `device.sign-in-first` | Connect the command line | the methods, `next` back to the device page |
| `device.code` (answer) | Connect the command line | eight slots, Approve, Deny |
| `device.code-wrong`, `device.spent`, `device.expired` (answer) | Connect the command line | the line under the slots |
| `device.approved`, `device.denied` | The terminal is signed in; The terminal was not signed in | one sentence, no control |
| `menu.anonymous`, `menu.signed-in` | | the account menu |

### 4.4 The gallery

`/dev/auth?state=<id>&host=page|window` (`apps/studio/src/routes/dev.auth.tsx`). Its loader answers
404 unless `TURBOSLIDE_LOCAL_OPEN=1` and the process is not hosted (`isHosted()`,
`server/root.ts`); the page draws `AuthPage` or `AuthWindow` with stub methods that resolve after
400 ms and never call `/api/auth` (Prototemplate's `plate/lib/actions` stubs do the same). A select
of every state sits at the top left; `?chrome=0` hides it for pictures. A row file
`apps/studio/e2e/core/auth-plate.spec.ts` walks every state at 1440 and 390 in both appearances
and reads what a person sees, the reads the current row lacks:

- the lede and every control start at the column's inset (24 px in the window);
- every button's label against its own ground at 4.5:1 or more, read from computed colours, in the
  enabled and disabled states;
- no vertical gap over 32 px between two content boxes, and none between the last control and the
  window's bottom edge beyond the window's padding;
- the focus ring is 1 px ink, inset;
- Title Case on buttons, sentence case on headings, a period after every sentence;
- the guard's competitor words absent.

The same row runs on `/home`, `/decks`, `/device`, the access page and the editor against the real
routes, so a page's own stylesheet cannot reach the plate again unnoticed.

### 4.5 The words

Plain technical English, sentence case headings, Title Case buttons, a period after every
sentence. "Continue with Google" stays.

| State | Words |
| ----- | ----- |
| methods (page) | Heading "Sign in to Turboslide". Lede "The presentations you made in this browser move to your account." Foot "Turboslide uses the name and the address of your Google account. It reads nothing else from Google after you sign in." (NEXT.md 4.3.2 item 7) |
| methods (window) | Title "Sign in", the same lede and foot |
| email rows | Label "Email", button "Continue", divider "or" |
| `methods.none` | "Sign in is not available on this deployment." |
| `email.sent` | Heading "Check your email". Lede "A message with a link and a six digit code is on its way to <address>. Both work once and expire in 5 minutes." Label "Six digit code", button "Verify", then "Use Another Address" and "Send Another" (with "Send another in 0:45" while the wait runs; three mails per address per 10 minutes, `better-auth.ts` 86 to 87) |
| `email.code-wrong` | "That code does not match. Check the newest message and try again." |
| `email.code-expired` | "That code expired. Send another to get a new one." |
| `email.code-spent` | "That code had three wrong tries. Send another to get a new one." |
| errors | Heading "Sign in did not complete". `error.cancelled` "The sign in was cancelled at Google." `error.expired` "The sign in started in another tab or took too long. Start again from this page." `error.link` "That link was used or has expired. Ask for a new one." `error.account` "That Google account cannot be joined to the account signed in here." `error.other` "The sign in did not complete." with the code in small type. Button "Try Again". |
| `device.sign-in-first` | Heading "Connect the command line". Lede "Sign in first. This page then asks for the code your terminal shows." |
| `device.code` | Lede "Type the code your terminal shows." Label "Code", buttons "Approve" and "Deny". Foot "Approve only a code you started from your own terminal." |
| `device.code-wrong` | "That code does not match. Check the terminal and try again." |
| `device.spent` | "That code had five wrong tries. Run turboslide login again for a new one." |
| `device.expired` | "That code expired. Run turboslide login again for a new one." |
| `device.approved` | Heading "The terminal is signed in". Lede "It acts as <address>. You can close this tab." |
| `device.denied` | Heading "The terminal was not signed in". Lede "You can close this tab." |
| You need access | "If you were invited by email, sign in with that address." Button "Sign In". |

### 4.6 The behaviour that does not change

- The calls: `POST /api/auth/sign-in/social {provider, callbackURL}`, `POST
  /api/auth/sign-in/magic-link {email, callbackURL}`, `POST /api/auth/sign-in/email-otp {email,
  otp}`, `GET /api/auth/get-session`, the device pair, and Sign out through the action
  `account.signOut` then a reload (`EditorRoot.tsx` 1067 to 1097). The one addition is the
  `errorCallbackURL` field on the first two, which better-auth already accepts and checks against
  the trusted origins like `callbackURL`.
- The anonymous deck linking: the session create hook (`better-auth.ts` 314 to 325) calls the
  alias link of `identity.ts` on every new session, whatever page started it. `/signin` is a same
  origin page and the identity cookie rides on the exchange as it does from `/decks`. The local row
  `accounts.anonymous-deck-kept` reads it.
- The return address: the editor's is the deck (`signInReturnAddress`, `EditorRoot.tsx` 299 to
  302); the pages' is `next`, the same path the page Sign In sends today (`sign-in-auth.ts` 18 to
  20), now carried through `/signin`.
- The rate limits (`better-auth.ts` 285 to 302) and the per address mail quota (196 to 207) are
  untouched. `/signin` and `/dev/auth` are GET pages with no limiter and no write.
- The CSRF filter (`server/headers.ts` 412 to 435) is untouched; `/signin` is a page route outside
  `CSRF_ROUTE_PATTERNS`.

### 4.7 Costs

Line counts are estimates from the files read; sizes are estimates until a build reads them.

| Push | What | Lines | Fixes | Rows |
| ---- | ---- | ----- | ----- | ---- |
| P0 | Render the pages' dialog through `createPortal(document.body)`; drop `accounts.css` 77 to 79 and the reserved row on the methods step; `.ts-sign-in-sent` reads `.ts-dialog-body .ts-sign-in-sent` | about +15, -10 | K1 to K4 on `/home` and `/decks` before or with `147b945f`'s arrival on production | `accounts.signin.one-dialog` gains the inset, label contrast and gap reads |
| P1 | `errorCallbackURL` on the social and magic link calls, `onAPIError.errorURL: '/signin'`, `/signin` with the error states only | about +120 | S5, S6 (the production 403) | `accounts.provider-error-sentence` read through a replayed Google callback (the stub of the opening section) |
| P2 | `/device` on the plate with sign in first | about +90, -200 (the inline styles go) | S7 (the production dead end) | `accounts.device-flow` locally with mail off |
| P3 | The plate (`auth/`), `AuthPage`, `AuthWindow`, `/signin` complete, the editor on `AuthWindow`, the access page, the words, the menu fixes, the gallery and its row file | about +1,100, -750 (`SignIn.tsx` 381, `accounts.css` 71 to 168, `sign-in-dialog.tsx` 44, `sign-in-words.ts`, `DEVICE_WORDS`, the access page's detour) | K5, K6, S1 to S4, S8 to S13 | `auth-plate.spec.ts` (every state), `accounts.signin.one-dialog` replaced, `sign-in-one-dialog.test.tsx` and `sign-in-methods.test.tsx` rewritten against `auth-model.ts`, `accounts.spec.ts` `GOOGLE_ROWS` updated for the new control ids |

Bytes: `/signin`'s route chunk carries the plate (an estimate of 10 to 14 KB gzip); `/home` and
`/decks` lose the lazy dialog chunk if Q1 keeps its default. The picture adds no file to the
repository: `AuthPage` requests the stored appearance's twin of the Blue Marble (179,587 B light,
179,545 B dark) at 1024 px and over only, lazily. Time (this file's estimate, pipeline days): P0
0.5, P1 0.5, P2 0.5, P3 2.5. P0 to P2 are independent of P3 and each fixes a defect production has
or is about to have.

## 5. Questions only Kevin can answer

Each has the default the build takes if he has not answered.

| # | Question | Default |
| - | -------- | ------- |
| Q1 | Sign In on `/home` and `/decks`: go to the `/signin` page, or open the same plate in a window over the page? | The `/signin` page. The editor alone opens the window, so an unsaved draft and the live session stay. |
| Q2 | The picture on the Sign in plate (NEXT.md question 5). | The Blue Marble twin with its credit on the `/signin` page at 1024 px and over; none in the window and none under 768 px. |
| Q3 | Continue with Google's fill: Google's light and dark buttons, or the ink primary drawn today? | Google's fills: `#FFFFFF` with a 1 px `#747775` edge on light, `#131314` with `#8E918F` on dark, the standard G, the label in Inter 500 (NEXT.md question 4, row `accounts.google-button-guideline`). |
| Q4 | Keep Cancel in the sign in window? | No: the close glyph and Escape close it (NEXT.md 4.3.2 item 7). |
| Q5 | The page heading. | "Sign in to Turboslide" on the page and "Sign in" in the window. General Translation's "What's your email?" assumes the email method, which production does not offer. |
| Q6 | A legal line under the methods. | None until the `/terms` and `/privacy` text is approved (NEXT.md question 13); the foot carries the Google sentence alone. |
| Q7 | The device page's words and what an approved terminal may do. | "Connect the command line", Approve and Deny, and the outcome "It acts as <address>." The terminal keeps today's scope (the account's decks). |
| Q8 | The mail sender on production (NEXT.md question 12). | None: Google is production's one method, and the email rows exist only where mail is on. |
| Q9 | A signed in person on a phone: account rows in More? | Yes: Change name and Sign out join More under 480 px when signed in. |

## 6. Files and commands used

- Drivers and their logs, in the session scratchpad and uncommitted: `run-server.sh`, `drive.mjs`, `typed.mjs`,
  `flow.mjs`, `google.mjs`, `errors.mjs`, `device-off.mjs`, `prod-device.mjs`, `gt.mjs` under the
  session scratchpad's `auth/` folder.
- Production reads: `GET /api/auth/error?error=access_denied` with `Sec-Fetch-Site: cross-site`
  (403 `{"error":"forbidden"}`) and `same-origin` (302 to `/?error=access_denied`); `GET /signin`
  (404); `/device` loaded in a browser, step `email`, nothing submitted.
- The sign in mail was read from the local `ts_mail` table; the code and the token are not
  recorded here.
- The scratch accounts live only in the local sqlite file under
  `apps/studio/.turboslide/auth-overlay/`; no deck was written on production.
