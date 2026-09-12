# Google Slides editor surface: anatomy and positioning

Research report for the Turboslide Google Slides parity round. Written 2026-09-11. Every source
below was read on 2026-09-11 unless the entry says otherwise. The research used public help pages,
public articles, public product blog posts and two public PDF quick reference cards. No Google
account was signed in; the editor itself was not opened, so every position and label comes from a
document, and every number that is not documented is marked as an estimate or as unverified.

Scope: the editor screen of Google Slides on a desktop browser in its 2023 to 2026 form. The home
page with templates, the menu item trees, import and export dialogs and the presenter workflow have
their own reports in this folder; this report covers only what a user sees on the editor screen and
how those controls behave. Where a menu path is the only public evidence for a toolbar control the
path is given.

Conventions used here: labels are quoted exactly as the source spells them; "Google help" means a
page on support.google.com; "Workspace Updates" means workspaceupdates.googleblog.com. Icon
descriptions are in words only. The Heroicons name in parentheses is a suggestion for our
implementation with Heroicons 20 solid, not a description of Google's asset.

## 1. Layout diagram

The default state of a new presentation: nothing selected, the filmstrip in filmstrip view, the
speaker notes pane at its one line default, the Themes panel open on the right.

```
+------------------------------------------------------------------------------------------------+
| [app] Untitled presentation  [star] [folder] [cloud]          [clock] [comments] [Meet] [Record] |
|                                                               [Slideshow |v] [ Share ] (avatar) |
|  File  Edit  View  Insert  Format  Slide  Arrange  Tools  Extensions  Help          [Gemini]   |
+------------------------------------------------------------------------------------------------+
| [search] [+|v] [undo] [redo] [print] [paint] [Fit v] | [select] [T] [img v] [shape v] [line v]  |
|  [comment] | Background  Layout v  Theme  Transition                                      [^]   |
+--------------+-------------------------------------------------------------+-------------------+
| 1 [========] |                                                             | Themes         X  |
|   [thumb   ] |                                                             |                   |
| 2 [========] |            +-----------------------------------+            | In this pres. v   |
|   [thumb   ] |            |                                   |            | [theme][theme]    |
| 3 [========] |            |        16:9 slide canvas          |            | [theme][theme]    |
|   [thumb   ] |            |   (default zoom "Fit", rulers     |            | [theme][theme]    |
|              |            |    optional, guides optional)     |            |                   |
|              |            +-----------------------------------+            |                   |
|              |                                                             |                   |
|              |  . . . (drag handle)                                        |                   |
|              |  Click to add speaker notes                                 | [ Import theme ]  |
+--------------+-------------------------------------------------------------+-------------------+
| [filmstrip][grid]                                                          [side panel >]      |
+------------------------------------------------------------------------------------------------+
```

Reading order for the regions: title row (section 2), menu bar (section 3), toolbar (section 4),
filmstrip (section 5), canvas (section 6), speaker notes (section 7), right side panels (section 8),
bottom status (section 9), present mode (section 10), sizes (section 11), shortcuts (section 12).

The March 2023 refresh moved the status information (last edit, version history) behind one clock
icon in the top right and stated that "some features have been relocated to reduce clutter within
the new interface" with no change in functionality (Workspace Updates, 2023-03-06). The diagram
shows that layout. The CustomGuide quick reference card (2024 edition, screenshot of the pre-2023
chrome) labels the same regions: "Presentation name", "Menu bar", "Formatting toolbar", "Slide
navigation pane", "Active slide", "Slide notes", "Filmstrip view", "Grid view", "Explore", "Show
side panel", "Comment history", "Activity dashboard", "Start presentation", "Share settings",
"Google account".

## 2. Title row

The title row is the first row of the chrome. Items are listed left to right.

| Position | Item                          | Label or tooltip                              | Icon description                                                  | Behaviour                                                                                                                                                                                                                                 | Source                                                                                |
| -------- | ----------------------------- | --------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1        | App icon                      | none documented                               | The Slides product icon at the far left                           | Visible in every public screenshot; the click target behaviour is not documented publicly                                                                                                                                                 | CustomGuide card (screenshot)                                                         |
| 2        | Document title field          | "Untitled presentation" on a new file         | Plain text field                                                  | Click to rename; type and press Enter. The default name of a new file is "Untitled presentation"                                                                                                                                          | West Oahu handout (2:47); CustomGuide card "Rename a Presentation"                    |
| 3        | Star                          | "Star"                                        | Outline star                                                      | Toggles the file into the "Starred" section of Google Drive                                                                                                                                                                               | CustomGuide card "Star a Presentation"; West Oahu handout (3:05)                      |
| 4        | Move                          | "Move"                                        | Folder outline                                                    | Opens a folder picker to assign the file a location in Drive                                                                                                                                                                              | West Oahu handout (3:00 "Move icon. The folder icon to the right of the naming area") |
| 5        | Document status               | "See document status"                         | Cloud outline; a check mark inside when offline is ready          | Click to see "Saved to Drive", "Saving", or "Available offline" and why offline is unavailable when it is                                                                                                                                 | Google help 6388102                                                                   |
| 6        | Last edit and version history | "Last edit" (the clock icon since March 2023) | Clock outline                                                     | Opens version history: who made the last change and when; "Restore this version", "Name this version", "Make a copy"                                                                                                                      | Google help 190843; Workspace Updates 2023-03-06                                      |
| 7        | Comments history              | "Show all comments"                           | Speech bubble                                                     | Opens the comments panel with all threads, a search field, and notification settings                                                                                                                                                      | Google help 65129; CustomGuide card labels it "Comment history"                       |
| 8        | Meet                          | "Meet"                                        | Video camera                                                      | Dropdown lists scheduled meetings; "Join the call" brings the meeting into a side panel; "Just present this tab"; "Bring the call here"; "Use a meeting code". Requires Chrome or Edge                                                    | Google help 10540294                                                                  |
| 9        | Record                        | "Record"                                      | Not documented                                                    | New option "in the right-hand menu of Slides" since 2026-08-20, backed by Google Vids; the legacy recorder moved to "View > Slides Recording"                                                                                             | Workspace Updates 2026-08-20                                                          |
| 10       | Slideshow split button        | "Slideshow" with a "Down arrow"               | Filled triangle (play) with the label; a chevron for the dropdown | The main click starts presenting from the current slide. The arrow lists "Presenter view" and "Start from beginning"; Slidesgo also lists "Present on another screen". The button was renamed from "Present" to "Slideshow" on 2021-10-01 | Google help 1696787; Workspace Updates 2021-10-01; Slidesgo presenter view            |
| 11       | Share                         | "Share"                                       | Filled button with a padlock glyph in public screenshots          | Opens the share dialog: recipient field, "Viewer", "Commenter", "Editor", "General access" with "Restricted" or "Anyone with the link", "Copy link", "Send", "Done", a "Settings" gear, and a notify checkbox                             | Google help 2494822                                                                   |
| 12       | Account avatar                | account name on hover                         | Circular photo                                                    | Standard Google account menu                                                                                                                                                                                                              | CustomGuide card "Google account"                                                     |
| 13       | Ask Gemini                    | "Ask Gemini"                                  | Spark (four pointed star)                                         | Opens the Gemini side panel on the right: a prompt box at the bottom, "Suggested prompts", Gems. Only on eligible Workspace and Google AI plans                                                                                           | Google help 14207419; Workspace Updates 2024-06-24                                    |

