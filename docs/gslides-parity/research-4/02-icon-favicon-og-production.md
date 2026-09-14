# Icon, favicon and social image production for Turboslide

Report 02 of the Turboslide round four research set, written 2026-09-13 against commit 28cb63b on `main` and the production deployment at https://turboslide.vercel.app. It answers one question for the icon and branding directive (Kevin, round four, directive b: "make a custom turboslide icon and favicon and everything"): what files, sizes and head tags a web app needs in 2026, how they are produced from one SVG source, how a Bayer dithered mark behaves at 16 px, and how TanStack Start 1.168 and Nitro 3 serve them on Vercel. It does not design the mark; that is the design set's task. Every number in the measured sections was produced on this machine (Apple M5 Max, macOS, Node 24, sharp 0.35.0 from the repository's `node_modules`, python3 with Pillow) on 2026-09-13.

Rules followed: plain technical English, sentence case, no em dashes, no metaphors, no trailing periods on headings. No Google or Vercel artwork is reproduced or proposed. Every web source was read on 2026-09-13; the Sources section gives the URL and the date the page itself carries where it carries one. Source keys: P for a primary page (a specification, a vendor's own documentation or blog), T for a third party page, L for a file in this repository, M for a measurement made for this report.

## How to read this report

- A statement with a P key is documented by the vendor or the standards body. A statement with a T key alone is a third party account and is marked "single source" or "corroborated". "Measured" means the number came from a probe or a script run for this report and the script is described in section 10. "Unverified" means the statement follows from product knowledge or from a page that could not be fetched, and every unverified statement is repeated in section 11.
- "The studio" is `apps/studio`. "The mark" is the GT mark in `packages/chrome/src/GtMark.tsx` and the `gt-mark` symbol of `packages/theme/assets/sprite.svg`, which is the app mark today (L2, L3). "The screen" is the 8 by 8 Bayer matrix of `@turboslide/effects/bayer` (L6).
- Sizes are CSS pixels unless a raster is named, in which case they are image pixels.

## 1 What the studio serves today

Measured on 2026-09-13 against production (M1) and read from the tree (L1).

| Item                                                                                                                           | State                                                                                                                                                                                                                                                                                              | Evidence                    |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Favicon link                                                                                                                   | `<link rel="icon" href="data:,">` in the root route's `head()`, with the comment "no favicon file yet: an empty data URL keeps the browser from asking for /favicon.ico"                                                                                                                           | L1 `__root.tsx`             |
| Title                                                                                                                          | `Turboslide` from the root; each route overrides it (`Untitled presentation, Turboslide`, `<deck title>, Turboslide`, `<deck title>, editor, Turboslide`, `<deck title>, Presenter view, Turboslide`, `<deck title>, print, Turboslide`, `Recent, Turboslide`, `Trash, Turboslide`)                | L1 route files              |
| Description, Open Graph, Twitter card, manifest, theme-color, apple-touch-icon                                                 | none                                                                                                                                                                                                                                                                                               | L1, M1                      |
| `/favicon.ico`, `/apple-touch-icon.png`, `/manifest.webmanifest`, `/site.webmanifest`, `/robots.txt`, `/home`                  | each answers HTTP 404 as `text/html` with `cache-control: public, max-age=0, must-revalidate` and `x-vercel-cache: MISS`, so the request reaches the function                                                                                                                                      | M1                          |
| `apps/studio/public`                                                                                                           | does not exist                                                                                                                                                                                                                                                                                     | L1                          |
| Hashed client assets (`/assets/tokens-CF0T6Bm-.css`)                                                                           | `cache-control: public, max-age=31536000, immutable`, `x-vercel-cache: HIT`, `age: 21`                                                                                                                                                                                                             | M1                          |
| The GT deck twins (`/decks/gt-brand/assets/cover-fumadocs.png`, a Nitro `publicAssets` directory declared with `maxAge: 3600`) | `cache-control: public, max-age=0, must-revalidate`, `image/png`, 335,538 bytes, `x-vercel-cache: MISS` on first request                                                                                                                                                                           | M1, L4                      |
| The Vercel build's routes (`apps/studio/.vercel/output/config.json` from the 2026-09-11 preview build)                         | version 3; `{"src": "/assets/(.*)", "headers": {"cache-control": "public, max-age=31536000, immutable"}}`, then `{"handle": "filesystem"}`, then the function routes for `/api/export`, `/api/render`, `/_serverFn` and `/(.*)` to `__server`                                                      | L5                          |
| Theme                                                                                                                          | `data-theme` stamped by the boot script before first paint, `gt-theme` then `gt-deck-theme` in localStorage, default `dark`, `prefers-color-scheme` never consulted; `:root { color-scheme: light }` and `:root[data-theme='dark'] { color-scheme: dark }`; `body { background: var(--pt-paper) }` | L1 `__root.tsx`, L7, L8, L9 |
| The mark                                                                                                                       | `GtMark.tsx` draws one path at viewBox `-8 214 1213 771`, 25 by 16 px by default, `fill: currentColor`; the same path is the `gt-mark` symbol of the sprite                                                                                                                                        | L2, L3                      |
| Fonts on disk                                                                                                                  | `InterVariable.woff2` and the italic (the studio's one face), plus 26 static TTF instances under `packages/fonts/export/` (the `GT Inter` family the exporter embeds)                                                                                                                              | L10                         |
| Image tooling on disk                                                                                                          | sharp 0.35.0 with libvips 8.18.3, librsvg 2.62.3, pango 1.57.1 and fontconfig 2.18.1 bundled in the prebuilt binary; output formats jpeg, png, webp, tiff, dz, gif, heif, raw; no ICO; pixelmatch 7.2.0; playwright-core 1.62.1; pngjs 7.0.0                                                       | M2, L11                     |

Two consequences matter for the round. First, the `data:,` link stops browsers that honour it from fetching `/favicon.ico`, but iOS and Safari look for `/apple-touch-icon.png` at the root when no link names one (P17), and link unfurlers probe the same paths; each probe is a function invocation that returns an HTML 404 today. A static file in `.vercel/output/static` would be answered by the CDN at the `handle: filesystem` step before the function (P9, L5). Second, the `publicAssets.maxAge` of the twins directory did not become a `Cache-Control` header on the vercel preset in this Nitro version (3.0.260903-beta); Nitro's documentation says a directory with a non-root `baseURL` is served "with a Cache-Control header built from the directory's maxAge" (P9), and production answers `max-age=0` (M1). The icon set must therefore set its headers through `routeRules`, which the preset does write into `config.json` (the `/assets/(.*)` rule is the proof, L5), and the build must be checked, not assumed (section 8).

## 2 The browser and platform facts, 2026

### 2.1 Favicon formats

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Status                                                                                                                         | Source |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------ |
| The minimal modern set is `favicon.ico` (32 by 32), `icon.svg`, `apple-touch-icon.png` (180 by 180), `icon-192.png`, `icon-512.png` and a maskable `icon-mask.png` (512 by 512), linked as `<link rel="icon" href="/favicon.ico" sizes="32x32">`, `<link rel="icon" href="/icon.svg" type="image/svg+xml">`, `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`, `<link rel="manifest" href="/manifest.webmanifest">`                                                                                                | Third party, the reference article, editor's note 2026                                                                         | T1     |
| `sizes="32x32"` on the ICO link exists "to fix the Chrome bug where it chooses an ICO file over an SVG"; 16 by 16 inside the ICO is optional "if the logo doesn't downscale well"                                                                                                                                                                                                                                                                                                                                              | Single source                                                                                                                  | T1     |
| Safari 26.0 "now supports the SVG file format for icons everyplace there are icons in the interface, including favicons", tabs, the start page and Home Screen web app icons included; data URL icons are supported too                                                                                                                                                                                                                                                                                                        | Primary, 2025-09-15                                                                                                            | P1     |
| Safari ignores a `prefers-color-scheme` media query inside an SVG favicon and renders the base colours; Chrome and Firefox honour it                                                                                                                                                                                                                                                                                                                                                                                           | Single source, 2026-03-14, Safari version not named; a second page opened 2026-09-13 flags the Safari 26 behaviour as untested | T2, T3 |
| Firefox does not apply the `media` attribute of `<link rel="icon">`; the bug is open (NEW, P3) and a Firefox engineer's comment recommends `prefers-color-scheme` or `light-dark()` inside the favicon instead                                                                                                                                                                                                                                                                                                                 | Primary, bug tracker                                                                                                           | P2     |
| Chrome applies the `media` attribute of `<link rel="icon">`                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Single source, 2021                                                                                                            | T4     |
| Since Safari 12 a regular favicon serves pinned tabs; `mask-icon` is no longer required                                                                                                                                                                                                                                                                                                                                                                                                                                        | Single source                                                                                                                  | T1     |
| ICO structure: a 6 byte header (reserved 0, type 1, count), 16 byte directory entries (width, height, colour count, reserved, planes, bit count, size, offset; a width or height byte of 0 means 256), then the images; PNG compressed entries are accepted since Windows Vista and Microsoft recommends PNG for the 256 by 256 entry; a BMP entry declares twice its height in its BITMAPINFOHEADER because the 1 bit AND mask follows the colour rows; MIME types `image/vnd.microsoft.icon` (registered) and `image/x-icon` | Encyclopedia                                                                                                                   | T5     |
| Windows app icons: "Apps should have, at the bare minimum: 16x16, 24x24, 32x32, 48x48, and 256x256"; Windows picks an exact size first and otherwise scales the next larger one down; a 16 px icon is drawn at 16, 20, 24, 32, 40, 48 and 64 px across the scale factors 100 to 400 percent                                                                                                                                                                                                                                    | Primary, 2026-07-21 (Windows apps, not web pages; the sizes are the reason to carry 16, 32 and 48 in the ICO)                  | P4     |

Decision this implies for Turboslide: the SVG favicon carries its own `@media (prefers-color-scheme: dark)` block; the `media` attribute on the link is not used. Because Safari renders the base colours, the base drawing must read on both a light and a dark tab bar, which rules out a transparent ink mark and means the base is an opaque plate (section 5.3).

### 2.2 Apple touch icon and the Home Screen

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                                     | Status                                                                                  | Source |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------ |
| Link forms: `<link rel="apple-touch-icon" href="/custom_icon.png">`, optionally with `sizes`; "The icon that is the most appropriate size for the device is used"; with no matching size "the smallest icon larger than the recommended size is used"; with no link "the website root directory is searched for icons with the apple-touch-icon... prefix"; "Safari on iOS 7 doesn't add effects to icons", so `-precomposed` is history | Primary, updated 2016-12-12; the document names `sizes="180x180"` for the retina iPhone | P17    |
| One 180 by 180 PNG covers current devices; iOS composites transparency onto black and applies its own corner mask, so the file is opaque and square with no corners of its own; the reference set pads the mark by 20 px in a 180 canvas                                                                                                                                                                                                 | Third party, corroborated by two pages                                                  | T1, T6 |
| iOS 26 and iPadOS 26: "By default, every website added to the Home Screen opens as a web app" and "there are now zero requirements for 'installability' in Safari"                                                                                                                                                                                                                                                                       | Primary, 2025-09-15                                                                     | P1     |
| `<meta name="apple-mobile-web-app-capable">` is reported deprecated by Chrome's console in favour of `mobile-web-app-capable`; the manifest's `display: standalone` replaces both                                                                                                                                                                                                                                                        | Third party (issue trackers), corroborated                                              | T7     |
| Apple's current Human Interface Guidelines page for app icons could not be read (the fetch returned a title only); the 180 px figure rests on P17 and T1                                                                                                                                                                                                                                                                                 | Not fetched                                                                             | P18    |

### 2.3 The web app manifest

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Status                                | Source |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------ |
| W3C Web Application Manifest, Working Draft 2026-08-13: `purpose` values `any` (default), `maskable`, `monochrome` (alpha only, filled by the user agent); the safe zone of a maskable icon "is defined as a circle with center point in the center of the icon and with a radius of 2/5 (40%) of the icon size"; `background_color` "MUST NOT be used by the user agent as the background color when the web application's stylesheet is available" | Primary                               | P5     |
| "For Chromium, you must provide at least a 192x192 pixel icon and a 512x512 pixel icon"; provide at least one of `name` or `short_name`; `start_url`, `display`, `background_color` (the splash), `theme_color`, `id`, `scope`, `description`, `screenshots`                                                                                                                                                                                         | Primary, 2024-09-18                   | P6     |
| Chrome's install criteria: `short_name` or `name`, `icons` with 192 and 512, `start_url`, `display` one of `fullscreen`, `standalone`, `minimal-ui`, `window-controls-overlay`, `prefer_related_applications` absent or false, HTTPS                                                                                                                                                                                                                 | Primary, 2024-09-19                   | P7     |
| For a 512 icon the safe zone is a central circle of about 409 by 409 px; do not give one icon both `any` and `maskable`, because the padding a maskable icon needs shrinks the `any` rendering; `any` icons may keep transparency, maskable icons are opaque with padding the launcher crops; maskable.app tests the shapes                                                                                                                          | Primary (web.dev), 2019-12-19, and T1 | P8, T1 |

### 2.4 theme-color

| Fact                                                                                                                                                                                                                   | Status                                                                                                                    | Source      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `theme-color` is "limited availability" and not Baseline; the `media` attribute selects a value per `prefers-color-scheme`                                                                                             | Primary, 2026-04-22                                                                                                       | P10         |
| Chrome honours `media` on `theme-color` from version 93 for installed web apps on desktop and for every site on Android; the first tag without `media` is the fallback older browsers read                             | Third party, corroborated                                                                                                 | T8          |
| Safari 26 parses `theme-color` but no longer uses it; the tab tint comes from the `body` background colour (then `html`, then white or black by scheme), and a fixed or sticky element with a background can take over | Third party, two accounts (2025-11-16 tested on iOS 26.1; 2026-02-27); the WebKit 26.0 feature post says nothing about it | T9, T10, P1 |

Decision this implies: the studio's page theme is `data-theme`, default dark, and never follows the OS scheme (L7). A `theme-color` with `media="(prefers-color-scheme: dark)"` would tint Chrome's frame by the OS while the page stays dark, a mismatch. The correct shape is one `theme-color` whose content the theme boot script and the toggle keep equal to the current `--pt-paper` (`#070707` dark, `#ffffff` light), and a `body` background from the same token, which already exists (L9) and is what Safari 26 reads.

### 2.5 Social images

| Fact                                                                                                                                                                                                                                                                                                                                                     | Status                                                                                           | Source   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------- |
| Open Graph requires `og:title`, `og:type`, `og:image`, `og:url`; `og:image` has the structured properties `og:image:url`, `og:image:secure_url`, `og:image:type`, `og:image:width`, `og:image:height`, `og:image:alt`; "If the page specifies an og:image it should specify og:image:alt"; `og:site_name`, `og:description`, `og:locale` are recommended | Primary                                                                                          | P11      |
| Facebook: 1200 by 630 recommended, 600 by 315 minimum for the large layout, 200 by 200 floor, aspect 1.91:1 to avoid cropping, 8 MB maximum; `og:image:width` and `og:image:height` let the crawler "render the image immediately without having to asynchronously download and process it"; a changed image needs a new URL and a re-scrape             | Primary                                                                                          | P12      |
| LinkedIn: "Minimum image dimensions: 1200 (w) x 627 (h) pixels", "Recommended ratio: 1.91:1", "Max file size: 5 MB"; reads `og:title`, `og:image`, `og:description`, `og:url`                                                                                                                                                                            | Primary                                                                                          | P13      |
| X: `summary_large_image` at 2:1, 1200 by 600 recommended, 4096 by 4096 maximum, 5 MB, JPEG, PNG, GIF (first frame) and WebP, re-encoded to JPEG, `og:image` read when `twitter:image` is absent; the minimum is given as 300 by 157 by some pages and 144 by 144 by another                                                                              | Third party only; X's own documentation redirected (307 to docs.x.com, then 404) or answered 402 | T11, T12 |
| Slack, Discord and iMessage read the same Open Graph tags                                                                                                                                                                                                                                                                                                | Unverified (search listings only)                                                                | S1       |
| `@vercel/og` recommends 1200 by 630 and "automatically adds the correct headers to cache computed images on the CDN"                                                                                                                                                                                                                                     | Primary, 2026-06-16                                                                              | P14      |

One image at 1200 by 630 satisfies every documented minimum. X crops 1.91:1 to 2:1, which removes about 15 px at the top and the bottom of a 1200 by 630 image, so nothing that matters sits within 48 px of an edge. Because X re-encodes to JPEG and every platform resamples the image to its card width, the two-tone screen in the image needs coarse cells (section 5.4).

### 2.6 Generation tooling

| Tool                       | What it is                                                                                                                                                                                                                                                 | Fit for Turboslide                                                                                                                                                                                                                                                                                                                                                                                       | Source        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| sharp 0.35.0 (in the tree) | libvips with librsvg for SVG input; `density` 1 to 100,000 DPI (default 72) sets the rasterization scale; raw RGBA in and out; PNG with palette; no ICO output                                                                                             | The rasterizer for every PNG in the set. The prebuilt binary bundles librsvg 2.62.3 (M2), so the output depends on the sharp version, not on the operating system's libraries; identical bytes across macOS and the Linux CI are expected and must be verified once (section 6.5)                                                                                                                        | P15, M2       |
| resvg-js                   | Rust resvg through napi-rs plus a wasm build; `fitTo` (width, height, zoom), font options, MPL-2.0                                                                                                                                                         | Not in the tree. A second SVG rasterizer only matters if librsvg misrenders the source; the prototype rendered the mark correctly (M2). Not adopted                                                                                                                                                                                                                                                      | T13           |
| satori and `@vercel/og`    | JSX and CSS to SVG, resvg to PNG; flexbox only, no grid, no `calc()`; fonts TTF, OTF or WOFF, "WOFF2 is not supported"; `fontFeatureSettings` supported through HarfBuzz; Node runtime supported; 500 KB bundle limit for the image code, fonts and assets | Not adopted. The studio already owns a Chromium raster path whose typography is the product's (SPEC 5); a satori template is a second text engine whose Inter metrics differ from the stage, and the studio's face on disk is WOFF2 (the TTF instances under `packages/fonts/export/` would work but they are the exporter's static instances). Section 6.4 and section 7 use Chromium and sharp instead | P14, P16, L10 |
| Pillow (python3)           | reads ICO directories and every entry                                                                                                                                                                                                                      | The verifier for the ICO writer (M2); not a build dependency                                                                                                                                                                                                                                                                                                                                             | M2            |

### 2.7 How TanStack Start and Nitro serve head tags and public files

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                                        | Status                                    | Source   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------- |
| `routeOptions.head` returns `{ title, meta, links, styles, scripts }`; `<HeadContent />` renders them and belongs in the root layout's `<head>`; nested titles override parent titles; meta tags with the same `name` or `property` are deduplicated with the deepest route winning; the documentation does not state a dedupe rule for `links`; `<ScriptOnce>` runs a script before hydration and removes itself                           | Primary                                   | P19      |
| `ssr: false`: `beforeLoad`, `loader` and the component run on the client during hydration; the server renders the `pendingComponent`; the documentation does not say whether the route's `head()` output is in the server HTML                                                                                                                                                                                                              | Primary; the head behaviour is unverified | P20      |
| Vite: files in `public/` are "served at root path / during dev, and copied to the root of the dist directory as-is", referenced by root absolute paths, never hashed                                                                                                                                                                                                                                                                        | Primary                                   | P21      |
| Nitro: "All assets in public/ directory will be automatically served"; on build "the public/ directory will be copied to .output/public/" with a manifest embedded in the server bundle; `publicAssets` adds directories (`dir`, `baseURL`, `maxAge`, `fallthrough`, `ignore`); a `cache-control` route rule takes precedence over a directory's `maxAge`; without `maxAge` the documented default is `public, max-age=604800, immutable`   | Primary                                   | P22, P23 |
| Nitro vercel preset: Build Output API v3, static files under `.vercel/output/static` served by the CDN, `routeRules` headers and cache mapped to Vercel routes, `vercel.functions` and `functionRules` for per route limits                                                                                                                                                                                                                 | Primary                                   | P9       |
| Vercel Build Output API: `config.json` `routes` use the `vercel.json` routes syntax and attach headers to paths; `overrides` change a static file's `Content-Type` or path                                                                                                                                                                                                                                                                  | Primary, 2026-07-27                       | P24      |
| Vercel CDN: static files are cached automatically for the deployment's lifetime; a function response is cached only with `s-maxage` (optionally `stale-while-revalidate`); `CDN-Cache-Control` and `Vercel-CDN-Cache-Control` split the CDN from the browser; a `Cache-Control` set in a function overrides `vercel.json`; responses over 10 MB are not cached; the maximum cache time is one year; the cache is per region and best effort | Primary, 2026-08-11                       | P25      |
| Vercel keeps unchanged content addressed static assets across deployments for Next.js 16.3 and later; "support for additional frameworks (including Nitro) is coming soon"                                                                                                                                                                                                                                                                  | Primary, 2026-07-17                       | P26      |
| A file route whose path segment contains a dot is written with `[.]`, as `openapi[.]json.ts` and `llms[.]txt.ts` already are; a server route answers with a `Response` and its own headers (`llms[.]txt.ts` is the pattern)                                                                                                                                                                                                                 | Repository rule                           | L12, L13 |

In the studio this means: the static icon files live in `apps/studio/public/`, Vite copies them to the client output, Nitro copies them to `.output/public` and the vercel preset to `.vercel/output/static`, and the CDN answers them at the `handle: filesystem` step. The head tags come from `head()` of the root route (the icon links, the manifest, the single `theme-color`, the site wide Open Graph defaults) and of the SSR routes that are shared (`/deck/:deckId`, `/decks`, the coming `/home`), never from `ssr: false` routes (`/edit`, `/present`).

## 3 The exact file list

Paths are under `apps/studio/public/` unless marked as a route. Byte sizes are from the prototype build of the GT mark on a paper plate (M2); the Turboslide mark will differ, but the orders of magnitude hold.

| #   | Path                                       | Size                              | Format                                                                                                                  | Purpose                                                                                                                        | Built from                                                      | Consumers                                                                   |
| --- | ------------------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | `/favicon.ico`                             | 16, 32 and 48 px entries          | ICO, three 32 bit BMP entries with AND masks (15,086 bytes; PNG entries would be 1,886 bytes, section 6.3 says why BMP) | Tabs in browsers without SVG favicons, Windows shortcuts and pinned sites, the default probe at the root                       | the small group of the source SVG, rasterized per size          | Chrome and Edge as fallback, Safari before 26, Firefox as fallback, Windows |
| 2   | `/icon.svg`                                | scalable, drawn on a 16 unit grid | SVG with an inline `<style>` carrying the `prefers-color-scheme: dark` block; about 1 to 2 KB                           | The tab icon in Chrome, Edge, Firefox and Safari 26                                                                            | the small group of the source SVG plus the colour block         | modern browsers                                                             |
| 3   | `/apple-touch-icon.png`                    | 180 by 180                        | PNG, opaque paper or ink plate, no corners (3,264 bytes truecolor)                                                      | iOS and iPadOS Home Screen, macOS Safari favourites, some unfurlers                                                            | the large group                                                 | Apple platforms                                                             |
| 4   | `/icons/icon-192.png`                      | 192 by 192                        | PNG, palette (1,191 bytes)                                                                                              | Manifest `any` icon                                                                                                            | the large group                                                 | Chrome, Edge, Android                                                       |
| 5   | `/icons/icon-512.png`                      | 512 by 512                        | PNG, palette (3,283 bytes)                                                                                              | Manifest `any` icon and the install dialog                                                                                     | the large group                                                 | Chrome, Edge, Android                                                       |
| 6   | `/icons/icon-mask-192.png`                 | 192 by 192                        | PNG, opaque, mark inside the 40 percent radius circle                                                                   | Manifest `maskable` icon                                                                                                       | the large group, padded                                         | Android launchers                                                           |
| 7   | `/icons/icon-mask-512.png`                 | 512 by 512                        | PNG, opaque, mark inside the 409 px circle                                                                              | Manifest `maskable` icon                                                                                                       | the large group, padded                                         | Android launchers                                                           |
| 8   | `/icons/icon-mono-512.png`                 | 512 by 512                        | PNG, alpha only                                                                                                         | Manifest `monochrome` icon (optional; support breadth unverified)                                                              | the small group's silhouette                                    | Android themed icons                                                        |
| 9   | `/manifest.webmanifest`                    | text                              | `application/manifest+json`                                                                                             | Install metadata                                                                                                               | a TypeScript object in the build script                         | Chrome, Edge, Safari, Android                                               |
| 10  | `/og/turboslide.png`                       | 1200 by 630                       | PNG (palette if the page has at most 256 colours, else truecolor), under 1 MB                                           | The site wide Open Graph and Twitter image for `/home`, `/decks`, `/new` and any page without its own                          | `og-template.html` rendered in Chromium at 1x                   | Facebook, LinkedIn, X, Slack, Discord, iMessage                             |
| 11  | `/og/deck/:deckId.png` (route, not a file) | 1200 by 630                       | PNG composed on the host                                                                                                | The per deck image for `/deck/:deckId`                                                                                         | the deck's first slide render plus the brand column (section 7) | the same                                                                    |
| 12  | `/robots.txt`                              | text                              | `text/plain`                                                                                                            | Adjacent: `Allow: /og/` so crawlers may fetch the images (P14 recommends it), plus the existing `noindex` routes as `Disallow` | the build script                                                | crawlers                                                                    |
| 13  | `/brand-manifest.json`                     | text                              | JSON                                                                                                                    | The sha256 and byte size of every generated file, compared by `--check`                                                        | the build script                                                | `scripts/check.mjs`                                                         |

Not in the set, with the reason: `mask-icon` (Safari 12 and later use the favicon, T1); `browserconfig.xml` and `msapplication-*` meta (Internet Explorer era; no 2026 source read requires them; unverified that nothing still reads them); PNG favicons at 16 and 32 as separate links (the ICO carries them and the SVG serves modern browsers); `apple-touch-startup-image` (iOS generates a screenshot by default, P17).

## 4 The head tags, exactly

### 4.1 The root route

Added to `head()` of `apps/studio/src/routes/__root.tsx` (L1), replacing the `data:,` link. TanStack renders each object as one element (P19).

```tsx
meta: [
  { charSet: 'utf-8' },
  { name: 'viewport', content: 'width=device-width, initial-scale=1' },
  { title: 'Turboslide' },
  { name: 'description', content: SITE.description },
  { name: 'application-name', content: 'Turboslide' },
  { name: 'apple-mobile-web-app-title', content: 'Turboslide' },
  // one value, kept equal to --pt-paper by the theme boot script and the toggle (section 2.4)
  { name: 'theme-color', content: '#070707' },
  { property: 'og:site_name', content: 'Turboslide' },
  { property: 'og:type', content: 'website' },
  { property: 'og:locale', content: 'en_US' },
  { property: 'og:title', content: 'Turboslide' },
  { property: 'og:description', content: SITE.description },
  { property: 'og:image', content: `${SITE.origin}/og/turboslide.png` },
  { property: 'og:image:type', content: 'image/png' },
  { property: 'og:image:width', content: '1200' },
  { property: 'og:image:height', content: '630' },
  { property: 'og:image:alt', content: SITE.imageAlt },
  { name: 'twitter:card', content: 'summary_large_image' },
  { name: 'twitter:title', content: 'Turboslide' },
  { name: 'twitter:description', content: SITE.description },
  { name: 'twitter:image', content: `${SITE.origin}/og/turboslide.png` },
  { name: 'twitter:image:alt', content: SITE.imageAlt },
  ...(noindex ? [{ name: 'robots', content: 'noindex' }] : []),
],
links: [
  { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
  { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' },
  { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
  { rel: 'manifest', href: '/manifest.webmanifest' },
  { rel: 'stylesheet', href: interCss },
  // the four other stylesheets unchanged
],
```

Notes on each choice:

- `sizes="32x32"` on the ICO link and the SVG link second are the reference article's order, kept because of Chrome's ICO preference (T1). `og:url` is set per route, not here, because it must be the canonical absolute URL of the page (P11).
- `SITE.origin` is the deployment's public origin. A function does not know its public host from `import.meta`; the route's loader has `request.url`, and a checkout has none, so `SITE.origin` reads `TURBOSLIDE_PUBLIC_ORIGIN` when set and falls back to the request's origin in the loader (the `X-Forwarded-Host` then `Host` rule the agent surface already uses, L14). Open Graph image URLs must be absolute (P11, P12).
- `SITE.description` is one sentence for a sales reader, drawn from the README's first sentence at the time of the build (L15), with the length kept under 200 characters so LinkedIn and X show it whole (unverified limit; the platforms document none that was read).
- `theme-color` has no `media` attribute (section 2.4). The boot script gains one statement: after stamping `data-theme`, it sets the meta's `content` to `#070707` or `#ffffff`; `applyTheme` in `@turboslide/viewer/theme` (L7) does the same on toggle. Chrome on Android follows a changed `theme-color` at runtime (unverified; Chrome documents only the static tag).
- `mobile-web-app-capable` is omitted: the manifest's `display` carries it (P6), iOS 26 opens every Home Screen site as a web app (P1), and Chrome warns about the `apple-` form (T7).
- `<meta name="color-scheme">` is omitted: `color-scheme` is already set in CSS on `:root` per theme (L8) and the page never follows the OS.

### 4.2 The shared SSR routes

`/deck/:deckId` (SSR shell) adds, from `loaderData`:

```tsx
head: ({ loaderData, params }) => ({
  meta: loaderData
    ? [
        { title: `${loaderData.deck.title}, Turboslide` },
        { property: 'og:title', content: loaderData.deck.title },
        { property: 'og:url', content: `${origin}/deck/${params.deckId}` },
        { property: 'og:image', content: `${origin}/og/deck/${params.deckId}.png?r=${loaderData.deck.revision}` },
        { property: 'og:image:alt', content: `The first slide of ${loaderData.deck.title}` },
        { name: 'twitter:title', content: loaderData.deck.title },
        { name: 'twitter:image', content: `${origin}/og/deck/${params.deckId}.png?r=${loaderData.deck.revision}` },
      ]
    : [{ title: 'Turboslide' }],
}),
```

The revision in the query string is what Facebook's guidance requires: a changed image needs a changed URL (P12). The `og:description` for a deck is the deck's first paragraph when the schema gains a summary field; today the manifest has `title` only (L16), so the site description stands and the field is a decision for Kevin (section 9). `/decks` and the coming `/home` set `og:url` and their own titles and keep the static image. `/embed/:deckId` is a frame and gets no card. `/edit`, `/present`, `/print`, `/new` and `/decks/trash` are `noindex` or `ssr: false` and get no card; whether `head()` of an `ssr: false` route reaches the server HTML at all is unverified (P20), which is one more reason to keep the cards on SSR routes.

### 4.3 The manifest

```json
{
  "id": "/",
  "name": "Turboslide",
  "short_name": "Turboslide",
  "description": "<SITE.description>",
  "start_url": "/decks",
  "scope": "/",
  "display": "standalone",
  "background_color": "#070707",
  "theme_color": "#070707",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    {
      "src": "/icons/icon-mask-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/icon-mask-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/icon-mono-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "monochrome"
    }
  ]
}
```

`background_color` and `theme_color` are the dark paper because the app boots dark by default (L7) and web.dev asks for the splash colour to match the loading page (P6). `start_url` is `/decks`, the home page of the parity SPEC amendment 5 (L17), and moves to `/home` when that route ships (section 9). `screenshots` are omitted until the install dialog is a goal. Each icon has one `purpose` (P8).

## 5 One SVG source, and what survives at 16 px

### 5.1 The source file

One file, proposed at `packages/theme/brand/turboslide-mark.svg`, because the theme package owns the sprite and the GT mark today (L3) and is framework free. It carries two groups:

- `<g id="small">`: the 16 unit drawing. Every coordinate is an integer on a 16 by 16 grid; every stroke is at least 1 unit wide and axis aligned edges land on integer coordinates. Rasterized at 16, 32 and 48 px (1, 2 and 3 px per unit) each edge lands on a pixel boundary and no anti aliasing occurs on the straight edges. This group is `icon.svg` and the ICO entries.
- `<g id="large">`: the full drawing, with the double line, the screen band and any curve. Rasterized at 180, 192 and 512 px.

Sizes and grid multiples: 16 (1x), 32 (2x), 48 (3x), 192 (12x), 512 (32x) are exact multiples of the 16 unit grid; 180 (11.25x) is not, which does not matter because iOS masks and rescales the touch icon anyway (T6) and the large group has no 1 px features.

### 5.2 Why the GT mark cannot be the 16 px icon as drawn

The mark's double line is a 59.5 unit stroke (the T stem runs from x 773 to 832.5) with a 53.5 unit gap (y 283 to 336.5) in a 1213 unit wide viewBox (L2). At 68 percent of the box, the widest the mark can be and still sit inside a maskable safe circle (section 5.5), one unit is 16 by 0.68 over 1213, so:

| Icon size | Stroke  | Gap     | Result in the prototype (M2)      |
| --------- | ------- | ------- | --------------------------------- |
| 16 px     | 0.53 px | 0.48 px | a gray smear; the two lines merge |
| 32 px     | 1.07 px | 0.96 px | readable, gray anti aliased edges |
| 48 px     | 1.60 px | 1.44 px | crisp                             |
| 180 px    | 6.0 px  | 5.4 px  | crisp                             |

The sheet in `scratchpad/icons/sheet.png` (M2) shows the three rasters side by side. Guidance from the icon design literature agrees: at 16 px "a single pixel being a significant design element", fine detail is impossible and marks are simplified or redrawn, and designers "pixel hint" edges onto pixel boundaries (T14, corroborated by P4's scale table, which shows the same 16 px icon drawn at seven pixel sizes). The Turboslide 16 px variant is therefore a separate drawing with strokes of at least 1 px at 16 (2 px preferred), and the double line appears from 32 px up at the earliest.

### 5.3 Colour: the prefers-color-scheme block and the Safari base

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <style>
    .plate { fill: #ffffff } .ink { fill: #070707 }
    @media (prefers-color-scheme: dark) { .plate { fill: #070707 } .ink { fill: #f2f2f0 } }
  </style>
  <rect class="plate" width="16" height="16"/>
  <!-- the small group, class="ink" -->
</svg>
```

The values are the `--pt-paper` and `--pt-ink` tokens of both themes (L8). The plate is opaque in the base rendering because Safari draws the base colours regardless of scheme (T2): a transparent ink mark would disappear on Safari's dark tab bar, and an opaque paper plate reads on both. In Chrome and Firefox the dark block inverts the plate. `shape-rendering="crispEdges"` on the axis aligned rectangles of the small group keeps their edges hard when a browser rasterizes the SVG at a non integer scale. `light-dark()` would express the same swap in one declaration (P2), but its support inside favicon rasterization is unverified, so the media query stays.

### 5.4 What a Bayer screen does under resampling, measured

The method (M3): a band is drawn twice, once as the screen (cells of a given pixel size thresholded by the 8 by 8 Bayer matrix along a ramp from paper to ink) and once as the smooth ramp the screen approximates. Both are downscaled with Lanczos3 by sharp to the output width, converted to gray, and the root mean square distance between them is computed. A value near 0 means the screen collapsed to the ramp (it reads as a gradient); the screen drawn on its own pixel grid, no resampling, scores 101.3, which is the ceiling.

Link preview widths, from a 1200 by 630 source:

| Cell at 1200 px | 552 px (a feed card) | 504 px (a desktop card) | 360 px (a compact unfurl) |
| --------------- | -------------------- | ----------------------- | ------------------------- |
| 2 px            | 41.6 (0.92 px cells) | 35.6                    | 24.1 (0.60 px)            |
| 4 px            | 77.2 (1.84 px)       | 76.7                    | 65.3 (1.20 px)            |
| 8 px            | 87.5 (3.68 px)       | 86.7                    | 79.5 (2.40 px)            |
| 12 px           | 92.1 (5.52 px)       | 91.1                    | 87.3 (3.60 px)            |
| 16 px           | 94.3 (7.36 px)       | 93.4                    | 90.2 (4.80 px)            |

Icon sizes, from a 512 by 512 source:

| Cell at 512 px | 192 px           | 48 px           | 32 px           | 16 px          |
| -------------- | ---------------- | --------------- | --------------- | -------------- |
| 4 px           | 77.7 (1.50 px)   | 9.7 (0.38 px)   | 5.8 (0.25 px)   | 4.0 (0.13 px)  |
| 8 px           | 91.1 (3.00 px)   | 30.6 (0.75 px)  | 19.0 (0.50 px)  | 5.7 (0.25 px)  |
| 16 px          | 96.3 (6.00 px)   | 75.5 (1.50 px)  | 66.6 (1.00 px)  | 21.1 (0.50 px) |
| 32 px          | 98.9 (12.00 px)  | 88.3 (3.00 px)  | 91.2 (2.00 px)  | 67.6 (1.00 px) |
| 64 px          | 109.7 (24.00 px) | 103.8 (6.00 px) | 104.3 (4.00 px) | 99.9 (2.00 px) |

The rules that follow:

- A cell under 1 output pixel is a gradient, not a screen. A cell of 1 output pixel keeps about two thirds of the structure and looks like noise (the sheet's fifth tile). A cell of 2 output pixels or more reads as a screen.
- Therefore the screen is never downscaled into an icon. Each raster draws its screen on its own pixel grid: 2 px cells at 32 and 48 px (the small group carries a 2 unit checker where the design wants texture, and nothing at 16 px where a 2 px cell leaves an 8 by 8 field), 4 px cells at 180 and 192 px, 8 or 16 px cells at 512 px. The build script draws the cells as rectangles through `@turboslide/effects/bayer` so the permutation is the deck's (L6), rather than dithering a gradient after rasterization.
- The Open Graph image uses cells of at least 8 px at 1200 (3.4 px on a desktop card, 2.4 px in a compact unfurl); 12 px is safer if the band must read at 360 px. JPEG re-encoding by X (T12) blurs 1 bit edges further, so the screen band is a texture, not a carrier of information, and the title and the mark stand on their own.

### 5.5 Maskable geometry

At 512 px the safe circle has a 205 px radius (P5, P8). A mark of aspect 1.573 (the GT mark's) fits a circle of diameter 409.6 px at a width of 345.6 px, 67.5 percent of the box; the prototype used 68 percent. The `any` icons may fill more of the box; the reference set gives them no padding (P8). A plate that bleeds to the edge and a screen band along the bottom fifth stay outside the safe circle on the maskable variant and are cropped by round masks, which is acceptable because they carry no information.

## 6 The build script

### 6.1 Placement and invocation

`scripts/build-icons.ts` at the repository root, run as `node scripts/build-icons.ts` through Node's type stripping like `packages/theme/scripts/build-sprite.ts` (L18), with `pnpm build:icons` in the root `package.json` and `pnpm build:icons --check` as a new step of `scripts/check.mjs`, placed with step 3 (the generated files diff). Root scripts already cross packages (`check.mjs`, `check-client-bundle.mjs`), so writing `apps/studio/public/` from a script that reads `packages/theme/brand/` follows the existing pattern. No new dependency: sharp, pixelmatch, pngjs and playwright-core are in the catalog (L11).

### 6.2 Inputs

- `packages/theme/brand/turboslide-mark.svg`, the two group source (section 5.1).
- `packages/theme/brand/og-template.html`, a 1200 by 630 page that links `@turboslide/chrome/tokens.css` and `@turboslide/fonts/inter.css` and inlines the mark, so the card's type is the product's Inter with the same tokens.
- `packages/theme/brand/site.ts`, the `SITE` object (`description`, `imageAlt`, manifest fields), imported by the script and by the studio's head code so the two never drift.

### 6.3 Steps

1. Parse the SVG with the regular expression style `build-sprite.ts` uses (L18); extract the two groups and the viewBox.
2. Write `icon.svg`: the small group, the colour `<style>` of section 5.3, `shape-rendering="crispEdges"` on rectangles, whitespace collapsed.
3. Rasterize each PNG with librsvg at its target size by setting `width` and `height` on a per size SVG string (measured: rendering at the target is smaller and sharper than rendering at 1024 and downscaling with Lanczos3; 16 px 301 against 399 bytes, 512 px 10,649 against 16,312 bytes, M2). The six sizes rasterized twice took 110 ms in total (M2). The screen band is emitted as `<rect>` cells at the size's cell width (section 5.4).
4. Encode 192 and 512 as palette PNGs (`png({ palette: true })`: 1,191 and 3,283 bytes against 3,474 and 10,649 truecolor, M2); keep 16, 32, 48 and 180 truecolor RGBA, which are small anyway and which the ICO writer reads back as raw pixels.
5. Write `favicon.ico` with three BMP entries: for each of 16, 32 and 48, a 40 byte BITMAPINFOHEADER (width, twice the height, 1 plane, 32 bits, no compression), the rows bottom up as BGRA, then an all zero AND mask padded to 4 byte rows; a 6 byte header and 16 byte directory entries with planes 1 and bit count 32 (T5). BMP entries rather than PNG entries because every consumer of an ICO reads BMP and PNG entries are documented for the 256 px case (T5); the cost is 15,086 against 1,886 bytes (M2), once per browser session. Pillow read both variants and every entry decoded to the same pixels as the source PNGs, zero differing pixels at all three sizes (M2).
6. Write `apple-touch-icon.png` (180, opaque plate, no corners), the two maskable PNGs (opaque, the mark within the safe circle), and the monochrome PNG (alpha from the small group's silhouette, filled black).
7. Write `manifest.webmanifest` and `robots.txt` from `site.ts`.
8. Render `og-template.html` to `og/turboslide.png` through `@turboslide/headless` (the same launch rules and binary order as the renders, L19) at 1200 by 630 and device scale factor 1; encode with sharp as a palette PNG when the render has at most 256 colours, otherwise truecolor; fail the build over 1 MB.
9. Write `brand-manifest.json`: path, bytes and sha256 per output.
10. `--check`: rebuild into a temporary directory and compare. PNGs and the ICO compare by decoded pixels through pixelmatch at threshold 0 (the ICO is decoded by the script's own reader); text files compare by bytes; a mismatch prints the path and exits 1, which is the contract `check.mjs` expects (L20).

### 6.4 Why the Open Graph card comes from Chromium

The product's claim is one renderer and pixel identical rasters from Chromium (SPEC 5, 8; L15). The static card is a page with the product's tokens and face, rasterized by the same headless driver the renders and the Perfect PPTX export use. Satori would introduce a second layout engine and a second font pipeline (TTF only, P16), and its output would not match the stage's Inter metrics. The card is rebuilt only when the template or the mark changes, so the Chromium run happens at build time on a machine with the browser, never in the function.

### 6.5 Determinism

librsvg travels inside sharp's prebuilt binary (M2), so the same sharp version is expected to produce identical PNG bytes on macOS and on the Linux CI; the first CI run of `--check` proves or disproves that, and if the bytes differ the check falls back to the pixel comparison it already does with a tolerance recorded in the report of that run. The Chromium render of the card is subject to the same per build variation the repository already records for renders (AGENTS.md, the Chromium section, L21); `--check` compares the card only when the local browser is the `chromium-1217` build and skips it otherwise, printing why.

## 7 The per deck image

Route `apps/studio/src/routes/og.deck.$deckId[.]png.ts`, `GET`, no bearer (crawlers carry none; the thumbnail variant of the render route is the precedent for an open, bounded image endpoint, L22).

1. Validate `deckId` as a slug; read the deck's revision and first slide id from the store (`deckFacts` in `server/thumbs.ts` already does this, L23).
2. Cache key `<state>/og/<deckId>/<revision>/<theme>.png` under the state folder, the pattern of the thumbnail cache (L23); on the Blob backend a stored copy under the deck's prefix so a second instance reuses it, the pattern of the exports (L4).
3. On a miss: render the first slide at 1600 by 900 through the worker client (`renderSlide`, the same job the render route runs), downscale to 1120 by 630 with sharp, and composite it onto a 1200 by 630 canvas with an 80 px column in `--pt-panel-ink` (`#101010`, the surround both themes share, L8) carrying the mark; write the PNG, palette when it fits.
4. Respond with `content-type: image/png`, `cache-control: public, max-age=60, s-maxage=86400, stale-while-revalidate=604800` when the URL has no `r`, and `public, max-age=31536000, immutable` when it names the revision, the split the thumbnails use (L23). The `s-maxage` is what makes the CDN keep a function response (P25).
5. Time budget: a cold hosted render measured 7.2 to 9.0 s (L4). Crawlers document no timeout that was read, so the rule is a budget of 4 s: when no cached image exists and the render has not returned in time, answer the static `/og/turboslide.png` bytes with `max-age=60` and let the render finish in the background, so the card never fails and the next fetch is the deck's. The editor's write path warms the image the way `warmThumbs` warms thumbnails (L23), so a deck a rep shares from the editor is normally cached before the link is pasted.

No text is drawn on the composed image. The deck's title travels in `og:title`; drawing it would need a text rasterizer in the function (librsvg with pango and the fonts on disk, or satori), which is the second text engine section 6.4 rules out. This is a decision for Kevin (section 9).

## 8 Cache headers and the serving checks

In `vite.deploy.config.ts`, inside `nitro({ ... })` (L4):

```ts
routeRules: {
  '/favicon.ico': { headers: { 'cache-control': 'public, max-age=86400, stale-while-revalidate=604800' } },
  '/icon.svg': { headers: { 'cache-control': 'public, max-age=86400, stale-while-revalidate=604800' } },
  '/apple-touch-icon.png': { headers: { 'cache-control': 'public, max-age=86400, stale-while-revalidate=604800' } },
  '/manifest.webmanifest': { headers: { 'cache-control': 'public, max-age=86400' } },
  '/icons/**': { headers: { 'cache-control': 'public, max-age=604800, stale-while-revalidate=2592000' } },
  '/og/turboslide.png': { headers: { 'cache-control': 'public, max-age=86400, stale-while-revalidate=604800' } },
},
```

The unhashed paths get a day in the browser because their names must be stable (browsers, the manifest and the platforms address them by path) and a week of stale service so a redesign propagates within a day. A year and `immutable` are reserved for hashed paths (the client `assets`, L5) and for the revisioned deck image. `publicAssets.maxAge` is not relied on (section 1).

Checks added to the round:

- After `pnpm --filter @turboslide/studio build:deploy` with `NITRO_PRESET=vercel`, `scripts/check.mjs` reads `.vercel/output/config.json` and asserts one route per rule above and the presence of every file of section 3 under `.vercel/output/static`. This is the measured gap of section 1 turned into a gate.
- `scripts/hosted-smoke.mjs` (L24) gains rows: `/favicon.ico` 200 with an `image/` content type and `x-vercel-cache` HIT on the second request, `/icon.svg` 200 `image/svg+xml`, `/manifest.webmanifest` 200 `application/manifest+json`, `/og/turboslide.png` 200 `image/png`, `/og/deck/gt-brand.png` 200 `image/png` within the budget. The content type of `.webmanifest` and `.ico` from the static layer is verified there rather than assumed.
- The e2e drive checks the rendered head: one `link[rel=icon][type="image/svg+xml"]`, the manifest link, one `meta[name=theme-color]` whose content equals the computed `--pt-paper`, and the Open Graph set on `/deck/gt-brand`.

Why this is part of the speed directive (Kevin, directive a): today each probe for a missing icon is a function invocation that returns an HTML 404 (M1); with the static set every icon, manifest and card request is a CDN hit that never wakes the function, and the deck card is computed once per revision and served from the CDN for a day.

## 9 Decisions for Kevin

1. The 16 px drawing. The GT mark's double line is 0.53 px at 16 px (section 5.2), so the small variant is a new drawing with 1 or 2 px strokes on a 16 unit grid, and the Turboslide mark itself is the design set's brief.
2. The plate. The recommendation is an opaque plate on every raster and on the SVG's base rendering, because Safari renders the base colours and Android draws `any` icons on a white plate (T2, P8). A transparent `any` icon is possible if the mark reads on white and on Safari's dark tab bar.
3. The deck card's text. The composed image carries the first slide and the mark and no title; drawing the title needs a text rasterizer in the function.
4. `og:description` for a deck: the manifest has no summary field (L16); adding one is a schema change through the parity chain.
5. `start_url` and `og:url` for the home: `/decks` today, `/home` when that route exists.
6. The `monochrome` icon: cheap to build, support breadth unverified; keep or drop.

## 10 Measurements made for this report

- M1 Production probes, 2026-09-13, `curl -D -` with a browser user agent against `https://turboslide.vercel.app` for `/new`, `/favicon.ico`, `/manifest.webmanifest`, `/robots.txt`, `/site.webmanifest`, `/apple-touch-icon.png`, `/home`, `/decks`, `/decks/gt-brand/assets/cover-fumadocs.png` and `/assets/tokens-CF0T6Bm-.css`; the head of `/new` fetched and split by tag.
- M2 `scratchpad/icons/proto.mjs`: sharp 0.35.0 through `createRequire('/Users/kevinliu/repos/Turboslide/package.json')`; the `gt-mark` symbol read from the sprite; a square icon SVG per size (mark at 68 percent width on a paper plate); each size rasterized at its target and by Lanczos3 downscale from 1024; palette PNGs at 192 and 512; an ICO writer with BMP entries and one with PNG entries; Pillow opening both ICO files, listing `[(16, 16), (32, 32), (48, 48)]` and comparing every entry's pixels with the source PNGs (0 differing pixels). Files: `icon-<size>-direct.png`, `icon-<size>-from1024.png`, `favicon-bmp.ico`, `favicon-png.ico`, `sheet.png` (eight tiles at 8x nearest: the 16, 32 and 48 px rasters and five dither results).
- M3 `scratchpad/icons/og-collapse.mjs`: the screen against ramp RMS method of section 5.4 at 1200 by 630 for cells 2 to 24 px downscaled to 552, 504 and 360 px, and at 512 by 512 for cells 4 to 64 px downscaled to 192, 48, 32 and 16 px; the 16 px screen on its own grid as the ceiling (101.3). The standard 8 by 8 Bayer matrix was used for the measurement; the build uses the deck's permutation from `@turboslide/effects/bayer`.
- M4 Stroke arithmetic from the path coordinates of `GtMark.tsx` (section 5.2).

Scratch files live under `/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/icons/` and are not part of the repository.

## 11 Unverified

- Whether Safari 26 honours a `prefers-color-scheme` query inside an SVG favicon; the one 2026 test that reports it does not name the Safari version (T2), and a second page flags it as untested on 26 (T3).
- Whether Chrome applies the `media` attribute of `<link rel="icon">` in 2026; the one account is from 2021 (T4). The design does not depend on it.
- Whether `head()` output of an `ssr: false` route appears in the server HTML (P20 is silent). The design keeps the cards on SSR routes.
- Whether Chrome on Android follows a `theme-color` whose `content` changes at runtime.
- Whether `light-dark()` works inside favicon rasterization.
- The Safari 26 `theme-color` behaviour rests on two third party accounts (T9, T10); the WebKit feature post does not mention it (P1).
- X's official card requirements could not be fetched (307 to docs.x.com then 404, and 402); the figures are third party and the two pages disagree on the minimum size (T11, T12). 1200 by 630 exceeds both minimums.
- Slack, Discord and iMessage reading Open Graph tags was seen in search listings only (S1).
- Crawler fetch timeouts for `og:image`; no platform page read states one, so the 4 s budget of section 7 is a design choice.
- The `monochrome` purpose's support breadth on Android launchers.
- Identical sharp output across macOS and Linux for the same sharp version (expected from the bundled librsvg, to be proven by the first CI run of `--check`).
- Whether any 2026 consumer still reads `browserconfig.xml` or `msapplication-*` meta; none of the pages read requires them.
- The 200 character description limit for LinkedIn and X cards.
- The reference article's ICO advice (32 only, 16 optional, T1) against the task's 16, 32 and 48; the report keeps all three on the strength of Windows' scale table (P4) and the measured 15 KB cost.

## 12 Sources

Primary pages (P):

- P1 WebKit, WebKit Features in Safari 26.0, 2025-09-15. https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- P2 Bugzilla, bug 1603885, allow media="" to affect link rel=icon, status NEW, last comment about two months before 2026-09-13. https://bugzilla.mozilla.org/show_bug.cgi?id=1603885
- P3 mdn/browser-compat-data issue 24213 (seen in the search listing, the Firefox status is taken from P2). https://github.com/mdn/browser-compat-data/issues/24213
- P4 Microsoft Learn, Construct your Windows App's Icon, dated 2026-07-21, updated 2026-08-05. https://learn.microsoft.com/en-us/windows/apps/design/style/iconography/app-icon-construction
- P5 W3C, Web Application Manifest, Working Draft 2026-08-13. https://www.w3.org/TR/appmanifest/
- P6 web.dev, Add a web app manifest, updated 2024-09-18. https://web.dev/articles/add-manifest
- P7 web.dev, What does it take to be installable, updated 2024-09-19. https://web.dev/articles/install-criteria
- P8 web.dev, Adaptive icon support in PWAs with maskable icons, updated 2019-12-19. https://web.dev/articles/maskable-icon
- P9 Nitro, Vercel provider. https://nitro.build/deploy/providers/vercel
- P10 MDN, `<meta name="theme-color">`, last modified 2026-04-22. https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/theme-color
- P11 The Open Graph protocol. https://ogp.me/
- P12 Meta for Developers, Sharing, Images. https://developers.facebook.com/docs/sharing/webmasters/images
- P13 LinkedIn Help, Make your website shareable on LinkedIn. https://www.linkedin.com/help/linkedin/answer/a521928
- P14 Vercel, Open Graph (OG) Image Generation, last updated 2026-06-16. https://vercel.com/docs/og-image-generation
- P15 sharp, Constructor. https://sharp.pixelplumbing.com/api-constructor/
- P16 vercel/satori README. https://github.com/vercel/satori
- P17 Apple, Safari Web Content Guide, Configuring Web Applications, updated 2016-12-12. https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html
- P18 Apple, Human Interface Guidelines, App icons (fetch returned the title only). https://developer.apple.com/design/human-interface-guidelines/app-icons
- P19 TanStack Router, Document Head Management. https://tanstack.com/router/v1/docs/framework/react/guide/document-head-management
- P20 TanStack Start, Selective SSR. https://tanstack.com/start/latest/docs/framework/react/guide/selective-ssr
- P21 Vite, Static Asset Handling, The public Directory. https://vite.dev/guide/assets
- P22 Nitro, Assets. https://nitro.build/docs/assets
- P23 Nitro, Config (publicAssets, routeRules, compressPublicAssets). https://nitro.build/config
- P24 Vercel, Build Output Configuration, last updated 2026-07-27. https://vercel.com/docs/build-output-api/configuration
- P25 Vercel, CDN Cache, last updated 2026-08-11. https://vercel.com/docs/caching/cdn-cache
- P26 Vercel changelog, Optimized CDN caching and deploying of immutable static assets, 2026-07-17. https://vercel.com/changelog/optimized-cdn-caching-and-deploying-of-immutable-static-assets

Third party pages (T):

- T1 Evil Martians, How to Favicon in 2026: Three files that fit most needs (editor's note 2026). https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs
- T2 Paweł Grzybek, SVG favicons that respect theme preference, 2026-03-14. https://pawelgrzybek.com/svg-favicons-that-respect-theme-preference/
- T3 zostera/zostera-brand issue 14, Safari now supports SVG favicons, since Safari 26, opened 2026-09-13. https://github.com/zostera/zostera-brand/issues/14
- T4 Joy of Code, Favicon That Works for Light and Dark Mode, 2021-08-29. https://joyofcode.xyz/dark-mode-favicon
- T5 Wikipedia, ICO (file format). https://en.wikipedia.org/wiki/ICO_(file_format)
- T6 RealFaviconGenerator, Apple touch icon: The Good, the Bad and the Ugly, updated 2014-12-26 (the 180 figure; the transparency and corner rules come from T1 and the pages in the search listing). https://realfavicongenerator.net/blog/apple-touch-icon-the-good-the-bad-the-ugly
- T7 vercel/next.js issue 70272, Deprecated meta tag apple-mobile-web-app-capable, and the same warning in flutter/flutter issue 154596 (search listing). https://github.com/vercel/next.js/issues/70272
- T8 CSS-Tricks, Meta Theme Color and Trickery, and the blink-dev intent "Honor media HTML attribute for meta name=theme-color" (search listing). https://css-tricks.com/meta-theme-color-and-trickery/
- T9 Ben Frain, iOS26 Safari theme-color/tab-tinting with fixed position elements is a mess, 2025-11-16. https://benfrain.com/ios26-safari-theme-color-tab-tinting-with-fixed-position-elements/
- T10 grooovinger, Define the Theme Color for Safari 26, 2026-02-27 (search listing summary). https://grooovinger.com/notes/2026-02-27-safari-26-header-background
- T11 OpenGraphPlus, Twitter Card Image Size & Dimensions Guide (2026). https://opengraphplus.com/consumers/twitter/images
- T12 og-image.org, Twitter/X Card Guide (fetch returned 403; figures from the search listing and T11). https://og-image.org/docs/platforms/twitter
- T13 thx/resvg-js README. https://github.com/thx/resvg-js
- T14 GoWin Tools, The 16×16 Favicon Story, and Polaris, Creating icons (pixel hinting), from the search listing. https://gowin.tools/blog/16x16-favicon-story/

Pages seen only through a search listing (S):

- S1 Krumzi, OG Image Sizes 2026 (Slack, Discord, iMessage reading Open Graph). https://www.krumzi.com/blog/open-graph-image-sizes-for-social-media-the-complete-2026-guide

Pages tried and not readable: X developer documentation (developer.x.com answered 402; developer.twitter.com redirected 307 to docs.x.com, whose guessed path answered 404); Chrome for Developers installability page (404; P7 covers it); Apple HIG app icons (title only, P18).

Local files (L), under /Users/kevinliu/repos/Turboslide at commit 28cb63b:

- L1 apps/studio/src/routes/__root.tsx and the route files deck.$deckId.tsx, embed.$deckId.tsx, present.$deckId.tsx, new.tsx, decks.index.tsx, decks.trash.tsx, print.$deckId.tsx, edit.$deckId.tsx (the `head()` functions).
- L2 packages/chrome/src/GtMark.tsx.
- L3 packages/theme/assets/sprite.svg and sprite-ids.json.
- L4 docs/hosting.md and apps/studio/vite.deploy.config.ts (publicAssets with maxAge 3600, functionRules, the measured cold and warm timings).
- L5 apps/studio/.vercel/output/config.json (the 2026-09-11 preview build, git ignored).
- L6 packages/effects/src/bayer.ts and docs/native.md.
- L7 packages/viewer/src/theme.ts (THEME_BOOT_SCRIPT, applyTheme).
- L8 packages/chrome/src/tokens.css.
- L9 apps/studio/src/styles.css (body background).
- L10 packages/fonts/assets, packages/fonts/export, packages/fonts/src/inter.css.
- L11 pnpm-workspace.yaml (the catalog), package.json.
- L12 AGENTS.md, the deviations list (the `[.]` file naming rule).
- L13 apps/studio/src/routes/llms[.]txt.ts.
- L14 AGENTS.md, The agent surface (the X-Forwarded-Host then Host rule).
- L15 README.md, first paragraph (read only; another workflow is writing it).
- L16 packages/schema/src/deck.ts (the manifest fields).
- L17 AGENTS.md, the parity amendment 5 (`/decks` is the home page).
- L18 packages/theme/scripts/build-sprite.ts and add-icon.ts.
- L19 packages/headless (launch rules), AGENTS.md Chromium section.
- L20 scripts/check.mjs and scripts/check-client-bundle.mjs (the exit code contract).
- L21 AGENTS.md, Chromium (the chromium-1217 build and compare-to-shoot).
- L22 apps/studio/src/routes/api/render.$slideId.ts (the open thumbnail variant).
- L23 apps/studio/src/server/thumbs.ts (deckFacts, the cache layout, thumbResponse headers, warmThumbs).
- L24 scripts/hosted-smoke.mjs.
