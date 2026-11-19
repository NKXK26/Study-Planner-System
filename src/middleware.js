import { NextResponse } from 'next/server';

const studentPages = new Set([
  '/view/dashboard',
  '/view/compare_study_planner',
  '/view/graduation-eligibility',
  '/view/ai-assistant',
]);

const studentApiMethods = new Map([
  ['/api/official-planners', ['GET']],
  ['/api/dashboard', ['GET']],
  ['/api/study-planner', ['GET']],
  ['/api/study-planner/validate-schedule', ['POST']],
  ['/api/unit-rag', ['POST']],
  ['/api/unit-replacements', ['POST']],
  ['/api/graduation-eligibility', ['POST']],
  ['/api/double-major-pathway', ['POST']],
  ['/api/planner-assistant', ['GET', 'POST']],
  ['/api/planner-assistant/document', ['POST']],
  ['/api/planner-assistant/planning', ['GET', 'POST']],
  ['/api/planner-assistant/tools', ['GET', 'POST']],
  ['/api/auth/student-session', ['DELETE']],
  ['/api/auth/admin-password-login', ['POST']],
]);

export function middleware(request) {
  if (request.cookies.get('temporary_student')?.value !== '1') return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/_next/') || pathname === '/favicon.ico' || pathname.startsWith('/images/')) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    const methods = studentApiMethods.get(pathname);
    if (!methods?.includes(request.method)) {
      return NextResponse.json({ success: false, message: 'Access denied.' }, { status: 403 });
    }
    const headers = new Headers(request.headers);
    headers.set('x-dev-override', 'true');
    headers.set('x-temporary-student', 'true');
    return NextResponse.next({ request: { headers } });
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
