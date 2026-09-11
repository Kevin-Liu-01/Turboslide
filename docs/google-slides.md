# Google Slides export

How `turboslide export gslides` turns a deck into a Google Slides presentation (SPEC 8.3, 8.5,
8.6; MILESTONES M6 item 1), what Kevin has to set up once in Google Cloud before the first live
run, where the credentials and the token live, how images reach Google, and what the export
honestly does not carry. Written for milestone 6 by the Slides export builder. No Google
credentials existed on the build machine, so everything below the dry run is built and unit
tested against the API's documented shapes and runs for real only when
`TURBOSLIDE_GOOGLE_CREDENTIALS` names a credentials file.

## The two runs

```
turboslide export gslides --deck decks/gt-brand --mode native --theme light --dry-run --out .turboslide/export-gslides
turboslide export gslides --deck decks/gt-brand --mode native --theme light --verify --out .turboslide/export-gslides --json
```

The dry run needs no credentials and no network. It renders the deck once in headless Chromium
(the same scene extraction the PPTX exporter uses, `packages/export/src/scene`), builds every
`batchUpdate` request, validates each one against the strict request shapes in
`packages/export/src/gslides/schema.ts` (Zod; a misspelled field fails here, not as a 400 from
Google), checks that every element stays inside the 9,144,000 by 5,143,500 EMU page, plans the
image URLs, and writes:

- `requests.json`: every batch of every theme in order, the per-slide object ids and counts, the
  speaker notes requests against `notes:<page id>` placeholders, the validation issues (empty), and
  `presentationId: null` per presentation.
- `images.json`: the image manifest per theme: token, URL, file, bytes, sha256, the slides and
  blocks that use each image, and whether anything was staged (never in a dry run). Signed URLs
  are redacted.
- `dry-run.json`: `presentationId: null`, the counts and `passed`.
- `export-report-<theme>.json` and the merged `export-report.json` (`ExportReport`, SPEC 4.2) with
  `format: gslides`, no `presentationId` (the strict schema has no null; `dry-run.json` carries the
  explicit null), `geometryInBounds`, `passed`, and the fidelity list in `residual`.

The command exits 0 when every request validated, every element is on the page and nothing was
missing; 1 otherwise. Measured on this machine (Apple M5 Max) the request build, validation and
write for the whole 85-slide deck take well under a second once the scenes exist; the scene
extraction is the Chromium pass, about a minute per theme.

The live run does the same, then authorizes (below), calls `presentations.create({ title })`,
reads `pageSize` back and fails the theme when it is not the default page (the API ignores every
field but the title, so the sheet maps at 5,715 EMU per px onto 10 by 5.625 inches), sends the
batches with `writeControl.requiredRevisionId` chained from one response to the next, reads the
slides back with a field mask for `speakerNotesObjectId`, and sends the notes plus the removal of
the presentation's default first slide as the second call. `--verify` then fetches every slide's
`LARGE` thumbnail (1,600 px wide) and diffs it against the Turboslide render of the same slide at
the same revision with pixelmatch at threshold 0.1; native passes under 3 percent mismatched
pixels per slide, flatten under 0.1 percent (`packages/export/src/calibration/slides.json`
`thumbnail.budgets`). The report carries `presentationId`, `url`, and per slide the mismatch,
the fraction and the reference, thumbnail and diff paths; native slides also carry the per-block
ink offsets the PPTX loop measures. Exit 1 when `passed` is false, 2 when the credentials are
missing.

Flags: `--mode flatten|native` (default flatten, the export.run default), `--theme light,dark`
(one presentation per theme, default both), `--dry-run`, `--verify`, `--out <dir>` (default
`.turboslide/export-gslides`), `--exclude-share-alike`, `--scenes` (write `scene-<theme>.json`),
`--images=local|gcs`, `--assets-url=<origin>`, `--title=<text>` (the last three take the `=`
form because the CLI's flag parser lists the flags that take a value). Slide ids, numbers and
ranges select a subset as for `render`. The same input is `export.run` with `format: 'gslides'`
and `dryRun: true` on every transport.

## One-time setup in Google Cloud

These steps are Kevin's (SPEC open question 3: who owns the client and where the presentations
land). Nothing here is committed to the repository.

