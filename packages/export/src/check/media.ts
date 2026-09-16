// The media section of `export check` (gslides-parity SPEC-5 3.6, 3.9, 16.7 step 33; R05 10 leg
// 1; MILESTONES-5 B2 day 5): over the slide parts, the `a:audioFile` and `a:videoFile` elements,
// the `p14:media` extensions, the poster blip every media shape must carry, and the media parts
// under `ppt/media/` by extension and bytes; over `[Content_Types].xml`, the `Default` for every
// media extension present and the absence of `audio/mp3`. The section is `ok` when every media
// shape has its blip and its relationship resolves, every media part has a content type and no
// `audio/mp3` remains; the lines are the round five line the CLI prints and the counts the
// verifier's table reads.
import type { ExportCheckSection } from '@turboslide/schema/export';

import { MEDIA_CONTENT_TYPES } from '../ooxml/clean.ts';
import { listShapes } from '../ooxml/groups.ts';
import { resolveTarget } from '../ooxml/validate.ts';
import { hasPart, listParts, readPart, readPartBytes, slideParts } from '../ooxml/zip.ts';
import type { Package } from '../ooxml/zip.ts';

const MEDIA_EXTENSIONS = new Set(Object.keys(MEDIA_CONTENT_TYPES));

function kb(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
    : `${(bytes / 1024).toFixed(1)} KiB`;
}

export async function checkMedia(zip: Package): Promise<ExportCheckSection> {
  const issues: string[] = [];
  let audioFiles = 0;
  let videoFiles = 0;
  let p14Media = 0;
  let online = 0;
  let shapes = 0;
  let trims = 0;
  for (const part of slideParts(zip)) {
    const xml = await readPart(zip, part);
    audioFiles += (xml.match(/<a:audioFile\b/g) ?? []).length;
    videoFiles += (xml.match(/<a:videoFile\b/g) ?? []).length;
    p14Media += (xml.match(/<p14:media\b/g) ?? []).length;
    trims += (xml.match(/<p14:trim\b/g) ?? []).length;
    const relsPart = part.replace(/^(.*\/)([^/]+)$/, '$1_rels/$2.rels');
    const rels = hasPart(zip, relsPart) ? await readPart(zip, relsPart) : '';
    const relOf = (id: string): { target: string; external: boolean } | null => {
      const match = new RegExp(`<Relationship\\b[^>]*\\sId="${id}"[^>]*/>`).exec(rels);
      if (match === null) return null;
      const target = /\sTarget="([^"]+)"/.exec(match[0])?.[1] ?? '';
      return { target, external: /TargetMode="External"/.test(match[0]) };
    };
    for (const shape of listShapes(xml)) {
      if (shape.kind !== 'pic') continue;
      const file = /<a:(audio|video)File\b[^>]*\sr:link="([^"]+)"/.exec(shape.xml);
      if (file === null) continue;
      shapes += 1;
      if (!/<a:blip\b[^>]*\sr:embed="/.test(shape.xml))
        issues.push(`${part}: media shape "${shape.name}" carries no poster blip`);
      const link = relOf(file[2] as string);
      if (link === null)
        issues.push(
          `${part}: media shape "${shape.name}" links ${file[2]} which the rels part lacks`,
        );
      else if (link.external) online += 1;
      else if (!hasPart(zip, resolveTarget(part, link.target)))
        issues.push(
          `${part}: media shape "${shape.name}" links ${link.target} which the package lacks`,
        );
      const embed = /<p14:media\b[^>]*\sr:embed="([^"]+)"/.exec(shape.xml);
      if (embed !== null) {
        const rel = relOf(embed[1] as string);
        if (rel === null || (!rel.external && !hasPart(zip, resolveTarget(part, rel.target))))
          issues.push(
            `${part}: media shape "${shape.name}" embeds ${embed[1]} which does not resolve`,
          );
      }
    }
  }
  const byExtension: Record<string, { count: number; bytes: number }> = {};
  for (const part of listParts(zip)) {
    const match = /^ppt\/media\/[^/]+\.([a-z0-9]+)$/i.exec(part);
    if (match === null) continue;
    const ext = (match[1] as string).toLowerCase();
    if (!MEDIA_EXTENSIONS.has(ext)) continue;
    const bytes = (await readPartBytes(zip, part)).byteLength;
    const row = (byExtension[ext] ??= { count: 0, bytes: 0 });
    row.count += 1;
    row.bytes += bytes;
  }
  const types = hasPart(zip, '[Content_Types].xml')
    ? await readPart(zip, '[Content_Types].xml')
    : '';
  const declared = new Set(
    [...types.matchAll(/<Default Extension="([^"]+)" ContentType="([^"]+)"/g)].map((match) =>
      (match[1] as string).toLowerCase(),
    ),
  );
  for (const ext of Object.keys(byExtension)) {
    if (!declared.has(ext)) issues.push(`[Content_Types].xml: no Default for .${ext} media parts`);
  }
  if (/ContentType="audio\/mp3"/.test(types))
    issues.push('[Content_Types].xml: audio/mp3 is not a registered type; audio/mpeg is');
  const parts = Object.entries(byExtension)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ext, row]) => `${row.count} ${ext} (${kb(row.bytes)})`)
    .join(', ');
  const declaredMedia = [...declared]
    .filter((ext) => MEDIA_EXTENSIONS.has(ext))
    .sort()
    .join(', ');
  const lines = [
    `round five media: ${audioFiles} a:audioFile, ${videoFiles} a:videoFile, ${p14Media} p14:media, ${trims} p14:trim, ${online} online; parts: ${parts === '' ? 'none' : parts}; content types: ${declaredMedia === '' ? 'none' : declaredMedia}`,
    ...issues,
  ];
  return {
    ok: issues.length === 0,
    lines,
    counts: {
      audioFile: audioFiles,
      videoFile: videoFiles,
      p14Media,
      trim: trims,
      online,
      shapes,
      parts: Object.values(byExtension).reduce((sum, row) => sum + row.count, 0),
      bytes: Object.values(byExtension).reduce((sum, row) => sum + row.bytes, 0),
    },
  };
}
