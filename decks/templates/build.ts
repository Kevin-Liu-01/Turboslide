// The template and building block generator (gslides-parity SPEC-5 0.22, 0.24, 0.25, 4.1, 4.2,
// 4.5; MILESTONES-5 B3 day 7). Run once on the builder's machine with Node; the folders it writes
// are committed and the check chain never runs it:
//
//     node decks/templates/build.ts                       # the eight templates, blank-plate, the indexes, the blocks
//     node decks/templates/build.ts --clip path/to/demo.webm   # the Sales pitch's demo clip (a five second silent clip)
//
// Every slide is made through the layout list (`packages/schema/src/layouts.ts` `make`), so a
// template slide is a grammar slide with the same prompts the editor inserts, then filled with
// placeholder sentences that read as copy in sentence case (never "Lorem ipsum", never Google's
// copy). The eight templates ship on `ts-plate` (0.24) and share the blank template's four starter
// pictures through the record's `assets` folder; the Sales pitch has its own assets folder for the
// demo clip. `blank-plate` is the blank template's one slide on the second theme. The building
// blocks are JSON files under `building-blocks/<category>/<id>.json`, positioned inside a 1326 by
// 642 box under one group tag (0.25), and `building-blocks/index.json` lists their summaries.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// deck.ts first: the schema modules form a cycle (blocks, assets, ext) that resolves from this entry
import '../../packages/schema/src/deck.ts';
import type { Block, PlainBlock, RowsBlock, TableBlock, TextBlock } from '../../packages/schema/src/blocks.ts';
import type { BuildingBlock, BuildingBlockCategory } from '../../packages/schema/src/building-blocks.ts';
import { BUILDING_BLOCK_BOX, buildingBlockSchema } from '../../packages/schema/src/building-blocks.ts';
import type { ContentSlide, Deck, Slide } from '../../packages/schema/src/deck.ts';
import { makeDiagram } from '../../packages/schema/src/diagrams.ts';
import { canonicalJson } from '../../packages/schema/src/json.ts';
import { layoutEntry } from '../../packages/schema/src/layouts.ts';
import type { LayoutId } from '../../packages/schema/src/layouts.ts';
import type { Position } from '../../packages/schema/src/position.ts';
import { validateDeck } from '../../packages/schema/src/validate.ts';
import { isMediaRefusal, mediaInfo } from '../../packages/store/src/media/info.ts';
import { writeTemplateIndex } from '../../packages/store/src/templates.ts';
import type { TemplateRecord } from '../../packages/store/src/templates.ts';
import type { MediaAsset } from '../../packages/schema/src/assets.ts';
import { mediaAssetFile } from '../../packages/schema/src/blocks/media.ts';

const here = dirname(fileURLToPath(import.meta.url));
const decksDir = join(here, '..');
const BLANK = join(here, 'blank');
const NOW = '2026-09-15T00:00:00.000Z';

// ---------------------------------------------------------------------------------------------
// The slide builders

type Fill = Record<string, unknown>;

/** The blank template's manifest: the four starter pictures every template shares. */
function starterDeck(id: string, title: string, theme: 'ts-plate' | 'gt-ink-paper'): Deck {
  const blank = JSON.parse(readFileSync(join(BLANK, 'deck.json'), 'utf8')) as Deck;
  return { ...blank, id, title, theme, sections: [], revision: 0, createdAt: NOW, updatedAt: NOW };
}

function walk(slide: Slide, visit: (block: Block) => void): void {
  if (slide.kind === 'content') for (const blocks of Object.values(slide.slots)) for (const block of blocks ?? []) visit(block);
  else if ('plate' in slide) for (const block of slide.plate.blocks) visit(block);
}

/** Fills a made slide's blocks by id: a string sets `text`, an object merges its fields. */
function fill(slide: Slide, values: Fill): Slide {
  walk(slide, (block) => {
    const value = values[block.id];
    if (value === undefined) return;
    if (typeof value === 'string') (block as { text?: string }).text = value;
    else Object.assign(block, value);
  });
  return slide;
}

function made(id: string, layout: LayoutId, deck: Deck, sectionId: string): Slide {
  const slide = layoutEntry(layout).make(id, deck, sectionId);
  if (slide === null) throw new Error(`the ${layout} layout needs a picture the template deck lacks`);
  return slide;
}

function withTitle(slide: Slide, title: string): Slide {
  return { ...slide, title };
}

function content(id: string, layout: LayoutId, deck: Deck, sectionId: string, title: string, values: Fill): Slide {
  return withTitle(fill(made(id, layout, deck, sectionId), values), title);
}

function rows(items: { key: string; value: string }[], key: RowsBlock['key'] = 220): Partial<RowsBlock> {
  return { key, items: items.map((item) => ({ key: item.key, value: item.value })) };
}

function plain(items: string[], numbered = false): Partial<PlainBlock> {
  return { items: items.map((text) => ({ text })), ...(numbered ? { numbered: true, marker: 'number' as const } : {}) };
}

function table(header: string[], body: string[][]): Partial<TableBlock> {
  return {
    columns: header.map(() => ({})),
    rows: [{ cells: header, header: true }, ...body.map((cells) => ({ cells }))],
  };
}

/** A canvas slide of positioned blocks. */
function canvas(id: string, title: string, blocks: Block[]): ContentSlide {
  return { schemaVersion: 1, id, kind: 'content', layout: { type: 'freeform' }, template: 'blank', title, slots: { main: blocks } };
}

function textBox(id: string, text: string, pos: Position, size = 22): TextBlock {
  return { id, type: 'text', text, typography: { size }, pos };
}

// ---------------------------------------------------------------------------------------------
// The templates (SPEC-5 4.1, 4.2)

type TemplateSpec = {
  id: string;
  name: string;
  description: string;
  category: 'personal' | 'work' | 'education';
  useCases: string[];
  slides: (deck: Deck) => Slide[];
  /** the section name of the one section */
  section?: string;
};

