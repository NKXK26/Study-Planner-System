import { NextResponse } from 'next/server';
import SecureSessionManager from '@utils/auth/SimpleSessionManager';
import { MAX_DOCUMENT_TEXT } from '@app/libs/chatDpa.mjs';

export const runtime = 'nodejs';
export async function POST(req) {
  const dev = req.headers.get('x-dev-override') === 'true' && process.env.NEXT_PUBLIC_MODE === 'DEV';
  if (!dev && !await SecureSessionManager.authenticateUser(req)) return NextResponse.json({ success: false, message: 'Please sign in.' }, { status: 401 });
  try {
    if (Number(req.headers.get('content-length')) > 7500000) throw new Error('Choose a PDF up to 5 MB.');
    const { name, base64 } = await req.json();
    if (typeof name !== 'string' || name.length > 200 || !/\.pdf$/i.test(name) || typeof base64 !== 'string' || base64.length > 7000000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error('Choose a valid PDF up to 5 MB.');
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length > 5 * 1024 * 1024 || bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('This file is not a valid PDF up to 5 MB.');
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(bytes) });
    try {
      const info = await parser.getInfo();
      if (info.total > 50) throw new Error('Please upload a DPA with at most 50 pages.');
      const result = await parser.getText();
      if (!result.text.trim() || result.text.replace(/--\s*\d+ of \d+\s*--/g, '').trim().length < 20) throw new Error('This PDF has no readable text. Upload a searchable PDF or the DPA XLSX export.');
      if (result.text.length > MAX_DOCUMENT_TEXT) throw new Error('This PDF is too long. Upload just the DPA pages (up to 60,000 characters).');
      return NextResponse.json({ success: true, document: { name, text: result.text } });
    } finally { await parser.destroy(); }
  } catch (error) {
    const message = /password/i.test(error.message) ? 'This PDF is password protected. Upload an unlocked copy.' : error.message;
    return NextResponse.json({ success: false, message: message || 'Could not read this PDF. Try a searchable PDF or XLSX.' }, { status: 400 });
  }
}
