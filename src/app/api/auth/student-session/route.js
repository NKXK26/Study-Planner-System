import { NextResponse } from 'next/server';
import { isPublicStudentAccessEnabled, STUDENT_SESSION_COOKIE } from '@app/libs/studentPortalAccess.mjs';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 12,
};

export async function POST() {
  if (process.env.NEXT_PUBLIC_MODE !== 'DEV' && !isPublicStudentAccessEnabled()) {
    return NextResponse.json({ success: false }, { status: 404 });
  }
  const response = NextResponse.json({ success: true });
  response.cookies.set(STUDENT_SESSION_COOKIE, '1', cookieOptions);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(STUDENT_SESSION_COOKIE, '', { ...cookieOptions, maxAge: 0 });
  return response;
}
