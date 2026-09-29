# The assist on Ramp Router

Written by hand on 2026-09-29 for the router hotfix. Kevin asked for the assistant to run through Ramp Router (https://docs.router.com) on the cheapest model that still performs well. This note records the client, the benchmark and the pick.

## The client

`routerModel` in `apps/studio/src/server/assist.ts` sends one OpenAI Responses request to `https://api.router.com/v1/responses` with the router key as the bearer: the system block as `instructions`, the user turn as `input`, `max_output_tokens` 4,000, `reasoning.effort` low, the card's schema as a strict `json_schema` format and `allow_flex_tier: false`, so the call stays off the router's Flex tier and inside the 20 s bound of docs/PRODUCT.md 8.2. The strict format requires every property and closes every object, and the ask's union of three shapes folds into one object with `intent` as the discriminator (`strictSchema`); `readAnswer` reads the folded shape as it reads the three. The router's usage record carries `metadata { app, feature, intent }` and never the slide text.

The mode: `RAMP_ROUTER_API_KEY` set is the model mode and wins over `ANTHROPIC_API_KEY`; `TURBOSLIDE_ASSIST_MODEL` names another model from the router's `GET /v1/models`; `RAMP_ROUTER_BASE_URL` points the client elsewhere for a test. The Messages API client stays as the path of a deployment without the router.

## The benchmark

Twelve prompts from the worked deck of `@turboslide/schema/fixtures` through the real client: `shorter` on four slides, `notes` on three, and five free asks (make the heading punchier, cut this down to one line, write a talk track for this slide, add a video, translate this slide into French). Right intent counts a card of the expected shape, or no card where the ask fits neither shape (the last two). Prices are the router's base rates. Run from this machine at 10:21 PDT; the harness is `router-bench.test.ts` in the session's scratchpad, not in the tree.

| Model             | Price in / out ($ per M) | Right intent | Errors | Median ms | Max ms | Tokens in / out (12 calls) | Cost for 12 calls |
| ----------------- | ------------------------ | ------------ | ------ | --------- | ------ | -------------------------- | ----------------- |
| gpt-5-nano        | 0.05 / 0.40              | 12 of 12     | 0      | 6407      | 11759  | 5567 / 8054                | $0.00350          |
| gpt-6-luna        | 0.10 / 0.50              | 11 of 12     | 0      | 1456      | 5435   | 5567 / 1219                | $0.00117          |
| deepseek-v4-flash | 0.14 / 0.28              | 0 of 12      | 12     |           |        | 0 / 0                      |                   |
| gpt-4o-mini       | 0.15 / 0.60              | 0 of 12      | 12     |           |        | 0 / 0                      |                   |
| glm-5p3-flash     | 0.15 / 0.50              | 9 of 12      | 1      | 1549      | 12819  | 3975 / 1454                | $0.00132          |
| gpt-5.4-nano      | 0.20 / 1.25              | 12 of 12     | 0      | 1396      | 2663   | 5567 / 1195                | $0.00261          |
| gpt-5.6-luna      | 0.20 / 1.20              | 12 of 12     | 0      | 1469      | 3393   | 5567 / 1007                | $0.00232          |
| minimax-m3        | 0.30 / 1.20              | 11 of 12     | 0      | 5045      | 22786  | 5505 / 12563               | $0.01673          |
| claude-haiku-4-5  | 1.00 / 5.00              | 11 of 12     | 0      | 20344     | 29702  | 8922 / 9458                | $0.05621          |

What the table does not show: `deepseek-v4-flash` answered 404 (not in this key's catalog), `gpt-4o-mini` 400 (no reasoning efforts, so the request's `reasoning.effort` is refused), and the Gemini models need a Google key of their own on the router (403 `provider_key_required`), so they were not run. `gpt-5-nano` is the cheapest by rate but reasons at length (8,054 output tokens over the twelve calls against about 1,200 for the others), which makes it three times the cost of `gpt-6-luna` per call and four times slower. `claude-haiku-4-5` ran past the 20 s bound on most calls.

The one miss of `gpt-6-luna`: "make the heading punchier" read as `none`, which the system prompt allows (punchier is neither shorter nor the notes); `claude-haiku-4-5` and `glm-5p3-flash` read it the same way. Its rewrites kept every numeral and proper noun and read shorter; its notes were talk tracks in full sentences under 120 words.

## The pick

`gpt-6-luna` is the default (`ASSIST_ROUTER_MODEL`): the cheapest model that answered every unambiguous prompt with the right shape, a median of 1.5 s per call, structured outputs and prompt caching, and a 1M context. `gpt-5.6-luna` is the runner up at twice the rate with twelve of twelve.

## The judges

Three judges read the four models that answered (`gpt-6-luna`, `gpt-5.6-luna`, `gpt-5.4-nano`, `gpt-5-nano`) through one lens each, blind to price and latency: meaning and facts, the copy rules, and intent resolution with a seller's acceptance. The scores out of ten, in that order: `gpt-6-luna` 8.5, 9, 8; `gpt-5.6-luna` 7, 7, 7; `gpt-5.4-nano` 5.5, 5, 5; `gpt-5-nano` 3, 3, 3. What separated the field was the proper noun on "make the heading punchier": `gpt-6-luna` declined, `gpt-5.6-luna` wrote a slogan ("Translation, made simple"), `gpt-5.4-nano` cut the name to "Translation", `gpt-5-nano` abbreviated it to "Gen. Translation" and twice wrote the target key into the slide text. The nano models also wrote notes as stage directions ("Use this slide as", "This slide introduces") rather than a talk track.

The judges' findings that changed the system prompt (`ASSIST_SYSTEM`, one sentence each): proper nouns stay as written and a credit line keeps every credited party (`gpt-6-luna` had dropped NASA from the mood slide's credit in its notes); the text of a target never carries the key or the path; an ask that names a bound overrides the plain shorter answer (`gpt-6-luna` had answered "cut this down to one line" with two sentences); a text that cannot read shorter is left out and list items keep their parallel form; notes are spoken words in the first person plural that add no intent or fact the slide lacks. "Punchier" stays unmapped: `none` is the safer reading and the fallback sentence names the two answers.

The rerun of `gpt-6-luna` on the twelve prompts after the prompt change is recorded below.

The rerun (10:47 PDT, the same twelve prompts): `gpt-6-luna` 11 of 12 with the same defensible `none` on "punchier", a median of 1,345 ms and a maximum of 5,825 ms, 7,199 input tokens (the longer system block) and 1,241 output tokens over the twelve calls; "cut this down to one line" now answers one line that keeps the date, and the mood slide's notes open with NASA's credit. `gpt-5.6-luna` on the same run read one plain `shorter` as `none`, so the pick stands.
