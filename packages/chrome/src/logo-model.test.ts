import { describe, expect, it } from 'vitest';

import {
  LICENCE_SENTENCES,
  LOGO_PLATE_LINES,
  LOGO_WORDS,
  chooseVariant,
  isOpenLicence,
  kitTextColour,
  licenceClassOf,
  licenceSentenceOf,
  licenceTooltipOf,
  logoAssetId,
  logoBoxIn,
  logoIndexDate,
  logoInsertSize,
  logoMatchFor,
  logoRasterSize,
  monoOffered,
  normalizeLogoText,
  rankLogos,
  tintAllowed,
  variantKindOf,
} from './logo-model';
import type { LogoRow } from './logo-model';

// The logo picker's pure rules (docs/FEATURES.md 7.3, the B6 test in packages/chrome): the
// appearance rule picks `dark`, `default`, `mono` tinted or the plate line for the fixture marks on
// paper and on ink; the licence sentence mapping covers the 57 strings thesvg.org recorded on
// 2026-09-20 with "The brand's own terms" as the fallback; the mono tint is off for CC BY-ND,
// Proprietary, Trademark and Unknown; a mono file whose fill references a gradient is not offered
// as Mono; the search ranks prefix, then word start, then substring, brands before community, then
// shorter titles; the logo size and the raster size follow 4.4.

function row(over: Partial<LogoRow> & Pick<LogoRow, 'slug' | 'title'>): LogoRow {
  return {
    aliases: [],
    categories: [],
    variants: { default: `/icons/${over.slug}/default.svg` },
    license: 'CC0-1.0',
    collection: 'brands',
    ...over,
  };
}

/** The 57 licence strings of `icons.json` on 2026-09-20 (audit-logos section 1; thesvg-facts.json). */
const RECORDED_LICENCES = [
  'CC0-1.0',
  'MIT',
  'CC-BY-ND-2.0',
  'Apache-2.0',
  'brand-use',
  'Trademark',
  'Fair Use',
  'Microsoft proprietary product icon; no express redistribution license supplied; maintainer review required',
  'Custom',
  'CC-BY-SA-4.0',
  'Unknown',
  'CC-BY-4.0',
  'Proprietary',
  'MPL-2.0',
  'GPL-3.0',
  'CC-BY-SA-3.0',
  'BSD-3-Clause',
  'GPL-3.0-only',
  'AGPL-3.0',
  'Fair use',
  'Unlicense',
  'GPL-2.0',
  'GPL-2.0-or-later',
  'CC-BY-3.0',
  'GPL-3.0-or-later',
  'CC-BY-NC-4.0',
  'CC-BY-ND-4.0',
  'CC-BY-NC-ND-4.0',
  'CC-BY-SA-2.5',
  'CC-BY-NC-SA-4.0',
  'LGPL-3.0',
  'Trademark of Zoho Corporation. Used for identification under nominative fair use.',
  'Used with permission of AccountantOS; unmodified redistribution authorized for brand identification and development use.',
  'Trademark of Canva (Serif Europe). Used for identification under nominative fair use.',
  'AGPL-3.0-only',
  'Trademark of AvenPing. Used for identification under nominative fair use.',
  'Trademark of Blips. Used for identification under nominative fair use.',
  'PD',
  'Trademark of El Corte Inglés, S.A. Used for identification under nominative fair use.',
  'GPL-2.0-only',
  'Trademark of International GeoGebra Institute. Used for identification under nominative fair use.',
  'Trademark of Get Glass Distribution. Used for identification under nominative fair use.',
  'CC-BY-SA-2.0',
  'AGPL-3.0-or-later',
  'Trademark of IC Glass. Used for identification under nominative fair use.',
  'CC-BY-2.5',
  'Longbridge Brand Guidelines - non-commercial use only',
  'Unofficial SVG based on official PNG, project licensed under GPL-3.0-or-later',
  'Trademark of Mercadona, S.A. Used for identification under nominative fair use.',
  'TODO',
  'Used with permission of optionOS; unmodified redistribution authorized for brand identification and development use',
  'Trademark of Microsoft Corporation. Used for identification under nominative fair use.',
  'Trademark of Samsung Electronics. Used for identification under nominative fair use.',
  'CC-BY-NC-SA-3.0',
  'Trademark of Cisco Systems, Inc. Used for identification under nominative fair use.',
  'BSD-2-Clause',
  'LGPL-2.1',
];

