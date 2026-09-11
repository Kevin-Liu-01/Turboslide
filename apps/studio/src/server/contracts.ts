import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from './root';

/**
 * The generated agent contracts the studio serves (SPEC 7.1, MILESTONES M1
 * items 4 and 11, M4 item 1): openapi.json, llms.txt, llms-full.txt and
 * describe().actions are written by `pnpm generate:contracts` into
 * packages/agent/generated and served here verbatim, so the HTTP surface and
 * the committed files cannot disagree. /api/agent adds the instance's runtime
 * facts on top (routes/api/agent.ts, @turboslide/agent/http/manifest). The
 * fallbacks below name the generator instead of inventing an action list.
 */

const GENERATED = ['packages', 'agent', 'generated'];

function readGenerated(name: string): string | null {
  const path = join(repoRoot(), ...GENERATED, name);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/** The OpenAPI 3.1 document, or a stub naming the generator. */
export function openApiDocument(): string {
  return (
    readGenerated('openapi.json') ??
    JSON.stringify(
      {
        openapi: '3.1.0',
        info: {
          title: 'Turboslide',
          version: '0.0.0',
          description:
            'Placeholder: packages/agent/generated/openapi.json has not been generated yet. Run pnpm generate:contracts.',
        },
        paths: {},
      },
      null,
      2,
    )
  );
}

/** The llms-full.txt guide (every action and rule), or a stub naming the generator. */
export function llmsFullText(): string {
  return (
    readGenerated('llms-full.txt') ??
    'Placeholder: packages/agent/generated/llms-full.txt has not been generated yet. Run pnpm generate:contracts.\n'
  );
}

/** The llms.txt index, or a stub naming the generator. */
export function llmsText(): string {
  return (
    readGenerated('llms.txt') ??
    [
      '# Turboslide',
      '',
      '> A block document with a validator and a grammar linter; every operation is a named action.',
      '',
      'Placeholder: packages/agent/generated/llms.txt has not been generated yet. Run pnpm generate:contracts.',
      '',
      '- /api/agent: describe() with the action table',
      '- /openapi.json: the OpenAPI 3.1 document',
      '',
    ].join('\n')
  );
}

export type Describe = {
  name: 'turboslide';
  version: string;
  transports: readonly string[];
  actions: unknown[];
  generated: boolean;
  note?: string;
};

/** describe(): the manifest with the action table (SPEC 7.4), read only in M1 (no writes). */
export function describe(): Describe {
  const raw = readGenerated('describe.json');
  if (raw) {
    const parsed = JSON.parse(raw) as { actions?: unknown[]; version?: string };
    return {
      name: 'turboslide',
      version: parsed.version ?? '0.0.0',
      transports: ['http'],
      actions: parsed.actions ?? [],
      generated: true,
    };
  }
  return {
    name: 'turboslide',
    version: '0.0.0',
    transports: ['http'],
    actions: [],
    generated: false,
    note: 'packages/agent/generated/describe.json has not been generated yet. Run pnpm generate:contracts.',
  };
}
