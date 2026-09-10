// Icon rules (SPEC 7.7; DECK-GRAMMAR.md:40): an icon sits in a rows key, at a plain row start, in
// a board state or in a diagram, at 20 or 24 px, and its name is in the sprite. The declared
// blocks satisfy the placement by construction, so the placement rule reads escape markup; the
// name rule reads every Icon and every <use href="#i-…"> in escape markup.
import type { Finding, Icon } from '../contracts.ts';
import { ICON_NAMES } from '../contracts.ts';
import type { LintContext } from '../context.ts';

/** The sprite's symbols plus gt-mark, from the schema (packages/theme/assets/sprite-ids.json mirrors it). */
export const DEFAULT_ICON_NAMES: readonly string[] = ICON_NAMES;

export function checkIcons(ctx: LintContext): Finding[] {
  const out: Finding[] = [];
  const known = new Set(ctx.options.iconNames ?? DEFAULT_ICON_NAMES);
  for (const slide of ctx.slideList()) {
    for (const ref of ctx.blocksOf(slide)) {
      const { block } = ref;
      const icons: { path: string; icon: Icon }[] = [];
      switch (block.type) {
        case 'rows':
          block.items.forEach(
            (item, i) =>
              item.icon && icons.push({ path: `${ref.path}/items/${i}/icon`, icon: item.icon }),
          );
          break;
        case 'plain':
          block.items.forEach(
            (item, i) =>
              item.icon && icons.push({ path: `${ref.path}/items/${i}/icon`, icon: item.icon }),
          );
          break;
        case 'board':
          block.rows.forEach((row, i) =>
            icons.push({ path: `${ref.path}/rows/${i}/state`, icon: row.state }),
          );
          break;
        case 'dia':
          // declared diagram icons are 20 or 24 px by schema; only their names are checked here
          block.data?.icons.forEach((icon, i) =>
            icons.push({
              path: `${ref.path}/data/icons/${i}`,
              icon: { name: icon.name, color: icon.color },
            }),
          );
          break;
        default:
          break;
      }
      for (const { path, icon } of icons) {
        if (!known.has(icon.name)) {
          out.push(
            ctx.finding('icon/known', slide.id, {
              blockId: block.id,
              path: `${path}/name`,
              text: icon.name,
              proposal: `"${icon.name}" is not in the sprite; pick a sprite icon or add the Heroicon with the theme's add-icon script (report 03 section 11 item 12).`,
            }),
          );
        }
      }
      if (block.type === 'html' || (block.type === 'dia' && block.svg)) {
        const source = block.type === 'html' ? block.html : (block.svg ?? '');
        const path = block.type === 'html' ? `${ref.path}/html` : `${ref.path}/svg`;
        const unknownNames = [
          ...new Set(
            [...source.matchAll(/href="#(i-[a-z0-9-]+|gt-mark)"/g)]
              .map((m) => (m[1] ?? '').replace(/^i-/, ''))
              .filter((name) => !known.has(name)),
          ),
        ];
        if (unknownNames.length > 0) {
          out.push(
            ctx.finding('icon/known', slide.id, {
              blockId: block.id,
              path,
              text: unknownNames.join(', '),
              proposal: `${unknownNames.map((n) => `"${n}"`).join(', ')} not in the sprite (report 03 section 11 item 12).`,
            }),
          );
        }
        if (block.type === 'html') {
          const placement: string[] = [];
          // an icon inside a sentence: <p> or a heading directly wrapping an .ic svg
          for (const m of source.matchAll(
            /<(p|h1|h2|div class="big")[^>]*>[^<]*<svg[^>]*class="ic\b/gi,
          ))
            placement.push(`inside a sentence: ${m[0].slice(0, 60)}`);
          for (const m of source.matchAll(
            /<svg[^>]*class="ic[^"]*"[^>]*style="[^"]*(?:width|height)\s*:\s*(\d+)px/gi,
          )) {
            const size = Number(m[1]);
            if (size !== 20 && size !== 24 && size !== 16) placement.push(`size ${size} px`);
          }
          if (placement.length > 0) {
            out.push(
              ctx.finding('icon/placement', slide.id, {
                blockId: block.id,
                path,
                text: placement.join('; '),
                proposal:
                  'An icon sits in a key cell or at the start of a plain row at 20 or 24 px (16 for the external glyph), never inside a sentence (DECK-GRAMMAR.md:40).',
              }),
            );
          }
        }
      }
    }
  }
  return out;
}
