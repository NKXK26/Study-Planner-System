import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export function GET(req) {
  const token = process.env.DESKTOP_SERVER_TOKEN;
  if (!token || req.headers.get('x-desktop-token') !== token) return NextResponse.json({ ready: false }, { status: 404 });
  return NextResponse.json({ ready: true, token }, { headers: { 'Cache-Control': 'no-store' } });
}
