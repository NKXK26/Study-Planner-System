import { NextResponse } from 'next/server';
import { isLocalPlannerRequest, isLocalPlannerRuntime } from './utils/auth/localPlanner.mjs';

const removedViews = /^\/view\/(?:account|roles|users|user_management|student_information|search_student_study_planner)(?:\/|$)/;
const removedApis = /^\/api\/(?:roles|users|students|auth)(?:\/|$)/;

export function middleware(request) {
    if (!isLocalPlannerRuntime()) return NextResponse.next();

    const path = request.nextUrl.pathname;
    if (removedViews.test(path)) return NextResponse.redirect(new URL('/view/dashboard', request.url));
    if (!path.startsWith('/api/') || path === '/api/desktop-health') return NextResponse.next();

    if (removedApis.test(path)) return NextResponse.json({ message: 'This module is unavailable.' }, { status: 404 });
    if (!isLocalPlannerRequest(request.headers)) {
        return NextResponse.json({ message: 'Open this feature inside the local planner.' }, { status: 401 });
    }

    const headers = new Headers(request.headers);
    headers.delete('x-dev-override');
    return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/view/:path*', '/api/:path*'] };
