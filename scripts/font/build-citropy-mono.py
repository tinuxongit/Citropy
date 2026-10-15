"""Build Citropy Mono: a monospaced, code-focused derivative of Google Sans Flex,
tuned like Citropy Sans (ROND 60, ss01/ss02) with clarity glyphs for code,
texture healing, joined operators, a true italic and drawn terminal glyphs.
Needs fonttools, brotli, skia-pathops and ttfautohint-py."""
import io
import math
import sys
import unicodedata
import urllib.request
from pathlib import Path

import pathops
from fontTools import subset
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.pens.areaPen import AreaPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from ttfautohint import ttfautohint

SOURCE_COMMIT = "a0e3dbcdc3a3ecfafff3f071159ae0221628922d"
SOURCE_ROOT = f"https://raw.githubusercontent.com/google/fonts/{SOURCE_COMMIT}/"
SOURCE_FILE = "ofl/googlesansflex/GoogleSansFlex%5BGRAD%2CROND%2Copsz%2Cslnt%2Cwdth%2Cwght%5D.ttf"
SYMBOLS_FILE = "ofl/googlesanscode/GoogleSansCode%5Bwght%5D.ttf"
SYMBOLS_ITALIC_FILE = "ofl/googlesanscode/GoogleSansCode-Italic%5Bwght%5D.ttf"
LICENSES = {"Google Sans Flex": "ofl/googlesansflex/OFL.txt", "Google Sans Code": "ofl/googlesanscode/OFL.txt"}
MODIFICATION_COPYRIGHT = "Modifications Copyright 2026 The Citropy Authors"

OUTPUT_FONTS = Path("public/fonts")
OUTPUT_TTF = Path("release/fonts")  # for installing on a system; not bundled
OUTPUT_LICENSE = OUTPUT_FONTS / "CitropyMono-OFL.txt"


def download(path):
    with urllib.request.urlopen(SOURCE_ROOT + path) as response:
        return response.read()


SOURCE = download(SOURCE_FILE)
SYMBOLS = download(SYMBOLS_FILE)
SYMBOLS_ITALIC = download(SYMBOLS_ITALIC_FILE)

CELL = 1400  # 0.7 em at 2000 upm
BLEED = CELL * 0.03  # terminal glyphs overlap their neighbours this much, so antialiased edges leave no seams
REACH = 300  # box lines also run this far past the line, so they still meet at taller line heights
SCALE = 1.12  # outlines grow by this; glyphs are drawn in a DESIGN-wide cell, then scaled to CELL
DESIGN = CELL / SCALE
MAX_INK = DESIGN * 0.82
MIN_INK = DESIGN * 0.6
WIDTHS = [50, 62.5, 75, 87.5, 100, 112.5, 125]
BASE_WIDTH = 87.5
FIXED = {"GRAD": 0, "ROND": 60, "opsz": 12}
SLANT = -10
STYLES = {"Regular": (370, False), "Italic": (370, True), "Bold": (660, False), "Bold Italic": (660, True)}


def wanted(code):
    """Characters that take a full cell: no combining marks, format controls, logos or ligatures."""
    return code == 0xAD or (code < 0xFB00 and unicodedata.category(chr(code)) not in ("Mn", "Me", "Cf", "Co", "Cc"))


TERMINAL = range(0x2500, 0x25A0)  # box drawing and blocks, drawn to fill the cell
SOURCE_CODES = TTFont(io.BytesIO(SOURCE)).getBestCmap()
TEXT = [chr(code) for code in sorted(SOURCE_CODES) if wanted(code)]
# Symbols Google Sans Flex lacks, from its monospaced sibling Google Sans Code
BORROWED = [code for code in sorted(TTFont(io.BytesIO(SYMBOLS)).getBestCmap()) if code not in SOURCE_CODES and code not in TERMINAL and wanted(code)] + [0xFFFD]
BRAILLE = range(0x2800, 0x2900)
POWERLINE = [0xE0A0, 0xE0A2, *range(0xE0B0, 0xE0C0)]
WIDEN = set("abcdefghknopqrstuvxyzABCDEFGHJKLNOPQRSTUVXYZ0123456789")
CUSTOM = set("lIij10")
OPERATORS = set("=+-<>*~×÷≠≤≥−")
BRACKETS = set("()[]{}")
DOTTED = set(".,:;!?ij")
WIDE = "mwMW"  # texture healing: these borrow space from a NARROW neighbour
NARROW = "ijlrtfI.,:;'"
HEAL = DESIGN * 0.08  # how far a wide letter reaches into a narrow neighbour's cell
JOIN_GAP = DESIGN * 0.14  # gap kept between joined operator bars, so they stay separate glyphs


def instance(wdth, wght, slnt):
    font = TTFont(io.BytesIO(SOURCE))
    location = {**FIXED, "wdth": wdth, "wght": wght, "slnt": slnt}
    return instancer.instantiateVariableFont(font, location, updateFontNames=False)