1. Create a Google Cloud project, or pick the GT workspace's, at
   https://console.cloud.google.com. Note the project id.
2. Enable two APIs under APIs and Services, Library: Google Slides API and Google Drive API (the
   `drive.file` scope needs the Drive API enabled even though the exporter never calls Drive
   directly).
3. Configure the OAuth consent screen (APIs and Services, OAuth consent screen, or Google Auth
   Platform, Branding): user type Internal for the GT workspace, so no verification review is
   needed and only workspace accounts can consent. App name Turboslide, a support email, the
   developer contact. Add the two scopes under Data access: `.../auth/drive.file` and
   `.../auth/presentations`.
4. Create an OAuth client (APIs and Services, Credentials, Create credentials, OAuth client ID)
   of type Desktop app, name Turboslide CLI. Download the JSON. It is a client secrets file with
   an `installed` object holding `client_id` and `client_secret`.
5. Put the file outside the repository, for example
   `~/.config/turboslide/credentials.json` (`chmod 600`), and export
   `TURBOSLIDE_GOOGLE_CREDENTIALS=$HOME/.config/turboslide/credentials.json`. The M6 acceptance
   lines use exactly this path.
6. First run: `turboslide export gslides --deck decks/gt-brand --mode native --theme light --out
.turboslide/export-gslides`. The CLI prints a consent URL and listens on a loopback port
   (`http://127.0.0.1:<port>`); open the URL in a browser signed in to the account that should own
   the presentations, approve the two scopes, and the redirect lands on the loopback server with
   the code. The token is cached at `~/.config/turboslide/token.json` (mode 0600;
   `XDG_CONFIG_HOME` honored) with a refresh token, so later runs refresh silently. Delete that
   file to force a new consent, or revoke the app at https://myaccount.google.com/permissions.
7. Read back into `calibration/slides.json` what the first live run measured (the `measured`
   block): the `pageSize`, whether a zero-height line was accepted, whether the 0.45 pt weight
   rendered as one pixel in the thumbnail, and the text inset and pitch against the calibration
   deck. Until then the file's `assumed` values drive the builder.

The presentations land in the consenting account's My Drive (`drive.file` grants access only to
files the app created). A shared drive or a folder is a later `drive.file` move; the exporter
does not do it yet.

## Images

`createImage` and `stretchedPictureFill` take a URL that Google's servers fetch once at write
time, so every raster, picture and sheet screenshot is hosted first (`gslides/images.ts`). Two
hosts, chosen by `--images` or the environment:

- Local static host (default, dev). The exporter stages each file content addressed under
  `<root>/.turboslide/gslides-assets/<sha256>.png` and hands Google
  `<origin>/api/assets/<sha256>`; the studio serves that route
  (`apps/studio/src/routes/api/assets.$token.ts`, public, cache 15 minutes, only 64-hex tokens,
  only that folder). Google cannot reach `localhost`, so a live run needs the studio on a public
  origin: run `pnpm dev` on 4321 and a tunnel (for example `cloudflared tunnel --url
http://localhost:4321`), then pass its origin as `--assets-url=https://<tunnel>` or
  `TURBOSLIDE_ASSET_BASE_URL`. A dry run plans the URLs and copies nothing.
- Cloud Storage host (config only; no bucket exists yet). `TURBOSLIDE_GCS_BUCKET` names the
  bucket, `TURBOSLIDE_GCS_CREDENTIALS` a service account key JSON with object create and read on
  it, `TURBOSLIDE_GCS_PREFIX` the object prefix (default `turboslide`). Objects are
  `<prefix>/<sha256>.png`, uploaded once through the JSON API with a JWT bearer token and never
  re-uploaded when they exist; URLs are V4 signed GETs with a 900 second TTL, under 2 KB, redacted
  in `images.json` and never logged (SPEC 11). With the bucket set and no key, a dry run plans
  unsigned `https://storage.googleapis.com/<bucket>/<object>` URLs and marks them `signed: false`.

