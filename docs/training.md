# Training

This page is the walkthrough behind Help > Training. It expands the ten tasks of the Help dialog into steps, names the agent commands that do the same work, and ends with the keyboard shortcuts, which are read from the editor's key table at build (`packages/chrome/src/menus/keys.ts`), so the list on this page is the list the editor binds. The four skills and the agent index are linked at the end. Source: `docs/training.md`, rendered by `apps/studio/src/routes/help.training.tsx`.

## The ten tasks

The tasks come from the Help dialog (`packages/chrome/src/dialogs/Help.tsx`), one section each.

### Open a presentation

1. Open the home page and click the presentation's card. Every presentation on this Turboslide is listed there, the most recent first.
2. Or press `Cmd+O` in any presentation and pick one from the Open dialog.
3. From a terminal, `turboslide deck info --deck decks/<id>` prints the title, the sections and the current revision.

### Make a copy for a prospect

1. File > Make a copy > Entire presentation.
2. Type the new name and press Enter. The copy opens in a new tab with its own history.
3. From a terminal, `turboslide deck copy <id> --name "<name>"` does the same.

### Change a name across the deck

1. Edit > Find and replace, or `Cmd+Shift+H`.
2. Type the old name in Find and the new one in Replace with. The count of matches and the slides that carry them read under the field.
3. Replace changes the current slide, Replace all every slide and the notes, each as one write that one Undo takes back.
4. From a terminal, `turboslide text replace-all --find "<old>" --replace "<new>"`.
5. Search the menus (`Option+/`) also lists the text of the presentation: type a few words and the group Text in this presentation shows up to five slides that carry them, with Find and replace prefilled as its first row.

### Swap a logo

1. Drop the file on the picture, or right-click the picture and choose Replace image.
2. The new picture keeps the box, the crop and the dither of the old one.
3. From a terminal, `turboslide asset add <file>` then `turboslide picture set <slideId>#<blockId> --asset <id>`.

### Add, duplicate, delete and reorder slides

1. `Ctrl+M` adds a slide after the current one with the layout picked last.
2. `Cmd+D` duplicates the selected slides, Delete removes them.
3. Drag a card in the filmstrip to move it; the drop line shows where it lands.
4. From a terminal, `turboslide slide add`, `slide duplicate`, `slide remove` and `slide move` take the slide id.

### Hide slides that do not apply

1. Select the cards in the filmstrip, right-click and choose Skip slide.
2. A skipped slide stays in the file, leaves the show and every download unless the download asks for it.
3. From a terminal, `turboslide slide skip <slideId>` and `slide unskip <slideId>`.

### Update a table or a big number

1. Click a cell and type. Tab moves to the next cell and Enter to the cell below.
2. The Format options panel's Table section sets the border, the fill of a cell and the edges the border applies to (All, Outer, Inner, Top, Bottom, Left, Right, Horizontal or Vertical).
3. From a terminal, `turboslide table set-cell <slideId>#<blockId> --at r,c --text "<text>"`.

### Write a talk track

1. Click under the slide where it reads Click to add speaker notes and type. The notes save after a pause of 400 ms.
2. Tools > Dictate speaker notes opens the microphone box over the notes: pick the language, press the microphone button and speak. The sentence under the button says whether the speech stays on this device or goes to the browser's speech service.
3. Autocorrect runs in the notes as it does on the slide: a misspelling from the correction list, a sentence's first letter, `(c)` and the other substitution rows, and the straight quotes. A Backspace right after a correction takes the correction back alone.
4. From a terminal, `turboslide slide set <slideId> /notes "<text>"`.

### Present over a call

1. The Slideshow button starts the show from the current slide; its arrow offers Presenter view and Start from beginning.
2. Presenter view opens a second window with the notes, the timer and the next slide; share the slideshow window in the call.
3. From a terminal, `turboslide present --deck decks/<id>` prints the address of the show.

### Send a PDF or a link

1. Share > Copy link under View link gives a link anyone can open.
2. File > Download > PDF Document writes the PDF; the other formats are PowerPoint, the web page, the ODP file and the SVG of one slide.
3. From a terminal, `turboslide export decks/<id> --mode native --out <folder>` and `turboslide export pdf decks/<id> --out <file>`.

## Spelling, language and preferences

- Tools > Spelling > Spell check opens the card at the top right with the misspelt word and up to five suggestions. Change writes the picked one, Change all every occurrence, Ignore skips, Ignore all skips the word for the session, and Add to dictionary keeps the word in your personal dictionary. `Cmd+'` and `Cmd+;` step through the misspellings.
- Tools > Spelling > Underline errors marks every misspelling on the slides in view; Personal dictionary lists your words.
- File > Language sets the presentation's language. It picks the dictionary, the quote style and the `lang` attribute the browser reads. Seven languages ship a dictionary: English (United States), English (United Kingdom), Español, Français, Nederlands, Português (Brasil) and Português (Portugal).
- Tools > Preferences holds the autocorrect switches, the autofit defaults, the measurement unit and the substitution table. The record follows your account, so a second browser reads the same choices.
- Tools > Dictionary looks a word up. The panel shows the definitions where the studio proxies them, and the Wiktionary page otherwise.
- From a terminal, `turboslide spelling check --json`, `turboslide dictionary add <word>`, `turboslide prefs set /units cm`, `turboslide deck set /language fr` and `turboslide text autocorrect --dry-run`.

## Accessibility

- Tools > Accessibility settings > Turn on screen reader support (`Cmd+Option+Z`) draws the Accessibility menu with Verbalize selection (`Cmd+Option+X`), Verbalize selection formatting (`Cmd+Option+A then F`) and Verbalize from cursor location (`Cmd+Option+R`). The sentences go to a status region every screen reader speaks.
- Turn on braille support (`Cmd+Option+H`) names each filmstrip card by its number, title and layout instead of its text.
- Speak selection aloud, a Turboslide row off by default, also speaks the sentences through the browser's speech synthesis.

## Chat

Join chat in the collaborators menu opens the Chat panel while someone else is in the presentation. Messages are not saved: leave a comment for something that should stay. Commenters and editors send; viewers read.

## Agents

Every capability on this page is an action an agent runs the same way: `turboslide <command>` on a checkout, the MCP tools of `turboslide mcp`, the HTTP surface under `/api/actions/<id>` and `window.turboslide.studio.invoke(id, input)` in the editor. The index for agents is `/llms.txt` and the long guide `/llms-full.txt`; the four skills are turboslide-create, turboslide-studio, turboslide-api and turboslide-verify under `skills/` in the repository.
