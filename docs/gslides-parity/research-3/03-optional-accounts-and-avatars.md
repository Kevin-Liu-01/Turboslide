# Optional accounts and avatars

Report 03 of the Turboslide round three research, written 2026-09-13 against the repository at
`61b16e4` (main, after Google Slides parity round two). It answers one part of Kevin's fourth
directive, verbatim: "make sure its 'multiplayer' too with all collab features with optional
logins and avatar creation". The multiplayer mechanics, comments, share roles and presence are
sibling reports; this one covers who a person is: the anonymous identity every visitor gets, the
optional sign in a person can add to it without any Google service, where the sessions live on
Vercel and on a checkout, how an anonymous identity becomes a signed in one, sign out and device
management, the privacy baseline, the rate limits on sign in, and the avatar: the default a person
gets, the generated variants that fit a monochrome dithered interface, the upload path and where
the files live.

Part A is Turboslide today, read from the code. Parts B to H are the identity research. Part I is
the avatar research. Part J is the recommendation, with the comparison table the task asked for in
Part C. The report ends with the claims that could not be verified and every source with its URL
and read date. Google's own choices (Google Accounts, Drive sharing, Google's infrastructure) are
out of reach for a standalone editor, so where round one's report 10 recorded Google's behaviour
this report names it and substitutes a standalone equivalent.

Rules followed: plain technical English, sentence case, no em dashes, no metaphors, no trailing
periods on headings, full sentences in body. No account was signed in to; every source is a public
page, a public repository or a file in this checkout, and every one was read on 2026-09-13 unless
its entry says otherwise. No Google icon, artwork or asset is reproduced or proposed. Source keys
(L for a local file, and the letter groups of the Sources section) resolve at the end.

## How to read this report

- A label in quotation marks is the exact text of the source, or the exact identifier in code.
- "Principal" below means the thing a write, a lease, a comment or a presence record is attributed
  to: today that is the `Author` value; after this round it is an id that is either anonymous or
  bound to an account. "Sign in session" means the cookie backed authentication state; the studio
  already uses the word "session" for an attached page's command channel
  (`apps/studio/src/server/sessions.ts`, L2), and the two must not share a name in code.
- Costs are the published list prices on the day of reading; Turboslide's own volumes are not
  measured here, so a cost column says what is free and what is metered rather than a number per
  month.

## Part A: Turboslide at 61b16e4

### A1 Who a visitor is

Nothing changed since round one's report 10 (L1) in the identity model. `Author` is
`{ kind: 'human' | 'agent'; name: string; runId?: string }` (`packages/schema/src/mutations.ts`
line 80, L2); `parseAuthor` turns `agent:<x>` into an agent and any other string into a human
name. The editor writes as `DEFAULT_AUTHOR = 'studio'` unless `?author=` is in the URL
(`apps/studio/src/routes/edit.$deckId.tsx` line 292, L2). Every `Write`, `Version` and `Lease`
carries that value, `sameAuthor` compares kind, name and runId, and `authorLabel` prints the name.
There is no id, no email, no avatar and no verification anywhere in the schema, the store or the
chrome. The Share dialog says so in two sentences (`DIALOGS.share.noAccounts`,
`packages/chrome/src/dialogs/Share.tsx`, L2), the title row shows no avatar by design (SPEC 2.0),
and the SPEC-2 omission table defers "A display name, the view token and Stop sharing, a private
flag" to round three with the note "Turboslide has no accounts yet" (L4 line 805).

### A2 What the browser already remembers

The studio keeps per browser state in `localStorage` and nowhere else: the recent decks and home
settings (`apps/studio/src/routes/decks.index.tsx` lines 63 to 121), the theme (`gt-theme`,
`packages/viewer/src/theme.ts`), the retired shortcut notices, the closed inspector sections, the
sidebar state, the special character recents and the presenter notes size (L2). No cookie is set by
any route. A display name and an avatar kept in the browser would join that list; a stable
anonymous id would be the first value the server is meant to read back.

### A3 The token and the CSRF rule

The agent routes (`/api/actions/:action`, `/api/agent`, `/mcp`) require `Authorization: Bearer
<TURBOSLIDE_TOKEN>` off localhost and serve localhost open when no token is set
(`packages/agent/src/http/auth.ts`, L2). The editor's server functions carry no credential; the
Start instance applies `createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' })`
so every server function request is checked on `Sec-Fetch-Site`, `Origin` or `Referer` and the
agent surface, which agents call with no Origin, stays a bearer surface (`apps/studio/src/start.ts`,
L2). Download tokens are HMAC-SHA256 over a JSON payload with a fifteen minute expiry and a spent
nonce set kept on `globalThis` (`apps/studio/src/server/tokens.ts`, L2); bundle tickets are the
same shape over a ten minute expiry (`bundle-core.ts`). Those two are the only signed tokens in the
tree and both are single purpose.

### A4 What the store already has

`selectStore` picks `file`, `tmp` or `blob` from the environment (`packages/store/src/select.ts`,
L2). The Blob backend talks to Vercel Blob through a six call client, `BlobClient`:
`head(pathname)`, `get(pathname)`, `list(prefix)`, `folders(prefix)`,
`put(pathname, bytes, { contentType, ifMatch? })` and `del(pathnames)`
(`packages/store/src/blob-store.ts` lines 93 to 106, L2). Writes to `deck.json` are conditional on
the etag the instance synced (`ifMatch`), so two instances end with one commit and one conflict.
The same file records three measured facts about the store (lines 322 to 328): "`list()` lags
`head()` by up to a minute; the public URL a body is fetched from is served by the CDN, which keeps
an overwritten blob's previous body for a while after `head()` already answers the new etag (the
SDK's `useCache: false` only bypasses it for private stores); and the etag is the md5 of the
body." Leases live in `leases.json` under the deck prefix, pulled before every write and pushed
after, last writer wins. The tmp overlay is `<tmpdir>/turboslide` in a function, the one writable
path there (`select.ts` `overlayRoot`), and it does not survive an instance (L3 section 3). On a
checkout the store is the `decks/` folder with git as history.

So the store has: a key value surface over Blob with conditional writes on one key, eventual
consistency on listing and on public reads, a per instance temp folder, and a file store. It has
no low latency key value store, no counter, no TTL and no index.

### A5 The function, the plan and the environment

The deploy config sets `maxDuration: 300` for the base functions and `{ maxDuration: 800, memory:
3009 }` for the render and export routes, "the Pro maximum" (`apps/studio/vite.deploy.config.ts`
lines 82 to 128, L2), so the project runs on a Pro plan. The environment holds
`BLOB_READ_WRITE_TOKEN`, `TURBOSLIDE_TOKEN` and optionally `TURBOSLIDE_DOWNLOAD_SECRET`
(`docs/hosting.md`, L3). Vercel's function limits on the day of reading: 4.5 MB request and
response body ("413: `FUNCTION_PAYLOAD_TOO_LARGE`"), 300 s default duration, 800 s maximum on Pro,
2 GB memory default and 4 GB maximum on Pro (V6). The client IP arrives in `x-forwarded-for`,
which Vercel overwrites and "do not forward external IPs" so a client cannot spoof it;
`x-vercel-forwarded-for` and `x-real-ip` are "identical" copies (V7). Deployment Protection
remains a project setting Kevin can turn on (L3 section 6).

### A6 The runtime primitives already installed

TanStack Start 1.168.50 resolves `@tanstack/start-server-core` 1.169.32, whose
`@tanstack/react-start/server` exports `useSession`, `getSession`, `updateSession`,
`clearSession`, `sealSession`, `unsealSession`, `getCookie`, `setCookie`, `deleteCookie`,
`getRequestHeader(s)`, `getRequestHost` and `getRequestIP`
(`node_modules/.pnpm/@tanstack+start-server-core@1.169.32*/dist/esm/request-response.js` line 228,
L2). The session helpers wrap h3 v2 (`h3-v2`) with a default cookie name `"start"`; h3's
`DEFAULT_SESSION_COOKIE` is `{ path: "/", secure: true, httpOnly: true, sameSite: "lax" }` (h3
`dist/h3.mjs` lines 1186 to 1191, L2), so a session cookie is `Secure`, `HttpOnly` and `Lax` unless
a caller weakens it, and only the `__Host-` prefix and the `Max-Age` are the caller's to add; h3's
`seal` refuses an empty password and produces an eight part string with AES-CBC encryption, an HMAC
and an expiration through Web Crypto (lines 1018 to 1074). `getRequestIP` reads the
first entry of `x-forwarded-for` only when asked (`{ xForwardedFor: true }`) and otherwise the
socket address (h3 `dist/cache.mjs` lines 264 to 273, L2). TanStack's own authentication guide
recommends "An opaque session ID that the server looks up in a database" as the recommended
shape because it is easy to revoke, over stateless tokens, a `__Host-` prefixed `HttpOnly`
`Secure` cookie, origin checking
middleware, a rate limit middleware keyed on the client IP, and for OAuth a `state` and PKCE pair
kept in a signed cookie (TS1). Node is `>=24` (root `package.json`), which matters for `node:sqlite`
below.

