# Turboslide experiment: Google Slides API, headless rendering, and the systems-level path

Date: 2026-09-10. Machine: Kevin's Mac (Apple M5 Max, macOS Darwin 25.4.0), Node 24.13.0, pnpm 11.15.1, Go 1.26.5, cargo 1.98.1, Python 3.14.6 with Pillow 12.3.0 and numpy 2.5.1, Chrome for Testing 147.0.7727.15 from the Playwright cache (`chromium-1217`), playwright-core 1.62.0 resolved from the gt-cloud worktree the deck's `shoot-slide.mjs` already uses. Zig is not installed. Every script and output referenced here lives under `/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/turboslide/experiments/slides-and-render/` (called `EXP/` below). The Prototemplate and Glyphfield repos were read only; the assembled deck HTML was written to `EXP/out`, not into the repo.

## 0. Summary

1. Google Slides. One deck slide is one `batchUpdate` of about a dozen requests: `createSlide` with `predefinedLayout: BLANK`, `updatePageProperties` with a `solidFill` background, `createLine` plus `updateLineProperties` for each hairline at 0.45 pt, `createShape` `TEXT_BOX` plus `insertText` plus `updateTextStyle` (`weightedFontFamily {Inter, 500}`, `fontSize` in PT, `foregroundColor` as floats) plus `updateParagraphStyle` (`lineSpacing` as a percentage of normal), `createImage` from a public URL for every 2x raster, and `groupObjects` for the rail set. The full JSON is in section 1.2. Page size is fixed at creation: `presentations.create` ignores every field except `title` and `presentationId`, and no batchUpdate request touches `pageSize`, so the sheet maps onto the default 10 by 5.625 in page at 5,715 EMU per sheet pixel. Letter spacing, exact line pitch, text inset, image crop and transparency, SVG and custom geometry have no equivalent. The `drive.file` scope alone covers create, batchUpdate and getThumbnail. Quotas are 60 writes and 60 thumbnails per minute per user, with overage billing planned for later in 2026. This machine has no gcloud, no `gws`, no application default credentials, no OAuth client file and no `GOOGLE_*` environment variables, so no live call was possible; every API statement below is from the official docs, cited by URL.
2. Headless rendering. `shoot-slide.mjs` renders one slide in about 320 ms at 1600 by 900 (p50 over all 85 slides, 28.0 s for the deck in one theme), of which 220 ms is a fixed settle wait; the JPEG screenshot itself is 28 ms at p50 and 135 ms at worst. At 3200 by 1800 a PNG screenshot costs 130 to 430 ms and a JPEG about 110 ms. Browser launch is 0.7 to 1.7 s and the first page load about 1.8 s, once. WebGL2 renders headless on ANGLE Metal against the M5 Max with Chrome for Testing even without flags; Playwright's default `chromium_headless_shell` falls back to SwiftShader unless `--use-gl=angle --use-angle=metal --ignore-gpu-blocklist` is passed, which is why the deck's shader captures carried those flags. A test fragment shader ran at 1.3 to 1.4 ms per frame at 3200 by 1800 on Metal and 24.8 ms on SwiftShader, and the two backends produced different pixels (4.8 percent versus 8.5 percent lit), so shader frames must be captured once and stored, never regenerated at export time.
3. Systems-level path. Rust and Go do not buy throughput for the image work in scope. PNG decode of a 3200 by 1800 screenshot costs 40 to 65 ms in every runtime and dominates; the Bayer dither itself is 5 to 9 ms at full resolution in JavaScript, Go and Rust alike; libvips through sharp is the fastest RGBA PNG encoder of the four (52 ms at compression 6 versus 172 ms for Rust's `png` crate and 225 ms for Go's); a 60-line pure Node 1-bit PNG encoder writes a two-color 3200 by 1800 file in 12 ms, faster than sharp's palette path (219 ms), Pillow (40 to 66 ms), Go (40 ms) and close to Rust (15 ms); the exact pixel diff is 6 to 12 ms everywhere and pixelmatch with antialiasing detection is 31 ms for identical pairs and 329 ms for a fully different pair; PPTX zip assembly of 34 MB of media is 0.09 s in store mode. The whole 85 slide, two theme, 2x dither and encode pass is about 4 s of CPU in Node against roughly 110 s of Chromium rendering. sharp 0.35.0 installs cleanly on this machine (prebuilt libvips 8.18.3, 1.1 s). The one thing Rust gives that Node cannot is a single crate compiled to both a napi-rs addon and WebAssembly so that the editor's live dither preview and the export pipeline produce identical bits; the cross-implementation test shows why that matters (section 3.4). Recommendation: start on Node plus sharp plus the pure Node encoder, keep a native package slot, and fill it with a Rust napi-rs plus wasm crate for dither and diff only when bit identity between browser and server is wanted; use Go only for a standalone sidecar binary that must run without Node.

## 1. Google Slides API

### 1.1 Facts from the official documentation

Units and page geometry.

- "An English Metric Unit (EMU) is defined as 1/360,000 of a centimeter and thus there are 914,400 EMUs per inch, and 12,700 EMUs per point." PT is "A point, 1/72 of an inch." Source: the Slides API discovery document, https://slides.googleapis.com/$discovery/rest?version=v1 (Unit enum), mirrored in the REST reference https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/other.
- `Presentation.pageSize` is "The size of pages in the presentation" and is not marked output only in the schema, but `presentations.create` states: "If a presentationId is provided, it is used as the ID of the new presentation. Otherwise, a new ID is generated. Other fields in the request, including any provided content, are ignored." https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/create and https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations. The request list at https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/request contains no request that writes `pageSize`. Third-party sources give the default as 9,144,000 by 5,143,500 EMU (10 by 5.625 in, 16:9): https://www.bentumbleson.com/experiments-with-the-google-slides-api-to-recreate-slides/. I could not confirm the default from a Google page; the live calibration step should read `pageSize` back from `presentations.get` on the first created deck.
- Consequence for the 1600 by 900 sheet: 9,144,000 / 1600 = 5,715 EMU per sheet pixel, exactly, in both axes. 1 px = 0.45 pt. The rails at 56 px sit at 320,040 EMU; the content box origin (137, 129) is (783,055, 737,235) EMU; the content box 1326 by 642 px is 7,578,090 by 3,669,030 EMU.
- Element geometry: `PageElementProperties` has `pageObjectId`, `size` (a `Size` of two `Dimension`s, "A width and height") and `transform` (an `AffineTransform` with `scaleX`, `scaleY`, `shearX`, `shearY`, `translateX`, `translateY`, `unit`; `unit` applies to the translate components). https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/request and https://developers.google.com/workspace/slides/api/guides/transform.
- Object ids: "must be unique among all pages and page elements", 5 to 50 characters, starting with an alphanumeric character or underscore, with hyphens and colons allowed afterwards (CreateSlideRequest, CreateShapeRequest, CreateLineRequest, CreateImageRequest at the request reference above). Turboslide's stable slide and block ids fit this if they are prefixed to reach five characters.

Requests (all at https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/request unless noted).