function salesPitch(deck: Deck, clip: MediaAsset | undefined): Slide[] {
  const s = 'deck';
  const slides: Slide[] = [
    withTitle(fill(made('title', 'title', deck, s), { }), 'Sales pitch'),
    content('agenda', 'plain', deck, s, 'Agenda', {
      h: 'Agenda',
      p1: 'What we cover in the next twenty minutes.',
      list: plain(['The problem', 'What we built', 'How it works', 'Results', 'Next steps']),
    }),
    {
      ...content('the-problem', 'split', deck, s, 'The problem', {
        h: 'The problem',
        p1: 'Name the cost of the status quo in one line.',
        p2: 'Teams lose a week each quarter reconciling the same numbers by hand.\nEvery handoff between tools drops context and delays the decision.\nThe people closest to the customer wait longest for an answer.',
      }),
      // the three sentences appear one per click: one text body, so the exporter's bldP reads build="p"
      animations: [{ id: 'a1', blockId: 'p2', effect: 'appear', trigger: 'click', durationMs: 500, byParagraph: true }],
    },
    content('who-this-is-for', 'cols', deck, s, 'Who this is for', {
      h: 'Who this is for',
      p1: 'The buyer owns the budget and the outcome.\nThe user lives in the tool every day and needs it to stay out of the way.',
      p2: 'Operations and finance teams of twenty to two hundred people, in companies that run three or more systems the numbers cross.\nThe first customers were the teams that lost a week each quarter to reconciling.',
    }),
    content('the-product', 'figure', deck, s, 'The product', {
      h: 'The product',
      p1: 'One screen for the whole workflow, from the first import to the report.',
      fig: { caption: 'The product in use' },
    }),
    canvas('product-demo', 'Product demo', [
      { id: 'h', type: 'heading', level: 'h2', text: 'Product demo', pos: { x: 137, y: 92, w: 1000, h: 72, z: 1 } },
      {
        id: 'demo',
        type: 'media',
        kind: 'video',
        source: { asset: clip === undefined ? '' : clip.id },
        playback: { start: 'click' },
        alt: 'The product demo clip',
        pos: { x: 320, y: 190, w: 960, h: 540, z: 2 },
      },
      textBox('caption', 'Replace this clip with your demo through Insert > Video', { x: 320, y: 748, w: 960, h: 40, z: 3 }, 18),
    ] as Block[]),
    content('how-it-works', 'rows', deck, s, 'How it works', {
      h: 'How it works',
      p1: 'Four steps from the first login to the first report.',
      rows: rows([
        { key: 'Connect', value: 'Link the systems you already run in one afternoon.' },
        { key: 'Configure', value: 'Pick the fields and the owners once.' },
        { key: 'Run', value: 'The pipeline runs on a schedule you set.' },
        { key: 'Review', value: 'The report lands in the inbox before the meeting.' },
      ]),
    }),
    content('results', 'tiles', deck, s, 'Results', {
      h: 'Results',
      p1: 'Three numbers from the first ten customers.',
      tiles: {
        columns: 4,
        items: [
          { label: '48 percent', sub: 'Faster onboarding' },
          { label: '3 days', sub: 'From signature to first report' },
          { label: '12 hours', sub: 'Saved per team each week' },
        ],
        more: 'Measured over the first quarter of use.',
      },
    }),
    content('customer-quote', 'big-number', deck, s, 'Customer quote', {
      h: 'We replaced three tools and a spreadsheet the first month',
      p1: 'A customer, head of operations',
    }),
    content('comparison', 'table', deck, s, 'Comparison', {
      h: 'Comparison',
      table: table(
        ['Criteria', 'Today', 'Alternative', 'Us'],
        [
          ['Setup time', 'Weeks', 'Days', 'One afternoon'],
          ['Owner', 'Everyone', 'A specialist', 'The team'],
          ['Reporting', 'By hand', 'Nightly', 'Live'],
        ],
      ),
    }),
    {
      ...content('pricing', 'rows', deck, s, 'Pricing', {
        h: 'Pricing',
        p1: 'Three plans; every plan includes support.',
        rows: rows([
          { key: 'Starter', value: '49 dollars a month for one team of five.' },
          { key: 'Team', value: '199 dollars a month for up to twenty five people.' },
          { key: 'Enterprise', value: 'Call us for single sign on, audit logs and a dedicated contact.' },
        ]),
      }),
      // the rows reveal one per click in the show and in PowerPoint's Animation Pane (S3)
      animations: [{ id: 'a1', blockId: 'rows', effect: 'appear', trigger: 'click', durationMs: 500, byParagraph: true }],
    },
    content('timeline', 'table', deck, s, 'Timeline', {
      h: 'Timeline',
      table: table(
        ['Workstream', 'Q1', 'Q2', 'Q3', 'Q4'],
        [
          ['Pilot', '✓', '', '', ''],
          ['Rollout', '', '✓', '✓', ''],
          ['Review', '', '', '', '✓'],
        ],
      ),
    }),
    content('the-team', 'details', deck, s, 'The team', {
      h: 'The team',
      p1: 'The three people your team will work with.',
      grid: { items: [{ asset: '', caption: 'Name, account lead' }, { asset: '', caption: 'Name, solutions' }, { asset: '', caption: 'Name, support' }] },
    }),
    content('next-steps', 'plain', deck, s, 'Next steps', {
      h: 'Next steps',
      p1: 'What happens after this call.',
      list: plain(['Pilot scope: one team, one workflow, four weeks', 'Success criteria: the report lands before the Monday meeting', 'Decision date: the last Friday of the pilot'], true),
    }),
    fill(withTitle(made('thank-you', 'closing', deck, s), 'Thank you'), {
      h: 'Thank you',
      p1: 'name@company.com\n+1 555 0100\ncompany.com',
    }),
  ];
  return slides;
}

