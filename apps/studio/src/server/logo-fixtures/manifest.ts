// The ten mark fixture upstream's manifest (docs/FEATURES.md 4.9; build/b6.md): `icons.json`
// records in thesvg.org's own shape (slug, title, aliases, hex, categories, variants as paths,
// license, url, guidelines, dateAdded, collection) for the ten marks marks.ts serves. The cases the
// rows and the tests need: a CC0 mark with a mono and a wordmark (figma); a white default with a
// light and dark pair (vercel, openai); a default that reads on paper alone (github); a mark with a
// mono and no pair (stripe); a mark whose default is white with no pair (anthropic); a CC BY-ND
// cloud icon out of the default results (aws-amazon-ec2); a Trademark mark with a stylesheet, an
// explicit fill mono and a wordmark path the upstream answers 404 for (acme); a mark whose mono is
// a gradient fill, never offered as Mono (gradientco); and a slug that leaves the manifest at the
// second refresh, the takedown case (northwind).

/** The slug the fixture drops once the index holds it (the takedown case of 4.2). */
export const FIXTURE_DROPPED_SLUG = 'northwind';
/** The variant path the manifest lists and the fixture answers 404 for (audit-logos 13). */
export const FIXTURE_MISSING_PATH = '/icons/acme/wordmark.svg';

export type FixtureIcon = {
  slug: string;
  title: string;
  aliases: string[];
  hex: string;
  categories: string[];
  variants: Record<string, string>;
  license: string;
  url?: string;
  guidelines?: string;
  dateAdded: string;
  collection: string;
};

export const FIXTURE_ICONS: ReadonlyArray<FixtureIcon> = [
  {
    slug: 'figma',
    title: 'Figma',
    aliases: [],
    hex: 'F24E1E',
    categories: ['Design', 'Software'],
    variants: {
      default: '/icons/figma/default.svg',
      mono: '/icons/figma/mono.svg',
      wordmark: '/icons/figma/wordmark.svg',
    },
    license: 'CC0-1.0',
    url: 'https://www.figma.com/',
    guidelines: 'https://www.figma.com/using-the-figma-brand/',
    dateAdded: '2026-03-07',
    collection: 'brands',
  },
  {
    slug: 'vercel',
    title: 'Vercel',
    aliases: [],
    hex: '000',
    categories: ['DevTool', 'Software'],
    variants: {
      default: '/icons/vercel/default.svg',
      mono: '/icons/vercel/mono.svg',
      light: '/icons/vercel/light.svg',
      dark: '/icons/vercel/dark.svg',
      wordmark: '/icons/vercel/wordmark.svg',
    },
    license: 'CC0-1.0',
    url: 'https://vercel.com/',
    guidelines: 'https://vercel.com/geist/brands',
    dateAdded: '2026-03-07',
    collection: 'brands',
  },
  {
    slug: 'github',
    title: 'GitHub',
    aliases: [],
    hex: '181717',
    categories: ['DevTool', 'Software'],
    variants: {
      default: '/icons/github/default.svg',
      mono: '/icons/github/mono.svg',
      light: '/icons/github/light.svg',
      dark: '/icons/github/dark.svg',
    },
    license: 'CC0-1.0',
    url: 'https://github.com/',
    guidelines: 'https://brand.github.com/',
    dateAdded: '2026-03-07',
    collection: 'brands',
  },
  {
    slug: 'stripe',
    title: 'Stripe',
    aliases: [],
    hex: '635BFF',
    categories: ['Software', 'Payment'],
    variants: { default: '/icons/stripe/default.svg', mono: '/icons/stripe/mono.svg' },
    license: 'CC0-1.0',
    url: 'https://stripe.com/',
    dateAdded: '2026-03-07',
    collection: 'brands',
  },
  {
    slug: 'openai',
    title: 'OpenAI',
    aliases: [],
    hex: '000000',
    categories: ['AI', 'Software'],
    variants: {
      default: '/icons/openai/default.svg',
      light: '/icons/openai/light.svg',
      dark: '/icons/openai/dark.svg',
    },
    license: 'MIT',
    url: 'https://openai.com/',
    guidelines: 'https://openai.com/brand/',
    dateAdded: '2026-03-07',
    collection: 'brands',
  },
  {
    slug: 'anthropic',
    title: 'Anthropic',
    aliases: [],
    hex: '191919',
    categories: ['AI', 'Software'],
    variants: { default: '/icons/anthropic/default.svg' },
    license: 'CC0-1.0',
    url: 'https://www.anthropic.com/',
    dateAdded: '2026-03-07',
    collection: 'brands',
  },
  {
    slug: 'aws-amazon-ec2',
    title: 'Amazon EC2',
    aliases: [],
    hex: 'ED7100',
    categories: ['Compute'],
    variants: { default: '/icons/aws-amazon-ec2/default.svg' },
    license: 'CC-BY-ND-2.0',
    url: 'https://aws.amazon.com/ec2/',
    dateAdded: '2026-03-17',
    collection: 'aws',
  },
  {
    slug: 'acme',
    title: 'Acme',
    aliases: ['Acme Corporation'],
    hex: 'C8102E',
    categories: ['Software'],
    variants: {
      default: '/icons/acme/default.svg',
      mono: '/icons/acme/mono.svg',
      wordmark: FIXTURE_MISSING_PATH,
    },
    license: 'Trademark',
    url: 'https://acme.example/',
    dateAdded: '2026-09-01',
    collection: 'brands',
  },
  {
    slug: 'gradientco',
    title: 'Gradientco',
    aliases: [],
    hex: '2F5CE0',
    categories: ['Design'],
    variants: { default: '/icons/gradientco/default.svg', mono: '/icons/gradientco/mono.svg' },
    license: 'MIT',
    url: 'https://gradientco.example/',
    dateAdded: '2026-09-01',
    collection: 'community',
  },
  {
    slug: FIXTURE_DROPPED_SLUG,
    title: 'Northwind',
    aliases: ['Northwind Traders'],
    hex: '0B3D91',
    categories: ['Retail'],
    variants: { default: `/icons/${FIXTURE_DROPPED_SLUG}/default.svg` },
    license: 'CC0-1.0',
    url: 'https://northwind.example/',
    dateAdded: '2026-09-01',
    collection: 'brands',
  },
];