- `createSlide`: `objectId`, `insertionIndex` (zero based, appends when omitted), `slideLayoutReference.predefinedLayout` with the enum BLANK, CAPTION_ONLY, TITLE, TITLE_AND_BODY, TITLE_AND_TWO_COLUMNS, TITLE_ONLY, SECTION_HEADER, SECTION_TITLE_AND_DESCRIPTION, ONE_COLUMN_TEXT, MAIN_POINT, BIG_NUMBER; "If you don't specify a layout reference, the slide uses the predefined BLANK layout" (discovery document).
- `updatePageProperties`: `objectId`, `pageProperties.pageBackgroundFill` with `propertyState`, `solidFill {color, alpha}` or `stretchedPictureFill {contentUrl}`, and a `fields` mask. The official sample uses `"fields": "pageBackgroundFill"`: https://developers.google.com/workspace/slides/api/samples/slides. `StretchedPictureFill.contentUrl` on write: "The picture is fetched once at insertion time and a copy is stored for display inside the presentation. Pictures must be less than 50MB in size, cannot exceed 25 megapixels, and must be in one of PNG, JPEG, or GIF format. The provided URL can be at most 2 kB in length." https://developers.google.com/resources/api-libraries/documentation/slides/v1/java/latest/com/google/api/services/slides/v1/model/StretchedPictureFill.html
- `createShape`: `objectId`, `elementProperties`, `shapeType` (`TEXT_BOX` is "Text box shape", `RECTANGLE` "Corresponds to ECMA-376 ST_ShapeType 'rect'"): https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/shapes.
- `insertText`: `objectId`, `text`, `insertionIndex`; a newline "implicitly creates a new ParagraphMarker" copying the paragraph style, and control characters U+0000 to U+0008 and U+000C to U+001F are stripped.
- `updateTextStyle`: `objectId`, `style` (TextStyle), `textRange` (`type` ALL, FIXED_RANGE with `startIndex` and `endIndex`, or FROM_START_INDEX), `fields` mask with at least one field. TextStyle carries `fontFamily` ("any font from the Font menu in Slides or from Google Fonts"; unrecognized names render as Arial), `fontSize` (a Dimension; "When read, the fontSize will specified in points"), `weightedFontFamily {fontFamily, weight}` where weight "can have any value that is a multiple of 100 between 100 and 900, inclusive" and "If an update request specifies values for both weightedFontFamily and bold, the weightedFontFamily is applied first, then bold", `foregroundColor.opaqueColor.rgbColor {red, green, blue}` as floats 0.0 to 1.0, plus `bold`, `italic`, `underline`, `strikethrough`, `smallCaps`, `baselineOffset`, `link`, `backgroundColor`. There is no letter spacing, character spacing or tracking field. https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/text. The official styling sample uses `"fields": "foregroundColor,fontFamily,fontSize"` with `fontSize {magnitude: 14, unit: PT}`: https://developers.google.com/workspace/slides/api/guides/styling.
- `updateParagraphStyle`: `style` with `lineSpacing` ("The amount of space between lines, as a percentage of normal, where normal is represented as 100.0"), `alignment` START, CENTER, END, JUSTIFIED, `indentStart`, `indentEnd`, `indentFirstLine`, `spaceAbove`, `spaceBelow` (Dimensions), `direction`, `spacingMode` NEVER_COLLAPSE or COLLAPSE_LISTS; `textRange`; `fields`.
- `createLine`: `objectId`, `elementProperties`, `category` (STRAIGHT, BENT, CURVED; `lineCategory` is the deprecated spelling). `updateLineProperties`: `lineProperties {lineFill.solidFill {color, alpha}, weight (Dimension, "The thickness of the line"), dashStyle, startArrow, endArrow, link}` and `fields`. Defaults for unset fields match new lines in the editor. https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/lines and https://developers.google.com/resources/api-libraries/documentation/slides/v1/java/latest/com/google/api/services/slides/v1/model/LineProperties.html. No minimum weight is documented; whether the renderer honors 0.45 pt is one of the things the live test must measure.
- `createImage`: `objectId`, `elementProperties`, `url`: "The image URL. The image is fetched once at insertion time and a copy is stored for display inside the presentation. Images must be less than 50 MB in size, can't exceed 25 megapixels, and must be in one of PNG, JPEG, or GIF formats. The provided URL must be publicly accessible and up to 2 KB in length." (discovery document). The guide adds: for private images "you first must make them available on a publicly accessible URL. One option is to upload your images to Google Cloud Storage and use signed URLs with a 15 minute TTL. Uploaded images are automatically deleted after 15 minutes." https://developers.google.com/workspace/slides/api/guides/add-image. Google Drive as an image host is not described in that guide; publicly shared Drive links are a community practice I did not verify. `ImageProperties.cropProperties`, `transparency`, `brightness`, `contrast`, `recolor` and `shadow` are read only; only `outline` and `link` are writable, so every raster must be pre-cropped and pre-composited with PNG alpha. https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/other.
- `groupObjects`: `groupObjectId` and `childrenObjectIds` (at least two elements on the same page, not already grouped).
- `batchUpdate`: "Each request is validated before being applied. If any request is not valid, then the entire request will fail and nothing will be applied." `writeControl.requiredRevisionId` makes the write fail with 400 if the presentation changed. `replies` maps 1:1 to requests. No maximum request count or payload size is documented. https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/batchUpdate
- Speaker notes: the slide's notes page has `notesProperties.speakerNotesObjectId`, and "Inserting text using this object ID will automatically create the shape". https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages. The id is only known after the slide exists, so notes need a `presentations.get` (or `pages.get`) between two batchUpdate calls.

Scopes, quota, thumbnails.

- Scopes: `https://www.googleapis.com/auth/drive.file` is non-sensitive ("See, edit, create, and delete only the specific Google Drive files you use with this app"); `presentations` and `presentations.readonly` are sensitive; `drive` and `drive.readonly` are restricted. The scopes page recommends "the most narrowly focused scope possible". `presentations.create`, `batchUpdate` and `getThumbnail` all list `drive.file` among their accepted scopes. https://developers.google.com/workspace/slides/api/scopes, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/create, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/getThumbnail
- Quota: read requests 3,000 per minute per project and 600 per minute per user; expensive read requests (thumbnails) 300 and 60; write requests 600 and 60. Exceeding a limit returns "429: Too many requests" and the guidance is exponential backoff. "Exceeding the quota request limits is planned to incur charges to your Google Cloud billing account later in 2026." https://developers.google.com/workspace/slides/api/limits. The page counts API requests; it does not say how sub-requests inside one batchUpdate are counted, so the safe design is a few large batchUpdate calls per deck.
- Thumbnails: `GET https://slides.googleapis.com/v1/presentations/{presentationId}/pages/{pageObjectId}/thumbnail` with `thumbnailProperties.mimeType=PNG` and `thumbnailProperties.thumbnailSize` LARGE (1600 px wide), MEDIUM (800), SMALL (200). The response is `{width, height, contentUrl}`; "The URL to the image has a default lifetime of 30 minutes. This URL is tagged with the account of the requester." and "This request counts as an expensive read request for quota purposes." https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/getThumbnail. On a 16:9 page LARGE is 1600 by 900, the sheet's own size, so the thumbnail diffs directly against the 1x Playwright render. 85 slides at 60 per minute is about 90 s per theme, 3 minutes for both.
- Client libraries: the Node quickstart enables the API, configures the OAuth consent screen, creates a Desktop OAuth client and downloads `credentials.json`, installs `googleapis` and `@google-cloud/local-auth`, and constructs `google.slides({version: 'v1', auth})`: https://developers.google.com/workspace/slides/api/quickstart/nodejs. Current npm versions checked today: `googleapis` 178.1.1, `@googleapis/slides` 6.0.0, `google-auth-library` 11.0.2.
- Import route for a different page size: Drive uploads convert when the file metadata carries a Google Workspace `mimeType` (for Slides, `application/vnd.google-apps.presentation`); the supported conversions are listed in `about.importFormats`; simple and multipart uploads are capped at 5 MB, resumable uploads are not. https://developers.google.com/workspace/drive/api/guides/manage-uploads. Whether an imported 13.333 by 7.5 in PPTX keeps its page size in Slides is still unverified (report 04, section 12).