### A7 The image and effects pipeline

`asset.add` decodes and dithers a picture with sharp on the server; `asset.dither` re-runs the two
tone pipeline from the kept source (`apps/studio/src/server/agent-actions.ts`, L2). The effects
package owns `bayer8(r, c)` (the deck's 8 by 8 permutation of 0 to 63), `bayerThreshold`,
`ditherGray`, `ditherRamp(w, h, theme)` with `RAMP_COLORS` (`dark: { ground: '#070707', cell:
'#f2f2f0' }`, `light: { ground: '#ffffff', cell: '#070707' }`), the two tone pipeline `twoTone(rgba,
params)` producing dark and light 1 bit PNG twins plus plate metrics, and `encodePng1`
(`packages/effects/src/{bayer,ramp,two-tone,png1}.ts`, L2). sharp 0.35.0 is in the catalog. The
chrome tokens are `--pt-paper: #ffffff`, `--pt-ink: #070707`, `--pt-ink-2: #3a3d44`,
`--pt-titanium: #8a8f98`, hairlines as ink at 18 and 9 percent, one 6 px radius reserved for the
search pill and segmented controls with "Every other box in the shell stays square", and Inter as
the one face (`packages/chrome/src/tokens.css`, L2). These are the materials an avatar generator
in the Prototemplate look draws from, and nothing needs to be added to render one.

### A8 The five plain statements

1. A visitor is the string `studio`; two visitors are indistinguishable; anyone can write as any
   name through the URL.
2. The browser keeps preferences in `localStorage` and receives no cookie from any route.
3. Server functions are protected against cross site requests and against nothing else; the
   bearer token gates agents.
4. The store is a file tree, or a Blob mirror of one, with conditional writes on the manifest and
   minute scale lag on listing and public reads; there is no key value store, counter or TTL.
5. The effects package can already draw a Bayer dithered gradient, a two tone picture and a 1 bit
   PNG, and the chrome has a fixed monochrome palette; an avatar generator needs no new dependency.

## Part B: the anonymous identity

### B1 What Google does, and what the substitute is

Google Slides shows a person it cannot name as an anonymous animal: "People you didn't invite
individually will show as anonymous animals when they're in the file", and "when you share or open
a file with a link, you may not see the names of people who view it" (G1). Round one's report 10
lists the animal's colour, the stability of its name for a session, how its edits appear in Version
history and whether it can comment as unverified (L1 "Unverified"); the page read today does not
settle them either. Google also shows initials when no picture is set: "If you haven't added a
profile picture yet, you'll see your initials instead" (G2).

Google can afford the animal because everyone who matters to a Google file is signed in. Turboslide
cannot: its majority user is a sales rep who opens a deck from a link (L5 report 07) and will not
sign in to edit a slide. The substitute is an anonymous identity that is real enough to attribute
work to and cheap enough to create silently:

- A stable anonymous id, generated in the browser on first visit.
- A display name the person chooses, with a generated neutral label when they decline.
- An avatar generated from the id (Part I), replaced by a picture only when they choose.
- A chip in the title row and a presence colour derived from the id, so two anonymous people are two
  colours and two labels even when both typed nothing.

The UI must say what it is: a self declared name. Round one's rule stands: "every surface that
shows a name must show it as what it is: a label the visitor typed" (L1 C4).

### B2 The stable anonymous id

`crypto.randomUUID()` "is used to generate a v4 UUID using a cryptographically secure random number
generator", requires a secure context (HTTPS or localhost), and has been "available across browsers
since March 2022" (M1). A v4 UUID carries 122 random bits, above the 64 bit floor OWASP sets for an
identifier that must not be guessed (O2). Where it lives decides how long it lasts:

| Where                                     | Survives                                                                                                                                                                                                 | Fails                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `localStorage` only                       | Reloads, tabs, deploys; what the studio does for every preference today (A2).                                                                                                                            | Cleared site data, a second browser, a private window. WebKit deletes "Indexed DB, LocalStorage, Media keys, SessionStorage, Service Worker registrations and cache" for a site "after seven days of Safari use without user interaction on the site" (W1), so a Safari user who opens a deck once a fortnight gets a new id each time. |
| A cookie set by `document.cookie`         | The same as above.                                                                                                                                                                                       | WebKit's earlier client side cookie cap (W1 refers to the February 2019 measure) and every cookie limit below.                                                                                                                                                                                                                          |
| A cookie set by the server (`Set-Cookie`) | Reloads, tabs, deploys, and WebKit's seven day rule, which applies to "script-writable storage forms" and does not name server set HTTP cookies (W1). It is what a sign in session uses anyway (Part C). | A second browser, a private window, and the person clearing cookies. The value must be `HttpOnly`, `Secure`, `SameSite=Lax` or `Strict`, `Path=/` and prefixed `__Host-` (O2, TS1), and the server must sign it so a person cannot mint another visitor's id (h3 `seal`, A6).                                                           |

The design that follows from the table: the server mints the id on the first request that has no
cookie, seals it into a `__Host-` cookie with a long `Max-Age` (h3 clamps `Max-Age` at
`COOKIE_MAX_AGE_LIMIT`, `dist/h3.mjs` line 398, L2), and the browser mirrors the display name and
avatar choice in `localStorage` for instant paint while the sealed cookie is the identity the server
trusts. The id never appears in a URL; `?author=` goes away (its one honest use, the CLI's `$USER`,
stays on the CLI). A person who clears cookies becomes a new anonymous visitor, as in Google's model
a signed out person becomes a new animal.

### B3 The display name and the neutral label

The first edit, comment or lease from an anonymous visitor opens a one field prompt: "How should
others see you?" with the generated label prefilled, a Continue button and a "Sign in" link (Part
C). Decline keeps the label. The label is generated from the id, not from a word list Turboslide
would have to maintain and translate; Google's animal list is unverified and must not be copied
(L1). A pattern that reads as a label and never as a name is two tokens from closed sets the theme
owns, for example a material and a number ("Titanium 47"), so a label cannot collide with a real
person's name in the version log. Display names are limited to 40 code points, trimmed, with control
characters removed and bidirectional overrides stripped, and every surface renders them as text,
never as HTML (the sibling security report owns the escape rules).

### B4 What an anonymous identity can and cannot do

Everything a person can do today, because today everyone is anonymous: read, write, lease, save a
version, comment, be present, be followed. What it cannot be is trusted across browsers or named
in a share grant: a role granted to "Titanium 47" is a role granted to a cookie. Share roles in the
sibling report therefore bind to an account or to a link, never to an anonymous id, and an
anonymous visitor's role is whatever the link carries.

## Part C: sign in mechanisms

### C1 Passkeys and WebAuthn

The browser API: "When `navigator.credentials.create()` is used with the `publicKey` option, the
user agent creates new credentials via an authenticator", and `navigator.credentials.get()`
authenticates with an existing one; both "receive a very large random number called the
"challenge" from the server", at least 16 bytes; the API is "available only in secure contexts
(HTTPS)"; passkeys "must always be discoverable credentials"; the autofill form ("conditional
mediation") needs an input with `autocomplete="username webauthn"` and a `get()` call with
`mediation: "conditional"`; and the API is "Baseline Widely available", "available across
browsers since September 2021" (M2). Device support in May 2026: synced passkeys on Android 9+, iOS
16+ and macOS 13+, autofill on Safari 16.1+, Chrome 108+, Edge 122+ and Firefox 122+, cross device
sign in by QR code from Android 9+ and iOS 16+ authenticators, with the note that "This matrix
represents the default capabilities for a user out of the box" and third party managers widen it,
"particularly on macOS and Windows" (P1).

