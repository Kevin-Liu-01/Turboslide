# Market audit: Google Slides and its competitors on 2026-10-01

The market auditor of the next program wrote this note on 2026-10-01. It answers what "match and exceed Google Slides" means on that date. It lists what Google Slides shipped from 2025 to 2026-10-01, what its limits are, what the strongest competitors sell and charge, and the gaps every tool shares that an agent native editor could own.

## 0. Method and what was not read

- Every web claim was fetched on 2026-10-01 between 18:30 and 18:50 PDT (2026-10-02 01:30 to 01:50 UTC) with WebSearch and WebFetch, or with `curl` where noted. Each claim carries its URL and the date the source shows.
- A claim marked "search result only" comes from the search engine's summary of the page; the page itself was not fetched. Treat those as weaker than a fetched page.
- Third party review sites are named as third party. Their numbers belong to the site that printed them.
- Tree claims cite the worktree `/Users/kevinliu/repos/Turboslide-next` on the branch `next/program` at `94e8a5c3`.
- Machine load during the session: load average 44.65 at 18:35 PDT and 26.43 at 18:49 PDT (`uptime`). No timing in this note depends on it.

Not read, listed as not read:

| URL | What happened at 2026-10-01 18:30 to 18:50 PDT |
| --- | --- |
| https://gamma.app/pricing, https://gamma.app/insights, https://gamma.app/insights/introducing-gamma-3-0 | HTTP 403. A `curl` with a browser user agent got HTTP 403 and a "Just a moment" bot challenge page (`gamma-pricing.html`, 679,311 bytes). The challenge was not attempted. |
| https://www.canva.com/pricing/ | HTTP 403 |
| https://www.genspark.ai/pricing | HTTP 403 |
| https://www.microsoft.com/en-us/microsoft-365/copilot/business, https://www.microsoft.com/en-us/microsoft-365/copilot/pricing | Timed out after 60 s, twice |
| https://workspaceupdates.googleblog.com/2025/10/generate-presentations-in-gemini-app.html | Redirected to Google's "sorry" page (a CAPTCHA). It was not attempted. The archive page for 2025-10 was read instead. |
| https://www.androidauthority.com/notebooklm-slide-deck-editing-3641895 | HTTP 403 |
| https://tome.app/ | HTTP 404 |
| https://techcommunity.microsoft.com/blog/microsoft365copilotblog/introducing-word-excel-and-powerpoint-agents-in-microsoft-365-copilot/4470604 | The fetch returned the title only |

## 1. Google Slides: the feature checklist from 2025 to 2026-10-01

The list of Slides posts comes from the label page https://workspaceupdates.googleblog.com/search/label/Google%20Slides (fetched: 18 posts from 2025-06-27 to 2026-09-30) and its older page `?updated-max=2025-06-27T00:00:00-07:00` (18 posts from 2024-05-23 to 2025-06-17). The month archives https://workspaceupdates.googleblog.com/2025/01/ to /2025/12/ and /2026/01/ to /2026/09/ were read for Slides, Vids, Gemini, API and agent posts (2025/03 to 2025/06 through the label page only).

"Turboslide today" says what the tree at `94e8a5c3` holds for the same area. "No action found" means a search of `packages/schema/src/actions.ts` found no action id for it.

### 1.1 Gemini generation inside Slides