### 1.2 The batchUpdate for one deck slide

The slide below is the deck's most common archetype, text plus a ruled table, in the dark theme: paper `#070707`, ink `#f2f2f0`, titanium `#8a8f98`, hair as ink at alpha 0.22. Sheet pixels convert at 5,715 EMU per px and 0.45 pt per px. The heading is `h2` (44 px, weight 500, line height 1.1), the paragraph is `p` (22 px, weight 400, line height 1.5), the caption is `.cap` (15 px, titanium), the ruled row is one hairline plus a key and a value cell (20 px, key at weight 500), the raster is an `svg.dia` diagram in the right column exported as a 2x PNG. Line spacing is a percentage of the font's normal pitch; with InterVariable's 1.21 normal (report 04, section 3) 1.1 becomes 90.9 percent and 1.5 becomes 124 percent, both to be calibrated against the first thumbnail. The requests are in one array so the slide is created atomically.

```json
{
  "requests": [
    { "createSlide": { "objectId": "slide-thesis", "insertionIndex": 2,
        "slideLayoutReference": { "predefinedLayout": "BLANK" } } },

    { "updatePageProperties": { "objectId": "slide-thesis",
        "pageProperties": { "pageBackgroundFill": { "solidFill": {
          "color": { "rgbColor": { "red": 0.0275, "green": 0.0275, "blue": 0.0275 } }, "alpha": 1.0 } } },
        "fields": "pageBackgroundFill.solidFill" } },

    { "createLine": { "objectId": "slide-thesis-rule-top", "category": "STRAIGHT",
        "elementProperties": { "pageObjectId": "slide-thesis",
          "size": { "width": { "magnitude": 9144000, "unit": "EMU" }, "height": { "magnitude": 0, "unit": "EMU" } },
          "transform": { "scaleX": 1, "scaleY": 1, "translateX": 0, "translateY": 320040, "unit": "EMU" } } } },
    { "updateLineProperties": { "objectId": "slide-thesis-rule-top",
        "lineProperties": { "weight": { "magnitude": 0.45, "unit": "PT" }, "dashStyle": "SOLID",
          "lineFill": { "solidFill": { "color": { "rgbColor": { "red": 0.949, "green": 0.949, "blue": 0.941 } }, "alpha": 0.22 } } },
        "fields": "weight,dashStyle,lineFill" } },

    { "createShape": { "objectId": "slide-thesis-h2", "shapeType": "TEXT_BOX",
        "elementProperties": { "pageObjectId": "slide-thesis",
          "size": { "width": { "magnitude": 2986088, "unit": "EMU" }, "height": { "magnitude": 553212, "unit": "EMU" } },
          "transform": { "scaleX": 1, "scaleY": 1, "translateX": 783055, "translateY": 737235, "unit": "EMU" } } } },
    { "insertText": { "objectId": "slide-thesis-h2", "insertionIndex": 0,
        "text": "One source text,\nevery language" } },
    { "updateTextStyle": { "objectId": "slide-thesis-h2", "textRange": { "type": "ALL" },
        "style": { "weightedFontFamily": { "fontFamily": "Inter", "weight": 500 },
          "fontSize": { "magnitude": 19.8, "unit": "PT" },
          "foregroundColor": { "opaqueColor": { "rgbColor": { "red": 0.949, "green": 0.949, "blue": 0.941 } } } },
        "fields": "weightedFontFamily,fontSize,foregroundColor" } },
    { "updateParagraphStyle": { "objectId": "slide-thesis-h2", "textRange": { "type": "ALL" },
        "style": { "lineSpacing": 90.9, "alignment": "START",
          "spaceAbove": { "magnitude": 0, "unit": "PT" }, "spaceBelow": { "magnitude": 0, "unit": "PT" } },
        "fields": "lineSpacing,alignment,spaceAbove,spaceBelow" } },

    { "createShape": { "objectId": "slide-thesis-p1", "shapeType": "TEXT_BOX",
        "elementProperties": { "pageObjectId": "slide-thesis",
          "size": { "width": { "magnitude": 2986088, "unit": "EMU" }, "height": { "magnitude": 565785, "unit": "EMU" } },
          "transform": { "scaleX": 1, "scaleY": 1, "translateX": 783055, "translateY": 1393260, "unit": "EMU" } } } },
    { "insertText": { "objectId": "slide-thesis-p1", "insertionIndex": 0,
        "text": "The source code is the source of truth and translation is a build step." } },
    { "updateTextStyle": { "objectId": "slide-thesis-p1", "textRange": { "type": "ALL" },
        "style": { "weightedFontFamily": { "fontFamily": "Inter", "weight": 400 },
          "fontSize": { "magnitude": 9.9, "unit": "PT" },
          "foregroundColor": { "opaqueColor": { "rgbColor": { "red": 0.949, "green": 0.949, "blue": 0.941 } } } },
        "fields": "weightedFontFamily,fontSize,foregroundColor" } },
    { "updateParagraphStyle": { "objectId": "slide-thesis-p1", "textRange": { "type": "ALL" },
        "style": { "lineSpacing": 124.0, "alignment": "START" },
        "fields": "lineSpacing,alignment" } },

    { "createLine": { "objectId": "slide-thesis-row1-rule", "category": "STRAIGHT",
        "elementProperties": { "pageObjectId": "slide-thesis",
          "size": { "width": { "magnitude": 2986088, "unit": "EMU" }, "height": { "magnitude": 0, "unit": "EMU" } },
          "transform": { "scaleX": 1, "scaleY": 1, "translateX": 783055, "translateY": 2286000, "unit": "EMU" } } } },
    { "updateLineProperties": { "objectId": "slide-thesis-row1-rule",
        "lineProperties": { "weight": { "magnitude": 0.45, "unit": "PT" }, "dashStyle": "SOLID",
          "lineFill": { "solidFill": { "color": { "rgbColor": { "red": 0.949, "green": 0.949, "blue": 0.941 } }, "alpha": 0.22 } } },
        "fields": "weight,dashStyle,lineFill" } },
    { "createShape": { "objectId": "slide-thesis-row1-key", "shapeType": "TEXT_BOX",
        "elementProperties": { "pageObjectId": "slide-thesis",
          "size": { "width": { "magnitude": 1371600, "unit": "EMU" }, "height": { "magnitude": 165735, "unit": "EMU" } },
          "transform": { "scaleX": 1, "scaleY": 1, "translateX": 783055, "translateY": 2377440, "unit": "EMU" } } } },
    { "insertText": { "objectId": "slide-thesis-row1-key", "insertionIndex": 0, "text": "Locales" } },
    { "updateTextStyle": { "objectId": "slide-thesis-row1-key", "textRange": { "type": "ALL" },
        "style": { "weightedFontFamily": { "fontFamily": "Inter", "weight": 500 },
          "fontSize": { "magnitude": 9.0, "unit": "PT" },
          "foregroundColor": { "opaqueColor": { "rgbColor": { "red": 0.949, "green": 0.949, "blue": 0.941 } } } },
        "fields": "weightedFontFamily,fontSize,foregroundColor" } },
    { "createShape": { "objectId": "slide-thesis-row1-val", "shapeType": "TEXT_BOX",
        "elementProperties": { "pageObjectId": "slide-thesis",
          "size": { "width": { "magnitude": 1431608, "unit": "EMU" }, "height": { "magnitude": 165735, "unit": "EMU" } },
          "transform": { "scaleX": 1, "scaleY": 1, "translateX": 2337535, "translateY": 2377440, "unit": "EMU" } } } },
    { "insertText": { "objectId": "slide-thesis-row1-val", "insertionIndex": 0, "text": "Eight, served from one build" } },
    { "updateTextStyle": { "objectId": "slide-thesis-row1-val", "textRange": { "type": "ALL" },
        "style": { "weightedFontFamily": { "fontFamily": "Inter", "weight": 400 },
          "fontSize": { "magnitude": 9.0, "unit": "PT" },
          "foregroundColor": { "opaqueColor": { "rgbColor": { "red": 0.949, "green": 0.949, "blue": 0.941 } } } },
        "fields": "weightedFontFamily,fontSize,foregroundColor" } },

    { "createShape": { "objectId": "slide-thesis-cap", "shapeType": "TEXT_BOX",
        "elementProperties": { "pageObjectId": "slide-thesis",
          "size": { "width": { "magnitude": 2986088, "unit": "EMU" }, "height": { "magnitude": 124301, "unit": "EMU" } },
          "transform": { "scaleX": 1, "scaleY": 1, "translateX": 783055, "translateY": 4281965, "unit": "EMU" } } } },
    { "insertText": { "objectId": "slide-thesis-cap", "insertionIndex": 0,
        "text": "The rows are the deck's table form; there are no bullets." } },
    { "updateTextStyle": { "objectId": "slide-thesis-cap", "textRange": { "type": "ALL" },
        "style": { "weightedFontFamily": { "fontFamily": "Inter", "weight": 400 },
          "fontSize": { "magnitude": 6.75, "unit": "PT" },
          "foregroundColor": { "opaqueColor": { "rgbColor": { "red": 0.541, "green": 0.561, "blue": 0.596 } } } },
        "fields": "weightedFontFamily,fontSize,foregroundColor" } },

    { "createImage": { "objectId": "slide-thesis-dia",
        "url": "https://storage.googleapis.com/turboslide-export/<job>/slide-thesis-dia@2x.png?X-Goog-Signature=...",
        "elementProperties": { "pageObjectId": "slide-thesis",
          "size": { "width": { "magnitude": 4180523, "unit": "EMU" }, "height": { "magnitude": 2286000, "unit": "EMU" } },
          "transform": { "scaleX": 1, "scaleY": 1, "translateX": 4180523, "translateY": 1393260, "unit": "EMU" } } } },

    { "groupObjects": { "groupObjectId": "slide-thesis-rails",
        "childrenObjectIds": ["slide-thesis-rule-top", "slide-thesis-row1-rule"] } }
  ],
  "writeControl": { "requiredRevisionId": "<revisionId from presentations.get>" }
}
```