The library: `@simplewebauthn/server` 14.0.x needs "Node LTS 22.x and higher" and exports
`generateRegistrationOptions()`, `verifyRegistrationResponse()`,
`generateAuthenticationOptions()` and `verifyAuthenticationResponse()`; the server keeps the
challenge briefly and stores per credential the id, the public key bytes, the signature counter and
the transports; it needs `rpName`, `rpID` and `origin`, and "`rpID` of "localhost" is acceptable
for local development" (SW1). `@simplewebauthn/browser` 14.0.x exports `startRegistration()`,
`startAuthentication()` (with `useBrowserAutofill: true` for the autofill form),
`browserSupportsWebAuthn()`, `browserSupportsWebAuthnAutofill()` and
`platformAuthenticatorIsAvailable()` (SW2). better-auth's passkey plugin is built on SimpleWebAuthn,
takes `rpID`, `rpName` and `origin`, adds a `passkey` table (user, public key, counter, AAGUID),
exposes `addPasskey`, `signIn.passkey` (with `autoFill: true`), `listUserPasskeys`,
`deletePasskey` and `updatePasskey`, and with `registration.requireSession` off lets a passkey be
registered before any session exists through a `resolveUser` callback (BA3).

The domain rule is the one thing that decides whether passkeys fit Turboslide's hosting. The rpID
"must be a registrable domain" and "must not be on the Public Suffix List"; "Changing the Relying
Party ID for an online service will break existing passkeys"; a passkey registered for a parent
domain works on its subdomains (C1). Vercel's own knowledge base says `vercel.app` is on the public
suffix list "for security purposes" against supercookies and "it is not possible to set a cookie
at the level of `vercel.app` from your project subdomain" (V8). Consequences:

- On `turboslide.vercel.app` the rpID must be exactly `turboslide.vercel.app`. That works; a
  passkey made there is bound to that host.
- Every preview deployment has another host under `vercel.app`, so passkeys made on production do
  not sign in on a preview and passkeys made on a preview are throwaway. The Preview Deployment
  Suffix add on replaces `vercel.app` with a custom domain the team owns (V9), which would let a
  parent rpID cover production and previews, but it needs a custom domain and Vercel's nameservers
  and it is a paid add on on Pro.
- A later move to a custom domain (`slides.generaltranslation.com` or similar) invalidates every
  passkey made under `turboslide.vercel.app` unless the move happens before passkeys ship. This is
  the strongest argument for deciding the production domain before enabling passkeys, and for
  keeping magic links or GitHub as the recovery path.
- On a checkout the rpID is `localhost` and everything works.

Passkeys have no email, no provider and no cost. Their weakness for a sales team is recovery and
first contact: a person who signs up with a passkey on a work laptop and opens the deck on a phone
without a synced credential manager needs the QR cross device flow or a second method. OWASP calls
MFA "by far the best defense against the majority of password-related attacks" and names FIDO2 and
WebAuthn as the modern passwordless route (O1).

### C2 Magic links by email

The flow: a person types an email, receives a single use link, and clicking it creates the session.
OWASP's URL token guidance applies word for word: the token is "Generated using a cryptographically
secure random number generator", "Long enough to protect against brute-force attacks",
"Invalidated after they have been used", short lived, the page sets a `Referrer-Policy` of
`noreferrer`, the URL is built from a hardcoded origin and never from the `Host` header, the
response is "a consistent message for both existent and non-existent accounts" in "a consistent
amount of time", and requests are rate limited "on a per-account basis" (O3). better-auth's plugin:
`sendMagicLink({ email, url, token, metadata }, ctx)`, `expiresIn` default 300 s, new users
created unless `disableSignUp`, tokens kept in the `verification` table with `storeToken`
`"plain"` by default or `"hashed"`, consumed atomically on first use with `?error=INVALID_TOKEN`
on a retry, and `signIn.magicLink({ email, callbackURL })` on the client (BA4). Set `storeToken:
"hashed"`: a leaked verification table must not be a set of valid links.

The email provider: Resend's Node SDK is the `resend` package, `new Resend(process.env.RESEND_API_KEY)`
and `resend.emails.send({ from, to, subject, html | react })`; "The `from` address must use a
verified domain for production" and `onboarding@resend.dev` "is reserved for testing only" (R2).
"You must add and verify at least one domain to send emails with Resend", and Resend recommends a
subdomain "to isolate your sending reputation" (R3). Pricing: Free is "3,000" emails a month with
"100 emails per day", "3 domains", "30-day data retention"; Pro is "$20/mo" for "50,000" (R1). The
package `@turboslide/email` does not exist; the React email templates would be new.

The cost that matters is not money. A magic link needs a sending domain under General Translation's
DNS (SPF and DKIM records), a person with access to that DNS, and a decision about which address the
mail comes from. It also has the cross device gap: the link opens where the mail client opens it,
which on a phone is a different browser from the tab that asked. better-auth's email OTP plugin
solves that with a six digit code typed into the waiting tab: `sendVerificationOTP({ email, otp,
type })`, `otpLength` 6, `expiresIn` 300 s, `allowedAttempts` 3, `storeOTP` `"plain"` by default
with `"hashed"` and `"encrypted"` available, `disableSignUp`, and
`authClient.emailOtp.sendVerificationOtp()` then `authClient.signIn.emailOtp()` (BA5). The two
share the provider and the rate limit, and a form can offer both: the mail carries a link and a
code.

### C3 GitHub as an optional OAuth provider

A GitHub OAuth app is registered under "Developer settings", then "OAuth apps", with an
"Application name", a "Homepage URL" and an "Authorization callback URL"; "You can enter up to 10
callback URLs"; "Expire user access tokens" is on by default; the last step is "Register
application" (GH1). better-auth's GitHub provider takes `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET`, the callback is `/api/auth/callback/github`, the `user:email` scope is
required, and GitHub tokens do not refresh (BA6). The sign in call is
`authClient.signIn.social({ provider: "github" })`.

Ten callback URLs cover production, localhost and a handful of fixed preview hosts; they do not
cover arbitrary preview deployments, so GitHub sign in on previews needs either a stable preview
alias or the same Preview Deployment Suffix that passkeys want (C1). The audience fit is narrow:
Turboslide's majority user is a sales rep (L5), and a GitHub account is a developer's credential.
It costs nothing and it is the one provider that an engineer or an agent operator will already have.
It should be optional in configuration (present only when the two variables are set) and never the
only method.

### C4 Session handling libraries

better-auth: version 1.7.4, MIT, described as "The most comprehensive authentication framework for
TypeScript", depending on `kysely`, `jose`, `zod`, `@noble/hashes` and `@noble/ciphers` among
others, with `@tanstack/react-start` among its peer dependencies (N1). The official TanStack Start
integration mounts `auth.handler(request)` on a catch all route at `src/routes/api/auth/$.ts`,
reads the session in a server function with `getRequestHeaders()` and
`auth.api.getSession({ headers })`, and adds `tanstackStartCookies` from
`"better-auth/tanstack-start"` as the last plugin so cookies set inside server functions are
written (BA7). Core tables are `user`, `session`, `account` and `verification`; databases are
SQLite, Postgres, MySQL and MSSQL through Kysely, or Drizzle, Prisma and MongoDB adapters, or a
memory adapter for tests; "secondary storage" is an optional key value store for "sessions,
verification records, and rate-limiting counters" with `get`, `set(key, value, ttl)`, `delete`,
`getAndDelete` and `increment`; it can also run "without any database" with stateless cookie
sessions (BA1). The session table holds `id`, `token`, `userId`, `expiresAt`, `ipAddress` and
`userAgent`; `expiresIn` is 7 days and `updateAge` 1 day by default; the client has `listSessions`,
`revokeSession({ token })`, `revokeOtherSessions` and `revokeSessions`; a `cookieCache` can keep
session data in a second cookie (BA8). Plugins used below: anonymous (BA2), passkey (BA3), magic
link (BA4), email OTP (BA5), captcha (BA9). Options that matter on Vercel: `secret` throws in
production when unset, `trustedOrigins` accepts wildcards, `advanced.ipAddress.ipAddressHeaders`
defaults to `[]` so it must name `x-forwarded-for` explicitly, `advanced.useSecureCookies`,
`advanced.cookiePrefix`, `rateLimit { enabled, window, max, storage }`,
`user.deleteUser { enabled, sendDeleteAccountVerification, beforeDelete, afterDelete }`,
`account.accountLinking { enabled, trustedProviders, allowDifferentEmails, updateUserInfoOnLink }`
(BA10). A custom adapter is a `createAdapterFactory` call implementing `create`, `findOne`,
`findMany`, `update`, `updateMany`, `delete`, `deleteMany` and `count` with `adapterId`,
`adapterName` and the `supportsJSON`, `supportsDates`, `supportsBooleans`, `supportsNumericIds`
flags (BA11). The SQLite adapter accepts `better-sqlite3`, `node:sqlite` and `bun:sqlite`; the docs
note "The `node:sqlite` module is a Release Candidate as of Node.js 24.15.0" and that it no longer
needs a flag since 22.13.0 (BA12).

