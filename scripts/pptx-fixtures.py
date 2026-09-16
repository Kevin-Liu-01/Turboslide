#!/usr/bin/env python3
"""The PPTX import fixtures (gslides-parity SPEC-5 5.4; R04 section 10), built with python-pptx
1.0.2 and lxml in the fonts venv (.turboslide/venv, scripts/requirements.txt) once and committed
under packages/import/src/__fixtures__/pptx/. The check chain never runs this script; the reader's
tests read the committed files and the expected documents beside them, which the reader itself
writes on the day its mapping lands (`turboslide import <fixture> --dry-run`).

    .turboslide/venv/bin/python scripts/pptx-fixtures.py --out packages/import/src/__fixtures__/pptx
    .turboslide/venv/bin/python scripts/pptx-fixtures.py --only 01 --out <dir>

Every file is written twice: python-pptx saves it, then the archive is rewritten entry by entry
with one fixed modification time and the template's thumbnail dropped, so a regeneration gives
the same bytes (a fixture is a gate, MILESTONES-5 rules). The default template of python-pptx is
4:3 (9,144,000 by 6,858,000 EMU); the fixtures are 16:9 (12,192,000 by 6,858,000), so the master's
and the layouts' transforms are widened by four thirds before any slide is added, and every
placeholder keeps the inheritance the reader tests (a title on a slide has an empty `p:spPr`
and takes its box from the layout; the master's `p:bodyStyle` bullets a body placeholder).

Fixture 01-text (R04 10): three slides. Slide 1 a title and a subtitle from the Title Slide
layout with speaker notes; slide 2, named "Runs and lists" in `p:cSld`, a body placeholder with
bullets at levels 1 to 3, a text box with bold, italic, underline, strike, superscript,
subscript, a coloured run, a highlighted run, a URL link and a `hlinksldjump` link to slide 3
under `a:normAutofit` and `anchor="ctr"`, and a numbered list starting at 4; slide 3 hidden
(`show="0"`) with a title and one text box. Two sections in a `p14:sectionLst`.
"""

from __future__ import annotations

import argparse
import io
import re
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

try:
    from lxml import etree
    from pptx import Presentation
    from pptx.dml.color import RGBColor
    from pptx.enum.text import MSO_ANCHOR, MSO_AUTO_SIZE
    from pptx.opc.constants import RELATIONSHIP_TYPE as RT
    from pptx.oxml.ns import qn
    from pptx.util import Emu, Pt
except ImportError as error:  # pragma: no cover - the venv is opt in
    sys.stderr.write(
        f"pptx-fixtures: {error}. Install the fonts venv first: "
        "python3 -m venv .turboslide/venv && .turboslide/venv/bin/pip install -r scripts/requirements.txt\n"
    )
    sys.exit(2)

WIDE_CX = 12_192_000
STANDARD_CX = 9_144_000
FIXED_DATE = datetime(2026, 9, 15, tzinfo=timezone.utc)
ZIP_DATE = (1980, 1, 1, 0, 0, 0)
P14_NS = "http://schemas.microsoft.com/office/powerpoint/2010/main"
SECTION_LIST_URI = "{521415D9-36F7-43E2-AB2F-B90AF26B5E84}"
PRODUCER = "python-pptx"

# Run property children in schema order (CT_TextCharacterProperties), so an element inserted by
# hand lands where PowerPoint expects it.
RPR_ORDER = [
    "a:ln",
    "a:noFill",
    "a:solidFill",
    "a:gradFill",
    "a:blipFill",
    "a:pattFill",
    "a:grpFill",
    "a:effectLst",
    "a:effectDag",
    "a:highlight",
    "a:uLnTx",
    "a:uLn",
    "a:uFillTx",
    "a:uFill",
    "a:latin",
    "a:ea",
    "a:cs",
    "a:sym",
    "a:hlinkClick",
    "a:hlinkMouseOver",
    "a:rtl",
    "a:extLst",
]


A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"


def insert_in_order(parent, child, order):
    """Inserts `child` before the first sibling whose tag comes later in `order`."""

    def rank(element) -> int:
        tag = etree.QName(element.tag)
        key = f"a:{tag.localname}" if tag.namespace == A_NS else tag.localname
        return order.index(key) if key in order else len(order)

    own = rank(child)
    for index, sibling in enumerate(parent):
        if rank(sibling) > own:
            parent.insert(index, child)
            return child
    parent.append(child)
    return child


def widen_to_16_9(prs) -> None:
    """Sets the 16:9 page and scales the master's and layouts' x coordinates by four thirds."""
    prs.slide_width = Emu(WIDE_CX)
    sld_sz = prs.part._element.find(qn("p:sldSz"))
    if "type" in sld_sz.attrib:
        del sld_sz.attrib["type"]
    factor = WIDE_CX / STANDARD_CX
    parts = [prs.slide_master.part] + [layout.part for layout in prs.slide_layouts]
    for part in parts:
        root = part._element
        for off in root.iter(qn("a:off"), qn("a:chOff")):
            off.set("x", str(round(int(off.get("x", "0")) * factor)))
        for ext in root.iter(qn("a:ext"), qn("a:chExt")):
            if ext.get("cx") is not None:
                ext.set("cx", str(round(int(ext.get("cx", "0")) * factor)))


def set_producer(prs, title: str) -> None:
    """Names python-pptx in docProps/app.xml and fixes the core properties for determinism."""
    core = prs.core_properties
    core.title = title
    core.author = "Turboslide"
    core.last_modified_by = "Turboslide"
    core.created = FIXED_DATE
    core.modified = FIXED_DATE
    core.revision = 1
    for part in prs.part.package.iter_parts():
        if str(part.partname) == "/docProps/app.xml":
            root = etree.fromstring(part.blob)
            ns = {"ep": "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"}
            app = root.find("ep:Application", ns)
            if app is not None:
                app.text = PRODUCER
            part._blob = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)


def add_sections(prs, sections: list[tuple[str, str, list[int]]]) -> None:
    """Writes a p14:sectionLst into presentation.xml's extLst (R04 3; sections by slide id)."""
    presentation = prs.part._element
    ext_lst = presentation.find(qn("p:extLst"))
    if ext_lst is None:
        ext_lst = etree.SubElement(presentation, qn("p:extLst"))
    ext = etree.SubElement(ext_lst, qn("p:ext"))
    ext.set("uri", SECTION_LIST_URI)
    section_lst = etree.SubElement(ext, f"{{{P14_NS}}}sectionLst", nsmap={"p14": P14_NS})
    for name, guid, slide_ids in sections:
        section = etree.SubElement(section_lst, f"{{{P14_NS}}}section")
        section.set("name", name)
        section.set("id", guid)
        id_lst = etree.SubElement(section, f"{{{P14_NS}}}sldIdLst")
        for slide_id in slide_ids:
            sld_id = etree.SubElement(id_lst, f"{{{P14_NS}}}sldId")
            sld_id.set("id", str(slide_id))


