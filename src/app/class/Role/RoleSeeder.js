import RoleDB from './RoleDB';
import Permission from '../Permission/Permission';
import UserProfileDB from '../UserProfile/UserProfileDB';

export default class RoleSeeder {
    /**
     * Seed default roles for the system
     */
    static async seedDefaultRoles() {
        const defaultRoles = [
            {
                Name: 'Superadmin',
                Description: 'Full system access with role management capabilities',
                Color: '#FF0000',
                Priority: 100,
                IsSystem: true,
                IsActive: true
            },
            {
                Name: 'Administrator',
                Description: 'System administration with limited role management',
                Color: '#FF6600',
                Priority: 80,
                IsSystem: true,
                IsActive: true
            },
            {
                Name: 'Course Coordinator',
                Description: 'Manage courses, units, and study planners',
                Color: '#0066FF',
                Priority: 60,
                IsSystem: true,
                IsActive: true
            },
            {
                Name: 'Academic Advisor',
                Description: 'View and manage student study planners',
                Color: '#00CC00',
                Priority: 40,
                IsSystem: true,
                IsActive: true
            },
            {
                Name: 'Viewer',
                Description: 'Read-only access to system data',
                Color: '#999999',
                Priority: 20,
                IsSystem: true,
                IsActive: true
            }
        ];

        const createdRoles = [];
        for (const roleData of defaultRoles) {
            try {
                const existingRole = await RoleDB.FetchRoles({ Name: roleData.Name });
                if (existingRole.length === 0) {
                    const role = await RoleDB.CreateRole(roleData);
                    createdRoles.push(role);
                    console.log(`Created role: ${role.Name}`);
                } else {
                    createdRoles.push(existingRole[0]);
                    console.log(`Role already exists: ${roleData.Name}`);
                }
            } catch (error) {
                console.error(`Error creating role ${roleData.Name}:`, error);
            }
        }

        return createdRoles;
    }

    /**
     * Seed default permissions for the system
     */
    static async seedDefaultPermissions() {
        const defaultPermissions = [
            // Course permissions
            { Name: 'course:create', Description: 'Create new courses', Resource: 'course', Action: 'create', Module: 'course_management' },
            { Name: 'course:read', Description: 'View course information', Resource: 'course', Action: 'read', Module: 'course_management' },
            { Name: 'course:update', Description: 'Modify course details', Resource: 'course', Action: 'update', Module: 'course_management' },
            { Name: 'course:delete', Description: 'Delete courses', Resource: 'course', Action: 'delete', Module: 'course_management' },
            { Name: 'course:manage', Description: 'Full course management', Resource: 'course', Action: 'manage', Module: 'course_management' },

            // Student permissions
            { Name: 'student:create', Description: 'Create new student records', Resource: 'student', Action: 'create', Module: 'student_management' },
            { Name: 'student:read', Description: 'View student information', Resource: 'student', Action: 'read', Module: 'student_management' },
            { Name: 'student:update', Description: 'Modify student details', Resource: 'student', Action: 'update', Module: 'student_management' },
            { Name: 'student:delete', Description: 'Delete student records', Resource: 'student', Action: 'delete', Module: 'student_management' },
            { Name: 'student:manage', Description: 'Full student management', Resource: 'student', Action: 'manage', Module: 'student_management' },

            // Unit permissions
            { Name: 'unit:create', Description: 'Create new units', Resource: 'unit', Action: 'create', Module: 'unit_management' },
            { Name: 'unit:read', Description: 'View unit information', Resource: 'unit', Action: 'read', Module: 'unit_management' },
            { Name: 'unit:update', Description: 'Modify unit details', Resource: 'unit', Action: 'update', Module: 'unit_management' },
            { Name: 'unit:delete', Description: 'Delete units', Resource: 'unit', Action: 'delete', Module: 'unit_management' },
            { Name: 'unit:manage', Description: 'Full unit management', Resource: 'unit', Action: 'manage', Module: 'unit_management' },

            // Role permissions
            { Name: 'role:create', Description: 'Create new roles', Resource: 'role', Action: 'create', Module: 'role_management' },
            { Name: 'role:read', Description: 'View role information', Resource: 'role', Action: 'read', Module: 'role_management' },
            { Name: 'role:update', Description: 'Modify role details', Resource: 'role', Action: 'update', Module: 'role_management' },
            { Name: 'role:delete', Description: 'Delete roles', Resource: 'role', Action: 'delete', Module: 'role_management' },
            { Name: 'role:manage', Description: 'Full role management', Resource: 'role', Action: 'manage', Module: 'role_management' },
            { Name: 'role:assign', Description: 'Assign roles to users', Resource: 'role', Action: 'assign', Module: 'role_management' },

            // User permissions
            { Name: 'user:create', Description: 'Create new users', Resource: 'user', Action: 'create', Module: 'user_management' },
            { Name: 'user:read', Description: 'View user information', Resource: 'user', Action: 'read', Module: 'user_management' },
            { Name: 'user:update', Description: 'Modify user details', Resource: 'user', Action: 'update', Module: 'user_management' },
            { Name: 'user:delete', Description: 'Delete users', Resource: 'user', Action: 'delete', Module: 'user_management' },
            { Name: 'user:manage', Description: 'Full user management', Resource: 'user', Action: 'manage', Module: 'user_management' },
            { Name: 'user:assign_roles', Description: 'Assign roles to users', Resource: 'user', Action: 'assign_roles', Module: 'user_management' },

            // System permissions
            { Name: 'system:admin', Description: 'Full system administration', Resource: 'system', Action: 'admin', Module: 'system_administration' },
            { Name: 'system:configure', Description: 'Configure system settings', Resource: 'system', Action: 'configure', Module: 'system_administration' },
            { Name: 'system:audit', Description: 'Access audit logs', Resource: 'system', Action: 'audit', Module: 'system_administration' }
        ];

        const createdPermissions = [];
        for (const permissionData of defaultPermissions) {
            try {
                const permission = new Permission(permissionData);
                const errors = permission.validate();

                if (errors.length > 0) {
                    console.error(`Validation errors for permission ${permissionData.Name}:`, errors);
                    continue;
                }

                // Check if permission already exists
                const existingPermission = await prisma.Permission.findUnique({
                    where: { Name: permissionData.Name }
                });

                if (!existingPermission) {
                    const result = await prisma.Permission.create({
                        data: {
                            Name: permission.Name,
                            Description: permission.Description,
                            Resource: permission.Resource,
                            Action: permission.Action,
                            Module: permission.Module,
                            IsActive: permission.IsActive,
                            CreatedAt: permission.CreatedAt
                        }
                    });
                    createdPermissions.push(result);
                    console.log(`Created permission: ${permission.Name}`);
                } else {
                    createdPermissions.push(existingPermission);
                    console.log(`Permission already exists: ${permissionData.Name}`);
                }
            } catch (error) {
                console.error(`Error creating permission ${permissionData.Name}:`, error);
            }
        }

        return createdPermissions;
    }

