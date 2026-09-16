import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { Scene, SceneMedia } from '../scene/types.ts';
import { checkMedia } from '../check/media.ts';
import { cleanContentTypes } from './clean.ts';
import { MEDIA_REL_TYPES, extensionOf, mediaPictureXml, rewriteMedia } from './media.ts';
import { validatePackage } from './validate.ts';
import { listParts, openPackage, readPart, readPartBytes } from './zip.ts';

// The media rewrite of the post process (gslides-parity SPEC-5 0.20, 3.6, 3.9; R05 7.1, 7.2):
// the poster picture pptxgenjs placed by name becomes the media picture with the click action,
// the file element, the p14:media extension, the trim and the two relationships to one stored
// part named by its digest; a second slide reusing the file adds no part; the YouTube block takes
// the online form; `media: 'poster'` and the deck cap leave the poster alone with the reason;
// `cleanContentTypes` adds the Default rows and corrects audio/mp3; `checkMedia` counts the
// elements and refuses a shape without its blip.

const FIXTURES = join(import.meta.dirname, '..', '..', '..', '..', 'fixtures', 'media');

function pic(name: string, id: number): string {
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${name}" descr="Colour bars for one second"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="1043940" y="1676400"/><a:ext cx="4876800" cy="2743200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  );
}

function slideXml(...pics: string[]): string {
  return (
    '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="media"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    pics.join('') +
    '</p:spTree></p:cSld></p:sld>'
  );
}

