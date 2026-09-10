// pnpm generate:contracts (SPEC 7.1, MILESTONES M1 item 4). Writes the committed contract
// surfaces from the action table in @turboslide/schema: the CLI option parsers, the MCP tool list
// JSON, describe().actions, openapi.json (apps/studio/src/routes/openapi.json.ts), docs/grammar.md
// and the four skills/*/references/*.md tables, into packages/agent/generated and the paths named.
// The acceptance runs this and then `git diff --exit-code` on those paths, so every output is
// committed and current. Runs with Node's type stripping: erasable syntax and explicit .ts import
// extensions only.
//
// Scaffold placeholder owned by the "schema and theme" builder: it writes nothing and exits 0 so
// the chain can run; the git diff step then trivially passes until the generators land in
// cli.ts, mcp.ts, openapi.ts, describe.ts, skills.ts and grammar.ts next to this file.

process.stderr.write(
  'generate:contracts: no generators yet (packages/agent/src/generate/main.ts is the scaffold placeholder)\n',
);
