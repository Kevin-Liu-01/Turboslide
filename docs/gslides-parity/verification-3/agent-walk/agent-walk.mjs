#!/usr/bin/env node
// The verifier's local agent walk (MILESTONES-3 "Verifier" item 8): every round three action
// with a CLI usage runs through `turboslide <command> --json` over a scratch copy of
// decks/fixture/gslides with no server (in process through runCli, the way apps/cli/e2e/share.mjs
// does), the deck validates after every write, then an MCP client over stdio lists the tools
// (under the budgets of apps/cli/src/commands/mcp.test.ts: 4 MiB for the list, 32 KiB per output
// schema), checks every round three tool by its `mcp` name, calls the read and write tools on the
// scratch deck and reads the comments, presence and inbox resources. Commands that need a hosted
// studio (`--to`) are run against the file store and their answer is recorded as the sentence
// they print, never counted as a pass. Exit 0 when every row that can pass on a checkout passes.
//   node docs/gslides-parity/verification-3/agent-walk/agent-walk.mjs [--out <json>]
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
/* the packages resolve from the CLI's own context (pnpm keeps them under apps/cli/node_modules) */
const cliRequire = createRequire(join(ROOT, 'apps', 'cli', 'package.json'));
const load = (id) => import(pathToFileURL(cliRequire.resolve(id)).href);
const { Client } = await load('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = await load('@modelcontextprotocol/sdk/client/stdio.js');
const { runCli } = await import(pathToFileURL(join(ROOT, 'apps', 'cli', 'src', 'cli.ts')).href);
const { ACTIONS } = await import(
  pathToFileURL(join(ROOT, 'packages', 'schema', 'src', 'actions.ts')).href
);
const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const OUT = value(
  'out',
  join(ROOT, 'docs/gslides-parity/verification-3/agent-walk/agent-walk.json'),
);
const SCRATCH = join(ROOT, '.turboslide', 'v3-agent-walk');
const DECKS = join(SCRATCH, 'decks');
const DECK = join(DECKS, 'gslides');
const DERIVED = join(SCRATCH, 'derived');
const ORIGIN = 'https://studio.test';
const rows = [];
const log = (line) => process.stderr.write(`${line}\n`);
function record(kind, name, ok, evidence, ms) {
  rows.push({ kind, name, ok, evidence, ms });
  log(
    `${ok === true ? 'ok  ' : ok === null ? 'note' : 'FAIL'} ${kind} ${name}${ms !== undefined ? ` (${ms} ms)` : ''}: ${String(evidence).slice(0, 220).replace(/\s+/g, ' ')}`,
  );
}

async function cli(argv, author = 'tester') {
  let stdout = '';
  let stderr = '';
  const t = performance.now();
  const code = await runCli([...argv, '--deck', DECK, '--json', '--author', author], {
    cwd: SCRATCH,
    env: { USER: 'tester', TURBOSLIDE_ORIGIN: ORIGIN, TURBOSLIDE_DECKS_DIR: DECKS },
    streams: { stdout: (x) => (stdout += x), stderr: (x) => (stderr += x) },
    stdin: async () => '',
  });
  let json;
  try {
    json = stdout.trim() === '' ? undefined : JSON.parse(stdout);
  } catch {
    json = { raw: stdout.slice(0, 200) };
  }
  return { code, stdout, stderr, json, ms: Math.round(performance.now() - t) };
}
async function validates() {
  const r = await cli(['validate', DECK]);
  return r.code === 0;
}
/** A CLI row that must exit 0 on a checkout; the deck validates after it. */
async function ok(action, argv, author, check) {
  const r = await cli(argv, author);
  const valid = r.code === 0 ? await validates() : null;
  const extra = check && r.code === 0 ? check(r.json) : null;
  const pass =
    r.code === 0 &&
    valid === true &&
    (extra === null || extra === true || typeof extra === 'string');
  record(
    'cli',
    `${action}: turboslide ${argv.join(' ')}`,
    pass,
    r.code === 0
      ? `exit 0${valid ? ', validates' : ', DECK INVALID'}${typeof extra === 'string' ? `; ${extra}` : extra === false ? '; the check failed' : ''}; ${JSON.stringify(r.json).slice(0, 160)}`
      : `exit ${r.code}: ${(r.stderr || r.stdout).trim().split('\n')[0]}`,
    r.ms,
  );
  return r.json;
}
/** A CLI row that needs a hosted studio or a session: the sentence it prints on a checkout is recorded, never a pass. */
async function needsStudio(action, argv, author) {
  const r = await cli(argv, author);
  record(
    'cli',
    `${action}: turboslide ${argv.join(' ')}`,
    null,
    `exit ${r.code}: ${(r.stderr || r.stdout).trim().split('\n')[0] || JSON.stringify(r.json).slice(0, 160)}`,
    r.ms,
  );
  return r;
}

async function main() {
  rmSync(SCRATCH, { recursive: true, force: true });
  mkdirSync(DECKS, { recursive: true });
  mkdirSync(DERIVED, { recursive: true });
  writeFileSync(join(SCRATCH, 'pnpm-workspace.yaml'), 'packages: []\n');
  cpSync(join(ROOT, 'decks', 'fixture', 'gslides'), DECK, { recursive: true });
  const gs3 = Object.entries(ACTIONS).filter(([, a]) => a.milestone === 'GS3');
  log(
    `agent walk: ${gs3.length} round three actions; ${gs3.filter(([, a]) => a.cli).length} with a CLI usage, ${gs3.filter(([, a]) => a.mcp).length} with an MCP name`,
  );

  // comments (SPEC-3 5.9)
  const added = await ok('comment.add', [
    'comment',
    'add',
    'slide:table',
    '-m',
    'Verifier: check this',
    '--mention',
    'maya',
  ]);
  const threadId = added?.thread?.id ?? added?.threadId ?? added?.id;
  const commentId =
    added?.thread?.comment?.id ??
    added?.comment?.id ??
    added?.thread?.comments?.[0]?.id ??
    added?.commentId;
  await ok(
    'comment.reply',
    ['comment', 'reply', threadId, '-m', 'Verifier reply', '--mention', 'tester'],
    'maya',
  );
  await ok('comment.edit', [
    'comment',
    'edit',
    threadId,
    commentId,
    '-m',
    'Verifier: check this number',
  ]);
  await ok('comment.assign', ['comment', 'assign', threadId, 'maya']);
  await ok('comment.done', ['comment', 'done', threadId], 'maya');
  await ok('comment.react', ['comment', 'react', threadId, commentId, '👍'], 'maya');
  await ok('comment.link', ['comment', 'link', threadId]);
  await ok('comment.get', ['comment', 'get', threadId]);
  await ok('comment.list', ['comments', '--state', 'all']);
  await ok('comment.list --for-me', ['comments', '--state', 'all', '--for-me'], 'maya', (j) =>
    Array.isArray(j?.threads) ? `${j.threads.length} thread(s) for maya` : true,
  );
  await ok('comment.resolve', ['comment', 'resolve', threadId]);
  await ok('comment.reopen', ['comment', 'reopen', threadId]);
  const reply = await cli(['comment', 'get', threadId]);
  const replyId =
    reply.json?.thread?.replies?.[0]?.id ??
    reply.json?.thread?.comments?.[1]?.id ??
    reply.json?.comments?.[1]?.id;
  if (replyId) {
    await ok('comment.delete', ['comment', 'delete', threadId, replyId], 'maya');
    await ok(
      'comment.delete --restore',
      ['comment', 'delete', threadId, replyId, '--restore'],
      'maya',
    );
  } else
    record(
      'cli',
      'comment.delete',
      false,
      `no reply id in comment get: ${JSON.stringify(reply.json).slice(0, 200)}`,
    );
  // notifications, activity, versions (5.5, 5.7)
  await ok(
    'notification.list',
    ['notifications', '--unread'],
    'maya',
    (j) => `${(j?.items ?? j?.notifications ?? []).length} unread for maya`,
  );
  const unread = await cli(['notifications', '--unread'], 'maya');
  const firstId = (unread.json?.items ?? unread.json?.notifications ?? [])[0]?.id;
  await ok(
    'notification.markRead',
    firstId ? ['notifications', 'read', firstId] : ['notifications', 'read', '--all'],
    'maya',
  );
  await ok('notification.settings', ['notifications', 'settings', '--level', 'forYou']);
  await ok('activity.list', ['activity']);
  // share (6.9)
  const rec = await ok('share.get', ['share', 'get', 'gslides']);
  await ok(
    'share.setGeneralAccess',
    ['share', 'access', 'gslides', '--mode', 'link', '--role', 'viewer'],
    'tester',
    (j) =>
      typeof j?.url === 'string' && /\/s\/[A-Za-z0-9_-]{22}$/.test(j.url)
        ? 'one /s/ link printed'
        : false,
  );
  const link = await ok('share.createLink', [
    'share',
    'link',
    'gslides',
    '--role',
    'commenter',
    '--label',
    'agency',
  ]);
  const linkId = link?.link?.id ?? link?.id;
  await ok('share.rotateLink', ['share', 'rotate-link', 'gslides', linkId]);
  const rec2 = await cli(['share', 'get', 'gslides']);
  const liveLink =
    (rec2.json?.record?.links ?? rec2.json?.links ?? []).find((l) => l.revokedAt === null)?.id ??
    linkId;
  await ok('share.revokeLink', ['share', 'revoke-link', 'gslides', liveLink]);
  await ok('share.invite', [
    'share',
    'invite',
    'gslides',
    '--email',
    'maya@example.test',
    '--role',
    'commenter',
    '--no-notify',
  ]);
  await ok('share.setRole', [
    'share',
    'role',
    'gslides',
    '--email',
    'maya@example.test',
    '--role',
    'editor',
  ]);
  await ok('share.setExpiry', [
    'share',
    'expire',
    'gslides',
    '--email',
    'maya@example.test',
    '--at',
    '2027-01-01T00:00:00.000Z',
  ]);
  await ok('share.settings', [
    'share',
    'settings',
    'gslides',
    '--viewers-can-see-comments',
    'true',
  ]);
  await ok('share.listRequests', ['share', 'requests', 'gslides']);
  await needsStudio('share.respond', [
    'share',
    'respond',
    'gslides',
    'req_none',
    '--grant',
    'commenter',
  ]);
  await needsStudio('share.transferOwnership', [
    'share',
    'transfer',
    'gslides',
    '--email',
    'maya@example.test',
  ]);
  await needsStudio('share.acceptOwnership', ['share', 'accept-ownership', 'gslides'], 'maya');
  await needsStudio('share.declineOwnership', ['share', 'decline-ownership', 'gslides'], 'maya');
  await needsStudio('share.claim', ['share', 'claim', 'gslides']);
  await needsStudio('share.emailCollaborators', [
    'share',
    'email',
    'gslides',
    '--message',
    'hello',
  ]);
  await ok('share.remove', ['share', 'remove', 'gslides', '--email', 'maya@example.test']);
  await ok('deck.publish', ['deck', 'publish', 'gslides'], 'tester', (j) =>
    typeof j?.url === 'string' && j.url.includes('?p=') ? 'a published link printed' : false,
  );
  await ok('deck.unpublish', ['deck', 'unpublish', 'gslides']);
  await ok('share.stop', ['share', 'stop', 'gslides']);
  // presence and sync (3.10)
  await ok('presence.list', ['presence', 'list']);
  await needsStudio('presence.follow', ['presence', 'follow', 'c_none']);
  await needsStudio('presence.unfollow', ['presence', 'unfollow']);
  await needsStudio('presence.pointer', ['presence', 'pointer', '--on']);
  await ok('sync.status', ['sync', 'status']);
  // account and admin (7.9)
  await ok('account.me', ['account', 'me']);
  await ok('account.setName', ['account', 'name', 'Verifier']);
  await needsStudio('account.setAvatar', ['account', 'avatar', '--variant', 'initials']);
  await ok('account.decks', ['account', 'decks']);
  await needsStudio('account.tokens.list', ['account', 'tokens', 'list', '--to', ORIGIN]);
  await needsStudio('account.tokens.create', [
    'account',
    'tokens',
    'create',
    '--to',
    ORIGIN,
    '--name',
    'walk',
    '--scope',
    'read',
  ]);
  await needsStudio('account.tokens.revoke', [
    'account',
    'tokens',
    'revoke',
    'tok_none',
    '--to',
    ORIGIN,
  ]);
  await needsStudio('account.sessions', ['account', 'sessions', '--to', ORIGIN]);
  await needsStudio('account.signOut', ['account', 'sign-out', '--to', ORIGIN]);
  await needsStudio('admin.bootstrap', [
    'admin',
    'bootstrap',
    '--to',
    ORIGIN,
    '--email',
    'kevin@example.test',
  ]);
  await needsStudio('admin.assignOwner', [
    'admin',
    'assign-owner',
    'gslides',
    '--email',
    'kevin@example.test',
  ]);
  await ok('admin.flag', ['admin', 'flag', 'readOnly']);
  await needsStudio('admin.migrateStorage', ['admin', 'migrate-storage', 'plan', '--to', ORIGIN]);
  await needsStudio('admin.mail.list', ['admin', 'mail', '--to', ORIGIN]);
  // dithers and backgrounds (10.5)
  await ok('picture.dither', [
    'block',
    'dither',
    'rotated#photo',
    '--pattern',
    'bayer8',
    '--black',
    '120',
    '--white',
    '230',
    '--gamma',
    '0.9',
  ]);
  await ok('picture.materialize --dry-run', ['picture', 'materialize', '--dry-run']);
  await ok('picture.materialize', ['picture', 'materialize']);
  await ok('picture.dither --off', ['block', 'dither', 'rotated#photo', '--off']);
  await ok('slide.setBackgroundPicture', [
    'slide',
    'background-picture',
    'title',
    '--asset',
    'fixture-photo',
    '--dither',
  ]);
  await ok('slide.setBackgroundMaterial', [
    'slide',
    'background-material',
    'title',
    'paper:liquid-metal',
    '--dither',
  ]);
  const infoNow = await cli(['info']);
  const revNow = infoNow.json?.revision ?? 2;
  await ok('version.diff', ['version', 'diff', String(Math.max(2, revNow - 2)), String(revNow)]);
  await needsStudio('deck.watch', ['deck', 'watch', 'gslides', '--since', '0']);
  await needsStudio('deck.follow', ['deck', 'follow', 'gslides', '--from', ORIGIN]);

  // MCP over stdio (3.10, 0.40)
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      join(ROOT, 'apps', 'cli', 'bin', 'turboslide.mjs'),
      'mcp',
      '--deck',
      DECK,
      '--derived',
      DERIVED,
    ],
    env: { ...process.env, USER: 'tester', TURBOSLIDE_DECKS_DIR: DECKS },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'verifier-walk', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  const t0 = performance.now();
  const listed = await client.listTools();
  const listMs = Math.round(performance.now() - t0);
  const bytes = Buffer.byteLength(JSON.stringify({ tools: listed.tools }));
  const names = new Set(listed.tools.map((tool) => tool.name));
  const gs3Mcp = gs3.filter(([, a]) => a.mcp).map(([id, a]) => [id, a.mcp]);
  /* the four account tools that act on a studio session are absent from a checkout's stdio list by design (SPEC-3 3.10: `--to` runs them hosted) */
  const HOSTED_ONLY = new Set([
    'account.tokens.list',
    'account.tokens.revoke',
    'account.sessions',
    'account.signOut',
  ]);
  const missing = gs3Mcp.filter(([id, name]) => !names.has(name) && !HOSTED_ONLY.has(id));
  const hostedAbsent = gs3Mcp
    .filter(([id, name]) => !names.has(name) && HOSTED_ONLY.has(id))
    .map(([id]) => id);
  const bigSchemas = listed.tools
    .filter(
      (tool) =>
        tool.outputSchema && Buffer.byteLength(JSON.stringify(tool.outputSchema)) >= 32 * 1024,
    )
    .map((tool) => tool.name);
  record(
    'mcp',
    'tools/list under the budgets',
    bytes < 4 * 1024 * 1024 && missing.length === 0 && bigSchemas.length === 0,
    `${listed.tools.length} tools, ${bytes} bytes (budget 4 MiB) in ${listMs} ms; round three tools ${gs3Mcp.length - missing.length} of ${gs3Mcp.length}${missing.length ? `, missing ${missing.map(([id]) => id).join(', ')}` : ''}${bigSchemas.length ? `; output schemas over 32 KiB: ${bigSchemas.join(', ')}` : ''}${hostedAbsent.length ? `; absent on a checkout by design (hosted sessions): ${hostedAbsent.join(', ')}` : ''}`,
    listMs,
  );
  const call = async (name, args, check) => {
    const t = performance.now();
    try {
      const result = await client.callTool({ name, arguments: args });
      const text = result.content?.find((c) => c.type === 'text')?.text ?? '';
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      const isError = result.isError === true || parsed?.error !== undefined;
      const extra = check ? check(parsed ?? result.structuredContent) : null;
      record(
        'mcp',
        name,
        !isError && extra !== false,
        `${isError ? `error: ${text.slice(0, 160)}` : text.slice(0, 160) || JSON.stringify(result.structuredContent ?? {}).slice(0, 160)}${typeof extra === 'string' ? `; ${extra}` : ''}`,
        Math.round(performance.now() - t),
      );
      return parsed ?? result.structuredContent ?? null;
    } catch (error) {
      record(
        'mcp',
        name,
        false,
        `threw: ${String(error).slice(0, 200)}`,
        Math.round(performance.now() - t),
      );
      return null;
    }
  };
  await call('deck_list_comments', { state: 'all' }, (j) =>
    Array.isArray(j?.threads) ? `${j.threads.length} thread(s)` : false,
  );
  const mcpAdded = await call('deck_add_comment', {
    anchor: { kind: 'slide', slideId: 'breaks' },
    body: { text: 'From the MCP client', mentions: [] },
  });
  const mcpThread = mcpAdded?.thread?.id ?? mcpAdded?.threadId;
  if (mcpThread) await call('deck_resolve_comment', { threadId: mcpThread });
  await call('deck_get_share', { id: 'gslides' }, (j) =>
    (j?.record?.generalAccess ?? j?.generalAccess)
      ? `general access ${(j.record ?? j).generalAccess.mode}`
      : false,
  );
  await call('deck_list_presence', {});
  await call('deck_sync_status', {}, (j) =>
    j?.tier ? `tier ${j.tier}, transport ${j.transport}` : false,
  );
  await call('deck_get_me', {}, (j) => ((j?.principalId ?? j?.principal) ? 'a principal' : false));
  await call('deck_list_notifications', { unread: true });
  await call('deck_list_activity', {});
  const infoTool = listed.tools.find((t) => t.name === 'deck_info')
    ? 'deck_info'
    : listed.tools.find((t) => /info/.test(t.name))?.name;
  const revOf = async () => {
    const r = await client.callTool({ name: infoTool, arguments: {} });
    const text = r.content?.find((c) => c.type === 'text')?.text ?? '{}';
    try {
      return JSON.parse(text).revision;
    } catch {
      return 0;
    }
  };
  let mrev = await revOf();
  await call('deck_version_diff', { from: Math.max(2, mrev - 2), to: mrev });
  await call('deck_dither_picture', {
    slideId: 'rotated',
    blockId: 'photo',
    dither: { pattern: 'bayer8', black: 120, white: 230, gamma: 0.9 },
    baseRevision: mrev,
  });
  mrev = await revOf();
  await call('deck_materialize_pictures', { slideIds: 'all', dryRun: true, baseRevision: mrev });
  mrev = await revOf();
  await call('deck_dither_picture', {
    slideId: 'rotated',
    blockId: 'photo',
    dither: null,
    baseRevision: mrev,
  });
  await call('deck_admin_flag', { name: 'readOnly' });
  await call('deck_list_my_decks', { view: 'owned' });
  const resources = await client.listResources();
  const uris = resources.resources.map((r) => r.uri);
  const wantUris = ['deck://gslides/comments', 'deck://gslides/presence', 'deck://inbox'];
  const missingUris = wantUris.filter(
    (u) => !uris.some((x) => x === u || x.endsWith(u.replace('deck://gslides', ''))),
  );
  record(
    'mcp',
    'resources/list',
    missingUris.length === 0,
    `${uris.length} resources; ${missingUris.length ? `missing ${missingUris.join(', ')}` : 'the comments, presence and inbox resources listed'}: ${uris.filter((u) => /comments|presence|inbox/.test(u)).join(', ')}`,
  );
  const commentsUri = uris.find((u) => /comments/.test(u));
  if (commentsUri) {
    const read = await client.readResource({ uri: commentsUri });
    const text = read.contents?.[0]?.text ?? '';
    record(
      'mcp',
      `resources/read ${commentsUri}`,
      text.length > 0,
      `${text.length} bytes; ${text.slice(0, 120).replace(/\s+/g, ' ')}`,
    );
  }
  await client.close();
  const valid = await validates();
  record('cli', 'validate at the end', valid, valid ? 'exit 0' : 'the deck no longer validates');
  const summary = {
    ok: rows.filter((r) => r.ok === true).length,
    fail: rows.filter((r) => r.ok === false).length,
    notes: rows.filter((r) => r.ok === null).length,
  };
  writeFileSync(
    OUT,
    `${JSON.stringify({ at: new Date().toISOString(), scratch: DECK, summary, rows }, null, 2)}\n`,
  );
  log(
    `agent walk: ${summary.ok} ok, ${summary.fail} fail, ${summary.notes} noted (a hosted studio or a session needed); report ${OUT}`,
  );
  process.exit(summary.fail === 0 ? 0 : 1);
}
main().catch((error) => {
  log(`agent walk threw: ${error?.stack ?? error}`);
  process.exit(1);
});