def feature_mapping(font, tags):
    mapping = {}
    gsub = font["GSUB"].table
    for record in gsub.FeatureList.FeatureRecord:
        if record.FeatureTag in tags:
            for index in record.Feature.LookupListIndex:
                for table in gsub.LookupList.Lookup[index].SubTable:
                    table = getattr(table, "ExtSubTable", table)
                    if hasattr(table, "mapping"):
                        mapping.update(table.mapping)
    return mapping


def outline(font, name):
    glyphs = font.getGlyphSet()
    pen = DecomposingRecordingPen(glyphs)
    glyphs[name].draw(pen)
    return pen


def bounds(recording):
    pen = BoundsPen(None)
    recording.replay(pen)
    return pen.bounds


def to_path(recording, transform=(1, 0, 0, 1, 0, 0)):
    path = pathops.Path()
    recording.replay(TransformPen(path.getPen(), transform))
    return path


def stroke(points, width, cap=pathops.LineCap.BUTT_CAP):
    path = pathops.Path()
    pen = path.getPen()
    pen.moveTo(points[0])
    for point in points[1:]:
        pen.lineTo(point)
    pen.endPath()
    path.stroke(width, cap, pathops.LineJoin.ROUND_JOIN, 4)
    path.convertConicsToQuads()
    return path


def rect(x0, y0, x1, y1):
    path = pathops.Path()
    pen = path.getPen()
    pen.moveTo((x0, y0))
    pen.lineTo((x0, y1))
    pen.lineTo((x1, y1))
    pen.lineTo((x1, y0))
    pen.closePath()
    return path


def ellipse(cx, cy, rx, ry):
    k = 0.5523
    path = pathops.Path()
    pen = path.getPen()
    pen.moveTo((cx + rx, cy))
    pen.curveTo((cx + rx, cy + k * ry), (cx + k * rx, cy + ry), (cx, cy + ry))
    pen.curveTo((cx - k * rx, cy + ry), (cx - rx, cy + k * ry), (cx - rx, cy))
    pen.curveTo((cx - rx, cy - k * ry), (cx - k * rx, cy - ry), (cx, cy - ry))
    pen.curveTo((cx + k * rx, cy - ry), (cx + rx, cy - k * ry), (cx + rx, cy))
    pen.closePath()
    return path


def hook(x, top, bottom, radius, end, width):
    """Centerline of a stem that turns right into a tail, stroked."""
    k = 0.5523
    path = pathops.Path()
    pen = path.getPen()
    pen.moveTo((x, top))
    pen.lineTo((x, bottom + radius))
    pen.curveTo((x, bottom + radius * (1 - k)), (x + radius * (1 - k), bottom), (x + radius, bottom))
    pen.lineTo((end, bottom))
    pen.endPath()
    path.stroke(width, pathops.LineCap.BUTT_CAP, pathops.LineJoin.ROUND_JOIN, 4)
    return path


def union(*paths):
    result = paths[0]
    for path in paths[1:]:
        result = pathops.op(result, path, pathops.PathOp.UNION)
    return result


def offset(path, distance):
    """Grow (distance > 0) or shrink the shape by distance, with round corners."""
    band = pathops.Path()
    path.draw(band.getPen())
    band.stroke(2 * abs(distance), pathops.LineCap.BUTT_CAP, pathops.LineJoin.ROUND_JOIN, 4)
    band.convertConicsToQuads()
    return pathops.op(path, band, pathops.PathOp.UNION if distance > 0 else pathops.PathOp.DIFFERENCE)


def soften(path, corner, fillet):
    """Round outer corners like ROND 60 and fill inner joints so added parts flow into the stem."""
    path = offset(offset(path, -corner), corner)
    return offset(offset(path, fillet), -fillet)


def shift(path, dx, dy=0):
    return path.transform(1, 0, 0, 1, dx, dy)


def center(path):
    box = path.bounds
    return shift(path, DESIGN / 2 - (box[0] + box[2]) / 2)


def tt_glyph(path):
    area = AreaPen()
    path.draw(area)
    if area.value > 0:  # TrueType outer contours run clockwise
        path.reverse()
    pen = TTGlyphPen(None)
    path.draw(Cu2QuPen(pen, max_err=1.0, all_quadratic=True))
    return pen.glyph()


def polygon(*points):
    path = pathops.Path()
    pen = path.getPen()
    pen.moveTo(points[0])
    for point in points[1:]:
        pen.lineTo(point)
    pen.closePath()
    return path


def curve_stroke(start, segments, width, cap=pathops.LineCap.BUTT_CAP):
    """Stroke a centerline of lines (one point) and cubics (three points)."""
    path = pathops.Path()
    pen = path.getPen()
    pen.moveTo(start)
    for segment in segments:
        if len(segment) == 1:
            pen.lineTo(segment[0])
        else:
            pen.curveTo(*segment)
    pen.endPath()
    path.stroke(width, cap, pathops.LineJoin.ROUND_JOIN, 4)
    path.convertConicsToQuads()
    return path


def gather(paths):
    """Separate shapes in one glyph, without merging them."""
    path = pathops.Path()
    for part in paths:
        part.draw(path.getPen())
    return path


