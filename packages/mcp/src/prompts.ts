// The deck_review prompt (SPEC 7.3, 7.6): the judge lens instructions. A judge reads the contact
// sheet by its cell map first, then the renders, alongside the structured evidence (render record
// boxes, line counts, font sizes and weights, the lint findings), one lens at a time, and returns
// Finding[] at severity 2 and 3 only, each with slideId, blockId where one exists, evidence and a
// proposal a fixer can act on without judgment. The text is the procedure of SPEC 7.6 steps 3 and
// 4 and the completion rules of the turboslide-verify skill.
import type { GetPromptResult, Prompt } from '@modelcontextprotocol/sdk/types.js';

export type JudgeLens = {
  id: string;
  name: string;
  /** What the lens looks at and what counts as a finding. */
  instructions: string;
};

export const JUDGE_LENSES: ReadonlyArray<JudgeLens> = [
  {
    id: 'layout',
    name: 'Layout',
    instructions:
      'Read the render record boxes before the pixels. A block box outside 0..1600 by 0..900 is severity 3 (sheet/overflow). Look for text within 8 px of a rail or rule, a row value taller than two lines, a cols slide with one empty half, unequal gaps in a pair or details grid, side-by-side rows blocks whose tops differ, and a diagram whose viewBox width is not its slot width. Name the block and the measured box.',
  },
  {
    id: 'visual-consistency',
    name: 'Visual consistency and dark mode',
    instructions:
      'Compare the light and dark render of every slide. A slide passes only when both do. Look for a twin that is blank or inverted, an image with a neutral twin and no border, text against ground under 4.5:1 (3:1 at 26 px and up), a plate whose picture shows lit cells under it or within 30 px, doubled hairlines, and a font status other than loaded. A difference between themes beyond colors and images is a finding.',
  },
  {
    id: 'copy',
    name: 'Copy and case',
    instructions:
      'Headings are sentence case, end without a period, name a thing and never a URL, and never start with a product token. Body text is full sentences in plain technical English: no em dashes, no exclamation marks, no metaphors, no fragment rhythm, no "X, not Y" pairs. Captions are full sentences. An eyebrow line above a heading is a finding. Quote the text in the evidence and propose the exact replacement.',
  },
  {
    id: 'accuracy',
    name: 'Accuracy',
    instructions:
      'Check every numeral and every claim against the deck itself and the sources it names. The same noun with different numerals across slides is a finding; a count that should derive from the deck but is typed into copy is a finding. State what you checked it against. Do not report a claim you could not verify as wrong; report it as unverified at severity 2.',
  },
  {
    id: 'completeness',
    name: 'Completeness',
    instructions:
      'Read the outline (deck_get_info) and the section openers. An opener sentence must name each slide family in its section in order. A section whose slides do not deliver what the opener promises, a slide with an html escape block where the grammar has a block for the content, a missing credit on a plate for a share-alike picture, or a placeholder left in the text is a finding.',
  },
  {
    id: 'art-direction',
    name: 'Art direction',
    instructions:
      'Judge the slide against the GT brand deck grammar: one display face at one weight, ruled rows and lists instead of bullets, semantic color only on icons, two-tone pictures with the plate clear, a mood slide never directly before an opener. A slide that is correct by the rules but reads as a different deck is a finding at severity 2 with the specific property to change; do not propose decoration.',
  },
];

export const ALL_LENSES = 'all';

export const DECK_REVIEW_PROMPT: Prompt = {
  name: 'deck_review',
  title: 'Deck review',
  description:
    'The judge lens instructions (SPEC 7.6): layout, visual consistency and dark mode, copy and case, accuracy, completeness, art direction. Returns Finding[] at severity 2 and 3 only.',
  arguments: [
    {
      name: 'lens',
      description: `One lens id (${JUDGE_LENSES.map((lens) => lens.id).join(', ')}) or ${ALL_LENSES}; default ${ALL_LENSES}`,
      required: false,
    },
    {
      name: 'slideIds',
      description: 'Comma-separated slide ids to review; default every slide',
      required: false,
    },
  ],
};

