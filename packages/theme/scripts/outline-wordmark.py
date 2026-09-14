# The wordmark's outlines (gslides-parity SPEC-4 1.2; research-4 report 01 section 6.2): the word
# "Turboslide" taken from the repository's InterVariable.woff2 at weight 500 and optical size 32
# by fontTools, with Inter's own GPOS pair kerning applied (T to u is minus 197 units), as SVG
# path data in font units with the baseline at y 0 and y pointing down. No layout feature is
# applied: the word has no a and no digit, so cv11 and ss01 change nothing. The output is one
# JSON document on stdout that scripts/build-brand.ts turns into wordmark-outlines.svg for the
# README, npm and the card, where no font can be assumed. Runs under the fonts venv the check
# chain already has (.turboslide/venv, scripts/requirements.txt); moved from
# docs/gslides-parity/design-4/shader/tools/outline-wordmark.py with the coordinates rounded to
# one decimal so the bytes do not depend on the pen's number formatting.
#
#   .turboslide/venv/bin/python packages/theme/scripts/outline-wordmark.py \
#     --font packages/fonts/assets/InterVariable.woff2 --word Turboslide --wght 500 --opsz 32 --track -0.025
import argparse
import json
import re
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer


def kern_pairs(font):
    """Pair kerning from the GPOS PairPos lookups the kern feature names (formats 1 and 2); the
    first adjustment found for a pair wins."""
    out = {}
    gpos = font['GPOS'].table
    kern_lookups = set()
    for feat in gpos.FeatureList.FeatureRecord:
        if feat.FeatureTag == 'kern':
            kern_lookups.update(feat.Feature.LookupListIndex)
    order = font.getGlyphOrder()

    def visit(sub):
        if sub.LookupType == 9:
            return visit(sub.ExtSubTable)
        if sub.LookupType != 2:
            return
        cov = sub.Coverage.glyphs
        if sub.Format == 1:
            for g1, ps in zip(cov, sub.PairSet):
                for pv in ps.PairValueRecord:
                    v = pv.Value1.XAdvance if pv.Value1 and hasattr(pv.Value1, 'XAdvance') else 0
                    out.setdefault((g1, pv.SecondGlyph), v)
        elif sub.Format == 2:
            c1 = sub.ClassDef1.classDefs
            c2 = sub.ClassDef2.classDefs
            for g1 in cov:
                k1 = c1.get(g1, 0)
                for g2 in order:
                    k2 = c2.get(g2, 0)
                    rec = sub.Class1Record[k1].Class2Record[k2]
                    v = rec.Value1.XAdvance if rec.Value1 and hasattr(rec.Value1, 'XAdvance') else 0
                    if v:
                        out.setdefault((g1, g2), v)

    for i in sorted(kern_lookups):
        for sub in gpos.LookupList.Lookup[i].SubTable:
            visit(sub)
    return out


NUMBER = re.compile(r'-?\d+(?:\.\d+)?')


def rounded(path):
    """Every coordinate to one decimal, without a trailing .0, so the file is stable across pens."""

    def one(match):
        value = round(float(match.group(0)), 1)
        text = f'{value:.1f}'
        return text[:-2] if text.endswith('.0') else text

    return NUMBER.sub(one, path)


def main():
    parser = argparse.ArgumentParser(description='Outline a word from a variable font as SVG path data.')
    parser.add_argument('--font', required=True)
    parser.add_argument('--word', default='Turboslide')
    parser.add_argument('--wght', type=float, default=500.0)
    parser.add_argument('--opsz', type=float, default=32.0)
    parser.add_argument('--track', type=float, default=0.0, help='letter spacing in em (-0.025 is the wordmark at 28 px and above)')
    args = parser.parse_args()

    font = TTFont(args.font)
    font = instancer.instantiateVariableFont(font, {'wght': args.wght, 'opsz': args.opsz}, inplace=False)
    upm = font['head'].unitsPerEm
    track_units = args.track * upm
    cmap = font.getBestCmap()
    glyph_names = [cmap[ord(ch)] for ch in args.word]
    hmtx = font['hmtx']
    glyph_set = font.getGlyphSet()
    kerns = kern_pairs(font)

    x = 0.0
    paths = []
    glyphs = []
    for i, name in enumerate(glyph_names):
        pen = SVGPathPen(glyph_set)
        # y up to y down with the baseline at 0, the pen origin at the glyph's x
        glyph_set[name].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
        paths.append(rounded(pen.getCommands()))
        advance = hmtx[name][0]
        kern = kerns.get((name, glyph_names[i + 1]), 0) if i + 1 < len(glyph_names) else 0
        glyphs.append({'glyph': name, 'x': round(x, 1), 'advance': advance, 'kern': kern})
        x += advance + kern + track_units

    # the advance of the last glyph carries no tracking after it
    width = x - track_units
    os2 = font['OS/2']
    out = {
        'word': args.word,
        'font': args.font.split('/')[-1],
        'fontVersion': str(font['name'].getDebugName(5) or ''),
        'upm': upm,
        'wght': args.wght,
        'opsz': args.opsz,
        'trackEm': args.track,
        'capHeight': os2.sCapHeight,
        'xHeight': os2.sxHeight,
        'ascender': font['hhea'].ascent,
        'descender': font['hhea'].descent,
        'width': round(width, 1),
        'glyphs': glyphs,
        'd': ' '.join(paths),
    }
    json.dump(out, sys.stdout, indent=None, separators=(',', ':'))
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