def clip(path, bottom, top, reach=BLEED):
    return pathops.op(path, rect(-BLEED, bottom - reach, CELL + BLEED, top + reach), pathops.PathOp.INTERSECTION)


def edge_rect(x0, y0, x1, y1, bottom, top):
    """A rectangle whose sides on the cell edge overlap the neighbouring cell."""
    return rect(x0 - BLEED * (x0 <= 0), y0 - BLEED * (y0 <= bottom), x1 + BLEED * (x1 >= CELL), y1 + BLEED * (y1 >= top))


def ring(cx, cy, rx, ry, width):
    path = ellipse(cx, cy, rx, ry)
    path.stroke(width, pathops.LineCap.BUTT_CAP, pathops.LineJoin.ROUND_JOIN, 4)
    path.convertConicsToQuads()
    return pathops.op(path, path, pathops.PathOp.UNION)


BOX_WEIGHTS = {"LIGHT": 1, "SINGLE": 1, "HEAVY": 2, "DOUBLE": 3}
BOX_DIRECTIONS = {"UP": "U", "DOWN": "D", "LEFT": "L", "RIGHT": "R", "VERTICAL": "UD", "HORIZONTAL": "LR"}
OPPOSITE = {"U": "D", "D": "U", "L": "R", "R": "L"}
COUNTS = {"DOUBLE": 2, "TRIPLE": 3, "QUADRUPLE": 4}
EIGHTHS = {"ONE": 1, "THREE": 3, "FIVE": 5, "SEVEN": 7}


def box_arms(words):
    """Arm weights from a box drawing name: 'DOWN LIGHT AND RIGHT HEAVY' -> {D: 1, R: 2}."""
    arms, pending, weight = {}, [], None
    prefix = words[0] in BOX_WEIGHTS
    for word in words:
        if word == "AND":
            continue
        if word in BOX_WEIGHTS:
            weight = BOX_WEIGHTS[word]
            arms.update(dict.fromkeys(pending, weight))
            pending = []
        elif prefix:
            arms.update(dict.fromkeys(BOX_DIRECTIONS[word], weight))
        else:
            pending += BOX_DIRECTIONS[word]
    return arms


def box(code, light, bottom, top):
    """Box drawing that meets its neighbours at the cell edges, in final font units."""
    words = unicodedata.name(chr(code)).split()[2:]
    cx, cy = CELL / 2, (bottom + top) / 2
    edge = {"U": top + REACH, "D": bottom - REACH, "L": -BLEED, "R": CELL + BLEED}
    weight = light * BOX_WEIGHTS[words[0]] if words[0] in BOX_WEIGHTS else light

    def arm(direction, back, half):
        if direction in "LR":
            x0, x1 = sorted((edge[direction], cx - back if direction == "R" else cx + back))
            return rect(x0, cy - half, x1, cy + half)
        y0, y1 = sorted((edge[direction], cy - back if direction == "U" else cy + back))
        return rect(cx - half, y0, cx + half, y1)

    if "DASH" in words:
        count = COUNTS[words[1]]
        horizontal = words[-1] == "HORIZONTAL"
        start, span = (0, CELL) if horizontal else (bottom, top - bottom)
        slot = span / count
        dashes = []
        for i in range(count):
            a, b = start + slot * (i + 0.2), start + slot * (i + 0.8)
            dashes.append(rect(a, cy - weight / 2, b, cy + weight / 2) if horizontal else rect(cx - weight / 2, a, cx + weight / 2, b))
        return union(*dashes)
    if "ARC" in words:
        vertical, horizontal = words[2], words[4]
        radius = CELL / 2
        sv, sh = (1 if vertical == "UP" else -1), (1 if horizontal == "RIGHT" else -1)
        k = 0.5523
        bend = cy + sv * radius
        return clip(curve_stroke((cx, edge[vertical[0]]), [
            ((cx, bend),),
            ((cx, bend - sv * radius * k), (cx + sh * radius * (1 - k), cy), (cx + sh * radius, cy)),
            ((edge[horizontal[0]], cy),),
        ], light), bottom, top, REACH)
    if "DIAGONAL" in words:
        rising = curve_stroke((0, bottom), [((CELL, top),)], light)
        falling = curve_stroke((0, top), [((CELL, bottom),)], light)
        lines = {"UPPER RIGHT TO LOWER LEFT": rising, "UPPER LEFT TO LOWER RIGHT": falling}.get(" ".join(words[2:]))
        return clip(lines or union(rising, falling), bottom, top)

    arms = box_arms(words)
    thickness = {direction: light * weight for direction, weight in arms.items()}
    solid, bands, gaps = [], [], []
    for direction, weight in arms.items():
        across = [other for other in arms if (other in "UD") != (direction in "UD")]
        double_across = any(arms[other] == 3 for other in across)
        if weight != 3 and double_across and len(across) == 2 and OPPOSITE[direction] not in arms:
            back = -light  # stop inside the near line of a double line running through
        else:
            back = max((thickness[other] for other in across), default=0) / 2
        if weight == 3:
            bands.append(arm(direction, back, light * 1.5))
            gaps.append(arm(direction, light / 2 if double_across else back, light / 2))
        else:
            solid.append(arm(direction, back, thickness[direction] / 2))
    if bands:
        solid.append(pathops.op(union(*bands), union(*gaps), pathops.PathOp.DIFFERENCE))
    return union(*solid)


