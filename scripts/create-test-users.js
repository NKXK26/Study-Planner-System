// Create: /scripts/create-test-users.js
// Run: node scripts/create-test-users.js

//SEEDER SCRIPT FOR ADDING DUMMY USERS FOR TESTING ROLE APPLICATION

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createTestUsers() {
    try {
        console.log('Creating test users for role testing...\n');

        const testUsers = [
            {
                email: 'viewer@test.edu.my',
                firstName: 'Test',
                lastName: 'Viewer',
                roleName: 'Viewer',
                description: 'Basic read-only access'
            },
            {
                email: 'student@test.edu.my',
                firstName: 'Test',
                lastName: 'Student',
                roleName: 'Student',
                description: 'Student access with study planner'
            },
            {
                email: 'coordinator@test.edu.my',
                firstName: 'Test',
                lastName: 'Coordinator',
                roleName: 'Course Coordinator',
                description: 'Can manage courses and units'
            },
            {
                email: 'admin@test.edu.my',
                firstName: 'Test',
                lastName: 'Administrator',
                roleName: 'Administrator',
                description: 'Full admin access (cannot assign admin roles)'
            },
            {
                email: 'superadmin@test.edu.my',
                firstName: 'Super',
                lastName: 'Admin',
                roleName: 'Superadmin',
                description: 'Ultimate access including admin role assignment'
            }
        ];

        const defaultGroupId = 1;

        for (const userData of testUsers) {
            console.log(`Creating user: ${userData.email} -> ${userData.roleName}`);

            // 1. Create or find user
            const user = await prisma.users.upsert({
                where: { Email: userData.email },
                update: {
                    FirstName: userData.firstName,
                    LastName: userData.lastName
                },
                create: {
                    Email: userData.email,
                    FirstName: userData.firstName,
                    LastName: userData.lastName,
                    UserGroupAccessID: defaultGroupId,
                    Status: 'active'
                }
            });

            // 2. Create or find user profile
            const userProfile = await prisma.userProfile.upsert({
                where: {
                    UserID_UserEmail_UserGroupAccessID: {
                        UserID: user.ID,
                        UserEmail: user.Email,
                        UserGroupAccessID: user.UserGroupAccessID
                    }
                },
                update: { IsActive: true },
                create: {
                    UserID: user.ID,
                    UserEmail: user.Email,
                    UserGroupAccessID: user.UserGroupAccessID,
                    IsActive: true
                }
            });

            // 3. Find the role
            const role = await prisma.role.findFirst({
                where: { Name: userData.roleName }
            });

            if (role) {
                // 4. Remove existing roles
                await prisma.userRole.deleteMany({
                    where: { UserProfileID: userProfile.ID }
                });

                // 5. Assign the specific role
                await prisma.userRole.create({
                    data: {
                        UserProfileID: userProfile.ID,
                        RoleID: role.ID,
                        AssignedAt: new Date()
                    }
                });

                console.log(`✅ ${userData.email} assigned ${userData.roleName} role`);
            } else {
                console.log(`❌ Role ${userData.roleName} not found for ${userData.email}`);
            }
        }

        // Show summary
        console.log('\n📋 Test Users Created:');
        console.log('\nTo test different permission levels, sign in with:');
        
        for (const userData of testUsers) {
            console.log(`\n${userData.email}:`);
            console.log(`  Name: ${userData.firstName} ${userData.lastName}`);
            console.log(`  Role: ${userData.roleName}`);
            console.log(`  Access: ${userData.description}`);
        }

        console.log('\n🚀 Test users ready! Use these emails in your MSAL login to test different permission levels.');

    } catch (error) {
        console.error('❌ Test user creation failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

createTestUsers();