def hide_slide(prs, index: int) -> None:
    sld_id_lst = prs.part._element.find(qn("p:sldIdLst"))
    sld_id_lst[index].set("show", "0")


def slide_ids(prs) -> list[int]:
    sld_id_lst = prs.part._element.find(qn("p:sldIdLst"))
    return [int(item.get("id")) for item in sld_id_lst]


def deterministic_bytes(saved: bytes) -> bytes:
    """Rewrites the archive with one modification time, deflate throughout, no template thumbnail."""
    source = zipfile.ZipFile(io.BytesIO(saved))
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as target:
        for info in source.infolist():
            if info.filename == "docProps/thumbnail.jpeg":
                continue
            data = source.read(info.filename)
            if info.filename == "_rels/.rels":
                text = data.decode("utf-8")
                text = re.sub(r"<Relationship\b[^>]*Target=\"docProps/thumbnail\.jpeg\"[^>]*/>", "", text)
                data = text.encode("utf-8")
            entry = zipfile.ZipInfo(info.filename, date_time=ZIP_DATE)
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            target.writestr(entry, data)
    return out.getvalue()


def save(prs, path: Path) -> None:
    buffer = io.BytesIO()
    prs.save(buffer)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(deterministic_bytes(buffer.getvalue()))


# ---------------------------------------------------------------------------------------------
# 01-text


def build_01_text(out_dir: Path) -> Path:
    prs = Presentation()
    widen_to_16_9(prs)
    layouts = prs.slide_layouts

    # Slide 1: the Title Slide layout; both placeholders keep an empty p:spPr, so their boxes and
    # their text styles come from the layout and the master (R04 3, the inheritance probe).
    slide1 = prs.slides.add_slide(layouts[0])
    slide1.shapes.title.text = "Import fixture"
    slide1.placeholders[1].text = "Three slides of text for the reader"
    slide1.notes_slide.notes_text_frame.text = "Speaker notes on the first slide."

    # Slide 3 is made before slide 2's link so the jump target exists; it is moved last below.
    slide2 = prs.slides.add_slide(layouts[1])
    slide3 = prs.slides.add_slide(layouts[5])

    # Slide 2: the slide name, a bulleted body from the master's bodyStyle, the marked runs.
    slide2.shapes.title.text = "Runs and lists"
    slide2._element.cSld.set("name", "Runs and lists")
    body = slide2.placeholders[1].text_frame
    body.text = "First level item"
    for level, text in ((1, "Second level item"), (2, "Third level item"), (0, "Back to the first level")):
        paragraph = body.add_paragraph()
        paragraph.text = text
        paragraph.level = level

    box = slide2.shapes.add_textbox(Emu(685_800), Emu(4_572_000), Emu(6_400_800), Emu(1_371_600))
    frame = box.text_frame
    frame.word_wrap = True
    frame.auto_size = MSO_AUTO_SIZE.TEXT_TO_FIT_SHAPE
    frame.vertical_anchor = MSO_ANCHOR.MIDDLE
    paragraph = frame.paragraphs[0]

    def run(text: str, size=Pt(18)):
        item = paragraph.add_run()
        item.text = text
        item.font.size = size
        return item

    run("Plain, ")
    run("bold, ").font.bold = True
    run("italic, ").font.italic = True
    run("underlined, ").font.underline = True
    struck = run("struck, ")
    struck._r.get_or_add_rPr().set("strike", "sngStrike")
    sup = run("sup")
    sup._r.get_or_add_rPr().set("baseline", "30000")
    run(" and ")
    sub = run("sub")
    sub._r.get_or_add_rPr().set("baseline", "-25000")
    run(", ")
    coloured = run("blue, ")
    coloured.font.color.rgb = RGBColor(0x2F, 0x5C, 0xE0)
    highlighted = run("highlighted, ")
    highlight = etree.Element(qn("a:highlight"))
    etree.SubElement(highlight, qn("a:srgbClr")).set("val", "FFFF00")
    insert_in_order(highlighted._r.get_or_add_rPr(), highlight, RPR_ORDER)
    linked = run("a link")
    linked.hyperlink.address = "https://turboslide.vercel.app"
    run(" and ")
    jump = run("a jump to the hidden slide")
    rid = slide2.part.relate_to(slide3.part, RT.SLIDE)
    click = etree.Element(qn("a:hlinkClick"))
    click.set(qn("r:id"), rid)
    click.set("action", "ppaction://hlinksldjump")
    insert_in_order(jump._r.get_or_add_rPr(), click, RPR_ORDER)
    run(".")

    numbered = slide2.shapes.add_textbox(Emu(7_315_200), Emu(4_572_000), Emu(4_191_000), Emu(1_371_600))
    numbered_frame = numbered.text_frame
    numbered_frame.word_wrap = True
    for index, text in enumerate(("Fourth step", "Fifth step", "Sixth step")):
        item = numbered_frame.paragraphs[0] if index == 0 else numbered_frame.add_paragraph()
        item.text = text
        ppr = item._p.get_or_add_pPr()
        ppr.set("marL", "342900")
        ppr.set("indent", "-342900")
        auto = etree.SubElement(ppr, qn("a:buAutoNum"))
        auto.set("type", "arabicPeriod")
        auto.set("startAt", "4")
        for run_ in item.runs:
            run_.font.size = Pt(18)

    # Slide 3: hidden, the jump target.
    slide3.shapes.title.text = "Hidden slide"
    hidden_box = slide3.shapes.add_textbox(Emu(1_371_600), Emu(2_743_200), Emu(9_144_000), Emu(914_400))
    hidden_box.text_frame.text = "This slide is hidden and is the jump target."
    hidden_box.text_frame.paragraphs[0].runs[0].font.size = Pt(24)
    hide_slide(prs, 2)

    ids = slide_ids(prs)
    add_sections(prs, [("Opening", "{4A3B2C1D-0001-4000-8000-000000000001}", ids[:1]), ("Body", "{4A3B2C1D-0002-4000-8000-000000000002}", ids[1:])])
    set_producer(prs, "Import fixture 01 text")

    path = out_dir / "01-text.pptx"
    save(prs, path)
    return path



# ---------------------------------------------------------------------------------------------
# Shared helpers for 02 to 04

from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION

MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006"
A14_NS = "http://schemas.microsoft.com/office/drawing/2010/main"
M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

# The children of p:sld in schema order (the transition and the timing land after p:clrMapOvr).
SLD_ORDER = ["p:cSld", "p:clrMapOvr", "mc:AlternateContent", "p:transition", "p:timing", "p:extLst"]


