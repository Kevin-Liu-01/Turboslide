// The site's facts for the head tags, the manifest, robots.txt and the card (gslides-parity
// SPEC-4 1.4, 1.5, 1.6, 1.7; research-4 report 02 sections 3, 4 and 8): one object the studio's
// root route and scripts/build-brand.ts both read, so the description the head carries and the
// description the manifest carries never drift. Framework free; the only runtime read is the
// public origin, which is the deployment's `TURBOSLIDE_PUBLIC_ORIGIN` when set, else the origin
// the caller derived from its request, else the production address.

/** The sentence the README opens with (R05 6.10), reused by the head, the manifest and the card. */
const DESCRIPTION =
  "An agent native slides editor with Google Slides' behaviours, a canvas on every slide and a pixel identical PowerPoint export.";

/** The card's alt text (SPEC-4 1.6). */
const IMAGE_ALT =
  'The Turboslide mark and name on a plate cut from a two tone dithered liquid metal frame';

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
  /** the hosted studio (docs/hosting.md) */
  productionOrigin: 'https://turboslide.vercel.app',
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
    background_color: THEME_COLORS.dark,
    theme_color: THEME_COLORS.dark,
    icons: MANIFEST_ICONS,
  },
  robots: ROBOTS,
};

export type Site = typeof SITE;
