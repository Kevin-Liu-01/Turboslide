import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PRESET_DEFINITIONS, PRESET_DEFINITIONS_SHA256 } from './definitions.ts';
import { CONNECTOR_GEOMETRY_IDS, PRESET_DEFINITION_IDS, SHAPE_GEOMETRY_IDS } from './ids.ts';

// The generated shape table of round four (gslides-parity SPEC-4 0.44, 3.12; PP 7 row 3): one
// compact JSON string parsed at load, the names beside it in ids.ts, both written by
// packages/schema/scripts/build-definitions.mjs and asserted current by its --check.

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', '..', 'scripts', 'build-definitions.mjs');

describe('the shape definitions table', () => {
  it('is one compact JSON string: no pretty printing, one line per module constant', () => {
    const source = readFileSync(join(HERE, 'definitions.ts'), 'utf8');
    const literal = /export const PRESET_DEFINITIONS[^\n]*JSON\.parse\('([^']+)'\)/.exec(source);
    expect(literal).not.toBeNull();
    const body = literal?.[1] ?? '';
    expect(body).not.toMatch(/\n/);
    expect(body).not.toMatch(/": /);
    expect(JSON.parse(body)).toEqual(PRESET_DEFINITIONS);
    expect(source.length).toBeLessThan(260_000);
  });

  it('names every preset in ids.ts, in table order, with the three connectors apart', () => {
    expect(PRESET_DEFINITION_IDS).toEqual(Object.keys(PRESET_DEFINITIONS));
    expect(SHAPE_GEOMETRY_IDS).toHaveLength(135);
    expect([...CONNECTOR_GEOMETRY_IDS]).toEqual([
      'straightConnector1',
      'bentConnector3',
      'curvedConnector3',
    ]);
    expect(new Set(PRESET_DEFINITION_IDS).size).toBe(PRESET_DEFINITION_IDS.length);
    expect(PRESET_DEFINITIONS_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is current against the generator (build-definitions.mjs --check)', () => {
    const out = execFileSync(process.execPath, [SCRIPT, '--check'], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    expect(out).toBe('');
  });
});