Observations for the designer:

- The pre-2023 chrome also carried an "Activity dashboard" trend arrow icon in this row
  (CustomGuide card). The 2023 refresh consolidated status entry points, so the modern row has the
  clock icon instead; the dashboard lives under Tools.
- There is no save button anywhere. "All documents are automatically saved to the cloud as you
  type" (West Oahu handout, 3:20), and the cloud icon is the only save affordance.
- The title, star, move and cloud sit left; every collaboration and presenting control sits right.
  The Slideshow and Share buttons are the only filled buttons in the row.

## 3. Menu bar row

The menu bar is the second row, directly under the title. Ten menus in this order: File, Edit,
View, Insert, Format, Slide, Arrange, Tools, Extensions, Help (Computerworld 2025; BrightCarbon
2023). Older material shows "Add-ons" where "Extensions" now sits (Art of Presentations 2023;
CustomGuide card).

Menu access keys (Google help 1696717): File Alt+F, Edit Alt+E, View Alt+V, Insert Alt+I, Format
Alt+O, Tools Alt+T, Help Alt+H, Accessibility Alt+A on Windows and ChromeOS; on Mac the same letters
with Ctrl+Option. The context menu opens with Ctrl+Shift+\ or Shift+F10 (Mac Cmd+Shift+\). The menus
can be searched from the toolbar's first button (section 4) or with Alt+/ (Mac Option+/).

View menu items that control the editor surface, each confirmed by a public source:

| Item                                                                     | Effect                                                                                                              | Source                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| "Show ruler"                                                             | Shows rulers on the canvas edges                                                                                    | Google help 1696521                                      |
| "Guides" submenu                                                         | Show guides, add a vertical or horizontal guide, "Clear guides"; a guide is removed with right-click "Delete guide" | Google help 1696521                                      |
| "Snap to" submenu                                                        | "Guides" (on by default), "Grid"                                                                                    | Google help 1696521                                      |
| "Grid view"                                                              | Switches the editor to the thumbnail grid                                                                           | CustomGuide Change Views; Art of Presentations grid view |
| "Show speaker notes"                                                     | Shows or hides the notes pane; a check mark when visible                                                            | CustomGuide card; HowToGeek 2021                         |
| "Show filmstrip"                                                         | Shows or hides the filmstrip                                                                                        | Google help 1694830                                      |
| "Full screen"                                                            | "Hides the menu and toolbar"; Esc exits                                                                             | Google help 99753                                        |
| "Motion"                                                                 | Opens the Motion panel for transitions and animations                                                               | BrightCarbon 2023                                        |
| "Theme builder" (older label) or "Edit theme" (Slide menu, current help) | Opens the theme editor                                                                                              | BrightCarbon 2023; Google help 1705254                   |
| "Slides Recording"                                                       | The legacy recording feature moved here in August 2026                                                              | Workspace Updates 2026-08-20                             |

Menu content beyond View belongs to the menus report. Two structural facts matter for our menu bar:
the 2018 update moved text formatting into a "Text" submenu of Format, removed the Table menu into
Insert and Format, and put the four slide move commands into a "Move" submenu of Slide (Workspace
Updates 2018-03-07).

The menus and toolbar can be hidden together. The control is an upward chevron at the far right of
the toolbar row; hidden, it becomes a downward chevron in the top right corner (Art of
Presentations 2023; SlideEgg 2025). Google's shortcut list names the state "Compact mode",
Ctrl+Shift+F on every platform (Google help 1696717).

## 4. Toolbar row

The toolbar is the third row. Its head is fixed; its tail changes with the selection. "The toolbar
dynamically displays relevant tools based on selection" (BrightCarbon 2023). When the window is
too narrow the tail collapses into a "More" button with three dots (SlidesAI text guide, via search
snippet; also the standard behaviour in every public screenshot).

### 4.1 Default toolbar, nothing selected

Left to right. "Position" is the order attested by the sources listed; where two sources give the
same relative order the row says so. The head order "New slide", "New slide with layout", Undo,
Redo, Print, Paint format, Zoom is stated as a left to right walk by the West Oahu handout (3:45)
and by BrightCarbon (2023). The Workspace Learning Center cheat sheet walks the content buttons in
the order select, text box, image, shape, line, fill, border, link, comment, lists (Google Workspace
Learning Center 9300133). The tail "Background, layout, theme, and transition" is one group in the
West Oahu handout (4:23).

