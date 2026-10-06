#!/usr/bin/env python3
"""Cut the export font set from InterVariable (SPEC 8.4; MILESTONES M2 item 5; gslides-parity
SPEC-2 7.1 for the italic build).

The deck renders with InterVariable 4.001 and font-optical-sizing auto, so text at 15 to 31 px uses
an optical size no static Inter file has (pptx report section 4.10). PPTX and LibreOffice want
static faces, and DrawingML carries weight 500 only as a family name (pptx report section 1 item 2),
so this script instances the variable font once per (optical size, weight) the deck uses and gives
every instance a family name. Since the design round (docs/DESIGN.md 4.3, decision C8) the names
are the ones the upstream Inter release installs under, so a file opens in Inter on any machine
that has Inter, and no name carries a prefix of its own:

  Inter, Inter Medium              opsz 14, wght 400 and 500: text in the standard set, the default
  Inter Display                    opsz 32, wght 400: text at 44 px and over
  Inter Display Medium             opsz 32, wght 500: headings at 44 px and over
  Inter Display Alternates         opsz 32, wght 500, cv11 and ss01 frozen: the headings of a theme
                                   that draws them (General Translation's)
  Inter Text <size>                opsz <size>, wght 400; sizes 26, 24, 22, 20, 18, 15, 14: the
                                   exact set, the second choice
  Inter Text <size> Medium         opsz <size>, wght 500

The standard set draws text at opsz 14, which is wider than the browser's optical size above
14 px; fonts.json `spacing` records that difference per family and whole pixel size (the letter
weighted advance at opsz 14 over the advance at the size's optical size, less one), and the
PowerPoint writer takes it back as character spacing (packages/export/src/pptx/face-advance.ts).

The parity round two adds an italic twin of every face (SPEC-2 7.1) cut from
InterVariable-Italic.woff2 of the same release (the rsms/inter tag v4.1; the features round
replaced the 4.0 italic file with the 4.1 one, docs/FEATURES.md 3.1 item 1): the same family, style Italic, the
OS/2 and head italic bits set, post.italicAngle from the source, so PowerPoint and LibreOffice
find the Italic style under the family name a run travels under.

Renaming is allowed by the SIL OFL 1.1 only when the original declares no Reserved Font Name.
The script reads both fonts' own name tables (copyright, license description, license URL) and
THIRD_PARTY_NOTICES.md and refuses to rename when a Reserved Font Name is declared (SPEC 11,
open question 5). InterVariable 4.001 declares none; fonts.json records the check for both.

Output: <out>/<PostScriptName>.ttf per face and <out>/fonts.json mapping (size, weight, display,
italic) to a family name, with bytes and sha256 per file. The build is deterministic
(head.modified is kept from the source) so the committed files can be checked with --check.

The design round (docs/DESIGN.md 4.4, decision C7) adds the web subsets: the same two release files
cut into unicode-range files under packages/fonts/assets (InterVariable-<range>.woff2 and
InterVariable-Italic-<range>.woff2 for latin, latin-ext, cyrillic, greek, vietnamese and symbols,
every OpenType feature and both axes kept), the @font-face rules of packages/fonts/src/inter.css
between its two markers, and fonts.json `web`. A Latin page loads the Latin upright alone (113 KB
where the whole file was 352 KB); a page that draws Cyrillic loads the Cyrillic subset when the
text is drawn. The render documents, the standalone file, the PDF and the PowerPoint export keep
the whole files. --check compares the subsets and the inter.css block too.

Usage:
  build-fonts.py [--source packages/fonts/assets/InterVariable.woff2]
                 [--italic-source packages/fonts/assets/InterVariable-Italic.woff2]
                 [--out packages/fonts/export] [--check] [--json]

Requires the packages of scripts/requirements.txt (fontTools with brotli for the woff2 source).
Run it through `turboslide fonts build`, which creates .turboslide/venv from requirements.txt.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import io
import json
import re
import sys
from pathlib import Path

try:
    from fontTools import subset as ft_subset
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
except ImportError as error:  # pragma: no cover - reported to the caller
    sys.stderr.write(
        f"build-fonts: {error}; install scripts/requirements.txt into .turboslide/venv "
        "(turboslide fonts build does this)\n"
    )
    sys.exit(2)

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = REPO_ROOT / "packages" / "fonts" / "assets" / "InterVariable.woff2"
DEFAULT_ITALIC_SOURCE = REPO_ROOT / "packages" / "fonts" / "assets" / "InterVariable-Italic.woff2"
DEFAULT_OUT = REPO_ROOT / "packages" / "fonts" / "export"
NOTICES = REPO_ROOT / "THIRD_PARTY_NOTICES.md"

# The text sizes of the type ladder that export as native text (SPEC 8.4 table; theme tokens.ts).
TEXT_SIZES = [26, 24, 22, 20, 18, 15, 14]
TEXT_WEIGHTS = [400, 500]
# Display sizes all use the opsz 32 instance (the axis maximum).
DISPLAY_SIZES = [44, 72, 88]
DISPLAY_OPSZ = 32
DISPLAY_WEIGHTS = [400, 500]
DISPLAY_FEATURES = ["cv11", "ss01"]
# The standard set: two families at the axis default optical size.
STANDARD_OPSZ = 14
# The family names (docs/DESIGN.md 4.3): the upstream release's, and the exact set's per size cuts.
STANDARD_FAMILIES = {400: "Inter", 500: "Inter Medium"}
DISPLAY_FAMILIES = {400: "Inter Display", 500: "Inter Display Medium"}
ALTERNATES_FAMILY = "Inter Display Alternates"
# The whole pixel sizes the spacing table covers: from the first size over the standard optical
# size to the last size under the display sizes (a run at 44 px and over travels in a display face).
SPACING_SIZES = list(range(STANDARD_OPSZ + 1, DISPLAY_SIZES[0]))

# Bump when the naming or the instance list changes; part of ExportReport.fontSetVersion.
# 2: the italic twins of the parity round two (gslides-parity SPEC-2 7.1).
# 3: the upstream family names, the display faces at 400 and 500 and the spacing table of the
#    design round (docs/DESIGN.md 4.3).
BUILD_VERSION = 3

WINDOWS = (3, 1, 0x409)
MAC = (1, 0, 0)

# The metric matched fallback face (gslides-parity SPEC-3 9.2 G1; research-3 05 section 4 rule 3):
# `Inter Fallback` is Arial with size-adjust, ascent-override, descent-override and
# line-gap-override so a first visit paints the sheet's lines at Inter's metrics before the woff2
# arrives and nothing moves when it does. The overrides are computed from the upright source's
# hhea and OS/2 tables and from Arial's, both at 2048 units per em. Arial's numbers are pinned here
# so the build is the same on a machine without the font (CI); when the system Arial exists it is
# read and must agree, so a different Arial fails loudly rather than drifting. The average width
# is the advance of the letters weighted by their English frequency (the letter table of the
# Wikipedia article on letter frequency, rounded to three decimals) plus the space at 18 percent,
# the way capsize and fontaine measure a face, so size-adjust matches running text rather than
# the OS/2 xAvgCharWidth (which averages every glyph of the font once).
LETTER_FREQUENCY = {
    "a": 8.167, "b": 1.492, "c": 2.782, "d": 4.253, "e": 12.702, "f": 2.228, "g": 2.015,
    "h": 6.094, "i": 6.966, "j": 0.153, "k": 0.772, "l": 4.025, "m": 2.406, "n": 6.749,
    "o": 7.507, "p": 1.929, "q": 0.095, "r": 5.987, "s": 6.327, "t": 9.056, "u": 2.758,
    "v": 0.978, "w": 2.360, "x": 0.150, "y": 1.974, "z": 0.074, " ": 18.0,
}
ARIAL_METRICS = {
    "family": "Arial",
    "unitsPerEm": 2048,
    "ascent": 1854,
    "descent": -434,
    "lineGap": 67,
    # the weighted average advance of LETTER_FREQUENCY over Arial Regular (macOS 15, Arial.ttf)
    "avgWidth": 915.39312197561,
}
ARIAL_PATHS = [
    Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
    Path("/Library/Fonts/Arial.ttf"),
    Path("/usr/share/fonts/truetype/msttcorefonts/Arial.ttf"),
]
FALLBACK_FAMILY = "Inter Fallback"

# The web subsets (docs/DESIGN.md 4.4; research-type 1.2): each range as written in the CSS. The
# Latin range carries the UI symbols the chrome draws in its own controls (the command keys, the
# arrows, the check, the warning sign, the blocks and the geometric shapes), found by scanning the
# chrome, viewer and studio sources for characters above U+007E; symbols is every remaining code
# point of the font. The order is the order of the @font-face rules: the browser checks the last
# rule first where ranges overlap (CSS Fonts 4, 4.5), so Latin is written last and a Latin page
# requests the Latin file alone.
WEB_RANGES: list[tuple[str, str]] = [
    (
        "vietnamese",
        "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, "
        "U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
    ),
    ("greek", "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF, U+1F00-1FFF"),
    (
        "cyrillic",
        "U+0301, U+0400-052F, U+1C80-1C8A, U+20B4, U+2116, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
    ),
    (
        "latin-ext",
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, "
        "U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, "
        "U+2C60-2C7F, U+A720-A7FF",
    ),
    (
        "latin",
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, "
        "U+0329, U+2000-206F, U+20AC, U+2122, U+2190-21FF, U+2212, U+2215, U+22EE-22EF, U+2303, "
        "U+2318, U+2325, U+2328, U+232B, U+238B, U+23CE, U+2580-259F, U+25A0-25FF, U+2713, U+26A0, "
        "U+FEFF, U+FFFD",
    ),
]
# the subset of every code point no range above names, written first
WEB_REST = "symbols"
WEB_ASSETS = REPO_ROOT / "packages" / "fonts" / "assets"
INTER_CSS = REPO_ROOT / "packages" / "fonts" / "src" / "inter.css"
FACES_START = "/* faces:generated:start */"
FACES_END = "/* faces:generated:end */"


def sha256_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def name_string(font: TTFont, name_id: int) -> str | None:
    record = font["name"].getName(name_id, *WINDOWS) or font["name"].getName(name_id, *MAC)
    return record.toUnicode() if record is not None else None


def reserved_font_name(font: TTFont) -> str | None:
    """The Reserved Font Name the OFL declaration names, or None. Checks name IDs 0, 7, 13 and 14
    and the notices file, which carries Inter's LICENSE.txt header."""
    texts: list[str] = []
    for name_id in (0, 7, 13, 14):
        value = name_string(font, name_id)
        if value:
            texts.append(value)
    if NOTICES.exists():
        notices = NOTICES.read_text(encoding="utf-8")
        start = notices.find("## Inter")
        end = notices.find("\n## ", start + 1)
        texts.append(notices[start : end if end > 0 else len(notices)])
    # OFL declarations take one of two forms, both after the copyright statement:
    #   Copyright (c) ... with Reserved Font Name "Example".
    #   Reserved Font Name: Example
    # The license body's definition ("Reserved Font Name" refers to ...) and prose about the
    # question (THIRD_PARTY_NOTICES.md) are not declarations and do not match.
    patterns = [
        re.compile(r"\bwith\s+Reserved\s+Font\s+Names?\s+[\"\u201c']?([^\"\u201d'\n.,;]+)", re.IGNORECASE),
        re.compile(r"^\s*Reserved\s+Font\s+Names?\s*:\s*([^\n]+)$", re.IGNORECASE | re.MULTILINE),
    ]
    for text in texts:
        for pattern in patterns:
            match = pattern.search(text)
            if match:
                return match.group(1).strip()
    return None


