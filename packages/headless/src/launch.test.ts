import { describe, expect, test } from 'vitest';

import { fileUrl, sheetDocument } from './document.ts';
import {
  CHROMIUM_1217_PATH,
  LAUNCH_ARGS,
  defaultBackend,
  rendererString,
  resolveExecutable,
} from './launch.ts';
import { renderImageName, relativeImageRef } from './record.ts';
import { contactSheetDocument, sheetWidth } from './sheet.ts';

describe('launch configuration', () => {
  test("the flag sets are the specification's (SPEC 5.3)", () => {
    expect([...LAUNCH_ARGS['angle-metal']]).toEqual([
      '--use-gl=angle',
      '--use-angle=metal',
      '--ignore-gpu-blocklist',
    ]);
    expect([...LAUNCH_ARGS.swiftshader]).toEqual([
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ]);
  });

  test('the backend follows the platform unless forced', () => {
    expect(defaultBackend({}, 'darwin')).toBe('angle-metal');
    expect(defaultBackend({}, 'linux')).toBe('swiftshader');
    expect(defaultBackend({ TURBOSLIDE_GPU: 'swiftshader' }, 'darwin')).toBe('swiftshader');
  });

  test('TURBOSLIDE_CHROME wins over the chromium-1217 build and the playwright default', () => {
    expect(resolveExecutable({ TURBOSLIDE_CHROME: '/x/chrome' })).toEqual({
      path: '/x/chrome',
      source: 'env',
    });
    const resolved = resolveExecutable({});
    expect(['chromium-1217', 'playwright']).toContain(resolved.source);
    if (resolved.source === 'chromium-1217') expect(resolved.path).toBe(CHROMIUM_1217_PATH);
  });

  test('the renderer string names the product, the backend and the device', () => {
    expect(
      rendererString(
        '147.0.7727.15',
        'ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max, Unspecified Version)',
        'angle-metal',
      ),
    ).toBe('Chrome for Testing 147.0.7727.15, ANGLE Metal, Apple M5 Max');
    expect(
      rendererString(
        '147.0.7727.15',
        'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)), SwiftShader driver)',
        'swiftshader',
      ),
    ).toContain('SwiftShader');
    expect(rendererString('151.0.1', null, 'swiftshader')).toBe(
      'Chrome for Testing 151.0.1, SwiftShader, no WebGL',
    );
  });
});

describe('documents and names', () => {
  test('the sheet document stamps the theme on the root and inlines styles in order', () => {
    const html = sheetDocument({
      theme: 'dark',
      body: '<div class="ts-sheet" data-theme="dark"></div>',
      styles: ['a{}', 'b{}'],
      base: 'file:///deck/',
    });
    expect(html).toContain('<html lang="en" data-theme="dark">');
    expect(html.indexOf('a{}')).toBeLessThan(html.indexOf('b{}'));
    expect(html).toContain('<base href="file:///deck/">');
    expect(html).toContain('color-scheme: dark');
  });

  test('file URLs and image names', () => {
    expect(fileUrl('/tmp/x', true).endsWith('/')).toBe(true);
    expect(renderImageName(3, 'thesis', 'light')).toBe('03-thesis-light.png');
    expect(renderImageName(85, 'closing', 'dark', 2)).toBe('85-closing-dark@2x.png');
    expect(relativeImageRef('/out', '/out/01-a-light.png')).toBe('01-a-light.png');
    expect(relativeImageRef('/out', '/elsewhere/01-a-light.png')).toBe('/elsewhere/01-a-light.png');
  });

  test('the contact sheet groups cells under section labels with overlays', () => {
    const html = contactSheetDocument(
      [
        { slideId: 'opener-brand', n: 1, section: 'Brand', image: '/r/01.png' },
        { slideId: 'title', n: 2, section: 'Brand', image: '/r/02.png' },
        { slideId: 'opener-website', n: 3, section: 'Website', image: '/r/03.png' },
      ],
      {
        theme: 'light',
        cols: 4,
        thumb: 480,
        numbered: true,
        overlay: 'lint',
        findings: [
          { slideId: 'title', rule: 'sheet/overflow', severity: 3, box: [1500, 800, 200, 120] },
        ],
      },
    );
    expect(html.match(/class="label"/g)?.length).toBe(2);
    expect(html.match(/class="cell"/g)?.length).toBe(3);
    expect(html).toContain('class="ov s3"');
    expect(html).toContain('sheet/overflow');
    expect(sheetWidth(4, 480)).toBe(32 * 2 + 4 * 480 + 3 * 24);
  });
});
