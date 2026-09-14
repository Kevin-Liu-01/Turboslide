# Text tools for round five: autocorrect, substitutions, preferences, spell check, language, dictation, the Accessibility menu and Dictionary

Written 2026-09-14 for the Turboslide round five parity work. Every repository fact was read at main d5d7f07 with `git show d5d7f07:<path>`; the working tree carries round four's uncommitted edits and was not consulted. Every external fact carries a source key from the Sources section and the date it was read (2026-09-14 for all of them). Nothing was checked inside a signed in Google account. No Google icon, label artwork or dialog screenshot is reproduced; Google's labels are quoted as text because parity requires the words.

Sibling reports this one builds on: report 02 (`02-media-templates-import-page.md`, sections d.3, d.4, d.5 and its Unverified list) recorded Google's dialogs, labels and shortcuts; report 03 (`03-later-rows-and-edit-theme.md`, section 1 and section 8 decisions 4 and 6) classified the rows; report 07 (`07-turboslide-inventory-5.md`, sections 1.3, 2, 9.2, 9.3) lists the markup, the actions and the menu rows. This report researches the engineering those reports left open and designs the capabilities as actions.

## Summary of decisions

1. The browser exposes no spelling results to a page. MDN calls the `spellcheck` attribute "merely a hint", `::spelling-error` styles only what "the user agent has flagged", and no interface returns the flagged ranges or the suggestions (S1, S2). A spell check card that walks a deck therefore needs a dictionary in the page. The recommended engine is nspell (MIT, 42 KB unpacked, Hunspell compatible) in a Web Worker on the client and in Node for the CLI and MCP, with wooorm's `dictionary-*` packages loaded lazily per deck language (S9, S13).
2. Dictionaries with permissive or weak copyleft licences ship at once: en (MIT AND BSD), en-GB (MIT AND BSD), fr (MPL-2.0), pt and pt-PT (LGPL or MPL options), nl (BSD-3-Clause OR CC-BY-3.0), es (the MPL-1.1 option). German and Italian are GPL only and go to Kevin (S13).
3. Autocorrect runs as a pure rule engine (`packages/schema/src/autocorrect.ts`) called from InlineText's input path at a trigger character; a correction lands as its own `text.splice` burst so the first Cmd Z and a Backspace right after it revert the correction alone, as Google documents (G11 via R09).
4. Turboslide writes its own substitution table and exception lists. LibreOffice's `acor_en-US` lists are MPL-2.0 files whose file level obligations would follow any copy; the useful defaults (copyright, registered, trademark, fractions, arrows, ellipsis, the en dash) are twelve rows Turboslide can write itself, and its abbreviation exceptions are a short factual list (S16, S17, S18, S19).
5. Preferences live per principal on the round three principal record (a new `preferences` field beside `notificationSettings` and `livePointers`), mirrored in `localStorage` for first paint and stored as a file under `.turboslide/principals/` on a checkout, the same three homes the record has today. `prefs.get` and `prefs.set` address them by JSON pointer.
6. `Deck.language` becomes a BCP 47 tag on the manifest, written by `deck.set /language`, defaulting to `en-US` when absent; it picks the dictionary, the quote style, the `lang` attribute of the sheet and the HTML export, `a:rPr lang` in the Editable text PPTX and `fo:language` and `fo:country` in ODP. File > Language flips from Omit to Now as a submenu of the nine languages with a dictionary.
7. Dictate speaker notes flips to Now over the Web Speech API: Chrome 25 and Safari 14.1 with the `webkit` prefix, Edge per Google's page, Firefox disabled by default (S6, G4). Chrome sends audio to a server by default; `processLocally` with `available()` and `install()` keeps it on the device where a language pack exists (S4, S5). The box states both. The write is `slide.set` on `/notes`.
8. The Accessibility menu draws while "Turn on screen reader support" is on, with Google's three attested rows and the four navigation rows; verbalisation goes through an `aria-live` region (what a screen reader speaks), with `speechSynthesis` as a Turboslide addition off by default. The chord grammar of `keys.ts` already expresses "hold Ctrl+Alt, press A then F" as `Ctrl+Cmd+A then F` (K1 lines 397 to 398), so no grammar change is needed. Braille flips to Now with its one documented effect (the filmstrip announces number, title and layout instead of the slide's content); the screen magnifier stays omitted.
9. Dictionary: the recommendation for report 03 decision 4 is the zero infrastructure form, a "Dictionary" row that opens the deck language's Wiktionary page in a new tab, with the Wiktionary REST definition endpoint as the panel form if Kevin wants a panel (CC BY-SA content, HTML to sanitise, an egress allow list entry). Open English WordNet (CC BY 4.0) is the shipped option and costs a server side data file; the Free Dictionary API is not recommended (a GPL-3.0 project of unclear data provenance whose maintainer reports hosting strain).
10. Explore stays omitted (retired 2024-01-30); the Search the menus row is already the tool finder, and the one addition is that a query matching deck text offers Find and replace prefilled, as Google's tool finder does.

## 1. Autocorrect

### 1.1 Facts

| Fact | Source | Verified or unverified |
| --- | --- | --- |
| Google Slides: "Autocorrect checks capitalization and creates links and lists." Specific corrections are turned off under Tools > Preferences > General; substitutions under Tools > Preferences > Substitutions. | G1 | Verified (Google) |
| Google Docs and Slides: autocorrect can "fix spelling and capitalization" and "also find links, lists, and quotes"; the languages are English, French, German, Portuguese and Spanish. | G2 | Verified for the sentence; the page's body describes Docs and says "You can only manage Autocorrect in Google Docs on a computer" |
| The Docs autocorrect page prints the checkboxes "Automatic capitalization", "Spelling corrections", "Link detection" and the master "Automatic substitution"; it offers "Always correct to" on right click and says clicking "Undo" after a correction disables that correction permanently. | G2 | Verified for Docs; not stated for Slides |
| Third parties print the Slides General tab as "Automatically detect links" and "Automatically capitalise words" with Smart Compose and Smart Reply toggles. | T1 | Secondary; the exact Slides set stays unverified (report 02) |
| Automated lists: "*" or "-" as the first character followed by a space starts a bulleted list; "1)" or "a." followed by a space starts a numbered list, "as would other permutations like I., (A), etc."; the feature is on by default and disabled in Tools > Preferences. | G11 via R09 A7 | Verified (Google, 2014, covers Slides) |
| "Pressing the backspace button immediately after any autocorrection, including automated lists, will undo it", with "(c)" to the copyright sign as the example. | G11 via R09 A7 | Verified (Google) |
| LibreOffice's AutoCorrect options: Use replacement table; Correct TWo INitial CApitals; Capitalize first letter of every sentence; Automatic *bold*, /italic/, -strikeout- and _underline_; URL Recognition; Replace dashes ("A - B" becomes an en dash, "A--B" an em dash, "N--N" an en dash); Ignore double spaces; Correct accidental use of cAPS LOCK key; Bulleted and numbered lists; and the rest. | S16 | Verified (LibreOffice help) |
| LibreOffice's en-US autocorrect folder holds `DocumentList.xml` (the replacement table), `SentenceExceptList.xml` (138 abbreviations after which the next word stays lowercase, "a." to "z." plus "acct.", "approx.", "e.g.", "etc.", "i.e.", "Mr.", "Mrs.", "vs." and the rest) and `WordExceptList.xml` (10 words that keep two initial capitals: CDs, GHz, ICs, LPs, MCs, MHz, OOo, PCs, THz, TVs). | S17, S18, S19 | Verified (the files were read); the DocumentList entry count of about 2,800 with about 800 emoji `:name:` rows is the reader's estimate and unverified |
| LibreOffice is released "subject to the terms of the Mozilla Public License v2.0", with contributions dual licensed MPL-2.0 and LGPLv3+ and components under other licences. | S20 | Verified |
| Word's AutoCorrect object names the rules: CorrectCapsLock, CorrectDays, CorrectInitialCaps, CorrectSentenceCaps, CorrectTableCells, ReplaceText, ReplaceTextFromSpellingChecker, and the exception lists FirstLetterExceptions, TwoInitialCapsExceptions, OtherCorrectionsExceptions. | S21 | Verified (Microsoft Learn); the dialog's checkbox strings were not read on a Microsoft page |
| InlineText: typing becomes one `text.splice` per 100 ms pause (`TEXT_BURST_MS`), the `input` listener runs `markGtInEditable`, `onInput`, `scheduleBurst`, `reportCaret`; `flushBurst` reads the DOM as markup and diffs; the paste handler inserts plain text through `execCommand('insertText')`. | K2 lines 68, 1104 to 1118, 1366 to 1371, 1414 to 1423 | Verified |
| `textBurstMutation` writes the plain diff as `text.splice` and a marks only change as `text.replace`; a title or statement field travels as `slide.set`. | K2 lines 329 to 370 | Verified |
| `spliceText` inserts with the flags of the run it continues and a `\n` in the insertion starts a paragraph; `escapeRunText` escapes `*`, `[` and a standalone GT on serialisation. | K3 lines 401 to 424, 911 to 943 | Verified |
| `CASE_MODES` and `titleCase` exist; `LINK_SCHEMES` are https, http, mailto and tel; `LIST_MARKERS` are rule, bullet and number with `BULLET_PRESETS` and `NUMBER_PRESETS`. | K3 lines 624, 1032, 1060 to 1124 | Verified |
| `PROPER_NOUNS`, `PRODUCT_TOKENS`, `METAPHOR_WORDS`, `EM_DASH`, `DOMAIN_PATTERN` and `allowedCapitals()` are the copy lists the linter reads. | K4 | Verified |

### 1.2 The Slides General tab in Turboslide