def single_substitutions(font: TTFont, feature_tags: list[str]) -> dict[str, str]:
    """glyph -> glyph for every SingleSubst lookup the named GSUB features reach (what
    pyftfeatfreeze applies; the deck's cv11 and ss01 are single substitutions in Inter)."""
    gsub = font["GSUB"].table
    mapping: dict[str, str] = {}
    lookups = gsub.LookupList.Lookup
    for record in gsub.FeatureList.FeatureRecord:
        if record.FeatureTag not in feature_tags:
            continue
        for index in record.Feature.LookupListIndex:
            lookup = lookups[index]
            for subtable in lookup.SubTable:
                if lookup.LookupType == 7:
                    subtable = subtable.ExtSubTable
                if getattr(subtable, "mapping", None):
                    for src, dst in subtable.mapping.items():
                        mapping.setdefault(src, dst)
    return mapping


def freeze_features(font: TTFont, feature_tags: list[str]) -> int:
    """Point the cmap at the substituted glyphs so a renderer that cannot request the features
    (DrawingML, pptx report section 4.5) draws them anyway. Returns the codepoints remapped."""
    mapping = single_substitutions(font, feature_tags)
    remapped = 0
    for table in font["cmap"].tables:
        for code, glyph in list(table.cmap.items()):
            if glyph in mapping:
                table.cmap[code] = mapping[glyph]
                remapped += 1
    return remapped


