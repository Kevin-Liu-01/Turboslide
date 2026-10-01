# What Turboslide costs on Vercel, read from the bills on 2026-10-01

Kevin, 2026-10-01: "check vercel, turboslide is turning out very expensive for me, we need to optimize a lot or use cloudflare workers or something". This note reads the two teams' usage pages and the usage API (`GET /v2/usage?type=...`) for September and the current cycles, attributes the money to its causes, and lists the cuts in order of size. Prices are Vercel's Pro on-demand rates as docs/SYNC.md section 4 recorded them on 2026-09-20 (invocations $0.60 per million, active CPU $0.128 per hour, provisioned memory $0.0106 per GB hour, Blob simple operations $0.40 per million, advanced $5.00 per million, Blob transfer $0.05 per GB, storage $0.023 per GB month).

## 1. The two bills

The General Translation team (Pro), cycle 2026-09-29 to 10-29 as read on 10-01: total $459.29. Of it $420.00 is subscription licenses (10 additional seats $200, 2 Static IPs $200, Pro $20) and $59.29 is infrastructure: Private Data Transfer 150 GB $22.48, Build CPU 114 hours $21.98, VCR storage 56 GB $5.56, Drains 3 GB $1.37, Fluid provisioned memory 165.92 GB hours $1.77, Fluid active CPU 9 hours $1.30, Fast Origin Transfer 20 GB $1.23, ISR $1.53, invocations 385.99 K $0.23, Sandbox $1.74. Private Data Transfer is the Static IPs' network (the pricing page: "Static IPs: $100 / month per project, plus Private Data Transfer"); Turboslide has no static IP. The build hours are the gt-cloud monorepo's: turboslide-gt made 46 deployments in the seven days to 10-01 at a mean build of 103 s, about 1.3 hours a month. Since 2026-09-01 the project turboslide-gt used 156 GB hours of function time (about $1.65), 161,698 requests and 1.2 GB of origin transfer. Turboslide's share of the GT team's bill is about $3 to $5 a month.

Kevin's team kl01s-projects (Pro), cycle 2026-09-26 to 10-26 as read on 10-01, five days in: total $24.75 (Pro $20, infrastructure $24.75, credit $20). The lines: Fluid active CPU 21 hours $2.78, provisioned memory 247.07 GB hours $2.62, Blob simple operations 7.36 M $2.94, Blob advanced 478.7 K $2.39, Blob transfer 44 GB $2.21, Build CPU 28 hours $4.37, Observability events 2.55 M $3.06, Fast Origin Transfer 24 GB $1.46, ISR $1.57, firewall rate limit requests 980 K $0.59, invocations 697 K $0.42. Since 2026-09-01 the project turboslide on this team used 3,758 GB hours of function time (94 percent of the team's 3,982), 7.71 M requests (1.52 M CDN hits, 6.19 M misses), 70 GB of origin transfer; the team's Blob store made 41.70 M simple and 1.88 M advanced operations and served 167 GB. At the unit prices that month of Turboslide is about $40 of provisioned memory, $17 of Blob simple operations, $9 of Blob advanced operations, $8 of Blob transfer, $4 of invocations, $3 of observability events and a few dollars of CPU, origin transfer and builds: about $85 to $100, before the $20 credit.

So the expensive side is Kevin's personal team, and the GT team's $459 is seats and static IPs that have nothing to do with Turboslide.

## 2. Where the personal team's Turboslide money went

The daily series of the project's function GB hours (the usage API, `requests` with `projectId`) against the team's Blob operations:

| Day   | GB hours | Blob simple (M) | Blob advanced (M) | What ran                                                  |
| ----- | -------: | --------------: | ----------------: | --------------------------------------------------------- |
| 09-14 |      205 |            0.51 |              0.02 | the sync round's audits                                   |
| 09-16 |      358 |            1.72 |              0.10 | the sync round's gates                                    |
| 09-18 |      757 |            2.80 |              0.15 | three pipelines at once (load 60 to 370 on the machine)   |
| 09-19 |      284 |            1.70 |              0.13 | the features round's gates                                |
| 09-22 |      146 |            2.08 |              0.11 | the sync round's ship and its production table            |
| 09-25 |      213 |            4.73 |              0.21 | the vector round's gates                                  |
| 09-26 |      212 |            5.73 |              0.22 | the objects round's gates                                 |
| 09-27 |       22 |            0.77 |              0.02 | a quiet day                                               |
| 09-28 |        6 |            0.69 |              0.01 | a quiet day (the polish audits drove www, the GT project) |
| 09-29 |       91 |            3.06 |              0.11 | the people round's gates                                  |
| 09-30 |      140 |            5.15 |              0.16 | the polish round's three ship attempts                    |
| 10-01 |       27 |            2.14 |              0.05 | the guard's checks                                        |

