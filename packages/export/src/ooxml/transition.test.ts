import { describe, expect, test } from 'vitest';

import type { TransitionKind } from '@turboslide/schema/motion';
import { TRANSITION_KINDS } from '@turboslide/schema/motion';

import {
  declareMotionNamespaces,
  MC_NAMESPACE,
  P14_KINDS,
  P14_NAMESPACE,
  readTransition,
  spdOf,
  transitionElements,
  transitionXml,
  writeTransition,
} from './transition.ts';

// The transition element (gslides-parity SPEC-5 0.12, 2.6; R01 6.1, 6.2): the wrapper per kind,
// the spd thresholds at 500, 999 and 1000 ms, the namespaces on p:sld, the position after
// p:clrMapOvr, the read back.
const PART =
  '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="r" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
  '<p:cSld><p:spTree/></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';

describe('spdOf', () => {
  test("LibreOffice's thresholds: 500 and under fast, under 1000 med, 1000 and over slow", () => {
    expect(spdOf(100)).toBe('fast');
    expect(spdOf(500)).toBe('fast');
    expect(spdOf(501)).toBe('med');
    expect(spdOf(999)).toBe('med');
    expect(spdOf(1000)).toBe('slow');
    expect(spdOf(5000)).toBe('slow');
  });
});

describe('transitionXml', () => {
  test('writes the wrapper per kind with the p14 fallback as a fade', () => {
    const expected: Record<TransitionKind, [string, string] | null> = {
      none: null,
      dissolve: ['<p:dissolve/>', '<p:dissolve/>'],
      fade: ['<p:fade/>', '<p:fade/>'],
      slideRight: ['<p:push dir="l"/>', '<p:push dir="l"/>'],
      slideLeft: ['<p:push dir="r"/>', '<p:push dir="r"/>'],
      flip: ['<p14:flip dir="l"/>', '<p:fade/>'],
      cube: ['<p14:prism dir="l" isContent="0" isInverted="0"/>', '<p:fade/>'],
      gallery: ['<p14:gallery dir="l"/>', '<p:fade/>'],
    };
    for (const kind of TRANSITION_KINDS) {
      const elements = transitionElements(kind);
      const want = expected[kind];
      if (want === null) {
        expect(elements).toBeNull();
        expect(transitionXml({ kind, durationMs: 500 })).toBe('');
        continue;
      }
      expect(elements).toEqual({ choice: want[0], fallback: want[1] });
      const xml = transitionXml({ kind, durationMs: 1500 });
      expect(xml).toContain(
        `<mc:AlternateContent xmlns:mc="${MC_NAMESPACE}"><mc:Choice xmlns:p14="${P14_NAMESPACE}" Requires="p14">`,
      );
      expect(xml).toContain(
        `<p:transition spd="slow" p14:dur="1500">${want[0]}</p:transition></mc:Choice>`,
      );
      expect(xml).toContain(
        `<mc:Fallback><p:transition spd="slow">${want[1]}</p:transition></mc:Fallback>`,
      );
      expect(P14_KINDS.has(kind)).toBe(want[1] !== want[0]);
    }
  });
});

describe('writeTransition', () => {
  test('inserts after p:clrMapOvr and declares mc and p14 on p:sld once', () => {
    const out = writeTransition(PART, { kind: 'fade', durationMs: 500 });
    expect(out.written).toBe(true);
    expect(out.xml.indexOf('</p:clrMapOvr><mc:AlternateContent')).toBeGreaterThan(0);
    expect(out.xml).toContain(`xmlns:mc="${MC_NAMESPACE}"`);
    expect(out.xml).toContain(`xmlns:p14="${P14_NAMESPACE}"`);
    expect((out.xml.match(/xmlns:p14=/g) ?? []).length).toBe(2);
    // a second write replaces the first
    const again = writeTransition(out.xml, { kind: 'cube', durationMs: 1000 });
    expect((again.xml.match(/<mc:AlternateContent/g) ?? []).length).toBe(1);
    expect(readTransition(again.xml)).toEqual({
      element: 'p14:prism',
      durationMs: 1000,
      spd: 'slow',
      fallback: 'p:fade',
    });
    expect(declareMotionNamespaces(again.xml)).toBe(again.xml);
  });

  test('None and null remove any transition and write nothing', () => {
    const faded = writeTransition(PART, { kind: 'fade', durationMs: 700 }).xml;
    expect(readTransition(faded)).toEqual({
      element: 'p:fade',
      durationMs: 700,
      spd: 'med',
      fallback: 'p:fade',
    });
    const none = writeTransition(faded, { kind: 'none', durationMs: 700 });
    expect(none.written).toBe(false);
    expect(none.xml).not.toContain('p:transition');
    expect(readTransition(none.xml)).toBeNull();
    expect(writeTransition(PART, null).xml).toBe(PART);
  });

  test('a part without a colour map override takes the element before the end of the slide', () => {
    const bare = '<p:sld xmlns:p="p"><p:cSld><p:spTree/></p:cSld></p:sld>';
    const out = writeTransition(bare, { kind: 'slideRight', durationMs: 999 });
    expect(out.written).toBe(true);
    expect(out.xml.endsWith('</mc:AlternateContent></p:sld>')).toBe(true);
    expect(readTransition(out.xml)?.element).toBe('p:push');
    expect(readTransition(out.xml)?.spd).toBe('med');
  });
});
