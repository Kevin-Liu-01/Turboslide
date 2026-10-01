# Google sign in by hand: the recipe

Written 2026-10-01 by lane R4 of the realtime round (`docs/REALTIME.md` 4.5, 4.6 and section 7; `design-google-login.md` sections 3.3, 7, 8 and 9). The code side is on the branch: the Google provider in `apps/studio/src/server/auth/better-auth.ts`, the dialog's Google button first, the four local rows in `apps/studio/e2e/accounts.spec.ts`, the unit rows in `better-auth.test.ts`. What remains is Kevin's, because no agent installs a Marketplace product, creates a paid resource or signs up for a service (`docs/hosting.md` 802 to 804; `research-hosting.md` section 5), and because Google issues no authorization code to a test, so the round trip is read by hand (`accounts.google-roundtrip`).

The console steps below are as `design-google-login.md` 3.3 read Google's pages on 2026-10-01 (the help pages 6158849 and 15549945, the Web application client page); this lane did not open the console again. If a page reads differently, the design note's sources are the place to look, and the names to look for are "Google Auth Platform", "Branding", "Audience", "Clients".

## 1. The ten lines (design-google-login.md section 8, as they stand after the build)

1. Storage tab of `turboslide-gt` on the General Translation team: install Neon (Free, `us-east-1`), then Upstash Redis (Fixed 250 MB, `us-east-1`), each connected to production and preview. Tell the pipeline when `DATABASE_URL` and `REDIS_URL` show in `vercel env ls` (names only; nothing prints a value).
2. console.cloud.google.com: a new project `Turboslide` (not mailroom's; its consent screen says mailroom and carries the Gmail restricted scopes under verification). Google Auth Platform, Branding: app name `Turboslide`, support email `kevin@generaltranslation.com`, authorized domain `turboslide.com`, the privacy and terms links. Audience: External, then Publish app.
3. Google Auth Platform, Clients, Create client, Web application, name `Turboslide web`.
4. Authorized JavaScript origins, four lines: `https://www.turboslide.com`, `https://turboslide.com`, `https://turboslide.vercel.app`, `http://localhost:4321`.
5. Authorized redirect URIs, four lines, each origin followed by `/api/auth/callback/google`: `https://www.turboslide.com/api/auth/callback/google`, `https://turboslide.com/api/auth/callback/google`, `https://turboslide.vercel.app/api/auth/callback/google`, `http://localhost:4321/api/auth/callback/google`. Exact match, https except on localhost, no fragment.
6. Put the client id and secret in `~/.config/turboslide/google-oauth.env` as two lines `GOOGLE_CLIENT_ID=` and `GOOGLE_CLIENT_SECRET=`, then `chmod 600 ~/.config/turboslide/google-oauth.env`. Never paste either in a chat.
7. Say whether `turboslide.vercel.app` gets accounts too (default: no, preview target only, REALTIME.md 7.6), whether the email field hides under `TURBOSLIDE_MAIL=off` (default: yes, 7.7; the build hides it), and whether the Google picture is used (default: no, 7.8; the build does not read it).
8. The pipeline sets the variables (`scripts/hosting/realtime-env.mjs google`, R6: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` sensitive on production and preview, `TURBOSLIDE_ADMIN_EMAILS=kevin@generaltranslation.com`), deploys `main` through the guard, and reads the function log for better-auth's base URL warning (it should be gone: the base URL is the request's Host on the allowed list).
9. Sign in once on `https://www.turboslide.com` from a browser that already has a named anonymous deck (section 3 below); the verifier reads the alias and the badge from a second browser.
10. If a sign in returns to the deck with a snackbar "Sign in did not complete (…)", send the words in the brackets. The likely values: `account not linked` (a Google address Google has not verified, or an existing email account whose address is unverified; the account was not taken over, by design), `state mismatch` (the browser lost the state cookie between leaving and returning; try again), `please restart the process`, `email not verified`.

## 2. What the build does with the client

- The authorization request asks for `openid email profile`, `prompt=select_account`, PKCE (`code_challenge`, `S256`), no `access_type=offline`, no `consent`: nothing calls a Google API after the sign in, so there is no refresh token and no verification to run (the basic scopes carry no 100 user cap, 15549945).
- The redirect URI is `<origin>/api/auth/callback/google`, built from the request's Host when it is on the list `www.turboslide.com`, `turboslide.com`, `turboslide.vercel.app`, `localhost:*`, `127.0.0.1:*` (`TURBOSLIDE_AUTH_HOSTS` replaces the list; `TURBOSLIDE_PUBLIC_ORIGIN` is the hosted fallback for a Host off it).
- The account is keyed on Google's `sub`; the email is used for the linking rule alone (an existing email account links when both addresses are verified; Google is not a trusted provider).
- The anonymous person's decks and comments follow them: the callback request carries the `SameSite=Lax` identity cookie, the session hook writes the alias row, and every record under the anonymous id renders as the account with the check badge and the word "signed in". Google's `name` wins at render; Change name renames the account.
- The limiter holds `/sign-in/social` and `/callback/google` at 10 per minute per address.

## 3. The hand row `accounts.google-roundtrip`, in two places

### 3.1 On a checkout, `http://localhost:4321`, with the real client

The client's redirect URI for localhost is on port 4321 (step 5), so this runs on that port alone, by the one who holds 4321 (the integrator or the verifier, AGENTS.md dev server rules). A wrapper reads `~/.config/turboslide/google-oauth.env` into the process's environment and prints nothing (the shape of `~/.config/turboslide/with-tokens.mjs`); nothing echoes a value.

1. From `apps/studio`, through the wrapper: `TURBOSLIDE_STORE=tmp TURBOSLIDE_OVERLAY_DIR=<a folder under .turboslide/> TURBOSLIDE_REALTIME=memory TURBOSLIDE_LOCAL_OPEN=1 TURBOSLIDE_AUTH_DB=.turboslide/auth-google.sqlite TURBOSLIDE_MAIL=off TURBOSLIDE_SESSION_SECRET=<32 or more characters> TURBOSLIDE_DOWNLOAD_SECRET=<32 or more characters> node_modules/.bin/vite dev --port 4321 --strictPort`, with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the environment from the file. `TURBOSLIDE_MAIL=off` makes the dialog read as production will: no email field, Google first and focused.
2. In a browser with no Turboslide cookies: open `http://localhost:4321/new`, type a title (the deck is created), name yourself through the own chip's menu (Change name), and read your anonymous id: `window.turboslide.studio.describe().state.identity.principalId` in the console, an `anon_…` value. Keep it.
3. Own chip menu, Sign in: the dialog shows Continue with Google first. Click it; the account chooser shows Turboslide's name and asks for the basic profile only (no Gmail scopes, no "unverified app" page for the basic scopes). Choose an account.
4. You return to the same deck. The page reloads; the own chip carries the check badge and the word "signed in"; the account menu's head reads "Signed in as <the Google address>"; the deck is still yours.
5. The alias row: from the repository root, `node apps/studio/e2e/identity-seed.mts alias .turboslide/auth-google.sqlite <the anon_ id of step 2>` answers `{ "userId": "<the account's id>" }`. The badge in a second browser: open the deck's share link in a second browser (or a private window); your chip there carries the badge and the name Google reported.
6. Sign out from the account menu; Forget this browser; stop the server.

### 3.2 On production, `https://www.turboslide.com`, after 4.5 steps 1 to 7

1. A browser with no Turboslide cookies: `https://www.turboslide.com/new`, type a title, name yourself, read the anonymous id as in 3.1 step 2.
2. Sign in with Google from the own chip's menu; return to the deck; read the badge and "Signed in as" as in 3.1 step 4. The first sign in with `kevin@generaltranslation.com` is the admin (`TURBOSLIDE_ADMIN_EMAILS`).
3. A second browser opens the same deck through its editor link: your chip carries the badge and Google's name. There is no SQLite file on production; the alias is read through the surfaces (the badge, the name, the deck still listed under your account on `/decks`).
4. The scratch deck leaves by its id, never by a sweep: `deck.info`, `deck.trash {id, baseRevision}`, `deck.remove {id, confirm: true, baseRevision}` through `POST /api/actions/<action>?deck=<id>` with the bearer from `~/.config/turboslide/hosts.json` through the wrapper (or File > Move to trash and Delete forever from `/decks` in the signed in browser).
5. The function log: no `[better-auth] Base URL is not set` line after the deploy; a sign in is three requests on `/api/auth/` (the POST, the callback GET, `get-session`), under the WAF's 10 per 60 s.

## 4. What is not in this round, and why (design-google-login.md section 9)

- `linkSocial` from the Profile dialog (an email account adding Google later): one client call and one row, the round after.
- The Google picture as an avatar source: `user.image` is written and nothing reads it (PEOPLE.md 8.1 question 7 decided the same for the email hash).
- A fixed preview alias: Google's redirect URIs match exactly, so a preview deployment's host cannot complete a sign in; Google is verified on localhost and production only.
- `hd` (a Workspace domain restriction): sellers sign in from any Google account.
- Passkeys: the plugin is not in the checkout and the rpID cannot move once set.