Notes on the JSON.

- Geometry derivation: h2 box at content origin (137, 129) px = (783,055, 737,235) EMU; a two-line h2 is 2 by 48.4 px = 96.8 px = 553,212 EMU; the left column of a 5fr/7fr `.cols` is 522.5 px = 2,986,088 EMU; the right column starts at 137 + 522.5 + 72 = 731.5 px = 4,180,523 EMU and is 731.5 px wide; the image is placed at the diagram's CSS box, and its pixel size (2x) does not enter the EMU size. The value cell starts at key width 240 px plus the 32 px gap: 137 + 272 = 409 px = 2,337,535 EMU.
- Lines: a horizontal line is expressed with `height` 0 EMU; if the API rejects a zero dimension in the live test, use a 1 pt height with `scaleY: 0`, the form the editor stores for horizontal lines. This is unverified without credentials.
- Text boxes are sized from the browser's `getBoundingClientRect` plus 2 px of slack (report 04, section 9 step 1). The default text inset inside a Slides text box cannot be set through the API (ShapeProperties has no inset or padding field, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/shapes), so the exporter must subtract the measured default inset from `translateX` and `translateY` after calibration.
- Weight 500 is native here (`weightedFontFamily.weight`), unlike PPTX, which has only a bold flag (report 04, section 11 item 2).
- Speaker notes need a second call: `presentations.pages.get` on `slide-thesis` returns `slideProperties.notesPage.notesProperties.speakerNotesObjectId`, then `insertText` into that id in a second `batchUpdate`.
- Light theme is a second file with the same geometry and the light colors: paper 1.0, ink 0.0275, hair alpha 0.18.

### 1.3 Verification with getThumbnail

```
GET https://slides.googleapis.com/v1/presentations/{presentationId}/pages/slide-thesis/thumbnail
    ?thumbnailProperties.mimeType=PNG&thumbnailProperties.thumbnailSize=LARGE
-> { "width": 1600, "height": 900, "contentUrl": "https://lh3.googleusercontent.com/..." }   (URL valid 30 minutes)
```

Fetch `contentUrl`, decode, and diff against `EXP/render-timing.mjs`'s 1x PNG of the same slide and theme with pixelmatch at threshold 0.1, with per-region budgets, because Google's text rasterizer will not match Skia's glyph antialiasing. The call is an expensive read: 60 per minute per user, so a full deck in both themes is about three minutes of thumbnail calls and must be paced with backoff on 429.

### 1.4 What has no equivalent

- Letter spacing: no field on TextStyle or ParagraphStyle. Headings at -0.025 em run about 2.5 percent wider; copy the browser's line breaks as hard breaks and give the box slack, or rasterize headings (report 04, section 8).
- Exact line pitch: `lineSpacing` is a percentage of the font's normal pitch, so 33 px at 22 px is expressed as 124 percent of an undocumented "normal"; calibrate once per font build.
- Text inset: no field; measure the default and compensate.
- Page size after creation: `pageSize` is ignored by `create` and untouched by every request; the only route to another size is a Drive import of a PPTX, unverified.
- Image crop, transparency, brightness, contrast and recolor: read only; pre-composite everything and use PNG alpha.
- SVG and custom geometry: no vector import and no custom shape path; diagrams, the GT mark and icons go as PNG.
- OpenType features (`cv11`, `ss01`), variable font axes, `text-wrap: balance`, gradients, shaders and canvases: none.
- Fonts: Inter comes from Google Fonts inside Slides, so nothing is embedded or installed, but which Inter build Slides serves and whether the `opsz` axis applies is undocumented (report 04, section 4.4).

### 1.5 Credentials on this machine

Checked without printing any secret values.

- `gcloud` and `gsutil`: not installed (`which` finds nothing). `~/.config/gcloud` does not exist, so there are no application default credentials and no gcloud account.
- `gws` (Google Workspace CLI): not installed; `~/.config/gws` and `~/.gws` do not exist.
- Environment: no variable matching `GOOGLE`, `GCLOUD` or `GCP` is set in the shell (`GOOGLE_APPLICATION_CREDENTIALS` included).
- Files: a search of `~` to depth 3 for `client_secret*.json`, `service-account*.json` and `application_default_credentials.json` found nothing. `~/Library/Application Support/Google` exists, but that is the Chrome browser profile directory, not API credentials.
- Consequence: no live Slides call could be made in this experiment. Before the first live test someone must create or pick a Google Cloud project, enable the Slides API, configure the consent screen (Internal, for the GT workspace), create a Desktop OAuth client, and download `credentials.json` into a path Turboslide reads (quickstart steps above). This is open question 1 in the research brief.