def sld_rank(element) -> int:
    tag = etree.QName(element.tag)
    if tag.namespace == MC_NS:
        key = "mc:AlternateContent"
    elif tag.namespace == "http://schemas.openxmlformats.org/presentationml/2006/main":
        key = f"p:{tag.localname}"
    else:
        key = tag.localname
    return SLD_ORDER.index(key) if key in SLD_ORDER else len(SLD_ORDER)


def insert_sld_child(slide, child) -> None:
    """Inserts a p:sld child at its schema position (transition before timing before extLst)."""
    root = slide._element
    own = sld_rank(child)
    for index, sibling in enumerate(root):
        if sld_rank(sibling) > own:
            root.insert(index, child)
            return
    root.append(child)


def set_solid_fill(shape, hex_color: str) -> None:
    shape.fill.solid()
    shape.fill.fore_color.rgb = RGBColor.from_string(hex_color)


def set_line(shape, hex_color: str, width_pt: float, dash: str | None = None) -> None:
    shape.line.color.rgb = RGBColor.from_string(hex_color)
    shape.line.width = Pt(width_pt)
    if dash is not None:
        ln = shape.line._get_or_add_ln()
        for old in ln.findall(qn("a:prstDash")):
            ln.remove(old)
        prst = etree.SubElement(ln, qn("a:prstDash"))
        prst.set("val", dash)
        # a:prstDash sits before a:headEnd and a:tailEnd, after the fill
        ln.remove(prst)
        placed = False
        for index, node in enumerate(ln):
            if etree.QName(node.tag).localname in ("headEnd", "tailEnd", "extLst", "miter", "round", "bevel"):
                ln.insert(index, prst)
                placed = True
                break
        if not placed:
            ln.append(prst)


def set_line_ends(shape, head: str | None, tail: str | None) -> None:
    ln = shape.line._get_or_add_ln()
    if head is not None:
        el = etree.SubElement(ln, qn("a:headEnd"))
        el.set("type", head)
    if tail is not None:
        el = etree.SubElement(ln, qn("a:tailEnd"))
        el.set("type", tail)


def set_descr(shape, descr: str) -> None:
    shape._element.xpath(".//p:cNvPr")[0].set("descr", descr)


def set_hidden(shape) -> None:
    shape._element.xpath(".//p:cNvPr")[0].set("hidden", "1")


def set_flip(shape, flip_h: bool = False, flip_v: bool = False) -> None:
    xfrm = shape._element.spPr.xfrm
    if flip_h:
        xfrm.set("flipH", "1")
    if flip_v:
        xfrm.set("flipV", "1")


def add_outer_shadow(shape, blur_emu: int, dist_emu: int, dir_60k: int, hex_color: str, alpha_pct: int) -> None:
    spPr = shape._element.spPr
    effect_lst = etree.SubElement(spPr, qn("a:effectLst"))
    shdw = etree.SubElement(effect_lst, qn("a:outerShdw"))
    shdw.set("blurRad", str(blur_emu))
    shdw.set("dist", str(dist_emu))
    shdw.set("dir", str(dir_60k))
    shdw.set("algn", "tl")
    color = etree.SubElement(shdw, qn("a:srgbClr"))
    color.set("val", hex_color)
    alpha = etree.SubElement(color, qn("a:alpha"))
    alpha.set("val", str(alpha_pct * 1000))


def text_in(shape, text: str, size_pt: int = 18, bold: bool = False) -> None:
    frame = shape.text_frame
    frame.word_wrap = True
    frame.text = text
    for paragraph in frame.paragraphs:
        for run in paragraph.runs:
            run.font.size = Pt(size_pt)
            run.font.bold = bold


