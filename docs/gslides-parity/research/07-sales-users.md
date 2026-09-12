# Sales users and Google Slides

Report 07 in the Google Slides parity research series for the Turboslide redesign. Written 2026-09-11. Every source below was read on 2026-09-11 from a public page without signing in to any account. Claims that could not be confirmed from a public source are collected in the "Unverified" section and are not stated as fact in the body. Google Slides is named as a reference; none of Google's icons, artwork or trademarked assets are reproduced here.

## Summary

The majority user of Turboslide is a salesperson who already knows Google Slides and who edits an existing deck far more often than they build one from nothing. Vendor and analyst figures agree that sellers spend most of their week on non-selling work, that a meaningful share of that time goes to finding, copying and tailoring decks, and that a tailored deck typically changes a small set of slides: the cover with the customer name and logo, the case study or logo wall, the agenda, the pricing slide, and any slide with numbers. Google Slides serves this user with a small number of defaults rather than with features: a new deck opens on an editable slide in one click, every change saves itself, undo works on everything, the frequent actions sit on one toolbar and repeat in right-click menus, the layout picker turns the theme's slide templates into a one-click choice, and presenting and sharing sit at the top right where every Google editor puts them. The interface conventions that make this work are the menu bar as the complete map of features, the toolbar for the frequent ten, a toolbar that changes with the selection, a right panel for object properties that opens on demand, the filmstrip on the left, speaker notes below the canvas, and Slideshow and Share at the top right. Google hides power features behind labelled secondary entries (a dropdown arrow, a Slide menu item, a Tools submenu, a Format options panel) rather than behind unlabelled overflow menus, and it names everything in plain sentence-case words that describe the user's goal. Google Slides also has failure points a sales org feels daily: chart data can only be edited by opening a spreadsheet, PowerPoint import and export shift fonts and layouts, custom fonts are unsupported, skipped slides remain visible to anyone who opens the shared file, linked slides update one at a time, the design-suggestion panel was removed in 2024 and its AI replacement is gated by plan, and the 2025 sidebar labels its icons only on hover. The design rules at the end keep Google's structure, positions, labels and defaults, and deliberately depart from Google in those failure points.

## Who the sales user is

The following figures describe the population Kevin's directive names as the majority of the org. Where a statistic is quoted by a vendor without a primary citation the note says so.

