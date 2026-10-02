# Cost audit: what Turboslide costs to run and the cuts that remain

Kevin, 2026-10-01: "make sure turboslide is super optimized and super cheap to run". This note reads what Turboslide costs today on both Vercel teams, what it will cost once the realtime round moves production to the Cloudflare `do` tier, and every cut left after that. It was written 2026-10-01 (Pacific; 2026-10-02 01:35Z to 02:10Z) in the worktree `/Users/kevinliu/repos/Turboslide-next` at `94e8a5c3`, with the realtime round's branch read in `/Users/kevinliu/repos/Turboslide-realtime` at `8fdb0c4f` (committed 2026-10-01 17:53 PDT). The machine's load average was 44.65 at 01:35Z and 18.31 at 01:52Z; nothing in this note is a timing.

## 1. What was read and how

Every Vercel reading below is a GET made from a node script that read the CLI token from `~/Library/Application Support/com.vercel.cli/auth.json` and printed none of it. The scripts and raw answers are in the session scratchpad (`cost-audit/raw/`), outside the repository.

| Request                                                                                                                       | Answered                    | What it gave                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/billing/charges?teamId=team_KpAxFhYN63bKUy7bj8bNoOkh&from=2026-09-01T07:00Z&to=2026-10-02T07:00Z`                    | 200 at 01:38:52Z, 80.9 MB   | one FOCUS row per Pacific day, service, region and project for Kevin's team; rows start 2026-09-10                                                                           |
| the same for `team_8oC6z09EmYEXHlv0GgC6Gucu`                                                                                  | 200 at 01:39:02Z, 29.2 MB   | the General Translation team; `turboslide-gt` rows start 2026-09-25                                                                                                          |
| `GET /v2/usage?teamId=...&type=requests\|builds\|storage_blob\|cron_jobs\|data_cache\|log_drains` with and without `projectId` | 200 from 01:36:42Z to 01:44:48Z | daily requests, function GB hours, Blob operations and size, builds, crons                                                                                                   |
| `GET /v2/teams/<id>` for both teams                                                                                           | 200 at 01:40:50Z and 01:40:58Z | `billing.invoiceItems`, the unit prices and thresholds each team is billed at                                                                                                |
| `GET /v9/projects/<id>` for both projects                                                                                     | 200 at 01:41:56Z            | `resourceConfig`, git settings, crons, firewall flag, environment variable names                                                                                             |
| `GET /v6/deployments?projectId=...&since=2026-09-01`                                                                          | 200 at 01:41:38Z            | 249 deployments of `turboslide`, 55 of `turboslide-gt`                                                                                                                       |
| `GET /v1/security/firewall/config/active` for both projects                                                                   | 01:51:50Z                   | `turboslide`: 200, 23 rules, 22 rate limit rules; `turboslide-gt`: 404 `{"code":"not_found","message":"Config not found"}`                                                   |
| `GET https://www.turboslide.com/api/logo/refresh` and the same on `turboslide.vercel.app`                                     | 405 at 01:48:10Z, both      | `{"error":{"name":"Error","status":405,"message":"POST the refresh","code":"method_not_allowed"}}`                                                                            |

The cost figures use the charges API's `EffectiveCost`, which is the list price before the Pro credit; `BilledCost` is zero on rows the credit covered. The product pages were fetched 2026-10-01 (local) and are cited where used.

Not read: the Cloudflare dashboard and its GraphQL metrics (no token in this workflow), the `do` tier's cost rows (the realtime round's preview gate file `docs/gslides-parity/focus/verification/realtime-preview-do.json` in the realtime worktree has `"cost": null` at commit `8fdb0c4f`), the Blob store's composition by prefix (a listing is billed and needs the store token), and the runtime logs of either project.

## 2. Corrections to the earlier readings