A quiet day costs 6 to 27 GB hours; a day with a whole-matrix gate on a preview costs 200 to 750. The gates are the bill: a gate opens hundreds of editor tabs over three to four hours, each tab holds an SSE stream (a function kept alive) and a session poll, and the walk renders thumbnails and exports through Chromium in 2 GB functions. The Blob operations follow the same curve: the blob tier polls the deck's pulse once or twice a second per open deck per instance while a stream is open, and a gate keeps many decks open on several instances. Sellers' own use is a rounding error in these numbers: production logs for www.turboslide.com show 18 requests in three quiet hours.

The personal project also builds every push of main from git (76 production and 168 preview deployments in 30 days, 5.3 build hours) and hosted the pipelines' previews (164 CLI deployments). Builds are a small line ($4.37 for 28 hours this cycle, most of them other projects' Node upgrades); the previews' runtime during gates is the large one.

## 3. The cuts, in order

1. Gates on hosted deployments once per ship, narrowed. The whole matrix (1,000 rows, three to four hours, hundreds of tabs) runs on the local memory tier; the hosted run before a ship is the rows that only a deployment can read (the blob tier's classes, the access rules, the CDN) plus the guard's seller path. Saves most of the 200 to 750 GB hours a gate day costs, and the Blob operations with it. This is a rule for the pipeline, not code; it goes into docs/FOCUS.md's acceptance and the rounds' prompts.
2. The guard's per-push check skips the walk and the specs on a docs-only push (every changed path under docs/, README.md or a markdown file): the smoke alone, then the production deploy. Saves about 20 minutes of Playwright per docs push. Landed in ~/.config/turboslide/gt-follow.sh on 2026-10-01.
3. One preview per round, not one per lane and per fix: the lanes drive the local server; the integrator deploys one enforce preview; a fixer who needs the hosted tier reuses it. Saves the 164 CLI previews' builds and their gate runtime.
4. The personal project's git deployments: production builds of main there duplicate the GT project's production. Kevin decides whether turboslide.vercel.app stays a second production (then nothing changes) or becomes the pipeline's preview target only (the project's Ignored Build Step set to skip main, or the git link removed). Saves 76 production builds a month and the runtime the gates spend on that origin.
5. The runtime per tab, which is the realtime round's work: the SSE stream per tab keeps a 2 GB function alive, and the pulse poll makes 30 to 60 Blob heads a minute per open deck per instance. A realtime channel outside the functions (Cloudflare Durable Objects or PartyKit with hibernating WebSockets, the design under research-options.md) removes both lines: an idle connection costs nothing there, and the version log's reads stop polling. At 50 editor hours a day docs/SYNC.md 4.3 put the blob tier at about $22 a month after the sync round's savings; the same hours on a Durable Objects channel are under $5 (Workers Paid $5 a month includes 1 M requests and 400,000 GB seconds; Durable Objects requests $0.15 per million, duration $12.50 per million GB seconds, hibernated WebSockets billed only on messages).
6. Observability events ($3.06 for 2.55 M this cycle): the app writes one JSON line per request on the server (apps/studio/src/server/log.ts) and Vercel counts every request log as an event. Sampling the per-request lines to errors and security events would cut most of it. Cents a day; later.
7. The store's egress (167 GB a month, $8): the thumbnails and twins read by the gates and the CDN misses; moving the store to Cloudflare R2 (no egress charge) is part of a Cloudflare move, not a fix on its own.

## 4. Cloudflare Workers

A whole move of the app to Workers is possible (TanStack Start and Nitro have a Cloudflare preset) but three parts do not run on Workers today: the Chromium work (thumbnails, PDF and PowerPoint exports, the shader frame capture; Cloudflare Browser Rendering is a separate paid product at about $0.09 per browser hour plus a daily included amount), the native effects addon (packages/native; the wasm backend exists as the fallback), and the Blob store (R2 is the replacement, with the twins and the public URLs rewritten). The realtime round's recommendation (docs/REALTIME.md) treats Cloudflare in two steps: the realtime channel and presence on Durable Objects first, because that is where both the lag and the runtime cost are; the store and the app later, only if the bill after steps 1 to 5 still says so. With the pipeline's gates moved to the local tier the Vercel bill for Turboslide at today's seller traffic is the Pro seat plus a few dollars, on either team.

## 5. What is Kevin's

- Whether turboslide.vercel.app stays a second production or becomes the preview target (cut 4).
- The GT team's $420 of seats and static IPs, which are not Turboslide's: 10 paid seats at $20 and two projects with Static IPs at $100 each plus their Private Data Transfer ($22.48 this cycle).
- The Cloudflare account and the Workers Paid plan ($5 a month) if the realtime round's recommendation stands.
