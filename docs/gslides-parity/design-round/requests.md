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
