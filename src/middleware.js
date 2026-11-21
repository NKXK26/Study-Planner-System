import { NextResponse } from 'next/server';
import {
  isStudentWebEdition,
  STUDENT_SESSION_COOKIE,
  studentApiMethods,
  studentPages,
} from '@app/libs/studentPortalAccess.mjs';

export function middleware(request) {
  const studentEdition = isStudentWebEdition();
  const studentSession = request.cookies.get(STUDENT_SESSION_COOKIE)?.value === '1';
  if (!studentEdition && !studentSession) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/_next/') || pathname === '/favicon.ico' || pathname.startsWith('/images/')) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    const methods = studentApiMethods.get(pathname);
    if (!methods?.includes(request.method)) {
      return NextResponse.json({ success: false, message: 'Access denied.' }, { status: 403 });
    }
    const sessionEndpoint = pathname === '/api/auth/student-session';
    if (studentEdition && !studentSession && !(sessionEndpoint && request.method === 'POST')) {
      return NextResponse.json({ success: false, message: 'Start a student session first.' }, { status: 401 });
    }
    const headers = new Headers(request.headers);
    headers.delete('x-student-portal');
    headers.delete('x-temporary-student');
    headers.delete('x-dev-override');
    if (studentEdition) headers.set('x-student-portal', '1');
    else headers.set('x-dev-override', 'true');
    headers.set('x-temporary-student', 'true');
    return NextResponse.next({ request: { headers } });
  }

  if (studentEdition && !studentSession && pathname.startsWith('/view/')) {
    const login = request.nextUrl.clone();
    login.pathname = '/';
    login.search = '';
    return NextResponse.redirect(login);
  }

  if (pathname.startsWith('/view/') && !studentPages.has(pathname)) {
    const dashboard = request.nextUrl.clone();
    dashboard.pathname = '/view/dashboard';
    dashboard.search = '?accessDenied=1';
    return NextResponse.redirect(dashboard);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/view/:path*', '/api/:path*'],
};
