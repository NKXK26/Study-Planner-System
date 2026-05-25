const PdfHighlighter = ({ file, units, onUnitClick, highlightUnitId }) => {
  const containerRef = useRef(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [renderedPages, setRenderedPages] = useState({});

  // Load PDF document
  useEffect(() => {
    if (!file) return;
    const loadPdf = async () => {
      const arrayBuffer = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setPdfDoc(doc);
    };
    loadPdf();
  }, [file]);

  // Re-render when doc or units change
  useEffect(() => {
    if (!pdfDoc || !containerRef.current) return;

    // Build highlight targets from units
    const highlights = [];
    units.forEach(unit => {
      if (unit.unit_code?.trim()) {
        highlights.push({
          text: normalizeCode(unit.unit_code), // e.g. "COS10009"
          unitId: unit._uid,
          color: 'rgba(255, 235, 59, 0.55)',
        });
      }
    });

    const renderAll = async () => {
      const pages = {};
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        pages[i] = await renderPage(pdfDoc, i, highlights);
      }
      setRenderedPages(pages);
    };
    renderAll();
  }, [pdfDoc, units]);

  const renderPage = async (doc, pageNum, highlights) => {
    const page = await doc.getPage(pageNum);
    const scale = 1.5;
    const viewport = page.getViewport({ scale });

    // ── Canvas ──────────────────────────────────────────────────────────────
    const canvas = document.createElement('canvas');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    // ── Text items ──────────────────────────────────────────────────────────
    const textContent = await page.getTextContent();

    // Build a concatenated line view so we can match codes that PDF.js split
    // Each item: { str, x, y, w, h }
    const items = textContent.items.map(item => {
      const tx = pdfjsLib.Util.applyTransform([0, 0], item.transform);
      // item.transform = [scaleX, skewX, skewY, scaleY, translateX, translateY]
      const x = item.transform[4] * scale;
      const y = viewport.height - item.transform[5] * scale;
      const w = item.width * scale;
      const h = Math.abs(item.transform[3]) * scale || 10;
      return { str: item.str, x, y: y - h, w, h };
    });

    // ── Find matches ────────────────────────────────────────────────────────
    const matchRects = [];

    highlights.forEach(({ text, unitId, color }) => {
      // Match against each item's str (normalised, no spaces)
      items.forEach(item => {
        const normalized = normalizeCode(item.str);
        if (normalized === text || normalized.includes(text)) {
          matchRects.push({ x: item.x, y: item.y, w: item.w, h: item.h, unitId, color });
        }
      });
    });

    // ── Wrapper = relative container ────────────────────────────────────────
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      position: relative;
      display: inline-block;
      margin-bottom: 16px;
      width: ${viewport.width}px;
      height: ${viewport.height}px;
    `;

    canvas.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      display: block;
    `;
    wrapper.appendChild(canvas);

    // ── Highlight overlay ───────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: ${viewport.width}px;
      height: ${viewport.height}px;
      pointer-events: none;
    `;

    matchRects.forEach(({ x, y, w, h, unitId, color }) => {
      const hl = document.createElement('div');
      hl.style.cssText = `
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        width: ${w}px;
        height: ${h + 2}px;
        background: ${color};
        border-radius: 2px;
        mix-blend-mode: multiply;
      `;
      hl.dataset.unitId = unitId;
      overlay.appendChild(hl);
    });

    wrapper.appendChild(overlay);
    return wrapper;
  };

  // Inject rendered pages into DOM
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';
    const count = Object.keys(renderedPages).length;
    for (let i = 1; i <= count; i++) {
      if (renderedPages[i]) containerRef.current.appendChild(renderedPages[i]);
    }
  }, [renderedPages]);

  // Scroll + flash when a unit row is clicked
  useEffect(() => {
    if (!highlightUnitId || !containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-unit-id="${highlightUnitId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const orig = el.style.background;
    el.style.transition = 'background 0.15s';
    el.style.background = 'rgba(255,80,80,0.7)';
    setTimeout(() => { el.style.background = orig; }, 700);
  }, [highlightUnitId]);

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-900">
      <div ref={containerRef} className="flex flex-col items-center" />
    </div>
  );
};