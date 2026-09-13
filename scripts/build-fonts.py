#!/usr/bin/env python3
"""Cut the export font set from InterVariable (SPEC 8.4; MILESTONES M2 item 5; gslides-parity
SPEC-2 7.1 for the italic build).

The deck renders with InterVariable 4.001 and font-optical-sizing auto, so text at 15 to 31 px uses
an optical size no static Inter file has (pptx report section 4.10). PPTX and LibreOffice want
static faces, and DrawingML carries weight 500 only as a family name (pptx report section 1 item 2),
so this script instances the variable font once per (optical size, weight) the deck uses and gives
every instance its own family name:

  GT Inter Display                 opsz 32, wght 500, cv11 and ss01 frozen; h1 88, big 72, h2 44
  GT Inter Text <size>             opsz <size>, wght 400; sizes 26, 24, 22, 20, 18, 15, 14
  GT Inter Text <size> Medium      opsz <size>, wght 500 (the *display* run inside text, keys, plain)
  Inter, Inter Medium              opsz 14, wght 400 and 500: the --fonts standard set

The parity round two adds an italic twin of every face (SPEC-2 7.1) cut from
InterVariable-Italic.woff2 of the same release: the same family, style Italic, the
OS/2 and head italic bits set, post.italicAngle from the source, so PowerPoint and LibreOffice
find the Italic style under the family name a run travels under.

Renaming is allowed by the SIL OFL 1.1 only when the original declares no Reserved Font Name.
The script reads both fonts' own name tables (copyright, license description, license URL) and
THIRD_PARTY_NOTICES.md and refuses to rename when a Reserved Font Name is declared (SPEC 11,
open question 5). InterVariable 4.001 declares none; fonts.json records the check for both.

Output: <out>/<PostScriptName>.ttf per face and <out>/fonts.json mapping (size, weight, display,
italic) to a family name, with bytes and sha256 per file. The build is deterministic
(head.modified is kept from the source) so the committed files can be checked with --check.

Usage:
  build-fonts.py [--source packages/fonts/assets/InterVariable.woff2]
                 [--italic-source packages/fonts/assets/InterVariable-Italic.woff2]
                 [--out packages/fonts/export] [--prefix "GT Inter"] [--check] [--json]

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
DISPLAY_WEIGHT = 500
DISPLAY_FEATURES = ["cv11", "ss01"]
# The standard set: two families at the axis default optical size.
STANDARD_OPSZ = 14

# Bump when the naming or the instance list changes; part of ExportReport.fontSetVersion.
# 2: the italic twins of the parity round two (gslides-parity SPEC-2 7.1).
BUILD_VERSION = 2

WINDOWS = (3, 1, 0x409)
MAC = (1, 0, 0)


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
    unique_id = f"{version};GT;{ps_name}"
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


def upright_plan(prefix: str) -> list[dict]:
    faces: list[dict] = []
    faces.append(
        {
            "family": f"{prefix} Display",
            "style": "Regular",
            "opsz": DISPLAY_OPSZ,
            "weight": DISPLAY_WEIGHT,
            "display": True,
            "sizes": DISPLAY_SIZES,
            "frozen": DISPLAY_FEATURES,
            "sets": ["exact", "standard"],
        }
    )
    for size in TEXT_SIZES:
        for weight in TEXT_WEIGHTS:
            family = f"{prefix} Text {size}" + (" Medium" if weight == 500 else "")
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
                "family": "Inter" if weight == 400 else "Inter Medium",
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


def plan(prefix: str) -> list[dict]:
    """Every upright face, then its italic twin with the same family and style Italic (SPEC-2 7.1):
    17 upright and 17 italic, 34 files. The display italic freezes cv11 and ss01 as the upright does."""
    faces = upright_plan(prefix)
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
            "forbids a modified version under that name. Pass --prefix with a name that does not "
            "contain it and record the decision (SPEC 11, open question 5; SPEC-2 7.1)."
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


def build(source_path: Path, italic_path: Path, out: Path, prefix: str) -> tuple[dict, dict[str, bytes]]:
    source, source_bytes, version = open_source(source_path, "upright")
    italic, italic_bytes, italic_version = open_source(italic_path, "italic")
    version_short = re.sub(r"^Version\s+", "", version).split(";")[0]
    modified = source["head"].modified
    italic_modified = italic["head"].modified
    italic_angle = italic["post"].italicAngle

    files: dict[str, bytes] = {}
    faces: list[dict] = []
    for spec in plan(prefix):
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
    fonts_json = {
        "version": f"{version_short}+gt.{BUILD_VERSION}",
        "generatedBy": "scripts/build-fonts.py",
        "prefix": prefix,
        "source": {
            **source_record(source_path, source, source_bytes),
            # the italic source of the same release (gslides-parity SPEC-2 7.1, 0.66): the file the
            # italic twins are cut from, with its own name table version and post.italicAngle
            "italic": {
                **source_record(italic_path, italic, italic_bytes),
                "italicAngle": italic_angle,
                "release": "https://github.com/rsms/inter/releases/tag/v4.001",
                "path": "web/InterVariable-Italic.woff2",
            },
        },
        "license": {
            "id": "OFL-1.1",
            "reservedFontName": None,
            "italicReservedFontName": None,
            "checked": ["name 0", "name 7", "name 13", "name 14", "THIRD_PARTY_NOTICES.md"],
            "note": "No Reserved Font Name is declared by the upright or the italic source, so renamed instances are permitted (OFL 1.1 condition 3).",
        },
        "textSizes": TEXT_SIZES,
        "weights": TEXT_WEIGHTS,
        "displaySizes": DISPLAY_SIZES,
        "displayOpsz": DISPLAY_OPSZ,
        "standard": {"400": "Inter", "500": "Inter Medium"},
        "faces": faces,
        # The same rows under the key the PPTX builder's fonts-map.ts reads (packages/export).
        "families": faces,
    }
    return fonts_json, files


def write(out: Path, fonts_json: dict, files: dict[str, bytes]) -> list[str]:
    out.mkdir(parents=True, exist_ok=True)
    written: list[str] = []
    for name, data in files.items():
        path = out / name
        if not path.exists() or path.read_bytes() != data:
            path.write_bytes(data)
            written.append(str(path))
    text = json.dumps(fonts_json, indent=2) + "\n"
    json_path = out / "fonts.json"
    if not json_path.exists() or json_path.read_text(encoding="utf-8") != text:
        json_path.write_text(text, encoding="utf-8")
        written.append(str(json_path))
    return written


def check(out: Path, fonts_json: dict, files: dict[str, bytes]) -> list[str]:
    stale: list[str] = []
    for name, data in files.items():
        path = out / name
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
    parser.add_argument("--prefix", default="GT Inter")
    parser.add_argument("--check", action="store_true", help="exit 1 when the committed set differs")
    parser.add_argument("--json", action="store_true", help="machine result on stdout")
    args = parser.parse_args(argv)

    fonts_json, files = build(args.source, args.italic_source, args.out, args.prefix)
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
        "written": written,
        "reservedFontName": None,
    }
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        for face in fonts_json["faces"]:
            print(f"{face['file']:<40} {face['family']:<28} {face['style']:<8} opsz {face['opsz']:>2} wght {face['weight']} {face['bytes']:>8} B")
        print(f"build-fonts: {len(files)} faces, {len(written)} file(s) written under {args.out}, version {fonts_json['version']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
