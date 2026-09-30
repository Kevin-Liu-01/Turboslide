# Audit: avatars

Read on 2026-09-29 against the worktree `Turboslide-people` (branch `people/round`, at `origin/main`). Line numbers are those of the files on that commit. The unit tests named in section 1 were run and pass (14 of 14 in `avatar.test.ts` and `actions.test.ts`).

The one line answer to the task's question: a person cannot upload a photo from the chrome today. The dialog exists, the server pipeline exists and is tested, and the browser drops the file between the two. A picture set through the CLI or the HTTP transport is stored but is never drawn, because no caller hands the picture URL to the mark. Hosted, the files land on the function's disk and the route that would serve them answers 404.

## 1. What exists

### 1.1 The chrome (`packages/chrome`)

`src/dialogs/AvatarBuilder.tsx`

- Lines 28 to 35: four tabs `initials`, `glyph`, `dither`, `picture`; the preview sizes `[24, 32, 64, 256]`.
- Lines 38 to 40: `rerollSalt()` draws a random 31 bit salt for "Another".
- Lines 43 to 104: `Preview` draws the mark at each size in light and dark chrome. For `spec.variant === 'picture'` with a `pictureUrl` it draws an `<img>` with `objectFit: 'cover'` (lines 67 to 74); otherwise the SVG plate and cells. Line 101 keeps a dead `<span hidden>{scale}</span>`.
- Lines 106 to 119: the state starts from `account.avatar` (`current`, line 110): `tab` from `current?.variant ?? 'initials'`, `initials` from `current?.initials ?? ''`, `salt` from `Number(current?.salt ?? 0)`.
- Lines 147 to 162: `pick(file)` refuses over 5 MB (`chosen.size > 5 * 1024 * 1024`, line 150) and a MIME type outside `image/(png|jpeg|webp|gif)` (line 154), then makes an object URL for the preview. No resize, no decode, no crop geometry.
- Lines 164 to 184: `apply()` builds the choice. For the Picture tab it is `{ variant: 'picture', picture: file }` (line 177). It calls `account.setAvatar(choice)` and closes on success.
- Line 198: Apply is disabled on the Picture tab when not signed in.
- Lines 258 to 295: the Picture panel. The file input accepts the four MIME types (line 271). The "crop" box is a 256 by 256 `<img>` with `objectFit: 'cover'` (lines 277 to 285). There is no pointer handler, so nothing is dragged. The sentence under it reads `ACCOUNT.avatar.crop`, "Drag to crop" (line 287; `menus/strings.ts` line 259).
- Lines 17 to 27, the docblock: "the picture path crops in the browser in a 256 by 256 box and hands the file to `account.setAvatar`, which runs sharp on the server". The first half is not implemented.

`src/dialogs/Profile.tsx`

- Line 79: the head chip is `<IdentityChip identity={identity} size={24} self pictureUrl={account?.pictureUrl} />`.
- Lines 96 to 107: Change avatar opens the `avatarBuilder` dialog.
- Lines 233 to 252: Delete account, `disabled={busy || !account.deleteAccount}`; the tooltip reads "Removes your sessions, avatar and notifications".

`src/editor-shell.ts`

- Lines 525 to 529: `EditorAccount.avatar?: { variant, initials?, salt?: string }`.
- Lines 534 to 539: `setAvatar?: (choice: { variant, initials?, salt?: string, picture?: File }) => Promise<unknown>`.
- Lines 553 to 554: `pictureUrl?: string`, "the public URL of the picture avatar, when one is set".
- Line 256: `IdentityView.mark?: MarkSpecLike`.

`src/presence/IdentityChip.tsx`

- Lines 42 to 55: `resolvedOf(view)` builds a `ResolvedIdentity` with `avatar: { variant: 'initials' }` always.
- Lines 58 to 76: `markOf(view)` uses `view.mark` when the view carries one, else `markSpec(resolvedOf(view))`.
- Line 124: `const picture = spec.variant === 'picture' ? (pictureUrl ?? spec.pictureUrl) : undefined;`
- Lines 145 to 146: the picture is one `<img className="ts-chip-picture" src={picture} alt="" width={plate} height={plate} />`. No `srcset`, no `crossorigin`, no `loading` or `decoding` attribute.
- `src/presence/presence.css` lines 44 to 47: `.ts-chip-picture { display: block; object-fit: cover; }`.

`src/menus/strings.ts` lines 253 to 262: the builder's words (`title`, `tabs`, `another`, `initials`, `upload`, `crop`, `apply`, `tooLarge` "Pictures up to 5 MB"). Line 81: `REFUSALS.signInToUpload`.