    /**
     * Assign default permissions to roles
     */
    static async assignDefaultRolePermissions() {
        try {
            // Get all roles and permissions
            const roles = await RoleDB.FetchRoles();
            const permissions = await prisma.Permission.findMany();

            // Create a map for easy lookup
            const roleMap = new Map(roles.map(role => [role.Name, role]));
            const permissionMap = new Map(permissions.map(perm => [perm.Name, perm]));

            // Define role-permission assignments
            const rolePermissions = {
                'Superadmin': permissions.map(p => p.Name), // All permissions
                'Administrator': [
                    'course:manage', 'student:manage', 'unit:manage',
                    'role:read', 'role:assign', 'user:read', 'user:assign_roles'
                ],
                'Course Coordinator': [
                    'course:manage', 'unit:manage', 'student:read',
                    'role:read'
                ],
                'Academic Advisor': [
                    'student:read', 'student:update', 'course:read',
                    'unit:read'
                ],
                'Viewer': [
                    'course:read', 'student:read', 'unit:read'
                ]
            };

            // Assign permissions to roles
            for (const [roleName, permissionNames] of Object.entries(rolePermissions)) {
                const role = roleMap.get(roleName);
                if (!role) {
                    console.warn(`Role not found: ${roleName}`);
                    continue;
                }

                for (const permissionName of permissionNames) {
                    const permission = permissionMap.get(permissionName);
                    if (!permission) {
                        console.warn(`Permission not found: ${permissionName}`);
                        continue;
                    }

                    try {
                        // Check if role-permission already exists
                        const existingRolePermission = await prisma.RolePermission.findUnique({
                            where: {
                                RoleID_PermissionID: {
                                    RoleID: role.ID,
                                    PermissionID: permission.ID
                                }
                            }
                        });

                        if (!existingRolePermission) {
                            await prisma.RolePermission.create({
                                data: {
                                    RoleID: role.ID,
                                    PermissionID: permission.ID,
                                    Granted: true,
                                    GrantedAt: new Date()
                                }
                            });
                            console.log(`Assigned permission ${permission.Name} to role ${role.Name}`);
                        } else {
                            console.log(`Permission ${permission.Name} already assigned to role ${role.Name}`);
                        }
                    } catch (error) {
                        console.error(`Error assigning permission ${permission.Name} to role ${role.Name}:`, error);
                    }
                }
            }

            console.log('Default role permissions assigned successfully');
        } catch (error) {
            console.error('Error assigning default role permissions:', error);
            throw error;
        }
    }

    /**
     * Sync existing users with UserProfile records
     */
    static async syncExistingUsers() {
        try {
            console.log('Syncing existing users with UserProfile records...');
            const result = await UserProfileDB.SyncWithExistingUsers();
            console.log(`UserProfile sync completed: ${result.createdCount} created, ${result.updatedCount} updated`);
            return result;
        } catch (error) {
            console.error('Error syncing existing users:', error);
            throw error;
        }
    }

    /**
     * Run the complete seeding process
     */
    static async seedAll() {
        try {
            console.log('Starting RBAC system seeding...');

            // Step 1: Sync existing users
            await this.syncExistingUsers();

            // Step 2: Create default roles
            console.log('Creating default roles...');
            const roles = await this.seedDefaultRoles();

            // Step 3: Create default permissions
            console.log('Creating default permissions...');
            const permissions = await this.seedDefaultPermissions();

            // Step 4: Assign permissions to roles
            console.log('Assigning permissions to roles...');
            await this.assignDefaultRolePermissions();

            console.log('RBAC system seeding completed successfully!');
            console.log(`Created ${roles.length} roles and ${permissions.length} permissions`);

            return { roles, permissions };
        } catch (error) {
            console.error('Error during RBAC seeding:', error);
            throw error;
        }
    }
}
