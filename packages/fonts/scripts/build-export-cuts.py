#!/usr/bin/env python3
"""Cut the catalog's export faces (packages/fonts/src/export-cuts.ts; docs/pptx.md "The catalog
faces in Editable text"). build-export-cuts.mjs plans the cuts from the catalog's facts and passes
the jobs as JSON on stdin; this script writes one static TrueType file per job and prints one
JSON row per job on stdout.

A job from a variable woff2 is instanced with fontTools' instancer at its weight and optical size,
every other axis at its default (the value the browser draws without font-variation-settings),
then given its own family (IDs 1, 2, 3, 4, 6, 16 and 17 rewritten, 21, 22 and 25 dropped, the
copyright, version, trademark and licence IDs kept as the OFL requires), its OS/2 weight class and
the fsSelection and macStyle bits of its slot, the form scripts/build-fonts.py gives the Inter set.
A job from a static woff2 is decoded as it ships: kept when its name table already answers to the
planned family and style, renamed when the face declares no Reserved Font Name, else skipped with
the reason. head.modified is the source's, so a rebuild writes the same bytes.

For a face with an opsz axis the row carries `spacing`: per whole pixel size the cut serves, the
letter weighted advance of the cut over the advance at the size's optical size (the browser's
font-optical-sizing auto), less one, the measure scripts/build-fonts.py records for Inter.

Requires fontTools with brotli (scripts/requirements.txt, the fonts venv .turboslide/venv).
"""

from __future__ import annotations

import copy
import hashlib
import io
import json
import sys
from pathlib import Path

try:
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
except ImportError as error:  # pragma: no cover - reported to the caller
    sys.stderr.write(f"build-export-cuts: {error}; run it with the fonts venv's python\n")
    sys.exit(2)

WINDOWS = (3, 1, 0x409)
MAC = (1, 0, 0)

# The English letter frequencies and the space at 18 percent (scripts/build-fonts.py
# LETTER_FREQUENCY), so the spacing share matches running text.
LETTER_FREQUENCY = {
    "a": 8.167, "b": 1.492, "c": 2.782, "d": 4.253, "e": 12.702, "f": 2.228, "g": 2.015,
    "h": 6.094, "i": 6.966, "j": 0.153, "k": 0.772, "l": 4.025, "m": 2.406, "n": 6.749,
    "o": 7.507, "p": 1.929, "q": 0.095, "r": 5.987, "s": 6.327, "t": 9.056, "u": 2.758,
    "v": 0.978, "w": 2.360, "x": 0.150, "y": 1.974, "z": 0.074, " ": 18.0,
}

# The smallest size the spacing table starts at; a smaller run takes the first entry.
SPACING_FROM_PX = 8


def name_string(font: TTFont, name_id: int) -> str | None:
    record = font["name"].getName(name_id, *WINDOWS) or font["name"].getName(name_id, *MAC)
    return record.toUnicode() if record is not None else None


def postscript_name(family: str, style: str) -> str:
    keep = lambda value: "".join(ch for ch in value if ch.isascii() and ch.isalnum())  # noqa: E731
    return f"{keep(family)}-{keep(style)}"


def rename(font: TTFont, family: str, style: str) -> None:
    """The cut's own family and style (scripts/build-fonts.py rename, with ID 16 the family itself so
    a reader that prefers the typographic family finds the name a run names)."""
    name = font["name"]
    version = name_string(font, 5) or ""
    ps_name = postscript_name(family, style)
    for record in list(name.names):
        if record.nameID in (1, 2, 3, 4, 6, 16, 17, 21, 22, 25):
            name.names.remove(record)
    full_name = family if style == "Regular" else f"{family} {style}"
    for platform in (WINDOWS, MAC):
        name.setName(family, 1, *platform)
        name.setName(style, 2, *platform)
        name.setName(f"{version};Turboslide;{ps_name}", 3, *platform)
        name.setName(full_name, 4, *platform)
        name.setName(ps_name, 6, *platform)
    name.setName(family, 16, *WINDOWS)
    name.setName(style, 17, *WINDOWS)