- The observability line is the largest single line of the `turboslide` project in September: 19,614,915 events, $23.54 (charges API), against the $3 a month that `research-costs-actual.md` line 43 (cut 6) estimated. The events are billed because Observability Plus is on for Kevin's team: `billing.invoiceItems.observabilityBase` exists with `createdAt` 2026-05-26 and `observabilityEvent` is priced at $1.20 a million. The General Translation team has no `observabilityBase` item and no event rows for `turboslide-gt`.
- The events are not log lines. https://vercel.com/docs/observability (last updated 2026-09-10) lists the tracked events as "CDN Requests, Vercel Function Invocations, External API Requests, Routing Middleware Invocations, AI Gateway Requests". `apps/studio/src/server/log.ts` 3 to 15 and 155 to 157 write security events only, and it is called from 13 files (`grep logSecurityEvent(`, `log.ts` included). Every Blob call a function makes is an External API Request, which is why September's 19.6 M events exceed the project's 7.72 M CDN requests plus 6.14 M invocations.
- Provisioned memory billed in September was 1,808.51 GB hours ($19.17). The usage API's `function_execution_successful_gb_hours` for the same project and month reads 3,758 GB hours; the billed figure is the one the bill uses.
- Blob simple operations billed in September were 20,233,131 ($8.09). The usage API counts 41,776,710 for the team, which includes reads the CDN answered.
- The Blob store `turboslide-decks` lives on Kevin's team and serves both projects. The General Translation team's `storage_blob` rows show 0 advanced and about 290 simple operations a day from 2026-09-26 to 10-01, none of them Turboslide's. So production's store bill lands on Kevin's team.
- This cycle on Kevin's team (since 2026-09-26) the usage is $25.94 at list price, $5.94 of it billed past the $20 credit. Turboslide and its store are $18.15 of the $25.94.

## 3. The bill today, per line

### 3.1 Kevin's team: the project `turboslide` and the store

| Line                                    | September, 2026-09-10 to 10-01 | Pace of 2026-09-26 to 09-30, per 30 days | Quiet day 2026-09-27, per 30 days | Source of the units                                    |
| --------------------------------------- | -----------------------------: | ---------------------------------------: | --------------------------------: | ------------------------------------------------------ |
| Observability events                    |         $23.54 (19.61 M events) |                                   $11.58 |                             $0.00 | $1.20 a million, `invoiceItems.observabilityEvent`     |
| Fluid provisioned memory                |          $19.17 (1,808.5 GB h) |                                   $14.14 |                             $0.00 | $0.0106 a GB hour, iad1                                |
| Fluid active CPU                        |             $11.49 (89.7 h)    |                                   $13.74 |                             $0.00 | $0.128 an hour, iad1                                   |
| Blob advanced operations (store)        |             $9.44 (1.89 M)     |                                   $14.27 |                             $0.00 | $5.00 a million                                        |
| CDN requests (store reads)              |             $8.74 (7.42 M)     |                                    $0.00 |                             $0.00 | $2.00 a million in iad1 past the cycle's allowance     |
| Blob data transfer (store)              |             $8.44 (168.8 GB)   |                                   $13.11 |                             $0.22 | $0.05 a GB, iad1                                       |
| Blob simple operations (store)          |             $8.09 (20.23 M)    |                                   $17.52 |                             $0.25 | $0.40 a million                                        |
| Build CPU minutes                       |             $6.90 (2,410 min)  |                                   $10.17 |                             $0.00 | $0.0035 a CPU minute, standard                         |
| CDN requests (project)                  |             $5.85 (7.72 M)     |                                    $0.00 |                             $0.00 | as above                                               |
| Function invocations                    |             $3.69 (6.14 M)     |                                    $2.18 |                             $0.00 | $0.60 a million                                        |
| WAF rate limit requests                 |             $3.01 (5.01 M)     |                                    $3.53 |                             $0.00 | $0.60 a million allowed requests                       |
| Fast origin transfer (store, project)   |             $3.23              |                                    $4.55 |                             $0.00 | $0.06 a GB, iad1                                       |
| Blob storage size                       |             $0.17              |   $0.15 (billed once a cycle, 6.72 GB) |                             $0.00 | $0.023 a GB month                                      |
| CDN request CPU                         |             $0.41              |                                    $0.51 |                             $0.00 | $0.30 an hour                                          |
| Total                                   |                     $112.17    |                                  $105.45 |                             $0.47 |                                                        |

