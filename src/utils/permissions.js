import { prisma } from '@utils/db/db';

/**
 * Permission constants for easier use throughout the application
 */
export const PERMISSIONS = {
    COURSE: {
        CREATE: 'course:create',
        READ: 'course:read',
        UPDATE: 'course:update',
        DELETE: 'course:delete',
        MANAGE: 'course:manage'
    },
    STUDENT: {
        CREATE: 'student:create',
        READ: 'student:read',
        UPDATE: 'student:update',
        DELETE: 'student:delete',
        MANAGE: 'student:manage'
    },
    UNIT: {
        CREATE: 'unit:create',
        READ: 'unit:read',
        UPDATE: 'unit:update',
        DELETE: 'unit:delete',
        MANAGE: 'unit:manage'
    },
    UNIT_TYPE: {
        CREATE: 'unit_type:create',
        READ: 'unit_type:read',
        UPDATE: 'unit_type:update',
        DELETE: 'unit_type:delete',
        MANAGE: 'unit_type:manage'
    },
    ROLE: {
        CREATE: 'role:create',
        READ: 'role:read',
        UPDATE: 'role:update',
        DELETE: 'role:delete',
        MANAGE: 'role:manage',
        ASSIGN: 'role:assign'
    },
    USER: {
        CREATE: 'user:create',
        READ: 'user:read',
        UPDATE: 'user:update',
        DELETE: 'user:delete',
        MANAGE: 'user:manage',
        ASSIGN_ROLES: 'user:assign_roles'
    },
    SYSTEM: {
        ADMIN: 'system:admin',
        CONFIGURE: 'system:configure',
        AUDIT: 'system:audit'
    }
};

/**
 * PermissionChecker class for server-side permission validation
 */
