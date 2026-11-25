import { NextResponse } from 'next/server';
import { extractPdfColours } from '@app/libs/pdfColours.server.mjs';
export const runtime = 'nodejs';
export async function POST(req) {
  try {
    if (Number(req.headers.get('content-length')) > 6 * 1024 * 1024) return NextResponse.json({ error: 'Choose a PDF up to 5 MB.' }, { status: 413 });
    const file = (await req.formData()).get('file');
    if (!file || typeof file.arrayBuffer !== 'function') return NextResponse.json({ error: 'Choose a PDF file.' }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Choose a PDF up to 5 MB.' }, { status: 413 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-') return NextResponse.json({ error: 'This file is not a valid PDF.' }, { status: 400 });
    return NextResponse.json(await extractPdfColours(bytes));
  } catch (error) {
    console.error('PDF colour extraction:', error);
    return NextResponse.json({ error: /password/i.test(error.message) ? 'This PDF is password protected. Upload an unlocked copy.' : error.message || 'Could not read PDF colours. Upload a searchable PDF.' }, { status: 400 });
  }
}