`src/dialogs/accounts.css` lines 220 to 285: the strip grid (24, 32, 64, 256 columns, two rows), `.ts-avatar-cell.is-dark` remaps the tokens, `.ts-avatar-panel` fixed at 320 px, `.ts-avatar-crop` 256 by 256 with `overflow: hidden`, `.ts-avatar-crop img` with `cursor: grab` and `user-select: none`. `.ts-avatar-scaled` (lines 247 to 250) is referenced by no TSX.

### 1.2 The editor (`apps/studio/src/editor`)

`EditorRoot.tsx`

- Lines 806 to 863: the `EditorAccount` object handed to the shell. Its keys are `principal`, `signedIn`, `signInAvailable`, `passkeysAvailable`, `githubAvailable`, `namePrompt`, `onNamePrompt`, `setName`, `setAvatar`, `forget`, and conditionally `requestCode`, `verifyCode`, `github`, `signOut`. There is no `avatar`, no `pictureUrl`, no `deleteAccount`, no `revokeToken`, no `tokens`.
- Lines 816 to 821: `setName` invokes `account.setName` and then `controller.refreshPresence()`.
- Lines 823 to 828:

```ts
setAvatar: (choice) =>
  controller.invoke('account.setAvatar', {
    variant: choice.variant,
    ...(choice.initials !== undefined ? { initials: choice.initials } : {}),
    ...(choice.salt !== undefined ? { salt: Number(choice.salt) } : {}),
  }),
```

`choice.picture` is dropped. Nothing refreshes presence or the own identity afterwards.

`controller.tsx`

- Lines 287 to 299: `identityView(identity, author)` builds the own `IdentityView` with `principalId`, `label`, `name`, `trust`, `kind`, `email`. No `mark`.
- Lines 308 to 316: `participantOf(entry)` carries the roster entry's `mark` for other people.
- Lines 3714 to 3740: every GS3 server side window action, `account.setAvatar` among them, runs through `runDeckAction` (a TanStack server function over `/_serverFn/*`), not through `/api/actions`.
- Lines 4102 to 4103: `invoke(action, input)` is `dispatcher.dispatch(action, input, chromeContext)`.

`apps/studio/src/server/agent-actions.ts` lines 280 to 313: `runDeckActionFn` parses the JSON string and runs the action's own input schema before the handler.

### 1.3 The action schema (`packages/schema/src/actions.ts`)

Lines 5413 to 5433, `account.setAvatar`:

```ts
input: z.strictObject({
  variant: z.enum(AVATAR_VARIANTS),
  initials: z.string().max(3).optional(),
  salt: z.number().int().nonnegative().optional(),
  picture: z.string().optional()
    .describe('A file path or a data URL; sharp re-encodes it and keeps no original'),
}),
```

`transports: A` (every transport), `mcp: 'deck_set_my_avatar'`, `cli: 'turboslide account avatar --variant <variant> --another'`. There is no `crop` field. Line 411 lists it under `NO_REVISION_WRITES`.

### 1.4 The identity package (`packages/identity/src`)

`principal.ts`