def set_style_bits(font: TTFont, weight: int, slot: str) -> None:
    bold = slot in ("bold", "boldItalic")
    italic = slot in ("italic", "boldItalic")
    os2 = font["OS/2"]
    os2.usWeightClass = weight
    # fsSelection: ITALIC (0), BOLD (5), REGULAR (6) by the slot; USE_TYPO_METRICS (7) and the rest kept
    selection = os2.fsSelection & ~((1 << 0) | (1 << 5) | (1 << 6))
    if italic:
        selection |= 1 << 0
    if bold:
        selection |= 1 << 5
    if not italic and not bold:
        selection |= 1 << 6
    os2.fsSelection = selection
    mac = font["head"].macStyle & ~0x3
    if bold:
        mac |= 0x1
    if italic:
        mac |= 0x2
    font["head"].macStyle = mac


def default_location(font: TTFont) -> dict[str, float]:
    return {axis.axisTag: axis.defaultValue for axis in font["fvar"].axes}


def axis_range(font: TTFont, tag: str) -> tuple[float, float] | None:
    for axis in font["fvar"].axes:
        if axis.axisTag == tag:
            return axis.minValue, axis.maxValue
    return None


def weighted_advance(font: TTFont, location: dict[str, float]) -> float:
    glyphs = font.getGlyphSet(location=location, normalized=False)
    cmap = font.getBestCmap()
    total = 0.0
    weight = 0.0
    for letter, frequency in LETTER_FREQUENCY.items():
        glyph = cmap.get(ord(letter))
        if glyph is None:
            continue
        total += glyphs[glyph].width * frequency
        weight += frequency
    return total / weight if weight else 0.0


def spacing_table(source: TTFont, location: dict[str, float], sizes: list[int]) -> dict[str, float]:
    """size to the share the cut draws wider (positive) or narrower than the browser at that size."""
    opsz = axis_range(source, "opsz")
    if opsz is None:
        return {}
    cut = weighted_advance(source, location)
    out: dict[str, float] = {}
    for size in sizes:
        browser = {**location, "opsz": min(opsz[1], max(opsz[0], float(size)))}
        share = cut / weighted_advance(source, browser) - 1
        out[str(size)] = round(share, 5)
    return out


def build(job: dict, sources: dict[str, TTFont], out_dir: Path) -> dict:
    row = {"file": job["file"], "family": job["family"], "slot": job["slot"]}
    path = job["sourcePath"]
    if path not in sources:
        # one source open at a time: the jobs arrive grouped by file
        sources.clear()
        font = TTFont(path, recalcTimestamp=False)
        font.flavor = None
        sources[path] = font
    source = sources[path]
    style = job["style"]
    if source["OS/2"].fsType & 0x0002:
        return {**row, "reason": f"fsType {source['OS/2'].fsType} forbids embedding"}
    if job["decoded"]:
        font = copy.deepcopy(source)
        named = (name_string(font, 1), name_string(font, 2))
        if named != (job["family"], style):
            if job["reservedFontName"] is not None:
                return {
                    **row,
                    "reason": (
                        f'the file answers to "{named[0]}" "{named[1]}", which a run cannot name, and the '
                        f'OFL Reserved Font Name "{job["reservedFontName"]}" forbids renaming it'
                    ),
                }
            rename(font, job["family"], style)
            set_style_bits(font, job["weight"], job["slot"])
    else:
        location = default_location(source)
        location["wght"] = float(job["weight"])
        if job["opsz"] is not None:
            location["opsz"] = float(job["opsz"])
        font = instancer.instantiateVariableFont(
            source, location, inplace=False, updateFontNames=False
        )
        if "STAT" in font:
            del font["STAT"]
        rename(font, job["family"], style)
        set_style_bits(font, job["weight"], job["slot"])
        if job["spacingSizes"]:
            row["spacing"] = spacing_table(source, location, job["spacingSizes"])
    font["head"].modified = source["head"].modified
    buffer = io.BytesIO()
    font.save(buffer)
    data = buffer.getvalue()
    target = out_dir / job["id"] / job["file"]
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return {
        **row,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "glyphs": len(font.getGlyphOrder()),
    }


def main() -> None:
    plan = json.load(sys.stdin)
    out_dir = Path(plan["out"])
    sources: dict[str, TTFont] = {}
    rows = []
    for job in plan["jobs"]:
        try:
            rows.append(build(job, sources, out_dir))
        except Exception as error:  # noqa: BLE001 - a failed cut is a row, not a crash
            rows.append({"file": job["file"], "family": job["family"], "slot": job["slot"], "reason": str(error)})
        sys.stderr.write(f"build-export-cuts: {job['id']} {job['file']}\n")
    json.dump({"rows": rows}, sys.stdout)


if __name__ == "__main__":
    main()