def postscript_name(family: str, style: str) -> str:
    return f"{re.sub(r'[^A-Za-z0-9]', '', family)}-{re.sub(r'[^A-Za-z0-9]', '', style)}"


def rename(font: TTFont, family: str, style: str, version: str) -> str:
    """Give the instance its own family (SPEC 8.4). Keeps IDs 0, 5, 13, 14 (copyright, version,
    license) as the OFL requires and rewrites 1, 2, 3, 4, 6, 16, 17; drops 21, 22 and 25. An
    italic face reads ID 2 Italic, ID 4 "<family> Italic", ID 6 "<PostScript>-Italic"
    (SPEC-2 7.1)."""
    name = font["name"]
    ps_name = postscript_name(family, style)
    for record in list(name.names):
        if record.nameID in (1, 2, 3, 4, 6, 16, 17, 21, 22, 25):
            name.names.remove(record)
    unique_id = f"{version};Turboslide;{ps_name}"
    full_name = family if style == "Regular" else f"{family} {style}"
    for platform in (WINDOWS, MAC):
        name.setName(family, 1, *platform)
        name.setName(style, 2, *platform)
        name.setName(unique_id, 3, *platform)
        name.setName(full_name, 4, *platform)
        name.setName(ps_name, 6, *platform)
    name.setName(family, 16, *WINDOWS)
    name.setName(style, 17, *WINDOWS)
    return ps_name


