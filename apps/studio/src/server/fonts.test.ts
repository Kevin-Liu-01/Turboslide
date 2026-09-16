import { describe, expect, it } from 'vitest';

import { catalogFont } from '@turboslide/fonts/catalog';
import { FONT_PATH_VERSION, fontFilePath } from '@turboslide/fonts/names';

import { serveFonts } from './fonts';

// GET /fonts/* (gslides-parity SPEC-5-amendments A5 items 3 and 4; B7): the stylesheet of a set
// of families with one @font-face group each and the custom property rule, immutable under the
// catalog's version and short lived under the `current` alias; one woff2 file of the catalog,
// immutable; anything else 404.

describe('serveFonts', () => {
  it('writes the stylesheet of the named families with versioned, immutable file URLs', async () => {
    const response = serveFonts(`faces/${FONT_PATH_VERSION}/roboto+eb-garamond.css`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/css; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    const css = await response.text();
    const roboto = catalogFont('roboto');
    expect(css.match(/@font-face/g)).toHaveLength(
      roboto.files.length + catalogFont('eb-garamond').files.length,
    );
    expect(css).toContain(`url('${fontFilePath('roboto', roboto.files[0]!.file)}')`);
    expect(css).toContain('--ts-font-roboto:');
    expect(css).toContain('--ts-font-eb-garamond:');
    expect(css).toContain('font-display: swap;');
  });

  it('answers the current alias with a short life and the same body', async () => {
    const current = serveFonts('faces/current/lora.css');
    expect(current.status).toBe(200);
    expect(current.headers.get('cache-control')).toBe(
      'public, max-age=300, stale-while-revalidate=86400',
    );
    const versioned = serveFonts(`faces/${FONT_PATH_VERSION}/lora.css`);
    expect(await current.text()).toBe(await versioned.text());
    const other = serveFonts('faces/000000000000/lora.css');
    expect(other.status).toBe(200);
    expect(other.headers.get('cache-control')).toBe('public, max-age=60');
  });

  it('serves one catalog file as woff2 and refuses anything the catalog does not name', async () => {
    const file = catalogFont('space-grotesk').files[0]!;
    const response = serveFonts(`${FONT_PATH_VERSION}/space-grotesk/${file.file}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('font/woff2');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(Number(response.headers.get('content-length'))).toBe(file.bytes);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.byteLength).toBe(file.bytes);
    // woff2 starts with 'wOF2'
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('wOF2');
    for (const splat of [
      `${FONT_PATH_VERSION}/space-grotesk/nope.woff2`,
      `${FONT_PATH_VERSION}/not-a-face/x.woff2`,
      'faces/current/not-a-face.css',
      'faces/current/.css',
      '../package.json',
      '',
    ])
      expect(serveFonts(splat).status, splat).toBe(404);
  });
});
