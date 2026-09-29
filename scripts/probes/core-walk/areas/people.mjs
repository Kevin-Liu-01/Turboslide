// How a person is drawn, the probe's rows (docs/PEOPLE.md 6.1, the area `people` under the
// share feature with the driver `probe --core`): the chip's field 2 px inside its edge on every
// chip the one browser can reach (the own chip, the account head, the roster's own row, the
// builder's strip, a 16 px version row, a comment card's chip) with the live stripe and the
// other chips' border in both appearances; the chrome's cells against `renderMarkBits` of
// packages/identity before and after a glyph avatar; the own chip, its rule and the roster's
// "(you)" row with the switch off, the name prompt of the first edit and Change name reaching
// the three own surfaces with no reload; Change avatar reaching the own chip at once and after a
// reload; and the Picture tab's refusal for an anonymous person on the dialog, the window API and
// the agent surface. The two browser rows are core/share.spec.ts; the account and picture rows
// are e2e/accounts.spec.ts on a node server with an identity database (6.2).
//
// The own chip and the roster's own row are `title.account` and `title.presence.me`, parked on
// the tree this round starts from (3.14, the integrator's unpark): a row that needs the builder
// reaches it with Tools > Advanced tools on when the chip is not drawn with the switch off, says
// so, and turns the switch off again; the geometry row reads the chips drawn with the switch off
// and is not driven when no live chip can be read that way. The roster opens with Shift+Tab
// (SPEC-3 0.42; roster-hook.ts), the one way in a browser where nobody else is present.
import { renderMarkBits } from '../../../../packages/identity/src/marks-render.ts';

export const NAME = 'people';
export const IDS = [
  'people.chip-plate-size',
  'people.mark-renderers-agree',
  'people.own-chip-follows-name',
  'people.own-chip-follows-avatar',
  'people.avatar-anonymous-refused',
];

const ACCOUNT_MENU = '#ts-menu-account';
const ROSTER_MENU = '#ts-menu-roster';
const OWN_CHIP = '[data-control="title.account"] .ts-chip';
const NAME_TYPED = 'Ada Lovelace';

/** Every visible `.ts-chip` under a selector (the document when null) with the facts the geometry row reads. */
const readChips = (page, root) =>
  page.evaluate((sel) => {
    const visible = (el) => el.getClientRects().length > 0;
    const scope = sel ? document.querySelector(sel) : document;
    if (!scope) return [];
    const r10 = (v) => Math.round(v * 10) / 10;
    const inset = (box, b) =>
      b
        ? {
            left: r10(b.left - box.left),
            top: r10(b.top - box.top),
            right: r10(box.right - b.right),
            bottom: r10(box.bottom - b.bottom),
            w: r10(b.width),
            h: r10(b.height),
          }
        : null;
    return [...scope.querySelectorAll('.ts-chip')].filter(visible).map((chip) => {
      const box = chip.getBoundingClientRect();
      const field = chip.querySelector('svg.ts-chip-plate, img.ts-chip-picture');
      const stripe = chip.querySelector('.ts-chip-stripe');
      const cs = getComputedStyle(chip);
      return {
        holder: chip.closest('[data-control]')?.getAttribute('data-control') ?? null,
        size: Number(chip.getAttribute('data-size') ?? Math.round(box.width)),
        box: { w: r10(box.width), h: r10(box.height) },
        self: chip.classList.contains('is-self'),
        live: chip.classList.contains('is-live'),
        blank: chip.classList.contains('is-blank'),
        variant: chip.getAttribute('data-variant'),
        field: field ? field.tagName.toLowerCase() : null,
        fieldBox: inset(box, field ? field.getBoundingClientRect() : null),
        stripe: inset(box, stripe ? stripe.getBoundingClientRect() : null),
        border: cs.borderTopColor,
        borderWidth: cs.borderTopWidth,
        label: chip.getAttribute('aria-label'),
        principal: chip.getAttribute('data-principal'),
        hue: chip.getAttribute('data-hue'),
      };
    });
  }, root);

/** The computed colour of `--pt-edge` as the chrome resolves it now, through a probe element in the title row. */
const edgeColor = (page) =>
  page.evaluate(() => {
    const host = document.querySelector('[data-control="title.presence"]') ?? document.body;
    const probe = document.createElement('span');
    probe.style.borderTop = '1px solid var(--pt-edge)';
    host.appendChild(probe);
    const color = getComputedStyle(probe).borderTopColor;
    probe.remove();
    return color;
  });

