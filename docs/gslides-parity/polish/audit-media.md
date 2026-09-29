# Polish round audit: pictures, logos and shaders

Auditor: the "Pictures, logos and shaders" lane of the polish round, 2026-09-28. Google Slides is
the parity reference. The measure is the screen: every step below was driven at human speed with
Playwright scripts (playwright-core 1.62.1 from the worktree, headless Chromium, 1440 by 900 and
1280 by 800, deviceScaleFactor 2, the mouse moved in steps, 40 to 90 ms per key, real double
clicks and drags), and every screenshot was looked at. Nothing was fixed.

Scripts: `/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/polish/media/`
(`lib.mjs`, `a-pictures.mjs`, `a2-pictures.mjs`, `a3-pictures.mjs`, `a4-svg.mjs`,
`a5-svg-upload.mjs`, `b-logos.mjs`, `b2-logos.mjs`, `c-shaders.mjs`, `c2-shaders.mjs`,
`c0-probe.mjs`, `c0-origins.mjs`, `d-brand.mjs`, `d2-footer.mjs`; the `*.out` and `*.log.json`
files are the runs' readings). Screenshots: `docs/gslides-parity/polish/audit-media/` (172 files
from https://www.turboslide.com) and `docs/gslides-parity/polish/audit-media/current/` (121 files
from https://turboslide.vercel.app, see section 1). Every scratch deck was created from `/new`,
moved to the trash through File > Move to trash, deleted forever on `/decks/trash`, and read as
404 on `/edit/<id>` before the script returned (the deck ids are in the `.out` files). Nothing
else on the Blob store was touched.

## 1. The deployment behind www.turboslide.com is not the tree of 877eb690

The first thing a person driving this area meets is not a feature defect. The Insert menu on
https://www.turboslide.com has no Shader row, in the default view or with Tools > Advanced tools
on; with the switch on it lists `insert.material` ("Material"), the row 5143db31 (features round
ship two, 2026-09-25) renamed to `insert.shader` (`c-01-gallery-failed.png`,
`c-01-insert-menu-for-shader.png`, `c0-probe.mjs` readings). The same page refuses every SVG
with the features round sentence "SVG files are not accepted yet. Export the logo as a PNG and
upload that" (`a3-04-svg-upload-300ms.png`; the window `asset.add` answers "svg is not accepted
here; send png, jpeg, webp or gif", `a4-svg.mjs`), hides Format > Image > Mask image behind the
switch (`a2-03-format-image-hover-1200ms.png`, `a3-15-format-image-advanced.png`), draws the
mask picker as eighty identical squares (`a3-12-mask-panel-open.png`) and draws a rotated
picture's ring from its axis aligned bounds rotated again (`a-43-rotate-released.png`,
`a2-24-rotate-B-released.png`). `git show 877eb690:packages/chrome/src/menus/model.ts` carries
no `insert.material`; https://turboslide-gt.vercel.app answers the same rows as www; only
https://turboslide.vercel.app (Kevin's project, the same main) lists `insert.shader` in the
default view (`c0-origins.mjs`). `/api/agent` names no build, so the page cannot say which
commit it serves.

So the tables below hold two kinds of rows. Rows read on www.turboslide.com and on
turboslide.vercel.app alike are the product's; rows read on www alone are the old build's and
leave with a redeploy, listed in section 4 for the record. Where a step could only be driven on
turboslide.vercel.app (the shader library), the evidence path is under `current/`.

## 2. The table

Sorted by severity (3: a seller would call it broken or jank; 2: a seller notices; 1: a person
who looks closely notices), then effort (1 to 5).

