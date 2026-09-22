import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FROM,
  DEFAULT_PATH,
  DEFAULT_TO,
  authenticatedPostCommand,
  expectedLocation,
  functionsOfInspect,
  functionsOfInspectText,
  gateCommand,
  judgeRedirect,
  parseArgs,
  smokeCommand,
  verdictOf,
} from './hosting-check.mjs';

// The parsers of scripts/hosting-check.mjs (docs/HOSTING-MOVE.md section 10 item 3 and section
// 7's acceptance): the 308 with the path and the query kept, the function list of `vercel
// inspect --json` (the shape production answered on 2026-09-21: `builds[].output[]` with
// `type: "lambda"`), the text form's λ rows, and the commands the script prints instead of
// running. No network and no CLI here.

const TO = 'https://turboslide-general-translation.vercel.app';

describe('parseArgs', () => {
  it('reads the defaults of the plan', () => {
    const args = parseArgs([]);
    expect(args.from).toBe(DEFAULT_FROM);
    expect(args.to).toBe(DEFAULT_TO);
    expect(args.path).toBe(DEFAULT_PATH);
    expect(args.inspect).toBe(true);
    expect(args.parked).toBeNull();
  });

  it('trims a trailing slash off an origin and adds the leading slash of a path', () => {
    const args = parseArgs([
      '--from',
      'https://a.example/',
      '--to',
      `${TO}/`,
      '--path',
      'deck/x?y=1',
      '--no-inspect',
      '--parked',
      'ship.json',
    ]);
    expect(args.from).toBe('https://a.example');
    expect(args.to).toBe(TO);
    expect(args.path).toBe('/deck/x?y=1');
    expect(args.inspect).toBe(false);
    expect(args.parked).toBe('ship.json');
  });

  it('refuses an unknown argument', () => {
    expect(() => parseArgs(['--prod'])).toThrow(/unknown argument --prod/);
  });
});

describe('expectedLocation and judgeRedirect', () => {
  it('keeps the path and the query', () => {
    expect(expectedLocation(`${TO}/`, '/edit/abc?x=1')).toBe(`${TO}/edit/abc?x=1`);
  });

  it('passes a 308 to the team address with the path and the query', () => {
    const judged = judgeRedirect(
      { status: 308, location: `${TO}/edit/abc?x=1` },
      { to: TO, path: '/edit/abc?x=1' },
    );
    expect(judged.ok).toBe(true);
  });

  it('names a 307 as the WAF rule or the app', () => {
    const judged = judgeRedirect(
      { status: 307, location: `${TO}/edit/abc?x=1` },
      { to: TO, path: '/edit/abc?x=1' },
    );
    expect(judged.ok).toBe(false);
    expect(judged.reason).toMatch(/307/);
    expect(judged.reason).toMatch(/WAF/);
  });

  it('fails a 308 that drops the query, the path, or the host', () => {
    expect(
      judgeRedirect({ status: 308, location: `${TO}/edit/abc` }, { to: TO, path: '/edit/abc?x=1' }),
    ).toMatchObject({ ok: false, reason: expect.stringMatching(/drops the query/) });
    expect(
      judgeRedirect({ status: 308, location: `${TO}/?x=1` }, { to: TO, path: '/edit/abc?x=1' }),
    ).toMatchObject({ ok: false, reason: expect.stringMatching(/drops the path/) });
    expect(
      judgeRedirect(
        { status: 308, location: 'https://other.example/edit/abc?x=1' },
        { to: TO, path: '/edit/abc?x=1' },
      ),
    ).toMatchObject({ ok: false, reason: expect.stringMatching(/is on https:\/\/other\.example/) });
  });

  it('fails a relative location (the same host), a missing location and what production answers today', () => {
    expect(
      judgeRedirect({ status: 308, location: '/edit/abc?x=1' }, { to: TO, path: '/edit/abc?x=1' }),
    ).toMatchObject({ ok: false, reason: expect.stringMatching(/relative/) });
    expect(
      judgeRedirect({ status: 308, location: null }, { to: TO, path: '/edit/abc?x=1' }),
    ).toMatchObject({ ok: false, reason: expect.stringMatching(/without a location/) });
    expect(
      judgeRedirect({ status: 404, location: null }, { to: TO, path: '/edit/abc?x=1' }),
    ).toMatchObject({ ok: false, reason: 'status 404' });
    expect(
      judgeRedirect({ status: 401, location: null }, { to: TO, path: '/api/actions/deck.info' }),
    ).toMatchObject({ ok: false, reason: 'status 401' });
  });
});