def image_bytes(kind: str, size: tuple[int, int], color: tuple[int, int, int], label: str) -> io.BytesIO:
    """A small two colour picture with a bar so the reader has a real raster (Pillow)."""
    from PIL import Image, ImageDraw

    mode = "RGBA" if kind == "PNG" else "RGB"
    background = color + ((255,) if mode == "RGBA" else ())
    image = Image.new(mode, size, background)
    draw = ImageDraw.Draw(image)
    draw.rectangle([size[0] // 4, size[1] // 3, 3 * size[0] // 4, 2 * size[1] // 3], fill=(7, 7, 7))
    draw.text((8, 8), label, fill=(7, 7, 7))
    buffer = io.BytesIO()
    if kind == "GIF":
        image = image.convert("P", palette=Image.ADAPTIVE)
    image.save(buffer, format=kind)
    buffer.seek(0)
    return buffer


# ---------------------------------------------------------------------------------------------
# 02-shapes


def build_02_shapes(out_dir: Path) -> Path:
    prs = Presentation()
    widen_to_16_9(prs)
    blank = prs.slide_layouts[6]

    # Slide 1: presets, adjusts, fills, outlines with every dash, rotation, flips, a shadow.
    s1 = prs.slides.add_slide(blank)
    s1._element.cSld.set("name", "Presets and outlines")
    rr = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(457_200), Emu(457_200), Emu(2_286_000), Emu(1_371_600))
    rr.name = "Rounded plate"
    rr.adjustments[0] = 0.3
    set_solid_fill(rr, "2F5CE0")
    set_line(rr, "070707", 1.5, "solid")
    text_in(rr, "Rounded", 20)
    ellipse = s1.shapes.add_shape(MSO_SHAPE.OVAL, Emu(3_048_000), Emu(457_200), Emu(1_828_800), Emu(1_371_600))
    ellipse.name = "Ellipse"
    set_solid_fill(ellipse, "12A37A")
    set_line(ellipse, "070707", 2, "dot")
    triangle = s1.shapes.add_shape(MSO_SHAPE.ISOSCELES_TRIANGLE, Emu(5_181_600), Emu(457_200), Emu(1_828_800), Emu(1_371_600))
    triangle.name = "Triangle"
    set_solid_fill(triangle, "F0A020")
    set_line(triangle, "3A3D44", 1, "dash")
    triangle.rotation = 15
    chevron = s1.shapes.add_shape(MSO_SHAPE.CHEVRON, Emu(7_315_200), Emu(457_200), Emu(1_828_800), Emu(1_371_600))
    chevron.name = "Chevron"
    set_solid_fill(chevron, "E5484D")
    set_line(chevron, "070707", 1, "dashDot")
    chevron.rotation = 345
    callout = s1.shapes.add_shape(MSO_SHAPE.RECTANGULAR_CALLOUT, Emu(9_448_800), Emu(457_200), Emu(2_286_000), Emu(1_371_600))
    callout.name = "Callout"
    callout.adjustments[0] = -0.4
    callout.adjustments[1] = 0.9
    set_solid_fill(callout, "FFFFFF")
    set_line(callout, "070707", 1, "lgDash")
    text_in(callout, "A callout", 16)
    decision = s1.shapes.add_shape(MSO_SHAPE.FLOWCHART_DECISION, Emu(457_200), Emu(2_286_000), Emu(2_286_000), Emu(1_371_600))
    decision.name = "Decision"
    set_solid_fill(decision, "F6F6F6")
    set_line(decision, "8A8F98", 3, "lgDashDot")
    text_in(decision, "Yes or no", 16)
    flipped = s1.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Emu(3_048_000), Emu(2_286_000), Emu(1_828_800), Emu(914_400))
    flipped.name = "Flipped arrow"
    set_solid_fill(flipped, "070707")
    set_flip(flipped, flip_h=True)
    both = s1.shapes.add_shape(MSO_SHAPE.RIGHT_TRIANGLE, Emu(5_181_600), Emu(2_286_000), Emu(1_828_800), Emu(914_400))
    both.name = "Flipped both"
    set_solid_fill(both, "3A3D44")
    set_flip(both, flip_h=True, flip_v=True)
    shadowed = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(7_315_200), Emu(2_286_000), Emu(2_286_000), Emu(914_400))
    shadowed.name = "Shadowed"
    set_solid_fill(shadowed, "FFFFFF")
    set_line(shadowed, "070707", 1, "sysDot")
    add_outer_shadow(shadowed, 76_200, 38_100, 2_700_000, "000000", 40)
    unfilled = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(9_906_000), Emu(2_286_000), Emu(1_828_800), Emu(914_400))
    unfilled.name = "Outline only"
    unfilled.fill.background()
    set_line(unfilled, "070707", 4, "sysDash")
    gradient = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(457_200), Emu(4_114_800), Emu(2_286_000), Emu(914_400))
    gradient.name = "Gradient"
    gradient.fill.gradient()
    gradient.fill.gradient_stops[0].color.rgb = RGBColor(0x2F, 0x5C, 0xE0)
    gradient.fill.gradient_stops[1].color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    set_descr(gradient, "A blue to white gradient")
    hidden = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(3_048_000), Emu(4_114_800), Emu(914_400), Emu(914_400))
    hidden.name = "Hidden box"
    set_hidden(hidden)
    threed = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(4_267_200), Emu(4_114_800), Emu(1_828_800), Emu(914_400))
    threed.name = "Three D"
    set_solid_fill(threed, "8A8F98")
    scene = etree.SubElement(threed._element.spPr, qn("a:scene3d"))
    camera = etree.SubElement(scene, qn("a:camera"))
    camera.set("prst", "orthographicFront")
    rig = etree.SubElement(scene, qn("a:lightRig"))
    rig.set("rig", "threePt")
    rig.set("dir", "t")
    sp3d = etree.SubElement(threed._element.spPr, qn("a:sp3d"))
    sp3d.set("extrusionH", "57150")

    # Slide 2: lines and connectors with heads and attachments, a freeform with a curve.
    s2 = prs.slides.add_slide(blank)
    s2._element.cSld.set("name", "Lines and connectors")
    left = s2.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(914_400), Emu(1_371_600), Emu(1_828_800), Emu(1_371_600))
    left.name = "Left box"
    set_solid_fill(left, "F6F6F6")
    set_line(left, "070707", 1)
    right = s2.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(6_400_800), Emu(3_657_600), Emu(1_828_800), Emu(1_371_600))
    right.name = "Right box"
    set_solid_fill(right, "F6F6F6")
    set_line(right, "070707", 1)
    straight = s2.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Emu(914_400), Emu(3_657_600), Emu(4_572_000), Emu(3_657_600))
    straight.name = "Straight arrow"
    set_line(straight, "070707", 2)
    set_line_ends(straight, "oval", "triangle")
    elbow = s2.shapes.add_connector(MSO_CONNECTOR.ELBOW, Emu(2_743_200), Emu(2_057_400), Emu(6_400_800), Emu(4_343_400))
    elbow.name = "Elbow"
    elbow.begin_connect(left, 3)
    elbow.end_connect(right, 1)
    set_line(elbow, "2F5CE0", 1.5, "dash")
    set_line_ends(elbow, None, "stealth")
    curved = s2.shapes.add_connector(MSO_CONNECTOR.CURVE, Emu(1_828_800), Emu(2_743_200), Emu(7_315_200), Emu(3_657_600))
    curved.name = "Curved"
    curved.begin_connect(left, 2)
    curved.end_connect(right, 0)
    set_line(curved, "12A37A", 1)
    hair = s2.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Emu(9_144_000), Emu(1_371_600), Emu(11_887_200), Emu(1_371_600))
    hair.name = "Hair rule"
    set_line(hair, "070707", 0.75)
    vertical = s2.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Emu(9_144_000), Emu(2_286_000), Emu(9_144_000), Emu(5_486_400))
    vertical.name = "Vertical line"
    set_line(vertical, "3A3D44", 3)
    builder = s2.shapes.build_freeform(Emu(9_601_200), Emu(2_286_000), scale=1.0)
    builder.add_line_segments([(Emu(11_430_000), Emu(2_286_000)), (Emu(11_430_000), Emu(4_114_800))], close=False)
    freeform = builder.convert_to_shape()
    freeform.name = "Freeform"
    set_solid_fill(freeform, "F0A020")
    set_line(freeform, "070707", 1)
    # a cubic Bezier back to the start, then close
    path_el = freeform._element.spPr.custGeom.pathLst.path_lst[0] if hasattr(freeform._element.spPr.custGeom.pathLst, "path_lst") else freeform._element.spPr.custGeom.pathLst.findall(qn("a:path"))[0]
    cubic = etree.SubElement(path_el, qn("a:cubicBezTo"))
    for x, y in ((Emu(11_430_000), Emu(5_029_200)), (Emu(9_601_200), Emu(5_029_200)), (Emu(9_601_200), Emu(2_286_000))):
        pt = etree.SubElement(cubic, qn("a:pt"))
        pt.set("x", str(int(x) - 9_601_200))
        pt.set("y", str(int(y) - 2_286_000))
    etree.SubElement(path_el, qn("a:close"))

    # Slide 3: a rotated group of three, a nested group, a group of one.
    s3 = prs.slides.add_slide(blank)
    s3._element.cSld.set("name", "Groups")
    group = s3.shapes.add_group_shape()
    group.name = "Trio"
    for index, (color, name) in enumerate((("2F5CE0", "Trio one"), ("12A37A", "Trio two"), ("F0A020", "Trio three"))):
        member = group.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(914_400 + index * 1_371_600), Emu(1_371_600), Emu(1_143_000), Emu(914_400))
        member.name = name
        set_solid_fill(member, color)
        text_in(member, str(index + 1), 16)
    group.rotation = 30
    outer = s3.shapes.add_group_shape()
    outer.name = "Outer"
    outer_box = outer.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(6_400_800), Emu(1_371_600), Emu(1_371_600), Emu(1_371_600))
    outer_box.name = "Outer box"
    set_solid_fill(outer_box, "3A3D44")
    inner = outer.shapes.add_group_shape()
    inner.name = "Inner"
    for index, name in enumerate(("Inner one", "Inner two")):
        member = inner.shapes.add_shape(MSO_SHAPE.OVAL, Emu(8_229_600 + index * 1_143_000), Emu(1_371_600), Emu(914_400), Emu(914_400))
        member.name = name
        set_solid_fill(member, "E5484D")
    lone = s3.shapes.add_group_shape()
    lone.name = "Lone group"
    only = lone.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(914_400), Emu(4_114_800), Emu(2_286_000), Emu(914_400))
    only.name = "Lone member"
    set_solid_fill(only, "F6F6F6")
    set_line(only, "070707", 1)
    set_descr(only, "The only member of its group")

    set_producer(prs, "Import fixture 02 shapes")
    path = out_dir / "02-shapes.pptx"
    save(prs, path)
    return path