## 2. Headless rendering

### 2.1 How shoot-slide.mjs renders a slide

`/Users/kevinliu/repos/Prototemplate/deck/shoot-slide.mjs` (64 lines):

1. Lines 10 to 11: resolves `playwright-core` through `createRequire` from a gt-cloud worktree's `apps/redesign/package.json` (version 1.62.0 today), so the deck has no dependency of its own.
2. Lines 16 to 21: assembles `parts/head.html` plus every `slides/NN-*.html` in name order plus `parts/tail.html`, inlines `fonts/deck-fonts.css` (one base64 InterVariable woff2) in place of `<!--FONTS-->`, and strips the source's leading `<title>`. Line 26 wraps it in a document with `color-scheme: light dark` and writes it to `deck/tmp/preview-<slides>-<pid>.html`, so images resolve as relative `shots/...` paths. My copy (`EXP/render-timing.mjs`) writes the file to `EXP/out` and rewrites every `"shots/` reference to an absolute `file://` URL instead, so the repo stays untouched; the assembled document is 792 KB and the assembly step costs 18 ms.
3. Line 28: launches Chrome for Testing from a hard-coded path in the Playwright cache (`chromium-1217`, version 147.0.7727.15), headless, with no GPU flags.
4. Lines 30 to 42: one browser context per theme with `viewport 1600x900`, `colorScheme`, `deviceScaleFactor: 1`, `reducedMotion: 'reduce'`; an init script seeds `localStorage` keys `gt-theme` and `gt-deck-theme` because the viewer boots dark unless a theme is stored and never consults `prefers-color-scheme`; page errors and console errors are collected; `goto file://...#<first slide>` with `waitUntil: 'load'`; a 500 ms wait; `data-theme` set on the root; the `p` key enters present mode so the sheet fills the viewport exactly; a 250 ms wait.
5. Lines 43 to 58: for each slide, set `location.hash`, wait 220 ms, run the overflow check (any element inside `#stage .slide.is-on` whose bounding rect leaves the 1600 by 900 sheet, first six reported), and `page.screenshot` as JPEG quality 82 to `preview/sNN-<theme>.jpg`.

### 2.2 Measured timings

Script: `EXP/render-timing.mjs`; raw results in `EXP/out/render-timing.json`, `render-timing-gpu.json`, `render-timing-all.json`. Dark theme, Chrome for Testing 147, warm disk. Fonts report `document.fonts.status === 'loaded'` 11 to 16 ms after load because the woff2 is inlined.

One-time costs.

| Step | Time |
| --- | --- |
| Assemble 85 slides and inline fonts | 18 ms |
| `chromium.launch` | 742 to 1,658 ms across six launches (median about 1.0 s) |
| `newContext` plus `newPage` plus init script | 1,464 to 1,530 ms |
| `goto` of the 792 KB document, `load` | 355 to 570 ms |
| `document.fonts.ready` | 11 to 16 ms |
| Fixed waits in the script before the first slide | 750 ms |

Per slide, two slides (01 opener with a full-bleed dithered image, 26 the live dither canvas).

| Scale | Slide | Hash nav plus 220 ms settle | PNG screenshot | PNG bytes | JPEG q82 screenshot | JPEG bytes | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1x (1600 by 900) | 01 | 223 ms | 229 ms (111 ms on the second run) | 164 KB | 36 ms | 497 KB | 489 ms |
| 1x | 26 | 278 ms | 37 ms | 81 KB | 26 ms | 173 KB | 341 ms |
| 2x (3200 by 1800) | 01 | 223 ms | 426 ms (478 ms second run) | 540 KB | 121 ms | 1,174 KB | 771 ms |
| 2x | 26 | 320 ms | 133 ms (203 ms second run) | 182 KB | 110 ms | 439 KB | 563 ms |

Whole deck at 1x, dark, JPEG only: 85 slides in 28.0 s, 330 ms per slide average, 31.8 s wall including launch, 13.1 MB of JPEGs, zero page errors. Distribution per slide: total p50 321 ms, p90 376 ms, max 446 ms (`41-horizon.html`); JPEG screenshot p50 28 ms, p90 66 ms, max 135 ms (slide 41); ten slides take over 60 ms to encode, all with large photographs or detail crops (38, 39, 40, 41, 43, 45, 46, 49, 51, 66). Hash navigation plus the fixed settle is p50 288 ms because `location.hash` and the viewer's own work run before the 220 ms timer starts.

Reading of the numbers.

- The fixed 220 ms settle is two thirds of the per-slide cost at 1x. Replacing it with a readiness signal (fonts ready, every visible `img` decoded, two animation frames) is the largest available speedup for a render server; the deck's only motion is a 140 ms cut, already disabled by `reducedMotion`.
- The screenshot itself is 25 to 40 ms at 1x for text slides and 100 to 230 ms when a full-bleed picture must be composited; at 2x it is 110 to 480 ms. PNG encode inside Chromium is the visible cost at 2x; JPEG is cheaper but is not a valid export raster for two-tone images.
- Extrapolation for an export job: 85 slides, both themes, 2x PNG, about 85 by 2 by 0.67 s = 114 s of sequential Chromium time plus 3 s of setup; running the two themes in two pages of one browser halves the wall time. This is the number the systems-level section is measured against.
- The GPU flags `--use-gl=angle --use-angle=metal --ignore-gpu-blocklist` change nothing for the deck (it has no WebGL): launch 952 ms, per-slide totals 389 to 847 ms, within run-to-run noise.

### 2.3 WebGL headless

Script: `EXP/webgl-headless.mjs` (three launch configurations, dsf 1 and 2, a 120-draw queued loop, a 30-frame loop synchronized by a 1 by 1 `readPixels` after every draw, a full readback and a screenshot) and `EXP/webgl-shell.mjs` (the same probe against Playwright's default headless shell). The shader is an 8-octave value-noise field with a radial mask, compiled as WebGL2 with `preserveDrawingBuffer: true`. Results in `EXP/out/webgl-headless.json` and the console output recorded in this run.

| Binary | Flags | Renderer string | Frame at 1600 by 900 | Frame at 3200 by 1800 | Full readback at 2x | Canvas screenshot at 2x | Lit fraction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Chrome for Testing 147 (full browser, new headless) | none | ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max) | 0.67 ms | 1.41 ms | 13.6 ms | 170 ms | 0.048 |
| Chrome for Testing 147 | `--use-gl=angle --use-angle=metal --ignore-gpu-blocklist` | same Metal renderer | 0.82 ms | 1.30 ms | 11.7 ms | 185 ms | 0.048 |
| Chrome for Testing 147 | `--use-gl=angle --use-angle=swiftshader --ignore-gpu-blocklist` | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0))) | 5.25 ms | 24.8 ms | 113.7 ms | 248 ms | 0.085 |
| Playwright default headless shell (Chromium 151.0.7922.34) | none | SwiftShader | 6.51 ms | not run | | | 0.085 |
| Playwright default headless shell | `--use-gl=angle --use-angle=metal --ignore-gpu-blocklist` | ANGLE Metal, Apple M5 Max | 0.86 ms | not run | | | 0.048 |