| Item | Date | What it does, as the source says | Editions and limits | Source | Turboslide today |
| --- | --- | --- | --- | --- | --- |
| Gemini side panel in Slides, more languages | 2025-03-05 and 2025-03-18 | Side panel in seven, then more, languages | Label page titles only | label page | `assist.propose` and `assist.accept`: a rewrite or speaker notes as signed cards (`packages/schema/src/actions.ts:5844`, `:5864`) |
| Image generation in the side panel | 2025-01-15, 2025-01-29 | Business and Enterprise plans include Slides image creation and background removal; on 2025-01-29 "Gemini in the side panel of Slides is only available in English at this time" | | https://workspaceupdates.googleblog.com/2025/01/ | No image generation action found |
| Sidebar with design elements: templates, building blocks, stock images, image generation, speaker spotlight and recordings | 2025-03-31 (Rapid), 2025-04-21 (Scheduled) | Building blocks are "a new library of pre-formatted pieces of content, such as agendas, quotes or key statistics" | Templates and building blocks for every account; spotlight and recordings on Business Standard and up; Gemini parts on Business Standard and up | https://workspaceupdates.googleblog.com/2025/03/new-sidebar-with-design-elements-in-google-slides.html | Seven `template.*` actions from `template.list` to `template.setDefault` (`packages/schema/src/actions.ts:1502-1618`); building blocks as a named library not found |
| Refreshed template library | 2025-04-22 | Title only | | label page | |
| Gems in the side panel | 2025-07-02 | Title only | Replaced by skills: the Workspace blog of 2026-09-16 says skills are "reusable prompts that guide Gemini" usable in Gemini in Slides; a third party says Gems phase out from 2026-11-17 (search result only, newsbytesapp.com) | label page; https://workspace.google.com/blog/product-announcements/teach-gemini-your-teams-know-hows-with-skills-in-google-workspace | `skills/turboslide-api`, `turboslide-create`, `turboslide-studio`, `turboslide-verify` at the repo root |
| AI image editing: replace and expand background | 2025-08-13 | Select an image, Edit, "Replace background", type a prompt | | https://workspaceupdates.googleblog.com/2025/08/replace-expand-image-background-slides-vids.html (search result only) | No action found |
| Nano Banana image edits by prompt | 2025-09-29 | Edit images with custom prompts | | https://workspaceupdates.googleblog.com/2025/09/ | No action found |
| Refine text with Gemini | 2025-09-05 | Title only | | label page | `assist.propose` shorter rewrite |
| Presentations in the Gemini app (Canvas), exported to Slides | 2025-10-28 | Create slides in Canvas, export to Slides | | https://workspaceupdates.googleblog.com/2025/10/ | |
| Nano Banana Pro in Slides: infographics, images, "Beautify this slide" | 2025-11-20 | "Generate detailed, professional infographics directly in Slides"; "Beautify this slide" in one click | Business Standard and Plus, Enterprise Standard and Plus, AI Pro and Ultra; higher limits for at least 60 days, then per user limits | https://workspaceupdates.googleblog.com/2025/11/ | No action found |
| Editable, brand matched slides: "Create" and "Enhance this slide" | 2026-03-31 rollout, post 2026-04-01 | Gemini "securely analyzes your existing deck" and matches its style | Business Standard and up, AI Pro and Ultra | https://workspaceupdates.googleblog.com/2026/04/enerate-beautiful-and-editable-slides-with-ease-in-Google-Slides.html | |
| Full deck generation grounded in Drive files, with a plan step and style reference | 2026-06-29 rollout, post 2026-06-30 | "create a full, multi-slide presentation using Gemini in Google Slides"; slides are "fully editable" | English (United States) only; promotional higher limits through 2026-08-01, then per user limits | https://workspaceupdates.googleblog.com/2026/06/create-fully-native-and-editable-presentations-with-Gemini-in-Google-Slides.html; the roundup https://workspace.google.com/blog/product-announcements/july-2026-workspace-feature-drop (2026-07-29) | The agent surface writes decks through the action table (section 3.1) |
| Summarise a presentation, write and rewrite, @ file references, Google Search on request | Help page, no date shown | "Summarize a presentation"; "Generated images are for use only within Google Slides"; the panel's history "clears on browser refresh" | "Requires an eligible Google Workspace or Google AI plan" | https://support.google.com/docs/answer/14355071?hl=en | |

### 1.2 Video: Slides into Vids

| Item | Date | What it does | Source |
| --- | --- | --- | --- |
| Create a Vid from Slides | 2025-06-17 | Import slides into a new or existing Vid | label page; https://workspaceupdates.googleblog.com/2025/06/create-google-vid-from-google-slides.html (search result only) |
| "Help me create" in Vids supports Slides | 2025-09-03 | Title only | label page |
| Slides to video with Gemini scripts, AI voiceovers and music | 2025-09-24 | Convert a deck into a video | https://workspaceupdates.googleblog.com/2025/09/ |
| Edit the AI script when converting | 2026-04-09 | Title only | label page |
| Avatars when converting a deck to a video | 2026-05-15 (announced 2026-04-22) | AI avatars present the converted deck | https://workspaceupdates.googleblog.com/2026/05/; https://workspace.google.com/blog/product-announcements/10-more-announcements-workspace-at-next-2026 |
| Record a presentation in Slides through Vids, with transcript editing | 2026-08-20 (Rapid), 2026-09-07 (Scheduled) | A Record option in the right hand menu; the old recorder moves to the View menu; all Workspace customers and personal accounts | https://workspaceupdates.googleblog.com/2026/08/record-presentations-in-google-slides-with-Google-Vids.html (search result only); https://workspaceupdates.googleblog.com/2026/08/ |