const TEMPLATES: TemplateSpec[] = [
  {
    id: 'sales-pitch',
    name: 'Sales pitch',
    description: 'Fifteen slides a rep opens and rewrites: the problem, the product, a demo clip, results, pricing that reveals one row per click, a timeline, the team and the next steps.',
    category: 'work',
    useCases: ['sales pitches', 'product pitches', 'business proposals'],
    slides: (deck) => salesPitch(deck, undefined),
  },
  {
    id: 'status-report',
    name: 'Status report',
    description: 'Eight slides for a weekly or monthly update: the status board, progress as a column chart, wins, risks, the decisions needed and the next check in.',
    category: 'work',
    useCases: ['project reports', 'quarterly reviews'],
    slides: (deck) => {
      const s = 'deck';
      return [
        fill(withTitle(made('title', 'title', deck, s), 'Status report'), { }),
        content('status-board', 'board', deck, s, 'Status board', {
          h: 'Status board',
          p1: 'Every workstream, its state and one line.',
          board: {
            rows: [
              { name: 'Onboarding', state: { name: 'check-circle', color: 'ok' }, note: 'Three of four teams live.' },
              { name: 'Integrations', state: { name: 'exclamation-circle', color: 'warn' }, note: 'The billing connector slipped a week.' },
              { name: 'Reporting', state: { name: 'check-circle', color: 'ok' }, note: 'Nightly runs since the ninth.' },
            ],
          },
        }),
        canvas('progress', 'Progress', [
          { id: 'h', type: 'heading', level: 'h2', text: 'Progress', pos: { x: 137, y: 92, w: 1000, h: 72, z: 1 } },
          {
            id: 'chart',
            type: 'chart',
            kind: 'column',
            categories: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
            series: [{ name: 'Planned', values: [20, 40, 60, 80] }, { name: 'Done', values: [18, 39, 55, 78] }],
            legend: 'bottom',
            pos: { x: 137, y: 190, w: 1326, h: 560, z: 2 },
          },
        ] as Block[]),
        content('wins', 'rows', deck, s, 'Wins', {
          h: 'Wins',
          p1: 'What landed since the last report.',
          rows: rows([
            { key: 'Onboarding', value: 'Three teams finished the first week without a support call.' },
            { key: 'Reporting', value: 'The Monday report now lands before eight.' },
            { key: 'Cost', value: 'The pipeline runs on half the machines.' },
          ]),
        }),
        content('risks', 'rows', deck, s, 'Risks', {
          h: 'Risks',
          p1: 'What could move the date.',
          rows: rows([
            { key: 'Connector', value: 'The billing connector waits on a vendor fix.' },
            { key: 'Staffing', value: 'One engineer is out for two weeks in March.' },
            { key: 'Scope', value: 'The fourth team asked for a second workflow.' },
          ]),
        }),
        content('decisions-needed', 'plain', deck, s, 'Decisions needed', {
          h: 'Decisions needed',
          p1: 'The calls this group makes today.',
          list: plain(['Hold the date or add a week for the connector', 'Take the fourth team now or after the pilot', 'Fund the second workflow in the next quarter']),
        }),
        canvas('next-check-in', 'Next check in', [
          { id: 'h', type: 'heading', level: 'h2', text: 'Next check in', pos: { x: 137, y: 92, w: 1000, h: 72, z: 1 } },
          ...makeDiagram('timeline', 4, 'outline', { x: 137, y: 220, w: 1326, h: 420 }, 'timeline'),
        ] as Block[]),
        fill(withTitle(made('closing', 'closing', deck, s), 'Closing'), { h: 'Questions', p1: 'The next report follows in two weeks.' }),
      ];
    },
  },
  {
    id: 'consulting-proposal',
    name: 'Consulting proposal',
    description: 'Ten slides for an engagement proposal: the summary, the situation, the scope, the approach, the timeline, the team, the investment, the terms and the signatures.',
    category: 'work',
    useCases: ['business proposals', 'strategic plans'],
    slides: (deck) => {
      const s = 'deck';
      return [
        fill(withTitle(made('title', 'title', deck, s), 'Consulting proposal'), { }),
        fill(withTitle(made('summary', 'statement', deck, s), 'Summary'), { }),
        content('the-situation', 'split', deck, s, 'The situation', {
          h: 'The situation',
          p1: 'Where the client stands today.',
          p2: 'Growth outran the process, and the reporting no longer answers the questions the board asks.\nThree teams keep their own numbers and reconcile them the week before the meeting.',
        }),
        content('scope', 'plain', deck, s, 'Scope', {
          h: 'Scope',
          p1: 'What the engagement covers and what it leaves out.',
          list: plain(['A current state review across the three teams', 'One reporting model with named owners', 'A rollout plan with dates', 'Training for the people who run it']),
        }),
        canvas('approach', 'Approach', [
          { id: 'h', type: 'heading', level: 'h2', text: 'Approach', pos: { x: 137, y: 92, w: 1000, h: 72, z: 1 } },
          ...makeDiagram('process', 4, 'outline', { x: 137, y: 220, w: 1326, h: 420 }, 'process'),
        ] as Block[]),
        canvas('timeline', 'Timeline', [
          { id: 'h', type: 'heading', level: 'h2', text: 'Timeline', pos: { x: 137, y: 92, w: 1000, h: 72, z: 1 } },
          ...makeDiagram('timeline', 5, 'outline', { x: 137, y: 220, w: 1326, h: 420 }, 'timeline'),
        ] as Block[]),
        content('the-team', 'details', deck, s, 'The team', {
          h: 'The team',
          p1: 'Who does the work.',
          grid: { items: [{ asset: '', caption: 'Name, engagement lead' }, { asset: '', caption: 'Name, analyst' }, { asset: '', caption: 'Name, trainer' }] },
        }),
        content('investment', 'table', deck, s, 'Investment', {
          h: 'Investment',
          table: table(['Phase', 'Weeks', 'Fee'], [['Review', '3', '24,000 dollars'], ['Model', '4', '32,000 dollars'], ['Rollout', '5', '40,000 dollars']]),
        }),
        content('terms', 'one-column', deck, s, 'Terms', {
          h: 'Terms',
          p1: 'Fees are invoiced at the start of each phase and due in thirty days.\nEither side may end the engagement with two weeks of notice; work done is invoiced.\nThe deliverables belong to the client on payment.',
        }),
        content('signatures', 'cols', deck, s, 'Signatures', {
          h: 'Signatures',
          p1: 'For the client\n\nName\nTitle\nDate',
          p2: 'For the consultancy\n\nName\nTitle\nDate',
        }),
      ];
    },
  },
  {
    id: 'case-study',
    name: 'Case study',
    description: 'Eight slides on one customer: who they are, the problem, what was done, three results, a quote and what comes next.',
    category: 'work',
    useCases: ['sales pitches', 'marketing plans'],
    slides: (deck) => {
      const s = 'deck';
      return [
        fill(withTitle(made('title', 'title', deck, s), 'Case study'), { }),
        content('the-customer', 'figure', deck, s, 'The customer', {
          h: 'The customer',
          p1: 'A two hundred person company in one sentence: what they make and for whom.',
          fig: { caption: 'The customer at work' },
        }),
        fill(withTitle(made('the-problem', 'statement', deck, s), 'The problem'), { }),
        content('what-we-did', 'rows', deck, s, 'What we did', {
          h: 'What we did',
          p1: 'The work in three steps.',
          rows: rows([
            { key: 'Listened', value: 'Two weeks with the team that owns the numbers.' },
            { key: 'Built', value: 'One model, one owner per field.' },
            { key: 'Shipped', value: 'The report every Monday since March.' },
          ]),
        }),
        content('results', 'tiles', deck, s, 'Results', {
          h: 'Results',
          p1: 'Three numbers after one quarter.',
          tiles: { columns: 4, items: [{ label: '2 days', sub: 'Saved each week' }, { label: '0', sub: 'Numbers reconciled by hand' }, { label: '9 of 10', sub: 'Would recommend' }] },
        }),
        content('quote', 'one-column', deck, s, 'Quote', { h: 'Quote' }),
        content('what-is-next', 'plain', deck, s, 'What is next', {
          h: 'What is next',
          p1: 'Where the work goes from here.',
          list: plain(['The second team joins in the next quarter', 'The report gains the forecast', 'A quarterly review with the board']),
        }),
        fill(withTitle(made('closing', 'closing', deck, s), 'Closing'), { h: 'Thank you', p1: 'name@company.com' }),
      ];
    },
  },
  {
    id: 'product-roadmap',
    name: 'Product roadmap',
    description: 'Eight slides for a roadmap review: the themes, now, next and later, the quarters, the dependencies, the risks and the asks.',
    category: 'work',
    useCases: ['product roadmaps', 'strategic plans', 'quarterly reviews'],
    slides: (deck) => {
      const s = 'deck';
      return [
        fill(withTitle(made('title', 'title', deck, s), 'Product roadmap'), { }),
        content('themes', 'tiles', deck, s, 'Themes', {
          h: 'Themes',
          p1: 'The four themes the year is organised around.',
          tiles: { columns: 4, items: [{ label: 'Onboarding', sub: 'The first week' }, { label: 'Reporting', sub: 'The Monday report' }, { label: 'Integrations', sub: 'The systems around us' }, { label: 'Scale', sub: 'Twice the teams' }] },
        }),
        content('now-next-later', 'cols', deck, s, 'Now, next, later', {
          h: 'Now, next, later',
          p1: 'Now: the billing connector and the report forecast.\n\nNext: single sign on and the audit log.',
          p2: 'Later: the second workflow and the partner API.\n\nEvery item names an owner and a quarter on the next slide.',
        }),
        content('quarters', 'table', deck, s, 'Q1 to Q4', {
          h: 'Q1 to Q4',
          table: table(['Workstream', 'Q1', 'Q2', 'Q3', 'Q4'], [['Onboarding', 'Ship', 'Measure', '', ''], ['Reporting', 'Forecast', 'Ship', 'Measure', ''], ['Integrations', '', 'Connector', 'Sign on', 'Audit log'], ['Scale', '', '', 'Second workflow', 'Partner API']]),
        }),
        canvas('dependencies', 'Dependencies', [
          { id: 'h', type: 'heading', level: 'h2', text: 'Dependencies', pos: { x: 137, y: 92, w: 1000, h: 72, z: 1 } },
          ...makeDiagram('relationship', 4, 'outline', { x: 137, y: 220, w: 1326, h: 420 }, 'dependencies'),
        ] as Block[]),
        content('risks', 'rows', deck, s, 'Risks', {
          h: 'Risks',
          p1: 'What could move a quarter.',
          rows: rows([
            { key: 'Vendor', value: 'The connector waits on the vendor’s API.' },
            { key: 'Hiring', value: 'Two roles open until the second quarter.' },
            { key: 'Demand', value: 'The second workflow may pull the team early.' },
          ]),
        }),
        content('asks', 'plain', deck, s, 'Asks', {
          h: 'Asks',
          p1: 'What the team needs from this group.',
          list: plain(['Approve the two hires for the second quarter', 'Hold the second workflow until the connector ships', 'Name an owner for the partner API']),
        }),
        fill(withTitle(made('closing', 'closing', deck, s), 'Closing'), { h: 'Thank you', p1: 'The roadmap lives in the shared folder and is reviewed each quarter.' }),
      ];
    },
  },
  {
    id: 'lesson-plan',
    name: 'Lesson plan',
    description: 'Eight slides for one lesson: the objectives, a warm up, the lesson in two columns, an activity, a check for understanding, the homework and a closing.',
    category: 'education',
    useCases: ['lesson plans', 'workshop facilitation'],
    slides: (deck) => {
      const s = 'deck';
      return [
        fill(withTitle(made('title', 'title', deck, s), 'Lesson plan'), { }),
        content('objectives', 'plain', deck, s, 'Objectives', {
          h: 'Objectives',
          p1: 'By the end of the lesson every student can do these three things.',
          list: plain(['Name the parts of the water cycle', 'Explain evaporation with one example', 'Predict what happens when the air cools']),
        }),
        fill(withTitle(made('warm-up', 'statement', deck, s), 'Warm up'), { }),
        content('the-lesson', 'cols', deck, s, 'The lesson', {
          h: 'The lesson',
          p1: 'Water leaves the surface as vapour when the sun warms it.\nThe vapour rises and cools.',
          p2: 'The cooled vapour gathers into droplets and clouds.\nThe droplets fall as rain or snow and the cycle starts again.',
        }),
        content('activity', 'figure', deck, s, 'Activity', {
          h: 'Activity',
          p1: 'In pairs, draw the cycle and label each step; twelve minutes.',
          fig: { caption: 'A labelled drawing from last year’s class' },
        }),
        content('check-for-understanding', 'table', deck, s, 'Check for understanding', {
          h: 'Check for understanding',
          table: table(['Question', 'Answer', 'Where it lives'], [['What turns water into vapour?', 'Heat from the sun', 'The surface'], ['Why do clouds form?', 'Vapour cools into droplets', 'The sky'], ['What comes down?', 'Rain or snow', 'The ground']]),
        }),
        content('homework', 'plain', deck, s, 'Homework', {
          h: 'Homework',
          p1: 'Due at the next lesson.',
          list: plain(['Read pages 40 to 44', 'Write three sentences on one part of the cycle', 'Bring one question']),
        }),
        fill(withTitle(made('closing', 'closing', deck, s), 'Closing'), { h: 'See you next lesson', p1: 'The slides are in the class folder.' }),
      ];
    },
  },
  {
    id: 'book-report',
    name: 'Book report',
    description: 'Six slides on one book: the title and the author, a summary, the characters, the themes, your view and a closing.',
    category: 'education',
    useCases: ['book reports', 'project reports'],
    slides: (deck) => {
      const s = 'deck';
      return [
        fill(withTitle(made('title', 'title', deck, s), 'Book report'), { }),
        fill(withTitle(made('summary', 'statement', deck, s), 'Summary'), { }),
        content('characters', 'details', deck, s, 'Characters', {
          h: 'Characters',
          p1: 'The three people the story turns on.',
          grid: { items: [{ asset: '', caption: 'The narrator' }, { asset: '', caption: 'The friend' }, { asset: '', caption: 'The stranger' }] },
        }),
        content('themes', 'rows', deck, s, 'Themes', {
          h: 'Themes',
          p1: 'What the book keeps returning to.',
          rows: rows([
            { key: 'Home', value: 'Where the narrator belongs changes by the last chapter.' },
            { key: 'Trust', value: 'Every promise in the book is tested once.' },
            { key: 'Time', value: 'The story runs over one summer and thirty years.' },
          ]),
        }),
        content('my-view', 'one-column', deck, s, 'My view', { h: 'My view' }),
        fill(withTitle(made('closing', 'closing', deck, s), 'Closing'), { h: 'Thank you', p1: 'Questions welcome.' }),
      ];
    },
  },
  {
    id: 'portfolio',
    name: 'Portfolio',
    description: 'Eight slides for a portfolio: about, three work slides with captions, the process and a contact plate.',
    category: 'personal',
    useCases: ['team intros', 'milestone celebrations'],
    slides: (deck) => {
      const s = 'deck';
      const work = (n: number, title: string, caption: string): Slide =>
        content(`work-${n}`, 'figure', deck, s, title, { h: title, p1: 'The brief, the constraint and what shipped, in three lines.', fig: { caption } });
      return [
        fill(withTitle(made('title', 'title', deck, s), 'Portfolio'), { }),
        content('about', 'split', deck, s, 'About', {
          h: 'About',
          p1: 'Who you are in one line.',
          p2: 'Ten years of product design across three companies, the last four leading a team of six.\nThe work below is the part that shipped.',
        }),
        content('skills', 'rows', deck, s, 'Skills', {
          h: 'Skills',
          p1: 'What the work draws on.',
          rows: rows([
            { key: 'Research', value: 'Interviews, diary studies and the synthesis that follows.' },
            { key: 'Design', value: 'Flows, systems and the detail work in the last week.' },
            { key: 'Leading', value: 'A team of six, hiring and the reviews.' },
          ]),
        }),
        work(1, 'Work one', 'The onboarding redesign, 2024'),
        work(2, 'Work two', 'The reporting surface, 2025'),
        work(3, 'Work three', 'The mobile companion, 2026'),
        canvas('process', 'Process', [
          { id: 'h', type: 'heading', level: 'h2', text: 'Process', pos: { x: 137, y: 92, w: 1000, h: 72, z: 1 } },
          ...makeDiagram('process', 4, 'outline', { x: 137, y: 220, w: 1326, h: 420 }, 'process'),
        ] as Block[]),
        fill(withTitle(made('contact', 'closing', deck, s), 'Contact'), { h: 'Contact', p1: 'name@example.com\nexample.com' }),
      ];
    },
  },
];