Lucia: "deprecated in March 2025"; the site is a learning resource that points to "the Auth Book"
and to a single file session implementation (LU1). Arctic, the OAuth client from the same author,
"was deprecated in July 2026" with the v3.7.0 documentation left on GitHub (AR1). Neither is a
dependency to adopt in 2026; both remain good reading for a hand rolled session table.

Auth.js: official packages are NextAuth.js v5 beta and v4 in maintenance, SvelteKit, Express, Qwik
and SolidStart; TanStack Start "is not listed"; the page opens with the note that Auth.js is now
part of Better Auth (AJ1). It is not a candidate for a TanStack Start app.

Hand rolled on TanStack Start: `useSession` from `@tanstack/react-start/server` gives a sealed
cookie session (A6) and the primitives for an opaque id cookie, a session table and an OAuth
`state` cookie are all present. TanStack's guide sets out the shape: `authMiddleware` looking up
`db.sessions.findValid(token)`, `csrfMiddleware` on `Origin`, `rateLimitMiddleware` on the IP,
generic responses on password reset ("Same response, same body, regardless of existence") (TS1).
Passkeys would still come from SimpleWebAuthn and mail from Resend. What a hand rolled layer does
not give is the anonymous linking flow, the passkey table, the magic link and OTP plumbing, the
device list and the captcha hook, each of which is a plugin in better-auth and a week each by hand.

### C5 Comparison table