Turboslide today: no recording or video action found.

### 1.3 Editing basics shipped in the period

| Item | Date | Source |
| --- | --- | --- |
| Proportional scaling for objects | 2025-03-24 | label page |
| Arrow keys move an object by one pixel; Shift moves it further | 2025-08-19 | https://workspaceupdates.googleblog.com/2025/08/ |
| Transitions and object animations with "On click", "After previous" and "With previous" | Help page, no date shown; the page lists no named transition types | https://support.google.com/docs/answer/1689475 |

### 1.4 Presenting

| Item | Date | What the source says | Source | Turboslide today |
| --- | --- | --- | --- | --- |
| Audience Q&A in Presenter view | Help page, no date shown; launched 2016-05 per the 2016 post | Viewers "ask questions from any device", can "Ask anonymously" and vote; the Q&A view closes after the show ends | https://support.google.com/docs/answer/6386827 | No Q&A action found |
| Live captions while presenting | Help page, no date shown | Chrome, Edge and Safari; "Captions are not stored"; "Captions don't include punctuation"; off after 30 minutes idle | https://support.google.com/docs/answer/9109474 | No captions action found |
| Multi monitor support | 2024-09-16 | Title only | label page (older page) | Presenter view at `/present/:deckId`; the audience window follows over a BroadcastChannel (`apps/studio/src/routes/present.$deckId.tsx:9-28`) |
| Speaker spotlight and recordings | Moved into the sidebar 2025-03-31 | Business Standard and up | 2025-03-31 post above | |

### 1.5 Platform, API and agents

| Item | Date | What the source says | Source |
| --- | --- | --- | --- |
| Workspace Studio: no code agents | 2025-12-05 | "create, manage, and share AI agents to automate work in Workspace" | https://workspaceupdates.googleblog.com/2025/12/ |
| Workspace MCP server, public developer preview | 2026-05-01 | The post names Gmail, Drive, Calendar, Chat and People; Slides is not listed | https://workspaceupdates.googleblog.com/2026/05/agent-tools-and-security-updates-for-workspace-developers.html |
| Slides API: comments | 2026-09-30 | Read, create, reply, update, delete; anchors on pages, shapes, text ranges (`shapeTextAnchor`) and table cells | https://workspaceupdates.googleblog.com/2026/09/; https://developers.google.com/workspace/slides/api/guides/comments |
| Slides API: request types | Page read 2026-10-01 | 49 request types listed; none for transitions, object animations or audio. The Page resource has no transition or animation field (page "Last updated 2026-09-30 UTC") | https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations/request; https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages |
| Slides API quotas | Page updated 2026-09-03 | Writes: 600 per minute per project, 60 per minute per user per project. Reads: 3,000 and 600. Thumbnails: 300 and 60. "Starting later in 2026, exceeding quota limits will incur charges" | https://developers.google.com/workspace/slides/api/limits |
| Client side encrypted Slides: download (beta), PPTX import (beta) | 2026-04-15, 2026-09-24 | Titles only | label page |

### 1.6 Google Slides' limits found today

| Limit | Source and date |
| --- | --- |
| Offline needs Chrome or Edge, outside incognito, with the Google Docs Offline extension; "very large files" may not sync | https://support.google.com/docs/answer/6388102 (no date shown) |
| Presentations converted to Slides: "Up to 100 MB" | https://support.google.com/drive/answer/37603 (no date shown) |
| Deck generation is English (United States) only | 2026-06-30 post above |
| Gemini features need Business Standard or higher, or Google AI Pro or Ultra. Prices read 2026-10-01: Business Starter US$7.00, Standard US$14.00, Plus US$22.00 per user per month at the regular price, with introductory discounts for new customers | https://workspace.google.com/pricing.html. Two fetches of the pricing page disagreed on whether Starter lists "make presentations shine with AI images"; listed as open |
| Google AI Pro US$19.99 per month; AI Ultra US$99.99 per month | https://one.google.com/about/ai-premium |
| The API cannot write transitions, animations or audio; 60 writes per minute per user | section 1.5 |
| Brand control is a style reference: Gemini matches an existing deck's style. No source read today shows brand rules that refuse an off brand edit in Slides | 2026-04-01 and 2026-06-30 posts above |
| Conversion fidelity: custom fonts not in Google's library become Arial; animations, triggers and Excel linked charts do not carry over | https://www.brightcarbon.com/blog/convert-powerpoint-google-slides/ (third party, dated 2021-05-12; old) |
| Performance on large decks | No current source found; listed as open |

