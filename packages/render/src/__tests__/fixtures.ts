// A small deck for the renderer tests: one asset with twins, one neutral asset.
import type { Block } from '@turboslide/schema/blocks';
import type { ContentSlide, Deck, Layout } from '@turboslide/schema/deck';
import type { Asset } from '@turboslide/schema/assets';

export const twinAsset: Asset = {
  id: 'site-home',
  role: 'capture',
  alt: 'The home page at 1440 by 900',
  twins: { light: 'assets/site-home-light.jpg', dark: 'assets/site-home-dark.jpg' },
  size: [1440, 900],
  scale: 1,
  source: {
    kind: 'capture',
    url: 'https://generaltranslation.com/',
    viewport: [1440, 900],
    scale: 2,
    theme: 'both',
    recipe: 'gt-site',
  },
  inline: 'resample-1280',
};

export const neutralAsset: Asset = {
  id: 'logo-gm',
  role: 'logo',
  alt: 'The General Motors logo',
  twins: { neutral: 'assets/logo-gm.jpg' },
  size: [640, 640],
  scale: 1,
  source: { kind: 'file' },
  inline: 'pass-through',
};

export const openerAsset: Asset = {
  id: 'opener-brand',
  role: 'opener',
  alt: 'The top arc of the event horizon ring, dithered',
  twins: { light: 'assets/opener-brand-light.jpg', dark: 'assets/opener-brand-dark.jpg' },
  size: [1600, 900],
  scale: 1,
  source: { kind: 'file' },
  inline: 'two-color',
};

export const deck: Deck = {
  schemaVersion: 1,
  id: 'test-deck',
  title: 'Test deck',
  theme: 'gt-ink-paper',
  sections: [
    { id: 'brand', name: 'Brand', slideIds: ['opener-brand', 'content-rule'] },
    { id: 'website', name: 'Website', slideIds: ['site'] },
  ],
  assets: {
    'site-home': twinAsset,
    'logo-gm': neutralAsset,
    'opener-brand': openerAsset,
  },
  revision: 1,
  createdAt: '2026-09-10T18:00:00Z',
  updatedAt: '2026-09-10T18:00:00Z',
};

export function contentSlide(
  id: string,
  layout: Layout,
  slots: ContentSlide['slots'],
  extra: Partial<ContentSlide> = {},
): ContentSlide {
  return { schemaVersion: 1, id, kind: 'content', layout, slots, ...extra };
}