def block(code, bottom, top):
    name = unicodedata.name(chr(code))
    height = top - bottom
    if name.endswith("SHADE"):
        size_x, size_y = CELL / 8, height / 16
        level = name.split()[0]
        squares = []
        for i in range(8):
            for j in range(16):
                filled = {"LIGHT": i % 2 == 0 and j % 2 == 0, "MEDIUM": (i + j) % 2 == 0, "DARK": not (i % 2 and j % 2)}[level]
                if filled:
                    square = (i * size_x, bottom + j * size_y, (i + 1) * size_x, bottom + (j + 1) * size_y)
                    # only the dark shade touches its neighbours; lighter dots would just grow at the edges
                    squares.append(edge_rect(*square, bottom, top) if level == "DARK" else rect(*square))
        return union(*squares) if level == "DARK" else squares
    if name.startswith("QUADRANT"):
        quarters = {
            "UPPER LEFT": (0, 1), "UPPER RIGHT": (1, 1), "LOWER LEFT": (0, 0), "LOWER RIGHT": (1, 0),
        }
        parts = []
        for part in name.removeprefix("QUADRANT ").split(" AND "):
            i, j = quarters[part]
            parts.append(edge_rect(i * CELL / 2, bottom + j * height / 2, (i + 1) * CELL / 2, bottom + (j + 1) * height / 2, bottom, top))
        return union(*parts)
    if name == "FULL BLOCK":
        return edge_rect(0, bottom, CELL, top, bottom, top)
    words = name.split()
    side = words[0]
    share = 0.5 if words[1] == "HALF" else EIGHTHS[words[1]] / {"EIGHTH": 8, "QUARTER": 4}[words[2].rstrip("S")]
    return edge_rect(*{
        "UPPER": (0, top - height * share, CELL, top),
        "LOWER": (0, bottom, CELL, bottom + height * share),
        "LEFT": (0, bottom, CELL * share, top),
        "RIGHT": (CELL * (1 - share), bottom, CELL, top),
    }[side], bottom, top)


def braille(code, bottom, top):
    dots = []
    height = top - bottom
    radius = CELL * 0.11
    # dot bits 1-8: left column rows 1-3, right column rows 1-3, then row 4 left and right
    places = [(0, 0), (0, 1), (0, 2), (1, 0), (1, 1), (1, 2), (0, 3), (1, 3)]
    for bit, (column, row) in enumerate(places):
        if (code - 0x2800) >> bit & 1:
            dots.append(ellipse(CELL * (0.3 + 0.4 * column), top - height * (row + 0.5) / 4, radius, radius))
    return dots


def powerline(code, light, cap, bottom, top):
    cy = (bottom + top) / 2
    height = top - bottom
    if code == 0xE0A0:  # branch
        x1, x2, r = CELL * 0.3, CELL * 0.72, CELL * 0.1
        low, high = r + light / 2, cap - r - light / 2
        mid = low + (high - low) * 0.42
        return union(
            ring(x1, low, r, r, light), ring(x1, high, r, r, light), ring(x2, high, r, r, light),
            rect(x1 - light / 2, low + r, x1 + light / 2, high - r),
            curve_stroke((x2, high - r), [((x2, mid), (x1, high - (high - mid) * 0.6), (x1, mid - r))], light),
        )
    if code == 0xE0A2:  # padlock
        body = cap * 0.58
        shackle = curve_stroke((CELL * 0.33, body), [
            ((CELL * 0.33, cap - CELL * 0.17),),
            ((CELL * 0.33, cap + CELL * 0.05), (CELL * 0.67, cap + CELL * 0.05), (CELL * 0.67, cap - CELL * 0.17)),
            ((CELL * 0.67, body),),
        ], light * 1.4)
        lock = offset(offset(rect(CELL * 0.16, 0, CELL * 0.84, body), -light), light)
        hole = ellipse(CELL / 2, body * 0.5, light * 0.9, light * 0.9)
        return union(shackle, pathops.op(lock, hole, pathops.PathOp.DIFFERENCE))
    solid = {
        0xE0B0: polygon((0, bottom), (0, top), (CELL, cy)),
        0xE0B2: polygon((CELL, bottom), (0, cy), (CELL, top)),
        0xE0B8: polygon((0, bottom), (0, top), (CELL, bottom)),
        0xE0BA: polygon((0, bottom), (CELL, top), (CELL, bottom)),
        0xE0BC: polygon((0, bottom), (0, top), (CELL, top)),
        0xE0BE: polygon((0, top), (CELL, top), (CELL, bottom)),
    }
    if code in solid:  # the flat side reaches under the segment it closes
        flat = rect(-BLEED, bottom, 0, top) if code in (0xE0B0, 0xE0B8, 0xE0BC) else rect(CELL, bottom, CELL + BLEED, top)
        return union(solid[code], flat)
    if code in (0xE0B4, 0xE0B6):
        return clip(ellipse(0 if code == 0xE0B4 else CELL, cy, CELL, height / 2), bottom, top)
    if code in (0xE0B5, 0xE0B7):
        return clip(ring(0 if code == 0xE0B5 else CELL, cy, CELL - light / 2, height / 2 - light / 2, light), bottom, top)
    lines = {
        0xE0B1: [(0, top), (CELL, cy), (0, bottom)],
        0xE0B3: [(CELL, top), (0, cy), (CELL, bottom)],
        0xE0B9: [(0, top), (CELL, bottom)],
        0xE0BB: [(0, bottom), (CELL, top)],
        0xE0BD: [(0, bottom), (CELL, top)],
        0xE0BF: [(0, top), (CELL, bottom)],
    }[code]
    return clip(stroke(lines, light), bottom, top)


