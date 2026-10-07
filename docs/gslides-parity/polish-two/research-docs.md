# Docs research, polish two

The docs researcher of polish two (key `research-docs`, port 4712), 2026-10-07. Kevin asked on 2026-10-07 to "make a proper docs page based off of gt docs". This file reads General Translation's docs, reads what Turboslide has today, tries the candidate stacks on port 4712, and proposes how `/docs` is built, what pages it has, and which surfaces it uses. Nothing here is committed. Pictures are under `research-docs/`, and I looked at every one cited.

Machine load during the work: 87 to 155 on the one minute average (after the reboot other sessions' jobs returned). Every number below is a byte count, which the load does not change, and no timing is claimed.

## 1. The decision in brief

- Build `/docs` inside `apps/studio` with **fumadocs-core 16.16.2** (headless: the loader, the page tree, the table of contents, the markdown twins) and **fumadocs-mdx 15.4.6** (its Vite plugin compiles MDX at build), on Turboslide's own layout and CSS. Do not use fumadocs-ui.
- Every docs page, its markdown twin, the search index and the llms files are prerendered at build, like `/home` is today (`apps/studio/vite.deploy.config.ts` 205 to 221). A click between docs pages fetches one small JavaScript file and calls no function, so the docs cost nothing per visit.
- Measured on port 4712 with Turboslide's exact versions (TanStack Start 1.168.60, router 1.170.41, Vite 8.2.2, React 19.3.0, Nitro 3.0.260903-beta): the docs pages load 13.0 KB gzip of JavaScript and 1.6 KB gzip of their own CSS over the root's; the landing and the editor stand-ins load nothing of the docs except the route tree's entries (3,122 B raw for six routes). fumadocs-ui would add 186.8 KB gzip of JavaScript and 13.7 KB gzip of CSS to the docs pages, and it needs Tailwind, which `AGENTS.md` line 39 and `docs/spec/SPEC.md` line 163 rule out.
- The page follows General Translation's docs in structure and features (sidebar, title and description, Copy Page menu for agents, table of contents, callouts, steps, tabs, cards, code with Copy, previous and next, search, `.md` twins, `llms.txt`) and takes the design round's surfaces (the page frame with its rails, the 0, 4, 6 and 8 px ladder, the original Inter, the shared scrollbar, the chrome tokens). Pictures: `research-docs/mock-docs-1440-light.jpg`, `mock-docs-1440-dark.jpg`, `mock-docs-390-light.jpg`.

## 2. What makes General Translation's docs proper

Read from `origin/main` of `/Users/kevinliu/gt/gt-cloud` at `277384080` (2026-10-07) through `git archive`, and the content submodule `generaltranslation/content` at the pointer `d04bb8d` (2026-10-02, "docs: document the Context Management API"). The working tree of gt-cloud is on an August branch and its docs are stale, so line numbers below are from `origin/main`. The live site was read as data.

### 2.1 Versions

| Package | Version in `apps/landing/package.json` |
| --- | --- |
| fumadocs-core, fumadocs-ui | 16.16.1 (also `packages/ui/package.json`) |
| fumadocs-mdx | 15.4.6 |
| fumadocs-openapi | 12.3.0 |
| @fumadocs/cli | 1.7.2 |
| next | 16.2.12 |
| react | 19.2.7 |
| tailwindcss | ^4.3.3 |
| pagefind | 1.5.2 |
| shiki, @shikijs/rehype | ^3.23.0 |

### 2.2 The parts and where they live

| Part | What it does | Where |
| --- | --- | --- |
| Content | MDX in a separate repository (`generaltranslation/content`, submodule `apps/landing/content`), one folder per locale, `meta.json` per folder for order, titles, icons and separators | `content/docs/en-US/meta.json`; `overview/meta.json` uses `---Platform---` separators and link rows |
| Authoring rules | One spine for every section: Get Started or Quickstart, then Guides, then Reference; "Model the docs after the Next.js docs" | `content/DOCS-SKILL.md` 14, 117, 271 |
| Collections | `defineDocs` with an extended frontmatter: `navTitle` (short sidebar label), `related` (cards at the end), `method` (HTTP pill), `index`, `preview`; `lastModified` from the submodule's git log | `apps/landing/source.config.ts`; `src/lib/docs-timestamps.ts` |
| Code blocks | Shiki at build through `rehypeCodeDefaultOptions`, plus a transformer that colours HTTP methods by status token | `source.config.ts` 16 to 37, 73 to 85 |
| Loader | `loader()` with locale folders, a `navTitle` plugin and a method badge plugin; an allowlist of section icons | `src/lib/source.ts` 84 to 150 |
| Layout | fumadocs-ui's notebook layout, re-exported once so every provider shares one module | `packages/ui/src/fumadocs/index.ts`; `src/app/[locale]/docs/layout.tsx` 180 to 211 |
| Header links | Language selector, GitHub stars, Dashboard button, Changelog, Contact; the theme toggle writes the shared cookie | `layout.tsx` 98 to 170, 191 |
| Page header | Title (2rem, 600, -0.04em), description, a meta row with Last updated on the left and Copy page on the right, closed by one hairline | `src/app/[locale]/docs/[variant]/[...slug]/page.tsx` 497 to 541 |
| Copy page | A split button: Copy page copies the `.md` twin (a ClipboardItem holding a pending blob so Safari accepts it), the chevron opens View as Markdown, LLMs.txt, LLMs full, OpenAPI spec on endpoint pages, Open in Claude, Open in ChatGPT | `src/components/docs/DocsPageActions.tsx` 94 to 268, the Safari note 145 to 155 |
| Machine anchors | Invisible links to `llms.txt` and `openapi.json` in the server HTML, for agent readability checkers, excluded from search | `page.tsx` 509 to 534 |
| Table of contents | fumadocs' `clerk` style (a line with the active item) | `page.tsx` 476 to 478 |
| Body components | Callout (Heroicons solid marks), Steps, Tabs (a framework preference that survives pages), Accordion, TypeTable, Files, Cards, Mermaid, APIPage, logo cards | `page.tsx` 76 to 119, 543 to 578 |
| Related pages | Cards from the `related` frontmatter | `page.tsx` 579 to 585; picture `research-docs/gt-docs-page-end.jpg` |
| Footer actions | Edit this page, Report an issue on GitHub, Ask a question, Key concepts | `src/components/docs/docs-footer-actions.tsx` 19 to 42 |
| Previous and next | Off: fumadocs' footer is disabled | `page.tsx` 480 |
| Not found | A miss resolves through a ladder (exact, folder, nearest) and lists the closest pages inside the docs layout | `page.tsx` 235 to 371 |
| Search | Pagefind over the prerendered HTML, built after `next build`, chunked per locale, fetched only when a query runs; fumadocs' search dialog shell | `packages/ui/src/components/frame/Search.tsx` 49 to 58; `apps/landing/pagefind.yml`; picture `gt-docs-search.jpg` |
| Markdown twins | `/docs/<path>.md` and `.mdx` rewrite to a route that serves the raw MDX with a canonical `Link` header and a sitemap pointer; prerendered for every locale | `next.config.ts` 31 to 44, 346 to 364; `src/app/[locale]/llms.mdx/[...slug]/route.ts` 16 to 39 |
| llms files | `/llms.txt` (curated), `/llms-full.txt` (every page, OpenAPI pages left out), `/llms-index.txt`, scoped `llms-scope.txt`, `/sitemap.md`, `/openapi.json` | `src/app/[locale]/llms*.txt/route.ts` |
| Agent text | Client components a machine cannot read are expanded: the supported locales table, and each API page rebuilt as markdown from the OpenAPI document | `src/lib/get-llm-text.ts` 33 to 60 |
| Metadata | Title, description, canonical, hreflang, `alternate` of type `text/markdown`, Open Graph through `/api/og`, JSON-LD TechArticle and BreadcrumbList | `page.tsx` 455 to 496, 612 to 669; `src/lib/docs-structured-data.ts` 117 to 190 |
| Type | Inter with its real italic, scoped to prose surfaces through `next/font/local` | `src/lib/fonts-prose.ts` 9 to 24 |

Pictures: `research-docs/gt-docs-1440-light.jpg`, `gt-docs-1440-dark.jpg`, `gt-docs-390-light.jpg` (the phone layout has a search icon, a sidebar toggle and an "on this page" row under the bar), `gt-docs-copy-menu.jpg` (the six rows), `gt-docs-search.jpg`, `gt-docs-page-end.jpg` (Next steps cards and the footer actions). The consent banner was declined with Reject all before each picture.

### 2.3 What not to copy

Measured on the live page `https://generaltranslation.com/docs/overview/get-started` in Chromium, first load, gzip level 9 of each body:

| Kind | Bytes |
| --- | --- |
| JavaScript | 36 files, 2,965,724 B raw, 950,882 B gzip (the ad tag alone is 166,202 B gzip) |
| CSS | 8 files, 63,239 B gzip |
| Fonts | 763,324 B (`InterVariable` 351,777 B and `InterVariable-Italic` 387,606 B, whole files) |
| HTML | 70,149 B gzip |
| Prefetches after load | 66 requests, 233,214 B gzip (the sidebar links' RSC payloads) |

- The markdown twins carry raw MDX that a reader cannot use: `/docs/overview/get-started.md` contains `<AllLogoCards />`, `<IntroFeature ...>` and `<div className="intro-stack-cards">`, and each heading ends in `[#id]`.
- Search excerpts include the page header's words: a result for "locadex" reads "Last updated Sep 9, 2026. Copy page." (`gt-docs-search.jpg`), because the meta row is inside the indexed body.
- The memory note `docs-perf-investigation.md` (2026-09-14) records the rest: the sidebar tree serialized into every page (172,000 characters), the not-found boundary bringing marketing CSS and fonts into every page, and cache misses on framework variants.

Turboslide should take these features without this weight.

## 3. Turboslide today

### 3.1 Where Documentation goes

- The landing's navigation and footer link "Documentation" to `https://github.com/Kevin-Liu-01/Turboslide/blob/main/docs/README.md` in a new tab (`apps/studio/src/components/home/copy.ts` 91 to 96 and 563 to 568). The editor's Help dialog links the same address (`packages/chrome/src/dialogs/Help.tsx` 75 to 84).
- That page is the repository's index of engineering documents: the next program, the design round, the guard, the closed rounds, the hosting move. The file tree beside it shows the planning folder `gslides-parity`, so the product's own Documentation link lands on a page that names the competitor in a folder name. Picture: `research-docs/ts-documentation-link-target.jpg`.
- `https://www.turboslide.com/docs` answers 404 with the Not found page. Picture: `research-docs/ts-docs-404-1440.jpg`.
- `robots.txt` (`apps/studio/public/robots.txt`) has no sitemap line, and the studio has no sitemap route.

### 3.2 Material that a docs site can be made from

| Material | Where | Size | For whom |
| --- | --- | --- | --- |
| What Turboslide is, how to start it, the CLI groups | `README.md` 8 to 16, 74 to 134 | 242 lines | users and agents |
| The ten tasks of a seller as one line how-tos | `packages/chrome/src/dialogs/Help.tsx` 10 to 48 | 10 rows | users |
| The menu model and every shortcut | `packages/chrome/src/menus/model.ts`, `menus/keys.ts`, `ShortcutsDialog.tsx` | 4,075 and 1,543 lines | users |
| The nine themes | `packages/theme/src/themes.ts` 157 to 226 (Simple, General Translation, Swiss, Mint, Coral, Night, Slate, Sand, Signal) | | users |
| The download formats | `packages/chrome/src/dialogs/Download.tsx` 229 to 236 | | users |
| The PowerPoint export | `docs/pptx.md` | 463 lines | users, partly |
| The deck bundle: pack, unpack, push, pull | `docs/deck-transfer.md` | 223 lines | agents |
| The deck grammar | `docs/grammar.md`, generated by `pnpm generate:contracts` | 861 lines, 275,182 B | agents |
| The agent guide | `packages/agent/generated/llms.txt` (6,602 B) and `llms-full.txt` (80,441 B), served at `/llms.txt` and `/llms-full.txt` | | agents |
| The contracts | `packages/agent/generated/describe.json` (labels, sentences, groups), `cli.json` (usage and option descriptions), `openapi.json` (2,430,266 B raw, 160,803 B gzip as served), `mcp-tools.json` (2,889,242 B), `manifest.json` | | agents |
| The four skills | `skills/turboslide-{api,create,studio,verify}/SKILL.md` and `references/` | 582,573 B of references | agents |
| Hosting | `docs/hosting.md` section 1 (the store selection and its variables), `docker/render-worker.Dockerfile` | | people who run it |

The counts do not agree. `README.md` 11 says "the same 194 actions over the CLI, MCP and HTTP". The generated files hold 194 in `manifest.json` (`actionCount`), 181 in `cli.json`, 170 in `mcp-tools.json`, 173 action paths in `openapi.json` and 178 in `describe.json`. The reference pages should print the count per transport from the generated files and never type a number.

`docs/updates.md` is the release record for the team (internal paths, guard log lines, commit hashes). A changelog for readers of the docs would be new writing.

### 3.3 The stack

- `apps/studio` is TanStack Start on Vite with file routes (`apps/studio/src/routes`), React 19.3.0, TypeScript 6.0.3, Nitro with the Vercel preset in `vite.deploy.config.ts`.
- No Tailwind: `apps/studio/vite.config.ts` 14, `AGENTS.md` 39, `docs/spec/SPEC.md` 163. The chrome is `packages/chrome/src/tokens.css` plus one CSS file per component.
- The root links six stylesheets on every page (Inter, tokens, brand, the sheet, the stage, the app) and preloads the Latin Inter subset (`apps/studio/src/routes/__root.tsx` 10 to 24, 128 to 172, the preload at 147).
- The plain pages share `PageFrame` (`apps/studio/src/components/home/PageFrame.tsx`): the 1104 px column with one rail on each side, a 58 px bar with the lockup, the seam with its crosses (`grammar.css`, `page-frame.css`). Not found uses it (`__root.tsx` 175, 196 to 236).
- `/home` is prerendered at build with `pages: [{ path: '/home' }]`, `autoStaticPathsDiscovery: false`, `crawlLinks: false`, `failOnError: true` (`vite.deploy.config.ts` 205 to 221).
- `scripts/check-client-bundle.mjs` 51 to 55 sets preload ceilings per route (`/decks` 600,000 B, `/deck/gt-brand` 1,000,000 B, `/edit/gt-brand` 2,000,000 B).
- The competitor guard reads the public text roots listed in `packages/lint/src/brand/competitor.ts` 73 onward. A docs content folder is not among them yet.
- Production `/home` for scale: 1,393,161 B raw and 392,746 B gzip of JavaScript in 15 files, 27,561 B gzip of CSS, 113,752 B of font (the Latin subset).

## 4. Which Fumadocs versions run on TanStack Start and Vite

From the packages' own registry entries and docs:

| Fact | Source |
| --- | --- |
| Fumadocs 15.2 (2025-03-28) added the framework layer for React Router and TanStack Start | fumadocs.dev/blog/v15-2 |
| Fumadocs 16 (2025-10-22) changed the API for Vite frameworks | fumadocs.dev/blog/v16 |
| fumadocs-core has `./framework/*` from 15.5.0 and lists `./framework/tanstack` in 16.16.2 | `npm view fumadocs-core@<v> exports` |
| fumadocs-ui has `./provider/*` from 15.5.0 and `./provider/tanstack` in 16.16.2 | `npm view fumadocs-ui@<v> exports` |
| fumadocs-mdx has `./vite` in 12.0.0 (2025-09-20) and not in 11.6.0 among the versions read; `./macro` (collections defined in app modules, no `.source` folder) from 15.2.0 | `npm view fumadocs-mdx@<v> exports` |
| fumadocs-mdx 15.4.6 peers: `vite` 7.x or 8.x, `fumadocs-core` ^16.15.3, `react` ^19.2.0 | `npm view fumadocs-mdx@15.4.6 peerDependencies` |
| fumadocs-core 16.16.2 peers include `@tanstack/react-router` 1.x, `react` ^19.2.0, `zod` 4.x; all optional except React | `npm view fumadocs-core@16.16.2 peerDependencies` |
| fumadocs-ui requires Tailwind CSS 4 in its TanStack Start setup; it also ships a prebuilt `dist/style.css` (112,952 B raw, 16,147 B gzip, Tailwind 4.3.3 output with radii up to 1rem and pill corners) | fumadocs.dev/docs/manual-installation/tanstack-start; the installed package |
| The official example `examples/tanstack-start` (commit `7bbb2f3a`, 2026-10-03) pins the same TanStack, React and Nitro versions as Turboslide | github.com/fuma-nama/fumadocs |

Latest on the registry today: fumadocs-core and fumadocs-ui 16.16.2 (2026-10-05), fumadocs-mdx 15.4.6 (2026-10-02), fumadocs-openapi 12.3.0. fumadocs-core shipped 29 releases between 2026-07-27 and 2026-10-05, so it is pinned exactly in the catalog and moved by a PR like every other entry.

## 5. The trial on port 4712

Prototypes were built in my scratch folder (never in the worktree, so no lane's install changed) from the official example, with Turboslide's versions pinned, eleven sample pages, a `/` and an `/edit` route standing in for the landing and the editor, `vite build` with prerender, and `node .output/server/index.mjs` on port 4712. A Chromium script recorded every script, stylesheet and font of a first load and gzipped each body. The server was stopped after each reading.

| Build | `/` JS raw | `/` JS gzip | `/docs` JS gzip | `/docs` CSS gzip | Client navigation between docs pages |
| --- | ---: | ---: | ---: | ---: | --- |
| Base: no docs routes | 341,399 | 108,231 | | | |
| A: the example as written (fumadocs-ui, the Lucide icon plugin, the loader not split) | 998,691 | 282,649 | 456,287 | 13,675 | a server function |
| A2: fumadocs-ui, no icon plugin, loader split | 344,621 | 113,802 | 300,626 | 13,675 | a server function |
| B: headless, server function loader | 344,357 | 113,561 | 127,409 | 531 | `GET /_serverFn/...`, a function call per click |
| B, static server function (`@tanstack/start-static-server-functions` 1.167.39) | 345,329 | 113,867 | 128,078 | 531 | `GET /__tsr/staticServerFnCache/<hash>.json`, which the node server answered 404, leaving the page blank |
| B, isomorphic loader (recommended) | 344,521 | 113,148 | 125,413 | 531 | only the page's own chunk, 2,584 B gzip |
| B, isomorphic loader without the loader split | 367,387 | 120,250 | 124,125 | 531 | as above |
| B on the product's sheets (the mock) | 345,045 | 113,372 | 126,394 | 7,280 (6 files; docs only: 1,618 + 623 + 513) | as above |

What the trial shows:

1. **The example leaks into every page.** As written, the `/docs/$` route's loader imports the server `source` with `lucideIconsPlugin()`, and TanStack Start keeps a route's loader in the root preload unless told otherwise. `/` loaded a 688,421 B raw chunk with the Lucide icon set and the page tree serializer: +657,292 B raw, +174 KB gzip on the landing stand-in. Dropping the icon plugin removes most of it; the loader alone still adds 22,866 B raw to every page until the route sets `codeSplitGroupings: [['loader'], ['component']]`.
2. **fumadocs-ui is heavy on the docs page.** With both leaks fixed, A2's docs page loads 186.8 KB gzip more JavaScript than the base, including a 70,580 B gzip search dialog chunk fetched at page load and a 27,938 B gzip `remark` chunk, plus 13.7 KB gzip of CSS.
3. **A server function loader costs a function call per click.** The fumadocs example's `createServerFn` loader makes every client navigation between docs pages a request to the server. On Vercel that is a function invocation per click.
4. **The static server function variant is not reliable yet.** Its cache files are written during prerender. The Nitro node server answered 404 for them, so the client navigation rendered nothing. It may work on the Vercel preset, but it needs a reading on a preview first.
5. **An isomorphic loader needs no server at all.** fumadocs-mdx's browser collection carries the frontmatter and `meta.json`, so `source.getPage()` and `source.getPageTree()` run in the browser. The loader then runs the same code in the prerender and in the browser. A click fetched only the next page's chunk (`.../cli.mdx...js`, 2,589 B gzip), the tabs switched, the search returned hits, and the console had no error.
6. **The prerendered HTML holds the whole article.** `/docs/index.html` carries the title, the description, every heading, the steps and the table, so a reader without JavaScript and a crawler get the page.
7. **Dev mode works.** `vite dev` on 4712 served the pages and the `.md` twin, and an edit to an `.mdx` file showed in the next request.
8. **The twins need work.** fumadocs' `processed` markdown keeps `<Callout>`, `<Steps>`, `<Tabs>` and `<Cards>` as JSX and appends `[#id]` to headings, the same defect as General Translation's twins. fumadocs-core's `remark-llms` plugin takes `headingIds: false` and a `stringify(node)` callback (`fumadocs-core/dist/remark-llms-*.d.ts`, `stringifier-*.d.ts`), so each component can write its own markdown: a callout as a quoted note, steps as a numbered list, tabs as one subheading per tab, cards as a list of links.

The mock in the pictures is prototype B with the worktree's own `tokens.css`, `brand.css`, `inter.css`, `grammar.css` and `page-frame.css` linked, and a 72 line `docs.css`. It is a research picture; the lane writes the real sheet. Two gaps in it are known: at 390 px the sidebar is hidden with no Menu control, and the search pill shows only the `⌘K` chip, which means nothing on a touch screen.

## 6. Proposals and their costs

### P1. The stack: fumadocs-core and fumadocs-mdx, headless, on the product's layout

- Add `fumadocs-core` 16.16.2 and `fumadocs-mdx` 15.4.6 to the catalog, exact, and to `apps/studio` with `pnpm add --filter @turboslide/studio`. Add `fumadocsMdx()` to the plugin list of `vite.config.ts` and `vite.deploy.config.ts`. `esbuild` is already in `allowBuilds`.
- Collections with the macro API in `apps/studio/src/docs/source.ts`: `defineDocs({ dir: 'content/docs', docs: { async: true, postprocess: { includeProcessedMarkdown: true } } })` and `loader({ baseUrl: '/docs' })`, no icon plugin.
- Cost: 13.0 KB gzip of JavaScript and about 2 KB gzip of CSS on docs pages (8,023 B gzip of it is fumadocs' client loader); about 3 KB raw of route tree on every other page; MDX and Shiki work at build. Install size: fumadocs-core 455,396 B unpacked, fumadocs-mdx 181,371 B unpacked, with build-time dependencies (Shiki 4, remark, unified, `@mdx-js/mdx` 3, esbuild 0.28, chokidar).
- Benefit: the content pipeline General Translation uses (the same `meta.json` grammar, the same loader, the same twin and llms helpers), so Kevin reads one model across both docs.

### P2. The alternative: MDX through `@mdx-js/rollup` 3.1.1 with own code

Saves the 8 KB gzip client loader on docs pages. Costs own code for the `meta.json` order, the page tree, the table of contents, heading ids, the twins and the search index, about 300 to 500 lines to keep. Not recommended: the saving is small and only on docs pages.

### P3. Rejected: fumadocs-ui

It brings Tailwind (the plugin or the prebuilt 16 KB gzip sheet with its preflight), Radix, Lucide and its own buttons, popovers and dialog beside the chrome's `.pt-ib`, `.pt-float` and `.pt-window`, which breaks the one shared component rule. Its corners run to 1rem and pills, against the 0, 4, 6 and 8 ladder and the `css/radius` and `css/no-shadow` lints. Measured +186.8 KB gzip of JavaScript and +13.7 KB gzip of CSS on docs pages.

### P4. Routes and files

| File | Purpose |
| --- | --- |
| `apps/studio/content/docs/**/*.mdx`, `meta.json` | The written pages (a folder distinct from the repository's `docs/`, which stays the engineering record) |
| `apps/studio/content/docs/reference/*.mdx`, `shortcuts.mdx`, `agents/grammar.mdx` | Generated pages, written by `pnpm generate:contracts`, committed, "do not edit" in their frontmatter |
| `apps/studio/src/routes/docs.tsx` | The docs layout: links `docs.css` in its `head`, draws the page frame, the sidebar and the bar |
| `apps/studio/src/routes/docs.$.tsx` | The page: isomorphic loader (no `createServerFn`), `codeSplitGroupings: [['loader'], ['component']]`, `head` with the page's title, description, canonical, `og:title`, `og:description` and `<link rel="alternate" type="text/markdown">` |
| `apps/studio/src/routes/docs.{$}[.]md.ts` | The markdown twin, `text/markdown; charset=utf-8`, with a canonical `Link` header |
| `apps/studio/src/routes/docs.search[.]json.ts` | The search index |
| `apps/studio/src/routes/llms[.]txt.ts` | Gains a "Documentation" section listing every twin |
| `apps/studio/src/routes/docs.llms-full[.]txt.ts` | Every written page as markdown, for agents that read the guides whole |
| `apps/studio/src/routes/sitemap[.]xml.ts` | `/home` and every docs page; `robots.txt` names it |
| `apps/studio/src/components/docs/*` and `docs.css` | The components of section P8, plain CSS on the tokens |

Prerender: `vite.deploy.config.ts` builds the `pages` list from the content folder at config time (each page, its `.md`, `/docs/search.json`, `/docs/llms-full.txt`, `/sitemap.xml`), keeping `autoStaticPathsDiscovery: false`, `crawlLinks: false` and `failOnError: true`. A route rule gives `/docs/**` the same caching as `/home/**`'s pages. Every docs request is then a CDN file: no function runs for a reader.

### P5. The information architecture

Three groups in the sidebar, one level of nesting, about 19 written or generated pages plus 16 reference pages. Each page follows the General Translation spine: what it is, how to do it, the reference.

| Page | URL | Source |
| --- | --- | --- |
| Getting started | `/docs` | Written. What Turboslide is (`README.md` 8 to 16), the first presentation, no account needed and what Sign in does, the ten tasks (`Help.tsx` 10 to 48), the agent paths in one tab set |
| The editor | `/docs/editor` | Written from the menu model (`menus/model.ts`, `menus/strings.ts`): the menus, the toolbar, the filmstrip, the canvas, speaker notes, Find and replace, Version history |
| Slides and layouts | `/docs/editor/slides` | Written: new, duplicate, skip, move, layouts, sections, Import slides |
| Text, pictures and shapes | `/docs/editor/objects` | Written: text, pictures, logos, shapes and lines, tables and charts where in the default view |
| Advanced tools | `/docs/editor/advanced-tools` | Written from `README.md` 30 to 53 and `docs/FOCUS.md`: the switch in Tools and what it shows |
| Presenting | `/docs/presenting` | Written from `components/Slideshow.tsx`, `PresenterPage.tsx` and the present strings (`menus/strings.ts` 1031 onward) |
| Sharing and people | `/docs/sharing` | Written from `dialogs/Share.tsx`, `share-links.ts`, the account rows: links, people, presence and Follow, comments, Continue with Google, the presentations in this browser |
| Themes and brand kits | `/docs/themes` | Written from `themes.ts` 157 to 226, `dialogs/Tailor.tsx` and the brand actions |
| Download and export | `/docs/export` | Written from `Download.tsx` 229 to 236 and the reader parts of `docs/pptx.md`: PDF, PowerPoint in its two modes, long decks in batches |
| Keyboard shortcuts | `/docs/shortcuts` | Generated from `menus/keys.ts` and `menus/model.ts`, the data of the Keyboard shortcuts dialog, Mac and Windows chords |
| Agents | `/docs/agents` | Written from `packages/agent/generated/llms.txt` (Rules, Leases and revisions): one action table, three transports, `baseRevision` and 409, leases, the author header, the bearer token |
| The CLI | `/docs/agents/cli` | Written from `README.md` 115 to 134 and `cli.json`: running it, `--json`, exit codes, the command groups |
| MCP | `/docs/agents/mcp` | Written from `llms.txt` "MCP over HTTP": `turboslide mcp` over stdio, `/mcp` over HTTP, `deck_<action>` tools, an attached studio page |
| HTTP actions | `/docs/agents/http` | Written from `llms.txt` "Calling an action over HTTP" and "Renders and exports over HTTP" |
| Skills | `/docs/agents/skills` | Written from the four `SKILL.md` front matters, with links to each |
| Deck grammar | `/docs/agents/grammar` | Generated from the same source as `docs/grammar.md` |
| The page API | `/docs/agents/browser` | Written from `skills/turboslide-studio/references/browser-api.md`: `window.turboslide.studio` |
| Action reference | `/docs/reference` and `/docs/reference/<group>` for deck, slide, block, asset, render, lint, version, view, export, studio, admin, presence, sync, comment, share, account | Generated (P6) |
| Run Turboslide yourself | `/docs/self-hosting` | Written from `README.md` 74 to 113 and `docs/hosting.md` section 1, if Kevin wants it (question 1) |

### P6. The API reference, generated from the contracts

- A new target `docs.ts` in `packages/agent/src/generate` writes one MDX page per group from `describe.json` (label, sentence, mutates, group), `cli.json` (usage and option descriptions) and the transports in `manifest.json`. Each action is one `h2` with its id as anchor, its sentence, a table of its input fields (name, type, required, description), the CLI usage, the MCP tool name, the HTTP endpoint and which transports carry it. The group page opens with the count per transport, read from the files.
- Committed beside the other generated contracts; check step 3 already fails a stale copy.
- fumadocs-openapi is not used: the OpenAPI document is 2.4 MB, and General Translation's API page renders on the client with its own bundle.
- Cost: one generator file of about 150 lines and 16 pages. The reference adds about 64 KB raw, 16.8 KB gzip, to the search index (178 rows measured from `describe.json` and `cli.json`).

### P7. Search

- An index written at build by `/docs/search.json`: one row per heading section from fumadocs' `structuredData`, with the page title, the heading, its anchor and its text, and the header meta row left out.
- The dialog and the index load on the first open (`React.lazy`), with `⌘K` and `/` as keys. A short scorer ranks title, heading and text matches. No dependency.
- Estimated size: the reference 16.8 KB gzip plus about 30 KB gzip for 20 written pages, fetched once. Pagefind (General Translation's choice) is the fallback if the docs grow past a few hundred pages.

### P8. The page on the product's surfaces

- Frame: `PageFrame`'s 58 px bar and rails; the bar holds the lockup, a Documentation link after a hairline, the search pill, the theme button the landing uses, and New Presentation (`.pt-ib is-solid`). Body: sidebar, article and table of contents inside the 1104 px column (sidebar 184 px, article about 600 px, contents 168 px); the table of contents hides under 1180 px; under 720 px a Menu button in the bar opens the sidebar and the search pill becomes an icon button.
- Corners on the ladder (`docs/DESIGN.md` 3.1): buttons, fields, tabs and the menu plate 6 px; code blocks, callouts, cards and the search dialog 8 px through `.pt-window`; key chips and the step numbers 4 px through `.pt-kbd`; sidebar rows and table of contents rows square. Separation by `--pt-edge` and `--pt-ring`, no blurred shadow.
- Type: the original Inter with Inter's own features (`DESIGN.md` 4.2), headings in `--pt-display` at weight 500 as `page-frame.css` sets them, body 16 px, lead 17 px; numbers in tables and step counters in `var(--pt-numerals)`; code in `--pt-mono`.
- Scrollbar: the global rule with no class; `.pt-scroll` on the sidebar and the table of contents; `.pt-scroll-x` on code blocks.
- Colour: chrome tokens only (`--pt-ink`, `--pt-ink-2`, `--pt-hair`, `--pt-hair-soft`, `--pt-plate`, `--pt-edge`), light and dark through `:root[data-theme]`.
- Icons: Heroicons solid from the sprite for callout marks and menu rows; brand marks only for Claude and ChatGPT in the Copy Page menu.
- Floating parts: the Copy Page menu and the search dialog on `.pt-float` and `.pt-window` through `useLayer` (`packages/chrome/src/Layer.ts`) and `place()`. The editor's `Menu.tsx` is not imported, because it brings the menu model (`menus/keys.ts`, `menus/model.ts`).
- Components: Callout, Steps, Tabs, Cards, code with Copy (the pattern of `ConnectCard.tsx`'s Copy button), tables, and the Copy Page split button with View as Markdown, llms.txt, Full documentation for agents, Open in Claude, Open in ChatGPT, and OpenAPI on reference pages. Each component also declares its markdown form for the twins (section 5, item 8).
- End of page: previous and next links from the page order, then Edit this page and Report an issue on GitHub.
- Not found inside `/docs`: the docs layout with the closest pages by name, as General Translation does it.
- Words: sentence case headings and labels, Title Case only on buttons (Copy Page, New Presentation), no em dash, plain technical English, no competitor word. Writers also avoid "in Google" and "Google Docs", which the guard's pattern matches; "Continue with Google" stays.

### P9. The links that change

- `copy.ts` 91 to 96 and 563 to 568: `href: '/docs'`, no `external`, a router link.
- `Help.tsx` 75 to 84: `/docs`, still in a new tab from the editor so the editor stays open.
- `robots.txt`: a `Sitemap:` line.

### P10. Gates

- `competitor.ts` `TEXT_ROOTS` gains `apps/studio/content/docs`.
- The brand lint's word rules (the em dash rule and Title Case on buttons) read the MDX text, or a vitest over the content folder does.
- `check-client-bundle.mjs` gains a `/docs` ceiling (450,000 B of preloaded chunks leaves room over the 384,020 B measured) and asserts that the preloads of `/home`, `/decks` and `/edit/gt-brand` name no docs module.
- A link check over the content: every internal link resolves to a page or an anchor.
- Matrix rows: `docs.nav.client` (a click between pages makes no `/_serverFn` request), `docs.copy-page`, `docs.search`, `docs.twin` (the twin is markdown with no JSX), `docs.links` (nav, footer and Help reach `/docs`), each at 1440 and 390 in light and dark.

## 7. Questions only Kevin can answer

1. Should the docs have a "Run Turboslide yourself" page? Default: yes, one page from the README's Getting started and the store variables of `docs/hosting.md` section 1, with no Vercel or Cloudflare account details.
2. Should the docs keep the 1104 px column of every other page? Default: yes; the article is about 600 px wide and the table of contents hides under 1180 px.
3. Should pages show "Last updated"? Default: no. Vercel builds from a shallow clone, so git dates would be wrong; General Translation reads them from its content submodule's full history.
4. Should the Copy Page menu have Open in Claude and Open in ChatGPT, as General Translation's does? Default: yes.
5. Should the docs have release notes? Default: not in this round. `docs/updates.md` is written for the team; a user changelog is a separate piece of writing.
6. Should the guides document the features behind Advanced tools? Default: yes, on one Advanced tools page that names the switch; the reference lists every action either way.
7. Should a request with `Accept: text/markdown` on a docs URL answer markdown, as General Translation's does? Default: not in this round. Prerendered pages are served as files before a rewrite runs, so this needs a reading on a preview; the `.md` twins and the `alternate` link already serve agents.
8. Should search use the own index or Pagefind? Default: the own index, loaded on first open, with no dependency.