# ---------------------------------------------------------------------------------------------
# 03-pictures-tables


def add_blip_background(slide, image_stream) -> None:
    """A picture background: p:bg/p:bgPr/a:blipFill with the image as a related part."""
    image_part, rId = slide.part.get_or_add_image_part(image_stream)
    cSld = slide._element.cSld
    bg = etree.Element(qn("p:bg"))
    bgPr = etree.SubElement(bg, qn("p:bgPr"))
    blipFill = etree.SubElement(bgPr, qn("a:blipFill"))
    blipFill.set("dpi", "0")
    blipFill.set("rotWithShape", "1")
    blip = etree.SubElement(blipFill, qn("a:blip"))
    blip.set(qn("r:embed"), rId)
    stretch = etree.SubElement(blipFill, qn("a:stretch"))
    etree.SubElement(stretch, qn("a:fillRect"))
    etree.SubElement(bgPr, qn("a:effectLst"))
    cSld.insert(0, bg)


def set_cell_bottom_border(cell, hex_color: str, width_emu: int) -> None:
    tcPr = cell._tc.get_or_add_tcPr()
    lnB = etree.SubElement(tcPr, qn("a:lnB"))
    lnB.set("w", str(width_emu))
    lnB.set("cap", "flat")
    lnB.set("cmpd", "sng")
    fill = etree.SubElement(lnB, qn("a:solidFill"))
    color = etree.SubElement(fill, qn("a:srgbClr"))
    color.set("val", hex_color)
    dash = etree.SubElement(lnB, qn("a:prstDash"))
    dash.set("val", "solid")
    # a:lnB precedes the fill children of a:tcPr
    tcPr.remove(lnB)
    tcPr.insert(0, lnB)


def set_cell_left_border(cell, hex_color: str, width_emu: int) -> None:
    tcPr = cell._tc.get_or_add_tcPr()
    lnL = etree.SubElement(tcPr, qn("a:lnL"))
    lnL.set("w", str(width_emu))
    fill = etree.SubElement(lnL, qn("a:solidFill"))
    color = etree.SubElement(fill, qn("a:srgbClr"))
    color.set("val", hex_color)
    tcPr.remove(lnL)
    tcPr.insert(0, lnL)


def build_03_pictures_tables(out_dir: Path) -> Path:
    prs = Presentation()
    widen_to_16_9(prs)
    blank = prs.slide_layouts[6]

    # Slide 1: four formats, crops, a mask, adjustments, a frame, a solid background.
    s1 = prs.slides.add_slide(blank)
    s1._element.cSld.set("name", "Pictures")
    s1.background.fill.solid()
    s1.background.fill.fore_color.rgb = RGBColor(0xF6, 0xF6, 0xF6)
    png = s1.shapes.add_picture(image_bytes("PNG", (320, 180), (47, 92, 224), "PNG"), Emu(457_200), Emu(457_200), Emu(2_438_400), Emu(1_371_600))
    png.name = "PNG picture"
    set_descr(png, "A blue PNG with a dark bar")
    jpeg = s1.shapes.add_picture(image_bytes("JPEG", (320, 180), (18, 163, 122), "JPEG"), Emu(3_200_400), Emu(457_200), Emu(2_438_400), Emu(1_371_600))
    jpeg.name = "JPEG picture"
    jpeg.crop_left = 0.1
    jpeg.crop_right = 0.1
    jpeg.crop_top = 0.05
    gif = s1.shapes.add_picture(image_bytes("GIF", (320, 180), (240, 160, 32), "GIF"), Emu(5_943_600), Emu(457_200), Emu(2_438_400), Emu(1_371_600))
    gif.name = "GIF picture"
    gif.auto_shape_type = MSO_SHAPE.OVAL
    bmp = s1.shapes.add_picture(image_bytes("BMP", (320, 180), (229, 72, 77), "BMP"), Emu(8_686_800), Emu(457_200), Emu(2_438_400), Emu(1_371_600))
    bmp.name = "BMP picture"
    faded = s1.shapes.add_picture(image_bytes("PNG", (320, 180), (138, 143, 152), "FADE"), Emu(457_200), Emu(2_286_000), Emu(2_438_400), Emu(1_371_600))
    faded.name = "Faded picture"
    blip = faded._element.blipFill.blip
    alpha = etree.SubElement(blip, qn("a:alphaModFix"))
    alpha.set("amt", "60000")
    lum = etree.SubElement(blip, qn("a:lum"))
    lum.set("bright", "20000")
    lum.set("contrast", "-10000")
    framed = s1.shapes.add_picture(image_bytes("PNG", (320, 180), (255, 255, 255), "FRAME"), Emu(3_200_400), Emu(2_286_000), Emu(2_438_400), Emu(1_371_600))
    framed.name = "Framed picture"
    framed.line.color.rgb = RGBColor(0x07, 0x07, 0x07)
    framed.line.width = Pt(1.5)
    gray = s1.shapes.add_picture(image_bytes("JPEG", (320, 180), (47, 92, 224), "GRAY"), Emu(5_943_600), Emu(2_286_000), Emu(2_438_400), Emu(1_371_600))
    gray.name = "Grayscale picture"
    etree.SubElement(gray._element.blipFill.blip, qn("a:grayscl"))
    same = s1.shapes.add_picture(image_bytes("PNG", (320, 180), (47, 92, 224), "PNG"), Emu(8_686_800), Emu(2_286_000), Emu(2_438_400), Emu(1_371_600))
    same.name = "Same PNG again"

    # Slide 2: a 4 by 5 table with merges, fills, borders and a header row; a picture background.
    s2 = prs.slides.add_slide(blank)
    s2._element.cSld.set("name", "Tables")
    add_blip_background(s2, image_bytes("PNG", (640, 360), (246, 246, 246), "BG"))
    frame = s2.shapes.add_table(5, 4, Emu(914_400), Emu(914_400), Emu(7_315_200), Emu(3_657_600))
    frame.name = "Plans table"
    table = frame.table
    table.first_row = True
    headers = ("Plan", "Seats", "Price", "Support")
    rows = (("Starter", "5", "$49", "Email"), ("Team", "25", "$199", "Chat"), ("Enterprise", "Unlimited", "Call us", "Phone"), ("Notes", "", "", ""))
    for c, header in enumerate(headers):
        cell = table.cell(0, c)
        cell.text = header
        cell.fill.solid()
        cell.fill.fore_color.rgb = RGBColor(0x07, 0x07, 0x07)
        cell.text_frame.paragraphs[0].runs[0].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        cell.text_frame.paragraphs[0].runs[0].font.size = Pt(16)
        cell.text_frame.paragraphs[0].runs[0].font.bold = True
    for r, values in enumerate(rows, start=1):
        for c, value in enumerate(values):
            cell = table.cell(r, c)
            cell.text = value
            for run in cell.text_frame.paragraphs[0].runs:
                run.font.size = Pt(16)
            set_cell_bottom_border(cell, "070707", 12_700)
    # the Notes row spans the four columns; Seats and Price of Enterprise merge vertically with Notes
    table.cell(4, 0).merge(table.cell(4, 3))
    table.cell(4, 0).text = "Prices are per month"
    table.cell(4, 0).text_frame.paragraphs[0].runs[0].font.size = Pt(14)
    table.cell(1, 2).fill.solid()
    table.cell(1, 2).fill.fore_color.rgb = RGBColor(0xF6, 0xF6, 0xF6)
    table.cell(2, 2).fill.solid()
    table.cell(2, 2).fill.fore_color.rgb = RGBColor(0xF6, 0xF6, 0xF6)
    table.cell(3, 2).fill.solid()
    table.cell(3, 2).fill.fore_color.rgb = RGBColor(0xF6, 0xF6, 0xF6)
    set_cell_left_border(table.cell(1, 3), "2F5CE0", 25_400)
    table.cell(2, 1).merge(table.cell(3, 1))
    table.cell(2, 1).text = "25 to unlimited"
    table.cell(2, 1).text_frame.paragraphs[0].runs[0].font.size = Pt(16)
    for c in range(4):
        table.columns[c].width = Emu(1_828_800)
    wide = s2.shapes.add_table(2, 21, Emu(457_200), Emu(5_029_200), Emu(11_277_600), Emu(914_400))
    wide.name = "Wide table"
    for c in range(21):
        wide.table.cell(0, c).text = f"C{c + 1}"
        wide.table.cell(1, c).text = str(c + 1)

    set_producer(prs, "Import fixture 03 pictures and tables")
    path = out_dir / "03-pictures-tables.pptx"
    save(prs, path)
    return path


