#!/usr/bin/env node
// MILESTONES-3 B1 acceptance, `node apps/cli/e2e/share.mjs`: the collaboration commands of
// gslides-parity SPEC-3 section 12 over a scratch copy of decks/fixture/gslides with no server,
// in process through runCli the way deck-transfer.mjs runs the CLI. The walk is the temp deck
// walk of MILESTONES-3: comment add, reply, resolve, comments --for-me, share access --mode link,
// share link, share get, share stop, deck publish, deck unpublish, block dither, picture
// materialize --dry-run, slide background-picture --asset --dither, presence list, sync status,
// account me, notifications --unread, and version diff; every command exits 0 with --json and the
// deck validates after each write. The scratch deck lives under .turboslide/e2e-share/ so the
// committed fixture is not touched; the inbox and the principal records land under the scratch
// tree's .turboslide/. Exit 0 only when every step passes; the failing step and its stderr print
// otherwise.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCli } from '@turboslide/cli/cli';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRATCH = join(ROOT, '.turboslide', 'e2e-share');
const DECKS = join(SCRATCH, 'decks');
const DECK = join(DECKS, 'gslides');
const ORIGIN = 'https://studio.test';

const log = (line) => process.stderr.write(`${line}\n`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** One CLI call with --json; the parsed stdout when the command printed any. */
async function cli(argv, author = 'tester') {
  let stdout = '';
  let stderr = '';
  const code = await runCli([...argv, '--deck', DECK, '--json', '--author', author], {
    cwd: SCRATCH,
    env: { USER: 'tester', TURBOSLIDE_ORIGIN: ORIGIN, TURBOSLIDE_DECKS_DIR: DECKS },
    streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
    stdin: async () => '',
  });
  return { code, stdout, stderr, json: stdout.trim() === '' ? undefined : JSON.parse(stdout) };
}

async function ok(argv, author) {
  const result = await cli(argv, author);
  assert(result.code === 0, `${argv.join(' ')} exited ${result.code}: ${result.stderr}`);
  return result.json;
}

async function validates() {
  const result = await cli(['validate', DECK]);
  assert(result.code === 0, `validate failed: ${result.stderr}`);
}

async function main() {
  rmSync(SCRATCH, { recursive: true, force: true });
  mkdirSync(DECKS, { recursive: true });
  writeFileSync(join(SCRATCH, 'pnpm-workspace.yaml'), 'packages: []\n');
  cpSync(join(ROOT, 'decks', 'fixture', 'gslides'), DECK, { recursive: true });
  const steps = [];
  let current = '';
  const step = async (name, fn) => {
    current = name;
    const startedAt = Date.now();
    const value = await fn();
    steps.push(`${name} (${Date.now() - startedAt} ms)`);
    log(`ok   ${name}`);
    return value;
  };
  try {
    const thread = await step('comment add slide:table -m "check this"', async () => {
      const answer = await ok([
        'comment',
        'add',
        'slide:table',
        '-m',
        'check this',
        '--mention',
        'maya',
      ]);
      assert(answer.thread.anchor.kind === 'slide', 'the anchor is not a slide');
      await validates();
      return answer.thread.id;
    });
    await step('comment reply <threadId> -m "done"', async () => {
      const answer = await ok(['comment', 'reply', thread, '-m', 'done'], 'maya');
      assert(answer.thread.replies.length === 1, 'no reply recorded');
      await validates();
    });
    await step('comment resolve <threadId>', async () => {
      const answer = await ok(['comment', 'resolve', thread]);
      assert(answer.thread.resolved !== undefined, 'not resolved');
      await validates();
    });
    await step('comments --for-me', async () => {
      const mine = await ok(['comments', '--state', 'all', '--for-me'], 'maya');
      assert(
        mine.threads.some((row) => row.id === thread),
        'the mentioned thread is not listed for maya',
      );
      const notMine = await ok(['comments', '--for-me']);
      assert(
        notMine.threads.every((row) => row.id !== thread),
        'the thread is listed for its author under --for-me',
      );
    });
    await step('share access --mode link --role viewer', async () => {
      const answer = await ok(['share', 'access', 'gslides', '--mode', 'link', '--role', 'viewer']);
      assert(/\/s\/[A-Za-z0-9_-]{22}$/.test(answer.url), `no share URL: ${answer.url}`);
      assert(answer.record.generalAccess.mode === 'link', 'general access is not link');
      await validates();
    });
    const linkId = await step('share link --role commenter', async () => {
      const answer = await ok([
        'share',
        'link',
        'gslides',
        '--role',
        'commenter',
        '--label',
        'agency',
      ]);
      assert(answer.link.role === 'commenter', 'the link role is not commenter');
      assert(
        !JSON.stringify(answer.record).includes(answer.url.slice(-22)),
        'the token is stored on the record',
      );
      await validates();
      return answer.link.id;
    });
    await step('share get', async () => {
      const answer = await ok(['share', 'get', 'gslides']);
      assert(answer.role === 'owner', `the caller is ${answer.role}, not owner`);
      assert(
        answer.record.links.some((row) => row.id === linkId && row.revokedAt === null),
        'the link is not live',
      );
    });
    await step('share stop', async () => {
      const answer = await ok(['share', 'stop', 'gslides']);
      assert(answer.record.generalAccess.mode === 'restricted', 'not restricted after stop');
      assert(
        answer.record.links.every((row) => row.revokedAt !== null),
        'a link survived stop',
      );
      await validates();
    });
    await step('deck publish', async () => {
      const answer = await ok(['deck', 'publish', 'gslides']);
      assert(answer.url.startsWith(`${ORIGIN}/deck/gslides?p=`), `no player URL: ${answer.url}`);
      assert(
        answer.embed.startsWith(`${ORIGIN}/embed/gslides?p=`),
        `no embed URL: ${answer.embed}`,
      );
      await validates();
    });
    await step('deck unpublish', async () => {
      const answer = await ok(['deck', 'unpublish', 'gslides']);
      assert(answer.record.publish.revokedAt !== null, 'publish not revoked');
      await validates();
    });
    await step(
      'block dither rotated#photo --pattern bayer8 --black 120 --white 230 --gamma 0.9',
      async () => {
        const answer = await ok([
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
        assert(typeof answer.key === 'string' && answer.key.length >= 12, 'no variant key');
        await validates();
      },
    );
    await step('picture materialize --dry-run', async () => {
      const answer = await ok(['picture', 'materialize', '--dry-run']);
      assert(
        answer.missing.some((row) => row.slideId === 'rotated' && row.blockId === 'photo'),
        'the dithered picture is not listed as missing',
      );
    });
    await step('slide background-picture title --asset fixture-photo --dither', async () => {
      const answer = await ok([
        'slide',
        'background-picture',
        'title',
        '--asset',
        'fixture-photo',
        '--dither',
      ]);
      assert(
        answer.slides.length === 1 && answer.slides[0].slideId === 'title',
        'the background did not land on title',
      );
      await validates();
    });
    await step('presence list', async () => {
      const answer = await ok(['presence', 'list']);
      assert(
        answer.self.principalId === 'local:tester' && answer.others.length === 0,
        'the roster is not the caller alone',
      );
    });
    await step('sync status', async () => {
      const answer = await ok(['sync', 'status']);
      assert(
        answer.tier === 'memory' && answer.transport === 'file' && answer.connected === false,
        'sync status is not the file store',
      );
    });
    await step('account me', async () => {
      const answer = await ok(['account', 'me']);
      assert(answer.principal.id === 'local:tester', `the principal is ${answer.principal.id}`);
    });
    await step('notifications --unread', async () => {
      const answer = await ok(['notifications', '--unread'], 'maya');
      assert(
        answer.notifications.some((row) => row.kind === 'mention'),
        'the mention did not reach the inbox',
      );
    });
    await step('version diff', async () => {
      const { revision } = JSON.parse(readFileSync(join(DECK, 'deck.json'), 'utf8'));
      const answer = await ok(['version', 'diff', String(revision - 2), String(revision)]);
      assert(answer.byAuthor.length === 1, 'the diff groups more than one author');
    });
    await step('validate', validates);
    log(`share e2e: ${steps.length} steps passed`);
    for (const line of steps) log(`  ${line}`);
  } catch (error) {
    log(`FAIL at ${current}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    rmSync(SCRATCH, { recursive: true, force: true });
  }
}

await main();
