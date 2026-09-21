# Vercel and GitHub facts read for the hosting audit

Read only, on 2026-09-20 between 11:50 and 12:10 PDT, with Vercel CLI 58.4.4 on Node 24.13.0 logged in as `kevin-liu-01`, `gh` logged in as `Kevin-Liu-01`, and `vercel api` GET calls where the CLI has no read subcommand. Nothing was created, changed or deleted on Vercel or GitHub. Every value that looked like a token was filtered before it reached this file; environment variables are named, never valued.

## 1. Accounts and teams

| Fact | Value |
| --- | --- |
| `vercel whoami` | `kevin-liu-01` |
| `vercel teams ls` | `kl01s-projects` (KL01's projects, the linked scope), `general-translation`, `hths-digital-magazine`, `hths-magazine` |
| kl01s-projects | `team_KpAxFhYN63bKUy7bj8bNoOkh`, plan `pro`, Kevin `OWNER`, no team deployment policy, `concurrentBuilds: 1`, `buildMachine.default: elastic` |
| general-translation | `team_8oC6z09EmYEXHlv0GgC6Gucu`, plan `pro`, Kevin `MEMBER`; owners `pie575`, `faviles28`, `brian-lou`, `ernest-4753`, `archie-mckenzie`; `concurrentBuilds: 1` |
| GitHub repository | `Kevin-Liu-01/Turboslide`, public, default branch `main`, pushed 2026-09-20T18:40:56Z |
| GitHub organization `generaltranslation` | enterprise plan, 5 public and 40 private repositories; Kevin's membership `member`, `active` |

## 2. The personal project `turboslide` (kl01s-projects)

`vercel project inspect turboslide` and `GET /v9/projects/prj_sWt52OAxiFaboav50hepmtl7Ct74`:

| Fact | Value |
| --- | --- |
| Id | `prj_sWt52OAxiFaboav50hepmtl7Ct74`, created 2026-09-10 |
| Root directory | `apps/studio` |
| Framework | `nitro` (detected from the output; `apps/studio/vercel.json` sets `framework: null` and the build command `NITRO_PRESET=vercel pnpm run build:deploy`) |
| Node | `24.x` |
| Regions | `serverlessFunctionRegion: iad1`, `functionDefaultRegions: ["iad1"]`; requests enter through `sfo1` (`x-vercel-id: sfo1::iad1::...`) |
| Compute | `fluid: true`, `elasticConcurrencyEnabled: true`, default memory type and timeout at the project defaults (null) |
| Build machine | `standard` |
| Git | GitHub `Kevin-Liu-01/Turboslide`, production branch `main`, no deploy hooks, fork protection on |
| Protection | `ssoProtection.deploymentType: all_except_custom_domains` (previews behind Vercel Authentication, production open) |
| Analytics | Speed Insights on, Web Analytics on |
| Skew protection | 43,200 s |
| Connected stores (API) | `[]`, although `BLOB_READ_WRITE_TOKEN` is set for production, preview and development |
| Latest production | `turboslide-218fcapng-kl01s-projects.vercel.app`, Ready, created 2026-09-20 11:40:59 PDT; aliases `turboslide.vercel.app`, `turboslide-kl01s-projects.vercel.app`, `turboslide-git-main-kl01s-projects.vercel.app`; eight function directories of 87.36 MB each (`__server`, `_serverFn/[...]`, `api/decks/[...]/bundle`, `api/decks/bundle`, `api/export/[...]` and three hidden) in `iad1` |

`vercel env ls` (names and targets only):

| Variable | Targets | Type |
| --- | --- | --- |
| `BLOB_READ_WRITE_TOKEN` | production, preview, development | encrypted |
| `TURBOSLIDE_TOKEN` | production; preview (a second value) | sensitive |
| `TURBOSLIDE_AUTHORIZE` | production | sensitive |
| `TURBOSLIDE_REALTIME` | production | sensitive |
| `TURBOSLIDE_MAIL` | production | sensitive |
| `TURBOSLIDE_SESSION_SECRET` | production | sensitive |
| `TURBOSLIDE_DOWNLOAD_SECRET` | production | sensitive |
| `TURBOSLIDE_PUBLIC_STORE_HOST` | production | sensitive |

No `REDIS_URL`, `UPSTASH_*`, `DATABASE_URL`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `TURBOSLIDE_PUBLIC_ORIGIN`, `TURBOSLIDE_EMBED_ANCESTORS` or `TURBOSLIDE_TRUST_PROXY` is set.

Production headers (`curl -sI`, 2026-09-20 12:03 PDT): `/` answers 307 to `/new` with `x-robots-tag: noindex` from the edge (`x-vercel-id: sfo1::...`, no function); `/new`, `/decks`, `/decks/trash`, `/openapi.json` and `/llms.txt` answer from the function (`sfo1::iad1::...`, `x-vercel-cache: MISS`); `/home` is a CDN `HIT`; every function response carries a report only CSP whose `img-src` names `https://ggmycvj7j6224ay5.public.blob.vercel-storage.com`, the public store's host (the store id lowercased).

## 3. The General Translation team

`vercel project ls --scope general-translation`: `prototemplate` (www.prototemplate.com), `dashboard`, `landing`, `admin`, `glyphfield`, `gtm`, `company-docs`, `databricks-devhub`, `databricks-localization-infrastructure-demo`, `mongodb-lottie-demo`, `databricks-lottie-demo`, `ramp-lottie-demo`, `rrweb-demo`. No `turboslide` project.

Team deployment policy (`GET /v2/teams/general-translation` `.deploymentPolicy`): one Git Sources rule, enabled, for production and preview, allowing GitHub organizations `generaltranslation` and `gt-onboarding` and nothing else. No Deployment Sources rule (CLI, REST API and deploy hooks are not restricted by the team policy).

The `prototemplate` project on the team (`prj_TigGqAIx1lGTTzMDziYBqG8sqtca`) overrides that rule: its `deploymentPolicy.gitSources[0].sources` lists `generaltranslation` and `kevin-liu-01/Prototemplate`, for production and preview. Its production deployments are `READY` with `source: git` from `Kevin-Liu-01/Prototemplate` `main` since 2026-09-18T22:57:28Z (twelve of them by 2026-09-20T18:43:27Z); the memory note of 2026-09-08 recorded them as BLOCKED since 2026-09-01 under the team rule. The override is the constraint's answer: a personal repository deploys to the team when the project's own Git Sources rule names it. Who may edit a project's override was not tested (the dashboard shows an Inherit or Override switch under Build and Deployment; the docs page marks the section "Permissions Required: Deployment Policies" without listing roles). `vercel api` has no readable deployment policy endpoint (`/v1/deployment-policies` and `/v1/teams/<id>/deployment-policies` both 404).

Team stores (`GET /v1/storage/stores?teamId=team_8oC6z09EmYEXHlv0GgC6Gucu`): Blob `scira-multilingual` (58.1 MB), `gt-blog-blob` (80.5 MB), `example-ai-chatbot-blob` (0 B); integration stores `neon-lightBlue-school`, `codex-postgres`, `codex-cache`. None belongs to Turboslide. `vercel blob list-stores --scope general-translation` ignored the scope and printed the linked project's store.

`vercel domains inspect generaltranslation.com --scope general-translation`: registrar third party, nameservers `dns1.registrar-servers.com` and `dns2.registrar-servers.com` (not Vercel's), Edge Network yes; subdomains in use: `gtm`, `ramp-lottie-demo`, `glyphfield`, `company`, `admin`, `dash`, `www` and the apex (landing). A new subdomain needs a DNS record at the registrar.

`vercel project inspect landing --scope general-translation`: root `apps/landing`, Next.js, build `sh ../../scripts/deploy-landing.sh`, install `pnpm i --frozen-lockfile --filter=landing...`, Node 24.x. The prototemplate record shows the team's project defaults: `fluid: true`, `functionDefaultRegions: ["iad1"]`, `functionDefaultTimeout: 300`, `functionDefaultMemoryType: standard`, `buildQueue.configuration: WAIT_FOR_NAMESPACE_QUEUE`.

## 4. The Blob store behind production

`vercel blob list-stores` (linked project): `turboslide-decks`, `store_GGmYcVj7j6224Ay5`, Active, `iad1`, 1.26 GB, 17.1k files, connected to `turboslide`, 9 days old. `GET /v1/storage/stores/store_GGmYcVj7j6224Ay5`: `access: public`, `size: 1352402106`, created 2026-09-11T19:21:59Z. The other stores on kl01s-projects belong to other projects (`maryanne-birthday-media`, `nicky-birthday-media`, `agent-machines-blob`, `nextjs-ai-chatbot2-blob`, `lumachor-blob`).

Sizing (`scripts/blob-sizing.mjs`, 18 listing pages of 1,000, 9.1 s, the token sourced from `.turboslide/vercel-dev.env` in a subshell; `blob-sizing.json` beside this file): 17,201 objects, 1,359,673,370 bytes (1.266 GiB), oldest object 2026-09-12T00:36Z, newest 2026-09-20T19:07Z.

| Prefix | Objects | MiB | What it is |
| --- | --- | --- | --- |
| `exports/` | 2,114 | 649.5 | produced export files under `exports/<deckId>/<jobId>/`, 219 deck ids (72 decks exist), no `.jobs/` record left; 1,193 objects under a day old (361.1 MiB), 353 at 1 to 3 days (24.2 MiB), 362 at 3 to 7 days (64.3 MiB), 206 over 7 days (200.0 MiB) |
| `decks/` | 13,617 | 568.2 | 72 decks: `assets/` 2,901 twins 483.7 MiB; `snapshots/` 977 objects 43.7 MiB; `.turboslide/presence/` 4,149 objects 29.8 MiB plus 37 `presence.json`, 33 `pulse.json` and 43 `copies/`; `versions/` 3,907 objects 4.4 MiB; `slides/` 1,172 objects 2.5 MiB; `.thumbs/` 216 objects 2.4 MiB; `deck.json` 72; `access.json` 57; `leases.json` 12; `comments/` 11 |
| `bundles/` | 4 | 73.3 | bundle uploads (`bundle-core.ts` 219 to 230) |
| `builds/` | 10 | 5.4 | web page downloads (`download.ts` 650 to 669) |
| `users/` | 943 | 0.2 | per anonymous principal deck indexes |
| `links/` | 477 | 0.04 | link grants |
| `vitals/` | 35 | 0.01 | |
| `index/` | 1 | 0 | |

Size buckets: 26 objects over 8 MB carry 495.3 MiB (exports and bundles); 844 objects of 256 KB to 1 MB carry 390.4 MiB (twins).

## 5. Vercel documentation facts used by the plan

- Redirects (`/docs/routing/redirects`, `/docs/project-configuration/vercel-json`): `permanent: true` answers 308, `false` 307; "the method and body never changed" for both; `source` matches the pathname excluding the query string; "Query parameters pass through unless you explicitly replace them in the destination"; redirects are processed at the edge across all regions; a `has: [{ type: "host", value: "..." }]` clause scopes a rule to one hostname; a WAF custom rule with the redirect action "execute[s] before CDN configuration redirects" and needs no redeploy (307).
- Builds (`/docs/builds/configure-a-build`): framework Other with the Build Command override on and empty skips the build; the output is `public` if it exists, else the root directory.
- Git (`/docs/project-configuration/git-configuration`): `"git": { "deploymentEnabled": false }` turns off automatic deployments from the connected repository.
- Deployment policies (`/docs/deployments/deployment-policy`): Git Sources and Deployment Sources rules, team default with per project override under Build and Deployment.
- Store transfer (`/docs/storage`): Storage, the store, Settings, Transfer Store, a destination account or team.
- Project transfer (`/docs/projects/transferring-projects`): owner of the source team and member of the target; domains and aliases move; Blob has its own transfer; the `turboslide.vercel.app` alias would move with the project, which rules a project transfer out for this plan.
- Roles (`/docs/rbac/access-roles`): a Member can create projects, deployments, domains and environment variables; a Member or Project administrator can save and apply WAF rules; team settings stay with owners.
- Pricing (`/docs/pricing`, `/docs/plans/pro-plan`, `/docs/functions/usage-and-pricing`, `/docs/vercel-blob/usage-and-pricing`): Pro is $20 per month with one seat and $20 of usage credit, the flat rate CDN tier includes 1 million requests and 1 TB per month; Fluid compute in `iad1` is $0.128 per active CPU hour, $0.0106 per GB hour of provisioned memory and $0.60 per million invocations; Blob is $0.023 per GB month, $0.40 per million simple operations, $5 per million advanced operations, $0.05 per GB transferred (`iad1`), `del()` is free, Pro has no included Blob usage beyond the credit; Web Analytics is $0.03 per 1,000 events and Speed Insights $0.65 per 10,000 events with no included events on Pro; WAF rate limit windows run from 10 s to 10 minutes on Pro with 40 rules per project.
- GitHub Actions (`/kb/guide/how-can-i-use-github-actions-with-vercel`): `vercel pull`, `vercel build`, `vercel deploy --prebuilt` with `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`; "Set `git: { deploymentEnabled: false }` in vercel.json to hand deployment to Actions cleanly."

## 6. The production walk

`scripts/hosting-walk.mjs` (playwright-core 1.62.1, headless Chromium 1234, 1440 by 900, human speed) against `https://turboslide.vercel.app` at 12:05 PDT; `hosting-walk.json` and the screenshots `01-new-draft.png` to `07-trash-after-delete.png` beside this file. Seven of seven steps passed:

1. `GET /` answered 307 to `/new` from the edge; `/new` came from `sfo1::iad1` as a `MISS`; every `/assets/` chunk was a CDN `HIT`.
2. The draft opened as `untitled-20260920-ls4p`; a double click on the title run and 40 characters typed at 40 to 90 ms per key, then Escape, moved the address to `/edit/untitled-20260920-ls4p` at revision 1 (`02-created.png`, the title row reads "All changes saved").
3. Sixty seconds idle in the editor: 22 responses, all from the function and none from the Blob host: 13 `POST /api/decks/:id/presence`, 6 `POST /_serverFn`, 2 `GET /_serverFn`, 1 `GET /api/decks/:id/stream`.
4. `/decks` listed the new deck within 2.5 s (`04-decks.png`); the footer holds the Trash link alone; the twins came from the public Blob host.
5. File, Move to trash moved the address to `/decks` and the card left the list (`05-after-trash.png`).
6. Delete forever on `/decks/trash` (`trash.delete.<id>`, `trash.confirm.ok`) removed the card; `GET /edit/<id>` and `GET /deck/<id>` answered 404 within the 20 s bound (`07-trash-after-delete.png`).

Console errors: five copies of Chromium's "upgrade-insecure-requests is ignored when delivered in a report-only policy" (VERIFICATION-5 finding 16), nothing else.