| Position | Label                                                                     | Icon description (Heroicons suggestion)                                             | Shortcut                                                                        | Context                                                                                                                                                    | Source                                                                                                                  |
| -------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1        | "Search the menus" (now called the tool finder; toolbar tooltip "Search") | Magnifying glass at the far left of the toolbar (MagnifyingGlassIcon)               | Alt+/ or Alt+Z; Mac Option+/                                                    | Always                                                                                                                                                     | Google help 13466905; chrmbook 2024 ("the magnifying glass located on the far left side of the toolbar")                |
| 2        | "New slide" with "New slide with layout" dropdown                         | Plus sign with a chevron to its right (PlusIcon, ChevronDownIcon)                   | Ctrl+M (Mac Ctrl+M)                                                             | Always                                                                                                                                                     | Google help 1694830; Google help 1696717                                                                                |
| 3        | "Undo"                                                                    | Curved arrow pointing left (ArrowUturnLeftIcon)                                     | Ctrl+Z; Mac Cmd+Z                                                               | Always                                                                                                                                                     | West Oahu handout; Google help 1696717                                                                                  |
| 4        | "Redo"                                                                    | Curved arrow pointing right (ArrowUturnRightIcon)                                   | Ctrl+Y or Ctrl+Shift+Z; Mac Cmd+Y                                               | Always                                                                                                                                                     | Same                                                                                                                    |
| 5        | "Print"                                                                   | Printer (PrinterIcon)                                                               | Ctrl+P; Mac Cmd+P                                                               | Always                                                                                                                                                     | West Oahu handout; CustomGuide card                                                                                     |
| 6        | "Paint format"                                                            | Paint roller (PaintBrushIcon)                                                       | Copy formatting Ctrl+Alt+C, paste formatting Ctrl+Alt+V; Mac Cmd+Option+C and V | Always; click once, then click the target                                                                                                                  | West Oahu handout (3:58); CustomGuide card; Google help 1696717                                                         |
| 7        | "Zoom" dropdown, shows "Fit" by default                                   | Text button reading "Fit" or a percentage with a chevron                            | Zoom in Ctrl+Alt+plus, zoom out Ctrl+Alt+minus, 100 percent Ctrl+0              | Always                                                                                                                                                     | Google help 99753 ("click Fit"); BrightCarbon 2023 (presets 50, 100, 200); CustomGuide card (Ctrl+Alt++ and Ctrl+Alt+-) |
| 8        | "Select"                                                                  | Mouse pointer arrow (CursorArrowRaysIcon or a plain arrow)                          | none                                                                            | Always; returns to the selection tool after a draw tool                                                                                                    | Workspace Learning Center 9300133 ("Select an item on a slide" is the first content control)                            |
| 9        | "Text box"                                                                | A capital T inside a box outline (a T glyph)                                        | none                                                                            | Always; click then drag on the canvas to draw the box                                                                                                      | CustomGuide card ("click the Text box button on the formatting toolbar. Click and drag to draw the text box")           |
| 10       | "Insert image" dropdown                                                   | Landscape picture with a chevron (PhotoIcon)                                        | none                                                                            | Always. Items: "Upload from computer", "Search the web", "Drive", "Photos", "By URL", "Camera"                                                             | Slidesgo insert crop mask; CustomGuide card ("Image")                                                                   |
| 11       | "Insert shape" dropdown                                                   | Circle over a square with a chevron (Square2StackIcon or a circle and square glyph) | none                                                                            | Always. Opens categories, then a shape grid; click and drag to place                                                                                       | CustomGuide card ("select a shape category, and select a shape"); Google help 1696521                                   |
| 12       | "Insert line" dropdown                                                    | Diagonal line with a chevron (MinusIcon rotated, or a slash)                        | none                                                                            | Always. Types: "Line", "Elbow Connector", "Curved Connector", "Arrow", "Curve", "Polyline", "Scribble"                                                     | Google help 179740 (drawing tools); Google help 1696521                                                                 |
| 13       | "Insert comment"                                                          | Speech bubble with a plus (ChatBubbleLeftIcon)                                      | Ctrl+Alt+M; Mac Cmd+Option+M                                                    | Always                                                                                                                                                     | Workspace Learning Center 9300133; Google help 1696717                                                                  |
| 14       | "Background"                                                              | Text button                                                                         | none                                                                            | Nothing selected. Opens the Background dialog: "Color", "Image" with "Choose", "Add to theme", "Done"                                                      | Google help 1705254; West Oahu handout (4:23)                                                                           |
| 15       | "Layout" dropdown                                                         | Text button with a chevron                                                          | none                                                                            | Nothing selected. Opens the layout grid of the current theme; applies to the selected slides                                                               | Google help 1705254 ("click Layout in the toolbar")                                                                     |
| 16       | "Theme"                                                                   | Text button                                                                         | none                                                                            | Nothing selected. Opens the Themes panel on the right                                                                                                      | CustomGuide card ("click the Theme button on the formatting toolbar, and select a theme in the pane at the right")      |
| 17       | "Transition"                                                              | Text button                                                                         | none                                                                            | Nothing selected. Opens the Motion panel with a "Transition type" list                                                                                     | CustomGuide card; BrightCarbon 2023                                                                                     |
| 18       | "Templates"                                                               | Not documented                                                                      | none                                                                            | Added 2024-11-07; also "Insert > Templates". Opens a side panel of designed slide sets to insert all or some slides. Exact toolbar position not documented | Workspace Updates 2024-11-07                                                                                            |
| 19       | "Help me visualize"                                                       | Not documented                                                                      | none                                                                            | Gemini plans only; "tap the Help me visualize icon in the toolbar" or "Insert > Image > Help me visualize". Exact position not documented                  | Workspace Updates 2023-08-29; Google help 13951829                                                                      |
| 20       | Hide the menus                                                            | Upward chevron at the far right (ChevronUpIcon)                                     | Ctrl+Shift+F ("Compact mode")                                                   | Always                                                                                                                                                     | Art of Presentations 2023; Google help 1696717                                                                          |

Separators: public screenshots show thin vertical dividers after Zoom, after Insert comment and
before Background. The exact divider set is not documented and is listed in section 13.

### 4.2 Contextual toolbar when a text box or placeholder is selected

The head (positions 1 to 8) stays. Positions 9 to 13 are replaced by the object controls and the
text controls. Order attested by Baz Roberts (2016, still the same set), Slidesgo (text formatting
tutorial), the CustomGuide card and the Google shortcut list. Border controls appear before the font
controls because the same four buttons head the shape toolbar (section 4.3), and the Workspace cheat
sheet lists fill and border before links, comments and lists.

| Position | Label                               | Icon description (Heroicons suggestion)                                                                                            | Shortcut                                                | Context                                                          | Source                                                                                   |
| -------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 9        | "Fill color"                        | Paint bucket with a color bar under it                                                                                             | none                                                    | Text box, shape, table cell                                      | SlidesAI border guide; Baz Roberts tables                                                |
| 10       | "Border color"                      | Pen nib with a color bar                                                                                                           | none                                                    | Text box, shape, image, table                                    | SlidesAI; Google help 4600160                                                            |
| 11       | "Border weight"                     | Three horizontal lines of increasing thickness                                                                                     | none                                                    | Same                                                             | SlidesAI; Baz Roberts                                                                    |
| 12       | "Border dash"                       | Dashed line                                                                                                                        | none                                                    | Same; "immediately to the right of Border weight"                | SlidesAI                                                                                 |
| 13       | "Font" dropdown                     | Text button showing the font name, with "More fonts" at the top of its list                                                        | none                                                    | Text                                                             | Slidesgo text formatting; Baz Roberts                                                    |
| 14       | "Font size" with a minus and a plus | Number field between a minus and a plus glyph                                                                                      | Ctrl+Shift+period increases, Ctrl+Shift+comma decreases | Text                                                             | Slidesgo; Google help 1696717                                                            |
| 15       | "Bold"                              | Bold B                                                                                                                             | Ctrl+B                                                  | Text                                                             | Slidesgo; Google help 1696717                                                            |
| 16       | "Italic"                            | Italic I                                                                                                                           | Ctrl+I                                                  | Text                                                             | Same                                                                                     |
| 17       | "Underline"                         | Underlined U                                                                                                                       | Ctrl+U                                                  | Text                                                             | Same                                                                                     |
| 18       | "Text color"                        | Capital A over a color bar                                                                                                         | none                                                    | Text                                                             | Slidesgo ("Text Color"); CustomGuide card                                                |
| 19       | "Highlight color"                   | Marker pen over a color bar                                                                                                        | none                                                    | Text                                                             | Slidesgo ("Highlight Color")                                                             |
| 20       | "Insert link"                       | Chain link (LinkIcon)                                                                                                              | Ctrl+K                                                  | Text or object                                                   | CustomGuide card; Google help 1696717                                                    |
| 21       | "Insert comment"                    | Speech bubble with a plus                                                                                                          | Ctrl+Alt+M                                              | Always                                                           | Workspace Learning Center                                                                |
| 22       | "Align" dropdown                    | Four horizontal lines with a chevron; the popover has two rows: "Left", "Center", "Right", "Justify" and "Top", "Middle", "Bottom" | Ctrl+Shift+L, E, R, J                                   | Text                                                             | Slidesgo; Google help 1696717                                                            |
| 23       | "Line & paragraph spacing" dropdown | Vertical arrow beside three lines; options "Single", "1.15", "1.5", "Double", custom spacing                                       | none                                                    | Text                                                             | Slidesgo ("Line Spacing" values)                                                         |
| 24       | "Bulleted list" dropdown            | Three dots with lines, plus a chevron for list styles                                                                              | Ctrl+Shift+8                                            | Text                                                             | CustomGuide card; Google help 1696717                                                    |
| 25       | "Numbered list" dropdown            | 1 2 3 with lines, plus a chevron                                                                                                   | Ctrl+Shift+7                                            | Text                                                             | Same                                                                                     |
| 26       | "Decrease indent"                   | Lines with a left arrow                                                                                                            | Ctrl+[                                                  | Text                                                             | Google help 1696717                                                                      |
| 27       | "Increase indent"                   | Lines with a right arrow                                                                                                           | Ctrl+]                                                  | Text                                                             | Same                                                                                     |
| 28       | "Clear formatting"                  | Crossed out T                                                                                                                      | Ctrl+\ (Mac Cmd+\)                                      | Text                                                             | Slidesgo; Google help 1696717                                                            |
| 29       | "Format options"                    | Text button at the end of the tail                                                                                                 | none                                                    | Any selected object; opens the Format options panel on the right | CustomGuide card ("Select an object and click Format options on the formatting toolbar") |