describe('the licence sentences (4.6)', () => {
  it('covers the 57 recorded strings with the brand’s own terms as the fallback', () => {
    expect(RECORDED_LICENCES).toHaveLength(57);
    const sentences = new Set(Object.values(LICENCE_SENTENCES));
    for (const license of RECORDED_LICENCES) {
      expect(sentences.has(licenceSentenceOf(license)), license).toBe(true);
    }
    expect(licenceSentenceOf('CC0-1.0')).toBe('Free to use');
    expect(licenceSentenceOf('MIT')).toBe('Free to use');
    expect(licenceSentenceOf('Apache-2.0')).toBe('Free to use');
    expect(licenceSentenceOf('BSD-3-Clause')).toBe('Free to use');
    expect(licenceSentenceOf('Unlicense')).toBe('Free to use');
    expect(licenceSentenceOf('CC-BY-4.0')).toBe('Free to use with credit');
    expect(licenceSentenceOf('CC-BY-SA-4.0')).toBe('Free to use with credit');
    expect(licenceSentenceOf('CC-BY-ND-2.0')).toBe('Free to use unchanged');
    expect(licenceSentenceOf('MPL-2.0')).toBe('Free to use under an open licence');
    expect(licenceSentenceOf('GPL-3.0-or-later')).toBe('Free to use under an open licence');
    for (const own of [
      'brand-use',
      'Trademark',
      'Fair Use',
      'Proprietary',
      'Custom',
      'Unknown',
      'TODO',
      'Microsoft proprietary product icon; no express redistribution license supplied; maintainer review required',
      'CC-BY-NC-4.0',
      'something nobody recorded before',
      '',
    ])
      expect(licenceSentenceOf(own), own).toBe('The brand’s own terms');
    expect(licenceTooltipOf('CC0-1.0')).toBe('Recorded on thesvg.org as CC0-1.0');
  });

  it('caches open licences alone and turns the tint off where derivatives are forbidden or the terms are the brand’s', () => {
    for (const open of ['CC0-1.0', 'MIT', 'Apache-2.0', 'BSD-2-Clause', 'ISC', 'Unlicense'])
      expect(isOpenLicence(open), open).toBe(true);
    for (const other of ['CC-BY-4.0', 'CC-BY-ND-2.0', 'GPL-3.0', 'Trademark', 'Unknown', 'PD'])
      expect(isOpenLicence(other), other).toBe(false);
    for (const off of ['CC-BY-ND-2.0', 'CC-BY-ND-4.0', 'Proprietary', 'Trademark', 'Unknown'])
      expect(tintAllowed(off), off).toBe(false);
    for (const on of ['CC0-1.0', 'MIT', 'CC-BY-4.0', 'GPL-3.0'])
      expect(tintAllowed(on), on).toBe(true);
    expect(licenceClassOf('CC-BY-NC-ND-4.0')).toBe('own');
  });
});

