import nextEnv from '@next/env';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/auth/passwordHash.mjs';

nextEnv.loadEnvConfig(process.cwd());
if (process.env.NODE_ENV === 'production' || (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test' && process.env.NEXT_PUBLIC_MODE !== 'DEV')) {
  throw new Error('Demo admin seeding is allowed only in development/test. Set NEXT_PUBLIC_MODE=DEV for local setup.');
}

const prisma = new PrismaClient();
const email = 'admin@dev.local';

try {
  console.warn('WARNING: the shared demo password is for local use only. Never enable this login in production.');
  const role = await prisma.role.upsert({
    where: { Name: 'Administrator' },
    update: {},
    create: { Name: 'Administrator', Description: 'System administration with limited role management', Color: '#FF6600', Priority: 80, IsSystem: true, IsActive: true },
  });
  await prisma.role.upsert({
    where: { Name: 'Student' },
    update: {},
    create: { Name: 'Student', Description: 'Temporary local demo student identity', Color: '#CC2131', Priority: 10, IsSystem: true, IsActive: true },
  });
  const groupId = Number(process.env.DEFAULT_USER_GROUP_ID || 1);
  const group = await prisma.user_group_access.findUnique({ where: { id: groupId } });
  if (!group) throw new Error(`User group ${groupId} does not exist. Set DEFAULT_USER_GROUP_ID to a valid local group.`);

  const passwordHash = await hashPassword('admin1234');
  const user = await prisma.users.upsert({
    where: { Email: email },
    update: { FirstName: 'Local Demo Admin', Password: passwordHash, Status: 'active' },
    create: { Email: email, FirstName: 'Local Demo Admin', UserGroupAccessID: groupId, Password: passwordHash, Status: 'active' },
  });
  const profile = await prisma.userProfile.upsert({
    where: { UserID_UserEmail_UserGroupAccessID: { UserID: user.ID, UserEmail: email, UserGroupAccessID: groupId } },
    update: { IsActive: true },
    create: { UserID: user.ID, UserEmail: email, UserGroupAccessID: groupId, IsActive: true },
  });
  await prisma.userRole.upsert({
    where: { UserProfileID_RoleID: { UserProfileID: profile.ID, RoleID: role.ID } },
    update: { ExpiresAt: null },
    create: { UserProfileID: profile.ID, RoleID: role.ID },
  });
  console.log('Local demo Administrator account is ready.');
} finally {
  await prisma.$disconnect();
}
