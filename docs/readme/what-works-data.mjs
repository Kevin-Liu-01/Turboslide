// The README paragraphs of docs/FOCUS.md section 7, one per feature of the core matrix, with the
// screenshot each feature shows. `docs/readme/what-works.mjs` renders the README section "What works
// today" from this file and the matrix (`docs/gslides-parity/focus/core-matrix.json`), so a feature's
// paragraph appears only while every row of that feature passes; the count of rows that hold a
// feature back is computed, never typed. Every paragraph below is the text of FOCUS.md section 7
// verbatim (`what-works.test.mjs` asserts it), so the specification and the README cannot drift.
// The return round (docs/RETURN.md section 7) added the paragraphs of the features that return:
// tables, charts, diagrams, word art, formatting, the chrome, the View menu and the notifications;
// each is shown only while every row of its feature passes. The product round (docs/PRODUCT.md
// section 8) added the brand kit, the fonts, the templates and the assist the same way, and the sync
// and costs round (docs/SYNC.md 6.1) the two unparkable features sync and cost, and the features
// round, ship one (docs/FEATURES.md section 4, 7.1) the logo picker. Node only; no dependency.

/**
 * The features in the order of the README, keyed by the matrix's `feature` field. `heading` is the
 * feature's name in prose; `paragraph` is FOCUS.md section 7's text for the feature; `shots` are the
 * README pictures under docs/readme that illustrate it, each with its alt text and its caption, and
 * each showing the default view.
 */