describe('the appearance rule (4.3, 4.4)', () => {
  const vercel = row({
    slug: 'vercel',
    title: 'Vercel',
    variants: {
      default: '/icons/vercel/default.svg',
      mono: '/icons/vercel/mono.svg',
      light: '/icons/vercel/light.svg',
      dark: '/icons/vercel/dark.svg',
      wordmark: '/icons/vercel/wordmark.svg',
      wordmarkLight: '/icons/vercel/wordmark-light.svg',
      wordmarkDark: '/icons/vercel/wordmark-dark.svg',
    },
    readsOnPaper: false,
    readsOnInk: true,
  });
  const figma = row({
    slug: 'figma',
    title: 'Figma',
    variants: {
      default: '/icons/figma/default.svg',
      mono: '/icons/figma/mono.svg',
      wordmark: '/icons/figma/wordmark.svg',
    },
    readsOnPaper: true,
    readsOnInk: true,
  });
  const github = row({
    slug: 'github',
    title: 'GitHub',
    variants: { default: '/icons/github/default.svg', mono: '/icons/github/mono.svg' },
    readsOnPaper: true,
    readsOnInk: false,
  });
  const white = row({
    slug: 'white-only',
    title: 'White only',
    variants: { default: '/icons/white-only/default.svg' },
    readsOnPaper: false,
    readsOnInk: true,
  });
  const awsMark = row({
    slug: 'aws-amazon-ec2',
    title: 'Amazon EC2',
    collection: 'aws',
    license: 'CC-BY-ND-2.0',
    variants: {
      default: '/icons/aws-amazon-ec2/default.svg',
      mono: '/icons/aws-amazon-ec2/mono.svg',
    },
    readsOnPaper: true,
    readsOnInk: false,
  });

  it('picks dark on paper and light on ink when the pair exists', () => {
    expect(chooseVariant(vercel, 'light')).toEqual({ variant: 'dark', tint: false });
    expect(chooseVariant(vercel, 'dark')).toEqual({ variant: 'light', tint: false });
  });

  it('picks the default when it reads, else the tinted mono, else the plate line', () => {
    expect(chooseVariant(figma, 'light')).toEqual({ variant: 'default', tint: false });
    expect(chooseVariant(figma, 'dark')).toEqual({ variant: 'default', tint: false });
    expect(chooseVariant(github, 'light')).toEqual({ variant: 'default', tint: false });
    expect(chooseVariant(github, 'dark')).toEqual({ variant: 'mono', tint: true });
    expect(chooseVariant(white, 'light')).toEqual({
      variant: 'default',
      tint: false,
      plateLine: LOGO_PLATE_LINES.light,
    });
    expect(chooseVariant(white, 'dark')).toEqual({ variant: 'default', tint: false });
  });

  it('treats a mark without flags as reading on both grounds', () => {
    const fresh = row({ slug: 'fresh', title: 'Fresh' });
    expect(chooseVariant(fresh, 'light')).toEqual({ variant: 'default', tint: false });
    expect(chooseVariant(fresh, 'dark')).toEqual({ variant: 'default', tint: false });
  });

  it('never tints a mark whose licence forbids derivatives: the untinted default on a plate instead', () => {
    expect(chooseVariant(awsMark, 'dark')).toEqual({
      variant: 'default',
      tint: false,
      plateLine: LOGO_PLATE_LINES.dark,
    });
    expect(chooseVariant(awsMark, 'dark', { tone: 'mono' })).toEqual({
      variant: 'default',
      tint: false,
      plateLine: LOGO_PLATE_LINES.dark,
    });
  });

  it('answers the wordmark keys for the Wordmark kind and null where the brand has none', () => {
    expect(chooseVariant(vercel, 'light', { kind: 'wordmark' })).toEqual({
      variant: 'wordmarkDark',
      tint: false,
    });
    expect(chooseVariant(vercel, 'dark', { kind: 'wordmark' })).toEqual({
      variant: 'wordmarkLight',
      tint: false,
    });
    expect(chooseVariant(figma, 'dark', { kind: 'wordmark' })).toEqual({
      variant: 'wordmark',
      tint: false,
    });
    expect(chooseVariant(github, 'light', { kind: 'wordmark' })).toBeNull();
    expect(chooseVariant(figma, 'light', { tone: 'mono' })).toEqual({
      variant: 'mono',
      tint: true,
    });
  });

  it('skips a variant marked unavailable', () => {
    const broken = {
      ...vercel,
      unavailable: { dark: { at: '2026-09-22T06:00:00Z', status: 404 } },
    };
    expect(chooseVariant(broken, 'light')).toEqual({ variant: 'mono', tint: true });
  });

  it('does not offer a mono whose fill references a gradient or a pattern', () => {
    expect(monoOffered('<svg><path fill="#000" d="M0 0h1v1z"/></svg>')).toBe(true);
    expect(monoOffered('<svg><path fill="url(#g1)" d="M0 0h1v1z"/></svg>')).toBe(false);
    expect(monoOffered('<svg><path style="fill: url(#p)" d="M0 0h1v1z"/></svg>')).toBe(false);
    expect(monoOffered('<svg><path stroke="url( #g )" d="M0 0h1v1z"/></svg>')).toBe(false);
    expect(monoOffered('<svg><path clip-path="url(#c)" fill="#111" d="M0 0h1v1z"/></svg>')).toBe(
      true,
    );
  });

  it('tints with the kit’s text colour for the appearance, else the theme’s ink', () => {
    expect(kitTextColour(undefined, 'light')).toBe('#070707');
    expect(kitTextColour(undefined, 'dark')).toBe('#f2f2f0');
    expect(kitTextColour({ colors: { light: { text: '#0b3d91' } } }, 'light')).toBe('#0b3d91');
    expect(kitTextColour({ colors: { light: { text: '#0b3d91' } } }, 'dark')).toBe('#f2f2f0');
  });
});