export type DeckReviewArgs = { lens?: string; slideIds?: string };

export function lensById(id: string): JudgeLens | undefined {
  return JUDGE_LENSES.find((lens) => lens.id === id);
}

function selectedLenses(lens: string | undefined): JudgeLens[] {
  if (lens === undefined || lens === '' || lens === ALL_LENSES) return [...JUDGE_LENSES];
  const found = lensById(lens);
  if (found === undefined)
    throw new RangeError(
      `Unknown lens "${lens}"; one of ${JUDGE_LENSES.map((row) => row.id).join(', ')} or ${ALL_LENSES}`,
    );
  return [found];
}

function selectedSlides(slideIds: string | undefined): string[] {
  if (slideIds === undefined) return [];
  return slideIds
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/** The prompt text for a lens selection and a deck; the messages of GetPromptResult. */
export function deckReviewPrompt(
  args: DeckReviewArgs,
  deck: { id: string; revision: number },
): GetPromptResult {
  const lenses = selectedLenses(args.lens);
  const slides = selectedSlides(args.slideIds);
  const scope =
    slides.length === 0
      ? 'every slide'
      : `the slides ${slides.map((id) => `\`${id}\``).join(', ')}`;
  const lines: string[] = [
    `Review deck \`${deck.id}\` at revision ${deck.revision}, ${scope}, as a judge. Evidence first, then judgment. Every claim names the revision.`,
    '',
    '## Evidence',
    '',
    `1. Read the contact sheet by its cell map first: \`deck://sheet/light/map\` and \`deck://sheet/dark/map\` map cell boxes to slide ids, \`deck://sheet/<theme>\` is the image. If there is no sheet yet, call \`deck_render\` with slideIds \`all\` and both themes, then \`deck_sheet\`.`,
    '2. Then read the renders you need: `deck://render/<slideId>/<theme>`, or the images `deck_render` returns.',
    '3. Read the structured record before the pixels: `deck_get_slide` returns the slide, its assets and its last render record with block boxes, line counts, font sizes and weights, the font status, page errors and overflow. `deck_lint` returns the mechanical findings; do not repeat a finding the linter already made.',
    '4. Address slides by id and blocks by `slideId#blockId`. Never address by number alone.',
    '',
    '## Lenses',
    '',
    'One lens at a time. For each lens below, walk the slides in deck order and record what fails.',
    '',
  ];
  for (const lens of lenses)
    lines.push(`### ${lens.name} (\`${lens.id}\`)`, '', lens.instructions, '');
  lines.push(
    '## Output',
    '',
    'Return a JSON array of findings, severity 2 and 3 only, in this shape:',
    '',
    '```json',
    JSON.stringify(
      [
        {
          id: '<lens>:<slideId>:<blockId or slide>:<short-rule>',
          rule: '<the closest rule id from deck://grammar, or the lens id>',
          severity: 3,
          kind: 'defect',
          slideId: '<slideId>',
          blockId: '<blockId, when one exists>',
          theme: '<light or dark, when the finding is theme specific>',
          evidence: { text: '<the text or the measurement>', box: [0, 0, 0, 0] },
          proposal: '<one concrete change a fixer applies without judgment>',
          source: 'judge:<lens>',
        },
      ],
      null,
      2,
    ),
    '```',
    '',
    'Severity 3 must be fixed before the deck ships; 2 should be fixed. `kind` is defect, diagram, polish, copy or accuracy. Give a pixel box in sheet pixels (1600 by 900) where one exists.',
    '',
    '## Rules',
    '',
    '- An overflow finding is a failure at severity 3 whatever the picture looks like.',
    '- A finding names the slide, the block where one exists, the evidence and a proposal; a proposal without a concrete change is not a finding.',
    '- Look at both themes after every judgment; a slide passes only when both do.',
    '- A skeptic keeps or drops each finding afterwards, so report what you measured, not what you suspect.',
    '- Mechanical fixes go through `deck_fix` when it is available; the rest go to a fixer one slide at a time under `deck_lease_slide`, applied with `deck_update_slide` or `deck_update_block` at the `baseRevision` read, then re-rendered and re-linted.',
  );
  return {
    description: `Judge lens instructions for ${deck.id} at revision ${deck.revision}: ${lenses.map((lens) => lens.name).join(', ')}`,
    messages: [{ role: 'user', content: { type: 'text', text: lines.join('\n') } }],
  };
}