# ---------------------------------------------------------------------------------------------
# 04-charts-motion-media


def add_transition(slide, xml: str) -> None:
    element = etree.fromstring(xml)
    insert_sld_child(slide, element)


P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
NSMAP_TIMING = f'xmlns:p="{P_NS}" xmlns:a="{A_NS}"'


def effect_xml(node_id: int, spid: int, preset_class: str, preset_id: int, node_type: str, subtype: int = 0, dur: int = 500) -> str:
    """One effect node of the main sequence: a set of visibility (Appear and Disappear) or an anim."""
    visibility = "visible" if preset_class == "entr" else "hidden"
    if preset_id == 1:
        behaviour = (
            f'<p:set><p:cBhvr><p:cTn id="{node_id + 1}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>'
            f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr>'
            f'<p:to><p:strVal val="{visibility}"/></p:to></p:set>'
        )
    else:
        behaviour = (
            f'<p:set><p:cBhvr><p:cTn id="{node_id + 1}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>'
            f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr>'
            f'<p:to><p:strVal val="{visibility}"/></p:to></p:set>'
            f'<p:animEffect transition="{"in" if preset_class == "entr" else "out"}" filter="fade"><p:cBhvr><p:cTn id="{node_id + 2}" dur="{dur}"/>'
            f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl></p:cBhvr></p:animEffect>'
        )
    return (
        f'<p:par><p:cTn id="{node_id}" presetID="{preset_id}" presetClass="{preset_class}" presetSubtype="{subtype}" fill="hold" nodeType="{node_type}">'
        f"<p:stCondLst><p:cond delay=\"0\"/></p:stCondLst><p:childTnLst>{behaviour}</p:childTnLst></p:cTn></p:par>"
    )


def add_timing(slide, clicks: list[list[tuple[int, str, int, str, int, int]]], build_by_paragraph: list[int]) -> None:
    """A p:timing tree: one clickPar per click, each holding its effects (spid, class, presetID, nodeType, subtype, dur)."""
    node_id = 2
    click_xml = []
    for effects in clicks:
        inner = []
        for spid, preset_class, preset_id, node_type, subtype, dur in effects:
            node_id += 3
            inner.append(effect_xml(node_id, spid, preset_class, preset_id, node_type, subtype, dur))
        node_id += 1
        with_group = f'<p:par><p:cTn id="{node_id}" fill="hold" nodeType="withGroup"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>{"".join(inner)}</p:childTnLst></p:cTn></p:par>'
        node_id += 1
        click_xml.append(
            f'<p:par><p:cTn id="{node_id}" fill="hold" nodeType="clickPar"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst>{with_group}</p:childTnLst></p:cTn></p:par>'
        )
    builds = "".join(f'<p:bldP spid="{spid}" grpId="0" build="p"/>' for spid in build_by_paragraph)
    xml = (
        f"<p:timing {NSMAP_TIMING}><p:tnLst><p:par><p:cTn id=\"1\" dur=\"indefinite\" restart=\"never\" nodeType=\"tmRoot\"><p:childTnLst>"
        f'<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>{"".join(click_xml)}</p:childTnLst></p:cTn>'
        f'<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
        f'<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>'
        f"</p:childTnLst></p:cTn></p:par></p:tnLst>{('<p:bldLst>' + builds + '</p:bldLst>') if builds else ''}</p:timing>"
    )
    insert_sld_child(slide, etree.fromstring(xml))


def shape_id(shape) -> int:
    return int(shape._element.xpath(".//p:cNvPr")[0].get("id"))


