import sys
import urllib.request
from io import BytesIO
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

SOURCE_COMMIT = "a0e3dbcdc3a3ecfafff3f071159ae0221628922d"
SOURCE_FILE = "ofl/googlesansflex/GoogleSansFlex%5BGRAD%2CROND%2Copsz%2Cslnt%2Cwdth%2Cwght%5D.ttf"
SOURCE_LICENSE = "ofl/googlesansflex/OFL.txt"
SOURCE_ROOT = f"https://raw.githubusercontent.com/google/fonts/{SOURCE_COMMIT}/"

AXES = {"GRAD": 0, "ROND": 60, "slnt": (-10, 0), "wdth": 100, "wght": (300, 800), "opsz": (8, 72)}
BUILT_IN_STYLISTIC_SETS = ["ss01", "ss02"]
UNICODES = [
    (0x0000, 0x024F),
    (0x0259, 0x0259),
    (0x02BB, 0x02DD),
    (0x0300, 0x036F),
    (0x1E00, 0x1EFF),
    (0x2000, 0x206F),
    (0x20A0, 0x20CF),
    (0x2100, 0x215F),
    (0x2190, 0x21FF),
    (0x2212, 0x2215),
    (0xFEFF, 0xFFFD),
]

FAMILY = "Citropy Sans"
POSTSCRIPT_FAMILY = "CitropySans"
VENDOR = "CTRP"
MODIFICATION_COPYRIGHT = "Modifications Copyright 2026 The Citropy Authors"
RENAMES = {"Google Sans Flex": FAMILY, "GoogleSansFlex": POSTSCRIPT_FAMILY, "GOOG": VENDOR}
DROPPED_NAME_IDS = {7}

OUTPUT_FONT = Path("public/fonts/CitropySans.woff2")
OUTPUT_LICENSE = Path("public/fonts/CitropySans-OFL.txt")


def download(path):
    with urllib.request.urlopen(SOURCE_ROOT + path) as response:
        return response.read()


def build_in_stylistic_sets(font):
    mapping = {}
    gsub = font["GSUB"].table
    for record in gsub.FeatureList.FeatureRecord:
        if record.FeatureTag not in BUILT_IN_STYLISTIC_SETS:
            continue
        for index in record.Feature.LookupListIndex:
            for table in gsub.LookupList.Lookup[index].SubTable:
                mapping.update(getattr(table, "ExtSubTable", table).mapping)
    missing = set(BUILT_IN_STYLISTIC_SETS) - {record.FeatureTag for record in gsub.FeatureList.FeatureRecord}
    if missing:
        raise SystemExit(f"Source font has no stylistic sets {sorted(missing)}")
    for table in font["cmap"].tables:
        table.cmap = {code: mapping.get(glyph, glyph) for code, glyph in table.cmap.items()}


def rename(font):
    names = font["name"]
    names.names = [record for record in names.names if record.nameID not in DROPPED_NAME_IDS]
    for record in names.names:
        text = record.toUnicode()
        if record.nameID == 0:
            record.string = f"{text}. {MODIFICATION_COPYRIGHT}"
            continue
        for old, new in RENAMES.items():
            text = text.replace(old, new)
        record.string = text
    font["OS/2"].achVendID = VENDOR


def main():
    font = TTFont(BytesIO(download(SOURCE_FILE)))
    font = instancer.instantiateVariableFont(font, AXES, updateFontNames=False)
    build_in_stylistic_sets(font)
    rename(font)
    instanced = BytesIO()
    font.save(instanced)
    font = TTFont(instanced, lazy=False)
    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.flavor = "woff2"
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=[code for start, end in UNICODES for code in range(start, end + 1)])
    subsetter.subset(font)
    OUTPUT_FONT.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = "woff2"
    font.save(OUTPUT_FONT)
    license_text = download(SOURCE_LICENSE).decode()
    OUTPUT_LICENSE.write_text(f"{MODIFICATION_COPYRIGHT}. {FAMILY} is a modified version of Google Sans Flex.\n{license_text}")
    print(f"{OUTPUT_FONT} {OUTPUT_FONT.stat().st_size} bytes", file=sys.stderr)


main()