Also present on Gemini plans: a refine icon appears when a text box is selected, with presets
"rephrase", "shorten", "formalize", "bulletize" and a custom prompt (Workspace Updates 2025-09-05).
Its exact position (toolbar or canvas) is not documented.

### 4.3 Shape selected

Positions 9 to 12 as in 4.2 ("Fill color", "Border color", "Border weight", "Border dash"), then
the text controls (a shape holds text), then "Format options". Fill color offers "Transparent" for
outline only shapes (SlidesAI shape color guide). The Border color and Border weight buttons "only
appear when an image, shape, or text box is selected" (SlidePeak, via search snippet).

### 4.4 Image selected

| Position | Label                                             | Icon description                                                  | Shortcut                       | Context                                                                                     | Source                                                          |
| -------- | ------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 9        | "Border color"                                    | Pen nib with a color bar                                          | none                           | Image                                                                                       | Google help 4600160; BrightCarbon image editing                 |
| 10       | "Border weight"                                   | Three lines                                                       | none                           | Image                                                                                       | BrightCarbon image editing                                      |
| 11       | "Border dash"                                     | Dashed line                                                       | none                           | Image                                                                                       | SlideUpLift border guide (search snippet)                       |
| 12       | "Crop image" with a "Down arrow" for "Mask image" | Two crossed corner brackets; the arrow opens the shape categories | Enter exits crop mode          | Image                                                                                       | Google help 4600160; Slidesgo insert crop mask                  |
| 13       | "Replace image" dropdown                          | Picture with a swap arrow                                         | none                           | Image; same sources as Insert image                                                         | ComputerCity (right-click "Replace image"); Google help 4600160 |
| 14       | "Image options"                                   | Text button                                                       | Alt text inside it: Ctrl+Alt+Y | Image; opens the Format options panel on the image sections, and "Image options > Alt text" | Google help 6199477                                             |
| 15       | "Reset image"                                     | Picture with a circular arrow                                     | none                           | Image; restores the original crop, mask and adjustments                                     | Google help 4600160; Slidesgo                                   |
| 16       | "Format options"                                  | Text button                                                       | none                           | Image                                                                                       | CustomGuide card                                                |