def build(style, wght, italic):
    upright = {w: instance(w, wght, 0) for w in WIDTHS}
    fonts = {w: instance(w, wght, SLANT) for w in WIDTHS} if italic else upright
    base = instance(100, wght, SLANT if italic else 0)
    cmap = base.getBestCmap()
    remap = feature_mapping(base, {"ss01", "ss02", "tnum"})
    names = {ch: remap.get(cmap[ord(ch)], cmap[ord(ch)]) for ch in TEXT if ord(ch) in cmap}
    names = {ch: remap.get(n, n) for ch, n in names.items()}

    def glyph_box(name):
        return bounds(outline(upright[BASE_WIDTH], name))

    stem = glyph_box("l")[2] - glyph_box("l")[0]
    bar = glyph_box("hyphen")[3] - glyph_box("hyphen")[1]
    xh = glyph_box("x")[3]
    cap = glyph_box("H")[3]
    asc = glyph_box("l")[3]
    serif = DESIGN * 0.21
    slab = DESIGN * 0.33
    c = DESIGN / 2
    corner, fillet = bar * 0.28, bar * 0.22

    inks = {}

    def fitted(source, ch, max_ink):
        """The glyph from the width instance that fits the cell best, centered in it."""
        name = names[ch]
        if (id(source), name) not in inks:
            inks[id(source), name] = {w: (b[2] - b[0]) if (b := bounds(outline(source[w], name))) else 0 for w in WIDTHS}
        widths = inks[id(source), name]
        choice = BASE_WIDTH
        if widths[BASE_WIDTH] > max_ink:
            fitting = [w for w in WIDTHS if w < BASE_WIDTH and widths[w] <= max_ink]
            choice = max(fitting) if fitting else WIDTHS[0]
        elif ch in WIDEN and 0 < widths[BASE_WIDTH] < MIN_INK:
            wider = [w for w in WIDTHS if w > BASE_WIDTH and widths[w] >= MIN_INK]
            choice = min(wider) if wider else WIDTHS[-1]
        recording = outline(source[choice], name)
        box = bounds(recording)
        if box is None:
            return None
        scale = min(1, max_ink / (box[2] - box[0]))
        mid = (box[0] + box[2]) / 2
        return to_path(recording, (scale, 0, 0, 1, c - mid * scale, 0))

    def custom(ch):
        """Clarity glyphs, drawn upright; the italic shears them afterwards."""
        tail_x = c - DESIGN * 0.07
        if ch == "l":
            return union(
                hook(tail_x, asc, bar / 2, DESIGN * 0.2, c + DESIGN * 0.3, stem),
                stroke([(tail_x - stem / 2 - serif, asc - bar / 2), (tail_x, asc - bar / 2)], bar),
            )
        if ch == "I":
            return union(
                stroke([(c, 0), (c, cap)], stem),
                stroke([(c - slab, bar / 2), (c + slab, bar / 2)], bar),
                stroke([(c - slab, cap - bar / 2), (c + slab, cap - bar / 2)], bar),
            )
        path = fitted(upright, ch, MAX_INK)
        if ch == "i" and italic:  # cursive italic i: the dot over a tailed stem, like l
            dot = min(path.contours, key=lambda contour: -contour.bounds[1])
            box = dot.bounds
            return union(
                hook(tail_x, xh, bar / 2, DESIGN * 0.16, c + DESIGN * 0.28, stem),
                stroke([(tail_x - stem / 2 - serif, xh - bar / 2), (tail_x, xh - bar / 2)], bar),
                shift(dot, tail_x - (box[0] + box[2]) / 2),
            )
        if ch in "ij":
            stem_x = c if ch == "i" else path.bounds[2] - stem / 2
            top = xh - bar / 2
            extras = [stroke([(stem_x - stem / 2 - serif, top), (stem_x, top)], bar)]
            if ch == "i":
                extras.append(stroke([(c - slab, bar / 2), (c + slab, bar / 2)], bar))
            return union(path, *extras)
        if ch == "1":
            stem_x = path.bounds[2] - stem / 2
            return union(path, stroke([(stem_x - slab * 0.95, bar / 2), (stem_x + slab * 0.75, bar / 2)], bar))
        box = path.bounds  # 0
        return union(path, ellipse((box[0] + box[2]) / 2, (box[1] + box[3]) / 2, stem * 0.62, stem * 0.78))

    def tuned(ch, path):
        """Code tuning: bigger round dots, operators centered on lowercase, taller brackets."""
        if ch in DOTTED:
            parts = []
            for contour in path.contours:
                x0, y0, x1, y1 = contour.bounds
                w, h = x1 - x0, y1 - y0
                if w < 2.2 * stem and h < 2.2 * stem and 0.7 < w / h < 1.4 and ch in "ij":
                    # sized from the stem and dropped to the ascender, so the dot doesn't tower over l and the capitals
                    radius = stem * 0.55
                    cy = max(asc, xh + stem * 0.55 + 2 * radius) - radius
                    lean = (cy - (y0 + y1) / 2) * math.tan(math.radians(-SLANT)) if italic else 0
                    contour = ellipse((x0 + x1) / 2 + lean, cy, radius, radius)
                elif w < 2.2 * stem and h < 2.2 * stem and 0.7 < w / h < 1.4:
                    radius = max(w, h) * 0.6
                    contour = ellipse((x0 + x1) / 2, y0 + radius, radius, radius)
                elif ch in ",;":
                    cx, cy = (x0 + x1) / 2, y1 - w / 2
                    contour = contour.transform(1.2, 0, 0, 1.2, cx * -0.2, cy * -0.2)
                parts.append(contour)
            path = union(*parts)
        if ch in OPERATORS:
            box = path.bounds
            path = shift(path, 0, xh / 2 - (box[1] + box[3]) / 2)
        if ch in BRACKETS:
            box = path.bounds
            mid = (box[1] + box[3]) / 2
            path = path.transform(1, 0, 0, 1.08, 0, -mid * 0.08)
        return path

    def joined(path, left, right):
        """Operator bars stretched toward joining neighbours, leaving JOIN_GAP between cells."""
        bars = []
        for contour in path.contours:
            x0, y0, x1, y1 = contour.bounds
            bars.append(rect(JOIN_GAP / 2 if left else x0, y0, DESIGN - JOIN_GAP / 2 if right else x1, y1))
        return offset(offset(union(*bars), -corner), corner)

    glyphs = {}
    for ch, name in names.items():
        if ch in CUSTOM:
            path = custom(ch)
            if italic:
                path = path.transform(1, 0, math.tan(math.radians(-SLANT)), 1, 0, 0)
            path = soften(path, corner, fillet)
        else:
            path = fitted(fonts, ch, MAX_INK)
        if path is None:
            continue
        glyphs[name] = center(tuned(ch, path))
        if ch == "i" and not italic:  # the top serif points left, so the stem moves right to look centered
            glyphs[name] = shift(glyphs[name], serif / 4)

    wide, narrow = WIDE, NARROW
    for ch in wide:
        name = names[ch]
        glyphs[name + ".healL"] = shift(center(fitted(fonts, ch, MAX_INK + HEAL)), -HEAL / 2)
        glyphs[name + ".healR"] = shift(center(fitted(fonts, ch, MAX_INK + HEAL)), HEAL / 2)
        glyphs[name + ".healLR"] = center(fitted(fonts, ch, MAX_INK + 2 * HEAL))
    for ch in narrow:
        name = names[ch]
        glyphs[name + ".healL"] = shift(glyphs[name], -HEAL / 2)
        glyphs[name + ".healR"] = shift(glyphs[name], HEAL / 2)
    for ch in "=-":
        name = names[ch]
        glyphs[name + ".joinL"] = joined(glyphs[name], True, False)
        glyphs[name + ".joinR"] = joined(glyphs[name], False, True)
        glyphs[name + ".joinLR"] = joined(glyphs[name], True, True)
    greater, less, exclam = glyphs[names[">"]], glyphs[names["<"]], glyphs[names["!"]]
    glyphs[names[">"] + ".joinL"] = shift(greater, DESIGN * 0.03 - greater.bounds[0])
    glyphs[names["<"] + ".joinR"] = shift(less, DESIGN * 0.97 - less.bounds[2])
    glyphs[names["!"] + ".joinR"] = shift(exclam, DESIGN * 0.12)

    added = {}
    symbols = instancer.instantiateVariableFont(
        TTFont(io.BytesIO(SYMBOLS_ITALIC if italic else SYMBOLS)), {"wght": min(800, max(300, wght))}, updateFontNames=False)
    symbol_cmap = symbols.getBestCmap()
    height = cap / symbols["OS/2"].sCapHeight
    for code in BORROWED:
        recording = outline(symbols, symbol_cmap[code])
        ink = bounds(recording)
        squeeze = min(height, MAX_INK / (ink[2] - ink[0]))
        added[code] = f"uni{code:04X}"
        glyphs[added[code]] = to_path(recording, (squeeze, 0, 0, height, c - (ink[0] + ink[2]) / 2 * squeeze, 0))

    rounded = pathops.LineCap.ROUND_CAP
    tick = [(DESIGN * 0.16, xh * 0.5), [(DESIGN * 0.4, xh * 0.08)], [(DESIGN * 0.86, xh * 1.04)]]
    cross = [[(DESIGN * 0.2, xh * 0.04), (DESIGN * 0.8, xh * 0.96)], [(DESIGN * 0.2, xh * 0.96), (DESIGN * 0.8, xh * 0.04)]]
    chevron = [(DESIGN * 0.3, xh * 1.02), [(DESIGN * 0.72, xh * 0.5)], [(DESIGN * 0.3, xh * -0.02)]]
    marks = {
        0x2713: curve_stroke(tick[0], tick[1:], stem, rounded),
        0x2714: curve_stroke(tick[0], tick[1:], stem * 1.6, rounded),
        0x2717: union(*(stroke(line, stem, rounded) for line in cross)),
        0x2718: union(*(stroke(line, stem * 1.6, rounded) for line in cross)),
        0x276F: curve_stroke(chevron[0], chevron[1:], stem * 1.4, rounded),
        0x276E: curve_stroke(chevron[0], chevron[1:], stem * 1.4, rounded).transform(-1, 0, 0, 1, DESIGN, 0),
    }
    for code, path in marks.items():
        if italic:
            path = path.transform(1, 0, math.tan(math.radians(-SLANT)), 1, 0, 0)
        added[code] = f"uni{code:04X}"
        glyphs[added[code]] = center(path)

    def small(path, x, y, right=False):  # half-size letter for the Powerline line-number glyph
        ink = path.bounds
        x -= (ink[2] - ink[0]) * 0.55 if right else 0
        return path.transform(0.55, 0, 0, 0.55, x - ink[0] * 0.55, y - ink[1] * 0.55)

    added[0xE0A1] = "uniE0A1"
    glyphs["uniE0A1"] = union(small(glyphs[names["L"]], DESIGN * 0.1, cap * 0.47), small(glyphs[names["N"]], DESIGN * 0.92, 0, True))

    # Terminal glyphs are drawn in final units, edge to edge across the whole line
    top, bottom = round(base["hhea"].ascent * SCALE), round(base["hhea"].descent * SCALE)
    light = round(bar * SCALE)
    cells = {}
    for code in TERMINAL:
        path = box(code, light, bottom, top) if code < 0x2580 else block(code, bottom, top)
        cells[code] = gather(path) if isinstance(path, list) else path
    for code in BRAILLE:
        cells[code] = gather(braille(code, bottom, top))
    for code in POWERLINE:
        cells[code] = powerline(code, light, cap * SCALE, bottom, top)
    added.update({code: f"uni{code:04X}" for code in cells})

    order = base.getGlyphOrder()
    clashes = set(added.values()) & set(order)
    assert not clashes, clashes
    for table in base["cmap"].tables:
        table.cmap = {code: names.get(chr(code), glyph) for code, glyph in table.cmap.items()}
        if table.format in (4, 12):
            table.cmap.update(added)
    order += [name for name in glyphs if name not in order] + [added[code] for code in cells]
    base.setGlyphOrder(order)
    glyf, hmtx = base["glyf"], base["hmtx"]
    glyf.glyphOrder = order
    for name in names.values():
        hmtx[name] = (CELL, 0)
    outlines = {name: path.transform(SCALE, 0, 0, SCALE, 0, 0) for name, path in glyphs.items()}
    outlines.update({added[code]: path for code, path in cells.items()})
    for name, path in outlines.items():
        glyf[name] = tt_glyph(path)
        glyf[name].recalcBounds(glyf)
        hmtx[name] = (CELL, getattr(glyf[name], "xMin", 0))

    for table in ("GPOS", "GSUB", "GDEF", "kern", "BASE", "STAT", "MVAR", "HVAR", "hdmx", "LTSH", "VDMX"):
        if table in base:
            del base[table]
    addOpenTypeFeaturesFromString(base, features(names, wide, narrow))
    os2, hhea = base["OS/2"], base["hhea"]
    for table, attr in [(hhea, "ascent"), (hhea, "descent"), (os2, "sTypoAscender"), (os2, "sTypoDescender"),
                        (os2, "usWinAscent"), (os2, "usWinDescent"), (os2, "sxHeight"), (os2, "sCapHeight")]:
        setattr(table, attr, round(getattr(table, attr) * SCALE))
    base["post"].isFixedPitch = 1
    base["post"].italicAngle = SLANT if italic else 0
    hhea.caretSlopeRise, hhea.caretSlopeRun = (1000, round(1000 * math.tan(math.radians(-SLANT)))) if italic else (1, 0)
    os2.panose.bProportion = 9
    os2.xAvgCharWidth = CELL
    os2.achVendID = "CTRP"
    hhea.advanceWidthMax = CELL
    rename(base, style, italic, symbols["name"].getDebugName(0))

    options = subset.Options()
    options.name_IDs = ["*"]
    options.notdef_outline = True
    options.layout_features = ["calt"]
    subsetter = subset.Subsetter(options)
    subsetter.populate(glyphs=[".notdef", *names.values(), *glyphs, *added.values()], unicodes=[ord(ch) for ch in names] + list(added))
    subsetter.subset(base)
    for name in base.getGlyphOrder():  # glyphs the subset kept for other reasons
        base["hmtx"][name] = (CELL, base["hmtx"][name][1])
    unhinted = io.BytesIO()
    base.save(unhinted)
    # Box drawing and other non-Latin glyphs fall outside the latn script and stay unhinted, so they still meet
    font = TTFont(io.BytesIO(ttfautohint(in_buffer=unhinted.getvalue(), windows_compatibility=True, no_info=True)))
    filename = f"CitropyMono-{style.replace(' ', '')}"
    OUTPUT_TTF.mkdir(parents=True, exist_ok=True)
    font.save(OUTPUT_TTF / f"{filename}.ttf")
    font.flavor = "woff2"
    OUTPUT_FONTS.mkdir(parents=True, exist_ok=True)
    target = OUTPUT_FONTS / f"{filename}.woff2"
    font.save(target)
    print(target, target.stat().st_size, "bytes;", len(font.getBestCmap()), "characters", file=sys.stderr)


