import { readFileSync } from 'node:fs';
import { ICON_NAMES, iconSymbolId } from '@turboslide/schema/icons';
import { describe, expect, it } from 'vitest';
import { appendSymbol, symbolFromHeroicon } from '../scripts/add-icon.ts';
import { parseSprite, renderSpriteModule } from '../scripts/build-sprite.ts';
import {
  GT_WORD_MARKUP,
  SPRITE,
  SPRITE_NAMES,
  iconMarkup,
  markMarkup,
  spriteMarkup,
  symbolMarkup,
} from './sprite.ts';

const spriteSvg = readFileSync(new URL('../assets/sprite.svg', import.meta.url), 'utf8');
const spriteIds = JSON.parse(
  readFileSync(new URL('../assets/sprite-ids.json', import.meta.url), 'utf8'),
) as string[];

describe('the sprite', () => {
  it('has 67 Heroicons plus gt-mark, in the order of the schema’s icon list', () => {
    const symbols = parseSprite(spriteSvg);
    expect(symbols).toHaveLength(68);
    expect(symbols.map((symbol) => symbol.id)).toEqual(spriteIds);
    expect(symbols.map((symbol) => symbol.id)).toEqual(ICON_NAMES.map(iconSymbolId));
    expect(symbols.filter((symbol) => symbol.viewBox === '0 0 20 20')).toHaveLength(67);
    expect(symbols.find((symbol) => symbol.id === 'gt-mark')?.viewBox).toBe('-8 214 1213 771');
  });

  it('is what src/sprite.ts was generated from', () => {
    const generated = renderSpriteModule(parseSprite(spriteSvg));
    const committed = readFileSync(new URL('./sprite.ts', import.meta.url), 'utf8');
    expect(committed).toBe(generated);
    expect(SPRITE_NAMES).toEqual(ICON_NAMES);
    for (const name of ICON_NAMES) expect(SPRITE[name].id).toBe(iconSymbolId(name));
  });

  it('writes the deck’s icon, mark and GT word markup', () => {
    expect(iconMarkup('check-circle', { color: 'ok' })).toBe(
      '<svg class="ic ok" aria-hidden="true"><use href="#i-check-circle"/></svg>',
    );
    expect(iconMarkup('arrow-top-right-on-square', { ext: true })).toBe(
      '<svg class="ic ext" aria-hidden="true"><use href="#i-arrow-top-right-on-square"/></svg>',
    );
    expect(markMarkup(132, 84)).toBe(
      '<svg width="132" height="84" fill="currentColor" aria-hidden="true"><use href="#gt-mark"/></svg>',
    );
    expect(GT_WORD_MARKUP).toBe(
      '<span class="gt-word"><svg aria-hidden="true"><use href="#gt-mark"/></svg><span class="sr">GT</span></span>',
    );
    expect(
      symbolMarkup('gt-mark').startsWith('<symbol id="gt-mark" viewBox="-8 214 1213 771">'),
    ).toBe(true);
    const markup = spriteMarkup(['check-circle', 'gt-mark']);
    expect(markup.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"')).toBe(
      true,
    );
    expect(markup.match(/<symbol /g)).toHaveLength(2);
    expect(spriteMarkup().match(/<symbol /g)).toHaveLength(68);
  });

  it('turns a Heroicon file into a symbol and appends it before the closing tag', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" data-slot="icon"><path d="M1 1h2"/></svg>';
    const symbol = symbolFromHeroicon('lock-closed', svg);
    expect(symbol).toBe(
      '<symbol id="i-lock-closed" viewBox="0 0 20 20"><path d="M1 1h2"/></symbol>',
    );
    const appended = appendSymbol(
      '<svg>' + '<symbol id="a" viewBox="0 0 1 1"></symbol>' + '</svg>',
      symbol,
    );
    expect(appended.endsWith(`${symbol}</svg>`)).toBe(true);
  });
});
