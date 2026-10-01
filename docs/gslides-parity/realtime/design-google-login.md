# Google sign in, fully set up

Design note for the realtime round, written 2026-10-01 in the worktree `Turboslide-realtime` at `f50b209d` (branch `realtime/round`, at `origin/main`). Line numbers are of that tree. Kevin's ask: "maybe we should implement google logins and fully add it as well and set it up since we fully did oauth for mailroom too". Nothing here was built yet; this is the change, the rule, the rows and the production list.

## 1. Summary

1. Sign in exists in code and is off on production. `signInMethods` reports `available: databaseConfigured` (`apps/studio/src/server/auth/better-auth.ts` 78 to 87), production has no `DATABASE_URL`, so `runtime.auth` is null (`apps/studio/src/server/auth/identity.ts` 177, 214, 229) and `/api/auth/*` answers 404 with the sentence (`apps/studio/src/routes/api/auth.$.ts` 18 to 22). Read today with a browser user agent, `GET https://www.turboslide.com/api/auth/get-session` answers 403 `{"error":"forbidden"}` before the route (the WAF rules on `/api/auth/` at `firewall/rules.json` 409 to 417 and 466 to 474, or the shadow mode's deny); the people round's audit read 404 on 2026-09-29 (`docs/gslides-parity/people/audit-accounts.md` 9).
2. The GitHub provider is the template. Its block is `better-auth.ts` 158 to 166 and 233; its flag is `SignInMethods.github` (74, 85); the facts travel in `EditorAuthFacts.github` (`apps/studio/src/server/write.ts` 191, 504, 689); the client reads `auth.github` and posts `sign-in/social` (`apps/studio/src/editor/EditorRoot.tsx` 935, 970 to 982); the dialog draws the button at `packages/chrome/src/dialogs/SignIn.tsx` 157 to 172. Google is the same shape with four more lines of options.
3. The anonymous link needs no new code. better-auth's session create hook calls `onSessionCreated` for every method (`better-auth.ts` 221 to 231), which reads the anonymous cookie off the request and calls `linkAnonymous` (`identity.ts` 388 to 391). The OAuth callback is a top level GET navigation from `accounts.google.com` to `/api/auth/callback/google`, and the identity cookie is `SameSite=Lax` (`apps/studio/src/server/auth/session.ts` 184), so the callback request carries it.
4. The account linking rule for a person who already has an email account is better-auth's own: a Google account whose `email_verified` is true links to the existing user with that address when that user's email is verified too (`node_modules/.pnpm/better-auth@1.7.4_*/node_modules/better-auth/dist/oauth2/link-account.mjs` 59, 77 to 79). Google is not added to `trustedProviders`.
5. Production needs, in order: Neon (`DATABASE_URL`) and `BETTER_AUTH_SECRET`, Upstash (`REDIS_URL`), the Google client, the two projects' variables, and a decision on `TURBOSLIDE_MAIL`. Kevin does the Marketplace installs and the Google Cloud console; the pipeline sets every variable by CLI once the values exist. Section 8 is his list, ten lines.

## 2. What exists today, with lines

### 2.1 The server

- `better-auth.ts` 31 to 33: the variable names `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`. 68 to 75: `SignInMethods` with `available`, `email`, `passkeys`, `passkeysNotice`, `github`. 78 to 87: `signInMethods(env, databaseConfigured)`; `email` is `databaseConfigured` alone, whatever the mail mode.
- 158 to 166: the GitHub block, built only when both variables are non empty, spread into `socialProviders` at 233.
- 175 to 182: `trustedOrigins` is the request's own origin, so `callbackURL` values on the request's origin pass better-auth's check and a cross site page's origin never does.
- 189 to 193: `cookiePrefix: 'ts'`, secure cookies when hosted, `x-forwarded-for` as the address header.
- 194 to 209: the library limiter, 100 per 60 s, with custom rules for the magic link, the OTP, the verify and the device routes. No rule names `/sign-in/social` or `/callback/*`.
- 221 to 231: `databaseHooks.session.create.after` calls `deps.onSessionCreated(session, ctx.request)`.
- No `baseURL` is passed. better-auth 1.7.4 then derives the base URL from `BETTER_AUTH_URL` when set, else from the request's URL (`better-auth/dist/utils/url.mjs` 68 to 87; `x-forwarded-host` is honoured only under `trustedProxyHeaders`), and logs a warning at boot (`better-auth/dist/context/create-context.mjs` 64 to 65). The OAuth redirect URI is `${baseURL}/callback/<provider>` (`better-auth/dist/api/routes/sign-in.mjs` 228; `callback.mjs` 69, 114).
- `db.ts` 44 to 66: Postgres under `DATABASE_URL`, SQLite under `TURBOSLIDE_AUTH_DB` on a checkout, refused hosted (52 to 55), none otherwise.
- `identity.ts` 222: `methods: signInMethods(input.env, db !== null)`. 229 to 246: `createAuth` with `secondaryStorage` from Redis when the runtime has one (237 to 239). 313 to 336: `accountFacts` reads the `user` row (`email`, `emailVerified`, `name`) and the profile; `admin` is the profile flag or `TURBOSLIDE_ADMIN_EMAILS` (333). 361 to 375: `linkAnonymous` writes the alias once and merges the principal records. 377 to 394: `onSessionCreated` touches the account principal, grants admin by address (386 to 387), links the anonymous cookie's principal (388 to 391), and binds pending invitations when the address is verified (392 to 393). 551 to 592: the session branch of `requestIdentity`; the author's name is the user row's `name`, else the record's name or label (561); the `Principal` carries `email` only when `emailVerified` (572) and the aliases (574).
- `alias.ts` 25 to 65: the `ts_alias` table store; `link` is a no op for a second call on the same anonymous id (33). 101 to 120: `mergePrincipalRecords`, the union of link grants, the anonymous record's name and avatar kept when the account's record has none.
- `apps/studio/src/server/auth/session.ts` 174 to 188: the identity cookie is `Path=/; Max-Age=400 days; HttpOnly; SameSite=Lax`, `Secure` under the `__Host-` name.
- `write.ts` 190 to 197: `EditorAuthFacts { signIn, email, passkeys, passkeysNotice, github, mail }`; 499 to 506 and 684 to 691 fill it from `runtime.methods` and `runtime.mailMode`.

### 2.2 The chrome

- `packages/chrome/src/editor-shell.ts` 558 to 561: `EditorAccount.signInAvailable`, `passkeysAvailable?`, `githubAvailable?`.
- `EditorRoot.tsx` 930 to 935: the `EditorAccount` built from `payload.auth`; 958 to 967: `requestCode` and `verifyCode` only when `auth.email`; 968 to 982: `github()` posts `sign-in/social` with `provider: 'github'` and `callbackURL: signInReturnAddress()` (the page's own absolute address, 296 to 298) and assigns `window.location` to the answered `url`. `authPost` (269 to 295) is a same origin JSON POST to `/api/auth/<path>`.
- `SignIn.tsx` 11 to 20: the dialog's rules, "GitHub when configured, never the only method". 131 to 173: the methods list, the passkey row (greyed, `PASSKEYS_LATER`) and the GitHub button with `data-control="dialog.signIn.github"`. 213 to 215: the reserved error row.
- `packages/chrome/src/menus/strings.ts` 225 to 238: the dialog's words; `github: 'Continue with GitHub'` at 235. 209 to 210: `signedInAs(email)` and `notSignedIn`.
- `packages/chrome/src/menus/model.ts` 888 to 912: the `title.account` submenu; the Sign in row at 900 to 905 opens the dialog under the predicate `canSignIn`, which is `account !== undefined && !signedIn && signInAvailable` (3684 to 3685).
- `packages/chrome/src/presence/AccountMenu.tsx` 38 to 42: the rows from the model; the sentence is `signedInAs(identity.email)` when signed in with an email, else `notSignedIn`. 53 to 62: the chip, the name and the `TrustMark`.
- `packages/chrome/src/dialogs/NamePrompt.tsx` 150 to 163 (the plate) and 239 to 255 (the dialog): the Sign in link, present under `signInAvailable`, closes the prompt and opens `shell.openDialog('signIn')`. `packages/chrome/src/dialogs/Share.tsx` 602 to 611: the first Share's name band carries the same link.
- `packages/chrome/src/presence/IdentityChip.tsx` 106 and 110 to 112: the word "signed in" and the 14 px check badge for `trust === 'verified'` and not deleted.
- `packages/identity/src/resolve.ts` 115 to 150: every account resolves with `trust: 'verified'` (127, 143) and `displayName: profile.name.trim() || label` (139). The badge is a property of being an account, not of the provider.
- `apps/studio/src/routes/-access-page.tsx` 77 to 94: the You need access page sends an invitee to `/decks` to sign in "with that address"; the sentence holds for Google when the Google address is the invited one.

### 2.3 The tests

- `apps/studio/src/server/auth/identity.test.ts` 117 to 127: the runtime reports `{ available: true, email: true, passkeys: false, passkeysNotice, github: false }` on the SQLite test runtime. This expectation changes with the new flag.
- `apps/studio/e2e/accounts.spec.ts` 209 to 227: `signInWithCode` drives the magic link and OTP routes with the captured mail; 309 to 348: the alias row; 1170 to 1215: `people.verified-badge` signs B in by code and reads the badge. No row drives the GitHub button or `sign-in/social` (grep over `apps/studio/e2e/*.spec.ts` for `social`: nothing).

### 2.4 The mailroom pattern

`/Users/kevinliu/repos/mailroom/src/auth.ts` 1 to 75: Auth.js v5 with the Google provider, `authorization.params` `access_type: 'offline'`, `prompt: 'consent'`, the Gmail scopes (9 to 15), `include_granted_scopes: 'true'` (42); the `signIn` callback refuses a grant without `gmail.modify` and re-encrypts the refresh token on re-consent (47 to 58). `.env.example` 1 to 3 names `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` with the comment "Google OAuth web client (Google Auth Platform > Clients). Redirect URI: <origin>/api/auth/callback/google". `README.md` 41 to 45: a Web application client with the origins and the two redirect URIs, the consent screen External and In production, and the unverified app notice with the 100 user cap while Gmail's restricted scopes await verification. `docs/verification-demo.md` is that verification's record.

What carries over: the client type, the redirect URI shape, the origins list, the two variable names with a prefix. What does not: mailroom asks for offline access and a forced consent because it calls Gmail later; Turboslide calls no Google API after the sign in, so it asks for no refresh token and no consent prompt.

## 3. Research

### 3.1 better-auth's Google provider

Source: https://www.better-auth.com/docs/authentication/google and the installed implementation `node_modules/.pnpm/@better-auth+core@1.7.4_*/node_modules/@better-auth/core/dist/social-providers/google.mjs`.

- Config keys: `clientId`, `clientSecret`, `prompt`, `accessType`, `display`, `hd`, `scope`, `disableDefaultScope`, `includeGrantedScopes`, `mapProfileToUser`, `redirectURI` (the docs page; `google.mjs` 57 to 88).
- Default scopes `email`, `profile`, `openid` (`google.mjs` 63 to 67). The authorization endpoint is `https://accounts.google.com/o/oauth2/v2/auth` (71), the token endpoint `https://oauth2.googleapis.com/token` (94). PKCE is required (62).
- The user comes from the id token: `name`, `email`, `image: picture`, `emailVerified: email_verified` (124 to 131). `hd` is checked when configured (120 to 123).
- Refresh tokens: the docs say to set `accessType: 'offline'` and `prompt: 'select_account consent'`, and that Google issues the refresh token the first time only. Turboslide sets neither.
- The client call is `POST /api/auth/sign-in/social` with `{ provider: 'google', callbackURL }`; the answer carries `url` (`sign-in.mjs` 194, 228), which is what `EditorRoot.tsx` 970 to 977 already handles for GitHub.
- The redirect URI is `${baseURL}/api/auth/callback/google` (`sign-in.mjs` 228 with `basePath` `/api/auth`, `better-auth.ts` 37, 169).

### 3.2 better-auth account linking

Source: https://www.better-auth.com/docs/concepts/users-accounts, https://www.better-auth.com/docs/reference/options, and `better-auth/dist/oauth2/link-account.mjs`.

- Linking is on by default. For a sign in whose provider account is unknown and whose email matches an existing user (`link-account.mjs` 59 to 65), the account links when the provider says the email is verified, or the provider is in `trustedProviders`; and the local user's email is verified (`requireLocalEmailVerified`, default true, 78); and `accountLinking.enabled` is not false and `disableImplicitLinking` is not true (77 to 79). Otherwise the answer is `account not linked` (81 to 84).
- On a link the local `emailVerified` is set when the provider verified the same address (128). `updateUserInfoOnLink` defaults to false, so the existing name and image stay (129, the options page).
- `trustedProviders` defaults to `[]` (`better-auth/dist/context/helpers.mjs` 151 to 154). The docs warn that trusting a provider "may increase the risk of account takeover".
- A signed in person can add a provider from a settings surface with `linkSocial` (the users and accounts page). Not in this design; see section 9.

### 3.3 Google Auth Platform

- Client type: a Web application client from the Clients page, with Authorized JavaScript origins and Authorized redirect URIs. Redirect URIs must match exactly, use https except on localhost, and carry no fragment (https://developers.google.com/identity/protocols/oauth2/web-server; https://support.google.com/cloud/answer/6158849).
- Scopes and claims: `openid`, `email` (`email`, `email_verified`), `profile` (`name`, `picture`, `given_name`, `family_name`); `sub` is the stable id and the docs say not to key a user on the email (https://developers.google.com/identity/openid-connect/openid-connect). better-auth keys the account on `sub` (`google.mjs` 56) and uses the email only for the linking rule above.
- Publishing status: a project in Testing is capped at 100 listed test users with consent that expires after seven days, except that an app asking only `openid`, `email` and `profile` has neither the warning nor the expiry; verification is needed for sensitive or restricted scopes alone, and the 100 user cap of an unverified app does not apply to the basic scopes (https://support.google.com/cloud/answer/15549945). Turboslide asks the basic scopes only, so no verification and no cap; publish the screen to In production anyway so the status never has to change.
- Branding and the consent screen are per Google Cloud project (https://support.google.com/cloud/answer/6158849). mailroom's project is branded mailroom and carries the Gmail restricted scopes under verification (`mailroom/README.md` 44 to 45; `docs/verification-demo.md`). A Turboslide redirect URI on that client would show "mailroom" on the consent screen for a Turboslide sign in and tie Turboslide's availability to that verification. A search summary of the same help page also reported that one client serving unrelated applications misrepresents the brand under Google's terms and that a project is limited to 10 authorized domains; the fetched page text confirmed the per project branding and the URI rules, not those two sentences, so they are reported here as unconfirmed. Either way: a new Google Cloud project named Turboslide, one Web application client named Turboslide, its own consent screen with Turboslide's name, support address and the privacy and terms links.
- The hosts, read today: `https://turboslide.com/` answers 308 to `https://www.turboslide.com/`; `https://turboslide.vercel.app/` answers 307 to `/new` and serves the personal project (`.vercel/project.json`: `turboslide` on `kl01s-projects`; `docs/HOSTING-MOVE.md` 18); the team's project is `turboslide-gt` on `general-translation` with `https://www.turboslide.com` (`vercel project ls --scope general-translation`). A preview deployment's host is per deployment and cannot be registered under the exact match rule, so Google sign in is not drivable on previews; a fixed preview alias would be needed first.

## 4. The code change

### 4.1 `apps/studio/src/server/auth/better-auth.ts`

```ts
export const GOOGLE_ID_VARIABLE = 'GOOGLE_CLIENT_ID';
export const GOOGLE_SECRET_VARIABLE = 'GOOGLE_CLIENT_SECRET';

export type SignInMethods = {
  available: boolean;
  email: boolean;
  passkeys: boolean;
  passkeysNotice: string | null;
  github: boolean;
  google: boolean;
};

export function signInMethods(env: Env, databaseConfigured: boolean, mailMode: MailMode): SignInMethods {
  const github = isSet(env[GITHUB_ID_VARIABLE]) && isSet(env[GITHUB_SECRET_VARIABLE]);
  const google = isSet(env[GOOGLE_ID_VARIABLE]) && isSet(env[GOOGLE_SECRET_VARIABLE]);
  return {
    available: databaseConfigured,
    // the email method needs a sender: with TURBOSLIDE_MAIL=off every mail is dropped
    // (docs/PEOPLE.md 8.2 item 3), so the field is hidden rather than offered
    email: databaseConfigured && mailMode !== 'off',
    passkeys: false,
    passkeysNotice: databaseConfigured ? PASSKEYS_LATER : null,
    github: databaseConfigured && github,
    google: databaseConfigured && google,
  };
}
```

The `mailMode` argument is new; `identity.ts` 222 passes `selectMail(input.env).mode`, which the runtime already computes at 212. This is a decision for Kevin (section 9, question 1): today's rule at `better-auth.ts` 83 offers the email field whenever a database exists, and on production with `TURBOSLIDE_MAIL=off` that field would accept an address and send nothing.

Beside the GitHub block at 158 to 166:

```ts
const google =
  isSet(deps.env[GOOGLE_ID_VARIABLE]) && isSet(deps.env[GOOGLE_SECRET_VARIABLE])
    ? {
        google: {
          clientId: deps.env[GOOGLE_ID_VARIABLE] ?? '',
          clientSecret: deps.env[GOOGLE_SECRET_VARIABLE] ?? '',
          // the account chooser when the browser holds several Google accounts; no
          // `accessType: 'offline'` and no `consent`, since nothing calls a Google API later
          prompt: 'select_account',
        },
      }
    : {};
```

and `socialProviders: { ...github, ...google }` at 233. Google needs no `redirectURI` when the base URL is right, which is the next item.

The base URL. Today better-auth derives it from the request's URL per request (`url.mjs` 81 to 85). On Vercel the function sees the public host in the request URL, and on a checkout the dev port, so the redirect URI should already read `https://www.turboslide.com/api/auth/callback/google` and `http://localhost:4321/api/auth/callback/google`. Two reasons to make it explicit: the boot warning (`create-context.mjs` 65), and a request that reaches the function with another host would mint a redirect URI Google refuses. better-auth 1.7.4 has a dynamic config for exactly the several hosts case (`create-context.mjs` 59 to 62; `url.mjs` 196 to 221, host patterns with wildcards):

```ts
baseURL: {
  allowedHosts: authHosts(deps.env),
  ...(deps.hosted && isSet(deps.env.TURBOSLIDE_PUBLIC_ORIGIN) ? { fallback: deps.env.TURBOSLIDE_PUBLIC_ORIGIN } : {}),
},
```

with `authHosts` reading `TURBOSLIDE_AUTH_HOSTS` (comma separated) and defaulting to `['www.turboslide.com', 'turboslide.com', 'turboslide.vercel.app', 'localhost:*', '127.0.0.1:*']`. A host off the list with no fallback throws (`url.mjs` 212), which is the right refusal for a Host header the deployment does not own. The e2e server runs on a localhost port, so the default covers it. The first preview after the change confirms the warning is gone from the function log.

The limiter at 199 to 208 gains two rules: `'/sign-in/social': { window: 60, max: 10 }` and `'/callback/google': { window: 60, max: 10 }`. The WAF already counts `/api/auth/*` at 10 per 60 s per IP (`firewall/rules.json` 409 to 417); a Google sign in is three requests on that path (the POST, the callback GET, the `get-session` after the reload), well under it.

`docs/hosting.md` 841 gains the row `GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET | you | the Google sign in`, and `docs/security.md` section 12's table the same.

### 4.2 The facts to the client

- `write.ts` 190 to 197: `EditorAuthFacts` gains `google: boolean`; 499 to 506 and 684 to 691 add `google: runtime.methods.google`.
- `packages/chrome/src/editor-shell.ts` 558 to 561: `EditorAccount` gains `googleAvailable?: boolean` and `google?: () => void`.
- `EditorRoot.tsx` 935: `googleAvailable: auth?.google ?? false`. After the GitHub closure at 968 to 982, the same closure with `provider: 'google'`; the two share one helper `socialSignIn(provider)` so the error path (`controller.say(errorMessage(error))`) is written once. The `callbackURL` stays `signInReturnAddress()`: the person lands back on the deck they were editing, and the page reloads with the account's identity as the OTP path does (B2 R19, the comment at 926 to 928).
- `controller.tsx` 4569 reads `init.payload.auth?.signIn` only and needs no change.

### 4.3 The dialog, the strings, the account menu, the name prompt

- `strings.ts` 235: add `google: 'Continue with Google'` beside `github`.
- `SignIn.tsx` 131 to 173: a Google button with `data-control="dialog.signIn.google"` and the tooltip doc "Uses your Google account's name and address". Order inside the box: Google first, then GitHub, then the greyed passkey row, so on production (where the email field is hidden under the rule of 4.1) the one working method is at the top. The box stays 400 by 320; when `email` is false the field and the Continue action are absent and the Google button is the primary action's place in the tab order. The comment at 11 to 20 is rewritten: "GitHub and Google when configured; Google may be the only method on a deployment with no mail sender".
- The error row at 213 to 215 keeps its sentence; a refused social sign in comes back from `authPost` as a message (`EditorRoot.tsx` 276 to 294) and lands in `controller.say` because the dialog has already handed off to the browser navigation. A `?error=` on the return address is the library's own error redirect (`link-account.mjs` 25); the editor shows nothing for it today. One line in `EditorRoot.tsx` reads `error` from the location's search on boot and says `ACCOUNT.signInDialog.failed` through `controller.say`, then drops the parameter with `history.replaceState`.
- The account menu needs no new row: the Sign in row (`model.ts` 900 to 905, `canSignIn` at 3684 to 3685) opens the dialog, and the sentence (`AccountMenu.tsx` 39 to 42) reads `identity.email`, which a Google account has when `email_verified` was true. Nothing in the menu names the provider; Sessions, Sign out and Delete account work through better-auth's own routes for every method.
- The name prompt's Sign in link (`NamePrompt.tsx` 150 to 163 and 239 to 255) and the Share band's (`Share.tsx` 602 to 611) open the same dialog and need no change; their tooltip "Keep your name across browsers" holds.
- The badge. `resolve.ts` 139 to 150 gives every account `trust: 'verified'`, and `IdentityChip.tsx` 110 to 112 draws the check badge from that, so a Google account has the badge and the word "signed in" with no change. The badge's tooltip names the address (`resolve.ts` 34 to 40, `trustTooltip`), which is the Google address.
- The name. A Google account's user row carries Google's `name` (`google.mjs` 127), `accountFacts.name` is that row (`identity.ts` 331), and the author's name is `account.name.trim()` first (`identity.ts` 561; `resolve.ts` 139). A person who typed "Maya" and then signs in as "Maya Chen" renders as "Maya Chen" from then on, on the old records too, since the alias resolves them to the account (`resolve.ts` 115 to 118 comment). `mergePrincipalRecords` keeps the typed name on the record only when the account's record has none (`alias.ts` 116), and the profile wins at render. Change name (`model.ts` 892 to 895; `account.setName`) renames the account. This is the right default and is stated in the dialog's tooltip.
- The picture. Google's `picture` lands on `user.image` and nothing reads it: `accountProfile` takes the avatar from the profile row or the principal record (`identity.ts` 348). The people round declined a picture from the email hash (`docs/PEOPLE.md` 8.1 question 7); the Google picture is the same kind of decision and is left to Kevin (section 9, question 3). Default: not used this round.

## 5. The account linking rule with the anonymous aliases

The rule, in the order the code runs it:

1. The browser has an anonymous principal `anon_<uuid>` in the sealed `__Host-ts_id` cookie (`session.ts` 21, 226 to 244), typed a name or not, and owns decks and comments under that id.
2. The person clicks Continue with Google. The POST to `/api/auth/sign-in/social` answers the Google URL; the browser leaves for `accounts.google.com`; Google returns the browser with a top level GET to `/api/auth/callback/google?code=...&state=...`. The identity cookie is `SameSite=Lax` (`session.ts` 184), and a Lax cookie is sent on a top level cross site navigation, so the callback request carries the anonymous id.
3. better-auth exchanges the code, finds or creates the user keyed on Google's `sub` (`google.mjs` 56; `link-account.mjs` 20 to 22), and creates the session. The session create hook runs `onSessionCreated(session, request)` (`better-auth.ts` 224 to 229), which reads the anonymous principal off that same request and calls `linkAnonymous` (`identity.ts` 388 to 391): one `ts_alias` row, the principal records merged once (`alias.ts` 27 to 39, 101 to 120), the `onLinked` hooks (the deck index and the inbox merge, `identity.ts` 100 to 101).
4. From then on every record written under `anon_<uuid>` renders as the account (`resolve.ts` 115 to 118, `identityViewFor` through `resolveIdentity` at `identity.ts` 681 to 683), the account's `Principal` carries the alias (`identity.ts` 565 to 574), and `standingOf` matches the deck's owner and grants against the account and its aliases (`docs/security.md` section 2, second paragraph). The person keeps their decks and comments. A second browser signing in with the same Google account is a second alias and one person (`alias.ts` 1 to 6).
5. If the hook missed (the callback request carried no cookie, as on a browser that blocks third party navigation cookies), the session branch of `requestIdentity` links on the next request that has both the session and the cookie (`identity.ts` 557). Nothing is lost; the link lands one request later.

The rule for a person who already has an email account (signed in by code earlier with the same address): better-auth links the Google account to that user when Google reports `email_verified: true` and the local user's `emailVerified` is true (`link-account.mjs` 77 to 79). The OTP sign in marks the address verified (`better-auth/dist/plugins/email-otp/routes.mjs` 417 and 600), so the common case links. A Google account whose address is unverified (a non Gmail address Google has not verified) does not link to an existing email account and gets `account not linked` (81 to 84); the error lands as `?error=` on the return address and the dialog's sentence shows (4.3). Google is not added to `trustedProviders`: that option links without the verified email check, and an attacker who controls an unverified Google identity with the victim's address would take the account (the docs' own warning, 3.2). `disableImplicitLinking` stays false.

The `Principal` carries the address only when `emailVerified` (`identity.ts` 572), so pending grants by email bind for a verified Google address at the first read of the deck (`identity.ts` 392 to 393; `docs/security.md` section 2) and never for an unverified one.

## 6. The rows

### 6.1 Unit

In `apps/studio/src/server/auth/identity.test.ts` and a new `better-auth.test.ts`:

1. `signInMethods` reports `google: true` with both variables set and a database, `false` with one variable or no database; `email: false` under `TURBOSLIDE_MAIL=off` with a database. The expectation at 117 to 127 gains `google: false`.
2. `createAuth` with fake `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: `auth.options.socialProviders.google` is defined with `prompt: 'select_account'` and no `accessType`.
3. The handler, no network: `POST /api/auth/sign-in/social` with `{ provider: 'google', callbackURL: '<origin>/edit/x' }` and an `origin` header answers 200 with a `url` on `https://accounts.google.com/o/oauth2/v2/auth` whose `redirect_uri` is `<origin>/api/auth/callback/google`, whose `scope` contains `openid`, `email` and `profile`, whose `prompt` is `select_account`, and which carries `code_challenge` and no `access_type`. The library builds that URL locally (`google.mjs` 70 to 87), so the test touches nothing outside the process.
4. The handler with a Host off `allowedHosts` and no fallback refuses the sign in (the throw at `url.mjs` 212), and with `TURBOSLIDE_AUTH_HOSTS` naming it, answers the URL.
5. `serializeAnonymousCookie` carries `SameSite=Lax` and never `Strict` (`session.ts` 174 to 188): the row that guards step 2 of section 5.
6. A session created with a request that carries the anonymous cookie links the alias (the existing OTP path at `identity.test.ts` covers `onSessionCreated`; the row asserts the hook is method independent by calling it through the `databaseHooks` option of the built instance with a synthetic session and request).

### 6.2 e2e, in `apps/studio/e2e/accounts.spec.ts`

The e2e server's environment gains fake `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` beside `TURBOSLIDE_AUTH_DB`.

1. `accounts.google-button`: the dialog shows `dialog.signIn.google` above `dialog.signIn.github` and the passkey row; with the e2e mail mode `capture` the email field is present.
2. `accounts.google-leaves`: `context.route('https://accounts.google.com/**', abort)`, click the button, read the aborted request's URL: the `redirect_uri`, the scopes and the `state`, as 6.1 row 3 but through the real button and the real browser navigation.
3. `accounts.google-error-sentence`: load `/edit/<deck>?error=account_not_linked` and read the snackbar's sentence, then the address without the parameter.
4. `accounts.email-hidden-without-mail`: a second server with `TURBOSLIDE_MAIL=off` shows no email field and the Google button as the first method (a serial row with its own server, or a `TURBOSLIDE_MAIL` toggle the e2e harness already has; the harness is read before this row is written).

The round trip itself (the code exchange, the id token, the user row, the alias) cannot run in e2e: the token endpoint is fixed in the provider (`google.mjs` 94) and Google issues no codes to a test. It is verified by hand twice: on `http://localhost:4321` with the real client and Kevin's account (the alias row of 309 to 348 read through `seed('alias', ...)` after the sign in), and on production after the variables land (section 7), with the people round's `people.verified-badge` read by eye on two browsers.

## 7. Production prerequisites, in order

The account boundary stands (`docs/hosting.md` 802 to 804; `docs/PEOPLE.md` 8.2): no agent installs a Marketplace product or signs up for a service. The pipeline sets variables by CLI (`vercel env add <VAR> production` with the value on stdin, from a linked repository root; `docs/security.md` 317 to 336) once the values exist in a file only the wrapper reads, never through a chat.

| Step | What | Who | Why it is first |
| --- | --- | --- | --- |
| 1 | Neon Postgres on `turboslide-gt`, which sets `DATABASE_URL`; `BETTER_AUTH_SECRET` from `openssl rand -hex 32` | Kevin installs from the project's Storage tab; the pipeline mints and sets the secret | Without `DATABASE_URL` no account exists and the Sign in row is absent (`db.ts` 24 to 25, 48 to 49; `identity.ts` 177, 214) |
| 2 | Upstash Redis on `turboslide-gt`, which sets `REDIS_URL` (`rediss://`) | Kevin installs; nothing else to set | Sessions and the limiter move to secondary storage (`better-auth.ts` 172, 198; `identity.ts` 237 to 239), the principal store leaves the per instance folder (`identity.ts` 189 to 204), and the realtime tier becomes `redis` (`docs/hosting.md` 688). Without it a sign in on one instance is a stranger on the next poll's instance |
| 3 | The Google Cloud project Turboslide, the consent screen (External, In production, the basic scopes), the Web application client with the origins and redirect URIs of section 8 | Kevin, in the console | The client id and secret exist only after this |
| 4 | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` on `turboslide-gt` production; `TURBOSLIDE_ADMIN_EMAILS=kevin@generaltranslation.com` so the first sign in is the admin (`identity.ts` 386 to 387) | Kevin hands the two values over in a 600 file under `~/.config/turboslide/`; the pipeline sets all three | The flag turns on at the next deploy (`better-auth.ts` 85 and the new line) |
| 5 | `TURBOSLIDE_MAIL`: stays `off` until Resend's `RESEND_API_KEY` and `TURBOSLIDE_MAIL_FROM` exist (`docs/hosting.md` 813 to 815); the rule of 4.1 then hides the email field and Google is the one method | Kevin decides; the pipeline sets whatever he decides | With a database and `off`, today's dialog offers an email field that sends nothing (`docs/PEOPLE.md` 8.2 item 3) |
| 6 | The personal project `turboslide` (`turboslide.vercel.app`): either the same five variables, or nothing, in which case its Sign in row stays absent and the `turboslide.vercel.app` redirect URI on the client is unused | Kevin decides; the pipeline sets | `signInMethods` needs a database on that deployment too (`better-auth.ts` 81) |
| 7 | Deploy `main` through the guard (`~/.config/turboslide/gt-follow.sh`), read the function log for the base URL warning, sign in once by hand on `www.turboslide.com`, read the badge on a second browser, then remove the scratch deck by id | The pipeline deploys and reads; Kevin signs in | The hand verification of 6.2 |

Redis before Google is deliberate: the blob tier polls across instances (`docs/hosting.md` 689), and better-auth's session cookie cache (`better-auth.ts` 187) hides the per instance session store for five minutes at most; after that a signed in person on an instance without the session row reads as signed out. `docs/PEOPLE.md` 8.2 names the same order.

## 8. Kevin's steps, ten lines

1. Storage tab of `turboslide-gt` on the General Translation team: install Neon (free), then Upstash Redis (the 250 MB plan). Tell the pipeline when both variables show in `vercel env ls`.
2. console.cloud.google.com: new project `Turboslide`. Google Auth Platform, Branding: app name Turboslide, support email kevin@generaltranslation.com, authorized domain `turboslide.com`, the privacy and terms links; Audience: External, then Publish app.
3. Google Auth Platform, Clients, Create client, Web application, name `Turboslide web`.
4. Authorized JavaScript origins: `https://www.turboslide.com`, `https://turboslide.com`, `https://turboslide.vercel.app`, `http://localhost:4321`.
5. Authorized redirect URIs: the same four origins each followed by `/api/auth/callback/google`.
6. Put the client id and secret in `~/.config/turboslide/google-oauth.env` as `GOOGLE_CLIENT_ID=` and `GOOGLE_CLIENT_SECRET=`, `chmod 600`; do not paste them in a chat.
7. Say whether `turboslide.vercel.app` gets accounts too, whether the email field hides under `TURBOSLIDE_MAIL=off` (section 9, question 1), and whether the Google picture is used (question 3).
8. The pipeline sets the variables on the project(s), deploys through the guard, and reports the function log and the base URL check.
9. Sign in once on `https://www.turboslide.com` from a browser that already has a named anonymous deck; the pipeline reads the alias and the badge from a second browser.
10. If a sign in returns to the deck with `?error=`, send the parameter's value; the two likely values are `account_not_linked` and `state_mismatch`.

## 9. Open questions and what is left

1. The email method under `TURBOSLIDE_MAIL=off`: hide the field (4.1's rule, the default here) or keep today's behaviour and set `TURBOSLIDE_MAIL=resend` in the same step. Default: hide.
2. Google as the only method on production: `SignIn.tsx` 16 says a social provider is "never the only method". The default here overrides that sentence for a deployment with no mail sender.
3. The Google picture (`user.image`) as a fourth avatar source after the profile row and the record. Default: no, as PEOPLE.md 8.1 question 7 decided for the email hash.
4. `linkSocial` from the Profile dialog (an email account adding Google later, or a Google account adding GitHub) is one client call and one row in `title.account`; not in this round.
5. A fixed preview alias so a preview can carry a registered redirect URI; without it Google sign in is verified on localhost and production only.
6. The `hd` option (a Workspace domain restriction) is not set: sellers sign in from any Google account.
7. Passkeys stay off (`better-auth.ts` 6 to 8, 34 to 35): the rpID is `www.turboslide.com` now, and the plugin is not installed in this checkout.

## Sources

- https://www.better-auth.com/docs/authentication/google (the Google provider's options, the refresh token note)
- https://www.better-auth.com/docs/concepts/users-accounts (account linking)
- https://www.better-auth.com/docs/reference/options (`account.accountLinking` defaults, `baseURL`)
- https://developers.google.com/identity/protocols/oauth2/web-server (the Web application client, redirect URI rules, `access_type`, `prompt`)
- https://developers.google.com/identity/openid-connect/openid-connect (scopes, claims, `sub`, `email_verified`)
- https://support.google.com/cloud/answer/15549945 (publishing status, Testing's limits, the basic scopes exception)
- https://support.google.com/cloud/answer/6158849 (client management, per project branding, URI rules)
- Installed library: `better-auth@1.7.4` (`apps/studio/package.json` 45 through the catalog), `@better-auth/core@1.7.4`
