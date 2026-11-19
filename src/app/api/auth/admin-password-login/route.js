import { NextResponse } from 'next/server';
import prisma from '@utils/db/db';
import SecureSessionManager from '@utils/auth/SimpleSessionManager';
import { verifyPassword } from '@utils/auth/passwordHash.mjs';

const DEMO_ADMIN_EMAIL = 'admin@dev.local';
const DEMO_SESSION_EMAIL = 'admin-session@dev.local';

export async function POST(req) {
  try {
    if (process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_MODE !== 'DEV') {
      return NextResponse.json({ success: false, error: 'Admin Login is available only in local demo mode.' }, { status: 404 });
    }

    const { password } = await req.json();
    if (typeof password !== 'string' || !password) {
      return NextResponse.json({ success: false, error: 'Incorrect admin password.' }, { status: 401 });
    }

    const user = await prisma.users.findFirst({
      where: { Email: DEMO_ADMIN_EMAIL, Status: { not: 'inactive' } },
      include: { user_profiles: { include: { UserRoles: { include: { Role: true } } } } },
    });
    const profile = user?.user_profiles?.find(item => item.IsActive);
    const roles = profile?.UserRoles?.filter(item => item.Role?.IsActive).map(item => item.Role.Name) ?? [];
    const isAdmin = roles.some(role => String(role).trim().toLowerCase() !== 'student');
    const validPassword = user?.Password ? await verifyPassword(password, user.Password) : false;
    if (!user || !profile || !isAdmin || !validPassword) {
      return NextResponse.json({ success: false, error: 'Incorrect admin password.' }, { status: 401 });
    }

    const { sessionToken, user_data } = SecureSessionManager.CreatePasswordSession(
      { email: DEMO_SESSION_EMAIL, name: 'Administrator' },
      { adminLoginSession: true },
    );
    const response = NextResponse.json({
      success: true,
      sessionToken,
      sessionUser: { name: user_data.name },
      userProfile: { email: DEMO_SESSION_EMAIL, roles: ['Administrator'], isAuthenticated: true, adminLoginSession: true },
    });
    response.cookies.set('temporary_student', '', { path: '/', maxAge: 0 });
    return response;
  } catch (error) {
    console.error('Admin password login failed:', error);
    return NextResponse.json({ success: false, error: 'Unable to sign in right now.' }, { status: 500 });
  }
}
