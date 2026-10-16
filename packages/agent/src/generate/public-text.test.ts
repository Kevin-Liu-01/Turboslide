import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './contracts.ts';
import { publicText } from './public-text.ts';

// The public contracts cite no repository document (hardening HR-C#12, CLEANUP-14).

describe('publicText', () => {
  it('drops a citation parenthetical, the citing part of a mixed one and a closing clause', () => {
    expect(publicText('Licence (docs/archive/rounds/PRODUCT.md 4.2).')).toBe('Licence.');
    expect(publicText('On by default (measured; docs/pptx.md).')).toBe('On by default (measured).');
    expect(publicText('Inside a budget; docs/hosting.md section 10.')).toBe('Inside a budget.');
    expect(publicText('Plain text (no citation).')).toBe('Plain text (no citation).');
  });
});

describe('the generated contracts', () => {
  it('name no repository docs/ path and no SPEC- document; /docs pages are public', () => {
    const dir = join(REPO_ROOT, 'packages/agent/generated');
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.json'))) {
      const text = readFileSync(join(dir, file), 'utf8');
      expect(/(?:^|[^/\w])docs\//.exec(text)?.[0], file).toBeUndefined();
      expect(text.includes('SPEC-'), file).toBe(false);
    }
  });
});
