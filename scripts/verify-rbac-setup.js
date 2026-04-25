// Create: /scripts/verify-rbac-setup.js
// Run: node scripts/verify-rbac-setup.js

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyRBACSetup() {
    try {
        console.log('Verifying RBAC setup...\n');

        // 1. Check user groups
        const userGroups = await prisma.user_group_access.findMany();
        console.log(`User Groups: ${userGroups.length}`);
        userGroups.forEach(g => console.log(`  - ${g.name} (ID: ${g.id})`));

        // 2. Check roles
        const roles = await prisma.role.findMany({ orderBy: { Priority: 'desc' } });
        console.log(`\nRoles: ${roles.length}`);
        roles.forEach(r => console.log(`  - ${r.Name} (Priority: ${r.Priority}, System: ${r.IsSystem})`));

        // 3. Check permissions
        const permissions = await prisma.permission.findMany();
        console.log(`\nPermissions: ${permissions.length}`);

        // Group by module
        const permissionsByModule = permissions.reduce((acc, perm) => {
            if (!acc[perm.Module]) acc[perm.Module] = [];
            acc[perm.Module].push(perm.Name);
            return acc;
        }, {});

        Object.entries(permissionsByModule).forEach(([module, perms]) => {
            console.log(`  ${module}: ${perms.length} permissions`);
        });

        // 4. Check role-permission assignments
        console.log('\nRole Permissions:');
        for (const role of roles) {
            const rolePerms = await prisma.rolePermission.findMany({
                where: { RoleID: role.ID },
                include: { Permission: true }
            });
            console.log(`  ${role.Name}: ${rolePerms.length} permissions`);
        }

        // 5. Check test users
        const testUsers = await prisma.users.findMany({
            where: { Email: { contains: '@test.edu.my' } }
        });

        console.log(`\nTest Users: ${testUsers.length}`);
        for (const user of testUsers) {
            // Find user profile by UserID
            const userProfile = await prisma.userProfile.findFirst({
                where: { UserID: user.ID },
                include: {
                    UserRoles: {
                        include: { Role: true }
                    }
                }
            });

            const roles = userProfile?.UserRoles?.map(ur => ur.Role.Name) || [];
            console.log(`  - ${user.Email}: ${roles.join(', ')}`);
        }

        // 6. Verify critical setup
        console.log('\nCritical Checks:');

        const superadmin = roles.find(r => r.Name === 'Superadmin');
        const adminRoleAssignPerm = permissions.find(p => p.Name === 'ADMIN_ROLE_ASSIGN');
        const superadminHasAdminAssign = await prisma.rolePermission.findFirst({
            where: {
                RoleID: superadmin?.ID,
                PermissionID: adminRoleAssignPerm?.ID
            }
        });

        console.log(`  Superadmin role exists: ${!!superadmin}`);
        console.log(`  Admin role assign permission exists: ${!!adminRoleAssignPerm}`);
        console.log(`  Superadmin can assign admin roles: ${!!superadminHasAdminAssign}`);

        const defaultGroup = userGroups.find(g => g.id === 1);
        console.log(`  Default user group (ID=1) exists: ${!!defaultGroup}`);

        if (superadmin && adminRoleAssignPerm && superadminHasAdminAssign && defaultGroup) {
            console.log('\n✅ RBAC setup is complete and correct!');
            console.log('\nNext steps:');
            console.log('1. Add NEXT_PUBLIC_MODE=DEV to your .env.local for dev override');
            console.log('2. Test by navigating to any protected route');
            console.log('3. Or sign in with test emails like superadmin@test.edu.my');
        } else {
            console.log('\n❌ RBAC setup has issues - run setup scripts again');
        }

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

verifyRBACSetup();