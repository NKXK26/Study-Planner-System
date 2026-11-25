// Runs in the shipped Node runtime, without Python, temporary files or network access.
import { PDFParse } from 'pdf-parse';
import { createCanvas, loadImage } from '@napi-rs/canvas';
function backgroundColour(ctx, width, height, x, y, w, h) {
  const votes = new Map();
  // Several samples avoid selecting an antialiased glyph or a table border.
  for (const fx of [-0.02, 0.05, 0.25, 0.5, 0.75, 0.95, 1.02]) {
    for (const fy of [0.2, 0.5, 0.8]) {
      const px = Math.max(0, Math.min(width - 1, Math.round(x + w * fx)));
      const py = Math.max(0, Math.min(height - 1, Math.round(y + h * fy)));
      const [r, g, b, a] = ctx.getImageData(px, py, 1, 1).data;
      if (a < 200 || Math.min(r, g, b) > 245 || Math.max(r, g, b) < 50) continue;
      const hex = '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('');
      votes.set(hex, (votes.get(hex) || 0) + 1);
    }
  }
  const best = [...votes].sort((a, b) => b[1] - a[1])[0];
  return best?.[1] >= 3 ? best[0] : null;
}
export async function extractPdfColours(bytes) {
  const parser = new PDFParse({ data: bytes });
  try {
    const info = await parser.getInfo();
    if (info.total > 10) throw new Error('Upload only the planner pages (at most 10).');
    const blocks = [];
    let textCount = 0;
    for (let n = 1; n <= info.total; n++) {
      const page = await parser.doc.getPage(n), vp = page.getViewport({ scale: 1 });
      if (vp.width * vp.height > 8000000) throw new Error('PDF page dimensions are too large. Export at normal page size.');
      const shot = await parser.getScreenshot({ partial: [n], scale: 1, imageDataUrl: false });
      const image = await loadImage(shot.pages[0].data), canvas = createCanvas(image.width, image.height), ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const rows = [];
      for (const item of (await page.getTextContent()).items) {
        if (!item.str?.trim()) continue;
        textCount += item.str.length;
        if (textCount > 60000) throw new Error('PDF contains too much text. Upload just the planner pages.');
        const [a,b,c,d,e,f] = vp.transform;
        const x = a * item.transform[4] + c * item.transform[5] + e;
        const baseline = b * item.transform[4] + d * item.transform[5] + f;
        const h = Math.max(1, item.height || Math.hypot(item.transform[2], item.transform[3])), y = baseline - h;
        const colour = backgroundColour(ctx, image.width, image.height, x, y, item.width, h);
        if (!colour) continue;
        let row = rows.find(r => r.color === colour && Math.abs(r.y - y) < 3);
        if (!row) { row = { color: colour, y, items: [] }; rows.push(row); }
        row.items.push({ text: item.str.trim(), x, y, w: item.width, h });
      }
      for (const row of rows.sort((a,b) => a.y - b.y)) {
        const items = row.items.sort((a,b) => a.x - b.x);
        blocks.push({ color: row.color,
          text: items.map(i => i.text).join(' ').replace(/([A-Z]{2,5})\s+(\d{3,6})/g, '$1$2'),
          bbox: [Math.min(...items.map(i=>i.x)), Math.min(...items.map(i=>i.y)), Math.max(...items.map(i=>i.x+i.w)), Math.max(...items.map(i=>i.y+i.h))], page: n });
      }
    }
    if (!textCount) throw new Error('This PDF has no readable text. Upload a searchable PDF.');
    return blocks;
  } finally { await parser.destroy(); }
}
