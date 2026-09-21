// The tailoring pass (docs/PRODUCT.md section 5; audit-gaps 16): `deck.tailor` as one write over
// the customer name, the pictures named after the old customer and the slides to skip; the plan
// is pure over a document, the store half commits it and answers the counts. The CLI usage is
// `turboslide tailor --replace Acme=Globex --skip pricing-internal`, the MCP tool `deck_tailor`.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Slide } from '@turboslide/schema/deck';
import { WORKED_DECK, WORKED_SLIDES, workedDocument } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import { applyMutations } from '@turboslide/schema/reduce';
import { plainText } from '@turboslide/schema/text';
import { openFileStore } from '@turboslide/store/file-store';

import { deckTailor, tailorCount, tailorPlan, textTargets } from '../store-actions.ts';
import type { StoreActionDeps } from '../store-actions.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function textsOf(slide: Slide): string[] {
  return textTargets(slide).map((target) => plainText(target.text));
}

describe('tailorPlan', () => {
  const document = workedDocument();

  it('counts the customer name over every visible text and the notes, case insensitive', () => {
    /* the worked deck names the word on the thesis, the production site slide (three places) and
       the Prototemplate opener's note */
    expect(tailorCount(document, 'product')).toEqual({ places: 5, slides: 3 });
    expect(tailorCount(document, 'PRODUCT')).toEqual({ places: 5, slides: 3 });
    expect(tailorCount(document, 'every language')).toEqual({ places: 1, slides: 1 });
    expect(tailorCount(document, '')).toEqual({ places: 0, slides: 0 });
    expect(tailorCount(document, 'no such customer anywhere')).toEqual({ places: 0, slides: 0 });
  });

  it('replaces the name everywhere, skips the named slides and reports the counts, as one list', () => {
    const plan = tailorPlan(document, {
      replacements: [{ from: 'every language', to: 'every market' }],
      skip: ['content-rule'],
      baseRevision: document.deck.revision,
    });
    expect(plan.replacements).toBe(1);
    expect(plan.slideIds).toEqual(['thesis']);
    expect(plan.skipped).toEqual(['content-rule']);
    expect(plan.pictures).toBe(0);
    expect(plan.counts).toEqual([{ from: 'every language', places: 1, slides: 1 }]);
    const { document: after } = applyMutations(document, plan.mutations);
    const thesis = after.slides['thesis'];
    expect(thesis !== undefined && textsOf(thesis)).toEqual(['Every product in every market']);
    expect(after.slides['content-rule']?.skip).toBe(true);
    /* the plan touched nothing else: the statement's field and the skip */
    expect(plan.mutations.map((mutation) => mutation.op)).toEqual(['slide.set', 'slide.set']);
  });

  it('runs a second pair over the first pair’s result and leaves a slide that is skipped already', () => {
    const skipped = workedDocument();
    const rule = skipped.slides['content-rule'];
    if (rule !== undefined) rule.skip = true;
    const plan = tailorPlan(skipped, {
      replacements: [
        { from: 'every language', to: 'the Acme market' },
        { from: 'Acme', to: 'Globex' },
      ],
      skip: ['content-rule'],
      baseRevision: 0,
    });
    expect(plan.counts).toEqual([
      { from: 'every language', places: 1, slides: 1 },
      { from: 'Acme', places: 1, slides: 1 },
    ]);
    const { document: after } = applyMutations(skipped, plan.mutations);
    expect(after.slides['thesis'] !== undefined && textsOf(after.slides['thesis'])).toEqual([
      'Every product in the Globex market',
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it('swaps the pictures whose alt names the old customer for the logo and refuses a logo without a slot', () => {
    const swapped = workedDocument();
    const earth = swapped.deck.assets['mood-earth'];
    if (earth !== undefined) earth.alt = 'The Acme logo on a dark ground';
    const plan = tailorPlan(swapped, {
      logo: { assetId: 'site-home', replaceAlt: 'Acme' },
      baseRevision: 0,
    });
    expect(plan.pictures).toBe(1);
    expect(plan.mutations).toEqual([
      { op: 'slide.set', slideId: 'mood-earth', path: '/picture/asset', value: 'site-home' },
    ]);
    expect(() => tailorPlan(swapped, { logo: { assetId: 'site-home' }, baseRevision: 0 })).toThrow(
      /logo slot/,
    );
    expect(() =>
      tailorPlan(swapped, { logo: { assetId: 'nope', replaceAlt: 'Acme' }, baseRevision: 0 }),
    ).toThrow(RangeError);
  });

  it('refuses an unknown slide under skip', () => {
    expect(() => tailorPlan(document, { skip: ['nope'], baseRevision: 0 })).toThrow(RangeError);
  });
});

describe('deck.tailor over a file store', () => {
  let root: string;
  let deps: StoreActionDeps;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-tailor-'));
    const dir = join(root, 'worked');
    mkdirSync(join(dir, 'slides'), { recursive: true });
    mkdirSync(join(dir, 'assets'), { recursive: true });
    writeFileSync(join(dir, 'deck.json'), canonicalJson({ ...WORKED_DECK, id: 'worked' }));
    for (const slide of WORKED_SLIDES)
      writeFileSync(join(dir, 'slides', `${slide.id}.json`), canonicalJson(slide));
    for (const asset of Object.values(WORKED_DECK.assets))
      for (const twin of Object.values(asset.twins)) writeFileSync(join(dir, twin), PNG);
    deps = {
      store: openFileStore({ dir }),
      lint: { properNouns: [], tokens: [], iconNames: [] },
    };
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('commits one write with the counts and refuses a stale base when nothing changes', async () => {
    const before = (await deps.store.read()).document;
    const ctx = { author: { kind: 'human' as const, name: 'seller' } };
    const result = await deckTailor(deps, ctx, {
      replacements: [{ from: 'product', to: 'Globex' }],
      skip: ['content-rule'],
      baseRevision: before.deck.revision,
    });
    expect(result).toMatchObject({
      replacements: 5,
      slideIds: ['thesis', 'the-production-site', 'opener-prototemplate'],
      pictures: 0,
      skipped: ['content-rule'],
      revision: before.deck.revision + 1,
    });
    const after = (await deps.store.read()).document;
    expect(after.slides['content-rule']?.skip).toBe(true);
    const thesis = after.slides['thesis'];
    expect(plainText(thesis?.kind === 'statement' ? thesis.big : '')).toBe(
      'Every Globex in every language',
    );
    expect(after.slides['opener-prototemplate']?.notes).toMatch(/Globex/);
    const nothing = await deckTailor(deps, ctx, { baseRevision: after.deck.revision });
    expect(nothing).toEqual({
      replacements: 0,
      slideIds: [],
      pictures: 0,
      skipped: [],
      revision: after.deck.revision,
    });
    await expect(deckTailor(deps, ctx, { baseRevision: 0 })).rejects.toThrow(/stale/);
  });
});
