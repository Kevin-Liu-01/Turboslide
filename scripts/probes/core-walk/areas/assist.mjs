// The assist, the probe's rows (docs/PRODUCT.md sections 5 and 6, 8.1 `assist.*` with the driver
// `probe --core`): the Assist button in the title row with Cmd+J and Tools > Assist, the panel's
// first line and the three starter cards, Tools > Tailor for a customer with one undo, deck.tailor
// over HTTP, an outside agent write's snackbar with Undo, Search the menus with a seller's words
// and the Ask the assistant row, and assist.propose with assist.accept over HTTP with a tampered
// card refused. The model cards (Make it shorter, Write speaker notes), the fallback sentence, the
// mark, the quota and the viewer's disabled panel are core/assist.spec.ts and core/share.spec.ts.
//
// The panel, the dialog and their ids are B6's (PRODUCT.md 7.1: `title.assist`, `tools.assist`,
// `tools.tailor`, `panel.assist`, `panel.assist.firstLine`, `panel.assist.prompt`,
// `panel.assist.starter.<tailor|shorter|notes>`, `dialog.tailor.*`, `finder.assist.ask`); the
// route and its quotas are B7's. A row whose control is not on the build reads not driven with
// the control's id (8.1). The HTTP rows run where the walk holds the deployment's bearer
// (toolkit `agentHeaders`) or on a localhost server, whose surface is open to the checkout holder.

export const NAME = 'assist';
export const IDS = [
  'assist.entry.title-row',
  'assist.panel.first-line-and-cards',
  'assist.tailor.dialog-one-undo',
  'assist.tailor.agent-deck-tailor',
  'assist.outside-write.snackbar',
  'assist.finder.terms',
  'assist.finder.ask-row',
  'assist.agent.propose-accept',
];

const LANE = 'B6';