## 2. Competitors

Prices are as fetched on 2026-10-01. "Leads with" is the three features the vendor's own page puts first.

| Product | Price read today | Leads with | Launched in 2025 to 2026 | Weaknesses reported | Sources |
| --- | --- | --- | --- | --- | --- |
| Microsoft PowerPoint with Copilot | Microsoft 365 Copilot Business US$21 per user per month with an annual commitment, on top of a Microsoft 365 Business plan; 1 to 300 users (article 2025-12-10) | Agent Mode in PowerPoint for the web (create, edit, refine from chat; files, meetings and email with a Copilot licence); Brand kit with "Strict Brand Adherence" (announced 2026-09-14); organisation brand templates in Backstage for Copilot Premium on Windows (late August to mid September 2026) | Agent Mode rollout mid February to late April 2026, roadmap 548520 (licensed) and 548646 (unlicensed) | Agent Mode "doesn't support all PowerPoint features" and edits the file directly; 15 million paid Copilot seats, 3.33 % of 450 million commercial users (article 2026-02-12) | https://office-watch.com/2025/microsoft-365-copilot-business-ai-add-on/; https://supersimple365.com/agent-mode-in-copilot-is-coming-to-powerpoint-for-the-web/ (2026-02-14); https://rcpmag.com/articles/2026/09/21/copilot-in-powerpoint-gets-new-tools.aspx (2026-09-21); https://mc.merill.net/message/MC1442612 (2026-07-29); https://winbuzzer.com/2026/02/12/microsoft-365-copilot-powerpoint-agent-mode-low-adoption-xcxwbn/; https://support.microsoft.com/en-us/office/create-a-new-presentation-with-copilot-in-powerpoint-3222ee03-f5a4-4d27-8642-9c387ab4854d |
| Pitch | EUR 0, 10, 15 and 20 per month (Free, Plus, Team, Business); 100, 500, 500 and 750 AI credits; Enterprise custom | Pitch Agent ("generate on-brand slides"); visitor analytics; Pitch rooms (deal rooms); also brand library and live co-editing | Pitch Agent 2026-05-27; Teamspaces and SCIM 2026-06-30; MCP and API 2026-08-12 ("trigger deck delivery straight from your own workflows") | Not researched | https://pitch.com/pricing; https://pitch.com/; https://pitch.com/whats-new |
| Gamma | Plus US$9, Pro US$18, Ultra US$90 per seat per month; Team US$20 and Business US$40 per seat per month annual; Free 400 credits that do not refresh (third party; the vendor page answered 403) | Gamma Agent (bulk restyle, web research with citations, critique); API; smart layouts and themes (Gamma 3.0, September 2025, search result only) | Gamma 3.0 with Agent and API (September 2025); MCP connector inside Claude (gamma.app/integrations/claude, search result only); Series B US$68 million at about US$2.1 billion, November 2025 | Exports give "busted layouts, weird slide sizes", "the 'Gamma look' becomes really obvious"; Trustpilot 1.9 of 5 (article 2025-10-09) | https://www.eesel.ai/blog/gamma-pricing (no date shown); https://help.gamma.app/en/articles/7834324-how-much-does-gamma-cost; https://en.wikipedia.org/wiki/Gamma_(app); https://www.eesel.ai/en/blog/gamma-reviews |
| Canva presentations | Pro US$144 per year, Business US$250 per person per year, with AI use counts per tier and a paid AI Pass add-on whose price is not published (third party; the vendor page answered 403) | Canva AI 2.0 conversational design to "fully editable" layered designs; Brand Intelligence applies fonts, colours and style; connectors to Slack, Gmail, Drive, Notion, Zoom, HubSpot | Canva AI 2.0 and the Canva Design Model at Canva Create, 2026-04-16, research preview for 1 million users; Canva MCP server for Claude, ChatGPT, Gemini and others, applying Brand Kits and Brand Templates | Not researched | https://www.eesel.ai/blog/canva-ai-pricing (no date shown); https://www.cmswire.com/digital-experience/canva-ai-20-adds-agentic-design-tools/ (2026-04-16); https://www.canva.dev/solutions/mcp/ |
| Figma Slides | Collab seat US$3 per month on Professional, US$5 annual on Organization and Enterprise; Full seat US$16, US$55, US$90; AI tools need a paid plan and a Full, Dev or Collab seat | Design mode (Auto Layout, layers); live polls, voting and the alignment scale saved to the deck; playable prototypes in a slide; also AI tone rewrite and presenter notes, PPTX import and export | Figma agent "in FigJam and Figma Slides" listed as coming soon, 2026-06-24 | Not researched | https://www.figma.com/pricing/; https://www.figma.com/slides/; https://help.figma.com/hc/en-us/articles/31433930664215; https://forum.figma.com/product-updates-3/everything-announced-at-config-2026-55221 |
| Beautiful.ai | Pro US$14.50 per month annual or US$45 monthly; Team US$40 per user per month annual or US$50 monthly | Smart Slides that "adjust layouts in real time"; AI presentations from a prompt; brand control ("Define your brand colors, fonts, and logos once") | Team plan lists "Live data linking to charts & tables" and locked slides; Enterprise lists "Configurable brand guardrails" | Not researched | https://www.beautiful.ai/pricing; https://www.beautiful.ai/ |
| Tome | The presentation product closed on 2025-04-30; the company became Lightfield, an AI CRM (third party) | | | | https://www.chatslide.ai/articles/tome-ai-shut-down-what-happened (search result only); https://tome.app/ answered 404 today |

