// Renders docs/FOCUS.md from docs/gslides-parity/focus/focus-body.md (the prose) and
// docs/gslides-parity/focus/core-matrix.json (the matrix). Every count, the table of section 6.4,
// the by feature summary of section 6.3, the held list of section 7 and the parked list rule 4 of
// section 1 produces are rendered here and never typed into the prose. Node only; no dependency.
//
//   node docs/gslides-parity/focus/render-focus.mjs && node_modules/.bin/prettier --write docs/FOCUS.md
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..', '..');
const MATRIX = join(here, 'core-matrix.json');
const BODY = join(here, 'focus-body.md');
const OUT = join(ROOT, 'docs', 'FOCUS.md');

const { rows } = JSON.parse(readFileSync(MATRIX, 'utf8'));
const body = readFileSync(BODY, 'utf8');

/** The section 2 features in the order of the document, with their headings. */
const FEATURES = [
  ['decks', '2.1 Decks and the home surfaces'],
  ['slides', '2.2 Slides and the filmstrip'],
  ['text', '2.3 Text'],
  ['images', '2.4 Pictures and the slide background'],
  ['arrange', '2.5 Selection, arrange and the canvas'],
  ['shapes', '2.6 Shapes'],
  ['lines', '2.6 Lines'],
  ['present', '2.7 Present'],
  ['share', '2.7 Share and collaboration'],
  ['comments', '2.7 Comments'],
  ['versions', '2.7 Version history'],
  ['export', '2.8 Download and print'],
  ['help', '2.8 Help'],
  /* the return round's features (docs/RETURN.md section 5), numbered by its sections */
  ['tables', 'RETURN 2.4 Tables'],
  ['charts', 'RETURN 2.5 Charts'],
  ['diagrams', 'RETURN 2.6 Diagrams'],
  ['wordart', 'RETURN 2.7 Word art'],
  ['formatting', 'RETURN 2.11 Formatting'],
  ['chrome', "RETURN 2.16 The editor's chrome"],
  ['view', 'RETURN 2.16 The View menu'],
  ['inbox', 'RETURN 2.16 Notifications'],
  ['surface', '3 The switch'],
];
const STATES = ['works', 'broken', 'flaky', 'not driven'];

