import { describe, expect, test } from 'vitest';

import {
  CHROME_ALLOW,
  DECK_CHROME,
  SHELL_CHROME,
  TURBOSLIDE_CHROME,
  auditDocument,
  failingAudit,
  formatAudit,
  probeState,
} from './chrome.ts';
import type { AuditResult } from './chrome.ts';

const empty: AuditResult = {
  total: 0,
  doubles: [],
  junctions: [],
  colors: [],
  missing: [],
  selfStacks: [],
  invisibles: [],
  roles: null,
};

describe('chrome audit configuration', () => {
  test("the allow list is the deck's five devices plus the selection ring (SPEC 2.2)", () => {
    expect([...CHROME_ALLOW]).toEqual([
      'sheet',
      'thumb-frame',
      'page-frame',
      'pt-tile',
      'pt-preview',
      'ts-select',
    ]);
  });

  test('the scopes read the prefixed tokens first and keep the rendered sheet as content', () => {
    expect(SHELL_CHROME.tokens.hair).toEqual(['--pt-hair', '--hair']);
    expect(TURBOSLIDE_CHROME.content).toContain('.ts-sheet');
    expect(TURBOSLIDE_CHROME.roots).toContain('.pt-viewer');
    expect(DECK_CHROME.prefix).toBeNull();
  });

  test('the in-page functions are self-contained so Playwright can serialize them', () => {
    for (const fn of [auditDocument, probeState]) {
      const source = fn.toString();
      for (const name of [
        'CHROME_ALLOW',
        'SHELL_CHROME',
        'TURBOSLIDE_CHROME',
        'DECK_CHROME',
        'failingAudit',
        'formatAudit',
        'import(',
        'require(',
      ]) {
        expect(source.includes(name), `${fn.name} references ${name}`).toBe(false);
      }
    }
  });

  test('failing and formatting follow lint-lines.mjs', () => {
    expect(failingAudit(empty)).toBe(false);
    expect(
      failingAudit({
        ...empty,
        selfStacks: [{ owner: 'pt-row', side: 'bottom', at: 10, len: 40 }],
      }),
    ).toBe(false);
    const bad: AuditResult = {
      ...empty,
      doubles: [{ orient: 'h', at: 52, gap: 1, a: 'pt-toolbar', b: 'pt-sb', span: 300 }],
      colors: [
        {
          kind: 'border',
          owner: 'pt-x',
          side: 'top',
          color: 'rgb(255, 0, 0)',
          role: 'none',
          at: 10,
        },
      ],
    };
    expect(failingAudit(bad)).toBe(true);
    expect(formatAudit(bad)).toEqual([
      '  double h@52 gap 1: pt-toolbar | pt-sb (300px)',
      '  color border top of pt-x @10: rgb(255, 0, 0) (none)',
    ]);
  });
});