def add_math_shape(slide) -> None:
    """A math object: mc:AlternateContent with the a14:m Choice and a picture Fallback."""
    fallback_part, rId = slide.part.get_or_add_image_part(image_bytes("PNG", (240, 80), (255, 255, 255), "a/b"))
    xml = f"""<mc:AlternateContent xmlns:mc="{MC_NS}" xmlns:p="{P_NS}" xmlns:a="{A_NS}" xmlns:r="{R_NS}">
  <mc:Choice xmlns:a14="{A14_NS}" Requires="a14">
    <p:sp>
      <p:nvSpPr><p:cNvPr id="900" name="Equation"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="7315200" y="4114800"/><a:ext cx="2743200" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>
      <p:txBody><a:bodyPr wrap="none"/><a:lstStyle/><a:p><a14:m><m:oMathPara xmlns:m="{M_NS}"><m:oMath>
        <m:f><m:fPr><m:type m:val="bar"/></m:fPr><m:num><m:r><m:t>a</m:t></m:r></m:num><m:den><m:r><m:t>b</m:t></m:r></m:den></m:f>
        <m:r><m:t>+</m:t></m:r><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup>
        <m:r><m:t>=</m:t></m:r><m:rad><m:radPr><m:degHide m:val="on"/></m:radPr><m:deg/><m:e><m:r><m:t>y</m:t></m:r></m:e></m:rad>
      </m:oMath></m:oMathPara></a14:m><a:endParaRPr lang="en-US" sz="1800"/></a:p></p:txBody>
    </p:sp>
  </mc:Choice>
  <mc:Fallback>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="900" name="Equation"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="7315200" y="4114800"/><a:ext cx="2743200" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        <a:blipFill><a:blip r:embed="{rId}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody>
    </p:sp>
  </mc:Fallback>
</mc:AlternateContent>"""
    slide.shapes._spTree.append(etree.fromstring(xml))


