#!/usr/bin/env python3
"""Cut the site's faces from Katagami Sans and Katagami Mono (Kevin, 2026-10-30: "use katagami
instead of inter and our mono" on the site; the web-font-optimization brief of the same day).

Run by hand, never by the build. The output is committed:

  apps/studio/src/components/site/fonts/katagami-{sans,mono}-{core,ext}.woff2
  apps/studio/src/components/site/fonts/katagami.json   the record: sources, bytes, glyphs, ranges
  apps/studio/src/components/site/site.css               the faces between the katagami markers

Each face is cut to what the site draws:

  characters  every character in the site's and the docs' sources and content (the files listed
              in CONTENT below), plus Latin-1 Supplement, Latin Extended-A and the general
              punctuation block, so new copy rarely needs a rerun
  weights     the wght axis kept whole, 100 to 900; limiting it to the 400 and 500 the stylesheets
              set saves 14.5 KB on the two core files but rounds the outlines at 500 again, which
              moves the antialiased edges of every heading (the pixel diff of 2026-10-30), so it
              waits for Kevin's approval (the brief: any visual change is a regression)
  features    the shaper's defaults (calt, ccmp, locl, kern, mark, mkmk) and the three the
              stylesheets ask for (case, tnum, zero); every stylistic set, character variant and
              the rest are dropped, which the brand lint forbids outside the slides anyway
  hinting     dropped

and split in two: a core file with ASCII, the no-break space and the punctuation most pages draw
(quotes, dashes, the ellipsis, the middle dot, the multiplication sign, the arrows), which the
site routes preload (routes/__root.tsx), and an extended file behind its unicode-range that a page
downloads only when it draws one of its characters. Each unicode-range is read from the cut font's
cmap. The metric matched fallback faces (Katagami Sans Fallback over Arial, Katagami Mono
Fallback over Menlo) come first in the block, so no fallback rule sits between a face's two files.

Rerun it when the copy gains a character outside the kept blocks, when a stylesheet sets a new
weight or turns on a new OpenType feature, or when Katagami ships a new version. The sources are
the release files of https://katagami.kevinliu.studio/fonts/ (SIL OFL 1.1; the Reserved Font Name
"Source" covers the CJK members only, so the Latin cuts keep their names):

  curl -O https://katagami.kevinliu.studio/fonts/KatagamiSans.woff2
  curl -O https://katagami.kevinliu.studio/fonts/KatagamiMono.woff2
  .turboslide/venv/bin/python scripts/fonts/subset-katagami.py --src <folder with the two files>

`--check` cuts again in memory and exits 1 when a committed file or the block differs.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'apps/studio/src/components/site/fonts'
CSS = ROOT / 'apps/studio/src/components/site/site.css'
START = '/* katagami:generated:start */'
END = '/* katagami:generated:end */'
SOURCE_URL = 'https://katagami.kevinliu.studio/fonts/'

FACES = {
    'sans': {'file': 'KatagamiSans.woff2', 'family': 'Katagami Sans'},
    'mono': {'file': 'KatagamiMono.woff2', 'family': 'Katagami Mono'},
}
WEIGHTS = (100, 900)
FEATURES = ['calt', 'ccmp', 'locl', 'kern', 'mark', 'mkmk', 'case', 'tnum', 'zero']

# where the site's characters come from: its components, its routes, the docs and their content
CONTENT = [
    'apps/studio/src/components/site',
    'apps/studio/src/components/docs',
    'apps/studio/src/docs',
    'apps/studio/content/docs',
    'scripts/site',
    'packages/agent/generated/manifest.json',
    'apps/studio/src/routes/home.tsx',
    'apps/studio/src/routes/docs.tsx',
    'apps/studio/src/routes/docs.$.tsx',
    'apps/studio/src/routes/about.tsx',
    'apps/studio/src/routes/features.tsx',
    'apps/studio/src/routes/faq.tsx',
    'packages/chrome/src/presence/agent-marks.tsx',
]
TEXT = re.compile(r'\.(tsx?|mdx?|json|css)$')

KEEP_BLOCKS = [(0x20, 0x7E), (0xA0, 0xFF), (0x100, 0x17F), (0x2000, 0x206F)]
CORE = set(range(0x20, 0x7F)) | {
    0xA0, 0xB7, 0xD7, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026,
    0x2190, 0x2191, 0x2192, 0x2193,
}

# English letter frequencies with the space, for the average advance (capsize's method)
FREQ = {
    ' ': 0.1874, 'e': 0.0957, 't': 0.0702, 'a': 0.0621, 'n': 0.0589, 'i': 0.0573, 'o': 0.0565,
    'r': 0.0533, 's': 0.0516, 'h': 0.0396, 'l': 0.0333, 'd': 0.0303, 'c': 0.0244, 'u': 0.0212,
    'm': 0.0189, 'f': 0.0170, 'p': 0.0168, 'g': 0.0152, 'w': 0.0136, 'y': 0.0127, 'b': 0.0118,
    'v': 0.0083, 'k': 0.0059, 'x': 0.0014, 'j': 0.0009, 'q': 0.0008, 'z': 0.0007,
}
FALLBACKS = {
    'sans': {
        'local': ['Arial', 'Helvetica Neue', 'Liberation Sans'],
        'file': '/System/Library/Fonts/Supplemental/Arial.ttf',
    },
    'mono': {'local': ['Menlo', 'Consolas', 'Liberation Mono'], 'file': '/System/Library/Fonts/Menlo.ttc'},
}


def site_characters() -> set[int]:
    chars: set[int] = set()
    for entry in CONTENT:
        path = ROOT / entry
        files = [path] if path.is_file() else sorted(p for p in path.rglob('*') if TEXT.search(p.name))
        for file in files:
            if '.test.' in file.name:
                continue
            chars.update(ord(c) for c in file.read_text(encoding='utf-8') if ord(c) >= 0x20)
    return chars


def cut(source: TTFont, unicodes: set[int]) -> TTFont:
    options = subset.Options()
    options.layout_features = FEATURES
    options.hinting = False
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.notdef_outline = True
    options.recalc_bounds = True
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(source)
    source.flavor = 'woff2'
    # head.modified stays the source's, so a rerun writes the same bytes
    source.recalcTimestamp = False
    return source


def to_bytes(font: TTFont) -> bytes:
    buffer = io.BytesIO()
    font.save(buffer, reorderTables=False)
    return buffer.getvalue()


def ranges(codepoints: list[int]) -> str:
    out: list[str] = []
    start = prev = None
    for cp in sorted(codepoints):
        if start is None:
            start = prev = cp
        elif cp == prev + 1:
            prev = cp
        else:
            out.append(span(start, prev))
            start = prev = cp
    if start is not None:
        out.append(span(start, prev))
    return ', '.join(out)


def span(a: int, b: int) -> str:
    return f'U+{a:04X}' if a == b else f'U+{a:04X}-{b:04X}'


def average_advance(font: TTFont) -> float:
    cmap = font.getBestCmap()
    hmtx = font['hmtx']
    total = sum(f * hmtx[cmap[ord(c)]][0] for c, f in FREQ.items())
    return total / sum(FREQ.values()) / font['head'].unitsPerEm


def fallback_face(key: str, face: TTFont) -> str:
    spec = FALLBACKS[key]
    path = spec['file']
    other = TTFont(path, fontNumber=0) if path.endswith('.ttc') else TTFont(path)
    adjust = average_advance(face) / average_advance(other)
    upm = face['head'].unitsPerEm
    os2 = face['OS/2']
    ascent = os2.sTypoAscender / upm / adjust
    descent = -os2.sTypoDescender / upm / adjust
    gap = os2.sTypoLineGap / upm / adjust
    sources = ', '.join(f"local('{name}')" for name in spec['local'])
    family = FACES[key]['family']
    return (
        '@font-face {\n'
        f"  font-family: '{family} Fallback';\n"
        f'  src: {sources};\n'
        f'  size-adjust: {pct(adjust)};\n'
        f'  ascent-override: {pct(ascent)};\n'
        f'  descent-override: {pct(descent)};\n'
        f'  line-gap-override: {pct(gap)};\n'
        '}\n'
    )


def pct(value: float) -> str:
    """A percentage as prettier writes it: two decimals, no trailing zeros."""
    return f'{value * 100:.2f}'.rstrip('0').rstrip('.') + '%'


def wrap_range(unicode_range: str) -> str:
    """The descriptor as prettier writes it: one line when it fits 100 columns, else broken
    after a comma at 100 columns under a four space indent."""
    one = f'  unicode-range: {unicode_range};'
    if len(one) <= 100:
        return one + '\n'
    lines: list[str] = []
    line = ''
    for item in unicode_range.split(', '):
        piece = f'{item},'
        if line and len('    ' + line + ' ' + piece) > 100:
            lines.append('    ' + line)
            line = piece
        else:
            line = piece if not line else f'{line} {piece}'
    lines.append('    ' + line[:-1] + ';')
    return '  unicode-range:\n' + '\n'.join(lines) + '\n'


def face_rule(family: str, file: str, unicode_range: str) -> str:
    return (
        '@font-face {\n'
        f"  font-family: '{family}';\n"
        '  font-style: normal;\n'
        f'  font-weight: {WEIGHTS[0]} {WEIGHTS[1]};\n'
        '  font-display: swap;\n'
        f"  src: url('./fonts/{file}') format('woff2');\n"
        + wrap_range(unicode_range)
        + '}\n'
    )


def build(src: Path) -> tuple[dict[str, bytes], str, dict]:
    wanted = site_characters()
    for a, b in KEEP_BLOCKS:
        wanted.update(range(a, b + 1))
    files: dict[str, bytes] = {}
    rules: list[str] = []
    record: dict = {'source': SOURCE_URL, 'weights': list(WEIGHTS), 'features': FEATURES, 'faces': {}}
    fallbacks: list[str] = []
    for key, spec in FACES.items():
        raw = (src / spec['file']).read_bytes()
        source = TTFont(io.BytesIO(raw))
        covered = set(source.getBestCmap())
        core = sorted(CORE & covered)
        ext = sorted((wanted - CORE) & covered)
        fallbacks.append(fallback_face(key, source))
        face_record = {
            'source': spec['file'],
            'sourceBytes': len(raw),
            'sourceSha256': hashlib.sha256(raw).hexdigest(),
            'sourceGlyphs': len(source.getGlyphOrder()),
            'missing': [f'U+{cp:04X}' for cp in sorted(wanted - covered) if cp > 0x7E][:50],
            'files': {},
        }
        for part, codepoints in (('ext', ext), ('core', core)):
            font = cut(TTFont(io.BytesIO(raw), recalcTimestamp=False), set(codepoints))
            data = to_bytes(font)
            name = f'katagami-{key}-{part}.woff2'
            files[name] = data
            drawn = sorted(set(TTFont(io.BytesIO(data)).getBestCmap()) & set(codepoints))
            unicode_range = ranges(drawn)
            rules.append(face_rule(spec['family'], name, unicode_range))
            face_record['files'][name] = {
                'bytes': len(data),
                'sha256': hashlib.sha256(data).hexdigest(),
                'glyphs': len(TTFont(io.BytesIO(data)).getGlyphOrder()),
                'unicodeRange': unicode_range,
            }
        record['faces'][key] = face_record
    block = (
        f'{START}\n'
        '/* written by scripts/fonts/subset-katagami.py; the fallbacks first, then each face with\n'
        '   its extended file before its core file */\n'
        + '\n'.join(fallbacks + rules)
        + f'{END}'
    )
    return files, block, record


def splice(css: str, block: str) -> str:
    if START in css and END in css:
        return css[: css.index(START)] + block + css[css.index(END) + len(END) :]
    anchor = '/* ---- the root and its tokens ---- */'
    return css.replace(anchor, f'{block}\n\n{anchor}', 1)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--src', type=Path, required=True)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    files, block, record = build(args.src)
    record_text = json.dumps(record, indent=2) + '\n'
    css = CSS.read_text(encoding='utf-8')
    next_css = splice(css, block)
    if args.check:
        stale = [n for n, d in files.items() if not (OUT / n).exists() or (OUT / n).read_bytes() != d]
        if (OUT / 'katagami.json').read_text(encoding='utf-8') != record_text:
            stale.append('katagami.json')
        if next_css != css:
            stale.append('site.css')
        for name in stale:
            print(f'stale: {name}', file=sys.stderr)
        return 1 if stale else 0
    OUT.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (OUT / name).write_bytes(data)
    (OUT / 'katagami.json').write_text(record_text, encoding='utf-8')
    CSS.write_text(next_css, encoding='utf-8')
    for key, face in record['faces'].items():
        print(f"{key}: {face['sourceBytes']} bytes, {face['sourceGlyphs']} glyphs")
        for name, info in face['files'].items():
            print(f"  {name}: {info['bytes']} bytes, {info['glyphs']} glyphs")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