Google's own Slides page attests three functions (capitalization, links, lists) and G2 adds spelling and quotes for "Google Docs and Slides". Turboslide's General tab carries five checkboxes, all on by default, labelled with Google's function words in sentence case: "Automatically capitalize words", "Automatically correct spelling", "Automatically detect links", "Automatically detect lists" and "Use smart quotes". The last two strings are the third party spellings report 02 recorded and stay flagged `unverified` in the menu fixture until a Google page prints them. Smart Compose and Smart Reply are Google services and are not drawn. Below the checkboxes sit "Use custom autofit preferences" (report 02 d.3; G21: "Do not autofit", "Shrink text on overflow" the placeholder default, "Resize shape to fit text" the text box default) and "Use measurement unit preferences" (Inches, Centimeters, Pixels; G18), whose values report 08 consumes for the rulers and readouts (SPEC-2 0.82).

### 1.3 The rule set

Each rule fires on a trigger keystroke (a space, Enter, or a closing punctuation mark such as `.`, `,`, `;`, `:`, `!`, `?`, `)`), never mid word, and each names the write it makes. The rule engine is pure: `autocorrect(paragraph: string, caret: number, trigger: string, prefs: AutocorrectPrefs, language: string): Correction | null`, where a `Correction` is `{ at, remove, insert, rule }` in plain offsets of the paragraph, so `inline-text.test.ts` style tests pin it in Node.