/** The README paragraphs of section 7, one per feature; printed only while every row of the feature works. */
const README = {
  decks:
    '**Decks.** The root address opens a new presentation. The first edit saves it and every later edit saves itself; the title row says so. Rename the deck in the title row or from File. The home page lists your presentations with search, opens a deck from its card, and the card menu presents, renames, copies, downloads and trashes. File > Make a copy makes the customer copy with or without the speaker notes. The trash restores a deck or deletes it forever after one confirmation.',
  slides:
    "**Slides.** New slide from the toolbar, the Slide menu, the right click menu or Ctrl+M adds a slide after the current one with the same layout; the arrow beside it picks a layout. Duplicate, delete and skip work on one slide or a selection, from the filmstrip, the menu or the keyboard, and each undoes. Drag a card to reorder, move it with the keyboard, or copy and paste a slide within a deck or into another. Apply layout offers the theme's layouts and moves only what you typed. Speaker notes sit under the slide and show in Presenter view.",
  text: '**Text.** Click a placeholder and type. Bold, italic, underline and strikethrough apply to a selected word from the keyboard or the toolbar. Font size, alignment, line spacing, bulleted and numbered lists, indent and clear formatting are on the toolbar and in the Format menu. Cmd+K or the toolbar button links a word. Find and replace renames a customer across the deck. Cut, copy and paste work within a box, between boxes and between slides; Cmd+Shift+V pastes plain text.',
  images:
    '**Pictures.** Upload from your computer, drop a file on the slide or paste one. Drop a file on a picture to replace it; the frame stays. Move, resize and rotate by the handles; the size shows while you drag. Crop by double click, Enter to apply, Undo to take it back. Format options sets transparency, brightness and contrast. Change background colours one slide.',
  arrange:
    '**Selection and arrange.** Select by click, Shift click or a marquee; order, align and centre from the Arrange menu; nudge with the arrow keys; duplicate, delete, undo and redo. The zoom box, its presets and Cmd+0 set the view.',
  shapes:
    '**Shapes.** Rectangle, rounded rectangle and ellipse with a fill, a border and text; they move, resize and rotate by their handles and survive the PDF and the PowerPoint file.',
  lines:
    '**Lines.** A line and an arrow, drawn by a drag, with a colour, a weight, a dash and end decorations.',
  present:
    '**Present.** Slideshow presents from the current slide, Start from beginning from slide 1; Presenter view opens a second window with your notes, the next slide and a timer. The arrows, Space, Home, End, a number then Enter, L for the laser, B and W to blank the screen, and Escape to leave. Skipped slides stay out of the show.',
  share:
    "**Share.** Share offers a view link a prospect can open but not edit, a present link and an edit link; a stranger without the edit link cannot edit. Two people can edit the same deck and see each other's changes within seconds.",
  comments:
    '**Comments.** A comment sits on a slide, a title or an object, with reply and resolve, and reaches every browser on the deck.',
  versions:
    '**Version history.** Version history opens from the Last edit word; name a version, restore an earlier one, and undo the restore.',
  export:
    '**Download and print.** PDF Document and Microsoft PowerPoint from File > Download, with skipped slides and speaker notes left out unless you check them. Print settings and preview, and Cmd+P, open the print page; its Download as PDF carries what the preview shows.',
  help: '**Help.** Search the menus (Option+/) finds any menu row by name; Help > Keyboard shortcuts lists the chords; Help > Help lists the ten most common tasks with a link to the guides.',
  tables:
    "**Tables.** Insert > Table places a table from a grid of columns and rows. Double click a cell to type, Tab to move to the next cell, Tab on the last cell to add a row. Rows and columns are added and deleted from the cell's right click menu and from Format > Table. Align a cell from the toolbar or the Format menu. Drag a column edge to resize it. The table draws in the show, the PDF and the PowerPoint file.",
  charts:
    '**Charts.** Insert > Chart adds a bar, column, line or pie chart with sample data. The numbers are edited in the Format options panel, in the deck; there is no spreadsheet to open. Change the chart type, add a series or a category, resize the chart by its handles. The chart draws in the show and in the PDF, and the PowerPoint file carries it as a native chart.',
  diagrams:
    '**Diagrams.** Insert > Diagram opens a panel of six diagram types with a step count and three styles; the diagram lands as one group and moves as one; double click a box to edit its label.',
  wordart:
    '**Word art.** Insert > Word art places a large outlined text, edited in place by a double click.',
  formatting:
    '**Formatting.** Superscript, subscript and capitalization from the Format menu, the right click menu and the keyboard; justified alignment; space before and after a paragraph and custom spacing; highlight colour; Paint format copies a look, including the size, from one object to another. Distribute, rotate, flip, group and ungroup are in the Arrange menu. Slide > Change theme switches the deck between the light and dark appearance.',
  chrome:
    "**The editor's chrome.** The Slideshow button and its options menu are one control; Enter, Space and ArrowDown work on it. Every row of the editor draws one hairline at its boundary, and the title row's controls share one height and one corner.",
  view: '**The View menu.** View > Appearance sets the chrome to light or dark; Show filmstrip, Full screen and the editing modes are in the View menu, with the rulers, the guides and the snaps for arranging objects.',
  inbox:
    '**Notifications.** The bell in the title row lists the replies and mentions on a shared deck, and Tools > Notification settings keeps the level a seller picks.',
  surface:
    '**For agents and advanced tools.** Every action the editor runs is also a CLI command, an MCP tool, an HTTP route and a window function, including the features behind Tools > Advanced tools. `GET /api/agent` lists them.',
};

const code = (s) => `\`${s}\``;
const tally = (list) => {
  const out = { rows: list.length };
  for (const s of STATES) out[s] = list.filter((r) => r.today === s).length;
  return out;
};

// section 6.3: the counts
function counts() {
  const all = tally(rows);
  const drivers = {};
  for (const r of rows) drivers[r.driver] = (drivers[r.driver] || 0) + 1;
  const sev = {};
  for (const r of rows) if (r.severity !== undefined) sev[r.severity] = (sev[r.severity] || 0) + 1;
  const withChecks = rows.filter((r) => r.setup !== undefined).length;
  const lines = [];
  lines.push(
    `The matrix holds ${all.rows} rows. By what production did on 2026-09-15: ${all.works} works, ${all.broken} broken, ${all.flaky} flaky, ${all['not driven']} not driven. By driver: ${Object.entries(
      drivers,
    )
      .sort((a, b) => b[1] - a[1])
      .map(([d, n]) => `${n} ${d}`)
      .join(', ')}. The failed rows by severity, as the audits set it: ${[3, 2, 1]
      .map((s) => `${sev[s] ?? 0} at severity ${s}`)
      .join(
        ', ',
      )}; a not driven row carries no severity. ${withChecks} rows name a setup write that is not a driven step.`,
  );
  lines.push('');
  lines.push(
    "By feature, with the reading rule 4 of section 1 gives on today's data (a feature with a not driven or failed row would be parked at a ship made today; the switch itself is the mechanism of parking and a failed or not driven `surface.*` row blocks the ship instead):",
  );
  lines.push('');
  lines.push(
    "| Feature | Rows | Works | Broken | Flaky | Not driven | At a ship on today's data |",
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const [key, heading] of FEATURES) {
    const t = tally(rows.filter((r) => r.feature === key));
    const clean = t.rows === t.works;
    const verdict =
      key === 'surface'
        ? clean
          ? 'the switch passes'
          : 'blocks the ship'
        : clean
          ? 'in the default view'
          : 'parked';
    lines.push(
      `| ${heading} (${code(key)}) | ${t.rows} | ${t.works} | ${t.broken} | ${t.flaky} | ${t['not driven']} | ${verdict} |`,
    );
  }
  return lines.join('\n');
}

