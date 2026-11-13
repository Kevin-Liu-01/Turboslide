# Turboslide

<picture>
  <source srcset="docs/readme/brand/lockup-light.png" media="(prefers-color-scheme: dark)" width="477">
  <img alt="The Turboslide mark, a slanted T with three bars under its left arm, beside the word Turboslide" src="docs/readme/brand/lockup-dark.png" width="477">
</picture>

Turboslide is a slides editor in the browser. People and agents edit the same presentation: agents run the same 203 actions over the command line, MCP and HTTP.

Use it at https://www.turboslide.com. No account is needed.

## For agents

- Command line: in a checkout, `pnpm exec turboslide <command> --json` runs an action on a presentation folder. See [The command line](https://www.turboslide.com/docs/agents/cli).
- MCP: `pnpm exec turboslide mcp --deck <dir>` serves the actions as tools over standard input and output, and a running studio serves them at `/mcp`. See [MCP](https://www.turboslide.com/docs/agents/mcp).
- HTTP: `POST /api/actions/<id>?deck=<deck>` on a running studio runs one action. See [HTTP actions](https://www.turboslide.com/docs/agents/http).

## Run it on your computer

You need Node 24 and pnpm 11.15.1. Corepack, which ships with Node 24, installs that pnpm from `package.json`.

```sh
git clone --depth 1 https://github.com/Kevin-Liu-01/Turboslide.git
cd Turboslide
corepack enable
pnpm install
pnpm exec playwright-core install --with-deps chromium
pnpm dev
```

The studio runs at http://localhost:4321 and needs no environment variables. Each presentation is a folder under `decks/`, and the studio writes every edit there. The studio keeps its own state, such as its session secret, in `.turboslide/`, which git ignores. Chromium draws the thumbnails, the renders and the downloads.

## Host it yourself

### On your own server

```sh
NITRO_PRESET=node-server pnpm --filter @turboslide/studio build:deploy
PORT=3000 node apps/studio/.output/server/index.mjs
```

Started from the checkout, the server keeps presentations in `decks/`, like `pnpm dev`. Behind a proxy, set `TURBOSLIDE_TRUST_PROXY=1` so the studio reads the forwarded host.

### On Vercel

The project needs a Pro plan, because exports run for up to 800 seconds and a cron job runs every ten minutes.

1. Import the repository with `apps/studio` as the root directory. `apps/studio/vercel.json` sets the build.
2. Create a public Blob store and connect it to the project, which sets `BLOB_READ_WRITE_TOKEN`. Without it, edits last only until the instance restarts.
3. Set the variables below and deploy.

| Variable                     | What it sets                                                    |
| ---------------------------- | --------------------------------------------------------------- |
| `TURBOSLIDE_SESSION_SECRET`  | The key of the browser's identity cookie, 32 characters or more |
| `TURBOSLIDE_DOWNLOAD_SECRET` | The key that signs download links, 16 characters or more        |
| `TURBOSLIDE_TOKEN`           | The first bearer token, for the admin. Agents use API keys      |
| `TURBOSLIDE_PUBLIC_ORIGIN`   | Your site's address, for the page head and the sign in emails   |
| `BLOB_READ_WRITE_TOKEN`      | The public Blob store, set when you connect it                  |

`openssl rand -hex 32` prints a secret. These are optional:

| Variable                                                                   | What it adds                                                                       |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `TURBOSLIDE_BLOB_PRIVATE_TOKEN`                                            | A private Blob store for the documents. Pictures stay on the public store          |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                 | Sign in with Google, which also needs an accounts database (`TURBOSLIDE_ACCOUNTS`) |
| `TURBOSLIDE_ROOM_HOST`, `TURBOSLIDE_ROOM_SECRET`, `TURBOSLIDE_ROOM_BEARER` | Live editing through the realtime Worker on Cloudflare (`apps/realtime-worker`)    |

[Run Turboslide yourself](https://www.turboslide.com/docs/self-hosting) lists every variable, and [docs/hosting.md](docs/hosting.md) is the full reference.

## Work on the code

```sh
pnpm generate-routes
pnpm typecheck
pnpm test
```

[AGENTS.md](AGENTS.md) has the rules for working in the repository, and [docs/README.md](docs/README.md) indexes the documents.

## License

MIT ([LICENSE](LICENSE)). Third-party licenses are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