### 2.1 Agent native and AI first slide tools of 2026

| Product | Date | What it does | Price or access | Weakness reported | Source |
| --- | --- | --- | --- | --- | --- |
| Claude Slides | 2026-09-16 | Ask for a deck in a conversation; edit directly; present from Claude; download as PowerPoint or PDF | Beta on Pro and Max first; Team and Free later; Enterprise when an admin enables it. Pro is US$20 per month or US$17 annual | "lacks built-in brand template support" (third party) | https://www.techrepublic.com/article/news-anthropic-claude-cowork-docs-slides/ (search result only); https://justinmckelvey.com/blog/claude-slides (third party); https://claude.com/pricing |
| Claude for PowerPoint | Listed as generally available in the docs read 2026-10-01; the docs show no launch date | Reads the slide master, layouts, fonts and colours; pinpoint edits; native charts and diagrams; connectors and skills; persistent instructions for brand rules | Pro, Max, Team and Enterprise | Docs warn that files "can contain hidden instructions"; risky operations ask for confirmation | https://claude.com/docs/office-agents/powerpoint |
| Claude Design | 2026-04-17 | Prompt to design or deck; sliders on colour, spacing and type; reads codebases and design files for brand; exports PPTX, PDF, HTML and Canva | Research preview on Pro, Max, Team and Enterprise | | https://www.macrumors.com/2026/04/17/anthropic-claude-design |
| ChatGPT for PowerPoint | 2026-05-21 or 22 | Build and edit slides in PowerPoint, keep them editable, critique a deck; confirms before significant changes | Beta, all accounts including free | | https://gigazine.net/gsc_news/en/20260522-chatgpt-for-powerpoint |
| Gemini app presentations | 2025-10-28 | Canvas makes a deck, exported to Slides | Gemini app | | https://workspaceupdates.googleblog.com/2025/10/ |
| NotebookLM slide decks | PPTX export 2026-02-18 | Per slide revision and PPTX export | | The PPTX holds slides "rendered as image layers" (third party, search result only) | https://codia.ai/blog/convert-notebooklm-to-powerpoint-2026 (search result only) |
| Genspark AI Slides | Review 2026-01-20 | Research to deck with charts, export to PPT and PDF | Plus US$24.99 per month, Pro US$249.99 per month (third party) | Exports need "manual cleanup"; no waterfall, Mekko, Gantt or Excel linked charts | https://deckary.com/blog/genspark-review |

## 3. Gaps every tool shares that an agent native editor could own

