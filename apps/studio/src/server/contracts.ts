import describeJson from '@turboslide/agent/generated/describe.json?raw';
import llmsFull from '@turboslide/agent/generated/llms-full.txt?raw';
import llms from '@turboslide/agent/generated/llms.txt?raw';
import openapi from '@turboslide/agent/generated/openapi.json?raw';

/**
 * The generated agent contracts the studio serves (SPEC 7.1, MILESTONES M1
 * items 4 and 11, M4 item 1): openapi.json, llms.txt, llms-full.txt and
 * describe().actions are written by `pnpm generate:contracts` into
 * packages/agent/generated and served here verbatim, so the HTTP surface and
 * the committed files cannot disagree. /api/agent adds the instance's runtime
 * facts on top (routes/api/agent.ts, @turboslide/agent/http/manifest).
 *
 * Round four (gslides-parity SPEC-4 3.11; R05 8.4): the files travel inside
 * the server bundle as raw strings (`?raw`), so a hosted function answers the
 * committed contracts instead of the stubs it answered when it had no
 * checkout to read them from (production served the placeholders until this
 * round). The routes send `CONTRACTS_CACHE_CONTROL` so the CDN holds a copy for
 * a day and the browser for five minutes; a deploy changes the bundle, so the
 * function answers the new file and the CDN's copy is a day old at worst.
 */

/** The cache rule of the three contracts routes (SPEC-4 3.11). */
export const CONTRACTS_CACHE_CONTROL = 'public, max-age=300, s-maxage=86400';

/** The OpenAPI 3.1 document. */
export function openApiDocument(): string {
  return openapi;
}

/** The llms-full.txt guide (every action and rule). */
export function llmsFullText(): string {
  return llmsFull;
}

/** The llms.txt index. */
export function llmsText(): string {
  return llms;
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
  const parsed = JSON.parse(describeJson) as { actions?: unknown[]; version?: string };
  return {
    name: 'turboslide',
    version: parsed.version ?? '0.0.0',
    transports: ['http'],
    actions: parsed.actions ?? [],
    generated: true,
  };
}
