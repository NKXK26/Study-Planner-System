const loopbackHost = /^(?:127\.0\.0\.1|localhost)(?::\d+)?$/i;

export function isLocalPlannerRuntime() {
    return Boolean(process.env.DESKTOP_SERVER_TOKEN) ||
        (process.env.NODE_ENV === 'development' && process.env.STUDY_PLANNER_LOCAL_DEV === '1');
}

export function isLocalPlannerRequest(headers) {
    const host = headers.get('host');
    if (!loopbackHost.test(host || '') || headers.get('sec-fetch-site') === 'cross-site') return false;
    const origin = headers.get('origin');
    if (origin && origin !== `http://${host}`) return false;

    const desktopToken = process.env.DESKTOP_SERVER_TOKEN;
    if (desktopToken) return headers.get('x-desktop-token') === desktopToken;
    return isLocalPlannerRuntime();
}

export function canUseLocalPlanner(req) {
    return isLocalPlannerRequest(req.headers) || (!isLocalPlannerRuntime() &&
        process.env.NEXT_PUBLIC_MODE === 'DEV' && req.headers.get('x-dev-override') === 'true');
}