export async function run(t) {
  const { page } = t;
  const T = t.deck.titleSlide;
  /* two slides naming Acme and a pricing slide, the tailor rows' deck */
  const A = await t
    .setup(
      'two slides naming Acme and a pricing slide',
      'slide.new and block.insert through the window API',
      async () => {
        const a = await t.setupSlide(t.deck.fontSlide ?? t.deck.titleSlide, 'blank');
        const p = await t.setupSlide(a, 'blank');
        t.deck.assistSlide = a;
        t.deck.pricingSlide = p;
        const one = await t.placeBlock(a, {
          id: 'acme-one',
          type: 'text',
          text: 'Acme renews in the third quarter',
          pos: { x: 160, y: 200, w: 900, h: 120 },
        });
        /* a paragraph the fixture can shorten: assist-fixtures.ts shorterText keeps a text of
           eight words or fewer as it is, and an answer that changes nothing makes no card (the
           first gate run's assist.propose answered the fallback sentence on the six word box) */
        const long = await t.placeBlock(a, {
          id: 'renewal-long',
          type: 'text',
          text: 'The renewal covers the three regions and the two new products for the whole of next year, with a review each quarter and a fixed price for the first two years of the term.',
          pos: { x: 160, y: 360, w: 1200, h: 200 },
        });
        const two = await t.placeBlock(p, {
          id: 'acme-two',
          type: 'text',
          text: 'Pricing for Acme, internal',
          pos: { x: 160, y: 200, w: 900, h: 120 },
        });
        return {
          ok: Boolean(a && p && one && two && long),
          observed: `slides ${a}, ${p}; boxes ${one?.id}, ${two?.id}, ${long?.id}`,
        };
      },
    )
    .then(() => t.deck.assistSlide);
  const PRICING = t.deck.pricingSlide;
  await t.clickCard(A);
  await t.clearAll();

  const closePanel = async () => {
    if (await t.visible('panel.assist.close')) await t.clickControl('panel.assist.close');
    else if (await t.visible('panel.assist')) await t.press('Escape');
    await t.sleep(200);
  };
  /** The text of every Acme and Globex on the deck, and whether the pricing slide is skipped. */
  const deckFacts = async () => {
    const ids = await t.slideOrder();
    let acme = 0;
    let acmeSlides = 0;
    let globex = 0;
    for (const id of ids) {
      const json = JSON.stringify(await t.slideJson(id));
      acme += (json.match(/Acme/g) ?? []).length;
      if (/Acme/.test(json)) acmeSlides += 1;
      globex += (json.match(/Globex/g) ?? []).length;
    }
    const skipped = (await t.cards()).find((c) => c.id === PRICING)?.skipped ?? null;
    return { acme, acmeSlides, globex, skipped };
  };
  const snackbarUndo = async (ms = 6000) => {
    const said = await t.snackbarWithin(ms).catch(() => null);
    const undo = await t.visible('snackbar.action');
    const label = undo ? await t.textOf('snackbar.action') : null;
    return {
      said,
      undo: undo && /undo/i.test(label ?? ''),
      control: undo ? 'snackbar.action' : null,
    };
  };

  await t.step(
    'assist.entry.title-row',
    'read the title row; Cmd+J; Tools > Assist',
    'the Assist button sits between the presence chips and the comments glyph; Cmd+J and Tools > Assist open the panel',
    async () => {
      await t.clearAll();
      if (!(await t.visible('title.assist'))) {
        /* the row may be parked on this build: with the switch on the button draws */
        const r = await t.reachRow('tools', 'tools.assist');
        if (!r.present || !(await t.visible('title.assist'))) {
          await t.advancedBack('the Assist entry');
          return t.notBuilt(
            'title.assist',
            LANE,
            `Tools > Assist ${r.present ? 'present' : 'absent'}`,
          );
        }
      }
      const order = await page.evaluate(() => {
        const x = (sel) => document.querySelector(sel)?.getBoundingClientRect().x ?? null;
        return {
          presence: x('[data-control="title.presence"]'),
          assist: x('[data-control="title.assist"]'),
          comments: x('[data-control="title.comments.slot"], [data-control="title.comments"]'),
        };
      });
      const between =
        order.presence !== null &&
        order.assist !== null &&
        order.comments !== null &&
        order.presence < order.assist &&
        order.assist < order.comments;
      await t.press('Meta+j');
      const byKey = await t
        .pollUntil(
          () => t.visible('panel.assist'),
          (x) => x,
          6000,
        )
        .catch(() => false);
      await closePanel();
      const r = await t.reachRow('tools', 'tools.assist');
      let byMenu = false;
      if (r.present) {
        await t.menuPath('tools', 'tools.assist');
        byMenu = await t
          .pollUntil(
            () => t.visible('panel.assist'),
            (x) => x,
            6000,
          )
          .catch(() => false);
        await closePanel();
      }
      await t.advancedBack('the Assist entry');
      return {
        ok: between && byKey && byMenu,
        observed: `x: presence ${order.presence}, assist ${order.assist}, comments ${order.comments} (between ${between}); Cmd+J opened the panel ${byKey}; Tools > Assist ${r.present ? `opened it ${byMenu}` : 'absent'}`,
      };
    },
  );

  await t.step(
    'assist.panel.first-line-and-cards',
    'open the panel with a slide selected; read the first line and the cards',
    'the first line names where the text goes; three starter cards: Tailor for a customer, Make it shorter, Write speaker notes',
    async () => {
      await t.clearAll();
      await t.clickCard(A);
      if (!(await t.visible('title.assist'))) return t.notBuilt('title.assist', LANE);
      await t.clickControl('title.assist');
      const open = await t
        .pollUntil(
          () => t.visible('panel.assist'),
          (x) => x,
          6000,
        )
        .catch(() => false);
      if (!open) return { ok: false, observed: 'the panel did not open from the title row button' };
      const line = await t.textOf('panel.assist.firstLine');
      const cards = {
        tailor: await t.visible('panel.assist.starter.tailor'),
        shorter: await t.visible('panel.assist.starter.shorter'),
        notes: await t.visible('panel.assist.starter.notes'),
      };
      const labels = await page.evaluate(() =>
        ['tailor', 'shorter', 'notes'].map(
          (k) =>
            document
              .querySelector(`[data-control="panel.assist.starter.${k}"]`)
              ?.textContent?.trim() ?? '',
        ),
      );
      await closePanel();
      return {
        ok:
          /model provider|sent to|Nothing is written/.test(line ?? '') &&
          cards.tailor &&
          cards.shorter &&
          cards.notes &&
          /Tailor for a customer/.test(labels[0]) &&
          /Make it shorter/.test(labels[1]) &&
          /speaker notes/i.test(labels[2]),
        observed: `first line "${(line ?? 'none').slice(0, 140)}"; cards ${JSON.stringify(cards)}; labels ${labels.map((l) => `"${l}"`).join(', ')}`,
      };
    },
  );

  await t.step(
    'assist.tailor.dialog-one-undo',
    'Tools > Tailor for a customer: Acme to Globex, skip the pricing slide, Apply; Cmd+Z',
    'the count reads every Acme on the deck as N places on M slides; every Acme reads Globex and the slide is skipped; the snackbar carries Undo; one Cmd+Z restores both',
    async () => {
      await t.clearAll();
      await t.clickCard(A);
      const r = await t.reachRow('tools', 'tools.tailor');
      if (!r.present) {
        await t.advancedBack('Tools > Tailor for a customer');
        return t.notBuilt('tools.tailor', LANE);
      }
      const before = await deckFacts();
      await t.menuPath('tools', 'tools.tailor');
      await t.waitControl('dialog.tailor', 8000);
      await t.clickControl('dialog.tailor.from');
      await t.typeHuman('Acme');
      await t.clickControl('dialog.tailor.to');
      await t.typeHuman('Globex');
      const count = await t
        .pollUntil(
          () => t.textOf('dialog.tailor.count'),
          (x) => /\d+ places? on \d+ slides?/.test(x ?? ''),
          6000,
        )
        .catch(() => t.textOf('dialog.tailor.count'));
      const skipBox = `dialog.tailor.skip.${PRICING}`;
      const hasSkip = await t.visible(skipBox);
      if (hasSkip) await t.clickControl(skipBox);
      const revBefore = (await t.state()).revision;
      await t.clickControl('dialog.tailor.apply');
      const { said, undo } = await snackbarUndo();
      const after = await t
        .pollUntil(deckFacts, (f) => f.acme === 0 && f.globex >= 2, 15_000)
        .catch(deckFacts);
      await t.settled();
      const revAfter = (await t.state()).revision;
      await t.clearAll();
      await t.press('Meta+z');
      const restored = await t
        .pollUntil(deckFacts, (f) => f.acme === before.acme && f.skipped === before.skipped, 15_000)
        .catch(deckFacts);
      await t.settled();
      const revUndo = (await t.state()).revision;
      await t.advancedBack('Tools > Tailor for a customer');
      return {
        ok:
          /* the deck holds the Acme of every area that ran before this one, not two alone */
          new RegExp(`^${before.acme} places? on ${before.acmeSlides} slides?$`).test(
            (count ?? '').trim(),
          ) &&
          hasSkip &&
          after.acme === 0 &&
          after.globex === before.acme &&
          after.skipped === true &&
          revAfter === revBefore + 1 &&
          undo &&
          restored.acme === before.acme &&
          restored.skipped === before.skipped,
        observed: `count "${count ?? 'none'}"; skip box ${hasSkip}; Acme ${before.acme} -> ${after.acme} -> ${restored.acme}; Globex ${before.globex} -> ${after.globex} -> ${restored.globex}; pricing skipped ${before.skipped} -> ${after.skipped} -> ${restored.skipped}; revision ${revBefore} -> ${revAfter} -> ${revUndo}; snackbar "${said ?? 'none'}" with Undo ${undo}`,
      };
    },
  );

  await t.step(
    'assist.tailor.agent-deck-tailor',
    'deck.tailor over HTTP with the bearer: one replacement, one skipped slide',
    "one revision moves and the open editor's snackbar names the change with Undo",
    async () => {
      await t.clearAll();
      await t.clickCard(A);
      const actions = await t.windowActions();
      if (!actions.has('deck.tailor'))
        return t.notBuilt('deck.tailor', LANE, 'the window API lists no deck.tailor action');
      const before = await deckFacts();
      const s = await t.settled();
      const http = await t.httpAction(
        'deck.tailor',
        {
          replacements: [{ from: 'Acme', to: 'Globex' }],
          skip: [PRICING],
          baseRevision: s.revision,
        },
        { author: `agent:core-walk-${Date.now().toString(36)}` },
      );
      if (http.noBearer)
        return {
          ok: null,
          observed:
            'not driven: no bearer for this origin (TURBOSLIDE_TOKEN or ~/.config/turboslide/hosts.json); a localhost server needs none',
        };
      if (http.status === 501)
        return t.notBuilt(
          'deck.tailor',
          LANE,
          `the route answers 501 ${JSON.stringify(http.body?.error?.message ?? '').slice(0, 120)}`,
        );
      const { said, undo, control } = await snackbarUndo(10_000);
      const after = await t.pollUntil(deckFacts, (f) => f.acme === 0, 15_000).catch(deckFacts);
      const revAfter = (await t.state()).revision;
      /* the deck back through the snackbar's Undo when it is there, else through the window API
         (the agent's write is not in the page's undo stack; the first smoke left Globex behind) */
      let restored;
      /* the snackbar leaves on its own while the facts are read; a gone Undo takes the API way */
      if (control && (await t.visible(control))) {
        await t.clickControl(control);
        restored = await t
          .pollUntil(deckFacts, (f) => f.acme === before.acme, 15_000)
          .catch(deckFacts);
      } else {
        const s2 = await t.settled();
        await t
          .invoke('text.replaceAll', { find: 'Globex', replace: 'Acme', baseRevision: s2.revision })
          .catch(() => undefined);
        if (after.skipped === true && before.skipped !== true) {
          await t.clickCard(PRICING);
          await t.menuPath('slide', 'slide.skipSlide').catch(() => undefined);
          await t.clickCard(A);
        }
        restored = await t
          .pollUntil(deckFacts, (f) => f.acme === before.acme, 15_000)
          .catch(deckFacts);
      }
      await t.settled();
      return {
        ok:
          http.status < 300 &&
          revAfter === s.revision + 1 &&
          after.acme === 0 &&
          after.skipped === true &&
          /Globex|Acme|slide/i.test(said ?? '') &&
          undo,
        observed: `HTTP ${http.status} ${JSON.stringify(http.body ?? null).slice(0, 120)}; revision ${s.revision} -> ${revAfter}; Acme ${before.acme} -> ${after.acme} -> ${restored.acme} (put back through ${control ? "the snackbar's Undo" : 'the window API, the snackbar carried no Undo'}); pricing skipped ${after.skipped}; snackbar "${said ?? 'none'}" with Undo ${undo}`,
      };
    },
  );

  await t.step(
    'assist.outside-write.snackbar',
    'the seller types a word; POST /api/actions/text.replaceAll as an agent while the editor is open; Undo from the snackbar',
    "the snackbar names the change with Undo within 10 s; Undo reverts the agent's write and keeps the seller's own last edit",
    async () => {
      await t.clearAll();
      await t.clickCard(A);
      /* the row's own box, so it stands whatever the tailor rows left: the seller's last edit is
         a word appended to it, and the agent's write replaces another word of it */
      const box = await t.placeBlock(A, {
        id: 'outside-box',
        type: 'text',
        text: 'The forecast renews the quarter',
        pos: { x: 160, y: 500, w: 900, h: 100 },
      });
      if (!box) return { ok: false, observed: "the row's text box was not placed" };
      const run = (await t.runsOfBlock('outside-box'))[0];
      if (!run) return { ok: false, observed: "no run in the row's box" };
      await t.openRun(run);
      await t.press('End');
      await t.typeHuman(' today');
      await t.press('Escape');
      const s = await t.settled();
      const textOf = async () => JSON.stringify(await t.slideJson(A));
      const mine = (await textOf()).includes('today');
      const http = await t.httpAction(
        'text.replaceAll',
        { find: 'renews', replace: 'renewed', baseRevision: s.revision },
        { author: `agent:core-walk-${Date.now().toString(36)}` },
      );
      if (http.noBearer)
        return {
          ok: null,
          observed:
            'not driven: no bearer for this origin (TURBOSLIDE_TOKEN or ~/.config/turboslide/hosts.json); a localhost server needs none',
        };
      const t0 = Date.now();
      const { said, undo, control } = await snackbarUndo(10_000);
      const landedMs = Date.now() - t0;
      const written = await t
        .pollUntil(textOf, (j) => j.includes('renewed'), 15_000)
        .then(() => true)
        .catch(() => false);
      let reverted = null;
      let kept = null;
      if (control) {
        await t.clickControl(control);
        reverted = await t
          .pollUntil(textOf, (j) => j.includes('renews') && !j.includes('renewed'), 15_000)
          .then(() => true)
          .catch(() => false);
        kept = (await textOf()).includes('today');
      }
      /* the row's box leaves through the window API */
      const s2 = await t.settled();
      await t
        .invoke('block.remove', { baseRevision: s2.revision, slideId: A, blockId: 'outside-box' })
        .catch(() => undefined);
      await t.settled();
      return {
        ok:
          mine &&
          http.status < 300 &&
          written &&
          /renewed|changed|Assistant|agent/i.test(said ?? '') &&
          undo &&
          reverted === true &&
          kept === true,
        observed: `seller's edit stored ${mine}; HTTP ${http.status} ${JSON.stringify(http.body ?? null).slice(0, 100)}; snackbar "${said ?? 'none'}" after ${landedMs} ms with Undo ${undo}; the agent's word landed ${written}${control ? `; after Undo reverted ${reverted}, the seller's word kept ${kept}` : '; no Undo to press'}`,
      };
    },
  );

  /** Search the menus: the visible palette rows for a phrase, in order. */
  const finderRows = async (phrase) => {
    await t.clearAll();
    await t.clickControl('toolbar.search');
    await t.waitControl('palette.query', 8000);
    await t.typeHuman(phrase);
    await t.sleep(500);
    const rows = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-control="palette"] [data-control^="palette."], [data-control^="finder."]',
        ),
      ]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => el.getAttribute('data-control'))
        .filter((c) => c !== 'palette.query' && c !== 'palette.icon' && c !== 'palette'),
    );
    const empty = await page.evaluate(
      () =>
        document.querySelector('[data-control="palette"] .pt-search-empty')?.textContent?.trim() ??
        null,
    );
    return { rows, empty };
  };
  await t.step(
    'assist.finder.terms',
    'Search the menus: hide slide; rename the customer; logo',
    'Skip slide first; Find and replace and Tailor for a customer; Replace image',
    async () => {
      const hide = await finderRows('hide slide');
      await t.press('Escape');
      const rename = await finderRows('rename the customer');
      await t.press('Escape');
      const logo = await finderRows('logo');
      await t.press('Escape');
      await t.waitGone('[data-control="palette.query"]', 4000);
      const first = hide.rows[0] ?? null;
      const ok =
        first === 'palette.menu:slide.skipSlide' &&
        rename.rows.includes('palette.menu:edit.findReplace') &&
        rename.rows.includes('palette.menu:tools.tailor') &&
        logo.rows.some((r) => /replaceImage/.test(r));
      return {
        ok,
        observed: `"hide slide": ${hide.rows.slice(0, 4).join(', ') || hide.empty}; "rename the customer": ${rename.rows.slice(0, 5).join(', ') || rename.empty}; "logo": ${logo.rows.slice(0, 5).join(', ') || logo.empty}`,
      };
    },
  );

  await t.step(
    'assist.finder.ask-row',
    'Search the menus with a phrase that matches nothing; Enter',
    'the Ask the assistant row shows the phrase; Enter opens the panel with the phrase in the box',
    async () => {
      const phrase = 'zebra stripes on the cover';
      const { rows, empty } = await finderRows(phrase);
      /* the palette prefixes every row with `palette.` (docs/FOCUS.md section 1) */
      const askRow = rows.find((c) => /^(palette\.)?finder\.assist\.ask$/.test(c)) ?? null;
      if (askRow === null) {
        await t.press('Escape');
        await t.waitGone('[data-control="palette.query"]', 4000);
        return t.notBuilt(
          'finder.assist.ask',
          LANE,
          `rows ${rows.join(', ') || 'none'}; empty state "${empty ?? 'none'}"`,
        );
      }
      const label = await t.textOf(askRow);
      await t.press('Enter');
      const open = await t
        .pollUntil(
          () => t.visible('panel.assist'),
          (x) => x,
          6000,
        )
        .catch(() => false);
      const prompt = open ? await t.valueOf('panel.assist.prompt') : null;
      await closePanel();
      return {
        ok:
          /Ask the assistant/.test(label ?? '') &&
          (label ?? '').includes(phrase) &&
          open &&
          (prompt ?? '').includes(phrase),
        observed: `row "${label ?? 'none'}"; panel open ${open}; prompt "${prompt ?? 'none'}"`,
      };
    },
  );

  await t.step(
    'assist.agent.propose-accept',
    'assist.propose over HTTP, assist.accept with the card, then the card with one byte changed',
    'a signed card comes back; accept writes and the revision moves; the tampered card is refused',
    async () => {
      await t.clearAll();
      await t.clickCard(A);
      const actions = await t.windowActions();
      if (!actions.has('assist.propose') || !actions.has('assist.accept'))
        return t.notBuilt('assist.propose', LANE, 'the window API lists no assist action');
      const s = await t.settled();
      const propose = await t.httpAction('assist.propose', {
        intent: 'shorter',
        prompt: 'Make it shorter',
        slideIds: [A],
        baseRevision: s.revision,
      });
      if (propose.noBearer)
        return {
          ok: null,
          observed:
            'not driven: no bearer for this origin (TURBOSLIDE_TOKEN or ~/.config/turboslide/hosts.json); a localhost server needs none',
        };
      if (propose.status === 501)
        return t.notBuilt(
          'assist.propose',
          LANE,
          `the route answers 501 ${JSON.stringify(propose.body?.error?.message ?? '').slice(0, 120)}`,
        );
      const card = propose.body?.cards?.[0] ?? null;
      if (!card)
        return {
          ok: false,
          observed: `assist.propose answered ${propose.status} ${JSON.stringify(propose.body ?? null).slice(0, 200)}`,
        };
      const revBefore = (await t.state()).revision;
      const accept = await t.httpAction('assist.accept', { card, baseRevision: revBefore });
      const revAfter = await t
        .pollUntil(
          async () => (await t.state()).revision,
          (r) => r !== revBefore,
          15_000,
        )
        .catch(async () => (await t.state()).revision);
      await t.settled();
      const tampered = {
        ...card,
        signature: `${String(card.signature ?? '').slice(0, -1)}${card.signature?.endsWith('a') ? 'b' : 'a'}`,
      };
      const refused = await t.httpAction('assist.accept', {
        card: tampered,
        baseRevision: (await t.state()).revision,
      });
      /* the deck back */
      await t.clearAll();
      await t.press('Meta+z');
      await t.settled();
      return {
        ok:
          typeof card.signature === 'string' &&
          accept.status < 300 &&
          revAfter === revBefore + 1 &&
          refused.status >= 400,
        observed: `propose ${propose.status}: ${card.sentence ?? 'no sentence'} (signature ${typeof card.signature}); accept ${accept.status}, revision ${revBefore} -> ${revAfter}; tampered card ${refused.status} ${JSON.stringify(refused.body?.error ?? refused.body ?? null).slice(0, 100)}`,
      };
    },
  );
}
