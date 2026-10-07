# Requests of the design round

Each lane's requests for a file outside its list (docs/DESIGN.md 10), under the lane's key, for the
integrator or the owning lane to make. A request names the file, the change, the reason and the row
it serves.

## D5

1. **The integrator, `apps/studio/src/components/Slideshow.tsx`** (DR-D5#3): hand the chrome's
   Layer hook to the show's two viewer surfaces, the way the file already hands in the icons and the
   tooltip: `import { useLayer } from '@turboslide/chrome/Layer';` and `layer={useLayer}` on
   `<PresentShortcuts>` and on the show's `<SlideList placement="up">`. Both components take the
   prop since DR-D5#3 (`PresentLayer` in `packages/viewer/src/present/ui.tsx`); with it the
   shortcuts card's scrim enters the `dialog` layer and the slide list the `popover` layer in the
   top layer (DESIGN.md 2.3). Without it each keeps its DOM place and its sheet draws the scale's
   z-index (`var(--ts-layer-dialog)`, `var(--ts-layer-popover)`), which already paints both over the
   show: `present.presenter.surfaces` passes either way and its annotation names the layer it read.
   In the same file, the show's root (`.ts-slideshow`, the `root` ref) belongs in the `show` layer
   (`useLayer(root, { layer: 'show' })`, DESIGN.md 2.3 "the slideshow layer"): once the `bar`
   layer's surfaces (the name prompt bar, the conflict and edit banners) enter the top layer
   through D2, a show left in its DOM place paints under them. In the top layer the root's
   `inset: 0` resolves against the window, so on a phone without full screen the toolbar moves
   from the stage's box to the window's bottom left; the show's list already pins itself to the
   window (DR-D5#3).
2. **D1, `packages/lint/src/brand/source.ts` and `config.ts`** (DR-D5#3): the standalone deck's copy
   (`packages/viewer/standalone/chrome.ts`) declares its own numerals token once in its `:root`
   (`--numerals: tabular-nums`, the copy of `--pt-numerals`) and reads `var(--numerals)` in its six
   rules, as it owns its scrollbar copy (`SCROLLBAR_OWNERS`). The source check reads the whole
   template string, so the one declaration reports `css/numerals` once; a `NUMERALS_OWNERS` list
   with the standalone copy beside `tokens.css` clears it before DR-D1#5 enforces the rule.
3. **D1 or the integrator, `packages/chrome/package.json`** (DR-D5#2): the export line
   `"./dialogs/SignIn": "./src/dialogs/SignIn.tsx"`, so the pages' Sign in
   (`apps/studio/src/components/home/sign-in-dialog.tsx`, loaded on the first click) draws the one
   Sign in dialog component the editor draws (`accounts.signin.one-dialog`).
4. **The integrator, `packages/lint/src/brand/config.ts`** (optional): the accepted
   `css/no-eyebrow` finding of `.ts-present-card h3` (the shortcuts card's "PRESENTING" in capitals
   with tracking) can leave with the heading's change to sentence case in one push; changed alone,
   either half fails the lint (an open finding, or a stale acceptance).
5. **D2, `packages/chrome/src/brand.css`** (DR-D5#1, DR-D5#2): `.ts-brand-lockup-word` (the
   Turboslide lockup on /decks, the trash, the templates gallery, You need access, the refused page
   and Not found, drawn by `AppBarBrand.tsx` and `PageFrame.tsx`) sets `'cv11', 'ss01'`; under
   DESIGN.md 4.2 the chrome and the pages draw Inter's defaults, and `decks.pages.default-glyphs`
   reads the lockup as the one element of these pages that still computes them once `decks.css`
   leaves them (read on 4665 before the seam: the lockup, the strip's and the list's headings,
   the template labels, the card plates and titles, the trash heading). Answered in DR-D2#3
   (08c3020d).
6. **D2, `packages/chrome/src/dialogs/Profile.tsx`** (DR-D5#2; DESIGN.md 6.3): the profile's
   session list (`.ts-profile-rows`) takes `.pt-scroll`; `accounts.css` then drops its local
   `overflow-y` and `scrollbar-gutter` (D5 makes that line change in the push that follows).
   Answered in DR-D2#3 (08c3020d); `accounts.css` drops the two lines in DR-D5#2b.
7. **D3, `packages/chrome/src/menus/strings.ts`** (DR-D3#4, the words D5 asks for): Title Case on the
   button words of D5's pages: the trash's Delete forever and Empty trash buttons ("Delete
   Forever", "Empty Trash"; the snackbars that name the act keep their sentence case), the
   trash's way back to the list ("Recent Presentations" as a button; the list's heading keeps
   "Recent presentations"), the editor's Sign in button (`ACCOUNT.signIn` where it labels the
   title row's button: "Sign In", as the pages' button reads), and the passkey method ("Use a
   Passkey").

## D2

1. **D1 or the integrator, `packages/chrome/src/place.ts`** (DR-D2#1; `chrome.layers.follows-anchor`,
   DESIGN.md 2.4): in `middlewareOf`, push `size` before `shift` when `fit` is set (or shift with
   `crossAxis: false` then). floating-ui's `size` gives the whole clipping height when `shift` is
   enabled on that axis, so a fitted plate taller than the room under its anchor is shifted over
   the anchor (read on 4662: the font picker at 884 px from top 8, over its control). D2 passes
   `fit` for the menus alone until then (the old `placeMenu` did the same), and the other plates
   bound their own height in their sheets.
2. **D1 or the integrator, `packages/chrome/src/ExportMenu.tsx`** (DR-D2#1): the export menu is
   mounted nowhere today; if it returns, its card takes `usePlate(card, { layer: 'popover',
   anchor: button })` (`packages/chrome/src/usePlate.ts`) and `.pt-float`. Its sheet already reads
   the scale.
3. **The integrator, `packages/viewer/src/InlineText.tsx` and `InlineText.css`** (DR-D2#1; no
   lane owns them): the link popover over a slide (`.ts-link-pop`) is a small floating plate at
   radius 0 on `--pt-hair`; under the ladder (DESIGN.md 3.1, 3.4) it takes `.pt-float` (6 px,
   `--pt-edge`, the ring) and keeps the stage's local order.

## D3 (finishing round 2)

1. **D2, notice** (pass 3 finding 2, `fc8dd7e3`): the finding named D2's picker files for this
   fix, and they changed: `ColorPlate` takes no `kit` or `appearance` prop and paints from
   `useDeckTokens()` (`inspector/palette.tsx`, the editor's document through EditorShellContext);
   `swatchPaint(value, tokens)` takes the deck's tokens; `contrastAgainstPaper` and `colorRgb`
   take them in place of the chrome's appearance; `dialogs/Background.tsx` exports
   `tokenHex(color, tokens)`. A new swatch anywhere in the chrome paints through
   `swatchPaint(value, useDeckTokens())`, so it shows the colour the slide draws.
2. **D2 or the integrator, `packages/chrome/src/logo-model.ts`** (DESIGN.md 7.5): `kitTextColour`
   and `kitBackgroundColour` fall back to General Translation's `TOKENS`, so on a Mint deck the
   Logo dialog's two tile grounds (`dialogs/Logo.tsx` 315 to 318) and the server's tint of a one
   colour logo (`apps/studio/src/server/logos.ts` 937) read `#070707` and `#ffffff` where the slide
   draws `#0d271d` on `#e8f3ee`. `deckTokens(deck, appearance)` (`render/theme-css.ts`) answers
   the theme's value under the kit. Answered in DR-D2 fix 5 (D2, finishing round 3): both
   functions take the deck and read `deckTokens`; the Logo dialog, Tailor's logo pair and
   `logo.insert`'s tint pass the deck (d2.md).
3. **The integrator, `packages/schema/src/color.ts`**: `COLOR_LABELS.blue` reads "GT blue", the
   name of the token row's swatch in the colour plate, the Background dialog and Format options,
   which now paints each theme's Primary (Mint's `#11734f`). "Primary", the kit role the token
   names, would read right on every theme; `packages/chrome/src/__tests__/inspector-sections.test.tsx`
   208 pins the label.

## D3 (finishing round 3)

1. **D2, `packages/chrome/src/dialogs/Background.tsx` and the dialog field's tooltip**: in the
   Background dialog a pointer over a colour swatch shows the field's tooltip ("Color / A theme
   colour behind the slide, or none") and never the swatch's own name, at 1440 and 390, although
   each swatch carries its `tipProps` name (`data-tip` "Primary" on
   `dialog.background.color.blue`, read on 4696). The text colour plate shows the swatch's name.
   The swatch's tooltip would answer the pointer and the field's the label.
2. **D2 or the integrator, Format options' Layout section**: on a Simple deck's title slide the
   section lists "Mark width 132" and "Mark height 84" (`packages/schema/src/deck.ts` 319 to
   320, the title kind's mark box), which size a mark Simple never draws (DESIGN.md 7.2: Simple
   has no logo). The two rows could show only where the theme or the kit draws a title mark.
3. **The integrator, `charts.export.pdf`**: on 4696 the PDF text of the chart slide reads the
   legend words cut, "Nor…" and "Sou…", and the row fails "North is in the PDF text". The PDF
   path does not run `scene/enrich.ts` (`pdf/build.ts` imports only `READY_SELECTOR` from
   `scene/extract.ts`), so the PowerPoint colour fix of this round does not reach it; the
   verifier's pass 4 runs did not include the export spec whole.
4. **The integrator, `scripts/probes/core-walk/areas/export.mjs`** (`export.pptx.dialog`): the
   walk's row looks for a mode label matching "Perfect", which `fc39b76d` renamed Pictures in the
   Download dialog, so the row is red on 4696 with the dialog right ("Pictures" and "Editable
   text" both listed, Pictures checked on a deck with no table or chart). The row's text and its
   matrix entry would read Pictures.
5. **The integrator, `export.print.layout-with-notes`** (walk area `export`): on 4696 the print
   page with one slide that has notes read "layout slides; notes blocks 0; talk track shown
   false". The verifier's pass 4 walk run did not include the export area; the row's owner is
   the print page's.

## Integrator (finishing round 1)

1. **D4, `apps/studio/src/components/home/menus.generated.ts` and `menu-docs.generated.ts`** (DR-int fix): the menu row File > Download > Microsoft PowerPoint (.pptx) now says "Pictures by default, or Editable text" (`packages/chrome/src/menus/model.ts` builds it from `DIALOGS.download`), and the model's hash in `MINI_SOURCES` changed with it. The split of the row sentences into `menu-docs.generated.ts` that sits uncommitted in the worktree was derived from the model before that change ("Perfect by default", hash `b70ce707`); derive it again from the head before it lands, and `build-home-assets.ts --check` reads the difference otherwise. Answered in d2fcca16 (D4).

## D4 (finishing round 2)

1. **D1, `packages/fonts/src/inter.css`** (optional; pass 3 finding 3, DESIGN.md 4.4): 'Inter
   Fallback' matches Inter's text cut, and Inter at `opsz` 32 draws the landing's h1 and h2s about
   7.5 percent narrower ("people and agents" is 8.27 em of the fallback at the h1's tracking and
   7.6 em of Inter). The hero now holds its boxes by size and measure (`2ea0d7df`,
   home.hero.font-swap); a second fallback face for display sizes would make the h2s break alike
   when Inter arrives late, by metrics.
2. **The integrator**: `fc8dd7e3` took the round folder's tracked pictures to 25,219,024 B, over
   evidence-policy.test.mjs's 25,000,000 B line; `2ea0d7df` re-encoded 54 of D4's pictures
   (1,077,550 B less) and the folder reads 24,922,057 B at `bcbcef7a`, 77,943 B of room.
