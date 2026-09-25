// The chrome (docs/RETURN.md section 4, section 5 `chrome.*` with the driver `probe --core`):
// the Slideshow split button read from pixels (one box, the divider, no notch), its hover, its
// click, the chevron's menu and its alignment, Enter, Space, ArrowDown and Tab, its ARIA, its
// collapse at 900 px; the nine seams read from a 1x screenshot in both appearances at 1440 and
// at 900; the toolbar dividers; the right cluster's gaps and heights; the comments glyph as a
// toggle. The pixel reads are the toolkit's port of audit-chrome.mjs (RETURN.md 4.4): a computed
// style can ask for a token the pixels never show (audit-chrome row 9), so these rows read the
// screenshot. The chrome feature is unparkable (RETURN.md rule 2): a red row here blocks the ship.

export const NAME = 'chrome';
export const IDS = [
  'chrome.split.one-box',
  'chrome.split.hover-no-inversion',
  'chrome.split.click-show',
  'chrome.split.chevron-menu-aligned',
  'chrome.split.enter-chevron',
  'chrome.split.enter-label',
  'chrome.split.space-both',
  'chrome.split.arrow-down-label',
  'chrome.split.tab-order',
  'chrome.split.aria',
  'chrome.split.collapse-900',
  'chrome.separators.once',
  'chrome.separators.toolbar-dividers',
  'chrome.cluster.gaps-heights',
  'chrome.comments-glyph.toggle',
  /* the product round (docs/PRODUCT.md 8.1) */
  'chrome.bottom-bar.removed',
  'chrome.menu.no-tooltip-with-submenu',
  'chrome.menu.escape-focus-stage',
  'chrome.presence.tooltip',
  'chrome.contrast.titanium-light',
  'chrome.disabled.token-both-appearances',
  'chrome.field.boundary-3-1',
  'chrome.hover.ground',
  'chrome.floating.edge-frame',
  'chrome.focus.one-ring-rule',
  'chrome.filmstrip.one-ring',
  'chrome.tooltip.none-on-focus-in-menus',
  'chrome.menu.plate-fits-labels',
  'chrome.menu.no-mnemonics-mac',
  'chrome.select.one-rule',
  'chrome.check.draws-check',
  'chrome.toolbar.bold-follows-selection',
];

const VIEWPORT = { width: 1440, height: 900 };