Findings.

- WebGL2 renders headless on the Mac's GPU. With the full Chrome for Testing binary (the "new" unified headless mode, https://developer.chrome.com/docs/chromium/new-headless) Metal is chosen without any flag. With Playwright's default `chromium_headless_shell` (the old headless implementation that Playwright ships separately for headless runs, https://playwright.dev/docs/browsers) the default is SwiftShader, and the three flags switch it to Metal. That is why the deck's shader captures carried the flags, and Turboslide's render server should pass them always and pin the full browser binary, since the flags are harmless where Metal is already the default.
- Metal and SwiftShader do not produce the same pixels for the same shader: 4.8 percent versus 8.5 percent of pixels lit, and different center pixels. `sin`-based hashes and 8-octave noise are precision sensitive. Any shader frame that reaches an export must therefore be captured once, stored as a PNG with its recipe key, and reused; regenerating it on a CI box without a GPU would change the image. This is the same conclusion Glyphfield's `captureShaderFrames.ts` and `docs/shader-frame-contract.md` reach ("The live shader is an engine-rendered animation, not a flipbook of saved images" applies to the viewer; exports are the frozen frame).
- Cost: a 3200 by 1800 frame of a heavy fragment shader is 1.3 ms on Metal, so settle time, not GPU time, decides capture duration; SwiftShader at 24.8 ms per frame is still usable for correctness tests. A 2x screenshot of a WebGL canvas is 170 to 250 ms, in line with the deck's 2x PNG screenshots.
- `navigator.gpu` is absent in every configuration (no WebGPU in headless here). Paper Shaders itself was not exercised: the deck has no live WebGL, and `@paper-design/shaders-react` lives only in Glyphfield's `node_modules`; the probe used raw WebGL2, which is what Paper Shaders compiles to.

### 2.4 How the deck captured shader frames

From `/Users/kevinliu/repos/Prototemplate/deck/shots/OPENERS.md`, sections "Shader pipeline", "Blog and content", "Developer experience", "Prototemplate and Glyphfield" and "Status and plan":

- Round five sources were 1600 by 900 Playwright captures of Prototemplate directions at `/d/<slug>?chrome=0`. Round six and ten sources were 3200 by 1800: a 1600 by 900 viewport at `deviceScaleFactor: 2` in Chromium launched with `--use-gl=angle --use-angle=metal --ignore-gpu-blocklist`, against Glyphfield's `/shader-preview?materialId=<id>&diagnostics=1&live=1` on its dev server (port 3012) or the Prototemplate 404 route on port 3005.
- Glyphfield's preview route caps the canvas at 360,000 pixels and, under an emulated scale factor, Paper's ResizeObserver sizes the canvas at 1x. The capture script therefore reached into the `paperShaderMount` handle after the canvas reported ready: cleared `devicePixelsSupported`, called `setMinPixelRatio(2)` and `setMaxPixelCount(3200 * 1800 + 1)`, verified the drawing buffer at 3200 by 1800 with `u_pixelRatio` 2, and pushed the brand palette or the preset colors through `setUniforms` because the route paints a violet preview palette for every preset. Every uniform of the liquid metal opener is recorded (`u_colorBack`, `u_colorTint`, `u_softness`, `u_shiftRed`, `u_shiftBlue`, `u_contour`, `u_repetition`, `u_distortion`, `u_offsetX`, `u_offsetY`, `u_scale`, `u_shape 3`).
- Frames were three element screenshots of the canvas at about 4, 5.5 and 7 seconds of playback; one was chosen by eye for where its highlight fell relative to the plate. Color openers were saved as 1600 by 900 JPEG quality 92 with 4:4:4 chroma from the 3200 by 1800 PNG (Lanczos), the light file a byte copy. Two-tone openers went through the Pillow pipeline: crop a text-free box (boxes in device pixels for 2x sources, allowed to reach past the source where the ground is black), resize to cover 800 by 450 with Lanczos, grayscale (invert first for light renders), autocontrast at 0.5 percent, optional black point, gamma, 8 by 8 Bayer at thresholds (m + 0.5) / 64, 2x nearest to 1600 by 900, save the dark file and the inverted light file, JPEG quality 95 from the two-color PNGs so every cell survives on its side of the threshold.
- Glyphfield's own capture checks (`scripts/check-shader-frames.mjs`) drive a browser through the `agent-browser` CLI with a named session and a CDP socket for `Page.bringToFront`, not through Playwright; its `playwright.config.ts` adds only `--enable-gpu` when `GLYPHFIELD_BROWSER_NATIVE_GPU=1`. Neither the Prototemplate nor the Glyphfield checked-in scripts carry the Metal flags; those live in the scratchpad scripts OPENERS.md names (`openers-60-79/glyphfield/hi/render.mjs`).

### 2.5 Two observations from the 2x crops

`EXP/out/view-s26-2x-crop-lowerleft.png` and `EXP/out/view-s01-2x-crop-plate.png` are 1600 by 900 device-pixel crops of the 3200 by 1800 screenshots.

- Slide 26's live dither canvas is crisp at 2x: the viewer draws one cell per canvas pixel at half CSS size and upscales with `image-rendering: pixelated`, so at dsf 2 each cell is a clean 4 by 4 device pixel square. A 2x PNG of the canvas box is a valid export raster.
- Slide 1's opener is a 1600 by 900 JPEG with 2 px cells, and at dsf 2 the browser bilinear-upscales it, so each cell becomes a soft 4 by 4 square with rounded corners. A 2x export raster taken from the page is therefore softer than the 1x web view. For 2x exports the two-tone images must be produced at 2x from the pipeline (the 800 by 450 one-bit image scaled 4x nearest, or a 3200 by 1800 PNG twin stored next to the 1600 by 900 one), not screenshotted from the 1x asset. This is a concrete form of report 04's risk 7.

## 3. The systems-level path

### 3.1 What was measured

Source image: `EXP/out/s01-dark-2x.png`, the 3200 by 1800 screenshot of slide 1 (540 KB). Second image for diffs: `EXP/out/s26-dark-2x.png`. Four implementations of the OPENERS.md pipeline, each timed per phase and run twice (second, warm run reported; raw JSON per implementation in `EXP/out/dither/`):

- `EXP/bench/dither-sharp.mjs`: sharp 0.35.0 (libvips 8.18.3, prebuilt darwin-arm64, installed by `pnpm install` in 1.1 s with no compiler), pixelmatch 7.1.0.
- `EXP/bench/dither-pillow.py`: Pillow 12.3.0 mirroring `scratchpad/rosetta/make.py` step for step, plus a numpy variant.
- `EXP/bench/go/dither.go`: Go 1.26 standard library only (no Lanczos in the stdlib, so a box filter stands in for the 800 by 450 resize).
- `EXP/bench/rs`: Rust with the `image` 0.25 and `png` 0.17 crates, release build with thin LTO (built in 10 s).
- `EXP/bench/png1bit.mjs`: a pure Node 1-bit PNG encoder (bit packing plus `zlib.deflateSync` plus CRC chunks) and the zip cost.

Pipeline A is the recipe as written: decode, grayscale, cover 800 by 450, autocontrast at 0.5 percent, tone LUT (black 20, white 235, gamma 1.0), Bayer, 2x nearest to 1600 by 900, two-color PNG. Pipeline B dithers at the full 3200 by 1800, the 2x export raster case. C is the cost of encoding the 3200 by 1800 RGBA screenshot. D is the diff.

### 3.2 Results (milliseconds, warm)

| Phase | sharp (libvips) | Pillow | Go stdlib | Rust (image, png) | Pure Node |
| --- | --- | --- | --- | --- | --- |
| Decode 3200 by 1800 PNG | about 40 (inside the 67.8 fused stage) | 51.7 | 65.3 | 50.1 | |
| Grayscale | fused | 2.3 | 7.6 | 4.8 | |
| Resize to 800 by 450 | fused (Lanczos3) | 9.9 (Lanczos) | 3.8 (box) | 48.3 (Lanczos3) | |
| Decode plus gray plus resize plus autocontrast | 67.8 | | | | |
| Bayer at 800 by 450 | 2.2 (JS loop) | 0.3 | 0.4 | 0.3 | |
| Nearest 2x plus two-color PNG 1600 by 900 | 55.0 (palette path) | 0.7 plus 13.4 | 1.2 plus 9.2 | 0.9 plus 4.9 | |
| Pipeline A total | 125 | 85 | 15 | 55 | |
| Full-res autocontrast plus tone | fused with decode, 77.8 | 16.3 | 11.8 | 14.0 | |
| Full-res Bayer 3200 by 1800 | 8.7 (JS loop) | 4.9 (ImageChops), 1.4 (numpy) | 6.9 | 5.4 | |
| Full-res two-color PNG | 218.8 (palette, level 9); 194.7 (level 1); 95.8 (palette, effort 1); 19.2 as 8-bit gray (107 KB) | 65.9 (mode 1, optimize); 40.0 via numpy path | 39.7 (paletted) | 14.8 (1-bit gray) | 12.2 (level 6, 30.6 KB); 9.2 (level 1); 50.1 (level 9) |
| `make.py` threshold map by tile paste at full res | | 95.8 | | | |
| RGBA PNG encode 3200 by 1800, default level | 51.7 (545 KB) | | 225.4 (543 KB) | 171.6 (565 KB) | |
| RGBA PNG encode, fastest level | 27.7 (1.9 MB) | | 152.9 (830 KB) | 29.8 (9.5 MB, store-like) | |
| JPEG q88 4:4:4 | 54.1 (1.41 MB) | | | | |
| WebP lossless | 1,549 (176 KB) | | | | |
| Exact RGB diff loop, 5.76 Mpx | 9.9 | | 11.6 | 6.1 | |
| pixelmatch, identical pair | 30.7 | | | | |
| pixelmatch, fully different pair (2.03 M mismatches) | 328.8 | | | | |
| Deflate a 540 KB PNG at level 6 (ratio 0.934) | | | | | 11.0 |
| Zip 34 MB of media (85 JPEG, 4 PNG), `zip -0` / `zip -6` | | | | | 90 / 350 (CLI) |

Whole-process wall time for pipeline A plus B (cold start included): Pillow 0.47 s, Go 0.6 s, Rust 0.39 s; the sharp script is not comparable because it also runs the WebP, JPEG and pixelmatch phases (2.7 s, of which 1.5 s is WebP lossless).

### 3.3 Where the time goes

- PNG decode dominates every per-image operation: 40 to 65 ms for a 3200 by 1800 screenshot in all four runtimes. The way to remove it is architectural, not linguistic: Playwright's `page.screenshot()` returns a Buffer, and a render server should decode it once (or request raw pixels once) and hand the same buffer to dither, diff and encode.
- The Bayer dither is not a bottleneck anywhere: 5 to 9 ms at 5.76 Mpx in a plain JavaScript loop, 5 to 7 ms in Go and Rust. The 800 by 450 case is under 3 ms everywhere. `make.py`'s threshold map, built by pasting an 8 by 8 tile 90,000 times, costs 96 ms at full resolution and 6 ms at 800 by 450; numpy's `tile` does the same in 1 ms. That is a Python inefficiency, not a language wall.
- Encoding is where the libraries differ. libvips through sharp is the fastest RGBA PNG encoder of the four at default compression (52 ms for 545 KB) and beats Rust's `png` crate (172 ms) and Go's `image/png` (225 ms) by three to four times; Chromium's own PNG encode inside `page.screenshot` at 2x is 130 to 480 ms, so re-encoding through sharp from raw pixels would be faster than asking Chromium for PNG. For two-color output sharp is the slowest option because `palette: true` runs a quantizer (219 ms; 96 ms at `effort: 1`), while the 60-line pure Node encoder writes a 1-bit PNG in 12 ms with the smallest file of the group (30.6 KB against 28.4 KB for sharp's, 30.1 KB Pillow, 30.4 KB Go, 34.2 KB Rust) and round-trips with zero mismatched cells. Turboslide does not need Pillow, a subprocess or a native addon to write the two-color PNGs `build-deck.mjs` currently shells out for.
- Diffing: an exact per-pixel loop is 6 to 12 ms in every runtime. pixelmatch's perceptual diff with antialiasing detection costs 31 ms when images match (the common case in a render-and-compare loop) and 329 ms when they are fully different. 170 worst-case pairs are 56 s single-threaded in Node or about 4 s spread over the machine's cores with `worker_threads`; 170 identical pairs are 5 s single-threaded. Decode, again, adds 2 by 45 ms per pair unless raw buffers are kept.
- PPTX assembly: PNG and JPEG media parts do not compress (deflate ratio 0.934 on a PNG), so a PPTX writer should store media parts and deflate only the XML. The zip CLI packs 34 MB of media in 0.09 s stored or 0.35 s deflated; Node's `zlib` deflates one 540 KB part in 11 ms, about 1.9 s for 170 parts, all avoidable with store mode. pptxgenjs and the OOXML post-processing step from report 04 are XML work, not throughput work.
- The bottleneck of the whole export is Chromium: about 110 s of sequential rendering for 85 slides in two themes at 2x, against about 4 s of dither and encode in Node and a few seconds of diffing. Rust or Go cannot move that number; a second browser page per theme and a readiness signal instead of the 220 ms settle can.