def set_style_bits(font: TTFont, weight: int, italic: bool = False) -> None:
    os2 = font["OS/2"]
    os2.usWeightClass = weight
    if italic:
        # fsSelection: set ITALIC (0), clear BOLD (5) and REGULAR (6); keep USE_TYPO_METRICS (7).
        os2.fsSelection = (os2.fsSelection & ~((1 << 5) | (1 << 6))) | (1 << 0)
        font["head"].macStyle = (font["head"].macStyle & ~0x3) | 0x2
    else:
        # fsSelection: clear ITALIC (0), BOLD (5); set REGULAR (6); keep USE_TYPO_METRICS (7).
        os2.fsSelection = (os2.fsSelection & ~((1 << 0) | (1 << 5))) | (1 << 6)
        font["head"].macStyle &= ~0x3


def build_face(
    source: TTFont,
    opsz: float,
    weight: int,
    family: str,
    style: str,
    features: list[str],
    version: str,
    modified: int,
) -> tuple[bytes, str, int]:
    font = copy.deepcopy(source)
    font.flavor = None
    instancer.instantiateVariableFont(
        font, {"opsz": opsz, "wght": weight}, inplace=True, updateFontNames=False
    )
    remapped = freeze_features(font, features) if features else 0
    ps_name = rename(font, family, style, version)
    set_style_bits(font, weight, italic=(style == "Italic"))
    font["head"].modified = modified
    buffer = io.BytesIO()
    font.save(buffer)
    return buffer.getvalue(), ps_name, remapped


def upright_plan() -> list[dict]:
    faces: list[dict] = [
        {
            "family": ALTERNATES_FAMILY,
            "style": "Regular",
            "opsz": DISPLAY_OPSZ,
            "weight": 500,
            "display": True,
            "sizes": DISPLAY_SIZES,
            "frozen": DISPLAY_FEATURES,
            "sets": ["exact", "standard"],
        }
    ]
    for weight in DISPLAY_WEIGHTS:
        faces.append(
            {
                "family": DISPLAY_FAMILIES[weight],
                "style": "Regular",
                "opsz": DISPLAY_OPSZ,
                "weight": weight,
                "display": True,
                "sizes": DISPLAY_SIZES,
                "frozen": [],
                "sets": ["exact", "standard"],
            }
        )
    for size in TEXT_SIZES:
        for weight in TEXT_WEIGHTS:
            family = f"Inter Text {size}" + (" Medium" if weight == 500 else "")
            faces.append(
                {
                    "family": family,
                    "style": "Regular",
                    "opsz": size,
                    "weight": weight,
                    "display": False,
                    "sizes": [size],
                    "frozen": [],
                    "sets": ["exact"],
                }
            )
    for weight in TEXT_WEIGHTS:
        faces.append(
            {
                "family": STANDARD_FAMILIES[weight],
                "style": "Regular",
                "opsz": STANDARD_OPSZ,
                "weight": weight,
                "display": False,
                "sizes": TEXT_SIZES,
                "frozen": [],
                "sets": ["standard"],
            }
        )
    return faces


def plan() -> list[dict]:
    """Every upright face, then its italic twin with the same family and style Italic (SPEC-2 7.1):
    19 upright and 19 italic, 38 files. The alternates italic freezes cv11 and ss01 as the upright
    does."""
    faces = upright_plan()
    italics: list[dict] = []
    for face in faces:
        italics.append({**face, "style": "Italic", "italic": True})
    for face in faces:
        face["italic"] = False
    return faces + italics


