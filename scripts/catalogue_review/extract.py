"""Extract source evidence from the one-page, colour-coded BA-CS planner layout."""
import re

import pdfplumber
from pdfminer.pdfparser import PDFSyntaxError
from pdfplumber.utils import extract_text

from sources import CACHE, MAJORS, digest

CODE = re.compile(r"[A-Z]{3}\d{5}")
CATEGORIES = ("Core", "Major", "Elective", "WIL Placement")


def flat(text):
    return " ".join(text.split())


def inside(item, box):
    x = (item["x0"] + item["x1"]) / 2
    y = (item["top"] + item["bottom"]) / 2
    return box["x0"] <= x < box["x1"] and box["top"] <= y < box["bottom"]


def cell_text(page, box):
    return flat(extract_text([c for c in page.chars if inside(c, box)], x_tolerance=1, y_tolerance=2))


def parse_pdf(source):
    path = CACHE / source["filename"]
    data = path.read_bytes()
    if digest(data) != source.get("sha256"):
        raise ValueError("Registered source checksum mismatch")
    if not data.startswith(b"%PDF-"):
        raise ValueError("Registered source is not a PDF")
    try:
        with pdfplumber.open(path) as pdf:
            if len(pdf.pages) != 1:
                raise ValueError("Unrecognized multi-page layout")
            return parse_page(pdf.pages[0], source)
    except (PDFSyntaxError, pdfplumber.utils.exceptions.PdfminerException) as exc:
        raise ValueError("Unreadable PDF") from exc


def parse_page(page, source):
    words = sorted(page.extract_words(x_tolerance=1, y_tolerance=2), key=lambda w: (w["top"], w["x0"]))
    full = page.extract_text(x_tolerance=1)
    side = page.crop((331, 150, page.width, 975)).extract_text(x_tolerance=1)
    title = flat(full.split("Recommended Sequence")[0])
    major = MAJORS[source["name"].split("-")[-1]]
    errors = []
    year, month, _ = source["name"].split("-")
    intake = {"Mar":r"(?:Feb/)?Mar(?:ch)?", "Feb":r"Feb(?:ruary|/Mar)?", "Sep":r"(?:Aug/)?Sep(?:t(?:ember)?)?"}[month]
    intake_pattern = rf"Intake\s*:\s*{intake}\s+20{year}\b"
    if year == "23":
        intake_pattern = rf"Semester {1 if month == 'Feb' else 2} \| 2023$"
    if major.replace(" ", "").lower() not in title.replace(" ", "").lower() or "BA-CS" not in title.replace(" ", "") or not re.search(
            intake_pattern, title, re.I):
        errors.append("PDF title, major or intake disagrees with official index: " + title)
    legend, colours = {}, {}
    for word in words:
        if word["x0"] < 330 or not word["text"].isdigit():
            continue
        boxes = [r for r in page.rects if inside(word, r) and isinstance(r["non_stroking_color"], tuple)]
        for box in boxes:
            label = cell_text(page, box)
            m = re.fullmatch(r"(\d+) (.*?) Units?", label, re.I)
            if m:
                category = next((c for c in CATEGORIES if c.lower() in m[2].lower()), None)
                if category:
                    credit = re.search(re.escape(label) + r"\s+(\d+) credit points", side, re.I)
                    legend[category] = [int(m[1]), int(credit[1]) if credit else None]
                    colours[box["non_stroking_color"]] = category
    rows, slots = [], []
    academic_year = semester = section = None
    for word in words:
        x, y, token = word["x0"], word["top"], word["text"]
        if token == "Elective" and 55 < x < 115:
            line = flat(" ".join(w["text"] for w in words if abs(w["top"]-y)<2 and x<=w["x0"]<160))
            if re.fullmatch(r"Elective \d+", line):
                slots.append([academic_year, semester, line])
        if x > 50:
            continue
        line = flat(" ".join(w["text"] for w in sorted(words,key=lambda w:w["x0"])
                             if abs(w["top"]-y)<2 and x-1<=w["x0"]<300))
        year_headings = ("YearOne", "YearTwo", "YearThree")
        if line.replace(" ", "") in year_headings:
            academic_year = year_headings.index(line.replace(" ", ""))+1
        if token == "Semester":
            semester = line
        if year == "23" and token in ("Winter", "Summer") and "Term |" in line:
            semester = line
        if token == "Recommended" and "Elective" in line or "Minor" in line and x < 40:
            section = line
        if token.startswith("MPU") or not re.search(r"\d{4,}", token):
            continue
        if year == "23" and token == "ICT20016*":
            token = "ICT20016"
        if not CODE.fullmatch(token):
            errors.append("Unrecognized first-column code " + token)
            continue
        boxes = [r for r in page.rects if inside(word,r) and r["width"]>10]
        if not boxes:
            errors.append("Unresolved source cell for "+token)
            continue
        first = max(boxes, key=lambda b:b["width"])
        cells = [first]
        while True:
            adjacent = [r for r in page.rects if abs(r["x0"]-cells[-1]["x1"])<0.6
                        and abs(r["top"]-first["top"])<0.6 and abs(r["bottom"]-first["bottom"])<0.6
                        and r["width"]>10]
            if not adjacent:
                break
            cells.append(max(adjacent,key=lambda r:r["width"]))
        values = [cell_text(page, cell) for cell in cells]
        category = colours.get(first["non_stroking_color"])
        if token in ("ICT20016", "ICT20026"):
            category = "WIL Placement"
        rows.append(dict(code=token, cells=values, y=round(y,1), category=category,
                         year=None if section else academic_year, term=None if section else semester,
                         section=section or "Recommended sequence"))
    # Inspect coloured code-column cells even when they contain no code token.
    for box in page.rects:
        if not (20 < box["x0"] < 36 and 32 < box["width"] < 75 and box["height"] > 7
                and box["non_stroking_color"] in colours):
            continue
        adjacent = next((r for r in page.rects if abs(r["x0"]-box["x1"]) < 0.4
                         and abs(r["top"]-box["top"]) < 0.4 and abs(r["bottom"]-box["bottom"]) < 0.4
                         and r["width"] > 50), None)
        if adjacent and not CODE.fullmatch(cell_text(page,box)):
            label = cell_text(page,adjacent)
            if label and not re.fullmatch(r"Elective\s*\d+",label,re.I):
                errors.append(f"Unidentified unit position at page 1 y={box['top']:.1f}: {label}")
    return dict(title=title, legend=legend, sidebar=side, rows=rows, slots=slots, errors=errors)
