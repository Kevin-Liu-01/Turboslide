// Every generated contract surface by repo-relative path (SPEC 7.1; MILESTONES M1 item 4, M4
// item 1): packages/agent/generated/{cli,mcp-tools,describe,openapi,manifest}.json, the two
// llms guides, docs/grammar.md, the rule ids as JSON with the lint fixture index (M5), the four
// skills' reference files and, since polish two, the docs' action reference and grammar pages
// under apps/studio/content/docs (docs.ts). generateAll() is pure; writeAll() writes; staleFiles() is what
// the test and `--check` use. Outputs are deterministic so `git diff --exit-code` passes after a
// fresh generation.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCli } from './cli.ts';
import { generateDescribe } from './describe.ts';
import { generateDocsGrammar, generateDocsReference } from './docs.ts';
import {
  FIXTURE_INDEX_PATH,
  RULES_JSON_PATH,
  generateFixtureIndex,
  generateRulesJson,
} from './fixtures.ts';
import { generateGrammar } from './grammar.ts';
import { stableJson } from './json-schema.ts';
import { generateLlms, generateLlmsFull } from './llms.ts';
import { generateManifest } from './manifest.ts';
import { generateMcpTools } from './mcp.ts';
import { generateOpenApi } from './openapi.ts';
import { generateSkillReferences } from './skills.ts';

/** The repository root, four levels above this file (packages/agent/src/generate). */
export const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

export const GENERATED_DIR = 'packages/agent/generated';

export function generateAll(): Record<string, string> {
  /* the five contracts once: the docs' reference reads its counts from these same objects */
  const contracts = {
    cli: generateCli(),
    mcp: generateMcpTools(),
    describe: generateDescribe(),
    openapi: generateOpenApi(),
    manifest: generateManifest(),
  };
  return {
    [`${GENERATED_DIR}/cli.json`]: stableJson(contracts.cli),
    [`${GENERATED_DIR}/mcp-tools.json`]: stableJson(contracts.mcp),
    [`${GENERATED_DIR}/describe.json`]: stableJson(contracts.describe),
    [`${GENERATED_DIR}/openapi.json`]: stableJson(contracts.openapi),
    [`${GENERATED_DIR}/manifest.json`]: stableJson(contracts.manifest),
    [`${GENERATED_DIR}/llms.txt`]: generateLlms(),
    [`${GENERATED_DIR}/llms-full.txt`]: generateLlmsFull(),
    'docs/grammar.md': generateGrammar(),
    [RULES_JSON_PATH]: generateRulesJson(),
    [FIXTURE_INDEX_PATH]: generateFixtureIndex(),
    ...generateSkillReferences(),
    /* polish two (docs/POLISH-2.md 5.3, 5.4): the docs' action reference and grammar pages */
    ...generateDocsReference(contracts),
    ...generateDocsGrammar(),
  };
}

export type StaleFile = { path: string; reason: 'missing' | 'differs' };

/** Files whose committed content differs from a fresh generation. */
export function staleFiles(root: string = REPO_ROOT): StaleFile[] {
  const out: StaleFile[] = [];
  for (const [path, content] of Object.entries(generateAll())) {
    const absolute = join(root, path);
    if (!existsSync(absolute)) {
      out.push({ path, reason: 'missing' });
      continue;
    }
    if (readFileSync(absolute, 'utf8') !== content) out.push({ path, reason: 'differs' });
  }
  return out;
}

/** Writes every output; returns the paths that changed. */
export function writeAll(root: string = REPO_ROOT): string[] {
  const changed: string[] = [];
  for (const [path, content] of Object.entries(generateAll())) {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    const before = existsSync(absolute) ? readFileSync(absolute, 'utf8') : undefined;
    if (before !== content) {
      writeFileSync(absolute, content);
      changed.push(path);
    }
  }
  return changed;
}