def open_source(source_path: Path, what: str) -> tuple[TTFont, bytes, str]:
    """A variable source with its opsz and wght axes, no Reserved Font Name and installable embedding."""
    source_bytes = source_path.read_bytes()
    source = TTFont(io.BytesIO(source_bytes), recalcTimestamp=False)
    axes = {a.axisTag: [a.minValue, a.defaultValue, a.maxValue] for a in source["fvar"].axes}
    for tag in ("opsz", "wght"):
        if tag not in axes:
            raise SystemExit(f"build-fonts: {source_path} has no {tag} axis")
    reserved = reserved_font_name(source)
    if reserved is not None:
        raise SystemExit(
            f"build-fonts: the {what} source declares the Reserved Font Name {reserved!r}; the OFL "
            "forbids a modified version under that name. The export set's names would have to change "
            "(docs/DESIGN.md 4.3; SPEC 11, open question 5; SPEC-2 7.1)."
        )
    fs_type = source["OS/2"].fsType
    if fs_type != 0:
        raise SystemExit(f"build-fonts: {what} fsType is {fs_type}; the export set needs installable embedding (0)")
    return source, source_bytes, name_string(source, 5) or ""


def source_record(source_path: Path, source: TTFont, source_bytes: bytes) -> dict:
    return {
        "file": str(source_path.relative_to(REPO_ROOT)) if source_path.is_relative_to(REPO_ROOT) else str(source_path),
        "family": name_string(source, 1),
        "version": name_string(source, 5) or "",
        "sha256": sha256_of(source_bytes),
        "bytes": len(source_bytes),
        "fsType": source["OS/2"].fsType,
        "axes": {a.axisTag: [a.minValue, a.defaultValue, a.maxValue] for a in source["fvar"].axes},
    }


def vertical_metrics(font: TTFont) -> dict:
    head = font["head"]
    hhea = font["hhea"]
    return {
        "unitsPerEm": head.unitsPerEm,
        "ascent": hhea.ascent,
        "descent": hhea.descent,
        "lineGap": hhea.lineGap,
    }


def weighted_average_width(font: TTFont) -> float:
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    total = 0.0
    weight = 0.0
    for char, share in LETTER_FREQUENCY.items():
        glyph = cmap.get(ord(char))
        if glyph is None:
            raise SystemExit(f"build-fonts: the source has no glyph for {char!r}")
        total += hmtx[glyph][0] * share
        weight += share
    return total / weight


def spacing_table(source: TTFont) -> dict:
    """The standard set's width difference from the browser (docs/DESIGN.md 4.3): per family and
    whole pixel size from 15 to 43, the letter weighted advance of the opsz 14 instance over the
    advance at the size's optical size (the axis clamps it at 32), less one, to five decimals. A
    run of that size in that family is that much wider in the file than in the browser; the
    PowerPoint writer spaces its characters by minus that share of the browser's width."""
    letters = TTFont(io.BytesIO(subset_letters(source)), recalcTimestamp=False)
    table: dict[str, dict[str, float]] = {}
    for weight in TEXT_WEIGHTS:
        base = weighted_average_width(
            instancer.instantiateVariableFont(letters, {"opsz": STANDARD_OPSZ, "wght": weight})
        )
        row: dict[str, float] = {}
        for size in SPACING_SIZES:
            opsz = min(size, DISPLAY_OPSZ)
            width = weighted_average_width(
                instancer.instantiateVariableFont(letters, {"opsz": opsz, "wght": weight})
            )
            row[str(size)] = round(base / width - 1, 5)
        table[STANDARD_FAMILIES[weight]] = row
    return table


def subset_letters(source: TTFont) -> bytes:
    """The source cut to the letters of LETTER_FREQUENCY, so the spacing table's instances are quick."""
    font = copy.deepcopy(source)
    font.flavor = None
    options = ft_subset.Options()
    options.layout_features = []
    options.notdef_outline = True
    subsetter = ft_subset.Subsetter(options)
    subsetter.populate(unicodes=[ord(char) for char in LETTER_FREQUENCY])
    subsetter.subset(font)
    buffer = io.BytesIO()
    font.save(buffer)
    return buffer.getvalue()


def arial_metrics() -> dict:
    """The pinned Arial numbers, checked against the system font when one is installed."""
    for path in ARIAL_PATHS:
        if not path.exists():
            continue
        arial = TTFont(path, recalcTimestamp=False)
        measured = {**vertical_metrics(arial), "avgWidth": weighted_average_width(arial)}
        for key in ("unitsPerEm", "ascent", "descent", "lineGap"):
            if measured[key] != ARIAL_METRICS[key]:
                raise SystemExit(f"build-fonts: {path} {key} is {measured[key]}, the pinned Arial has {ARIAL_METRICS[key]}")
        if abs(measured["avgWidth"] - ARIAL_METRICS["avgWidth"]) > 1e-6:
            raise SystemExit(f"build-fonts: {path} average width is {measured['avgWidth']}, the pinned Arial has {ARIAL_METRICS['avgWidth']}")
        return {**ARIAL_METRICS, "checkedAgainst": str(path)}
    return {**ARIAL_METRICS, "checkedAgainst": None}