// section 6.4: the table
function table() {
  const lines = [];
  lines.push('| Id | Feature | Interaction | Driver | Today on production | Evidence |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const r of rows) {
    const today = r.severity !== undefined ? `${r.today} (severity ${r.severity})` : r.today;
    const extra = [];
    if (r.setup !== undefined) extra.push(`Setup: ${r.setup}`);
    if (r.note !== undefined) extra.push(`Note: ${r.note}`);
    const evidence = [r.evidence, ...extra].join('. ').replace(/\|/g, '\\|');
    lines.push(
      `| ${code(r.id)} | ${code(r.feature)} | ${r.interaction.replace(/\|/g, '\\|')} | ${r.driver} | ${today} | ${evidence} |`,
    );
  }
  return lines.join('\n');
}

// section 7: the README, rendered from the rows that pass today
function readme() {
  const lines = [];
  const passing = [];
  const held = [];
  for (const [key, heading] of FEATURES) {
    const mine = rows.filter((r) => r.feature === key);
    const red = mine.filter((r) => r.today !== 'works');
    if (red.length === 0) passing.push(key);
    else held.push([key, heading, red]);
  }
  lines.push('> ## What works today');
  lines.push('>');
  lines.push(
    '> Turboslide is a slide editor for a team that tailors an existing deck and presents it. Every feature in the default view is driven end to end against the production deployment before a release, at human speed, and the release note carries the table of what passed. Features that are not yet tested that way are behind Tools > Advanced tools and are documented as advanced.',
  );
  if (passing.length === 0) {
    lines.push('>');
    lines.push(
      `> (Rendered from ${code('core-matrix.json')} on 2026-09-15: no feature has every row passing on production today, so this section holds no feature paragraph until the ship. The paragraphs below are the drafts each feature earns once every row it names passes.)`,
    );
  } else {
    for (const key of passing) {
      lines.push('>');
      lines.push(`> ${README[key]}`);
    }
  }
  lines.push('');
  lines.push(
    'The paragraphs held until every row of their feature passes, with the rows that hold them today:',
  );
  lines.push('');
  for (const [key, heading, red] of held) {
    lines.push(
      `- ${heading} (${code(key)}), held by ${red.length} of ${rows.filter((r) => r.feature === key).length} rows: ${red.map((r) => code(r.id)).join(', ')}.`,
    );
    lines.push(`  Held paragraph: ${README[key]}`);
  }
  return lines.join('\n');
}

// section 5.1: the not driven core rows outside shapes and lines
function notDriven() {
  const list = rows.filter(
    (r) =>
      r.today === 'not driven' &&
      r.feature !== 'shapes' &&
      r.feature !== 'lines' &&
      r.feature !== 'surface',
  );
  return list.map((r) => `${code(r.id)} (${r.driver})`).join(', ');
}
function notDrivenShapes() {
  const list = rows.filter(
    (r) => r.today === 'not driven' && (r.feature === 'shapes' || r.feature === 'lines'),
  );
  return list.map((r) => code(r.id)).join(', ');
}

const out = body
  .replace('<!-- render:counts -->', counts())
  .replace('<!-- render:table -->', table())
  .replace('<!-- render:readme -->', readme())
  .replace('<!-- render:not-driven -->', notDriven())
  .replace('<!-- render:not-driven-shapes -->', notDrivenShapes())
  .replace(/<!-- render:rows -->/g, String(rows.length));
if (/<!-- render:/.test(out)) throw new Error('an unrendered placeholder is left in the body');
writeFileSync(OUT, out);
console.log(`wrote ${OUT}: ${rows.length} rows`);
