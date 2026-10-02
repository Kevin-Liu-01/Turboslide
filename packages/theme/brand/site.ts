// The site's facts for the head tags, the manifest, robots.txt and the card (gslides-parity
// SPEC-4 1.4, 1.5, 1.6, 1.7; research-4 report 02 sections 3, 4 and 8): one object the studio's
// root route and scripts/build-brand.ts both read, so the description the head carries and the
// description the manifest carries never drift. Framework free; the only runtime read is the
// public origin, which is the deployment's `TURBOSLIDE_PUBLIC_ORIGIN` when set, else the origin
// the caller derived from its request, else the production address.

/**
 * The one description of the product (docs/POLISH.md 3.6): the /home hero's lead, reused by the
 * head, the manifest, the card and the README so the four never drift.
 */
const DESCRIPTION =
  "Turboslide is a slides editor in the browser. It has Google Slides' menus and shortcuts. No account is needed.";

/** The card's alt text (SPEC-4 1.6; docs/POLISH.md 3.6; docs/NEXT.md 4.1.3 item 4). */
const IMAGE_ALT =
  "The Turboslide mark and name with the sentence Turboslide is a slides editor in the browser, the address www.turboslide.com and the picture's credit, on a plate beside NASA's Blue Marble as a two tone dither";

export type ManifestIcon = {
  src: string;
  sizes: string;
  type: 'image/png';
  purpose?: 'maskable' | 'monochrome';
};

/** The theme colours the head carries: the stamped theme's `--pt-paper` (SPEC-4 1.6). */
export const THEME_COLORS = { dark: '#070707', light: '#ffffff' } as const;

/** The paths every icon, manifest and card request resolves to under apps/studio/public (SPEC-4 0.13). */
export const ICON_PATHS = {
  favicon: '/favicon.ico',
  svg: '/icon.svg',
  touch: '/apple-touch-icon.png',
  manifest: '/manifest.webmanifest',
  robots: '/robots.txt',
  brandManifest: '/brand-manifest.json',
  any192: '/icons/icon-192.png',
  any512: '/icons/icon-512.png',
  mask192: '/icons/icon-mask-192.png',
  mask512: '/icons/icon-mask-512.png',
  mono512: '/icons/icon-mono-512.png',
  dark192: '/icons/icon-dark-192.png',
  dark512: '/icons/icon-dark-512.png',
  card: '/og/turboslide.png',
} as const;

/**
 * The two tone twins under /brand (SPEC-4 0.7, 0.12, 1.9): the hero, the empty state figure, the
 * Not found figure and the card's screen, each as a dark and a light twin. The build writes them
 * on day 2 of MILESTONES-4 B1; EmptyFigure.css and the /home hero read these paths.
 */
export const TWIN_PATHS = {
  hero: { dark: '/brand/hero-dark.png', light: '/brand/hero-light.png' },
  figure: { dark: '/brand/figure-dark.png', light: '/brand/figure-light.png' },
  notfound: { dark: '/brand/notfound-dark.png', light: '/brand/notfound-light.png' },
  ogScreen: { dark: '/brand/og-screen-dark.png', light: '/brand/og-screen-light.png' },
} as const;

/** One mood picture the product carries outside a deck: its twins under /brand and its credit. */
export type MoodPicture = {
  /** the picture's name, as the deck's mood slide titles it */
  title: string;
  /** the alt text of the picture alone */
  alt: string;
  /** the credit line printed beside the picture, the words of the deck's plate */
  credit: string;
  /** the licence as the picture's source page states it */
  license: string;
  /** the source page the licence was read on (lane B4, 2026-10-02 08:57Z; docs/brand.md section 8) */
  source: string;
  /** the GT deck's twins the build cuts the copies from, without the -dark or -light suffix */
  from: string;
  dark: string;
  light: string;
};

/**
 * The mood pictures outside a deck (docs/NEXT.md 4.1.2 and question 5: the card, Not found and the
 * empty /decks state, never /home's first screen; B2's day 0 request 3): each a dark and a light
 * twin under /brand, 1600 by 900 like the deck's own copies, re-encoded by scripts/build-brand.ts
 * under 200 KB. Only a picture whose licence was read on its source page is listed here, and
 * docs/brand.md section 8 carries its line for the brand lint's credits check.
 */