def percent(value: float) -> str:
    """A CSS percentage at four decimals with the trailing zeros dropped (22.444%, 0%): the form
    prettier keeps in inter.css, which inter.test.ts pins against fonts.json."""
    text = f"{value * 100:.4f}".rstrip("0").rstrip(".")
    return f"{text or '0'}%"


def fallback_face(source: TTFont) -> dict:
    """The `Inter Fallback` descriptors (SPEC-3 9.2 G1): size-adjust = Inter's average advance over
    Arial's (both per em); the three overrides are Inter's ascent, descent and line gap per em
    divided by size-adjust, so the fallback's line boxes equal Inter's at every size."""
    inter = {**vertical_metrics(source), "avgWidth": weighted_average_width(source)}
    arial = arial_metrics()
    size_adjust = (inter["avgWidth"] / inter["unitsPerEm"]) / (arial["avgWidth"] / arial["unitsPerEm"])
    ascent = (inter["ascent"] / inter["unitsPerEm"]) / size_adjust
    descent = (abs(inter["descent"]) / inter["unitsPerEm"]) / size_adjust
    line_gap = (inter["lineGap"] / inter["unitsPerEm"]) / size_adjust
    return {
        "family": FALLBACK_FAMILY,
        "local": arial["family"],
        "sizeAdjust": percent(size_adjust),
        "ascentOverride": percent(ascent),
        "descentOverride": percent(descent),
        "lineGapOverride": percent(line_gap),
        "metrics": {"inter": inter, "arial": arial, "letterWeights": LETTER_FREQUENCY},
    }


def parse_ranges(text: str) -> set[int]:
    """The code points of a unicode-range value (`U+0000-00FF, U+0131`)."""
    points: set[int] = set()
    for part in text.split(","):
        part = part.strip().upper().removeprefix("U+")
        if "-" in part:
            low, high = part.split("-")
            points.update(range(int(low, 16), int(high, 16) + 1))
        elif part:
            points.add(int(part, 16))
    return points


def format_ranges(points: set[int]) -> str:
    """A unicode-range value for a set of code points, runs collapsed (`U+2190-21FF`)."""
    ordered = sorted(points)
    parts: list[str] = []
    start = prev = None
    for point in ordered + [None]:
        if point is not None and prev is not None and point == prev + 1:
            prev = point
            continue
        if start is not None:
            parts.append(f"U+{start:04X}" if start == prev else f"U+{start:04X}-{prev:04X}")
        start = prev = point
    return ", ".join(parts)


def range_declaration(text: str, width: int = 100) -> list[str]:
    """The unicode-range declaration as the repository's prettier prints it (printWidth 100): one
    line when it fits, else the value on its own lines at a four space indent, filled greedily."""
    one = f"  unicode-range: {text};"
    if len(one) <= width:
        return [one]
    items = [part.strip() for part in text.split(",")]
    lines: list[str] = ["  unicode-range:"]
    line = "   "
    for i, item in enumerate(items):
        token = item + (";" if i == len(items) - 1 else ",")
        if len(line) + 1 + len(token) > width:
            lines.append(line)
            line = "    " + token
        else:
            line = f"{line} {token}"
    lines.append(line)
    return lines


def subset_woff2(source_bytes: bytes, points: set[int]) -> bytes:
    """One unicode-range subset of a variable source as woff2: every layout feature, both axes,
    every name record (the copyright and the OFL notice travel with the file), the source's
    head.modified kept so the bytes are the same on every run."""
    font = TTFont(io.BytesIO(source_bytes), recalcTimestamp=False)
    options = ft_subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.name_legacy = True
    options.notdef_outline = True
    options.recalc_timestamp = False
    options.flavor = "woff2"
    subsetter = ft_subset.Subsetter(options=options)
    subsetter.populate(unicodes=sorted(points))
    subsetter.subset(font)
    out = io.BytesIO()
    font.flavor = "woff2"
    font.save(out)
    return out.getvalue()