/** The record's description keeps under 400 characters for the index. */
function templateRecord(spec: TemplateSpec, slideCount: number, assets: string, cover: string): TemplateRecord {
  return {
    schemaVersion: 1,
    id: spec.id,
    name: spec.name,
    description: spec.description,
    theme: 'ts-plate',
    deck: 'deck.json',
    slides: 'slides',
    assets,
    sections: [{ id: 'deck', name: 'Deck', slides: slideCount }],
    archetypes: [],
    category: spec.category,
    useCases: spec.useCases,
    cover,
    slideCount,
  };
}

/** Fills the statement and stack slides the layout makers leave empty, by template. */
const STATEMENTS: Record<string, Record<string, Fill | string>> = {
  'consulting-proposal': { summary: 'Three phases over twelve weeks to give the board one set of numbers it trusts' },
  'case-study': { 'the-problem': 'Three teams, three spreadsheets and a week lost every quarter' },
  'lesson-plan': { 'warm-up': 'Where does the rain come from, in one guess each' },
  'book-report': { summary: 'One summer, two friends and a promise that takes thirty years to keep' },
};

function finish(spec: TemplateSpec, slide: Slide): Slide {
  if (slide.kind === 'statement') {
    const big = STATEMENTS[spec.id]?.[slide.id];
    if (typeof big === 'string') return { ...slide, big };
  }
  if (slide.kind === 'title') {
    const heads: Record<string, [string, string]> = {
      'sales-pitch': ['Company name', 'One sentence on what you sell and for whom'],
      'status-report': ['Project name', 'The status on one date, for one group'],
      'consulting-proposal': ['Engagement name', 'A proposal for the client, dated'],
      'case-study': ['Customer name', 'How one customer solved one problem with us'],
      'product-roadmap': ['Product name', 'The roadmap for the year, reviewed each quarter'],
      'lesson-plan': ['Lesson title', 'The subject, the class and the date'],
      'book-report': ['The book’s title', 'By the author; a report by you'],
      'portfolio': ['Your name', 'What you do and where you do it'],
    };
    const [heading, lead] = heads[spec.id] ?? ['Title', 'One sentence'];
    return { ...slide, heading, lead };
  }
  if (slide.kind === 'content' && (slide.id === 'quote' || slide.id === 'my-view')) {
    // the say block carries the quote and its credit; the layout list has no quote layout (a recorded deviation)
    const say: Block = {
      id: 'say',
      type: 'say',
      items: [
        slide.id === 'quote'
          ? { quote: 'We replaced three tools and a spreadsheet the first month.', note: 'A customer, head of operations' }
          : { quote: 'The book earns its ending; the last chapter changes what the first one meant.', note: 'My view, in one sentence' },
      ],
    };
    const h = slide.slots.main?.find((block) => block.id === 'h');
    return { ...slide, slots: { main: [...(h === undefined ? [] : [h]), say] } };
  }
  return slide;
}

