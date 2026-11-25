export async function loadBrowserPdf(bytes) {
  const pdfjs = await import('pdfjs-dist');
  // Served by the same application, including offline Electron installations.
  const base = `/pdfjs/${pdfjs.version}/`;
  pdfjs.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
  return pdfjs.getDocument({ data: new Uint8Array(bytes), cMapUrl: base + 'cmaps/', cMapPacked: true,
    standardFontDataUrl: base + 'standard_fonts/' }).promise;
}
