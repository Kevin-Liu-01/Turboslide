// The brand kit (docs/PRODUCT.md 4.1, 4.4): one record on the deck, every field optional with a
// defined meaning when absent, edited in the Brand kit panel through `brand.set` and read by every
// renderer through the override stylesheet of @turboslide/render/theme-css. The six colour roles
// are named once, in the marketer's words, and map to the sheet tokens; the logo and footer slots
// draw from the record and take no drag this round (PRODUCT.md question 8, the default recorded).
// A deck without a record reads the deployment's default kit, so nothing changes on a deck that
// carries none. This module imports the colour, font and id modules alone, so deck.ts can import
// it without a cycle; the write helpers take the manifest as a value.
import { z } from 'zod';
import type { HexColor } from './color.ts';
import { hexColorSchema } from './color.ts';
import type { FontId } from './fonts.ts';
import { FONT_IDS } from './fonts.ts';
import type { AssetId } from './ids.ts';
import { slugSchema } from './ids.ts';
import { cloneJson, hasAt } from './pointer.ts';

/** The two appearances a kit names (deck.ts APPEARANCES, repeated so this module stays a leaf). */
export const KIT_APPEARANCES = ['light', 'dark'] as const;
export type KitAppearance = (typeof KIT_APPEARANCES)[number];

/**
 * The six colour roles in the panel's order (PRODUCT.md 4.1): Text, Background, Captions, Hints,
 * Primary, Accent. "Secondary text" and "Muted" are not words of the product.
 */
export const KIT_COLORS = ['text', 'background', 'caption', 'hint', 'primary', 'accent'] as const;
export type KitColor = (typeof KIT_COLORS)[number];

/** The sheet token each role redefines (packages/theme tokens.ts TOKEN_NAMES). */
export const KIT_COLOR_TOKENS: Readonly<Record<KitColor, string>> = {
  text: 'ink',
  background: 'paper',
  caption: 'ink-2',
  hint: 'titanium',
  primary: 'blue',
  accent: 'accent',
};

/** The role's name and its one line, the words the swatch tooltips and the panel rows read. */
export const KIT_COLOR_WORDS: Readonly<Record<KitColor, { name: string; line: string }>> = {
  text: { name: 'Text', line: 'headings and body text' },
  background: { name: 'Background', line: 'the slide’s ground' },
  caption: { name: 'Captions', line: 'captions, labels and the footer text' },
  hint: { name: 'Hints', line: 'slide numbers, placeholder prompts and the wordmark' },
  primary: { name: 'Primary', line: 'links and the key colour of charts and highlights' },
  accent: { name: 'Accent', line: 'the second colour of charts and highlights' },
};

/** Where a slot draws (question 8): one of the four corners, or hidden. */
export const SLOT_POSITIONS = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'hidden',
] as const;
export type SlotPosition = (typeof SLOT_POSITIONS)[number];

/** The words of the Position select. */
export const SLOT_POSITION_LABELS: Readonly<Record<SlotPosition, string>> = {
  'top-left': 'Top left',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-right': 'Bottom right',
  hidden: 'Hidden',
};

/** The slide counter's three formats (PRODUCT.md 4.1, Slide numbers). */
export const COUNTER_FORMATS = ['n / N', 'n', 'Slide n'] as const;
export type CounterFormat = (typeof COUNTER_FORMATS)[number];

/** The kinds a logo slot takes: the deployment's default logo, nothing, or a picture asset. */
export const LOGO_KINDS = ['default', 'none', 'picture'] as const;
export type LogoKind = (typeof LOGO_KINDS)[number];

export type KitMark = { kind: LogoKind; assetId?: AssetId; box?: { w: number; h: number } };
export type KitFooter = { logo?: LogoKind; assetId?: AssetId; text?: string };
export type KitCounter = { show?: boolean; format?: CounterFormat; skipTitle?: boolean };
export type KitFrame = { rails?: boolean; rules?: boolean; crosses?: boolean };
export type KitFonts = { display?: FontId; text?: FontId };
export type KitPositions = { mark?: SlotPosition; footerLogo?: SlotPosition };

/**
 * The record (PRODUCT.md 4.1). `mark` is the title slide's logo slot, `footer` the frame band
 * (logo left, text centre), `counter` the frame band's right, `frame` the GT frame (all true when
 * absent), `positions` the corners of the two logo slots, `lexicon` the names that never translate
 * (4.7). `appearance` is the appearance a deck created from this deck or template opens in.
 */
export type BrandKit = {
  name?: string;
  appearance?: KitAppearance;
  colors?: {
    light?: Partial<Record<KitColor, HexColor>>;
    dark?: Partial<Record<KitColor, HexColor>>;
  };
  fonts?: KitFonts;
  mark?: KitMark;
  footer?: KitFooter;
  counter?: KitCounter;
  frame?: KitFrame;
  positions?: KitPositions;
  lexicon?: string[];
};