def build_04_charts_motion_media(out_dir: Path) -> Path:
    prs = Presentation()
    widen_to_16_9(prs)
    blank = prs.slide_layouts[6]
    repo = Path(__file__).resolve().parent.parent

    # Slide 1: the four kinds with titles, legends at each position, labels, formats; a fade transition.
    s1 = prs.slides.add_slide(blank)
    s1._element.cSld.set("name", "Charts")
    quarters = CategoryChartData()
    quarters.categories = ["Q1", "Q2", "Q3", "Q4"]
    quarters.add_series("Revenue", (1200, 1450, 1600, 2100), number_format="#,##0")
    quarters.add_series("Cost", (800, 900, 950, 1100), number_format="#,##0")
    column = s1.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Emu(457_200), Emu(457_200), Emu(5_486_400), Emu(3_200_400), quarters).chart
    column.has_title = True
    column.chart_title.text_frame.text = "Revenue and cost"
    column.has_legend = True
    column.legend.position = XL_LEGEND_POSITION.BOTTOM
    column.legend.include_in_layout = False
    column.plots[0].has_data_labels = True
    column.plots[0].data_labels.show_value = True
    column.plots[0].data_labels.number_format = "#,##0"
    column.plots[0].data_labels.number_format_is_linked = False
    share = CategoryChartData()
    share.categories = ["North", "South", "East", "West"]
    share.add_series("Share", (0.41, 0.24, 0.2, 0.15), number_format="0%")
    bar = s1.shapes.add_chart(XL_CHART_TYPE.BAR_CLUSTERED, Emu(6_400_800), Emu(457_200), Emu(5_334_000), Emu(3_200_400), share).chart
    bar.has_title = True
    bar.chart_title.text_frame.text = "Share by region"
    bar.has_legend = True
    bar.legend.position = XL_LEGEND_POSITION.RIGHT
    bar.plots[0].has_data_labels = True
    bar.plots[0].data_labels.show_percentage = False
    bar.plots[0].data_labels.show_value = True
    bar.plots[0].data_labels.number_format = "0%"
    bar.plots[0].data_labels.number_format_is_linked = False
    months = CategoryChartData()
    months.categories = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
    months.add_series("Users", (120, 150, 180, 210, 260, 300))
    line = s1.shapes.add_chart(XL_CHART_TYPE.LINE_MARKERS, Emu(457_200), Emu(3_886_200), Emu(5_486_400), Emu(2_743_200), months).chart
    line.has_title = True
    line.chart_title.text_frame.text = "Users"
    line.has_legend = True
    line.legend.position = XL_LEGEND_POSITION.TOP
    pie_data = CategoryChartData()
    pie_data.categories = ["Starter", "Team", "Enterprise"]
    pie_data.add_series("Plans", (55, 30, 15))
    pie = s1.shapes.add_chart(XL_CHART_TYPE.PIE, Emu(6_400_800), Emu(3_886_200), Emu(5_334_000), Emu(2_743_200), pie_data).chart
    pie.has_title = True
    pie.chart_title.text_frame.text = "Plans"
    pie.has_legend = True
    pie.legend.position = XL_LEGEND_POSITION.LEFT
    pie.plots[0].has_data_labels = True
    pie.plots[0].data_labels.show_percentage = True
    add_transition(s1, f'<p:transition xmlns:p="{P_NS}" spd="med"><p:fade/></p:transition>')

    # Slide 2: substitutions and truncations; a push transition with an automatic advance.
    s2 = prs.slides.add_slide(blank)
    s2._element.cSld.set("name", "Chart substitutions")
    doughnut = s2.shapes.add_chart(XL_CHART_TYPE.DOUGHNUT, Emu(457_200), Emu(457_200), Emu(3_657_600), Emu(2_743_200), pie_data).chart
    doughnut.has_title = True
    doughnut.chart_title.text_frame.text = "Doughnut"
    # python-pptx writes no 3D bar chart: a flat bar chart retagged to c:bar3DChart (the fold the reader makes)
    threed = s2.shapes.add_chart(XL_CHART_TYPE.BAR_CLUSTERED, Emu(4_267_200), Emu(457_200), Emu(3_657_600), Emu(2_743_200), share).chart
    threed.has_title = True
    threed.chart_title.text_frame.text = "Three D bars"
    threed._chartSpace.chart.plotArea.find(qn("c:barChart")).tag = qn("c:bar3DChart")
    stacked = s2.shapes.add_chart(XL_CHART_TYPE.COLUMN_STACKED, Emu(8_077_200), Emu(457_200), Emu(3_657_600), Emu(2_743_200), quarters).chart
    stacked.has_title = True
    stacked.chart_title.text_frame.text = "Stacked"
    many = CategoryChartData()
    many.categories = [f"C{i + 1}" for i in range(13)]
    for index in range(7):
        many.add_series(f"Series {index + 1}", tuple(float(index + 1 + i) for i in range(13)))
    wide = s2.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Emu(457_200), Emu(3_429_000), Emu(6_400_800), Emu(3_200_400), many).chart
    wide.has_title = True
    wide.chart_title.text_frame.text = "Thirteen by seven"
    # a combination chart: the line plot of a second chart moved into the column chart's plot area
    combo_frame = s2.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Emu(7_315_200), Emu(3_429_000), Emu(4_419_600), Emu(3_200_400), quarters)
    combo_frame.name = "Combination"
    combo = combo_frame.chart
    combo.has_title = True
    combo.chart_title.text_frame.text = "Combination"
    donor_frame = s2.shapes.add_chart(XL_CHART_TYPE.LINE, Emu(0), Emu(0), Emu(914_400), Emu(914_400), months)
    donor_plot = donor_frame.chart._chartSpace.chart.plotArea
    line_el = donor_plot.find(qn("c:lineChart"))
    target_plot = combo._chartSpace.chart.plotArea
    bar_el = target_plot.find(qn("c:barChart"))
    axis_ids = [ax.get("val") for ax in bar_el.findall(qn("c:axId"))]
    for ax, value in zip(line_el.findall(qn("c:axId")), axis_ids):
        ax.set("val", value)
    bar_el.addnext(line_el)
    donor_frame._element.getparent().remove(donor_frame._element)
    add_transition(s2, f'<p:transition xmlns:p="{P_NS}" spd="fast" advClick="1" advTm="4000"><p:push dir="l"/></p:transition>')

    # Slide 3: the animated shapes, a dissolve transition, and the timing tree with a By paragraph build.
    s3 = prs.slides.add_slide(blank)
    s3._element.cSld.set("name", "Motion")
    appear = s3.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(457_200), Emu(914_400), Emu(2_743_200), Emu(1_371_600))
    appear.name = "Appears"
    set_solid_fill(appear, "2F5CE0")
    text_in(appear, "Appear on click", 18)
    fades = s3.shapes.add_shape(MSO_SHAPE.OVAL, Emu(3_657_600), Emu(914_400), Emu(2_743_200), Emu(1_371_600))
    fades.name = "Fades in"
    set_solid_fill(fades, "12A37A")
    text_in(fades, "Fade with previous", 18)
    flies = s3.shapes.add_shape(MSO_SHAPE.CHEVRON, Emu(6_858_000), Emu(914_400), Emu(2_743_200), Emu(1_371_600))
    flies.name = "Flies in"
    set_solid_fill(flies, "F0A020")
    text_in(flies, "Fly in after previous", 18)
    leaves = s3.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(457_200), Emu(3_200_400), Emu(2_743_200), Emu(1_371_600))
    leaves.name = "Fades out"
    set_solid_fill(leaves, "E5484D")
    text_in(leaves, "Fade out on click", 18)
    rows = s3.shapes.add_textbox(Emu(3_657_600), Emu(3_200_400), Emu(6_400_800), Emu(2_286_000))
    rows.name = "Pricing rows"
    frame = rows.text_frame
    frame.word_wrap = True
    for index, text in enumerate(("Starter, $49 a month", "Team, $199 a month", "Enterprise, call us")):
        paragraph = frame.paragraphs[0] if index == 0 else frame.add_paragraph()
        paragraph.text = text
        ppr = paragraph._p.get_or_add_pPr()
        ppr.set("marL", "342900")
        ppr.set("indent", "-342900")
        bu = etree.SubElement(ppr, qn("a:buChar"))
        bu.set("char", "•")
        for run in paragraph.runs:
            run.font.size = Pt(20)
    add_transition(s3, f'<p:transition xmlns:p="{P_NS}" spd="slow"><p:dissolve/></p:transition>')
    add_timing(
        s3,
        [
            [(shape_id(appear), "entr", 1, "clickEffect", 0, 1), (shape_id(fades), "entr", 10, "withEffect", 0, 500)],
            [(shape_id(flies), "entr", 2, "afterEffect", 4, 750)],
            [(shape_id(leaves), "exit", 10, "clickEffect", 0, 500)],
            [(shape_id(rows), "entr", 1, "clickEffect", 0, 1)],
        ],
        [shape_id(rows)],
    )

    # Slide 4: a video with a poster, an audio icon, a p14:flip transition inside mc:AlternateContent, the math object.
    s4 = prs.slides.add_slide(blank)
    s4._element.cSld.set("name", "Media")
    video = s4.shapes.add_movie(
        str(repo / "fixtures" / "media" / "bars-1s.mp4"),
        Emu(457_200),
        Emu(457_200),
        Emu(4_876_800),
        Emu(2_743_200),
        poster_frame_image=image_bytes("PNG", (320, 180), (7, 7, 7), "VIDEO"),
        mime_type="video/mp4",
    )
    video.name = "Demo clip"
    audio = s4.shapes.add_movie(
        str(repo / "fixtures" / "media" / "tone-1s.mp3"),
        Emu(5_791_200),
        Emu(457_200),
        Emu(609_600),
        Emu(609_600),
        poster_frame_image=image_bytes("PNG", (64, 64), (255, 255, 255), "AUDIO"),
        mime_type="audio/mpeg",
    )
    audio.name = "Tone"
    video_file = audio._element.xpath(".//a:videoFile")[0]
    video_file.tag = qn("a:audioFile")
    add_math_shape(s4)
    flip = (
        f'<mc:AlternateContent xmlns:mc="{MC_NS}"><mc:Choice xmlns:p14="{P14_NS}" Requires="p14">'
        f'<p:transition xmlns:p="{P_NS}" spd="slow" p14:dur="1250"><p14:flip dir="l"/></p:transition></mc:Choice>'
        f'<mc:Fallback><p:transition xmlns:p="{P_NS}" spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>'
    )
    add_transition(s4, flip)

    set_producer(prs, "Import fixture 04 charts, motion and media")
    path = out_dir / "04-charts-motion-media.pptx"
    save(prs, path)
    return path


BUILDERS = {
    "01": build_01_text,
    "02": build_02_shapes,
    "03": build_03_pictures_tables,
    "04": build_04_charts_motion_media,
}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Build the PPTX import fixtures.")
    parser.add_argument("--out", default="packages/import/src/__fixtures__/pptx", help="the fixture folder")
    parser.add_argument("--only", action="append", help="a fixture number to build (01, 02, ...); default every one")
    args = parser.parse_args(argv)
    out_dir = Path(args.out)
    wanted = args.only or sorted(BUILDERS)
    for key in wanted:
        builder = BUILDERS.get(key)
        if builder is None:
            sys.stderr.write(f"pptx-fixtures: no fixture {key}; known: {', '.join(sorted(BUILDERS))}\n")
            return 2
        path = builder(out_dir)
        sys.stdout.write(f"wrote {path} ({path.stat().st_size} bytes)\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