| Rule | Fires when | Exceptions | Write |
| --- | --- | --- | --- |
| Sentence capital | The trigger ends the first word of a paragraph or the first word after `.`, `!` or `?` followed by a space, and the word starts with a lowercase letter. | The preceding token is an abbreviation in Turboslide's sentence exception list (its own list in the categories of S18: single letters with a period, months, weekdays, "e.g.", "i.e.", "etc.", "vs.", "approx.", "Mr.", "Mrs.", "Dr.", "No."); the word is in `PRODUCT_TOKENS` (`gt-next`, `npx`), in the personal dictionary with a lowercase start, or a camelCase or dotted identifier; the word is inside a link or a `panel.code` string (never a Text). | `text.splice` of one character |
| Spelling correction | The completed word is a key of the correction list (Turboslide's own list of common misspellings, about 200 rows, "teh", "adn", "recieve", "seperate", "definately") and the language is one the list covers (en only in round five). | The word is in the personal dictionary or the deck's noun list; the word is capitalised as a proper noun. | `text.splice` of the word |
| Link detection | The completed token starts with a scheme in `LINK_SCHEMES` or with `www.`, and the trigger is a space or Enter. | The token is already inside a link; the deck text is a `panel.code`; a bare domain without scheme or `www.` is not linked (the copy rule `DOMAIN_PATTERN` treats it as copy, and Google's exact rule for bare domains is unverified). | `text.replace` of the token range with `[token](url)` (url is `https://` plus the token for the `www.` form) |
| List detection | At the start of a paragraph in a multiline pointer the typed prefix is `-`, `*` or `•` then a space (bullet), or a numeral form `1.`, `1)`, `(1)`, `a.`, `a)`, `A.`, `I.`, `i.` then a space (number). | The block is a table cell, a title field or a shape with a single line; the marker is already set. | The same write Format > Bullets & numbering makes (`text.list` with the marker and the preset the prefix implies), then a `text.splice` removing the typed prefix |
| Smart quotes | The typed character is `'` or `"`. | Inside a link's text; the preference off; a `'` between two letters is an apostrophe and takes the closing single quote of the language. | `text.splice` replacing the one character with the opening or closing quote of the language table (1.5) |
| Substitution | The completed token equals a `from` of an enabled row of the Substitutions table (section 2). | The master checkbox off; the row off. | `text.splice` of the token |

Two rules Word and LibreOffice have and Google does not document are left out: two initial capitals and the caps lock correction. Parity means Google's set.

### 1.4 The engine over InlineText and the undo rule

The correction runs on the client inside the session, because the trigger is a keystroke and the DOM holds the plain text at that moment:

1. In the `keydown` handler of K2 (line 1273 onward), when the key is a trigger and no modifier is down, the session first calls `flushBurst()` so the typed text up to the trigger travels as its own `text.splice` burst.
2. It reads the current paragraph and caret (`selectionOffsets`, `paragraphsFromNode`), calls `autocorrect(...)`, and when a `Correction` comes back it applies it with `rewriteEditable(next)` and `restoreSelection` (K2 lines 1095 to 1102 already do this for a remote absorb), then calls `flushBurst()` again. The correction is therefore one burst of its own and one `text.splice` in the operation stream.
3. The burst callback gains a reason: `onBurst(text, { autocorrect: rule })`. The route's undo grouping (400 ms, SPEC-3 3.1) closes a group before an autocorrect burst and after it, so the first Cmd Z reverts the correction and leaves the typed word. A Backspace whose previous input was an autocorrect burst within 2 s reverts it the same way (G11) and the rule is not retried on the reverted word in that session.
4. The typed trigger character itself lands after the correction through the browser's own edit, so the caret stays where the writer expects.

Markup interactions. A typed `*` or `[` is a literal character in the DOM and `readText` escapes it (`escapeRunText`), so the list rule sees the plain asterisk and the display run rule of the markup is never triggered by typing; the substitution and quote rules operate on plain offsets and `spliceText` keeps the run flags of the character replaced. A standalone `GT` typed becomes the mark at once through `markGtInEditable`; the capital rule never touches it because `GT` is in `allowedCapitals()`. Inside an anchor (`linkAtCaret`) the quote and substitution rules are skipped so a URL's `'` or `--` stays literal. Speaker notes are a textarea (`NotesPane.tsx`, `slide.set /notes` per 400 ms) and take the same engine on the same triggers, writing `slide.set` with the corrected string; the notes field keeps the browser's `spellcheck` too (K5 line 203).

Agent form. Agents write through `text.splice` and `text.replace` and are not autocorrected. `text.autocorrect` (section 11) applies the enabled rules to a Text, a slide or the deck with a dry run listing the corrections, the way an agent runs `fix.run` for lint.

### 1.5 Quote styles per language

The table is Turboslide's; the conventions are the common typographic ones and no source in this report attests them, so the table is listed as unverified and the builder should confirm each against a style reference before shipping.

| Language | Double open, close | Single open, close |
| --- | --- | --- |
| en-US, en-GB, pt, pt-PT, nl | U+201C, U+201D | U+2018, U+2019 |
| de | U+201E, U+201C | U+201A, U+2018 |
| fr | U+00AB, U+00BB with U+202F inside | U+2039, U+203A |
| es, it | U+00AB, U+00BB | U+201C, U+201D |

Open or close is decided by the character before the caret: a paragraph start, a space or an opening bracket gives the opening form; anything else gives the closing form.

### 1.6 The licence position on LibreOffice's lists

LibreOffice's core repository, including `extras/source/autocorr`, is under the Mozilla Public License 2.0 (S20). MPL-2.0 is a file level copyleft: copying `DocumentList.xml` or the exception lists into Turboslide is permitted, but the copied files (and modifications of them) stay under MPL-2.0 and their source must be offered with attribution, while the rest of Turboslide keeps its own licence. The replacement table is also mostly noise for a slide editor (the reader estimated about 800 emoji `:name:` rows and a long misspelling list written for a word processor). The recommendation is to write Turboslide's own lists: twelve substitution defaults (section 2), a sentence exception list of about 60 abbreviations in the categories S18 shows, no two initial capitals list (the rule is not Google's), and a correction list of about 200 common English misspellings written from Turboslide's own knowledge. The lists live in `packages/schema/src/autocorrect-lists.ts` under the repository's licence.

### 1.7 Tests

- `autocorrect.test.ts`: a table of `[paragraph, caret, trigger, prefs, language] -> Correction | null` rows for every rule, its exceptions and its language forms; the "first undo reverts the correction" contract as a pure test of the burst sequence (`textBurstMutation` producing two splices, the second tagged); the escapes (`\*` and `\[` stay literal after a correction); the GT word untouched.
- `inline-text.test.ts` gains rows for the trigger handling order (flush, correct, flush).
- The e2e `text-tools.spec.ts` (section 10) types `teh quick(c) brown` and asserts the corrected text, then Cmd Z and asserts the correction alone reverted.

## 2. Substitutions

### 2.1 Facts

| Fact | Source | Verified or unverified |
| --- | --- | --- |
| Google's Substitutions tab has a master checkbox ("Automatic substitution") turning all substitutions off, per row checkboxes, and "Remove" per row; a user adds pairs. | G2, report 02 d.3 | Verified for Docs; the Slides dialog is the same tab per report 02 (G20, G23) |
| Google's default Replace and With pairs are not published on a page read. BrightCarbon names copyright and trademark symbols and superscript and subscript pairs as what people add. | T1, report 02 | Unverified |
| LibreOffice's en-US table replaces `-->` with U+2192, `<--` with U+2190, `<->` and `<-->` with U+2194, `1/2` with U+00BD, `1/4` with U+00BC, `3/4` with U+00BE, and with the `.*` wildcard `(C)` with U+00A9, `(R)` with U+00AE, `(tm)` with U+2122, `->` with U+2192 and `...` with U+2026. | S17 | Verified |
| Google's 2014 post gives "(c)" to the copyright sign as the autocorrection example. | G11 via R09 A7 | Verified |
| Turboslide's copy rules forbid the em dash (`copy/no-em-dash`, `EM_DASH` in copy.ts) and the exclamation mark. | K4 lines 51 to 53; rules.json | Verified |

### 2.2 Turboslide's default table

| Replace | With | On by default |
| --- | --- | --- |
| `(c)` | U+00A9 copyright sign | yes |
| `(r)` | U+00AE registered sign | yes |
| `(tm)` | U+2122 trade mark sign | yes |
| `1/2` | U+00BD | yes |
| `1/4` | U+00BC | yes |
| `3/4` | U+00BE | yes |
| `->` | U+2192 rightwards arrow | yes |
| `<-` | U+2190 leftwards arrow | yes |
| `<->` | U+2194 left right arrow | yes |
| `=>` | U+21D2 rightwards double arrow | yes |
| `--` | U+2013 en dash | yes |
| `...` | U+2026 horizontal ellipsis | yes |

There is no em dash row: the copy rule forbids it on the sheet and Kevin's writing rules avoid it; a person who wants one adds the row. Matching is exact on the completed token (the whole token equals `from`), case sensitive, so `(C)` is not replaced unless a row says so; LibreOffice's `.*` prefix wildcard is not offered. Google's default list stays unverified; the table is Turboslide's.

### 2.3 The dialog and the agent form

The Substitutions tab draws the master checkbox "Automatic substitution", a two column table (Replace, With) with a checkbox per row and a "Remove" button per row, and an empty first row whose two fields add a pair on Enter (Google's dialog adds from the top row; the label "Add" is not printed by Google and Turboslide uses the empty row). Rows are stored in `preferences.substitutions.rows` as `{ from, to, on }` in the order shown; a removed default row is remembered as removed (`preferences.substitutions.removedDefaults: string[]`) so a later default list change does not resurrect it.

An agent edits the table through `prefs.set` with JSON pointers: `/substitutions/on` for the master switch, `/substitutions/rows/-` to append a row (the RFC 6901 `-` member), `/substitutions/rows/3/on` to toggle one, and `prefs.set` with no value to delete a row. `prefs.get /substitutions` returns the table, so an agent can read, edit and write it back in three calls.

## 3. Where preferences live

### 3.1 Facts

| Fact | Source | Verified or unverified |
| --- | --- | --- |
| The round three principal record holds `{ principalId, label, name?, avatar, linkGrants, notificationSettings, livePointers, createdAt, lastSeenAt }`; it lives in Redis when the deployment has one and as a JSON file per principal under `.turboslide/principals/` otherwise; the browser mirrors name and avatar in `localStorage` and "never as the truth". | K9 lines 130 to 146; K10 lines 1 to 3, 97 to 108; SPEC-3 0.17, 7 | Verified |
| The per browser toggles today are `STORED_SETTINGS` under the `localStorage` key `ts-editor-settings`: snapGrid, snapGuides, showIds, spellcheck, speakerNotes, showRuler, showGuides; `announce` defaults false and is not in the stored list. | K6 lines 2688 to 2740 | Verified |
| Google's "Underline errors" toggle "applies to all presentations" (per account); Preferences is per account. | G1 via R09 A6; G2 | Verified for Underline errors; Preferences per account is Google's model as the pages describe it |
| SPEC-2 12 records Preferences as "a per browser settings dialog; `units` for the rulers and readouts (0.82)". | SPEC-2 line 792 | Verified (the round two plan) |
| `notification.settings` is the existing per principal settings action pattern: a read when every field is absent, a write otherwise. | K7 `notification.settings` | Verified |

### 3.2 Recommendation

Per principal, not per browser. Google's Preferences and Underline errors follow the account, and the round three record already gives every visitor, anonymous or signed in, a server side home with a 90 day sliding TTL and a `localStorage` mirror for first paint. The dialog reads the mirror synchronously in a `useState` initializer (the layout shift rules of SPEC-3 9) and reconciles with the record's value on load; a write goes to the record and the mirror together. On a checkout the record is the JSON file under `.turboslide/principals/<id>.json`; the CLI without a hosted token acts as the checkout's local principal (`principal:local`, a record the CLI creates on first use), so `turboslide prefs set` on a laptop and the editor on `localhost:4321` read one file. Hosted, the HTTP and MCP transports resolve the caller from the token record as every account action does.

Two toggles move from the per browser list onto the record with a one time migration on first load: `spellcheck` (Underline errors) and `announce` (collaborator announcements). The other stored settings (snap, rulers, ids) stay per browser because Google keeps those per session too.

### 3.3 The record shape

```ts
type Preferences = {
  autocorrect: { capitalize: boolean; spelling: boolean; links: boolean; lists: boolean; quotes: boolean };
  substitutions: { on: boolean; rows: { from: string; to: string; on: boolean }[]; removedDefaults: string[] };
  autofit: { placeholder: 'none' | 'shrink' | 'grow'; textBox: 'none' | 'shrink' | 'grow' };
  units: 'in' | 'cm' | 'px';
  spelling: { underline: boolean; dictionary: string[] };
  accessibility: { screenReader: boolean; braille: boolean; announce: boolean; speakAloud: boolean };
  dictation: { lang?: string };
};
```

Defaults: every autocorrect rule on; substitutions on with the twelve rows; autofit `shrink` for placeholders and `grow` for text boxes (G21's two defaults mapped onto the existing `Autofit` type, report 07 1.3); units `in` (SPEC-2 0.82); underline on; dictionary empty; accessibility all off; dictation lang absent (the deck's language applies). `block.insert` of a text box without `autofit` writes the preference's value, which is the one place the autofit default is consumed; the rulers, the readouts and the Position fields read `units` (report 08).

### 3.4 The actions

`prefs.get` and `prefs.set` sit in the `account` group beside `account.setName`, since they are the caller's own settings. `prefs.get` takes an optional `path` (a JSON pointer such as `/autocorrect` or `/substitutions/rows`) and returns the value at it, the whole object when absent. `prefs.set` takes `path` and an optional `value`; an absent value deletes the member (an array element by index, a row by `/substitutions/rows/2`), and `/-` appends. Validation is the `Preferences` zod schema applied after the pointer write, so an unknown key or a bad enum value is refused as `invalid_field`. CLI: `turboslide prefs get [<path>]`, `turboslide prefs set <path> <value>` (the value parsed as JSON, then as a string). MCP: `deck_prefs_get`, `deck_prefs_set`. Window: `window.turboslide.run('prefs.set', { path: '/units', value: 'cm' })`; the editor re-renders the rulers on the returned value.

## 4. Spell check

### 4.1 Facts

| Fact | Source | Verified or unverified |
| --- | --- | --- |
| The `spellcheck` attribute "is merely a hint for the browser: browsers are not required to check for spelling errors. Typically non-editable elements are not checked for spelling errors, even if the `spellcheck` attribute is set to `true`." MDN documents no interface that returns results or suggestions. | S1 | Verified |
| `::spelling-error` "represents a text segment which the user agent has flagged as incorrectly spelled"; only colour, background, outline, text decoration, text emphasis colour, text shadow, caret colour and cursor may be styled; limited availability. | S2 | Verified |
| Chrome's Basic spell check "doesn't send the text you enter in your browser to Google"; Enhanced spell check "sends the text you enter in your browser to Google for improved spelling suggestions"; the switch is "Check for spelling errors when you type text on web pages". | S3 | Verified |
| MDN's security sentence: "The content of the element may be sent to a third party for spellchecking results." | S1 | Verified |
| Google Slides: the card offers "Change", the down arrow then "Change all", "Ignore", the down arrow then "Ignore all"; "misspelled words will be underlined in red. Right-click the word to accept or reject the suggestions."; Underline errors is a toggle; the personal dictionary is "Enter your new word. Click OK." | G1 | Verified |
| Shortcuts: "Move to next misspelling" Ctrl+' (Cmd+'), "Move to previous misspelling" Ctrl+; (Cmd+;). | K1 fixture lines 570 to 580; G24 via report 02 | Verified |
| Turboslide today: `element.spellcheck = true` for the session and removed on finish; the notes textarea has `spellCheck`; `tools.spelling.underlineErrors` toggles `data-spellcheck` on the shell root; `next-misspelling` and `previous-misspelling` are in `OMITTED_SHORTCUTS` with "Your browser marks misspellings and steps through them from its own menu"; no spelling lint rule exists. | K2 lines 1220, 1268; K5 line 203; K6; K1 lines 1093 to 1102; rules.json | Verified |
| nspell 2.1.5, MIT, "Hunspell compatible spell checker", 42,413 bytes unpacked, CommonJS with browser builds, one dependency (`is-buffer`). | S9 | Verified |
| typo-js 1.3.2, BSD-3-Clause, "A Hunspell-style spellchecker", 1,979,058 bytes unpacked (it bundles dictionaries), browser and Node. | S10 | Verified |
| hunspell-asm 4.0.2, MIT, "WebAssembly based Javascript bindings for hunspell spellchecker", 4,901,138 bytes unpacked, CJS and ESM, Hunspell fc6a952-200131. | S11 | Verified |
| harper.js 2.10.0, Apache-2.0, "The grammar checker that respects your privacy", 75,192,250 bytes unpacked, ESM, `WorkerLinter` in a Web Worker recommended for interactive apps, `LocalLinter` on the main thread; Harper "takes milliseconds to lint a document" and is "small enough to load via WebAssembly". | S12, S14, S15 | Verified for the numbers and quotes; whether its rule set covers spelling and its dialect list were not confirmed on the pages read |
| wooorm/dictionaries: 92 dictionaries, each `{ aff: Buffer, dic: Buffer }`; licences en (MIT AND BSD), en-GB (MIT AND BSD), de (GPL-2.0 OR GPL-3.0), fr (MPL-2.0), es (GPL-3.0 OR LGPL-3.0 OR MPL-1.1), pt (LGPL-3.0 OR MPL-2.0), pt-PT (GPL-2.0 OR LGPL-2.1 OR MPL-1.1), it (GPL-3.0), nl (BSD-3-Clause OR CC-BY-3.0). | S13 | Verified |
| dictionary-en 4.0.0 is 575,389 bytes unpacked, 7 files, ESM; its licence file is Kevin Atkinson's SCOWL notice: "Permission to use, copy, modify, distribute and sell these word lists ... for any purpose is hereby granted without fee", provided "as is" without warranty, with SCOWL, Ispell, 12Dicts and UKACD named. | S22, S23 | Verified |

### 4.2 The architecture that follows

The browser draws its marks only inside the focused editable element, exposes neither the flagged ranges nor the suggestions, and may send the text to a third party. A card that walks every text of a deck, offers Change all, respects a personal dictionary and steps with Ctrl+' therefore runs its own checker in the page. The browser's marks stay on during a session as today (they cost nothing and cover what the engine misses), and the engine's marks cover every other box.

### 4.3 Engines

| Name | Version | Licence | Size (unpacked) | Verdict |
| --- | --- | --- | --- | --- |
| nspell | 2.1.5 | MIT | 42 KB | Recommended. Hunspell affix semantics, `correct(word)` and `suggest(word)`, `add(word)` for the personal dictionary, runs in a Worker and in Node from the same code; CommonJS, so it is wrapped once in `packages/spelling`. |
| typo-js | 1.3.2 | BSD-3-Clause | 1.98 MB (bundled en_US) | Not recommended. It bundles its own dictionary, loads the whole dic string into memory and offers no separate dictionary packages. |
| hunspell-asm | 4.0.2 | MIT | 4.9 MB | Not recommended for round five. Real Hunspell in wasm gives the best suggestions but the loader, the wasm binary and the FS shim are heavy for a lazy client load; a candidate if nspell's suggestions prove weak in a language. |
| harper.js | 2.10.0 | Apache-2.0 | 75 MB package (the wasm binaries) | Not for spelling. A grammar checker with a Worker mode; English only; the spelling coverage was not confirmed. Listed for a later grammar card, which Google offers in Docs and not in Slides (R09 A6). |

### 4.4 Dictionaries

Sizes are the unpacked npm sizes; the gzip sizes of `index.aff` and `index.dic` were not measured (no `pnpm install` in this task) and are the builder's first measurement, with a budget of 400 KB gzip per language in `scripts/check-dictionaries.mjs`.

| Package | Language tag offered | Licence | Size | Verdict |
| --- | --- | --- | --- | --- |
| dictionary-en | en-US (the default) | MIT AND BSD (SCOWL notice) | 575 KB unpacked | Ship |
| dictionary-en-gb | en-GB | MIT AND BSD | not read | Ship |
| dictionary-fr | fr | MPL-2.0 | not read | Ship; the dictionary files stay MPL-2.0 with their notice |
| dictionary-pt | pt | LGPL-3.0 OR MPL-2.0 | not read | Ship under the MPL-2.0 option |
| dictionary-pt-pt | pt-PT | GPL-2.0 OR LGPL-2.1 OR MPL-1.1 | not read | Ship under the MPL-1.1 option |
| dictionary-nl | nl | BSD-3-Clause OR CC-BY-3.0 | not read | Ship under BSD-3-Clause |
| dictionary-es | es | GPL-3.0 OR LGPL-3.0 OR MPL-1.1 | not read | Ship under the MPL-1.1 option |
| dictionary-de | de | GPL-2.0 OR GPL-3.0 | not read | Kevin (section 12): a GPL data file distributed beside the app under its own licence, or fetched from the upstream at runtime, or not offered |
| dictionary-it | it | GPL-3.0 | not read | Kevin, as de |

Loading. The dictionaries are not in the client bundle. `packages/spelling` (new) exposes `loadDictionary(tag): Promise<{ aff, dic }>` which on the client fetches `/dictionaries/<tag>/index.aff` and `index.dic` (static files under `apps/studio/public/dictionaries/`, served with immutable caching), and on Node reads the package. The checker runs in a Web Worker (`spelling.worker.ts`): the main thread posts `{ language, words: string[] }` and receives `{ misspelled: number[], suggestions: Record<string, string[]> }`, so a 300 slide deck never blocks paint. The Worker starts when Underline errors is on and the deck has text, or when the card opens; a deck whose language has no dictionary shows the card's message "No dictionary for <language>; the browser's marks apply".

### 4.5 The walk

The walk is pure and lives in `packages/spelling/src/walk.ts`: `spellingTargets(deck, slides): Target[]` returns every Text pointer in reading order, the same order `export.text` uses (slide order, then block order, then the pointer order inside a block: `text`, `items/n/text`, table `rows/r/cells/c/text`), then the slide's `notes`, then every block `alt`. For each Text it strips the markup with `plainOf` and keeps a map from plain offsets to the pointer, so a finding's `range` is directly a `text.replace` range.

Tokens skipped: anything inside a link's URL (the link text is checked), `panel.code` (not a Text), a token containing a digit, a token with an internal capital (camelCase and dotted identifiers), a token of two to five capitals (acronyms), words of `PROPER_NOUNS` and `PRODUCT_TOKENS` and the deck's own noun extension (K4; SPEC open question 13), the caller's personal dictionary, and the session's Ignore all set. Apostrophes inside a word stay part of it (nspell handles `don't`). Words are split on Unicode non letters (`\p{L}` runs with `'` and U+2019 allowed inside).

Finding shape: `{ slideId, blockId?, path, range: [start, end], word, suggestions: string[] }`; for notes `path` is `/notes` with no `blockId`, for alt text `/alt`.

### 4.6 The card

A card over the canvas at the top right (Google's position, report 02 d.4), 320 px wide, with the misspelt word in ink, up to five suggestions as a list (the first selected), "Change" with a down arrow whose menu holds "Change all", "Ignore" with a down arrow holding "Ignore all", and a Turboslide row "Add to dictionary" (`turboslide: true`; Google's Slides page attests it only through the Personal dictionary dialog). The card selects the block and scrolls the slide into view as it steps; Ctrl+' and Ctrl+; (Cmd on Mac) step next and previous while the card is open or while a text session has engine marks, so the two fixture rows leave `OMITTED_SHORTCUTS`. Change writes `spelling.replace` (one `text.replace`); Change all writes one `text.replace` per finding of the same word across the deck in one write; Ignore skips; Ignore all adds to the session set; Add to dictionary calls `dictionary.add` and skips. When the walk finds nothing the card says "No misspellings found". The right click menu on a marked word (Google: "Right-click the word to accept or reject the suggestions") lists the suggestions and "Add to dictionary".

### 4.7 Underline errors as the renderer's own marks

Google underlines everywhere; the browser underlines only the focused box. With Underline errors on, the editor runs the walk for the slides in view (the current slide and its neighbours in the filmstrip's lease of loaded slides) and paints a wavy underline on every finding through the CSS Custom Highlight API (`CSS.highlights.set('misspelling', new Highlight(...ranges))` with `::highlight(misspelling) { text-decoration: red wavy underline }`), which needs no DOM change, so the exports and the HTML build never carry a mark. The Highlight API's availability in the three engines was not read for this report and is listed as unverified; the fallback is a `<span class="ts-misspelling">` wrapper written by an editor only decorator over the rendered runs (never by `@turboslide/render`), removed before any read of the DOM. During a session the browser's own marks also apply to the focused run, as today (`element.spellcheck = true`). The toggle stays `tools.spelling.underlineErrors` with `toggle('spellcheck')`, now read from `preferences.spelling.underline`; its `doc` changes to "Red marks under misspellings in every text box and the notes".

### 4.8 The personal dictionary

`preferences.spelling.dictionary` on the principal record (section 3), a sorted array of words, case sensitive; the dialog is Google's ("Personal dictionary", a field, a list with a remove control per word, OK). On a checkout the file is the local principal's record under `.turboslide/principals/`, and the CLI also honours `.turboslide/dictionary.txt` (one word per line) when present so a repository can check in a shared word list; the walk unions both with the deck's noun extension.

### 4.9 The actions

- `spelling.check` (group `slide`, read only, transports all): input `{ slideIds?, notes?: boolean, alt?: boolean, language?: string }`; output `{ language, dictionary: 'loaded' | 'missing', findings: Finding[] }`. CLI `turboslide spelling check --slides <ids> --notes --json`; MCP `deck_spell_check`; window: runs the walk in the Worker and opens the card on the findings.
- `spelling.replace` (group `slide`, mutates, transports all): input `{ slideId, blockId?, path, range, text, all?: boolean, baseRevision }`; with `all` the server finds every occurrence of the word at `range` across the deck and writes one `text.replace` per occurrence in one write. CLI `turboslide spelling replace <slideId>#<blockId> <path> --range <a,b> <text> --all`; MCP `deck_spell_replace`.
- `dictionary.add`, `dictionary.remove`, `dictionary.list` (group `account`, the first two mutate the record, not the deck): input `{ word }`; output the list. CLI `turboslide dictionary add <word>`, `remove <word>`, `list`; MCP `deck_dictionary_add`, `deck_dictionary_remove`, `deck_dictionary_list`.
- Ignore and Ignore all are card state (a `window` only `spelling.ignore` with `{ word, all }` for the window API tests).

### 4.10 A spelling lint rule

Recommended: `text/spelling` at severity 1 with no fix, added to `rules.json` and implemented in `packages/lint/src/static/spelling.ts` over `blockTexts` and `slideTexts` (R09 B8), using nspell in Node with the deck's language, the caller's dictionary and the deck's noun list, and skipped with a note when the language has no shipped dictionary. Severity 1 keeps `lint.run` green for a deck with a brand name the dictionary lacks; the finding's message carries the first suggestion. The rule is off in the `judge.bundle` scoring so a typo does not move the design score.

### 4.11 Tests

- `walk.test.ts`: reading order over the fixture deck of `packages/lint/src/fixtures/deck.ts`, the skip rules (URL, code panel, digits, camelCase, acronyms, proper nouns, personal words), the plain to pointer range mapping over marks and links.
- `dictionary-load.test.ts`: every shipped tag loads in Node, `correct('the')` true and `suggest('teh')` includes `the`; the gzip size budget per language.
- `card.test.tsx`: the four buttons and the Turboslide row; Change writes one `text.replace`; Ignore all persists in the session.
- The e2e in section 10 walks a seeded deck with two misspellings.

## 5. Language

### 5.1 Facts

| Fact | Source | Verified or unverified |
| --- | --- | --- |
| Google's File > Language is a submenu listing languages; it changes the spell check language, and switching from US to UK English switches the measurement units from imperial to metric; non Latin languages add the Input tools menu. | R01 line 97 (G32, T09) | Verified (round one) |
| `file.language` is Omit at d5d7f07 with "One face and English copy rules; spelling follows the browser"; report 03 says it should flip. | K8 lines 922 to 926; report 03 section 1 | Verified |
| The deck manifest has `title`, `theme`, `sections`, `assets`, `defaults` (notes, appearance, counter, background), `guides`, `revision`; no language field. `deck.set` accepts `/title`, `/theme` and `/defaults/...` only. | K11 lines 72 to 100; K7 `deck.set` | Verified |
| The PPTX text export builds runs with pptxgenjs `TextProps`; no `lang` attribute is written today (no `lang` string in `packages/export/src/pptx/*.ts`). | K12 | Verified |
| `SpeechRecognition.lang` "defaults to the HTML lang attribute value, or the user agent's language setting if that isn't set either". | S4 | Verified |

### 5.2 Design

`Deck.language?: string`, a BCP 47 tag validated by a regex for the `ll` and `ll-RR` forms and normalised (`en-us` to `en-US`). `deck.create` writes the browser's `navigator.language` on the hosted path when it maps to an offered tag and `en-US` otherwise; the CLI writes `en-US` unless `--language` is given. Absent reads as `en-US` everywhere, so every existing deck keeps its behaviour and no migration runs.

Effects:

- The spell dictionary: `dictionaryFor(tag)` maps `en-GB` to `dictionary-en-gb`, any other `en-*` to `dictionary-en`, `pt-PT` to `dictionary-pt-pt`, `pt-*` to `dictionary-pt`, and the primary subtag otherwise; no match gives `missing`.
- The `lang` attribute: the sheet root (`.sheet`) and the notes textarea carry `lang="<tag>"`, so the browser's own spell check, hyphenation (`hyphens: auto` follows `lang`) and the font's locale specific glyph forms follow the deck; the theme's script stacks (the fallback families per script in `packages/theme`) already key on the characters, and `lang` lets the browser prefer the right regional forms where a face has them.
- The quote styles table of 1.5 and the autocorrect exception lists (the sentence abbreviations are English only in round five; other languages fall back to the single letter rule).
- Dictation's default language (section 6) and the Dictionary row's Wiktionary host (section 8).
- Units: Google flips imperial to metric with the English variant; Turboslide keeps units a preference (section 3) and does not tie it to the language.

Languages offered in the submenu: English (United States), English (United Kingdom), Deutsch, Español, Français, Italiano, Nederlands, Português (Brasil), Português (Portugal), each in its own name as Google lists them; German and Italian appear only when Kevin ships their dictionaries (section 12), otherwise the submenu shows seven.

Exports:

- Editable text PPTX: `a:rPr lang="<tag>"` on every run through pptxgenjs's `lang` text option, and `altLang` left absent; Perfect stills carry the tag on the searchable layer's runs too, since the layer is text.
- ODP (report 09): `fo:language="<ll>"` and `fo:country="<RR>"` on the default text properties of the default style and on every span's text properties.
- HTML build and the standalone: `<html lang="<tag>">`; the print route the same.
- PDF: Chromium writes the document language from `<html lang>` into the PDF's `/Lang` entry in the builder's experience, but that was not verified for this report and is listed.

The action is the existing `deck.set` with its pointer regex widened to accept `/language`, and `deck.info` returns the field. CLI `turboslide deck set /language de-DE`; MCP `deck_set`; window `deck.set` (already a registered handler). The menu row `file.language` flips to `now` as a submenu of radio rows `file.language.<tag>` with `action('deck.set', { path: '/language', value: tag })` and a check mark on the deck's value; its old omit reason retires.

## 6. Dictate speaker notes

### 6.1 Facts

| Fact | Source | Verified or unverified |
| --- | --- | --- |
| Google's label is "Dictate speaker notes"; the steps are Tools, Dictate speaker notes, "The speaker notes open and a microphone box displays", click the microphone to start and again to stop; it "works with the latest versions of: Chrome, Edge, Safari"; "Voice commands aren't available in Slides speaker notes"; "Punctuation might not be available in every language"; "When you turn on voice typing or captions, your web browser controls the speech-to-text service." | G4 | Verified |
| Whether spoken punctuation ("Period", "Comma") inserts punctuation in Slides speaker notes is not stated for Slides. | G4; report 02 | Unverified |
| `SpeechRecognition`: `continuous` (default false), `interimResults`, `lang`, `maxAlternatives`, `phrases`, `processLocally`, the static `available()`, eleven events; "On some browsers, like Chrome, using Speech Recognition on a web page involves a server-based recognition engine. Your audio is sent to a web service for recognition processing, so it won't work offline."; not Baseline. | S4 | Verified |
| `available({ langs, processLocally })` returns `available`, `downloadable`, `downloading` or `unavailable`; `install({ langs, processLocally })` downloads a language pack; `processLocally = true` requires on device processing. | S5, S7 | Verified; the Chrome version that added them was not on the pages read (unverified) |
| The specification: "User agents must only start speech input sessions with explicit, informed user consent" with "an obvious indication when audio is being recorded"; `SpeechRecognition` is `[SecureContext]`; `lang` defaults to the document root's language. | S8 | Verified |
| Support: Chrome 25 and later, Safari 14.1 and iOS Safari 14.5 and later (partial, the `webkit` prefix), Samsung Internet 4, Firefox disabled by default, no Edge listed. Google's page lists Edge. | S6, G4 | Verified as printed; the two sources disagree on Edge, so Edge is unverified here |
| The notes pane is a textarea writing `slide.set /notes` per 400 ms pause, focused by Cmd Option Shift S. | K5 lines 41 to 45 | Verified |

### 6.2 Design

The row `tools.dictateNotes` flips to `now` with `client('dictate')`. Running it opens the notes pane if hidden, focuses the textarea and mounts the microphone box: a 200 by 128 px card floating over the notes pane's left edge with a language dropdown above a round microphone button (Google's arrangement per G4 and report 02). The dropdown lists the offered BCP 47 tags with their names, preselected to `preferences.dictation.lang`, else the deck's language, and keeps the last choice in the preference. The button starts recognition with `continuous = true`, `interimResults = true`, `lang` set, `maxAlternatives = 1`; the box shows a red recording ring while `audiostart` is active (the spec's "obvious indication"). Final results append to the notes at the caret with a leading space and travel as the pane's normal `slide.set`; interim text shows as grey text after the caret inside the pane (a decorated overlay, not written) and is replaced by the final result. A click on the button, Esc, or leaving the slide stops it; `end` restarts while the box is on and the slide is unchanged, since Chrome ends sessions on silence.

Punctuation: Turboslide writes what the recogniser returns and adds no spoken punctuation commands (Google has none in Slides notes). Whether Chrome's recogniser inserts punctuation itself is unverified and the box makes no promise.

On device: before starting, the box calls `SpeechRecognition.available({ langs: [lang], processLocally: true })` where the static exists; on `available` it sets `processLocally = true`; on `downloadable` it offers "Download the language pack for on device recognition" which calls `install()`; otherwise it starts with `processLocally = false`. The box prints one privacy sentence under the button, chosen by that result: "Speech stays on this device" or "Your browser sends audio to its speech service for recognition". Where neither `SpeechRecognition` nor `webkitSpeechRecognition` exists, the button is replaced by "Dictation needs a browser with speech recognition, such as Chrome, Edge or Safari" and the row's tooltip carries the same sentence. A refused microphone permission shows "Allow the microphone to dictate". On `http://localhost` the API is available (a secure context); on a plain HTTP host it is not and the unsupported message applies.

Agent form: there is no dictation action. The write is `slide.set` with `path: '/notes'`, which agents already have; `spelling.check` with `notes: true` covers the dictated text. The window API tests inject a fake `SpeechRecognition` class through Playwright's `addInitScript` to exercise the box.

## 7. Accessibility settings and the Accessibility menu

### 7.1 Facts

| Fact | Source | Verified or unverified |
| --- | --- | --- |
| Google's dialog prints "Turn on screen reader support" (Ctrl+Alt+Z) and "Turn on braille support" (Ctrl+Alt+H); turning on screen reader support announces "Screen reader support enabled."; braille mode makes "Your braille display starts showing content", "Faster screen reader typing echo", "Faster screen reader navigation handling when you navigate by character". | G3 | Verified |
| With braille off, arrowing the filmstrip presents "The entire content of the slide"; with braille on, "Only the slide number, title, and layout is presented." | G5 | Verified |
| The Accessibility menu opens with Alt+A (Windows, ChromeOS) and Control+Option+A (Mac); it contains "Verbalize to screen reader" with "Verbalize selection formatting"; the canvas takes focus with Ctrl+Alt+Shift+C and Tab moves through the slide's elements. | G5 | Verified |
| The 2019 launch post: the menu "will be displayed at the top of Docs, Sheets, and Slides" when the screen reader option is on; a screen magnifier checkbox for Slides and Drawings on Mac and Chrome OS. | G29 via report 02 d.5 | Verified through report 02 |
| The shortcut fixture rows: `verbalize-selection` Ctrl+Alt+X (Ctrl+Cmd+X), `verbalize-from-cursor` Ctrl+Alt+R, `announce-formatting` "hold Ctrl + Alt, press a then f", `screen-reader-support` Ctrl+Alt+Z (Option+Cmd+Z), `braille-support` Ctrl+Alt+H, `accessibility-menu` Alt+A, `next-formatting-change` and `previous-formatting-change`; all in `OMITTED_SHORTCUTS` with "Your screen reader reads the page as it is" or "A screen reader chord". | K1 lines 855 to 883, 1078 to 1134 | Verified |
| The chord grammar is `sequence := chord ' then ' key` with one `then` step, and the fixture normaliser rewrites "hold X, press a then f" to `X+A then F`, so "Ctrl+Alt then A then F" is `Ctrl+Cmd+A then F` on Mac and `Ctrl+Alt+A then F` on Windows; two bindings already use the form (`Cmd+Ctrl+N then C`). | K1 lines 14, 53 to 54, 100, 397 to 398, 849 to 864 | Verified: no grammar change is needed |
| The menu fixture carries an "Accessibility" menu with "Verbalize to screen reader", "Verbalize selection formatting" and "Verbalize selection"; the model lists the menu in `OMITTED_MENUS` ("Appears in Google only with screen reader support on; the browser's screen reader reads the page as it is"). | K13 lines 461 to 466; K8 lines 2254 to 2260 | Verified |
| `tools.accessibilitySettings.collaboratorAnnouncements` is Now with `toggle('announce')`, an `aria-live="polite"` region coalesced to one sentence per 5 s per person; `announce` is a per session default today. | K8 lines 2058 to 2072; SPEC-3 0.42, 4.9; K6 | Verified |

### 7.2 What screen reader support changes in Turboslide

Google documents no behaviour beyond the announcement and the menu. Turboslide's toggle does three things: it draws the Accessibility menu as the eleventh menu; it turns on a `role="status"` `aria-live="polite"` region (`#ts-verbalize`, distinct from the collaborator region so two announcements never race) that the Verbalize rows write into; and it announces "Screen reader support enabled" (Google's sentence) in that region. It changes nothing in the DOM semantics, which already carry the accessible names of round one to three.

### 7.3 The menu

Drawn only while `preferences.accessibility.screenReader` is on. `MENUS` is a static list gated by role predicates, so `Menu` gains an optional `setting?: MenuSetting` field the bar reads (`{ ...ACCESSIBILITY, setting: 'screenReader' }`), and `OMITTED_MENUS` loses the entry. Access key Alt+A (Windows), Ctrl+Option+A (Mac), the fixture's `accessibility-menu` row. Rows:

| Id | Label | Effect | Key |
| --- | --- | --- | --- |
| `accessibility.verbalize` | Verbalize to screen reader | submenu | |
| `accessibility.verbalize.selection` | Verbalize selection | `action('accessibility.verbalize', { what: 'selection' })` | Ctrl+Alt+X, Ctrl+Cmd+X |
| `accessibility.verbalize.formatting` | Verbalize selection formatting | `action('accessibility.verbalize', { what: 'formatting' })` | Ctrl+Alt+A then F, Ctrl+Cmd+A then F |
| `accessibility.verbalize.fromCursor` | Verbalize from cursor location | `action('accessibility.verbalize', { what: 'fromCursor' })` | Ctrl+Alt+R, Ctrl+Cmd+R |
| `accessibility.comments.next` | Move to next comment | `client('nextComment')` (the SPEC-3 14 chord's handler) | the existing two step comment chord |
| `accessibility.comments.previous` | Move to previous comment | `client('previousComment')` | the same |
| `accessibility.formatting.next` | Move to next formatting change | `client('nextFormattingChange')` | the fixture's `next-formatting-change` row |
| `accessibility.formatting.previous` | Move to previous formatting change | `client('previousFormattingChange')` | the fixture's `previous-formatting-change` row |
| `accessibility.speakAloud` | Speak selection aloud (Turboslide) | `toggle('speakAloud')`, `turboslide: true` | none |

The four navigation rows are what report 02 d.5 describes as "navigation rows for comments and formatting changes" from G28 and G29; their exact Google labels were not read on a Google page in this report and carry `unverified: true` in the fixture. The formatting change rows walk the runs of the current Text and move the caret to the next run whose marks differ, announcing the change.

### 7.4 Verbalisation: live region and speechSynthesis

Google's Verbalize rows exist for screen reader users and, as far as the public pages show, speak through the screen reader (the page presents the sentence to the assistive technology rather than playing audio itself); no Google page read here says which mechanism it uses, so that is listed as unverified. Turboslide offers both: the live region is the default and is what a screen reader speaks; "Speak selection aloud" is a Turboslide addition that also passes the same sentence to `speechSynthesis.speak(new SpeechSynthesisUtterance(sentence))` with `utterance.lang` set to the deck language, off by default, for a person without a screen reader. The sentence builder is pure (`verbalize(selection, slide, what): string`) and tested:

- selection: the plain text of the selected range, or the block's kind and its text ("Text box: Quarterly numbers"), or "Slide 4 of 12, Content rule" when nothing is selected;
- formatting: the run marks and typography at the caret in Google's word order ("Bold, italic, 22 point, left aligned, ink");
- from cursor: the plain text from the caret to the end of the Text, then the remaining blocks in reading order.

### 7.5 Braille and the magnifier

Braille flips from Omit to Now with the one behaviour Google documents that a page controls: with `preferences.accessibility.braille` on, the filmstrip thumbnails' accessible names change from the slide's full text (today's name) to "Slide <n>, <title>, <layout>", and the announcements region stops repeating the slide content on arrow moves (G5). Ctrl+Alt+H and Cmd+Option+H toggle it, so `braille-support` leaves `OMITTED_SHORTCUTS`. Everything else a braille display needs comes from the DOM and the screen reader.

The screen magnifier stays omitted. Google's 2019 post ties it to Slides and Drawings on Mac and Chrome OS, which reads as the platform magnifier following the caret and selection on the canvas; a standalone editor's equivalent is the operating system's magnifier, and View > Zoom already enlarges the canvas. The omit reason becomes "Your operating system's magnifier follows the caret; View > Zoom enlarges the slide", and the checkbox is not drawn since the fixture does not carry it (its label is unverified).

### 7.6 Storage and the actions

The three toggles and the addition live in `preferences.accessibility` (section 3.3) beside `announce`, which moves there from the per session defaults. The dialog stays a submenu of four checkbox rows (collaborator announcements, screen reader support, braille support, speak selection aloud) with `toggle(...)` effects that write `prefs.set`. Actions: `accessibility.verbalize` (group `view`, transports `window` only like the view owner's actions, input `{ what: 'selection' | 'formatting' | 'fromCursor' }`, output `{ sentence }` so the window API test asserts the words), and `prefs.set` for the toggles from every transport (`turboslide prefs set /accessibility/screenReader true`).

## 8. Dictionary

### 8.1 Facts

| Fact | Source | Verified or unverified |
| --- | --- | --- |
| Google's Dictionary is a side panel with a search field, definition, part of speech, pronunciation, synonyms and antonyms; Ctrl+Shift+Y (Cmd+Shift+Y) "Open dictionary". | Report 02 d.4; K1 fixture lines 236 to 240 | Verified through report 02 and the fixture |
| Open English WordNet is "a fork of the Princeton WordNet developed under an open source methodology", "released under CC-BY 4.0"; the 2025 Edition (31 December 2025) has 161,875 words and 120,564 synsets in LMF XML, JSON, RDF and WNDB. | S24 | Verified |
| wordnet-db 3.1.14 on npm bundles the WordNet 3.1 database files, 35,407,539 bytes unpacked, MIT for the package. | S25 | Verified; Princeton's licence page returned 403 and its text is unverified here |
| Wiktionary's REST `page/definition/{term}` returns per language entries with `partOfSpeech`, `language`, `definitions` whose `definition` text contains HTML (`<span>`, `<a>`, `&nbsp;`) with `examples`; the mediawiki.org index calls it "an experimental definition end point". | S26, S27 | Verified for the shape; rate limits and the User-Agent policy were not found on the pages read (unverified); content is under CC BY-SA per the site footer |
| The Free Dictionary API (`api.dictionaryapi.dev/api/v2/entries/en/<word>`) is a GPL-3.0 project, English only, sourced from "Google dictionary" per its README, with the maintainer reporting "more than 10 million requests per month" and difficulty keeping the server running. | S28, S29 | Verified |
| `safeFetch` fetches only allowlisted hosts (`DEFAULT_ALLOW_HOSTS`, `HOSTED_ALLOW_HOSTS`); the studio's dispatchers set `allowPaths: false`. | K14 lines 79 to 162, 337 to 361 | Verified |

### 8.2 Options and costs

| Option | What ships | Cost | Licence | Verdict |
| --- | --- | --- | --- | --- |
| Shipped WordNet | Open English WordNet 2025 compacted to definitions, part of speech, synonyms and antonyms per lemma, served from a static JSON shard per first two letters on the blob tier and read by a `/api/define` route; no pronunciation. | About 15 to 25 MB of shards (unmeasured), a build script, a route, a panel | CC BY 4.0 with attribution in the panel | The only zero egress panel; English only |
| Wiktionary REST | A panel calling the studio's `/api/define`, which proxies `https://<ll>.wiktionary.org/api/rest_v1/page/definition/<term>` through `safeFetch` with the host added to `HOSTED_ALLOW_HOSTS` and a `User-Agent`, strips the HTML to text, caches 24 h | A route, an allow list entry, HTML sanitising, an attribution line | CC BY-SA 4.0 content shown with a Wiktionary link | The panel form if Kevin wants one; nine languages for free |
| Free Dictionary API | A panel calling a third party | An allow list entry | GPL-3.0 project; data provenance unclear | Not recommended |
| Look up row | `tools.dictionary` as `now` with `route('https://<ll>.wiktionary.org/wiki/<word>', true)` for the selected word, else the Wiktionary front page | none | none (a link) | Recommended now |
| Nothing | The row stays omitted | none | none | Not recommended; the brief lists Dictionary |

Recommendation: the Look up row now, keeping the label "Dictionary" and Ctrl+Shift+Y, so `open-dictionary` leaves `OMITTED_SHORTCUTS`; the Wiktionary panel as the follow up if Kevin wants definitions inside the editor. The action is `dictionary.lookup` (group `view`, read only, transports all): input `{ word?, language? }`, output `{ url }` on the CLI and MCP and the new tab in the window, so an agent can hand a person the link; it becomes `{ url, definitions }` if the panel form ships.

## 9. Explore

| Fact | Source | Verified or unverified |
| --- | --- | --- |
| "Explore in Google Docs, Sheets, and Slides will no longer be available by January 30, 2024."; Google pointed to the tool finder and the "@" menu. | T2 quoting Google | Verified (secondary quoting Google's notice) |
| The tool finder: "Find menu items and tools", "View recommended actions", "Get suggestions for related actions as you type", "Activate Find & replace after you enter content from your document"; Docs, Sheets, Slides and Vids; Alt+/ (Option+/); reached from the toolbar's search icon or Help > "Search the menus". | G6 | Verified |
| `help.searchMenus` is `now` with `client('toolFinder')` and the palette (`Palette.tsx`, `palette-data.ts`) is the implementation. | K8 line 2196; K15 | Verified |

Report 03's recommendation stands: Explore stays omitted, and `open-explore` stays in `OMITTED_SHORTCUTS` with its "Google retired Explore in 2024" reason. The tool finder replacement means one thing for Search the menus: when the typed query matches no menu row but matches visible deck text, the palette offers "Find and replace <query>" as its first row, opening Edit > Find and replace prefilled; the palette's five groups are otherwise already the tool finder.

## 10. Menu rows, retired clauses, tests and the check step

### 10.1 Rows to flip

| Id | From | To |
| --- | --- | --- |
| `tools.spelling.spellCheck` | later | `now(..., panel('Spell check'))` |
| `tools.spelling.underlineErrors` | now, browser marks | now, `toggle('spellcheck')` read from the preference; new `doc` |
| `tools.spelling.personalDictionary` | omit | `now(..., dialog('Personal dictionary'))` |
| `tools.preferences` | later | `now(..., dialog('Preferences'))` |
| `tools.dictionary` | omit | `now(..., action('dictionary.lookup'))` |
| `tools.dictateNotes` | omit | `now(..., client('dictate'))` |
| `tools.accessibilitySettings.screenReader` | omit | `now(..., toggle('screenReader'))` |
| `tools.accessibilitySettings.braille` | omit | `now(..., toggle('braille'))` |
| `tools.accessibilitySettings.speakAloud` | none | new, `turboslide: true`, `toggle('speakAloud')` |
| `file.language` | omit | `sub` of nine (or seven) radio rows writing `deck.set /language` |
| `tools.explore` | omit | omit (unchanged) |
| The Accessibility menu | `OMITTED_MENUS` | a `Menu` gated by `setting: 'screenReader'` with the rows of 7.3 |

New `MenuSetting` members: `screenReader`, `braille`, `speakAloud`, `language`, `units`. `OMITTED_SHORTCUTS` loses `next-misspelling`, `previous-misspelling`, `open-dictionary`, `accessibility-menu`, `verbalize-selection`, `screen-reader-support`, `braille-support`, `verbalize-from-cursor`, `announce-formatting`, `next-formatting-change` and `previous-formatting-change`, which become bindings; `input-tools-menu`, `toggle-input-controls` and `open-explore` stay.

### 10.2 Clauses to retire

"Your browser underlines misspellings and offers suggestions on right-click"; "The browser's dictionary applies"; `GOOGLE_SERVICE` on `tools.dictionary` and `tools.dictateNotes` (the constant stays for the other rows); "Text fitting is set per text box in Format options; the ruler reads inches"; "The browser's screen reader works on the DOM" on both rows; "One face and English copy rules; spelling follows the browser"; `SCREEN_READER_GREY` and "A screen reader chord" on the bound rows; "Your browser marks misspellings and steps through them from its own menu"; "The operating system dictionary works on selected text"; the `OMITTED_MENUS` reason for Accessibility. `menu-model.test.ts` asserts each retired clause is gone and each new effect is present; the parity audit's disabled state checks follow.

### 10.3 Tests

Unit: `autocorrect.test.ts`, `substitutions.test.ts`, `walk.test.ts`, `dictionary-load.test.ts` (with the gzip budget), `prefs.test.ts` (pointer get, set, append, delete, schema refusal, the migration of `spellcheck` and `announce` from `ts-editor-settings`), `verbalize.test.ts`, `language.test.ts` (the tag to dictionary map, the quote table, the export forms), `keys` tests extended for the eleven new bindings and the `then` chords, `menu-model.test.ts` for the flips. Export: `text.test.ts` asserts `lang` on runs in both modes; report 09's ODP tests assert `fo:language` and `fo:country`.

E2E, one new spec `apps/studio/e2e/text-tools.spec.ts`: (1) type `teh quick(c) brown` in a text box, assert the corrected text, Cmd Z, assert only the correction reverted, Backspace after `1/2 ` reverts the fraction; (2) Preferences: untick "Automatically capitalize words", reload, assert it stays unticked, open a second context with the same cookie and assert the same; add a substitution row and type it; (3) Spell check on a seeded deck with two misspellings: the card, Change, Change all, Ignore, Ctrl+' steps, Add to dictionary, then Underline errors on shows two marks on an unfocused box; (4) File > Language to de, assert `lang` on the sheet and `lang="de"` in the Editable text PPTX through `export.check`; (5) Accessibility settings: screen reader on draws the menu, Ctrl+Alt+X writes the selection into the live region, braille on changes a thumbnail's accessible name; (6) Dictate with an injected fake `SpeechRecognition`: the box, an interim result shown grey, a final result written to the notes, the unsupported message when the fake is absent.

### 10.4 The check step

`pnpm check` is 31 steps after round four. Round five adds one step for this report's surfaces, appended after the round's other new steps: `pnpm exec vitest run --dir packages/spelling --dir packages/schema autocorrect prefs && node scripts/check-dictionaries.mjs && pnpm exec playwright test apps/studio/e2e/text-tools.spec.ts`, where `check-dictionaries.mjs` asserts every shipped `aff` and `dic` pair gzips under the budget and that no GPL only dictionary sits under `apps/studio/public/dictionaries/` unless the flag file Kevin's decision writes is present. Step 3 (`generate:contracts` unchanged) covers the new actions' generated files as it does today.

## 11. The action list

| Action | Group | Mutates | Transports | CLI | MCP | Window |
| --- | --- | --- | --- | --- | --- | --- |
| `prefs.get` | account | no | all | `turboslide prefs get [<path>]` | `deck_prefs_get` | `run('prefs.get', { path })` |
| `prefs.set` | account | record | all | `turboslide prefs set <path> [<value>]` | `deck_prefs_set` | `run('prefs.set', { path, value })` |
| `text.autocorrect` | block | yes | all | `turboslide text autocorrect [<slideId>[#<blockId>]] [<path>] --dry-run` | `deck_autocorrect_text` | `run('text.autocorrect', {...})` |
| `spelling.check` | slide | no | all | `turboslide spelling check --slides <ids> --notes --alt --json` | `deck_spell_check` | opens the card on the findings |
| `spelling.replace` | slide | yes | all | `turboslide spelling replace <slideId>#<blockId> <path> --range <a,b> <text> --all` | `deck_spell_replace` | `run('spelling.replace', {...})` |
| `spelling.ignore` | slide | no | window | none | none | `run('spelling.ignore', { word, all })` |
| `dictionary.add` | account | record | all | `turboslide dictionary add <word>` | `deck_dictionary_add` | `run('dictionary.add', { word })` |
| `dictionary.remove` | account | record | all | `turboslide dictionary remove <word>` | `deck_dictionary_remove` | `run('dictionary.remove', { word })` |
| `dictionary.list` | account | no | all | `turboslide dictionary list` | `deck_dictionary_list` | `run('dictionary.list')` |
| `dictionary.lookup` | view | no | all | `turboslide dictionary lookup <word> --language <tag>` | `deck_dictionary_lookup` | opens the new tab |
| `deck.set /language` | deck | yes | all (existing action, widened pointer) | `turboslide deck set /language <tag>` | `deck_set` | existing handler |
| `accessibility.verbalize` | view | no | window | none | none | `run('accessibility.verbalize', { what })` returns `{ sentence }` |

Every action works on a checkout (the CLI against `decks/<id>` and `.turboslide/`) and hosted (the HTTP transport with a token, the MCP server, the window API in the editor). "record" means the write goes to the principal record, not the deck, so `baseRevision` is absent and no version entry is written.

## 12. Decisions for Kevin

1. German and Italian dictionaries: `dictionary-de` is GPL-2.0 OR GPL-3.0 and `dictionary-it` is GPL-3.0 with no permissive option (S13). Ship the data files beside the app under their own licence, fetch them from the upstream at runtime through the allow list, or offer seven languages.
2. Report 03 decision 4, the definitions provider: the Look up row (recommended now), the Wiktionary panel through `safeFetch` (CC BY-SA attribution, an egress entry for `*.wiktionary.org`), or a shipped Open English WordNet (CC BY 4.0, English only, about 15 to 25 MB on the blob tier).
3. Report 03 decision 6, Explore: this report confirms omitted.
4. Preferences per principal with hosted sync (recommended) or per browser as SPEC-2 12 planned.
5. "Speak selection aloud" through `speechSynthesis` as a Turboslide addition beyond Google's rows, off by default.
6. The em dash substitution row: absent by default (recommended, since `copy/no-em-dash` would flag every use) or present and unchecked.
7. Turboslide's own misspelling correction list (about 200 English rows written in the repository) for "Automatically correct spelling" in round five, or leaving that checkbox to a later round with the dictionary based suggestions only.
8. The `text/spelling` lint rule in `rules.json` at severity 1 (recommended) or spelling kept out of the linter.

## 13. Unverified

- The exact Slides General tab checkbox strings ("Automatically detect lists", "Use smart quotes") and whether the Slides dialog shows Google's Docs only rows; report 02's unverified item stands.
- Google's default Replace and With pairs; the table in 2.2 is Turboslide's.
- Whether Google's link detection links a bare domain without a scheme or `www.`.
- The quote style table of 1.5 against a typographic reference for each language.
- LibreOffice's DocumentList entry counts (about 2,800 rows, about 800 emoji rows) are the reader's estimate.
- The gzip sizes of every dictionary and the 400 KB budget; unmeasured because no install ran.
- The CSS Custom Highlight API's availability across the three engines for the renderer's own marks.
- Whether Chromium writes `/Lang` into a PDF from `<html lang>`.
- Whether Chrome's recogniser inserts punctuation for spoken punctuation words in a web page, and whether Google's Slides notes accept them.
- The Chrome version that added `SpeechRecognition.available()`, `install()` and `processLocally`.
- Edge's Web Speech API support: Google lists Edge, caniuse lists none.
- Whether Google's Verbalize rows speak through a live region or another mechanism, and the exact labels of the Accessibility menu's comment and formatting navigation rows.
- The label of Google's screen magnifier checkbox and the collaborator announcements checkbox (report 02).
- Wiktionary REST rate limits and the User-Agent policy; the CC BY-SA licence of the definitions is the site's general statement.
- Princeton WordNet's licence text (the page returned 403); Open English WordNet's CC BY 4.0 is verified.
- Harper's spelling coverage and dialect list.
- Whether Google applies a two initial capitals rule or a caps lock rule (not documented; left out).

## 14. Sources

Repository files, read at d5d7f07 on 2026-09-14:

- K1 `packages/chrome/src/menus/keys.ts` (the chord grammar lines 1 to 145, the fixture normaliser 387 to 409, the `then` bindings 849 to 864, `OMITTED_SHORTCUTS` 1028 to 1134) and `packages/chrome/src/menus/__fixtures__/google-shortcuts.json` (rows 236, 339, 570, 855 to 883)
- K2 `packages/viewer/src/InlineText.tsx` (header, `TEXT_BURST_MS` 68, `textDiff` 298, `textBurstMutation` 329, the session 1078 to 1470)
- K3 `packages/schema/src/text.ts` (header 1 to 27, `escapeRunText` 401, `CASE_MODES` 624, `spliceText` 911, `LINK_SCHEMES` 1032, lists 1060 to 1124)
- K4 `packages/theme/src/copy.ts`
- K5 `packages/chrome/src/NotesPane.tsx` (lines 41 to 45, 196 to 203)
- K6 `packages/chrome/src/editor-shell.ts` (lines 2688 to 2740) and `packages/chrome/src/EditorShell.tsx` (line 276)
- K7 `packages/schema/src/actions.ts` (`TRANSPORTS` 87, `ACTION_GROUPS` 119, `ActionSpec` 147, `deck.set` 984, `text.replaceAll` 1512, `text.case` 3181, `text.insert` 3209, `notification.settings`)
- K8 `packages/chrome/src/menus/model.ts` (helpers 485 to 547, `MenuSetting` 216, `file.language` 922, Tools 2017 to 2080, `MENUS` 2228, `OMITTED_MENUS` 2254)
- K9 `packages/identity/src/principal.ts` (`PrincipalRecord`, `LivePointers`)
- K10 `apps/studio/src/server/auth/principal.ts`
- K11 `packages/schema/src/deck.ts` (lines 72 to 100, 539 to 560)
- K12 `packages/export/src/pptx/text.ts` and the other `pptx/*.ts` files (no `lang`)
- K13 `packages/chrome/src/menus/__fixtures__/google-menus.json` (lines 402 to 431, 461 to 466)
- K14 `packages/headless/src/capture/shared.ts` (lines 79 to 162, 337 to 361)
- K15 `packages/chrome/src/Palette.tsx` (header)
- `packages/schema/src/mutations.ts`, `packages/schema/src/rules.json`, `scripts/check.mjs`, `docs/gslides-parity/SPEC-2.md` (0.82, section 12), `docs/gslides-parity/SPEC-3.md` (0.17, 0.42, sections 4.9, 7, 17), `docs/gslides-parity/research/01-menu-bar.md` (R01), `docs/gslides-parity/research/09-canvas-text-editing-model.md` (R09)

Sibling reports, working tree, read 2026-09-14: `research-5/02-media-templates-import-page.md`, `research-5/03-later-rows-and-edit-theme.md`, `research-5/07-turboslide-inventory-5.md`.

Google pages, read 2026-09-14:

- G1 Check your spelling in Google Slides. https://support.google.com/docs/answer/9764808?hl=en
- G2 Manage Autocorrect in Google Docs (reached through the "Manage writing suggestions" address). https://support.google.com/docs/answer/12022089?hl=en and https://support.google.com/docs/answer/12018052
- G3 Use Google Docs Editors with a screen reader. https://support.google.com/docs/answer/6282736?hl=en&co=GENIE.Platform%3DDesktop
- G4 Type & edit with your voice. https://support.google.com/docs/answer/4492226?hl=en&co=GENIE.Platform%3DDesktop
- G5 Use Google Slides with a screen reader. https://support.google.com/accessibility/answer/1634140?hl=en
- G6 Tool finder for Docs, Sheets, Slides & Vids. https://support.google.com/docs/answer/13466905?hl=en
- G11 Google Workspace Updates, Automated lists, backspace to undo autocorrections (2014-09-16), as quoted in R09. https://workspaceupdates.googleblog.com/2014/09/automated-lists-backspace-to-undo.html
- G18, G21, G23, G24, G29 as cited in report 02's Sources.

Specifications, browsers and platform pages, read 2026-09-14:

- S1 MDN, spellcheck global attribute. https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/spellcheck
- S2 MDN, ::spelling-error. https://developer.mozilla.org/en-US/docs/Web/CSS/::spelling-error
- S3 Google Chrome Help, spell check options (Basic and Enhanced). https://support.google.com/chrome/answer/12027911?hl=en
- S4 MDN, SpeechRecognition. https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- S5 MDN, SpeechRecognition.available(). https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static
- S6 caniuse, Speech Recognition API. https://caniuse.com/speech-recognition
- S7 MDN, Using the Web Speech API (on device speech recognition, contextual biasing) and SpeechRecognition.processLocally. https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API and https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally
- S8 Web Speech API specification (W3C Community Group draft). https://webaudio.github.io/web-speech-api/

Engines and dictionaries, read 2026-09-14:

- S9 npm, nspell 2.1.5. https://registry.npmjs.org/nspell/latest
- S10 npm, typo-js 1.3.2. https://registry.npmjs.org/typo-js/latest
- S11 npm, hunspell-asm 4.0.2. https://registry.npmjs.org/hunspell-asm/latest
- S12 npm, harper.js 2.10.0. https://registry.npmjs.org/harper.js/latest
- S13 wooorm/dictionaries readme. https://github.com/wooorm/dictionaries/blob/main/readme.md
- S14 Automattic/harper. https://github.com/Automattic/harper
- S15 Harper.js documentation, introduction and linting. https://writewithharper.com/docs/harperjs/introduction and https://writewithharper.com/docs/harperjs/linting
- S22 npm, dictionary-en 4.0.0. https://registry.npmjs.org/dictionary-en/latest
- S23 wooorm/dictionaries, the English dictionary licence file. https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/en/license
- S24 Open English WordNet. https://github.com/globalwordnet/english-wordnet
- S25 npm, wordnet-db 3.1.14. https://registry.npmjs.org/wordnet-db/latest
- S26 Wiktionary REST, page/definition/hello. https://en.wiktionary.org/api/rest_v1/page/definition/hello
- S27 Wikimedia REST API overview. https://www.mediawiki.org/wiki/Wikimedia_REST_API
- S28 Free Dictionary API. https://dictionaryapi.dev/
- S29 meetDeveloper/freeDictionaryAPI. https://github.com/meetDeveloper/freeDictionaryAPI

Autocorrect references, read 2026-09-14:

- S16 LibreOffice Help, AutoCorrect Options. https://help.libreoffice.org/latest/en-US/text/shared/01/06040100.html
- S17 LibreOffice core, extras/source/autocorr/lang/en-US/DocumentList.xml. https://raw.githubusercontent.com/LibreOffice/core/master/extras/source/autocorr/lang/en-US/DocumentList.xml
- S18 LibreOffice core, SentenceExceptList.xml. https://raw.githubusercontent.com/LibreOffice/core/master/extras/source/autocorr/lang/en-US/SentenceExceptList.xml
- S19 LibreOffice core, WordExceptList.xml, and the folder listing. https://raw.githubusercontent.com/LibreOffice/core/master/extras/source/autocorr/lang/en-US/WordExceptList.xml and https://github.com/LibreOffice/core/tree/master/extras/source/autocorr/lang/en-US
- S20 The Document Foundation, LibreOffice licences. https://www.libreoffice.org/about-us/licenses/
- S21 Microsoft Learn, AutoCorrect object (Word). https://learn.microsoft.com/en-us/office/vba/api/word.autocorrect

Third party pages, read 2026-09-14:

- T1 BrightCarbon, Google Slides: The ULTIMATE guide. https://www.brightcarbon.com/blog/google-slides-ultimate-guide/
- T2 Alice Keeler, Google Explore: What happened to it (updated 2024-10-15). https://alicekeeler.com/2023/03/24/google-explore-what-happened-to-it/

Pages tried and not readable on 2026-09-14: the WHATWG spelling and grammar checking section (the page exceeded the reader's size; MDN is cited in its place), Princeton's WordNet licence page (403), Chromium's spelling design document (404 at both addresses tried), Google's Chrome privacy whitepaper (title only), Microsoft's AutoCorrect options support page (the page read covered adding entries only; the Word VBA reference is cited for the rule names), and the Wikimedia rate limit pages (redirects to overviews without the numbers).