def web_subsets(source: TTFont, source_bytes: bytes, italic: TTFont, italic_bytes: bytes) -> tuple[list[dict], dict[str, bytes], str]:
    """The web subsets of docs/DESIGN.md 4.4: the records for fonts.json `web`, the files by name
    and the @font-face block of inter.css."""
    cmap = set(source.getBestCmap().keys()) | set(italic.getBestCmap().keys())
    named: set[int] = set()
    ranges: list[tuple[str, str, set[int]]] = []
    for name, text in WEB_RANGES:
        points = parse_ranges(text)
        named |= points
        ranges.append((name, text, points & cmap))
    rest = cmap - named
    ranges.insert(0, (WEB_REST, format_ranges(rest), rest))
    files: dict[str, bytes] = {}
    records: list[dict] = []
    css: list[str] = [FACES_START]
    for name, text, points in ranges:
        for style, data, stem in (("normal", source_bytes, "InterVariable"), ("italic", italic_bytes, "InterVariable-Italic")):
            file_name = f"{stem}-{name}.woff2"
            woff2 = subset_woff2(data, points)
            files[file_name] = woff2
            records.append(
                {
                    "file": file_name,
                    "range": name,
                    "style": style,
                    "unicodeRange": text,
                    "codepoints": len(points),
                    "bytes": len(woff2),
                    "sha256": sha256_of(woff2),
                }
            )
            css.extend(
                [
                    "@font-face {",
                    "  font-family: 'Inter';",
                    f"  font-style: {style};",
                    "  font-weight: 100 900;",
                    "  font-display: swap;",
                    f"  src: url('../assets/{file_name}') format('woff2');",
                    *range_declaration(text),
                    "}",
                ]
            )
    css.append(FACES_END)
    return records, files, "\n".join(css)


def inter_css_with(block: str) -> str:
    """inter.css with its generated @font-face block replaced."""
    text = INTER_CSS.read_text(encoding="utf-8")
    start = text.find(FACES_START)
    end = text.find(FACES_END)
    if start < 0 or end < start:
        raise SystemExit(f"build-fonts: {INTER_CSS} has no {FACES_START} block")
    return text[:start] + block + text[end + len(FACES_END):]


def build(source_path: Path, italic_path: Path, out: Path) -> tuple[dict, dict[str, bytes]]:
    source, source_bytes, version = open_source(source_path, "upright")
    italic, italic_bytes, italic_version = open_source(italic_path, "italic")
    version_short = re.sub(r"^Version\s+", "", version).split(";")[0]
    modified = source["head"].modified
    italic_modified = italic["head"].modified
    italic_angle = italic["post"].italicAngle

    files: dict[str, bytes] = {}
    faces: list[dict] = []
    for spec in plan():
        is_italic = spec["italic"]
        data, ps_name, remapped = build_face(
            italic if is_italic else source,
            spec["opsz"],
            spec["weight"],
            spec["family"],
            spec["style"],
            spec["frozen"],
            version_short,
            italic_modified if is_italic else modified,
        )
        file_name = f"{ps_name}.ttf"
        files[file_name] = data
        faces.append(
            {
                "file": file_name,
                "family": spec["family"],
                "style": spec["style"],
                "italic": is_italic,
                "postScriptName": ps_name,
                "opsz": spec["opsz"],
                "weight": spec["weight"],
                "display": spec["display"],
                "sizes": spec["sizes"],
                "frozen": spec["frozen"],
                "remappedCodepoints": remapped,
                "sets": spec["sets"],
                "bytes": len(data),
                "sha256": sha256_of(data),
            }
        )
    web_records, web_files, web_css = web_subsets(source, source_bytes, italic, italic_bytes)
    for name, data in web_files.items():
        files[f"web:{name}"] = data
    files["web:inter.css"] = inter_css_with(web_css).encode("utf-8")
    fonts_json = {
        "version": f"{version_short}+build.{BUILD_VERSION}",
        "generatedBy": "scripts/build-fonts.py",
        "source": {
            **source_record(source_path, source, source_bytes),
            # the italic source of the same release (gslides-parity SPEC-2 7.1, 0.66): the file the
            # italic twins are cut from, with its own name table version and post.italicAngle
            "italic": {
                **source_record(italic_path, italic, italic_bytes),
                "italicAngle": italic_angle,
                "release": "https://github.com/rsms/inter/releases/tag/v4.1",
                "path": "web/InterVariable-Italic.woff2",
            },
        },
        "license": {
            "id": "OFL-1.1",
            "reservedFontName": None,
            "italicReservedFontName": None,
            "checked": ["name 0", "name 7", "name 13", "name 14", "THIRD_PARTY_NOTICES.md"],
            "note": "No Reserved Font Name is declared by the upright or the italic source, so modified instances may carry the Inter names (OFL 1.1 condition 3).",
        },
        "textSizes": TEXT_SIZES,
        "weights": TEXT_WEIGHTS,
        "displaySizes": DISPLAY_SIZES,
        "displayOpsz": DISPLAY_OPSZ,
        "standard": {str(weight): family for weight, family in STANDARD_FAMILIES.items()},
        "display": {str(weight): family for weight, family in DISPLAY_FAMILIES.items()},
        "alternates": ALTERNATES_FAMILY,
        # the standard set's width difference from the browser, per family and size (DESIGN.md 4.3)
        "spacing": spacing_table(source),
        # the metric matched fallback face of gslides-parity SPEC-3 9.2 G1 (packages/fonts/src/inter.css)
        "fallback": fallback_face(source),
        "faces": faces,
        # The same rows under the key the PPTX builder's fonts-map.ts reads (packages/export).
        "families": faces,
        # the web subsets of the design round (docs/DESIGN.md 4.4): packages/fonts/assets and the
        # @font-face block of packages/fonts/src/inter.css
        "web": web_records,
    }
    return fonts_json, files