def features(names, wide, narrow):
    def cls(chars, suffix=""):
        return "[" + " ".join(names[ch] + suffix for ch in chars) + "]"

    eq, hy, gt, lt, ex = (names[ch] for ch in "=-><!")
    return f"""
languagesystem DFLT dflt;
languagesystem latn dflt;
@W = {cls(wide)}; @W_L = {cls(wide, ".healL")}; @W_R = {cls(wide, ".healR")}; @W_LR = {cls(wide, ".healLR")};
@N = {cls(narrow)}; @N_L = {cls(narrow, ".healL")}; @N_R = {cls(narrow, ".healR")};
@EQ = [{eq} {eq}.joinL {eq}.joinR {eq}.joinLR];

lookup bars {{
  sub [@EQ {ex}] {eq}' [{eq} {gt}] by {eq}.joinLR;
  sub [@EQ {ex}] {eq}' by {eq}.joinL;
  sub {eq}' [{eq} {gt}] by {eq}.joinR;
  sub {lt} {hy}' {gt} by {hy}.joinLR;
  sub {lt} {hy}' by {hy}.joinL;
  sub {hy}' {gt} by {hy}.joinR;
}} bars;

lookup tips {{
  sub [{eq}.joinR {eq}.joinLR {hy}.joinR {hy}.joinLR] {gt}' by {gt}.joinL;
  sub {lt}' [{hy}.joinL {hy}.joinLR] by {lt}.joinR;
  sub {ex}' [{eq}.joinL {eq}.joinLR] by {ex}.joinR;
}} tips;

lookup heal_wide {{
  sub @N @W' @N by @W_LR;
  sub @N @W' by @W_L;
  sub @W' @N by @W_R;
}} heal_wide;

lookup heal_narrow {{
  ignore sub [@W_R @W_LR] @N' [@W_L @W_LR];
  sub [@W_R @W_LR] @N' by @N_R;
  sub @N' [@W_L @W_LR] by @N_L;
}} heal_narrow;

feature calt {{
  lookup bars;
  lookup tips;
  lookup heal_wide;
  lookup heal_narrow;
}} calt;
"""


