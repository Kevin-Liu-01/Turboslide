# Updates

What changed in Turboslide, newest first. Every release appends one entry with the date and the user facing changes: the menu rows that came into use, the actions agents gained and the fixes people asked for. `scripts/updates-from-model.mjs <tag>` prints a draft of an entry from the rows whose status changed since a tag and the actions added, so no count here is typed by hand. Source: `docs/updates.md`, rendered by `apps/studio/src/routes/help.updates.tsx`; the counts below carry the command that produced them.

## 2026-09-15

The text tools, the help pages and chat, from the Google Slides parity work of `docs/gslides-parity/SPEC-5.md` section 7 and section 10.

### What you can do now

- Tools > Preferences: the General tab with the five autocorrect switches, the autofit defaults and the measurement unit, and the Substitutions tab with the twelve default rows and your own. The record follows your account.
- Autocorrect as you type, on the slide and in the notes: sentence capitals, the correction list, links, lists, smart quotes per language and the substitution table. Undo or a Backspace right after a correction takes the correction back alone.
- Tools > Spelling > Spell check with Change, Change all, Ignore, Ignore all and Add to dictionary; Underline errors on every text box in view; the Personal dictionary dialog; `Cmd+'` and `Cmd+;` step through the misspellings. Seven languages ship a dictionary.
- File > Language sets the presentation's language; the tag reaches the slide, the PowerPoint file and the ODP file.
- Tools > Dictate speaker notes over the browser's speech recognition, with the on device path where the browser offers it and a sentence saying where the audio goes.
- Tools > Dictionary as a side panel with definitions from Wiktionary, or a link to the page where the studio does not proxy them.
- Search the menus lists the text of the presentation and offers Find and replace prefilled.
- Tools > Accessibility settings: Turn on screen reader support draws the Accessibility menu with the three Verbalize rows and the navigation rows; Turn on braille support names the filmstrip cards by number, title and layout; Speak selection aloud is a Turboslide addition, off by default.
- Help > Training and Help > Updates, the two pages you are reading.
- View > Guides > Edit guides with a colour per guide; Format > Align & indent > Indentation options with the first line and hanging indents; List options with Restart numbering and Edit prefix and suffix; the cell border edge picker in the Table section; Delete this and older versions and Delete history in the version history; Star on the title row with a Starred view.
- Join chat opens a Chat panel over the room. Messages are not saved. Leave a comment for something that should stay.
- The special characters dialog gained a drawing box: draw a symbol and pick from the best guesses.

### For agents

New actions, each with a CLI command, an MCP tool, an HTTP path and a window handler: `prefs.get`, `prefs.set`, `text.autocorrect`, `spelling.check`, `spelling.replace`, `spelling.ignore`, `dictionary.add`, `dictionary.remove`, `dictionary.list`, `dictionary.lookup`, `accessibility.verbalize`, `chat.send`, `chat.list`, `chat.clear` and `version.delete` (fifteen rows, `packages/schema/src/actions.ts` GS5_ACTION_IDS of this lane). Widened: `deck.set /language`, `deck.guides` with `colors`, `text.indent` with `firstLine` and `hanging`, `text.list` with `start`, `prefix` and `suffix`, `table.cellStyle` with `edges`.