export async function run(t) {
  const { page } = t;
  const T = t.deck.titleSlide;
  await t.clickCard(T);
  await t.clearAll();

  /** The viewport boxes and computed edges of the right cluster's controls. */
  const cluster = () =>
    page.evaluate(() => {
      const read = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          right: r.right,
          radius: cs.borderRadius,
          background: cs.backgroundColor,
          color: cs.color,
          borderLeft: `${cs.borderLeftWidth} ${cs.borderLeftColor}`,
          border: `${cs.borderTopWidth} ${cs.borderTopColor}`,
          opacity: cs.opacity,
          visible:
            el.getClientRects().length > 0 && cs.visibility !== 'hidden' && cs.display !== 'none',
        };
      };
      return {
        viewport: window.innerWidth,
        row: read('.ts-title-row'),
        presence: read('[data-control="title.presence"]'),
        more: read('[data-control="presence.more"]'),
        /* the product round's two slots (docs/PRODUCT.md 6.1, section 2 rank 25): Assist before the comments glyph, the side panel toggle after it */
        assistSlot: read('[data-control="title.assist.slot"]'),
        commentsSlot: read('[data-control="title.comments.slot"]'),
        comments: read('[data-control="title.comments"]'),
        panelSlot: read('[data-control="title.sidePanel.slot"]'),
        inboxSlot: read('[data-control="title.inbox.slot"]'),
        inbox: read('[data-control="title.inbox"]'),
        split: read('[data-control="present.split"]'),
        open: read('[data-control="present.open"]'),
        arrow: read('[data-control="present.arrow"]'),
        label: read('[data-control="present.open"] .pt-lb'),
        share: read('[data-control="share.open"]'),
        theme: document.documentElement.getAttribute('data-theme'),
      };
    });
  const themeNow = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  /** View > Appearance > light or dark through the product (the row itself is the view area's). */
  const setChrome = async (appearance) => {
    if ((await themeNow()) === appearance) return true;
    const r = await t.reachRow('view', 'view.appearance', `view.appearance.${appearance}`);
    if (!r.present) return false;
    await t.menuPath('view', 'view.appearance', `view.appearance.${appearance}`);
    return (
      (await t.pollUntil(themeNow, (x) => x === appearance, 5000).catch(themeNow)) === appearance
    );
  };
  /** Both appearances, starting from the current one and coming back to it. */
  const eachAppearance = async (fn) => {
    const start = await themeNow();
    const other = start === 'dark' ? 'light' : 'dark';
    const out = {};
    out[start] = await fn(start);
    const switched = await setChrome(other);
    out[other] = switched
      ? await fn(other)
      : { error: `View > Appearance > ${other} not reachable` };
    await setChrome(start);
    return out;
  };
  /** A paper like pixel: within 40 of the title row's background on every channel. */
  const rgbOf = (css) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css ?? '');
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const closeTo = (a, b, tol = 40) => a && b && a.every((v, i) => Math.abs(v - b[i]) <= tol);

  await t.step(
    'chrome.split.one-box',
    'read the Slideshow control from a 1x screenshot, both appearances',
    'one 32 px box with 8 px outer corners, halves with no corners, no notch under the top edge, one 1 px divider at mid height reading on the ink ground at 1.7:1 or more',
    async () => {
      await t.clearAll();
      const result = await eachAppearance(async (appearance) => {
        const c = await cluster();
        if (!c.split || !c.open || !c.arrow) return { error: 'no split button in the title row' };
        const img = await t.shotPixels();
        const seam = t.splitSeamFromShot(img, c.open, c.arrow);
        const rowBg = rgbOf(c.row?.background);
        const paperLike = (run) => closeTo(hexToRgb(run.color), rowBg);
        const ground = rgbOf(c.split.background) ?? hexToRgb(seam.mid[0]?.color ?? '#000000');
        const thin = seam.mid.filter((r) => r.thickness <= 3);
        const divider = thin.length === 1 ? thin[0] : null;
        const dividerContrast = divider
          ? Number(t.contrastRgb(hexToRgb(divider.color), ground).toFixed(2))
          : null;
        const notch1 = seam.top1.filter((r) => r.thickness <= 8 && paperLike(r)).length;
        const notch2 = seam.top2.filter((r) => r.thickness <= 8 && paperLike(r)).length;
        return {
          appearance,
          box: `${Math.round(c.split.w)}x${Math.round(c.split.h)} radius ${c.split.radius}`,
          halves: `open ${Math.round(c.open.h)} radius ${c.open.radius}; arrow ${Math.round(c.arrow.w)}x${Math.round(c.arrow.h)} radius ${c.arrow.radius}`,
          mid: seam.mid.map((r) => `${r.color}x${r.thickness}`).join(' '),
          top1: seam.top1.map((r) => `${r.color}x${r.thickness}`).join(' '),
          top2: seam.top2.map((r) => `${r.color}x${r.thickness}`).join(' '),
          divider: divider
            ? `${divider.color} ${divider.thickness} px at ${dividerContrast}:1`
            : `${thin.length} thin runs`,
          notch: notch1 + notch2,
          ok:
            Math.round(c.split.h) === 32 &&
            /^8px/.test(c.split.radius) &&
            c.open.radius === '0px' &&
            c.arrow.radius === '0px' &&
            divider !== null &&
            divider.thickness === 1 &&
            dividerContrast !== null &&
            dividerContrast >= 1.7 &&
            notch1 === 0 &&
            notch2 === 0,
        };
      });
      const both = Object.values(result);
      return {
        ok: both.length === 2 && both.every((r) => r.ok === true),
        observed: both
          .map((r) =>
            r.error
              ? r.error
              : `${r.appearance}: box ${r.box}; halves ${r.halves}; mid ${r.mid}; divider ${r.divider}; top1 ${r.top1}; top2 ${r.top2}; paper notches ${r.notch}`,
          )
          .join(' | '),
      };
    },
  );

  await t.step(
    'chrome.split.hover-no-inversion',
    'hover the Slideshow half, then the chevron half',
    'the hovered half is shaded with --pt-plate-on-ink and nothing inverts',
    async () => {
      await t.clearAll();
      const rest = await cluster();
      const token = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--pt-plate-on-ink').trim(),
      );
      await page.mouse.move(rest.open.x + rest.open.w / 2, rest.open.y + rest.open.h / 2);
      await t.sleep(300);
      const overOpen = await cluster();
      await page.mouse.move(rest.arrow.x + rest.arrow.w / 2, rest.arrow.y + rest.arrow.h / 2);
      await t.sleep(300);
      const overArrow = await cluster();
      await page.mouse.move(rest.row.x + 20, rest.row.y + rest.row.h + 200);
      await t.sleep(200);
      const shaded = (before, after) =>
        after.background !== before.background && after.background !== 'rgba(0, 0, 0, 0)';
      const same = (a, b) => a.background === b.background && a.color === b.color;
      const noInversion = (half) =>
        half.color === rest.open.color && half.background !== rest.split.background;
      const ok =
        shaded(rest.open, overOpen.open) &&
        noInversion(overOpen.open) &&
        same(overOpen.arrow, rest.arrow) &&
        overOpen.split.background === rest.split.background &&
        shaded(rest.arrow, overArrow.arrow) &&
        noInversion(overArrow.arrow) &&
        same(overArrow.open, rest.open) &&
        overArrow.split.background === rest.split.background;
      return {
        ok,
        observed: `token --pt-plate-on-ink "${token}"; wrapper ${rest.split.background}; label half ${rest.open.background}/${rest.open.color} -> hovered ${overOpen.open.background}/${overOpen.open.color} (chevron then ${overOpen.arrow.background}); chevron half ${rest.arrow.background} -> hovered ${overArrow.arrow.background}/${overArrow.arrow.color} (label then ${overArrow.open.background})`,
      };
    },
  );

  const showOpen = () => t.has('[data-control="present.show"]');
  const leaveShow = async () => {
    await t.press('Escape');
    await page
      .locator('[data-control="present.show"]')
      .waitFor({ state: 'detached', timeout: 8000 })
      .catch(() => undefined);
    await t.sleep(300);
  };
  await t.step(
    'chrome.split.click-show',
    'click the Slideshow half, Escape',
    'the show opens from the current slide; Escape leaves',
    async () => {
      await t.clearAll();
      await t.clickControl('present.open');
      const open = await t.pollUntil(showOpen, (x) => x, 8000).catch(showOpen);
      const slide = await page.evaluate(
        () =>
          document
            .querySelector(
              '.ts-stagewrap.is-present .pt-slide:not(.is-leaving), .pt-viewer.is-present .pt-slide:not(.is-leaving)',
            )
            ?.getAttribute('data-slide-id') ?? null,
      );
      await leaveShow();
      const gone = !(await showOpen());
      return {
        ok: open && gone,
        observed: `show ${open} (slide ${slide ?? 'unread'}); left on Escape ${gone}`,
      };
    },
  );

  const menuFacts = () =>
    page.evaluate(() => {
      const menu = document.getElementById('ts-menu-slideshow');
      const arrow = document.querySelector('[data-control="present.arrow"]');
      const split = document.querySelector('[data-control="present.split"]');
      const r = menu?.getBoundingClientRect();
      return {
        open: menu !== null && menu.getClientRects().length > 0,
        right: r ? Math.round(r.right * 10) / 10 : null,
        left: r ? Math.round(r.left * 10) / 10 : null,
        controlRight: split ? Math.round(split.getBoundingClientRect().right * 10) / 10 : null,
        expanded: arrow?.getAttribute('aria-expanded') ?? null,
        controls: arrow?.getAttribute('aria-controls') ?? null,
        focus:
          document.activeElement?.getAttribute('data-control') ??
          document.activeElement?.tagName.toLowerCase() ??
          null,
        firstRowFocused: document.activeElement?.closest('#ts-menu-slideshow') !== null,
      };
    });
  await t.step(
    'chrome.split.chevron-menu-aligned',
    'click the chevron; read the menu; Escape',
    "the menu's right edge within 1 px of the control's, aria-expanded true and aria-controls naming the mounted menu; Escape closes, aria-controls leaves, focus returns",
    async () => {
      await t.clearAll();
      await t.clickControl('present.arrow');
      const open = await t.pollUntil(menuFacts, (f) => f.open, 5000).catch(menuFacts);
      await t.press('Escape');
      const closed = await t.pollUntil(menuFacts, (f) => !f.open, 5000).catch(menuFacts);
      const aligned =
        open.right !== null &&
        open.controlRight !== null &&
        Math.abs(open.right - open.controlRight) <= 1;
      return {
        ok:
          open.open &&
          aligned &&
          open.expanded === 'true' &&
          open.controls === 'ts-menu-slideshow' &&
          !closed.open &&
          closed.controls === null &&
          closed.focus === 'present.arrow',
        observed: `menu open ${open.open}, x ${open.left} to ${open.right} against the control's right ${open.controlRight} (aligned ${aligned}); aria-expanded ${open.expanded}, aria-controls ${open.controls}; after Escape open ${closed.open}, aria-controls ${closed.controls}, focus ${closed.focus}`,
      };
    },
  );

  /** Focuses a title row control without a click and presses a key, reading defaultPrevented from a window listener. */
  const keyOn = async (control, key) => {
    await page.evaluate((c) => {
      window.__b4Prevented = null;
      const el = document.querySelector(`[data-control="${c}"]`);
      el?.focus();
      window.addEventListener(
        'keydown',
        (e) => {
          if (e.key === (c ? e.key : e.key)) window.__b4Prevented = e.defaultPrevented;
        },
        { once: true },
      );
    }, control);
    await t.sleep(100);
    await page.keyboard.press(key);
    await t.sleep(400);
    return page.evaluate(() => window.__b4Prevented);
  };
  const selectTitle = async () => {
    const head = t.deck.head;
    const block = head ? await t.blockOfRun(head) : null;
    if (!block) return false;
    const info = await t.runInfo(head);
    const { facts } = await t.clickSelect(block, {
      x: info.rect.x + info.rect.w / 2,
      y: info.rect.y + info.rect.h / 2,
    });
    return facts.selected && !facts.editing;
  };

  await t.step(
    'chrome.split.enter-chevron',
    'nothing selected: focus the chevron, Enter; then with the title selected by one click',
    "the menu opens both times and the key's defaultPrevented reads false",
    async () => {
      await t.clearAll();
      const p1 = await keyOn('present.arrow', 'Enter');
      const m1 = await menuFacts();
      await t.press('Escape');
      await t.sleep(300);
      const selected = await selectTitle();
      const p2 = await keyOn('present.arrow', 'Enter');
      const m2 = await menuFacts();
      await t.press('Escape');
      await t.sleep(200);
      await t.clearAll();
      return {
        ok: m1.open && p1 === false && selected && m2.open && p2 === false,
        observed: `nothing selected: menu ${m1.open}, defaultPrevented ${p1}; title selected ${selected}: menu ${m2.open}, defaultPrevented ${p2}`,
      };
    },
  );
  await t.step(
    'chrome.split.enter-label',
    'focus the Slideshow half, Enter',
    'the show opens',
    async () => {
      await t.clearAll();
      const prevented = await keyOn('present.open', 'Enter');
      const open = await t.pollUntil(showOpen, (x) => x, 5000).catch(showOpen);
      if (open) await leaveShow();
      return { ok: open, observed: `show ${open}; defaultPrevented ${prevented}` };
    },
  );
  await t.step(
    'chrome.split.space-both',
    'Space on the chevron; Space on the label',
    'the menu opens; the show opens',
    async () => {
      await t.clearAll();
      await keyOn('present.arrow', 'Space');
      const menu = (await menuFacts()).open;
      await t.press('Escape');
      await t.sleep(300);
      await keyOn('present.open', 'Space');
      const show = await t.pollUntil(showOpen, (x) => x, 5000).catch(showOpen);
      if (show) await leaveShow();
      return { ok: menu && show, observed: `menu on Space ${menu}; show on Space ${show}` };
    },
  );
  await t.step(
    'chrome.split.arrow-down-label',
    'focus the Slideshow half, ArrowDown; Escape',
    'the menu opens with its first row focused; Escape returns focus to the Slideshow half',
    async () => {
      await t.clearAll();
      await keyOn('present.open', 'ArrowDown');
      const m = await menuFacts();
      await t.press('Escape');
      const after = await t.pollUntil(menuFacts, (f) => !f.open, 4000).catch(menuFacts);
      return {
        ok: m.open && m.firstRowFocused && !after.open && after.focus === 'present.open',
        observed: `menu ${m.open}, focus in the menu ${m.firstRowFocused} (${m.focus}); after Escape open ${after.open}, focus ${after.focus}`,
      };
    },
  );
  await t.step(
    'chrome.split.tab-order',
    'focus the Slideshow half, Tab, with nothing selected and with the title selected',
    'the chevron takes the focus both times and the canvas selection does not move',
    async () => {
      await t.clearAll();
      await page.evaluate(() => document.querySelector('[data-control="present.open"]')?.focus());
      await page.keyboard.press('Tab');
      await t.sleep(200);
      const f1 = await page.evaluate(
        () =>
          document.activeElement?.getAttribute('data-control') ??
          document.activeElement?.tagName.toLowerCase(),
      );
      const selected = await selectTitle();
      const chipBefore = await t.chip();
      await page.evaluate(() => document.querySelector('[data-control="present.open"]')?.focus());
      await page.keyboard.press('Tab');
      await t.sleep(200);
      const f2 = await page.evaluate(
        () =>
          document.activeElement?.getAttribute('data-control') ??
          document.activeElement?.tagName.toLowerCase(),
      );
      const chipAfter = await t.chip();
      await t.clearAll();
      return {
        ok:
          f1 === 'present.arrow' && selected && f2 === 'present.arrow' && chipAfter === chipBefore,
        observed: `nothing selected: Tab -> ${f1}; title selected ${selected} (chip "${chipBefore}"): Tab -> ${f2}, chip after "${chipAfter}"`,
      };
    },
  );
  await t.step(
    'chrome.split.aria',
    'read the wrapper and the chevron, closed and open',
    'a group labelled Slideshow; aria-haspopup menu, aria-expanded, aria-controls only while the menu is mounted',
    async () => {
      await t.clearAll();
      const read = () =>
        page.evaluate(() => {
          const split = document.querySelector('[data-control="present.split"]');
          const arrow = document.querySelector('[data-control="present.arrow"]');
          return {
            role: split?.getAttribute('role') ?? null,
            label: split?.getAttribute('aria-label') ?? null,
            haspopup: arrow?.getAttribute('aria-haspopup') ?? null,
            expanded: arrow?.getAttribute('aria-expanded') ?? null,
            controls: arrow?.getAttribute('aria-controls') ?? null,
            mounted: document.getElementById('ts-menu-slideshow') !== null,
          };
        });
      const closed = await read();
      await t.clickControl('present.arrow');
      await t.pollUntil(menuFacts, (f) => f.open, 5000).catch(() => undefined);
      const open = await read();
      await t.press('Escape');
      await t.sleep(300);
      return {
        ok:
          closed.role === 'group' &&
          closed.label === 'Slideshow' &&
          closed.haspopup === 'menu' &&
          closed.expanded === 'false' &&
          closed.controls === null &&
          !closed.mounted &&
          open.expanded === 'true' &&
          open.controls === 'ts-menu-slideshow' &&
          open.mounted,
        observed: `closed ${JSON.stringify(closed)}; open ${JSON.stringify(open)}`,
      };
    },
  );

  await t.step(
    'chrome.split.collapse-900',
    'the viewport at 900 px wide',
    'the word leaves and the control is a 58 px button of two 28 px halves',
    async () => {
      await t.clearAll();
      await page.setViewportSize({ width: 900, height: 900 });
      await t.sleep(700);
      const c = await cluster();
      await page.setViewportSize(VIEWPORT);
      await t.sleep(500);
      const labelGone = !c.label || !c.label.visible || c.label.w === 0;
      return {
        ok:
          c.viewport === 900 &&
          labelGone &&
          t.near(c.split.w, 58, 1) &&
          t.near(c.open.w, 28, 1) &&
          t.near(c.arrow.w, 28, 1),
        observed: `viewport ${c.viewport}; word visible ${!labelGone}; split ${Math.round(c.split.w)} px (label half ${Math.round(c.open.w)}, chevron ${Math.round(c.arrow.w)}); Share ${Math.round(c.share?.w ?? 0)}`,
      };
    },
  );

  /** The seams read from a 1x screenshot at the current viewport, with the Comments panel open. */
  /** The Comments panel open for the right panel seam (the 900 px pass closes it). */
  const ensureCommentsPanel = async () => {
    if (await t.visible('panel.comments')) return true;
    await t.clickControl('title.comments');
    return t
      .pollUntil(
        () => t.visible('panel.comments'),
        (x) => x,
        5000,
      )
      .catch(() => t.visible('panel.comments'));
  };
  const readSeams = async (width) => {
    if (width !== VIEWPORT.width) await page.setViewportSize({ width, height: 900 });
    else await ensureCommentsPanel();
    await t.sleep(600);
    const pts = await t.boundaryPoints();
    const img = await t.shotPixels();
    const seams = t.seamsFromShot(img, pts);
    const hair = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--pt-hair').trim(),
    );
    const out = {};
    for (const [name, seam] of Object.entries(seams)) {
      const thin = seam.runs.filter((r) => r.thickness >= 1 && r.thickness <= 4);
      const hairline = thin.filter((r) => (r.contrastToPrevious ?? 1) >= 1.2);
      // every seam holds one hairline, the menu bar to toolbar seam included (Kevin, 2026-09-24:
      // a line between the two rows; the menu bar draws it at its bottom edge)
      out[name] = {
        thin: thin.map((r) => `${r.color}x${r.thickness}`).join(' ') || 'none',
        ok: hairline.length === 1 && hairline[0].thickness === 1,
      };
    }
    if (width !== VIEWPORT.width) await page.setViewportSize(VIEWPORT);
    await t.sleep(400);
    return { hair, seams: out, present: Object.keys(seams) };
  };
  await t.step(
    'chrome.separators.once',
    'read the nine seams from a 1x screenshot with the Comments panel open and the notes pane present, both appearances at 1440, and the horizontal seams at 900',
    'each seam holds one 1 px run in --pt-hair',
    async () => {
      await t.clearAll();
      await ensureCommentsPanel();
      if (!(await t.has('.pt-viewer.is-editor > .pt-main > .ts-notes-slot'))) {
        await t.menuPath('view', 'view.showSpeakerNotes').catch(() => undefined);
      }
      await t.sleep(400);
      const result = await eachAppearance(async (appearance) => {
        const wide = await readSeams(VIEWPORT.width);
        const narrow = await readSeams(900);
        const failures = [
          ...Object.entries(wide.seams)
            .filter(([, s]) => !s.ok)
            .map(([n, s]) => `1440 ${n}: ${s.thin}`),
          ...Object.entries(narrow.seams)
            .filter(([n, s]) => !s.ok && !/vertical|notes|filmstrip head/.test(n))
            .map(([n, s]) => `900 ${n}: ${s.thin}`),
        ];
        return {
          appearance,
          hair: wide.hair,
          seams: wide.present.length,
          failures,
          wide: wide.seams,
        };
      });
      const both = Object.values(result);
      if (await t.visible('panel.comments.close')) await t.clickControl('panel.comments.close');
      return {
        ok:
          both.length === 2 &&
          /* eight of the nine seams draw in the editor at 1440: the filmstrip head sits in the
             overlay strip alone (Filmstrip.tsx), so its seam has nothing to read here */
          both.every((r) => !r.error && r.seams >= 8 && r.failures.length === 0),
        observed: both
          .map((r) =>
            r.error
              ? r.error
              : `${r.appearance} (--pt-hair ${r.hair}): ${r.seams} seams read; ${Object.entries(
                  r.wide,
                )
                  .map(([n, s]) => `${n} ${s.thin}`)
                  .join('; ')}; failing ${r.failures.join(' | ') || 'none'}`,
          )
          .join(' || '),
      };
    },
  );

  await t.step(
    'chrome.separators.toolbar-dividers',
    'read the two toolbar dividers',
    '1 by 20 px in --pt-hair with 8 px of space to each neighbour',
    async () => {
      /* the default toolbar (a tail adds its own dividers; the gate run read five with a table
         selected, each 1 by 20 in the hair): the selection is cleared and every divider judged */
      await t.clearAll();
      const facts = await page.evaluate(() => {
        const hair = getComputedStyle(document.documentElement)
          .getPropertyValue('--pt-hair')
          .trim();
        return {
          hair,
          seps: [...document.querySelectorAll('.ts-toolbar .ts-tb-sep')].map((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            const prev = el.previousElementSibling?.getBoundingClientRect();
            const next = el.nextElementSibling?.getBoundingClientRect();
            return {
              w: Math.round(r.width),
              h: Math.round(r.height),
              background: cs.backgroundColor,
              gapBefore: prev ? Math.round((r.left - prev.right) * 10) / 10 : null,
              gapAfter: next ? Math.round((next.left - r.right) * 10) / 10 : null,
            };
          }),
        };
      });
      /* the token as the sheet declares it: rgba() on a dev server, a hex colour on a built
         deployment, where the CSS minifier writes rgba(242, 242, 240, 0.22) as #f2f2f038 (the
         first preview drive read the divider right and the token unreadable, and failed the row
         on every built deployment; return/build/integrator.md) */
      const tokenRgb = (() => {
        const m = /rgba?\(([\d\s.,]+)\)/.exec(facts.hair);
        if (m) return m[1].split(',').map((v) => Number(v.trim()));
        const hex = /^#([0-9a-f]{3,8})$/i.exec(facts.hair);
        if (!hex) return null;
        const h = hex[1];
        const wide = h.length <= 4 ? [...h].map((c) => c + c).join('') : h;
        const part = (i) => parseInt(wide.slice(i, i + 2), 16);
        return [part(0), part(2), part(4), wide.length === 8 ? part(6) / 255 : 1];
      })();
      const isHair = (bg) => {
        const m = /rgba?\(([\d\s.,]+)\)/.exec(bg);
        if (!m || !tokenRgb) return false;
        const v = m[1].split(',').map((x) => Number(x.trim()));
        return (
          v.slice(0, 3).every((c, i) => Math.abs(c - tokenRgb[i]) <= 2) &&
          Math.abs((v[3] ?? 1) - (tokenRgb[3] ?? 1)) <= 0.02
        );
      };
      const ok =
        facts.seps.length >= 2 &&
        facts.seps.every(
          (s) =>
            s.w === 1 &&
            s.h === 20 &&
            isHair(s.background) &&
            (s.gapBefore ?? 8) >= 7 &&
            (s.gapAfter ?? 8) >= 7,
        );
      return {
        ok,
        observed: `--pt-hair ${facts.hair}; ${facts.seps.length} dividers: ${facts.seps.map((s) => `${s.w}x${s.h} ${s.background}, gaps ${s.gapBefore}/${s.gapAfter}`).join('; ')}`,
      };
    },
  );

  await t.step(
    'chrome.cluster.gaps-heights',
    "read the right cluster's controls",
    'gaps 8 px, inset 12 px, Share, the split button and the comments glyph 32 px tall, both with the 8 px corner, no empty +N box, no inbox slot while the plate is parked',
    async () => {
      await t.clearAll();
      if (await t.visible('panel.comments.close')) await t.clickControl('panel.comments.close');
      const c = await cluster();
      const controls = [
        c.presence,
        c.assistSlot,
        c.commentsSlot,
        c.panelSlot,
        c.inboxSlot,
        c.split,
        c.share,
      ].filter((x) => x && x.w > 0);
      const gaps = [];
      for (let i = 1; i < controls.length; i += 1)
        gaps.push(Math.round((controls[i].x - controls[i - 1].right) * 10) / 10);
      const inset = Math.round((c.viewport - c.share.right) * 10) / 10;
      const heights = {
        share: Math.round(c.share.h),
        split: Math.round(c.split.h),
        comments: c.comments ? Math.round(c.comments.h) : null,
      };
      const moreHidden =
        !c.more || c.more.w === 0 || Number(c.more.opacity) === 0 || !c.more.visible;
      const inboxCollapsed = !c.inbox && (!c.inboxSlot || c.inboxSlot.w === 0);
      const inboxParked = !(await t.advancedOn()) && !c.inbox;
      const ok =
        gaps.every((g) => Math.abs(g - 8) <= 1) &&
        Math.abs(inset - 12) <= 1 &&
        heights.share === 32 &&
        heights.split === 32 &&
        heights.comments === 32 &&
        /^8px/.test(c.share.radius) &&
        /^8px/.test(c.split.radius) &&
        moreHidden &&
        (!inboxParked || inboxCollapsed);
      return {
        ok,
        observed: `gaps ${gaps.join(', ')}; inset ${inset}; heights ${JSON.stringify(heights)}; corners share ${c.share.radius}, split ${c.split.radius}; +N box ${c.more ? `${Math.round(c.more.w)}x${Math.round(c.more.h)} opacity ${c.more.opacity}` : 'absent'} hidden ${moreHidden}; inbox plate ${c.inbox ? 'drawn' : 'parked'}, slot ${c.inboxSlot ? `${Math.round(c.inboxSlot.w)} px` : 'absent'}${c.share.radius.startsWith('6px') && c.split.radius.startsWith('6px') ? '; note: both corners read 6 px (--pt-radius), the alternative of question 1' : ''}`,
      };
    },
  );

  await t.step(
    'chrome.comments-glyph.toggle',
    'click Show all comments, then again',
    'the panel opens with aria-pressed true; the second click closes it',
    async () => {
      await t.clearAll();
      if (await t.visible('panel.comments.close')) await t.clickControl('panel.comments.close');
      await t.clickControl('title.comments');
      const open = await t
        .pollUntil(
          () => t.visible('panel.comments'),
          (x) => x,
          5000,
        )
        .catch(() => false);
      const pressed = await t.attr('[data-control="title.comments"]', 'aria-pressed');
      await t.clickControl('title.comments');
      const closed = await t
        .pollUntil(
          () => t.visible('panel.comments'),
          (x) => !x,
          4000,
        )
        .catch(() => t.visible('panel.comments'));
      const pressedAfter = await t.attr('[data-control="title.comments"]', 'aria-pressed');
      if (closed !== false && (await t.visible('panel.comments.close')))
        await t.clickControl('panel.comments.close');
      return {
        ok: open && pressed === 'true' && closed === false && pressedAfter === 'false',
        observed: `open ${open} (aria-pressed ${pressed}); after the second click open ${closed} (aria-pressed ${pressedAfter})`,
      };
    },
  );
  await t.advancedBack('the chrome rows');
  await productRound(t);
}