export class PermissionChecker {
    /**
     * Check if a user has a specific permission with context
     */
    static async hasPermission(userProfileID, resource, action, context = {}) {
        try {
            const userProfile = await prisma.UserProfile.findUnique({
                where: { ID: userProfileID },
                include: {
                    UserRoles: {
                        include: {
                            Role: {
                                include: {
                                    RolePermissions: {
                                        include: {
                                            Permission: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            if (!userProfile || !userProfile.IsActive) {
                return false;
            }

            // Check all user roles for permission
            for (const userRole of userProfile.UserRoles) {
                if (!userRole.Role || !userRole.Role.IsActive) continue;

                // Check if role has permission
                const hasRolePermission = await this.checkRolePermission(
                    userRole.Role,
                    resource,
                    action,
                    context
                );

                if (hasRolePermission) return true;
            }

            return false;
        } catch (error) {
            console.error('Error checking permission:', error);
            return false;
        }
    }

    /**
     * Check role permission with context and inheritance
     */
    static async checkRolePermission(role, resource, action, context) {
        // Check direct permissions
        for (const rolePermission of role.RolePermissions) {
            if (!rolePermission.Granted) continue;

            const permission = rolePermission.Permission;
            if (permission.Resource === resource && permission.Action === action) {
                // Check conditions if any (for future conditional permissions)
                if (await this.evaluatePermissionConditions(permission, context)) {
                    return true;
                }
            }
        }

        // Check for wildcard permissions
        if (await this.checkWildcardPermissions(role, resource, action, context)) {
            return true;
        }

        return false;
    }

    /**
     * Check for wildcard permissions (e.g., "course:*" or "*:manage")
     */
    static async checkWildcardPermissions(role, resource, action, context) {
        for (const rolePermission of role.RolePermissions) {
            if (!rolePermission.Granted) continue;

            const permission = rolePermission.Permission;

            // Check resource wildcard
            if (permission.Resource === '*' && permission.Action === action) {
                if (await this.evaluatePermissionConditions(permission, context)) {
                    return true;
                }
            }

            // Check action wildcard
            if (permission.Resource === resource && permission.Action === '*') {
                if (await this.evaluatePermissionConditions(permission, context)) {
                    return true;
                }
            }

            // Check full wildcard
            if (permission.Resource === '*' && permission.Action === '*') {
                if (await this.evaluatePermissionConditions(permission, context)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Evaluate permission conditions (for future use)
     */
    static async evaluatePermissionConditions(permission, context) {
        // For now, always return true
        // In the future, this could check conditions like:
        // - Time-based restrictions
        // - IP-based restrictions
        // - Resource ownership
        // - etc.
        return true;
    }

    /**
     * Check if user has any of the specified permissions
     */
    static async hasAnyPermission(userProfileID, permissions) {
        for (const permission of permissions) {
            const [resource, action] = permission.split(':');
            if (await this.hasPermission(userProfileID, resource, action)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check if user has all of the specified permissions
     */
    static async hasAllPermissions(userProfileID, permissions) {
        for (const permission of permissions) {
            const [resource, action] = permission.split(':');
            if (!(await this.hasPermission(userProfileID, resource, action))) {
                return false;
            }
        }
        return true;
    }

    /**
     * Get all permissions for a user
     */
    static async getUserPermissions(userProfileID) {
        try {
            const userProfile = await prisma.UserProfile.findUnique({
                where: { ID: userProfileID },
                include: {
                    UserRoles: {
                        include: {
                            Role: {
                                include: {
                                    RolePermissions: {
                                        include: {
                                            Permission: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            if (!userProfile || !userProfile.IsActive) {
                return [];
            }

            const permissions = new Set();

            for (const userRole of userProfile.UserRoles) {
                if (!userRole.Role || !userRole.Role.IsActive) continue;

                for (const rolePermission of userRole.Role.RolePermissions) {
                    if (rolePermission.Granted) {
                        const permission = rolePermission.Permission;
                        permissions.add(`${permission.Resource}:${permission.Action}`);
                    }
                }
            }

            return Array.from(permissions);
        } catch (error) {
            console.error('Error getting user permissions:', error);
            return [];
        }
    }

    /**
     * Check if user has a specific role
     */
    static async hasRole(userProfileID, roleName) {
        try {
            const userProfile = await prisma.UserProfile.findUnique({
                where: { ID: userProfileID },
                include: {
                    UserRoles: {
                        include: {
                            Role: true
                        }
                    }
                }
            });

            if (!userProfile || !userProfile.IsActive) {
                return false;
            }

            return userProfile.UserRoles.some(userRole =>
                userRole.Role &&
                userRole.Role.IsActive &&
                userRole.Role.Name === roleName
            );
        } catch (error) {
            console.error('Error checking user role:', error);
            return false;
        }
    }

    /**
     * Get all roles for a user
     */
    static async getUserRoles(userProfileID) {
        try {
            const userProfile = await prisma.UserProfile.findUnique({
                where: { ID: userProfileID },
                include: {
                    UserRoles: {
                        include: {
                            Role: true
                        }
                    }
                }
            });

            if (!userProfile || !userProfile.IsActive) {
                return [];
            }

            return userProfile.UserRoles
                .filter(userRole => userRole.Role && userRole.Role.IsActive)
                .map(userRole => userRole.Role);
        } catch (error) {
            console.error('Error getting user roles:', error);
            return [];
        }
    }
}

/**
 * Client-side permission checking utilities
 */
export const clientPermissions = {
    /**
     * Check if user has permission (client-side, less secure)
     */
    hasPermission: (userPermissions, resource, action) => {
        if (!userPermissions || !Array.isArray(userPermissions)) {
            return false;
        }

        return userPermissions.some(permission => {
            const [permResource, permAction] = permission.split(':');
            return (permResource === resource || permResource === '*') &&
                (permAction === action || permAction === '*');
        });
    },

    /**
     * Check if user has any of the specified permissions
     */
    hasAnyPermission: (userPermissions, permissions) => {
        if (!userPermissions || !Array.isArray(userPermissions)) {
            return false;
        }

        return permissions.some(permission =>
            clientPermissions.hasPermission(userPermissions, ...permission.split(':'))
        );
    },

    /**
     * Check if user has all of the specified permissions
     */
    hasAllPermissions: (userPermissions, permissions) => {
        if (!userPermissions || !Array.isArray(userPermissions)) {
            return false;
        }

        return permissions.every(permission =>
            clientPermissions.hasPermission(userPermissions, ...permission.split(':'))
        );
    }
};

/**
 * Permission decorator for API routes
 */
export function requirePermission(resource, action) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args) {
            // This would need to be implemented based on your authentication system
            // For now, it's a placeholder
            console.log(`Permission check required: ${resource}:${action}`);
            return originalMethod.apply(this, args);
        };

        return descriptor;
    };
}

/**
 * Middleware for checking permissions in API routes
 */
export function permissionMiddleware(resource, action) {
    return async (req, res, next) => {
        try {
            // This would need to be implemented based on your authentication system
            // For now, it's a placeholder
            console.log(`Permission middleware: ${resource}:${action}`);
            next();
        } catch (error) {
            console.error('Permission middleware error:', error);
            res.status(403).json({ error: 'Permission denied' });
        }
    };
}