const kitColorMap = z
  .strictObject({
    text: hexColorSchema.optional(),
    background: hexColorSchema.optional(),
    caption: hexColorSchema.optional(),
    hint: hexColorSchema.optional(),
    primary: hexColorSchema.optional(),
    accent: hexColorSchema.optional(),
  })
  .optional();

const logoBoxSchema = z.strictObject({
  w: z.number().positive().max(1600),
  h: z.number().positive().max(900),
});

export const brandKitSchema = z.strictObject({
  name: z.string().min(1).max(120).optional(),
  appearance: z.enum(KIT_APPEARANCES).optional(),
  colors: z.strictObject({ light: kitColorMap, dark: kitColorMap }).optional(),
  fonts: z
    .strictObject({ display: z.enum(FONT_IDS).optional(), text: z.enum(FONT_IDS).optional() })
    .optional(),
  mark: z
    .strictObject({
      kind: z.enum(LOGO_KINDS),
      assetId: slugSchema.optional(),
      box: logoBoxSchema.optional(),
    })
    .optional(),
  footer: z
    .strictObject({
      logo: z.enum(LOGO_KINDS).optional(),
      assetId: slugSchema.optional(),
      text: z.string().max(200).optional(),
    })
    .optional(),
  counter: z
    .strictObject({
      show: z.boolean().optional(),
      format: z.enum(COUNTER_FORMATS).optional(),
      skipTitle: z.boolean().optional(),
    })
    .optional(),
  frame: z
    .strictObject({
      rails: z.boolean().optional(),
      rules: z.boolean().optional(),
      crosses: z.boolean().optional(),
    })
    .optional(),
  positions: z
    .strictObject({
      mark: z.enum(SLOT_POSITIONS).optional(),
      footerLogo: z.enum(SLOT_POSITIONS).optional(),
    })
    .optional(),
  lexicon: z.array(z.string().min(1).max(120)).max(200).optional(),
}) satisfies z.ZodType<BrandKit>;

/** The pointer roots `brand.set` and `brand.reset` accept, the record's fields. */
export const BRAND_ROOTS = [
  'name',
  'appearance',
  'colors',
  'fonts',
  'mark',
  'footer',
  'counter',
  'frame',
  'positions',
  'lexicon',
] as const;

/** A JSON pointer under the record: `/colors/light/primary`, `/mark`, `/footer/text`. */
export const BRAND_POINTER = new RegExp(`^/(${BRAND_ROOTS.join('|')})(/[A-Za-z0-9_-]+){0,2}$`);

export function isBrandPointer(pointer: string): boolean {
  return BRAND_POINTER.test(pointer);
}

/**
 * The deployment's default kit (PRODUCT.md 4.1, 4.3): what a deck without a record reads and
 * what Reset returns to. On a deployment without a default template the studio passes the blank
 * template's kit fields (`decks/templates/blank/template.json`); the logo is the GT mark unless the
 * default template carries a picture, whose URL per appearance the caller resolves.
 */
export type DefaultKit = {
  name: string;
  appearance: KitAppearance;
  /** the default logo as a picture; the GT mark when absent */
  logo?: { light: string; dark: string; size: [number, number] };
};

/** The appearance a new deck opens in when no kit names one (PRODUCT.md section 1's decision). */
export const DEFAULT_APPEARANCE: KitAppearance = 'light';

/** The default kit of a deployment that names none: the blank template's words are the studio's to pass. */
export const FALLBACK_DEFAULT_KIT: DefaultKit = {
  name: 'the default kit',
  appearance: DEFAULT_APPEARANCE,
};

/** The kit of a template record, read into a default kit; the fallback's fields where the record is silent. */
export function defaultKitOf(
  kit: Pick<BrandKit, 'name' | 'appearance'> | undefined,
  logo?: DefaultKit['logo'],
): DefaultKit {
  return {
    name: kit?.name ?? FALLBACK_DEFAULT_KIT.name,
    appearance: kit?.appearance ?? DEFAULT_APPEARANCE,
    ...(logo === undefined ? {} : { logo }),
  };
}

// ---------------------------------------------------------------------------------------------
// The writes

/** The manifest fields a brand write reads; the whole deck satisfies it. */
export type BrandHost = { brand?: BrandKit };

/** One `deck.set` mutation; the mutation type lives in mutations.ts, which imports deck.ts, so the shape is repeated here. */
export type BrandMutation = { op: 'deck.set'; path: string; value?: unknown };

/**
 * One `deck.set` for a value at a pointer under `/brand`: written at the shallowest ancestor the
 * deck lacks (creating the record when it is absent), so the inverse the reducer records removes
 * exactly what the write made and Cmd+Z takes one field back; an absent value removes the field.
 * The pointer is the record relative one (`/colors/light/primary`).
 */