Each gap names the market evidence, what Turboslide already holds, and what is missing.

### 3.1 An agent that edits through the same actions as a person

- Market: Copilot's Agent Mode "doesn't support all PowerPoint features" (winbuzzer, 2026-02-12). The Slides API has no request for transitions, animations or audio and allows 60 writes per minute per user (section 1.5). Google's MCP preview of 2026-05-01 does not list Slides. Claude and ChatGPT reach PowerPoint through add-ins. Pitch (2026-08-12), Canva (canva.dev) and Gamma (search result only) expose generation and editing through MCP. No source read today shows any of them publishing the share of the editor's interactions an agent can perform.
- Turboslide today: one action table serves four transports, `cli`, `mcp`, `http` and `window` (`packages/schema/src/actions.ts:98-99`). The MCP server derives its tools from that table (`packages/mcp/src/tools.ts:268-285`). `view.present` is on the `window` transport only (`packages/schema/src/actions.ts:2667-2672`).
- Missing: a published, generated count of editor interactions with their action ids and transports, so the claim "an agent can do anything a person can" is checked by the gate. A listing in the Claude and ChatGPT connector directories, which is where Pitch, Canva and Gamma now meet users.

### 3.2 Brand kits enforced as rules

- Market: Google matches the style of a reference deck (2026-04-01, 2026-06-30). Microsoft added "Strict Brand Adherence" on the Copilot licence (2026-09-14, rcpmag). Beautiful.ai sells "Configurable brand guardrails" on Enterprise only. Pitch Agent builds from the team's templates. Claude Slides lacks brand templates (third party). Gamma output has a recognisable "Gamma look" (eesel).
- Turboslide today: `brand.get`, `brand.set` and `brand.reset` hold colour roles, faces, logo, footer, counter and a lexicon of words that never translate (`packages/schema/src/actions.ts:4015-4062`). The linter reports a custom hex as `color/off-palette` at severity 2 (`packages/lint/src/static/color.ts:1-5`), and `lint.run` is an action (`packages/schema/src/actions.ts:2483`).
- Missing: the kit read as the rule set of the linter for every writer, a person or an agent, on every write, on the free plan. The market charges for this at the top tier.

### 3.3 Live data

- Market: Google Slides refreshes linked Sheets charts (`RefreshSheetsChart` in the request list, section 1.5). Beautiful.ai sells "Live data linking to charts & tables" on Team at US$40 per user per month. Genspark has no Excel linked charts (deckary).
- Turboslide today: `chart.setData` writes categories and series once (`packages/schema/src/actions.ts:3664`). No data source or refresh action found.
- Missing: a chart or table bound to a source (a CSV URL, a published sheet, a JSON endpoint) with a refresh action that an agent can call on a schedule.

### 3.4 Real export fidelity

- Market: Gamma exports break layouts (eesel 2025-10-09). Genspark needs cleanup (deckary 2026-01-20). NotebookLM's PPTX is image layers (third party, search result only). Conversion between Slides and PowerPoint drops fonts and animations (BrightCarbon, 2021-05-12).
- Turboslide today: the README claims "a pixel identical PowerPoint export" (`README.md:8`). `export.check` reopens the PPTX with python-pptx and reports pages, fonts and invalid parts (`packages/schema/src/actions.ts:2815`). The README records `export.download.large-deck-pdf` and `export.download.large-deck-pptx` as broken (`README.md:49`).
- Missing: the large deck rows passing, and a published fidelity report per export (text stays text, fonts embedded, native charts) that a buyer can compare.

### 3.5 Version history by author, agents included

- Market: no source read today shows a slide tool that labels agent edits apart from human edits in version history. Copilot edits the file directly (winbuzzer). ChatGPT for PowerPoint and Claude for PowerPoint ask for confirmation before larger changes. Listed as open in section 5.
- Turboslide today: every mutation carries an `Author` with `kind: 'human' | 'agent'` and a `runId` (`packages/schema/src/mutations.ts:185-190`). `version.diff` groups mutations "by touched block and by author" (`packages/schema/src/actions.ts:4919`). `assist.propose` writes nothing until a card is accepted (`packages/schema/src/actions.ts:5844`).
- Missing: an agent run shown as one entry in Versions with "revert this run", and agent writes over MCP landing as proposals when the deck owner sets that rule.