export const FEATURES = [
  {
    key: 'decks',
    heading: 'Decks',
    paragraph:
      '**Decks.** The root address opens a new presentation. The first edit saves it and every later edit saves itself; the title row says so. Rename the deck in the title row or from File. The home page lists your presentations with search, opens a deck from its card, and the card menu presents, renames, copies, downloads and trashes. File > Make a copy makes the customer copy with or without the speaker notes. The trash restores a deck or deletes it forever after one confirmation.',
    shots: [
      {
        file: '10-decks-home.jpg',
        alt: 'The home page at /decks with the search field, Start a new presentation with the Blank and GT brand deck cards, and Recent presentations as cards with rendered thumbnails.',
        caption: 'The home page at `/decks` in the card view.',
      },
    ],
  },
  {
    key: 'slides',
    heading: 'Slides',
    paragraph:
      "**Slides.** New slide from the toolbar, the Slide menu, the right click menu or Ctrl+M adds a slide after the current one with the same layout; the arrow beside it picks a layout. Duplicate, delete and skip work on one slide or a selection, from the filmstrip, the menu or the keyboard, and each undoes. Drag a card to reorder, move it with the keyboard, or copy and paste a slide within a deck or into another. Apply layout offers the theme's layouts and moves only what you typed. Speaker notes sit under the slide and show in Presenter view.",
    shots: [
      {
        file: '04-layout-grid.jpg',
        alt: "The Apply layout grid with Google's eleven layouts and the ten GT layouts, each as a rendered thumbnail, with the Closing tile's tooltip.",
        caption:
          "The layout grid from the toolbar's Layout button, applied to every selected slide.",
      },
      {
        file: '05-filmstrip-menu.jpg',
        alt: "The filmstrip's right click menu on a card: Cut, Copy, Paste, New slide, Duplicate slide, Delete, Skip slide, Change background, Apply layout, Move slide and Comment.",
        caption: 'The filmstrip menu; Duplicate slide is hovered with its Cmd+D tooltip.',
      },
    ],
  },
  {
    key: 'text',
    heading: 'Text',
    paragraph:
      '**Text.** Click a placeholder and type. Bold, italic, underline and strikethrough apply to a selected word from the keyboard or the toolbar. Font size, alignment, line spacing, bulleted and numbered lists, indent and clear formatting are on the toolbar and in the Format menu. Cmd+K or the toolbar button links a word. Find and replace renames a customer across the deck. Cut, copy and paste work within a box, between boxes and between slides; Cmd+Shift+V pastes plain text.',
    shots: [
      {
        file: '13-editor-light.jpg',
        alt: 'The editor on a Title and body slide with a typed title and body, in the light appearance, with the text tail on the toolbar.',
        caption:
          "Typed text on a Title and body slide. The editor follows the presentation's appearance; this one is light.",
      },
    ],
  },
  {
    key: 'images',
    heading: 'Pictures',
    paragraph:
      '**Pictures.** Upload from your computer, drop a file on the slide or paste one. Drop a file on a picture to replace it; the frame stays. Move, resize and rotate by the handles; the size shows while you drag. Crop by double click, Enter to apply, Undo to take it back. Format options sets transparency, brightness and contrast. Change background colours one slide.',
    shots: [
      {
        file: '03-insert-menu.jpg',
        alt: 'The Insert menu open with the Image submenu hovered, showing Upload from computer.',
        caption: 'The Insert menu in the default view, with Image > Upload from computer.',
      },
      {
        file: '06-canvas-rotation.jpg',
        alt: 'A picture on the slide being rotated by its handle, with the live degree readout and the rotated selection ring.',
        caption: 'Rotation by the handle, with the angle readout and the ring following the box.',
      },
      {
        file: '08-format-options.jpg',
        alt: 'Format options open on a selected picture: Size and rotation, Position and the Picture section.',
        caption: 'Format options, the right panel, on a picture.',
      },
    ],
  },
  {
    key: 'arrange',
    heading: 'Selection and arrange',
    paragraph:
      '**Selection and arrange.** Select by click, Shift click or a marquee; order, align and centre from the Arrange menu; nudge with the arrow keys; duplicate, delete, undo and redo. The zoom box, its presets and Cmd+0 set the view.',
    shots: [
      {
        file: '07-canvas-snap-guides.jpg',
        alt: 'A picture mid drag toward the centre of the sheet, with its selection ring and handles.',
        caption:
          'A picture mid drag toward the centre of the sheet. Snap guides and the size readout show while an edge or a centre lines up.',
      },
    ],
  },
  {
    key: 'shapes',
    heading: 'Shapes',
    paragraph:
      '**Shapes.** Rectangle, rounded rectangle and ellipse with a fill, a border and text; they move, resize and rotate by their handles and survive the PDF and the PowerPoint file.',
    shots: [],
  },
  {
    key: 'lines',
    heading: 'Lines',
    paragraph:
      '**Lines.** A line and an arrow, drawn by a drag, with a colour, a weight, a dash and end decorations.',
    shots: [],
  },
  {
    key: 'present',
    heading: 'Present',
    paragraph:
      '**Present.** Slideshow presents from the current slide, Start from beginning from slide 1; Presenter view opens a second window with your notes, the next slide and a timer. The arrows, Space, Home, End, a number then Enter, L for the laser, B and W to blank the screen, and Escape to leave. Skipped slides stay out of the show.',
    shots: [
      {
        file: '11-presenter-console.jpg',
        alt: 'The presenter console with the timer, the clock, the current slide, the slide picker, the previous and next previews and the Speaker notes tab.',
        caption:
          'Presenter view at `/present/gt-brand` with a slideshow window connected in the same browser.',
      },
      {
        file: '12-slideshow-dither.jpg',
        alt: 'The slideshow on The Blue Marble slide of the GT brand deck, a two-tone dithered photograph with its plate, and the present toolbar at the bottom left.',
        caption:
          'The slideshow surface: the sheet alone on an ink surround, with the present toolbar on hover.',
      },
    ],
  },
  {
    key: 'share',
    heading: 'Share',
    paragraph:
      "**Share.** Share offers a view link a prospect can open but not edit, a present link and an edit link; a stranger without the edit link cannot edit. Two people can edit the same deck and see each other's changes within seconds.",
    shots: [
      {
        file: '14-book-view.jpg',
        alt: "The viewer's book view of the GT brand deck: the deck title, the section index with slide ranges, the first section with slide 01 as a page, and the slide list with a filter.",
        caption:
          'What a view link opens: the viewer, here in book view at `/deck/gt-brand?mode=book`.',
      },
      {
        file: '15-grid-view.jpg',
        alt: "The viewer's grid view: the Brand section with slides 01 to 15 as numbered tiles with their titles.",
        caption: 'The viewer in grid view at `/deck/gt-brand?mode=grid`.',
      },
    ],
  },
  {
    key: 'comments',
    heading: 'Comments',
    paragraph:
      '**Comments.** A comment sits on a slide, a title or an object, with reply and resolve, and reaches every browser on the deck.',
    shots: [],
  },
  {
    key: 'versions',
    heading: 'Version history',
    paragraph:
      '**Version history.** Version history opens from the Last edit word; name a version, restore an earlier one, and undo the restore.',
    shots: [],
  },
  {
    key: 'export',
    heading: 'Download and print',
    paragraph:
      '**Download and print.** PDF Document and Microsoft PowerPoint from File > Download, with skipped slides and speaker notes left out unless you check them. Print settings and preview, and Cmd+P, open the print page; its Download as PDF carries what the preview shows.',
    shots: [
      {
        file: '02-file-menu.jpg',
        alt: 'The File menu open with its Download submenu expanded, listing PDF Document and Microsoft PowerPoint.',
        caption: 'File > Download in the default view lists the PDF and the PowerPoint file.',
      },
      {
        file: '09-download-dialog.jpg',
        alt: 'The Download dialog with the Perfect and Editable text cards, Include speaker notes, Include skipped slides and More options expanded.',
        caption:
          'File > Download > Microsoft PowerPoint opens the Download dialog with Perfect selected.',
      },
    ],
  },
  {
    key: 'help',
    heading: 'Help',
    paragraph:
      '**Help.** Search the menus (Option+/) finds any menu row by name; Help > Keyboard shortcuts lists the chords; Help > Help lists the ten most common tasks with a link to the guides.',
    shots: [],
  },
  {
    key: 'tables',
    heading: 'Tables',
    paragraph:
      "**Tables.** Insert > Table places a table from a grid of columns and rows. Double click a cell to type, Tab to move to the next cell, Tab on the last cell to add a row. Rows and columns are added and deleted from the cell's right click menu and from Format > Table. Align a cell from the toolbar or the Format menu. Drag a column edge to resize it. The table draws in the show, the PDF and the PowerPoint file.",
    shots: [],
  },
  {
    key: 'charts',
    heading: 'Charts',
    paragraph:
      '**Charts.** Insert > Chart adds a bar, column, line or pie chart with sample data. The numbers are edited in the Format options panel, in the deck; there is no spreadsheet to open. Change the chart type, add a series or a category, resize the chart by its handles. The chart draws in the show and in the PDF, and the PowerPoint file carries it as a native chart.',
    shots: [],
  },
  {
    key: 'diagrams',
    heading: 'Diagrams',
    paragraph:
      '**Diagrams.** Insert > Diagram opens a panel of six diagram types with a step count and three styles; the diagram lands as one group and moves as one; double click a box to edit its label.',
    shots: [],
  },
  {
    key: 'wordart',
    heading: 'Word art',
    paragraph:
      '**Word art.** Insert > Word art places a large outlined text, edited in place by a double click.',
    shots: [],
  },
  {
    key: 'formatting',
    heading: 'Formatting',
    paragraph:
      '**Formatting.** Superscript, subscript and capitalization from the Format menu, the right click menu and the keyboard; justified alignment; space before and after a paragraph and custom spacing; highlight colour; Paint format copies a look, including the size, from one object to another. Distribute, rotate, flip, group and ungroup are in the Arrange menu. Slide > Change theme switches the deck between the light and dark appearance.',
    shots: [],
  },
  {
    key: 'chrome',
    heading: "The editor's chrome",
    paragraph:
      "**The editor's chrome.** The Slideshow button and its options menu are one control; Enter, Space and ArrowDown work on it. Every row of the editor draws one hairline at its boundary, and the title row's controls share one height and one corner.",
    shots: [],
  },
  {
    key: 'view',
    heading: 'The View menu',
    paragraph:
      '**The View menu.** View > Appearance sets the chrome to light or dark; Show filmstrip, Full screen and the editing modes are in the View menu, with the rulers, the guides and the snaps for arranging objects.',
    shots: [],
  },
  {
    key: 'inbox',
    heading: 'Notifications',
    paragraph:
      '**Notifications.** The bell in the title row lists the replies and mentions on a shared deck, and Tools > Notification settings keeps the level a seller picks.',
    shots: [],
  },
  /* the product round (docs/PRODUCT.md sections 4, 6 and 8.1): the four new features, each shown
     only while every row of its feature passes */
  {
    key: 'brand',
    heading: 'The brand kit',
    paragraph:
      "**Brand kit.** Slide > Change theme and the toolbar Theme button open the Brand kit panel: the logo on the title slide and in the corner of every slide, six colours, the display and text faces, the footer text, the slide number format and the frame lines, each previewed on the sheet as it is changed and taken back with Cmd+Z. A picture's right click menu puts it on every slide. Reset to the deployment's kit is one button. The kit travels into the PDF, the PowerPoint file, the view link and the show.",
    shots: [],
  },
  {
    key: 'fonts',
    heading: 'Fonts',
    paragraph:
      "**Fonts.** The Font dropdown on the toolbar lists the kit's faces, the faces this presentation uses and a catalog of 26 open licence families by category, with a search field; More fonts lists every family with its licence. A face survives a reload, draws in the show, is named in the PowerPoint file and is embedded in the PDF.",
    shots: [],
  },
  {
    key: 'templates',
    heading: 'Templates',
    paragraph:
      "**Templates.** The template gallery lists your organisation's templates and Blank, each with its cover; File > Save as template saves a presentation as a template with its brand kit, and Use for new presentations makes it the presentation /new opens. A template is read only; start a presentation from it.",
    shots: [],
  },
  {
    key: 'assist',
    heading: 'The assist',
    paragraph:
      "**Assist.** The Assist button in the title row (Cmd+J) opens a panel with three starter cards: Tailor for a customer (rename the customer, swap the logo and skip slides in one step, with one Undo), Make it shorter and Write speaker notes. A card shows the before and after; nothing changes until it is accepted, and Accept is one undo step. Search the menus understands a seller's words and offers Ask the assistant when nothing matches.",
    shots: [],
  },
  /* the sync and costs round (docs/SYNC.md 6.1): the write path's order and the calls per state */
  {
    key: 'sync',
    heading: 'Sync',
    paragraph:
      "**Sync.** Two people on one deck see each other's words in order within seconds, on a title slide and in a body block, while both type at once and after one of them was offline. A viewer's tab shows every edit live. A reload reads the same document in every browser. Undo takes back your own word and leaves your colleague's. A change whose answer was lost is never applied twice.",
    shots: [],
  },
  {
    key: 'cost',
    heading: 'Costs',
    paragraph:
      '**Costs.** An open editor, a hidden tab, an editing session, two tabs on one deck and a show each make a bounded number of requests a minute, and the store calls a deck costs a minute are counted in every release run and stay under their ceilings.',
    shots: [],
  },
  {
    key: 'logos',
    heading: 'Logos',
    paragraph:
      "**Logos.** Insert > Logo searches the brand marks of thesvg.org by company name and places the mark on the slide at a logo size, stored on the presentation as its own picture with the brand's licence words; your own brand kit's logo comes first, the tiles show every mark on paper and on ink, and a check puts the mark on the title slide and in every footer. Replace image > Logo swaps a customer's logo and keeps its box, and Tailor for a customer finds the new customer's logo. The picker answers from a daily refreshed index while thesvg.org is down.",
    shots: [],
  },
  {
    key: 'surface',
    heading: 'For agents and advanced tools',
    paragraph:
      '**For agents and advanced tools.** Every action the editor runs is also a CLI command, an MCP tool, an HTTP route and a window function, including the features behind Tools > Advanced tools. `GET /api/agent` lists them.',
    shots: [],
  },
];

/** The opening paragraph of the section, FOCUS.md section 7 verbatim. */
export const LEAD =
  'Turboslide is a slide editor for a team that tailors an existing deck and presents it. Every feature in the default view is driven end to end against the production deployment before a release, at human speed, and the release note carries the table of what passed. Features that are not yet tested that way are behind Tools > Advanced tools and are documented as advanced.';

/**
 * The sentence FOCUS.md section 7 holds until the five rows it names pass; it is printed only
 * when every one of them passes.
 */
export const OUTPUTS_SENTENCE = {
  rows: [
    'export.pdf.file',
    'export.pptx.perfect',
    'present.skipped-left-out',
    'share.view-link-excludes-skipped-and-notes',
    'share.present-link-excludes-skipped',
  ],
  text: 'Skipped slides and speaker notes stay out of the PDF, the PowerPoint file, the show and the view link unless the seller checks the box that includes them.',
};