export function brandWriteMutation(
  deck: BrandHost,
  pointer: string,
  value: unknown,
): BrandMutation {
  if (!isBrandPointer(pointer))
    throw new TypeError(
      `brand.set: "${pointer}" is not a pointer under the brand kit (${BRAND_ROOTS.map((root) => `/${root}`).join(', ')})`,
    );
  const full = `/brand${pointer}`;
  if (value === undefined) return { op: 'deck.set', path: full };
  const segments = full.split('/').slice(1);
  for (let depth = 1; depth < segments.length; depth += 1) {
    const ancestor = `/${segments.slice(0, depth).join('/')}`;
    if (!hasAt(deck, ancestor)) {
      let built: unknown = cloneJson(value);
      for (let i = segments.length - 1; i >= depth; i -= 1) built = { [segments[i] ?? '']: built };
      return { op: 'deck.set', path: ancestor, value: built };
    }
  }
  return { op: 'deck.set', path: full, value: cloneJson(value) };
}

/**
 * The mutations of `brand.reset`: the whole record removed when no pointer is given (the deck
 * reads the deployment's default kit), else one field removed; none when there is nothing to
 * remove, so a reset on a deck without a record writes no revision.
 */
export function brandResetMutations(deck: BrandHost, pointer?: string): BrandMutation[] {
  if (deck.brand === undefined) return [];
  if (pointer === undefined || pointer === '' || pointer === '/')
    return [{ op: 'deck.set', path: '/brand' }];
  if (!isBrandPointer(pointer))
    throw new TypeError(`brand.reset: "${pointer}" is not a pointer under the brand kit`);
  const full = `/brand${pointer}`;
  return hasAt(deck, full) ? [{ op: 'deck.set', path: full }] : [];
}

/** The record after a write, on a clone, for the validator to read before the commit. */
export function brandAfter(deck: BrandHost, mutation: BrandMutation): BrandKit | undefined {
  const host: { brand?: unknown } = {
    brand: deck.brand === undefined ? undefined : cloneJson(deck.brand),
  };
  const segments = mutation.path.split('/').slice(1);
  if (segments[0] !== 'brand') return deck.brand;
  if (segments.length === 1) {
    if (mutation.value === undefined) return undefined;
    return mutation.value as BrandKit;
  }
  if (host.brand === undefined) host.brand = {};
  let cursor = host.brand as Record<string, unknown>;
  for (let i = 1; i < segments.length - 1; i += 1) {
    const key = segments[i] ?? '';
    const next = cursor[key];
    if (next === null || typeof next !== 'object') {
      const made: Record<string, unknown> = {};
      cursor[key] = made;
      cursor = made;
    } else cursor = next as Record<string, unknown>;
  }
  const last = segments[segments.length - 1] ?? '';
  if (mutation.value === undefined) delete cursor[last];
  else cursor[last] = cloneJson(mutation.value);
  return host.brand as BrandKit;
}

/** The record parsed, or the first issue as a sentence for the refusal. */
export function checkBrandKit(kit: unknown): { kit: BrandKit } | { refused: string } {
  const parsed = brandKitSchema.safeParse(kit);
  if (parsed.success) return { kit: parsed.data };
  const issue = parsed.error.issues[0];
  const at =
    issue === undefined || issue.path.length === 0
      ? ''
      : ` at /${issue.path.map(String).join('/')}`;
  return { refused: `${issue?.message ?? 'invalid'}${at}` };
}

/** The history label of one brand write: "Brand kit: Primary", "Brand kit: Logo", the words Version history lists. */
export function brandWriteLabel(pointer: string): string {
  const [root, second, third] = pointer.split('/').slice(1);
  switch (root) {
    case 'colors': {
      const role = third as KitColor | undefined;
      return `Brand kit: ${role !== undefined && role in KIT_COLOR_WORDS ? KIT_COLOR_WORDS[role].name : 'Colors'}`;
    }
    case 'fonts':
      return `Brand kit: ${second === 'display' ? 'Display font' : second === 'text' ? 'Text font' : 'Fonts'}`;
    case 'mark':
      return 'Brand kit: Logo';
    case 'footer':
      return second === 'text' ? 'Brand kit: Footer text' : 'Brand kit: Footer logo';
    case 'counter':
      return 'Brand kit: Slide numbers';
    case 'frame':
      return 'Brand kit: Frame';
    case 'positions':
      return 'Brand kit: Logo position';
    case 'lexicon':
      return 'Brand kit: Words that never translate';
    case 'appearance':
      return 'Brand kit: Default appearance';
    case 'name':
      return 'Brand kit: Name';
    default:
      return 'Brand kit';
  }
}

/** The families the kit's two roles name, in role order, for the used family lists. */
export function kitFontIds(kit: BrandKit | undefined): FontId[] {
  const out: FontId[] = [];
  const display = kit?.fonts?.display;
  const text = kit?.fonts?.text;
  if (display !== undefined) out.push(display);
  if (text !== undefined && text !== display) out.push(text);
  return out;
}