### 3.6 Speed

- Market: no current, measured source on Google Slides with large decks was found; listed as open.
- Turboslide today: the baseline of 2026-09-14 records `/new` ready at 823 ms cold on production, the filmstrip at 118 to 120 fps, and a text edit saved 1.4 to 2.0 s after the last keyup (`docs/performance.md:309-318`).
- Missing: the same deck timed in Turboslide and in Google Slides by one script, published with dates and machine load.

### 3.7 Cost to the buyer

- Market: every competitor meters AI per seat or per credit: Google from US$14 per user per month, Copilot US$21 on top of a Microsoft 365 plan, Gamma credits with a 2x rollover cap, Figma AI credits per seat, Canva AI use counts and an unpriced AI Pass, Pitch 100 to 750 credits.
- Turboslide today: the agent surface is MCP, HTTP and a CLI over the same actions (3.1), so a user's own Claude, ChatGPT or Gemini plan pays for the model.
- Missing: a stated policy that editing, brand rules, export and the agent surface are free, with the hosted assistant as the only metered part.

### 3.8 Presenting with an audience

- Market: Google has Q&A with anonymous questions and votes, live captions, and recording into Vids (1.2, 1.4). Figma Slides has live polls, voting and an alignment scale. Pitch sells visitor analytics and rooms.
- Turboslide today: a presenter view with the audience window on a BroadcastChannel (`apps/studio/src/routes/present.$deckId.tsx:9-28`). No Q&A, poll, caption or analytics action found.
- Missing: Q&A and polls carried on the per deck Durable Object room that the realtime round builds (docs/REALTIME.md 3.4 "The presence channel"), so they add no new backend.

### 3.9 Import as the way in

- Market: Figma and Beautiful.ai import PPTX; Google converts up to 100 MB.
- Turboslide today: `import.run` imports the Prototemplate deck HTML on the CLI only (`packages/schema/src/actions.ts:2944-2960`). PPTX import is specified in `docs/gslides-parity/SPEC-5.md:437` ("## 5. PPTX import and Import theme") and sits on the parked branch `round-five/integration` (`9a5707ac`).
- Missing: PPTX and Google Slides import on the hosted editor.

## 4. What "match and exceed" means on 2026-10-01

Match, because a buyer comparing with Google Slides will look for these:

1. Deck generation from a prompt and files, with a plan step, editable output and style matching (Google 2026-06-30; Pitch 2026-05-27; Canva 2026-04-16; Claude Slides 2026-09-16).
2. "Enhance this slide" and "Beautify this slide" on one slide (Google 2026-04-01, 2025-11-20).
3. Image generation and prompt image edits, including background replace and expand (Google 2025-08-13, 2025-09-29).
4. Building blocks: a library of agenda, quote and statistic pieces (Google 2025-03-31).
5. Audience Q&A and live captions in present mode (Google help pages).
6. Recording a talk over the deck (Google 2026-08-20).
7. PPTX import (Figma, Beautiful.ai; Google up to 100 MB).
8. Comments readable and writable by an API (Google 2026-09-30).

Exceed, because no tool read today does all of them:

1. Agent and person on one action table, with a gate that proves parity (3.1).
2. Brand kit as linter rules on every write, free (3.2).
3. Live data bound charts with an agent callable refresh (3.3).
4. A published export fidelity report per file (3.4).
5. Versions grouped by agent run with a one step revert (3.5).
6. A published speed comparison with Google Slides on the same deck (3.6).
7. No metered AI inside the editor for a user who brings an agent (3.7).

## 5. Open

- Whether Google Workspace Business Starter includes Gemini image generation in Slides: two fetches of https://workspace.google.com/pricing.html on 2026-10-01 summarised the Starter column differently.
- Google Slides' performance on decks of 100 or more slides: no current source found. The only review found was dated 2014-08-27 and was set aside.
- Smart chips in Slides: the Google help pages found today cover Docs and Sheets only.
- Gamma, Canva and Genspark prices from the vendors' own pages: blocked (403 or a bot challenge).
- Microsoft 365 Copilot pricing from microsoft.com: timed out; the price above is from office-watch.com (2025-12-10).
- Whether any slide tool labels agent edits apart in version history: none found; a negative from search is weak.
- The Gems phase out date of 2026-11-17: third party search result only.
