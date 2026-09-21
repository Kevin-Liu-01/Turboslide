// The light half of the catalog for the browser (docs/PRODUCT.md 4.2; SPEC-5-amendments A5
// items 3 and 4): per family the name, the category, the licence and the woff2 files with their
// style and weight, generated from catalog-files.ts by `node packages/fonts/scripts/catalog-light.mjs`
// and pinned equal to it by catalog.test.ts. The renderer's @font-face emission
// (@turboslide/render/fonts) and font.list read this table, so the digests and source facts of
// catalog-files.ts (about 20 KB) stay out of the client graph. Do not edit by hand.
import type { FontCategory, FontId, FontLicence } from '@turboslide/schema/fonts';

/** One woff2 file: its name under assets/<id>/, its style and its weight (a range for a variable file). */
export type LightFile = {
  file: string;
  style: 'normal' | 'italic';
  weight: number | [number, number];
};

export type LightFamily = {
  id: FontId;
  name: string;
  category: FontCategory;
  licence: FontLicence;
  files: LightFile[];
};

export const CATALOG_LIGHT: readonly LightFamily[] = [
  {
    id: 'inter',
    name: 'Inter',
    category: 'sans',
    licence: 'OFL 1.1',
    files: [
      { file: 'InterVariable.woff2', style: 'normal', weight: [100, 900] },
      { file: 'InterVariable-Italic.woff2', style: 'italic', weight: [100, 900] },
    ],
  },
  {
    id: 'roboto',
    name: 'Roboto',
    category: 'sans',
    licence: 'OFL 1.1',
    files: [
      { file: 'roboto.woff2', style: 'normal', weight: [100, 900] },
      { file: 'roboto-italic.woff2', style: 'italic', weight: [100, 900] },
    ],
  },
  {
    id: 'open-sans',
    name: 'Open Sans',
    category: 'sans',
    licence: 'OFL 1.1',
    files: [
      { file: 'open-sans.woff2', style: 'normal', weight: [300, 800] },
      { file: 'open-sans-italic.woff2', style: 'italic', weight: [300, 800] },
    ],
  },
  {
    id: 'lato',
    name: 'Lato',
    category: 'sans',
    licence: 'OFL 1.1',
    files: [
      { file: 'lato-300.woff2', style: 'normal', weight: 300 },
      { file: 'lato-300-italic.woff2', style: 'italic', weight: 300 },
      { file: 'lato-400.woff2', style: 'normal', weight: 400 },
      { file: 'lato-400-italic.woff2', style: 'italic', weight: 400 },
      { file: 'lato-500.woff2', style: 'normal', weight: 500 },
      { file: 'lato-500-italic.woff2', style: 'italic', weight: 500 },
      { file: 'lato-600.woff2', style: 'normal', weight: 600 },
      { file: 'lato-600-italic.woff2', style: 'italic', weight: 600 },
      { file: 'lato-700.woff2', style: 'normal', weight: 700 },
      { file: 'lato-700-italic.woff2', style: 'italic', weight: 700 },
    ],
  },
  {
    id: 'montserrat',
    name: 'Montserrat',
    category: 'sans',
    licence: 'OFL 1.1',
    files: [
      { file: 'montserrat.woff2', style: 'normal', weight: [100, 900] },
      { file: 'montserrat-italic.woff2', style: 'italic', weight: [100, 900] },
    ],
  },
  {
    id: 'poppins',
    name: 'Poppins',
    category: 'sans',
    licence: 'OFL 1.1',
    files: [
      { file: 'poppins-300.woff2', style: 'normal', weight: 300 },
      { file: 'poppins-300-italic.woff2', style: 'italic', weight: 300 },
      { file: 'poppins-400.woff2', style: 'normal', weight: 400 },
      { file: 'poppins-400-italic.woff2', style: 'italic', weight: 400 },
      { file: 'poppins-500.woff2', style: 'normal', weight: 500 },
      { file: 'poppins-500-italic.woff2', style: 'italic', weight: 500 },
      { file: 'poppins-600.woff2', style: 'normal', weight: 600 },
      { file: 'poppins-600-italic.woff2', style: 'italic', weight: 600 },
      { file: 'poppins-700.woff2', style: 'normal', weight: 700 },
      { file: 'poppins-700-italic.woff2', style: 'italic', weight: 700 },
    ],
  },
  {
    id: 'source-sans-3',
    name: 'Source Sans 3',
    category: 'sans',
    licence: 'OFL 1.1',
    files: [
      { file: 'source-sans-3.woff2', style: 'normal', weight: [200, 900] },
      { file: 'source-sans-3-italic.woff2', style: 'italic', weight: [200, 900] },
    ],
  },
  {
    id: 'source-serif-4',
    name: 'Source Serif 4',
    category: 'serif',
    licence: 'OFL 1.1',
    files: [
      { file: 'source-serif-4.woff2', style: 'normal', weight: [200, 900] },
      { file: 'source-serif-4-italic.woff2', style: 'italic', weight: [200, 900] },
    ],
  },
  {
    id: 'merriweather',
    name: 'Merriweather',
    category: 'serif',
    licence: 'OFL 1.1',
    files: [
      { file: 'merriweather.woff2', style: 'normal', weight: [300, 900] },
      { file: 'merriweather-italic.woff2', style: 'italic', weight: [300, 900] },
    ],
  },
  {
    id: 'playfair-display',
    name: 'Playfair Display',
    category: 'serif',
    licence: 'OFL 1.1',
    files: [
      { file: 'playfair-display.woff2', style: 'normal', weight: [400, 900] },
      { file: 'playfair-display-italic.woff2', style: 'italic', weight: [400, 900] },
    ],
  },
  {
    id: 'lora',
    name: 'Lora',
    category: 'serif',
    licence: 'OFL 1.1',
    files: [
      { file: 'lora.woff2', style: 'normal', weight: [400, 700] },
      { file: 'lora-italic.woff2', style: 'italic', weight: [400, 700] },
    ],
  },
  {
    id: 'pt-serif',
    name: 'PT Serif',
    category: 'serif',
    licence: 'OFL 1.1',
    files: [
      { file: 'pt-serif-400.woff2', style: 'normal', weight: 400 },
      { file: 'pt-serif-400-italic.woff2', style: 'italic', weight: 400 },
      { file: 'pt-serif-700.woff2', style: 'normal', weight: 700 },
      { file: 'pt-serif-700-italic.woff2', style: 'italic', weight: 700 },
    ],
  },
  {
    id: 'libre-baskerville',
    name: 'Libre Baskerville',
    category: 'serif',
    licence: 'OFL 1.1',
    files: [
      { file: 'libre-baskerville.woff2', style: 'normal', weight: [400, 700] },
      { file: 'libre-baskerville-italic.woff2', style: 'italic', weight: [400, 700] },
    ],
  },
  {
    id: 'eb-garamond',
    name: 'EB Garamond',
    category: 'serif',
    licence: 'OFL 1.1',
    files: [
      { file: 'eb-garamond.woff2', style: 'normal', weight: [400, 800] },
      { file: 'eb-garamond-italic.woff2', style: 'italic', weight: [400, 800] },
    ],
  },
  {
    id: 'nunito',
    name: 'Nunito',
    category: 'sans',
    licence: 'OFL 1.1',
    files: [
      { file: 'nunito.woff2', style: 'normal', weight: [200, 1000] },
      { file: 'nunito-italic.woff2', style: 'italic', weight: [200, 1000] },
    ],
  },
  {
    id: 'raleway',
    name: 'Raleway',
    category: 'sans',
    licence: 'OFL 1.1',
    files: [
      { file: 'raleway.woff2', style: 'normal', weight: [100, 900] },
      { file: 'raleway-italic.woff2', style: 'italic', weight: [100, 900] },
    ],
  },
  {
    id: 'work-sans',
    name: 'Work Sans',
    category: 'sans',
    licence: 'OFL 1.1',
    files: [
      { file: 'work-sans.woff2', style: 'normal', weight: [100, 900] },
      { file: 'work-sans-italic.woff2', style: 'italic', weight: [100, 900] },
    ],
  },
  {
    id: 'dm-sans',
    name: 'DM Sans',
    category: 'sans',
    licence: 'OFL 1.1',
    files: [
      { file: 'dm-sans.woff2', style: 'normal', weight: [100, 1000] },
      { file: 'dm-sans-italic.woff2', style: 'italic', weight: [100, 1000] },
    ],
  },
  {
    id: 'space-grotesk',
    name: 'Space Grotesk',
    category: 'sans',
    licence: 'OFL 1.1',
    files: [{ file: 'space-grotesk.woff2', style: 'normal', weight: [300, 700] }],
  },
  {
    id: 'oswald',
    name: 'Oswald',
    category: 'sans',
    licence: 'OFL 1.1',
    files: [{ file: 'oswald.woff2', style: 'normal', weight: [200, 700] }],
  },
  {
    id: 'bebas-neue',
    name: 'Bebas Neue',
    category: 'display',
    licence: 'OFL 1.1',
    files: [{ file: 'bebas-neue-400.woff2', style: 'normal', weight: 400 }],
  },
  {
    id: 'roboto-mono',
    name: 'Roboto Mono',
    category: 'mono',
    licence: 'OFL 1.1',
    files: [
      { file: 'roboto-mono.woff2', style: 'normal', weight: [100, 700] },
      { file: 'roboto-mono-italic.woff2', style: 'italic', weight: [100, 700] },
    ],
  },
  {
    id: 'jetbrains-mono',
    name: 'JetBrains Mono',
    category: 'mono',
    licence: 'OFL 1.1',
    files: [
      { file: 'jetbrains-mono.woff2', style: 'normal', weight: [100, 800] },
      { file: 'jetbrains-mono-italic.woff2', style: 'italic', weight: [100, 800] },
    ],
  },
  {
    id: 'ibm-plex-sans',
    name: 'IBM Plex Sans',
    category: 'sans',
    licence: 'OFL 1.1',
    files: [
      { file: 'ibm-plex-sans.woff2', style: 'normal', weight: [100, 700] },
      { file: 'ibm-plex-sans-italic.woff2', style: 'italic', weight: [100, 700] },
    ],
  },
  {
    id: 'ibm-plex-mono',
    name: 'IBM Plex Mono',
    category: 'mono',
    licence: 'OFL 1.1',
    files: [
      { file: 'ibm-plex-mono-300.woff2', style: 'normal', weight: 300 },
      { file: 'ibm-plex-mono-300-italic.woff2', style: 'italic', weight: 300 },
      { file: 'ibm-plex-mono-400.woff2', style: 'normal', weight: 400 },
      { file: 'ibm-plex-mono-400-italic.woff2', style: 'italic', weight: 400 },
      { file: 'ibm-plex-mono-500.woff2', style: 'normal', weight: 500 },
      { file: 'ibm-plex-mono-500-italic.woff2', style: 'italic', weight: 500 },
      { file: 'ibm-plex-mono-600.woff2', style: 'normal', weight: 600 },
      { file: 'ibm-plex-mono-600-italic.woff2', style: 'italic', weight: 600 },
      { file: 'ibm-plex-mono-700.woff2', style: 'normal', weight: 700 },
      { file: 'ibm-plex-mono-700-italic.woff2', style: 'italic', weight: 700 },
    ],
  },
  {
    id: 'fira-code',
    name: 'Fira Code',
    category: 'mono',
    licence: 'OFL 1.1',
    files: [{ file: 'fira-code.woff2', style: 'normal', weight: [300, 700] }],
  },
];