// ---------------------------------------------------------------------------------------------
// Writing

function writeDeckFolder(dir: string, deck: Deck, slides: Slide[]): void {
  rmSync(join(dir, 'slides'), { recursive: true, force: true });
  mkdirSync(join(dir, 'slides'), { recursive: true });
  for (const slide of slides) writeFileSync(join(dir, 'slides', `${slide.id}.json`), canonicalJson(slide));
  writeFileSync(join(dir, 'deck.json'), canonicalJson(deck));
}

function check(id: string, deck: Deck, slides: Slide[]): void {
  const result = validateDeck({ deck, slides });
  const blocking = result.issues.filter((issue) => issue.severity >= 2);
  if (blocking.length > 0) {
    for (const issue of blocking) process.stderr.write(`${id}: ${issue.severity} ${issue.file}${issue.pointer}: ${issue.message}\n`);
    throw new Error(`${id} does not validate`);
  }
}

/**
 * The Sales pitch's demo clip: `--clip <file>` when given, else the clip the folder holds already
 * (so a rerun keeps the committed file), else the one second bars fixture as a stand in.
 */
async function demoClip(clipPath: string | undefined, assetsDir: string): Promise<MediaAsset | undefined> {
  const committed = existsSync(assetsDir) ? readdirSync(assetsDir).find((name) => /^demo\.[0-9a-f]{8}\.webm$/.test(name)) : undefined;
  const path = clipPath ?? (committed === undefined ? join(decksDir, '..', 'fixtures', 'media', 'bars-1s.webm') : join(assetsDir, committed));
  if (!existsSync(path)) return undefined;
  const bytes = new Uint8Array(readFileSync(path));
  const info = mediaInfo(bytes);
  if (isMediaRefusal(info)) throw new Error(`the demo clip is refused: ${info.refused}`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const file = mediaAssetFile('demo', sha256, info.mime);
  mkdirSync(assetsDir, { recursive: true });
  for (const old of readdirSync(assetsDir)) if (old.startsWith('demo.')) rmSync(join(assetsDir, old));
  writeFileSync(join(assetsDir, file.replace(/^assets\//, '')), bytes);
  const asset: MediaAsset = {
    id: 'demo',
    kind: 'video',
    role: 'media',
    file,
    mime: info.mime,
    bytes: bytes.byteLength,
    sha256,
    durationMs: info.durationMs,
    codecs: info.codecs,
    title: 'Product demo',
    source: { kind: 'file' },
  };
  if (info.size !== undefined) asset.size = info.size;
  return asset;
}

async function buildTemplates(clipPath: string | undefined): Promise<void> {
  for (const spec of TEMPLATES) {
    const dir = join(here, spec.id);
    mkdirSync(dir, { recursive: true });
    const deck = starterDeck(spec.id, spec.name, 'ts-plate');
    let assets = '../blank/assets';
    let clip: MediaAsset | undefined;
    if (spec.id === 'sales-pitch') {
      // its own assets folder: the four starter pictures and the demo clip
      const assetsDir = join(dir, 'assets');
      const keep = clipPath ?? (existsSync(assetsDir) ? readdirSync(assetsDir).find((name) => /^demo\.[0-9a-f]{8}\.webm$/.test(name)) : undefined);
      const keepBytes = keep === undefined ? undefined : readFileSync(clipPath ?? join(assetsDir, keep));
      rmSync(assetsDir, { recursive: true, force: true });
      cpSync(join(BLANK, 'assets'), assetsDir, { recursive: true });
      if (keepBytes !== undefined) writeFileSync(join(assetsDir, 'demo.00000000.webm'), keepBytes);
      clip = await demoClip(clipPath, assetsDir);
      if (clip !== undefined) deck.media = { demo: clip };
      assets = 'assets';
    }
    const slides = (spec.id === 'sales-pitch' ? salesPitch(deck, clip) : spec.slides(deck)).map((slide) => finish(spec, slide));
    deck.sections = [{ id: 'deck', name: 'Deck', slideIds: slides.map((slide) => slide.id) }];
    check(spec.id, deck, slides);
    writeDeckFolder(dir, deck, slides);
    const cover = slides[0]?.id ?? 'title';
    writeFileSync(join(dir, 'template.json'), `${JSON.stringify(templateRecord(spec, slides.length, assets, cover), null, 2)}\n`);
    process.stdout.write(`${spec.id}: ${slides.length} slides\n`);
  }
  // Blank (Plate): the blank template's one slide on the second theme (SPEC-5 0.24)
  const plateDir = join(here, 'blank-plate');
  mkdirSync(plateDir, { recursive: true });
  const blankDeck = starterDeck('blank-plate', 'Untitled presentation', 'ts-plate');
  const titleSlide = JSON.parse(readFileSync(join(BLANK, 'slides', 'title.json'), 'utf8')) as Slide;
  blankDeck.sections = [{ id: 'deck', name: 'Deck', slideIds: ['title'] }];
  check('blank-plate', blankDeck, [titleSlide]);
  writeDeckFolder(plateDir, blankDeck, [titleSlide]);
  const blankRecord = JSON.parse(readFileSync(join(BLANK, 'template.json'), 'utf8')) as TemplateRecord;
  const plateRecord: TemplateRecord = {
    ...blankRecord,
    id: 'blank-plate',
    name: 'Blank (Plate)',
    description: 'The blank presentation on the Plate theme (gslides-parity SPEC-5 0.24): one Title slide with empty placeholders, the corner slot empty, and the theme starter set of four two tone pictures shared with Blank.',
    theme: 'ts-plate',
    assets: '../blank/assets',
    category: 'personal',
    cover: 'title',
    slideCount: 1,
  };
  writeFileSync(join(plateDir, 'template.json'), `${JSON.stringify(plateRecord, null, 2)}\n`);
  process.stdout.write('blank-plate: 1 slide\n');
}

// ---------------------------------------------------------------------------------------------
// The building blocks (SPEC-5 0.25, 4.5): about thirty, three or four per category, inside 1326 by 642

const [BW, BH] = BUILDING_BLOCK_BOX;

type BlockSpec = { id: string; category: BuildingBlockCategory; label: string; blocks: Block[] };

function heading(id: string, text: string, pos: Position, level: 'h1' | 'h2' | 'big' = 'h2'): Block {
  return { id, type: 'heading', level, text, pos };
}
function paragraph(id: string, text: string, pos: Position, role?: 'lead' | 'cap'): Block {
  return { id, type: 'paragraph', text, pos, ...(role !== undefined ? { role } : {}) };
}
function rule(id: string, x: number, y: number, w: number): Block {
  return { id, type: 'rule', orientation: 'horizontal', length: w, pos: { x, y, w, h: 1 } };
}
function shape(id: string, kind: string, pos: Position, fill?: string, stroke?: string): Block {
  return { id, type: 'shape', shape: kind, pos, ...(fill !== undefined ? { fill } : {}), ...(stroke !== undefined ? { stroke, width: 1 } : {}) } as Block;
}
function picturePlaceholder(id: string, pos: Position): Block {
  return { id, type: 'box', stroke: 'hair', strokeWidth: 1, dash: 'dash', text: 'Add a picture', color: 'titanium', typography: { size: 16 }, valign: 'middle', pos };
}
function bigNumber(id: string, value: string, label: string, x: number, w: number): Block[] {
  return [
    heading(`${id}-value`, value, { x, y: 0, w, h: 110 }, 'big'),
    paragraph(`${id}-label`, label, { x, y: 120, w, h: 40 }, 'cap'),
  ];
}
function listBlock(id: string, items: string[], pos: Position, numbered = false): Block {
  return { id, type: 'plain', items: items.map((text) => ({ text })), pos, ...(numbered ? { numbered: true, marker: 'number' as const } : {}) };
}

const BLOCKS: BlockSpec[] = [
  // Agendas
  { id: 'five-items', category: 'agendas', label: 'Five item agenda', blocks: [heading('h', 'Agenda', { x: 0, y: 0, w: 600, h: 72 }), listBlock('list', ['The problem', 'What we built', 'How it works', 'Results', 'Next steps'], { x: 0, y: 100, w: BW, h: 520 }, true)] },
  { id: 'two-columns', category: 'agendas', label: 'Two column agenda', blocks: [heading('h', 'Agenda', { x: 0, y: 0, w: 600, h: 72 }), listBlock('left', ['Welcome', 'The problem', 'The product'], { x: 0, y: 100, w: 620, h: 400 }, true), listBlock('right', ['Results', 'Pricing', 'Next steps'], { x: 706, y: 100, w: 620, h: 400 }, true)] },
  { id: 'timed', category: 'agendas', label: 'Timed agenda', blocks: [heading('h', 'Agenda', { x: 0, y: 0, w: 600, h: 72 }), { id: 'rows', type: 'rows', key: 120, items: [{ key: '9:00', value: 'Welcome and goals' }, { key: '9:15', value: 'The problem and the product' }, { key: '10:00', value: 'Results and pricing' }, { key: '10:30', value: 'Next steps' }], pos: { x: 0, y: 100, w: BW, h: 480 } }] },
  // Lists
  { id: 'three-bullets', category: 'lists', label: 'Three bullets', blocks: [heading('h', 'Heading', { x: 0, y: 0, w: 800, h: 72 }), { id: 'list', type: 'plain', marker: 'bullet', items: [{ text: 'The first point in one line' }, { text: 'The second point in one line' }, { text: 'The third point in one line' }], pos: { x: 0, y: 100, w: BW, h: 300 } }] },
  { id: 'numbered-steps', category: 'lists', label: 'Numbered steps', blocks: [heading('h', 'Steps', { x: 0, y: 0, w: 800, h: 72 }), listBlock('list', ['Connect the systems', 'Configure the fields', 'Run the pipeline', 'Review the report'], { x: 0, y: 100, w: BW, h: 420 }, true)] },
  { id: 'checklist', category: 'lists', label: 'Checklist', blocks: [heading('h', 'Checklist', { x: 0, y: 0, w: 800, h: 72 }), { id: 'list', type: 'plain', marker: 'bullet', preset: 'checkbox', items: [{ text: 'Scope agreed' }, { text: 'Owner named' }, { text: 'Date set' }, { text: 'Budget approved' }], pos: { x: 0, y: 100, w: BW, h: 420 } }] },
  { id: 'two-column-list', category: 'lists', label: 'Two column list', blocks: [heading('left-h', 'Before', { x: 0, y: 0, w: 620, h: 72 }), { id: 'left', type: 'plain', marker: 'bullet', items: [{ text: 'Three spreadsheets' }, { text: 'A week of reconciling' }, { text: 'Numbers nobody trusts' }], pos: { x: 0, y: 100, w: 620, h: 300 } }, heading('right-h', 'After', { x: 706, y: 0, w: 620, h: 72 }), { id: 'right', type: 'plain', marker: 'bullet', items: [{ text: 'One model' }, { text: 'One owner per field' }, { text: 'The Monday report' }], pos: { x: 706, y: 100, w: 620, h: 300 } }] },
  // Key statistics
  { id: 'one-number', category: 'key-statistics', label: 'One number', blocks: [heading('value', '48 percent', { x: 0, y: 160, w: BW, h: 160 }, 'big'), paragraph('label', 'Faster onboarding, measured over the first quarter', { x: 0, y: 340, w: BW, h: 48 }, 'lead')] },
  { id: 'three-numbers', category: 'key-statistics', label: 'Three numbers', blocks: [...bigNumber('one', '48 percent', 'Faster onboarding', 0, 400), ...bigNumber('two', '3 days', 'From signature to first report', 463, 400), ...bigNumber('three', '12 hours', 'Saved per team each week', 926, 400)] },
  { id: 'number-with-bar', category: 'key-statistics', label: 'Number with a bar', blocks: [heading('value', '72 percent', { x: 0, y: 0, w: 600, h: 120 }, 'big'), paragraph('label', 'Of teams report within the first week', { x: 0, y: 130, w: 600, h: 40 }, 'cap'), shape('track', 'rect', { x: 0, y: 200, w: BW, h: 24 }, 'plate'), shape('bar', 'rect', { x: 0, y: 200, w: Math.round(BW * 0.72), h: 24 }, 'ink')] },
  { id: 'four-numbers', category: 'key-statistics', label: 'Four numbers', blocks: [...bigNumber('one', '2', 'Days saved a week', 0, 300), ...bigNumber('two', '0', 'Numbers by hand', 342, 300), ...bigNumber('three', '9 of 10', 'Would recommend', 684, 300), ...bigNumber('four', '4', 'Teams live', 1026, 300)] },
  // Quotes
  { id: 'pull-quote', category: 'quotes', label: 'Pull quote with a credit', blocks: [heading('quote', 'We replaced three tools and a spreadsheet the first month.', { x: 0, y: 80, w: BW, h: 260 }, 'big'), paragraph('credit', 'A customer, head of operations', { x: 0, y: 360, w: BW, h: 40 }, 'cap')] },
  { id: 'quote-on-plate', category: 'quotes', label: 'Quote on a plate', blocks: [shape('plate', 'rect', { x: 0, y: 0, w: BW, h: 400 }, 'plate'), heading('quote', 'The report lands before the meeting now, every week.', { x: 60, y: 60, w: BW - 120, h: 220 }, 'h1'), paragraph('credit', 'A customer, finance lead', { x: 60, y: 300, w: BW - 120, h: 40 }, 'cap')] },
  { id: 'two-quotes', category: 'quotes', label: 'Two quotes side by side', blocks: [heading('left', 'It stays out of the way.', { x: 0, y: 40, w: 620, h: 160 }, 'h1'), paragraph('left-credit', 'A user, operations', { x: 0, y: 220, w: 620, h: 40 }, 'cap'), heading('right', 'One set of numbers, at last.', { x: 706, y: 40, w: 620, h: 160 }, 'h1'), paragraph('right-credit', 'A buyer, finance', { x: 706, y: 220, w: 620, h: 40 }, 'cap')] },
  // Headlines
  { id: 'headline-and-lead', category: 'headlines', label: 'Headline and lead', blocks: [heading('h', 'A headline in one line', { x: 0, y: 120, w: BW, h: 120 }, 'h1'), paragraph('lead', 'One sentence under it that says what the slide proves.', { x: 0, y: 260, w: BW, h: 60 }, 'lead')] },
  { id: 'headline-with-rule', category: 'headlines', label: 'Headline with a rule', blocks: [heading('h', 'The headline', { x: 0, y: 100, w: BW, h: 120 }, 'h1'), rule('rule', 0, 240, BW), paragraph('sub', 'A short line under the rule.', { x: 0, y: 264, w: BW, h: 48 })] },
  { id: 'section-number', category: 'headlines', label: 'Section number', blocks: [heading('number', '01', { x: 0, y: 60, w: 300, h: 160 }, 'big'), heading('h', 'The section title', { x: 340, y: 100, w: BW - 340, h: 120 }, 'h1'), paragraph('sub', 'What the section covers.', { x: 340, y: 230, w: BW - 340, h: 48 }, 'lead')] },
  // Text callouts
  { id: 'callout-box', category: 'text-callouts', label: 'Callout box', blocks: [{ id: 'box', type: 'box', fill: 'plate', padding: 32, text: 'A callout: one sentence the reader should not miss.', typography: { size: 24 }, pos: { x: 0, y: 0, w: BW, h: 160 } }] },
  { id: 'note-with-icon', category: 'text-callouts', label: 'Note with an icon', blocks: [{ id: 'icon', type: 'icon', name: 'sparkles', size: 32, pos: { x: 0, y: 8, w: 32, h: 32 } }, paragraph('note', 'A note beside an icon: the detail that explains the number above.', { x: 56, y: 0, w: BW - 56, h: 80 })] },
  { id: 'side-callout', category: 'text-callouts', label: 'Side callout', blocks: [shape('bar', 'rect', { x: 0, y: 0, w: 8, h: 200 }, 'ink'), heading('h', 'Worth noting', { x: 40, y: 0, w: BW - 40, h: 60 }), paragraph('text', 'Two lines that qualify the point above without taking the slide over.', { x: 40, y: 70, w: BW - 40, h: 120 })] },
  // Calls to action
  { id: 'next-step-button', category: 'calls-to-action', label: 'Next step', blocks: [heading('h', 'Start the pilot this month', { x: 0, y: 40, w: BW, h: 100 }, 'h1'), { id: 'button', type: 'box', fill: 'ink', color: 'paper', radius: 8, padding: 20, text: 'Book the kickoff', typography: { size: 22, align: 'center' }, valign: 'middle', pos: { x: 0, y: 170, w: 360, h: 72 } }] },
  { id: 'contact-line', category: 'calls-to-action', label: 'Contact line', blocks: [heading('h', 'Talk to us', { x: 0, y: 0, w: BW, h: 80 }, 'h1'), { id: 'rows', type: 'rows', key: 150, items: [{ key: 'Email', value: 'name@company.com' }, { key: 'Phone', value: '+1 555 0100' }, { key: 'Web', value: 'company.com' }], pos: { x: 0, y: 100, w: BW, h: 300 } }] },
  { id: 'two-actions', category: 'calls-to-action', label: 'Two actions', blocks: [{ id: 'primary', type: 'box', fill: 'ink', color: 'paper', radius: 8, padding: 20, text: 'Start the pilot', typography: { size: 22, align: 'center' }, valign: 'middle', pos: { x: 0, y: 0, w: 400, h: 72 } }, { id: 'secondary', type: 'box', stroke: 'ink', strokeWidth: 1, radius: 8, padding: 20, text: 'Read the case study', typography: { size: 22, align: 'center' }, valign: 'middle', pos: { x: 440, y: 0, w: 400, h: 72 } }] },
  // People
  { id: 'one-person', category: 'people', label: 'One person', blocks: [picturePlaceholder('picture', { x: 0, y: 0, w: 240, h: 240 }), heading('name', 'Name', { x: 280, y: 40, w: 800, h: 72 }), paragraph('role', 'Role, team', { x: 280, y: 120, w: 800, h: 40 }, 'cap')] },
  { id: 'three-people', category: 'people', label: 'Three people', blocks: [0, 1, 2].flatMap((i) => [picturePlaceholder(`picture-${i + 1}`, { x: i * 463, y: 0, w: 240, h: 240 }), heading(`name-${i + 1}`, 'Name', { x: i * 463, y: 260, w: 400, h: 56 }), paragraph(`role-${i + 1}`, 'Role, team', { x: i * 463, y: 320, w: 400, h: 40 }, 'cap')]) },
  { id: 'six-people', category: 'people', label: 'Six people', blocks: [0, 1, 2, 3, 4, 5].flatMap((i) => [picturePlaceholder(`picture-${i + 1}`, { x: i * 221, y: 0, w: 160, h: 160 }), paragraph(`name-${i + 1}`, 'Name', { x: i * 221, y: 176, w: 200, h: 40 }, 'cap')]) },
  // Cards
  { id: 'three-cards', category: 'cards', label: 'Three cards', blocks: [0, 1, 2].flatMap((i) => [shape(`card-${i + 1}`, 'rect', { x: i * 463, y: 0, w: 400, h: 320 }, 'plate'), heading(`title-${i + 1}`, `Card ${i + 1}`, { x: i * 463 + 32, y: 32, w: 336, h: 60 }), paragraph(`text-${i + 1}`, 'Two lines on what the card holds and why it matters.', { x: i * 463 + 32, y: 100, w: 336, h: 160 })]) },
  { id: 'card-with-picture', category: 'cards', label: 'Card with a picture', blocks: [shape('card', 'rect', { x: 0, y: 0, w: 640, h: 480 }, 'plate'), picturePlaceholder('picture', { x: 32, y: 32, w: 576, h: 240 }), heading('title', 'Card title', { x: 32, y: 296, w: 576, h: 60 }), paragraph('text', 'One or two lines under the picture.', { x: 32, y: 360, w: 576, h: 80 })] },
  { id: 'two-cards', category: 'cards', label: 'Two cards', blocks: [0, 1].flatMap((i) => [shape(`card-${i + 1}`, 'rect', { x: i * 706, y: 0, w: 620, h: 360 }, undefined, 'hair'), heading(`title-${i + 1}`, i === 0 ? 'Option one' : 'Option two', { x: i * 706 + 32, y: 32, w: 556, h: 60 }), paragraph(`text-${i + 1}`, 'What the option costs, what it gives and who picks it.', { x: i * 706 + 32, y: 100, w: 556, h: 200 })]) },
  { id: 'pricing-card', category: 'cards', label: 'Pricing card', blocks: [shape('card', 'rect', { x: 0, y: 0, w: 420, h: 520 }, undefined, 'ink'), heading('plan', 'Team', { x: 32, y: 32, w: 356, h: 56 }), heading('price', '199 dollars', { x: 32, y: 96, w: 356, h: 100 }, 'big'), paragraph('period', 'a month, up to twenty five people', { x: 32, y: 200, w: 356, h: 40 }, 'cap'), listBlock('features', ['Every workflow', 'Chat support', 'Weekly report'], { x: 32, y: 260, w: 356, h: 200 })] },
];

function writeBuildingBlocks(): void {
  const root = join(here, 'building-blocks');
  rmSync(root, { recursive: true, force: true });
  const summaries: Omit<BuildingBlock, 'blocks'>[] = [];
  for (const spec of BLOCKS) {
    const blocks = spec.blocks.map((block) => ({ ...block, pos: { ...(block.pos as Position), group: 'block' } }));
    let maxX = 0;
    let maxY = 0;
    for (const block of blocks) {
      const pos = block.pos as Position;
      if (pos.x < 0 || pos.y < 0 || pos.x + pos.w > BW + 0.5 || pos.y + pos.h > BH + 0.5) throw new Error(`${spec.id}/${block.id} leaves the ${BW} by ${BH} box`);
      maxX = Math.max(maxX, pos.x + pos.w);
      maxY = Math.max(maxY, pos.y + pos.h);
    }
    const record: BuildingBlock = { id: `${spec.category}/${spec.id}`, category: spec.category, label: spec.label, blocks, box: [Math.round(maxX), Math.round(maxY)] };
    const parsed = buildingBlockSchema.safeParse(record);
    if (!parsed.success) throw new Error(`${spec.id}: ${parsed.error.issues.map((issue) => `${issue.path.join('/')}: ${issue.message}`).join('; ')}`);
    mkdirSync(join(root, spec.category), { recursive: true });
    writeFileSync(join(root, spec.category, `${spec.id}.json`), canonicalJson(parsed.data));
    const { blocks: _blocks, ...summary } = parsed.data;
    summaries.push(summary);
  }
  writeFileSync(join(root, 'index.json'), canonicalJson(summaries));
  process.stdout.write(`building blocks: ${summaries.length} in ${new Set(summaries.map((s) => s.category)).size} categories\n`);
}

async function main(): Promise<void> {
  const clipIndex = process.argv.indexOf('--clip');
  const clip = clipIndex === -1 ? undefined : process.argv[clipIndex + 1];
  await buildTemplates(clip);
  writeBuildingBlocks();
  const rows = writeTemplateIndex(decksDir);
  process.stdout.write(`templates.json: ${rows.map((row) => row.id).join(', ')}\n`);
}

await main();
