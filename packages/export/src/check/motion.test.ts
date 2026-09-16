import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';

import { checkMotion } from './motion.ts';

// The motion section of export check (gslides-parity SPEC-5 2.6, 16.7 step 33): the round five
// line over a package and the failures it names.
const SLIDE_OK =
  '<p:sld xmlns:a="a" xmlns:p="p" xmlns:mc="mc" xmlns:p14="p14"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/></p:nvGrpSpPr>' +
  '<p:sp><p:nvSpPr><p:cNvPr id="2" name="ts:s#a/text"/></p:nvSpPr><p:txBody/></p:sp></p:spTree></p:cSld><p:clrMapOvr/>' +
  '<mc:AlternateContent xmlns:mc="mc"><mc:Choice xmlns:p14="p14" Requires="p14"><p:transition spd="med" p14:dur="700"><p14:flip dir="l"/></p:transition></mc:Choice><mc:Fallback><p:transition spd="med"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>' +
  '<p:timing><p:tnLst><p:par><p:cTn id="1" nodeType="tmRoot"><p:childTnLst><p:seq><p:cTn id="2" nodeType="mainSeq"><p:childTnLst><p:par><p:cTn id="3"><p:childTnLst><p:par><p:cTn id="4"><p:childTnLst>' +
  '<p:par><p:cTn id="5" presetID="10" presetClass="entr" presetSubtype="0" nodeType="clickEffect"><p:childTnLst><p:set><p:cBhvr><p:cTn id="6"/><p:tgtEl><p:spTgt spid="2"/></p:tgtEl></p:cBhvr></p:set></p:childTnLst></p:cTn></p:par>' +
  '</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst><p:bldLst><p:bldP spid="2" grpId="0" build="p"/></p:bldLst></p:timing></p:sld>';

const SLIDE_BAD = SLIDE_OK.replace('id="6"', 'id="5"')
  .replace('spid="2"/></p:tgtEl>', 'spid="9"/></p:tgtEl>')
  .replace(
    'presetID="10" presetClass="entr" presetSubtype="0"',
    'presetID="99" presetClass="path" presetSubtype="0"',
  )
  .replace(
    '<mc:Fallback><p:transition spd="med"><p:fade/>',
    '<mc:Fallback><p:transition spd="med"><p:push dir="l"/>',
  );

async function packageOf(parts: Record<string, string>): Promise<JSZip> {
  const zip = new JSZip();
  for (const [path, xml] of Object.entries(parts)) zip.file(path, xml);
  return zip;
}

describe('checkMotion', () => {
  test('counts the transitions, the effect nodes, the builds and the media over the slide parts', async () => {
    const zip = await packageOf({
      'ppt/slides/slide1.xml': SLIDE_OK,
      'ppt/slides/slide2.xml': '<p:sld xmlns:p="p"><p:cSld/></p:sld>',
    });
    const section = await checkMotion(zip);
    expect(section.ok).toBe(true);
    expect(section.counts).toEqual({
      transitions: 1,
      effects: 1,
      bldP: 1,
      bldParagraph: 1,
      audio: 0,
      video: 0,
      p14: 1,
    });
    expect(section.lines).toHaveLength(1);
    expect(section.lines[0]).toContain(
      'round five: 1 transition(s) on 2 slide(s) (p14:flip 1; durations 700 ms)',
    );
    expect(section.lines[0]).toContain('1 effect node(s) (clickEffect 1, mainSeq 1, tmRoot 1)');
    expect(section.lines[0]).toContain('1 bldP with 1 build="p"');
    expect(section.lines[0]).toContain('mc:AlternateContent by Requires: p14 1');
  });

  test('fails on a repeated id, a dangling target, an unknown preset and a p14 kind without the fade fallback', async () => {
    const zip = await packageOf({ 'ppt/slides/slide1.xml': SLIDE_BAD });
    const section = await checkMotion(zip);
    expect(section.ok).toBe(false);
    expect(section.lines.slice(1)).toEqual([
      'ppt/slides/slide1.xml: repeated p:cTn id(s) 5',
      'ppt/slides/slide1.xml: p:spTgt names no shape: 9',
      'ppt/slides/slide1.xml: preset(s) outside the fifteen of SPEC-5 0.13: path/99/0',
      'ppt/slides/slide1.xml: a p14 transition without the p:fade Fallback',
    ]);
  });

  test('a still deck reads none', async () => {
    const zip = await packageOf({
      'ppt/slides/slide1.xml': '<p:sld xmlns:p="p"><p:cSld/></p:sld>',
    });
    const section = await checkMotion(zip);
    expect(section.ok).toBe(true);
    expect(section.lines[0]).toBe(
      'round five: 0 transition(s) on 1 slide(s); 0 effect node(s) (none); 0 bldP with 0 build="p"; 0 p:audio and 0 p:video node(s); mc:AlternateContent by Requires: none',
    );
  });
});
