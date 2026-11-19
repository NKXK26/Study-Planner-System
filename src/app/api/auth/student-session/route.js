import { NextResponse } from 'next/server';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 12,
};

export async function POST() {
  if (process.env.NEXT_PUBLIC_MODE !== 'DEV') {
    return NextResponse.json({ success: false }, { status: 404 });
  }
  const response = NextResponse.json({ success: true });
  response.cookies.set('temporary_student', '1', cookieOptions);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set('temporary_student', '', { ...cookieOptions, maxAge: 0 });
  return response;
}
