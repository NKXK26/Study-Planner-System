// Create: /scripts/setup-complete-rbac.js
// Run: node scripts/setup-complete-rbac.js

//SEEDER FOR ROLES - VIEWER / ADMINISTRATOR / SUPERADMIN

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function setupCompleteRBAC() {
    try {
        console.log('🚀 Setting up complete RBAC system...\n');

        // 1. CREATE USER GROUPS (Legacy System)
        console.log('1. Creating user groups...');
        const userGroups = [
            { id: 1, name: 'Default User', access: 'read', module: 'general' },
            { id: 2, name: 'Student', access: 'read', module: 'student_portal' },
            { id: 3, name: 'Staff', access: 'read,write', module: 'staff_portal' },
            { id: 4, name: 'Admin', access: 'read,write,delete', module: 'admin_portal' }
        ];

        for (const group of userGroups) {
            await prisma.user_group_access.upsert({
                where: { id: group.id },
                update: {},
                create: group
            });
            console.log(`✅ User group: ${group.name}`);
        }

        // 2. CREATE ROLES (RBAC System)
        console.log('\n2. Creating roles...');
        const roles = [
            {
                Name: 'Viewer',
                Description: 'Basic read-only access to system',
                Color: '#6b7280',
                Priority: 5,
                IsActive: true,
                IsSystem: false
            },
            {
                Name: 'Student',
                Description: 'Student access to academic content and study planning',
                Color: '#3b82f6',
                Priority: 4,
                IsActive: true,
                IsSystem: false
            },
            {
                Name: 'Course Coordinator',
                Description: 'Can manage courses, units, and academic content',
                Color: '#f59e0b',
                Priority: 3,
                IsActive: true,
                IsSystem: false
            },
            {
                Name: 'Administrator',
                Description: 'Full system access except role management',
                Color: '#ef4444',
                Priority: 2,
                IsActive: true,
                IsSystem: false
            },
            {
                Name: 'Superadmin',
                Description: 'Ultimate system control including role assignments',
                Color: '#dc2626',
                Priority: 1,
                IsActive: true,
                IsSystem: true // Protected system role
            }
        ];

        for (const roleData of roles) {
            const role = await prisma.role.upsert({
                where: { Name: roleData.Name },
                update: {
                    Priority: roleData.Priority,
                    IsSystem: roleData.IsSystem,
                    Description: roleData.Description,
                    Color: roleData.Color
                },
                create: roleData
            });
            console.log(`✅ Role: ${role.Name} (Priority: ${role.Priority})`);
        }

        // 3. REMOVE OLD STUDY PLANNER PERMISSIONS
        console.log('\n3. Removing old study planner permissions...');
        await prisma.permission.deleteMany({
            where: {
                Name: {
                    in: ['PLANNER_CREATE', 'PLANNER_DELETE']
                }
            }
        });
        console.log('✅ Removed old study planner create and delete permissions');

        // 4. CREATE PERMISSIONS
        console.log('\n4. Creating permissions...');
        const permissions = [
            // User Management Permissions
            { Name: 'USER_READ', Description: 'View users', Resource: 'users', Action: 'read', Module: 'user_management' },
            { Name: 'USER_CREATE', Description: 'Create users', Resource: 'users', Action: 'create', Module: 'user_management' },
            { Name: 'USER_UPDATE', Description: 'Update users', Resource: 'users', Action: 'update', Module: 'user_management' },
            { Name: 'USER_DELETE', Description: 'Delete users', Resource: 'users', Action: 'delete', Module: 'user_management' },

            // Role Management Permissions
            { Name: 'ROLE_READ', Description: 'View roles', Resource: 'roles', Action: 'read', Module: 'role_management' },
            { Name: 'ROLE_CREATE', Description: 'Create roles', Resource: 'roles', Action: 'create', Module: 'role_management' },
            { Name: 'ROLE_UPDATE', Description: 'Update roles', Resource: 'roles', Action: 'update', Module: 'role_management' },
            { Name: 'ROLE_DELETE', Description: 'Delete roles', Resource: 'roles', Action: 'delete', Module: 'role_management' },
            { Name: 'ROLE_ASSIGN', Description: 'Assign roles to users', Resource: 'user_roles', Action: 'assign', Module: 'role_management' },
            { Name: 'ADMIN_ROLE_ASSIGN', Description: 'Assign administrator roles', Resource: 'admin_roles', Action: 'assign', Module: 'role_management' },

            // Course Management Permissions
            { Name: 'COURSE_READ', Description: 'View courses', Resource: 'courses', Action: 'read', Module: 'course_management' },
            { Name: 'COURSE_CREATE', Description: 'Create courses', Resource: 'courses', Action: 'create', Module: 'course_management' },
            { Name: 'COURSE_UPDATE', Description: 'Update courses', Resource: 'courses', Action: 'update', Module: 'course_management' },
            { Name: 'COURSE_DELETE', Description: 'Delete courses', Resource: 'courses', Action: 'delete', Module: 'course_management' },

            // Intake Management Permissions
            { Name: 'INTAKE_READ', Description: 'View intakes', Resource: 'intakes', Action: 'read', Module: 'course_management' },
            { Name: 'INTAKE_CREATE', Description: 'Create intakes', Resource: 'intakes', Action: 'create', Module: 'course_management' },
            { Name: 'INTAKE_UPDATE', Description: 'Update intakes', Resource: 'intakes', Action: 'update', Module: 'course_management' },
            { Name: 'INTAKE_DELETE', Description: 'Delete intakes', Resource: 'intakes', Action: 'delete', Module: 'course_management' },

            // Unit Management Permissions
            { Name: 'UNIT_READ', Description: 'View units', Resource: 'units', Action: 'read', Module: 'unit_management' },
            { Name: 'UNIT_CREATE', Description: 'Create units', Resource: 'units', Action: 'create', Module: 'unit_management' },
            { Name: 'UNIT_UPDATE', Description: 'Update units', Resource: 'units', Action: 'update', Module: 'unit_management' },
            { Name: 'UNIT_DELETE', Description: 'Delete units', Resource: 'units', Action: 'delete', Module: 'unit_management' },

            // Term Management Permissions
            { Name: 'TERM_READ', Description: 'View terms', Resource: 'terms', Action: 'read', Module: 'term_management' },
            { Name: 'TERM_CREATE', Description: 'Create terms', Resource: 'terms', Action: 'create', Module: 'term_management' },
            { Name: 'TERM_UPDATE', Description: 'Update terms', Resource: 'terms', Action: 'update', Module: 'term_management' },
            { Name: 'TERM_DELETE', Description: 'Delete terms', Resource: 'terms', Action: 'delete', Module: 'term_management' },

            // Unit Type Management Permissions
            { Name: 'UNIT_TYPE_READ', Description: 'View unit types', Resource: 'unit_types', Action: 'read', Module: 'unit_type_management' },
            { Name: 'UNIT_TYPE_CREATE', Description: 'Create unit types', Resource: 'unit_types', Action: 'create', Module: 'unit_type_management' },
            { Name: 'UNIT_TYPE_UPDATE', Description: 'Update unit types', Resource: 'unit_types', Action: 'update', Module: 'unit_type_management' },
            { Name: 'UNIT_TYPE_DELETE', Description: 'Delete unit types', Resource: 'unit_types', Action: 'delete', Module: 'unit_type_management' },

            // Study Planner Permissions
            { Name: 'PLANNER_READ', Description: 'View study plans', Resource: 'study_plans', Action: 'read', Module: 'study_planner' },
            { Name: 'PLANNER_UPDATE', Description: 'Update study plans', Resource: 'study_plans', Action: 'update', Module: 'study_planner' },

            // Search Students Study Planner Permissions
            { Name: 'SEARCH_STUDENTS_READ', Description: 'Search students study planner', Resource: 'search_students', Action: 'read', Module: 'study_planner' },

            // Student Information Permissions
            { Name: 'STUDENT_INFO_READ', Description: 'View student information', Resource: 'student_info', Action: 'read', Module: 'student_management' },
            { Name: 'STUDENT_INFO_CREATE', Description: 'Create student information', Resource: 'student_info', Action: 'create', Module: 'student_management' },
            { Name: 'STUDENT_INFO_UPDATE', Description: 'Update student information', Resource: 'student_info', Action: 'update', Module: 'student_management' },
            { Name: 'STUDENT_INFO_DELETE', Description: 'Delete student information', Resource: 'student_info', Action: 'delete', Module: 'student_management' },

            // System Permissions
            { Name: 'SYSTEM_CONFIG', Description: 'System configuration access', Resource: 'system', Action: 'config', Module: 'system_admin' },
            { Name: 'AUDIT_READ', Description: 'View audit logs', Resource: 'audit_logs', Action: 'read', Module: 'system_admin' },
            { Name: 'DASHBOARD_ACCESS', Description: 'Access dashboard', Resource: 'dashboard', Action: 'access', Module: 'general' }
        ];

        for (const permData of permissions) {
            const permission = await prisma.permission.upsert({
                where: { Name: permData.Name },
                update: {},
                create: permData
            });
            console.log(`✅ Permission: ${permission.Name}`);
        }

        // 5. ASSIGN PERMISSIONS TO ROLES
        console.log('\n5. Assigning permissions to roles...');

        const rolePermissionMappings = [
            // Viewer - Dashboard access only
            { roleName: 'Viewer', permissions: ['DASHBOARD_ACCESS'] },

            // Student - Study planner + basic access
            {
                roleName: 'Student', permissions: [
                    'DASHBOARD_ACCESS', 'PLANNER_READ', 'PLANNER_UPDATE',
                    'SEARCH_STUDENTS_READ', 'STUDENT_INFO_READ',
                    'COURSE_READ', 'UNIT_READ'
                ]
            },

            // Course Coordinator - Academic management
            {
                roleName: 'Course Coordinator', permissions: [
                    'DASHBOARD_ACCESS', 'COURSE_READ', 'COURSE_CREATE', 'COURSE_UPDATE', 'COURSE_DELETE',
                    'INTAKE_READ', 'INTAKE_CREATE', 'INTAKE_UPDATE', 'INTAKE_DELETE',
                    'UNIT_READ', 'UNIT_CREATE', 'UNIT_UPDATE', 'UNIT_DELETE',
                    'PLANNER_READ', 'PLANNER_UPDATE', 'SEARCH_STUDENTS_READ',
                    'STUDENT_INFO_READ', 'STUDENT_INFO_CREATE', 'STUDENT_INFO_UPDATE', 'STUDENT_INFO_DELETE',
                    'USER_READ'
                ]
            },

            // Administrator - Everything except admin role assignment
            {
                roleName: 'Administrator', permissions: [
                    'DASHBOARD_ACCESS', 'USER_READ', 'USER_CREATE', 'USER_UPDATE', 'USER_DELETE',
                    'ROLE_READ', 'ROLE_CREATE', 'ROLE_UPDATE', 'ROLE_DELETE', 'ROLE_ASSIGN',
                    'COURSE_READ', 'COURSE_CREATE', 'COURSE_UPDATE', 'COURSE_DELETE',
                    'INTAKE_READ', 'INTAKE_CREATE', 'INTAKE_UPDATE', 'INTAKE_DELETE',
                    'UNIT_READ', 'UNIT_CREATE', 'UNIT_UPDATE', 'UNIT_DELETE',
                    'TERM_READ',
                    'UNIT_TYPE_READ',
                    'PLANNER_READ', 'PLANNER_UPDATE', 'SEARCH_STUDENTS_READ',
                    'STUDENT_INFO_READ', 'STUDENT_INFO_CREATE', 'STUDENT_INFO_UPDATE', 'STUDENT_INFO_DELETE'
                ]
            },

            // Superadmin - Everything including admin role assignment
            {
                roleName: 'Superadmin', permissions: [
                    'DASHBOARD_ACCESS', 'USER_READ', 'USER_CREATE', 'USER_UPDATE', 'USER_DELETE',
                    'ROLE_READ', 'ROLE_CREATE', 'ROLE_UPDATE', 'ROLE_DELETE', 'ROLE_ASSIGN', 'ADMIN_ROLE_ASSIGN',
                    'COURSE_READ', 'COURSE_CREATE', 'COURSE_UPDATE', 'COURSE_DELETE',
                    'INTAKE_READ', 'INTAKE_CREATE', 'INTAKE_UPDATE', 'INTAKE_DELETE',
                    'UNIT_READ', 'UNIT_CREATE', 'UNIT_UPDATE', 'UNIT_DELETE',
                    'TERM_READ', 'TERM_CREATE', 'TERM_UPDATE', 'TERM_DELETE',
                    'UNIT_TYPE_READ', 'UNIT_TYPE_CREATE', 'UNIT_TYPE_UPDATE', 'UNIT_TYPE_DELETE',
                    'PLANNER_READ', 'PLANNER_UPDATE', 'SEARCH_STUDENTS_READ',
                    'STUDENT_INFO_READ', 'STUDENT_INFO_CREATE', 'STUDENT_INFO_UPDATE', 'STUDENT_INFO_DELETE',
                    'SYSTEM_CONFIG', 'AUDIT_READ'
                ]
            }
        ];

        for (const mapping of rolePermissionMappings) {
            const role = await prisma.role.findFirst({ where: { Name: mapping.roleName } });

            if (role) {
                // Remove existing permissions for this role
                await prisma.rolePermission.deleteMany({
                    where: { RoleID: role.ID }
                });

                // Add new permissions
                for (const permissionName of mapping.permissions) {
                    const permission = await prisma.permission.findFirst({
                        where: { Name: permissionName }
                    });

                    if (permission) {
                        await prisma.rolePermission.upsert({
                            where: {
                                RoleID_PermissionID: {
                                    RoleID: role.ID,
                                    PermissionID: permission.ID
                                }
                            },
                            update: {},
                            create: {
                                RoleID: role.ID,
                                PermissionID: permission.ID,
                                Granted: true
                            }
                        });
                    }
                }
                console.log(`✅ Assigned ${mapping.permissions.length} permissions to ${mapping.roleName}`);
            }
        }

        // 6. FIX EXISTING USER ROLE ASSIGNMENTS
        console.log('\n6. Fixing existing user role assignments...');

        // Get all roles by name
        const superadminRole = await prisma.role.findFirst({ where: { Name: 'Superadmin' } });
        const administratorRole = await prisma.role.findFirst({ where: { Name: 'Administrator' } });
        const coordinatorRole = await prisma.role.findFirst({ where: { Name: 'Course Coordinator' } });
        const studentRole = await prisma.role.findFirst({ where: { Name: 'Student' } });
        const viewerRole = await prisma.role.findFirst({ where: { Name: 'Viewer' } });

        // Find all user profiles with their current roles
        const userProfiles = await prisma.userProfile.findMany({
            include: {
                UserRoles: {
                    include: {
                        Role: true
                    }
                }
            }
        });

        let fixedCount = 0;
        for (const profile of userProfiles) {
            // Check if user has roles that need to be preserved
            const hasAdminAccess = profile.UserRoles.some(ur =>
                ur.Role.Name === 'Superadmin' ||
                ur.Role.Name === 'Administrator' ||
                ur.Role.Priority <= 2
            );

            if (hasAdminAccess) {
                // Ensure they have the correct Superadmin or Administrator role
                const currentRoleIds = profile.UserRoles.map(ur => ur.RoleID);

                // If they don't have the correct role by ID, we need to verify and fix
                if (!currentRoleIds.includes(superadminRole?.ID) && !currentRoleIds.includes(administratorRole?.ID)) {
                    console.log(`⚠️  Fixing admin role for user profile ${profile.ID}`);

                    // Remove all current roles
                    await prisma.userRole.deleteMany({
                        where: { UserProfileID: profile.ID }
                    });

                    // Assign Superadmin role (assuming admin users should be superadmin)
                    if (superadminRole) {
                        await prisma.userRole.create({
                            data: {
                                UserProfileID: profile.ID,
                                RoleID: superadminRole.ID,
                                AssignedAt: new Date()
                            }
                        });
                        fixedCount++;
                        console.log(`✅ Reassigned Superadmin role to user profile ${profile.ID}`);
                    }
                }
            }
        }

        if (fixedCount > 0) {
            console.log(`✅ Fixed ${fixedCount} user role assignments`);
        } else {
            console.log('✅ All user role assignments are correct');
        }

        // 7. SHOW FINAL SUMMARY
        console.log('\n📋 RBAC Setup Complete!');
        console.log('\n🏗️ Role Hierarchy (by priority):');

        const finalRoles = await prisma.role.findMany({
            include: {
                RolePermissions: {
                    include: {
                        Permission: true
                    }
                }
            },
            orderBy: { Priority: 'asc' }
        });

        finalRoles.forEach(role => {
            console.log(`\n${role.Name} (Priority: ${role.Priority}):`);
            console.log(`  Description: ${role.Description}`);
            console.log(`  Permissions: ${role.RolePermissions.length}`);
            if (role.IsSystem) {
                console.log(`  🔒 System Role (Protected)`);
            }
        });

        console.log(`\n✅ Setup complete with ${finalRoles.length} roles and ${permissions.length} permissions`);

    } catch (error) {
        console.error('❌ Setup failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

setupCompleteRBAC();