/** One block of every catalog type, the deck's own values where a slide sets them. */
export const catalog: Block[] = [
  { id: 'h', type: 'heading', level: 'h2', text: 'The content rule', marginBottom: 0 },
  { id: 'h1', type: 'heading', level: 'h1', text: 'General Translation', marginTop: 44 },
  { id: 'big', type: 'heading', level: 'big', text: 'Brand' },
  { id: 'title', type: 'heading', level: 'title', text: 'The Blue Marble' },
  {
    id: 'p1',
    type: 'paragraph',
    text: 'Engineers use GT and executives buy it. See [prototemplate.com](https://prototemplate.com) and *gt-next*.',
    measure: 56,
    marginTop: 14,
  },
  { id: 'p2', type: 'paragraph', text: 'A caption in titanium.', role: 'cap', measure: 32 },
  {
    id: 'p3',
    type: 'paragraph',
    text: 'A lead paragraph.',
    role: 'lead',
    tone: 'muted',
    measure: 22,
  },
  { id: 'credit', type: 'credit', text: 'Material: Event Horizon, a Prototemplate direction' },
  {
    id: 'rows',
    type: 'rows',
    key: 180,
    tight: true,
    items: [
      {
        key: 'Users',
        icon: { name: 'user-group' },
        value: 'Users are engineering and growth teams.',
      },
      { key: 'GT', value: 'The short form and the mark.' },
    ],
  },
  {
    id: 'links',
    type: 'rows',
    key: 220,
    tight: true,
    links: true,
    items: [
      {
        key: 'Landing',
        icon: { name: 'home' },
        value: '[generaltranslation.com](https://generaltranslation.com)',
      },
    ],
  },
  {
    id: 'list',
    type: 'plain',
    items: [
      { icon: { name: 'check-circle', color: 'ok' }, text: 'How GT ships a locale' },
      { icon: { name: 'x-circle', color: 'no' }, no: true, text: 'Announcements without a result' },
    ],
  },
  {
    id: 'list22',
    type: 'plain',
    size: 22,
    items: [{ icon: { name: 'cube' }, text: 'The libraries' }],
  },
  { id: 'refs', type: 'refs', items: ['Wide Field', 'Bento Foundry', 'White Gallery'] },
  {
    id: 'say',
    type: 'say',
    items: [
      { note: 'Acceptable', quote: 'Translations are generated at build time.' },
      { note: 'Not acceptable', quote: 'Supercharge your global growth.', no: true },
    ],
  },
  {
    id: 'scales',
    type: 'scales',
    centerTick: true,
    items: [
      { left: 'Classic', right: '*Modern*', value: 78 },
      { left: '*Reserved*', right: 'Playful', value: 22 },
    ],
  },
  {
    id: 'spec',
    type: 'spec',
    weights: [300, 500, 800],
    sample: 'Inter',
    textRow: 'Long-form reading.',
  },
  {
    id: 'lang',
    type: 'lang',
    items: [
      { script: 'en', text: 'Every product in every language.', label: 'English' },
      { script: 'ja', text: '全製品を、全言語で。', label: 'Japanese' },
      { script: 'ar', text: 'كل منتج بكل لغة.', label: 'Arabic' },
    ],
  },
  {
    id: 'ladder',
    type: 'ladder',
    valueWidth: 320,
    rows: [
      { size: 68, label: 'hero 3.7rem desktop' },
      { size: 15, label: 'label 13px' },
    ],
  },
  {
    id: 'swatches',
    type: 'swatches',
    items: [
      { name: 'Ink', value: '#070707', plate: 'ink' },
      { name: 'Accent', value: '#2f5ce0 on light\n#86a8ff on dark', plate: 'outline' },
    ],
  },
  {
    id: 'fig',
    type: 'shot',
    asset: 'site-home',
    fit: 'width',
    captionSize: 16,
    caption: 'The home page at 1440 by 900 shows the navigation bar closed by one hairline.',
  },
  { id: 'fig2', type: 'shot', asset: 'site-home', aspect: '1440/780', crop: 'top', width: 768 },
  {
    id: 'pair',
    type: 'pair',
    ratio: { left: 27, right: 16 },
    gap: 40,
    captionSize: 15,
    figures: [
      { assets: ['site-home'], caption: 'The X banner is 1500 by 500 pixels.' },
      { assets: ['site-home', 'logo-gm'], caption: 'Two images in one figure.' },
    ],
  },
  {
    id: 'tiles',
    type: 'tiles',
    columns: 6,
    aspect: '16/9',
    labelSize: 15,
    items: [{ asset: 'logo-gm', label: 'Müller-Brockmann, 1955' }],
    more: 'The list continues with Powers of Ten.',
  },
  {
    id: 'dirs',
    type: 'tiles',
    columns: 4,
    aspect: '16/10',
    labelSize: 15,
    items: [
      { asset: 'logo-gm', label: 'Toolchain' },
      { asset: 'logo-gm', label: 'Dossier', marker: true },
    ],
  },
  {
    id: 'eng',
    type: 'tiles',
    columns: 4,
    aspect: '16/9',
    labelSize: 20,
    items: [
      { asset: 'logo-gm', label: 'Horizon field', sub: 'A WebGL lens shader takes 21 parameters.' },
    ],
  },
  {
    id: 'grid',
    type: 'details',
    columns: 3,
    rowHeights: [140, 236],
    items: [
      { asset: 'site-home', caption: 'The header.' },
      { asset: 'site-home', caption: 'The seam.' },
      { asset: 'site-home', caption: 'The logo row.' },
      { asset: 'site-home', caption: 'The table of contents.' },
    ],
  },
  {
    id: 'board',
    type: 'board',
    columns: [128, 250, 200, 'fr'],
    rows: [
      {
        asset: 'site-home',
        name: 'Site',
        address: 'generaltranslation.com',
        state: { name: 'clock', color: 'warn' },
        note: 'Home, pricing, enterprise, careers and contact run the redesign.',
      },
      { name: 'Blog', state: { name: 'check-circle', color: 'ok' }, note: 'Live.' },
    ],
  },
  {
    id: 'group',
    type: 'composite',
    tracks: '1fr',
    gap: 0,
    cells: [
      { blocks: [{ id: 'g1', type: 'paragraph', text: 'First.', measure: 56 }] },
      { blocks: [{ id: 'g2', type: 'paragraph', text: 'Second.', measure: 56 }] },
    ],
  },
  {
    id: 'code',
    type: 'panel',
    code: 'npm i gt-next\nnpm i -D gt\n\nnpx gt translate',
    marks: undefined,
  },
  {
    id: 'pre',
    type: 'panel',
    size: 15,
    pre: true,
    code: 'POST /api/generate\n{ "kind": "background" }',
  },
  { id: 'term', type: 'panel', term: true, marks: true, code: 'npx gt translate' },
  {
    id: 'dia1',
    type: 'dia',
    fit: 'slot',
    alt: 'Three code surfaces lead to the website',
    data: {
      w: 418,
      h: 150,
      lines: [{ x1: 160, y1: 25, x2: 200, y2: 25, stroke: 'mid' }],
      rects: [
        { x: 0, y: 20, w: 11, h: 11, fill: 'ink' },
        { x: 10, y: 10, w: 100, h: 50, fill: 'none', stroke: 'hair' },
      ],
      markers: [{ x: 305.5, y: 75.5 }],
      texts: [
        { x: 24, y: 33, text: 'CLI', size: 20 },
        { x: 24, y: 80, text: 'Open-source', size: 26 },
      ],
      icons: [{ name: 'check-circle', x: 18, y: 206, size: 24, color: 'ok' }],
      marks: [
        { x: 499.94, y: 69.96, w: 30.26, h: 19.24 },
        { x: 150, y: 74, w: 84, h: 54, iso: true },
      ],
    },
  },
  {
    id: 'dia2',
    type: 'dia',
    fit: 'slot',
    alt: 'A raw diagram',
    svg: '<svg class="dia" viewBox="0 0 731 452" aria-label="A raw diagram"><text x="0" y="20">Cell borders</text></svg>',
  },
  {
    id: 'dither',
    type: 'dither',
    height: 220,
    ramp: 'linear-x',
    border: true,
    alt: 'A ramp from solid ink to sparse dots',
  },
  { id: 'mark', type: 'mark', w: 520, h: 331 },
  { id: 'sizes', type: 'markSizes', sizes: [16, 32, 64, 128, 256] },
  {
    id: 'matrix',
    type: 'matrix',
    cells: [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5],
    ],
  },
  {
    id: 'logos',
    type: 'logoPlates',
    items: [
      { asset: 'logo-gm', name: 'General Motors' },
      { mark: true, name: 'General Translation' },
    ],
  },
  {
    id: 'html',
    type: 'html',
    css: '.lay { display: flex; gap: 40px; } .ts-x-catalog-html .ex { display: grid; }',
    html: '<div class="lay"><h3 onclick="alert(1)">Fixed</h3><script>alert(1)</script><p>Two tables.</p></div>',
    note: 'Two three-row tables with forced 79 px row heights beside four example diagrams.',
  },
];