### 3.4 Determinism across implementations

`EXP/bench/compare.mjs` compared the outputs cell by cell.

| Pair | Size | Mismatched cells | Fraction |
| --- | --- | --- | --- |
| sharp A vs Pillow A (Lanczos in libvips vs Pillow) | 1600 by 900 | 124 | 0.0001 |
| sharp A vs Rust A | 1600 by 900 | 116 | 0.0001 |
| Pillow A vs Rust A | 1600 by 900 | 16 | 0.0000 |
| sharp A vs Go A (box filter) | 1600 by 900 | 560 | 0.0004 |
| sharp B vs Pillow B (no resample) | 3200 by 1800 | 2 | 0.0000 |
| sharp B vs Rust B | 3200 by 1800 | 2 | 0.0000 |
| Pillow B vs Rust B | 3200 by 1800 | 0 | 0 |
| Pillow B vs Go B (integer luma) | 3200 by 1800 | 249 | 0.0000 |
| Pillow B (ImageChops) vs Pillow B2 (numpy) | 3200 by 1800 | 0 | 0 |

All four implementations light 20.66 to 20.69 percent of cells. The dither and tone stages are exactly reproducible across languages when the arithmetic is specified (Pillow and Rust agree to the bit at full resolution); the resampler and the grayscale conversion are the sources of drift (sharp's `b-w` colourspace differs from the 299/587/114 luma in two pixels; three Lanczos implementations disagree on about 120 cells of 1.44 million). The design consequence: the dither must be one specified algorithm with one pinned resampler, and any place that renders it (the editor's live preview in the browser, the CLI, the export service) must run the same code. That is the only argument here for Rust: one crate compiled to a napi-rs addon for Node and to WebAssembly for the browser gives bit identity between the preview a designer approves and the file the exporter writes. JavaScript can also achieve it (one TypeScript module for both, with a hand-written Lanczos), and at these sizes it would run in under 30 ms.