The CDN request lines read $0.00 since 2026-09-26 because `invoiceItems.edgeRequest` carries a `threshold` of 10,000,000; read as the included quantity per cycle, it agrees with the September rows, where the charges start on 2026-09-17. The cycle since 2026-09-26 has 4,037,251 CDN requests across the team's projects in five days (2,281,750 untagged store reads, 997,472 for `turboslide`), so at that pace the allowance runs out around 2026-10-08 and the line returns at $2.00 a million. That reading of `threshold` is an inference (section 7).

The untagged rows are the store: the usage API's breakdown for 2026-09-26 gives `turboslide-decks` 93 percent of the transfer, 99 percent of the size and 100 percent of the objects. The untagged CDN requests track the store's simple operations day by day (720 a day on 2026-09-27, 2.7 M on 09-30), so they are reads of the store's public URLs.

The money follows the pipeline's runs. A quiet day (2026-09-27, no gate, 19 observability events on the project) costs $0.02 on this team. A gate day costs $5 to $13 (2026-09-14 $13.53, 09-24 $11.23, 09-25 $12.00, 09-30 $5.50). The deployments list shows 164 CLI previews and 77 git production builds of `turboslide` in September, 24 of the previews on 2026-09-30 alone.

### 3.2 The General Translation team: `turboslide-gt` (www.turboslide.com)

| Line                     | 2026-09-25 to 10-01 | Pace of 2026-09-26 to 09-30, per 30 days | Quiet days 2026-09-26 and 09-27, per 30 days |
| ------------------------ | ------------------: | ---------------------------------------: | -------------------------------------------: |
| Fluid provisioned memory |   $1.42 (134.4 GB h) |                                    $8.22 |                                        $0.20 |
| Build CPU minutes        |     $1.15 (359 min) |                                    $5.05 |                                        $0.00 |
| Fluid active CPU         |      $0.82 (6.4 h)  |                                    $4.61 |                                        $0.30 |
| Function invocations     |     $0.07 (108,880) |                                    $0.36 |                                        $0.20 |
| Fast origin transfer     |               $0.04 |                                    $0.21 |                                        $0.00 |
| Total                    |               $3.51 |                                   $18.48 |                                        $0.70 |

No observability events, no rate limit requests and no CDN request charge appear for `turboslide-gt`. The project has no firewall configuration (the 404 of section 1). Most of this line is the guard: each pushed sha builds twice (`~/.config/turboslide/gt-follow.sh` 301 deploys a preview, 337 deploys production from the same worktree) and runs the smoke, the walk areas `decks,text,fonts,versions` and nine spec rows on the preview (gt-follow.sh 44 to 61), about 20 minutes a push by the log (2026-10-01 05:09Z to 05:30Z). The usage API counts 11,019 and 11,304 successful invocations on the quiet days 2026-09-26 and 09-27 (UTC). Their source is not read; one idle editor tab made 9.66 requests a minute on the production cost rows of 2026-09-22 (`audit-sync.md` 119), about 13,900 a day, so a forgotten open tab would account for them.

### 3.3 Fixed fees

- Kevin's team is on Pro at $20 a month with a $20 usage credit (`invoiceItems.pro`, `includedAllocationUsd` 20). The team holds Kevin's other projects too, and the credit was used by day 5 of this cycle (section 2).
- The General Translation team's Pro and seats are General Translation's and do not change with Turboslide.
- Cloudflare: Workers Free, $0 (`docs/CLOUDFLARE.md` 1.3, realtime worktree line 24).

## 4. The month at 50 and 500 editor hours a day

The editor hour is `docs/SYNC.md`'s (line 242: 12 editing minutes at one edit per 5 s and 48 idle minutes). Sellers' traffic only; the pipeline's runs are section 3's. Production is the General Translation project (no observability events) and the store is on Kevin's team.

Today's `blob` tier, per editor hour, from the production cost rows of 2026-09-22 (`docs/gslides-parity/realtime/audit-sync.md` 119 to 121): 1,287 function requests, 2,868 simple and 444 advanced Blob operations, 0.16 GB hour of memory when instances are shared and 2 GB hours when a tab is alone, about 60 CPU seconds. At the prices of section 3.1 that is $0.0080 an editor hour shared and $0.0275 alone.