describe('functionsOfInspect', () => {
  /** The shape `vercel inspect --json` answered for production on 2026-09-21 (ten lambda outputs). */
  const production = {
    id: 'dpl_x',
    readyState: 'READY',
    url: 'turboslide-la2ibidab-kl01s-projects.vercel.app',
    builds: [
      {
        output: [
          { type: 'lambda', path: '__server', size: 109565326 },
          { type: 'lambda', path: '_serverFn/[...]', size: 109565326 },
          { type: 'lambda', path: 'api/export/[...]', size: 109565326 },
        ],
      },
    ],
  };
  /** A static deployment: files alone. */
  const redirectOnly = {
    id: 'dpl_y',
    readyState: 'READY',
    builds: [{ output: [{ type: 'file', path: 'index.html', size: 300 }] }],
  };

  it('lists every lambda and edge output', () => {
    expect(functionsOfInspect(production)).toEqual([
      '__server',
      '_serverFn/[...]',
      'api/export/[...]',
    ]);
    expect(
      functionsOfInspect({ builds: [{ output: [{ type: 'edge', path: 'middleware' }] }] }),
    ).toEqual(['middleware']);
  });

  it('lists nothing for a static deployment, an empty answer or a malformed one', () => {
    expect(functionsOfInspect(redirectOnly)).toEqual([]);
    expect(functionsOfInspect({})).toEqual([]);
    expect(functionsOfInspect(null)).toEqual([]);
    expect(functionsOfInspect({ builds: [{ output: 'nope' }] })).toEqual([]);
  });

  it('reads the λ rows of the text form and nothing else', () => {
    const text = [
      '  Builds',
      '',
      '    ┌ .        [0ms]',
      '    ├── λ __server (104.49MB) [iad1]',
      '    ├── λ _serverFn/[...] (104.49MB) [iad1]',
      '    └── 5 output items hidden',
    ].join('\n');
    expect(functionsOfInspectText(text)).toEqual(['__server', '_serverFn/[...]']);
    expect(functionsOfInspectText('  Builds\n    └── index.html (300B)')).toEqual([]);
  });
});

describe('the commands and the verdict', () => {
  it('names the team address and the flags of section 10', () => {
    expect(smokeCommand(`${TO}/`)).toBe(
      `node scripts/hosted-smoke.mjs ${TO} --token-env TURBOSLIDE_TOKEN --template-copy`,
    );
    expect(gateCommand(TO, 'docs/gslides-parity/focus/ship-abc1234.json')).toBe(
      `node scripts/probes/core-gate.mjs --base ${TO} --parked docs/gslides-parity/focus/ship-abc1234.json`,
    );
    expect(gateCommand(TO, null)).toContain('ship-<commit>.json');
    expect(authenticatedPostCommand(DEFAULT_FROM, TO)).toContain(
      `turboslide share get gt-brand --to ${DEFAULT_FROM}`,
    );
    expect(authenticatedPostCommand(DEFAULT_FROM, TO)).toContain(`turboslide login --to ${TO}`);
  });

  it('passes only when every driven row passed and no row was left undriven', () => {
    const pass = { driven: true, ok: true };
    const fail = { driven: true, ok: false };
    const undriven = { driven: false, ok: false };
    const skipped = { driven: false, ok: false, skipped: true };
    expect(verdictOf([pass, pass, skipped])).toMatchObject({
      ok: true,
      passed: 2,
      failed: 0,
      undriven: 0,
      total: 2,
    });
    expect(verdictOf([pass, fail])).toMatchObject({ ok: false, failed: 1 });
    expect(verdictOf([pass, undriven])).toMatchObject({ ok: false, undriven: 1 });
  });
});
