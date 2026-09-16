import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';

import { MEDIA_CONTENT_TYPES, cleanContentTypes } from './clean.ts';
import { openPackage, readPart } from './zip.ts';

// The media rows of the content type clean (gslides-parity SPEC-5 0.20, 3.6; R05 7.1): the
// registered type per extension, `audio/mp3` corrected to `audio/mpeg`, and a `Default` added for
// every media extension a part carries and the file does not declare, never twice.

async function packageWith(types: string, parts: string[]): Promise<JSZip> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${types}</Types>`,
  );
  for (const part of parts) zip.file(part, new Uint8Array([1, 2, 3]));
  return openPackage(await zip.generateAsync({ type: 'uint8array' }));
}

describe('cleanContentTypes and the media rows', () => {
  test('names the five registered types and never audio/mp3', () => {
    expect(MEDIA_CONTENT_TYPES).toEqual({
      mp4: 'video/mp4',
      m4v: 'video/mp4',
      webm: 'video/webm',
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      wav: 'audio/wav',
    });
    expect(Object.values(MEDIA_CONTENT_TYPES)).not.toContain('audio/mp3');
  });

  test('corrects audio/mp3 and adds a Default per media extension present, once', async () => {
    const zip = await packageWith(
      '<Default Extension="xml" ContentType="application/xml"/><Default Extension="mp3" ContentType="audio/mp3"/><Default Extension="mp4" ContentType="video/mp4"/>',
      [
        'ppt/media/media-0123abcd.webm',
        'ppt/media/media-0123abce.wav',
        'ppt/media/media-0123abcf.mp4',
        'ppt/media/image1.png',
        'ppt/slides/slide1.xml',
      ],
    );
    const first = await cleanContentTypes(zip);
    expect(first.fixedTypes).toEqual(['audio/mp3']);
    expect(first.addedDefaults).toEqual(['wav', 'webm']);
    const xml = await readPart(zip, '[Content_Types].xml');
    expect(xml).toContain('<Default Extension="mp3" ContentType="audio/mpeg"/>');
    expect(xml).toContain(
      '<Default Extension="wav" ContentType="audio/wav"/></Types>'.replace('</Types>', ''),
    );
    expect(xml).toContain('<Default Extension="webm" ContentType="video/webm"/>');
    expect(xml.match(/Extension="mp4"/g)).toHaveLength(1);
    // the png is not a media part and gets nothing here; a second pass adds nothing
    expect(xml).not.toContain('Extension="png"');
    const second = await cleanContentTypes(zip);
    expect(second.addedDefaults).toEqual([]);
    expect(second.fixedTypes).toEqual([]);
    // a package without the part is left alone
    const bare = new JSZip();
    bare.file('x.txt', 'x');
    expect(
      await cleanContentTypes(await openPackage(await bare.generateAsync({ type: 'uint8array' }))),
    ).toEqual({
      removedOverrides: [],
      fixedTypes: [],
      addedDefaults: [],
    });
  });
});