// ---------------------------------------------------------------------------------------------
// The deck_assist prompt (docs/PRODUCT.md 6.2, section 5): how an agent uses the assist's two
// actions and the tailoring pass over MCP, with the guardrails an agent must expect.

export const DECK_ASSIST_PROMPT: Prompt = {
  name: 'deck_assist',
  title: 'Deck assist',
  description:
    'How to use the assistant’s actions over this deck: deck_assist_propose reads and answers signed cards, deck_assist_accept writes one, deck_tailor runs the deterministic tailoring pass. Nothing is written without an accepted card.',
  arguments: [
    {
      name: 'intent',
      description: "'shorter', 'notes' or 'ask' (default 'ask')",
      required: false,
    },
    {
      name: 'slideIds',
      description: 'Comma-separated slide ids the ask is about; default the current first slide',
      required: false,
    },
  ],
};

export type DeckAssistArgs = { intent?: string; slideIds?: string };

/** The prompt text for the assist over a deck; the messages of GetPromptResult. */
export function deckAssistPrompt(
  args: DeckAssistArgs,
  deck: { id: string; revision: number },
): GetPromptResult {
  const intent = args.intent === undefined || args.intent === '' ? 'ask' : args.intent;
  if (intent !== 'shorter' && intent !== 'notes' && intent !== 'ask')
    throw new RangeError(`Unknown intent "${intent}"; one of shorter, notes or ask`);
  const slides = selectedSlides(args.slideIds);
  const scope =
    slides.length === 0
      ? 'the first slide'
      : `the slides ${slides.map((id) => `\`${id}\``).join(', ')}`;
  const lines: string[] = [
    `Use the assistant over deck \`${deck.id}\` at revision ${deck.revision}, ${scope}, intent \`${intent}\`.`,
    '',
    '## The two actions',
    '',
    '1. `deck_assist_propose` with `{ intent, prompt, slideIds, baseRevision }` reads the slides and answers `{ cards, sentence?, readSlides? }`. It writes nothing. A card carries `id`, `intent`, `sentence`, `rows` (the before and after per text), `mutations`, `deckId`, `baseRevision`, `expiresAt` and a `signature` the server made; a card is valid for ten minutes. When no card fits, `sentence` says so and `cards` is empty.',
    '2. `deck_assist_accept` with `{ card, baseRevision }` writes one card as one revision by the author Assistant. The server verifies the signature, the expiry and the deck; a card whose texts changed since is refused with "The slide changed while this was written; ask again", so read the card to the person, then accept the card exactly as it came.',
    '',
    '## The tailoring pass',
    '',
    '`deck_tailor` with `{ replacements: [{ from, to }], skip: [slideId], logo?: { assetId, replaceAlt }, baseRevision }` renames the customer in every visible text and the notes, skips the named slides and swaps the pictures whose alt text names the old customer, as one write with no model call. Add the logo picture with `deck_asset_add` first.',
    '',
    '## Rules',
    '',
    '- Never write slide text from a model answer through `deck_update_slide` or `deck_replace_text` to imitate the assistant; the card is the gate a person reads before a write.',
    '- Read `describe` or `deck_get_info` for the current revision and pass it as `baseRevision`; a stale one answers 409 with the current document.',
    '- The sentences a person reads come from the product; the card’s `sentence` is the model’s. Show it as it is.',
  ];
  return {
    description: `Assist instructions for ${deck.id} at revision ${deck.revision}: ${intent}`,
    messages: [{ role: 'user', content: { type: 'text', text: lines.join('\n') } }],
  };
}