The `do` tier after the flip: `docs/CLOUDFLARE.md` 1.3 (realtime worktree lines 24 to 26) and `docs/gslides-parity/cloudflare/judge-2-cost.md` 36 (design A's Vercel residual). Nothing on the `do` tier has been measured on a deployment yet (section 1).

| Line, a month                                           | `blob` tier, 50 h a day | `blob` tier, 500 h a day | `do` tier, 50 h a day          | `do` tier, 500 h a day          |
| ------------------------------------------------------- | ----------------------: | -----------------------: | ------------------------------ | ------------------------------- |
| Function invocations                                    |                   $1.16 |                   $11.58 | $0.14 in A's residual          | about $1.40                     |
| Session poll, 3 a minute per visible tab (useStudioSession.ts 51, 53) | in the 1,287 | in the 1,287 | $0.16 (270,000), outside A's residual | $1.62 (2.7 M)          |
| Blob simple operations                                  |                   $1.72 |                   $17.21 | $0.26                          | about $2.60                     |
| Blob advanced operations                                |                   $3.33 |                   $33.30 | $5.40                          | about $54                       |
| Provisioned memory                                      |          $2.54 to $31.80 |        $25.44 to $318.00 | $0.89                          | about $8.90                     |
| Active CPU                                              |                   $3.20 |                   $32.00 | unmeasured, at most $3.20      | unmeasured, at most $32.00      |
| CDN requests on the General Translation team past its allowance | up to $3.86     |              up to $38.60 | under $1                       | under $10                       |
| Cloudflare                                              |                      $0 |                       $0 | $0 (Free holds; rows written at 29 to 36 percent of the cap) | $5.45 (Workers Paid, forced by the rows written cap) |
| Total                                                   |           $12 to $45   |              $120 to $450 | $7 to $11                      | $77 to $120                     |
| Total with the 10 s idle and 30 s maximum cadence       |                       |                           | $2 to $6                       | $24 to $66                      |

Notes on the table:

- The advanced line on the `do` tier is the version log: every record still writes five advanced operations (the snapshot, the record, a slide body per changed slide, the manifest, the pulse; `docs/SYNC.md` 280), and on the realtime branch the deck's pulse is still put on every commit (`packages/store/src/blob-store.ts` 1940 in the realtime worktree) and a full snapshot with every record (the same file, 1865).
- The CDN line assumes the General Translation team stays near its allowance: `invoiceItems.edgeRequest` has the same 10,000,000 threshold there, and that team made 1,058,729 CDN requests in its first three days of cycle (2026-09-29 to 10-01), 833,677 of them the landing site's. Every function request is a CDN request too.
- The `blob` tier's memory range is the shared rate against a tab alone on its instance (`audit-sync.md` 119). At 500 hours more tabs share an instance, so the low end is the likely one.
- At 500 hours the `do` tier's Workers Logs pass the Free 200,000 events a day if each object invocation writes one event, since `head_sampling_rate` is 1 (`apps/realtime-worker/wrangler.jsonc` 43 in the realtime worktree); on Workers Paid the first 20 million a month are included and then $0.60 a million (https://developers.cloudflare.com/workers/platform/pricing/, last updated 2026-08-28). Whether an object's WebSocket message counts as an event was read on no page.

Per editor hour: the `blob` tier costs $0.008 to $0.030; the `do` tier at the default cadence about $0.0047 ($7 for 1,500 hours) and at the 10 s cadence about $0.001.

## 5. The cuts, ranked by dollars a month

The gain column names the load it is measured at: "pace" is the 30 day pace of 2026-09-26 to 09-30 from section 3, "50 h" and "500 h" are section 4's. Cuts 3, 4, 6 and 7 all shrink the Blob advanced line of the version log, so their gains overlap and do not add.

| Rank | Cut | Where | Who | Gain a month | Risk |
| ---: | --- | ----- | --- | ------------ | ---- |
| 1 | Hosted gates narrowed to one run per round on one preview; the whole matrix on the local memory tier | `docs/REALTIME.md` 19 rules 1 and 2, in force since 2026-10-01; the realtime round ran hosted gates on Kevin's team today (`realtime-preview-do.json`, started 2026-10-02 01:24Z on `turboslide-q6vp1ng7n-kl01s-projects.vercel.app`) | the pipeline's orchestrator | up to $105 at pace (section 3.1: $105.45 against a quiet $0.47) | a defect only a deployment shows is found later, by the guard's check on the General Translation preview |
| 2 | The flip to the `do` tier | the realtime round, `docs/CLOUDFLARE.md` 1.2 | the realtime round (in progress) | $5 to $34 at 50 h; $43 to $330 at 500 h (section 4) | the realtime rows on production; a hosted gate spends production's Free caps, since both Workers share one account (`docs/CLOUDFLARE.md` 85, 602) |
| 3 | The version log kept in the object's SQLite, with a Blob snapshot at the last close or every few minutes | `packages/store/src/blob-store.ts` (the per record writes at 1865 to 1940), `apps/realtime-worker`; stage 2 territory (`docs/CLOUDFLARE.md` 3.5) | a code change, one round | about $54 at 500 h, $5.40 at 50 h (2 s cadence) | the store stops holding every version; the loader, Version history and the agent surface read the object; a rollback needs the log copied back |
| 4 | The 10 s idle and 30 s maximum checkpoint cadence | `TURBOSLIDE_CHECKPOINT_IDLE_MS` and `TURBOSLIDE_CHECKPOINT_MAX_MS` (`apps/realtime-worker/wrangler.jsonc` 80, 81 and 108, 109 in the realtime worktree) | Kevin (`docs/CLOUDFLARE.md` 8 question 7) | about $53 at 500 h ($70 to $17), $5.50 at 50 h | a Version history row covers up to 30 s; a commit lands 10 s after the last keystroke |
| 5 | Observability Plus off for the project `turboslide` (or for Kevin's team) | Billing, Observability Plus, Manage projects (https://vercel.com/docs/observability/observability-plus, last updated 2026-07-06: "Events from excluded projects won't count toward your Observability Plus usage") | Kevin | $11.58 at pace; $23.54 in September | 30 day logs and Query are lost on the preview project; production's project is on the other team and keeps its 1 day of logs |
| 6 | No deck pulse on the `do` tier | `packages/store/src/blob-store.ts` 1940 (realtime worktree); `docs/CLOUDFLARE.md` 7.1 places it in stage 2a | a code change | $10.80 at 500 h and $1.08 at 50 h at the 2 s cadence; about a sixth of that at 10 s | a reader still on the `blob` or `redis` tier stops seeing commits, so it lands only with the flip |
| 7 | A snapshot every Nth record | `packages/store/src/blob-store.ts` 1865 (realtime worktree) | a code change | about $10.80 at 500 h at the 2 s cadence | a load replays more records; `docs/SYNC.md` 3.6's reload path |
| 8 | Builds unbilled on `turboslide`: a fixed Standard machine with on-demand concurrent builds off | the project's `resourceConfig` reads `buildMachineSelection: elastic`, `elasticConcurrencyEnabled: true` (01:41:56Z); https://vercel.com/docs/pricing (last updated 2026-09-14): "Builds on Standard build machines are only billed when on-demand concurrency is enabled or Elastic build machines are selected" | Kevin | $10.17 at pace; $6.90 in September | builds queue: Pro runs 3 at once with on-demand off (https://vercel.com/docs/builds/managing-builds, 2026-09-17), shared with the team's other projects |
| 9 | Drop R11, the whole site rate limit rule, from the preview project, and leave it out when the rules reach production | `firewall/rules.json` 613 (path prefix `/`, deployed in `log` mode per the active config at 01:51:50Z) | a code change in `firewall/rules.json` and the integrator's apply, or Kevin in the dashboard | $3.53 at pace, $3.01 in September; about $1.20 at 50 h and $12 at 500 h on the `blob` tier if it reached production | the rule only logs today; a flood from one client fingerprint goes unlogged |
| 10 | One build per pushed sha in the guard | `gt-follow.sh` 301 and 337 build twice; its header (lines 6 to 9) names the Trusted Sources setting that would let a staged production deployment be checked and then aliased | Kevin or a General Translation admin (the project setting), then a guard edit | about $2.50 at pace (half of $5.05) | the staged deployment path is untested; it also makes production serve the build that was checked, which today it does not |
| 11 | Git deployments of main off on `turboslide` | `gitProviderOptions.createDeployments: enabled`, production branch `main` (01:41:56Z); 77 production git builds in September | Kevin (`docs/CLOUDFLARE.md` 8 question 5 defaults to "preview target only") | about $2.16 (77 builds at 2 minutes of the Elastic minimum of 4 vCPUs), $0 once cut 8 lands | `turboslide.vercel.app` stops following main |
| 12 | The agent's command frame over the channel in place of the session poll | `apps/studio/src/components/useStudioSession.ts` 51 to 53 (an unheld poll every 20 s); `docs/CLOUDFLARE.md` 7.3 | a code change, the round after the flip | $1.62 at 500 h, $0.16 at 50 h | an agent loses the page between the frame's reconnects |
| 13 | Store retention that runs | `sweepUploads` has no caller (`apps/studio/src/server/upload.ts` 449; `grep -rn sweepUploads` finds only its definition and a comment); the versions "scheduled thinning job" is a table row only (`apps/studio/src/server/log.ts` 434 to 436); `THUMB_KEEP` 3 (`packages/store/src/blob-store.ts` 276) | a code change and a scheduled trigger | $0.15 a month today at 6.72 GB; the store grew from 0.13 GB (2026-09-11) to 6.72 GB (2026-10-01), so each month without it adds $0.20 to $0.35 a month, and R2's free 10 GB month (https://developers.cloudflare.com/r2/pricing/, 2026-10-01) is passed in stage 2a | removing a version or an upload a person still wants |
| 14 | Workers Logs sampled at 0.1 on the object | `apps/realtime-worker/wrangler.jsonc` 43 (realtime worktree) | a code change | $0 to about $2 at 500 h | fewer request logs for a realtime defect |
| 15 | The daily logo refresh fixed | `apps/studio/src/routes/api/logo.$.ts` 134, 135 answer POST only; Vercel crons send GET (https://vercel.com/docs/cron-jobs, 2026-09-16: "Vercel makes an HTTP GET request to your project's production deployment URL"); `apps/studio/vercel.json` 6 to 11 declares the cron for both projects, and only `turboslide-gt` has `CRON_SECRET` | a code change | $0; the refresh has never run from the cron, and on both projects it would run twice against the one store | a fixed cron writes the logo index daily from two projects |

Cuts considered and left out:

- A smaller function size. On Pro with Fluid compute the choices are 2 GB with 1 vCPU and 4 GB with 2 vCPUs (https://vercel.com/docs/functions/configuring-functions/memory, 2026-07-15), and both projects already use the standard 2 GB (`defaultResourceConfig.functionDefaultMemoryType: standard`).
- The deploy upload. `.vercelignore` 32 to 35 leaves `docs/gslides-parity` out (1,819 MB of the 1,935 MB of tracked files on 2026-10-01); the rest is about 116 MB. Uploads are not billed; the gain was time.
- The card thumbnail's Chromium render. Since the 30 s settle (`apps/studio/src/server/card-thumb.ts` 24 to 39) a typing hour renders at most three times; at the 0.93 CPU s a render that `docs/SYNC.md` 259 implies (33.1 CPU hours for 128,250 renders) that is about $0.15 a month at 50 h.

## 6. The target

"Super cheap" in numbers, after the flip and cuts 1, 5, 8, 9 and 11, with Cloudflare on Workers Free:

- Sellers at today's traffic: about $1 a month (the quiet days of sections 3.1 and 3.2: $0.47 and $0.70 per 30 days on the `blob` tier, less on the `do` tier, where an idle tab holds no function and makes no Blob call).
- The pipeline: the guard's check on the General Translation team, about $16 a month at the pace of 2026-09-26 to 09-30 with one build per push (cut 10), plus one narrowed preview run per round on Kevin's team at a few dollars a run.
- The floor: about $1 a month of sellers' usage and $15 to $20 of pipeline usage, on two Pro seats that exist for other reasons. Turboslide adds no fixed fee of its own as long as Cloudflare stays on Free.
- At 50 editor hours a day: under $15 a month of sellers' usage ($7 to $11 at the 2 s cadence, $2 to $6 at the 10 s cadence).
- At 500 editor hours a day: $24 to $66 a month with Workers Paid at $5.45 and the 10 s cadence. With cut 3 the version log leaves the Blob store, the residual falls to about $8, and the month is about $15 plus the CPU and CDN lines nobody has measured on the `do` tier.

The conditions:

1. Production runs on the `do` tier, and an idle tab costs no Vercel function and no Blob call.
2. The whole matrix runs on the local memory tier; one narrowed hosted run per round; the docs only rule of the guard stays.
3. Observability Plus is off for the preview project, builds are unbilled or one per push, and R11 stays off every project.
4. At scale: Workers Paid ($5.00 a month; https://developers.cloudflare.com/durable-objects/platform/pricing/, last updated 2026-09-30: Paid includes "1 million / month" requests and "First 50 million / month" rows written, where Free stops at "100,000 / day" rows written and "further operations of that type will fail with an error"), the 10 s cadence, and the deck pulse skipped.
5. Hosted gates on the `do` tier run against a second Cloudflare account or on Workers Paid, because both Workers share one account's daily caps (`docs/CLOUDFLARE.md` 85).

## 7. Open

- Whether `invoiceItems.edgeRequest.threshold` (10,000,000 on both teams) is a per cycle included quantity. It agrees with Kevin's September rows; no page fetched today says so. If it is, Kevin's team passes it around 2026-10-08 at this cycle's pace, mostly on store reads.
- Whether Flat Rate CDN is switched on for either team. Both teams carry an `edgeRequestsFlatRate` item at $0; https://vercel.com/docs/pricing/flat-rate-cdn (2026-09-14) says the tier covers "Blob Data Transfer", yet Kevin's team was billed for Blob data transfer on every day of this cycle.
- What made 11,019 and 11,304 invocations a day on `turboslide-gt` on the quiet days 2026-09-26 and 09-27.
- The `do` tier's measured cost: the cost rows `cost.do.*` and `cost.editor-idle.calls` on a preview, and the Vercel CPU per editor hour once the ops transform leaves the function.
- Whether a Durable Object's WebSocket message writes a Workers Logs event.
- Whether the card render's 30 s settle timer fires on the `do` tier, where no stream keeps a Vercel instance alive after the write (`apps/studio/src/server/card-thumb.ts` 149 to 158 schedule it on the instance; Fluid compute pauses an instance once its last request ends, https://vercel.com/docs/functions/usage-and-pricing, 2026-06-16).
- The store's composition: what the 6.72 GB holds by prefix.
- Kevin's team's other projects (`loop`, `claude-of-tanks` and others) share the $20 credit; this note does not attribute their usage.

## 8. Notes on method

- Pacific days: the charges API rows run from 07:00Z to 07:00Z. The usage API's daily rows are UTC days, so a quiet UTC day can hold a busy Pacific evening. The usage API gives the project 22.0 GB hours of function execution on 2026-09-27 UTC; the charges API bills 0.006 GB hours of provisioned memory on the Pacific 2026-09-27 (two metrics, two day boundaries).
- The 2026-10-01 Pacific rows were still filling when read (01:38Z), so they appear only in the September column.
- Unit prices: iad1 rates from each team's `invoiceItems`, which match https://vercel.com/docs/functions/usage-and-pricing (2026-06-16: iad1 "$0.128" an hour and "$0.0106" a GB hour, invocations "$0.60 per million") and the ranges of https://vercel.com/docs/pricing/regional-pricing (2026-09-14).
- The Cloudflare numbers are `docs/CLOUDFLARE.md`'s design estimates, checked against the pricing pages fetched today (Durable Objects 2026-09-30, Workers 2026-08-28, R2 2026-10-01, Browser Run 2026-04-21: Free "10 minutes per day", Paid "10 hours per month, then $0.09 per additional hour").