export const MOOD_PICTURES = {
  earth: {
    title: 'The Blue Marble',
    alt: "NASA's Blue Marble, the Earth with the Western Hemisphere in daylight, as a two tone dither",
    credit: 'Image: NASA, Reto Stöckli, 2007, public domain',
    license: 'Public domain (PD-USGov-NASA); attribution not required',
    source: 'https://commons.wikimedia.org/wiki/File:Blue_Marble_Western_Hemisphere.jpg',
    from: 'decks/gt-brand/assets/mood-earth',
    dark: '/brand/mood-earth-dark.jpg',
    light: '/brand/mood-earth-light.jpg',
  },
} as const satisfies Readonly<Record<string, MoodPicture>>;

/** The mood picture the card carries (docs/NEXT.md 4.1.3 item 4). */
export const CARD_MOOD: MoodPicture = MOOD_PICTURES.earth;

/** A twin's size: 1600 by 900 at 2 px cells, shown at that size and cropped, never scaled. */
export const TWIN_SIZE = { width: 1600, height: 900 } as const;

/** The card's size (R02 2.5). */
export const CARD_SIZE = { width: 1200, height: 630 } as const;

const MANIFEST_ICONS: readonly ManifestIcon[] = [
  { src: ICON_PATHS.any192, sizes: '192x192', type: 'image/png' },
  { src: ICON_PATHS.any512, sizes: '512x512', type: 'image/png' },
  { src: ICON_PATHS.mask192, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
  { src: ICON_PATHS.mask512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  { src: ICON_PATHS.mono512, sizes: '512x512', type: 'image/png', purpose: 'monochrome' },
];

/** The routes robots.txt disallows (the `NOINDEX_ROUTES` of __root.tsx as path prefixes) and the one it allows. */
export const ROBOTS = {
  allow: ['/og/'],
  disallow: ['/new', '/decks/trash', '/print/', '/edit/'],
} as const;

function envOrigin(): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const value = env?.TURBOSLIDE_PUBLIC_ORIGIN?.trim();
  return value ? value.replace(/\/+$/, '') : undefined;
}

export const SITE = {
  name: 'Turboslide',
  description: DESCRIPTION,
  imageAlt: IMAGE_ALT,
  /** the hosted studio (docs/hosting.md; docs/POLISH.md section 0 item 3: the domain) */
  productionOrigin: 'https://www.turboslide.com',
  repository: 'https://github.com/Kevin-Liu-01/Turboslide',
  /**
   * The public origin for absolute URLs (the card, `og:url`): `TURBOSLIDE_PUBLIC_ORIGIN` when the
   * deployment sets it, else the origin the caller read from its request (the X-Forwarded-Host then
   * Host rule the agent surface uses, apps/studio/src/server/headers.ts), else production.
   */
  origin(requestOrigin?: string): string {
    return envOrigin() ?? requestOrigin?.replace(/\/+$/, '') ?? SITE.productionOrigin;
  },
  themeColor: THEME_COLORS,
  icons: ICON_PATHS,
  twins: TWIN_PATHS,
  mood: MOOD_PICTURES,
  card: { path: ICON_PATHS.card, ...CARD_SIZE, type: 'image/png' as const },
  /** manifest.webmanifest as the build writes it (R02 4.3 with `start_url` /home, SPEC-4 0.13). */
  manifest: {
    id: '/',
    name: 'Turboslide',
    short_name: 'Turboslide',
    description: DESCRIPTION,
    start_url: '/home',
    scope: '/',
    display: 'standalone' as const,
    /* the paper (docs/NEXT.md 4.1.2, A's graft; question 3's sheet): an installed app opens on white */
    background_color: THEME_COLORS.light,
    theme_color: THEME_COLORS.light,
    icons: MANIFEST_ICONS,
  },
  robots: ROBOTS,
};

export type Site = typeof SITE;