describe('the search (4.3, 4.11)', () => {
  const rows: LogoRow[] = [
    row({ slug: 'figma', title: 'Figma', categories: ['Design', 'Software'] }),
    row({ slug: 'figjam', title: 'FigJam', categories: ['Design'] }),
    row({ slug: 'config', title: 'Config by Figma', categories: ['Event'] }),
    row({ slug: 'fig-community', title: 'Fig', collection: 'community' }),
    row({ slug: 'fig', title: 'Fig', collection: 'brands' }),
    row({ slug: 'aws-fig', title: 'Fig on AWS', collection: 'aws', license: 'CC-BY-ND-2.0' }),
    row({ slug: 'refigure', title: 'Refigure' }),
    row({ slug: 'google', title: 'Google', aliases: ['구글'], categories: ['Software'] }),
    row({ slug: 'aarch64', title: 'AArch64', aliases: ['Arm64'] }),
    row({
      slug: 'gone',
      title: 'Figment',
      unavailable: { default: { at: '2026-09-22T00:00:00Z', status: 404 } },
    }),
  ];

  it('ranks prefix, then word start, then substring, brands before community, then shorter titles', () => {
    const slugs = rankLogos(rows, 'fig').map((r) => r.slug);
    expect(slugs).toEqual(['fig', 'figma', 'figjam', 'fig-community', 'config', 'refigure']);
    expect(rankLogos(rows, 'Figma')[0]?.slug).toBe('figma');
  });

  it('matches aliases and categories, ignores case, spaces and hyphens, and lists nothing for an empty query', () => {
    expect(rankLogos(rows, 'arm64')[0]?.slug).toBe('aarch64');
    expect(rankLogos(rows, '구글')[0]?.slug).toBe('google');
    expect(rankLogos(rows, 'design').map((r) => r.slug)).toEqual(['figma', 'figjam']);
    expect(rankLogos(rows, 'FIG MA').map((r) => r.slug)).toEqual([]);
    expect(rankLogos(rows, '  ')).toEqual([]);
    expect(normalizeLogoText('Fig-Jam_v2.0')).toBe('fig jam v2 0');
  });

  it('keeps the cloud collections out until collection is all, and never lists an unavailable default', () => {
    expect(rankLogos(rows, 'fig').some((r) => r.slug === 'aws-fig')).toBe(false);
    expect(rankLogos(rows, 'fig', { collection: 'all' }).some((r) => r.slug === 'aws-fig')).toBe(
      true,
    );
    expect(rankLogos(rows, 'figment')).toEqual([]);
  });

  it('honours the limit and the wordmark kind', () => {
    expect(rankLogos(rows, 'fig', { limit: 2 })).toHaveLength(2);
    expect(rankLogos(rows, 'fig', { limit: 500 }).length).toBeLessThanOrEqual(50);
    const withWordmark = [
      ...rows,
      row({
        slug: 'figtree',
        title: 'Figtree',
        variants: {
          default: '/icons/figtree/default.svg',
          wordmark: '/icons/figtree/wordmark.svg',
        },
      }),
    ];
    expect(rankLogos(withWordmark, 'fig', { kind: 'wordmark' }).map((r) => r.slug)).toEqual([
      'figtree',
    ]);
  });

  it('answers the brand a Tailor name means, and null for a name the index lacks', () => {
    expect(logoMatchFor(rows, 'Figma')?.slug).toBe('figma');
    expect(logoMatchFor(rows, 'figma ')?.slug).toBe('figma');
    expect(logoMatchFor(rows, 'Arm64')?.slug).toBe('aarch64');
    expect(logoMatchFor(rows, 'Fig')?.slug).toBe('fig');
    expect(logoMatchFor(rows, 'Acme')).toBeNull();
    expect(logoMatchFor(rows, '')).toBeNull();
  });
});