Pictures that `object-fit: cover` in the browser are cropped to the visible region before hosting
(`ImageProperties.cropProperties` is read-only in the API), so the placed image matches the sheet.
A two-tone twin regenerated at 2x already has the sheet's aspect and is used as the page's
`stretchedPictureFill`.

## What the requests contain

Per slide in native mode (`gslides/requests.ts`): `createSlide` BLANK with `objectId`
`ts_<slide id>` at the deck index; `updatePageProperties` with the paper as `solidFill` or the
full-sheet picture as `stretchedPictureFill`; the frame (two rails, two rules, four crosses as
two lines each) as `createLine` STRAIGHT plus `updateLineProperties` at 0.45 pt with the hair
token's alpha on `lineFill.solidFill.alpha`, grouped with `groupObjects`; paper chips and plates
as `RECTANGLE` shapes with no outline; the wordmark as `createImage`; block hairlines; every
measured text as `createShape` TEXT_BOX, `insertText` (the browser's lines joined by newlines),
`updateShapeProperties` (autofit NONE, content at the top), `updateTextStyle` ALL with
`fontFamily` and `weightedFontFamily` Inter at the measured weight, `fontSize` in PT (22 px is
9.9 pt), `foregroundColor`, and a FIXED_RANGE style per run that differs (weight 500 spans,
links, strikes, the paper-colored GT letters under a mark), `updateParagraphStyle` with
`lineSpacing` as a percentage of Inter's 1.21 normal (33 px at 22 px is 124.0), zero paragraph
spacing and indents, and the alignment; every raster as `createImage`; a ruled row's hairline and
its two boxes as one `groupObjects`. Text boxes are written wider and taller by Slides' default
inset (7.2 pt left and right, 3.6 pt top and bottom, assumed until measured) and moved up and
left by the same amount, plus 2 px of width slack and 2.5 percent on headings so no line rewraps.

Flatten mode: the text layer first, in the paper color (TextStyle has no alpha), then one
`createImage` of the 2x sheet raster over the whole page, so the slide is pixel exact and the
text stays searchable behind it.

Requests are packed into as few `batchUpdate` calls as the caps allow (4 MB and 2,000 requests per
call by default, `slides.json` `batch`), never splitting a slide. The whole 85-slide deck in
native mode is on the order of ten thousand requests in a handful of calls. Quota: 60 writes and
60 reads per minute per user; the pacer (`gslides/pace.ts`) keeps a sliding window per bucket,
waits for the window, retries 429 and 5xx with exponential backoff and honors Retry-After. A full
two-theme verify run of the deck is about three minutes of thumbnails at the read quota.

## What is honestly not identical

From SPEC 8.6, recorded in every report's `residual`:

- No letter spacing: Slides has no tracking. Headings run about 2.5 percent wider in Google Fonts
  Inter; hard breaks and the width slack keep the wraps.
- No text inset control: the default inset is compensated from an assumed constant until measured.
- No `cv11` and `ss01`, no optical sizes: text is Google Fonts Inter at weights 400 and 500.
- The page size is fixed at 10 by 5.625 inches.
- Line pitch is a percentage of a normal that is assumed at 1.21 until calibrated; the minimum
  honored line weight and zero-height lines are unverified.
- Flatten text has no alpha; it sits behind the raster in the paper color.
- Two-tone dithers grey at any non-1:1 zoom; shaders, canvases and the live theme do not exist.
- Speaker notes need the second call; the default first slide is removed in that call.

## Files

`packages/export/src/gslides/{units,ids,schema,calibration,requests,images,pace,notes,client,auth,thumbs,build}.ts`,
`packages/export/src/calibration/slides.json`, the fixtures and tests under
`packages/export/src/gslides/`, `apps/cli/src/commands/export.ts` (the `gslides` branch),
`apps/studio/src/routes/api/assets.$token.ts`, and `export.run`'s `dryRun` field in
`packages/schema/src/actions.ts`.