def target(out: Path, name: str) -> Path:
    """Where a built file lives: an export face under <out>, a web subset under
    packages/fonts/assets, the @font-face block in packages/fonts/src/inter.css."""
    if name == "web:inter.css":
        return INTER_CSS
    if name.startswith("web:"):
        return WEB_ASSETS / name.removeprefix("web:")
    return out / name


def write(out: Path, fonts_json: dict, files: dict[str, bytes]) -> list[str]:
    out.mkdir(parents=True, exist_ok=True)
    written: list[str] = []
    for path in stale_faces(out, files):
        path.unlink()
        written.append(f"removed {path}")
    for name, data in files.items():
        path = target(out, name)
        if not path.exists() or path.read_bytes() != data:
            path.write_bytes(data)
            written.append(str(path))
    text = json.dumps(fonts_json, indent=2) + "\n"
    json_path = out / "fonts.json"
    if not json_path.exists() or json_path.read_text(encoding="utf-8") != text:
        json_path.write_text(text, encoding="utf-8")
        written.append(str(json_path))
    return written


def stale_faces(out: Path, files: dict[str, bytes]) -> list[Path]:
    """The export faces under <out> that the plan no longer builds (a renamed family's old file)."""
    return sorted(path for path in out.glob("*.ttf") if path.name not in files)


def check(out: Path, fonts_json: dict, files: dict[str, bytes]) -> list[str]:
    stale: list[str] = [f"extra {path}" for path in stale_faces(out, files)]
    for name, data in files.items():
        path = target(out, name)
        if not path.exists():
            stale.append(f"missing {path}")
        elif path.read_bytes() != data:
            stale.append(f"differs {path}")
    json_path = out / "fonts.json"
    if not json_path.exists():
        stale.append(f"missing {json_path}")
    elif json.loads(json_path.read_text(encoding="utf-8")) != fonts_json:
        stale.append(f"differs {json_path}")
    return stale


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--italic-source", type=Path, default=DEFAULT_ITALIC_SOURCE)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--check", action="store_true", help="exit 1 when the committed set differs")
    parser.add_argument("--json", action="store_true", help="machine result on stdout")
    args = parser.parse_args(argv)

    fonts_json, files = build(args.source, args.italic_source, args.out)
    if args.check:
        stale = check(args.out, fonts_json, files)
        result = {"out": str(args.out), "faces": len(files), "stale": stale, "version": fonts_json["version"]}
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            for line in stale:
                print(line)
            print(f"build-fonts --check: {len(stale)} stale file(s)")
        return 1 if stale else 0
    written = write(args.out, fonts_json, files)
    result = {
        "out": str(args.out),
        "version": fonts_json["version"],
        "faces": [
            {"file": f["file"], "family": f["family"], "style": f["style"], "opsz": f["opsz"], "weight": f["weight"], "bytes": f["bytes"]}
            for f in fonts_json["faces"]
        ],
        "web": [{"file": w["file"], "codepoints": w["codepoints"], "bytes": w["bytes"]} for w in fonts_json["web"]],
        "written": written,
        "reservedFontName": None,
    }
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        for face in fonts_json["faces"]:
            print(f"{face['file']:<40} {face['family']:<28} {face['style']:<8} opsz {face['opsz']:>2} wght {face['weight']} {face['bytes']:>8} B")
        for web in fonts_json["web"]:
            print(f"{web['file']:<40} {web['codepoints']:>5} code points {web['bytes']:>8} B")
        print(f"build-fonts: {len(files)} faces, {len(written)} file(s) written under {args.out}, version {fonts_json['version']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