### 3.5 Integration shapes

- napi-rs (Rust, in process): `napi new`, `napi build --release`, prebuilt binaries published as per-platform npm packages selected through `optionalDependencies` with `os`, `cpu` and `libc` fields; the CLI requires Node `^20.17.0 || ^22.13.0 || >=23.5.0` (this machine runs 24.13.0). https://napi.rs/docs/introduction/getting-started. The same crate compiles to wasm for the browser. Cost: a Rust toolchain in CI for every platform matrix entry, ABI pinning, and a fallback path when the prebuilt is missing.
- Go binary over stdio (out of process): a single static binary, trivial cross-compilation, JSON lines for control and files or shared memory for pixels; a 3200 by 1800 RGBA frame is 23 MB, so piping frames costs several milliseconds each and a file handoff is simpler. Go's own PNG encoder is the slowest of the four, so a Go sidecar would need a cgo libvips or libpng binding to beat sharp, which removes the single-binary advantage. Go pays off only when a standalone tool must run where Node is not installed, for example a LibreOffice and PPTX verification runner on a CI image.
- Node plus sharp (in process, today): sharp installs in 1.1 s from prebuilt binaries, exposes libvips' resize kernels (`nearest`, `lanczos3`), `normalise({lower, upper})`, `greyscale`, `threshold` and `linear` (https://sharp.pixelplumbing.com/api-operation; no ordered dither exists, which is why the Bayer stage is a JavaScript loop over `raw()` buffers), and `concurrency()` reports 6 threads here.

### 3.6 Recommendation

1. Build the render and export pipeline in TypeScript on Node with sharp for decode, resize, RGBA PNG and JPEG, a pure Node 1-bit PNG encoder for two-color images, a plain-loop exact diff plus pixelmatch for perceptual diffs, and `worker_threads` for the 170-image passes. The measured CPU cost is about 4 s per full 2x export against 110 s of Chromium, so the language choice is invisible in wall time.
2. Keep the Chromium stage as the optimization target: pass `--use-gl=angle --use-angle=metal --ignore-gpu-blocklist`, pin the full Chrome for Testing binary rather than the headless shell, replace the 220 ms settle with a readiness signal, run both themes in parallel pages, decode each screenshot once and reuse the buffer, and store shader frames as content-addressed PNGs with their recipe key because Metal and SwiftShader disagree on pixels.
3. Reserve the systems-level slot for one Rust crate (`turboslide-native`) holding the specified resampler, the Bayer dither and the diff, compiled through napi-rs for the server and to wasm for the editor, and adopt it when the editor's live dither preview must match the exporter bit for bit or when profiling shows the Node loops on the critical path. Until then a single TypeScript module used by both browser and server gives the same guarantee at these image sizes.
4. Use Go only if a standalone sidecar without Node is wanted for verification (LibreOffice conversion, PPTX geometry checks) on CI images.
5. Zig is not installed and was not evaluated.

## 4. Files produced

Under `EXP/`:

- `render-timing.mjs`: the deck render probe (default two slides at 1x and 2x; `all` for 85 slides; `GPU=1` for the Metal flags). Outputs `out/render-timing.json`, `out/render-timing-gpu.json`, `out/render-timing-all.json`, `out/sNN-dark-{1x,2x}.{png,jpg}`.
- `webgl-headless.mjs` and `webgl-shell.mjs`: the WebGL2 probes. Outputs `out/webgl-headless.json`, `out/webgl-<config>-<dsf>x.png`.
- `bench/package.json`, `bench/dither-sharp.mjs`, `bench/dither-pillow.py`, `bench/go/dither.go` (binary `bench/go/dither`), `bench/rs/` (binary `bench/rs/target/release/dither-rs`), `bench/png1bit.mjs`, `bench/compare.mjs`. Outputs in `out/dither/`: `dither-{sharp,pillow,go,rs}.json`, `png1bit.json`, the dithered PNGs per implementation, `sharp-D-diff.png`.
- `out/view-s26-2x-crop-lowerleft.png`, `out/view-s01-2x-crop-plate.png`, `out/view-s26-2x-down.png`: the 2x inspection crops.

## 5. Claims not verified here

- No Google Slides call was made (no credentials on this machine); the request JSON follows the reference and samples but has not been submitted. Items to confirm in the first live run: zero-height lines, the default text box inset, the "normal" line pitch Slides uses for Inter, the minimum rendered line weight at 0.45 pt, `pageSize` read back from a new presentation, and whether one batchUpdate counts as one write against the quota.
- The Paper Shaders library was not run headless; the WebGL probe used raw WebGL2.
- The whole-deck 2x and both-theme figures are extrapolated from the two-slide 2x run and the 85-slide 1x run, not measured end to end.
- The Go pipeline used a box filter, not Lanczos, for the 800 by 450 resize, which explains its larger output difference; its dither and encode numbers stand.

## 6. Sources

Google (official): https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/request, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/create, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/batchUpdate, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/getThumbnail, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/text, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/shapes, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/lines, https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/other, https://developers.google.com/workspace/slides/api/limits, https://developers.google.com/workspace/slides/api/scopes, https://developers.google.com/workspace/slides/api/guides/add-image, https://developers.google.com/workspace/slides/api/guides/styling, https://developers.google.com/workspace/slides/api/guides/transform, https://developers.google.com/workspace/slides/api/samples/slides, https://developers.google.com/workspace/slides/api/samples/elements, https://developers.google.com/workspace/slides/api/quickstart/nodejs, https://developers.google.com/workspace/drive/api/guides/manage-uploads, https://slides.googleapis.com/$discovery/rest?version=v1, https://developers.google.com/resources/api-libraries/documentation/slides/v1/java/latest/com/google/api/services/slides/v1/model/StretchedPictureFill.html, https://developers.google.com/resources/api-libraries/documentation/slides/v1/java/latest/com/google/api/services/slides/v1/model/LineProperties.html.

Third party on the default page size: https://www.bentumbleson.com/experiments-with-the-google-slides-api-to-recreate-slides/.

Browsers and tooling: https://developer.chrome.com/docs/chromium/new-headless, https://playwright.dev/docs/browsers, https://sharp.pixelplumbing.com/api-operation, https://napi.rs/docs/introduction/getting-started, https://github.com/mapbox/pixelmatch.

Local (read only): `/Users/kevinliu/repos/Prototemplate/deck/shoot-slide.mjs`, `/Users/kevinliu/repos/Prototemplate/deck/shots/OPENERS.md`, `/Users/kevinliu/repos/Prototemplate/scripts/build-deck.mjs`, `/Users/kevinliu/repos/Prototemplate/scripts/capture-pages.mjs`, `/Users/kevinliu/repos/glyphfield/scripts/check-shader-frames.mjs`, `/Users/kevinliu/repos/glyphfield/playwright.config.ts`, `/Users/kevinliu/repos/glyphfield/docs/shader-frame-contract.md`, the research reports 00 and 04 in `scratchpad/slides-editor/research/`, and `scratchpad/rosetta/make.py`.