Mask shapes reuse the shape categories of the Insert shape dropdown (Slidesgo: "Select the shape
that you want the mask to have"). On Gemini plans the right-click menu also carries "Edit image"
with "Replace background" and an expand option (Workspace Updates 2025-08-13).

### 4.5 Line selected

"Line color", "Line weight", "Line dash", "Line start", "Line end" (Technology Accent, Docs drawing
toolbar, the same control set as Slides; Google help 179740 names "fill color, line color, line
thickness, or border/line style"). The head stays; "Format options" closes the tail.

### 4.6 Table selected

"Border color", "Border weight", "Border dash" and "Fill color", plus the text controls and the
"Align" dropdown with vertical alignment (Baz Roberts 2016; SlideUpLift and Vegaslide via search
snippets). The right-click menu on a table carries "Insert row above", "Insert row below", "Insert
column left", "Insert column right", "Delete row", "Delete column", "Merge cells", "Format options"
(Baz Roberts 2016); "Distribute rows" and "Distribute columns" live in the Format menu since the
Table menu was removed (Workspace Updates 2018-03-07).

## 5. Filmstrip

The filmstrip is the left column. Google's help calls it "the left panel" and its own shortcut list
calls it the "filmstrip"; the CustomGuide card calls it the "Slide navigation pane".

Contents and behaviour:

- One thumbnail per slide, stacked vertically, each with its slide number to the left of the
  thumbnail (CustomGuide screenshot; Computerworld 2025 "thumbnails of all the slides").
- The current slide is outlined; the card labels it "Active slide". In the pre-2023 screenshot the
  outline is orange. The current outline color is not documented (section 13).
- Multi-select: "hold the Shift key and click them" for a range (Google help 1694830); "use
  Ctrl+click for multiple selections" (Workspace Learning Center 9300133). Keyboard: Shift+Up,
  Shift+Down, Shift+Home, Shift+End extend the selection (Google help 1696717).
- Reorder: "Drag the slide or slides where you want them" (Google help 1694830). Keyboard: Ctrl+Up
  and Ctrl+Down move a slide, Ctrl+Shift+Up and Ctrl+Shift+Down move it to the start or end
  (Google help 1696717; Mac uses Cmd).
- Delete: select and press Delete or Backspace (Google help 1694830).
- Skip: right-click and "Skip Slide"; repeat to show again. A skipped thumbnail is greyed with a
  crossed out eye icon (Alice Keeler 2017-11-08; Google help 1694830). Skipped slides do not show
  in the slideshow.
- Right-click menu, in the order Alice Keeler recorded in 2017: "Paste", "Duplicate Slide" (Ctrl+D),
  "Skip Slide", "Change Background", "Apply Layout" (pop-out of layouts), "Change Theme", "Change
  Transition", "Move Slide to Beginning" (and the other move commands), "Comment", "Save to Keep
  Notepad". The Workspace cheat sheet confirms right-click "Delete slide" and "Duplicate slide"
  today, and "New slide" appears in modern screenshots. The current exact list and order are in
  section 13.
- Focus: Ctrl+Alt+Shift+F moves keyboard focus to the filmstrip, Ctrl+Alt+Shift+C back to the canvas
  (Google help 1696717). Up, Down, Page Up, Page Down, Home and End move between slides.
- View toggle: the bottom left corner of the window holds two icons, "filmstrip view" and "grid
  view" (Google help 1694830; CustomGuide card "Filmstrip view", "Grid view").
- Grid view: a grid of larger thumbnails replaces the canvas; drag to reorder, right-click for the
  slide commands, double-click a slide to return to filmstrip view (CustomGuide Change Views; Art of
  Presentations). In grid view a minus and plus beside a magnifying glass at the bottom change the
  thumbnail size (Art of Presentations). Art of Presentations quotes Ctrl+Alt+1 as a shortcut; it is
  not in Google's list (section 13).
- Collapse: "The filmstrip in Google Slides is now collapsable" since 2021-12-17 (Workspace
  Updates); "View > Show filmstrip" toggles it (Google help 1694830). Collapsed, the canvas takes
  the full width.
- Slide numbers on the slides themselves are a separate feature: "Insert > Slide numbers", "Apply"
  or "Apply to selected", with a "Skip title slides" option (Google help 1694830).

## 6. Canvas

- Aspect: the default page is 16:9, 25.4 by 14.29 cm (BrightCarbon 2023; "File > Page setup").
- Default zoom is "Fit": "To make the canvas as wide as the browser window, click Fit" (Google help
  99753). Typed zoom accepts 25 to 1600 (same page). Presets 50, 100 and 200 percent (BrightCarbon
  2023). Zoom is per user: "When you change your view, it doesn't change for anyone else looking at
  the file" (Google help 99753).
- Rulers: "View > Show ruler" (Google help 1696521). Rulers run along the top and left edges
  (BrightCarbon 2023).
- Guides: "View > Guides", pick an option, then drag the guide into place; right-click a guide for
  "Delete guide"; "View > Guides > Clear guides" (Google help 1696521). Guides can also be defined
  in the theme editor (BrightCarbon 2023).
- Snapping: "Snap to Guides" is on by default and draws colored lines showing what the object
  aligns with; "Snap to Grid" is off and turns on at "View > Snap to > Grid" (Google help 1696521).
  BrightCarbon describes the alignment lines as red (2023). Snapping to other objects is shown by
  the same lines; a separate "Objects" entry is not confirmed (section 13).
- Selection: a blue border with square handles at the corners and edge midpoints; corner handles
  keep the aspect ratio while Shift is held; a circular rotation handle floats above the object;
  Shift locks rotation to 15 degree steps (BrightCarbon 2023; SlideEgg 2026).
- Keyboard nudge: arrow keys move "1 pixel", Shift+arrow "a larger distance" since 2025-08-19
  (Workspace Updates). Rotation: Alt+Shift+Left or Right for 1 degree, Alt+Left or Right for 15
  degrees. Resize: Ctrl+Alt+B, I, J, K, W and 9 (Google help 1696717).
- Tab and Shift+Tab select the next and previous shape (Google help 1696717).
- Arrange: the Arrange menu carries "Order", "Align", "Distribute", "Center on page", "Rotate",
  "Group" (Google help 1696521). Shortcuts: Ctrl+Alt+G group, Ctrl+Alt+Shift+G ungroup, Ctrl+Up and
  Ctrl+Down one step forward or backward, Ctrl+Shift+Up and Down to front or back (Google help
  1696717). Note that Ctrl+Up and Down move slides when the filmstrip has focus and reorder objects
  when the canvas has focus.
- Size and position live in "Format > Format options > Size & Position" with "Lock aspect ratio"
  (Google help 1696521).
- Text fitting: "Do not autofit", "Shrink text on overflow", "Resize shape to fit text".
  Placeholders default to shrink on overflow; new text boxes default to resize the shape. An icon
  appears next to a new text box for direct access to the setting; the setting also lives in the
  "Text fitting" section of Format options (Google help 10364036).
- Alt text: "Image options > Alt text", or Ctrl+Alt+Y (Mac Cmd+Option+Y); a description field, and
  "Advanced options" for a title (Google help 6199477).
- Crop mode: drag the blue squares on the border; Enter or a click elsewhere finishes (Google help
  4600160).
- Resize cursors: not documented in any public source read (section 13).
- Right-click on an object: public sources name "Reset image", "Replace image", "Format options",
  "Alt text", "Edit image" (Gemini plans) and the standard cut, copy, paste, delete, duplicate,
  order and align commands; the full list is in the menus report.

## 7. Speaker notes pane

- Sits under the canvas, full canvas width. Placeholder text: "Click to add speaker notes"
  (Computerworld 2025).
- Resize by dragging the divider: "Drag up using the three dots at the bottom to resize the Speaker
  Notes section as you please"; double-click the dots to toggle; drag down until it vanishes to
  hide it (HowToGeek 2021-10-01). BrightCarbon describes the same divider as a horizontal bar whose
  cursor becomes a hand.
- Show and hide: "View > Show speaker notes" (CustomGuide card); shortcut Ctrl+Alt+Shift+S opens
  the notes panel (Google help 1696717).
- Notes take the text toolbar: "Change the font style or size, apply color, bold, or italics, or use
  a numbered or bulleted list" (HowToGeek 2021).
- Default height: not documented (section 13). In the CustomGuide screenshot the pane is one text
  line tall, about one twentieth of the window height.

## 8. Right side

### 8.1 Themes panel

Opens from the "Theme" toolbar button or "Slide > Change theme" on the right side of the window
(Google help 1705254; Slidesgo themes tutorial). It shows the built in themes as thumbnails, an
"In this presentation" dropdown for the themes already in the file, an "Import theme" button at the
bottom right, and an X at the top to close (Slidesgo themes tutorial; Google help 1705254).
Import accepts "A Google Slide or PowerPoint presentation" (Google help 1705254). The chromeschool
lesson describes the "Themes Pane" on the right side of a new file; no public source read states
in so many words that it opens automatically for a new presentation (section 13).

### 8.2 Format options panel

Opens from the "Format options" toolbar button, the right-click menu, or "Format > Format options".
Sections named by public sources: "Size & Rotation" (with corner radius for images), "Position",
"Text fitting", "Drop shadow" (blur radius, color, transparency), "Reflection", "Recolor",
"Adjustments" ("Transparency", "Brightness", "Contrast"), "Alt text" (West Oahu handout 10:47;
ComputerCity; BrightCarbon image editing; Google help 4600160 and 10364036). Google help 1696521
calls the first section "Size & Position" with "Lock aspect ratio". Section order is not documented.

### 8.3 Motion panel

Opens from the "Transition" toolbar button or "View > Motion". Holds the slide transition with a
"Transition type" list and duration, "Apply to all slides", and the object animations with a
"Delete" button per animation (CustomGuide card; BrightCarbon 2023). Ctrl+Alt+Shift+B opens it
(Google help 1696717 "Open animations panel"). Section labels inside the panel are not documented.

### 8.4 Templates panel

From the toolbar "Templates" button or "Insert > Templates" since 2024-11-07: browse a collection,
insert all slides or some (Workspace Updates 2024-11-07). English (United States) only at launch.

### 8.5 Gemini side panel and Help me visualize

"Ask Gemini" (spark button, top right) opens the side panel with a prompt box at the bottom,
"Suggested prompts", Gems, and since 2026 "Create" and "Enhance this slide" (Google help 14207419;
Workspace Updates 2025-07-02 and 2026-04-01). "Help me visualize" opens as a right panel from
"Insert > Help me visualize > Image" or a toolbar icon, with a prompt, "Add a style", aspect ratio
(1:1, 16:9, 9:16), "Create", "Insert", and since 2025-11-20 "Infographic", "Images", "Beautify this
slide" (Google help 13951829; Workspace Updates 2023-08-29 and 2025-11-20). "Beautify this slide"
is also a Slide menu item (Workspace Updates 2026-04-01). None of this exists on plans without
Gemini, and Turboslide has no equivalent to mirror.

### 8.6 Explore (retired)

Explore was a star shaped button in the bottom right corner, shortcut Ctrl+Alt+Shift+I, and was
discontinued on 2024-01-30; Google pointed users to the tool finder and to "@" content (Alice Keeler
2023-03-24, updated 2024-10-15; chrmbook 2024-03-18). Google's shortcut page still lists "Open
Explore". Do not build an Explore button.

### 8.7 Side panel of companion apps

A narrow strip on the right edge holds Calendar, Keep and Tasks since 2018-08-22 (Workspace Updates
2018-08-22); a "Show side panel" chevron at the bottom right opens and closes the strip (CustomGuide
card). Contacts and Maps joined later; their dates were not verified (section 13). Ctrl+Alt+period
and comma move focus to the side panel (Google help 1696717 "Go to side panel"). Add-ons from the
Extensions menu open in the same strip.

### 8.8 Comments and version history panels

"Show all comments" opens the comments panel on the right (Google help 65129). Version history
replaces the whole editor with a read only view and a right column of versions, "Restore this
version", "Name this version" (up to 40 named versions), "Make a copy", "Expand" for grouped
versions (Google help 190843); Ctrl+Alt+Shift+H (Google help 1696717).

## 9. Bottom status

- Bottom left: the filmstrip view and grid view toggle (Google help 1694830). In grid view a
  magnifying glass with minus and plus sets thumbnail size (Art of Presentations).
- Bottom right: formerly the Explore star (retired 2024-01-30) and the "Show side panel" chevron
  (CustomGuide card). In present mode the bottom left holds the presenter toolbar (section 10).
- The offline check mark appears "in the bottom left corner" of a file tile in Drive, not in the
  editor (Google help 6388102).
- There is no status text, no zoom slider and no page counter in the editor's bottom edge.

## 10. Present mode and presenter view

Present mode (the "Slideshow" button, Ctrl+F5 on Windows and ChromeOS, Cmd+Enter on Mac):

- The slide fills the browser tab or the screen. A presenter toolbar appears at the bottom left when
  the mouse enters a reduced trigger zone (Workspace Updates 2021-03-15). Its controls: previous and
  next slide, a slide picker showing the slide number, and a three dot overflow menu (Workspace
  Updates 2021-03-15; Slidesgo presenter view).
- Three dot menu items named by public sources: "Open speaker notes", "Turn on the laser pointer",
  "Turn on the pen" (Google help spells it "Enable pen tool"), "Auto-play", "Captions preferences",
  "Q&A", "Full screen", "Exit", and a "More" group with "Download" (PDF or PPTX) and "Print" (Slidesgo
  presenter view; Google help 1696787; Workspace Updates 2023-08-10). The pen offers colors,
  "Erase" and "Erase all"; annotations disappear when the slideshow ends (Google help 1696787).
- Keys while presenting: Right and Left arrows, number then Enter, Home, End, s for speaker notes,
  a for audience tools, l for the laser pointer, b or period for a black slide, w or comma for a
  white slide, Ctrl+Shift+C for captions, F11 (Mac Cmd+Shift+F) for full screen, Ctrl+P to print,
  Esc to stop (Google help 1696717).
- Video keys: k play or pause, u and o seek 10 seconds, Shift+comma and Shift+period frame step,
  Ctrl+Shift+comma and period playback rate, Shift+0 to 9 seek, c captions, f full screen, m mute
  (Google help 1696717).

Presenter view (the arrow next to Slideshow, "Presenter view"):

- A separate window. Left column: a timer with "Pause" and "Reset", a slide list dropdown, the
  current slide preview, previous and next previews, the speaker notes with plus and minus font
  size buttons. Right side: an "Audience Tools" tab with Q&A ("Start new", "Continue recent", an
  on and off switch, a shareable link, vote thumbs, present or hide a question) (BrightCarbon
  2021-08-04; CustomGuide card).
- Speaker notes and thumbnails are resizable by dragging the separator between them (Workspace
  Updates 2019-06-18).
- Since 2023-01-12 a speaker notes button also sits in the presenting controls inside Google Meet
  (Workspace Updates 2023-01-12).

## 11. Sizes and positions

Google publishes no pixel sizes for the editor chrome. The following are the facts that can be
stated and the estimates that a designer can use, each labelled.

Documented:

- Slide page: 25.4 by 14.29 cm, 16:9 (BrightCarbon 2023). Slides API units place this at 9144000
  by 5143500 EMU (the API is out of scope here; the ratio is what matters).
- Zoom: "Fit" default, 25 to 1600 typed (Google help 99753), presets 50, 100, 200 (BrightCarbon).
- Nudge: 1 pixel per arrow key (Workspace Updates 2025-08-19). Rotation steps 1 and 15 degrees
  (Google help 1696717).
- Named versions: 40 per presentation (Google help 190843).

Estimated from the CustomGuide card screenshot (pre-2023 chrome at a small scale; treat as
proportions, not pixels):

- Title row, menu bar and toolbar together take about 12 to 14 percent of the window height; the
  three rows are roughly 40, 24 and 40 pixels at a 1440 by 900 window if that proportion holds.
- The filmstrip takes about one fifth of the window width, which is about 200 to 280 pixels at 1440
  wide, with the slide number gutter on the left and a 16:9 thumbnail filling the rest.
- The speaker notes pane at its default takes about one twentieth of the window height, one text
  line plus padding.
- The Themes panel, when open, takes about the same width as the filmstrip.

These proportions match the chrome package's current values in Turboslide (section 14) closely
enough that the redesign is a relabelling and reordering job rather than a resize.

## 12. Keyboard shortcuts relevant to the surface

From Google help 1696717 (Windows and ChromeOS first, Mac in parentheses where it differs). Text
formatting and comment shortcuts appear in section 4.2 and the presenting keys in section 10.

| Action                                            | Shortcut                                                 |
| ------------------------------------------------- | -------------------------------------------------------- |
| New slide                                         | Ctrl+M                                                   |
| Duplicate slide or object                         | Ctrl+D (Cmd+D)                                           |
| Undo, Redo                                        | Ctrl+Z; Ctrl+Y or Ctrl+Shift+Z                           |
| Copy, cut, paste                                  | Ctrl+C, Ctrl+X, Ctrl+V                                   |
| Copy and paste formatting                         | Ctrl+Alt+C, Ctrl+Alt+V (Cmd+Option)                      |
| Insert or edit link, open link                    | Ctrl+K; Alt+Enter (Option+Enter)                         |
| Find, find and replace, find again, find previous | Ctrl+F; Ctrl+H (Cmd+Shift+H); Ctrl+G; Ctrl+Shift+G       |
| Open, print, save                                 | Ctrl+O, Ctrl+P, Ctrl+S                                   |
| Show shortcuts                                    | Ctrl+/ (Cmd+/)                                           |
| Tool finder                                       | Alt+/ or Alt+Z (Option+/)                                |
| Compact mode (hide menus)                         | Ctrl+Shift+F                                             |
| Captions while presenting                         | Ctrl+Shift+C                                             |
| Alt text                                          | Ctrl+Alt+Y (Cmd+Option+Y)                                |
| Zoom in, zoom out, zoom 100 percent               | Ctrl+Alt+plus, Ctrl+Alt+minus (CustomGuide card); Ctrl+0 |
| Move focus to filmstrip, to canvas                | Ctrl+Alt+Shift+F, Ctrl+Alt+Shift+C                       |
| Open speaker notes panel                          | Ctrl+Alt+Shift+S                                         |
| HTML view                                         | Ctrl+Alt+Shift+P                                         |
| Open animations panel                             | Ctrl+Alt+Shift+B                                         |
| Go to side panel                                  | Ctrl+Alt+period or comma                                 |
| Revision history                                  | Ctrl+Alt+Shift+H                                         |
| Present, exit mode                                | Ctrl+F5 (Cmd+Enter); Esc                                 |
| Filmstrip: previous, next, first, last            | Up or Page Up, Down or Page Down, Home, End              |
| Filmstrip: move slide up, down, to start, to end  | Ctrl+Up, Ctrl+Down, Ctrl+Shift+Up, Ctrl+Shift+Down       |
| Filmstrip: extend selection                       | Shift+Up, Shift+Down, Shift+Home, Shift+End              |
| Objects: group, ungroup                           | Ctrl+Alt+G, Ctrl+Alt+Shift+G                             |
| Objects: backward, forward, to back, to front     | Ctrl+Down, Ctrl+Up, Ctrl+Shift+Down, Ctrl+Shift+Up       |
| Objects: next, previous                           | Tab, Shift+Tab                                           |
| Objects: nudge, nudge larger                      | Arrow keys, Shift+arrow keys                             |
| Objects: rotate 1 degree, 15 degrees              | Alt+Shift+Left or Right; Alt+Left or Right               |
| Objects: resize                                   | Ctrl+Alt+B, I, J, K, W, 9                                |
| Exit crop mode                                    | Enter                                                    |
| Context menu                                      | Ctrl+Shift+\ or Shift+F10                                |
| Menus                                             | Alt+F, E, V, I, O, T, H, A (Ctrl+Option on Mac)          |

## 13. Claims that could not be verified from a public source

- The exact left to right order of the default toolbar between "Zoom" and "Background" (Select,
  Text box, Image, Shape, Line, Comment): the relative order is supported by the Workspace cheat
  sheet and every screenshot seen, but no source states it as a list.
- The positions of the "Templates" button (2024) and the "Help me visualize" icon in the toolbar.
- The set and positions of the vertical dividers in the toolbar.
- The exact label "Line & paragraph spacing" in Slides (Slidesgo says "Line Spacing").
- The current outline color of the active slide thumbnail in the filmstrip (orange in the pre-2023
  screenshot).
- The current exact contents and order of the filmstrip right-click menu (the 2017 list is the only
  itemised public source; "Delete slide" and "New slide" are confirmed only as commands).
- Ctrl+Alt+1 as a grid view shortcut (Art of Presentations; absent from Google's list).
- A "Snap to > Objects" menu entry as distinct from guides.
- Whether the Themes panel opens automatically for a new presentation (widely reported in tutorials
  by implication; no sentence found that states it).
- Resize cursor shapes on the selection handles.
- Pixel sizes of the title row, menu bar, toolbar, filmstrip and speaker notes pane; only the
  proportions in section 11 are available.
- The "Slideshow" dropdown's third item: Slidesgo lists "Present on another screen"; Google's page
  names only "Presenter view" and "Start from beginning".
- Zoom shortcut: Google's page as fetched reads Ctrl+plus and Ctrl+minus, CustomGuide and
  BrightCarbon read Ctrl+Alt+plus and Ctrl+Alt+minus; the page should be reread in a browser.
- Which companion apps beyond Calendar, Keep and Tasks sit in the side panel strip today (Contacts
  and Maps are remembered, not sourced).
- The exact placement of the 2026 "Record" option relative to Slideshow and Share.
- The padlock glyph on the Share button and the click behaviour of the app icon.
- The Material 3 styling details of the 2023 refresh (a rounded toolbar container on a tinted page
  background); the blog post describes the reorganisation, not the styling.

## 14. Where Turboslide stands today against this surface

From the code in `packages/chrome/src` at commit 8c7056c:

- `Toolbar.tsx` renders one row: Edit and View mode segments, Editing, Twin, Lint and Source
  toggles, a Search button, Previous and Next with a "Go to a slide by number" field, a View menu,
  a theme button, Present, Fullscreen, Copy link and Help. Controls are 32 px tall (`Toolbar.css`),
  labels collapse in tiers when the bar is narrow.
- `Sidebar.tsx` is the filmstrip with thumbnail and outline densities; the panel is
  `min(84vw, 300px)` wide with a 208 px outline width (`Sidebar.css`), a 40 px head and 28 px
  outline rows.
- `ViewerShell.tsx` composes `Sidebar`, `Toolbar`, the stage wrapper and `HelpCard`, with panels
  (Inspector, History, Versions, Lint, Source drawer) on the right.
- There is no title row, no menu bar, no contextual toolbar tail, no speaker notes pane, no grid
  view toggle in the bottom left and no Themes panel.

The gap to Google Slides is therefore structural rather than dimensional: add the title row, the
ten menu headers, the fixed toolbar head and contextual tails in the orders of section 4, the
speaker notes pane, the bottom left view toggle and the right side panels; move Lint, Source,
Twin, versions and leases out of the default view. The sizes already in the chrome package are
within the proportions of section 11.

## 15. Sources

All read on 2026-09-11.

Google help and Google product pages:

- Keyboard shortcuts for Google Slides (computer): https://support.google.com/docs/answer/1696717?hl=en&co=GENIE.Platform%3DDesktop
- Tool finder for Docs, Sheets, Slides and Vids: https://support.google.com/docs/answer/13466905?hl=en
- Add, delete and organize slides: https://support.google.com/docs/answer/1694830?hl=en&co=GENIE.Platform%3DDesktop
- Crop and adjust images: https://support.google.com/docs/answer/4600160?hl=en&co=GENIE.Platform%3DDesktop
- Zoom or change your document view: https://support.google.com/docs/answer/99753?hl=en&co=GENIE.Platform%3DDesktop
- Present slides: https://support.google.com/docs/answer/1696787?hl=en&co=GENIE.Platform%3DDesktop
- Insert and arrange text, shapes, diagrams and lines: https://support.google.com/docs/answer/1696521?hl=en&co=GENIE.Platform%3DDesktop
- Use a template or change the theme, background or layout: https://support.google.com/docs/answer/1705254?hl=en&co=GENIE.Platform%3DDesktop
- Change how text fits in placeholders and text boxes: https://support.google.com/docs/answer/10364036?hl=en
- Use Google Meet with Docs, Sheets and Slides: https://support.google.com/docs/answer/10540294?hl=en
- Collaborate with Gemini in Google Slides: https://support.google.com/docs/answer/14207419?hl=en
- Help me visualize in Google Slides: https://support.google.com/docs/answer/13951829?hl=en
- See what has changed in a file (version history): https://support.google.com/docs/answer/190843?hl=en&co=GENIE.Platform%3DDesktop
- Use comments, action items and emoji reactions: https://support.google.com/docs/answer/65129?hl=en&co=GENIE.Platform%3DDesktop
- Work on Docs, Sheets and Slides offline (document status): https://support.google.com/docs/answer/6388102?hl=en&co=GENIE.Platform%3DDesktop
- Share files (Share dialog): https://support.google.com/docs/answer/2494822?hl=en&co=GENIE.Platform%3DDesktop
- Make your document or presentation more accessible (alt text): https://support.google.com/docs/answer/6199477?hl=en&co=GENIE.Platform%3DDesktop
- Draw in Google Docs (line types): https://support.google.com/docs/answer/179740?hl=en&co=GENIE.Platform%3DDesktop
- Google Slides cheat sheet, Workspace Learning Center: https://support.google.com/a/users/answer/9300133?hl=en
- Google Slides training landing page: https://support.google.com/a/users/answer/9282488
- Get started with Slides: https://support.google.com/a/users/answer/9313043?hl=en

Workspace Updates blog:

- Refreshed interface for Drive, Docs, Sheets and Slides (2023-03-06): http://workspaceupdates.googleblog.com/2023/03/refreshed-ui-google-drive-docs-sheets-slides.html
- Use the Slideshow button (2021-10-01): http://workspaceupdates.googleblog.com/2021/10/use-slideshow-button-in-google-slides.html
- Improved presenter toolbar (2021-03-15): http://workspaceupdates.googleblog.com/2021/03/improved-presenter-toolbar-in-google-slides.html
- Menu and toolbar updates (2018-03-07): http://workspaceupdates.googleblog.com/2018/03/menu-and-toolbar-updates-in-google-docs.html
- New templates in Slides (2024-11-07): http://workspaceupdates.googleblog.com/2024/11/new-templates-in-google-slides.html
- Quick access side panel (2018-08-22): http://workspaceupdates.googleblog.com/2018/08/use-quick-access-side-panel-to-do-more.html
- Collapsible filmstrip, release notes (2021-12-17): http://workspaceupdates.googleblog.com/2021/12/release-notes-12-17-2021.html
- Present mode updates (2019-06-18): http://workspaceupdates.googleblog.com/2019/06/slides-present-mode-updates.html
- Annotations in present mode (2023-08-10): http://workspaceupdates.googleblog.com/2023/08/add-annotations-to-your-presentations.html
- Speaker notes in Meet (2023-01-12): http://workspaceupdates.googleblog.com/2023/01/view-google-slides-speaker-notes-in-google-meet.html
- Create original images from text (2023-08-29): http://workspaceupdates.googleblog.com/2023/08/create-original-images-from-text-google-slides.html
- Gemini in the side panel (2024-06-24): https://workspaceupdates.googleblog.com/2024/06/gemini-in-side-panel-of-google-docs-sheets-slides-drive.html
- Gems in the side panel (2025-07-02): http://workspaceupdates.googleblog.com/2025/07/gems-in-the-side-panel-of-google-workspace-apps.html
- Arrow keys move an object by a pixel (2025-08-19): http://workspaceupdates.googleblog.com/2025/08/move-object-one-pixel-google-slides.html
- AI image editing, Replace background (2025-08-13): http://workspaceupdates.googleblog.com/2025/08/replace-expand-image-background-slides-vids.html
- Refine text with Gemini (2025-09-05): http://workspaceupdates.googleblog.com/2025/09/use-gemini-to-refine-text-in-slides.html
- Nano Banana Pro, Help me visualize (2025-11-20): http://workspaceupdates.googleblog.com/2025/11/workspace-nano-banana-pro.html
- Beautify this slide, Create, Enhance this slide (2026-04-01): http://workspaceupdates.googleblog.com/2026/04/enerate-beautiful-and-editable-slides-with-ease-in-Google-Slides.html
- Record presentations with Google Vids (2026-08-20): http://workspaceupdates.googleblog.com/2026/08/record-presentations-in-google-slides-with-Google-Vids.html
- Google Slides label index: https://workspaceupdates.googleblog.com/search/label/Google%20Slides

Articles, tutorials and reference cards:

- Computerworld, Google Slides cheat sheet (updated September 2025): https://www.computerworld.com/article/1658651/how-to-use-google-slides.html
- BrightCarbon, Google Slides: The ULTIMATE guide (2023-06-22): https://www.brightcarbon.com/blog/google-slides-ultimate-guide/
- BrightCarbon, Presenter view (2021-08-04): https://www.brightcarbon.com/blog/presenter-view-google-slides/
- BrightCarbon, image editing hacks (2019-01-31): https://www.brightcarbon.com/blog/google-slides-image-editing/
- CustomGuide, Google Slides quick reference card (2024 edition, PDF): https://www.customguide.com/cheat-sheet/google-slides-quick-reference.pdf
- CustomGuide, Change views: https://www.customguide.com/google-slides/change-views
- University of Hawaii West Oahu, Getting the most out of G Suite: Google Slides handout (2022, PDF): https://westoahu.hawaii.edu/noeaucenter/wp-content/uploads/2022/12/Getting-the-Most-out-of-G-Suite-Google-Slides.pdf
- Art of Presentations, Toolbar in Google Slides (2023-02-24): https://artofpresentations.com/toolbar-in-google-slides/
- Art of Presentations, Slide sorter view (grid view): https://artofpresentations.com/slide-sorter-view-in-google-slides/
- Alice Keeler, Right click on the filmstrip (2017-11-08): https://alicekeeler.com/2017/11/08/google-slides-right-click-filmstrip/
- Alice Keeler, Where did the Explore tool go (2023-03-24, updated 2024-10-15): https://alicekeeler.com/2023/03/24/google-explore-what-happened-to-it/
- chrmbook, Google removes the Explore tool (2024-03-18): https://www.chrmbook.com/rip-explore-tool/
- HowToGeek, Speaker notes in Google Slides (2021-10-01): https://www.howtogeek.com/748657/how-to-use-speaker-notes-in-google-slides/
- Slidesgo, Presenter view: https://slidesgo.com/slidesgo-school/google-slides-tutorials/how-to-use-the-presenter-view-in-google-slides
- Slidesgo, Format the text: https://slidesgo.com/slidesgo-school/google-slides-tutorials/how-to-formt-the-text-in-google-slides
- Slidesgo, Insert, crop or mask images: https://slidesgo.com/slidesgo-school/google-slides-tutorials/how-to-insert-crop-or-mask-images-in-google-slides
- Slidesgo, Add or change themes: https://slidesgo.com/slidesgo-school/google-slides-tutorials/how-to-add-or-change-themes-in-google-slides
- Slidesgo tutorial index: https://slidesgo.com/slidesgo-school/google-slides-tutorials
- ComputerCity, Image editing options in Google Slides: https://computercity.com/software/apps/image-editing-options-in-google-slides
- Baz Roberts, Working with text (2016-05-10): https://bazroberts.com/2016/05/10/google-slides-working-with-text/
- Baz Roberts, Tables (2016-06-08): https://bazroberts.com/2016/06/08/google-slides-tables/
- SlideEgg, How to get the toolbar back (2025-06-20): https://www.slideegg.com/blog/google-slides-tutorials/how-to-get-the-toolbar-back-in-google-slides/
- Chrome School, Lesson 4 Google Slides: https://chromeschool.weebly.com/lesson-4-google-slides.html
- We Thrive Together, Google Slides for beginners: https://wethrivetogether.org/tech-training-hub/topics/google-slides/
- Technology Accent, dotted lines in Google Docs (line toolbar): https://technologyaccent.com/dotted-line-google-docs/
- Search result snippets read through WebSearch on 2026-09-11 for the border, shape and table toolbars: SlidesAI (https://www.slidesai.io/blog/how-to-add-a-border-in-google-slides, https://www.slidesai.io/blog/how-to-change-shape-color-in-google-slides), SlidePeak (https://slidepeak.com/blog/simple-ways-to-add-borders-in-google-slides), SlideUpLift (https://slideuplift.com/blog/how-to-add-a-border-in-google-slides/), Vegaslide (https://vegaslide.com/customize-table-borders-google-slides/), SlideEgg invert image guide (https://www.slideegg.com/blog/google-slides-tutorials/how-to-invert-an-image-on-google-slides-easily/), Digital Trends hide a slide (https://www.digitaltrends.com/computing/how-to-hide-a-slide-in-google-slides/).

Pages tried and not readable on 2026-09-11 (blocked, moved or empty): GCFGlobal Google Slides
lessons at edu.gcfglobal.org and learnfree.org, the Kolibri GCF mirror, Quizlet interface diagram,
Digital Trends how to use Google Slides, University of Michigan present mode note, Zapier tutorial,
Vegaslide crop and mask, smallppt crop and mask, the Google Docs Editors Community threads. The
browser pane could not open docs.google.com or support.google.com, so no live measurement was made.