async function samplePackage(slides: Record<number, string>): Promise<JSZip> {
  const zip = new JSZip();
  const overrides = Object.keys(slides)
    .map(
      (n) =>
        `<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    )
    .join('');
  zip.file(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="png" ContentType="image/png"/><Default Extension="mp3" ContentType="audio/mp3"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      overrides +
      '</Types>',
  );
  zip.file(
    '_rels/.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>',
  );
  zip.file('ppt/presentation.xml', '<p:presentation/>');
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Object.keys(
      slides,
    )
      .map(
        (n) =>
          `<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${n}.xml"/>`,
      )
      .join('')}</Relationships>`,
  );
  for (const [n, xml] of Object.entries(slides)) {
    zip.file(`ppt/slides/slide${n}.xml`, xml);
    zip.file(
      `ppt/slides/_rels/slide${n}.xml.rels`,
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>',
    );
  }
  zip.file('ppt/media/image1.png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  return openPackage(await zip.generateAsync({ type: 'uint8array' }));
}

function scene(slideId: string, n: number, media: SceneMedia[]): Scene {
  return {
    slideId,
    n,
    total: 2,
    theme: 'light',
    kind: 'content',
    sheet: [0, 0, 1600, 900],
    paper: '#fff',
    ink: '#000',
    frame: { rules: [], crosses: [], crossColor: '#000' },
    plates: [],
    chips: [],
    texts: [],
    rules: [],
    rects: [],
    rasters: [],
    blocks: [],
    fonts: [],
    warnings: [],
    media,
  } as unknown as Scene;
}

let dir: string;
let webm: string;
let mp3: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'turboslide-ooxml-media-'));
  webm = join(FIXTURES, 'bars-1s.webm');
  mp3 = join(FIXTURES, 'tone-1s.mp3');
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('mediaPictureXml', () => {
  test('adds the click action, the file element, the extension and the trim to a poster picture', () => {
    const out = mediaPictureXml(pic('ts:media#clip:1', 4), 'video', 'rId3', 'rId4', {
      st: 12000,
      end: 40000,
    });
    expect(out).toContain(
      '<p:cNvPr id="4" name="ts:media#clip:1" descr="Colour bars for one second"><a:hlinkClick r:id="" action="ppaction://media"/></p:cNvPr>',
    );
    expect(out).toContain(
      '<p:nvPr><a:videoFile r:link="rId3"/><p:extLst><p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}"><p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" r:embed="rId4"><p14:trim st="12000" end="40000"/></p14:media></p:ext></p:extLst></p:nvPr>',
    );
    // the poster blip stays
    expect(out).toContain('<a:blip r:embed="rId2"/>');
    // an audio with no trim writes no p14:trim; the online form writes no extension
    const audio = mediaPictureXml(pic('ts:media#tone:2', 5), 'audio', 'rId3', 'rId4', {
      st: 0,
      end: 0,
    });
    expect(audio).toContain('<a:audioFile r:link="rId3"/>');
    expect(audio).toContain(
      '<p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" r:embed="rId4"></p14:media>',
    );
    expect(audio).not.toContain('p14:trim');
    const online = mediaPictureXml(pic('ts:media#talk:3', 6), 'video', 'rId3', null, null);
    expect(online).toContain('<p:nvPr><a:videoFile r:link="rId3"/></p:nvPr>');
    expect(online).not.toContain('p14:media');
    expect(extensionOf('assets/x.0123abcd.M4V')).toBe('m4v');
    expect(extensionOf('noext')).toBe('bin');
  });
});

describe('rewriteMedia', () => {
  test('writes the media picture, one stored part per digest, the two relationships and the node data', async () => {
    const zip = await samplePackage({
      1: slideXml(pic('ts:media#clip:1', 4), pic('ts:media#tone:2', 5)),
      2: slideXml(pic('ts:again#clip:1', 4)),
    });
    const first = await rewriteMedia(
      await readPart(zip, 'ppt/slides/slide1.xml'),
      scene('media', 1, [
        {
          blockId: 'clip',
          kind: 'video',
          box: [137, 220, 640, 360],
          file: webm,
          mime: 'video/webm',
          bytes: 1856,
          durationMs: 1000,
          poster: 'clip:1',
          playback: { start: 'auto', startMs: 200, endMs: 800 },
        },
        {
          blockId: 'tone',
          kind: 'audio',
          box: [900, 220, 240, 240],
          file: mp3,
          mime: 'audio/mpeg',
          bytes: 4000,
          durationMs: 1000,
          poster: 'tone:2',
          playback: { start: 'click', volume: 50, loop: true },
        },
      ]),
      zip,
      { slidePart: 'ppt/slides/slide1.xml' },
    );
    expect(first.written).toBe(2);
    expect(first.posterOnly).toEqual([]);
    expect(first.parts).toHaveLength(2);
    expect(first.parts[0]).toMatch(/^ppt\/media\/media-[0-9a-f]{8}\.webm$/);
    expect(first.parts[1]).toMatch(/^ppt\/media\/media-[0-9a-f]{8}\.mp3$/);
    expect(first.nodes).toEqual([
      {
        blockId: 'clip',
        kind: 'video',
        shapeName: 'ts:media#clip:1',
        relationshipId: 'rId3',
        shapeId: 4,
        playback: { start: 'auto', startMs: 200, endMs: 800 },
        online: false,
      },
      {
        blockId: 'tone',
        kind: 'audio',
        shapeName: 'ts:media#tone:2',
        relationshipId: 'rId5',
        shapeId: 5,
        playback: { start: 'click', volume: 50, loop: true },
        online: false,
      },
    ]);
    expect(first.xml).toContain('<a:videoFile r:link="rId3"/>');
    expect(first.xml).toContain('r:embed="rId4"><p14:trim st="200" end="200"/>');
    expect(first.xml).toContain('<a:audioFile r:link="rId5"/>');
    expect(first.xml).toContain('r:embed="rId6"></p14:media>');
    const rels = await readPart(zip, 'ppt/slides/_rels/slide1.xml.rels');
    expect(rels).toContain(
      `<Relationship Id="rId3" Type="${MEDIA_REL_TYPES.video}" Target="../media/${first.parts[0]?.slice('ppt/media/'.length)}"/>`,
    );
    expect(rels).toContain(
      `<Relationship Id="rId4" Type="${MEDIA_REL_TYPES.media}" Target="../media/${first.parts[0]?.slice('ppt/media/'.length)}"/>`,
    );
    expect(rels).toContain(`<Relationship Id="rId5" Type="${MEDIA_REL_TYPES.audio}"`);
    expect((await readPartBytes(zip, first.parts[0] as string)).byteLength).toBe(
      statSync(webm).size,
    );
    // the second slide reuses the stored part and adds none
    const second = await rewriteMedia(
      await readPart(zip, 'ppt/slides/slide2.xml'),
      scene('again', 2, [
        {
          blockId: 'clip',
          kind: 'video',
          box: [137, 220, 640, 360],
          file: webm,
          mime: 'video/webm',
          bytes: 1856,
          durationMs: 1000,
          poster: 'clip:1',
          playback: { start: 'click' },
        },
      ]),
      zip,
      { slidePart: 'ppt/slides/slide2.xml' },
    );
    expect(second.written).toBe(1);
    expect(second.parts).toEqual([]);
    expect(second.xml).toContain('<a:videoFile r:link="rId3"/>');
    expect(second.xml).not.toContain('p14:trim');
    expect(listParts(zip).filter((part) => part.startsWith('ppt/media/media-'))).toHaveLength(2);
    // the content types gain the two Defaults and lose audio/mp3; the package validates
    const cleaned = await cleanContentTypes(zip);
    expect(cleaned.fixedTypes).toEqual(['audio/mp3']);
    expect(cleaned.addedDefaults).toEqual(['webm']);
    const types = await readPart(zip, '[Content_Types].xml');
    expect(types).toContain('<Default Extension="mp3" ContentType="audio/mpeg"/>');
    expect(types).toContain('<Default Extension="webm" ContentType="video/webm"/>');
    // the rewritten slide parts back into the package, then the check
    zip.file('ppt/slides/slide1.xml', first.xml);
    zip.file('ppt/slides/slide2.xml', second.xml);
    const validation = await validatePackage(zip);
    expect(validation.invalidRelationships).toEqual([]);
    expect(validation.undeclaredParts).toEqual([]);
    const check = await checkMedia(zip);
    expect(check.ok, check.lines.join('\n')).toBe(true);
    expect(check.counts).toMatchObject({
      audioFile: 1,
      videoFile: 2,
      p14Media: 3,
      trim: 1,
      online: 0,
      shapes: 3,
      parts: 2,
    });
    expect(check.lines[0]).toMatch(
      /^round five media: 1 a:audioFile, 2 a:videoFile, 3 p14:media, 1 p14:trim, 0 online; parts: 1 mp3 \(.* KiB\), 1 webm \(.* KiB\); content types: mp3, webm$/,
    );
  });

  test('writes the online form for YouTube and leaves the poster alone under media: poster, over the cap and for a missing record', async () => {
    const zip = await samplePackage({
      1: slideXml(pic('ts:media#talk:1', 4), pic('ts:media#clip:2', 5), pic('ts:media#gone:3', 6)),
    });
    const xml = await readPart(zip, 'ppt/slides/slide1.xml');
    const online = await rewriteMedia(
      xml,
      scene('media', 1, [
        {
          blockId: 'talk',
          kind: 'video',
          box: [0, 0, 960, 540],
          youtube: 'M7lc1UVf-VE',
          poster: 'talk:1',
          playback: { start: 'click' },
        },
        {
          blockId: 'clip',
          kind: 'video',
          box: [0, 0, 640, 360],
          file: webm,
          mime: 'video/webm',
          bytes: 1856,
          durationMs: 1000,
          poster: 'clip:2',
          playback: { start: 'click' },
        },
        {
          blockId: 'gone',
          kind: 'audio',
          box: [0, 0, 96, 96],
          poster: 'gone:3',
          playback: { start: 'click' },
        },
      ]),
      zip,
      { slidePart: 'ppt/slides/slide1.xml', media: 'poster' },
    );
    expect(online.written).toBe(1);
    expect(online.nodes).toEqual([
      {
        blockId: 'talk',
        kind: 'video',
        shapeName: 'ts:media#talk:1',
        relationshipId: 'rId3',
        shapeId: 4,
        playback: { start: 'click' },
        online: true,
      },
    ]);
    expect(online.posterOnly).toEqual([
      { blockId: 'clip', reason: "media: 'poster'" },
      { blockId: 'gone', reason: 'the media record is not in the deck' },
    ]);
    const rels = await readPart(zip, 'ppt/slides/_rels/slide1.xml.rels');
    expect(rels).toContain(
      `<Relationship Id="rId3" Type="${MEDIA_REL_TYPES.video}" Target="https://www.youtube.com/embed/M7lc1UVf-VE" TargetMode="External"/>`,
    );
    expect(online.xml).toContain(
      'name="ts:media#talk:1" descr="Colour bars for one second"><a:hlinkClick r:id="" action="ppaction://media"/>',
    );
    expect(online.xml).not.toContain('p14:media');
    expect(listParts(zip).some((part) => part.startsWith('ppt/media/media-'))).toBe(false);
    // the cap: the second file would pass it
    const capped = await samplePackage({
      1: slideXml(pic('ts:media#clip:1', 4), pic('ts:media#tone:2', 5)),
    });
    const over = await rewriteMedia(
      await readPart(capped, 'ppt/slides/slide1.xml'),
      scene('media', 1, [
        {
          blockId: 'clip',
          kind: 'video',
          box: [0, 0, 640, 360],
          file: webm,
          mime: 'video/webm',
          bytes: 1856,
          durationMs: 1000,
          poster: 'clip:1',
          playback: { start: 'click' },
        },
        {
          blockId: 'tone',
          kind: 'audio',
          box: [0, 0, 96, 96],
          file: mp3,
          mime: 'audio/mpeg',
          bytes: 4000,
          durationMs: 1000,
          poster: 'tone:2',
          playback: { start: 'click' },
        },
      ]),
      capped,
      { slidePart: 'ppt/slides/slide1.xml', capBytes: statSync(webm).size + 100 },
    );
    expect(over.written).toBe(1);
    expect(over.posterOnly).toEqual([
      { blockId: 'tone', reason: "over the deck's media cap (0 MB)" },
    ]);
    // a missing file on disk
    const missing = await rewriteMedia(
      xml,
      scene('media', 1, [
        {
          blockId: 'clip',
          kind: 'video',
          box: [0, 0, 640, 360],
          file: join(dir, 'nothing.webm'),
          mime: 'video/webm',
          bytes: 1,
          durationMs: 1000,
          poster: 'clip:2',
          playback: { start: 'click' },
        },
      ]),
      await samplePackage({ 1: xml }),
      { slidePart: 'ppt/slides/slide1.xml' },
    );
    expect(missing.posterOnly[0]?.reason).toMatch(/^the stored file is missing/);
    // a scene without media is the identity
    const idle = await rewriteMedia(xml, scene('media', 1, []), await samplePackage({ 1: xml }));
    expect(idle).toEqual({ xml, written: 0, posterOnly: [], nodes: [], parts: [] });
  });

  test('checkMedia refuses a media shape without its poster blip and an undeclared media part', async () => {
    const bare = pic('ts:media#clip:1', 4).replace('<a:blip r:embed="rId2"/>', '');
    const zip = await samplePackage({ 1: slideXml(bare) });
    const out = await rewriteMedia(
      await readPart(zip, 'ppt/slides/slide1.xml'),
      scene('media', 1, [
        {
          blockId: 'clip',
          kind: 'video',
          box: [0, 0, 640, 360],
          file: webm,
          mime: 'video/webm',
          bytes: 1856,
          durationMs: 1000,
          poster: 'clip:1',
          playback: { start: 'click' },
        },
      ]),
      zip,
      { slidePart: 'ppt/slides/slide1.xml' },
    );
    zip.file('ppt/slides/slide1.xml', out.xml);
    const check = await checkMedia(zip);
    expect(check.ok).toBe(false);
    expect(check.lines).toContain(
      'ppt/slides/slide1.xml: media shape "ts:media#clip:1" carries no poster blip',
    );
    expect(check.lines).toContain('[Content_Types].xml: no Default for .webm media parts');
    expect(check.lines).toContain(
      '[Content_Types].xml: audio/mp3 is not a registered type; audio/mpeg is',
    );
    // a scratch file the fixtures folder never holds
    writeFileSync(join(dir, 'scratch.txt'), 'x');
  });
});