/**
 * The lit cells of a chip as a bit grid in the chip's own pixels: every `rect` of the plate's
 * SVG, read from its box against the chip's box at 1x. The ring is the chip's border and the
 * initials are text, so neither is a rect.
 */
const chipBits = (page, selector) =>
  page.evaluate((sel) => {
    const chip = document.querySelector(sel);
    if (!chip || chip.getClientRects().length === 0) return null;
    const box = chip.getBoundingClientRect();
    const size = Math.round(box.width);
    const grid = Array.from({ length: size }, () => new Array(size).fill(0));
    const rects = [...chip.querySelectorAll('svg.ts-chip-plate rect')];
    for (const rect of rects) {
      const r = rect.getBoundingClientRect();
      const x0 = Math.round(r.left - box.left);
      const y0 = Math.round(r.top - box.top);
      const x1 = Math.round(r.right - box.left);
      const y1 = Math.round(r.bottom - box.top);
      for (let y = y0; y < y1; y += 1)
        for (let x = x0; x < x1; x += 1)
          if (x >= 0 && y >= 0 && x < size && y < size) grid[y][x] = 1;
    }
    return {
      size,
      rects: rects.length,
      img: chip.querySelector('img') !== null,
      variant: chip.getAttribute('data-variant'),
      rows: grid.map((row) => row.join('')),
    };
  }, selector);

/**
 * The package's field for a spec at a size, as rows of bits, the ring left out of the
 * comparison. The presenter triangle is the chrome's `i.ts-chip-presenter`, never a rect
 * (build/b2.md item 6b), so the package draws none either.
 */
function packageRows(spec, size) {
  const { bits } = renderMarkBits({ ...spec, presenter: false }, size);
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    let row = '';
    for (let x = 0; x < size; x += 1) row += String(bits[y * size + x]);
    rows.push(row);
  }
  return rows;
}

/** The interior pixels (the ring at 0 and size - 1 left out) on which two grids differ. */
function differences(a, b, size) {
  let count = 0;
  let lit = 0;
  const first = [];
  for (let y = 1; y < size - 1; y += 1)
    for (let x = 1; x < size - 1; x += 1) {
      const p = a[y]?.[x] ?? '0';
      const q = b[y]?.[x] ?? '0';
      if (q === '1') lit += 1;
      if (p !== q) {
        count += 1;
        if (first.length < 4) first.push(`${x},${y}`);
      }
    }
  return { count, lit, first };
}

/** The own mark as the window API reports it: `state.account.mark` (B1's request), else the room's own entry. */
const ownMark = async (t) => {
  const s = await t.state();
  const mark = s.account?.mark ?? s.presence?.self?.mark ?? null;
  const source = s.account?.mark
    ? 'state.account.mark'
    : s.presence?.self?.mark
      ? 'state.presence.self.mark'
      : null;
  return {
    mark,
    source,
    principalId: s.account?.principalId ?? s.presence?.self?.principalId ?? null,
  };
};