| Mechanism                             | What it needs                                                                                                                                                                      | Cost                                                                                    | UX                                                                                                                                                             | Security                                                                                                                                                                                                                     | Fit                                                                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anonymous (sealed cookie, no account) | h3 `seal` and a `__Host-` cookie (A6); a `TURBOSLIDE_SESSION_SECRET`; nothing stored server side except the id inside every write it makes.                                        | None.                                                                                   | Zero friction; a name prompt on the first write; lost when cookies are cleared or on a second browser.                                                         | Cannot be impersonated without the secret; cannot be recovered; carries no proof of who a person is; a role bound to it is a role bound to a cookie (B4).                                                                    | The default for every visitor; the thing every other row upgrades. Required.                                                                         |
| Passkeys (WebAuthn)                   | `@simplewebauthn/server` and `browser` 14 (or better-auth's passkey plugin over them); a `passkey` table; a short lived challenge store; `rpID` fixed to the production host (C1). | None per sign in; the Preview Deployment Suffix add on if previews must share passkeys. | One tap on a device with a platform authenticator; autofill on Safari 16.1+, Chrome 108+, Firefox 122+, Edge 122+ (P1); QR flow across devices; no inbox wait. | Phishing resistant, origin bound, no shared secret; OWASP's recommended passwordless route (O1). Risks: rpID lock in to `turboslide.vercel.app`; no passkeys on previews; recovery needs a second method.                    | The primary sign in once the production domain is decided; not the only one. Recommended, gated on the domain decision.                              |
| Magic link by email                   | Resend (`resend` package, a verified sending domain with SPF and DKIM, `RESEND_API_KEY`); a `verification` table with hashed tokens; templates.                                    | Resend Free: 3,000 a month, 100 a day; Pro $20 a month for 50,000 (R1). DNS work once.  | Familiar to a sales audience; needs the inbox; the link opens in the mail client's browser, which on a phone is not the waiting tab (C2).                      | Single use, five minute tokens, per account and per IP limits, generic responses (O3, BA4). Risks: mailbox compromise equals account compromise; the sending domain's reputation; a leaked table if tokens are stored plain. | The recovery and first contact method for people without passkeys; pair with a typed code (next row) for the cross device case. Recommended.         |
| Email one time code                   | The same provider and table as magic links; better-auth's email OTP plugin (BA5).                                                                                                  | Same as magic links.                                                                    | Six digits typed into the tab that asked; works when the mail is read on another device.                                                                       | Three attempts per code, five minute expiry, hashed storage available (BA5). Risks as magic links; codes are phishable by a person relaying them, which links are too.                                                       | Ship in the same mail as the link. Recommended.                                                                                                      |
| GitHub OAuth                          | An OAuth app with up to 10 callback URLs (GH1); `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`; better-auth's GitHub provider or a hand rolled `state` and PKCE flow (TS1).         | None.                                                                                   | One click for people with a GitHub account; a strange ask for a sales rep; no previews without fixed callback hosts.                                           | Delegated; GitHub's own MFA; `user:email` scope only (BA6). Risks: the client secret in the environment; account linking by email must be limited to trusted providers (BA10).                                               | Optional, enabled only when the two variables are set; for engineers and agent operators. Recommended as optional.                                   |
| Google sign in                        | A Google Cloud project and OAuth client.                                                                                                                                           | None.                                                                                   | The one the audience expects.                                                                                                                                  | Delegated.                                                                                                                                                                                                                   | Excluded by the directive ("without Google services"); SPEC open question 3 already asks who would own the project. Not proposed.                    |
| Password                              | A hashing library, a reset flow, a breach check.                                                                                                                                   | None.                                                                                   | Familiar; one more password to forget.                                                                                                                         | The weakest row; OWASP's whole cheat sheet is about mitigating it (O1).                                                                                                                                                      | Not proposed; passkeys and mail cover every case a password would.                                                                                   |
| Library: better-auth 1.7.4            | A database through Kysely (`node:sqlite` on a checkout, Postgres on Vercel) or a custom adapter; optional secondary storage; the TanStack Start integration (BA7).                 | MIT; the database and KV are Part D.                                                    | One client (`createAuthClient`) with `useSession`, `signIn.*`, `listSessions`; the anonymous, passkey, magic link, OTP, captcha and GitHub flows are plugins.  | Built in rate limiting (3 per 10 s on sign in paths, 429 with `X-Retry-After`, BA13), hashed tokens on request, `deleteUser` with verification, account linking controls (BA10).                                             | The recommended library: it is the only maintained one with an official TanStack Start integration and the anonymous to account link built in (BA2). |
| Library: hand rolled on Start         | `useSession`, `getCookie`, `setCookie`, `getRequestIP` (A6); SimpleWebAuthn; Resend; a session table; every flow written by hand.                                                  | None.                                                                                   | Whatever is built.                                                                                                                                             | As good as the implementation; TanStack's guide is a sound outline (TS1).                                                                                                                                                    | Viable for the anonymous cookie alone (which needs no library); not for the account flows. Use for the anonymous layer, better-auth for accounts.    |
| Library: Lucia, Arctic, Auth.js       | Nothing; deprecated or not for this framework.                                                                                                                                     | None.                                                                                   |                                                                                                                                                                |                                                                                                                                                                                                                              | Not candidates (LU1, AR1, AJ1).                                                                                                                      |

## Part D: where sessions and identities live

### D1 The options on Vercel

| Store                                | What it is                                                                                                                                                                          | Latency and consistency                                                                                                                                                                               | Cost                                                                                                                                                             | Fit for sign in sessions                                                                                                                                                                                                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Blob (what the store has, A4) | Object storage with `head`, `get`, `put` (conditional `ifMatch`), `list`, `del`; public or private stores.                                                                          | `list()` lags `head()` by up to a minute and the public CDN serves a stale body after an overwrite (A4). Rate limits: 900 advanced operations a minute on Hobby, 4,500 on Pro (V2).                   | Storage $0.023 a GB, simple operations $0.40 per million, advanced (`put`, `list`, `copy`) $5.00 per million, `del` free; Pro pays from the monthly credit (V2). | Wrong shape for a session lookup on every request: each `getSession` is a `head` plus `get`, each renewal a `put`, each challenge a `put` and a `del`, with minute scale staleness on public reads. Right for immutable files: avatars, exported snapshots, a per user profile document written rarely. |
| Global Config (formerly Edge Config) | A replicated read store for configuration; "Edge Config is now Global Config" (V3).                                                                                                 | "Most lookups return in less than 1ms" (V4); writes take "Up to 10 seconds globally" and "You should avoid using Global Configs for frequently updated data" (V3); 1 MB per store on every plan (V3). | Reads $3.00 and writes $5.00 (per unit as listed on the Pro price table, V3).                                                                                    | Not a session store: a 1 MB ceiling and ten second writes. Right for the sign in switches (which providers are on, the rpID, the allowed origins) if they must change without a deploy.                                                                                                                 |
| Upstash Redis (Marketplace)          | Serverless Redis over HTTP; the Marketplace integration "replaces Vercel KV" and existing KV stores were migrated (V5); it injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` (V10). | Single digit millisecond reads with TTL, atomic `INCR`, `GETDEL`; exactly the `SecondaryStorage` interface better-auth defines (BA1).                                                                 | Free: "500K" commands a month, "256 MB", "10 GB" bandwidth; pay as you go "$0.2 per 100K commands" (U1).                                                         | The session, verification, challenge, presence and rate limit store. One command per session read at 500K free commands a month is about 16,000 session checks a day before any charge; the sibling multiplayer report will count presence traffic against the same budget.                             |
| Neon Postgres (Marketplace)          | Serverless Postgres; Vercel Postgres stores "transitioned to Neon's native integration (Q4 2024 - Q1 2025)" and are "billed through Vercel" (NE2).                                  | A relational store with indexes; scales to zero "After 5 min" on Free (NE1), so the first query after idle pays a cold start.                                                                         | Free: "0.5 GB/project", "100 CU-hours/project", "100" projects; Launch "$0.106/CU-hour" (NE1).                                                                   | The identity tables (`user`, `account`, `passkey`, share grants) through better-auth's Kysely adapter, which is its primary supported path (BA1). It is the "Postgres with the same interface" SPEC 11 already foresees (L6).                                                                           |
| `node:sqlite` on a checkout          | Node's built in SQLite, a Release Candidate at Node 24.15.0 (BA12); Turboslide requires Node 24 (A6).                                                                               | Local disk; no network.                                                                                                                                                                               | None; no native addon to build.                                                                                                                                  | The identity store for `pnpm dev` and for a self hosted checkout, at `<repo>/.turboslide/auth.sqlite` or `TURBOSLIDE_AUTH_DB`. It cannot serve a Vercel function: the filesystem there is read only apart from `/tmp` and `/tmp` does not survive the instance (L3).                                    |
| In process memory                    | better-auth's memory adapter and its default rate limit storage (BA1, BA13).                                                                                                        | Instant; per instance.                                                                                                                                                                                | None.                                                                                                                                                            | Tests and `pnpm dev` only; two function instances would hold two session sets.                                                                                                                                                                                                                          |
| Sealed cookie only (stateless)       | better-auth's "stateless session management without any database" (BA8), or h3 `useSession` (A6).                                                                                   | No lookup at all; a cookie is limited by the browser's per cookie size floor (RFC 6265 asks for at least 4096 bytes per cookie, RF1).                                                                 | None.                                                                                                                                                            | The anonymous identity (B2) and nothing that must be revocable: a stateless sign in session cannot be listed or revoked from another device, which Part F needs.                                                                                                                                        |

### D2 The two environments

| Concern                    | Checkout (`file` store)                                                             | Vercel (`blob` store)                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity tables            | `node:sqlite` file under `.turboslide/`, gitignored like the leases.                | Neon Postgres through `vercel install neon` (V4), `DATABASE_URL` injected.                                                                     |
| Sessions, tokens, counters | Memory (better-auth default) or the same SQLite file.                               | Upstash Redis through `vercel install upstash` (V4), as better-auth `secondaryStorage`.                                                        |
| Avatars and profile files  | `.turboslide/users/<principalId>/`, served by a route confined to that folder (A4). | The existing Blob store under `users/<principalId>/`, public URLs like the deck twins (L3).                                                    |
| Anonymous identity         | Sealed `__Host-` cookie; `localStorage` mirror.                                     | The same.                                                                                                                                      |
| Secrets                    | `TURBOSLIDE_SESSION_SECRET` generated and written to `.turboslide/` on first run.   | `BETTER_AUTH_SECRET` and `TURBOSLIDE_SESSION_SECRET` in the project environment; `RESEND_API_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`. |

A Blob backed better-auth adapter over `createAdapterFactory` (BA11) is possible and would keep the
deployment to one storage product. It is not recommended: `findMany` and `count` over a prefix are
`list()` calls that lag a minute and cost as advanced operations, `update` is a read modify write
without a transaction beyond `ifMatch` on one key, and a session check on every request would be
the most frequent call the studio makes. The store's own notes on Blob consistency (A4) were
written for a document that changes a few times a minute, not for a table read on every request.

## Part E: linking an anonymous identity to an account

### E1 What the library does

better-auth's anonymous plugin creates a user with `isAnonymous` set and an email of the shape
`{id}@anonymous.placeholder.invalid` through `signIn.anonymous()`; when that user "later
authenticates via another method, the `onLinkAccount` callback fires, receiving both the anonymous
and new user objects", and "The anonymous user record is automatically deleted by default after
successful linking" unless `disableDeleteAnonymousUser` is set (BA2). Account linking between
providers is on by default with `trustedProviders` to skip email verification for named OAuth
providers and `disableImplicitLinking` to require an explicit link (BA10).

### E2 What Turboslide must carry across the link

The version log is immutable per record and every record carries an `Author` (A1). Comments,
leases, presence records and share grants will carry a principal id (sibling reports). The link
must not rewrite history and must not lose attribution:

1. The principal id is the anonymous id, minted once per browser (B2). Every write, comment and
   lease made before sign in stores that id inside `Author` as a new optional field
   (`Author.principalId`), beside the label the person chose. The label stays for the CLI's
   `$USER` and for agents.
2. Signing in creates or finds an account and records the anonymous id as an alias of that
   account (`account.aliases: string[]`), in `onLinkAccount`. The account's user id becomes the
   principal id for new writes; the alias table resolves old ids to the account when a name,
   avatar or colour is rendered.
3. Rendering a version's author is therefore a lookup: `principalId` to the current profile, and
   only when that fails the stored label. Restore, diff and history keep their bytes.
4. Two anonymous browsers linked to one account are two aliases; both histories render as one
   person, which is what a person expects when they sign in on a second machine.
5. The anonymous user record may be deleted after linking (the plugin's default), because the
   alias table, not that record, carries the mapping.

The anonymous plugin's own anonymous user is not needed for the anonymous layer itself: a sealed
cookie carries the id without a database row (B2), and creating a `user` row per visitor would fill
the identity table with cookies. The plugin is used only at the moment of linking, or the link is
written by hand in the sign in callback with the same effect. Whether `onLinkAccount` fires for a
passkey first sign in (`registration.requireSession` off, BA3) is not stated in the pages read and
must be verified in the build.

## Part F: sign out and device management

OWASP: "When a session expires, the web application must take active actions to invalidate the
session on both sides, client and server"; the id "must be renewed or regenerated by the web
application after any privilege level change"; and applications should let people "check the
details of active sessions at any time, monitor and alert the user about concurrent logons,
provide user features to remotely terminate sessions manually" (O2). better-auth's session table
holds `ipAddress` and `userAgent` and the client has `listSessions`, `revokeSession({ token })`,
`revokeOtherSessions` and `revokeSessions` (BA8), which is the whole device list.

The design:

- Sign out ends the sign in session server side and clears its cookie, and keeps the anonymous
  cookie, so the person becomes the anonymous visitor they were, not a new one. Google's model
  after sign out is a new animal; the alias table makes the kept id harmless because it no longer
  resolves to the account for new writes until they sign in again.
- "Forget this browser" is the anonymous sign out: it deletes the anonymous cookie and the
  `localStorage` mirror and mints a new id. It exists so a shared machine can be handed over.
- The profile dialog lists sessions with the browser and platform parsed from `userAgent`, the
  coarse location from `ipAddress`, the creation and last activity times, "This browser" on the
  current one, and Sign out per row and everywhere else. The list is an action (`account.sessions`,
  `account.signOut`) so the CLI and MCP can show and revoke it.
- Adding a passkey, linking GitHub or changing the email requires a fresh session (better-auth's
  `freshAge`, BA10) and revokes other sessions on email change.

## Part G: the privacy baseline

GDPR Article 5(1)(c) requires personal data "adequate, relevant and limited to what is necessary in
relation to the purposes for which they are processed" and 5(1)(e) that it be "kept in a form which
permits identification of data subjects for no longer than is necessary" (GD1); Article 17 gives
"the right to obtain from the controller the erasure of personal data concerning him or her
without undue delay" (GD2). The baseline, per tier:

| Tier      | Stored server side                                                                                                                                                                                                                                   | Retention                                                                                                                                  | Deletion                                                                                                                                                                                                                                                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anonymous | The id and the label inside the writes, comments and leases the person made; presence records while present; rate limit counters keyed on the id and the IP.                                                                                         | Writes and comments live as long as the deck; presence and counters expire by TTL (minutes).                                               | "Forget this browser" removes the browser side; the writes stay attributed to an id nobody can resolve, which is the anonymous animal's fate too.                                                                                                                                                                                                  |
| Signed in | `user` (id, name, email, `emailVerified`, `image`, timestamps), `account` (provider ids), `passkey` (public keys, counters, AAGUID), `session` (token, expiry, `ipAddress`, `userAgent`), `verification` (hashed tokens), aliases, the avatar files. | Sessions 7 days idle, refreshed daily (BA8); verification rows 5 minutes (BA4); IP and user agent only inside sessions, so at most 7 days. | `deleteUser` with `sendDeleteAccountVerification` (BA10); `beforeDelete` refuses while the person owns decks nobody else can reach until they transfer or trash them; `afterDelete` removes the avatar blobs, the aliases and the sessions and rewrites the display of their principal id to "Deleted account" without touching the version bytes. |

What is never stored: passwords (there are none), the raw magic link token, the email body, the
uploaded avatar's original bytes beyond the processing call (Part I), and any analytics identifier.
Logs name principal ids, never emails; the sibling security report owns the logging rules. The
privacy text lives in the profile dialog in the same plain sentences as the Share dialog's two
today.

## Part H: rate limits on sign in

OWASP: respond "in a generic manner" to a failed sign in, keep the failed attempt counter
"associated with the account itself, rather than the source IP address", add a CAPTCHA "after a
small number of failed attempts rather than from the first", avoid timing differences between an
existing and a missing account, and "Enable logging and monitoring of authentication functions to
detect attacks/failures on a real-time basis" (O1). For tokens, limit requests "on a per-account
basis" and answer the same for existing and missing accounts (O3).

The layers available:

- better-auth's limiter: on in production, "Window: 60 seconds" and "Max Requests: 100 requests"
  by default, "3 per 10 seconds" on the email sign in path, `customRules` per path, storage in
  memory, the database or secondary storage, and a 429 with `X-Retry-After` (BA13). In memory is
  per instance and therefore not a limit on Vercel; it must be `secondary-storage` (Upstash, D1).
  The IP it keys on comes from `advanced.ipAddress.ipAddressHeaders`, which defaults to `[]` and
  must name `x-forwarded-for` (BA10), a header Vercel overwrites so clients cannot spoof it (V7).
- `@upstash/ratelimit` for the studio's own routes: "the only connectionless (HTTP based) rate
  limiting library" (U2), with `Ratelimit.fixedWindow(10, "10 s")`, `Ratelimit.slidingWindow(10,
"10 s")` and `Ratelimit.tokenBucket(5, "10 s", 10)`; sliding window "Supports dynamic limits" at
  the cost of "More expensive in terms of storage and computation" (U3). The sibling security report
  owns the per route table; sign in shares the client.
- Vercel WAF rate limiting at the edge: rules keyed on "IP, JA4 Digest", fixed window, "Minimum:
  10s, Maximum: 10mins", "1 per project" rule on Hobby and "40 per project" on Pro, actions Log,
  Deny and Challenge, counters "tracked on a per-region basis" (V11). One rule on `/api/auth/*`
  stops a flood before the function bills.
- A captcha after failures: better-auth's captcha plugin supports "Cloudflare Turnstile", "Google
  reCAPTCHA", "hCaptcha" and "CaptchaFox", guards `/sign-up/email`, `/sign-in/email` and
  `/request-password-reset` by default with an `endpoints` override, and reads the token from the
  `x-captcha-response` header (BA9). Turnstile "can be embedded into any website without sending
  traffic through Cloudflare" and has managed, non interactive and invisible modes (CF1); the
  server posts `secret` and `response` to `https://challenges.cloudflare.com/turnstile/v0/siteverify`,
  "Each token can only be validated once" and a token "is valid for five minutes" (CF2). Google's
  reCAPTCHA is excluded by the directive; Turnstile's plan limits could not be read (Unverified).

The numbers to start from, per window, with the account key where one exists and the IP key
otherwise: magic link and code requests 3 per email per 10 minutes and 10 per IP per hour; code
verification 3 attempts per code (the plugin's default, BA5) then a new code; passkey challenges
10 per IP per minute, each challenge expiring in 60 seconds and consumed once; GitHub callback 10
per IP per minute; session reads unlimited but served from the cookie cache (BA8) so a burst costs
no Redis commands; a Turnstile challenge after 5 failures on one email or 20 on one IP within an
hour. Every refusal is the same sentence on the same path with the same timing, and every one is
logged with the principal id, the path and the key that tripped.

## Part I: avatars

### I1 How others do the default and the upload

| Product | Default when nothing is uploaded                                                                                                                                                                                                                        | Upload rules stated                                                                                                                                                                             | Source   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Google  | "If you haven't added a profile picture yet, you'll see your initials instead."                                                                                                                                                                         | "Rotate and crop your photo as needed"; no size stated.                                                                                                                                         | G2       |
| GitHub  | Identicons since 14 August 2013: "simple 5×5 'pixel' sprites that are generated using a hash of the user's ID", the algorithm "walks through the hash and turns pixels on or off depending on even or odd values", with "Hash-determined color values". | The profile page offers "Crop your picture" and "revert to your identicon" or "Revert to Gravatar"; no size or format stated on the page read.                                                  | GH2, GH3 |
| Slack   | Not stated on the help page read; Gravatar takes precedence: "If your Slack email address is the same one used for your Gravatar account, your Slack profile picture will be your Gravatar."                                                            | "a minimum of 512x512 pixels, but no larger than 1024x1024 pixels"; the API crops with `crop_x`, `crop_y` and `crop_w`, "Width/height of crop box (always square)", formats "JPEG, GIF or PNG". | SL1, SL2 |
| Figma   | "If you haven't added an avatar, we will identify you by a colored circle with your first initial."                                                                                                                                                     | "Supported image formats include JPEG, PNG, GIF, BMP, and SVG. GIFs will be converted into a static image." "Image files must be a minimum of 500x500px".                                       | FG1      |
| Linear  | "The default avatar will be the first and last initials of your account."                                                                                                                                                                               | "Change avatar" and "remove the photo entirely"; no size stated.                                                                                                                                | LN1      |
| Notion  | "your initial above `Add photo`"; a separate "Preferred name" field.                                                                                                                                                                                    | None stated.                                                                                                                                                                                    | NO1      |

The pattern across six products: a letter or two letters on a colour is the default everywhere
except GitHub, which generates a symmetric pixel grid from a hash; the upload is cropped to a
square, has a minimum size around 500 px and a maximum around 1024 px, and can be removed to return
to the default. The colour is derived from the person, not chosen, in every case read.

### I2 Generated avatars that fit a monochrome dithered interface

The chrome has one ink, one paper, two greys and a Bayer screen (A7). A generated avatar must read
at 24 px in the title row and at 256 px in a profile dialog, in light and dark chrome, and it must
be the same picture on every device for one id. Four families, each deterministic from
`sha256(principalId)`:

1. Initials on a plate. One or two letters of the display name in Inter, ink on paper or paper on
   ink by theme, on a square plate (the shell's boxes are square except the search pill, A7). The
   plate carries a hairline in `--pt-hair`. Because the palette is monochrome, distinctness between
   people comes from a second channel, not hue: a 4 bit tone from the hash chooses the plate's
   Bayer dither density (8 steps from solid ink to paper through `bayer8` thresholds) so two
   people with the same initials sit on two different greys. The letters stay solid so they read
   at 24 px. This is Google's, Figma's, Linear's and Notion's default in the deck's material.
2. A dithered gradient disc or square. `ditherRamp` already draws a horizontal ramp from ink to
   paper (A7); an avatar variant draws a radial or angled ramp whose centre, angle and curve come
   from the hash, at one cell per pixel at 2x like the deck's dither block. Nothing else in the
   shell moves, so the picture is static; at 24 px it reads as a grey with a grain.
3. A glyph field. A 5 by 5 or 7 by 7 grid of cells, each cell either empty or one glyph from a
   fixed set the theme owns (the GT mark's strokes, a dot, a dash, a slash, a square), horizontally
   symmetric like GitHub's identicon so it reads as a figure, picked from the hash. This is the
   identicon idea in the deck's vocabulary. The set must be drawn for the theme; no product's
   artwork is copied.
4. A boring-avatars or DiceBear style figure. `boring-avatars` is MIT, renders SVG from a `name`
   with variants "marble, beam, pixel, sunset, ring, bauhaus" and a `colors` array (BO1); DiceBear
   is "a privacy-focused, open source avatar library with 61 avatar styles" whose core is MIT while
   "Individual avatar styles have their own licenses" (DB1); Jdenticon is MIT and generates
   identicons as SVG or canvas from a hash (JD1). All three assume hue for distinctness and would
   need their palettes forced to ink, paper and the two greys, at which point the marble and
   bauhaus variants lose most of their difference. `pixel` with a monochrome palette is the nearest
   to family 3 and could be the reference implementation for it.

The recommendation is families 1 and 3 as the built in variants and 2 as the third choice in the
builder, all rendered by Turboslide's own code with no dependency: the hash, `bayer8`, the Inter
face and an SVG template are enough, and the same function renders SVG for the UI and a 1 bit PNG
through `encodePng1` for exports and for the cursors and chips the multiplayer report draws on the
canvas. The choice a person makes (variant, initials override, density) is a small JSON document
in the profile, so an agent can set it (`account.setAvatar`) and the CLI can print it.

### I3 The builder

The avatar builder is one dialog in the Prototemplate look with four tabs that are the four rows a
Google user would recognise, in the order a person is most likely to want them: Initials, Glyph,
Dither, Picture. Each tab shows the result at 24, 32, 64 and 256 px in light and dark chrome side
by side so the choice is judged where it will be seen. Initials takes the two letters from the
display name and lets a person retype them; Glyph and Dither offer "Another" to reroll a salt
stored in the profile so the picture stays deterministic afterwards; Picture is the upload of I4.
The dialog is reachable from the title row chip, from the name prompt of B3 as a second step, and
from the profile.

### I4 The upload path

The browser: a file input accepting `image/jpeg`, `image/png`, `image/webp` and `image/gif`
(first frame), a square crop the person drags (Slack's contract of a square crop box, SL2), and a
client side resize of the crop to at most 1024 px before upload, so the request stays far under
Vercel's 4.5 MB body limit (V6) and a phone photograph of 12 MB never leaves the device. SVG is
refused for avatars: it is a document format that can carry scripts and external references, the
sibling security report treats it as such, and sharp would rasterise it through librsvg at a
`density` the caller sets (SH3), which is more surface than an avatar needs. The alternative is
Vercel's client upload with `handleUpload` and `onBeforeGenerateToken` restricting
`allowedContentTypes` and authorising the user, which exists for files "larger than 4.5 MB" and
whose `onUploadCompleted` webhook "will not work" on localhost without a tunnel (V12); an avatar
does not need it, and the server function path works the same on a checkout and on Vercel.

The server (a server function, the same code on a checkout and on Vercel):

1. Sniff the bytes with sharp's `metadata()`; refuse anything whose format is not JPEG, PNG, WebP
   or GIF regardless of the declared type, and anything over 1024 by 1024 after the client resize.
2. Construct with `limitInputPixels` at its default `268402689` and `failOn: 'error'` so truncated
   or malformed data is rejected rather than rendered (SH3); `animated: false` takes the first
   frame (SH3), which is Figma's rule for GIFs (FG1).
3. `rotate()` to honour the orientation tag before it is stripped, then `resize(size, size, { fit:
'cover', position: 'centre' })` per size, `kernel` at its default `lanczos3` (SH1), for the
   sizes 32, 64, 128 and 256. The crop box the person chose arrives as `extract({ left, top,
width, height })` before the resize (SH1); when no box is given, `position: sharp.strategy.attention`
   picks the face.
4. Encode WebP with `quality` 80 (the default) and `effort` 4 (SH2) for the UI, and one PNG at 256
   for the export paths that embed pictures in PPTX and PDF. Metadata is removed by default, "which
   includes EXIF-based orientation" (SH2), so no location or camera data survives.
5. Name each file by the content hash of the 256 px PNG: `users/<principalId>/avatar/<sha256>-<size>.webp`
   and `...-256.png`, so a URL is immutable and cacheable, an old avatar is deleted by prefix when
   a new one lands, and two uploads of the same picture are one set of files.
6. Store: on Vercel, the existing Blob store with public access like the twins (`del` is free, V2);
   on a checkout, `.turboslide/users/<principalId>/avatar/`, served by a route confined to that
   folder exactly as `assetPathWithin` confines the deck twins (A4).
7. Write `user.image` (better-auth's field, BA10) to the 256 px URL and the size ladder to the
   profile document; the chip asks for 32 or 64 by the device pixel ratio.

The originals are never kept: the processing call reads the upload from memory and writes only the
derived files, which is the data minimisation rule of G in practice.

## Part J: recommendation

1. Anonymous by default, server minted. The first request without an identity cookie gets a
   `__Host-` sealed cookie carrying a v4 UUID (B2), mirrored in `localStorage` with the display
   name and avatar choice. `?author=` is removed from the editor; `Author` gains an optional
   `principalId`; the label prompt of B3 appears on the first write. This ships without any new
   service and without a database, and it alone makes two visitors two people.
2. Optional sign in through better-auth 1.7.4 with the official TanStack Start integration (C4),
   three methods in this order: magic link with a typed code in the same mail through Resend (C2),
   passkeys through the passkey plugin (C1), and GitHub when its two variables are set (C3). No
   passwords, no Google. Passkeys are enabled only after Kevin decides the production domain,
   because the rpID cannot move later without breaking every passkey (C1).
3. Storage: `node:sqlite` on a checkout and Neon Postgres on Vercel for the identity tables, Upstash
   Redis on Vercel as secondary storage for sessions, verification rows, challenges and the rate
   limit counters, memory for both on a checkout (D2). Blob keeps the files: avatars and profile
   documents. Both Marketplace products have free tiers that cover a sales team (D1).
4. Linking through the alias table (E2): history is never rewritten; a principal id resolves to a
   profile at render time; deletion resolves it to "Deleted account".
5. Sign out keeps the anonymous cookie; "Forget this browser" replaces it; the profile lists
   sessions with revoke per row (F). All of it is actions with CLI, MCP and window handlers.
6. Rate limits in three layers, better-auth on secondary storage, one WAF rule on `/api/auth/*`,
   Turnstile after failures, with the starting numbers of H, and every refusal generic and logged.
7. Avatars generated by Turboslide's own code from the principal id in three variants (initials on
   a dithered plate, a glyph field, a dithered gradient), an upload path that crops in the browser,
   processes with sharp at 32 to 256 px as WebP plus one PNG, keeps no original and stores under the
   principal's prefix (I).

### J1 Open questions for Kevin

1. The production domain. `turboslide.vercel.app` or a General Translation subdomain, decided
   before passkeys ship (C1).
2. The sending domain and address for magic links, and who holds Resend and the DNS (C2).
3. Whether GitHub sign in is wanted at all for a sales audience, or only for engineers and agent
   operators (C3).
4. Whether two Marketplace products (Neon, Upstash) are acceptable beside Blob, or whether the
   identity tables should wait for the Postgres that SPEC 11 already plans and use a Blob adapter
   meanwhile with the costs of D2 accepted.
5. Whether anonymous visitors may comment and take share roles by link (B4), which the sibling
   reports assume.

## Unverified

Claims that would have been useful and that no page read for this report states:

- Google: the colour and session stability of an anonymous animal's name, and how its edits appear
  in version history; the page read (G1) says only that uninvited people "show as anonymous
  animals". Round one listed the same gap.
- Slack's default avatar when no picture and no Gravatar exist; the help page read (SL1) states
  the Gravatar rule and the sizes only. A third party page in the search results describes a
  generated default; it is not cited as fact.
- GitHub's avatar size and format limits; the profile page read (GH3) describes the crop step only.
- Whether `vercel.app` appears in the Public Suffix List file itself: the raw list was truncated
  by the fetch tool before its private section. Vercel's own knowledge base states the fact (V8)
  and that statement is relied on.
- Turnstile's free plan limits (widgets and hostnames): the product and troubleshooting pages read
  did not state them (CF1; the FAQ page returned 404).
- Whether better-auth's `onLinkAccount` fires for a passkey first registration with
  `registration.requireSession` off (E2), and whether the anonymous plugin's `disableDeleteAnonymousUser`
  interacts with `deleteUser` hooks; both are build time checks.
- The per unit basis of the Global Config read and write prices ($3.00 and $5.00, V3): the table
  shows the amounts without the unit on the page as rendered.
- The exact `ipAddressHeaders` default: the options page states `[]` (BA10) while the session page
  says `ipAddress` is taken "from request headers" (BA8); set the option explicitly.
- Resend's restriction on `onboarding@resend.dev` beyond "reserved for testing only" (R2); the
  domains page read (R3) did not state a recipient restriction.

Turboslide claims are read from the code at `61b16e4` and are not in this list; nothing was
measured at runtime.

## Sources

Read date for every entry: 2026-09-13.

Local files (L), all under /Users/kevinliu/repos/Turboslide at `61b16e4`:

- L1 docs/gslides-parity/research/10-identity-sharing-and-presence.md (round one, written
  2026-09-11).
- L2 Code: packages/schema/src/mutations.ts; packages/store/src/{store,lease,select,hosted,tmp-store,blob-store}.ts;
  packages/agent/src/http/auth.ts; apps/studio/src/server/{auth,sessions,tokens,write,agent-actions,hosting-plugin}.ts;
  apps/studio/src/start.ts; apps/studio/src/routes/{edit.$deckId,__root,decks.index,decks.$deckId.assets.$}.tsx;
  apps/studio/vite.deploy.config.ts; packages/chrome/src/{TitleRow.tsx,tokens.css,GtMark.tsx,dialogs/Share.tsx,dialogs/AgentAccess.tsx,dialogs/Details.tsx};
  packages/effects/src/{bayer,ramp,two-tone,png1}.ts; packages/materials/src/catalog.ts;
  node_modules/.pnpm/@tanstack+start-server-core@1.169.32*/node_modules/@tanstack/start-server-core/dist/esm/request-response.js;
  node_modules/.pnpm/h3@2.0.1-rc.31*/node_modules/h3/dist/{h3,cache}.mjs; package.json; pnpm-workspace.yaml.
- L3 docs/hosting.md.
- L4 docs/gslides-parity/SPEC-2.md (the omission table, lines 780 to 807).
- L5 docs/gslides-parity/research/07-sales-users.md.
- L6 docs/spec/SPEC.md sections 11 and 12.

Google (G):

- G1 Anonymous or unknown people in a file. https://support.google.com/docs/answer/2494888
- G2 Change your Google Account profile picture. https://support.google.com/accounts/answer/27442

Mozilla (M):

- M1 Crypto: randomUUID() method. https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID
- M2 Web Authentication API. https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API

WebKit (W):

- W1 Full Third-Party Cookie Blocking and More, 24 March 2020. https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/

Passkeys and WebAuthn (P, SW, C):

- P1 passkeys.dev, Device support, last updated 20 May 2026. https://passkeys.dev/device-support/
- SW1 SimpleWebAuthn, @simplewebauthn/server. https://simplewebauthn.dev/docs/packages/server
- SW2 SimpleWebAuthn, @simplewebauthn/browser. https://simplewebauthn.dev/docs/packages/browser
- C1 Corbado, WebAuthn Relying Party ID (rpID) and passkeys. https://www.corbado.com/blog/webauthn-relying-party-id-rpid-passkeys

better-auth (BA, N):

- BA1 Database. https://www.better-auth.com/docs/concepts/database
- BA2 Anonymous plugin. https://www.better-auth.com/docs/plugins/anonymous
- BA3 Passkey plugin. https://www.better-auth.com/docs/plugins/passkey
- BA4 Magic link plugin. https://www.better-auth.com/docs/plugins/magic-link
- BA5 Email OTP plugin. https://www.better-auth.com/docs/plugins/email-otp
- BA6 GitHub provider. https://www.better-auth.com/docs/authentication/github
- BA7 TanStack Start integration. https://www.better-auth.com/docs/integrations/tanstack
- BA8 Session management. https://www.better-auth.com/docs/concepts/session-management
- BA9 Captcha plugin. https://www.better-auth.com/docs/plugins/captcha
- BA10 Options reference and Users and accounts. https://www.better-auth.com/docs/reference/options and https://www.better-auth.com/docs/concepts/users-accounts
- BA11 Create a database adapter. https://www.better-auth.com/docs/guides/create-a-db-adapter
- BA12 SQLite adapter. https://www.better-auth.com/docs/adapters/sqlite
- BA13 Rate limit. https://www.better-auth.com/docs/concepts/rate-limit
- N1 npm registry, better-auth latest (1.7.4). https://registry.npmjs.org/better-auth/latest

Other libraries (LU, AR, AJ, TS, BO, DB, JD):

- LU1 Lucia. https://lucia-auth.com/
- AR1 Arctic. https://arcticjs.dev/
- AJ1 Auth.js, Integrations. https://authjs.dev/getting-started/integrations
- TS1 TanStack Start, Authentication server primitives. https://tanstack.com/start/latest/docs/framework/react/guide/authentication-server-primitives
  (the Sessions guide URL https://tanstack.com/start/latest/docs/framework/react/guide/sessions returned not found; the installed package was read instead, L2)
- BO1 boring-avatars repository. https://github.com/boringdesigners/boring-avatars (and https://boringavatars.com/)
- DB1 DiceBear. https://www.dicebear.com/
- JD1 Jdenticon. https://jdenticon.com/

Email (R):

- R1 Resend pricing. https://resend.com/pricing
- R2 Resend, Send with Node.js. https://resend.com/docs/send-with-nodejs
- R3 Resend, Domains introduction. https://resend.com/docs/dashboard/domains/introduction

GitHub (GH):

- GH1 Creating an OAuth app. https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app
- GH2 Identicons, GitHub blog, 14 August 2013. https://github.blog/news-insights/company-news/identicons/
- GH3 Personalizing your profile. https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-github-profile/customizing-your-profile/personalizing-your-profile

Product help pages (SL, FG, LN, NO):

- SL1 Slack, Upload a profile photo. https://slack.com/help/articles/115005506003-Upload-a-profile-photo
- SL2 Slack, users.setPhoto. https://docs.slack.dev/reference/methods/users.setPhoto/
- FG1 Figma, Update your name or avatar. https://help.figma.com/hc/en-us/articles/360041034433-Update-your-name-or-avatar
- LN1 Linear, Profile. https://linear.app/docs/profile
- NO1 Notion, Account settings and preferences. https://www.notion.com/help/account-settings

Vercel (V):

- V1 Storage overview (Blob, Global Config, Marketplace; `vercel install neon`, `vercel install upstash`), last updated 2026-09-03. https://vercel.com/docs/storage
- V2 Vercel Blob pricing and limits, last updated 2026-08-11. https://vercel.com/docs/vercel-blob/usage-and-pricing
- V3 Global Config limits and pricing (formerly Edge Config), last updated 2026-07-29. https://vercel.com/docs/global-config/global-config-limits (reached from https://vercel.com/docs/edge-config/edge-config-limits)
- V4 As V1 (the "Provision databases through Vercel Marketplace" section).
- V5 Upstash joins the Vercel Marketplace, 22 October 2024. https://vercel.com/changelog/upstash-joins-the-vercel-marketplace
- V6 Vercel Functions limits, last updated 2026-08-24. https://vercel.com/docs/functions/limitations
- V7 Request headers, last updated 2025-12-13. https://vercel.com/docs/headers/request-headers
- V8 Can I set a cookie from my Vercel project subdomain to vercel.app. https://vercel.com/kb/guide/can-i-set-a-cookie-from-my-vercel-project-subdomain-to-vercel-app
- V9 Preview Deployment Suffix, last updated 2026-08-28. https://vercel.com/docs/deployments/preview-deployment-suffix
- V10 Upstash on the Vercel Marketplace. https://vercel.com/marketplace/upstash
- V11 WAF rate limiting, last updated 2026-08-28. https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
- V12 Client uploads with Vercel Blob, last updated 2026-08-26. https://vercel.com/docs/vercel-blob/client-upload

Upstash and Neon (U, NE):

- U1 Upstash Redis pricing. https://upstash.com/pricing/redis
- U2 @upstash/ratelimit overview. https://upstash.com/docs/redis/sdks/ratelimit-ts/overview
- U3 @upstash/ratelimit algorithms. https://upstash.com/docs/redis/sdks/ratelimit-ts/algorithms
- NE1 Neon pricing. https://neon.com/pricing
- NE2 Neon, Vercel Postgres transition guide. https://neon.com/docs/guides/vercel-postgres-transition-guide

Cloudflare (CF):

- CF1 Turnstile overview. https://developers.cloudflare.com/turnstile/
- CF2 Turnstile server side validation. https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

OWASP (O):

- O1 Authentication cheat sheet. https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- O2 Session management cheat sheet. https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- O3 Forgot password cheat sheet. https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html

sharp (SH):

- SH1 Resizing images. https://sharp.pixelplumbing.com/api-resize/
- SH2 Output options. https://sharp.pixelplumbing.com/api-output/
- SH3 Constructor. https://sharp.pixelplumbing.com/api-constructor/

Law and standards (GD, RF):

- GD1 GDPR Article 5. https://gdpr-info.eu/art-5-gdpr/
- GD2 GDPR Article 17. https://gdpr-info.eu/art-17-gdpr/
- RF1 RFC 6265 section 6.1, Limits. https://www.rfc-editor.org/rfc/rfc6265#section-6.1

Pages tried and not readable: https://www.npmjs.com/package/better-auth (403; the registry JSON N1
was read instead); https://raw.githubusercontent.com/publicsuffix/list/main/public_suffix_list.dat
(truncated before the private section); https://developers.cloudflare.com/turnstile/troubleshooting/faq/
(404); https://www.cloudflare.com/application-services/products/turnstile/ (no plan limits in the
rendered content); https://tanstack.com/start/latest/docs/framework/react/guide/sessions (not found).