describe('the size rules (4.4)', () => {
  it('inserts a symbol 160 tall and a wordmark 320 wide at the mark’s ratio, scaled down to the area, never up', () => {
    expect(logoInsertSize('symbol', [54, 80])).toEqual([108, 160]);
    expect(logoInsertSize('symbol', [256, 222])).toEqual([185, 160]);
    expect(logoInsertSize('symbol', undefined)).toEqual([160, 160]);
    expect(logoInsertSize('wordmark', [262, 52])).toEqual([320, 64]);
    expect(logoInsertSize('wordmark', undefined)).toEqual([320, 80]);
    expect(logoBoxIn([137, 129, 1326, 642], [108, 160])).toEqual([746, 370, 108, 160]);
    expect(logoBoxIn([100, 100, 200, 120], [320, 64])).toEqual([140, 148, 120, 24]);
    expect(logoBoxIn([100, 100, 2000, 2000], [108, 160])).toEqual([1046, 1020, 108, 160]);
  });

  it('rasterizes at 3x of the logo size with the long side between 384 and 1536', () => {
    expect(logoRasterSize('symbol', [54, 80])).toEqual([324, 480]);
    expect(logoRasterSize('wordmark', [262, 52])).toEqual([960, 192]);
    expect(logoRasterSize('symbol', [1000, 100])[0]).toBe(1536);
    expect(logoRasterSize('wordmark', [4000, 100])).toEqual([960, 24]);
    const thin = logoRasterSize('symbol', [1, 40]);
    expect(thin[1]).toBe(480);
    expect(variantKindOf('wordmarkLight')).toBe('wordmark');
    expect(variantKindOf('mono')).toBe('symbol');
    expect(variantKindOf('64')).toBe('other');
  });
});

describe('the words and the ids (4.3, 4.6)', () => {
  it('reads the foot sentence with the date and the failure clause, and the plain words', () => {
    expect(LOGO_WORDS.source({ updatedAt: '2026-09-20T06:00:00.000Z' })).toBe(
      'Logos from thesvg.org, updated 20 September 2026. Brand marks belong to their owners; use them to name the brand, not to imply endorsement',
    );
    expect(
      LOGO_WORDS.source({
        updatedAt: '2026-09-20T06:00:00.000Z',
        lastError: { at: '2026-09-22T06:02:00.000Z', status: 503, message: 'HTTP 503' },
      }),
    ).toMatch(/\. thesvg\.org did not answer at 06:02 UTC$/);
    expect(LOGO_WORDS.source({ updatedAt: null })).toMatch(/^Logos from thesvg\.org\. /);
    expect(logoIndexDate('not a date')).toBe('');
    expect(LOGO_WORDS.everySlide('Figma')).toBe('The Figma logo is on every slide');
    expect(LOGO_WORDS.licenceRow('Figma', 'CC0-1.0')).toBe('Figma: Free to use, brand guidelines');
    expect(LOGO_WORDS.alt('Figma')).toBe('Figma logo');
    for (const sentence of [
      LOGO_WORDS.lead,
      LOGO_WORDS.upstreamDown,
      LOGO_WORDS.broken,
      LOGO_WORDS.everySlideCheck,
      LOGO_WORDS.emptyKit,
      LOGO_WORDS.findAKit,
    ])
      expect(sentence).not.toMatch(/—|\.$/);
  });

  it('names an asset after the slug and steps past a taken id', () => {
    expect(logoAssetId('figma', new Set())).toBe('figma');
    expect(logoAssetId('figma', new Set(['figma']))).toBe('figma-2');
    expect(logoAssetId('figma', new Set(['figma', 'figma-2']))).toBe('figma-3');
  });
});