export async function run(t) {
  const { page } = t;
  await t.clickCard(t.deck.titleSlide);
  await t.clearAll();

  const menuOpen = (selector) =>
    page
      .locator(selector)
      .first()
      .isVisible()
      .catch(() => false);
  const closeMenus = async () => {
    for (let i = 0; i < 3; i += 1) {
      if (!(await menuOpen(ACCOUNT_MENU)) && !(await menuOpen(ROSTER_MENU))) break;
      await t.press('Escape');
      await t.sleep(150);
    }
  };
  /** Opens the own chip's menu when the chip is drawn; false otherwise. */
  const openAccountMenu = async () => {
    await closeMenus();
    if (!(await t.visible('title.account'))) return false;
    await t.clickControl('title.account');
    return page
      .locator(ACCOUNT_MENU)
      .first()
      .waitFor({ timeout: 4000 })
      .then(() => true)
      .catch(() => false);
  };
  /**
   * Opens the roster from the keyboard (Shift+Tab with no menu open, SPEC-3 0.42), else through
   * the opener's own DOM click (roster-hook.ts openRoster), which the keyboard route runs; the
   * opener is drawn empty while nobody else is present and takes no pointer click. Answers how it
   * opened, or null.
   */
  const openRoster = async () => {
    await closeMenus();
    await t.clearAll();
    await t.press('Shift+Tab');
    const viaKey = await page
      .locator(ROSTER_MENU)
      .first()
      .waitFor({ timeout: 2500 })
      .then(() => 'Shift+Tab')
      .catch(() => null);
    if (viaKey) return viaKey;
    await page.evaluate(() => {
      const more = document.querySelector('[data-control="presence.more"]');
      if (more instanceof HTMLElement) more.click();
    });
    return page
      .locator(ROSTER_MENU)
      .first()
      .waitFor({ timeout: 2500 })
      .then(() => 'the opener’s DOM click')
      .catch(() => null);
  };
  /**
   * Opens Change avatar from the own chip's menu. With the chip not drawn (parked) the switch is
   * turned on through Tools > Advanced tools and off again by the caller (`advancedBack`); the
   * answer names the route or null when no route reached the dialog.
   */
  const openBuilder = async () => {
    let route = 'title.account';
    let opened = await openAccountMenu();
    if (!opened) {
      const on = await t.setAdvanced(true);
      if (on) t.deck.advanced = true;
      opened = await openAccountMenu();
      route = opened ? 'title.account with the switch on' : null;
    }
    if (!opened) return null;
    await page.locator(`${ACCOUNT_MENU} [data-control="account.changeAvatar"]`).first().click();
    const shown = await page
      .locator('[data-control="dialog.avatarBuilder"]')
      .first()
      .waitFor({ timeout: 6000 })
      .then(() => true)
      .catch(() => false);
    return shown ? route : null;
  };
  const closeBuilder = async () => {
    if (await t.visible('dialog.avatarBuilder.cancel'))
      await t.clickControl('dialog.avatarBuilder.cancel');
    else if (await t.visible('dialog.avatarBuilder.close'))
      await t.clickControl('dialog.avatarBuilder.close');
    else await t.press('Escape');
    await t.waitGone('[data-control="dialog.avatarBuilder"]', 4000);
  };
  /** Picks a tab of the builder and applies; answers the own chip's variant within `ms`. */
  const applyVariant = async (tab, ms) => {
    await t.clickControl(`dialog.avatarBuilder.tab.${tab}`);
    await t.sleep(200);
    const t0 = Date.now();
    await t.clickControl('dialog.avatarBuilder.apply');
    await t.waitGone('[data-control="dialog.avatarBuilder"]', 8000);
    const variant = await t
      .pollUntil(
        () =>
          page.evaluate(
            (sel) => document.querySelector(sel)?.getAttribute('data-variant') ?? null,
            OWN_CHIP,
          ),
        (v) => v === tab,
        ms,
      )
      .catch(() => null);
    return { variant, ms: Date.now() - t0 };
  };
  const ownVariant = () =>
    page.evaluate(
      (sel) => document.querySelector(sel)?.getAttribute('data-variant') ?? null,
      OWN_CHIP,
    );
  /** The chrome's appearance (`data-theme` on the root) through View > Appearance. */
  const chromeTheme = () =>
    page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const setChrome = async (mode) => {
    await t.surfaceClear({ dialogs: true });
    await t.menuPath('view', 'view.appearance', `view.appearance.${mode}`);
    return t
      .pollUntil(chromeTheme, (v) => (mode === 'match' ? true : v === mode), 5000)
      .catch(chromeTheme);
  };

  // ---- the geometry (3.3, 3.4)
  await t.step(
    'people.chip-plate-size',
    'with the switch off read every chip the browser can reach: the own chip, the account head, the roster’s own row (Shift+Tab), the builder’s 24 px cell, a 16 px version row, a comment card; then the other chips’ border in dark chrome',
    'every 24 px chip’s field is 20 by 20 at 2 px inside the chip on every side and a 16 px chip’s 12 by 12; the live stripe 1 px inside the inner edge on the left, right and bottom; the other chips’ border is --pt-edge in light and dark chrome',
    async () => {
      if (await t.advancedOn()) {
        const off = await t.setAdvanced(false);
        if (off) t.deck.advanced = false;
      }
      const chips = [];
      const notes = [];
      /* the title row: the own chip (and anybody else's) with the switch off */
      const title = await readChips(page, '[data-control="title.presence"]');
      if (title.length === 0)
        notes.push('no chip in the title row (title.account is not drawn with the switch off)');
      chips.push(...title.map((c) => ({ ...c, where: 'title row' })));
      /* the account head */
      if (await openAccountMenu()) {
        chips.push(
          ...(await readChips(page, ACCOUNT_MENU)).map((c) => ({ ...c, where: 'account head' })),
        );
        await closeMenus();
      } else notes.push('no account menu');
      /* the roster's own row, the one live chip of a browser alone */
      const roster = await openRoster();
      if (roster) {
        chips.push(
          ...(await readChips(page, ROSTER_MENU)).map((c) => ({
            ...c,
            where: `roster (${roster})`,
          })),
        );
        await closeMenus();
      } else
        notes.push(
          'the roster did not open (title.presence.me is parked, or the opener is absent)',
        );
      /* the builder's 24 px cell, reached with the switch off alone for this row */
      if (await openAccountMenu()) {
        await page.locator(`${ACCOUNT_MENU} [data-control="account.changeAvatar"]`).first().click();
        const shown = await t
          .waitControl('dialog.avatarBuilder', 6000)
          .then(() => true)
          .catch(() => false);
        if (shown) {
          const cells = await readChips(
            page,
            '[data-control="dialog.avatarBuilder.strip"] .ts-avatar-cell[data-size="24"]',
          );
          chips.push(...cells.map((c) => ({ ...c, size: 24, where: 'builder strip 24' })));
          await closeBuilder();
        } else notes.push('the builder did not open');
      }
      /* a 16 px version row chip */
      await t.surfaceClear({ dialogs: true });
      if (!(await t.visible('panel.versionHistory'))) {
        await t.menuPath('file', 'file.versionHistory', 'file.versionHistory.see');
        await t.waitControl('panel.versionHistory', 8000).catch(() => undefined);
      }
      const versionChips = (await readChips(page, '[data-control="panel.versionHistory"]')).filter(
        (c) => !c.blank,
      );
      const version16 = versionChips.find((c) => c.size === 16) ?? null;
      if (version16) chips.push({ ...version16, where: 'version row 16' });
      else notes.push('no 16 px chip in Version history');
      if (await t.visible('panel.versionHistory.close'))
        await t.clickControl('panel.versionHistory.close');
      /* a comment card's chip: one comment on the title slide through Insert > Comment's chord */
      await t.clearAll();
      await t.clickCard(t.deck.titleSlide);
      await t.press('Meta+Alt+m');
      const card = await page
        .locator('[data-control="comment.card"]')
        .first()
        .waitFor({ timeout: 6000 })
        .then(() => true)
        .catch(() => false);
      let commentChip = null;
      if (card) {
        await t.clickControl('comment.card.new.field');
        await t.typeHuman('The chip on this card is read by the walk');
        await t.clickControl('comment.card.new.submit');
        await t.sleep(800);
        await t.clearAll();
        await t.clickControl('title.comments');
        await t.waitControl('panel.comments', 6000).catch(() => undefined);
        const panelChips = await readChips(page, '[data-control="panel.comments"]');
        commentChip = panelChips.find((c) => c.size === 24) ?? null;
        if (commentChip) chips.push({ ...commentChip, where: 'comments panel row' });
        if (await t.visible('panel.comments.close')) await t.clickControl('panel.comments.close');
      } else notes.push('no comment card opened on Cmd+Option+M');
      const lightEdge = await edgeColor(page);
      /* the other chips' border in dark chrome: the version row's chip and the comment row's */
      const themeBefore = await chromeTheme();
      const dark = await setChrome('dark');
      const darkEdge = await edgeColor(page);
      let darkChips = [];
      if (!(await t.visible('panel.versionHistory'))) {
        await t.menuPath('file', 'file.versionHistory', 'file.versionHistory.see');
        await t.waitControl('panel.versionHistory', 8000).catch(() => undefined);
      }
      darkChips = (await readChips(page, '[data-control="panel.versionHistory"]')).filter(
        (c) => !c.blank && !c.self,
      );
      if (await t.visible('panel.versionHistory.close'))
        await t.clickControl('panel.versionHistory.close');
      await setChrome(
        themeBefore === 'dark' ? 'dark' : themeBefore === 'light' ? 'light' : 'match',
      );
      /* the judgement */
      const near = (a, b) => a !== null && a !== undefined && Math.abs(a - b) <= 0.5;
      const fieldOk = (c) => {
        const want = c.size === 24 ? 20 : c.size === 16 ? 12 : c.size === 14 ? 10 : c.size - 4;
        const f = c.fieldBox;
        return (
          f !== null &&
          near(f.w, want) &&
          near(f.h, want) &&
          near(f.left, 2) &&
          near(f.top, 2) &&
          near(f.right, 2) &&
          near(f.bottom, 2)
        );
      };
      const fields = chips.filter((c) => !c.blank && (c.size === 24 || c.size === 16));
      const wrongFields = fields.filter((c) => !fieldOk(c));
      const liveChips = chips.filter((c) => c.live && c.stripe !== null);
      const stripeOk = (c) =>
        c.stripe !== null &&
        near(c.stripe.left, 2) &&
        near(c.stripe.right, 2) &&
        near(c.stripe.bottom, 2);
      const wrongStripes = liveChips.filter((c) => !stripeOk(c));
      const others = chips.filter((c) => !c.self && !c.blank);
      const wrongLight = others.filter((c) => c.border !== lightEdge);
      const wrongDark = darkChips.filter((c) => c.border !== darkEdge);
      const describe = (c) =>
        `${c.where}${c.holder ? ` ${c.holder}` : ''} ${c.size}px ${c.variant ?? '?'}${c.self ? ' self' : ''}${c.live ? ' live' : ''}: field ${c.fieldBox ? `${c.fieldBox.w}x${c.fieldBox.h} at ${c.fieldBox.left}/${c.fieldBox.top}/${c.fieldBox.right}/${c.fieldBox.bottom}` : 'none'}${c.stripe ? `, stripe ${c.stripe.left}/${c.stripe.right}/${c.stripe.bottom}` : ''}, border ${c.borderWidth} ${c.border}`;
      const observed = `${chips.length} chips: ${chips.map(describe).join('; ')}; --pt-edge light ${lightEdge}, dark ${darkEdge} (theme ${themeBefore} -> ${dark} -> ${await chromeTheme()}); dark borders ${darkChips.map((c) => `${c.size}px ${c.border}`).join(', ') || 'none read'}${notes.length > 0 ? `; ${notes.join('; ')}` : ''}`;
      if (liveChips.length === 0 || fields.length === 0)
        return {
          ok: null,
          observed: `${liveChips.length === 0 ? 'no live chip could be read with the switch off (the roster’s own row is title.presence.me)' : 'no 24 or 16 px chip could be read'}; ${observed}`,
        };
      return {
        ok:
          wrongFields.length === 0 &&
          wrongStripes.length === 0 &&
          wrongLight.length === 0 &&
          wrongDark.length === 0 &&
          darkChips.length > 0,
        observed: `${wrongFields.length} chips with the field off the 2 px inset, ${wrongStripes.length} stripes off, ${wrongLight.length} other chips off --pt-edge in light, ${wrongDark.length} in dark; ${observed}`,
      };
    },
  );

  // ---- the two renderers (3.5)
  await t.step(
    'people.mark-renderers-agree',
    'read the own chip’s rects at 24 px against renderMarkBits of the window API’s own mark; Change avatar > Glyph > Apply; read again; read a 16 px version row chip against the 16 px field',
    'the chrome’s lit cells equal the package’s field for the initials and the glyph variant at 24 px and for the 16 px chip',
    async () => {
      const first = await ownMark(t);
      if (first.mark === null)
        return {
          ok: null,
          observed:
            'the window API names no own mark (state.account.mark, build/b5.md R1 to B1; nor presence.self.mark)',
        };
      /* the own chip, else the roster's own row, else the account head: every one draws the own
         mark; while the chip is parked the switch goes on for this row (its claim is the two
         renderers, not the switch) and off again at the end */
      const readOwn = async () => {
        if (!(await t.visible('title.account')) && !(await t.advancedOn())) {
          const on = await t.setAdvanced(true);
          if (on) t.deck.advanced = true;
        }
        if (await t.visible('title.account'))
          return {
            bits: await chipBits(page, OWN_CHIP),
            from: `the own chip${(await t.advancedOn()) ? ' (the switch on)' : ''}`,
          };
        if (await openRoster()) {
          const bits = await chipBits(page, `${ROSTER_MENU} .ts-roster-row.is-self .ts-chip`);
          await closeMenus();
          if (bits) return { bits, from: 'the roster’s own row' };
        }
        if (await openAccountMenu()) {
          const bits = await chipBits(page, `${ACCOUNT_MENU} .ts-account-head .ts-chip`);
          await closeMenus();
          if (bits) return { bits, from: 'the account head' };
        }
        return { bits: null, from: null };
      };
      const before = await readOwn();
      if (before.bits === null)
        return {
          ok: null,
          observed:
            'no chip of the own mark is drawn (title.account and title.presence.me are parked)',
        };
      const compare = (bits, spec) => {
        const want = packageRows(spec, bits.size);
        const d = differences(bits.rows, want, bits.size);
        return `${bits.size} px ${spec.variant} (${bits.rects} rects): ${d.count} of ${d.lit} lit interior pixels differ${d.count > 0 ? ` (first at ${d.first.join(' ')})` : ''}`;
      };
      const initials = {
        text: compare(before.bits, first.mark),
        ok:
          differences(before.bits.rows, packageRows(first.mark, before.bits.size), before.bits.size)
            .count === 0,
      };
      /* the glyph variant */
      const route = await openBuilder();
      let glyph = null;
      let sixteen = null;
      if (route) {
        const applied = await applyVariant('glyph', 5000);
        const after = await ownMark(t);
        const bits = (await readOwn()).bits;
        if (bits && after.mark)
          glyph = {
            text: `${compare(bits, after.mark)} (variant on the chip ${applied.variant ?? bits.variant} after ${applied.ms} ms)`,
            ok: differences(bits.rows, packageRows(after.mark, bits.size), bits.size).count === 0,
          };
        /* the 16 px version row of the own author */
        await t.surfaceClear({ dialogs: true });
        if (!(await t.visible('panel.versionHistory'))) {
          await t.menuPath('file', 'file.versionHistory', 'file.versionHistory.see');
          await t.waitControl('panel.versionHistory', 8000).catch(() => undefined);
        }
        /* the walk's records of one author within fifteen minutes sit in collapsed windows, whose
           rows draw no version row of their own: every window is expanded first (the second run
           on 4465 read no 16 px row) */
        for (const w of await page.locator('[data-control^="versionHistory.window."]').all())
          await w.click().catch(() => undefined);
        await t.sleep(300);
        const ownRow = after.principalId
          ? `li.ts-version[data-author="${after.principalId}"] .ts-chip[data-size="16"]`
          : 'li.ts-version .ts-chip[data-size="16"]';
        const bits16 =
          (await chipBits(page, ownRow)) ??
          (await chipBits(page, 'li.ts-version .ts-chip[data-size="16"]'));
        if (bits16 && after.mark)
          sixteen = {
            text: compare(bits16, after.mark),
            ok:
              differences(bits16.rows, packageRows(after.mark, bits16.size), bits16.size).count ===
              0,
          };
        if (await t.visible('panel.versionHistory.close'))
          await t.clickControl('panel.versionHistory.close');
        /* the initials variant back, so the avatar row reads its own change */
        if (await openBuilder()) await applyVariant('initials', 5000);
      }
      await t.advancedBack('the renderers row');
      return {
        ok: initials.ok && glyph !== null && glyph.ok && sixteen !== null && sixteen.ok,
        observed: `mark from ${first.source} read on ${before.from}; initials ${initials.text}; glyph ${glyph ? glyph.text : `not read (the builder ${route ? 'opened' : 'did not open'})`}; 16 px ${sixteen ? sixteen.text : 'not read'}`,
      };
    },
  );

  // ---- the own chip follows the name (3.11, 3.14)
  await t.step(
    'people.own-chip-follows-name',
    'with the switch off read the own chip, its rule and the roster’s own row; the name prompt record of the first edit; Change name through the account menu; read the three own surfaces within 2 s; the account menu’s rows',
    'the own chip, the rule and the "(you)" row are drawn; the prompt fired on the first edit; the chip’s name, the account head and the own row read the new name within 2 s with no reload; no Sessions row',
    async () => {
      if (await t.advancedOn()) {
        const off = await t.setAdvanced(false);
        if (off) t.deck.advanced = false;
      }
      await closeMenus();
      const drawn = await page.evaluate(() => ({
        chip: document.querySelector('[data-control="title.account"] .ts-chip') !== null,
        rule: document.querySelector('[data-control="title.presence"] .ts-presence-rule') !== null,
      }));
      const roster = await openRoster();
      const ownRowBefore = roster
        ? await page.evaluate(
            () =>
              document
                .querySelector('#ts-menu-roster .ts-roster-row.is-self .ts-roster-name')
                ?.textContent?.trim() ?? null,
          )
        : null;
      await closeMenus();
      const prompt = t.prompts.namePrompt;
      const opened = await openAccountMenu();
      if (!opened)
        return {
          ok: false,
          observed: `own chip ${drawn.chip}, rule ${drawn.rule}, roster own row ${ownRowBefore ?? 'none'} (roster ${roster ?? 'did not open'}); prompt of the first edit ${prompt ? `closed at ${prompt.at} in ${prompt.area}` : 'never seen'}; the account menu could not open with the switch off (title.account is parked, docs/PEOPLE.md 3.14)`,
        };
      const rowsBefore = await page.evaluate(() =>
        [...document.querySelectorAll('#ts-menu-account [role="menuitem"]')].map((el) =>
          el.getAttribute('data-control'),
        ),
      );
      await page.locator(`${ACCOUNT_MENU} [data-control="account.changeName"]`).first().click();
      await t.waitControl('dialog.namePrompt', 6000);
      const field = page.locator('[data-control="dialog.namePrompt.name"]').first();
      await field.click();
      await t.press('Meta+a');
      await t.typeHuman(NAME_TYPED);
      const t0 = Date.now();
      if (await t.visible('dialog.namePrompt.continue'))
        await t.clickControl('dialog.namePrompt.continue');
      else await t.press('Enter');
      await t.waitGone('[data-control="dialog.namePrompt"]', 8000);
      const chipName = await t
        .pollUntil(
          () =>
            page.evaluate(
              (sel) => document.querySelector(sel)?.getAttribute('aria-label') ?? null,
              OWN_CHIP,
            ),
          (v) => typeof v === 'string' && v.includes(NAME_TYPED),
          2000,
        )
        .catch(() => null);
      const chipMs = Date.now() - t0;
      await openAccountMenu();
      const head = await page.evaluate(
        () =>
          document.querySelector('#ts-menu-account .ts-account-name')?.textContent?.trim() ?? null,
      );
      const rowsAfter = await page.evaluate(() =>
        [...document.querySelectorAll('#ts-menu-account [role="menuitem"]')].map((el) =>
          el.getAttribute('data-control'),
        ),
      );
      await closeMenus();
      const rosterAgain = await openRoster();
      const ownRow = rosterAgain
        ? await page.evaluate(
            () =>
              document
                .querySelector('#ts-menu-roster .ts-roster-row.is-self .ts-roster-name')
                ?.textContent?.trim() ?? null,
          )
        : null;
      await closeMenus();
      const within = Date.now() - t0;
      const sessions = [...rowsBefore, ...rowsAfter].includes('account.sessions');
      return {
        ok:
          drawn.chip &&
          drawn.rule &&
          ownRowBefore !== null &&
          prompt !== null &&
          typeof chipName === 'string' &&
          chipName.includes(NAME_TYPED) &&
          head === NAME_TYPED &&
          ownRow !== null &&
          ownRow.startsWith(NAME_TYPED) &&
          !sessions,
        observed: `own chip ${drawn.chip}, rule ${drawn.rule}, roster own row before "${ownRowBefore ?? 'none'}" (${roster ?? 'did not open'}); prompt of the first edit ${prompt ? `closed at ${prompt.at} in ${prompt.area} (${prompt.step})` : 'never seen'}; after Change name: chip "${chipName ?? 'unchanged'}" after ${chipMs} ms, account head "${head ?? 'none'}", own row "${ownRow ?? 'none'}" read ${within} ms after Continue, no reload; account menu rows ${rowsAfter.join(', ')} (Sessions listed ${sessions})`,
      };
    },
  );

  // ---- the own chip follows the avatar (3.11, 3.13)
  await t.step(
    'people.own-chip-follows-avatar',
    'Change avatar > Glyph > Apply; read the own chip’s data-variant; reload; read again within 10 s; reopen the builder; read the roster’s own row against the own chip',
    'data-variant reads glyph within 2 s with no reload and after the reload; Glyph is selected in the reopened builder; the roster’s own row draws the same cells',
    async () => {
      const route = await openBuilder();
      if (!route) {
        await t.advancedBack('the avatar row');
        return {
          ok: null,
          observed: 'the builder could not open (no account menu with the switch off or on)',
        };
      }
      const variantBefore = await ownVariant();
      const applied = await applyVariant('glyph', 2000);
      const before = { variant: applied.variant ?? (await ownVariant()), ms: applied.ms };
      /* the reload: on a deployment the read may land on an instance that has not seen the choice
         for up to 5 s (docs/PEOPLE.md 6.4), so the bound is 10 s and the instance is named */
      await t.reloadTo(page.url());
      await t.settled();
      const t1 = Date.now();
      let after = await t.pollUntil(ownVariant, (v) => v === 'glyph', 10_000).catch(ownVariant);
      let instance = null;
      if (after !== 'glyph') {
        const status = await t.invoke('sync.status').catch(() => null);
        instance = status?.storeCalls?.instance ?? null;
      }
      const afterMs = Date.now() - t1;
      /* the builder again: Glyph selected */
      const reopened = await openBuilder();
      const selected = reopened
        ? await page.evaluate(() => {
            const tab = document.querySelector('[data-control="dialog.avatarBuilder.tab.glyph"]');
            return tab?.getAttribute('aria-selected') ?? tab?.className ?? null;
          })
        : null;
      if (reopened) await closeBuilder();
      /* the roster's own row against the own chip */
      const own = await chipBits(page, OWN_CHIP);
      const roster = await openRoster();
      const row = roster
        ? await chipBits(page, `${ROSTER_MENU} .ts-roster-row.is-self .ts-chip`)
        : null;
      await closeMenus();
      const same = own !== null && row !== null && own.rows.join('/') === row.rows.join('/');
      await t.advancedBack('the avatar row');
      return {
        ok:
          before.variant === 'glyph' &&
          before.ms <= 2000 &&
          after === 'glyph' &&
          (selected === 'true' || /is-on/.test(selected ?? '')) &&
          same,
        observed: `via ${route}; variant ${variantBefore ?? 'none'} -> ${before.variant ?? 'unchanged'} ${before.ms} ms after Apply, ${after ?? 'none'} ${afterMs} ms after the reload${instance ? ` (instance ${instance})` : ''}; Glyph tab aria-selected ${selected ?? 'not read'}; roster own row (${roster ?? 'did not open'}) cells equal the own chip ${same}${own && row ? ` (${own.rects} and ${row.rects} rects)` : ''}`,
      };
    },
  );

  // ---- the anonymous refusal of a picture (4.3)
  await t.step(
    'people.avatar-anonymous-refused',
    'Change avatar > Picture: read the sentence and Apply; account.setAvatar with a 16 px WebP data URL through the window API, then through the agent surface with the bearer; read the own chip’s variant after',
    'the tab reads "Sign in to upload a picture" with Apply disabled; both transports refuse and the chip is unchanged',
    async () => {
      const route = await openBuilder();
      if (!route) {
        await t.advancedBack('the anonymous picture row');
        return {
          ok: null,
          observed: 'the builder could not open (no account menu with the switch off or on)',
        };
      }
      await t.clickControl('dialog.avatarBuilder.tab.picture');
      await t.sleep(300);
      const tab = await page.evaluate(() => {
        const sentence = document.querySelector(
          '[data-control="dialog.avatarBuilder.signInSentence"]',
        );
        const apply = document.querySelector('[data-control="dialog.avatarBuilder.apply"]');
        return {
          sentence: sentence?.textContent?.trim() ?? null,
          applyDisabled: apply
            ? apply.hasAttribute('disabled') || apply.getAttribute('aria-disabled') === 'true'
            : null,
          file: document.querySelector('[data-control="dialog.avatarBuilder.file"]') !== null,
        };
      });
      await closeBuilder();
      const variantBefore = await ownVariant();
      const picture = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 16;
        c.height = 16;
        const g = c.getContext('2d');
        g.fillStyle = '#4060c0';
        g.fillRect(0, 0, 16, 16);
        return c.toDataURL('image/webp');
      });
      const input = { variant: 'picture', picture };
      const windowApi = await t
        .invoke('account.setAvatar', input, 15_000)
        .then((answer) => ({ refused: false, text: JSON.stringify(answer).slice(0, 120) }))
        .catch((error) => ({
          refused: true,
          text: (error instanceof Error ? error.message : String(error)).split('\n')[0],
        }));
      const http = await t.httpAction('account.setAvatar', input);
      const httpText =
        http.noBearer === true
          ? null
          : (
              http.body?.error?.message ??
              http.body?.message ??
              http.body?.text ??
              JSON.stringify(http.body ?? '')
            ).slice(0, 160);
      const httpRefused =
        http.noBearer === true
          ? null
          : http.status >= 400 && /Sign in to upload a picture/.test(httpText ?? '');
      const variantAfter = await ownVariant();
      await t.advancedBack('the anonymous picture row');
      const sentenceOk =
        tab.sentence === 'Sign in to upload a picture' && tab.applyDisabled === true && !tab.file;
      return {
        ok:
          sentenceOk &&
          windowApi.refused &&
          httpRefused !== false &&
          variantAfter === variantBefore,
        observed: `Picture tab via ${route}: sentence "${tab.sentence ?? 'none'}", Apply disabled ${tab.applyDisabled}, file input ${tab.file}; window API ${windowApi.refused ? 'refused' : 'answered'}: "${windowApi.text}"; agent surface ${http.noBearer === true ? 'not driven (no bearer for this base)' : `${http.status}: "${httpText}"`}; own chip variant ${variantBefore ?? 'none'} -> ${variantAfter ?? 'none'}`,
      };
    },
  );
  await t.advancedBack('the people rows');
}