| Finding | Figure | Source (read 2026-09-11) |
| --- | --- | --- |
| Sellers spend most of their time not selling | Salesforce reports sales reps spend 60% of their time on non-selling tasks; sellers use an average of 8 tools per deal; 42% feel overwhelmed by too many tools; those with tool overload are 45% less likely to hit quota (Salesforce State of Sales, 2026 edition as cited on the statistics page) | https://www.salesforce.com/sales/state-of-sales/sales-statistics/ |
| Content work is a large share of the lost time | Sales reps spend an average of 30 hours a month generating or finding content (vendor statistic, no primary citation) | https://www.duarte.com/blog/how-to-create-an-effective-sales-enablement-deck/ |
| Same figure, annualised | Revenue teams spend 440 hours per year searching for or creating content; 78% of sales leaders say teams lack easy access to content; reps recreate existing content 40% of the time (vendor roundup, no primary citation) | https://www.sifthub.io/blog/sales-enablement-statistics |
| Enablement leaders see the cost | 46% say sellers spend too much time creating or personalising content; 33% say sellers send content that differs from the brand | https://federicopresicci.com/blog/sales-enablement/sales-enablement-statistics/ |
| Non-users of enablement tools blame the content | 83% of respondents who do not use enablement tech say the content is not personalisable enough (Seismic's own study); McKinsey figures quoted: 71% of buyers expect personalised interactions and 76% are frustrated without them | https://www.seismic.com/blog/the-future-of-sales-enablement-is-personalization/ |
| What tailoring one deck costs | A tailored QBR deck takes 1.5 to 3 hours: CRM export 10 to 15 min, spreadsheet cleaning 20 to 40 min, chart updates 30 to 60 min, brand formatting 15 to 30 min, QA 15 to 20 min; 40 decks equal 60 to 120 hours | https://insyncr.com/article/personalized-sales-presentations-the-complete-guide-for-b2b-teams-in-2026 |
| How reps actually tailor | A rep grabs the last version that worked, rebuilds a few slides, swaps the logo and sends it; multiplied across a team this yields off-brand, unmeasured decks; the article names the "rushed rep at 11pm" and cites 31% of rep time spent searching for or creating content | https://www.thedigideck.com/how-to-keep-sales-decks-on-brand-and-measurable/ |
| What orgs ask for in response | Locked templates and master slides, a governed library of approved slides, editable blocks inside protected layouts, updates that cascade to decks in the field, brand rules inside the rep's workflow | https://www.thedigideck.com/how-to-keep-sales-decks-on-brand-and-measurable/ |
| What a sales deck contains | Problems and challenges, solution and value proposition, features and capabilities, demo, customer testimonial, pricing and services, plus optional market, competition, team and call to action | https://www.seismic.com/enablement-explainers/how-to-create-the-perfect-sales-pitch-deck/ |
| What changes per prospect | Content selected by the buyer's priorities, industry and concerns; separate editions per persona (economic buyer, technical liaison); proof points and case studies swapped per account; 48% of go-to-market teams investing in digital sales rooms (Highspot State of Sales Enablement Report 2025) | https://www.highspot.com/blog/sales-presentation/ and https://www.highspot.com/blog/how-to-create-a-sales-pitch-deck/ |
| The fields that change | Account name, logo and industry; ARR, pipeline and adoption numbers; case studies matching the prospect; pricing scenarios by segment | https://insyncr.com/article/personalized-sales-presentations-the-complete-guide-for-b2b-teams-in-2026 |

What this means for the design: the sales user opens a deck that already exists, duplicates or deletes slides, replaces a logo or screenshot, retypes a name and a few numbers, reorders, hides the slides that do not apply, presents over a call, and sends a PDF or a link. They rarely draw, rarely animate and never open a theme editor. The tool must make the first group of actions immediate and must not make them notice anything else.

## Top tasks and how Google Slides handles them

The table lists the tasks a salesperson performs when building or tailoring a deck, the way Google Slides handles each, where the control sits, and the notes a designer needs. Labels are quoted as they appear on Google's help pages. Menu paths use Google's notation, for example File > Download.

| Task | How Google Slides does it | Where the control sits | Notes | Source |
| --- | --- | --- | --- | --- |
| Start a new deck | On the Slides home screen, under "Start a new presentation", click "New" (a blank deck) or a template thumbnail; "Template gallery" opens more; the deck opens immediately, titled "Untitled presentation", and the title field is edited in place | Home page, top left; title field at the top left of the editor | One click from home to an editable slide; naming is deferred; File > New > "From Template Gallery" and a "Templates" icon at the top left also start from a template | https://support.google.com/a/users/answer/10665800 and https://support.google.com/docs/answer/1705254 |
| Start from the company template | Organisation-branded templates appear in the Template gallery and in the "Templates" panel; the 2025 sidebar added "Templates" and "Building blocks" (agendas, quotes, key statistics) made of native, editable elements | Right sidebar (2025), Templates icon top left, File > New | Building blocks are the closest Google feature to "repeated slide templates you can use" inside an open deck | https://workspaceupdates.googleblog.com/2025/03/new-sidebar-with-design-elements-in-google-slides.html |
| Add a slide | "New slide" button with a plus adds a slide with the same layout as the current slide; the down arrow next to it ("New slide with layout") lists the theme's layouts; Ctrl+M; also Slide > New slide and right-click > New slide | Toolbar, first button; Slide menu; filmstrip right-click | The default inherits the current layout, so a rep pressing Ctrl+M three times gets three matching slides | https://support.google.com/docs/answer/1694830 and https://support.google.com/a/users/answer/10665800 |
| Change a slide's layout | Select the slide, click "Layout" in the toolbar and pick a layout; or right-click the thumbnail > "Apply layout"; or Slide > Apply layout | Toolbar (slide group), filmstrip right-click, Slide menu | Layouts are the theme's slide templates; this is the control that turns a template into a picker | https://support.google.com/docs/answer/1705254, https://www.brightcarbon.com/blog/editing-themes-and-layouts-in-google-slides/, https://www.simpleslides.co/blog/how-to-apply-layout-for-a-slide-in-google-slides |
| Duplicate a slide | Right-click the thumbnail > "Duplicate slide"; Ctrl+D (Cmd+D on Mac); Slide > Duplicate slide; Shift-click to duplicate several | Filmstrip right-click, Slide menu, shortcut | Ctrl+D also duplicates a selected object on the canvas, matching Adobe and PowerPoint habits | https://support.google.com/docs/answer/1694830 and https://support.google.com/docs/answer/1696717 |
| Delete a slide | Select the thumbnail and press Delete or Backspace; right-click > "Delete"; Shift-click for several | Filmstrip, keyboard | No confirmation dialog; undo restores | https://support.google.com/docs/answer/1694830 and https://support.google.com/a/users/answer/9300133 |
| Hide a slide without deleting | Right-click the thumbnail > "Skip slide"; the thumbnail fades and shows a crossed-out eye; click "Skip slide" again to show it | Filmstrip right-click, Slide menu | Google warns that skipped slides remain visible to anyone the file is shared with; this is a trap for pricing or internal slides | https://support.google.com/docs/answer/1694830 and https://slidestack.com/blog/how-to-easily-add-duplicate-move-delete-or-hide-slides-in-google-slides |
| Reorder slides | Drag the thumbnail to a new position; Ctrl+click or Shift+click to select several and drag together; Ctrl+Up/Down moves one step, Ctrl+Shift+Up/Down to the beginning or end; a "Grid view" toggle at the bottom left shows all slides as thumbnails for bulk reordering | Filmstrip, bottom-left view toggle, Slide menu, shortcuts | Grid view arrived in 2017 together with "Skip slide" and linked slides | https://support.google.com/docs/answer/1694830, https://support.google.com/docs/answer/1696717, https://blog.google/products-and-platforms/products/workspace/new-updates-in-slides-designed-make-you-look-good/ |
| Edit text | Click into any text box and type; the toolbar switches to text controls (font, size, bold, italic, underline, text color, lists, alignment, link); Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Shift+L/E/R for alignment, Ctrl+Shift+7/8 for lists, Ctrl+\ clears formatting | Canvas, contextual toolbar, Format menu | Placeholders from the layout carry the theme's fonts, so retyping keeps the brand | https://support.google.com/docs/answer/1696717 and https://www.customguide.com/cheat-sheet/google-slides-quick-reference.pdf |
| Rename the customer across the deck | Edit > Find and replace; Ctrl+H (Cmd+Shift+H) | Edit menu, shortcut | Needed when a deck is cloned from a previous customer | https://support.google.com/docs/answer/1696717 |
| Swap a customer logo or screenshot | Right-click the image > "Replace image", then choose "Upload from computer", "Stock & web", "Drive & Photos", "Camera" or "By URL"; or drag an image file from anywhere onto the existing image to replace it | Canvas right-click, Insert > Image | Replace keeps the frame, so the layout survives; drag-to-replace is the fastest path for a rep with a logo file | https://support.google.com/docs/answer/97447 |
| Insert a new image | Insert > Image > the same source list plus "GIFs and stickers"; toolbar Image button; paste from the clipboard | Toolbar, Insert menu | Google's help notes only one image at a time can be copied out of Slides | https://support.google.com/docs/answer/97447 and https://support.google.com/docs/answer/161768 |
| Adjust an image or shape | Select it and click "Format options" in the toolbar; a right panel opens with size and rotation, position, recolor and adjustments (transparency, brightness, contrast); the toolbar also shows crop, mask and border controls for an image | Contextual toolbar, right panel, Format menu | The panel is closed by default and appears only on request | https://support.google.com/docs/answer/97447 and https://www.brightcarbon.com/blog/google-slides-ultimate-guide/ |
| Align and arrange objects | Arrange menu: Order, Align, Distribute, Center on page, Rotate, Group and Ungroup; red guides snap while dragging; View > Snap to > Grid; Ctrl+Alt+G groups | Arrange menu, right-click, drag | BrightCarbon calls the right-click route "a lot more practical" than the menu | https://slidestack.com/blog/how-to-arrange-and-align-objects-in-google-slides-tips-and-tricks and https://www.brightcarbon.com/blog/google-slides-ultimate-guide/ |
| Copy formatting between objects | "Paint format" button in the toolbar; Ctrl+Alt+C copies, Ctrl+Alt+V pastes formatting | Toolbar, shortcuts | Copies fill, line and text formatting; the PowerPoint blog notes it does not copy size or position | https://support.google.com/docs/answer/1696717 and https://thepowerpointblog.com/the-good-the-bad-the-missing/ |
| Add a table of numbers | Insert > Table, then click a cell in the grid to set columns and rows (up to 20 by 20 in one drag); add rows and columns with Format > Table > "Insert row above", "Insert row below", "Insert column left", "Insert column right", or right-click a cell | Insert menu, Format > Table, cell right-click | Tables are native and editable in place | https://www.customguide.com/course/google-slides/how-to-insert-tables-into-google-slides |
| Add a chart of numbers | Insert > Chart > "Bar", "Column", "Line" or "Pie" inserts a sample chart and creates a linked Google Sheet; to change the numbers you open the sheet, edit, return and click "Update"; Insert > Chart > "From Sheets" imports an existing chart with a "Link to spreadsheet" checkbox | Insert menu; "Update" button and "Link options" at the chart's top right | The detour to a spreadsheet is the most cited chart complaint; see the frustrations section | https://support.google.com/docs/answer/7009814 and https://slidestack.com/blog/how-to-make-and-customize-charts-in-google-slides |
| Keep numbers in sync | Linked charts and tables show "Update" when the source changed; "Link options" offers "Open source" and "Unlink"; Tools > "Linked objects" lists every linked item with "Update all" | Object corner, Tools menu | Tables over 400 cells paste unlinked | https://support.google.com/docs/answer/7009814 |
| Paste text with or without formatting | Ctrl+V pastes with source formatting; Ctrl+Shift+V (Cmd+Shift+V) pastes without formatting so the text takes the destination box's style; Edit menu has both | Edit menu, shortcuts | Reps pasting from email or a CRM need the plain variant to keep the theme font | https://www.customguide.com/cheat-sheet/google-slides-quick-reference.pdf and https://support.google.com/docs/thread/95597915 |
| Paste slides from another deck | Copy the thumbnails in the source deck and paste in the destination; a prompt offers "Link slides" or "Do not link"; linked slides show a link icon with an "Update" action when the source changes | Filmstrip, paste prompt, Tools > Linked objects | Updates are manual and per slide; Import slides does not link | https://support.google.com/docs/answer/7009814 and https://alicekeeler.com/2017/11/20/google-slides-link-presentations/ |
| Import slides or a PowerPoint file | File > "Import slides", pick a Drive presentation or upload a file, select slides ("Select slides: All" available), check "Keep original theme" to bring them unmodified or leave it unchecked to restyle them in the destination theme, then "Import slides" | File menu, import dialog | The checkbox is the one explicit theme choice Google offers when merging decks | https://support.google.com/a/users/answer/9282978 |
| Keep the deck on brand | The theme holds fonts, colours and layouts; Slide > "Change theme" opens a right panel with "Import theme" at the bottom; Slide > "Change background" applies to one slide ("Done") or all ("Add to theme"); Slide > "Edit theme" opens the Theme builder where elements placed on layouts cannot be moved from normal slides | Slide menu, right panel, Theme builder | Putting logos and footers on layouts is Google's only protection against reps nudging them | https://support.google.com/docs/answer/1705254 and https://www.brightcarbon.com/blog/editing-themes-and-layouts-in-google-slides/ |
| Undo a mistake | Ctrl+Z and Ctrl+Y or Ctrl+Shift+Z; Undo and Redo buttons in the toolbar; Edit menu | Toolbar, Edit menu, shortcuts | Applies to slide operations as well as canvas edits | https://support.google.com/docs/answer/1696717 and https://support.google.com/a/users/answer/9300133 |
| Never lose work | Every change is saved automatically; the "Last edit" button at the top opens version history; File > "Version history" > "See version history"; "Name current version" (up to 40 named versions); "Restore this version"; Ctrl+Alt+Shift+H | Top bar indicator, File menu | There is no Save command anywhere in the product | https://support.google.com/a/users/answer/9313043, https://support.google.com/docs/answer/190843, https://support.google.com/docs/answer/1696717 |
| Add speaker notes or a talk track | The pane below the slide reads "Click to add speaker notes"; View > "Show speaker notes" toggles it; drag the handle to resize; Ctrl+Alt+Shift+S focuses it; notes accept the same text formatting | Below the canvas, View menu | Notes show in Presenter view and can be stripped when making a copy | https://www.howtogeek.com/748657/how-to-use-speaker-notes-in-google-slides/ and https://support.google.com/docs/answer/1696717 |
| Present in the room | "Slideshow" button at the top right starts from the current slide; its down arrow offers "Presenter view" and present from beginning; Ctrl+F5 (Cmd+Enter); arrows advance, S opens speaker notes, A opens audience tools, L toggles the laser pointer, B and W blank the screen, Esc stops | Top right, shortcut | Presenter view shows a timer with pause and reset, previous and next thumbnails, notes with size buttons, and an "Audience Tools" tab for Q&A | https://support.google.com/docs/answer/1696787 and https://slidesgo.com/slidesgo-school/google-slides-tutorials/how-to-add-and-work-with-speaker-notes-in-google-slides |
| Present over a call | A "Meet" button at the top right of the editor offers "Just present this tab"; the rep selects the tab and clicks "Share"; presenting from the editor disables mic, speaker and camera, so Google recommends joining Meet first and sharing the screen from there; Presenter view opens in a separate window suitable for a second screen | Top right, Meet | Sales calls are the dominant presenting context, and the two-window model (audience window plus presenter window) is what reps expect | https://support.google.com/docs/answer/10540294 and https://www.howtogeek.com/748657/how-to-use-speaker-notes-in-google-slides/ |
| Export PPTX or PDF | File > Download > "Microsoft PowerPoint (.pptx)", "PDF Document (.pdf)", ODP, TXT, JPEG, PNG, SVG; presenting toolbar also offers download as PDF or PPTX | File menu, presenting toolbar | Reviewers report fonts and layouts shifting in the PPTX round trip | https://slidemodel.com/download-a-google-slides-presentation/ and https://support.google.com/docs/answer/1696787 |
| Share a link | "Share" button at the top right; add people by email with a role ("Viewer", "Commenter", "Editor"); "General access" is "Restricted" or "Anyone with the link"; "Copy link"; a gear opens "Editors can change permissions and share" and "Viewers and commenters can see the option to download, print, and copy"; per-person "Add expiration"; "Remove access" | Top right, Share dialog | Sharing a link is the sales follow-up default; the gear settings control whether a prospect can download | https://support.google.com/docs/answer/2494822 and https://support.google.com/drive/answer/2494893 |
| Make a customer-facing copy | File > "Make a copy" offers "Entire presentation" or "Selected slides" with a checkbox to remove speaker notes | File menu | Introduced in 2020 to share only the relevant slides without internal notes | https://workspaceupdates.googleblog.com/2020/01/copy-presentation-options-slides.html |
| Publish or embed | File > Share > "Publish to web" gives a link or embed code with auto-advance timing; "Published content & settings" > "Stop publishing" | File menu | Google notes automatic updates cannot be turned off for published Slides | https://support.google.com/docs/answer/183965 |
| Comment and hand off for review | Select an item, Insert > Comment or Ctrl+Alt+M; type "@" and an email to assign; "Reply"; "Resolve"; a comment icon sits left of the Slideshow button and opens the comments pane | Toolbar, Insert menu, top right | Sales managers review decks through comments, not through edits | https://support.google.com/docs/answer/65129 and https://www.computerworld.com/article/1658651/how-to-use-google-slides.html |
| Number slides | Insert > "Slide numbers" > Apply, with "Skip title slides"; "Apply to selected" for a subset | Insert menu | A small task but a common one before export | https://support.google.com/docs/answer/1694830 |
| Add a link | Ctrl+K or the Insert link toolbar button; the target can be a URL or a slide in the deck | Toolbar, Insert menu | Linking to a slide is how reps build a clickable agenda | https://support.google.com/docs/answer/1696717 and https://www.customguide.com/cheat-sheet/google-slides-quick-reference.pdf |
| Find a feature | Help > search box; Alt+/ (Option+/) "Search the menus"; Ctrl+/ shows the keyboard shortcut list; a tool finder icon in the toolbar took over some Explore functions | Help menu, toolbar, shortcuts | This is where a command palette belongs, labelled as a menu search, not as a developer palette | https://support.google.com/docs/answer/1696717 and https://www.chrmbook.com/rip-explore-tool/ |
| Work on a plane | Offline requires Chrome or Edge with the Google Docs Offline extension; Drive settings > Offline, or File > "Make available offline"; a document status icon reports "ready for offline use" | Settings, File menu, status icon | Reviewers rate offline as the weakest part; see frustrations | https://support.google.com/docs/answer/6388102 |
| Get design help | "Ask Gemini" button at the top right opens a side panel with "Help me create a slide", "Write a title", "Help me write"; Insert > "Help me visualize" generates images and infographics; a 2026 update adds "Create" and "Enhance this slide" for editable slides; the earlier Explore panel with layout suggestions was removed in 2024 | Top right, Insert menu, side panel | All Gemini features require an eligible Workspace or AI plan; the removed Explore had been the free design-idea feature | https://support.google.com/docs/answer/14207419, https://support.google.com/docs/answer/16961475, https://workspaceupdates.googleblog.com/2026/04/enerate-beautiful-and-editable-slides-with-ease-in-Google-Slides.html, https://slidemodel.com/does-google-slides-have-design-ideas/ |

### Keyboard shortcuts the sales user relies on

All from Google's shortcut page unless noted. PC first, Mac in parentheses.

| Action | Shortcut |
| --- | --- |
| New slide | Ctrl+M (Ctrl+M) |
| Duplicate slide or object | Ctrl+D (Cmd+D) |
| Undo, redo | Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z (Cmd+Z, Cmd+Y or Cmd+Shift+Z) |
| Copy, cut, paste | Ctrl+C, Ctrl+X, Ctrl+V (Cmd equivalents) |
| Paste without formatting | Ctrl+Shift+V (Cmd+Shift+V), per CustomGuide and Google community threads |
| Copy and paste formatting | Ctrl+Alt+C, Ctrl+Alt+V (Cmd+Option+C, Cmd+Option+V) |
| Find, find and replace | Ctrl+F, Ctrl+H (Cmd+F, Cmd+Shift+H) |
| Move slide up or down, to start or end | Ctrl+Up/Down, Ctrl+Shift+Up/Down (Cmd variants) |
| Bold, italic, underline | Ctrl+B, Ctrl+I, Ctrl+U |
| Align left, centre, right, justify | Ctrl+Shift+L, E, R, J |
| Bulleted list, numbered list | Ctrl+Shift+8, Ctrl+Shift+7 |
| Clear formatting | Ctrl+\ (Cmd+\) |
| Insert or edit link | Ctrl+K |
| Insert comment | Ctrl+Alt+M (Cmd+Option+M) |
| Group, ungroup | Ctrl+Alt+G, Ctrl+Alt+Shift+G |
| Send backward, bring forward | Ctrl+Down, Ctrl+Up (object selected) |
| Speaker notes pane | Ctrl+Alt+Shift+S |
| Version history | Ctrl+Alt+Shift+H |
| Zoom in, zoom out | Ctrl++, Ctrl+- |
| Start presenting | Ctrl+F5 (Cmd+Enter); Cmd+Shift+Enter from the beginning on Mac |
| While presenting | Right and Left arrows, S notes, A audience tools, L laser pointer, B black, W white, Ctrl+Shift+C captions, Esc stop |
| Show shortcuts, search the menus | Ctrl+/ , Alt+/ (Cmd+/ , Option+/) |
| Focus filmstrip, focus canvas | Ctrl+Alt+Shift+F, Ctrl+Alt+Shift+C |

Source: https://support.google.com/docs/answer/1696717 and https://www.customguide.com/cheat-sheet/google-slides-quick-reference.pdf.

## The interface map Google uses

Positions and labels as documented on Google's help pages, the Workspace Learning Center cheat sheet, the Computerworld cheat sheet and the 2024 CustomGuide screen diagram.

| Region | Position | Contents and behaviour | Source |
| --- | --- | --- | --- |
| Title field | Top left, next to the product icon | "Untitled presentation" until renamed; click to rename; a star and a move-to-folder icon sit beside it | https://support.google.com/a/users/answer/10665800 |
| Menu bar | Below the title | File, Edit, View, Insert, Format, Slide, Arrange, Tools, Extensions, Help, in that order; File holds whole-presentation actions (Print, Rename, Share, Download, Make a copy, Import slides, Version history); Slide holds per-slide actions (New slide, Duplicate slide, Delete slide, Skip slide, Change background, Apply layout, Transition, Edit theme, Change theme); Arrange holds object ordering and alignment | https://www.computerworld.com/article/1658651/how-to-use-google-slides.html and https://www.brightcarbon.com/blog/google-slides-ultimate-guide/ |
| Toolbar | Below the menu bar, one row | Commonly used commands: adding slides, undo and redo, print, paint format, zoom, select, text box, image, shape, line, comment, then background, layout, theme and transition; the buttons change with what is selected (slide, text, image) | https://www.computerworld.com/article/1658651/how-to-use-google-slides.html and https://www.customguide.com/cheat-sheet/google-slides-quick-reference.pdf |
| Status indicator | Top, right of the menus | "Last edit was ..." opens version history; a document status icon reports offline readiness | https://support.google.com/docs/answer/190843 and https://support.google.com/docs/answer/6388102 |
| Top-right cluster | Top right | Comment history icon (left of Slideshow), "Meet" button, "Slideshow" with a down arrow for "Presenter view", "Share" button, account avatar; "Ask Gemini" also sits at the top right on eligible plans | https://support.google.com/docs/answer/1696787, https://support.google.com/docs/answer/10540294, https://support.google.com/docs/answer/14207419, https://www.computerworld.com/article/1658651/how-to-use-google-slides.html |
| Filmstrip | Left pane | Thumbnails of every slide; drag to reorder; Shift or Ctrl multi-select; right-click menu; skipped slides fade with a crossed-out eye | https://support.google.com/docs/answer/1694830 and https://www.computerworld.com/article/1658651/how-to-use-google-slides.html |
| View toggle | Bottom left | "Filmstrip view" and "Grid view"; the filmstrip can be hidden here or from View | https://support.google.com/docs/answer/1694830 |
| Canvas | Centre | The active slide; the selected slide in the filmstrip is highlighted | https://www.customguide.com/cheat-sheet/google-slides-quick-reference.pdf |
| Speaker notes | Below the canvas | "Click to add speaker notes"; drag handle; View > Show speaker notes | https://www.howtogeek.com/748657/how-to-use-speaker-notes-in-google-slides/ |
| Right panel | Right of the canvas, on demand | Format options, Themes, Transitions (Motion), Comments, Templates, Building blocks, Images, Gemini; only one panel at a time; closed by default | https://support.google.com/docs/answer/97447, https://support.google.com/docs/answer/1705254, https://workspaceupdates.googleblog.com/2025/03/new-sidebar-with-design-elements-in-google-slides.html |
| Side panel rail | Far right, 2025 | Three groups of icons whose text labels appear on hover: templates and building blocks, images and image generation, speaker spotlight and recordings | https://workspaceupdates.googleblog.com/2025/03/new-sidebar-with-design-elements-in-google-slides.html |
| Home page | slides.google.com | "Start a new presentation" with a blank tile and template thumbnails, "Template gallery", then the recent files list | https://www.computerworld.com/article/1658651/how-to-use-google-slides.html and https://support.google.com/a/users/answer/10665800 |

## Defaults that carry the workload

These are the behaviours, not the features, that make Google Slides feel easy to a non-technical user. Each one removes a decision or a failure mode.

1. Autosave with a visible status and no Save command. Google's own summary of Slides says every change is saved automatically, and reviewers name it as a top reason for choosing Slides over PowerPoint (https://support.google.com/a/users/answer/9313043, https://slideuplift.com/blog/google-slides-vs-powerpoint/, https://www.softwareadvice.com/presentation/google-slides-profile/reviews/).
2. Undo and redo apply to every action, including slide-level operations, and they sit in the toolbar as well as on Ctrl+Z (https://support.google.com/a/users/answer/9300133).
3. Every frequent action has three routes: toolbar or button, menu bar, right-click, plus a shortcut. Google's cheat sheet documents duplicate, delete and move each as a right-click or drag, and the same actions appear in the Slide menu (https://support.google.com/a/users/answer/9300133).
4. New slide inherits the current layout; the choice of another layout is one dropdown away (https://support.google.com/docs/answer/1694830).
5. Drag is the primary reordering mechanism and it supports multi-select (https://support.google.com/docs/answer/1694830).
6. Deletion needs no confirmation because undo exists; Skip slide exists for the case where deletion is wrong (https://support.google.com/docs/answer/1694830).
7. Replace image keeps the frame; drag-and-drop onto an existing image replaces it (https://support.google.com/docs/answer/97447).
8. Paste keeps formatting by default, and one modifier (Shift) drops it (https://www.customguide.com/cheat-sheet/google-slides-quick-reference.pdf).
9. Sharing defaults to Restricted, with roles in plain words (Viewer, Commenter, Editor) and one button to copy the link (https://support.google.com/docs/answer/2494822).
10. Present is one click and one key, and Presenter view is a labelled dropdown next to it rather than a mode the user must configure (https://support.google.com/docs/answer/1696787).
11. Version history is reachable from a status word in the top bar, and named versions let a manager pin an approved deck (https://support.google.com/docs/answer/190843).
12. Comments and assignments replace edit-and-send review loops; assignment is "@" plus a checkbox (https://support.google.com/docs/answer/65129).
13. Shortcuts follow the conventions reps already know from PowerPoint and Adobe (Ctrl+D duplicate, Ctrl+M new slide, Ctrl+K link), which the PowerPoint blog counts as a strength (https://thepowerpointblog.com/the-good-the-bad-the-missing/).
14. Interface text is sentence case and uses common words; Google's writing guidance says to pick words clear to both beginning and advanced readers and to avoid names invented for UI features (https://m1.material.io/style/writing.html).

## Conventions to keep

These are the structural conventions Google follows and the reason each one matters for a user who already knows Google Slides. The principle behind all of them is Jakob's law: users spend most of their time in other products and prefer a new product to work the way the ones they know work (https://lawsofux.com/jakobs-law/).

| Convention | What Google does | Why we keep it | Source |
| --- | --- | --- | --- |
| Menu bar as the complete map | Every action is in one of File, Edit, View, Insert, Format, Slide, Arrange, Tools, Extensions, Help, including those that also appear in the toolbar or right-click menus | NN/g: actions in contextual menus should also be available from the main menu, because hidden menus are not discoverable to all users; the menu bar lets a rep browse for a feature by name | https://www.nngroup.com/articles/contextual-menus/ and https://www.computerworld.com/article/1658651/how-to-use-google-slides.html |
| Toolbar for the frequent actions | One row: new slide, undo, redo, print, paint format, zoom, select, text box, image, shape, line, comment, background, layout, theme, transition | NN/g lists junk-drawer "More" menus among the top application design mistakes; the toolbar must hold what reps do hourly and nothing that needs explanation | https://www.nngroup.com/articles/top-10-application-design-mistakes/ and https://www.customguide.com/cheat-sheet/google-slides-quick-reference.pdf |
| Contextual toolbar on selection | The toolbar swaps to text controls for text, image controls (crop, mask, border, replace) for images, and slide controls when nothing is selected | The rep never searches for the right panel; the tools for the selected thing appear in the same place | https://www.computerworld.com/article/1658651/how-to-use-google-slides.html and https://www.brightcarbon.com/blog/google-slides-ultimate-guide/ |
| Right panel for object properties | "Format options" opens a right panel with size and rotation, position, recolor and adjustments; it is closed until asked for | Properties that matter rarely stay out of the way; NN/g warns against modals that hide the content the user needs to see | https://support.google.com/docs/answer/97447 and https://www.nngroup.com/articles/top-10-application-design-mistakes/ |
| Filmstrip on the left | Thumbnails, drag reorder, multi-select, right-click, faded skipped slides, grid view toggle at the bottom left | The filmstrip is the rep's primary editing surface for tailoring a deck (duplicate, delete, skip, reorder) | https://support.google.com/docs/answer/1694830 |
| Notes below the canvas | "Click to add speaker notes", resizable, toggled from View | Talk tracks live with the slide and show in Presenter view | https://www.howtogeek.com/748657/how-to-use-speaker-notes-in-google-slides/ |
| Slideshow at the top right with a dropdown | "Slideshow" starts from the current slide; the arrow offers "Presenter view" | Every Google editor puts the primary output action at the top right; reps find it without looking | https://support.google.com/docs/answer/1696787 |
| Share at the top right | "Share" opens the one dialog for people, roles, general access and link | Sharing a link is the sales follow-up; the position is identical across Docs, Sheets and Slides | https://support.google.com/docs/answer/2494822 |
| Right-click everywhere, short menus | Slide thumbnails and canvas objects have contextual menus that repeat menu items | NN/g: fewer than 10 to 12 items, only actions relevant to the selected element, never the only route | https://www.nngroup.com/articles/contextual-menus/ and https://www.nngroup.com/articles/contextual-menus-guidelines/ |
| Labelled icons | Toolbar icons carry tooltips; Google's documentation style says tooltips are crucial for accessibility and discoverability | NN/g: most icons without a text label are difficult or impossible to understand | https://developers.google.com/style/ui-elements and https://www.nngroup.com/articles/top-10-application-design-mistakes/ |
| Familiar words, sentence case | Menu items use terms users recognise; titles, labels and menu items use sentence-style capitalisation | NN/g menu guideline: clear, specific, recognisable terminology rather than jargon or invented terms | https://www.nngroup.com/articles/menu-design/ and https://m1.material.io/style/writing.html |
| Feedback on state | "Last edit was", saving status, faded skipped slides, link icon with Update, blue dot for unseen changes | NN/g's first application mistake is poor feedback about the system's state | https://support.google.com/docs/answer/190843 and https://www.nngroup.com/articles/top-10-application-design-mistakes/ |

## Progressive disclosure patterns

NN/g defines progressive disclosure as showing only the frequently used options by default and deferring advanced or rarely used features to a secondary display reached through a clearly labelled affordance; it improves learnability, efficiency and error rate, and the initial display must contain the frequently used features so that most users rarely need the second stage (https://www.nngroup.com/articles/progressive-disclosure/). Google Slides applies the pattern in these ways.

| Pattern | Example in Google Slides | Rule for Turboslide | Source |
| --- | --- | --- | --- |
| Primary button plus dropdown arrow | "New slide" adds the same layout; the arrow lists layouts. "Slideshow" presents; the arrow offers Presenter view | Use the button-plus-arrow pattern for any action with a common default and rarer variants | https://support.google.com/docs/answer/1694830 and https://support.google.com/docs/answer/1696787 |
| On-demand right panel | "Format options" opens only when clicked; "Change theme" and "Transition" open their own panels | Object properties, themes and transitions are panels, not permanent chrome | https://support.google.com/docs/answer/97447 and https://support.google.com/docs/answer/1705254 |
| Separate mode for structure editing | "Edit theme" opens the Theme builder; nothing on a normal slide can move theme elements | The GT template's theme and layouts are edited in a separate mode that sales users never need to enter | https://www.brightcarbon.com/blog/editing-themes-and-layouts-in-google-slides/ |
| Whole-deck actions under File, slide actions under Slide | Download, Make a copy, Import slides, Version history and Publish live under File; Skip slide, Apply layout and Change background under Slide | Group menu items by scope so the rep predicts where an item is | https://www.computerworld.com/article/1658651/how-to-use-google-slides.html |
| Rare maintenance under Tools | "Linked objects" with "Update all" is under Tools | Turboslide's agent and maintenance surfaces belong under Tools, not on the toolbar | https://support.google.com/docs/answer/7009814 |
| Gear for secondary settings | The Share dialog's gear hides "Editors can change permissions and share" and download, print and copy control | Secondary settings sit behind a gear inside the dialog that owns them | https://support.google.com/drive/answer/2494893 |
| Two-level paste | Ctrl+V default, Ctrl+Shift+V variant; "Link slides" or "Do not link" prompt only when pasting between decks | Ask only when the choice exists, and keep the default the common case | https://alicekeeler.com/2017/11/20/google-slides-link-presentations/ |
| Search as the escape hatch | Alt+/ "Search the menus" and Ctrl+/ shortcut overlay | A command search is the right home for every feature a rep cannot find, and it should be labelled as menu search | https://support.google.com/docs/answer/1696717 |
| Labels on hover in the 2025 rail | The new right rail shows text labels only on hover | Do not copy this; NN/g's unlabelled-icon finding applies, and the rail is the one place Google broke its own convention | https://workspaceupdates.googleblog.com/2025/03/new-sidebar-with-design-elements-in-google-slides.html and https://www.nngroup.com/articles/top-10-application-design-mistakes/ |

## Naming

Google's writing guidance for interfaces: use plain, common words; avoid industry terms and names invented for UI features; use sentence-style capitalisation for titles, labels and menu items; use consistent action verbs on buttons; begin with the user's objective; skip periods in short labels; refer to elements by their label, not their widget type (https://m1.material.io/style/writing.html, https://codelabs.developers.google.com/codelabs/material-communication-guidance, https://developers.google.com/style/ui-elements). The table maps Google's labels to the engineering terms in the Turboslide codebase and spec that must not reach the default view.

| Google's label | Turboslide term to retire from the UI | Note |
| --- | --- | --- |
| New slide | Insert block, add slide of kind | The layout name goes in the dropdown, not in the button |
| Layout, Apply layout | Kind, grammar, grammar layout | The GT template's slide kinds are "layouts" to the user |
| Theme, Change theme, Edit theme | Toolchain, template engine, tokens | The GT template is "the theme" |
| Duplicate slide | Clone, copy block | Ctrl+D |
| Skip slide | Hide, hidden: true, exclude | Google avoids "hide" for slides |
| Delete slide | Remove, drop | No confirmation |
| Speaker notes | Notes field, presenter text | "Click to add speaker notes" |
| Slideshow, Presenter view | Present mode, Stage, TwinStage | "Slideshow" is the current label on Google's help pages |
| Share, Copy link | Publish, embed URL, lease | Publish is a separate, rarer action under File > Share |
| Download, Microsoft PowerPoint (.pptx), PDF Document (.pdf) | Export, flatten, native | The fidelity choice ("Perfect" vs "Editable text") is a sub-option inside the PPTX download, not two exports |
| Version history, Name current version, Restore this version | Revisions, revision chips, versions panel | Reachable from a "Last edit" word at the top |
| Replace image | Swap asset, asset picker | Right-click on the image |
| Format options | Inspector | Right panel, on demand |
| Change background | Material, surface | Per slide or "Add to theme" |
| Make a copy | Fork, bundle | With "Selected slides" and remove-notes option |
| Import slides | Deck transfer, bundle import | With "Keep original theme" |
| Search the menus | Command palette, Cmd K | Same feature, Google's label |
| Comments, Add comment, Resolve | Annotations, threads | Ctrl+Alt+M |
| Linked objects, Update, Update all | Sync, refresh, source | Under Tools |
| Templates, Building blocks | Grammar, primitives, kinds | Building blocks are the reusable pieces inside a deck |

Rules: sentence case everywhere ("Skip slide", not "Skip Slide"); verbs on buttons ("Replace image", "Copy link"); no engineering nouns in menus (no "lint", "source", "lease", "revision", "grammar", "freeform" in the default view); no trailing periods in labels; a tooltip on every icon.

## Where Google Slides frustrates sales users

Documented complaints, with the reason each one hurts a sales user and what Turboslide should do instead. These are the places where parity would import a defect.

| Frustration | Evidence | Effect on a salesperson | Turboslide should |
| --- | --- | --- | --- |
| Charts are edited in a spreadsheet | The only way to edit a chart is with Google Sheets; resizing stretches the chart; axes cannot be styled independently | Updating five numbers before a QBR means opening a second tab, editing, returning and clicking Update | Edit chart data in a small table inside the right panel; keep an "Update" affordance only for linked sources | https://thepowerpointblog.com/the-good-the-bad-the-missing/, https://www.softwareadvice.com/presentation/google-slides-profile/reviews/, https://slidestack.com/blog/how-to-make-and-customize-charts-in-google-slides |
| PowerPoint round trip shifts things | Fonts swap, layouts shift and animations do not translate on import; exports look different in PowerPoint; a 100 MB limit on converting PowerPoint files | Reps who receive or send PPTX spend time fixing slides | Keep the pixel-identical PPTX path as the default download and label the editable variant clearly | https://slideuplift.com/blog/google-slides-vs-powerpoint/, https://www.softwareadvice.com/presentation/google-slides-profile/reviews/, https://thepowerpointblog.com/the-good-the-bad-the-missing/ |
| Custom fonts unsupported | Only Google Fonts are available; users cannot upload brand fonts | Brand teams work around it; reps see the wrong font in exports | Turboslide ships Inter as the brand font; this is a strength, not a gap | https://www.brightcarbon.com/blog/google-slides-ultimate-guide/ and https://www.softwareadvice.com/presentation/google-slides-profile/reviews/ |
| Custom themes are hard to make and colours are rigid | Difficult to create a custom theme; limited to the exact scheme colours without tints and shades; no reset to layout formatting | Sales users inherit off-brand decks and cannot repair them | The GT template is the only theme, and "Apply layout" should reset a slide to the layout's positions | https://thepowerpointblog.com/the-good-the-bad-the-missing/ |
| Skipped slides are still visible in the shared file | Google's help states people the file is shared with can see skipped slides | A skipped pricing or internal slide leaks to the prospect | Exclude skipped slides from shared and published views by default, and state this in the Share dialog | https://support.google.com/docs/answer/1694830 |
| Linked slides update one at a time | Updates are manual per slide; commenters ask for a batch update; Import slides does not link | A rep with an approved slide library has to update 12 slides by hand | One "Update all" that is visible when anything is stale, not buried under Tools | https://alicekeeler.com/2017/11/20/google-slides-link-presentations/ and https://support.google.com/docs/answer/7009814 |
| Design suggestions were removed | The Explore panel with layout suggestions was discontinued in 2024 and its components scattered; Gemini replacements require an eligible plan | Reps lost the one free "make this look right" button | Layout picker and building blocks from the GT template are the design help; no plan gate | https://slidemodel.com/does-google-slides-have-design-ideas/, https://www.chrmbook.com/rip-explore-tool/, https://support.google.com/docs/answer/14207419 |
| Offline is a setup task | Requires Chrome or Edge, an extension, a Drive setting and files marked available offline; reviewers call offline "not as seamless" and comparisons call it inconsistent | Reps on flights and in venues with bad Wi-Fi lose access | Present mode must keep working after load without the network; do not require setup | https://support.google.com/docs/answer/6388102, https://www.softwareadvice.com/presentation/google-slides-profile/reviews/, https://presentersarena.com/tools/powerpoint-vs-google-slides-vs-keynote-the-ultimate-2026-showdown |
| Large decks slow down | Reviewers report performance problems with large or media-heavy files on poor connections | Sales decks are image heavy (screenshots, logos) | Keep thumbnails and the canvas responsive at 60 slides with images | https://www.softwareadvice.com/presentation/google-slides-profile/reviews/ |
| Presenting from the editor mutes the rep | Presenting a tab from Slides disables mic, speaker and camera, so Google tells users to join the call first and share from there | The first attempt to present on a call fails | Presenter view opens as a second window and never touches call audio | https://support.google.com/docs/answer/10540294 |
| Paint format copies too little | Copies colour and font, not size or position | Aligning a pasted logo to the previous one stays manual | Replace image keeps the frame, and alignment tools stay one right-click away | https://thepowerpointblog.com/the-good-the-bad-the-missing/ |
| Icons labelled only on hover | The 2025 right rail shows labels on hover | New users cannot tell templates from images | Every icon in Turboslide has a visible label or a permanent tooltip on focus | https://workspaceupdates.googleblog.com/2025/03/new-sidebar-with-design-elements-in-google-slides.html |
| Web image search lacks attribution | Search-the-web images show no visible attribution | Reps paste unlicensed logos | Restrict the image picker to upload, URL and the GT asset library | https://thepowerpointblog.com/the-good-the-bad-the-missing/ |
| Speaker notes travel with the file | Notes are visible to editors and to anyone who downloads the PPTX unless the user remembers Make a copy with notes removed | Internal talk tracks reach the customer | Download and share flows default to excluding notes with an explicit checkbox | https://workspaceupdates.googleblog.com/2020/01/copy-presentation-options-slides.html |
| Published decks always auto-update | Publish to web cannot turn off automatic updates for Slides | A rep editing a live deck changes what the prospect sees | Published and shared links point at a named version by default | https://support.google.com/docs/answer/183965 |
| Fewer animations and transitions | Basic options only; transitions described as choppy | Low impact for sales decks; comparisons say Slides "keeps it simpler" | Do not invest here; sales decks do not need animation | https://slideuplift.com/blog/google-slides-vs-powerpoint/ and https://thepowerpointblog.com/the-good-the-bad-the-missing/ |

## Design rules

Each rule has one sentence of rationale. Rules 1 to 22 keep Google's structure; rules 23 to 32 depart from Google where Google fails sales users.

1. The root address opens a new presentation built on the GT theme, titled "Untitled presentation", with the cursor ready on the first slide. Google's home flow reaches an editable slide in one click and defers naming, and reps edit first and name later.
2. The menu bar reads File, Edit, View, Insert, Format, Slide, Arrange, Tools, Help, and every action in the product is reachable from it. NN/g requires that toolbar and contextual-menu actions also exist in the main menu, and the menu bar is how a rep browses for a feature by name.
3. The toolbar holds the frequent actions in Google's order (New slide with layout arrow, Undo, Redo, Paint format, Zoom, Select, Text box, Image, Shape, Line, Comment, Background, Layout, Theme, Transition) and nothing that lives only there. A toolbar that mirrors Google's is learned in zero time, and NN/g counts overflow menus among the top design mistakes.
4. The toolbar changes with the selection: slide controls when nothing is selected, text controls in a text box, image controls (crop, replace, border) on an image, table controls in a cell. The rep finds the tools for the selected thing in the same place every time.
5. Object properties live in a right panel labelled "Format options" that opens on request and closes when done. Properties that matter rarely stay out of the way and never hide the slide behind a modal.
6. The filmstrip sits on the left with drag reorder, Shift and Ctrl multi-select, a right-click menu (New slide, Duplicate slide, Delete slide, Skip slide, Apply layout, Change background), and a filmstrip or grid toggle at the bottom left. The filmstrip is where a rep tailors a deck, and these are Google's exact actions.
7. Speaker notes sit below the canvas with the placeholder "Click to add speaker notes", a drag handle, and a View > Show speaker notes toggle. Talk tracks belong with the slide and reps expect them there.
8. "Slideshow" sits at the top right with a dropdown for "Presenter view" and present from beginning; "Share" sits to its right. Every Google editor puts the output actions at the top right, and reps find them without reading.
9. Every change saves itself, a "Last edit" indicator at the top shows the state, and there is no Save command. Autosave is the single most praised behaviour in Slides reviews and the reason reps trust the tool.
10. Undo and redo cover every action, including reorder, skip, layout and theme changes, and sit in the toolbar and on Ctrl+Z. Reversible actions remove the need for confirmation dialogs.
11. Delete needs no confirmation; Skip slide is the reversible alternative. Google deletes on the Delete key because undo exists.
12. New slide inherits the current layout; the layout arrow and the "Layout" toolbar button list the GT template's layouts with thumbnails; right-click offers "Apply layout". This is the control that turns the template into a picker of repeated slide templates.
13. Replace image is a right-click item and a drop target: dropping a file on an image replaces it and keeps the frame. Swapping a customer logo is the most common visual edit in sales decks.
14. Tables are inserted from Insert > Table with a grid picker, and rows and columns are added from a cell's right-click menu. Google's table flow is direct and reps know it.
15. Ctrl+V keeps formatting and Ctrl+Shift+V pastes plain text; pasting slides from another deck asks once whether to link them. The two-level paste is what reps use to keep the theme font when pasting from email or a CRM.
16. Import slides lives under File with a slide picker and a "Keep original theme" checkbox. This is Google's only explicit theme choice when merging decks and it is the right one.
17. Download lives under File > Download with Google's labels: "Microsoft PowerPoint (.pptx)", "PDF Document (.pdf)", PNG, JPEG, SVG. The label a rep scans for is the file type, not the exporter's name.
18. The Share dialog has people with a role (Viewer, Commenter, Editor), "General access" (Restricted, Anyone with the link), "Copy link", and a gear for download, print and copy permissions and expiration. This dialog is identical across Google's editors and is the follow-up flow after every call.
19. File > Make a copy offers "Entire presentation" or "Selected slides" and a checkbox to remove speaker notes. Reps send subsets of decks to customers and must be able to strip internal notes.
20. Comments use Ctrl+Alt+M, "@" to assign, Reply and Resolve, with the comments icon left of Slideshow. Managers review decks through comments rather than edits.
21. Keyboard shortcuts match Google's list exactly, Ctrl+/ shows them, and Alt+/ opens "Search the menus". Reps carry Google's shortcuts in muscle memory, and a labelled menu search is the correct home for the command palette.
22. All interface text uses Google's labels in sentence case, buttons start with verbs, every icon has a tooltip, and no engineering noun (lint, source, lease, revision, grammar, freeform, kind, toolchain) appears in the default view. Google's writing guidance and NN/g both tie plain, familiar labels to learnability.
23. Chart numbers are edited in place in the Format options panel, with "Update" shown only for linked sources. The spreadsheet detour is the most cited Slides complaint and costs a rep 30 to 60 minutes per deck.
24. Skipped slides are excluded from shared, published and downloaded outputs by default, and the Share dialog says so. Google's own help warns that skipped slides leak to viewers, which is a pricing-slide risk.
25. Downloads and shares exclude speaker notes by default with an explicit checkbox to include them. Internal talk tracks must not reach a prospect by accident.
26. Shared and published links point at a named version until the rep chooses "Update link to latest". Google's published decks auto-update with no way to stop it, which surprises reps editing a live deck.
27. When anything linked is stale, one visible "Update all" appears near the filmstrip instead of living under Tools. Per-slide manual updates are the documented pain of linked slides.
28. Design help is the layout picker and the building blocks of the GT template, available to everyone with no plan gate. Google removed its free design panel in 2024 and gated its AI replacement, which took the only "make this look right" button away from reps.
29. Presenter view opens in a second window that never touches call audio, and present mode keeps working after load without the network. Presenting from Google's editor disables the microphone, and offline requires setup that reps do not do.
30. "Apply layout" resets the slide's placeholders to the layout's positions and styles. Google has no reset to layout, so a nudged slide stays broken.
31. Logos, footers and brand elements live on layouts and cannot be selected on a normal slide; theme editing is a separate mode reached from Slide > Edit theme. This is Google's protection pattern, and sales orgs ask for locked brand elements.
32. Agent-facing surfaces (lint, source drawer, revision chips, leases, palette internals, headless and MCP status) leave the default view and appear only under Tools or a View > Show toggle. Progressive disclosure keeps the initial display to the frequent actions, and the majority user never needs these.

## What this means for Turboslide's current surfaces

The mapping below uses the package and component names from the brief and does not change any code.

- The `/` route becomes the "new presentation" experience: create a deck from the GT template, open `/edit/:id` on slide 1, title "Untitled presentation". The `/decks` list becomes the home page below "Start a new presentation" and the GT template tiles.
- The grammar layouts in `packages/schema` (opener, mood, closing, title, statement, cols, split, rows, plain, tiles) are the theme's layouts; they appear as thumbnails in the New slide arrow and the Layout button, named in plain words (for example "Title slide", "Section header", "Two columns", "Statement", "Closing"); the freeform layout is "Blank".
- `packages/chrome` Toolbar adopts Google's order and swaps by selection; Inspector is renamed "Format options" and opens on demand; Sidebar keeps the filmstrip with Google's right-click items and the grid toggle; Palette is relabelled "Search the menus" on Alt+/ and keeps Cmd+K as an alias; ExportMenu becomes File > Download with Google's labels and a fidelity sub-option; VersionsPanel becomes "Version history" reached from a "Last edit" indicator; LintPanel, SourceDrawer and HistoryPanel move under Tools; HelpCard becomes Help > Keyboard shortcuts on Ctrl+/.
- Skip slide, notes, Update all, named-version links and the Share dialog need explicit behaviour for outputs (excluded by default, checkbox to include).

## Unverified

The following could not be confirmed from a public source on 2026-09-11 and are stated as assumptions or omitted above.

1. The exact current left-to-right order of Google Slides toolbar buttons; the order given comes from the 2024 CustomGuide screen diagram and the Computerworld cheat sheet, not from a Google page.
2. The complete right-click menu on a filmstrip thumbnail; New slide, Duplicate slide, Delete, Skip slide and Apply layout are confirmed, while Change background, Transition, Add comment, Cut, Copy and Paste are assumed.
3. The complete right-click menu on a canvas object; Replace image and Format options are confirmed, while Order, Rotate, Center on page, Alt text, Link, Comment and Crop image are assumed.
4. Whether a slide pasted from another Google Slides deck adopts the destination theme or keeps its source layout; only the Import slides "Keep original theme" checkbox and the "Link slides" prompt are confirmed.
5. The default layout names of Google's default theme (Title slide, Section header, Title and body, Title and two columns, Title only, One column text, Main point, Section title and description, Caption, Big number, Blank).
6. The exact retirement date of the Explore panel: SlideModel gives January 30, 2024, Chrmbook observed the removal in mid-March 2024, and no Google page with the date was found.
7. The date Google renamed the "Present" button to "Slideshow"; Google's current help pages use "Slideshow" while the 2024 CustomGuide diagram shows "Present".
8. Whether Google Slides offers any per-object lock; the report assumes the theme-builder route is the only protection.
9. Whether Google Slides lacks slide sections in the PowerPoint sense.
10. Whether PDF and PPTX downloads from Google Slides include skipped slides.
11. Primary sources for the vendor statistics "30 hours a month", "440 hours a year", "31% of rep time" and "30% of time selling"; the Salesforce figure (60% non-selling) is the only one with a named primary report.
12. Apple's Human Interface Guidelines pages on the menu bar and toolbars could not be loaded (the browser pane denied developer.apple.com and the fetch returned only a title), so the menu-bar and toolbar rationale rests on NN/g and Google's own guidance.
13. The Material Design 3 style guide page rendered without content; the Material 1 writing page and the Material communication codelab were used instead.

## Sources

All read 2026-09-11.

Google help and Workspace pages

- https://support.google.com/docs/answer/1694830 (Add, delete and organize slides: new, duplicate, delete, skip, reorder, slide numbers, filmstrip and grid view)
- https://support.google.com/docs/answer/1696717 (Keyboard shortcuts for Google Slides)
- https://support.google.com/docs/answer/1696787 (Present slides: Slideshow button, Presenter view, shortcuts, auto-advance)
- https://support.google.com/docs/answer/1705254 (Use a template or change the theme, background or layout)
- https://support.google.com/docs/answer/7009814 (Link a chart, table or slides: Update, Link options, Linked objects, Update all)
- https://support.google.com/docs/answer/97447 (Insert or delete images and videos: sources, Replace image, drag to replace, Format options)
- https://support.google.com/docs/answer/161768 (Copy and paste text and images)
- https://support.google.com/docs/answer/2494822 (Share files from Google Drive: roles, general access, Copy link)
- https://support.google.com/drive/answer/2494893 (Stop, limit or change sharing: gear settings, expiration, Remove access)
- https://support.google.com/docs/answer/190843 (See what has changed in a file: Last edit, version history, named versions)
- https://support.google.com/docs/answer/65129 (Use comments, action items and emoji reactions)
- https://support.google.com/docs/answer/10540294 (Use Google Meet with Docs, Sheets and Slides)
- https://support.google.com/docs/answer/6388102 (Work on Docs, Sheets and Slides offline)
- https://support.google.com/docs/answer/183965 (Make Google Docs, Sheets, Slides and Forms public: Publish to web)
- https://support.google.com/docs/answer/14207419 (Collaborate with Gemini in Google Slides)
- https://support.google.com/docs/answer/16961475 (Generate a slide with Gemini in Google Slides)
- https://support.google.com/a/users/answer/9300133 (Google Slides cheat sheet, Workspace Learning Center)
- https://support.google.com/a/users/answer/10665800 (Create your first presentation in Slides)
- https://support.google.com/a/users/answer/9282978 (Tips for great presentations: Import slides, Keep original theme, Q&A, captions)
- https://support.google.com/a/users/answer/9313043 (What you can do with Slides)
- https://support.google.com/docs/thread/95597915 (Community thread confirming Ctrl+Shift+V pastes plain text)
- https://workspaceupdates.googleblog.com/2025/03/new-sidebar-with-design-elements-in-google-slides.html (New sidebar: templates, building blocks, images, rollout March 31 and April 21, 2025)
- https://workspaceupdates.googleblog.com/2026/04/enerate-beautiful-and-editable-slides-with-ease-in-Google-Slides.html (Gemini editable slides: Create, Enhance this slide, rollout from March 31, 2026)
- https://workspaceupdates.googleblog.com/2020/01/copy-presentation-options-slides.html (Make a copy: entire deck or selected slides, remove speaker notes)
- https://blog.google/products-and-platforms/products/workspace/new-updates-in-slides-designed-make-you-look-good/ (September 27, 2017: linked slides, grid view, skip slide, diagrams, add-ons)
- https://m1.material.io/style/writing.html (Material writing guidelines)
- https://codelabs.developers.google.com/codelabs/material-communication-guidance (Material communication principles for UX writing)
- https://developers.google.com/style/ui-elements (Google developer documentation style: UI element labels, menu paths, tooltips)

Interface descriptions and tutorials

- https://www.computerworld.com/article/1658651/how-to-use-google-slides.html (Menu order, toolbar behaviour, filmstrip, notes, top-right buttons, home page)
- https://www.customguide.com/cheat-sheet/google-slides-quick-reference.pdf (2024 screen diagram and shortcut list)
- https://www.customguide.com/course/google-slides/how-to-insert-tables-into-google-slides (Insert > Table, Format > Table rows and columns)
- https://www.brightcarbon.com/blog/google-slides-ultimate-guide/ (Interface, contextual toolbar, paint format, linked charts, font and animation limits)
- https://www.brightcarbon.com/blog/editing-themes-and-layouts-in-google-slides/ (Theme builder, master and layouts, Apply layout, fixed theme elements)
- https://slidestack.com/blog/how-to-make-and-customize-charts-in-google-slides (Insert > Chart types, linked sheet, Update)
- https://slidestack.com/blog/how-to-easily-add-duplicate-move-delete-or-hide-slides-in-google-slides (Right-click items, crossed-out eye on skipped slides, multi-select)
- https://slidestack.com/blog/how-to-arrange-and-align-objects-in-google-slides-tips-and-tricks (Arrange menu, guides, snap to grid)
- https://slidestack.com/blog/advantages-and-disadvantages-of-using-google-slides-when-creating-presentations (Advantages and disadvantages list)
- https://www.slideegg.com/blog/google-slides-tutorials/how-to-add-duplicate-move-delete-or-hide-slides-in-google-slides-complete-guide/ (Slide management steps and shortcuts)
- https://www.simpleslides.co/blog/how-to-apply-layout-for-a-slide-in-google-slides (Layout button and Slide > Apply layout)
- https://www.howtogeek.com/748657/how-to-use-speaker-notes-in-google-slides/ (Speaker notes pane, View > Show speaker notes, Presenter view window)
- https://slidesgo.com/slidesgo-school/google-slides-tutorials/how-to-add-and-work-with-speaker-notes-in-google-slides (Presenter view contents: Timer, Previous and Next, Audience Tools)
- https://alicekeeler.com/2017/11/20/google-slides-link-presentations/ (Link slides or Do not link prompt, manual Update per slide)
- https://slidemodel.com/download-a-google-slides-presentation/ (File > Download formats and PPTX caveats)
- https://slidemodel.com/does-google-slides-have-design-ideas/ (Explore discontinued January 30, 2024)
- https://www.chrmbook.com/rip-explore-tool/ (Explore removal observed March 2024, tool finder)

Frustrations and comparisons

- https://thepowerpointblog.com/the-good-the-bad-the-missing/ (Good, bad and missing in Google Slides versus PowerPoint)
- https://www.softwareadvice.com/presentation/google-slides-profile/reviews/ (Reviewer pros and cons)
- https://slideuplift.com/blog/google-slides-vs-powerpoint/ (Feature comparison and recommendations)
- https://elements.envato.com/learn/powerpoint-vs-keynote-vs-google-slides-best-presentation-software (Three-way comparison)
- https://presentersarena.com/tools/powerpoint-vs-google-slides-vs-keynote-the-ultimate-2026-showdown (2026 comparison, offline and PPTX notes)

Usability guidance

- https://www.nngroup.com/articles/progressive-disclosure/ (Definition, two-stage design, staged disclosure, rationale)
- https://www.nngroup.com/articles/contextual-menus/ (Contextual menus duplicate the main menu, fewer than 10 to 12 items)
- https://www.nngroup.com/articles/contextual-menus-guidelines/ (Ten guidelines for contextual menus)
- https://www.nngroup.com/articles/top-10-application-design-mistakes/ (Feedback, inconsistency, defaults, unlabelled icons, modals, junk-drawer menus)
- https://www.nngroup.com/articles/menu-design/ (Seventeen menu design guidelines, familiar terminology, conventional patterns)
- https://lawsofux.com/jakobs-law/ (Jakob's law statement and takeaways)

Sales workflow and statistics

- https://www.salesforce.com/sales/state-of-sales/sales-statistics/ (60% non-selling time, 8 tools, 42% overwhelmed, 45% less likely to hit quota)
- https://www.sifthub.io/blog/sales-enablement-statistics (440 hours per year on content, 78% lack access, 40% recreation)
- https://www.duarte.com/blog/how-to-create-an-effective-sales-enablement-deck/ (30 hours per month on content, enablement deck practice)
- https://www.thedigideck.com/how-to-keep-sales-decks-on-brand-and-measurable/ (How reps go off-brand, what orgs need, 31% time on content)
- https://www.seismic.com/enablement-explainers/how-to-create-the-perfect-sales-pitch-deck/ (Pitch deck anatomy, Guided Assembly, Slides plugin)
- https://www.seismic.com/blog/the-future-of-sales-enablement-is-personalization/ (83% not personalisable, McKinsey 71% and 76%)
- https://www.highspot.com/blog/sales-presentation/ (Tailoring per persona, 48% digital sales rooms, State of Sales Enablement 2025)
- https://www.highspot.com/blog/how-to-create-a-sales-pitch-deck/ (Template and per-opportunity customisation)
- https://insyncr.com/article/personalized-sales-presentations-the-complete-guide-for-b2b-teams-in-2026 (1.5 to 3 hours per QBR deck, 40 decks 60 to 120 hours, fields that change)
- https://federicopresicci.com/blog/sales-enablement/sales-enablement-statistics/ (46% too much time personalising, 33% off-brand)