def rename(font, style, italic, symbols_copyright):
    names = font["name"]
    names.names = [r for r in names.names if r.nameID in (0, 5, 13, 14)]
    for record in names.names:
        if record.nameID == 0:
            record.string = f"{record.toUnicode()}. {symbols_copyright}. {MODIFICATION_COPYRIGHT}"
    ps = f"CitropyMono-{style.replace(' ', '')}"
    for name_id, value in {1: "Citropy Mono", 2: style, 3: f"CTRP;{ps}", 4: f"Citropy Mono {style}", 6: ps}.items():
        names.setName(value, name_id, 3, 1, 0x409)
    bold = "Bold" in style
    selection = font["OS/2"].fsSelection & ~0b1100001
    if bold:
        selection |= 0b100000
    if italic:
        selection |= 0b1
    if not bold and not italic:
        selection |= 0b1000000
    font["OS/2"].fsSelection = selection
    font["head"].macStyle = (1 if bold else 0) | (2 if italic else 0)
    font["OS/2"].usWeightClass = 700 if bold else 400


for style, (wght, italic) in STYLES.items():
    if len(sys.argv) < 2 or style in sys.argv[1:]:
        build(style, wght, italic)
licenses = "\n".join(f"{name}:\n{download(path).decode()}" for name, path in LICENSES.items())
OUTPUT_LICENSE.write_text(
    f"{MODIFICATION_COPYRIGHT}. Citropy Mono is a modified version of Google Sans Flex, "
    f"with symbols from Google Sans Code.\n\n{licenses}")