- Lines 27 to 43: `AvatarVariant`, `AvatarChoice = { variant; initials?; salt?; picture?: { avatarKey; digest; sizes; base? } }`. The `base` doc: "the public store's URL hosted and the studio's avatar route on a checkout".
- Line 66: `DEFAULT_AVATAR = { variant: 'initials' }`.
- Lines 115 to 127: `isAvatarChoice` validates the shape on read.
- Lines 1 to 7, the header: "The browser mirrors name and avatar in `localStorage` for instant paint and never as the truth (SPEC-3 0.17)". No such mirror exists in `apps/studio/src` or `packages/chrome/src` (the only `localStorage` reads are the boot script's shell keys, `routes/__root.tsx` line 86, and the forget path, `controller.tsx` line 3763).

`marks.ts`

- Lines 37 to 44: `MarkOptions.pictureUrl`, "The public URL of the 32 or 64 px picture when the variant is `picture`".
- Lines 108 to 111: `if (chosen === 'picture' && options.pictureUrl) return { ...base, variant: 'picture', ... }`. Without `options.pictureUrl` a picture choice falls through to the initials branch (lines 115 to 124).
- Lines 66 to 74: `markHash(principalId, salt)` xors the salt into the glyph seed; the builder mirrors this at `AvatarBuilder.tsx` line 144.

`marks-render.ts`

- Lines 205 to 207: the picture variant's raster is a bare plate.
- Lines 332 to 336: the SVG renderer emits `<image href="...">` for a picture spec.
- Lines 31 to 35: `MARK_SIZES [24, 16, 14]`, `MARK_PREVIEW_SIZES [24, 32, 64, 256]`.

`marks-png.ts` lines 18 to 21: `renderMarkPng1(spec, size, theme)` through `encodePng1`. Its only importers are the identity package's own files and tests (grep over `apps` and `packages`).

### 1.5 The server pipeline (`apps/studio/src/server/auth/avatar.ts`)

- Lines 30 to 45: `AVATAR_SIZES [32, 64, 128, 256]`, `AVATAR_PNG_SIZE 256`, `AVATAR_WEBP_QUALITY 80`, `AVATAR_MAX_BYTES 5 MB` (the comment: "5 MB after the browser's resize to at most 1024 px (7.6)"), `AVATAR_MAX_INPUT_PIXELS 4096 * 4096`, `AVATAR_UPLOADS_PER_DAY 10`, `AVATAR_PREFIX 'u'`, `AVATAR_ROUTE '/api/avatar'`, the three sentences.
- Lines 50 to 69: `sniffAvatar` by magic number: JPEG, PNG, WebP (RIFF....WEBP), GIF87a and GIF89a. SVG, HEIF and anything else return null.
- Lines 102 to 172: `processAvatar(bytes, avatarKey, crop?)`. Order: byte cap (line 107), sniff (108 to 109), `sharp(..., { failOn: 'error', limitInputPixels, animated: false }).rotate()` (110 to 115), `metadata()` with a refusal on throw (116 to 120), the sniffed format must equal `metadata.format` (121), orientation aware width and height (122 to 124), refuse under 8 px (125), the crop clamped into the picture (126 to 134), one 256 px PNG with `fit: 'cover'` and `position: 'attention'` when no crop else `'centre'` (135 to 141), `digest = sha256(png)` (142), four WebP files at `effort: 4` (145 to 158), the PNG (159 to 164). Metadata is not carried (the test at `avatar.test.ts` line 117 asserts no exif).
- Lines 174 to 181: `AvatarStore = { put, removeKey, base }`.
- Lines 183 to 194: `KEY = /^[A-Za-z0-9_-]{22}$/`, `FILE = /^[0-9a-f]{64}-(32|64|128|256)\.(webp|png)$/`, `parseAvatarPath` requires exactly `u/<key>/<file>`.
- Lines 197 to 240: `fileAvatarStore(dir, routeBase)`: `pathOf` refuses a path outside `dir` (202 to 206), `put` writes the file and answers `${routeBase}/${relative}` (208 to 213), `removeKey` deletes the folder (214 to 223), `base` is `${routeBase}/u/<key>` (224), `read` copies the bytes and picks the content type by extension (225 to 238).
- Lines 243 to 264: `blobAvatarStore(client)`: `put` with `overwrite: false` and `contentType` and no `cacheControlMaxAge` (247 to 250), `base` from a per process `Map` filled by `put` and falling back to the relative `u/<key>` (244, 251 to 252, 262), `removeKey` lists `u/<key>/` and deletes (255 to 261). No file in `apps` or `packages` calls `blobAvatarStore`.
- Lines 279 to 314: `setPictureAvatar`: refuses a non account principal with `SIGN_IN_TO_UPLOAD` before the quota (285 to 286), takes one of ten per day under `avatar:<principalId>` (288 to 294), a fresh key (295), processes (296), puts every file (297), writes the choice with the key to `ts_profile` (308) and to the principal record (309 to 310), then deletes the previous key's files (311 to 312).
- Lines 317 to 325: `pictureUrl(choice, size)` is `${base}/${digest}-${size}.webp`, undefined when `base` is missing.
- Lines 328 to 335: `removePictureFiles(deps, userId)`. No caller outside the test.

`apps/studio/src/server/auth/actions.ts`

- Lines 293 to 294: `const avatarStore = deps.avatarStore ?? (() => fileAvatarStore(`${runtime().stateDir}/${AVATAR_USERS_DIR}`));`
- Lines 341 to 377, the `account.setAvatar` handler: for `variant === 'picture'` it requires `picture` (352) and calls `setPictureAvatar(..., record.principalId, dataUrlBytes(picture))` with no crop (353 to 361). For the other variants it writes the record and, for an account, `profiles.setAvatar(userId, choice, null)` and removes the old key's files (363 to 374). It answers `meOf` (376). It does not call `room.forgetIdentity` (the `setName` handler does, line 327).
- Lines 104 to 112: `avatarAnswer` reports the picture as its 64 px URL only, "never the key".
- Lines 146 to 176: `meOf` calls `identityViewFor(runtime, principal.id, { self: true, showEmail: true })` with no `pictureUrl`.
- Lines 262 to 270: `dataUrlBytes` accepts `data:image/...;base64,` or a percent encoded data URL and throws `'picture must be a data URL'` for anything else.
- Line 55: `AVATAR_USERS_DIR = 'users'`, duplicated at `routes/api/avatar.$.ts` line 14.

`apps/studio/src/server/actions.ts` line 1256: `registerAccountActions(dispatcher, { facts: accountFactsFor(request, deckId) });`. No `avatarStore` is passed on any tier.

`apps/studio/src/server/auth/profile.ts`: `ts_profile` holds `avatar` (JSON) and `avatarKey` (lines 12 to 20); `setAvatar` writes both (94 to 106); `markDeleted` nulls both (107 to 116).

`apps/studio/src/server/auth/identity.ts`

- Lines 340 to 352: `accountProfile` sets `avatar` from the principal record (`record?.avatar`), not from `ts_profile.avatar`.
- Lines 695 to 724: `identityViewFor(runtime, principalId, options)` passes `options.pictureUrl` to `markSpec` only when given.
- `packages/identity/src/resolve.ts` line 129: `avatar: profile.avatar ?? record?.avatar ?? DEFAULT_AVATAR`.

`apps/studio/src/server/room.ts`

- Lines 2024 to 2027: `identityCache` with `IDENTITY_CACHE_MS = 5000`; lines 2029 to 2031 `forgetIdentity`.
- Line 2079: `const mark = markSpec(resolved, { hueSlot: slot });` for every roster entry. No `pictureUrl`.

`apps/studio/src/server/auth/alias.ts` lines 101 to 120: on linking, the account keeps its avatar unless it is the bare default, in which case the anonymous choice is copied (118 to 119).

### 1.6 The route (`apps/studio/src/routes/api/avatar.$.ts`)

- Lines 21 to 23: `if (runtime.hosted) return NOT_FOUND.clone();` so the route serves nothing hosted.
- Lines 24 to 28: the path after `/api/avatar/` must pass `parseAvatarPath`, before the disk is touched.
- Lines 29 to 30: `fileAvatarStore(join(runtime.stateDir, 'users')).read(relative)`.
- Lines 31 to 40: 200 with `content-type`, `content-length`, `cache-control: public, max-age=31536000, immutable`, `cross-origin-resource-policy: same-origin`, `x-content-type-options: nosniff`. `HEAD` answers with no body.
- Lines 43 to 50: GET and HEAD only. No authorization: any same origin request reads any file whose key and digest it knows.

The CSRF middleware covers `/api/avatar/*` (`docs/security.md` line 275). The WAF rule R18 limits it to 10 per 10 minutes per IP (`firewall/rules.json` lines 1019 to 1028; `SPEC-3` 8.3 R18). The CSP allows `img-src 'self' data: blob: <public store host>` (`server/headers.ts` line 208).

### 1.7 The CLI (`apps/cli/src/commands/account.ts`)

- Lines 46 to 51: `account me --avatar-png <file>` throws a `UsageError` saying the renderer "lands with the identity package on the CLI".
- Lines 61 to 88: `account avatar --variant <v> [--initials] [--another] [--picture <string>]` passes `--picture` through untouched as `picture`.

### 1.8 Storage hosted

- `docs/hosting.md` line 740 and report 10 line 497 plan `u/<avatarKey>/*` on the public store `turboslide-decks`.
- `packages/store/src/migrate.ts` lines 77 to 82, `isPublicPath`: `d/`, `exports/`, `bundles/`, `decks/<id>/assets/`. `u/` is not listed, so the split client routes it to the private documents store.
- `packages/store/src/blob-vercel.ts` lines 232 to 247: `addRandomSuffix: false`, `cacheControlMaxAge` only when the caller passes it (the store's default otherwise, one month per report 10 line 26).

### 1.9 Tests and docs

- `apps/studio/src/server/auth/avatar.test.ts`: the sniff, the five files and the digest, the refusals (SVG, a lying header, 5 MB + 1, a 4 px picture), the anonymous refusal, key rotation and the previous key's deletion, the eleventh upload, the file store's grammar. `actions.test.ts` lines 182 to 232: a glyph with a salt; an anonymous picture refused; a signed in upload through a data URL answering the 64 px URL. All pass.
- `apps/studio/e2e/accounts.spec.ts` lines 350 to 368: the route serves a seeded file with the four headers and refuses `u/../../etc/passwd` and `u/short/x.webp`. Line 405: the own chip menu shows Change avatar. No row opens the builder, uploads, or reads a chip with a picture (grep for `avatarBuilder` in `apps/studio/e2e` finds nothing).
- `docs/security.md` section 10 (lines 328 to 349): "a size cap by tier (25 MB anonymous, 50 MB signed in, 5 MB avatar), the magic byte sniff (png, jpeg, webp, gif; svg refused hosted), sharp 0.35.4 with `limitInputPixels` at 64 megapixels and `failOn: 'error'`, HEIF and JXL blocked at process start, animated GIFs flattened, a re-encode hosted so no byte of the input survives, digest named twins"; the gate is `pnpm audit --prod --audit-level=high` as step 28 of `pnpm check` with `scripts/audit-allow.json`, sharp pinned at 0.35.4. Lines 118 to 126: on the memory quota backend the counters are per instance; "an anonymous avatar upload refuses at once".
- `docs/gslides-parity/SPEC-3.md` 0.22 (line 60), 7.6 (lines 614 to 624), 4.1 (line 342), 7.9 (line 646), 8.3 R18. Research 03 I3 and I4 (`research-3/03-optional-accounts-and-avatars.md` lines 616 to 666). Report 10 F43 (`research-3/10-security-and-storage-addendum.md` lines 292 to 300). Research 11 lines 273 and 278 (the picture at the chip's size; the halo over a dithered picture).
- `docs/gslides-parity/return/audit-surface.md` line 23, row 9 "Change avatar", state broken: "Apply closes the dialog with no error and the chip does not change, before or after a reload". Line 179 names the cause: "the chrome keeps the identity read at page load".

### 1.10 The answers

- Can a person upload a photo today: no from the chrome (defect 1). Yes through `POST /api/actions/account.setAvatar` or `runDeckAction` with a base64 data URL, signed in, on a checkout only (defects 3 and 7).
- File size limit: the dialog refuses over 5 MB before anything is read (`AvatarBuilder.tsx` line 150); the server refuses over 5 MB of decoded bytes (`avatar.ts` line 107). Before the server's check the transport's own caps apply: 1 MB on `/api/actions` (`packages/agent/src/http/dispatch.ts` lines 21 and 96, `account.setAvatar` is not in `ASSET_ACTIONS`), the platform's 4.5 MB body limit on the server function hosted. A data URL is 4/3 of the bytes plus JSON.
- Formats: JPEG, PNG, WebP, GIF (first frame). SVG and HEIF refused by the sniff, HEIF and JXL also blocked at process start (security.md section 10).
- Resize: sharp, `rotate()` then `resize(size, size, { fit: 'cover', position })` at 32, 64, 128, 256 WebP quality 80 effort 4, plus a 256 PNG; no client resize.
- Storage: on a checkout `.turboslide/users/u/<avatarKey>/<sha256>-<size>.<webp|png>` served by `/api/avatar/u/...`; hosted the design is the public Blob store under `u/<avatarKey>/`, and the code writes to the function's disk instead (defect 3). The key is 128 random bits per person, rotated on every change; the old prefix is deleted after the new files are written.
- Cache: the checkout route sends `public, max-age=31536000, immutable`, CORP `same-origin`, `nosniff`; hosted the Blob default (one month, cannot be set under one minute per report 10) with the store's own headers; cache busting is the digest in the file name plus the key rotation, so no URL is ever rewritten. The CDN quirk is the one report 10 F50 names for twins: a public blob overwritten in place stays stale at the edge, which the `overwrite: false` put and the digest names avoid.
- Who can see it: on a checkout anyone who can reach the studio's origin with the URL (no authorization on the route; CORP blocks cross origin `<img>` loads); hosted the file would be a public URL guessable only with the 22 character key and the 64 hex digest.
- Propagation: the record is written at once; the room's identity cache holds the old resolution for up to 5 s per instance (`room.ts` line 2027) since `setAvatar` does not call `forgetIdentity`; the next presence post from the person's tab writes the new mark into the roster entry, which every other tab reads on its next presence read. The own chip in the person's own tab does not change at all (defect 4). A picture never reaches any chip (defect 2).

## 2. Defects

1. The browser drops the picture. `EditorRoot.tsx` lines 823 to 828 forward `variant`, `initials` and `salt` and never `choice.picture`; `AvatarBuilder.tsx` line 177 puts the `File` there. The server then throws `'picture is required for the picture variant'` (`auth/actions.ts` line 352) and the dialog shows it in its error row. Even with the key forwarded the shape is wrong: the schema wants a string data URL (`actions.ts` lines 5425 to 5428) and nothing in the chrome or the editor reads the `File` into one.

2. A picture avatar is never drawn. `marks.ts` lines 108 to 111 draw the picture only when `options.pictureUrl` is passed; the three callers pass none: `meOf` (`auth/actions.ts` lines 148 to 160), `rosterEntryFor` (`room.ts` line 2079), and `identityViewFor` itself only forwards what it is given (`identity.ts` line 716). A record with `variant: 'picture'` falls to the initials branch (`marks.ts` lines 115 to 124). The chrome's `account.pictureUrl` is never set (`EditorRoot.tsx` lines 806 to 863), so `Profile.tsx` line 79 and `IdentityChip.tsx` line 124 get `undefined`. `actions.test.ts` line 223 declares `mark: { pictureUrl?: string }` and asserts only `avatar.url`, so the test does not catch it.

3. Hosted, the files go to the function's disk and the URL is a 404. `server/actions.ts` line 1256 registers the account actions without `avatarStore`; `auth/actions.ts` lines 293 to 294 default to `fileAvatarStore(`${stateDir}/users`)`; `blobAvatarStore` (`avatar.ts` line 243) has no caller. The stored `base` is then `/api/avatar/u/<key>` (line 224) and `routes/api/avatar.$.ts`line 23 answers 404 for every request when hosted. A second defect sits behind it:`isPublicPath` (`packages/store/src/migrate.ts`lines 77 to 82) does not include`u/`, so a wired `blobAvatarStore`over the split client would put the files on the private store, where an`<img>` cannot load them.

4. The own chip never changes after Apply. `identityView` (`controller.tsx` lines 287 to 299) carries no `mark`, so `markOf` (`IdentityChip.tsx` lines 58 to 76) computes one from `resolvedOf`, whose avatar is always `{ variant: 'initials' }` (line 51). The own chip is therefore initials from the name whatever the record says. `setAvatar` in `EditorRoot.tsx` does not call `controller.refreshPresence()` as `setName` does (lines 816 to 821), and the server handler does not call `room.forgetIdentity` as `setName` does (`auth/actions.ts` line 327). This is the return audit's row 9 (`return/audit-surface.md` line 23), still open.

5. The builder never starts from the current choice. `account.avatar` is not populated by `EditorRoot.tsx`, so `current` is `undefined` (`AvatarBuilder.tsx` line 110): the tab is always Initials, the initials field empty, the salt 0. Opening Glyph and pressing Apply without Another writes `salt: 0`; a person who set a glyph earlier sees Initials selected and cannot tell what they have. The shell types `salt` as a string (`editor-shell.ts` line 528) and the server stores a number; `EditorRoot.tsx` line 826 converts, and `me.avatar.salt` comes back as a number that the shell type does not admit.

6. There is no crop. The spec (7.6), research 03 I4 and the dialog's own docblock (lines 17 to 27) describe a dragged square crop; `accounts.css` lines 269 to 273 set `cursor: grab`; no pointer handler exists (lines 277 to 285), no crop leaves the browser, the schema has no `crop` field (`actions.ts` lines 5421 to 5429), and the handler calls `setPictureAvatar` without one (`auth/actions.ts` lines 353 to 361). The server falls back to sharp's attention strategy (`avatar.ts` lines 138 to 139). The sentence "Drag to crop" (line 287) describes nothing.

7. There is no client resize, and the caps do not line up. `avatar.ts` line 33 and SPEC-3 7.6 assume a resize to at most 1024 px before upload; `pick()` (lines 147 to 162) checks size and MIME only. A 5 MB JPEG becomes about 6.8 MB of base64 in a JSON body: hosted the server function's 4.5 MB platform limit refuses it before sharp with no sentence from the dialog; over `/api/actions` the 1 MB `WRITE_BODY_LIMIT` (`dispatch.ts` lines 21, 96) refuses a picture over about 750 KB with a 413. The dialog's "Pictures up to 5 MB" is true of neither transport. The 5 MB server check (line 107) also runs only after the whole body was read and decoded.

8. The CLI's `--picture` cannot work. The schema describes "A file path or a data URL" (`actions.ts` line 5428); `account.ts` lines 74 to 86 pass the string through; `dataUrlBytes` (`auth/actions.ts` lines 262 to 270) throws `'picture must be a data URL'` on a path. Nothing on the CLI reads the file and encodes it.

9. `account me --avatar-png` is a usage error (`account.ts` lines 46 to 51) although SPEC-3 7.6 promises it and `renderMarkPng1` exists (`marks-png.ts` lines 18 to 21). `BUILD-STATUS-3.md` line 107 carried it to the fixer round; it did not land. The PPTX comment authors of SPEC-3 7.8 do not use the renderer either (no importer outside the identity package).

10. Delete account is not wired. `Profile.tsx` lines 233 to 252 disable the button unless `account.deleteAccount` exists; `EditorRoot.tsx` never sets it; no `account.delete` action id exists in `packages/schema/src/actions.ts`; `removePictureFiles` (`avatar.ts` line 328) has no caller. The tooltip promises the avatar's removal.

11. `ts_profile.avatar` is written and never read. `profile.ts` lines 94 to 106 write it; `identity.ts` lines 345 to 352 build `AccountProfile.avatar` from the principal record and `resolve.ts` line 129 reads that. When the principal record expires (90 day sliding TTL, `principal.ts` line 19) the account's choice is lost while its files stay under the key until the next change. The two sources can also disagree after a partial failure between lines 308 and 310 of `avatar.ts`.

12. The picture URL is one size for every surface. `avatarAnswer` reports the 64 px file only (`auth/actions.ts` lines 104 to 106); `IdentityChip` draws it at 24, 16 and 14 px with no `srcset` (line 146); the builder's 256 px preview would scale the 64 px file up. Research 03 I4 step 7 asked for 32 or 64 by device pixel ratio. The 128 and 256 px WebP files and the PNG have no reader.

13. `blobAvatarStore.base` is per process memory (`avatar.ts` lines 244, 251 to 252, 262). It is only read right after `put` inside `setPictureAvatar` (line 305), so the stored choice is right, but any later call on another instance answers the relative `u/<key>`. `removeKey` on another instance is unaffected.

14. Two `AVATAR_USERS_DIR` constants (`auth/actions.ts` line 55, `routes/api/avatar.$.ts` line 14) can drift; the route and the writer must agree on the folder.

15. The quota is per instance hosted. `rt.quotas` on the memory backend counts per function instance (`docs/security.md` lines 118 to 126), so ten per day is ten per instance until Upstash is installed. Low, and shared with every other quota.

16. Dead markup and CSS in the builder: the `<span hidden>{scale}</span>` (line 101) and `.ts-avatar-scaled` (`accounts.css` lines 247 to 250) with no user.

17. No end to end row exercises the builder. `accounts.spec.ts` line 405 checks the menu item; the file's header (lines 24 to 26) promises "the avatar builder's Picture tab". The seeded route row (lines 350 to 368) tests the file store on a checkout only.

18. The `localStorage` mirror of name and avatar that SPEC-3 0.17 and 7.1 and `principal.ts` lines 1 to 7 describe does not exist, so the first paint after a reload draws the label's initial until the page payload arrives. This is a documentation and first paint gap rather than a data defect.

## 3. Gaps against the target

The target the task names: a size limited upload with a client resize to 128 and 256 px WebP under 64 KB, a 512 KB server cap on the request, sanitising through a decode and re-encode, and the digest in the path.

| Target piece                                                      | State                                                                                                                                                  | Where                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Client side decode and resize to 128 and 256 px WebP, under 64 KB | Missing. The browser hands the raw `File` to the shell and the editor drops it.                                                                        | `AvatarBuilder.tsx` 147 to 162, 177; `EditorRoot.tsx` 823 to 828 |
| A server cap of 512 KB on the request                             | Missing. The cap is 5 MB after the body is read (`avatar.ts` 107); the transports cap at 1 MB (`/api/actions`) and 4.5 MB (server function, platform). | `avatar.ts` 34, 107; `dispatch.ts` 21, 96                        |
| Sanitising through a decode and re-encode                         | Present. Sniff, `failOn: 'error'`, `limitInputPixels`, format equality, `rotate`, `resize`, WebP and PNG re-encode, no metadata.                       | `avatar.ts` 102 to 172                                           |
| The digest in the path for cache busting                          | Present. `u/<key>/<sha256 of the 256 PNG>-<size>.<ext>`, `overwrite: false`, the key rotated per change.                                               | `avatar.ts` 142 to 164, 247 to 250, 295, 311                     |
| The picture drawn on every chip                                   | Missing. No caller passes `pictureUrl` to `markSpec`.                                                                                                  | defect 2                                                         |
| The hosted store                                                  | Missing. File store on every tier; `u/` not a public path.                                                                                             | defect 3                                                         |
| A square crop                                                     | Missing.                                                                                                                                               | defect 6                                                         |
| Sizes by device pixel ratio                                       | Missing. One 64 px URL.                                                                                                                                | defect 12                                                        |
| The CLI path (`--picture <file>`, `--avatar-png`)                 | Missing.                                                                                                                                               | defects 8, 9                                                     |
| Account deletion removing the files                               | Missing.                                                                                                                                               | defect 10                                                        |
| The own chip and the builder reading the current choice           | Missing.                                                                                                                                               | defects 4, 5                                                     |
| An end to end row for the upload                                  | Missing.                                                                                                                                               | defect 17                                                        |

## 4. Notes for the design

1. Do the resize in the browser and send bytes, not a file. Decode with `createImageBitmap(file)` (which honours the orientation tag with `imageOrientation: 'from-image'`), draw the dragged square into a 256 by 256 canvas and a 128 by 128 canvas, and `canvas.toBlob('image/webp', 0.8)`. Each is well under 64 KB for a photograph at 256 px. Send both as base64 data URLs in the action input, or send the 256 only and let sharp derive the ladder. GIF loses animation at this step by design, and the first frame is what `createImageBitmap` decodes.

2. Cap the request at 512 KB on the server and say so in the dialog. Put the check in `processAvatar` before the sniff (`AVATAR_MAX_BYTES` to 512 KB) and in the handler on the data URL string's length before decoding, so the JSON is refused before `Buffer.from`. Keep `limitInputPixels` but lower it to 1024 by 1024, since the browser already resized; a 512 KB WebP cannot decode to more than a few megapixels either way. Replace "Pictures up to 5 MB" with the sentence for the new cap, and keep the browser's own check on the original file only as a guard against decoding a 50 MB HEIC on a phone.

3. Keep the server pipeline as the sanitiser. The client's WebP is untrusted input like any other; sniff it, decode it with `failOn: 'error'`, and re-encode the ladder from it. Nothing the browser sent lands on disk or on the store.

4. Wire the picture URL into the mark once, at the resolver. `resolveIdentity` already knows the choice; add `pictureUrl(avatar, 64)` to the `ResolvedIdentity` (or compute it inside `markSpec` from `avatar.picture.base` and `digest`) so `meOf`, `rosterEntryFor`, comment authors and version authors all draw the picture with no per caller argument. Then `identityView` in the controller should carry the server's `mark`, which also fixes the own chip for glyph and dither.

5. Serve two sizes and let the chip pick. Answer `avatar.urls: { 32, 64, 128, 256 }` or keep one `base` and `digest` in the view and let `IdentityChip` build `srcset="…-32.webp 1x, …-64.webp 2x"` for 24 px and the 128 or 256 for the builder's strip. The 128 and 256 files then have readers.

6. Wire the store per tier and make `u/` public. In `server/actions.ts` line 1256 pass `avatarStore: () => runtime.hosted ? blobAvatarStore(publicClient) : fileAvatarStore(...)`, add `pathname.startsWith('u/')` to `isPublicPath`, and pass `cacheControlMaxAge` of a year on the put, since the name carries the digest. Replace the per process `bases` map with a base computed from the public store host (`TURBOSLIDE_PUBLIC_STORE_HOST`, `headers.ts` line 154) so `base(key)` is right on every instance.

7. Propagate a change the way `setName` does: `room.forgetIdentity(principalId)` in the handler, `controller.refreshPresence()` in the editor, and the answer's `mark` and `avatar` written back into the shell's `account` (add `avatar` and `pictureUrl` to the `EditorAccount` built in `EditorRoot.tsx`, from the page payload at load and from the action's answer after Apply).

8. Send the crop as four integers in source pixels of the decoded bitmap (`{ left, top, size }` is what `processAvatar` already takes) or drop the crop argument entirely once the browser crops before it resizes. If the browser crops, delete the server's `crop` parameter and the attention fallback; the server then only re-encodes a square.

9. The CLI: read `--picture <file>` into a data URL on the client (`fs.readFile`, sniff by magic number, refuse over the cap), and implement `--avatar-png` with `renderMarkPng1` from the `mark` in `account.me`'s answer.

10. One source of truth for the choice: either drop `ts_profile.avatar` or make `accountProfile` read it and fall back to the record. The key column should stay on the profile, because it is the one place deletion can find the files after the record expires.

11. Account deletion: add `account.delete` with the refusal the profile dialog already names, calling `removePictureFiles` and `profiles.markDeleted`.

12. Rows to add to `accounts.spec.ts`: open the builder from the own chip, choose Glyph, Another, Apply, and read the own chip's `data-variant` at once and after a reload; sign in, upload a fixture, and read the chip's `<img src>` matching `/u\/[A-Za-z0-9_-]{22}\/[0-9a-f]{64}-(32|64)\.webp$/`; upload again and assert the first URL answers 404 on the checkout route; upload a 600 KB WebP and read the cap's sentence in the error row.