| # | Title | Today | Google | Fix | Severity | Effort | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | www.turboslide.com serves a build older than 2026-09-25 | Insert has no Shader row (Material under Advanced tools), Mask image is hidden, every SVG is refused, the rotated ring is wrong; the whole features ship two, vector and objects rounds are missing for the seller on the domain Archie added on 2026-09-25 | Google serves one build on its domain | Redeploy the `turboslide-gt` project from main (877eb690) and check the domain, not the personal project; put the build commit in `/api/agent` `instance` (`apps/studio/src/routes/api/agent.ts`) so a probe and a person can read which commit a domain serves; the hosted smoke should read that field against `git rev-parse HEAD` | 3 | 1 | `c-01-gallery-failed.png`, `c-01-insert-menu-for-shader.png`, `a3-04-svg-upload-300ms.png`, `a2-03-format-image-hover-1200ms.png`, `c0-origins.mjs` output in `c-shaders.out` and this file's section 1 |
| 2 | A shader's resting frame never lands when its PNG is large, and nothing says so | God rays at 727 by 412: the frame write through the server function answers 413 four times, `onError` only console.warns; the filmstrip card, the show, the PDF and the PowerPoint draw a grey plate where the shader is | Google has no shaders; a picture Google cannot save says so | Wire the `upload` and `uploadAbove` deps of `createShaderFrameCapturer` (`packages/viewer/src/shader-frame.ts` 205 to 215, the presign path the picture intake uses) in `apps/studio/src/editor/controller.tsx` 4325 to 4370, or capture the still as WebP at 1x; show a sentence on a failed frame and retry once; the gate row `shaders.export.missing-frame-row` should read this case | 3 | 3 | `current/c2-12-card-after-resize-4s.png`, `current/c2-13-present-3s.png`, `current/c2-export-pptx-slide-2.png`, `current/c2-export-pdf-page-2.png`, `c2-shaders.out` (the four 413 lines) |
| 3 | Every picture insert raises "Revision rN arrived from outside this editor and is shown. Reload" | Upload, By URL and paste each end with the banner at the bottom, beside the snackbar when there is one; it stays for minutes | Nothing; the picture is on the slide | The tab's own `asset.add` reload must acknowledge the answered revision: `apps/studio/src/editor/controller.tsx` 3160 to 3180 (`settleOwnWrite`; the comment says asset.add's answer carries no revision, so the reload lands one above what the tab acknowledged) and `EditorRoot.tsx` 2276; return the revision from the asset write and acknowledge it before the reload | 3 | 2 | `a-05-upload-landed.png`, `a-15-by-url-landed.png`, `a-17-paste-landed.png`, `a-18-drop-250ms.png` (beside the snackbar), `a2-05-replace-A-landed.png`; `current/a2-01-upload-A-landed.png` (bannerAfterUpload true) |
| 4 | Replace image > Logo and Replace image > By URL stretch the new picture into the old box | The Stripe wordmark replaces the Figma symbol and is squeezed into 108 by 160 (`object-fit: fill`) | Replace image keeps the box and crops the new picture to it; the picture is never distorted | `packages/render/src/block-css.ts` 272 (`.free > .shot-fig > img.shot { object-fit: fill }`) and the replacing branch of `insertPictureFile` in `packages/viewer/src/Editor.tsx` (4340 to 4400): keep the box's centre and area, refit the box to the new aspect, or keep the box with a cover crop written as `trim` | 3 | 2 | `b2-03-replace-logo-done.png`, `current/b2-03-replace-logo-done.png` |
| 5 | A logo draws on a grey plate with a hairline | Figma, Stripe, Vercel and GitHub marks and the uploaded acme SVG all sit in a light grey box with a 1 px edge on the white slide (a dark grey box on the dark deck) | A picture with transparency shows the slide through it | `packages/theme/src/gt-ink-paper/sheet.css` 396 to 402 (`.ts-sheet .shot { border: 1px solid var(--hair); background: var(--plate) }`) applies to every uploaded picture; keep the plate and edge for the GT deck's screenshot block only (`role: capture` from the brand deck) and draw a free object's `img.shot` with no plate and no border | 3 | 1 | `b-08-figma-inserted.png`, `b-12-every-slide-inserted.png`, `b-21-dark-vercel-inserted.png`, `b2-09-dark-github-inserted.png`, `current/a3-15-mask-panel-open.png` (the three SVG logos) |
| 6 | The Logo dialog hides its results, its empty state and its Upload button below the fold | With Your brand and Recent holding tiles, Results sits at y 589 under a 348 px box ending at 566; "No logo named zzzqqqxx" and Upload are below the fold too; the dialog grows from 525 to 727 px when results arrive; the last row's titles are clipped (scrollHeight 371 in a 348 box) | A picker keeps its size, shows what you searched for first, and never clips a label | `packages/chrome/src/dialogs/Logo.tsx` (the groups order, `dialog.logo.groups` scroll box) and `Logo.css`: results first when a query is typed (or scroll the group into view), a fixed dialog height from open, bottom padding for the last row's title | 3 | 2 | `b-18-dark-search-figma.png`, `b-09-empty-state.png`, `b-10-search-own-brand.png`, `b-04-search-figma.png`, `b-05-search-figma-tiles-zoom.png`, `b2-logos.out` (g0, g1, g2) |
| 7 | The Image options panel is the block's generated inspector, in the wrong words, with duplicated controls | "Asset 13-editor-light", "neutral", "Role capture, 2880 by 1800 at 1x, resample-1280", "Fit width fit", "Aspect none", "Crop anchor top center", "Caption size 16 15", "Width none − +", "Border off" beside "Frame Weight / Frame Dash / Frame Color" (Title Case, native selects), an unlabelled "Top / Centre" pair; the toolbar says Border, the panel says Frame; "Center X" and "Centre" in one product | Image options: Recolor, Adjustments, Size & rotation, Position, Drop shadow, Reflection, Alt text; one word per thing | `packages/chrome/src/inspector/format-sections.ts` (the section route for `shot` and `picture`), `inspector/picture.tsx` (labels in sentence case, one Caption field, one Crop anchor control with its label, Border everywhere), `inspector/generate.ts` (no generated section for a picture) | 2 | 2 | `a-08-image-options-top.png`, `a-09-image-options-all-open.png`, `a-10-image-options-scrolled-mid.png`, `current/c-16-panel-scroll-4.png` (the same leftovers under a shader) |
| 8 | No drop shadow for a picture | The Format options of a picture end with Adjustments and Alt text; the grammar carries `shadow` and `inspector/shadow.tsx` exists for shapes | Drop shadow (colour, transparency, angle, distance, blur) and Reflection on every image | Add the shadow section to the picture's sections in `format-sections.ts` and write `block.shadow` through `shadow.tsx`; the tail's Border controls stay | 2 | 2 | `a-11-image-options-scrolled-end.png`, `a2-pictures.out` (sections: size, position, picture, adjustments, altText) |
| 9 | The mask picker in the panel clips its eighth column, takes the whole panel and shouts its labels | The 8 by 28 px grid (342 px) sits in the 320 px panel, the last column half cut; the grid replaces every section until a pick; "SHAPES", "ARROWS", "CALLOUTS" in capitals | Mask image opens a menu of glyphs, the panel stays | `packages/chrome/src/pickers/Pickers.css` 66 to 74 and `ShapePicker.tsx` 100 to 150 (a 7 per row grid inside a panel, or a plate anchored to the Mask button), sentence case group labels | 2 | 1 | `current/a3-15-mask-panel-open.png`, `a3-12-mask-panel-open.png` |
| 10 | Add a caption crops the picture in place and the chip covers the prompt | The picture keeps its box and loses 35 sheet px to the caption line (img 246.7 to 221.9 CSS px), the bottom of the photograph is cut; the chip "Image" sits over "Add a caption"; the ring wraps the caption line alone while the field is open | Google has no captions; a box that gains a line grows | `packages/render/src/block-css.ts` 271 (`.free > .shot-fig` rows) and the caption session in `packages/viewer/src/Editor.tsx`: grow `pos.h` by the caption's height in the same write, keep the chip at the picture's corner | 2 | 2 | `a2-20-caption-B-prompt.png`, `a2-22-caption-B-selected.png`, `a-36-caption-prompt.png`, `current/a2-22-caption-B-selected.png` |
| 11 | A border colour draws nothing until a weight is picked, and the heaviest weight is 2 px | Border color > ink writes `{ color: 'ink' }` with weight None, the picture is unchanged; the weight menu offers None, 1, 1.5 and 2 px | Picking a border colour draws a 1 pt border at once; weights 1 to 24 pt | `packages/chrome/src/menus/toolbar-tails.ts` 460 to 489 (`IMAGE_TAIL`) and the `imageBorder` op in `packages/chrome/src/editor-shell.ts`: a colour pick with no weight writes weight 1; add 3, 4, 8 and 12 px to `borderWeight` | 2 | 1 | `a3-09-border-paper-no-weight.png`, `a-28-border-weight-menu.png`, `a3-11-border-ink-2px-light.png` |
| 12 | Alt text opens the panel without focus and fills the description with the file name | Alt text (right click, Cmd+Option+Y) opens Format options with the Alt text section; focus stays on the body; the field reads "13 editor light" | The Alt text dialog opens with the description focused and empty | `packages/chrome/src/inspector/alt.tsx` (focus the field when the section is opened by the row) and `altFor(file.name)` in `packages/viewer/src/Editor.tsx` (leave the description empty; keep the file name as the asset's name) | 2 | 1 | `a-34-alt-text-section.png`, `a2-18-alt-B-opened.png`, `a2-pictures.out` (focused BODY) |
| 13 | A handle's tooltip names the block id and the compass code | "shot-3: Resize nw", "shot: Crop e", "shot: Resize s" over a resting pointer | No tooltip on a handle | `packages/viewer/src/Gestures.tsx` 277 (`label: \`${blockId}: ${prefix} ${dir}\``): the name is "Resize" or "Crop" alone, or no tooltip on a handle (`packages/chrome/src/Overlay.tsx` 250 to 256) | 2 | 1 | `a-38-caption-selected.png`, `a2-08-crop-A-east-released.png`, `a2-10-crop-A-enter.png` |
| 14 | The selection chip covers the top handles on a small picture or a logo | The chip "Image" or "Logo" sits over the nw handle and the rotate stem on a 119 to 161 px picture and on every logo | No chip; the handles are never covered | `packages/chrome/src/Overlay.tsx` (the chip's box) and `Overlay.css`: draw the chip above the ring with a gap, and drop it below 140 sheet px | 2 | 1 | `a3-18-small-picture-selected.png`, `b-08-figma-inserted.png` (zoom in `b-08`), `b-12-every-slide-inserted.png`, `a3-pictures.out` (chip 553 to 571 over the nw handle at 568) |
| 15 | Tooltips appear where a person did not ask for them | A right click row without a doc raises "Image options" over the next row; the toolbar Image tooltip opens under the resting pointer when the Insert menu closes and stays through the upload; "Display" stays after the font pick | Google shows no tooltips on menu rows and hides a tooltip on click | `packages/chrome/src/Menu.tsx` 562 (no tip for a row without a doc), `Tooltip.tsx` (show only after pointer movement over the control, hide on any click) | 2 | 1 | `a-33-picture-context-menu.png`, `a-04-upload-250ms.png`, `a-05-upload-landed.png`, `a3-04-svg-upload-300ms.png`, `d-18-fonts-display-changed.png` |
| 16 | The Logo dialog's words and tiles | "YOUR BRAND", "RESULTS", "RECENT" in capitals; the kit's own tile reads "General Tra..."; every inserted customer logo joins Your brand ("Figma logo", "Stripe logo", after the picture was undone too); the preselected result has no visible mark; the hover tooltip spills over the check line | Sentence case labels, whole names, one brand under Your brand | `packages/chrome/src/dialogs/Logo.tsx` 936 (`LOGO_GROUP_CONTROLS` labels), `Logo.css` (label case, two line titles), the Your brand source (the kit's logo only; a deck's `role: 'logo'` assets under Recent), an `is-active` ring on the preselected tile | 2 | 1 | `b-03-dialog-opened.png`, `b-09-empty-state.png`, `b-15-replace-logo-dialog.png`, `b-06-search-figma-tile-hover.png` |
| 17 | The shader gallery's words | The tile tooltip is developer prose ("Fluid chrome over a shape... dispersion and contour controls. The Prototemplate and Glyphfield opener"); the sentence says previews are black and white while the preset tiles are in colour; the dialog collapses to 310 px when a search has no match | Plain one sentence tooltips, a dialog that keeps its size | The catalog descriptions in `packages/materials/src/` (one seller sentence per material), `packages/chrome/src/dialogs/ShaderGallery.tsx` (a min height, the sentence) | 2 | 1 | `current/c-04-gallery-tile-hover.png`, `current/c-02-gallery-opened.png`, `current/c-06-gallery-search-grain.png` |
| 18 | The Shader section's head and the generated leftovers under it | "Gem smoke" runs into the Change button with no gap; a large empty grey box holds "Still: up to date" in small grey text; below the section a second "Height none − +" stepper and a "Text / Caption / Caption size 16 15" section for a shader | One head line: the name, the still, Change | `packages/chrome/src/inspector/shader.tsx` 647 to 700 (the head) and `shader.css`; `format-sections.ts` (no Text section and no generated stepper for a material) | 2 | 1 | `current/c-12-panel-top.png`, `current/c-16-panel-scroll-4.png` |
| 19 | A shader inserted on a blank slide lands as a 480 by 272 box at the top | docs/FEATURES.md 5.4 says the largest free rectangle, the whole sheet on an empty slide; the box sits at 560, 129 | Google has no shaders; an inserted object of no natural size fills the free area | The insert placement in `packages/chrome/src/editor-shell.ts` (the free rectangle helper the picture insert uses) for `block.insert` of a material | 2 | 2 | `current/c-08-shader-inserted-2s.png`, `current/c2-01-inserted-3.5s.png`, `c-shaders-current.out` (pos 560,129 480x272) |
| 20 | The Brand kit panel's footer, position and appearance words do not match the sheet | The footer text draws on slide 2 and not on the title slide while the sentence says "in the corner of every slide"; "On the title slide: Bottom left" while the mark sits above the title; the Dark tile turns the whole chrome dark and the Colors tab stays on Light; Primary and Accent default to the same blue; the typed hex shows no live swatch until Enter; the font picker lists Inter twice | The theme's colours change the slides, never the app chrome; a label describes what is drawn | `packages/chrome/src/ThemesPanel.tsx` 291 (appearance), 438 to 470 (swatch and hex), 632 (position labels), 655 (the Colors tab follows the appearance); the title kind's footer in `packages/render/src/slide.ts`; the accent default in `packages/schema/src/brand.ts`; the picker's Brand group in `font-picker-model.ts` | 2 | 2 | `d2-01-title-footer.png`, `d2-02-slide2-footer.png`, `d-01-panel-top.png`, `d-22-appearance-dark.png`, `d-06-primary-typed-live.png`, `d-17-fonts-picker.png`, `d2-04-mark-top-right.png` |
| 21 | The By URL preview stretches a small picture to the dialog's width and clips its bottom | A 180 px icon is drawn 430 px wide and cut by the footer | The preview fits inside a bounded box | `packages/chrome/src/dialogs/ImageByUrl.tsx` 214 (the preview `img`) and `Dialog.css`: `object-fit: contain` in a fixed box | 2 | 1 | `a-14-by-url-preview.png` |
| 22 | An SVG that opens with a long comment is refused as "not a picture" | The product's own `apps/studio/public/icon.svg` (a comment over 256 characters before `<svg`) reads "the file is not a picture" on drop | Any SVG file is accepted | `packages/viewer/src/picture-place.ts` 259 to 262: skip `<!-- -->` blocks and read 512 bytes before deciding | 2 | 1 | `a-18-drop-250ms.png` |
| 23 | A picture dropped near the bottom edge lands partly off the sheet | The SVG dropped at 800, 700 takes 480 by 240 and ends at y 936 on a 900 px sheet | A drop is clamped inside the slide | `droppedPictureBox` in `packages/viewer/src/picture-place.ts` / `Editor.tsx`: clamp the box to the sheet | 2 | 1 | `current/a3-15-mask-panel-open.png` (the third logo over the footer), `a3-current.out` (pos 1096, 696, 480x240) |
| 24 | Crop mode does not dim the part of the picture outside the frame | After the east edge is dragged in, the cut part looks the same as the kept part; only a line separates them; the chip is a full sentence | The cropped away area is greyed and the handles are black brackets | `packages/chrome/src/Overlay.css` (`.ts-crop-full` at 40 percent), `Overlay.tsx` (the crop chip reads "Crop") | 2 | 1 | `a2-08-crop-A-east-released.png`, `a2-06-crop-A-mode.png` |
| 25 | Rows without icons in menus that draw icons | Insert > Image: Upload has an icon, By URL and Logo have none; the Replace image menu likewise; Word art and Slide numbers have none in the Insert menu | Google's menus are consistent per menu | `packages/chrome/src/menus/model.ts` 1389 to 1425 and 674 to 700 name `link` and `tag` icons; the submenu draws neither: `Menu.tsx` (the icon slot in a submenu row) | 1 | 1 | `a-03-insert-image-submenu.png`, `a-21-replace-menu.png` |
| 26 | The same 180 px picture lands at three sizes | By URL placed the icon at 94, 119 and 161 sheet px in three runs, depending on the free rectangle; By URL took 5.7 s on www | Google inserts a picture at its natural size scaled to fit | `picturePlaceOn` in `packages/viewer/src/picture-place.ts`: a picture under 600 px keeps its natural size (or the logo rule) whatever the free area | 1 | 1 | `a-15-by-url-landed.png`, `a3-18-small-picture-selected.png`, `current/a3-21-small-picture-selected.png` |

## 3. Summary

What a seller feels in this area today, on www.turboslide.com: pictures come in fast (an upload
lands in 2 s with an instant preview, By URL in 1.4 to 5.7 s, paste in 2.4 s) and every insert
is followed by a banner about a revision that arrived from outside the editor, with a Reload
button, which reads as a fault. A customer's SVG logo is refused with "not accepted yet". A logo
found through Insert > Logo arrives on a grey plate with a hairline. Replacing it with another
company's wordmark squeezes the wordmark into the old box. The Logo dialog answers a search below
the fold once a couple of tiles sit in Your brand and Recent, so a seller types "stripe" and sees
Figma. There is no shader anywhere in the menus, and the mask, the crop arrow and the rotated
ring are the old build's. The Brand kit works end to end (colours, the logo on every slide,
footer text, the counter, the appearance, Reset with Undo) and its words are close; its footer
text skips the title slide and its position labels do not describe the drawing. On the current
tree (turboslide.vercel.app) the shader library is present and its sliders preview live with one
write per release and one undo, but a large frame never lands (413), so the filmstrip, the show,
the PDF and the PowerPoint draw a grey box for the seller's shader.

The ten items to fix first: 1 (redeploy the domain from main and name the build in
`/api/agent`), 2 (the shader frame upload), 3 (the banner after every picture insert), 4
(Replace image keeps the aspect), 5 (no plate under a logo), 6 (the Logo dialog's fold), 7 (the
picture's panel in the seller's words), 10 (a caption grows the box), 11 (a border colour
draws at once, heavier weights), 14 and 15 (the chip off the handles, tooltips only when asked).

## 4. Read on www.turboslide.com alone (the old build); gone on turboslide.vercel.app

| Title | Today on www | On the current tree | Evidence |
| --- | --- | --- | --- |
| Insert > Shader is absent | No Shader row in the default view or with Advanced tools; "Material" under the switch; Search the menus answers nothing for "shader" | `insert.shader` in the default view, the gallery of 34 tiles | `c-01-gallery-failed.png`, `c-01-insert-menu-for-shader.png`, `current/c-02-gallery-opened.png` |
| SVG refused on every route | "SVG files are not accepted yet. Export the logo as a PNG and upload that" on upload, paste and drop; the server answers "svg is not accepted here" | Upload, paste and drop of an SVG land in 1.3 to 1.5 s as a vector picture; Crop is disabled with "An SVG picture cannot be cropped. Resize it instead." | `a3-04-svg-upload-300ms.png`, `a5-01-svg-upload-after-35s.png`, `current/a3-09-svg-selected.png`, `current/a3-10-svg-crop-tip.png` |
| Mask image hidden and the picker draws eighty identical squares | Format > Image has no Mask image row and the Crop button no arrow; the panel's Mask button draws the box glyph for every preset | The row, the arrow and real glyphs | `a2-03-format-image-hover-1200ms.png`, `a3-12-mask-panel-open.png`, `current/a2-13-mask-A-picker.png` |
| The rotated ring is the bounding box rotated again | A picture rotated 20 degrees has a ring 553 by 500 CSS px around a 455 by 367 object, past the sheet's edge | The ring matches the object (874.1 vs 874.1, 455.38 vs 455.38) | `a-43-rotate-released.png`, `a2-24-rotate-B-released.png`, `a2-26-rotate-A-released.png`, `current/a2-26-rotate-B-released.png` |
| Format > Image submenu did not open on hover once | The Image row highlighted with no submenu for 6 s in run A (a stacked selection); it opened in every later run | Opens on hover | `a-25-format-image-no-submenu.png` |

## 5. What was driven and what reads right

Features driven (86): the Insert menu and its Image submenu; the toolbar Image button and arrow;
upload from computer (menu and toolbar); the instant preview; By URL (dialog, preview, insert,
replace); paste of a JPEG; drop of a JPEG and of two SVGs; the selection ring, chip, eight
handles and the picture tail at 1440 and 1280; the tail tooltips; Image options (every section,
scrolled); Transparency, Brightness and Contrast sliders (one write per release, undo);
Replace image > Upload from computer (keeps the box, snackbar with Undo) and > Logo; crop by
double click, the east and south edges, Enter, undo, redo; Mask image from the Format menu, the
crop arrow and the panel's Mask button (an ellipse written and drawn); Border color, weight and
dash from the tail; Reset image; Alt text from the right click menu; Add a caption from the right
click menu, typed on the slide; resize by a corner with Shift (the aspect held); rotate by the
ring; move by the frame with the snap guides; Delete and undo; the picture's right click menu;
the filmstrip card; Use on every slide from a picture's menu; Insert > Logo and Insert > Image >
Logo; the dialog's search at human speed (73 to 148 ms to results, the first tile preselected,
Enter and Escape); the tiles on paper and ink; the tile tooltip; the one click insert as a stored
asset at the logo size with the chip Logo; the empty state with Upload; the brand's own name; Use
as this presentation's logo on every slide with its snackbar and Undo; Replace image > Logo; the
dialog on the dark deck and the variants it picks (Figma default, Vercel light, GitHub dark); the
dialog at 1280 by 800; Insert > Shader, the gallery's title sentence, search, the six category
chips, the hover live mount, the tile tooltip, a click insert (607 ms) with the chip Shader; the
Shader section's groups; eleven sliders (seven live for gem smoke, four dim as not used), each
previewed while held, one write on release, one Cmd+Z; the preset tiles; the six kit colour
swatches and their tooltips; Change; resize and move of a shader (the live canvas follows); the
frame in the filmstrip card (gem smoke landed within a second; god rays never); the show; the
PDF and the PowerPoint downloads (the menu, the progress snackbar "Preparing your PDF, about 10
seconds for 2 slides", the files opened); the gallery and section at 1280; the Brand kit from
Slide > Change theme and from the toolbar Theme button; the six role tooltips; the Primary hex
typed and entered (one write); the swatch plate; Logo Replace (a PNG on the title slide, the
footer and the previews in 1.2 s), Remove and Use the default logo; the footer text; the footer
and title slide positions; the font picker; the counter format and Show; the Dark and Light
appearance tiles; Reset to General Translation with Undo.

Reads that match Google or the specification and need no fix: the upload's instant preview and
2 s landing; the crop's box shrinking to the frame on Enter with undo and redo; the transparency
slider's live fade, one write, one undo; the snap guide on a drag; Shift keeping the aspect;
Replace image > Upload keeping the box with "Picture replaced, Undo"; the Logo search and the
licence line "Figma: Free to use, brand guidelines"; the mono and variant picks on the dark deck;
Use on every slide writing the mark and every footer in one commit and undoing whole; the shader
sliders' one write per release; the Brand kit's Reset with Undo and the counter formats. The
first upload of a session landed in 2.0 s three times on www (the `images.insert.upload` 5 s
bound held).

Not driven: the picture's Recolor (absent in the product), the Reflection (absent), Change
background > Shader (parked, `dialog.background.shader`), the Frame scrubber
(`formatOptions.shader.frame.*`, parked), Find a logo in the kit (`panel.brand.logo.find`,
parked), the kit's font change on the sheet (the picker opened; the pick did not land in the
script), the shader library on www.turboslide.com (no row; section 1).