/**
 * The product round's rows (docs/PRODUCT.md section 3, 8.1 `chrome.*` with the driver
 * `probe --core`): the bottom bar gone and the side panel toggle in the title row, no tooltip
 * over an open submenu, Escape returning focus to the stage, the presence tooltip and the save
 * words, the titanium contrast on light chrome, the disabled token in both appearances, the field
 * boundaries at 3:1, the hover ground, the floating plates' frame, the one focus ring rule, the
 * filmstrip's one ring, no tooltip on focus inside a menu or a dialog, the menu plate fitting its
 * labels, no mnemonics on macOS, the select rule, the check glyph and the toolbar's Bold following
 * the selection. Every colour is read as drawn and composited against the element's own ground;
 * the contrasts are WCAG's. B1 owns the tokens and the chrome; a red row here blocks the ship.
 */
async function productRound(t) {
  const { page, BASE } = t;
  const T = t.deck.titleSlide;
  await t.clickCard(T);
  await t.clearAll();
  const themeNow = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const setChrome = async (appearance) => {
    if ((await themeNow()) === appearance) return true;
    const r = await t.reachRow('view', 'view.appearance', `view.appearance.${appearance}`);
    if (!r.present) return false;
    await t.menuPath('view', 'view.appearance', `view.appearance.${appearance}`);
    return (
      (await t.pollUntil(themeNow, (x) => x === appearance, 5000).catch(themeNow)) === appearance
    );
  };
  const eachAppearance = async (fn) => {
    const start = await themeNow();
    const other = start === 'dark' ? 'light' : 'dark';
    const out = {};
    out[start] = await fn(start);
    const switched = await setChrome(other);
    out[other] = switched
      ? await fn(other)
      : { error: `View > Appearance > ${other} not reachable` };
    await setChrome(start);
    return out;
  };
  /**
   * The colour and the effective ground of the first element matching a selector: the ground is
   * the first non transparent background from the element up, so the contrast is the one a
   * person reads. `prop` picks the colour read (color, border-color, outline-color).
   */
  const paint = (selector, prop = 'color') =>
    page.evaluate(
      ([sel, p]) => {
        const el = document.querySelector(sel);
        if (!el || el.getClientRects().length === 0) return null;
        const cs = getComputedStyle(el);
        const fg =
          p === 'color'
            ? cs.color
            : p === 'border'
              ? cs.borderTopColor || cs.borderColor
              : p === 'outline'
                ? cs.outlineColor
                : cs.getPropertyValue(p);
        const clear = (c) =>
          !c || c === 'transparent' || /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)/.test(c);
        let node = p === 'color' ? el : el.parentElement;
        let bg = null;
        for (; node; node = node.parentElement) {
          const b = getComputedStyle(node).backgroundColor;
          if (!clear(b)) {
            bg = b;
            break;
          }
        }
        return {
          fg,
          bg: bg ?? 'rgb(255, 255, 255)',
          own: cs.backgroundColor,
          width: cs.borderTopWidth,
          outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineOffset}`,
          radius: cs.borderRadius,
          appearance: cs.appearance,
          height: el.getBoundingClientRect().height,
        };
      },
      [selector, prop],
    );
  const contrast = (p) => (p ? t.contrastOf(p.fg, p.bg) : null);
  /** A css colour composited over another with an alpha (rgba over rgb). */
  const composite = (fg, bg) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(fg ?? '');
    const b = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg ?? '');
    if (!m || !b) return fg;
    const a = m[4] === undefined ? 1 : Number(m[4]);
    const ch = (i) => Math.round(Number(m[i]) * a + Number(b[i]) * (1 - a));
    return `rgb(${ch(1)}, ${ch(2)}, ${ch(3)})`;
  };
  const contrastComposited = (p) => (p ? t.contrastOf(composite(p.fg, p.bg), p.bg) : null);
  const fmt = (n) => (n === null ? 'n/a' : String(n));

  await t.step(
    'chrome.bottom-bar.removed',
    'read the editor for a bottom bar, the side panel toggle and the stage height at 900',
    'no bottom bar; the side panel toggle sits in the title row; the stage is 724 px tall',
    async () => {
      await t.clearAll();
      const facts = await page.evaluate(() => {
        const bar = document.querySelector('.ts-bottombar, [data-control="bottombar"]');
        const toggle = document.querySelector('[data-control="title.sidePanel"]');
        const row = document.querySelector('.ts-title-row');
        const main = document.querySelector('.pt-viewer.is-editor > .pt-main');
        const stage = document.querySelector('.pt-viewer.is-editor .pt-stagewrap, .ts-stagewrap');
        return {
          bar: Boolean(bar && bar.getClientRects().length > 0),
          toggle: Boolean(toggle && toggle.getClientRects().length > 0 && row?.contains(toggle)),
          main: main ? Math.round(main.getBoundingClientRect().height) : null,
          stage: stage ? Math.round(stage.getBoundingClientRect().height) : null,
          viewport: window.innerHeight,
        };
      });
      return {
        ok:
          !facts.bar &&
          facts.toggle &&
          facts.viewport === 900 &&
          (facts.stage === 724 || facts.main === 724),
        observed: `bottom bar drawn ${facts.bar}; side panel toggle in the title row ${facts.toggle}; stage ${facts.stage} px, main ${facts.main} px at ${facts.viewport}`,
      };
    },
  );
  await t.step(
    'chrome.menu.no-tooltip-with-submenu',
    "open Insert > Table's grid; wait; read for a tooltip plate",
    'no tooltip plate is shown while the grid is open',
    async () => {
      await t.clearAll();
      await t.openMenu('insert');
      await t
        .hoverRow('insert.table', '[data-control="insert.table.plate"]')
        .catch(() => undefined);
      await t.sleep(900);
      const tip = await t.tooltipText();
      const grid = await t.has('[data-control="insert.table.plate"]');
      await t.closeMenus();
      return {
        ok: grid && tip === null,
        observed: `grid open ${grid}; tooltip ${tip ? `"${tip}"` : 'none'}`,
      };
    },
  );
  await t.step(
    'chrome.menu.escape-focus-stage',
    'open the Help menu with a click, press Escape, read the focus',
    'focus returns to the stage; the Help button carries no ring',
    async () => {
      await t.clearAll();
      await t.openMenu('help');
      await t.press('Escape');
      await t.sleep(300);
      const facts = await page.evaluate(() => {
        const a = document.activeElement;
        const btn = document.querySelector('[data-control="menubar.help"]');
        const stage = document.querySelector('.ts-stagewrap, .pt-stagewrap, .pt-main');
        return {
          active: a
            ? `${a.tagName.toLowerCase()}${a.getAttribute('data-control') ? `[${a.getAttribute('data-control')}]` : ''}`
            : 'none',
          onStage: Boolean(a && stage && (stage.contains(a) || a === document.body)),
          buttonFocused: a === btn,
          ring: btn
            ? btn.matches(':focus-visible') ||
              (getComputedStyle(btn).outlineStyle !== 'none' &&
                parseFloat(getComputedStyle(btn).outlineWidth) > 0 &&
                btn.matches(':focus'))
            : false,
        };
      });
      return {
        ok: !facts.buttonFocused && !facts.ring && facts.onStage,
        observed: `active ${facts.active}; on the stage ${facts.onStage}; Help button focused ${facts.buttonFocused}, ring ${facts.ring}`,
      };
    },
  );
  await t.step(
    'chrome.presence.tooltip',
    'hover the presence slot; then open a fresh /new and read the save words',
    'the slot shows its tooltip; the fresh draft shows no save words before the first edit',
    async () => {
      await t.clearAll();
      const tip = await t.hoverControl('title.presence');
      await t.moveHuman({ x: 700, y: 500 }, { x: 720, y: 520 }, 3);
      await page.goto(`${BASE}/new`, { waitUntil: 'domcontentloaded' });
      await t.editorReady();
      await t.sleep(500);
      const words = await page.evaluate(() => {
        const el = document.querySelector('[data-control="deck.saveState"]');
        return el && el.getClientRects().length > 0 ? (el.textContent?.trim() ?? '') : null;
      });
      await t.reloadTo(`${BASE}/edit/${t.deck.id}#${T}`);
      await t.settled();
      await t.clickCard(T);
      return {
        ok: /Collaborators/.test(tip ?? '') && (words === null || words === ''),
        observed: `presence tooltip "${tip ?? 'none'}"; save words on a fresh /new ${words === null ? 'hidden' : `"${words}"`}`,
      };
    },
  );
  await t.step(
    'chrome.contrast.titanium-light',
    'light chrome: read the save words, a menu key, a filmstrip number and a panel label against their ground',
    'each composites at 4.5:1 or better',
    async () => {
      await t.clearAll();
      const wasDark = (await themeNow()) === 'dark';
      const light = await setChrome('light');
      if (!light) return { ok: false, observed: 'View > Appearance > Light is not reachable' };
      const reads = {};
      reads.saveWords = contrastComposited(await paint('[data-control="deck.saveState"]'));
      await t.openMenu('file');
      reads.menuKey = contrastComposited(await paint('#ts-menu-file .ts-menu-key'));
      await t.closeMenus();
      reads.filmstripNumber = contrastComposited(
        await paint('.ts-card:not(.is-current) .ts-card-n'),
      );
      await t.selectObject((await t.blockOfRun((await t.runs())[0])) ?? 'lead').catch(() => null);
      await t.tailControl('toolbar.formatOptions').catch(() => undefined);
      await t.waitControl('panel.formatOptions', 6000).catch(() => undefined);
      reads.panelLabel = contrastComposited(
        await paint(
          '[data-control="panel.formatOptions"] .ts-fo-field-label, [data-control="panel.formatOptions"] label',
        ),
      );
      if (await t.visible('panel.formatOptions.close'))
        await t.clickControl('panel.formatOptions.close');
      await t.clearAll();
      if (wasDark) await setChrome('dark');
      const values = Object.values(reads).filter((v) => v !== null);
      return {
        ok: values.length === 4 && values.every((v) => v >= 4.5),
        observed: Object.entries(reads)
          .map(([k, v]) => `${k} ${fmt(v)}`)
          .join('; '),
      };
    },
  );
  await t.step(
    'chrome.disabled.token-both-appearances',
    'read the disabled Redo in both appearances',
    'the text reads the --pt-disabled composite (#8a8f98 light, #6b6e73 dark), never the enabled ink-2',
    async () => {
      await t.clearAll();
      const want = { light: [138, 143, 152], dark: [107, 110, 115] };
      const rgb = (css) => {
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css ?? '');
        return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
      };
      const close = (a, b, tol = 6) => a && b && a.every((v, i) => Math.abs(v - b[i]) <= tol);
      const out = await eachAppearance(async (appearance) => {
        const disabled = await page.evaluate(() => {
          const el = document.querySelector('[data-control="toolbar.redo"]');
          return el
            ? el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled')
            : null;
        });
        const p = await paint('[data-control="toolbar.redo"]');
        /* the enabled shell button beside it: Print is always enabled, Undo is not on a fresh
           session (the first gate run read both disabled and the same colour) */
        const ink2 = await paint('[data-control="toolbar.print"]');
        const fg = p ? composite(p.fg, p.bg) : null;
        return {
          disabled,
          fg,
          ink2: ink2 ? composite(ink2.fg, ink2.bg) : null,
          ok:
            disabled === true &&
            close(rgb(fg), want[appearance]) &&
            fg !== (ink2 ? composite(ink2.fg, ink2.bg) : null),
        };
      });
      const both = ['light', 'dark'].every((a) => out[a]?.ok === true);
      return {
        ok: both,
        observed: ['light', 'dark']
          .map(
            (a) =>
              `${a}: Redo disabled ${out[a]?.disabled ?? 'n/a'}, ${out[a]?.fg ?? out[a]?.error ?? 'not read'} (Undo ${out[a]?.ink2 ?? 'n/a'})`,
          )
          .join('; '),
      };
    },
  );
  await t.step(
    'chrome.field.boundary-3-1',
    "read the zoom field on hover, the size field, the Share dialog's fields and the /decks search field, both appearances",
    'each border composites at 3:1 or better',
    async () => {
      await t.clearAll();
      const measure = async (appearance) => {
        const reads = {};
        const zoom = await t.rectOf('[data-control="view.zoom.value"]');
        if (zoom) {
          await t.moveHuman({ x: zoom.x - 30, y: zoom.y + zoom.h / 2 }, t.center(zoom), 6);
          await t.sleep(300);
        }
        reads.zoom = contrastComposited(await paint('[data-control="view.zoom.value"]', 'border'));
        await t.selectObject((await t.blockOfRun((await t.runs())[0])) ?? 'lead').catch(() => null);
        reads.size = contrastComposited(
          await paint('[data-control="toolbar.fontSize.value"]', 'border'),
        );
        await t.clearAll();
        await t.clickControl('share.open');
        await t.waitControl('dialog.share', 8000);
        await t.sleep(400);
        reads.shareSelect = contrastComposited(
          await paint(
            '[data-control="dialog.share"] select, [data-control="dialog.share.mode"]',
            'border',
          ),
        );
        /* a legacy deck's dialog (no access record on this store) draws a sentence and no select
           (Share.tsx `dialog.share.legacy`): nothing to read there */
        if (reads.shareSelect === null && (await t.has('[data-control="dialog.share.legacy"]')))
          delete reads.shareSelect;
        reads.shareInput = contrastComposited(
          await paint(
            '[data-control="dialog.share"] input[type="text"], [data-control="dialog.share"] input:not([type="checkbox"]):not([type="radio"])',
            'border',
          ),
        );
        await t.press('Escape');
        await t.waitGone('[data-control="dialog.share"]', 4000);
        void appearance;
        return reads;
      };
      const out = await eachAppearance(measure);
      /* the /decks search field, in the current appearance */
      await page.goto(`${BASE}/decks`, { waitUntil: 'domcontentloaded' });
      await page
        .waitForSelector('.ts-home-page[data-hydrated]', { timeout: 30_000 })
        .catch(() => undefined);
      const search = contrastComposited(
        await paint(
          '[data-control="home.search"] input, input[data-control="home.search"]',
          'border',
        ),
      );
      await t.reloadTo(`${BASE}/edit/${t.deck.id}#${T}`);
      await t.settled();
      await t.clickCard(T);
      const all = [
        ...Object.values(out.light ?? {}),
        ...Object.values(out.dark ?? {}),
        search,
      ].filter((v) => v !== null && v !== undefined);
      const missing = ['light', 'dark'].flatMap((a) =>
        Object.entries(out[a] ?? {})
          .filter(([, v]) => v === null)
          .map(([k]) => `${a} ${k}`),
      );
      return {
        ok:
          !out.light?.error &&
          !out.dark?.error &&
          missing.length === 0 &&
          search !== null &&
          all.every((v) => v >= 3),
        observed: `${['light', 'dark']
          .map(
            (a) =>
              `${a}: ${
                Object.entries(out[a] ?? {})
                  .map(([k, v]) => `${k} ${fmt(v)}`)
                  .join(', ') || out[a]?.error
              }`,
          )
          .join('; ')}; /decks search ${fmt(search)}`,
      };
    },
  );
  await t.step(
    'chrome.hover.ground',
    'hover Undo, then the File title; read the grounds',
    'Undo paints a plate ground under the hairline; the menu title paints the plate at 1.14:1 or better',
    async () => {
      await t.clearAll();
      /* a disabled Undo paints no hover ground (the product's rule for a disabled control); on a
         fresh session the shell button read is Print, the same .pt-ib */
      const undoDisabled = await page.evaluate(() => {
        const el = document.querySelector('[data-control="toolbar.undo"]');
        return el
          ? el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled')
          : true;
      });
      const button = undoDisabled ? 'toolbar.print' : 'toolbar.undo';
      /* the ground is read against the bar under the button, not the button's own hovered
         background: paint() with a property other than color walks up from the parent (the extra
         reading of the product round read the plate against itself, 1:1) */
      const rest = await paint(`[data-control="${button}"]`, 'background-color');
      const undo = await t.rectOf(`[data-control="${button}"]`);
      await t.moveHuman({ x: undo.x - 30, y: undo.y + undo.h / 2 }, t.center(undo), 6);
      await t.sleep(300);
      const hovered = await paint(`[data-control="${button}"]`, 'background-color');
      const undoGround = hovered
        ? t.contrastOf(composite(hovered.own, hovered.bg), hovered.bg)
        : null;
      const file = await t.rectOf('[data-control="menubar.file"]');
      await t.moveHuman(t.center(undo), t.center(file), 8);
      await t.sleep(300);
      const title = await paint('[data-control="menubar.file"]', 'background-color');
      const titleGround = title ? t.contrastOf(composite(title.own, title.bg), title.bg) : null;
      await t.moveHuman(t.center(file), { x: 700, y: 500 }, 6);
      const clear = (c) => !c || c === 'transparent' || /rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)/.test(c);
      return {
        ok:
          hovered !== null &&
          !clear(hovered.own) &&
          undoGround !== null &&
          undoGround >= 1.1 &&
          titleGround !== null &&
          titleGround >= 1.14,
        observed: `${button === 'toolbar.print' ? 'Print (Undo disabled)' : 'Undo'} ground at rest ${rest?.own ?? 'n/a'}, hovered ${hovered?.own ?? 'n/a'} (${fmt(undoGround)} against ${hovered?.bg ?? 'n/a'}); File title hovered ${title?.own ?? 'n/a'} (${fmt(titleGround)})`,
      };
    },
  );
  await t.step(
    'chrome.floating.edge-frame',
    'open the File menu, a tooltip and the layout plate; read each frame',
    'each frame composites at 4.5:1 or better',
    async () => {
      await t.clearAll();
      await t.openMenu('file');
      const menu = contrastComposited(await paint('#ts-menu-file', 'border'));
      await t.closeMenus();
      await t.hoverControl('toolbar.undo');
      const tip = contrastComposited(await paint('.pt-tip', 'border'));
      await t.moveHuman({ x: 300, y: 300 }, { x: 700, y: 500 }, 4);
      await t.tailControl('toolbar.layout');
      await t.waitControl('layout.apply.plate', 8000).catch(() => undefined);
      const plate = contrastComposited(
        await paint('[data-control="layout.apply.plate"]', 'border'),
      );
      await t.press('Escape');
      await t.waitGone('[data-control="layout.apply.plate"]');
      return {
        ok: [menu, tip, plate].every((v) => v !== null && v >= 4.5),
        observed: `File menu ${fmt(menu)}; tooltip ${fmt(tip)}; layout plate ${fmt(plate)}`,
      };
    },
  );
  await t.step(
    'chrome.focus.one-ring-rule',
    "Tab to a toolbar button and to a dialog's X; read the rings",
    'both rings are 1 px ink inset',
    async () => {
      await t.clearAll();
      const ring = () =>
        page.evaluate(() => {
          const a = document.activeElement;
          if (!a) return null;
          const cs = getComputedStyle(a);
          return {
            control: a.getAttribute('data-control'),
            cls: a.className,
            width: cs.outlineWidth,
            style: cs.outlineStyle,
            offset: cs.outlineOffset,
            color: cs.outlineColor,
            visible: a.matches(':focus-visible'),
          };
        });
      const ink = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--pt-ink)';
        document.body.appendChild(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        return c;
      });
      /* the toolbar: Tab from the menu bar's first title lands on the toolbar's first control */
      await page.locator('[data-control="menubar.file"]').focus();
      let tb = null;
      for (let i = 0; i < 40; i += 1) {
        await page.keyboard.press('Tab');
        const r = await ring();
        if (r?.control?.startsWith('toolbar.')) {
          tb = r;
          break;
        }
      }
      /* the dialog's X */
      await t.clearAll();
      await t.clickControl('share.open');
      await t.waitControl('dialog.share', 8000);
      let x = null;
      for (let i = 0; i < 40; i += 1) {
        await page.keyboard.press('Tab');
        const r = await ring();
        if (r && /ts-dialog-x/.test(r.cls ?? '')) {
          x = r;
          break;
        }
      }
      await t.press('Escape');
      await t.waitGone('[data-control="dialog.share"]', 4000);
      const inset = (r) =>
        r !== null &&
        r.width === '1px' &&
        r.style === 'solid' &&
        r.offset === '-1px' &&
        r.color === ink;
      return {
        ok: inset(tb) && inset(x),
        observed: `toolbar ${tb ? `${tb.control}: ${tb.width} ${tb.style} offset ${tb.offset} ${tb.color}` : 'no toolbar button reached by Tab'}; dialog X ${x ? `${x.width} ${x.style} offset ${x.offset} ${x.color}` : 'not reached by Tab'}; ink ${ink}`,
      };
    },
  );
  await t.step(
    'chrome.filmstrip.one-ring',
    "read the current card's frame",
    'one 2 px ring and no second outline',
    async () => {
      await t.clearAll();
      await t.clickCard(T);
      const facts = await page.evaluate(() => {
        const card = document.querySelector('.ts-card.is-current');
        const frame = card?.querySelector('.ts-card-frame');
        if (!card || !frame) return null;
        const c = getComputedStyle(card);
        const f = getComputedStyle(frame);
        return {
          cardOutline: `${c.outlineWidth} ${c.outlineStyle}`,
          cardBorder: `${c.borderTopWidth} ${c.borderTopStyle}`,
          frameBorder: `${f.borderTopWidth} ${f.borderTopStyle} ${f.borderTopColor}`,
          frameOutline: `${f.outlineWidth} ${f.outlineStyle}`,
          shadow: f.boxShadow,
        };
      });
      if (!facts) return { ok: false, observed: 'no current card' };
      const none = (s) => /^0px|none/.test(s);
      const rings =
        [facts.cardOutline, facts.cardBorder, facts.frameOutline].filter((s) => !none(s)).length +
        (facts.shadow !== 'none' ? 1 : 0);
      return {
        ok: /^2px solid/.test(facts.frameBorder) && rings === 0,
        observed: `frame border ${facts.frameBorder}; frame outline ${facts.frameOutline}; card outline ${facts.cardOutline}, border ${facts.cardBorder}; shadow ${facts.shadow}`,
      };
    },
  );
  await t.step(
    'chrome.tooltip.none-on-focus-in-menus',
    'open Share; wait; right click the title; wait; read for a tooltip plate each time',
    'no tooltip plate on open in the dialog or the object menu',
    async () => {
      await t.clearAll();
      await t.clickControl('share.open');
      await t.waitControl('dialog.share', 8000);
      await t.sleep(900);
      const inDialog = await t.tooltipText();
      await t.press('Escape');
      await t.waitGone('[data-control="dialog.share"]', 4000);
      const block = (await t.blockOfRun((await t.runs())[0])) ?? 'lead';
      await t.selectObject(block);
      const b = await t.boxOf(block);
      if (b) {
        const c = t.center(b.free);
        await t.rightClickAt(c.x, c.y);
      }
      await t.sleep(900);
      const inMenu = await t.tooltipText();
      await t.press('Escape');
      await t.clearAll();
      return {
        ok: inDialog === null && inMenu === null,
        observed: `in the Share dialog ${inDialog ? `"${inDialog}"` : 'none'}; over the object menu ${inMenu ? `"${inMenu}"` : 'none'}`,
      };
    },
  );
  await t.step(
    'chrome.menu.plate-fits-labels',
    'open each of the nine menus; read every row for a cut label',
    "no label of the nine menus is cut; File's Print settings and preview is whole",
    async () => {
      await t.clearAll();
      const menus = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control^="menubar."]')]
          .filter((el) => el.tagName.toLowerCase() === 'button' && el.getClientRects().length > 0)
          .map((el) => el.getAttribute('data-control').replace('menubar.', '')),
      );
      const cut = [];
      let print = null;
      for (const id of menus) {
        await t.openMenu(id);
        const rows = await page.evaluate(
          (menuId) =>
            [...document.querySelectorAll(`#ts-menu-${menuId} [data-control^="menu."]`)]
              .filter((el) => el.getClientRects().length > 0)
              .map((el) => {
                const label = el.querySelector('.ts-menu-label, .pt-lb') ?? el;
                const cs = getComputedStyle(label);
                const clipped =
                  label.scrollWidth > label.clientWidth + 1 ||
                  (cs.textOverflow === 'ellipsis' && label.scrollWidth > label.clientWidth);
                return {
                  id: el.getAttribute('data-control'),
                  text: label.textContent?.trim().slice(0, 40) ?? '',
                  clipped,
                };
              }),
          id,
        );
        for (const r of rows) if (r.clipped) cut.push(`${r.id}`);
        const p = rows.find((r) => r.id === 'menu.file.printPreview');
        if (p) print = p;
        await t.press('Escape');
        await t.sleep(200);
      }
      return {
        ok: menus.length >= 8 && cut.length === 0 && print !== null && !print.clipped,
        observed: `${menus.length} menus; cut labels ${cut.join(', ') || 'none'}; Print settings and preview ${print ? (print.clipped ? 'cut' : 'whole') : 'not found'}`,
      };
    },
  );
  await t.step(
    'chrome.menu.no-mnemonics-mac',
    'open the File menu on this platform; read the access key marks',
    'on macOS no row underlines an access key',
    async () => {
      await t.clearAll();
      await t.openMenu('file');
      const facts = await page.evaluate(() => {
        const marks = [...document.querySelectorAll('#ts-menu-file .ts-menu-ak')];
        const underlined = marks.filter(
          (el) =>
            /underline/.test(getComputedStyle(el).textDecorationLine) &&
            el.getClientRects().length > 0,
        ).length;
        return { marks: marks.length, underlined };
      });
      await t.closeMenus();
      const mac = process.platform === 'darwin';
      return {
        ok: mac ? facts.underlined === 0 : null,
        observed: `platform ${process.platform}; access key marks ${facts.marks}, underlined ${facts.underlined}${mac ? '' : '; not driven: the row asserts the macOS drawing (PRODUCT.md 3.1.1)'}`,
      };
    },
  );
  await t.step(
    'chrome.select.one-rule',
    "read the Share dialog's selects and the Comments filter",
    "32 px with the chrome's own chevron",
    async () => {
      await t.clearAll();
      await t.clickControl('share.open');
      await t.waitControl('dialog.share', 8000);
      await t.sleep(300);
      const shareSelects = await page.evaluate(() =>
        [...document.querySelectorAll('[data-control="dialog.share"] select')]
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => ({
            id: el.getAttribute('data-control'),
            h: Math.round(el.getBoundingClientRect().height),
            appearance: getComputedStyle(el).appearance,
          })),
      );
      /* a legacy deck's dialog draws a sentence and no select (Share.tsx `dialog.share.legacy`) */
      const legacyDialog = await t.has('[data-control="dialog.share.legacy"]');
      await t.press('Escape');
      await t.waitGone('[data-control="dialog.share"]', 4000);
      if (await t.visible('panel.comments.close')) await t.clickControl('panel.comments.close');
      await t.clickControl('title.comments');
      await t.waitControl('panel.comments', 6000);
      await t.sleep(300);
      const filter = await paint('[data-control="panel.comments.filter"]');
      if (await t.visible('panel.comments.close')) await t.clickControl('panel.comments.close');
      const own = (a) => a === 'none' || a === '-webkit-none' || a === 'base-select';
      const filterOk =
        filter === null ? null : Math.round(filter.height) === 32 && own(filter.appearance);
      return {
        ok:
          (legacyDialog
            ? shareSelects.every((s) => s.h === 32 && own(s.appearance))
            : shareSelects.length >= 1 &&
              shareSelects.every((s) => s.h === 32 && own(s.appearance))) && filterOk !== false,
        observed: `Share selects ${shareSelects.map((s) => `${s.id ?? 'select'} ${s.h}px appearance ${s.appearance}`).join(', ') || (legacyDialog ? 'none (a legacy deck: the dialog draws a sentence)' : 'none')}; Comments filter ${filter ? `${Math.round(filter.height)}px appearance ${filter.appearance}` : 'absent (no comments, PRODUCT.md 3.2)'}`,
      };
    },
  );
  await t.step(
    'chrome.check.draws-check',
    'open Share, reach the Notify people box, read its checked drawing',
    'the checked box draws the check glyph (a corner turned 45 degrees, not a bar)',
    async () => {
      await t.clearAll();
      await t.clickControl('share.open');
      await t.waitControl('dialog.share', 8000);
      if (await t.visible('dialog.share.more')) {
        await t.clickControl('dialog.share.more');
        await t.sleep(300);
      }
      const facts = await page.evaluate(() => {
        const labels = [
          ...document.querySelectorAll('[data-control="dialog.share"] .ts-dialog-check'),
        ];
        const notify =
          labels.find((l) => /Notify people/.test(l.textContent ?? '')) ?? labels[0] ?? null;
        if (!notify) return null;
        const input = notify.querySelector('input[type="checkbox"]');
        const box = notify.querySelector('.ts-dialog-check-box');
        if (!box) return { found: true, box: false };
        const after = getComputedStyle(box, '::after');
        return {
          found: true,
          box: true,
          checked: input?.checked ?? null,
          w: parseFloat(after.width),
          h: parseFloat(after.height),
          transform: after.transform,
          content: after.content,
          border: `${after.borderRightWidth} ${after.borderBottomWidth}`,
        };
      });
      await t.press('Escape');
      await t.waitGone('[data-control="dialog.share"]', 4000);
      if (!facts) return { ok: false, observed: 'no check row in the Share dialog' };
      if (!facts.box) return { ok: false, observed: 'the check row draws no box' };
      const rotated =
        facts.transform !== 'none' && /matrix\(0\.7071|rotate\(45deg\)/.test(facts.transform);
      const corner = facts.w >= 4 && facts.w <= 6 && facts.h >= 8 && facts.h <= 10;
      return {
        ok: facts.checked === true && rotated && corner,
        observed: `checked ${facts.checked}; ::after ${facts.w} by ${facts.h} px, transform ${facts.transform}, borders ${facts.border}`,
      };
    },
  );
  await t.step(
    'chrome.toolbar.bold-follows-selection',
    'select a word in a text box, Cmd+B, read the Bold button; move the caret to plain text; read it again',
    'aria-pressed true on the bold word, false on plain text',
    async () => {
      await t.clearAll();
      const X = t.deck.textSlide ?? T;
      await t.clickCard(X);
      const obj = await t.placeBlock(X, {
        id: 'bold-box',
        type: 'text',
        text: 'Alpha beta gamma delta',
        pos: { x: 160, y: 120, w: 700, h: 80 },
      });
      if (!obj) return { ok: false, observed: 'the text box was not placed' };
      const run = (await t.runsOfBlock('bold-box'))[0];
      await t.openRun(run);
      await t.selectWord(run, 1);
      await t.press('Meta+b');
      const pressed = () => t.attr('[data-control="toolbar.bold"]', 'aria-pressed');
      const onBold = await t.pollUntil(pressed, (v) => v === 'true', 2000).catch(pressed);
      /* the caret to the plain third word */
      const w = await t.wordRect(run, 3);
      await t.clickAt(w.x + w.w / 2, w.y + w.h / 2);
      await t.sleep(300);
      const onPlain = await t.pollUntil(pressed, (v) => v === 'false', 2000).catch(pressed);
      await t.press('Escape');
      const s = await t.settled();
      await t
        .invoke('block.remove', { baseRevision: s.revision, slideId: X, blockId: 'bold-box' })
        .catch(() => undefined);
      await t.settled();
      await t.clickCard(T);
      return {
        ok: onBold === 'true' && onPlain === 'false',
        observed: `on the bold word aria-pressed ${onBold}; on plain text ${onPlain}`,
      };
    },
  );
  await t.advancedBack('the chrome rows of the product round');
}
