// The README paragraphs of docs/FOCUS.md section 7, one per feature of the core matrix, with the
// screenshot each feature shows. `docs/readme/what-works.mjs` renders the README section "What works
// today" from this file and the matrix (`docs/gslides-parity/focus/core-matrix.json`), so a feature's
// paragraph appears only while every row of that feature passes; the count of rows that hold a
// feature back is computed, never typed. Every paragraph below is the text of FOCUS.md section 7
// verbatim (`what-works.test.mjs` asserts it), so the specification and the README cannot drift.
// Node only; no dependency.

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
