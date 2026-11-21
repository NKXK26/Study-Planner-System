export const STUDENT_WEB_EDITION = 'student-web';
export const STUDENT_SESSION_COOKIE = 'temporary_student';

export const studentPages = new Set([
  '/view/dashboard',
  '/view/compare_study_planner',
  '/view/graduation-eligibility',
  '/view/ai-assistant',
]);

export const studentApiMethods = new Map([
  ['/api/official-planners', ['GET']],
  ['/api/dashboard', ['GET']],
  ['/api/study-planner', ['GET']],
  ['/api/study-planner/validate-schedule', ['POST']],
  ['/api/unit-rag', ['POST']],
  ['/api/unit-replacements', ['POST']],
  ['/api/planner-assistant', ['GET', 'POST']],
  ['/api/planner-assistant/tools', ['GET', 'POST']],
  ['/api/auth/student-session', ['POST', 'DELETE']],
]);

export function isStudentWebEdition(env = process.env) {
  return env.APP_EDITION === STUDENT_WEB_EDITION;
}

export function isPublicStudentAccessEnabled(env = process.env) {
  return isStudentWebEdition(env) && env.STUDENT_ACCESS_MODE === 'public';
}

export function isStudentPortalRequest(request, env = process.env) {
  return isStudentWebEdition(env) && request?.headers?.get('x-student-portal') === '1';
}

export function isStudentClientEdition(value = process.env.NEXT_PUBLIC_APP_EDITION) {
  return value === STUDENT_WEB_EDITION;
}
