import sys
import json
import fitz  # PyMuPDF

def rgb_to_hex(rgb):
    return "#{:02x}{:02x}{:02x}".format(int(rgb[0]*255), int(rgb[1]*255), int(rgb[2]*255))

pdf_path = sys.argv[1]
doc = fitz.open(pdf_path)
page = doc[0]

# Get all drawings (colored rectangles, fills)
color_blocks = []
for drawing in page.get_drawings():
    fill = drawing.get("fill")
    if fill and any(fill):
        hex_color = rgb_to_hex(fill)
        rect = drawing["rect"]
        # Get text inside this rectangle (words)
        words = page.get_text("words", clip=rect)
        text = " ".join([w[4] for w in words])
        if text.strip():
            color_blocks.append({
                "color": hex_color,
                "text": text.strip(),
                "bbox": [rect.x0, rect.y0, rect.x1, rect.y1]
            })

print(json.dumps(color_blocks))