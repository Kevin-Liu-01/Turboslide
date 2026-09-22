# The redirect deployment of turboslide.vercel.app

The two files `docs/HOSTING-MOVE.md` section 7 gives, committed here so the pipeline can review them and Kevin can deploy them. After the move, `turboslide.vercel.app` stays on Kevin's personal project `turboslide` (`kl01s-projects`) as one static deployment: every request answers a 308 to the team address with its path and query kept, no function runs, no store is read and no build runs after this deployment's own. Kevin deploys it at step 8 of the cutover (`HOSTING-MOVE.md` section 5), after the store has moved and the drain has read zero live tabs; the pipeline never deploys it. The whole sequence with every command is `docs/gslides-parity/sync/hosting/RUNBOOK.md`.

## The destination

`vercel.json` names `https://turboslide-general-translation.vercel.app`, the default address of `HOSTING-MOVE.md` 2.3, which is a guess at the alias a team project named `turboslide` receives. Before the deploy, replace the literal in `vercel.json` and in `index.html` with the alias the team project has (or the subdomain Kevin chose), in the cutover commit that also changes the README's address. `node scripts/hosting-check.mjs --to <address>` reads the deployed redirect back against the same literal.

The `has: host` clause the redirects documentation offers is left out on purpose: every hostname of the personal project (`turboslide.vercel.app`, `turboslide-kl01s-projects.vercel.app`, `turboslide-git-main-kl01s-projects.vercel.app`) should redirect, and the destination is another project. `permanent: true` is the 308; the method and the body survive it, the `Authorization` header does not (`HOSTING-MOVE.md` 1.7).

## Before the deploy (Kevin, the project's settings)

In the dashboard of the personal project `turboslide`, in this order (section 7):

1. Git: disconnect the repository, so a push to `main` never builds here again. From a folder linked to the project the CLI does the same with `vercel git disconnect`. The alternative, when the connection is to stay, is `"git": { "deploymentEnabled": false }` in this `vercel.json`.
2. Build and Deployment: Framework Preset Other; Build Command override on and empty (the build is skipped); Output Directory override on and empty; Root Directory empty (today it is `apps/studio`, which this folder does not have). The CLI carries `vercel project update turboslide --framework other --build-command "" --output-directory "" --scope kl01s-projects`, and no flag for the Root Directory; whether an empty string sets an override on and empty was not tried, so the dashboard is the path of record and the CLI a check after it (`vercel project inspect turboslide --scope kl01s-projects`).
3. Storage: leave `turboslide-decks` connected. Disconnecting removes `BLOB_READ_WRITE_TOKEN` from the project, which the rollback of section 6 needs, so the disconnect waits for the rollback week (section 5 step 10).
4. Speed Insights and Web Analytics off. The CLI's `vercel project web-analytics` and `speed-insights` enable them and have no off switch; this is the dashboard.
5. The environment variables stay for the rollback week and are removed after it.

## The deploy (Kevin)

From this folder, so the upload is these two files and nothing above them:

```
cd hosting/redirect
vercel link --project turboslide --scope kl01s-projects --yes
vercel deploy --prod
```

`vercel link` writes `hosting/redirect/.vercel/` (ignored by the repository's `.gitignore`, never committed). `vercel deploy --prod` uploads this folder, runs no build (the override is empty and the folder holds no `package.json`), makes the deployment production and moves the aliases. The WAF redirect rule of section 5 step 7 is live at this point and stays until the personal project's Usage has read zero function invocations for a full hour after this deploy (step 8); then Kevin deletes it.

## The check (the pipeline or Kevin, read only)

```
node scripts/hosting-check.mjs --from https://turboslide.vercel.app --to <address>
```

The rows: `HEAD` and `GET` of `/edit/abc?x=1` answer 308 with `location: <address>/edit/abc?x=1`; `POST /api/actions/deck.info` answers 308 to the same path on the team host, and followed once without a bearer answers the team host's 401; `vercel inspect https://turboslide.vercel.app --json` lists no function. The script prints the smoke and the gate commands for the team address and the authenticated `turboslide share get gt-brand --to <origin>` call through the redirect (the plan's `deck info` spelling is not a CLI command; `share get` is the collaboration read that reaches `/api/actions` with the host entry's key), and never runs them (they write scratch decks or read the CLI's key). The personal project's Usage page (zero invocations and zero active CPU for the hour, zero on every line but edge requests a week later) is read by Kevin; no command reads it.

## What zero means

The redirects are edge requests inside the Flat Rate CDN included tier (1 million requests and 1 TB a month, shared by the team's projects); a redirect answered in under 10 ms carries no Edge Request CPU Duration charge; no function runs, so invocations, active CPU and provisioned memory read zero; no analytics event is ingested. The `kl01s-projects` platform fee of $20 a month is the team's for its fourteen projects and stays whatever Turboslide does (`HOSTING-MOVE.md` section 7, prices read 2026-09-20).
